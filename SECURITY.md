# 安全策略

谨迹书房只为本机使用设计：Python 服务监听 `127.0.0.1`，journal 全程只读，DSH 路由沿用 DSH 的浏览器会话鉴权。

## 报告漏洞

请不要在公开 issue 中披露漏洞细节。通过 GitHub 的 [私密漏洞报告](https://github.com/quan2005/dsh-plugin-jinji/security/advisories/new) 提交，说明：

- 影响的版本或提交；
- 复现步骤与影响范围（例如越过路径边界读取 journal 以外的文件、绕过 DSH 鉴权、iframe 消息来源校验失效）；
- 你建议的修复方向（可选）。

收到后会在 7 天内确认，并在修复发布后致谢（如你愿意）。

## 不在范围内

- 把服务改为监听非 loopback 地址后产生的暴露问题；
- DeepSeek Harness 本身的漏洞，请报告给其维护方。
