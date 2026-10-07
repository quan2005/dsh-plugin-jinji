# 变更日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 未发布

### 新增

- 开源工程规范：MIT 许可、贡献指南、安全策略、CI、Makefile、ruff 静态检查、Issue/PR 模板。
- 配置示例 `server/wiki.config.example.json`；本地 `server/wiki.config.json` 不再入库，存在时优先生效。
- 分类配置新增 `featured`，决定首页「主线」入口；自定义分类没有专属色时使用强调色。
- 书卡即全书 Markdown：书卡页只显示 `<!-- book-text -->` 标记之前的导读，全文在文档视图中阅读。

### 变更

- 项目只服务于 DeepSeek Harness，移除 Claude Code mod。
- 同名 HTML 与书卡同级时，书包取同名目录而不是整个月份目录。

### 修复

- 阅读模式在窄屏或收起列表时不再残留空的导航列。

## 0.1.0 - 2026-10-07

- 首个版本：DSH 插件（Host/Client）、Python 只读阅读器服务与回归测试。
