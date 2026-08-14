/**
 * dsh-plugin-jinji —— 服务端部分（跑在 dsh 的 Node 进程里）。
 *
 * 本插件分两个文件运行：这里是服务端，负责读数据；lib/client.js 是浏览器部分，负责界面。
 * - 通过官方 `fs` 服务读取日志库（.journal/memory 最近日志 + .journal/identity 画像）
 * - 通过 `webServer` 服务注册数据接口 GET /api/jinji-memory，返回 JSON 给网页
 * - 会话启动时注入记忆摘要快照（最近日志 + 画像的 summary）
 * - 书写能力走「谨迹秘书」Agent 预设：用户在设置卡片里一键安装，
 *   新建会话时选用它，该会话才会携带书写规范（见 ADR-0012）
 * - 配置：cordis config（patch yml）打底，`.jinji-memory.json` 覆盖，
 *   由「设置 → 插件配置」里的卡片读写（保存即生效，新会话采用新值）；
 *   保存走「读-改-写」——以磁盘现文件为基底只覆盖本次提交的字段，
 *   两个 DSH 会话并行保存也不会把对方刚写的字段打回旧值
 * - index 结果带条目级缓存：按 mtime/size（或 fs 服务的 version 令牌）指纹
 *   判断文件是否变更，未变更直接复用解析结果，面板重开不再全量重读
 * - 路径防护：只允许读 .journal/ 之内的文件，拒绝 `..` 与越界
 * - 日志库根目录的查找顺序：配置 config.root > 环境变量 DSH_JINJI_ROOT > dsh 启动目录
 * - 不依赖任何第三方包，不需要编译
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_ROOT = process.env.DSH_JINJI_ROOT || process.cwd()

export const name = 'jinji-memory'
export const inject = ['fs', 'webServer']

// ── 配置 ────────────────────────────────────────────────────────────────
// 生效优先级：配置文件（<root>/.jinji-memory.json，设置卡片写它）
//   > cordis config（profile 的 cordis.patch.yml）> 内置默认。
// root 例外：只在 cordis config / 环境变量里配（配置文件自己就放在 root 下）。
const CONFIG_FILE = '.jinji-memory.json'

const DEFAULTS = {
  maxEntries: 20, // 启动摘要里带多少条最近日志（1–200）
  maxPersonas: 30, // 启动摘要里带多少条画像（1–500）
  maxBytes: 60000, // 摘要文本字节软上限（4096–500000）
  startupContext: true, // 是否注入启动摘要
}

const CONFIG_RULES = {
  maxEntries: { kind: 'int', min: 1, max: 200 },
  maxPersonas: { kind: 'int', min: 1, max: 500 },
  maxBytes: { kind: 'int', min: 4096, max: 500000 },
  startupContext: { kind: 'bool' },
}

/** 校验单个字段；合法返回 undefined，非法返回错误消息。 */
function configError(field, value) {
  const rule = CONFIG_RULES[field]
  if (rule === undefined) return '未知字段 ' + field
  if (rule.kind === 'int') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < rule.min || value > rule.max) {
      return field + ' 必须是 ' + rule.min + '–' + rule.max + ' 的整数'
    }
    return undefined
  }
  if (rule.kind === 'bool') return typeof value === 'boolean' ? undefined : field + ' 必须是布尔值'
  if (typeof value !== 'string') return field + ' 必须是字符串'
  if (value.length > rule.max) return field + ' 超过 ' + rule.max + ' 字符上限'
  return undefined
}

/** 把一份来源（cordis config 或配置文件 JSON）里合法的字段并入 target；非法字段静默忽略。 */
function mergeConfig(target, source) {
  if (source === null || typeof source !== 'object') return
  for (const field of Object.keys(CONFIG_RULES)) {
    if (source[field] !== undefined && configError(field, source[field]) === undefined) target[field] = source[field]
  }
}

