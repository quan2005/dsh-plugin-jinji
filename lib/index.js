/**
 * dsh-plugin-jinji —— 服务端部分（跑在 dsh 的 Node 进程里）。
 *
 * 本插件分两个文件运行：这里是服务端，负责读数据；lib/client.js 是浏览器部分，负责界面。
 * - 通过官方 `fs` 服务读取日志库（.journal/memory 最近日志 + .journal/identity 画像）
 * - 通过 `webServer` 服务注册数据接口 GET /api/jinji-memory，返回 JSON 给网页
 * - 会话启动时注入两块上下文：记忆摘要快照（读）与记忆书写规范（写）
 * - 路径防护：只允许读 .journal/ 之内的文件，拒绝 `..` 与越界
 * - 日志库根目录的查找顺序：配置 config.root > 环境变量 DSH_JINJI_ROOT > dsh 启动目录
 * - 不依赖任何第三方包，不需要编译
 */
const DEFAULT_ROOT = process.env.DSH_JINJI_ROOT || process.cwd()

export const name = 'jinji-memory'
export const inject = ['fs', 'webServer']

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

async function buildIndex(fs, root) {
  const journalRes = await fs.resolve(root + '/.journal')
  const jStat = await fs.stat(journalRes)
  if (jStat === undefined || jStat.type !== 'directory') {
    return { ok: false, reason: 'no-journal', root }
  }
  const journals = []
  for (const item of (await listJournals(fs, root)).slice(0, 120)) {
    try {
      const text = await fs.readText(item.target)
      const parsed = parseFrontmatter(text, item.name.replace(/\.md$/, ''))
      const dayMatch = /^(\d+)-/.exec(item.name)
      journals.push({
        rel: item.rel,
        ym: item.ym,
        day: dayMatch ? parseInt(dayMatch[1], 10) : 0,
        title: parsed.title,
        summary: parsed.summary,
        tags: parsed.tags,
        sources: parsed.sources,
      })
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
        const text = await fs.readText(item.target)
        const parsed = parseFrontmatter(text, item.name.replace(/\.md$/, ''))
        personas.push({
          rel: '.journal/identity/' + item.name,
          kind: item.kind,
          region: item.region,
          title: parsed.title,
          summary: parsed.summary,
          tags: parsed.tags,
        })
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
 * 只读每条记录的 summary：最近 maxEntries 条日志 + 全部画像档案。
 */
async function composeSummary(fs, root, maxEntries, maxBytes) {
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
      out.push(`# 画像档案（${counts.user} 用户 / ${counts.product} 产品 / ${counts.person} 人物）`)
      for (const item of personas) {
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
 * 记忆书写规范（启动注入的「写」那一半，见 ADR-0010）。
 * 让 DSH 里的 AI 会话像记忆管家一样主动沉淀记忆——这原本是 jinji preset
 * 用技能文件承载的能力，preset 移除后由插件自己用 systemPrompt 上下文接管。
 * __MEMORY_ROOT__ 会在注入时替换成实际解析出的记忆根目录。
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

export function apply(ctx, config = {}) {
  const root = typeof config.root === 'string' && config.root ? config.root : DEFAULT_ROOT
  const maxEntries = typeof config.maxEntries === 'number' && config.maxEntries > 0 ? config.maxEntries : 20
  const maxBytes = typeof config.maxBytes === 'number' && config.maxBytes > 0 ? config.maxBytes : 60000
  const startupEnabled = config.startupContext !== false

  // ── 启动时的记忆摘要注入（见 ADR-0009） ──────────────────────────────
  // systemPrompt 的上下文提供器是同步的，而 fs 服务是异步的：
  // 所以在 agent/session-start 事件里异步预计算快照（按 agent 缓存一次），
  // 提供器只同步返回缓存。若首个请求前预计算未完成，该次请求暂无摘要，
  // 后续组装会自动取到。
  const summaryCache = new WeakMap() // agent -> { text, root }
  if (startupEnabled) {
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
          const text = await composeSummary(ctx.fs, snapshotRoot, maxEntries, maxBytes)
          summaryCache.set(agent, { text, root: snapshotRoot })
        } catch {
          summaryCache.set(agent, { text: '', root: snapshotRoot })
        }
      })()
    })
    ctx.inject(['systemPrompt'], (scope) => {
      // 读：记忆摘要快照（见 ADR-0009）
      scope.systemPrompt.context({
        name: 'jinji:memory-summary',
        order: 130,
        text: (assembleCtx) => {
          const agent = assembleCtx && assembleCtx.agent
          if (agent === undefined) return ''
          const entry = summaryCache.get(agent)
          return entry ? entry.text : ''
        },
      })
      // 写：记忆书写规范（见 ADR-0010）
      scope.systemPrompt.context({
        name: 'jinji:memory-protocol',
        order: 135,
        text: (assembleCtx) => {
          const agent = assembleCtx && assembleCtx.agent
          if (agent === undefined) return ''
          const entry = summaryCache.get(agent)
          const memRoot = entry && entry.root ? entry.root : '（会话工作目录）'
          return WRITE_PROTOCOL.replace('__MEMORY_ROOT__', memRoot)
        },
      })
    })
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/jinji-memory',
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, reason: 'method-not-allowed' })
        const url = new URL(req.url, 'http://localhost')
        const action = url.searchParams.get('action')
        if (action === 'read') {
          const rel = url.searchParams.get('rel') || ''
          const text = await readDoc(ctx.fs, root, rel)
          return sendJson(res, 200, { ok: true, rel, text })
        }
        const index = await buildIndex(ctx.fs, root)
        return sendJson(res, 200, index)
      } catch (error) {
        return sendJson(res, 500, { ok: false, reason: String((error && error.message) || error) })
      }
    },
  }), 'jinji-memory route')
}
