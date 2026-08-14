# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本遵循语义化版本。

## [Unreleased]

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
