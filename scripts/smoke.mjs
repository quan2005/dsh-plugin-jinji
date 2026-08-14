/**
 * 冒烟测试（零依赖，node scripts/smoke.mjs 直接运行，自包含不需要真实日志库）。
 *
 * 服务端部分：在临时目录里造一个最小 .journal 日志库，驱动
 *   - 数据路由：index 计数、read 全文、路径越界拒绝；
 *   - 启动注入：摘要快照、按会话缓存（书写规范不做全局注入，由预设承载）；
 *   - 配置链路：默认值、POST 校验、文件持久化、画像条数截断、开关即时生效；
 *   - 预设安装：copy standard → 改写 persona → preset.yml → 重复安装幂等。
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

// roster mock：copy 在临时目录里造一个仿 standard 的 preset
const PRESET_DIR = join(ROOT, 'presets/jinji')
const FAKE_STANDARD = `# standard preset
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      You are a coding agent powered by the {{model}} model.

- id: agent-instructions
  name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536
`
let presetInstalled = false
const rosterMock = {
  list: async () => (presetInstalled ? [{ id: 'jinji', path: join(PRESET_DIR, 'agent.cordis.yml') }] : []),
  copy: async () => {
    mkdirSync(PRESET_DIR, { recursive: true })
    writeFileSync(join(PRESET_DIR, 'agent.cordis.yml'), FAKE_STANDARD)
    presetInstalled = true
  },
  resolve: async (id) => ({ id, path: join(PRESET_DIR, 'agent.cordis.yml') }),
  standingKeyFor: async () => 'scope-key',
}

const { apply } = await import('../lib/index.js')
const eventHandlers = {}
const injected = []
let route = null
const ctx = {
  effect: (cb) => cb(),
  on: (name, fn) => { eventHandlers[name] = fn },
  inject: (deps, cb) => { injected.push({ deps, cb }) },
  get: (n) => (n === 'agentPresets' ? rosterMock : undefined),
  webServer: { register: (r) => { route = r } },
  fs: fsMock,
}
apply(ctx, { root: ROOT })

const contexts = []
for (const entry of injected) {
  if (entry.deps.includes('systemPrompt')) entry.cb({ systemPrompt: { context: (c) => contexts.push(c) } })
}

let captured = {}
const res = { writeHead: (s, h) => { captured = { status: s, headers: h } }, end: (b) => { captured.body = b } }
const get = (url) => route.handler({ method: 'GET', url }, res)
const postTo = (url) => route.handler({ method: 'POST', url }, res)
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

// ── 启动注入（默认配置，仅摘要） ────────────────────────────────────────
console.log('启动注入（默认配置，仅摘要）')
const agentA = { session: { header: { cwd: ROOT } } }
assert('已注册 session-start 监听', typeof eventHandlers['agent/session-start'] === 'function')
assert('已声明 systemPrompt 依赖', injected.some((i) => i.deps.includes('systemPrompt')))
assert('只注册摘要上下文（书写规范不再全局注入）', contexts.length === 1 && contexts[0].name === 'jinji:memory-summary', contexts.map((c) => c.name))
assert('预计算前摘要为空', contexts[0].text({ agent: agentA }) === '')
eventHandlers['agent/session-start']({ agent: agentA, source: 'fresh' })
await new Promise((r) => setTimeout(r, 200))
const snapshotA = contexts[0].text({ agent: agentA })
assert('快照包含日志摘要', snapshotA.includes('最近') && snapshotA.length > 0)
assert('快照包含画像摘要', snapshotA.includes('画像档案'))
assert('默认带全部画像', snapshotA.includes('1 产品 / 3 人物') && !snapshotA.includes('仅列出'))
assert('无 agent 时摘要为空', contexts[0].text({}) === '')

// ── 配置链路 ────────────────────────────────────────────────────────────
console.log('配置链路')
await get('/api/jinji-memory?action=config')
const cfg = json()
assert('config 返回默认配置', cfg.ok === true && cfg.config.maxEntries === 20 && cfg.config.maxPersonas === 30)
assert('config 携带预设安装状态', cfg.preset && cfg.preset.available === true && cfg.preset.installed === false)

await post({ maxEntries: 99999 })
assert('越界数值被拒绝', json().ok === false)
await post({ writeProtocol: 'x' })
assert('已移除的字段被拒绝', json().ok === false)
await post({ maxEntries: 5, maxPersonas: 2 })
const saved = json()
assert('保存配置生效', saved.ok === true && saved.config.maxEntries === 5 && saved.config.maxPersonas === 2)
assert('配置文件已写入磁盘', JSON.parse(readFileSync(join(ROOT, '.jinji-memory.json'), 'utf8')).maxPersonas === 2)

const agentB = { session: { header: { cwd: ROOT } } }
eventHandlers['agent/session-start']({ agent: agentB, source: 'fresh' })
await new Promise((r) => setTimeout(r, 200))
assert('画像条数按配置截断', contexts[0].text({ agent: agentB }).includes('仅列出前 2 条'))
await post({ startupContext: false })
assert('总开关关闭后摘要为空', contexts[0].text({ agent: agentB }) === '')

// ── 预设安装 ────────────────────────────────────────────────────────────
console.log('预设安装')
await postTo('/api/jinji-memory?action=install-preset')
const installed = json()
assert('安装预设成功', installed.ok === true && installed.already === false)
const comp = readFileSync(join(PRESET_DIR, 'agent.cordis.yml'), 'utf8')
assert('persona 行改写为秘书人设', comp.includes('谨迹秘书') && comp.includes('记忆书写规范') && comp.includes('{{model}}'))
assert('原有工具行保持完整', comp.includes('agent-instructions') && !comp.includes('coding agent powered'))
assert('preset.yml 已写入', readFileSync(join(PRESET_DIR, 'preset.yml'), 'utf8').includes('谨迹秘书'))
await postTo('/api/jinji-memory?action=install-preset')
assert('重复安装幂等', json().ok === true && json().already === true)
await get('/api/jinji-memory?action=config')
assert('安装后状态回读为已安装', json().preset.installed === true)

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
const headChildren = []
globalThis.document = {
  createElement: (tag) => ({ tagName: String(tag).toUpperCase(), setAttribute() {}, style: {}, classList: { add() {}, toggle() {} }, addEventListener() {}, appendChild() {}, remove() {}, textContent: '' }),
  querySelector: () => null,
  querySelectorAll: () => [],
  head: { appendChild: (el) => headChildren.push(el) },
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

// ── 搜索过滤纯函数（经 _internals 内部出口驱动，不污染公共 API） ──
const intl = clientExports._internals
assert('导出 _internals（过滤纯函数 + 分页常量）', !!intl && typeof intl.filterItems === 'function' && typeof intl.matchQuery === 'function' && intl.PAGE_SIZE === 3, typeof intl)
const sample = [
  { rel: 'a', title: '周报汇总', summary: '本周完成冲刺', tags: ['journal', 'research'] },
  { rel: 'b', title: 'Weekly Report', summary: 'sprint done', tags: [] },
  { rel: 'c', title: '投资复盘', summary: '赛力斯分析', tags: ['investment'] },
]
const relsOf = (q) => intl.filterItems(sample, q).map((x) => x.rel)
assert('过滤：标题命中且大小写不敏感', JSON.stringify(relsOf('WEEKLY')) === '["b"]', relsOf('WEEKLY'))
assert('过滤：摘要命中', JSON.stringify(relsOf('sprint')) === '["b"]', relsOf('sprint'))
assert('过滤：标签命中', JSON.stringify(relsOf('investment')) === '["c"]', relsOf('investment'))
assert('过滤：多关键词取交集', JSON.stringify(relsOf('周报 汇总')) === '["a"]', relsOf('周报 汇总'))
assert('过滤：无匹配返回空数组', JSON.stringify(relsOf('不存在')) === '[]', relsOf('不存在'))
assert('过滤：空查询原样返回全量', intl.filterItems(sample, '   ') === sample)
assert('过滤：非数组入参安全返回空数组', Array.isArray(intl.filterItems(null, 'x')) && intl.filterItems(undefined, 'x').length === 0)
assert('matchQuery：内部约定 q 需预先小写', intl.matchQuery(sample[2], 'investment') === true && intl.matchQuery(sample[2], 'INVESTMENT') === false)

// ── 注入 CSS：搜索框 / 键盘高亮 / 哨兵 / 窄屏适配 ──
const cssText = headChildren.filter((el) => el.tagName === 'STYLE').map((el) => el.textContent).join('\n')
assert('CSS 含搜索框样式类与占位符样式', cssText.includes('.jm-searchwrap') && cssText.includes('.jm-search') && cssText.includes('.jm-search::placeholder'))
assert('CSS 含键盘高亮描边（#5B8DB8）', cssText.includes('.jm-kb-active') && cssText.includes('#5B8DB8'))
assert('CSS 含渐进渲染哨兵样式', cssText.includes('.jm-more'))
assert('CSS 含 @media 窄屏适配且网格单列', cssText.includes('@media (max-width: 960px)') && cssText.includes('grid-template-columns: 1fr'))

console.log(`\n${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
