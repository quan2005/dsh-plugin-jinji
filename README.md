# 谨迹书房 · dsh-plugin-jinji

[![CI](https://github.com/quan2005/dsh-plugin-jinji/actions/workflows/ci.yml/badge.svg)](https://github.com/quan2005/dsh-plugin-jinji/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **English summary.** Jinji Reader is a [DeepSeek Harness (DSH)](https://github.com/deepseek-ai) plugin that turns a local Markdown journal into a read-only wiki inside DSH. Browse logs, people and product profiles, a bookshelf and skills in a side panel, search full text, and insert `@path` citations into the current conversation's input box without ever writing to the journal. A zero-dependency Python service renders the content; the plugin embeds it and bridges citations. Documentation is in Chinese.

谨迹书房是 DeepSeek Harness（DSH）插件，把本机的 Markdown 日志库（journal）变成 DSH 里的只读 Wiki：边读边聊，一键把文档以 `@路径` 引用进当前会话的输入框。书房只负责读、找、引用；除了你在设置页点「初始化」时往空目录里生成起步骨架，**从不修改 journal**。

## 功能

- **五个入口**：人物画像、产品画像、阅读书架、日志流水、专家智库，入口由配置决定。
- **全文检索**：标题与正文检索，`/` 或 `⌘K` 唤起。
- **DSH 内嵌**：左栏全局面板、右侧栏 Tab（边读边聊）、`/shufang` 命令；主题跟随 DSH 深浅色。
- **引用回填**：只写入当前会话的输入框草稿，不覆盖原草稿、不发送消息；无法确认写入时不报成功。
- **书架**：书卡就是整本书的 Markdown，书卡页显示导读，同名 HTML 是阅读入口。
- **归档与收藏**：状态写在 journal 之外（默认 `~/.local/share/jinji-reader/`），按 journal 隔离。

功能细节与 journal 目录约定见 [docs/reader.md](docs/reader.md)。

## 环境要求

- [DeepSeek Harness](https://github.com/deepseek-ai) 桌面版
- Python 3.10+（服务只用标准库）
- Node.js 20+（仅插件检查脚本需要；插件本身无需构建）

## 安装

1. 克隆仓库：

   ```sh
   git clone https://github.com/quan2005/dsh-plugin-jinji.git
   cd dsh-plugin-jinji
   ```

2. 在 DSH 插件管理器中以本地目录（link）方式安装 `dsh-plugin/`，启用组合包 `dsh-plugin-jinji-reader`。插件启用时会自动拉起阅读器服务（`127.0.0.1:4417`）。安装、配置覆盖与生效方式见 [维护指南 §3](docs/maintenance.md#3-安装配置与进程生命周期)。

3. 在 DSH 左栏点「谨迹书房」，或在对话中输入 `/shufang` 在右侧栏打开。

4. 设置笔记库：点左栏底部的齿轮（`#/setup`），填 journal 目录后保存。
   - 已有笔记库：直接选它的目录。
   - 从零开始：填一个新目录或空目录，勾选「生成起步骨架」。书房会建好 `AGENTS.md`、`identity/README.md`、人物与产品档案模板和一篇说明日志；把素材交给 AI 助手，它按 `AGENTS.md` 整理成书房能读的日志和档案。

   保存写入本地 `server/wiki.config.json`，服务原地重启后切到新目录。初始化只在目录不存在或为空时可用，不覆盖任何文件。

不经 DSH 也可以单独运行阅读器网页：`make serve`，然后打开 <http://127.0.0.1:4417>。

## 配置

阅读器按顺序读取配置：环境变量 `JINJI_CONFIG` → `server/wiki.config.json`（本地文件，不入库）→ [`server/wiki.config.example.json`](server/wiki.config.example.json)。

| 字段 | 说明 |
|---|---|
| `journal` | 日志库目录，可在设置页修改；环境变量 `JINJI_JOURNAL`（或 DSH 插件配置的 `journal`）优先，此时设置页只能初始化、不能换位置 |
| `port` | 服务端口，默认 `4417`；环境变量 `JINJI_PORT` 优先 |
| `skill_roots` | 技能目录，默认 `~/.agents/skills`，用于「专家智库」 |
| `extra_roots` | 允许打开的 journal 以外目录 |
| `archive_file` / `favorites_file` | 归档、收藏记录的库外位置；不可指向 journal 内 |
| `categories` | 入口列表。`kind` 取 `timeline`、`portrait`、`shelf`、`experts` |

状态根目录可用 `JINJI_STATE_DIR` 改。DSH 插件自身的配置（端口、Python、journal、服务入口、是否预启动）写在 profile 的 `cordis.patch.yml`，见 [dsh-plugin/cordis.patch.yml](dsh-plugin/cordis.patch.yml)。

## 项目结构

| 路径 | 作用 |
|---|---|
| [`dsh-plugin/`](dsh-plugin) | DSH 插件：Host 负责拉起服务与鉴权路由，Client 负责面板、Tab、命令、主题与引用回填；手写 JS，零依赖、无构建 |
| [`server/server.py`](server/server.py) | Python 标准库服务：索引、检索、渲染、路径边界；journal 只读（初始化空目录除外） |
| [`starter/journal/`](starter/journal) | 设置页「初始化」复制的起步骨架；文件名和内容里的 `{{yyMM}}`、`{{DD}}`、`{{date}}` 换成当天日期 |
| [`server/static/`](server/static) | 阅读器单页前端，Markdown 渲染库随仓库分发，不依赖 CDN |
| [`server/tests/`](server/tests) | 后端单元测试与阅读器浏览器回归，只使用临时生成的 journal |
| [`docs/`](docs) | 功能说明与维护指南 |

## 开发

```sh
make check          # ruff 静态检查 + 插件冒烟 + 后端单测
make test-browser   # 浏览器回归，需要 Python Playwright 与 Chromium
```

改动怎样在 DSH 中生效、怎样核对 DSH 接口、必须保留的安全约束，见 [维护指南](docs/maintenance.md)。贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 安全

服务只监听 `127.0.0.1`，DSH 路由沿用 DSH 的浏览器会话鉴权。发现漏洞请按 [SECURITY.md](SECURITY.md) 私下报告。

## 许可

[MIT](LICENSE) © 2026 yanwu
