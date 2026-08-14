/**
 * 双半冒烟测试（零依赖，node scripts/smoke.mjs 直接运行）。
 *
 * Host 半：以真实 .journal 日志库（可通过 DSH_JINJI_ROOT 或 --root 指定）
 *   驱动数据路由：index 计数、read 全文、路径越界拒绝。
 * Client 半：mock window.__ModuleLoader__ 驱动 factory 物化，
 *   验证导出与 apply 基本形状。
 */
import { realpathSync, statSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = process.env.DSH_JINJI_ROOT || process.argv[2] || process.cwd()

let passed = 0
let failed = 0
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓', name) }
  else { failed++; console.error('  ✗', name, extra === undefined ? '' : JSON.stringify(extra)) }
}

// ── Host 半 ──────────────────────────────────────────────────────────────
const target = (p) => ({ key: realpathSync(p) })
const fsMock = {
  resolve: async (p) => target(p),
  stat: async (t) => {
    try { const s = statSync(t.key); return { version: {}, type: s.isDirectory() ? 'directory' : 'file', size: s.size } }
    catch { return undefined }
  },
  listDir: async (t) => readdirSync(t.key).map((name) => {
    const s = statSync(join(t.key, name))
    return { name, type: s.isDirectory() ? 'directory' : 'file', target: target(join(t.key, name)), size: s.size }
  }),
  readText: async (t) => readFileSync(t.key, 'utf8'),
  contains: (p, c) => c.key === p.key || c.key.startsWith(p.key + '/'),
}

const { apply } = await import('../lib/index.js')
let route = null
apply({ effect: (cb) => cb(), webServer: { register: (r) => { route = r } }, fs: fsMock }, { root: ROOT })

console.log(`Host 半（root=${ROOT}）`)
let captured = {}
const res = { writeHead: (s, h) => { captured = { status: s, headers: h } }, end: (b) => { captured.body = b } }
await route.handler({ method: 'GET', url: '/api/jinji-memory?action=index' }, res)
const index = JSON.parse(captured.body)
if (index.ok !== true) {
  console.error(`  ✗ 日志库不可用（${index.reason}）：请以 DSH_JINJI_ROOT=/path/to/journal node scripts/smoke.mjs 运行`)
  process.exit(1)
}
const journals = index.journals || []
const personas = index.personas || []
assert('index ok', index.ok === true)
assert('journals 非空', journals.length > 0, journals.length)
assert('personas 非空', personas.length > 0, personas.length)
assert('journal 字段完整', journals[0].rel !== undefined && journals[0].title !== undefined)

await route.handler({ method: 'GET', url: '/api/jinji-memory?action=read&rel=' + encodeURIComponent(journals[0].rel) }, res)
const doc = JSON.parse(captured.body)
assert('read 全文', doc.ok === true && doc.text.length > 0, doc.text.length)

await route.handler({ method: 'GET', url: '/api/jinji-memory?action=read&rel=../../etc/passwd' }, res)
const bad = JSON.parse(captured.body)
assert('越界拒绝', bad.ok === false)

// ── Client 半 ──────────────────────────────────────────────────────────────
console.log('Client 半')
const moduleLoader = { load: ({ id, factory }) => {
  const exports = factory(() => { throw new Error('unexpected require: client bundle 必须零依赖') })
  assert('bundle id', id === 'dsh-plugin-jinji')
  assert('导出 apply', typeof exports.apply === 'function')
  assert('导出 name', exports.name === 'jinji-memory')
} }
globalThis.window = { __ModuleLoader__: moduleLoader }
await import('../lib/client.js')

console.log(`\n${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
