# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本遵循语义化版本。

## [Unreleased]

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
