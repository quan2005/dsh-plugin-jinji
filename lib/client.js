/**
 * dsh-plugin-jinji —— 浏览器部分（跑在网页 http://127.0.0.1:3080 里）。
 *
 * 本文件是手写的官方浏览器模块格式（window.__ModuleLoader__），
 * 网页在用到时才执行它，不需要任何编译步骤。
 *
 * 按钮与面板都用最朴素的网页技术实现（不依赖 React）：
 * - 入口按钮：插到「新会话」按钮正下方；读取官方按钮当前生效的样式并逐项
 *   复制过来，任何主题下都长得一样；
 * - 记忆面板：直接挂到页面 body，用转义过的内容填充 + 绑定事件；
 * - 设置卡片：注册进「设置 → 插件配置」的 settings.plugin.item 槽位，
 *   读写 /api/jinji-memory?action=config（这一块用到 shell 共享的 React，
 *   拿不到 React 时自动跳过，不影响按钮与面板）；
 * - 数据：fetch('/api/jinji-memory')，由服务端部分（lib/index.js）应答。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-jinji',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // React 由 shell 的模块表共享（不是本包依赖）；拿不到就降级为不注册设置卡片
    let React = null
    try { React = require('react') } catch { React = null }

    const JM_CSS = `
.jm-nav { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: #7A828C; cursor: pointer; padding: 6px 10px; border-radius: 6px; font-size: 12.5px; font-family: inherit; }
.jm-nav:hover { color: #C9CFD6; background: #1D2126; }
.jm-nav-icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: none; }
.jm-nav-icon svg { display: block; }
.jm-newsession { cursor: pointer; font-family: inherit; }
.jm-newsession:hover { color: var(--dsw-alias-label-primary) !important; background: var(--dsw-alias-interactive-bg-hover) !important; }
.jm-newlabel { white-space: nowrap; max-width: 200px; overflow: hidden; }
.jm-newsession.jm-rail .jm-newlabel { display: none; }
.jm-overlay { position: fixed; top: 0; right: 0; bottom: 0; left: 260px; z-index: 400; background: #151517; color: #C9CFD6; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; display: flex; flex-direction: column; pointer-events: auto; border-left: 1px solid #23282E; }
.jm-overlay ::-webkit-scrollbar { width: 8px; height: 8px; }
.jm-overlay ::-webkit-scrollbar-thumb { background: #31373F; border-radius: 4px; }
.jm-overlay ::-webkit-scrollbar-track { background: transparent; }
.jm-topbar { height: 46px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #23282E; background: #151517; position: relative; }
.jm-switch { display: flex; background: #14171B; border: 1px solid #23282E; border-radius: 8px; padding: 3px; gap: 2px; }
.jm-switch span { font-size: 12.5px; padding: 5px 22px; border-radius: 6px; color: #7A828C; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; user-select: none; }
.jm-switch span.jm-on { background: #1D2126; color: #E4E8ED; }
.jm-switch span:hover:not(.jm-on) { color: #C9CFD6; }
.jm-count { font-size: 11.5px; color: #7A828C; }
.jm-close { font-size: 11.5px; color: #7A828C; background: none; border: 1px solid #23282E; border-radius: 6px; padding: 3px 10px; cursor: pointer; }
.jm-close:hover { color: #E4E8ED; border-color: #31373F; }
.jm-view { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #151517; }
.jm-scroll { flex: 1; overflow-y: auto; padding: 16px 24px 48px; }
.jm-month { font-size: 12px; color: #7A828C; margin: 14px 0 10px; display: flex; align-items: center; gap: 10px; }
.jm-month::after { content: ''; flex: 1; height: 1px; background: #23282E; }
.jm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.jm-card { background: #1D2126; border: 1px solid #23282E; border-radius: 8px; padding: 13px 15px; cursor: pointer; height: 168px; display: flex; flex-direction: column; transition: border-color .15s; overflow: hidden; }
.jm-card:hover { border-color: #31373F; }
.jm-card-tall { height: 150px; }
.jm-card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.jm-num { min-width: 20px; height: 20px; padding: 0 6px; background: #262B31; color: #7A828C; border-radius: 5px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.jm-title { font-size: 13px; font-weight: 600; color: #E4E8ED; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jm-tag { font-size: 10.5px; color: #5B8DB8; background: #17202a; border: 1px solid #24303d; padding: 1px 7px; border-radius: 4px; white-space: nowrap; flex-shrink: 0; }
.jm-tag-purple { color: #9b8fc0; background: #1e1c28; border-color: #2e2a40; }
.jm-tag-green { color: #7d9b6f; background: #1b2318; border-color: #2a3826; }
.jm-tag-orange { color: #b08d5f; background: #251f16; border-color: #3a3021; }
.jm-excerpt { font-size: 12px; line-height: 1.7; color: #7A828C; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; flex: 1; }
.jm-foot { margin-top: 8px; display: flex; gap: 6px; flex-wrap: nowrap; overflow: hidden; }
.jm-chip { font-size: 10.5px; color: #7A828C; background: #101216; border: 1px solid #23282E; padding: 2px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.jm-ext { font-size: 9px; color: #5c646e; border: 1px solid #2c3239; border-radius: 3px; padding: 0 3px; }
.jm-role { font-size: 10px; color: #7A828C; border: 1px solid #2c3239; border-radius: 3px; padding: 0 5px; flex-shrink: 0; }
.jm-split { flex-direction: row; }
.jm-preview { flex: 1; min-width: 0; overflow-y: auto; padding-bottom: 60px; background: #151517; }
.jm-topbar-detail { justify-content: flex-start; padding: 0 20px; gap: 12px; }
.jm-dtitle { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; color: #E4E8ED; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.jm-topbar-right { position: absolute; right: 20px; display: flex; align-items: center; gap: 10px; }
.jm-topbar-detail .jm-topbar-right { position: static; flex: none; }
.jm-seg { display: flex; border: 1px solid #23282E; border-radius: 7px; overflow: hidden; }
.jm-seg span { font-size: 11.5px; padding: 4px 12px; color: #7A828C; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; user-select: none; }
.jm-seg span.jm-on { background: #1D2126; color: #E4E8ED; }
.jm-pbody { padding: 22px 34px; max-width: 860px; }
.jm-psummary { font-size: 12.5px; line-height: 1.9; color: #7A828C; margin: 0; }
.jm-pchips { margin: 14px 0 26px; display: flex; flex-wrap: wrap; gap: 7px; }
.jm-h1 { font-size: 21px; color: #5B8DB8; font-weight: 600; margin: 6px 0 4px; }
.jm-h2 { font-size: 16px; color: #5B8DB8; font-weight: 600; margin: 26px 0 12px; }
.jm-h3 { font-size: 14px; color: #C9CFD6; font-weight: 600; margin: 18px 0 8px; }
.jm-p { font-size: 13px; line-height: 1.95; color: #b3bac2; margin: 0 0 12px; }
.jm-p strong { color: #6FA3CC; }
.jm-ul { padding-left: 20px; margin: 0 0 12px; }
.jm-li { font-size: 13px; line-height: 1.9; color: #b3bac2; margin-bottom: 4px; }
.jm-quote { margin: 0 0 12px; padding: 4px 14px; border-left: 2px solid #31373F; color: #7A828C; }
.jm-table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 12.5px; }
.jm-table th { text-align: left; color: #7A828C; font-weight: 500; padding: 8px 10px; border-bottom: 1px solid #23282E; }
.jm-table td { padding: 9px 10px; border-bottom: 1px solid #1c2126; color: #b3bac2; line-height: 1.6; }
.jm-pre { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; line-height: 1.7; color: #b3bac2; background: #101216; border: 1px solid #23282E; border-radius: 8px; padding: 14px 16px; white-space: pre-wrap; word-break: break-word; margin: 0 0 12px; }
.jm-code { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; background: #1D2126; border-radius: 4px; padding: 0 4px; }
.jm-list { width: 330px; flex-shrink: 0; border-left: 1px solid #23282E; background: #151517; overflow-y: auto; padding: 10px 10px 40px; }
.jm-lp-month { font-size: 11.5px; color: #7A828C; padding: 10px 8px 6px; display: flex; align-items: center; gap: 6px; }
.jm-lp-item { padding: 9px 10px; border-radius: 7px; cursor: pointer; margin-bottom: 2px; }
.jm-lp-item:hover { background: #1D2126; }
.jm-lp-item.jm-active { background: #1A232C; border-left: 2px solid #5B8DB8; padding-left: 8px; }
.jm-lp-row { display: flex; align-items: center; gap: 7px; }
.jm-lp-row .jm-num { min-width: 18px; height: 18px; font-size: 10.5px; }
.jm-lp-t { font-size: 12.5px; font-weight: 600; color: #C9CFD6; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jm-lp-item.jm-active .jm-lp-t { color: #6FA3CC; }
.jm-lp-ex { font-size: 11px; color: #6b737d; line-height: 1.65; margin-top: 5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.jm-empty { padding: 40px; color: #7A828C; text-align: center; }
.jm-loading { padding: 40px; color: #7A828C; text-align: center; }
`

    // 「设置 → 插件配置」里的配置卡片样式（结构与官方 PluginCard 一致：收起/展开、未保存徽标、底部按钮）
    const CFG_CSS = `
.jm-cfg-card { border: 1px solid var(--dsw-alias-border-l2, #31373F); background: var(--dsw-alias-bg-layer-3, #14171B); border-radius: 12px; list-style: none; transition: border-color .16s, background .16s; color: var(--dsw-alias-label-primary, #E4E8ED); font-size: 13px; }
.jm-cfg-card:hover { border-color: var(--dsw-alias-label-dimmed, #5c646e); }
.jm-cfg-open { background: var(--dsw-alias-bg-layer-2, #1D2126); border-color: var(--dsw-alias-label-dimmed, #5c646e); }
.jm-cfg-header { appearance: none; width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer; background: none; border: 0; border-radius: 12px; align-items: center; gap: 12px; padding: 14px 16px; display: flex; }
.jm-cfg-header:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #5B8DB8); outline-offset: -2px; }
.jm-cfg-headtext { flex-direction: column; flex: 1; gap: 4px; min-width: 0; display: flex; }
.jm-cfg-name { color: var(--dsw-alias-label-primary, #E4E8ED); font-size: 15px; font-weight: 600; line-height: 1.4; }
.jm-cfg-desc { color: var(--dsw-alias-label-tertiary, #7A828C); font-size: 13px; line-height: 1.5; }
.jm-cfg-chevron { color: var(--dsw-alias-label-tertiary, #7A828C); flex: none; transition: transform .16s; display: inline-flex; }
.jm-cfg-chevron-open { transform: rotate(180deg); }
.jm-cfg-pending { white-space: nowrap; background: var(--dsw-alias-bg-module-platform, #262B31); color: var(--dsw-alias-label-secondary, #C9CFD6); border-radius: 999px; flex: none; padding: 1px 8px; font-size: 11px; font-weight: 500; line-height: 17px; }
.jm-cfg-body { border-top: 1px solid var(--dsw-alias-border-l2, #31373F); margin: 0 16px; padding-bottom: 8px; }
.jm-cfg-field { flex-direction: column; gap: 6px; padding: 12px 0; display: flex; }
.jm-cfg-field + .jm-cfg-field { border-top: 1px solid var(--dsw-alias-border-l2, #31373F); }
.jm-cfg-head { align-items: center; gap: 8px; display: flex; }
.jm-cfg-label { min-width: 0; color: var(--dsw-alias-label-primary, #E4E8ED); flex: 1; font-size: 13px; font-weight: 500; line-height: 1.5; }
.jm-cfg-hint { color: var(--dsw-alias-label-tertiary, #7A828C); margin: 0; font-size: 12px; line-height: 1.5; }
.jm-cfg-input { border: 1px solid var(--dsw-alias-border-l2, #31373F); background: var(--dsw-alias-bg-layer-3, #14171B); height: 34px; font: inherit; color: var(--dsw-alias-label-primary, #E4E8ED); border-radius: 8px; padding: 0 12px; font-size: 13px; line-height: 1.5; width: 100%; box-sizing: border-box; }
.jm-cfg-input:focus-visible { border-color: var(--dsw-alias-brand-primary, #5B8DB8); outline: none; }
.jm-cfg-input:disabled { color: var(--dsw-alias-label-tertiary, #7A828C); cursor: default; }
.jm-cfg-check { display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; }
.jm-cfg-check input { accent-color: #5B8DB8; }
.jm-cfg-check .jm-cfg-label { flex: none; }
.jm-cfg-textarea { width: 100%; box-sizing: border-box; background: var(--dsw-alias-bg-layer-3, #14171B); border: 1px solid var(--dsw-alias-border-l2, #31373F); color: var(--dsw-alias-label-primary, #E4E8ED); border-radius: 8px; padding: 8px 12px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; line-height: 1.6; resize: vertical; }
.jm-cfg-textarea:focus-visible { border-color: var(--dsw-alias-brand-primary, #5B8DB8); outline: none; }
.jm-cfg-mini { font: inherit; color: var(--dsw-alias-label-secondary, #C9CFD6); cursor: pointer; background: none; border: none; padding: 0; font-size: 12px; line-height: 1.5; flex: none; }
.jm-cfg-mini:hover:not(:disabled) { color: var(--dsw-alias-label-primary, #E4E8ED); }
.jm-cfg-footer { border-top: 1px solid var(--dsw-alias-border-l2, #31373F); justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 0 4px; display: flex; }
.jm-cfg-msg { min-width: 0; flex: 1; margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary, #7A828C); }
.jm-cfg-msg-err { color: var(--dsw-alias-label-error, #cc6666); }
.jm-cfg-discard, .jm-cfg-save { appearance: none; font: inherit; cursor: pointer; border: 1px solid transparent; border-radius: 8px; padding: 5px 14px; font-size: 13px; line-height: 1.5; }
.jm-cfg-discard { border-color: var(--dsw-alias-border-l2, #31373F); color: var(--dsw-alias-label-secondary, #C9CFD6); background: none; }
.jm-cfg-discard:hover:not(:disabled) { color: var(--dsw-alias-label-primary, #E4E8ED); border-color: var(--dsw-alias-label-dimmed, #5c646e); }
.jm-cfg-save { background: var(--dsw-alias-label-primary, #E4E8ED); color: var(--dsw-alias-bg-layer-3, #14171B); }
.jm-cfg-discard:disabled, .jm-cfg-save:disabled { opacity: .4; cursor: default; }
.jm-cfg-discard:focus-visible, .jm-cfg-save:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #5B8DB8); outline-offset: 1px; }
`

    const CHEVRON_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.25 7 8.75l3.5-3.5"/></svg>'

    const CLOCK_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.25"/><polyline points="8 4.75 8 8 10.5 9.25"/></svg>'

    function injectCss(css) {
      const el = document.createElement('style')
      el.setAttribute('data-plugin-css', 'dsh-plugin-jinji')
      el.textContent = css
      document.head.appendChild(el)
      return () => el.remove()
    }

    function fetchJson(params) {
      const qs = Object.keys(params)
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k] === undefined ? '' : params[k])))
        .join('&')
      return fetch('/api/jinji-memory?' + qs).then((r) => r.json())
    }

    function esc(s) {
      return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }

    function tagClass(tag) {
      if (tag === 'research' || tag === 'personal') return 'jm-tag-purple'
      if (tag === 'maintenance' || tag === 'cli-tools') return 'jm-tag-green'
      if (tag === 'investment' || tag === 'finance' || tag === 'todo' || tag === 'todos') return 'jm-tag-orange'
      return ''
    }

    function extOf(src) {
      const base = String(src).split('/').pop() || ''
      const i = base.lastIndexOf('.')
      return i >= 0 ? base.slice(i + 1).toUpperCase().slice(0, 5) : 'MD'
    }

    function chipsHtml(sources, fallback) {
      const list = sources && sources.length ? sources : (fallback ? [fallback] : [])
      return list.map((s) => '<span class="jm-chip">' + esc(s) + '<span class="jm-ext">' + esc(extOf(s)) + '</span></span>').join('')
    }

    function ymLabel(ym) {
      return '20' + ym.slice(0, 2) + '年' + parseInt(ym.slice(2), 10) + '月'
    }

    function monthRange(journals) {
      if (!journals || journals.length === 0) return ''
      const first = journals[0].ym
      const last = journals[journals.length - 1].ym
      if (first === last) return ymLabel(first)
      return '20' + first.slice(0, 2) + ' 年 ' + parseInt(first.slice(2), 10) + '–' + parseInt(last.slice(2), 10) + ' 月'
    }

    function stripFrontmatter(text) {
      const m = /^---\s*\n[\s\S]*?\n---\s*\n?/.exec(text || '')
      return m ? text.slice(m[0].length) : text
    }

    // 预览里标题已在顶栏显示，正文开头与标题相同的 H1 去掉，避免重复
    function stripLeadingH1(text, title) {
      const m = /^#\s+(.+?)\s*(?:\n|$)/.exec(text || '')
      if (m && title && m[1].trim() === String(title).trim()) return text.slice(m[0].length)
      return text
    }

    function inlineHtml(text) {
      return esc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code class="jm-code">$1</code>')
    }

    function mdHtml(text) {
      const lines = String(text || '').split('\n')
      let html = ''
      let i = 0
      let inList = false
      let inCode = false
      const codeBuf = []
      while (i < lines.length) {
        const line = lines[i]
        if (line.startsWith('```')) {
          if (inCode) { html += '<pre class="jm-pre">' + esc(codeBuf.join('\n')) + '</pre>'; inCode = false; codeBuf.length = 0 }
          else inCode = true
          i++
          continue
        }
        if (inCode) { codeBuf.push(line); i++; continue }
        const h = /^(#{1,3})\s+(.*)$/.exec(line)
        if (h) { if (inList) { html += '</ul>'; inList = false } html += '<h' + h[1].length + ' class="jm-h' + h[1].length + '">' + inlineHtml(h[2]) + '</h' + h[1].length + '>'; i++; continue }
        if (/^\s*-\s+/.test(line)) { if (!inList) { html += '<ul class="jm-ul">'; inList = true } html += '<li class="jm-li">' + inlineHtml(line.replace(/^\s*-\s+/, '')) + '</li>'; i++; continue }
        if (inList) { html += '</ul>'; inList = false }
        if (line.trim().startsWith('|')) {
          const rows = []
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            const cells = lines[i].trim().split('|').slice(1, -1).map((c) => c.trim())
            if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
            i++
          }
          if (rows.length > 1) {
            html += '<table class="jm-table"><thead><tr>' + rows[0].map((c) => '<th>' + inlineHtml(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(1).map((r) => '<tr>' + r.map((c) => '<td>' + inlineHtml(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'
          }
          continue
        }
        if (/^>\s?/.test(line)) { html += '<blockquote class="jm-quote">' + inlineHtml(line.replace(/^>\s?/, '')) + '</blockquote>'; i++; continue }
        if (line.trim() === '') { i++; continue }
        html += '<p class="jm-p">' + inlineHtml(line) + '</p>'
        i++
      }
      if (inList) html += '</ul>'
      if (inCode) html += '<pre class="jm-pre">' + esc(codeBuf.join('\n')) + '</pre>'
      return html
    }

    const state = { tab: 'journal', data: null, loading: false, error: '', selected: null, doc: null, docLoading: false, seg: 'preview' }
    let panelRoot = null
    let panelCleanup = null

    function measureSidebarWidth() {
      const col = document.querySelector('[class*="_sidebarCol"]')
      if (col !== null && typeof col.getBoundingClientRect === 'function') {
        const w = Math.round(col.getBoundingClientRect().width)
        if (w > 40) return w
      }
      const anchor = document.querySelector('[class*="_newSession"]')
      if (anchor !== null && typeof anchor.getBoundingClientRect === 'function') {
        const r = anchor.getBoundingClientRect()
        return Math.max(56, Math.round(r.left + r.width + 12))
      }
      return 260
    }

    function grouped(list, keyOf) {
      const groups = []
      const index = {}
      for (const item of list) {
        const key = keyOf(item)
        if (index[key] === undefined) { index[key] = groups.length; groups.push({ key, items: [] }) }
        groups[index[key]].items.push(item)
      }
      return groups
    }

    function openCard(rel) {
      state.selected = rel
      state.doc = null
      state.docLoading = true
      state.seg = 'preview'
      renderPanel()
      fetchJson({ action: 'read', rel })
        .then((r) => { if (r && r.ok) state.doc = r; else state.doc = { rel, text: '', error: (r && r.reason) || '读取失败' } })
        .catch((e) => { state.doc = { rel, text: '', error: String((e && e.message) || e) } })
        .finally(() => { state.docLoading = false; renderPanel() })
    }

    function renderPanel() {
      if (panelRoot === null) return
      const journals = state.data && state.data.ok ? state.data.journals : []
      const personas = state.data && state.data.ok ? state.data.personas : []
      const selItem = state.selected ? (journals.find((j) => j.rel === state.selected) || personas.find((p) => p.rel === state.selected)) : null
      const count = state.tab === 'journal'
        ? journals.length + ' 条 · ' + monthRange(journals)
        : personas.length + ' 个画像 · ' + grouped(personas, (p) => p.region).length + ' 个分组'

      let bodyHtml = ''
      if (state.selected) {
        bodyHtml = '<div class="jm-view jm-split">'
          + '<div class="jm-preview">'
          + (state.docLoading ? '<div class="jm-loading">加载中…</div>' : '<div class="jm-pbody">'
            + (state.seg === 'source'
              ? '<pre class="jm-pre">' + esc(state.doc ? state.doc.text : '') + '</pre>'
              : (selItem ? '<p class="jm-psummary">' + esc(selItem.summary) + '</p><div class="jm-pchips">' + chipsHtml(selItem.sources, selItem.tags[0]) + '</div>' : '') + (state.doc && state.doc.error ? '<div class="jm-empty">' + esc(state.doc.error) + '</div>' : mdHtml(stripLeadingH1(stripFrontmatter(state.doc ? state.doc.text : ''), selItem ? selItem.title : ''))))
            + '</div>')
          + '</div>'
          + '<div class="jm-list">' + grouped(journals, (j) => j.ym).map((g) => '<div><div class="jm-lp-month">⌄ ' + esc(ymLabel(g.key)) + '</div>' + g.items.map((j) => '<div class="jm-lp-item' + (j.rel === state.selected ? ' jm-active' : '') + '" data-jm-rel="' + esc(j.rel) + '"><div class="jm-lp-row"><span class="jm-num">' + esc(String(j.day || 1)) + '</span><span class="jm-lp-t">' + esc(j.title) + '</span>' + (j.tags[0] ? '<span class="jm-tag ' + tagClass(j.tags[0]) + '">' + esc(j.tags[0]) + '</span>' : '') + '</div><div class="jm-lp-ex">' + esc(j.summary || '') + '</div></div>').join('') + '</div>').join('') + '</div>'
          + '</div>'
      } else if (state.tab === 'journal') {
        bodyHtml = '<div class="jm-view"><div class="jm-scroll">' + grouped(journals, (j) => j.ym).map((g) => '<div><div class="jm-month">' + esc(ymLabel(g.key)) + '</div><div class="jm-grid">' + g.items.map((j) => '<div class="jm-card" data-jm-rel="' + esc(j.rel) + '"><div class="jm-card-top"><span class="jm-num">' + esc(String(j.day || 1)) + '</span><span class="jm-title">' + esc(j.title) + '</span>' + (j.tags[0] ? '<span class="jm-tag ' + tagClass(j.tags[0]) + '">' + esc(j.tags[0]) + '</span>' : '') + '</div><div class="jm-excerpt">' + esc(j.summary || '') + '</div><div class="jm-foot">' + chipsHtml(j.sources, j.tags[0]) + '</div></div>').join('') + '</div></div>').join('') + '</div></div>'
      } else {
        bodyHtml = '<div class="jm-view"><div class="jm-scroll">' + grouped(personas, (p) => p.region).map((g) => '<div><div class="jm-month">' + esc(g.key) + '</div><div class="jm-grid">' + g.items.map((p) => '<div class="jm-card jm-card-tall" data-jm-rel="' + esc(p.rel) + '"><div class="jm-card-top"><span class="jm-num">' + esc((p.title || '?').slice(0, 1)) + '</span><span class="jm-title">' + esc(p.title) + '</span>' + p.tags.slice(0, 3).map((t) => '<span class="jm-role">' + esc(t) + '</span>').join('') + '</div><div class="jm-excerpt">' + esc(p.summary || '') + '</div><div class="jm-foot"><span class="jm-chip">identity<span class="jm-ext">MD</span></span></div></div>').join('') + '</div></div>').join('') + '</div></div>'
      }

      const topbarHtml = state.selected
        ? '<div class="jm-topbar jm-topbar-detail">'
          + '<button class="jm-close" data-jm-act="back">‹ 返回列表</button>'
          + '<span class="jm-dtitle">' + esc(selItem ? selItem.title : '') + '</span>'
          + '<div class="jm-topbar-right"><div class="jm-seg"><span data-jm-act="seg-preview" class="' + (state.seg === 'preview' ? 'jm-on' : '') + '">◉ 预览</span><span data-jm-act="seg-source" class="' + (state.seg === 'source' ? 'jm-on' : '') + '"></> 源码</span></div>'
          + '<button class="jm-close" data-jm-act="close">× 关闭</button></div></div>'
        : '<div class="jm-topbar">'
          + '<div class="jm-switch"><span data-jm-act="tab-journal" class="' + (state.tab === 'journal' ? 'jm-on' : '') + '">日志</span><span data-jm-act="tab-persona" class="' + (state.tab === 'persona' ? 'jm-on' : '') + '">画像</span></div>'
          + '<div class="jm-topbar-right"><span class="jm-count">' + esc(count) + '</span>'
          + '<button class="jm-close" data-jm-act="close">× 关闭</button></div></div>'
      panelRoot.innerHTML = topbarHtml
        + (state.loading ? '<div class="jm-loading">加载中…</div>' : (state.error ? '<div class="jm-empty">' + esc(state.error) + '</div>' : bodyHtml))

      for (const node of Array.from(panelRoot.querySelectorAll('[data-jm-act]'))) {
        node.addEventListener('click', () => {
          const act = node.getAttribute('data-jm-act')
          if (act === 'close') return closePanel()
          if (act === 'back') { state.selected = null; state.doc = null; return renderPanel() }
          if (act === 'tab-journal') { state.tab = 'journal'; return renderPanel() }
          if (act === 'tab-persona') { state.tab = 'persona'; return renderPanel() }
          if (act === 'seg-preview') { state.seg = 'preview'; return renderPanel() }
          if (act === 'seg-source') { state.seg = 'source'; return renderPanel() }
        })
      }
      for (const node of Array.from(panelRoot.querySelectorAll('[data-jm-rel]'))) {
        node.addEventListener('click', () => openCard(node.getAttribute('data-jm-rel')))
      }
    }

    function openPanel() {
      if (panelRoot !== null) { panelRoot.focus(); return }
      panelRoot = document.createElement('div')
      panelRoot.className = 'jm-overlay'
      panelRoot.setAttribute('tabindex', '-1')
      panelRoot.style.left = measureSidebarWidth() + 'px'
      panelRoot.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { if (state.selected) { state.selected = null; state.doc = null; renderPanel() } else closePanel() }
      })
      document.body.appendChild(panelRoot)
      const onResize = () => { if (panelRoot !== null) panelRoot.style.left = measureSidebarWidth() + 'px' }
      const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(onResize) : null
      if (observer !== null) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
      window.addEventListener('resize', onResize)
      const onDocClick = (e) => {
        if (panelRoot === null) return
        const t = e.target
        if (t && typeof t.closest === 'function') {
          if (t.closest('[data-jinji-nav]') !== null) return
          if (t.closest('[class*="_sidebarCol"]') !== null) closePanel()
        }
      }
      document.addEventListener('click', onDocClick, true)
      panelCleanup = () => {
        if (observer !== null) observer.disconnect()
        window.removeEventListener('resize', onResize)
        document.removeEventListener('click', onDocClick, true)
      }
      state.loading = true
      renderPanel()
      fetchJson({ action: 'index' })
        .then((r) => {
          if (r && r.ok) { state.data = r; state.error = '' }
          else { state.error = (r && (r.reason || r.error)) || '加载失败' }
        })
        .catch((e) => { state.error = String((e && e.message) || e) })
        .finally(() => { state.loading = false; renderPanel() })
      panelRoot.focus()
    }

    function closePanel() {
      if (panelCleanup !== null) { panelCleanup(); panelCleanup = null }
      if (panelRoot !== null) { panelRoot.remove(); panelRoot = null; state.selected = null; state.doc = null }
    }

    /**
     * 把「记忆」按钮插入到 New Session 按钮正下方（shell 私有 DOM，无官方槽位）。
     * 学习手册 8.5 的最后手段配方：语义后缀选择器 + MutationObserver 兜底；
     * 样式经 getComputedStyle 从锚点逐属性拷贝内联，与「新会话」幽灵按钮一致。
     */
    const COPY_PROPS = ['alignItems', 'background', 'border', 'borderRadius', 'boxSizing', 'color', 'display', 'fontFamily', 'fontSize', 'fontWeight', 'gap', 'height', 'justifyContent', 'letterSpacing', 'lineHeight', 'margin', 'padding', 'width', 'flex']

    function mountNavButton(onOpen) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'jm-newsession'
      btn.setAttribute('title', '记忆')
      btn.setAttribute('data-jinji-nav', '1')
      btn.addEventListener('click', onOpen)
      const icon = document.createElement('span')
      icon.className = 'jm-nav-icon'
      icon.innerHTML = CLOCK_SVG
      const label = document.createElement('span')
      label.className = 'jm-newlabel'
      label.textContent = '记忆'
      btn.appendChild(icon)
      btn.appendChild(label)

      let attached = false
      const syncStyle = (anchor) => {
        if (!anchor || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return
        const cs = window.getComputedStyle(anchor)
        for (const p of COPY_PROPS) {
          if (cs[p] !== undefined && cs[p] !== '') btn.style[p] = cs[p]
        }
        btn.classList.toggle('jm-rail', anchor.getBoundingClientRect().width <= 40)
      }
      const attach = () => {
        const anchor = document.querySelector('[class*="_newSession"]')
        for (const old of Array.from(document.querySelectorAll('[data-jinji-nav]'))) {
          if (old !== btn) old.remove()
        }
        if (anchor !== null && !attached) {
          anchor.insertAdjacentElement('afterend', btn)
          attached = true
        }
        syncStyle(anchor)
      }
      const observer = new MutationObserver(() => {
        if (attached && !document.contains(btn)) attached = false
        attach()
      })
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
      const onResize = () => attach()
      window.addEventListener('resize', onResize)
      attach()
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', onResize)
        if (btn.parentNode) btn.parentNode.removeChild(btn)
      }
    }

    // ── 「设置 → 插件配置」卡片（React 由 shell 共享；纯 createElement，无需编译） ──
    function normalizeDraft(c) {
      return {
        startupContext: !!c.startupContext,
        maxEntries: String(c.maxEntries),
        maxPersonas: String(c.maxPersonas),
        maxBytes: String(c.maxBytes),
        writeProtocolEnabled: !!c.writeProtocolEnabled,
        writeProtocol: c.writeProtocol || '',
      }
    }

    function ConfigCard() {
      const h = React.createElement
      const [open, setOpen] = React.useState(false)
      const [draft, setDraft] = React.useState(null)
      const [saved, setSaved] = React.useState(null)
      const [meta, setMeta] = React.useState(null)
      const [msg, setMsg] = React.useState(null) // { kind: 'ok' | 'err', text }
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => { reload() }, [])

      function reload() {
        setMsg(null)
        fetchJson({ action: 'config' })
          .then((r) => {
            if (r && r.ok) {
              setMeta({ defaults: r.defaults, protocolBuiltin: r.protocolBuiltin, file: r.file })
              const d = normalizeDraft(r.config)
              setDraft(d)
              setSaved(d)
            } else setMsg({ kind: 'err', text: '加载失败：' + ((r && r.reason) || '未知错误') })
          })
          .catch((e) => setMsg({ kind: 'err', text: '加载失败：' + String((e && e.message) || e) }))
      }

      const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
      const numOk = (s) => /^\d+$/.test(String(s).trim())
      const invalid = draft !== null && !['maxEntries', 'maxPersonas', 'maxBytes'].every((k) => numOk(draft[k]))

      function edit(key, value) {
        setDraft({ ...draft, [key]: value })
        setMsg(null)
      }

      function save() {
        if (!dirty || invalid || busy) return
        const payload = {
          startupContext: draft.startupContext,
          maxEntries: Number(draft.maxEntries),
          maxPersonas: Number(draft.maxPersonas),
          maxBytes: Number(draft.maxBytes),
          writeProtocolEnabled: draft.writeProtocolEnabled,
          writeProtocol: draft.writeProtocol,
        }
        setBusy(true)
        setMsg(null)
        fetch('/api/jinji-memory?action=config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then((r) => r.json())
          .then((r) => {
            if (r && r.ok) {
              const d = normalizeDraft(r.config)
              setDraft(d)
              setSaved(d)
              setMsg({ kind: 'ok', text: '已保存 ✓ 新会话立即生效' })
            } else setMsg({ kind: 'err', text: '保存失败：' + ((r && r.reason) || '未知错误') })
          })
          .catch((e) => setMsg({ kind: 'err', text: '保存失败：' + String((e && e.message) || e) }))
          .finally(() => setBusy(false))
      }

      function discard() {
        setDraft(saved)
        setMsg(null)
      }

      function boolRow(labelText, hint, key) {
        return h('div', { className: 'jm-cfg-field', key },
          h('div', { className: 'jm-cfg-head' },
            h('label', { className: 'jm-cfg-check' },
              h('input', { type: 'checkbox', checked: draft[key], disabled: busy, onChange: (e) => edit(key, e.target.checked) }),
              h('span', { className: 'jm-cfg-label' }, labelText))),
          h('p', { className: 'jm-cfg-hint' }, hint))
      }

      function numRow(labelText, hint, key) {
        return h('div', { className: 'jm-cfg-field', key },
          h('div', { className: 'jm-cfg-head' },
            h('span', { className: 'jm-cfg-label' }, labelText)),
          h('input', {
            className: 'jm-cfg-input', type: 'number', value: draft[key], disabled: busy,
            onChange: (e) => edit(key, e.target.value),
          }),
          h('p', { className: 'jm-cfg-hint' }, hint))
      }

      const header = h('button', {
        type: 'button',
        className: 'jm-cfg-header',
        'aria-expanded': open,
        'aria-label': (open ? '收起' : '展开') + '：谨迹记忆',
        onClick: () => setOpen(!open),
      },
        h('span', { className: 'jm-cfg-headtext' },
          h('span', { className: 'jm-cfg-name' }, '谨迹记忆'),
          h('span', { className: 'jm-cfg-desc' }, '双轨文本记忆：流水日志 + 画像实体（jinji-memory）')),
        dirty ? h('span', { className: 'jm-cfg-pending' }, '未保存') : null,
        h('span', {
          className: 'jm-cfg-chevron' + (open ? ' jm-cfg-chevron-open' : ''),
          dangerouslySetInnerHTML: { __html: CHEVRON_SVG },
        }))

      let body = null
      if (open) {
        if (draft === null) {
          body = h('div', { className: 'jm-cfg-body' },
            h('div', { className: 'jm-cfg-field' },
              h('p', { className: 'jm-cfg-hint' }, msg ? msg.text : '加载中…')))
        } else {
          body = h('div', { className: 'jm-cfg-body' },
            boolRow('启动时注入记忆', '每个新会话自动携带「最近日志 + 画像」的摘要快照', 'startupContext'),
            numRow('摘要日志条数', '启动快照里带多少条最近日志（1–200，默认 20）', 'maxEntries'),
            numRow('摘要画像条数', '启动快照里带多少条画像（1–500，默认 30）', 'maxPersonas'),
            numRow('摘要字节上限', '超出后截断并提示（4096–500000，默认 60000）', 'maxBytes'),
            boolRow('注入书写规范', '告诉 AI 何时、如何主动写记忆（日志格式 / 画像档案 / 建档门槛）', 'writeProtocolEnabled'),
            h('div', { className: 'jm-cfg-field', key: 'writeProtocol' },
              h('div', { className: 'jm-cfg-head' },
                h('span', { className: 'jm-cfg-label' }, '自定义书写规范'),
                h('button', {
                  type: 'button', className: 'jm-cfg-mini', disabled: busy,
                  onClick: () => edit('writeProtocol', (meta && meta.protocolBuiltin) || ''),
                }, '填入内置默认')),
              h('textarea', {
                className: 'jm-cfg-textarea', rows: 8, value: draft.writeProtocol, disabled: busy,
                placeholder: '留空使用内置默认规范',
                onChange: (e) => edit('writeProtocol', e.target.value),
              }),
              h('p', { className: 'jm-cfg-hint' }, '留空使用内置默认；文本里可用 __MEMORY_ROOT__ 占位记忆根目录')),
            h('div', { className: 'jm-cfg-field' },
              h('p', { className: 'jm-cfg-hint' }, '保存写入记忆根目录下的 ' + ((meta && meta.file) || '.jinji-memory.json') + '，随记忆库一起迁移；root 目录本身在 profile 的 cordis.patch.yml 里配置。')),
            h('div', { className: 'jm-cfg-footer' },
              msg ? h('p', { className: 'jm-cfg-msg' + (msg.kind === 'err' ? ' jm-cfg-msg-err' : ''), role: 'status' }, msg.text) : null,
              h('button', { type: 'button', className: 'jm-cfg-discard', disabled: !dirty || busy, onClick: discard }, '放弃修改'),
              h('button', { type: 'button', className: 'jm-cfg-save', disabled: !dirty || invalid || busy, onClick: save }, busy ? '保存中…' : '保存')))
        }
      }

      return h('li', { className: 'jm-cfg-card' + (open ? ' jm-cfg-open' : '') }, header, body)
    }

    exports.name = 'jinji-memory'
    exports.apply = function (ctx) {
      ctx.effect(() => injectCss(JM_CSS + CFG_CSS), 'jinji-memory css')
      ctx.effect(() => mountNavButton(() => openPanel()), 'jinji-memory nav button')
      // 设置卡片：注册进「设置 → 插件配置」槽位；槽位不存在（未组装设置页）时静默跳过
      const slots = ctx.get('slots')
      if (slots !== undefined && React !== null) {
        slots.inject('settings.plugin.item', () => slots.register(
          { name: 'settings.plugin.item', id: 'jinji-memory', order: 100 },
          ConfigCard,
        ))
      }
    }

    return module.exports
  },
})
