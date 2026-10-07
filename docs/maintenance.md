# DSH Plugin 维护指南

本项目是谨迹书房的 DSH Plugin 项目。DSH 插件负责启动阅读器、嵌入页面和回填引用；Python 服务负责内容读取、索引和渲染。本项目只服务于 DSH。

本文是 DSH 维护规则的集中入口。项目功能见 [README.md](<../README.md>)，Agent 工作约束见 [AGENTS.md](<../AGENTS.md>)。本文依据 2026-10-07 的项目源码和当时运行中的 Cordis Inspect 结果整理；升级 DSH 后必须重新核对接口，不能把本文当作永久 API 契约。

## 1. 开始维护前

1. 确认工作目录，检查已有改动。不要覆盖用户尚未提交的文件。
2. 判断改动属于 Host、Client、Python 服务还是静态页面。不要把插件问题直接改到 DSH 安装包中。
3. 涉及 DSH 接口时，先按第 5 节检查当前运行时契约，再改代码。
4. 按第 7 节运行对应测试。纯文档改动至少检查链接、命令工作目录和源码一致性。
5. 需要在线验证时，先确认用户允许改变当前 profile；重载后在原来的 DSH 页面验证，不另起一个服务冒充验证完成。
6. 交付时分别说明“已修改”“已测试”“已重载或部署”，未执行的步骤不能记为通过。

## 2. 代码边界与加载入口

| 文件 | 维护职责 |
|---|---|
| [插件清单](<../dsh-plugin/package.json>) | 包名、版本、Host/Client 导出、Web Client 依赖及 bundle patch 入口 |
| [组合层 patch](<../dsh-plugin/cordis.patch.yml>) | 插入 Host 条目 `jinji-shufang`；Client 由清单自动发现 |
| [Host 入口](<../dsh-plugin/lib/host.js>) | 配置归一化、Python 进程生命周期、鉴权路由 |
| [Client 入口](<../dsh-plugin/lib/client.js>) | 面板、右侧 Tab、命令、主题、样式和引用桥 |
| [Python 服务](<../server/server.py>) | journal/技能读取、路径校验、HTTP API、库外状态文件 |
| [配置示例](<../server/wiki.config.example.json>) | journal、技能根目录、分类与 Python 服务默认端口；本地 `server/wiki.config.json`（不入库）存在时优先 |
| [页面脚本](<../server/static/app.js>)、[样式](<../server/static/app.css>)、[HTML 主题桥](<../server/static/frame-theme.js>)、[页面入口](<../server/static/index.html>) | iframe 内的阅读器界面与状态恢复 |

### 不要混淆这些标识

- npm 包名、bundle 名、Client 模块 ID：`dsh-plugin-jinji-reader`。
- patch 条目 ID、Host 导出名、主面板 ID、右侧 Tab kind：`jinji-shufang`。
- 右侧 Tab 类型注册 ID，以及 Tab 内容与标题 Slot 的 key：`dsh-plugin-jinji-reader`，不是 Tab kind。
- locale 命名空间：`jinjiShufang`；命令名：`shufang`，用户输入 `/shufang`。
- 本次 Inspect 返回的 Loader entry：`include:jinji-shufang`。这是运行时查询标识，不要用它替换 patch 中的 `jinji-shufang`。

### 模块形式

- 当前插件版本为 `0.1.0`，要求 Node.js `>=20`，没有第三方运行时 npm 依赖，也没有构建步骤。
- [Host 入口](<../dsh-plugin/lib/host.js>) 使用 ESM，导出 `name`、`inject` 和 `apply`。
- [Client 入口](<../dsh-plugin/lib/client.js>) 是交给 `window.__ModuleLoader__.load` 的手写工厂，通过 `require('react')` 使用 DSH 提供的 React，再返回 `module.exports`。不要直接改成浏览器原生 ESM、引入 Node API 或另打包一份 React。
- 清单中的 `dsh.client.inject` 是 Client 模块依赖；代码导出的 `inject` 是 Cordis Service 依赖。两者不是同一层，新增依赖时分别核对。
- 当前打包列表只有 `lib` 和 bundle patch，不包含仓库外层的 Python 服务与静态资源。不能把单独安装这个包视为完整阅读器部署。跨机器部署要保留整个仓库，或通过 `server` 配置指定完整服务的入口。

