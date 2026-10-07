# Agent 维护指引

本仓库是谨迹书房的 **DSH Plugin 项目**，只服务于 DSH。默认用简体中文说明结论、改动、验证结果和限制。

## 先读什么

1. 开始 DSH 相关维护前，阅读 [DSH Plugin 维护指南](<docs/maintenance.md>)。这是架构、配置、接口发现、重载、测试和排障的集中说明。
2. 阅读 [README.md](<README.md>) 与 [阅读器功能与 journal 约定](<docs/reader.md>)，了解功能、配置、journal 只读边界和目录规则。
3. 按任务读取 [插件清单](<dsh-plugin/package.json>)、[组合层 patch](<dsh-plugin/cordis.patch.yml>)、[Host 入口](<dsh-plugin/lib/host.js>)、[Client 入口](<dsh-plugin/lib/client.js>)，再追踪服务或页面代码；不要只凭本文改代码。

标准 Agent 入口是本文；详细维护规则只维护在上面的指南中，避免两份内容漂移。

## 工作边界

- 先确认工作目录和已有改动。保留用户未提交的文件，不擅自提交、清理或回滚。
- DSH 集成逻辑在 [Host 入口](<dsh-plugin/lib/host.js>) 和 [Client 入口](<dsh-plugin/lib/client.js>)；内容处理在 [Python 服务](<server/server.py>)。不要混淆两个运行环境。
- 默认修改本仓库，不修改 DSH 安装包、profile、缓存副本或真实笔记。插件安装、启停和共享服务重启必须有用户授权，并说明影响同一 profile 的其他会话。
- journal 永远只读。归档、收藏写库外；测试仅用临时资料或项目文件。库外技能的显式编辑功能不构成维护时修改用户全局技能的授权。

## DSH 修改硬约束

- 修改 Service、Event、Config、Slot 或主题前，先调用 `cordis_inspect_list`，再用返回的准确 provider/method 调用 `cordis_inspect_query`。Inspect 不是业务 Service；查不到的接口继续核对当前实现，不猜 API。
- 插件是手写 JavaScript，无构建步骤。Host 是 ESM；Client 是 `window.__ModuleLoader__.load` 工厂，使用 DSH 提供的 React。清单模块依赖与 Cordis Service `inject` 分开维护。
- 新建资源要有生命周期清理。动态样式加入 DOM 前必须写 `data-plugin="dsh-plugin-jinji-reader"` 和稳定的 `data-plugin-css`，防止被其他插件误删。
- 保留 DSH 路由鉴权、Python loopback 监听、路径边界及 iframe 精确 `origin`/`source` 校验。
- DSH 内嵌引用走 `delivery: 'parent'`，不入公共队列。只向当前 `retainedBy.mainView` 会话回填，等待输入框挂载，并核对草稿和 DOM；不覆盖原草稿、不发送消息、不虚报成功。
- `autoStart: false` 只关闭启用时的预启动，状态路由仍可启动服务。关闭视图、卸载插件和停止 Python 服务是不同操作。
- 不承诺保存后自动生效。先检查实际安装来源、插件重载和构建监听器；在线验证使用原有 DSH 页面，不新起替代服务。

## 验证与交付

从仓库根目录运行：

```sh
make check   # = uvx ruff check . + npm --prefix dsh-plugin run check + python3 -m unittest discover -s server/tests -v
```

按改动范围追加指南中的浏览器测试：引用/编辑器改动跑编辑器回归，样式/生命周期改动跑样式回归，阅读器展示改动跑阅读器回归。

纯文档改动至少核对链接、配置字段、命令工作目录与源码。检查每个命令的退出状态和实际结果；依赖缺失、测试失败或未运行时明确说明，不自动安装依赖掩盖缺口。

交付时列出修改范围、验证结果、未验证项，以及是否真的重载当前 GUI。配置、依赖、入口、引用协议或生效方式变化后，同步 [DSH Plugin 维护指南](<docs/maintenance.md>)、[README.md](<README.md>) 与 [CHANGELOG.md](<CHANGELOG.md>)。
