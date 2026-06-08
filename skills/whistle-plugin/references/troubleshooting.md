# Troubleshooting and Release Checks

## 验证插件行为

- Rules：确认请求命中 `whistle.my-plugin://value`、短协议 `my-plugin://value`、`sniCallback://plugin(sniValue)` 或 `pipe://plugin(value)`。
- Network：看 Overview 里的匹配规则、请求/响应头、状态码、是否出现 `Tunnel to` 或 `captureError`。
- Replay：修改插件规则后用 Replay 验证同一请求是否稳定触发。
- UI：访问插件 Option/Tab/Menu 页面，检查静态资源是否 200，前端路径是否相对。
- 终端：看 `lack watch` 输出，插件进程里的 `console.xxx` 会显示在这里。

## 常见问题

| 症状 | 优先检查 |
|---|---|
| 插件不加载 | 包名是否 `whistle.xxx`，`main` 是否存在，是否在 Whistle 插件搜索路径，`lack watch` 是否报错 |
| Hook 不触发 | `index.js` 是否导出标准名称，TS 是否 `.default`，是否已编译，Rules 是否匹配插件协议 |
| auth 不生效 | `enableAuthUI: true`，请求是否匹配插件规则，是否误拦插件自身页面 |
| sniCallback 不生效 | Rules 是否有 `sniCallback://plugin-name(sniValue)`，HTTPS 是否已进入 Whistle |
| rulesServer 没效果 | 返回的是否是规则文本，是否被缓存，协议值是否来自 `req.originalReq.ruleValue` |
| tunnelRulesServer 没效果 | 它监听 `request`，不是 `connect`；确认流量是 TUNNEL 请求 |
| server 造成请求卡住 | 是否消费请求体或 `passThrough()`，是否处理 `upgrade/connect` |
| pipe 没触发 | Rules 是否用 `pipe://plugin(value)`，hook 名是否匹配 HTTP/WS/Tunnel 类型 |
| UI 空白 | 静态资源路径是否相对，Vite `base` 是否 `./`，`uiServer` 是否挂到 `request` |
| 子进程崩溃 | 看 `lack watch` 输出，捕获异步异常，确认依赖已安装 |
| 短协议冲突 | 用长协议 `whistle.xxx://...` 或调整插件名 |

## 发布

```bash
npm login
npm publish
npm i -g whistle.my-plugin
```

发布前确认：

- `package.json` 的 `name`、`version`、`main` 正确。
- TS 项目已构建，`dist/` 被包含到 npm 包中。
- 本地 `lack watch` 下验证过加载、hook 触发、UI 可访问。
- README 写清 Rules 示例和 Whistle 版本要求。
- 回滚方式明确：停用插件、移除规则、回退 npm 包版本。
