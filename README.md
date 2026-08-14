# dsh-plugin-jinji · 谨迹记忆面板

> 一个 DeepSeek Harness 插件：在网页界面的左侧栏加一个「记忆」入口，点开就能浏览你的日志和人物 / 产品画像。**不需要编译，不依赖任何第三方包**。

[![GitHub release](https://img.shields.io/github/v/release/quan2005/dsh-plugin-jinji)](https://github.com/quan2005/dsh-plugin-jinji/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## 这是什么

**谨迹（JournalClaw）** 是一套个人日志系统：每天用录音、截图、粘贴文字记录素材，由 AI 秘书整理成结构化日志（存在 `.journal/memory/` 里），并长期维护人物与产品画像（存在 `.journal/identity/` 里）。

**这个插件**把这份「记忆」带进了 DeepSeek Harness 的网页界面：不用再打开文件管理器翻目录，直接在左侧栏点「记忆」，就能按时间流浏览日志、按分组浏览画像、点开看全文。

适合人群：用谨迹记录日常的人；想参考「如何在 DeepSeek Harness 里做一个带界面入口的插件」的开发者（本项目把每一步设计决策都写成了文档）。

## 装一个

```sh
dsh plugin --profile web add github:quan2005/dsh-plugin-jinji
# 重启 dsh web
```

插件找日志库的顺序：配置文件里写的 `root` → 环境变量 `DSH_JINJI_ROOT` → dsh 启动时所在的目录。示例见 [examples/profile-patch.yml](examples/profile-patch.yml)。

## 能做什么

- 左侧栏「新会话」下方多一个「记忆」按钮，样式和官方按钮一致（收起成窄栏时自动变图标）
- 日志页：按月份分组的卡片瀑布流（日期、主题标签、一句话摘要、来源文件）
- 画像页：按「本人 / 产品 / 所在团队」分组的画像卡片
- 点卡片看详情：左边是排版好的正文（也可切到原始文本），右边是当月日志列表
- 面板只盖住中间区域，左侧栏随时可以点；点侧栏任意位置面板自动收起；Esc 或 × 也能关
- 颜色完全跟随 DeepSeek Harness 官方深色主题；所有内容都做了转义和路径校验，只读不改

## 文档（写给开发者）

| 文档 | 讲什么 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 这个插件怎么分成「服务端部分」和「浏览器部分」、数据怎么流动、用到了哪些官方接口，配图 |
| [docs/api.md](docs/api.md) | 后台接口的完整约定：请求、响应字段、配置项、兼容边界 |
| [docs/design-decisions.md](docs/design-decisions.md) | 每个重要取舍的记录：为什么这么做、理由、有什么风险（ADR-0001 ~ 0006） |
| [docs/development.md](docs/development.md) | 怎么改代码、怎么调试、改完怎么验证、前人踩过的坑 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 想贡献代码时的规矩 |
| [CHANGELOG.md](CHANGELOG.md) | 每个版本改了什么 |

## 开发

```sh
npm run check    # 检查代码语法（本项目无需编译，这是唯一的"检查步骤"）
npm run smoke    # 用模拟环境跑一遍自检（scripts/smoke.mjs）
npm run pack     # 预览发布包里会包含哪些文件
```

## 许可证

[MIT](./LICENSE) © 2026 dsh-plugin-jinji contributors