## 3. 安装、配置与进程生命周期

### 本地安装约定

现有 [README.md](<../README.md>) 记录的是本地 link 安装到 desktop profile。本次 Config Inspect 也返回了该 profile 下的包位置，但其他机器、其他 profile 或后续安装不一定相同。

维护时先用插件管理器列出当前 bundles/plugins，确认包来源、精确标识、启用状态和当前 profile，再执行安装或启停操作。不要直接改缓存副本，也不要把示例机器的绝对路径写成通用默认值。

插件管理操作影响同一 profile 的所有会话。live profile 通常即时应用变更；startup profile 需要重启。若 DSH 报告版本不兼容，先升级或适配插件；不能为了加载成功擅自添加版本豁免。豁免可能导致崩溃或数据丢失，必须单独确认精确版本组合。

### Host 配置

配置覆盖写入当前 profile 的 `cordis.patch.yml`，按 patch ID 覆盖已有条目，不要重复插入一份插件。结构依据仓库中的 [组合层 patch](<../dsh-plugin/cordis.patch.yml>)：

```yaml
- id: jinji-shufang
  config:
    port: 4417
    python: /usr/bin/python3
    server: /absolute/path/to/jinji-reader/server/server.py
    journal: /absolute/path/to/journal
    autoStart: true
```

以上路径是占位示例，使用前替换。`server` 应使用实际绝对路径；`python` 使用 PATH 可解析的命令名或可执行文件绝对路径。两者不经过 shell 展开，不要依赖 `~` 展开。

| 字段 | 当前默认值与行为 |
|---|---|
| `port` | 整数 `1–65535`，否则回退到 `4417`；字符串端口不会被接受为有效整数 |
| `server` | 相对 Host 模块位置解析到本仓库的 [Python 服务](<../server/server.py>)；非空字符串可覆盖 |
| `python` | 指定后只尝试该命令；未指定时依次尝试 `python3`、`/usr/bin/python3` |
| `journal` | 未指定时保留继承环境，由 Python 按 `JINJI_JOURNAL`、配置文件 `journal`、默认目录的顺序取值 |
| `autoStart` | 只有布尔值 `false` 才关闭插件启用时的预启动；其他值均启用 |

当前 [Host 入口](<../dsh-plugin/lib/host.js>) 没有导出 Config schema。本次 Config Inspect 的 `status: absent` 表示 schema 缺失，**不表示插件没有安装**。字段行为以 `resolveConfig()` 为准；不要虚构 GUI 配置表单或 schema 校验能力。

### 启动与复用

- Host 通过 `/api/ping` 检查响应中的 `app === 'jinji-reader'`，成功就复用已有服务。它不会核对已有服务是否使用预期 journal；改配置后必须核对状态返回的实际 journal。
- 新建进程时，Host 设置 `JINJI_PORT`；配置了 `journal` 时也设置 `JINJI_JOURNAL`。`JINJI_CONFIG`、`JINJI_STATE_DIR` 等其余环境变量来自 DSH 进程环境，不是当前插件配置字段。
- **`autoStart: false` 不是“永不启动服务”。** 状态路由发现服务离线，且距上次启动尝试超过 15 秒时，仍会尝试拉起服务。
- 并发启动请求共用同一次启动任务。Client 引用队列轮询间隔是 700 ms，离线时每 10 秒刷新状态；不要再加一套无归属的全局轮询。
- 插件卸载只终止本插件创建的 Python 子进程，不终止复用的外部服务。重载插件可能中断正在阅读的 iframe，也可能丢失服务进程内尚未消费的引用队列。
- 关闭书房视图不等于卸载插件：只返回对话，右侧视图只关闭自己的 Tab；Python 服务继续运行。

## 4. 必须保留的安全与交互约束

### 数据与网络边界

- journal 内容保持只读。归档、收藏保存在 journal 外，按 journal 路径隔离；不得通过维护、测试或迁移把状态写回真实笔记库。
- “只读”针对 journal，并非服务绝不写文件。服务还允许用户显式操作库外技能的 `metadata.kind` / `metadata.name`。这不是维护任务可以修改用户全局技能的授权。
- Python 服务监听 `127.0.0.1`。DSH 的两个代理路由先调用 `connection.requestRejection(req)`，保留 Host/Origin 检查与浏览器鉴权；不能通过取消鉴权修复 401/403。
- DSH 的鉴权路由不意味着 Python 端口也受 DSH 登录保护。不要将阅读器改为监听公网，也不要为了调试开放任意 CORS 或扩大可读路径。
- 当前 iframe URL 使用浏览器侧的 `127.0.0.1`，页面只识别 loopback DSH origin。这是本机集成，不是已经支持远程浏览器访问的通用代理方案。

