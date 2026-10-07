/**
 * 谨迹书房 · DSH Host 半边。
 *
 * 只做两件事：
 * 1. 确保 jinji-reader 的 Python 只读服务在 127.0.0.1:<port> 上运行（已有实例就复用，不重复拉起）；
 * 2. 注册两条经 DSH 浏览器会话鉴权的同源路由：
 *    /jinji-shufang/status    —— 服务地址与在线状态（离线时顺手重新拉起）；
 *    /jinji-shufang/cite-pull —— 代取书房网页排队的「引用」，交给 Client 插进会话输入框。
 *
 * 阅读、搜索、渲染全部由原 Python 服务负责；本插件不读写 journal。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'jinji-shufang'
export const inject = ['webServer', 'connection']

export const STATUS_PATH = '/jinji-shufang/status'
export const PULL_PATH = '/jinji-shufang/cite-pull'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SERVER = path.resolve(HERE, '../../server/server.py')
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
const RESPAWN_GAP_MS = 15_000

/**
 * 归一化插件配置。全部字段可选。
 * @param {Record<string, unknown>} raw
 */
export function resolveConfig(raw = {}) {
  const str = v => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const port = Number.isInteger(raw.port) && raw.port > 0 && raw.port < 65536 ? raw.port : 4417
  return {
    port,
    server: str(raw.server) ?? DEFAULT_SERVER,
    python: str(raw.python),
    journal: str(raw.journal),
    autoStart: raw.autoStart !== false,
  }
}

/** @param {number} port */
export async function ping(port, timeoutMs = 1500) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!r.ok) return undefined
    const j = await r.json()
    return j && j.app === 'jinji-reader' ? j : undefined
  } catch {
    return undefined
  }
}

export function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig)
  const log = ctx.logger ?? console
  const state = { child: undefined, lastSpawn: 0, starting: undefined, disposed: false }

  function spawnOnce(command) {
    return new Promise(resolve => {
      const env = {
        ...process.env,
        PATH: [process.env.PATH, ...EXTRA_PATH].filter(Boolean).join(':'),
        JINJI_PORT: String(config.port),
        ...(config.journal ? { JINJI_JOURNAL: config.journal } : {}),
      }
      let child
      try {
        child = spawn(command, [config.server], { cwd: path.dirname(config.server), env, stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (error) {
        resolve(error)
        return
      }
      let settled = false
      child.once('error', error => {
        if (!settled) { settled = true; resolve(error) }
      })
      child.once('spawn', () => {
        if (!settled) { settled = true; resolve(child) }
      })
      const relay = chunk => {
        const text = String(chunk).trim()
        if (text) log.info?.(`jinji-shufang: ${text}`)
      }
      child.stdout?.on('data', relay)
      child.stderr?.on('data', relay)
      child.once('exit', () => {
        if (state.child === child) state.child = undefined
      })
    })
  }

  async function start() {
    if (await ping(config.port)) return true
    if (state.disposed) return false
    if (!existsSync(config.server)) {
      log.warn?.(`jinji-shufang: 找不到书房服务 ${config.server}`)
      return false
    }
    state.lastSpawn = Date.now()
    const candidates = config.python ? [config.python] : ['python3', '/usr/bin/python3']
    for (const command of candidates) {
      const result = await spawnOnce(command)
      if (result instanceof Error) {
        log.warn?.(`jinji-shufang: ${command} 启动失败：${result.message}`)
        continue
      }
      state.child = result
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 250))
        if (state.disposed) return false
        if (await ping(config.port, 800)) return true
        if (state.child !== result) break // 进程已退出（端口被占等），换下一个候选
      }
    }
    return Boolean(await ping(config.port))
  }

  /** 并发调用共享同一次启动。 */
  function ensure() {
    state.starting ??= start().finally(() => { state.starting = undefined })
    return state.starting
  }

  async function status(req, res) {
    const rejection = ctx.connection.requestRejection(req)
    const send = (code, body) => {
      res.statusCode = code
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body))
    }
    if (rejection !== undefined) return send(rejection, { error: '请通过已登录的 DSH 页面访问书房' })
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'method not allowed' })
    let info = await ping(config.port)
    if (!info && Date.now() - state.lastSpawn > RESPAWN_GAP_MS) {
      await ensure()
      info = await ping(config.port)
    }
    send(200, {
      online: Boolean(info),
      url: `http://127.0.0.1:${config.port}`,
      port: config.port,
      journal: info?.journal ?? config.journal ?? null,
      server: config.server,
    })
  }

  /** 引用桥：代为取走书房网页排队的「引用」，浏览器端只访问同源、已鉴权的路由。 */
  async function pull(req, res) {
    const rejection = ctx.connection.requestRejection(req)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (rejection !== undefined) {
      res.statusCode = rejection
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    try {
      const r = await fetch(`http://127.0.0.1:${config.port}/api/cite/pull`, { signal: AbortSignal.timeout(1500) })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json()
      const items = Array.isArray(j.items)
        ? j.items.filter(x => x && typeof x.abs === 'string' && x.abs.startsWith('/')).map(x => ({ path: String(x.path ?? ''), abs: x.abs }))
        : []
      res.statusCode = 200
      res.end(JSON.stringify({ online: true, items }))
    } catch {
      res.statusCode = 200
      res.end(JSON.stringify({ online: false, items: [] }))
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: STATUS_PATH, handler: status }), 'jinji-shufang: status route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: PULL_PATH, handler: pull }), 'jinji-shufang: cite bridge route')
  ctx.effect(() => () => {
    state.disposed = true
    // 只结束本插件拉起的进程；别处拉起的服务不动
    state.child?.kill('SIGTERM')
    state.child = undefined
  }, 'jinji-shufang: server process')

  if (config.autoStart) void ensure()
}
