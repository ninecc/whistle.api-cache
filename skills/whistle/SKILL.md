---
name: whistle
description: 用于配置、生成、审查或排查 Whistle 规则与抓包问题，包括 HTTP/HTTPS/WebSocket 代理、本地映射、请求/响应改写、通配/正则、filters、Values、reqRules/resRules、reqScript/resScript、移动端抓包、HTTPS 证书、Tunnel/captureError、w2 CLI、UI 面板和插件调试。
---

# Whistle

先判断任务类型，再给可执行结果。

**默认交付：** 可复制 Rules/Values + 验证步骤。

**追问边界：** 只有缺少目标 URL、本地地址、文件路径、设备系统、Network 状态等关键输入时才追问。

**占位符：** 不要编造域名、端口、路径；用 `www.example.com`、`http://localhost:port`、`/Users/me/project/dist`。

## 必读 Reference

不要凭通用代理知识猜 Whistle 语法。命中下列场景时先读对应文件：

- 通配、正则、`^`、`*`、`**`、`***`、`$1/$2`、query、路径保留：`references/pattern-matching.md`
- 请求体/方法/请求头/响应头/状态码/IP/概率过滤，或 `includeFilter`、`excludeFilter`、`reqBody`：`references/filter-matching.md`
- 转发、本地代理、mock、host、请求/响应头、CORS、注入、协议不明确：`references/intent-to-syntax.md`
- 生成常见代理/映射/mock/改写/限速/调试规则：`references/rule-cookbook.md`
- 复杂条件、批量规则、脚本规则、Values：`references/dynamic-rules-and-values.md`
- 运行状态、证书、系统代理、抓不到包、`Tunnel to`、`captureError`：`references/setup-and-capture.md` 或 `references/troubleshooting.md`
- 读写 rules/values、定位证书/临时文件/插件：`references/file-paths.md` 和 `references/operational-workflows.md`
- 模糊问诊、场景方案、协议能力、安全边界、快速查表：分别读 `diagnostic-decision-tree.md`、`scenario-templates.md`、`protocol-index.md`、`safety-and-intake.md`、`rules-and-troubleshooting.md`

未读相关 reference 时，不要声称某条 Whistle 语法“更简单/正确”。

## 执行上下文

- **可在沙箱完成：** 纯文本规则生成、协议解释、默认路径推算。
- **必须按真实运行态处理：** `w2 status/start/stop/restart/proxy/ca/install/uninstall`、系统代理、证书信任、真实 Whistle 进程、真实 `~/.WhistleAppData`。
- **约束：** 沙箱结果不能代表真实状态；会改变系统状态或直接写 rules/values 时，先说明影响并请求授权。

## 语义到协议

- 访问 A 但实际请求 B、页面走本地、API 转测试环境：Map Remote，用 `http://`、`https://`、`ws://`、`wss://`
- 资源替换成本地文件/目录：Map Local，用 `file:///abs/path`，绝对路径三个斜杠
- 改 Host/IP：`host://`；改 HTTP Host 头：`reqHeaders://host=...`
- 上游代理：`proxy://`、`https-proxy://`、`socks://`
- 改请求头/体/方法/URL 参数/path：`req*`、`method://`、`urlParams://`、`pathReplace://`
- 改响应头/状态码/响应体/跨域/重定向：`res*`、`statusCode://`、`replaceStatus://`、`redirect://`
- 按请求体/头/方法/状态码/IP/概率匹配：`includeFilter://...` 或 `excludeFilter://...`；请求体匹配用 `includeFilter://b:...`，不是 `reqBody://`
- 动态判断优先窄 pattern/filter；filter 表达不了再用 `reqScript/resScript`
- 一行可以组合多个 operation：`pattern file://... cache://3600 resCors://*`
- 需要动态值时可用模板变量：`` reqHeaders://x-req-id=`${reqId}` ``、`` urlParams://t=`${now}` ``；完整列表见 `dynamic-rules-and-values.md`

## 高频风险

- `responseFor://` 不是响应体 mock；Mock JSON 用 `file://({...})`、`resBody://` 或 Values
- `pathReplace://` 匹配 URL 的 path 部分且不含开头 `/`；替换开头 `api/` 用 `pathReplace://(^api=mock-api)` 或 `pathReplace://(/^api//=)`，不要用 `^/api`
- `statusCode://500` 直接返回状态码，不请求服务器；`replaceStatus://500` 请求仍到达服务器，只替换响应状态码
- `reqBody://` 是改写请求体，不是匹配请求体
- `proxy://` 是上游代理；转发到目标服务用 `http://` / `https://`
- 路径通配要生效，pattern 前加 `^`；`*` 匹配单级路径，`**` 匹配多级路径，`***` 才考虑 query
- 带 `^` 的通配按 `*`、`**` 出现顺序产生 `$1/$2`；正则 `$1/$2` 只来自括号捕获
- `**.example.com` 不包含根域 `example.com`，根域和子域要写两条

## 输出格式

**规则块：**

```txt
# 目标说明
pattern operation [operation...] [lineProps...] [filters...]
```

同一行可写多个 operation，filters 作用于整条规则：

```txt
www.example.com/api file://({"ok":true}) resType://json cache://no-store includeFilter://m:GET
```

**同时给出：**

- Rules
- Values（如使用 `{key}`）
- 人工自检
- Network/Overview/Replay 验证方式
- 风险和回滚

若运行 lint，只能说“发现高频风险”，不要说“语法已被 Whistle 证明正确”。

## 最小模板

```txt
www.example.com http://localhost:port
www.example.com/api http://test-api.example.net
www.example.com/static file:///Users/me/project/static
www.example.com/api/user file://({"id":1,"name":"mock"})
www.example.com/api reqHeaders://x-debug=1
www.example.com/api resHeaders://access-control-allow-origin=*
www.example.com/api http://localhost:port includeFilter://m:GET
```

## 快速诊断

- **无流量：** 查客户端代理、Whistle 端口、LAN IP、防火墙/VPN、浏览器绕过代理。
- **只有 `Tunnel to`：** HTTPS 未解密、证书未信任、IP 请求缺少 SNI、或本来是 TCP 隧道；IP HTTPS 可试 `enable://captureIp`。
- **`captureError`：** 查根证书信任、Firefox 独立证书、Android 用户 CA 限制、App 证书锁定。
- **规则不生效：** 复制完整 URL，先写最窄规则，移除 filters，看 Overview，再查同协议规则顺序和 `lineProps://important`。

官方文档入口：`https://wproxy.org/docs/`、`https://github.com/avwo/whistle`。
