# 贡献指南

感谢你愿意改进谨迹书房。提交前请先读 [维护指南](docs/maintenance.md)，它记录了架构、DSH 接口核对方式和必须保留的安全约束。

## 开发环境

- Python 3.10+，服务与单元测试只用标准库
- Node.js 20+，用于插件语法检查与冒烟测试
- [uv](https://docs.astral.sh/uv/)（可选），用于运行 `uvx ruff`
- Python Playwright + Chromium（可选），用于浏览器回归；DSH 编辑器与样式回归还需要本机安装 DeepSeek Harness

```sh
cp server/wiki.config.example.json server/wiki.config.json   # 本地配置，不入库
make check
```

## 提交改动

1. 从 `main` 新建分支，一个 PR 只做一件事。
2. 遵循现有代码风格：插件是手写 JavaScript（Host 为 ESM，Client 为 `window.__ModuleLoader__.load` 工厂），服务只用 Python 标准库；不引入构建步骤或运行时依赖。
3. 新增或修改行为时补充测试。测试只能使用临时生成的资料，不读取真实 journal、会话草稿或全局技能。
4. 运行 `make check`；改页面、引用或样式时再按 [维护指南 §7](docs/maintenance.md#7-回归验证) 运行对应的浏览器回归。
5. 用户可见的变化记录到 [CHANGELOG.md](CHANGELOG.md) 的「未发布」一节；配置字段、接口或生效方式变化时同步 README 与维护指南。
6. 提交信息用一句话说明做了什么，正文写原因与影响。

## 不接受的改动

- 让服务写入 journal，或把归档、收藏写回 journal；
- 取消 DSH 路由鉴权、改为监听非 loopback 地址、放宽路径边界或 iframe 消息的 `origin`/`source` 校验；
- 引用时覆盖草稿、自动发送消息，或在无法确认写入时报告成功。

## 行为准则

请友善、就事论事。参与本项目即表示同意遵守 [Contributor Covenant 2.1](https://www.contributor-covenant.org/zh-cn/version/2/1/code_of_conduct/)。
