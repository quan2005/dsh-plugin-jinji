/**
 * 冒烟测试（零依赖，node scripts/smoke.mjs 直接运行，自包含不需要真实日志库）。
 *
 * 服务端部分：在临时目录里造一个最小 .journal 日志库，驱动
 *   - 数据路由：index 计数、read 全文、路径越界拒绝；
 *   - 启动注入：摘要快照、书写规范、按会话缓存；
 *   - 配置链路：默认值、POST 校验、文件持久化、画像条数截断、开关即时生效。
 * 浏览器部分：mock window.__ModuleLoader__ 驱动 factory 物化，
 *   验证导出形状与设置卡片注册（slots 缺失时静默跳过）。
 */
import { realpathSync, statSync, readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let passed = 0
let failed = 0
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓', name) }
  else { failed++; console.error('  ✗', name, extra === undefined ? '' : JSON.stringify(extra)) }
}

// ── 临时日志库 ─────────────────────────────────────────────────────────
const ROOT = mkdtempSync(join(tmpdir(), 'jinji-smoke-'))
mkdirSync(join(ROOT, '.journal/memory/2608'), { recursive: true })
mkdirSync(join(ROOT, '.journal/identity'), { recursive: true })
writeFileSync(join(ROOT, '.journal/memory/2608/13-学习插件体系.md'),
  '---\ntitle: 学习插件体系\ndate: 2026-08-13\nsummary: 研读官方文档与源码，产出学习手册\ntags: [journal, research]\n---\n\n正文。\n')
writeFileSync(join(ROOT, '.journal/memory/2608/01-开库.md'),
  '---\ntitle: 开库\ndate: 2026-08-01\nsummary: 建立日志库\n---\n\n正文。\n')
writeFileSync(join(ROOT, '.journal/identity/product-测试产品.md'),
  '---\ntitle: 测试产品\nsummary: 一个产品画像\n---\n')
for (const n of ['甲', '乙', '丙']) {
  writeFileSync(join(ROOT, '.journal/identity/测试-' + n + '.md'),
    '---\ntitle: ' + n + '\nsummary: 人物' + n + '\n---\n')
}

// ── 服务端部分 ──────────────────────────────────────────────────────────
const target = (p) => ({ key: realpathSync(p) })
const fsMock = {
  resolve: async (p) => { try { return target(p) } catch { return { key: p } } },
  stat: async (t) => {
    try { const s = statSync(t.key); return { version: {}, type: s.isDirectory() ? 'directory' : 'file', size: s.size } }
    catch { return undefined }
  },
  listDir: async (t) => readdirSync(t.key).map((name) => {
    const s = statSync(join(t.key, name))
    return { name, type: s.isDirectory() ? 'directory' : 'file', target: target(join(t.key, name)), size: s.size }
  }),
  readText: async (t) => readFileSync(t.key, 'utf8'),
  writeText: async (t, content) => { mkdirSync(dirname(t.key), { recursive: true }); writeFileSync(t.key, content) },
  contains: (p, c) => c.key === p.key || c.key.startsWith(p.key + '/'),
}

const { apply } = await import('../lib/index.js')
const eventHandlers = {}
const injected = []
let route = null
const ctx = {
  effect: (cb) => cb(),
  on: (name, fn) => { eventHandlers[name] = fn },
  inject: (deps, cb) => { injected.push({ deps, cb }) },
  webServer: { register: (r) => { route = r } },
  fs: fsMock,
}
apply(ctx, { root: ROOT })

const contexts = []
for (const entry of injected) {
  if (entry.deps.includes('systemPrompt')) entry.cb({ systemPrompt: { context: (c) => contexts.push(c) } })
}
const byName = Object.fromEntries(contexts.map((c) => [c.name, c]))

let captured = {}
const res = { writeHead: (s, h) => { captured = { status: s, headers: h } }, end: (b) => { captured.body = b } }
const get = (url) => route.handler({ method: 'GET', url }, res)
function post(obj) {
  const body = JSON.stringify(obj)
  return route.handler(
    { method: 'POST', url: '/api/jinji-memory?action=config', [Symbol.asyncIterator]: async function* () { yield body } },
    res,
  )
}
const json = () => JSON.parse(captured.body)

console.log(`服务端部分（临时日志库 ${ROOT}）`)
await get('/api/jinji-memory?action=index')
const index = json()
const journals = index.journals || []
const personas = index.personas || []
assert('index ok', index.ok === true)
assert('journals 非空', journals.length === 2, journals.length)
assert('personas 非空', personas.length === 4, personas.length)
assert('journal 字段完整', journals[0].rel !== undefined && journals[0].title !== undefined)

await get('/api/jinji-memory?action=read&rel=' + encodeURIComponent(journals[0].rel))
assert('read 全文', json().ok === true && json().text.length > 0)

await get('/api/jinji-memory?action=read&rel=../../etc/passwd')
assert('越界拒绝', json().ok === false)

