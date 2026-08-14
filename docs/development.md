# 开发指南

面向想要修改、扩展或调试 dsh-plugin-jinji 的开发者。

## 1. 环境要求

- Node.js ≥ 22（DSH 运行时要求；本包代码亦兼容）
- `dsh` CLI（`npx @deepseek-ai/dsh` 或源码 checkout）
- 本包**零依赖、零构建**——无需 `pnpm install` 即可工作

## 2. 项目布局

```
lib/index.js          Host 半：数据路由（契约见 docs/api.md）
lib/client.js         Client 半：入口按钮 + 面板（架构见 docs/architecture.md）
cordis.patch.yml      组合包层
docs/                 文档体系（architecture / api / design-decisions / development）
examples/             示例配置
```

## 3. 本地开发循环

```sh
# 1) 语法检查（唯一构建步骤，因为零构建）
npm run check

# 2) 本地安装到 profile
dsh plugin --profile web add /path/to/dsh-plugin-jinji

# 3) 启动并验证
dsh --profile web --dump-config      # 应看到 jinji_memory 行与 # == dsh-plugin-jinji 层
dsh web                              # 打开 http://127.0.0.1:3080

# 4) 改 lib/client.js 后必须重启 dsh web
#    （client bundle 修订在启动时固化，web 组合包 HMR 默认 disabled）
```

### 3.1 自定义日志库根目录

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: jinji-memory
  config:
    root: /path/to/journal
```

## 4. 调试

- **Host 半**：`node --input-type=module` 直接 import `lib/index.js`，注入 mock `fs`（见 `scripts/smoke-host.mjs` 风格）驱动 `apply` 与路由 handler；
- **Client 半**：mock `window.__ModuleLoader__` + 最小 DOM 桩驱动 factory 与 `apply`（按钮注入、样式拷贝、面板挂载）；
- **运行时**：面板数据流可用浏览器 DevTools Network 观察 `/api/jinji-memory`；Host 半日志进 dsh 进程 stdout。

## 5. 验证清单

改动任一文件后：

```sh
npm run check                     # 双半语法
node scripts/smoke.mjs            # 双半冒烟（mock 驱动）
npm pack --dry-run                # 发布内容核对（应只有 8 个文件）
dsh --profile web --dump-config   # 组合层落位
```

功能回归（手动）：

1. 侧栏 New Session 下方出现幽灵样式「记忆」按钮；
2. 点击打开面板（内容区，侧栏可见）；日志 120 条 / 画像计数正确；
3. 日志→画像切换、点卡片进分栏详情、预览/源码切换、右侧列表高亮；
4. 点侧栏（新会话/会话列表/设置）面板自动关闭；Esc/× 关闭；
5. 宽/窄栏切换、拖拽侧栏宽度 → 按钮与面板左边界实时跟随。

## 6. 常见坑（历史记录）

| 坑 | 现象 | 原因与对策 |
|---|---|---|
| 幽灵按钮 | 新旧版本按钮叠加、样式怪 | 注入前按 `[data-jinji-nav]` 清扫旧实例，保证单例 |
| 实底灰按钮 | 与「新会话」视觉不一致 | 切勿给按钮写 hex fallback；用 `getComputedStyle` 拷贝 + 主题变量 hover（`!important` 压过内联） |
| 面板不显示 | 槽位目录 active 但组件未挂载 | 见 ADR-0002：不用 React 槽位，改纯 DOM |
| 硬编码路径 | 换机不可用 | 见 ADR-0005：三级解析 |
| client 改动不生效 | 改完页面没变化 | client bundle 启动时固化，必须重启 dsh web |
| `dsh.client` 布尔声明 | web 树整体崩溃 | 必须为对象 `{ platform: 'web', inject: [] }` |

## 7. 发布流程

```sh
npm run check && npm pack --dry-run
git tag vX.Y.Z && git push origin vX.Y.Z
gh release create vX.Y.Z --notes "<CHANGELOG 对应条目>"
# 可选：npm publish
```
