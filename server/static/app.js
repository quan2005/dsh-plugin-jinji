/* 谨迹书房 · 只读 LLM Wiki 阅读器 */
(() => {
'use strict'

const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const enc = encodeURIComponent
// Markdown URL 可同时包含编码片段与字面量 %，不能让一条路径中断整页渲染。
const dec = s => { try { return decodeURIComponent(s.replace(/%(?![0-9a-f]{2})/gi, '%25')) } catch { return s } }
const rawUrl = p => '/raw/' + p.split('/').map(enc).join('/')
const store = {
  get(k, d) { try { const v = localStorage.getItem('jinji.' + k); return v == null ? d : JSON.parse(v) } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem('jinji.' + k, JSON.stringify(v)) } catch (e) {} },
}

// 无 hash 的重新打开恢复上次位置；显式 #/ 始终表示用户要回首页。
const embedParams = new URLSearchParams(location.search)
const dshOrigin = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(embedParams.get('dshOrigin') || '')
  && window.parent !== window ? embedParams.get('dshOrigin') : null
// 新目录是破坏性更新：不读取旧路径、滚动位置或筛选缓存。
const viewKey = 'reader:v2:' + (dshOrigin ? dshOrigin + ':' + (embedParams.get('view') || 'panel') : 'standalone')
const savedView = store.get(viewKey, {})
if (!location.hash && typeof savedView.hash === 'string' && savedView.hash.startsWith('#/')) {
  history.replaceState(null, '', location.pathname + location.search + savedView.hash)
}
let renderedHash = location.hash || '#/'
let restoringView = false
let renderVersion = 0
let viewReady = false
function saveReadingState() {
  if (!viewReady || restoringView || !S.idx) return
  const previous = store.get(viewKey, {})
  const positions = { ...(previous.positions || {}) }
  let frame
  try { const w = $('#frame')?.contentWindow; if (w) frame = { x: w.scrollX, y: w.scrollY } } catch {}
  positions[renderedHash] = { main: $('#scroller')?.scrollTop || 0, side: $('#side-list')?.scrollTop || 0, frame }
  const keys = Object.keys(positions)
  while (keys.length > 60) delete positions[keys.shift()]
  store.set(viewKey, { hash: renderedHash, filter: S.filter, positions })
}
document.addEventListener('scroll', e => {
  if (e.target?.id === 'scroller' || e.target?.id === 'side-list') saveReadingState()
}, true)
window.addEventListener('pagehide', saveReadingState)
document.addEventListener('visibilitychange', () => { if (document.hidden) saveReadingState() })

const parentCitations = new Map()
window.addEventListener('message', e => {
  if (!dshOrigin || e.origin !== dshOrigin || e.source !== window.parent || e.data?.type !== 'jinji:cite-result') return
  const pending = parentCitations.get(e.data.id)
  if (!pending) return
  parentCitations.delete(e.data.id); clearTimeout(pending.timer); pending.resolve(e.data)
})
function citeViaParent(abs) {
  saveReadingState() // DSH 收到引用会切回对话并卸载书房，先同步保存阅读位置。
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { parentCitations.delete(id); reject(new Error('DSH 未确认回填，请刷新 DSH 页面后重试')) }, 5000)
    parentCitations.set(id, { resolve, timer })
    window.parent.postMessage({ type: 'jinji:cite', id, abs }, dshOrigin)
  })
}

if (dshOrigin) document.documentElement.classList.add('embedded') // 为 DSH 右上角关闭按钮留位置。
const ICON = {
  cite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h4v4c0 3-1.5 5-4 6"/><path d="M15 7h4v4c0 3-1.5 5-4 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  side: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>',
  wide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="m7 8-4 4 4 4"/><path d="m17 8 4 4-4 4"/></svg>',
  narrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h7M14 12h7"/><path d="m7 8 4 4-4 4"/><path d="m17 8-4 4 4 4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  starOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
}

const S = {
  idx: null,
  route: { cat: null, mode: 'home' },
  doc: null,
  bridge: false,
  shelfStatus: store.get('shelfStatus', 'all'),
  filter: savedView.filter && typeof savedView.filter === 'object' ? savedView.filter : {},
}

/* ---------------------------------------------------------------- utils */
const catById = id => S.idx?.categories.find(c => c.id === id)
const catVar = id => `--cat: var(--c-${id || 'experts'}, var(--c-accent))` // 自定义分类没有专属色时用强调色
function timeAgo(t) {
  const d = Date.now() / 1000 - t
  if (d < 60) return '刚刚'
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前'
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前'
  if (d < 86400 * 7) return Math.floor(d / 86400) + ' 天前'
  const x = new Date(t * 1000)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'
function hashHue(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h % 360 }
function firstChar(s) { const m = String(s).replace(/^[\s\W_]+/u, ''); return [...(m || s || '·')][0] }
async function api(path) {
  const r = await fetch(path, { cache: 'no-store' })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText)
  return r.json()
}
function pathCat(path) {
  if (!S.idx) return null
  for (const [cid, lst] of Object.entries(S.idx.items)) if (lst.some(x => x.path === path || x.entry === path || x.variants?.html === path)) return cid
  if (path.startsWith('identity/')) return path.split('/').pop().startsWith('product-') ? 'products' : 'people'
  if (path.includes('/skills/')) return 'experts'
  const dated = path.match(/^\d{2}(?:0[1-9]|1[0-2])\/\d{2}-([^/]+)(\/|$)/)
  if (dated) {
    if (!dated[2]) return 'journal'
    return 'journal' // 成品仅从日志链接打开，不再按目录名归入专题入口。
  }
  return null
}
function joinPath(base, rel) {
  const absolute = base.startsWith('/')
  const parts = base.split('/').filter(Boolean)
  parts.pop()
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop(); else parts.push(seg)
  }
  return (absolute ? '/' : '') + parts.join('/')
}

/* ---------------------------------------------------------------- toast & cite */
let toastTimer
function toast(html, ms = 2600) {
  const t = $('#toast')
  t.innerHTML = html
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), ms)
}
function mention(path) { return '@' + (/\s/.test(path) ? `"${path}"` : path) }
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove(); return ok
  }
}
async function cite(path, btn) {
  if (!path) return
  try {
    const r = await fetch('/api/cite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, ...(dshOrigin ? { delivery: 'parent' } : {}) }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error)
    if (dshOrigin) {
      const result = await citeViaParent(j.item.abs)
      if (!result.ok) {
        const reasons = { 'no-session': '请先选择一个对话，再引用文档', busy: '输入框暂时不可编辑，请稍后重试', 'invalid-path': '文档路径无法转换为引用', unavailable: 'DSH 输入框不可用，请刷新 DSH 页面后重试', 'session-changed': '当前对话已改变，本次引用未继续写入', 'not-confirmed': '未确认引用已显示，请检查草稿后再决定是否重试' }
        throw new Error(reasons[result.reason] || 'DSH 未能回填引用')
      }
      S.bridge = true; paintBridge()
      toast(`<span>已回填到当前对话输入框</span><code>${esc(result.mention || mention(path))}</code>`)
    } else if (j.bridge) {
      S.bridge = true; paintBridge()
      toast(`<span>已加入引用队列，等待会话接收</span><code>${esc(mention(path))}</code>`)
    } else {
      await copyText(mention(path))
      toast(`<span>书房插件未连接，已复制</span><code>${esc(mention(path))}</code><span>到剪贴板</span>`, 4200)
    }
    if (btn) { btn.classList.add('done'); setTimeout(() => btn.classList.remove('done'), 1200) }
  } catch (e) {
    toast('引用失败：' + esc(e.message))
  }
}
/* 专家改名：只改 SKILL.md 的 metadata.name（显示名），skill 的调用名不变 */
function renameBtn(e, cls = '') {
  if (e.skill_info?.writable === false) return ''
  return `<button class="btn ${cls}" data-act="rename-expert" data-id="${esc(e.id)}" title="改显示名：写入 SKILL.md 的 metadata.name，skill 调用名 ${esc(e.id)} 不变">改名</button>`
}
function startRename(btn) {
  const id = btn.dataset.id
  const scope = btn.closest('.card, .doc-head') || document
  const el = scope.querySelector(`[data-name-for="${CSS.escape(id)}"]`)
  if (!el || el.querySelector('input')) return
  const old = el.textContent
  el.innerHTML = `<input class="rename-input" value="${esc(old)}" maxlength="40" spellcheck="false">`
  const inp = el.querySelector('input')
  inp.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation() })
  inp.focus(); inp.select()
  let done = false
  const finish = async save => {
    if (done) return
    done = true
    const name = inp.value.trim()
    if (!save || !name || name === old) { el.textContent = old; return }
    el.textContent = name
    try {
      const r = await fetch('/api/rename-expert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      toast(`已改名为 <code>${esc(j.name)}</code>`)
      S.idx = await api('/api/index?refresh=1')
      renderSide(); renderMain()
    } catch (err) {
      el.textContent = old
      toast('改名失败：' + esc(err.message), 4200)
    }
  }
  inp.addEventListener('keydown', ev => {
    ev.stopPropagation()
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true) }
    else if (ev.key === 'Escape') { ev.preventDefault(); finish(false) }
  })
  inp.addEventListener('blur', () => finish(true))
}

// 标为专家：第一次点按钮变成「确认？」，3 秒内再点才写入 SKILL.md
async function markExpert(btn) {
  const id = btn.dataset.id
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed'); btn.textContent = '确认标为专家？'
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.classList.remove('armed'); btn.textContent = '标为专家' }, 3000)
    return
  }
  clearTimeout(btn._t); btn.disabled = true; btn.textContent = '写入中…'
  try {
    const r = await fetch('/api/mark-expert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error)
    toast(`已把 <code>${esc(id)}</code> 标为专家，可在 SKILL.md 里补 type、domains、triggers`, 4200)
    S.idx = await api('/api/index?refresh=1')
    renderSide(); renderMain()
  } catch (err) {
    toast('标记失败：' + esc(err.message), 4200)
    btn.disabled = false; btn.classList.remove('armed'); btn.textContent = '标为专家'
  }
}
// 折叠区（工具技能、归档）：默认收起，展开状态按 key 记在本机
const foldOpen = key => store.get('fold:' + key, false)
document.addEventListener('toggle', e => { const k = e.target.dataset?.fold; if (k) store.set('fold:' + k, e.target.open) }, true)
function foldSection(key, title, note, inner) {
  return `<details class="section fold" data-fold="${esc(key)}" ${foldOpen(key) ? 'open' : ''}><summary class="section-h">${title} <small>${note}</small></summary>${inner}</details>`
}

