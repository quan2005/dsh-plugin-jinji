# dsh-plugin-jinji · 谨迹记忆面板

> DeepSeek Harness 双半 UI 插件：在左侧栏「新会话」按钮下方注入「记忆」入口，点击在内容区打开日志 / 画像浏览面板。**零构建、零运行时依赖**，按 [DeepSeek Harness 官方手册](https://github.com/deepseek-ai/deepseek-harness) 的插件模型实现。

## ✨ 功能

- **侧栏入口**：幽灵按钮样式，「记忆」与新会话同组观感，宽 / 窄栏（rail）自动适配；
- **日志浏览**：读取 `.journal/memory/yyMM/*.md`，按月分组卡片瀑布流（日期角标、家族 tag、summary 摘要、sources 引用 chips）；
- **画像浏览**：读取 `.journal/identity/*.md`，按「本人 / 产品 / 区域」分组（人物 / 产品档案）；
- **详情分栏**：点卡片进入「预览 / 源码」分栏视图，内置轻量 Markdown 渲染器（标题/列表/表格/引用/代码块/加粗），右侧月度列表高亮当前项；
- **面板行为**：只覆盖内容区（左侧栏始终可见可点）；点击侧栏任意位置自动关闭；Esc / × 关闭；
- **DSH 深色主题**：完整沿用 Harness 深色 9 色收敛法（`#0D0F12` 三层背景 + `#5B8DB8` 灰蓝强调 + `#7A828C` 次级文字），与官方 UI 一致；
- **安全**：数据经 `fs` 服务读取，路径防护（仅 `.journal/` 内、拒绝 `..` 与越界），前端所有内容经 HTML 转义。

## 📦 安装

### 从 GitHub

```sh
# git 安装会拉源码，无需构建（本包零构建）
dsh plugin --profile web add github:quan2005/dsh-plugin-jinji
```

### 本地目录 / tarball

```sh
dsh plugin --profile web add /path/to/dsh-plugin-jinji
# 或
pnpm pack && dsh plugin --profile web add ./dsh-plugin-jinji-0.1.0.tgz
```

安装后重启 `dsh web`（client bundle 修订在启动时固化）。

## ⚙️ 配置

日志库根目录的解析顺序：**`config.root` > 环境变量 `DSH_JINJI_ROOT` > dsh 进程工作目录**。

在 profile 的 `cordis.patch.yml` 里按 id 覆盖：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: jinji-memory
  config:
    root: /Users/you/Documents/journal
```

`root` 指向的目录需包含 `.journal/`（`memory/yyMM/*.md` 日志与 `identity/*.md` 画像）。

## 🔧 开发

零构建双半结构：

| 文件 | 内容 |
|---|---|
| `lib/index.js` | Host 半：`fs` 服务读日志库 + `webServer` 注册 `GET /api/jinji-memory`（`action=index` / `action=read&rel=`） |
| `lib/client.js` | Client 半：手写 `window.__ModuleLoader__.load` bundle，纯 DOM 渲染，`fetch` 取数 |
| `cordis.patch.yml` | 组合包层：插入双半行 |

改完 `lib/client.js` 后必须重启 `dsh web`。校验：

```sh
node --check lib/index.js && node --check lib/client.js
dsh --profile web --dump-config    # 确认 jinji_memory 行与 # == dsh-plugin-jinji 层
```

## 🚀 发布

```sh
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0
# 可选：npm publish（已构建产物随包分发，无需 prepare 脚本）
```

## 📄 许可证

[MIT](./LICENSE) © 2026 许汝全 (quan2005)
