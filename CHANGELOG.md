# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本遵循语义化版本。

## [Unreleased]

## [0.6.0] - 2026-08-14

### Added

- 记忆面板搜索：列表顶部新增搜索框，按标题 / 摘要 / 标签即时过滤日志与画像（多关键词 AND、大小写不敏感），无匹配时显示空状态；搜索词在日志/画像间切换时保留，关闭面板重置
- 键盘操作：面板内 ↑/↓ 高亮条目（高亮到未渲染分组时自动加载并滚动到位）、Enter 打开详情；Esc 智能分级——先清搜索词、其次退出详情、最后关面板；焦点在表单元素里时不劫持按键
- 窄屏适配：≤960px 时卡片网格自动切单列，布局不塌
- CI：push / PR 自动跑语法检查与冒烟自检（`.github/workflows/check.yml`，零依赖秒级完成）
- npm 发布流水线：GitHub Release 发布时自动校验 tag 与版本一致性并 `npm publish`（`.github/workflows/publish.yml`；首次使用需在仓库配置 `NPM_TOKEN` secret）；npm 包名 `dsh-plugin-jinji` 已确认可用，安装文档补充 npm 方式
- 文档：ADR-0013（预设安装写通道）、ADR-0014（指纹缓存与配置读-改-写）、ADR-0015（浏览器侧搜索过滤）

### Changed

- 大库提速：`action=index` 带条目级指纹缓存（fs 服务 `version` 令牌或 mtimeMs+size），未变更的文件不再重复解析，重开面板不再全量重读；指纹不可用时自动退化为直读，宁慢不给陈旧数据；读全文与启动摘要不走缓存
- 配置保存改「读-改-写」：以磁盘现文件为基底只覆盖本次提交的字段，两个 DSH 会话并行保存不再互相覆盖（旧实现后保存的会把对方刚写的字段打回旧值）
- 列表渐进渲染：先渲染前 3 个分组，滚动到底自动追加（IntersectionObserver 不可用时逐级降级），大库渲染不卡
- 冒烟自检扩至 57 断言（+24：缓存命中/失效/降级、并发写共存、搜索过滤纯函数、CSS 与键盘高亮）

### Fixed

- 修复「谨迹秘书」预设安装在默认部署下必然失败的问题：预设目录（`~/.dsh/.agent-presets/`）在 fs 服务写沙箱之外，改用 node:fs 直写（与 roster 自身做法一致）；同时把路径拼接改为 `node:path` 的 `dirname`/`join`（原正则截取在 Windows 路径下会失配），并防御安装竞态（并发抢装时幂等返回已安装）

## [0.5.0] - 2026-08-14

### Removed（破坏性变更）

- 移除书写规范的全局注入（`jinji:memory-protocol` 上下文）与 `writeProtocol` / `writeProtocolEnabled` 配置字段——书写规则不再塞进每个会话的提示词（ADR-0012；`.jinji-memory.json` 里残留的这两个键会被静默忽略）

### Added

- 「谨迹秘书」Agent 预设：设置卡片一键安装（roster 官方 `copy` 通道复制当前 standard + persona 行整段替换为秘书人设 + `standingKeyFor` 挂载校验）；新建会话选用该预设即获得主动书写能力，普通会话不受影响
- 数据路由新增 `POST /api/jinji-memory?action=install-preset`；`GET action=config` 返回预设安装状态（`preset.available/installed`）
- 自检：smoke 33 断言，新增预设安装链路（persona 改写、其余行保持完整、重复安装幂等、状态回读）

### Changed

- 设置卡片：书写规范开关 / 自定义文本框替换为「Agent 预设『谨迹秘书』」安装行
- 文档：api.md 新增 3.2 预设章节、architecture.md 2.7 改写为预设承载书写规范、ADR-0010 标记被 ADR-0012 取代

## [0.4.4] - 2026-08-14

### Changed

- 「× 关闭」统一固定在面板右上角：列表模式与计数组成右侧组，详情模式与预览/源码切换同组，两种模式下位置一致

## [0.4.3] - 2026-08-14

### Changed

- 详情页顶栏合并为一条：返回列表（左）+ 标题（中，超长省略）+ 预览/源码切换 + 关闭（右），不再叠两层横条；日志/画像切换与计数只在列表模式显示
- 预览正文开头与标题相同的 H1 自动去掉，避免标题重复显示

## [0.4.2] - 2026-08-14

### Changed

- 记忆面板背景色统一改为 `#151517`（外层、顶栏、内容区、预览区、右侧列表）

## [0.4.1] - 2026-08-14

### Changed

- 设置卡片对齐官方 PluginCard 标准设计：默认收起（标题 + 一句话描述 + 箭头），点击展开字段；有未保存修改时标题旁显示「未保存」徽标；底部按钮改为官方语义的「放弃修改 / 保存」（无改动或字段非法时禁用）；字段样式对齐官方 ValueField（标签在上、全宽输入、提示在下、字段间分隔线）

## [0.4.0] - 2026-08-14

### Added

- 可视化配置：「设置 → 插件配置」新增「谨迹记忆」卡片（注册进官方开放的 `settings.plugin.item` 槽位），可改：摘要日志条数、摘要画像条数、摘要字节上限、启动注入总开关、书写规范开关、自定义书写规范提示词
- 新配置字段：`maxPersonas`（默认 30，启动摘要的画像条数，超出标注「仅列出前 N 条」）、`writeProtocolEnabled`（默认 true）、`writeProtocol`（默认空 = 内置规范，支持 `__MEMORY_ROOT__` 占位符）
- 配置持久化：保存写入记忆根目录的 `.jinji-memory.json`（`fs.writeText` 原子写，逐字段校验），随记忆库一起迁移；生效优先级：配置文件 > cordis config > 内置默认
- 数据路由新增 `GET/POST /api/jinji-memory?action=config`
- README 新增面板效果图（`docs/images/screenshot.png`）
- 文档：api.md 配置章节重写、architecture.md 新增 4.5 配置机制、ADR-0011

