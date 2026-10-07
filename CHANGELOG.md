# 变更日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 未发布

### 新增

- 设置页（`#/setup`，左栏齿轮）：填 journal 目录后保存到本地配置，服务原地重启切换；目录不存在或为空时可一键生成起步骨架（`starter/journal`），不覆盖任何文件。journal 未初始化且没有日志时，首页提示去设置。
- 专家智库「其他技能」的卡片和详情页新增「标为专家」按钮，二次确认后写入 `metadata.kind: 专家`。
- 开源工程规范：MIT 许可、贡献指南、安全策略、CI、Makefile、ruff 静态检查、Issue/PR 模板。
- 配置示例 `server/wiki.config.example.json`；本地 `server/wiki.config.json` 不再入库，存在时优先生效。
- 自定义分类没有专属色时使用强调色。
- 书卡即全书 Markdown：书卡页只显示 `<!-- book-text -->` 标记之前的导读，全文在文档视图中阅读。

### 变更

- 首页移除「我的收藏」区块，五张入口卡片改为显示本入口的收藏；卡片描述补全来源与规则（`tagline`）。
- 日志流水的月份柱状图改为新月份在前。
- 移除按标签筛选的日志分类和首页「主线」入口；`timeline` 分类列出全部日志，配置中的 `tags` 不再生效。
- 项目只服务于 DeepSeek Harness，移除 Claude Code mod。
- 同名 HTML 与书卡同级时，书包取同名目录而不是整个月份目录。

### 修复

- 阅读模式在窄屏或收起列表时不再残留空的导航列。
- 窄屏（≤640px）下主区不再是空白：左栏改成底栏后主区被排进 0 宽的列，现显式指定网格列。首页日期行加「设置」链接，窄屏也能进设置页。

## 0.1.0 - 2026-10-07

- 首个版本：DSH 插件（Host/Client）、Python 只读阅读器服务与回归测试。