/* 归档：只记在书房归档文件里，不改原文件；归档后进入各入口底部的「归档」折叠区 */
const ARCH_KINDS = new Set(['docs', 'portrait', 'timeline'])
function archItem(path) {
  for (const c of S.idx.categories) {
    if (!ARCH_KINDS.has(c.kind)) continue
    const x = (S.idx.items[c.id] || []).find(i => i.path === path || i.variants?.html === path)
    if (x) return x
  }
  return null
}
function archBtn(path, cls = 'sm') {
  const x = archItem(path)
  if (!x) return ''
  return `<button class="btn arch ${cls} ${x.archived ? 'on' : ''}" data-act="archive" data-path="${esc(path)}" title="${x.archived ? '移出归档，恢复默认显示' : '归档：不再默认显示，收进底部「归档」'}">${x.archived ? '取消归档' : '归档'}</button>`
}
/* 先在本地改状态并立即重绘（乐观更新），再写服务端；失败时回滚。不重新下载整个索引。 */
function applyArchiveLocal(path, archived) {
  for (const c of S.idx.categories) {
    if (!ARCH_KINDS.has(c.kind)) continue
    const lst = S.idx.items[c.id] || []
    for (const x of lst) if (x.path === path) x.archived = archived
    const active = lst.filter(x => !x.archived).length
    c.count = active; c.archived = lst.length - active
  }
  const recent = new Map()
  for (const [cid, lst] of Object.entries(S.idx.items)) {
    for (const x of lst) if (!x.archived && !recent.has(x.path)) recent.set(x.path, { path: x.path, title: x.title, cat: cid, mtime: x.mtime })
  }
  S.idx.recent = [...recent.values()].sort((a, b) => b.mtime - a.mtime).slice(0, 24)
}
function repaintAfterArchive(path) {
  renderRail()
  const cat = catById(S.route.cat)
  if (cat) {
    const list = $('#side-list'), top = list?.scrollTop
    $('#side .count') && ($('#side .count').textContent = cat.count)
    paintSideList(cat)
    if (list) list.scrollTop = top
  }
  if (S.route.mode === 'home' || S.route.mode === 'overview') { const sc = $('#scroller')?.scrollTop; renderMain(); if (sc) $('#scroller').scrollTop = sc }
  else $$('[data-act="archive"]').forEach(b => { if (b.dataset.path === path) b.outerHTML = archBtn(path, b.classList.contains('sm') ? 'sm' : '') })
}
const archivePending = new Map()
async function toggleArchive(btn) {
  const x = archItem(btn.dataset.path)
  if (!x) return
  const path = x.path // HTML 视图归档到同名 Markdown 日志。
  const to = !x.archived
  const seq = (archivePending.get(path) || 0) + 1
  archivePending.set(path, seq)
  applyArchiveLocal(path, to)
  repaintAfterArchive(path)
  toast(to ? `已归档 <code>${esc(x.display || x.title)}</code>，可在底部「归档」里找回` : `已取消归档 <code>${esc(x.display || x.title)}</code>`)
  try {
    const r = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, archived: to }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error)
    if (archivePending.get(path) === seq && j.version) S.idx.version = j.version
  } catch (err) {
    if (archivePending.get(path) !== seq) return // 已有更新的点击，以最后一次为准。
    applyArchiveLocal(path, !to)
    repaintAfterArchive(path)
    toast('归档失败，已恢复：' + esc(err.message), 4200)
  }
}
/* 收藏：任何能在书房打开的文件都可收藏，记在库外 favorites.json，不改原文件；首页「我的收藏」列出。
   与归档一样先本地更新再写服务端，失败回滚。 */
