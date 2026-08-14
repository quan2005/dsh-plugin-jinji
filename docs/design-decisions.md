# 设计决策记录（ADR）

记录本项目的关键架构决策与取舍。每条包含背景、决策、理由与风险。

## ADR-0001：入口按钮采用 DOM 注入而非槽位注册

- **状态**：已接受（2026-08）
- **背景**：期望入口位于左侧栏「新会话」按钮下方。DSH 侧栏官方槽位只有 `sidebar.workspaces` / `sidebar.settings` / `sidebar.footer.action`，New Session 是 shell 私有 DOM，**无官方槽位**（官方手册亦确认）。
- **决策**：用语义后缀选择器 `[class*="_newSession"]` 定位锚点 + `insertAdjacentElement('afterend')` 注入按钮；`MutationObserver` 兜底重建；样式经 `getComputedStyle` 逐属性拷贝内联（幽灵按钮、不硬编码色值）。
- **理由**：
  - 位置精确满足产品需求（与新会话同组）；
  - 计算样式拷贝保证任何主题下与官方按钮像素级一致；
  - 不依赖槽位渲染出口（动态注册的 occupant 曾出现「目录 active 但未渲染」的环境差异）。
- **风险**：依赖 shell 的 CSS Module 语义后缀；官方构建改名需同步。缓解：选择器用 `class*=` 只锚定语义后缀（hash 前缀随构建变）；锚点找不到时按钮不出现、不影响其他功能。

## ADR-0002：面板采用纯 DOM 渲染而非 React 槽位组件

- **状态**：已接受（2026-08）
- **背景**：面板最初注册在 `shell.overlay` 槽位（React 组件）。实测出现「槽位目录 active、组件未挂载」的环境性故障，且动态注册的 occupant 优先级为负、渲染出口行为不可观测。
- **决策**：面板与按钮同机制——`document.createElement` 挂 `document.body`，innerHTML 模板（数据全量 `esc()` 转义）+ 事件二次绑定。
- **理由**：
  - 渲染链路只有 `document` 一个依赖，行为确定；
  - 顺带消除 React 运行时依赖，维持零依赖；
  - 动态插件与持久化包两套载体行为完全一致。
- **风险**：需自维护转义与事件绑定纪律（已封装 `esc()`/`renderPanel()` 单一渲染入口）；innerHTML 重绘有轻微性能成本（120 卡片面 <10ms，可接受）。

## ADR-0003：零构建分发（手写 ModuleLoader bundle）

- **状态**：已接受（2026-08）
- **背景**：官方客户端包经 Vite 管线构建为 `window.__ModuleLoader__.load` bundle；独立项目引入构建链成本高。
- **决策**：`lib/client.js` 手写惰性 CJS bundle（官方同款格式），无 tsdown/打包器、无依赖。
- **理由**：格式简单（factory + module.exports），手写可控；发布 tarball 即成品，无需 prepare 构建脚本。
- **风险**：无类型检查/压缩；以 `node --check` 与 mock 冒烟测试兜底（见 [development.md](development.md#验证清单)）。

## ADR-0004：面板内容区定位（不遮挡侧栏）

- **状态**：已接受（2026-08）
- **背景**：全屏覆盖遮挡左侧导航，破坏导航连续性（用户明确反馈）。
- **决策**：`position: fixed` 但 `left = 侧栏实测宽度`，打开期间随 resize/DOM 变更重测；点击侧栏任意处自动关闭。
- **理由**：类「设置面板」的打开体验；导航与面板可并存交互。
- **风险**：依赖 `[class*="_sidebarCol"]` 语义后缀测宽（同 ADR-0001 的缓解策略）。

## ADR-0005：日志库根目录三级解析（config > env > cwd）

- **状态**：已接受（2026-08）
- **背景**：早期版本把个人路径 `/Users/yanwu/Documents/journal` 硬编码在包内，无法公开发布。
- **决策**：`config.root` > `DSH_JINJI_ROOT` > `process.cwd()` 三级解析；包内不带任何机器专属路径。
- **理由**：包保持通用可发布；个人部署通过 profile 的 patch 层覆盖（id 定位替换整行 config）。
- **风险**：cwd 兜底在无 `.journal` 的目录启动时返回 `no-journal`（面板显示加载失败，行为明确）。

## ADR-0006：数据经 `ctx.fs` 服务而非直接 `node:fs`

- **状态**：已接受（2026-08）
- **背景**：DSH 的文件访问应尊重沙箱策略层。
- **决策**：Host 半注入 `fs` 服务，全部文件操作走 `resolve/listDir/readText/contains`。
- **理由**：沙箱/策略可替换（远程沙箱后端下自动成立）；路径防护在服务契约上实现。
- **风险**：`fs` 服务缺席时插件进入等待（inject 语义），不产生半初始化状态。