### Changed

- 配置保存后**无需重启**：启动注入的上下文提供器每次组装实时读取生效配置，下一个新会话立即采用新值（`startupContext: false` 从「启动时不注册」改为「注册但返回空」，可随时在界面重新打开）
- 冒烟测试改为自包含（临时目录造最小日志库，不再依赖真实库路径），扩至 32 断言

## [0.3.1] - 2026-08-14

### Added

- 主动记录：启动注入新增「记忆书写规范」（`jinji:memory-protocol`，顺序 135，排在摘要之后）——告诉 AI 会话何时写、日志/画像怎么写、frontmatter 与建档约定，让「只装插件」同时拥有读与写（ADR-0010）
- 书写规范动态带出实际记忆根目录（与启动摘要共用同一条会话预计算链路）
- 文档：api.md 启动注入章节改写为「摘要 + 书写规范」、architecture.md 新增 2.7 读写闭环、新增 ADR-0010
- 自检：smoke 扩至 21 断言，覆盖书写规范的注入、顺序与根目录替换


## [0.3.0] - 2026-08-14

### Added

- 启动时的记忆摘要注入：会话启动时自动预计算「最近日志 + 全部画像」的 summary 快照，作为运行时上下文注入模型历史（`agent/session-start` 异步预计算 + systemPrompt 同步提供器，按会话缓存一次）
- 新配置：`startupContext`（开关）/ `maxEntries`（20）/ `maxBytes`（60000）
- 文档：api.md 新增启动注入章节、architecture.md 落地说明、ADR-0009
- 自检：smoke 扩至 16 断言，覆盖注入链路（预计算前为空 → session-start 后快照含日志与画像摘要）


## [0.2.6] - 2026-08-14

### Added

- 双轨记忆写入设计文档：流水记忆（事件流）+ 画像记忆（独立实体画像，从事件流中提炼、反哺事件理解），新增 architecture.md 章节与 ADR-0008，配双轨图


## [0.2.5] - 2026-08-14

### Added

- 记忆系统核心架构写入设计文档：summary 分层加载（写时带摘要、读时先读摘要、全文按需加载），新增 architecture.md 章节与 ADR-0007，配分层加载图


## [0.2.4] - 2026-08-14

### Changed

- 定位表述补充：极简文本记忆系统（纯文本文件、无数据库），以大模型为核心驱动；适合所有需要在 DeepSeek Harness 里拥有记忆能力的人


## [0.2.3] - 2026-08-14

### Changed

- 修正项目定位表述：核心初衷是「把记忆理念与实现原生带进 DeepSeek Harness，无需安装其他软件」，谨迹（JournalClaw）是理念来源而非前置依赖；README、包描述与仓库描述同步


## [0.2.2] - 2026-08-14

### Changed

- 隐私清理：移除项目文件中的个人姓名与机器路径（LICENSE 著作权人改为贡献者集体署名；文档中的示例路径泛化）


## [0.2.1] - 2026-08-14

### Changed

- 全文改用人话：清除「双半 / 双面 / 物化 / 惰性 bundle」等生造术语，统一为「服务端部分 / 浏览器部分」「无需编译」等日常表达
- 代码头注释与 package.json 描述同步改写
- README 新增「这是什么」章节（谨迹 / JournalClaw 背景、插件解决的问题、适合谁看）
- 补充 GitHub 仓库描述与主题标签

## [0.2.0] - 2026-08-14

### Added（文档架构优先）

- 文档体系：`docs/architecture.md`（整体架构 / 数据流 / DSH 集成点 / 架构图）、`docs/api.md`（HTTP 路由契约 / 配置 / 声明 / 兼容性边界）、`docs/design-decisions.md`（ADR-0001 ~ 0006）、`docs/development.md`（开发循环 / 调试 / 验证清单 / 常见坑）
- `CONTRIBUTING.md`（文档优先原则 / 变更分类 / 提交规范）、`CHANGELOG.md`（本文件）
- `examples/profile-patch.yml`（日志库根目录覆盖示例）
- 开发者脚本：`npm run check`（语法检查）、`npm run smoke`（模拟环境自动自检，`scripts/smoke.mjs`）、`npm run pack`（发布内容核对）
- README 重构为文档体系入口（快速开始 → 文档导航 → 契约速查）

### Changed

- 移除包内机器专属路径：`config.root` > `DSH_JINJI_ROOT` > `process.cwd()` 三级解析（ADR-0005）
- `cordis.patch.yml` 不再携带默认 `root`；个人部署经 profile patch 覆盖
- 代码头注释与文档术语对齐（服务端/浏览器部分、三级解析、安全模型）

## [0.1.0] - 2026-08-13

### Added

- 插件骨架（服务端 + 浏览器两部分）：`dsh.bundle` + `dsh.client` 声明（无需编译）
- 服务端部分：`fs` 服务数据接口 `GET /api/jinji-memory`（index / read，路径防护）
- 浏览器部分：侧栏「记忆」按钮（插到 New Session 下方，复制官方按钮样式）、日志/画像浏览面板（不依赖 React，DSH 深色主题，只盖内容区，点侧栏自动关闭）
- MIT License
