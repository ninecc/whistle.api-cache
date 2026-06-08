---
name: whistle-plugin
description: 用于创建、修改、审查、调试或发布 Whistle 插件 npm 包（如 whistle.xxx 或 @scope/whistle.xxx），包括 lack 脚手架、插件 hook、whistleConfig、插件 UI 扩展、规则补全、插件协议、TypeScript 导出和插件加载失败排查。
---

# Whistle Plugin Development

用于开发 Whistle 插件 npm 包，不用于普通 Rules/Values 抓包配置。若用户只是写代理规则、mock、映射、HTTPS 抓包或移动端抓包，改用 `whistle` skill；若在写 `whistle.xxx` / `@scope/whistle.xxx` 插件项目、hook、`whistleConfig`、插件 UI 或 npm 发布，用本 skill。

## 工作方式

先判断任务类型，再按需读取 reference。不要凭记忆生成复杂插件 API；未读对应 reference 时，不要断言 hook 签名、配置项或协议语法一定正确。

默认交付：

- 可运行插件代码或明确的代码改动
- 触发插件的 Rules 示例
- 安装、构建、`lack watch` 调试命令
- Network/Overview/Replay 或插件 UI 验证步骤
- 风险和回滚方式

仅在缺少插件目标、协议名、流量类型、TS/JS 选择、关键 URL/路径或真实运行环境时追问。不要编造包名、域名、端口或路径；用 `whistle.my-plugin`、`www.example.com`、`http://localhost:port`、`/Users/me/project`。

## Reference 路由

- 初始化、版本、导出、Rules 触发、变量语法、最小 hook：`references/scaffolding.md`
- `PluginOptions`、Storage/SharedStorage、request 类型、header、导出别名：`references/api-reference.md`
- `package.json`、`whistleConfig`、UI 列/菜单/Tab、`hintUrl`、`pluginVars`：`references/whistle-config.md`
- mock、鉴权、pipe、审计、动态规则、证书、UI、补全、全功能插件：`references/patterns.md`
- 插件不加载、hook 不触发、UI 空白、发布检查：`references/troubleshooting.md`

## Hook 选择

| 用户目标 | 首选 hook / 文件 | 必读 |
|---|---|---|
| 初始化插件项目 | `lack init` | `scaffolding.md` |
| 添加请求头、动态转发、按请求生成规则 | `rulesServer` / `_rules.txt` | `scaffolding.md`、必要时 `api-reference.md` |
| 根据响应状态/内容生成响应阶段规则 | `resRulesServer` / `resRules.txt` | `patterns.md` |
| 动态生成 TUNNEL 规则 | `tunnelRulesServer` | `api-reference.md`；它与 `rulesServer` 一样监听 `request` |
| mock API 响应或完全接管 HTTP | `server` | `patterns.md` |
| WebSocket 或 CONNECT/Tunnel 接管 | `server` 的 `upgrade` / `connect` | `api-reference.md`、`patterns.md` |
| 登录认证、拦截放行请求 | `auth` | `patterns.md`；需要 `enableAuthUI: true` |
| 自定义 HTTPS 解密或证书 | `sniCallback` | `patterns.md`；Rules 用 `sniCallback://plugin(sniValue)` |
| 观察请求或响应，不修改 | `statsServer` / `resStatsServer` | `patterns.md` |
| 加解密、自定义二进制流 | pipe 12 个 hook | `scaffolding.md`、`patterns.md` |
| 插件管理页面 | `uiServer` | `whistle-config.md`、`patterns.md` |
| Network 列、菜单、详情 Tab | `whistleConfig` | `whistle-config.md` |
| 协议或变量自动补全 | `hintUrl` / `pluginVars` | `whistle-config.md`、`patterns.md` |

常见误选：

- 普通代理映射优先交给 `whistle` 规则，不要为一条规则写插件。
- 添加请求头用 `rulesServer` 返回 `reqHeaders://...`，不要用 `auth`。
- `rulesServer` 返回规则文本，不直接返回响应 body。
- 只记录日志用 `statsServer/resStatsServer`，不要接管 `server`。

## 关键约束

- 包名必须是 `whistle.xxx` 或 `@scope/whistle.xxx`。
- 版本要求：`lack >= 1.4.0`、`whistle >= 2.9.100`、`whistle-client >= 1.3.8`。
- TypeScript 编译到 `dist/` 时，`index.js` 通常导出 `.default`。
- `lack watch` 是调试主命令：代码变更自动重载插件，并在终端显示插件进程的 `console.xxx`。
- 涉及真实 Whistle 进程、全局 npm 包、系统代理或证书时，说明影响并请求授权。

官方入口：`https://wproxy.org/docs/extensions/dev.html`、`https://github.com/avwo/lack`、`https://github.com/whistle-plugins/examples`。
