# dsh-plugin-jinji · 谨迹记忆面板

> DeepSeek Harness 双半 UI 插件：左侧栏「记忆」入口 + 日志 / 画像浏览面板。**零构建、零运行时依赖**。

[![GitHub release](https://img.shields.io/github/v/release/quan2005/dsh-plugin-jinji)](https://github.com/quan2005/dsh-plugin-jinji/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## 快速开始

```sh
dsh plugin --profile web add github:quan2005/dsh-plugin-jinji
# 重启 dsh web
```

日志库根目录（含 `.journal/` 的目录）三级解析：行 `config.root` > `DSH_JINJI_ROOT` > dsh 进程 cwd。个人路径覆盖示例见 [examples/profile-patch.yml](examples/profile-patch.yml)。

## 功能一览

- 侧栏「记忆」幽灵按钮（New Session 下方，与官方按钮同组观感，宽/窄栏自适应）
- 日志浏览：`.journal/memory/yyMM/*.md` 月度瀑布流卡片
- 画像浏览：`.journal/identity/*.md` 按本人 / 产品 / 区域分组
- 分栏详情：预览（轻量 Markdown 渲染）/ 源码切换 + 月度列表
- 面板只覆盖内容区、点击侧栏自动关闭、Esc / × 关闭
- 完整沿用 DSH 深色 9 色主题；全链路数据转义 + 路径防护

## 文档（开发者优先）

| 文档 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 双半架构、数据流、DSH 集成点（seam 契约）、关键机制、架构图 |
| [docs/api.md](docs/api.md) | HTTP 路由契约、配置字段、包声明、内部标识、兼容性边界 |
| [docs/design-decisions.md](docs/design-decisions.md) | ADR-0001~0006：每个取舍的背景 / 决策 / 理由 / 风险 |
| [docs/development.md](docs/development.md) | 开发循环、调试方法、验证清单、历史常见坑 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献规范：文档优先、变更分类、提交约定 |
| [CHANGELOG.md](CHANGELOG.md) | 版本历史（Keep a Changelog） |

## 开发

```sh
npm run check    # 双半语法检查（零构建，仅此一步）
npm run smoke    # mock 驱动双半冒烟（scripts/smoke.mjs）
npm run pack     # 发布内容核对（dry-run）
```

## 许可证

[MIT](./LICENSE) © 2026 许汝全 (quan2005)
