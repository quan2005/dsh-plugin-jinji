/**
 * 谨迹书房 · DSH Client 半边（手写 CJS 工厂，无需构建）。
 *
 * - 左栏「书房」全局面板：整页嵌入 jinji-reader 原网页（宣纸/墨主题、六个入口、搜索、阅读）。
 * - 右侧栏「书房」Tab：同一网页贴在当前会话旁边，边读边聊。
 * - 嵌入书房引用：校验路径 → iframe 消息 → 切回当前对话 → 等待输入框 → 写入并核对草稿/DOM。
 *   独立打开的书房仍保留轮询引用队列兼容；不发送会话消息、不覆盖草稿。
 * - `/shufang` 命令：在右侧栏打开书房。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-jinji-reader',
  factory: require => {
    const module = { exports: {} }
    const React = require('react')
    const h = React.createElement

    const ID = 'dsh-plugin-jinji-reader'
    const PANEL_ID = 'jinji-shufang'
    const TAB_KIND = 'jinji-shufang'
    const NS = 'jinjiShufang'
    const STATUS_PATH = '/jinji-shufang/status'
    const PULL_PATH = '/jinji-shufang/cite-pull'
    const POLL_MS = 700

    const zh = {
      panel: '谨迹书房',
      tab: '谨迹书房',
      'guide.title': '谨迹书房',
      'guide.description': '浏览 journal 只读 Wiki，一键引用到会话',
      command: '打开谨迹书房（右侧栏）',
      connecting: '正在连接书房服务…',
      offline: '书房服务没连上。',
      offlineHint: '插件会自动拉起；也可以手动运行：',
      retry: '重试',
      close: '关闭书房，返回对话',
      closeShort: '返回对话',
      openExternal: '在浏览器打开',
      cited: '已引用 {name}',
      citeFailed: '没有可用的会话输入框，已复制 {mention}',
      noSession: '先打开一个会话，再从书房引用。',
    }
    const en = {
      panel: 'Jinji Study',
      tab: 'Jinji Study',
      'guide.title': 'Jinji Study',
      'guide.description': 'Browse the read-only journal wiki and cite into the chat',
      command: 'Open Jinji Study in the right sidebar',
      connecting: 'Connecting to the study server…',
      offline: 'The study server is not reachable.',
      offlineHint: 'The plugin starts it automatically; you can also run:',
      retry: 'Retry',
      close: 'Close study and return to conversation',
      closeShort: 'Back to chat',
      openExternal: 'Open in browser',
      cited: 'Cited {name}',
      citeFailed: 'No composer available; copied {mention}',
      noSession: 'Open a session before citing from the study.',
    }

    const CSS = `
.jjsf-root { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; background: var(--dsw-alias-bg-base, transparent); }
.jjsf-frame { flex: 1 1 0; width: 100%; height: 0; min-height: 0; border: 0; display: block; background: transparent; }
/* 关闭：右上角悬浮的图标按钮，不占一整行；书房页面会为它在右上角留出位置。 */
.jjsf-close { position: absolute; top: 10px; right: 14px; z-index: 3; box-sizing: border-box; width: 32px; height: 32px; padding: 0; display: grid; place-items: center;
  border-radius: 9px; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.28)); cursor: pointer;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 78%, transparent); color: var(--dsw-alias-label-secondary, inherit);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); box-shadow: 0 1px 2px rgba(0,0,0,.10), 0 4px 14px -6px rgba(0,0,0,.25);
  transition: color .15s ease, background-color .15s ease, border-color .15s ease, transform .12s ease; }
.jjsf-close svg { width: 16px; height: 16px; display: block; }
.jjsf-close:hover { color: var(--dsw-alias-label-primary, inherit); background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.18)); border-color: var(--dsw-alias-border-l2, rgba(127,127,127,.45)); }
.jjsf-close:active { transform: scale(.94); }
.jjsf-close:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, currentColor); outline-offset: 2px; }
.jjsf-tip { position: absolute; right: calc(100% + 8px); top: 50%; transform: translate(4px, -50%); white-space: nowrap; pointer-events: none; opacity: 0;
  padding: 4px 9px; border-radius: 7px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary, #fff);
  background: var(--dsw-alias-bg-overlay, rgba(30,30,30,.92)); border: 1px solid var(--dsw-alias-border-l1, transparent); box-shadow: 0 6px 18px -8px rgba(0,0,0,.35);
  transition: opacity .15s ease, transform .15s ease; }
