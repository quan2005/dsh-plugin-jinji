// 冒烟测试：用模拟的 webServer/connection 驱动 Host 半边，起一个真实的书房服务（临时端口），
// 验证状态路由、鉴权拒绝、引用桥；再在模拟浏览器环境里加载 Client 半边，确认注册项齐全。
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from 'node:net'
import * as host from '../lib/host.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// 不继承真实 journal 或个人技能配置。
const testRoot = mkdtempSync(path.join(tmpdir(), 'jinji-smoke-'))
const configPath = path.join(testRoot, 'config.json')
writeFileSync(configPath, JSON.stringify({ journal: path.resolve(HERE, '../..'), skill_roots: [], extra_roots: [], categories: [], archive_file: path.join(testRoot, 'archive.json') }))
process.env.JINJI_CONFIG = configPath
process.on('exit', () => {
  if (path.dirname(testRoot) === path.resolve(tmpdir()) && path.basename(testRoot).startsWith('jinji-smoke-')) rmSync(testRoot, { recursive: true, force: true })
})
const reservation = createServer()
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve) })
const PORT = reservation.address().port
await new Promise(resolve => reservation.close(resolve))

// ---------- Host
const routes = new Map()
const disposers = []
let authorized = true
const ctx = {
  logger: { info() {}, warn: m => console.warn(m) },
  webServer: { register: r => { routes.set(r.path, r.handler); return () => routes.delete(r.path) } },
  connection: { requestRejection: () => (authorized ? undefined : 401) },
  effect(fn) { const d = fn(); if (typeof d === 'function') disposers.push(d) },
}
host.apply(ctx, { port: PORT, python: '/usr/bin/python3', journal: path.resolve(HERE, '../..') })

async function call(p, method = 'GET') {
  const res = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v }, end(b) { this.body = b ?? '' } }
  await routes.get(p)({ method, headers: {} }, res)
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined }
}

assert.ok(routes.has(host.STATUS_PATH) && routes.has(host.PULL_PATH), 'routes registered')

let st
for (let i = 0; i < 40; i++) {
  st = await call(host.STATUS_PATH)
  if (st.json.online) break
  await new Promise(r => setTimeout(r, 250))
}
assert.equal(st.status, 200)
assert.equal(st.json.online, true, 'server came online')
assert.equal(st.json.url, `http://127.0.0.1:${PORT}`)

// 网页里点「引用」→ 排队 → 桥路由取走
// 不读取用户文档；只用本项目代码作为允许目录内的测试引用。
const sample = path.resolve(HERE, '../../server/server.py')
const q = await fetch(`http://127.0.0.1:${PORT}/api/cite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: sample }) })
assert.equal(q.status, 200)
const pulled = await call(host.PULL_PATH)
assert.equal(pulled.json.online, true)
assert.equal(pulled.json.items.length, 1)
assert.ok(pulled.json.items[0].abs.endsWith(sample), 'abs path matches')
assert.equal((await call(host.PULL_PATH)).json.items.length, 0, 'queue drained')
const direct = await (await fetch(`http://127.0.0.1:${PORT}/api/cite`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: sample, delivery: 'parent' }),
})).json()
assert.equal(direct.queued, false, 'DSH iframe citations do not join the shared queue')
assert.equal(direct.item.abs, sample)
assert.equal((await call(host.PULL_PATH)).json.items.length, 0, 'other clients cannot steal iframe citations')
const ping = await (await fetch(`http://127.0.0.1:${PORT}/api/ping`)).json()
assert.equal(ping.bridge, true, 'reader page sees the bridge as connected')

authorized = false
assert.equal((await call(host.STATUS_PATH)).status, 401)
assert.equal((await call(host.PULL_PATH)).status, 401)
authorized = true

for (const d of disposers.reverse()) d()
await new Promise(r => setTimeout(r, 400))
assert.equal(await host.ping(PORT, 500), undefined, 'own child stopped on dispose')

