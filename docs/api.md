# API 契约

本页定义插件的全部对外契约：HTTP 路由、配置字段、环境变量与 DSH 声明。契约变更必须同步 CHANGELOG。

## 1. HTTP 路由

由服务端部分（lib/index.js）经 `ctx.webServer.register` 注册：

```
GET /api/jinji-memory?action=index
GET /api/jinji-memory?action=read&rel=<path>
```

### 1.1 `action=index` — 日志与画像索引

响应 `200 application/json`（`cache-control: no-store`）：

```jsonc
{
  "ok": true,
  "root": "/Users/you/Documents/journal",   // 实际使用的日志库根目录
  "journals": [                             // 按时间倒序，最多 120 条
    {
      "rel": ".journal/memory/2608/13-学习-DeepSeek-Harness插件体系.md",
      "ym": "2608",                         // yyMM（零填充）
      "day": 13,                            // 文件名 DD- 前缀
      "title": "学习 DeepSeek Harness 插件体系",
      "summary": "研读官方文档……",          // frontmatter summary（单行截取）
      "tags": ["journal", "research"],      // frontmatter tags
      "sources": ["2608/raw/a.m4a"]         // frontmatter sources
    }
  ],
  "personas": [                             // 排序：README 用户 → product-* → 人物
    {
      "rel": ".journal/identity/趣丸-陈德锋.md",
      "kind": "person",                     // 'user' | 'product' | 'person'
      "region": "趣丸",                     // person：文件名前缀；product：'产品'；user：'本人'
      "title": "陈德锋",
      "summary": "通用工具团队负责人……",
      "tags": ["person", "quwan"]
    }
  ]
}
```

失败响应（同结构 `ok: false`）：

| 场景 | 响应 |
|---|---|
| `.journal` 目录不存在 | `{ "ok": false, "reason": "no-journal", "root": "<root>" }` |
| 内部异常 | `{ "ok": false, "reason": "<message>" }`（HTTP 500） |
| 方法非 GET | `{ "ok": false, "reason": "method-not-allowed" }`（HTTP 405） |

### 1.2 `action=read&rel=…` — 单条全文

响应 `200`：

```jsonc
{ "ok": true, "rel": ".journal/memory/2608/13-….md", "text": "<完整文件内容>" }
```

路径防护（违反即拒绝，HTTP 500 + reason）：

- `rel` 必须以 `.journal/` 开头；
- 路径段不得为空、不得为 `..`；
- 解析后的目标必须位于 `.journal` 之内（`fs.contains` 校验）。

## 2. 配置（行 config）

```yaml
# 在 profile 的 cordis.patch.yml 覆盖
- id: jinji-memory
  config:
    root: /Users/you/Documents/journal
```

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `root` | string | 否 | `DSH_JINJI_ROOT` → `process.cwd()` | 日志库根目录（需含 `.journal/`） |
| `startupContext` | boolean | 否 | `true` | 是否在会话启动时注入记忆摘要与书写规范（见下文） |
| `maxEntries` | number | 否 | `20` | 启动摘要中最多包含的最近日志条数 |
| `maxBytes` | number | 否 | `60000` | 启动摘要文本的字节软上限（超出截断并提示） |

解析优先级：**config.root > 环境变量 `DSH_JINJI_ROOT` > dsh 进程工作目录**。

> 注意 patch 语义：按 id 定位的 patch 会**替换整行 config**（不做深合并），覆盖时无需重述其他字段（本行默认无其他字段）。

## 3. 声明（package.json）

```jsonc
{
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },  // 安装进 profile 自动应用的配置
    "client": { "platform": "web", "inject": [] } // 浏览器部分的声明；必须写成对象，
                                                  // 写成 true 会让模块扫描器报错、整个网页应用启动失败
  },
  "exports": {
    ".": "./lib/index.js",          // 服务端部分（插件加载器直接加载这个文件）
    "./client": "./lib/client.js"   // 浏览器部分（网页从 /plugins/<id>/client.js 获取）
  }
}
```

## 3.1 启动时的记忆注入：摘要 + 书写规范

插件在 Host 侧注册**两个** systemPrompt 动态上下文（排在沙箱/审批策略快照之后）：

| 名称 | 顺序 | 内容 | 作用 |
|---|---|---|---|
| `jinji:memory-summary` | 130 | 最近 `maxEntries` 条日志 + 全部画像档案的 summary 快照 | **读**：让模型开局就带着记忆 |
| `jinji:memory-protocol` | 135 | 记忆书写规范：何时写、日志/画像怎么写、frontmatter 约定、建档门槛 | **写**：让模型像记忆管家一样主动沉淀记忆 |

- **触发**：每个新会话启动时（`agent/session-start` 事件），异步预计算一份记忆快照——最近 `maxEntries` 条日志的 summary + 全部画像档案的 summary；会话期间只计算一次（按会话缓存，SessionStart 语义）；
- **根目录选择**：优先会话自己的工作目录（若其中有 `.journal/`），否则回退到插件的 `root` 配置；书写规范会把实际使用的根目录写进文本（`记忆根目录：<root>`）；
- **约束与降级**：上下文提供器必须是同步的，而文件读取是异步的——所以采用「会话启动时异步预计算 + 提供器同步取缓存」。若首个请求发出前预计算未完成，该次请求暂无摘要；书写规范是静态文本、不依赖快照，始终注入；
- **关闭方式**：`config.startupContext: false`（两块一起关闭）；
- **注意**：若同时使用带同类能力的其他配置（例如另一个记忆 preset），两侧会各注入一份，建议保留其一。

## 4. Client 侧内部契约

| 标识 | 用途 |
|---|---|
| `[data-jinji-nav]` | 入口按钮标记：保证全页唯一（注入前清扫旧实例） |
| `[class*="_newSession"]` | 锚点定位（语义后缀，hash 前缀随构建变） |
| `[class*="_sidebarCol"]` | 侧栏列定位（面板左边界测量 + 点击自动关闭判定） |
| `data-jm-act` | 面板动作（close/back/tab-journal/tab-persona/seg-preview/seg-source） |
| `data-jm-rel` | 卡片 → `read` 请求的 rel 路径 |

## 5. 兼容性边界

- 语义后缀选择器依赖 DSH shell 的 CSS Module 命名约定（`*_newSession`/`*_sidebarCol`）；官方构建若重命名语义后缀需同步（见 [ADR-0001](design-decisions.md#adr-0001) 的风险评估）。
- 前端不依赖任何第三方包、不需要编译；`lib/client.js` 是手写的浏览器模块文件（官方 `window.__ModuleLoader__` 格式，网页在用到时才执行它）。