### 两条引用链路

**DSH 内嵌页面：**

1. 页面向 Python `POST /api/cite`，携带 `delivery: 'parent'`。服务只校验和解析路径，返回 `queued: false`，不入公共队列。
2. iframe 向所属 DSH 页面发送 `jinji:cite`。父页面同时验证精确 `origin`、`source`、消息 ID 与绝对路径格式，按 ID 去重；不能改成接受任意窗口或 `'*'`。
3. Client 从 `sessions.list.getSnapshot().byId` 中寻找 `retainedBy.mainView > 0` 的会话。不要使用已不存在的 `list.current`，也不要误选仅由后台保留的会话。
4. 切回对话，等待输入框挂载和草稿恢复，再通过 `conversation.input.for(actx)` 的 `captureInsertion` / `insertText` 写入引用。选区折叠到末尾，不覆盖已选草稿，不发送消息。
5. 确认草稿版本增加、引用次数增加、可见输入框 DOM 包含引用，再聚焦输入框并返回 `jinji:cite-result`。无会话、忙碌、超时、会话切换和无法确认都不能报告成功，也不能盲目重试。
6. 右侧书房只关闭发起引用的 Tab，不关闭其他 Tab。引用过程中切换会话就停止继续写入。

**独立网页兼容路径：**

页面不指定 `delivery: 'parent'` 时，引用进入公共队列。DSH 通过已鉴权的 `/jinji-shufang/cite-pull` 代取；多个 DSH 窗口由先取到的一方处理。入队只代表“已加入引用队列”，不代表已回填。不要为了排查问题手动消费真实队列。内嵌页面不能退回此链路，否则引用可能被别的窗口取走。

### 样式、主题与卸载

[Client 入口](<../dsh-plugin/lib/client.js>) 在 `apply()` 中创建样式。加入 DOM **之前**必须设置：

```js
el.dataset.plugin = 'dsh-plugin-jinji-reader'
el.dataset.pluginCss = 'dsh-plugin-jinji-reader/reader.css'
```

否则 DSH 可能把样式认领给后加载的其他插件。那个插件卸载时会误删书房样式，iframe 退回约 304×154 的默认外框尺寸。不要用固定宽高、保留失效样式或轮询补丁掩盖归属错误。

- 路由、样式、Slot、Tab、locale、事件监听和定时器应由 `ctx.effect` 或相应 scope 管理，卸载时释放自己的资源。
- DSH 外层 UI 使用当前主题令牌；新增令牌前用 Inspect 核对名称。主题首屏通过 URL 传入，之后订阅 `theme/change`，用 `jinji:theme` 通知 iframe，不因主题切换重载 iframe。
- 保留主面板与右侧栏分别保存的阅读状态，以及连接中、离线时仍可用的关闭按钮。

## 5. 修改 DSH 接口前的 Inspect 流程

Inspect 是只读发现工具，不是插件代码可以调用的业务 Service。不要根据记忆猜 provider、方法、事件模式、Slot props 或配置 schema。

1. 先调用 `cordis_inspect_list`，获取当前 Host/Client provider 清单。
2. 从返回清单选择准确的 `platform`、`provider` 和 `method`，再调用 `cordis_inspect_query`。
3. 先查目录，再查目标项的完整契约；只用方法签名目录不足以确定参数结构。
4. 若 Client 无响应，恢复 DSH 页面连接后重试。若接口未出现在目录中，检查当前 DSH 安装包的对应实现/类型并记录版本，不把缺失接口猜成可用。

本次可用查询及本项目常见用途：

