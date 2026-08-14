# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本遵循语义化版本。

## [Unreleased]

## [0.2.0] - 2026-08-14

### Added（文档架构优先）

- 文档体系：`docs/architecture.md`（双半架构 / 数据流 / DSH 集成点 / 架构图）、`docs/api.md`（HTTP 路由契约 / 配置 / 声明 / 兼容性边界）、`docs/design-decisions.md`（ADR-0001 ~ 0006）、`docs/development.md`（开发循环 / 调试 / 验证清单 / 常见坑）
- `CONTRIBUTING.md`（文档优先原则 / 变更分类 / 提交规范）、`CHANGELOG.md`（本文件）
- `examples/profile-patch.yml`（日志库根目录覆盖示例）
- 开发者脚本：`npm run check`（双半语法检查）、`npm run smoke`（mock 驱动双半冒烟，`scripts/smoke.mjs`）、`npm run pack`（发布内容核对）
- README 重构为文档体系入口（快速开始 → 文档导航 → 契约速查）

### Changed

- 移除包内机器专属路径：`config.root` > `DSH_JINJI_ROOT` > `process.cwd()` 三级解析（ADR-0005）
- `cordis.patch.yml` 不再携带默认 `root`；个人部署经 profile patch 覆盖
- 代码头注释对齐文档术语（Host/Client 半、三级解析、安全模型）

## [0.1.0] - 2026-08-13

### Added

- 双半插件骨架：`dsh.bundle` + `dsh.client`（零构建）
- Host 半：`fs` 服务数据路由 `GET /api/jinji-memory`（index / read，路径防护）
- Client 半：侧栏「记忆」幽灵按钮（DOM 注入 New Session 下方，计算样式拷贝）、日志/画像浏览面板（纯 DOM，DSH 深色 9 色主题，内容区定位，侧栏点击自动关闭）
- MIT License