/** 读取 <root>/.jinji-memory.json 的原始 JSON 对象；文件不存在/损坏/非对象时返回 null。 */
async function readConfigFile(fs, root) {
  try {
    const target = await fs.resolve(root + '/' + CONFIG_FILE)
    const st = await fs.stat(target)
    if (st === undefined || st.type !== 'file') return null
    const parsed = JSON.parse(await fs.readText(target))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** 按「默认 ← cordis config ← 配置文件」把 fileBody 刷新进 runtimeConfig（保持对象身份，提供器热读的就是它）。 */
function rebuildRuntimeConfig(runtimeConfig, configSource, fileBody) {
  const fresh = { ...DEFAULTS }
  mergeConfig(fresh, configSource)
  mergeConfig(fresh, fileBody)
  for (const field of Object.keys(CONFIG_RULES)) runtimeConfig[field] = fresh[field]
}

/** 启动时读取配置文件并刷新 runtimeConfig；文件不存在/损坏时保持现状。 */
async function loadConfigFile(fs, root, runtimeConfig, configSource) {
  const raw = await readConfigFile(fs, root)
  if (raw !== null) rebuildRuntimeConfig(runtimeConfig, configSource, raw)
}

/** 把配置对象写回配置文件（原子写，走 fs 服务）。 */
async function saveConfigFile(fs, root, body) {
  const target = await fs.resolve(root + '/' + CONFIG_FILE)
  await fs.writeText(target, JSON.stringify(body, null, 2) + '\n')
}

async function readBody(req) {
  let data = ''
  for await (const chunk of req) data += chunk
  return data
}

function listOf(val) {
  if (typeof val !== 'string') return []
  const trimmed = val.trim()
  const m = /^\[(.*)\]$/.exec(trimmed)
  const inner = m ? m[1] : trimmed
  return inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
}

function parseFrontmatter(text, fallbackTitle) {
  let body = text
  let summary = ''
  let tags = []
  let sources = []
  const m = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(text)
  if (m) {
    body = text.slice(m[0].length)
    for (const line of m[1].split('\n')) {
      const idx = line.indexOf(':')
      if (idx < 1) continue
      const key = line.slice(0, idx).trim()
      let val = line.slice(idx + 1).trim()
      if (val.length >= 2 && (val[0] === '"' || val[0] === "'") && val[val.length - 1] === val[0]) val = val.slice(1, -1)
      if (key === 'summary' && val) summary = val
      if (key === 'tags') tags = listOf(val)
      if (key === 'sources') sources = listOf(val)
    }
  }
  const h1 = /^#\s+(.+?)\s*$/m.exec(body)
  return { title: h1 ? h1[1].trim() : fallbackTitle, summary, tags, sources }
}

async function listJournals(fs, root) {
  const mem = await fs.resolve(root + '/.journal/memory')
  const memStat = await fs.stat(mem)
  if (memStat === undefined || memStat.type !== 'directory') return []
  const entries = await fs.listDir(mem)
  const out = []
  for (const ym of entries
    .filter((e) => e.type === 'directory' && /^\d{4}$/.test(e.name))
    .sort((a, b) => (a.name < b.name ? 1 : -1))) {
    const files = (await fs.listDir(ym.target))
      .filter((e) => e.type === 'file' && e.name.endsWith('.md'))
      .sort((a, b) => (a.name < b.name ? 1 : -1))
    for (const f of files) {
      out.push({ rel: '.journal/memory/' + ym.name + '/' + f.name, ym: ym.name, name: f.name, target: f.target })
    }
  }
  return out
}

async function listPersonas(fs, ident) {
  const entries = await fs.listDir(ident)
  const out = []
  const readme = entries.find((e) => e.name === 'README.md' && e.type === 'file')
  if (readme) out.push({ name: 'README.md', kind: 'user', region: '本人', target: readme.target })
  for (const e of entries
    .filter((e) => e.type === 'file' && e.name.startsWith('product-') && e.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    out.push({ name: e.name, kind: 'product', region: '产品', target: e.target })
  }
  for (const e of entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.md') && e.name !== 'README.md' && !e.name.startsWith('product-'))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const stem = e.name.replace(/\.md$/, '')
    const dash = stem.indexOf('-')
    out.push({ name: e.name, kind: 'person', region: dash > 0 ? stem.slice(0, dash) : '其他', target: e.target })
  }
  return out
}

async function readDoc(fs, root, rel) {
  if (typeof rel !== 'string' || !rel.startsWith('.journal/')) throw new Error('invalid path')
  const parts = rel.split('/')
  if (parts.some((p) => p === '..' || p === '')) throw new Error('invalid path')
  const file = await fs.resolve(root + '/' + rel)
  const journal = await fs.resolve(root + '/.journal')
  if (!fs.contains(journal, file)) throw new Error('outside journal root')
  return fs.readText(file)
}

// ── index 条目缓存 ────────────────────────────────────────────────────────
// fs.stat 的返回形态见 @deepseek-ai/dsh-fs 的 FsInfo：{ version, type, size? }，
// 没有 mtimeMs。version 是后端签发的「新鲜度令牌」字符串（本地后端由
// dev:ino:size:mtimeNs:ctimeNs 组成），两次 stat 的 version 等值即官方语义
// 的未变更检查。为兼容带 mtimeMs 的 Node 风格 stat（测试 mock 等），指纹取两种形态：
//   1) mtimeMs + size 都是数字；
//   2) version 是非空字符串（真实 fs 服务）。
// 两者都取不到 → 无指纹，调用方跳过缓存照常读（正确性优先，宁可慢不可陈旧）。

/** 从 stat 结果提取缓存指纹；无可用指纹时返回 undefined。 */
function statFingerprint(st) {
  if (st === null || typeof st !== 'object') return undefined
  const mtimeMs = typeof st.mtimeMs === 'number' ? st.mtimeMs : undefined
  const size = typeof st.size === 'number' ? st.size : undefined
  const version = typeof st.version === 'string' && st.version ? st.version : undefined
  if (version === undefined && (mtimeMs === undefined || size === undefined)) return undefined
  return { mtimeMs, size, version }
}

/** 两枚指纹是否指向同一份未变更的内容。 */
function sameFingerprint(a, b) {
  return a.mtimeMs === b.mtimeMs && a.size === b.size && a.version === b.version
}

/** 把 fs 服务解析出的 target 转成稳定字符串，作为缓存 key（「解析后路径」）。 */
function targetKeyOf(target) {
  if (target === null || typeof target !== 'object') return String(target)
  if (typeof target.targetKey === 'string') return target.targetKey
  if (typeof target.key === 'string') return target.key
  if (typeof target.displayPath === 'string') return target.displayPath
  try {
    return JSON.stringify(target)
  } catch {
    return String(target)
  }
}

/**
 * 读取并解析一个条目，带指纹缓存：stat 指纹与缓存一致 → 复用缓存 entry；
 * 指纹取不到或已变化 → 重新 readText 解析并更新缓存。
 * read（读全文）不走这里，始终现读。
 */
async function readCachedEntry(fs, cache, target, parse) {
  let fingerprint = undefined
  try {
    fingerprint = statFingerprint(await fs.stat(target))
  } catch {
    fingerprint = undefined // stat 报错时不冒险用缓存，照常读，失败交给外层容错
  }
  const key = targetKeyOf(target)
  if (fingerprint === undefined) {
    cache.delete(key) // 无指纹就不留旧值，避免后续误命中
  } else {
    const hit = cache.get(key)
    if (hit !== undefined && sameFingerprint(hit, fingerprint)) return hit.entry
  }
  const entry = await parse()
  if (fingerprint !== undefined) cache.set(key, { ...fingerprint, entry })
  return entry
}

async function buildIndex(fs, root, entryCache) {
  const journalRes = await fs.resolve(root + '/.journal')
  const jStat = await fs.stat(journalRes)
  if (jStat === undefined || jStat.type !== 'directory') {
    return { ok: false, reason: 'no-journal', root }
  }
  const journals = []
  for (const item of (await listJournals(fs, root)).slice(0, 120)) {
    try {
      journals.push(await readCachedEntry(fs, entryCache, item.target, async () => {
        const text = await fs.readText(item.target)
        const parsed = parseFrontmatter(text, item.name.replace(/\.md$/, ''))
        const dayMatch = /^(\d+)-/.exec(item.name)
        return {
          rel: item.rel,
          ym: item.ym,
          day: dayMatch ? parseInt(dayMatch[1], 10) : 0,
          title: parsed.title,
          summary: parsed.summary,
          tags: parsed.tags,
          sources: parsed.sources,
        }
      }))
    } catch {
      /* skip unreadable */
    }
  }
  const personas = []
  const ident = await fs.resolve(root + '/.journal/identity')
  const iStat = await fs.stat(ident)
  if (iStat !== undefined && iStat.type === 'directory') {
    for (const item of await listPersonas(fs, ident)) {
      try {
        personas.push(await readCachedEntry(fs, entryCache, item.target, async () => {
          const text = await fs.readText(item.target)
          const parsed = parseFrontmatter(text, item.name.replace(/\.md$/, ''))
          return {
            rel: '.journal/identity/' + item.name,
            kind: item.kind,
            region: item.region,
            title: parsed.title,
            summary: parsed.summary,
            tags: parsed.tags,
          }
        }))
      } catch {
        /* skip unreadable */
      }
    }
  }
  return { ok: true, root, journals, personas }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

/**
 * 组装「记忆摘要」快照文本（启动时注入用，见 docs/architecture.md 2.5）。
 * 只读每条记录的 summary：最近 opts.maxEntries 条日志 + 前 opts.maxPersonas 条画像档案。
 */
async function composeSummary(fs, root, opts) {
  const { maxEntries, maxPersonas, maxBytes } = opts
  const journalRes = await fs.resolve(root + '/.journal')
  const jStat = await fs.stat(journalRes)
  if (jStat === undefined || jStat.type !== 'directory') return ''
  const out = []
  const journals = (await listJournals(fs, root)).slice(0, maxEntries)
  if (journals.length > 0) {
    out.push(`# 最近 ${journals.length} 条日志`)
    for (const item of journals) {
      try {
        const text = await fs.readText(item.target)
        const parsed = parseFrontmatter(text, item.name.replace(/\.md$/, ''))
        out.push(`## ${parsed.title}`)
        out.push(`\`${item.rel}\``)
        if (parsed.summary) out.push(parsed.summary)
        out.push('')
      } catch {
        /* skip unreadable */
      }
    }
  }
  const ident = await fs.resolve(root + '/.journal/identity')
  const iStat = await fs.stat(ident)
  if (iStat !== undefined && iStat.type === 'directory') {
    const personas = await listPersonas(fs, ident)
    if (personas.length > 0) {
      const counts = { user: 0, product: 0, person: 0 }
      const label = { user: '用户', product: '产品', person: '人物' }
      for (const p of personas) counts[p.kind] = (counts[p.kind] || 0) + 1
      const shown = personas.slice(0, maxPersonas)
      const truncated = shown.length < personas.length ? `（仅列出前 ${shown.length} 条）` : ''
      out.push(`# 画像档案（${counts.user} 用户 / ${counts.product} 产品 / ${counts.person} 人物）${truncated}`)
      for (const item of shown) {
        try {
          const text = await fs.readText(item.target)
          const parsed = parseFrontmatter(text, item.name.replace(/\.md$/, ''))
          out.push(`## [${label[item.kind]}] ${parsed.title}`)
          out.push(`\`.journal/identity/${item.name}\``)
          if (parsed.summary) out.push(parsed.summary)
          out.push('')
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
  let text = out.join('\n')
  const bytes = new TextEncoder().encode(text)
  if (bytes.length > maxBytes) {
    text = new TextDecoder().decode(bytes.slice(0, maxBytes))
    text += `\n\n…（输出已超过 ${maxBytes} 字节软上限被截断；请按需读取完整档案。）`
  }
  return text
}

/**
 * 记忆书写规范 —— 「谨迹秘书」Agent 预设的人设正文来源（见 ADR-0012）。
 * 不做全局注入：用户安装预设后，只有选用该预设的会话才携带这段规则。
 * __MEMORY_ROOT__ 在安装预设时替换成插件实际解析出的记忆根目录。
 */
const WRITE_PROTOCOL = `# 记忆书写规范（主动记录）

你是这个工作区的记忆管家：每次会话开始时你会收到一份记忆快照（最近日志 + 画像摘要）。除了读取记忆，你还要**主动书写记忆**——没有记录，就没有发生。

记忆根目录：__MEMORY_ROOT__

## 什么时候写
1. 会话收尾时（用户告别 / 一项任务完成）：把本次会话中值得记住的内容写成一条日志（用户明确说不要记的除外）。
2. 会话中出现重要结论、关键决策、踩坑经验、可复用的方法时：顺手记一条。
3. 出现了新人物 / 新产品 / 新项目，或某个实体的信息发生变化时：更新画像档案。
4. 用户说「记住这个 / 记一下」：立即写。

## 流水日志怎么写
- 位置：\`.journal/memory/YYMM/DD-标题.md\`（YYMM 是年月，如 2608；DD 是两位日期）。
- 每条日志开头必须有 frontmatter，包含 title、date、summary：

\`\`\`
---
title: 标题
date: 2026-08-14
summary: 一两句话说清这条日志讲了什么、为什么值得记（50 字以内）
---
\`\`\`

- 正文把事情的背景 → 过程 → 结论 → 为什么值得记住讲清楚；与已有日志相关时互相引用。
- **summary 最重要**：读取记忆时索引层只读 summary，点开才读全文。所以 summary 必须独立成句、自带信息量，让别人只看 summary 就能知道这条日志的价值。

## 画像档案怎么写
- 位置：\`.journal/identity/\`。文件名约定：\`组织-人名.md\`（如 \`趣丸-张三.md\`）、\`product-产品名.md\`；本人的档案在 \`README.md\`。
- 一个实体一份档案，记录身份与定位、关键事实、与用户的关系、最近动态。信息更新时直接修改原文件，保持「一个实体一份最新画像」。
- 建档有门槛：只为多次出现、值得长期跟踪的实体建档；一面之缘不建档。

## 不写什么
- 一次性琐事、没有信息量的寒暄。
- 用户明确表示不要记录的内容。

## 写完后自查
- frontmatter 冒号后有空格，文件名日期与 date 一致；
- summary 独立成句、能自己看懂；正文与 summary 不矛盾；
- 用你本会话的文件工具完成写入（写入失败不要硬来，告诉用户即可）。`

// ── 「谨迹秘书」Agent 预设 ──────────────────────────────────────────────
// 通过 roster 的官方创作通道（copy standard → 改写 persona 行 → 挂载校验）
// 安装到用户 preset 根目录，用户在新建会话时自主选择（见 ADR-0012）。
const SECRETARY_PRESET_ID = 'jinji'
const SECRETARY_PRESET_NAME = '谨迹秘书'
const SECRETARY_PRESET_META = `name: 谨迹秘书
description: 标准编程 agent + 谨迹记忆书写：会话中主动把值得记住的内容写进 .journal 日志与画像档案。
`

/** 预设人设 = 秘书身份（保留 {{model}} / {{cwd}} 模板变量）+ 书写规范正文。 */
function buildSecretaryPersona(root) {
  const preamble = '你是「谨迹秘书」——一个带长期记忆的 AI 助手，由 {{model}} 模型驱动。你的工作目录是 {{cwd}}。\n\n'
  const where = root + '（若会话工作目录下存在 .journal，则以会话工作目录为准）'
  return preamble + WRITE_PROTOCOL.replace('__MEMORY_ROOT__', where)
}

/** 把 preset 组装文件里的 persona 行整段替换为我们的秘书人设（保留其余行原样）。 */
function rewritePersona(comp, personaText) {
  const lines = comp.split('\n')
  const start = lines.findIndex((l) => l.trim() === '- id: persona')
  if (start < 0) throw new Error('preset 组装里找不到 persona 行')
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('- id: ')) { end = i; break }
  }
  const block = ['- id: persona', "  name: '@deepseek-ai/dsh-persona'", '  config:', '    text: |']
    .concat(personaText.split('\n').map((l) => '      ' + l), [''])
  return lines.slice(0, start).concat(block, lines.slice(end)).join('\n')
}

/** 安装「谨迹秘书」预设：copy standard → 改写 persona → 写 preset.yml → 挂载校验。
 * 组装文件与元数据用 node:fs 直写：用户 preset 根目录（~/.dsh/.agent-presets/）
 * 通常在 fs 服务的写沙箱之外，走 ctx.fs.writeText 会被拒（FS_SANDBOX_DENIED）；
 * dsh-agent-presets 自己的 authoring 通道也是 node:fs 直写（见 ADR-0013）。 */
async function installSecretaryPreset(ctx, root) {
  const roster = ctx.get('agentPresets')
  if (roster === undefined) throw new Error('agentPresets 服务不可用（当前部署没有 Agent 预设功能）')
  const all = await roster.list()
  if (all.some((p) => p.id === SECRETARY_PRESET_ID)) return { already: true }
  try {
    await roster.copy('standard', SECRETARY_PRESET_ID, SECRETARY_PRESET_NAME)
  } catch (e) {
    // list 检查与 copy 之间被并发安装抢了先：视为已安装，幂等返回。
    if (/PresetExists/i.test(String((e && e.name) || '') + ' ' + String((e && e.message) || ''))) return { already: true }
    throw e
  }
  const preset = await roster.resolve(SECRETARY_PRESET_ID)
  const comp = readFileSync(preset.path, 'utf8')
  writeFileSync(preset.path, rewritePersona(comp, buildSecretaryPersona(root)))
  // copy 已写好 name；这里补上记忆场景的 description（元数据纯展示，roster 每次 list 重读）。
  writeFileSync(join(dirname(preset.path), 'preset.yml'), SECRETARY_PRESET_META)
  await roster.standingKeyFor(SECRETARY_PRESET_ID) // 挂载校验，失败会抛错
  return { already: false }
}

/** 查询预设安装状态（roster 不可用时 available=false）。 */
async function presetStatus(ctx) {
  const roster = ctx.get('agentPresets')
  if (roster === undefined) return { id: SECRETARY_PRESET_ID, available: false, installed: false }
  try {
    const all = await roster.list()
    return { id: SECRETARY_PRESET_ID, available: true, installed: all.some((p) => p.id === SECRETARY_PRESET_ID) }
  } catch {
    return { id: SECRETARY_PRESET_ID, available: true, installed: false }
  }
}

export function apply(ctx, config = {}) {
  const root = typeof config.root === 'string' && config.root ? config.root : DEFAULT_ROOT

  // 生效配置 = 内置默认 ← cordis config ← 配置文件（异步加载完成后覆盖）。
  // 提供器每次组装都读 runtimeConfig，所以设置卡片保存后新会话立即用新值。
  const runtimeConfig = { ...DEFAULTS }
  mergeConfig(runtimeConfig, config)
  loadConfigFile(ctx.fs, root, runtimeConfig, config)

  // index 条目缓存：key 为解析后路径，value 为 {mtimeMs, size, version, entry}。
  // 放在 apply 闭包里，插件停用即随 Run 一起丢弃；read（读全文）不经过它。
  const entryCache = new Map()

  // ── 启动注入：记忆摘要快照（见 ADR-0009） ────────────────────────────
  // systemPrompt 的上下文提供器是同步的，而 fs 服务是异步的：
  // 所以在 agent/session-start 事件里异步预计算快照（按 agent 缓存一次），
  // 提供器只同步返回缓存。若首个请求前预计算未完成，该次请求暂无摘要，
  // 后续组装会自动取到。书写规范不在此处全局注入——它由「谨迹秘书」预设承载。
  const summaryCache = new WeakMap() // agent -> { text, root }
  ctx.on('agent/session-start', (payload) => {
    const agent = payload && payload.agent
    if (agent === undefined || summaryCache.has(agent)) return
    ;(async () => {
      let snapshotRoot = root
      try {
        const sessionCwd = agent.session && agent.session.header ? agent.session.header.cwd : undefined
        if (typeof sessionCwd === 'string' && sessionCwd) {
          const probe = await ctx.fs.resolve(sessionCwd + '/.journal')
          const probeStat = await ctx.fs.stat(probe)
          if (probeStat !== undefined && probeStat.type === 'directory') snapshotRoot = sessionCwd
        }
        if (!runtimeConfig.startupContext) {
          summaryCache.set(agent, { text: '', root: snapshotRoot })
          return
        }
        const text = await composeSummary(ctx.fs, snapshotRoot, runtimeConfig)
        summaryCache.set(agent, { text, root: snapshotRoot })
      } catch {
        summaryCache.set(agent, { text: '', root: snapshotRoot })
      }
    })()
  })
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.context({
      name: 'jinji:memory-summary',
      order: 130,
      text: (assembleCtx) => {
        const agent = assembleCtx && assembleCtx.agent
        if (agent === undefined || !runtimeConfig.startupContext) return ''
        const entry = summaryCache.get(agent)
        return entry ? entry.text : ''
      },
    })
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/jinji-memory',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost')
        const action = url.searchParams.get('action')
        if (action === 'install-preset') {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, reason: 'method-not-allowed' })
          const result = await installSecretaryPreset(ctx, root)
          return sendJson(res, 200, { ok: true, ...result })
        }
        if (action === 'config') {
          if (req.method === 'GET') {
            return sendJson(res, 200, {
              ok: true,
              config: { ...runtimeConfig },
              defaults: { ...DEFAULTS },
              file: CONFIG_FILE,
              preset: await presetStatus(ctx),
            })
          }
          if (req.method === 'POST') {
            let patch
            try {
              patch = JSON.parse(await readBody(req))
            } catch {
              return sendJson(res, 400, { ok: false, reason: '请求体不是合法 JSON' })
            }
            if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
              return sendJson(res, 400, { ok: false, reason: '请求体必须是 JSON 对象' })
            }
            for (const field of Object.keys(patch)) {
              const err = configError(field, patch[field])
              if (err !== undefined) return sendJson(res, 400, { ok: false, reason: err })
            }
            // 读-改-写：以磁盘现文件为基底（读不到/损坏时退回当前 runtimeConfig），
            // 只覆盖本次请求体里实际提交的字段，磁盘上其他会话刚写的字段原样保留。
            const base = (await readConfigFile(ctx.fs, root)) ?? { ...runtimeConfig }
            const body = { ...base, ...patch }
            await saveConfigFile(ctx.fs, root, body)
            rebuildRuntimeConfig(runtimeConfig, config, body)
            return sendJson(res, 200, { ok: true, config: { ...runtimeConfig } })
          }
          return sendJson(res, 405, { ok: false, reason: 'method-not-allowed' })
        }
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, reason: 'method-not-allowed' })
        if (action === 'read') {
          const rel = url.searchParams.get('rel') || ''
          const text = await readDoc(ctx.fs, root, rel)
          return sendJson(res, 200, { ok: true, rel, text })
        }
        const index = await buildIndex(ctx.fs, root, entryCache)
        return sendJson(res, 200, index)
      } catch (error) {
        return sendJson(res, 500, { ok: false, reason: String((error && error.message) || error) })
      }
    },
  }), 'jinji-memory route')
}