| 平台 / provider / method | 核对对象 |
|---|---|
| Host / `Service` / `listService` | `webServer`、`connection` 的注册、鉴权和 disposer 契约 |
| Host / `Config` / `listConfigs` | 先以 `name: 'dsh-plugin-jinji-reader'` 查询，再用返回的 entry 查 schema 状态 |
| Client / `Service` / `listService` | `sessions`、`layout`、`slots`、`locale`、`theme` 等服务；目录未覆盖的编辑器/右栏接口需继续核对实现 |
| Client / `Event` / `listEvents` | `theme/change`；本次模式为 `emit`，参数为 `ThemeSnapshot` |
| Client / `Slots` / `listSubTree` | `main`、`sidebar.panellist`、`sidebar.right.pane.tab`、`sidebar.right.pane.tab.title` 的实际结构和 props |
| Client / `Theme` / `listTokens` | 可用主题令牌与深浅色覆盖要求 |
| Client / `Builtin` / `listBuiltins` | 动态 Client 可使用的普通 JavaScript 符号 |

新增 Tool 或其他 Event 时也按实时清单查 schema/事件模式，不把本文列出的查询当作全部能力。

## 6. 改动怎样生效

**无需构建不等于修改后自动加载。** 本仓库没有 `dev:web` 脚本，源码目录、profile 安装来源、DSH 插件缓存和浏览器当前模块必须区分。

| 修改范围 | 生效步骤 |
|---|---|
| [Host](<../dsh-plugin/lib/host.js>)、[Client](<../dsh-plugin/lib/client.js>) | 从仓库根目录运行 `npm --prefix dsh-plugin run check`；确认 profile 的安装来源指向当前仓库；在获得授权后，通过插件管理器禁用并重新启用准确 bundle，让 DSH 重新加载；仍保留旧页面状态时再刷新 |
| [插件清单](<../dsh-plugin/package.json>)、[组合层 patch](<../dsh-plugin/cordis.patch.yml>) | 核对 bundle/模块依赖及配置结构后，通过当前插件管理流程重新应用；需要重新安装还是重启，以 profile 类型和管理结果为准 |
| [Python 服务](<../server/server.py>)、本地配置 `server/wiki.config.json` | 重启实际提供服务的 Python 进程；先确认进程所有者和 journal，不要仅按端口杀任意进程；复用外部服务时，单独重载 DSH 插件不保证更新 Python |
| [页面脚本](<../server/static/app.js>)、[样式](<../server/static/app.css>)、[HTML 主题桥](<../server/static/frame-theme.js>)、[页面入口](<../server/static/index.html>) | 刷新阅读器 iframe 或所在 DSH 页面；通常无需重启 Python |

只有确认**同一 DSH checkout** 正在运行 `pnpm run dev:web`、重建覆盖目标 Client 模块且当前页面 HMR 接收正常，才能承诺免刷新更新。单有 HMR 接收器不足以证明会重建本插件。

若任务确实要求修改 DSH 自身：先定位真实 checkout。Web shell 和普通 packages 的修改要重建相应 Web 产物并刷新原有 DSH URL。不要启动替代 Vite 服务；单独 Vite 入口缺少 `dsh web` 注入的启动数据。通常维护书房只需改本仓库，不应修改安装包。

## 7. 回归验证

以下命令均从**仓库根目录**执行。日常用 `make check`（ruff 静态检查 + 插件检查 + 后端单测），`make test-browser` 运行三项浏览器回归；下面是展开后的命令。Node 检查脚本定义在 [插件清单](<../dsh-plugin/package.json>)。

```sh
# Python 静态检查（需要 uv）
uvx ruff check .

# DSH 插件基础检查：语法 + 冒烟
npm --prefix dsh-plugin run check

# Python 服务回归
python3 -m unittest discover -s server/tests -v

# 按改动范围运行浏览器回归
python3 dsh-plugin/scripts/browser-regression.py
python3 dsh-plugin/scripts/style-regression.py
python3 server/tests/browser_monthly.py
```

| 测试 | 覆盖与使用条件 |
|---|---|
| [smoke.mjs](<../dsh-plugin/scripts/smoke.mjs>) | 模拟 Cordis，使用临时端口启动真实 Python 服务；覆盖鉴权拒绝、队列/直达引用、进程释放、Client 注册、样式归属和引用确认。`check` 已包含它，无需重复运行 |
| [后端单元测试](<../server/tests/test_reader.py>) | 临时 journal/技能/状态，覆盖索引、路径边界、归档收藏、HTTP 与引用等；修改服务或数据行为时运行 |
| [编辑器浏览器回归](<../dsh-plugin/scripts/browser-regression.py>) | 使用安装包中的真实 SessionInputShell/Lexical，覆盖回填、草稿与 DOM、失败场景及阅读状态恢复；修改引用、会话或编辑器逻辑时运行 |
| [样式浏览器回归](<../dsh-plugin/scripts/style-regression.py>) | 使用真实 DSH 模块加载器与样式清理；覆盖其他插件卸载、主面板/右侧栏、窗口缩放、自身重启和负向缩框复现；修改布局、主题或生命周期时运行 |
| [阅读器浏览器回归](<../server/tests/browser_monthly.py>) | 临时资料验证分类、文档视图、资源链接、主题、归档等；修改静态页面或数据展示时运行 |