.jjsf-close:hover .jjsf-tip, .jjsf-close:focus-visible .jjsf-tip { opacity: 1; transform: translate(0, -50%); }
@media (prefers-reduced-motion: reduce) { .jjsf-close, .jjsf-tip { transition: none; } }
.jjsf-status { margin: auto; max-width: 28rem; padding: 2rem; text-align: center; line-height: 1.7; color: var(--dsw-alias-label-secondary, inherit); font-size: 13px; }
.jjsf-status code { display: inline-block; margin: .4rem 0; padding: .15rem .45rem; border-radius: 6px; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); font-size: 12px; word-break: break-all; }
.jjsf-actions { display: flex; gap: .6rem; justify-content: center; margin-top: .8rem; }
.jjsf-btn { cursor: pointer; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.35)); background: transparent; color: inherit; border-radius: 8px; padding: .3rem .8rem; font: inherit; }
.jjsf-btn:hover { background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); }
.jjsf-toast { position: absolute; left: 50%; bottom: 1rem; transform: translateX(-50%); padding: .45rem .9rem; border-radius: 8px; background: rgba(30,30,30,.88); color: #fff; font-size: 12px; pointer-events: none; z-index: 2; white-space: nowrap; max-width: 90%; overflow: hidden; text-overflow: ellipsis; }
.jjsf-seal { display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; background: #b03a28; color: #f4f0e6; font-family: "Songti SC", "STSong", serif; font-weight: 700; line-height: 1; transform: rotate(-4deg); flex: none; }
`

    /* ------------------------------------------------------------ 共享状态（书房服务 + 引用桥） */

    function createStatusStore() {
      let snapshot = { phase: 'connecting', url: '', journal: null, server: '', tick: 0 }
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
        set(next) { snapshot = { ...snapshot, ...next }; for (const fn of listeners) fn() },
      }
    }

    /** DSH 当前深浅色：优先读 theme 服务并订阅 theme/change；没有该服务时按页面配色或系统偏好判断。 */
    function readScheme(ctx) {
      const svc = typeof ctx.get === 'function' ? ctx.get('theme') : undefined
      const active = svc?.getTheme?.()?.active?.colorScheme
      if (active === 'dark' || active === 'light') return active
      try {
        const css = getComputedStyle(document.documentElement).colorScheme || ''
        if (/^\s*dark\b/.test(css)) return 'dark'
        if (/^\s*light\b/.test(css)) return 'light'
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      } catch {
        return 'light'
      }
    }

    function createSchemeStore(ctx) {
      let snapshot = { scheme: readScheme(ctx) }
      const listeners = new Set()
      const update = next => {
        if (next === snapshot.scheme) return
        snapshot = { scheme: next }
        for (const fn of listeners) fn()
      }
      ctx.effect(() => {
        const offs = []
        if (typeof ctx.on === 'function') {
          const off = ctx.on('theme/change', snap => update(snap?.active?.colorScheme === 'dark' ? 'dark' : snap?.active?.colorScheme === 'light' ? 'light' : readScheme(ctx)))
          if (typeof off === 'function') offs.push(off)
        }
        const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
        const onSystem = () => update(readScheme(ctx))
        mq?.addEventListener?.('change', onSystem)
        offs.push(() => mq?.removeEventListener?.('change', onSystem))
        return () => { for (const off of offs) off() }
      }, 'jinji-shufang: theme follow')
      return {
        getSnapshot: () => snapshot,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
      }
    }

    function useStatus(store) {
      return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    }

    async function fetchStatus() {
      const r = await fetch(STATUS_PATH, { cache: 'no-store', credentials: 'same-origin' })
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    }

    function toMention(abs, cwd) {
      const rel = cwd && abs.startsWith(cwd.endsWith('/') ? cwd : `${cwd}/`) ? abs.slice(cwd.replace(/\/$/, '').length + 1) : abs
      if (/["\u0000-\u001f\u007f-\u009f]/u.test(rel)) return undefined
      return /\s/u.test(rel) ? `@"${rel}"` : `@${rel}`
    }

    async function copyText(text) {
      try { await navigator.clipboard.writeText(text); return true } catch { return false }
    }

    // 当前 DSH 不再有 list.current；mainView retention 是选中会话的依据。
    function selectedSession(sessions) {
      const rows = Object.values(sessions.list.getSnapshot().byId)
      return rows.find(row => (row.retainedBy?.mainView ?? 0) > 0)
    }

    const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
    const citationErrors = {
      'no-session': '请先选择一个对话，再引用文档。',
      'invalid-path': '文档路径无法转换为引用。',
      'session-changed': '当前对话已改变，本次引用未继续写入。',
      busy: '输入框暂时不可编辑，请稍后重试引用。',
      unavailable: '未找到可编辑的对话输入框，请刷新 DSH 后重试。',
      'not-confirmed': '未确认引用在输入框中显示，请检查草稿后再决定是否重试。',
    }

    function mountedComposer(shell) {
      const root = shell.editor?.getRootElement()
      return root?.isConnected && root.isContentEditable && root.getClientRects().length > 0 ? root : null
    }

    async function insertCitation(ctx, abs, options = {}) {
      const session = selectedSession(ctx.sessions)
      if (!session) return { ok: false, reason: 'no-session' }
      const mention = toMention(abs, session.cwd)
      if (!mention) return { ok: false, reason: 'invalid-path' }
      const actx = ctx.sessions.scope(session.id)
      const conversation = ctx.get('conversation')
      if (!actx || !conversation) return { ok: false, reason: 'unavailable', mention }
      const shell = conversation.input.for(actx)
      const name = abs.split('/').pop()
      const fail = reason => {
        shell.notify?.('error', citationErrors[reason])
        return { ok: false, reason, mention }
      }
      // 全局书房会卸载 Conversation。先切回来，不能向未挂载的编辑器写入。
      ctx.layout.selectPanel(null)
      const deadline = Date.now() + 2500
      let root
      while (Date.now() < deadline) {
        if (selectedSession(ctx.sessions)?.id !== session.id) return fail('session-changed')
        root = mountedComposer(shell)
        if (root) {
          // 留出 React effect 还原持久草稿/绑定 mirror 的时间，再捕获最新插入点。
          const revision = shell.snapshot.draftRev
          await pause(50)
          if (mountedComposer(shell) === root && revision === shell.snapshot.draftRev) break
        } else await pause(25)
        root = null
      }
      if (!root) return fail('unavailable')
      if (selectedSession(ctx.sessions)?.id !== session.id) return fail('session-changed')
      if (!['plain', 'claimed'].includes(shell.snapshot.phase)) return fail('busy')
      const before = shell.snapshot.draft
      const capture = shell.actions.captureInsertion()
      // 不替换用户选中的草稿；在选区末尾插入。输入框显示真实 @路径，不只显示通知。
      const span = { ...capture, start: capture.end }
      const inserted = shell.actions.insertText(` ${mention} `, span)
      if (!inserted) return fail('busy')
      // 核对真实草稿与 DOM；不用事件返回值作为唯一成功依据，不盲目重试造成重复。
      await pause(50)
      if (selectedSession(ctx.sessions)?.id !== session.id) return fail('session-changed')
      const after = shell.snapshot
      root = mountedComposer(shell)
      const added = after.draft.split(mention).length > before.split(mention).length
      if (!root || after.draftRev <= capture.draftRev || !added || !root.textContent.includes(mention)) return fail('not-confirmed')
      options.closeReader?.() // 只关闭发起引用的书房 Tab，不关闭其他右侧栏。
      shell.focus()
      shell.notify?.('info', `已回填引用：${name}`)
      return { ok: true, mention, name }
    }

    // 每个 iframe 各自绑定；仅接受该书房窗口 + 精确 origin，引用结果回给发起窗口。
    function bindReaderBridge(target, getFrame, origin, cite) {
      const pending = new Map()
      const receive = async event => {
        const data = event.data
        if (event.origin !== origin || event.source !== getFrame() || !data || data.type !== 'jinji:cite') return
        if (typeof data.id !== 'string' || data.id.length > 100 || typeof data.abs !== 'string' || !data.abs.startsWith('/') || data.abs.length > 8192) return
        let result = pending.get(data.id)
        if (!result) {
          result = Promise.resolve().then(() => cite(data.abs)).catch(() => ({ ok: false, reason: 'unavailable' }))
          pending.set(data.id, result)
          if (pending.size > 100) pending.delete(pending.keys().next().value)
        }
        event.source.postMessage({ type: 'jinji:cite-result', id: data.id, ...await result }, origin)
      }
      target.addEventListener('message', receive)
      return () => target.removeEventListener('message', receive)
    }

    /* ------------------------------------------------------------ 视图 */

    function SealIcon({ size = 16 }) {
      return h('span', { className: 'jjsf-seal', style: { width: size, height: size, fontSize: Math.round(size * 0.68) }, 'aria-hidden': true }, '谨')
    }

    const CLOSE_ICON = h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'aria-hidden': true },
      h('path', { d: 'M6 6l12 12' }), h('path', { d: 'M18 6 6 18' }))

    function CloseButton({ t, close }) {
      return h('button', { type: 'button', className: 'jjsf-close', onClick: close, 'aria-label': t('close'), 'data-tip': t('closeShort') },
        CLOSE_ICON, h('span', { className: 'jjsf-tip', 'aria-hidden': true }, t('close')))
    }

    function ReaderView({ store, scheme, t, refresh, toastText, cite, view, close }) {
      const s = useStatus(store)
      const current = useStatus(scheme).scheme
      const frame = React.useRef(null)
      // 首次挂载时的主题写进 URL，避免先闪浅色；之后主题变化只发消息，不重载 iframe。
      const initial = React.useRef(current)
      React.useEffect(() => {
        if (!s.url) return
        return bindReaderBridge(window, () => frame.current?.contentWindow, new URL(s.url).origin, cite)
      }, [s.url, cite])
      const postScheme = React.useCallback(() => {
        if (!s.url) return
        try { frame.current?.contentWindow?.postMessage({ type: 'jinji:theme', scheme: scheme.getSnapshot().scheme }, new URL(s.url).origin) } catch {}
      }, [s.url, scheme])
      React.useEffect(postScheme, [current, postScheme])
      const themeParam = initial.current === 'dark' || initial.current === 'light' ? `&theme=${initial.current}` : ''
      const src = s.url ? `${s.url}/?dshOrigin=${encodeURIComponent(window.location.origin)}&view=${view}${themeParam}` : ''
      const toolbar = h(CloseButton, { t, close })
      if (s.phase !== 'online') {
        return h('div', { className: 'jjsf-root' }, toolbar,
          h('div', { className: 'jjsf-status' },
            s.phase === 'connecting'
              ? h('div', null, t('connecting'))
              : h(React.Fragment, null,
                h('div', null, t('offline')),
                h('div', null, t('offlineHint')),
                h('code', null, `python3 ${s.server || '~/Projects/jinji-reader/server/server.py'}`),
                h('div', { className: 'jjsf-actions' },
                  h('button', { type: 'button', className: 'jjsf-btn', onClick: refresh }, t('retry')))),
          ),
        )
      }
      return h('div', { className: 'jjsf-root' }, toolbar,
        h('iframe', { ref: frame, className: 'jjsf-frame', src, title: t('guide.title'), referrerPolicy: 'no-referrer', allow: 'clipboard-write', onLoad: postScheme }),
        toastText ? h('div', { className: 'jjsf-toast', role: 'status' }, toastText) : null,
      )
    }

    function useToast(bus) {
      const [text, setText] = React.useState('')
      React.useEffect(() => {
        let timer
        const off = bus.subscribe(msg => {
          setText(msg)
          clearTimeout(timer)
          timer = setTimeout(() => setText(''), 2600)
        })
        return () => { off(); clearTimeout(timer) }
      }, [bus])
      return text
    }

    function createToastBus() {
      const listeners = new Set()
      return { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }, emit(msg) { for (const fn of listeners) fn(msg) } }
    }

    function PanelPage({ t, face }) {
      const toastText = useToast(face.toasts)
      return h(ReaderView, { store: face.status, scheme: face.scheme, t, refresh: face.refresh, toastText, cite: face.cite, view: 'panel', close: () => face.close() })
    }

    function TabBody({ t, face, useTabInfo }) {
      const toastText = useToast(face.toasts)
      const info = useTabInfo()
      const closeReader = info.tab.actions.close
      const cite = React.useCallback(abs => face.cite(abs, { closeReader }), [face.cite, closeReader])
      return h(ReaderView, { store: face.status, scheme: face.scheme, t, refresh: face.refresh, toastText, cite, view: 'sidebar', close: () => face.close(closeReader) })
    }

    function TabTitle({ useTabInfo, t }) {
      const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined
      return h(React.Fragment, null, h(SealIcon, { size: 14 }), ' ', info?.tab?.title ?? t('tab'))
    }

    /* ------------------------------------------------------------ 插件入口 */

    const inject = ['slots', 'locale', 'sessions', 'layout', 'sidebarRightTabs', 'sidebarRight']

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      const status = createStatusStore()
      const toasts = createToastBus()
      const scheme = createSchemeStore(ctx)

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'jinji-shufang: dictionaries')
      ctx.effect(() => {
        const el = document.createElement('style')
        // apply() 晚于模块工厂求值；必须显式归属，防止后加载的插件认领并误删。
        el.dataset.plugin = ID
        el.dataset.pluginCss = `${ID}/reader.css`
        el.dataset.jinjiShufang = ''
        el.textContent = CSS
        document.head.appendChild(el)
        return () => el.remove()
      }, 'jinji-shufang: styles')

      async function refresh() {
        try {
          const j = await fetchStatus()
          status.set({ phase: j.online ? 'online' : 'offline', url: j.url, journal: j.journal, server: j.server })
        } catch {
          status.set({ phase: 'offline' })
        }
        return status.getSnapshot()
      }

      /** 输入框确认成功才回 ACK；失败保留明确状态，不冒称复制或回填成功。 */
      let citationTask = Promise.resolve()
      function citeIntoComposer(abs, options) {
        const run = async () => {
          try {
            const result = await insertCitation(ctx, abs, options)
            if (!result.ok) toasts.emit(citationErrors[result.reason] || citationErrors.unavailable)
            return result
          } catch (error) {
            console.error('jinji-shufang: cite failed', error)
            return { ok: false, reason: 'unavailable' }
          }
        }
        const result = citationTask.then(run, run)
        citationTask = result.then(() => {}, () => {})
        return result
      }

      // 引用桥：只在书房在线时轮询；Python 服务据此把网页里的「引用」标成已连接
      let busy = false
      async function pull() {
        if (busy || document.hidden) return
        const s = status.getSnapshot()
        if (s.phase !== 'online' || !s.url) return
        busy = true
        try {
          const r = await fetch(PULL_PATH, { cache: 'no-store', credentials: 'same-origin' })
          if (!r.ok) throw new Error(String(r.status))
          const j = await r.json()
          if (!j.online) throw new Error('offline')
          for (const item of j.items ?? []) {
            if (!item || typeof item.abs !== 'string') continue
            const result = await citeIntoComposer(item.abs)
            if (!result.ok) {
              const mention = result.mention || toMention(item.abs)
              const copied = mention && await copyText(mention)
              toasts.emit(copied ? t('citeFailed', { mention }) : t('noSession'))
            }
          }
        } catch {
          status.set({ phase: 'offline' })
        } finally {
          busy = false
        }
      }
      ctx.effect(() => {
        void refresh()
        const poll = setInterval(() => void pull(), POLL_MS)
        const health = setInterval(() => { if (status.getSnapshot().phase !== 'online') void refresh() }, 10_000)
        return () => { clearInterval(poll); clearInterval(health) }
      }, 'jinji-shufang: cite bridge')

      const close = closeTab => {
        closeTab?.() // 右侧栏只关闭当前书房 Tab；不卸载插件、不影响其他 Tab。
        ctx.layout.selectPanel(null)
      }
      const face = () => ({ face: { status, scheme, toasts, refresh, cite: citeIntoComposer, close } })

      // 左栏全局面板
      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID, locale: NS, inject: face,
      }, PanelPage)), 'jinji-shufang: main panel')
      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: NS, label: () => t('panel'),
      }, SealIcon)), 'jinji-shufang: panel entry')

      // 右侧栏 Tab
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: ID,
        kind: TAB_KIND,
        priority: 'extension',
        keepMounted: true,
        title: () => t('tab'),
        guide: [{ order: 30, title: () => t('guide.title'), description: () => t('guide.description'), icon: SealIcon }],
      }), 'jinji-shufang: tab type')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab', key: ID, locale: NS, inject: face,
      }, TabBody)), 'jinji-shufang: tab body')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title', key: ID, locale: NS,
      }, TabTitle)), 'jinji-shufang: tab title')

      // /shufang：在右侧栏打开书房
      ctx.inject(['commandUi'], scope => {
        scope.effect(() => scope.get('commandUi').register({
          name: 'shufang',
          description: () => t('command'),
          available: () => true,
          ui: {
            kind: 'action',
            run: () => {
              void refresh()
              try { ctx.sidebarRight.openTab(TAB_KIND) } catch { ctx.layout.selectPanel(PANEL_ID) }
            },
          },
        }), 'jinji-shufang: /shufang')
      })
    }

    module.exports.apply = apply
    module.exports.inject = inject
    module.exports.name = ID
    module.exports._internals = { toMention, selectedSession, insertCitation, bindReaderBridge, readScheme, zh, en }
    return module.exports
  },
})
