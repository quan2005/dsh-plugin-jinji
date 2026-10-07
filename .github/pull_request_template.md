## 改动

<!-- 做了什么、为什么。关联 issue：#123 -->

## 验证

- [ ] `make check` 通过
- [ ] 按改动范围运行了浏览器回归（见 docs/maintenance.md「回归验证」），或说明未运行原因
- [ ] 改了配置字段、接口、引用协议或生效方式时，同步更新了 README 与 docs/maintenance.md
- [ ] 在 CHANGELOG.md「未发布」下记录了用户可见的变化

## 边界

- [ ] journal 仍然只读；归档、收藏只写库外状态文件
- [ ] 保留 DSH 路由鉴权、loopback 监听、路径边界和 iframe `origin`/`source` 校验