环境限制：

- Python 服务和后端单元测试使用标准库。插件基础检查需要 Node.js 20+；当前 smoke 指定 `/usr/bin/python3`，迁移到其他系统前核对路径。
- 浏览器测试要求执行它的 Python 环境已安装 Playwright 和 Chromium。不应未经确认下载依赖或修改用户环境；依赖缺失时报告未运行。
- 两个 DSH 浏览器回归脚本目前硬编码 macOS DSH 应用路径，通过 `ELECTRON_RUN_AS_NODE=1` 读取安装包模块，只在内存加入测试入口，不修改安装包。
- DSH 升级后若测试入口字符串或压缩符号改变，先检查测试适配点和真实接口；不能直接删除断言让测试变绿。
- 测试只能用项目文件或生成的临时资料，不读真实 journal/会话草稿，不手动消费生产引用队列，不改全局技能或当前 profile。清理临时目录前确认解析后的绝对路径。
- 自动化测试通过不等于当前 GUI 已更新。在线验收还要检查主面板、右侧 Tab、关闭行为、深浅色、刷新恢复，以及临时资料引用不覆盖草稿且不发送消息。

## 8. 常见问题排查

| 现象 | 检查顺序 |
|---|---|
| 没有书房入口或 `/shufang` | 当前 profile 的 bundle 是否启用 → Client 模块是否加载 → 注入依赖和 Slot/Tab key 是否匹配 → `commandUi` 是否可用 |
| 书房离线 | DSH 鉴权状态 → 状态路由响应 → `server` 路径与 Python 命令 → 端口是否被非书房进程占用 → Host 中 `jinji-shufang:` 日志 |
| 改 journal 后仍显示旧库 | `/api/ping` 只确认应用标识；核对状态的实际 journal 和已有进程环境，确认是否复用了旧服务 |
| 修改 Client 后仍是旧界面 | profile 是否链接当前仓库 → bundle 是否重载 → 缓存是否更新 → 是否需刷新；不要只反复刷新，也不要直接改缓存文件 |
| iframe 突然缩成小框 | 检查样式节点的 `data-plugin` 和稳定 `data-plugin-css`，运行样式回归；不要靠固定尺寸修补 |
| 提示引用成功但输入框没有路径 | 核对当前会话保留信息、输入框挂载与 phase、`draftRev` 和 DOM；保留“不确认就不报成功”的判断 |
| 引用进入别的窗口 | 检查是否误用了公共队列、是否缺失有效 `dshOrigin`，以及 `origin`/`source` 校验是否仍在 |
| 主题或滚动位置丢失 | 检查首屏 theme 参数、`theme/change` 消息、iframe 是否被不必要地重载，以及 panel/sidebar 的独立状态键 |

## 9. 维护完成检查表

- [ ] 只改了任务需要的文件，保留已有用户改动。
- [ ] DSH 接口已按当前运行时核对，Host 与 Client 依赖没有混用。
- [ ] journal 只读、库外状态、鉴权、路径边界和 iframe 消息来源检查没有退化。
- [ ] 引用不覆盖草稿、不发送、不误选会话；成功仍由真实草稿与 DOM 确认。
- [ ] 样式归属与 effect 清理完整，重复启停不会累积资源。
- [ ] 对应测试已执行；缺失依赖、失败和未验证项已如实记录。
- [ ] 配置、入口、命令或重载方式发生变化时，已同步本文、[README.md](<../README.md>) 与 [CHANGELOG.md](<../CHANGELOG.md>)；Agent 约束发生变化时，已同步 [AGENTS.md](<../AGENTS.md>)。
- [ ] 未经授权没有启停插件、改 profile、重启共享服务或修改 DSH 安装包。
