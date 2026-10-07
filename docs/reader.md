# 阅读器功能与 journal 约定

本文说明书房读什么、怎样显示、在 DSH 里提供哪些入口。DSH 插件的架构、配置、安全约束与排障见 [维护指南](<maintenance.md>)。

## journal 目录约定

书房按下面的约定读取 journal。目录与笔记规范以 journal 自身的 Agent 指引为准；书房只读，不修改 journal 内容。

- 日志：只读取 `yyMM/DD-title.md`、`.markdown`、`.html`、`.htm`，按有效日历日期排列；不再从标题中猜类型，已知 `tags` 映射为显示类型。
- 同名 MD/HTML：月份目录下同时存在同名 `.md`（或 `.markdown`）与 `.html`（或 `.htm`）时，日志列表合并为一条，以 Markdown 元数据为准；详情切换「原文」（含 frontmatter 的源码）／「预览」（Markdown 渲染）／「HTML」。每篇记住所选视图，引用和打开原文件对应当前视图；归档共用 Markdown 路径。
- 画像：读取 `identity/*.md`；`README.md` 中 `type: person`、`tags: [self]` 表示本人。
- 专家智库：专家只认全局 `~/.agents/skills/*/SKILL.md` 中 `metadata.kind: 专家` 的技能，入口计数只算专家。其余全局技能列在「其他技能」分组，有独立详情页、可搜索、可引用，不计入专家。卡片（悬停显示）和详情页都有「标为专家」按钮：第一次点进入确认态，3 秒内再点才在 SKILL.md 的 frontmatter 写入 `metadata.kind: 专家`，其余字节不动；journal 内的技能、单行 `metadata` 写法或已有其他 `kind` 时拒绝并提示手动处理。journal 内技能和专题目录文档不收录。方法卡已停用，不读取 `metadata.card`。
- 专家/技能详情：页头为名称、类型、熟悉度刻度与调用名；正文前是「什么时候请教」（`metadata.triggers`）与描述；右栏为擅长领域、按子目录分组的技能文件（点击在书房打开）和 SKILL.md 位置。
- 宽屏：所有详情页（文档、日志、书卡、阅读、专家、技能）共用「宽屏」开关（快捷键 `w`），正文取消行宽限制并铺满主区；本机记住。HTML/PDF 本身铺满，不显示开关。
- HTML 跟随主题：书房内打开的 HTML 跟随书房深浅色（书房在 DSH 中跟随 DSH 主题，并随之实时切换）。服务在 `/raw/` 返回的 HTML 顶部插入 `static/frame-theme.js`，磁盘文件不变；只在被书房嵌入时生效。识别 `@media (prefers-color-scheme)`、`matchMedia`、根级 `[data-theme]`、`html.dark`/`body.dark`、主题类 `localStorage` 键与 `color-scheme: light dark`。只写了浅色的页面保持原样；跨域页面无法跟随。
- 交互性能：归档先本地更新界面（约 2 ms），再写库外归档文件，失败自动回滚；服务端在缓存索引上重放归档状态，不重扫磁盘。索引带版本号，轮询用 `?since=<version>`，无变化只回一行。列表索引不含完整 frontmatter。技能目录根的解析短暂缓存。Markdown 渲染库随项目分发（`static/vendor/`），不依赖 CDN。
- 书架：按 `type: book` 汇总 `yyMM/DD-title.md` 日志或 `yyMM/DD-title/` 内的 Markdown 书卡。书卡本身就是全书 Markdown（导读在 `<!-- book-text… -->` 标记前，全文在其后），书卡页只显示导读；`book_source`、`book_cover`、`book_package` 及旧字段 `book_text` 相对于书卡目录解析。
- 仅保留五个入口（人物画像、产品画像、阅读书架、日志流水、专家智库），不设「成果资料」或按标签筛选的专题入口。普通成品文件不单独索引或搜索；仍可从日志中的链接打开，并保留包内相对资源。原始素材 `raw`、隐藏目录、依赖与构建目录不进入索引。
- 日志 `sources` 可展开并打开：`yyMM/raw/...` 按 journal 根目录解析，显式 `./`、`../` 按文档目录解析；自然语言 `source` 只展示，不猜路径。
- 默认技能根目录仅为 `~/.agents/skills`；`skill_roots` 可用于测试或显式替换根目录。journal 内文件保持只读。
- 不加载旧目录规则，不重定向残留旧链接，不导入旧归档记录。浏览器阅读历史、位置与筛选状态使用新的 v2 存储键，从首页重新开始；主题设置保留。
- 收藏：所有能在书房打开的内容（日志、画像、书卡、专家、技能及其文件）都可收藏。详情页页头、卡片、时间线、书架和技能卡上有星标按钮，详情页快捷键 `s`；首页各入口卡片列出本入口最近的 3 项收藏（不再单设「我的收藏」区块），点条目直接打开；不属于五个入口的文件收藏只在详情页显示星标。收藏与归档相互独立；同名 MD/HTML 收藏记在 Markdown 上；文件被删后标为「文件已不存在」，可取消。与归档一样先本地更新、再写库外文件，失败自动回滚。
- 设置页（`#/setup`）：查看并修改 journal 位置，保存到本地配置（`JINJI_CONFIG` 或 `server/wiki.config.json`），服务原地重启。目录不存在或为空时可勾选「生成起步骨架」，从 `starter/journal` 复制 `AGENTS.md`、`identity/README.md`、档案模板和一篇说明日志。拒绝根目录、主目录本身、书房程序目录和状态目录。journal 由 `JINJI_JOURNAL` 指定时只能初始化当前目录。
- **不修改 journal 内容**（初始化空目录除外）。 归档默认存于 `~/.local/share/jinji-reader/<journal-id>/archive.json`，按 journal 路径隔离；可用 `JINJI_STATE_DIR` 改状态根目录，或用 `archive_file` 指定库外位置。拒绝将归档写回 journal。收藏同理：默认存于同目录 `favorites.json`，可用 `favorites_file` 指定库外位置，拒绝写回 journal。