const favKey = path => archItem(path)?.path || path // 同名 HTML 视图收藏到 Markdown 日志。
const isFav = path => !!path && (S.idx?.favorites || []).some(f => f.path === favKey(path))
function favBtn(path, cls = 'sm') {
  if (!path) return ''
  const on = isFav(path)
  const label = cls.includes('icon') ? '' : on ? '已收藏' : '收藏'
  return `<button class="btn fav ${cls} ${on ? 'on' : ''}" data-act="favorite" data-path="${esc(path)}" aria-pressed="${on}" title="${on ? '取消收藏' : '收藏：显示在首页「我的收藏」'}（s）">${on ? ICON.starOn : ICON.star}${label}</button>`
}
function favTitle(path) {
  const key = favKey(path)
  for (const [cid, lst] of Object.entries(S.idx.items)) { const x = lst.find(i => i.path === key); if (x) return { cat: cid, title: x.display || x.title } }
  const e = S.idx.experts.experts.find(x => x.skill_info.path === key)
  if (e) return { cat: 'experts', title: e.name }
  const k = (S.idx.experts.skills || []).find(x => x.path === key)
  if (k) return { cat: 'experts', title: k.id }
  return { cat: null, title: S.doc?.path === key || S.doc?.viewPath === path ? S.doc.title : key.split('/').pop() }
}
function favHref(f) {
  const e = S.idx.experts.experts.find(x => x.skill_info.path === f.path)
  if (e) return href({ mode: 'expert', cat: 'experts', id: e.id })
  const k = (S.idx.experts.skills || []).find(x => x.path === f.path)
  if (k) return href({ mode: 'skill', cat: 'experts', id: k.id })
  if (f.cat === 'shelf') return href({ mode: 'book', cat: 'shelf', path: f.path })
  return docHref(f.path, f.cat)
}
function repaintFavorites() {
  $$('[data-act="favorite"]').forEach(b => { b.outerHTML = favBtn(b.dataset.path, [...b.classList].filter(c => c === 'sm' || c === 'icon').join(' ')) })
  $$('#side-list .row').forEach(r => r.classList.toggle('faved', isFav(r.dataset.path)))
  if (S.route.mode === 'home') { const sc = $('#scroller')?.scrollTop; renderMain(); if (sc) $('#scroller').scrollTop = sc }
}
const favoritePending = new Map()
async function toggleFavorite(btn) {
  const path = favKey(btn.dataset.path)
  const to = !isFav(path)
  const before = S.idx.favorites || []
  const seq = (favoritePending.get(path) || 0) + 1
  favoritePending.set(path, seq)
  const { cat, title } = favTitle(path)
  S.idx.favorites = to ? [{ path, title, cat, at: Date.now() / 1000 }, ...before.filter(f => f.path !== path)] : before.filter(f => f.path !== path)
  repaintFavorites()
  toast(to ? `已收藏 <code>${esc(title)}</code>，可在首页「我的收藏」找到` : `已取消收藏 <code>${esc(title)}</code>`)
  try {
    const r = await fetch('/api/favorite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, favorite: to }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error)
    if (favoritePending.get(path) !== seq) return
    if (j.favorites) S.idx.favorites = j.favorites
    if (j.version) S.idx.version = j.version
    if (S.route.mode === 'home') repaintFavorites()
  } catch (err) {
    if (favoritePending.get(path) !== seq) return // 已有更新的点击，以最后一次为准。
    S.idx.favorites = to ? (S.idx.favorites || []).filter(f => f.path !== path) : [before.find(f => f.path === path), ...(S.idx.favorites || [])].filter(Boolean).sort((a, b) => b.at - a.at)
    repaintFavorites()
    toast('收藏失败，已恢复：' + esc(err.message), 4200)
  }
}
function paintBridge() {
  const d = $('#bridge-dot')
  if (d) {
    d.classList.toggle('on', !!dshOrigin || S.bridge)
    d.title = dshOrigin ? 'DSH 内嵌书房：引用后等待当前对话输入框确认' : S.bridge ? '引用桥在线：引用会排队交给会话' : '引用桥未连接：引用会复制到剪贴板'
  }
}

/* ---------------------------------------------------------------- routing */
// #/  #/c/<cat>  #/c/<cat>/doc/<path>[::anchor]  #/c/shelf/book/<card>  #/c/shelf/read/<card>  #/c/experts/e/<id>  #/c/experts/s/<id>
function parseHash() {
  const h = dec(location.hash.replace(/^#\/?/, ''))
  if (!h) return { mode: 'home', cat: null }
  const m = h.match(/^c\/([^/]+)(?:\/(doc|book|read|e|s)\/(.+))?$/)
  if (!m) return { mode: 'home', cat: null }
  const [, cat, mode, rest] = m
  if (!mode) return { mode: 'overview', cat }
  if (mode === 'e') return { mode: 'expert', cat, id: rest }
  if (mode === 's') return { mode: 'skill', cat, id: rest }
  const [path, anchor] = rest.split('::')
  return { mode, cat, path, anchor }
}
function href(r) {
  if (r.mode === 'home') return '#/'
  if (r.mode === 'overview') return `#/c/${r.cat}`
  if (r.mode === 'expert') return `#/c/${r.cat}/e/${enc(r.id)}`
  if (r.mode === 'skill') return `#/c/${r.cat}/s/${enc(r.id)}`
  return `#/c/${r.cat}/${r.mode}/${enc(r.path)}${r.anchor ? enc('::' + r.anchor) : ''}`
}
const docHref = (path, cat, anchor) => href({ mode: 'doc', cat: cat || pathCat(path) || S.route.cat || 'journal', path, anchor })
function go(r) { location.hash = href(r) }

window.addEventListener('hashchange', () => route())
async function route() {
  if (!S.idx) return
  saveReadingState()
  const version = ++renderVersion
  let r = parseHash()
  if (r.cat && !catById(r.cat)) {
    r = { mode: 'home', cat: null }
    history.replaceState(null, '', location.pathname + location.search + '#/')
  }
  renderedHash = location.hash || '#/'
  const position = store.get(viewKey, {}).positions?.[renderedHash]
  restoringView = true
  const prev = S.route
  S.route = r
  if (r.mode === 'doc' && r.path) pushHistory(r)
  const app = $('#app')
  app.dataset.view = r.mode === 'home' ? 'home' : 'cat'
  app.classList.toggle('focus', r.mode === 'read' || (r.mode === 'doc' && store.get('focus', false) && /\.html?$/.test(r.path || '')))
  app.classList.remove('side-open')
  app.style.cssText = catVar(r.cat)
  renderRail()
  if (r.cat !== prev.cat || !$('#side .side-list')) renderSide()
  else markActive()
  await renderMain()
  if (version !== renderVersion) return
  if (position) {
    if ($('#scroller')) $('#scroller').scrollTop = position.main || 0
    if ($('#side-list')) $('#side-list').scrollTop = position.side || 0
  }
  const frame = $('#frame')
  if (frame) {
    const bindFrame = () => {
      try {
        if (position?.frame) frame.contentWindow.scrollTo(position.frame.x || 0, position.frame.y || 0)
        frame.contentWindow.addEventListener('scroll', saveReadingState, { passive: true })
      } catch {} // 浏览器内置 PDF 查看器可能不开放滚动状态。
    }
    frame.addEventListener('load', bindFrame)
    bindFrame()
  }
  restoringView = false
  viewReady = true
  saveReadingState()
}

/* ---------------------------------------------------------------- rail */
function renderRail() {
  const cats = S.idx.categories
  $('#rail').innerHTML = `
    <a class="brand" href="#/" title="书房首页（0）"><span class="seal">谨</span></a>
    ${cats.map((c, i) => `<a class="rail-item ${S.route.cat === c.id ? 'active' : ''}" style="${catVar(c.id)}" href="#/c/${c.id}" title="${esc(c.name)}（${i + 1}）">
      <span class="seal">${esc(c.glyph)}</span><span>${esc(c.name)}</span></a>`).join('')}
    <div class="spacer"></div>
    <button class="rail-tool" data-act="search" title="搜索（/ 或 ⌘K）">${ICON.search}</button>
    <button class="rail-tool" data-act="side" title="收起/展开列表（[）">${ICON.side}</button>
    ${hostThemed ? '' : `<button class="rail-tool" data-act="theme" title="宣纸/墨（t）">${ICON.theme}</button>`}
    <button class="rail-tool" data-act="refresh" title="重新索引（r）">${ICON.refresh}</button>
    <span class="bridge-dot" id="bridge-dot"></span>`
  paintBridge()
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]')
  if (!a) return
  const act = a.dataset.act
  if (act === 'search') openPalette()
  else if (act === 'side') toggleSide()
  else if (act === 'theme') toggleTheme()
  else if (act === 'refresh') refreshIndex(true)
  else if (act === 'cite') { e.preventDefault(); e.stopPropagation(); cite(a.dataset.path, a) }
  else if (act === 'copy') { e.preventDefault(); copyText(a.dataset.text).then(() => toast('已复制 <code>' + esc(a.dataset.text) + '</code>')) }
  else if (act === 'fold') { const k = a.dataset.fold; store.set('fold:' + k, !foldOpen(k)); paintSideList(catById(S.route.cat)) }
  else if (act === 'archive') { e.preventDefault(); e.stopPropagation(); toggleArchive(a) }
  else if (act === 'favorite') { e.preventDefault(); e.stopPropagation(); toggleFavorite(a) }
  else if (act === 'rename-expert') { e.preventDefault(); e.stopPropagation(); startRename(a) }
  else if (act === 'mark-expert') { e.preventDefault(); e.stopPropagation(); markExpert(a) }
  else if (act === 'doc-view') { e.preventDefault(); renderDoc($('#main'), catById(S.route.cat), S.route.path, S.route.anchor, a.dataset.view) }
  else if (act === 'focus') toggleFocus()
  else if (act === 'wide') toggleWide()
  else if (act === 'status') { S.shelfStatus = a.dataset.v; store.set('shelfStatus', S.shelfStatus); renderMain() }
  else if (act === 'month') { const el = document.getElementById('m-' + a.dataset.v); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
})
function toggleSide() {
  const app = $('#app')
  if (matchMedia('(max-width: 1100px)').matches) app.classList.toggle('side-open')
  else { app.classList.toggle('side-collapsed'); store.set('sideCollapsed', app.classList.contains('side-collapsed')) }
}
/* 主题：书房的实际深浅 = 宿主（DSH）传入 > 本机选择 > 系统。内嵌 HTML 一律跟随书房。 */
const hostThemed = document.documentElement.dataset.themeHost === '1'
const systemDark = matchMedia('(prefers-color-scheme: dark)')
function currentScheme() {
  const t = document.documentElement.dataset.theme
  return t === 'dark' || t === 'light' ? t : systemDark.matches ? 'dark' : 'light'
}
window.__jinjiScheme = currentScheme
function pushSchemeToFrames() {
  const scheme = currentScheme()
  for (const frame of $$('iframe')) {
    try { frame.contentWindow.__jinjiTheme?.(scheme) } catch {} // 跨域页面无法跟随，保持原样。
  }
}
function setScheme(scheme, persist) {
  document.documentElement.dataset.theme = scheme
  if (persist) store.set('theme', scheme) // 写入 jinji.theme（JSON），index.html 首屏读取同一键。
  pushSchemeToFrames()
}
systemDark.addEventListener('change', () => { if (!document.documentElement.dataset.theme) pushSchemeToFrames() })
window.addEventListener('message', e => {
  if (!dshOrigin || e.origin !== dshOrigin || e.source !== window.parent || e.data?.type !== 'jinji:theme') return
  if (e.data.scheme === 'dark' || e.data.scheme === 'light') setScheme(e.data.scheme, false)
})
function toggleTheme() {
  if (hostThemed) { toast('书房跟随 DSH 主题；请在 DSH 设置里切换深浅色'); return }
  setScheme(currentScheme() === 'dark' ? 'light' : 'dark', true)
}
/* 宽屏：所有详情页共用一个开关，记在本机；正文不再限制行宽，铺满主区。 */
function wideBtn(cls = '') {
  const on = $('#app').classList.contains('wide-read')
  return `<button class="btn wide-btn ${cls} ${on ? 'on' : ''}" data-act="wide" aria-pressed="${on}" title="${on ? '恢复阅读宽度' : '宽屏显示：正文铺满'}（w）">${on ? ICON.narrow : ICON.wide}${cls.includes('sm') ? '' : on ? '标准' : '宽屏'}</button>`
}
function toggleWide() {
  const app = $('#app')
  app.classList.toggle('wide-read')
  store.set('wide', app.classList.contains('wide-read'))
  $$('[data-act="wide"]').forEach(b => { b.outerHTML = wideBtn(b.classList.contains('sm') ? 'sm' : '') })
}
function toggleFocus() {
  const app = $('#app')
  app.classList.toggle('focus')
  store.set('focus', app.classList.contains('focus'))
}

/* ---------------------------------------------------------------- side list */
function sideRows(cat) {
  const all = S.idx.items[cat.id] || []
  const items = all.filter(x => !x.archived)
  const groups = new Map()
  const add = (g, row) => { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(row) }
  if (cat.kind === 'timeline') {
    for (const x of items) add(x.month, { path: x.path, title: x.title, meta: x.kind || x.ext, day: x.date.slice(8) || '·', ext: x.ext, href: docHref(x.path, cat.id) })
  } else if (cat.kind === 'shelf') {
    for (const b of items) add(b.category, { path: b.path, title: b.title, meta: [b.author, statusName(b.status)].filter(Boolean).join(' · '), href: href({ mode: 'book', cat: 'shelf', path: b.path }) })
  } else if (cat.kind === 'portrait') {
    for (const x of items) add(x.group || '全部', { path: x.path, title: x.display || x.title, meta: x.summary, dim: x.archived, href: docHref(x.path, cat.id) })
  } else if (cat.kind === 'experts') {
    const ex = S.idx.experts
    for (const e of ex.experts) {
      const meta = (e.triggers || []).join(' / ') || [e.type, e.familiarity].filter(Boolean).join(' · ')
      add('专家', { key: 'e:' + e.id, title: e.name, meta, metaTitle: meta, path: e.skill_info.path, href: href({ mode: 'expert', cat: 'experts', id: e.id }) })
    }
    for (const k of ex.skills || []) {
      add('其他技能', { key: 's:' + k.id, title: k.id, meta: k.description, metaTitle: k.description, path: k.path, href: href({ mode: 'skill', cat: 'experts', id: k.id }) })
    }
  } else {
    for (const x of items) add(x.group || '主线', { path: x.path, title: x.title, meta: x.name, ext: x.ext, href: docHref(x.path, cat.id) })
  }
  if (ARCH_KINDS.has(cat.kind)) {
    for (const x of all.filter(x => x.archived)) add('归档', { path: x.path, title: x.display || x.title, meta: x.month || x.group || x.name, dim: true, href: docHref(x.path, cat.id) })
  }
  return groups
}
function renderSide() {
  const cat = catById(S.route.cat)
  const side = $('#side')
  if (!cat) { side.innerHTML = ''; return }
  side.style.cssText = catVar(cat.id)
  const f = S.filter[cat.id] || ''
  side.innerHTML = `
    <div class="side-head">
      <h2 class="side-title" onclick="location.hash='#/c/${cat.id}'"><span class="seal">${esc(cat.glyph)}</span>${esc(cat.name)}<span class="count">${cat.count}</span></h2>
      <input class="filter" id="side-filter" placeholder="筛选${esc(cat.name)}…" value="${esc(f)}" spellcheck="false">
    </div>
    <div class="side-list scroll" id="side-list"></div>`
  $('#side-filter').addEventListener('input', e => { S.filter[cat.id] = e.target.value; paintSideList(cat); saveReadingState() })
  paintSideList(cat)
}
function paintSideList(cat) {
  const q = (S.filter[cat.id] || '').trim().toLowerCase()
  const groups = sideRows(cat)
  let html = '', n = 0
  for (const [g, rows] of groups) {
    const vis = q ? rows.filter(r => (r.title + ' ' + (r.meta || '') + ' ' + (r.path || '')).toLowerCase().includes(q)) : rows
    if (!vis.length) continue
    n += vis.length
    const label = cat.kind === 'timeline' ? g.replace('-', ' · ') : g
    // 「工具技能」与「归档」默认折叠；筛选时自动展开
    const foldable = g === '归档'
    const fkey = cat.id + ':' + g
    const folded = foldable && !q && !foldOpen(fkey)
    html += `<div class="side-group ${folded ? 'folded' : ''}"><h4 ${foldable ? `class="fold-h" data-act="fold" data-fold="${esc(fkey)}"` : ''}><span>${foldable ? (folded ? '▸ ' : '▾ ') : ''}${esc(label)}</span><span>${vis.length}</span></h4>
      ${vis.map(r => `<a class="row ${r.dim ? 'dim' : ''} ${isFav(r.path) ? 'faved' : ''}" href="${r.href}" data-key="${esc(r.key || r.path || '')}" data-path="${esc(r.path || '')}">
        ${r.day ? `<span class="day">${esc(r.day)}</span>` : ''}
        <span class="main-col"><span class="t"><i class="fav-mark" title="已收藏">${ICON.starOn}</i>${esc(r.title)}</span>${r.meta ? `<span class="m"${r.metaTitle ? ` title="${esc(r.metaTitle)}"` : ''}>${esc(r.meta)}</span>` : ''}</span>
        ${r.path ? `<button class="cite-mini" data-act="cite" data-path="${esc(r.path)}" title="引用到会话">引用</button>` : ''}
      </a>`).join('')}</div>`
  }
  $('#side-list').innerHTML = html || `<div class="side-empty">${q ? '没有匹配的条目' : '这里还空着'}</div>`
  markActive()
}
function markActive() {
  const r = S.route
  const key = r.mode === 'expert' ? 'e:' + r.id : r.mode === 'skill' ? 's:' + r.id : r.path
  $$('#side-list .row').forEach(a => a.classList.toggle('active', !!key && a.dataset.key === key))
  const on = $('#side-list .row.active')
  if (on) { const box = $('#side-list').getBoundingClientRect(), b = on.getBoundingClientRect(); if (b.top < box.top || b.bottom > box.bottom) on.scrollIntoView({ block: 'center' }) }
}

/* ---------------------------------------------------------------- main */
function renderMain() {
  const r = S.route
  const main = $('#main')
  main.scrollTop = 0
  S.doc = null
  if (r.mode === 'home') return renderHome(main)
  const cat = catById(r.cat)
  if (!cat) { main.innerHTML = `<div class="err">没有这个分类：${esc(r.cat)}</div>`; return }
  if (r.mode === 'overview') return renderOverview(main, cat)
  if (r.mode === 'doc') return renderDoc(main, cat, r.path, r.anchor)
  if (r.mode === 'book') return renderBook(main, r.path)
  if (r.mode === 'read') return renderRead(main, r.path)
  if (r.mode === 'expert') return renderExpert(main, r.id)
  if (r.mode === 'skill') return renderSkill(main, r.id)
}

/* 首页 */
function renderHome(main) {
  const idx = S.idx
  const d = new Date()
  const week = '日一二三四五六'[d.getDay()]
  const hist = store.get('history:v2', []).slice(0, 8)
  const featured = idx.categories.find(c => c.featured)
  const latest = cid => {
    if (cid === 'experts') return idx.experts.experts.slice(0, 3).map(e => e.name)
    const lst = (idx.items[cid] || []).filter(x => !x.archived).sort((a, b) => b.mtime - a.mtime)
    return lst.slice(0, 3).map(x => x.display || x.title)
  }
  main.innerHTML = `<div class="view scroll" id="scroller"><div class="pad wide">
    <header class="home-head">
      <div><h1><span class="seal">谨</span>谨迹书房</h1>
        <div class="date">${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week} · 只读阅读，内容按 journal 规范维护</div></div>
      <div class="search-trigger" data-act="search">${ICON.search.replace('<svg', '<svg width="18" height="18"')}<span>搜索全部入口的标题与全文</span><kbd>/</kbd></div>
    </header>
    ${favoritesPanel(idx)}
    ${featured ? `<a class="mainline" href="#/c/${featured.id}" style="${catVar(featured.id)}"><span class="seal">${esc(featured.glyph)}</span><div><b>${esc(featured.tagline || featured.name)}</b><br><span>${featured.count} 条日志${featured.tags?.length ? ` · 按 tags 中的「${esc(featured.tags.join('、'))}」精确筛选` : ''}</span></div><span class="go">进入${esc(featured.name)} →</span></a>` : ''}
    <div class="tiles">
      ${idx.categories.map((c, i) => `<a class="tile" href="#/c/${c.id}" style="${catVar(c.id)}" data-glyph="${esc(c.glyph)}">
        <div class="tile-top"><span class="seal">${esc(c.glyph)}</span><h3>${esc(c.name)}</h3><span class="num">${c.count}</span></div>
        <div class="tagline">${esc(c.tagline || '')} · 按 ${i + 1}</div>
        <ul>${latest(c.id).map(t => `<li>${esc(t)}</li>`).join('') || '<li>还没有条目</li>'}</ul>
      </a>`).join('')}
    </div>
    <div class="home-cols">
      <section class="panel"><h2>最近更新 <small>按文件更新时间排列</small></h2>
        ${idx.recent.slice(0, 12).map(x => `<a class="feed-row" style="${catVar(x.cat)}" href="${x.cat === 'shelf' ? href({ mode: 'book', cat: 'shelf', path: x.path }) : docHref(x.path, x.cat)}">
          <span class="seal">${esc(catById(x.cat)?.glyph || '·')}</span><span class="ft">${esc(x.title)}</span><span class="fm">${timeAgo(x.mtime)}</span></a>`).join('')}
      </section>
      <section class="panel"><h2>继续阅读 <small>本机足迹</small></h2>
        ${hist.length ? hist.map(h => `<a class="feed-row" style="${catVar(h.cat)}" href="${href(h)}"><span class="seal">${esc(catById(h.cat)?.glyph || '·')}</span><span class="ft">${esc(h.title || h.path)}</span><span class="fm">${timeAgo(h.at)}</span></a>`).join('') : '<p class="muted" style="font-size:.85rem">打开过的文档会留在这里。</p>'}
      </section>
    </div>
  </div></div>`
}
function favoritesPanel(idx) {
  const favs = idx.favorites || []
  const rows = favs.map(f => {
    const c = catById(f.cat)
    return `<div class="fav-row ${f.missing ? 'missing' : ''}" style="${catVar(f.cat)}">
      <${f.missing ? 'span' : `a href="${favHref(f)}"`} class="fav-link" title="${esc(f.path)}"><span class="seal">${esc(c?.glyph || '·')}</span>
        <span class="fav-tx"><span class="ft">${esc(f.title)}</span><span class="fm">${f.missing ? '文件已不存在，可取消收藏' : esc(c?.name || f.path.split('/').slice(-2, -1)[0] || '文件')} · ${timeAgo(f.at)}收藏</span></span></${f.missing ? 'span' : 'a'}>
      <span class="fav-act">${f.missing ? '' : citeBtn(f.path, '引用', 'sm')}${favBtn(f.path, 'sm icon')}</span></div>`
  }).join('')
  return `<section class="panel favs"><h2>${ICON.starOn}我的收藏 <small>${favs.length ? favs.length + ' 项 · 最近收藏在前' : '本机记录，不改原文件'}</small></h2>
    ${favs.length ? `<div class="fav-grid">${rows}</div>` : '<p class="muted fav-empty">在日志、画像、书卡、专家或技能页点「收藏」（快捷键 s），条目会出现在这里。</p>'}</section>`
}
function pushHistory(r) {
  const h = store.get('history:v2', []).filter(x => x.path !== r.path)
  h.unshift({ mode: r.mode, cat: r.cat, path: r.path, title: '', at: Date.now() / 1000 })
  store.set('history:v2', h.slice(0, 30))
}
function setHistoryTitle(path, title) {
  const h = store.get('history:v2', [])
  const x = h.find(x => x.path === path)
  if (x) { x.title = title; store.set('history:v2', h) }
}

/* 分类总览 */
function ovHead(cat, stats = []) {
  return `<header class="ov-head"><span class="seal">${esc(cat.glyph)}</span>
    <div><h1>${esc(cat.name)}</h1><p>${esc(cat.tagline || '')}</p></div>
    <div class="stat">${stats.map(([n, l]) => `<div><b>${n}</b><span>${esc(l)}</span></div>`).join('')}</div></header>`
}
function citeBtn(path, label = '引用', cls = '') {
  return `<button class="btn cite ${cls}" data-act="cite" data-path="${esc(path)}" title="把 ${esc(mention(path))} 送进会话输入框（c）">${ICON.cite}${label}${cls.includes('sm') ? '' : '<span class="kbd">C</span>'}</button>`
}
function docCard(x, cat) {
  return `<a class="card" href="${docHref(x.path, cat)}">
    <span class="ct">${esc(x.title)}</span><span class="cs">${esc(x.summary || '')}</span>
    <span class="cm"><span class="chip">${esc(x.ext.toUpperCase())}</span><span>${timeAgo(x.mtime)}</span><span>${fmtSize(x.size)}</span></span>
    <span class="cite-btn-sm">${favBtn(x.path, 'sm icon')}${archBtn(x.path)}${citeBtn(x.path, '引用', 'sm')}</span></a>`
}
function archFold(cat, xs, inner) {
  return xs.length ? foldSection(cat.id + ':归档', '归档', `${xs.length} 篇 · 不再默认显示，点开查看`, inner) : ''
}
function renderOverview(main, cat) {
  const k = cat.kind
  let body = ''
  if (k === 'docs') body = ovDocs(cat)
  else if (k === 'portrait') body = ovPortrait(cat)
  else if (k === 'shelf') body = ovShelf(cat)
  else if (k === 'timeline') body = ovTimeline(cat)
  else if (k === 'experts') body = ovExperts(cat)
  main.innerHTML = `<div class="view scroll" id="scroller"><div class="pad wide">${body}</div></div>`
}
function ovDocs(cat) {
  const all = S.idx.items[cat.id]
  const items = all.filter(x => !x.archived)
  const arch = all.filter(x => x.archived)
  return ovHead(cat, [[items.length, '篇文档']]) + `
    <div class="cards">${items.map(x => docCard(x, cat.id)).join('')}</div>
    ${archFold(cat, arch, `<div class="cards">${arch.map(x => docCard(x, cat.id)).join('')}</div>`)}`
}
function personCard(x, cat, g) {
  return `<a class="card person ${g === '我' ? 'me' : ''} ${x.archived ? 'dim' : ''}" href="${docHref(x.path, cat.id)}">
        <span class="seal avatar">${esc(firstChar(x.display || x.title))}</span>
        <span class="body"><span class="ct">${esc(x.display || x.title)}${x.archived && g === null ? ` <span class="muted" style="font-size:.75rem">${esc(x.group || '')}</span>` : ''}</span>
          <span class="cs">${esc(x.summary || '')}</span>
          <span class="cm">${x.tags.slice(0, 3).map(t => `<span class="chip">${esc(t)}</span>`).join('')}<span>${timeAgo(x.mtime)}</span></span></span>
        <span class="cite-btn-sm">${favBtn(x.path, 'sm icon')}${archBtn(x.path)}${citeBtn(x.path, '引用', 'sm')}</span>
      </a>`
}
function ovPortrait(cat) {
  const all = S.idx.items[cat.id]
  const items = all.filter(x => !x.archived)
  const arch = all.filter(x => x.archived)
  const groups = new Map()
  for (const x of items) { const g = x.group || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x) }
  return ovHead(cat, cat.id === 'people' ? [[items.length, '在册'], [arch.length, '归档'], [groups.size, '组织']] : [[items.length, '产品'], [arch.length, '归档']]) +
    [...groups].map(([g, xs]) => `${g ? `<h3 class="group-h">${esc(g)} · ${xs.length}</h3>` : ''}<div class="cards">${xs.map(x => personCard(x, cat, g)).join('')}</div>`).join('') +
    archFold(cat, arch, `<div class="cards">${arch.map(x => personCard(x, cat, null)).join('')}</div>`)
}
const STATUS = { all: '全部', reading: '在读', unread: '未读', read: '已读', paused: '暂放', unknown: '状态待补' }
const statusName = s => STATUS[s] || s
function bookCover(b, big = false) {
  const badge = b.status && b.status !== 'unknown' ? `<span class="chip cat badge">${esc(statusName(b.status))}</span>` : ''
  if (b.cover) return `<div class="cover">${badge}<img src="${rawUrl(b.cover)}" alt="" loading="lazy"></div>`
  const h = hashHue(b.title)
  return `<div class="cover gen" style="background: linear-gradient(160deg, hsl(${h} 32% 34%), hsl(${(h + 30) % 360} 38% 20%))">${badge}
    <span class="gt">${esc(b.title.split(/[·：:（(]/)[0].trim())}</span><span class="ga">${esc(b.author || '')}</span></div>`
}
function bookTile(b) {
  return `<a class="book" href="${href({ mode: 'book', cat: 'shelf', path: b.path })}" style="${catVar('shelf')}">
    <span class="book-fav">${favBtn(b.path, 'sm icon')}</span>${bookCover(b)}<span class="bt">${esc(b.title)}</span><span class="ba">${esc(b.author || '作者未填')}</span></a>`
}
function ovShelf(cat) {
  const all = S.idx.items.shelf
  const st = S.shelfStatus
  const books = st === 'all' ? all : all.filter(b => b.status === st)
  const cats = new Map()
  for (const b of books) { if (!cats.has(b.category)) cats.set(b.category, []); cats.get(b.category).push(b) }
  const count = s => all.filter(b => b.status === s).length
  const empty = `<div class="empty-card"><b>怎样上架一本书</b>（目录约定见 <a href="${docHref('AGENTS.md', 'shelf')}">journal 工作区规范</a>）
    <ol><li>书卡就是一条日志：<code>yyMM/DD-书名.md</code>，frontmatter 写 <code>type: book</code> 等元数据，正文是导读加全书 Markdown；同名 <code>DD-书名.html</code> 是阅读入口。</li>
    <li>原书整包放进同名目录 <code>yyMM/DD-书名/</code>，不改内容；<code>book_source</code> 用书卡相对路径指向入口文件。</li>
    <li>回到这里刷新（r），书就在架上。</li></ol></div>`
  return ovHead(cat, [[all.length, '本书'], [count('reading'), '在读'], [count('read'), '已读']]) + `
    <div class="seg" style="margin-bottom:1.6rem">${Object.entries(STATUS).map(([k, v]) => `<button class="${st === k ? 'on' : ''}" data-act="status" data-v="${k}">${v}${k !== 'all' ? ' ' + count(k) : ''}</button>`).join('')}</div>
    ${books.length ? [...cats].map(([c, bs]) => `<h3 class="group-h">${esc(c)} · ${bs.length}</h3><div class="shelf">${bs.map(bookTile).join('')}</div>`).join('') : ''}
    ${all.length < 6 ? `<section class="section">${empty}</section>` : ''}`
}
/* 时间线标签：frontmatter tags 原样显示在标题后（大写），不经对照表；去掉每篇都有的 journal 和当前入口的筛选标签。
   标签区只占一行，放不下的整枚隐藏，悬停可看全部。 */
function tlTags(x, catId) {
  const hide = new Set(['journal', ...(catById(catId)?.tags || [])])
  const tags = (x.tags || []).filter(t => t && !hide.has(t))
  return tags.length ? `<span class="tl-tags" title="${esc(tags.join(' · '))}">${tags.map(t => `<span class="chip tag">${esc(t)}</span>`).join('')}</span>` : ''
}
function tlRow(x, catId) {
  return `<li onclick="if(!event.target.closest('[data-act]'))location.hash='${docHref(x.path, catId).replace(/'/g, "\\'")}'">
        <span class="d">${esc(x.date.slice(8) || '·')}</span>
        <div><div class="tt"><span class="tn">${esc(x.title)}</span>${x.ext !== 'md' ? `<span class="chip">${esc(x.ext.toUpperCase())}</span>` : ''}${tlTags(x, catId)}</div>
        ${x.summary ? `<div class="ts">${esc(x.summary)}</div>` : ''}</div><span class="tl-act">${favBtn(x.path, 'sm icon')}${archBtn(x.path)}</span></li>`
}
function ovTimeline(cat) {
  const all = S.idx.items[cat.id] || []
  const items = all.filter(x => !x.archived)
  const arch = all.filter(x => x.archived)
  const months = new Map()
  for (const x of items) { if (!months.has(x.month)) months.set(x.month, []); months.get(x.month).push(x) }
  const ms = [...months.keys()].sort()
  const max = Math.max(1, ...[...months.values()].map(v => v.length))
  const kinds = new Set(items.map(x => x.kind).filter(Boolean))
  return ovHead(cat, [[items.length, '条记录'], [months.size, '个月'], [kinds.size, '种类型']]) + `
    <div class="months">${ms.map(m => `<button data-act="month" data-v="${m}" title="${m} · ${months.get(m).length} 条"><span class="bar" style="height:${(months.get(m).length / max * 100).toFixed(0)}%"></span><span class="lbl">${m.slice(2).replace('-', '.')}</span></button>`).join('')}</div>
    ${[...months].map(([m, xs]) => `<section class="month" id="m-${m}"><div class="month-h"><b>${m.slice(0, 4)} · ${m.slice(5)}</b><span>${xs.length} 条</span></div>
      <ul class="tl">${xs.map(x => tlRow(x, cat.id)).join('')}</ul></section>`).join('')}
    ${archFold(cat, arch, `<ul class="tl">${arch.map(x => tlRow(x, cat.id)).join('')}</ul>`)}`
}
function expertCard(e) {
  return `<a class="card expert ready" href="${href({ mode: 'expert', cat: 'experts', id: e.id })}">
    <span class="cite-btn-sm">${favBtn(e.skill_info.path, 'sm icon')}${renameBtn(e, 'sm')}</span>
    <div class="eh"><span class="seal">${esc(firstChar(e.name))}</span><div><div class="en" data-name-for="${esc(e.id)}">${esc(e.name)}</div><div class="ea">${esc(e.alias || e.type || '')}</div></div></div>
    ${(e.triggers || []).length ? `<div class="trig">${esc(e.triggers.join(' / '))}</div>` : ''}
    <div class="cs">${esc(e.skill_info.description)}</div>
  </a>`
}
function skillTile(k) {
  return `<a class="skill-tile" href="${href({ mode: 'skill', cat: 'experts', id: k.id })}">
    <span class="sn">${esc(k.id)}${favBtn(k.path, 'sm icon')}</span><span class="sd" title="${esc(k.description)}">${esc(k.description || '没有描述')}</span>
    <span class="sm">${k.files} 个文件${k.invocable ? '' : ' · 仅模型调用'}</span></a>`
}
function ovExperts(cat) {
  const ex = S.idx.experts
  return `<section class="hero">
      <div class="kicker">专家智库 · 个人专家团</div>
      <h1>认识人物，借用思想</h1>
      <p>这里沉淀的是：我理解了谁的什么方法，它在什么条件下有用，凭什么判断，用过之后有什么变化。人物可以一直加，一次问题只请一到三位。</p>
      <div class="principles">
        <div class="principle"><b><i>一</i>按问题调用</b><span>先说清眼下要做的决定，再选视角；不按名气排座次。</span></div>
        <div class="principle"><b><i>二</i>一主一辅</b><span>一个主视角组织事实，必要时加一个挑战视角，最多三位。</span></div>
        <div class="principle"><b><i>三</i>三层分开</b><span>原观点、诠释、应用推断分开写；缺事实先补事实。</span></div>
        <div class="principle"><b><i>四</i>用过才晋级</b><span>熟悉度只在本人能讲清前提、输入与反例后上调。</span></div>
      </div>
    </section>
    <section class="section"><h2 class="section-h">专家 <small>${ex.experts.length} 位 · 仅收录 <code>~/.agents/skills/</code> 中标了 <code>metadata.kind: 专家</code> 的 skill</small></h2>
      <div class="cards">${ex.experts.map(expertCard).join('')}</div></section>
    ${(ex.skills || []).length ? `<section class="section"><h2 class="section-h">其他技能 <small>${ex.skills.length} 个 · <code>~/.agents/skills/</code> 中未标为专家的 skill，不计入专家数</small></h2>
      <div class="skill-grid">${ex.skills.map(skillTile).join('')}</div></section>` : ''}
    <section class="section"><h2 class="section-h">一次最小调用</h2>
      <ol class="steps"><li>一句话说出眼下要做的决定。</li><li>分开已确认事实、估计、未知和硬约束。</li><li>选一个主视角，必要时加一个挑战视角，按 skill 要求补输入。</li><li>分开写原观点、诠释与应用推断。</li><li>比较至少两种方案，定一个小试验和停止条件。</li><li>回看结果，写进日志，熟悉度逐级上调。</li></ol></section>
    <section class="section"><h2 class="section-h">沉淀新专家 <small>四步，按当前 journal 目录约定保存</small></h2>
      <ol class="steps"><li>用 <b>nuwa</b> 蒸馏人物，产出 skill 放进 <code>~/.agents/skills/</code>。</li><li>在 SKILL.md frontmatter 加 <code>metadata.kind: 专家</code>，再填 type、alias、domains、triggers。</li><li>按需调用：在会话里引用 SKILL.md。</li><li>把用法写进日志，熟悉度逐级上调。</li></ol></section>
    ${ex.experts.length ? '' : '<div class="empty-card">没有符合条件的专家技能。请在全局技能的 SKILL.md 中设置 <code>metadata.kind: 专家</code> 后重新索引。</div>'}`
}

/* ---------------------------------------------------------------- 文档详情 */
function crumbs(cat, extra = []) {
  return `<div class="crumbs"><a href="#/">书房</a><span class="sep">/</span><a href="#/c/${cat.id}">${esc(cat.name)}</a>${extra.map(x => `<span class="sep">/</span><span>${esc(x)}</span>`).join('')}</div>`
}
function docHeader(cat, d, opts = {}) {
  const isHtml = /^html?$/.test(d.ext)
  return `<header class="doc-head">${crumbs(cat, opts.crumbs || [])}
    <div class="doc-title-row"><h1 class="doc-title">${esc(opts.title || d.title)}</h1>
      <div class="actions">
        ${opts.extraActions || ''}
        ${isHtml || d.ext === 'pdf' || opts.framed ? '' : wideBtn()}
        ${favBtn(opts.favPath || d.path, '')}
        ${archBtn(d.path, '')}
        ${citeBtn(d.path)}
        <button class="btn" data-act="copy" data-text="${esc(d.path)}" title="复制路径">${ICON.copy}路径</button>
        <a class="btn" href="${d.raw}" target="_blank" rel="noopener" title="新标签页打开原文件">${ICON.ext}${d.variants ? '打开文件' : '原文'}</a>
        ${isHtml ? `<button class="btn" data-act="focus" title="专注阅读（f）">${ICON.focus}专注</button>` : ''}
      </div></div>
    <div class="doc-meta"><span class="path" data-act="copy" data-text="${esc(d.path)}" title="点击复制">${esc(d.path)}</span><span>·</span><span>${timeAgo(d.mtime)}</span><span>·</span><span>${fmtSize(d.size)}</span>${opts.meta || ''}</div>
  </header>`
}
let docRequest = 0
async function renderDoc(main, cat, path, anchor, requestedView) {
  const request = ++docRequest
  main.innerHTML = '<div class="loading">打开中…</div>'
  let d
  try {
    d = await api('/api/doc?path=' + enc(path))
    if (d.variants && d.path !== d.variants.markdown) {
      requestedView ||= 'html'
      d = await api('/api/doc?path=' + enc(d.variants.markdown))
    }
  } catch (e) {
    if (request !== docRequest || S.route.path !== path) return
    main.innerHTML = `<div class="err">打不开：${esc(path)}<br><small>文件不存在、已移动或不允许访问。本版不重定向旧路径。</small><br><a href="#/c/${cat.id}">返回${esc(cat.name)}</a></div>`; return
  }
  if (request !== docRequest || S.route.path !== path) return
  S.doc = d
  setHistoryTitle(path, d.title)
  document.title = d.title + ' · 谨迹书房'
  const crumbExtra = []
  const item = (S.idx.items[cat.id] || []).find(x => x.path === path)
  if (item?.group) crumbExtra.push(item.group)
  if (item?.month) crumbExtra.push(item.month)
  if (d.variants) return renderJournalViews(main, cat, d, crumbExtra, anchor, requestedView)
  const head = docHeader(cat, d, { crumbs: crumbExtra })
  const ext = d.ext
  if (/^html?$/.test(ext)) {
    main.innerHTML = `<div class="frame-wrap">${head}<iframe class="doc-frame" id="frame" src="${d.raw}${anchor ? '#' + enc(anchor) : ''}" title="${esc(d.title)}"></iframe></div>`
    return
  }
  if (ext === 'pdf') { main.innerHTML = `<div class="frame-wrap">${head}<iframe class="doc-frame pdf-frame" src="${d.raw}"></iframe></div>`; return }
  if (/^(png|jpe?g|gif|webp|svg)$/.test(ext)) { main.innerHTML = `<div class="view scroll">${head}<div class="media-view"><img src="${d.raw}" alt="${esc(d.name)}"></div></div>`; return }
  if (ext === 'dir') {
    main.innerHTML = `<div class="view scroll">${head}<div class="doc-body"><div class="prose full">${treeHtml(d.tree, cat.id)}</div></div></div>`; return
  }
  if (d.body == null) {
    main.innerHTML = `<div class="view scroll">${head}<div class="doc-body"><p class="muted">这种格式（${esc(ext)}）不在页内渲染，点「原文」用浏览器打开。</p></div></div>`; return
  }
  main.innerHTML = `<div class="view scroll" id="scroller"><div class="progress" id="progress"></div>${head}
    <div class="doc-body" id="doc-body"><article class="prose" id="prose"></article><aside class="toc" id="toc"></aside></div></div>`
  paintBody(d, anchor)
}
function renderJournalViews(main, cat, d, crumbs, anchor, requestedView) {
  const choices = { source: '原文', preview: '预览', html: 'HTML' }
  const key = 'doc-view:' + d.path
  const selected = requestedView || store.get(key, 'preview')
  const view = Object.hasOwn(choices, selected) ? selected : 'preview'
  store.set(key, view)
  d.readerView = view
  d.viewPath = view === 'html' ? d.variants.html : d.path
  d.watchMtime = view === 'html' ? null : d.mtime
  const raw = rawUrl(d.viewPath)
  const tabs = `<div class="doc-view-tabs seg" role="group" aria-label="文档视图">${Object.entries(choices).map(([v, label]) => `<button type="button" class="${view === v ? 'on' : ''}" aria-pressed="${view === v}" data-act="doc-view" data-view="${v}">${label}</button>`).join('')}</div>`
  const head = docHeader(cat, { ...d, path: d.viewPath, raw }, { crumbs, framed: view === 'html', extraActions: tabs })
  const body = view === 'html'
    ? `<iframe class="doc-frame" id="frame" src="${raw}${anchor ? '#' + enc(anchor) : ''}" title="${esc(d.title)} · HTML"></iframe>`
    : `<div class="view scroll" id="scroller"><div class="doc-body" id="doc-body"><article class="prose ${view === 'source' ? 'src-view' : ''}" id="prose"></article>${view === 'preview' ? '<aside class="toc" id="toc"></aside>' : ''}</div></div>`
  main.innerHTML = `<div class="frame-wrap">${head}${body}</div>`
  if (view === 'source') $('#prose').innerHTML = sourceHtml(d.source)
  if (view === 'preview') paintBody(d, anchor)
}
/* 原文视图：行号 + 自动换行 + 轻量 Markdown 着色；frontmatter 单独底色 */
function sourceHtml(src = '') {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length > 1 && lines.at(-1) === '') lines.pop()
  const fmEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1
  let fence = null
  const inline = t => esc(t)
    .replace(/`[^`]+`/g, m => `<span class="t-code">${m}</span>`)
    .replace(/\*\*[^*]+\*\*/g, m => `<span class="t-strong">${m}</span>`)
    .replace(/!?\[[^\]]*\]\([^)\s]*\)/g, m => `<span class="t-link">${m}</span>`)
  const rows = lines.map((ln, i) => {
    let cls = '', html
    if (fmEnd > 0 && i <= fmEnd) {
      cls = 'fm'
      const m = ln.match(/^(\s*-?\s*)([\w.-]+)(:)(.*)$/)
      html = i === 0 || i === fmEnd ? `<span class="t-mark">${esc(ln)}</span>`
        : m ? `${esc(m[1])}<span class="t-key">${esc(m[2])}</span><span class="t-mark">:</span><span class="t-val">${esc(m[4])}</span>` : esc(ln)
    } else if (fence || /^\s*(```|~~~)/.test(ln)) {
      const f = ln.match(/^\s*(```|~~~)/)?.[1]
      if (!fence && f) fence = f; else if (f === fence) fence = null
      cls = 'code'; html = esc(ln)
    } else if (/^#{1,6}\s/.test(ln)) {
      cls = 'h'; html = `<span class="t-h">${esc(ln)}</span>`
    } else {
      html = ln.replace(/^(\s*)([-*+]|\d+\.|>)(\s)/, '\u0000$1$2$3\u0001')
      const m = html.match(/^\u0000(.*?)\u0001(.*)$/s)
      html = m ? `<span class="t-mark">${esc(m[1])}</span>${inline(m[2])}` : inline(ln)
    }
    return `<div class="ln${cls ? ' ' + cls : ''}"><span class="n">${i + 1}</span><span class="c">${html || ' '}</span></div>`
  })
  return `<div class="src">${rows.join('')}</div>`
}
function paintBody(d, anchor) {
  const prose = $('#prose')
  if (!prose) return
  if (d.ext === 'md' || d.ext === 'markdown') {
    prose.innerHTML = propsHtml(d.fm) + mdToHtml(d.body)
    const h1 = prose.querySelector('h1')
    if (h1 && h1.textContent.trim() === d.title.trim() && !h1.previousElementSibling?.matches('h1,h2,h3,p,ul,ol,pre,.table-wrap')) h1.remove()
    enhance(prose, d.path)
    prose.insertAdjacentHTML('afterbegin', sourcesHtml(d.sources))
  } else {
    prose.classList.add('code-view', 'full')
    let body = d.body
    if (d.ext === 'json') { try { body = JSON.stringify(JSON.parse(body), null, 2) } catch (e) {} }
    prose.innerHTML = `<pre><code>${esc(body)}</code></pre>`
  }
  buildToc(prose)
  const sc = $('#scroller')
  sc?.addEventListener('scroll', () => {
    const p = $('#progress'); if (p) p.style.width = (sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight) * 100) + '%'
  }, { passive: true })
  if (anchor && !store.get(viewKey, {}).positions?.[renderedHash]) setTimeout(() => scrollToAnchor(anchor), 60)
}
const PROP_KEYS = { type: '类型', lifecycle: '状态', reviewed: '复核', compiled: '编译', source: '来源', book_category: '分类', reading_status: '阅读', speaker_id: null }
function propsHtml(fm) {
  if (!fm || !Object.keys(fm).length) return ''
  const chips = []
  for (const [k, v] of Object.entries(fm)) {
    if (v == null || v === '' || PROP_KEYS[k] === null || k === 'summary' || k === 'description' || k === 'title' || k === 'sources' || k === 'source') continue
    const val = Array.isArray(v) ? v.join('、') : typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (val.length > 90) continue
    chips.push(`<span class="chip"><b>${esc(PROP_KEYS[k] || k)}</b> ${esc(val)}</span>`)
  }
  const sum = fm.summary || fm.description
  return (sum ? `<blockquote>${esc(sum)}</blockquote>` : '') + (chips.length ? `<div class="props">${chips.join('')}</div>` : '')
}
function sourcesHtml(sources = []) {
  if (!sources.length) return ''
  return `<details class="doc-sources"><summary>来源 · ${sources.length} 项</summary><ul>${sources.map(s => {
    if (s.url) return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`
    if (s.available) return `<li><a href="${docHref(s.path, null, s.anchor)}">${esc(s.label)}</a></li>`
    return `<li>${esc(s.label)}${s.path ? ' <span class="chip warn">不存在或不允许访问</span>' : ''}</li>`
  }).join('')}</ul></details>`
}
function mdToHtml(md) {
  if (!window.marked) return `<pre>${esc(md)}</pre><p class="muted">Markdown 渲染库没加载上（需要网络访问 cdn.jsdelivr.net），先显示原文。</p>`
  const html = marked.parse(md, { gfm: true, breaks: false })
  return window.DOMPurify ? DOMPurify.sanitize(html, { ADD_TAGS: ['picture', 'source', 'mark', 'details', 'summary'], ADD_ATTR: ['srcset', 'media', 'target', 'id', 'open'] }) : html
}
function slug(s) { return s.trim().toLowerCase().replace(/[\s]+/g, '-').replace(/[^\p{L}\p{N}\-_]/gu, '') }
function enhance(root, docPath) {
  const seen = {}
  $$('h1,h2,h3,h4', root).forEach(h => {
    if (!h.id) { let s = slug(h.textContent) || 'h'; if (seen[s]) s += '-' + (++seen[s]); else seen[s] = 1; h.id = s }
  })
  $$('table', root).forEach(t => { const w = document.createElement('div'); w.className = 'table-wrap'; t.replaceWith(w); w.appendChild(t) })
  const fixSrc = v => {
    if (/^(https?:|data:|\/\/)/.test(v)) return v
    const decoded = dec(v)
    return rawUrl(decoded.startsWith('/') || decoded.startsWith('~/') ? decoded : joinPath(docPath, decoded))
  }
  $$('img[src]', root).forEach(img => { img.setAttribute('src', fixSrc(img.getAttribute('src'))); img.loading = 'lazy' })
  $$('source[srcset]', root).forEach(s => s.setAttribute('srcset', s.getAttribute('srcset').split(',').map(x => { const [u, w] = x.trim().split(/\s+/); return fixSrc(u) + (w ? ' ' + w : '') }).join(', ')))
  $$('a[href]', root).forEach(a => {
    let h = a.getAttribute('href').trim().replace(/^<|>$/g, '')
    if (/^(https?:|mailto:)/.test(h)) { a.target = '_blank'; a.rel = 'noopener'; return }
    if (h.startsWith('#')) { a.addEventListener('click', e => { e.preventDefault(); scrollToAnchor(dec(h.slice(1))) }); return }
    const [p, frag] = h.split('#')
    const decoded = dec(p)
    let target = decoded.startsWith('/') || decoded.startsWith('~/') ? decoded : joinPath(docPath, decoded)
    if (target.startsWith(S.idx.journal + '/')) target = target.slice(S.idx.journal.length + 1)
    a.setAttribute('href', docHref(target, null, frag ? dec(frag) : ''))
    a.dataset.path = target
  })
  if (root.querySelector('code.language-mermaid')) loadMermaid(root)
}
function loadMermaid(root) {
  const run = () => {
    $$('code.language-mermaid', root).forEach(c => { const d = document.createElement('div'); d.className = 'mermaid'; d.textContent = c.textContent; c.parentElement.replaceWith(d) })
    const dark = getComputedStyle(document.documentElement).colorScheme === 'dark'
    window.mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral' })
    window.mermaid.run({ nodes: $$('.mermaid', root) })
  }
  if (window.mermaid) return run()
  const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js'; s.onload = run; document.head.appendChild(s)
}
function scrollToAnchor(a) {
  const el = document.getElementById(a) || document.getElementById(slug(a))
  if (!el) return
  const target = el.tagName === 'A' && !el.textContent.trim() ? (el.nextElementSibling || el) : el
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  target.classList.add('hl'); setTimeout(() => target.classList.remove('hl'), 2300)
}
function buildToc(prose) {
  const hs = $$('h2,h3', prose)
  const toc = $('#toc'), body = $('#doc-body')
  if (!toc || hs.length < 3) return
  body.classList.add('has-toc')
  toc.innerHTML = `<nav><h5>目录</h5>${hs.map(h => `<a href="#" data-id="${esc(h.id)}" class="${h.tagName === 'H3' ? 'l3' : ''}">${esc(h.textContent)}</a>`).join('')}</nav>`
  toc.addEventListener('click', e => { const a = e.target.closest('a[data-id]'); if (a) { e.preventDefault(); scrollToAnchor(a.dataset.id) } })
  const links = new Map($$('a[data-id]', toc).map(a => [a.dataset.id, a]))
  const io = new IntersectionObserver(es => {
    for (const en of es) if (en.isIntersecting) { links.forEach(a => a.classList.remove('on')); links.get(en.target.id)?.classList.add('on') }
  }, { root: $('#scroller'), rootMargin: '-15% 0px -70% 0px' })
  hs.forEach(h => io.observe(h))
}
function treeHtml(tree, cat) {
  return `<div class="tree">${tree.map(f => `<a href="${docHref(f.path, cat)}"><span>${esc(f.rel)}</span><span class="sz">${fmtSize(f.size)}</span></a>`).join('')}</div>`
}

/* ---------------------------------------------------------------- 书卡 */
async function renderBook(main, path) {
  const b = S.idx.items.shelf.find(x => x.path === path)
  const cat = catById('shelf')
  if (!b) return renderDoc(main, cat, path)
  main.innerHTML = '<div class="loading">取书中…</div>'
  let d, pkg
  try {
    d = await api('/api/doc?path=' + enc(path))
    if (b.package) pkg = await api('/api/doc?path=' + enc(b.package)).catch(() => null)
  } catch (e) { main.innerHTML = `<div class="err">${esc(e.message)}</div>`; return }
  if (S.route.path !== path) return
  S.doc = d
  setHistoryTitle(path, b.title)
  document.title = b.title + ' · 谨迹书房'
  const canRead = b.entry && !b.entry.startsWith('http')
  const readBtn = canRead ? `<a class="btn primary" href="${href({ mode: 'read', cat: 'shelf', path })}">${ICON.read}开始阅读<span class="kbd">↵</span></a>` : ''
  // 书卡即全书 Markdown：书卡页只展示 book-text 标记之前的导读，全文走文档视图。
  const [guide, fullText] = d.body.replace(/^\s*#\s+.+\n/, '').split(/<!--\s*book-text\b[^>]*-->/)
  const fullBtn = fullText === undefined ? '' : `<a class="btn" href="${href({ mode: 'doc', cat: 'shelf', path })}">Markdown 全文</a>`
  main.innerHTML = `<div class="view scroll" id="scroller">${docHeader(cat, d, { crumbs: [b.category], title: '书卡', extraActions: '' })}
    <div class="doc-body"><div>
      <section class="book-hero">${bookCover(b, true)}
        <div><div class="chips"><span class="chip cat">${esc(b.category)}</span><span class="chip">${esc(statusName(b.status))}</span><span class="chip">${esc(b.format.toUpperCase())}</span>${b.book_tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
          <h1>${esc(b.title)}</h1><div class="by">${esc(b.author || '作者未填')}</div>
          ${b.summary ? `<p class="sum">${esc(b.summary)}</p>` : ''}
          <dl class="kv"><dt>入口</dt><dd><code>${esc(b.entry || b.entry_raw || '未登记')}</code>${!b.entry && b.entry_raw ? ' <span class="chip warn">路径不可读</span>' : ''}</dd>
            ${b.package ? `<dt>书包</dt><dd><code>${esc(b.package)}</code></dd>` : ''}
            ${b.fm.book_text ? `<dt>可检索正文</dt><dd><code>${esc(b.fm.book_text)}</code></dd>` : ''}</dl>
          <div class="actions" style="justify-content:flex-start">${readBtn}${fullBtn}${b.entry ? citeBtn(b.entry, '引用原书') : ''}${citeBtn(path, '引用书卡', 'plain')}</div>
        </div></section>
      <article class="prose full" id="prose"></article>
      ${pkg?.tree?.length ? `<section class="section"><h2 class="section-h">书包内容 <small>${pkg.tree.length} 个文件</small></h2>${treeHtml(pkg.tree, 'shelf')}</section>` : ''}
    </div></div></div>`
  $('#prose').innerHTML = mdToHtml(guide)
  enhance($('#prose'), d.path)
}
async function renderRead(main, path) {
  const b = S.idx.items.shelf.find(x => x.path === path)
  if (!b?.entry) return renderBook(main, path)
  S.doc = { path: b.entry, mtime: 0, readOf: path }
  setHistoryTitle(path, b.title)
  document.title = b.title + ' · 阅读'
  const isMd = /\.(md|markdown)$/i.test(b.entry)
  main.innerHTML = `<div class="frame-wrap">
    <div class="read-bar"><a class="btn sm" href="${href({ mode: 'book', cat: 'shelf', path })}">${ICON.back}书卡</a><span class="rt">${esc(b.title)}</span>
      ${wideBtn('sm')}${favBtn(path, 'sm')}${citeBtn(b.entry, '引用', 'sm')}<a class="btn sm" href="${rawUrl(b.entry)}" target="_blank">${ICON.ext}新窗口</a><button class="btn sm" data-act="focus">${ICON.focus}全屏</button></div>
    ${isMd ? `<div class="view scroll" id="scroller"><div class="doc-body" id="doc-body"><article class="prose" id="prose"></article><aside class="toc" id="toc"></aside></div></div>` : `<iframe class="doc-frame" id="frame" src="${rawUrl(b.entry)}" title="${esc(b.title)}"></iframe>`}
  </div>`
  if (isMd) { const d = await api('/api/doc?path=' + enc(b.entry)); S.doc = d; paintBody(d) }
}

/* ---------------------------------------------------------------- 专家与技能详情 */
const FAMILIARITY = ['候选', '已有参照', '熟知可用']
function familiarityHtml(level) {
  const i = Math.max(0, FAMILIARITY.indexOf(level || '候选'))
  return `<span class="fam" title="熟悉度：${esc(level || '候选')}（候选 → 已有参照 → 熟知可用）">${FAMILIARITY.map((_, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}<b>${esc(level || '候选')}</b></span>`
}
/* 技能文件夹：按子目录分组，SKILL.md 置顶；点文件在书房里打开。 */
function skillFilesHtml(tree, skillPath) {
  const groups = new Map()
  for (const f of tree) {
    if (f.path === skillPath) continue
    const dir = f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) : ''
    if (!groups.has(dir)) groups.set(dir, [])
    groups.get(dir).push(f)
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([dir, fs]) => `<div class="fg"><div class="fgh">${esc(dir || '根目录')}<span>${fs.length}</span></div>
    ${fs.map(f => `<a class="fi" href="${docHref(f.path, 'experts')}" title="${esc(f.rel)}"><span class="fe">${esc((f.ext || '·').slice(0, 4))}</span><span class="fn">${esc(f.rel.split('/').pop())}</span><span class="fz">${fmtSize(f.size)}</span></a>`).join('')}</div>`).join('')
}
function skillPageShell(cat, o) {
  return `<div class="view scroll" id="scroller">
    <header class="doc-head">${crumbs(cat, [o.crumb])}
      <div class="doc-title-row"><h1 class="doc-title">${o.title}</h1><div class="actions">${o.actions}</div></div>
      <div class="doc-meta">${o.meta}</div>
    </header>
    <div class="doc-body sk-body" id="doc-body">
      <div class="sk-main">
        ${o.lead || ''}
        <section class="sk-doc"><div class="sk-doc-h"><span>SKILL.md</span><span class="muted" id="sk-mtime"></span></div>
          <article class="prose" id="prose"><div class="loading">读取 SKILL.md…</div></article></section>
      </div>
      <aside class="sk-side">
        ${o.side || ''}
        <section class="sk-card"><h3>文件 <small id="sk-count">${o.files} 个</small></h3><div class="sk-files" id="sk-files"><div class="muted">读取中…</div></div></section>
        <section class="sk-card"><h3>位置</h3><code class="sk-path" data-act="copy" data-text="${esc(o.path)}" title="点击复制">${esc(o.path)}</code></section>
      </aside>
    </div></div>`
}
async function paintSkillBody(id, sk, mode, names) {
  const [d, dir] = await Promise.all([api('/api/doc?path=' + enc(sk.path)), api('/api/doc?path=' + enc(sk.dir)).catch(() => null)])
  if (S.route.mode !== mode || S.route.id !== id) return
  S.doc = d
  // 一级标题与页头名字相同时才省略，避免重复；不同的标题保留。
  const h1 = d.body.match(/^\s*#\s+(.+)\n?/)
  const body = h1 && names.some(n => n && n.trim() === h1[1].trim()) ? d.body.slice(h1[0].length) : d.body
  $('#prose').innerHTML = mdToHtml(body)
  enhance($('#prose'), d.path)
  $('#sk-mtime').textContent = '更新于 ' + timeAgo(d.mtime)
  if (dir?.tree) { $('#sk-files').innerHTML = skillFilesHtml(dir.tree, sk.path) || '<div class="muted">只有 SKILL.md</div>'; $('#sk-count').textContent = dir.tree.length + ' 个' }
}
async function renderExpert(main, id) {
  const e = S.idx.experts.experts.find(x => x.id === id)
  const cat = catById('experts')
  if (!e) { main.innerHTML = `<div class="err">没有标为专家的 skill：${esc(id)}</div>`; return }
  const sk = e.skill_info
  document.title = e.name + ' · 专家智库'
  const triggers = (e.triggers || []).map(t => `<li>${esc(t)}</li>`).join('')
  const domains = (e.domains || []).map(t => `<span class="chip cat">${esc(t)}</span>`).join('')
  main.innerHTML = skillPageShell(cat, {
    crumb: '专家',
    title: `<span class="ex-seal">${esc(firstChar(e.name))}</span><span class="ex-tt"><span data-name-for="${esc(e.id)}">${esc(e.name)}</span>${e.alias ? `<small>${esc(e.alias)}</small>` : ''}</span>`,
    actions: `${wideBtn()}${favBtn(sk.path, '')}${renameBtn(e)}${citeBtn(sk.path, '引用到会话')}`,
    meta: `${e.type ? `<span class="chip">${esc(e.type)}</span>` : ''}${familiarityHtml(e.familiarity)}<span class="muted">skill 调用名 <code>${esc(e.id)}</code></span>`,
    lead: `<section class="ex-lead">
        <div class="ex-ask"><h3>什么时候请教</h3>${triggers ? `<ul>${triggers}</ul>` : '<p class="muted">SKILL.md 还没写 metadata.triggers。</p>'}</div>
        <p class="ex-desc">${esc(sk.description)}</p>
      </section>`,
    side: `<section class="sk-card"><h3>擅长领域</h3>${domains ? `<div class="chips">${domains}</div>` : '<span class="muted">未填</span>'}</section>`,
    files: sk.files, path: sk.path,
  })
  await paintSkillBody(id, sk, 'expert', [e.name, e.id, sk.name])
}
async function renderSkill(main, id) {
  const k = (S.idx.experts.skills || []).find(x => x.id === id)
  const cat = catById('experts')
  if (!k) { main.innerHTML = `<div class="err">没有这个 skill：${esc(id)}</div>`; return }
  document.title = k.id + ' · 技能'
  main.innerHTML = skillPageShell(cat, {
    crumb: '其他技能',
    title: `<span class="ex-seal sk">⚙</span><span class="ex-tt"><span>${esc(k.id)}</span>${k.name !== k.id ? `<small>${esc(k.name)}</small>` : ''}</span>`,
    actions: wideBtn() + favBtn(k.path, '') + citeBtn(k.path, '引用到会话'),
    meta: `<span class="chip">技能</span>${k.invocable ? '' : '<span class="chip">仅模型调用</span>'}<span class="muted">${esc(k.root)}</span>`,
    lead: `<section class="ex-lead"><p class="ex-desc">${esc(k.description || '没有描述')}</p></section>`,
    files: k.files, path: k.path,
  })
  await paintSkillBody(id, k, 'skill', [k.id, k.name])
}

/* ---------------------------------------------------------------- 搜索面板 */
let palSel = 0, palItems = [], palTimer, palSeq = 0
function openPalette() {
  $('#palette').hidden = false
  const inp = $('#pal-input')
  inp.value = ''
  inp.focus()
  palRender('')
}
function closePalette() { $('#palette').hidden = true }
$('#palette').addEventListener('click', e => { if (e.target.id === 'palette') closePalette() })
$('#pal-input').addEventListener('input', e => {
  const q = e.target.value
  palRender(q)
  clearTimeout(palTimer)
  if (q.trim().length >= 2) palTimer = setTimeout(() => palFull(q), 260)
})
$('#pal-input').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1) }
  else if (e.key === 'Escape') closePalette()
  else if (e.key === 'Enter') {
    const it = palItems[palSel]; if (!it) return
    e.preventDefault()
    if (e.metaKey || e.ctrlKey) { cite(it.path); return }
    closePalette(); location.hash = it.href
  }
})
function allEntries() {
  const out = []
  for (const c of S.idx.categories) {
    if (c.kind === 'experts') {
      for (const e of S.idx.experts.experts) out.push({ cat: 'experts', title: e.name, sub: (e.alias || '') + ' ' + (e.domains || []).join(' '), path: e.skill_info.path, href: href({ mode: 'expert', cat: 'experts', id: e.id }) })
      for (const k of S.idx.experts.skills || []) out.push({ cat: 'experts', title: k.id, sub: k.description || '', path: k.path, href: href({ mode: 'skill', cat: 'experts', id: k.id }) })
    }
    for (const x of S.idx.items[c.id] || []) out.push({ cat: c.id, title: (x.archived ? '〔归档〕' : '') + (x.display || x.title), sub: x.summary || '', path: x.path, href: c.kind === 'shelf' ? href({ mode: 'book', cat: 'shelf', path: x.path }) : docHref(x.path, c.id) })
  }
  return out.filter((x, i) => out.findIndex(y => y.path === x.path) === i)
}
function palRender(q, full = null) {
  const qq = q.trim().toLowerCase()
  let quick
  if (!qq) {
    quick = store.get('history:v2', []).slice(0, 8).map(h => ({ cat: h.cat, title: h.title || h.path, path: h.path, href: href(h), sub: '' }))
  } else {
    const terms = qq.split(/\s+/)
    quick = allEntries().map(x => {
      const hay = (x.title + ' ' + x.path + ' ' + x.sub).toLowerCase()
      if (!terms.every(t => hay.includes(t))) return null
      return { ...x, score: (x.title.toLowerCase().includes(terms[0]) ? 10 : 0) + (x.title.toLowerCase().startsWith(terms[0]) ? 5 : 0) }
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 30)
  }
  const quickPaths = new Set(quick.map(x => x.path))
  const fullRows = (full || []).filter(r => !quickPaths.has(r.path)).map(r => ({ cat: r.cat, title: r.title, path: r.path, snippet: r.snippet, href: r.cat === 'shelf' ? href({ mode: 'book', cat: 'shelf', path: r.path }) : docHref(r.path, r.cat) }))
  palItems = [...quick, ...fullRows]
  palSel = 0
  const mark = s => { let h = esc(s); for (const t of qq.split(/\s+/).filter(Boolean)) h = h.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`); return h }
  const row = (x, i) => `<div class="pal-item ${i === 0 ? 'on' : ''}" data-i="${i}" style="${catVar(x.cat)}"><span class="seal">${esc(catById(x.cat)?.glyph || '·')}</span>
    <div style="min-width:0"><div class="pt">${esc(x.title)}</div><div class="pp">${esc(x.path)}</div>${x.snippet ? `<div class="ps">…${mark(x.snippet)}…</div>` : ''}</div></div>`
  $('#pal-list').innerHTML =
    (quick.length ? `<div class="pal-sec">${qq ? '标题与路径' : '最近打开'}</div>` + quick.map(row).join('') : '') +
    (fullRows.length ? `<div class="pal-sec">全文命中</div>` + fullRows.map((x, i) => row(x, i + quick.length)).join('') : '') +
    (!palItems.length ? `<div class="pal-sec">${qq ? (full ? '没找到' : '全文搜索中…') : '输入关键词开始搜索'}</div>` : '')
}
async function palFull(q) {
  const seq = ++palSeq
  try {
    const { results } = await api('/api/search?q=' + enc(q))
    if (seq === palSeq && !$('#palette').hidden && $('#pal-input').value === q) palRender(q, results)
  } catch (e) {}
}
function palMove(d) {
  const els = $$('.pal-item', $('#pal-list'))
  if (!els.length) return
  palSel = (palSel + d + els.length) % els.length
  els.forEach((el, i) => el.classList.toggle('on', i === palSel))
  els[palSel].scrollIntoView({ block: 'nearest' })
}
$('#pal-list').addEventListener('click', e => {
  const el = e.target.closest('.pal-item'); if (!el) return
  const it = palItems[+el.dataset.i]; closePalette(); location.hash = it.href
})

/* ---------------------------------------------------------------- 键盘 */
document.addEventListener('keydown', e => {
  if (!$('#palette').hidden) return
  const tag = (e.target.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea') { if (e.key === 'Escape') e.target.blur(); return }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const k = e.key
  if (k === '/') { e.preventDefault(); openPalette() }
  else if (k === '0') go({ mode: 'home' })
  else if (/^[1-9]$/.test(k)) { const c = S.idx.categories[+k - 1]; if (c) go({ mode: 'overview', cat: c.id }) }
  else if (k === 'c') { const p = currentCitePath(); if (p) cite(p, $('.doc-head .btn.cite, .read-bar .btn.cite')) }
  else if (k === 'f') toggleFocus()
  else if (k === 's') { const p = currentFavPath(); if (p) toggleFavorite({ dataset: { path: p } }) }
  else if (k === 'w' && S.route.mode !== 'home' && S.route.mode !== 'overview') toggleWide()
  else if (k === 't') toggleTheme()
  else if (k === 'r') refreshIndex(true)
  else if (k === '[') toggleSide()
  else if (k === 'j' || k === 'k') stepList(k === 'j' ? 1 : -1)
  else if (k === 'Enter' && S.route.mode === 'book') { const a = $('.book-hero .btn.primary'); if (a) location.hash = a.getAttribute('href') }
  else if (k === 'Escape') { if ($('#app').classList.contains('focus')) toggleFocus(); else if (S.route.mode !== 'overview' && S.route.cat) history.back() }
})
function currentCitePath() {
  const r = S.route
  if (r.mode === 'read') return S.idx.items.shelf.find(b => b.path === r.path)?.entry
  if (r.mode === 'expert') return S.idx.experts.experts.find(x => x.id === r.id)?.skill_info?.path
  if (r.mode === 'skill') return (S.idx.experts.skills || []).find(x => x.id === r.id)?.path
  return S.doc?.viewPath || r.path
}
function currentFavPath() {
  const r = S.route
  if (r.mode === 'read' || r.mode === 'book') return r.path // 阅读页收藏的是书卡。
  if (r.mode === 'expert' || r.mode === 'skill') return currentCitePath()
  if (r.mode === 'doc') return S.doc?.path || r.path
  return null
}
function stepList(d) {
  const rows = $$('#side-list .row')
  if (!rows.length) return
  const i = rows.findIndex(r => r.classList.contains('active'))
  const n = rows[Math.min(rows.length - 1, Math.max(0, i + d))]
  if (n) location.hash = n.getAttribute('href')
}

/* ---------------------------------------------------------------- 实时刷新：文件更新后自动重绘 */
async function refreshIndex(force = false) {
  try {
    const res = await api('/api/index?' + new URLSearchParams({ ...(force ? { refresh: '1' } : {}), ...(S.idx?.version ? { since: S.idx.version } : {}) }))
    if (force) toast(`已重新索引 · ${res.built_ms} ms`)
    if (res.unchanged) return
    const changed = !S.idx || res.version !== S.idx.version
    S.idx = res
    if (S.route.cat && !catById(S.route.cat)) { go({ mode: 'home' }); return }
    if (changed && S.route) {
      renderRail()
      const list = $('#side-list'), top = list?.scrollTop
      renderSide()
      if ($('#side-list') && top) $('#side-list').scrollTop = top
      if (S.route.mode === 'home' || S.route.mode === 'overview') { const sc = $('#scroller')?.scrollTop; renderMain(); if (sc) $('#scroller').scrollTop = sc }
    }
  } catch (e) { if (force) toast('索引失败：' + esc(e.message)) }
}
async function watchDoc() {
  const d = S.doc
  if (!d?.path || document.hidden) return
  try {
    const st = await api('/api/stat?path=' + enc(d.viewPath || d.path))
    if (S.doc !== d) return
    if (d.readerView) {
      if (d.watchMtime == null) { d.watchMtime = st.mtime; return }
      if (d.watchMtime !== st.mtime) {
        await renderDoc($('#main'), catById(S.route.cat), S.route.path, S.route.anchor, d.readerView)
        toast('内容已更新')
      }
      return
    }
    if (st.bridge !== S.bridge) { S.bridge = st.bridge; paintBridge() }
    if (!d.mtime) { d.mtime = st.mtime; return }
    if (st.mtime === d.mtime || S.doc !== d) return
    d.mtime = st.mtime
    const frame = $('#frame')
    if (frame) { frame.contentWindow.location.reload(); toast('原文已更新，已重新载入'); return }
    const fresh = await api('/api/doc?path=' + enc(d.path))
    if (S.doc !== d) return
    const sc = $('#scroller'), top = sc?.scrollTop
    Object.assign(d, fresh)
    if ($('#prose')) {
      if (S.route.mode === 'doc' || S.route.mode === 'read') paintBody(d)
      else { $('#prose').innerHTML = mdToHtml(S.route.mode === 'book' ? d.body.replace(/^\s*#\s+.+\n/, '').split(/<!--\s*book-text\b[^>]*-->/)[0] : d.body); enhance($('#prose'), d.path) }
    }
    if (sc) sc.scrollTop = top
    toast('内容已更新')
  } catch (e) {}
}

/* ---------------------------------------------------------------- 启动 */
async function boot() {
  try { S.idx = await api('/api/index') } catch (e) {
    $('#main').innerHTML = `<div class="err">连不上书房服务：${esc(e.message)}<br><small>运行 <code>python3 ~/Projects/jinji-reader/server/server.py</code></small></div>`; return
  }
  if (store.get('sideCollapsed', false)) $('#app').classList.add('side-collapsed')
  if (store.get('wide', false)) $('#app').classList.add('wide-read')
  api('/api/ping').then(p => { S.bridge = p.bridge; paintBridge() }).catch(() => {})
  route()
  setInterval(watchDoc, 2000)
  setInterval(() => { if (!document.hidden) refreshIndex() }, 15000)
}
boot()
})()
