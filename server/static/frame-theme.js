/* 谨迹书房 · 内嵌 HTML 跟随书房主题。
 * 书房服务在 /raw/ 返回的 HTML 顶部插入本脚本。只在被书房页面（同源父窗口）嵌入时生效；
 * 单独打开文件时不做任何事，原文件字节不变。
 * 同时适配深浅两套主题的页面才会切换；只写了浅色的页面保持原样。
 * 支持的写法：@media (prefers-color-scheme)、matchMedia、[data-theme]、.dark 类、
 * localStorage 记住的 light/dark、color-scheme: light dark。
 */
(() => {
  'use strict'
  let host = null
  try {
    for (let w = window.parent; w && w !== window; w = w.parent) {
      if (w.location.origin !== location.origin) break
      if (typeof w.__jinjiScheme === 'function') { host = w; break }
      if (w === w.parent) break
    }
  } catch { host = null }
  if (!host) return

  let scheme = host.__jinjiScheme() === 'dark' ? 'dark' : 'light'
  const root = document.documentElement
  const PCS = /\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi
  const TRUE = '(min-width: 0px)'
  const FALSE = '(min-width: 99999999px)' // 单一条件，放在 not (...) 里也不改变语义
  const rewrite = text => text.replace(PCS, (_, v) => (v.toLowerCase() === scheme ? TRUE : FALSE))
  const hasPcs = text => /prefers-color-scheme/i.test(text || '')

  /* matchMedia：页面脚本按系统偏好判断时，改为按书房主题回答，并在切换时通知监听者。 */
  const nativeMatch = window.matchMedia.bind(window)
  const fakes = new Set()
  window.matchMedia = query => {
    if (!hasPcs(query)) return nativeMatch(query)
    const listeners = new Set()
    const mql = {
      media: query,
      onchange: null,
      get matches() { return nativeMatch(rewrite(query)).matches },
      addListener(fn) { if (fn) listeners.add(fn) },
      removeListener(fn) { listeners.delete(fn) },
      addEventListener(type, fn) { if (type === 'change' && fn) listeners.add(fn) },
      removeEventListener(type, fn) { if (type === 'change') listeners.delete(fn) },
      dispatchEvent() { return true },
      _fire() {
        const event = { type: 'change', matches: mql.matches, media: query }
        for (const fn of [...listeners]) { try { (fn.handleEvent ? fn.handleEvent.bind(fn) : fn)(event) } catch (e) { console.error(e) } }
        try { mql.onchange?.(event) } catch (e) { console.error(e) }
      },
    }
    fakes.add(mql)
    return mql
  }

  /* localStorage：只替换明显是主题的键，且原值是 light/dark/空时才替换，不动其他数据。 */
  const THEME_KEY = /(^|[-_.:])(theme|color-?scheme|colou?r-?mode|dark-?mode|appearance)$/i
  const nativeGet = Storage.prototype.getItem
  Storage.prototype.getItem = function (key) {
    const value = nativeGet.call(this, key)
    if (this === window.localStorage && THEME_KEY.test(String(key)) && (value == null || value === 'light' || value === 'dark')) return scheme
    return value
  }

  const original = new WeakMap()
  const flags = { dataTheme: root.hasAttribute('data-theme'), bodyDataTheme: false, darkClass: null, bothSchemes: false }

  function walkRules(rules) {
    for (const rule of rules) {
      if (rule.media && hasPcs(original.get(rule) ?? rule.media.mediaText)) {
        if (!original.has(rule)) original.set(rule, rule.media.mediaText)
        const next = rewrite(original.get(rule))
        if (rule.media.mediaText !== next) rule.media.mediaText = next
      }
      const sel = rule.selectorText
      if (sel) {
        // 只认根级主题写法：[data-theme]、html/:root/body[data-theme]；按钮上的 data-theme 不算。
        if (/(?:^|[\s,>~+])(?:html|:root|body)?\[data-theme/.test(sel)) {
          flags.dataTheme = true
          if (/body\[data-theme/.test(sel)) flags.bodyDataTheme = true
        }
        // 只认 html.dark / :root.dark / body.dark，或作为祖先的 .dark；.slide.dark 这类组件状态不算。
        const m = sel.match(/(?:^|,)\s*(?:(html|:root|body)\.dark(?=[\s.:[>~+,]|$)|\.dark(?=\s+[^\s,{]))/)
        if (m && !flags.darkClass) flags.darkClass = m[1] === 'body' ? 'body' : 'html'
      }
      if (rule.style?.getPropertyValue && /light/.test(rule.style.getPropertyValue('color-scheme')) && /dark/.test(rule.style.getPropertyValue('color-scheme'))) flags.bothSchemes = true
      let inner
      try { inner = rule.cssRules } catch { inner = null }
      if (inner) walkRules(inner)
      if (rule.styleSheet) { try { walkRules(rule.styleSheet.cssRules) } catch {} }
    }
  }

  function apply() {
    for (const sheet of document.styleSheets) {
      try { walkRules(sheet.cssRules) } catch {} // 跨域样式表不可读，跳过。
    }
    for (const el of document.querySelectorAll('[media]')) {
      const base = el.dataset.jinjiMedia ?? el.getAttribute('media')
      if (!hasPcs(base)) continue
      el.dataset.jinjiMedia = base
      const next = rewrite(base)
      if (el.getAttribute('media') !== next) el.setAttribute('media', next)
    }
    const meta = document.querySelector('meta[name="color-scheme"]')
    if (meta && /light/.test(meta.content) && /dark/.test(meta.content)) flags.bothSchemes = true
    if (flags.dataTheme) {
      root.setAttribute('data-theme', scheme)
      if (flags.bodyDataTheme && document.body) document.body.setAttribute('data-theme', scheme)
    }
    if (flags.darkClass) {
      const target = flags.darkClass === 'body' ? document.body : root
      target?.classList.toggle('dark', scheme === 'dark')
      target?.classList.toggle('light', scheme === 'light')
    }
    if (flags.bothSchemes) root.style.colorScheme = scheme
  }

  // 解析过程中插入的 <style>/<link> 立即改写，避免先闪一下错误的主题。
  // 微任务合并多次插入，仍早于下一帧绘制；长文档不会每个节点都重扫一遍样式表。
  let queued = false
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; apply() }) } }
  const observer = new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes].some(n => n.nodeName === 'STYLE' || n.nodeName === 'LINK' || n.nodeName === 'SOURCE' || n.nodeName === 'META'))) schedule()
  })
  observer.observe(document, { childList: true, subtree: true })
  document.addEventListener('DOMContentLoaded', apply)
  window.addEventListener('load', () => { apply(); setTimeout(() => observer.disconnect(), 1000) })
  document.addEventListener('load', e => { if (e.target?.nodeName === 'LINK') apply() }, true)
  if (root.hasAttribute('data-theme')) root.setAttribute('data-theme', scheme)

  /* 书房切换主题时调用：重新改写，通知 matchMedia 监听者，再传给嵌套的同源页面。 */
  window.__jinjiTheme = next => {
    next = next === 'dark' ? 'dark' : 'light'
    if (next === scheme) return
    scheme = next
    apply()
    for (const mql of fakes) mql._fire()
    for (const frame of document.querySelectorAll('iframe')) {
      try { frame.contentWindow.__jinjiTheme?.(scheme) } catch {}
    }
  }
  window.__jinjiScheme = () => scheme
})()