// ── 启动注入（默认配置） ────────────────────────────────────────────────
console.log('启动注入（默认配置）')
const agentA = { session: { header: { cwd: ROOT } } }
assert('已注册 session-start 监听', typeof eventHandlers['agent/session-start'] === 'function')
assert('已声明 systemPrompt 依赖', injected.some((i) => i.deps.includes('systemPrompt')))
assert('注册了摘要与书写规范两个上下文', byName['jinji:memory-summary'] !== undefined && byName['jinji:memory-protocol'] !== undefined)
assert('书写规范排在摘要之后', byName['jinji:memory-protocol'].order > byName['jinji:memory-summary'].order)
assert('预计算前摘要为空', byName['jinji:memory-summary'].text({ agent: agentA }) === '')
assert('预计算前书写规范已注入', byName['jinji:memory-protocol'].text({ agent: agentA }).includes('主动'))
eventHandlers['agent/session-start']({ agent: agentA, source: 'fresh' })
await new Promise((r) => setTimeout(r, 200))
const snapshotA = byName['jinji:memory-summary'].text({ agent: agentA })
assert('快照包含日志摘要', snapshotA.includes('最近') && snapshotA.length > 0)
assert('快照包含画像摘要', snapshotA.includes('画像档案'))
assert('默认带全部画像', snapshotA.includes('1 产品 / 3 人物') && !snapshotA.includes('仅列出'))
assert('书写规范带上了实际记忆根目录', byName['jinji:memory-protocol'].text({ agent: agentA }).includes(ROOT))
assert('无 agent 时摘要为空', byName['jinji:memory-summary'].text({}) === '')

// ── 配置链路 ────────────────────────────────────────────────────────────
console.log('配置链路')
await get('/api/jinji-memory?action=config')
const cfg = json()
assert('config 返回默认配置', cfg.ok === true && cfg.config.maxEntries === 20 && cfg.config.maxPersonas === 30)
assert('config 携带内置书写规范', typeof cfg.protocolBuiltin === 'string' && cfg.protocolBuiltin.includes('主动'))

await post({ maxEntries: 99999 })
assert('越界数值被拒绝', json().ok === false)
await post({ nope: 1 })
assert('未知字段被拒绝', json().ok === false)
await post({ maxEntries: 5, maxPersonas: 2, writeProtocol: '自定义规范：写到 __MEMORY_ROOT__' })
const saved = json()
assert('保存配置生效', saved.ok === true && saved.config.maxEntries === 5 && saved.config.maxPersonas === 2)
assert('配置文件已写入磁盘', JSON.parse(readFileSync(join(ROOT, '.jinji-memory.json'), 'utf8')).maxPersonas === 2)

const agentB = { session: { header: { cwd: ROOT } } }
eventHandlers['agent/session-start']({ agent: agentB, source: 'fresh' })
await new Promise((r) => setTimeout(r, 200))
const snapshotB = byName['jinji:memory-summary'].text({ agent: agentB })
assert('画像条数按配置截断', snapshotB.includes('仅列出前 2 条'), snapshotB.slice(0, 80))
assert('自定义书写规范生效', byName['jinji:memory-protocol'].text({ agent: agentB }).startsWith('自定义规范：写到 ' + ROOT))

await post({ writeProtocolEnabled: false })
assert('书写规范开关即时生效', byName['jinji:memory-protocol'].text({ agent: agentB }) === '')
await post({ startupContext: false })
assert('总开关关闭后摘要为空', byName['jinji:memory-summary'].text({ agent: agentB }) === '')

// ── 浏览器部分 ──────────────────────────────────────────────────────────
console.log('浏览器部分')
let clientExports = null
const moduleLoader = { load: ({ id, factory }) => {
  assert('bundle id', id === 'dsh-plugin-jinji')
  clientExports = factory((spec) => {
    if (spec === 'react') return { createElement: () => null, useState: (v) => [v, () => {}], useEffect: () => {} }
    throw new Error('unexpected require: ' + spec + '（只允许 shell 共享的 react）')
  })
} }
globalThis.window = { __ModuleLoader__: moduleLoader }
await import('../lib/client.js')
assert('导出 apply', typeof clientExports.apply === 'function')
assert('导出 name', clientExports.name === 'jinji-memory')

// apply：注册设置卡片（需要最小 DOM/观察者 mock；槽位缺失时静默跳过）
globalThis.document = {
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, toggle() {} }, addEventListener() {}, appendChild() {}, remove() {} }),
  querySelector: () => null,
  querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {} },
  documentElement: {},
  addEventListener() {},
  removeEventListener() {},
  contains: () => false,
}
globalThis.MutationObserver = class { observe() {} disconnect() {} }
globalThis.window.addEventListener = () => {}
globalThis.window.removeEventListener = () => {}

const registrations = []
const fakeSlots = {
  inject: (name, cb) => { if (name === 'settings.plugin.item') cb() },
  register: (opts) => { registrations.push(opts) },
}
clientExports.apply({ effect: (cb) => cb(), get: (n) => (n === 'slots' ? fakeSlots : undefined) })
assert('注册设置卡片到 settings.plugin.item', registrations.some((r) => r.name === 'settings.plugin.item' && r.id === 'jinji-memory'), registrations.length)

let threw = false
try {
  clientExports.apply({ effect: (cb) => cb(), get: () => undefined })
} catch { threw = true }
assert('slots 缺失时静默跳过', threw === false)

console.log(`\n${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