// ---------- Client
const registered = { slots: [], tabs: [], commands: [], locale: [] }
let factoryExports
globalThis.window = { __ModuleLoader__: { load: ({ id, factory }) => { assert.equal(id, 'dsh-plugin-jinji-reader'); factoryExports = factory(name => { assert.equal(name, 'react'); return { createElement() {}, Fragment: 'f', useState() {}, useEffect() {}, useSyncExternalStore() {} } }) } } }
const styleNodes = []
globalThis.document = { hidden: false, head: { appendChild(el) { styleNodes.push(el) } }, createElement: () => ({ dataset: {}, remove() { this.removed = true } }) }
const clientDisposers = []
new Function(readFileSync(path.join(HERE, '../lib/client.js'), 'utf8'))()
const timers = []
const origSetInterval = globalThis.setInterval
globalThis.setInterval = (fn, ms) => { timers.push(ms); return 0 }
globalThis.fetch = async () => ({ ok: true, json: async () => ({ online: false }) })
const cctx = {
  locale: { bind: () => k => k, register: (ns, d) => { registered.locale.push(ns); return () => {} } },
  slots: { inject: (_name, fn) => fn(), register: (spec) => { registered.slots.push(spec.name); return () => {} } },
  sidebarRightTabs: { register: def => { registered.tabs.push(def.kind); return () => {} } },
  sidebarRight: {}, layout: {}, sessions: {},
  effect(fn) { const dispose = fn(); if (typeof dispose === 'function') clientDisposers.push(dispose) },
  inject(_names, cb) { cb({ get: () => ({ register: c => { registered.commands.push(c.name); return () => {} } }), effect: f => f() }) },
  get: () => undefined,
}
factoryExports.apply(cctx)
globalThis.setInterval = origSetInterval
assert.deepEqual(registered.slots.sort(), ['main', 'sidebar.panellist', 'sidebar.right.pane.tab', 'sidebar.right.pane.tab.title'].sort())
assert.deepEqual(registered.tabs, ['jinji-shufang'])
assert.deepEqual(registered.commands, ['shufang'])
assert.ok(timers.includes(700), 'cite bridge polls')
assert.equal(styleNodes.length, 1, 'one plugin stylesheet')
assert.equal(styleNodes[0].dataset.plugin, 'dsh-plugin-jinji-reader', 'style cannot be claimed by another plugin')
assert.equal(styleNodes[0].dataset.pluginCss, 'dsh-plugin-jinji-reader/reader.css', 'stable stylesheet identity')
for (const dispose of clientDisposers.reverse()) dispose()
assert.equal(styleNodes[0].removed, true, 'own unload cleans up stylesheet')

const { toMention } = factoryExports._internals
assert.equal(toMention('/Users/me/journal/研究/a.md', '/Users/me/journal'), '@研究/a.md')
assert.equal(toMention('/Users/me/journal/a b.md', '/Users/me/journal/'), '@"a b.md"')
assert.equal(toMention('/x/y.md', '/Users/me/journal'), '@/x/y.md')
assert.equal(toMention('/x/"q".md', '/'), undefined)

// ---------- Citation regression: no list.current, ignore retained background sessions.
const { selectedSession, insertCitation, bindReaderBridge } = factoryExports._internals
let rows = { background: { id: 'background', cwd: '/other', retainedBy: { gateway: 1 } },
  chosen: { id: 'chosen', cwd: '/journal', retainedBy: { mainView: 1 } } }
const events = []
let accept = true, mounted = false, focused = false
const root = { isConnected: true, isContentEditable: true, getClientRects: () => [{}], textContent: 'old text' }
const actx = {}
const shell = {
  snapshot: { draft: 'old text', draftRev: 7, phase: 'plain' },
  editor: { getRootElement: () => mounted ? root : null },
  focus() { focused = true },
  actions: {
    captureInsertion: () => ({ start: 3, end: 3, draftRev: shell.snapshot.draftRev }),
    insertText(text, span) {
      assert.equal(mounted, true, 'must reveal mounted composer first')
      events.push({ text, span })
      if (!accept) return false
      shell.snapshot = { ...shell.snapshot, draft: shell.snapshot.draft.slice(0, span.start) + text + shell.snapshot.draft.slice(span.end), draftRev: span.draftRev + 1 }
      root.textContent = shell.snapshot.draft
      return true
    },
  },
}
const sessions = { list: { getSnapshot: () => ({ byId: rows }) }, scope: id => id === 'chosen' ? actx : undefined }
const citeCtx = { sessions, layout: { selectPanel: id => { assert.equal(id, null); mounted = true } }, get: key => key === 'conversation' ? { input: { for: scope => { assert.equal(scope, actx); return shell } } } : undefined }
assert.equal(selectedSession(sessions).id, 'chosen')
assert.equal((await insertCitation(citeCtx, '/journal/a b.md')).ok, true)
assert.equal(events[0].text, ' @"a b.md" ')
assert.deepEqual(events[0].span, { start: 3, end: 3, draftRev: 7 })
assert.equal(focused, true)
accept = false
assert.equal((await insertCitation(citeCtx, '/journal/a.md')).reason, 'busy')
rows = { background: rows.background }
assert.equal((await insertCitation(citeCtx, '/journal/a.md')).reason, 'no-session')

let receive, calls = 0
const messages = []
const frame = { postMessage: (message, origin) => messages.push({ message, origin }) }
const target = { addEventListener: (_type, fn) => { receive = fn }, removeEventListener: (_type, fn) => assert.equal(fn, receive) }
const off = bindReaderBridge(target, () => frame, 'http://127.0.0.1:4417', async () => { calls++; return { ok: true } })
const event = { source: frame, origin: 'http://127.0.0.1:4417', data: { type: 'jinji:cite', id: 'one', abs: '/journal/a.md' } }
await receive({ ...event, origin: 'http://evil.test' })
await receive({ ...event, source: {} })
assert.equal(calls, 0, 'reject wrong origins and other frames')
await Promise.all([receive(event), receive(event)])
assert.equal(calls, 1, 'deduplicate retries')
assert.equal(messages[0].message.type, 'jinji:cite-result')
assert.equal(messages[0].message.ok, true)
off()
console.log('smoke ok')
process.exit(0)
