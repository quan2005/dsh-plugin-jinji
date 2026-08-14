# 贡献指南

感谢考虑为 dsh-plugin-jinji 贡献！本项目遵循「文档架构优先」原则：任何功能改动都应当先有（或同步更新）对应文档与设计决策。

## 提交前

1. 阅读 [docs/architecture.md](docs/architecture.md)（架构）与 [docs/design-decisions.md](docs/design-decisions.md)（ADR）；
2. 功能/接口改动：先更新 [docs/api.md](docs/api.md) 契约，再改实现；
3. 新决策：在 ADR 中新增条目（`ADR-xxxx`，含背景/决策/理由/风险四段）；
4. 跑通验证清单（见 [docs/development.md](docs/development.md#验证清单)）。

## 变更分类与版本

| 类型 | 示例 | 版本 |
|---|---|---|
| patch | 修复、文档错漏 | x.y.Z |
| minor | 新功能（向后兼容） | x.Y.z |
| major | 契约/选择器/声明破坏性变更 | X.y.z |

## 提交规范

```
<type>: <主题>

<正文：动机与影响>
```

type ∈ `feat` / `fix` / `docs` / `refactor` / `chore`。

## 行为准则

- 保持零依赖、零构建；
- 不硬编码任何机器专属路径与色值；
- 前端数据一律经 `esc()` 转义；
- 新代码同步更新 CHANGELOG。
