# API 契约

本页定义插件的全部对外契约：HTTP 路由、配置字段、环境变量与 DSH 声明。契约变更必须同步 CHANGELOG。

## 1. HTTP 路由

由服务端部分（lib/index.js）经 `ctx.webServer.register` 注册：

```
GET  /api/jinji-memory?action=index
GET  /api/jinji-memory?action=read&rel=<path>
GET  /api/jinji-memory?action=config
POST /api/jinji-memory?action=config
POST /api/jinji-memory?action=install-preset
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

> 性能：index 带条目级指纹缓存（对调用方透明）——每个文件按 stat 指纹（fs 服务的 `version` 令牌，或 mtimeMs+size）判断是否变更，未变更的直接复用解析结果，指纹不可用时退化为直读；文件一变即自动重读，不会给陈旧列表。

### 1.2 `action=read&rel=…` — 单条全文

响应 `200`：

```jsonc
{ "ok": true, "rel": ".journal/memory/2608/13-….md", "text": "<完整文件内容>" }
```

路径防护（违反即拒绝，HTTP 500 + reason）：

- `rel` 必须以 `.journal/` 开头；
- 路径段不得为空、不得为 `..`；
- 解析后的目标必须位于 `.journal` 之内（`fs.contains` 校验）。

### 1.3 `action=config` — 配置的读取与保存

`GET` 响应 `200`：

```jsonc
{
  "ok": true,
  "config": { "maxEntries": 20, "maxPersonas": 30, "maxBytes": 60000, "startupContext": true },
  "defaults": { /* 内置默认，同结构 */ },
  "file": ".jinji-memory.json",                      // 配置文件名（位于记忆根目录下）
  "preset": { "id": "jinji", "available": true, "installed": false }  // 「谨迹秘书」预设状态
}
```

`POST` 请求体为 JSON 对象，只接受配置表列出的四个字段（可部分提交）：

- 全部字段逐一校验（类型 + 取值范围），任一字段非法 → `400 { ok: false, reason }`，不落盘；
- 校验通过 → **读-改-写**：以磁盘上的现配置文件为基底（读不到/损坏时以运行时配置为基底），只覆盖本次提交的字段，原子写回 `<root>/.jinji-memory.json`（`fs.writeText`），响应 `200 { ok: true, config }`。两个 DSH 会话并行保存不会把对方刚写的字段打回旧值；磁盘上其他会话写入的未知字段原样保留；
- 保存即时生效：下一个新会话的启动注入立即采用新值（进行中的会话仍用会话开始时的快照）。

### 1.4 `action=install-preset` — 安装「谨迹秘书」Agent 预设

`POST`（无请求体）：

- 已安装 → `200 { ok: true, already: true }`（幂等，含安装中被并发抢先进度的竞态）；
- 未安装 → 经 roster 官方创作通道 `copy('standard', 'jinji', '谨迹秘书')` 复制当前 standard 预设，把 persona 行整段替换为秘书人设（书写规范全文，`{{model}}` / `{{cwd}}` 模板变量保留），补写 `preset.yml` 的描述，最后 `standingKeyFor` 挂载校验；预设目录下的文件用 node:fs 直写（preset 根目录在 fs 服务写沙箱之外，见 ADR-0013）；全部成功 → `200 { ok: true, already: false }`；
- roster 服务不可用 / persona 行缺失 / 挂载校验失败 → `500 { ok: false, reason }`；
- 非 POST → `405`。

## 2. 配置

**推荐用界面改**：「设置 → 插件配置 → 谨迹记忆」卡片，保存在记忆根目录的 `.jinji-memory.json`，无需重启、新会话生效。

也可以在 profile 的 `cordis.patch.yml` 里覆盖（改完需重启 dsh web）：

```yaml
- id: jinji-memory
  config:
    root: /Users/you/Documents/journal
```

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `root` | string | `DSH_JINJI_ROOT` → `process.cwd()` | 日志库根目录（需含 `.journal/`）。**只能在 cordis config / 环境变量里配**（配置文件自己就放在 root 下） |
| `maxEntries` | int 1–200 | `20` | 启动摘要里带多少条最近日志 |
| `maxPersonas` | int 1–500 | `30` | 启动摘要里带多少条画像（超出截断并标注「仅列出前 N 条」） |
| `maxBytes` | int 4096–500000 | `60000` | 启动摘要文本的字节软上限（超出截断并提示） |
| `startupContext` | boolean | `true` | 是否注入启动摘要 |

生效优先级：**配置文件（`.jinji-memory.json`）> cordis config > 内置默认**；`root` 的解析优先级仍是 **config.root > 环境变量 `DSH_JINJI_ROOT` > dsh 进程工作目录**。

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

## 3.1 启动时的记忆摘要注入

插件在 Host 侧注册一个 **systemPrompt 动态上下文**（名称 `jinji:memory-summary`，顺序 130，排在沙箱/审批策略快照之后）：最近 `maxEntries` 条日志 + 前 `maxPersonas` 条画像档案的 summary 快照，让模型开局就带着记忆。

- **触发**：每个新会话启动时（`agent/session-start` 事件），异步预计算一份记忆快照；会话期间只计算一次（按会话缓存，SessionStart 语义）；
- **根目录选择**：优先会话自己的工作目录（若其中有 `.journal/`），否则回退到插件的 `root` 配置；
- **约束与降级**：上下文提供器必须是同步的，而文件读取是异步的——所以采用「会话启动时异步预计算 + 提供器同步取缓存」。若首个请求发出前预计算未完成，该次请求暂无摘要，后续组装自动补上；
- **配置的生效时机**：提供器每次组装都读当前生效配置——在设置卡片里保存后**无需重启**，下一个新会话立即采用新值（进行中的会话保持会话开始时的快照）；
- **关闭方式**：`startupContext: false`；
- **书写规范不在此注入**：主动书写的规则由「谨迹秘书」Agent 预设承载（见下节），普通会话的提示词不带任何书写规则。

## 3.2 「谨迹秘书」Agent 预设

主动书写能力 = 一个用户自选的 Agent 预设（见 [ADR-0012](design-decisions.md#adr-0012)）：

- **安装**：设置卡片的「安装」按钮（或 `POST action=install-preset`）。安装走 roster 官方创作通道：复制当前 `standard` 预设 → persona 行整段替换为秘书人设（含书写规范全文与实际记忆根目录）→ 挂载校验；
- **使用**：新建会话时在预设选择器里选「谨迹秘书」；该会话的人设段落（`deployment:persona`，order 0）携带书写规范，KV-cache 前缀稳定；
- **自定义**：预设就是用户预设目录里的普通文本文件（`~/.dsh/.agent-presets/jinji/`），直接编辑 persona 文本即可改规则；
- **删除**：「Agent 预设」设置页可删（它落在用户根目录，roster 允许删除）；删除不影响插件其他能力；
- **注意**：预设复制的是安装时刻的 standard；DSH 大版本升级后想跟进，删除重装即可。

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