## DSH 中的入口

- **Client（`lib/client.js`）**：
  - 左栏「谨迹书房」全局面板；
  - 右侧栏引导页的「谨迹书房」Tab，可以边读边聊；
  - `/shufang` 命令，在右侧栏打开书房；
  - 右上角悬浮的关闭图标（32 px，半透明底，悬停显示「关闭书房，返回对话」提示，使用 DSH 主题令牌）：不占整行，书房页面为它留出右上角空间；主面板返回当前对话，右侧栏只关闭当前书房 Tab 并返回对话；连接中或离线时也可使用，不停服务、不禁用插件；
  - 主题：读取 DSH `theme` 服务的当前深浅色写入书房 URL（首屏不闪），并订阅 `theme/change` 实时通知书房；书房内的切换按钮在 DSH 中隐藏；
  - 嵌入页直接回填到当前会话；独立网页保留每 0.7 秒取引用队列的兼容路径。
- 页面本身仍由 Python 服务提供，通过 iframe 嵌入。浏览器本地保存上次分类、文档、主区/列表滚动位置和筛选词；左栏面板和右侧栏分别记忆。重新打开或刷新恢复位置，点击首页仍可主动回首页。HTML 内页可恢复滚动；浏览器内置 PDF 查看器不保证恢复页内位置。

## 引用

- **DSH 内嵌书房**：`POST /api/cite` 只校验/解析路径（`delivery: parent`，不入队）→ 向所属 DSH 页面发送 `postMessage` → 根据 `retainedBy.mainView` 选择当前会话 → 切回对话并等待输入框挂载/草稿恢复 → 插入可见的 `@路径` → 核对草稿与输入框 DOM → 聚焦输入框。右侧书房只关闭发起引用的 Tab。只回填、不发送、不覆盖原草稿；期间切换会话就停止写入。不存在会话、输入框忙碌、连接超时或内容未变化均不报成功。
- **独立网页**：`POST /api/cite` 排队 → DSH 每 0.7 秒经 `/jinji-shufang/cite-pull` 取走。网页只提示「已加入引用队列」，不把入队当作回填成功。没有桥连接时复制到剪贴板。
