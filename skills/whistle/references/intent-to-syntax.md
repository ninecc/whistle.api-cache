# Whistle 意图到语法

用户常用自然语言不一定对应直观 protocol。生成规则前先归类意图，再选择语法。

## 基本判断流程

1. 要改变请求去哪里：Map Remote、DNS/host、proxy。
2. 要改变返回什么：Map Local、response rewrite、mock。
3. 要改变请求带什么：request rewrite。
4. 要改变页面调试能力：注入、weinre、log。
5. 要改变抓包行为：enable/disable capture、证书、代理配置。
6. 要按复杂条件生效：pattern/filter 不够时用 script。

不要仅凭关键词选 protocol。例如“代理到本地”可能是 `http://localhost:port`，不是 `proxy://localhost:port`；“改 host”可能是连接 IP 覆盖，不是改 `Host` 请求头。

## 用户说法到语法

| 用户意图 | 正确语法 | 避免误用 |
| --- | --- | --- |
| 页面/API 转发到另一个 HTTP 服务 | `http://` / `https://` | 不要用 `proxy://` |
| WebSocket 转发 | `ws://` / `wss://` | 不要用普通 `http://` |
| 静态资源替换成本地文件或目录 | `file:///abs/path` | 不要用 `http://localhost` 除非本地有静态服务 |
| mock JSON 响应体 | `file://({...})`、`resBody://`、Values 引用 + `resType://json` | 不要把 JSON 当文件路径；不要用 `responseFor://` |
| 修改请求头 | `reqHeaders://`、`ua://`、`referer://`、`auth://` | 不要用 `resHeaders://` |
| 修改响应头 | `resHeaders://`、`resCors://` | 不要用 `reqHeaders://` |
| 修改请求参数 | `urlParams://` | 不要用 `pathReplace://` |
| 修改请求 path | `pathReplace://` | 不要只写 redirect |
| 页面跳转 | `redirect://`、`locationHref://` | 不要用 Map Remote 替代浏览器跳转 |
| 直接返回状态码 | `statusCode://` | 不要误以为请求会到服务器 |
| 替换真实响应状态码 | `replaceStatus://` | 不要用 `statusCode://`，它会短路请求 |
| 改目标连接 IP | `host://` | 不要用 `reqHeaders://host=...` |
| 设置请求 Host 头 | `reqHeaders://host=...` | 不要误以为等同 DNS |
| 走上游代理 | `proxy://`、`https-proxy://`、`socks://` | 不要用 Map Remote |
| 修复 CORS | `resCors://` 或 `resHeaders://access-control-*` | 不要只改请求头 |
| 慢接口/弱网 | `reqDelay://`、`resDelay://`、`reqSpeed://`、`resSpeed://` | 不要用 JS sleep |
| 页面注入 JS/CSS/HTML | `jsAppend://`、`cssAppend://`、`htmlAppend://` + `lineProps://safeHtml` | 不要注入到 API JSON |
| 收集页面 console/错误 | `log://id` | 不要只看 Network |
| 远程调试页面 | `weinre://id` | 不要混同 Chrome DevTools |
| HTTPS IP 抓包 | `enable://captureIp` 或 `enable://capture` | 不要只装证书 |
| 证书锁定域名绕过 | `disable://capture` | 不要强行解密 |
| 条件规则 | pattern/filter；复杂则 `reqScript/resScript` | 不要堆不可控 filters |
| 匹配请求体包含某字符串 | `includeFilter://b:keyword` | 不要用 `reqBody://`，那是改写请求体 |
| 设置 Network 展示的 ServerIP | `responseFor://1.1.1.1` | 不要当作响应体 mock |

## Pattern 选择

复杂通配、路径通配、query 和正则细节见 `pattern-matching.md`。这里保留快速选择规则。

优先从 Network 复制完整 URL，再缩窄：

```txt
# 只匹配一个接口
https://www.example.com/api/user operation://value

# 匹配 API 前缀
www.example.com/api operation://value

# 匹配整个域名
www.example.com operation://value

# 匹配子域
*.example.com operation://value
**.example.com operation://value

# 路径通配，必须加 ^
^www.example.com/api/*/users operation://value

# 正则
/\/api\/v\d+\// operation://value
```

选择规则：

- 已知完整接口：用完整 path。
- 多个同前缀接口：用 path 前缀。
- 整站替换：用 host，但要排除 API/static 或明确范围。
- 多子域：用 `*.example.com` 或 `**.example.com`，并说明是否包含根域。
- `**.example.com` 不包含根域 `example.com`，需要根域时写两条。
- 路径里的 `*` 要作为通配符使用时，pattern 前必须加 `^`。
- 带 `^` 的路径通配 pattern 不要依赖普通前缀映射的自动拼接；需要动态路径时显式使用 `$1/$2`。
- 正则只在通配和 path 前缀表达不了时使用。

## Operation 选择细节

### 转发到本地服务

用户说“把 example.com 代理到本地 port”，通常是：

```txt
www.example.com http://localhost:port
```

不是：

```txt
www.example.com proxy://localhost:port
```

`proxy://` 表示上游代理服务器，不是目标服务。

### 本地文件路径

本地文件或目录映射必须写成 `file:///abs/path`，也就是 `file://` 加以 `/` 开头的绝对路径：

```txt
www.example.com/assets/app.js file:///Users/me/project/dist/app.js
www.example.com/static file:///Users/me/project/dist/static
```

不要写成：

```txt
www.example.com/assets/app.js file://Users/me/project/dist/app.js
```

### 改 Host

用户说“host 到 10.0.0.1”，通常是连接目标 IP：

```txt
www.example.com host://10.0.0.1
```

如果用户明确要改 HTTP Host header：

```txt
www.example.com reqHeaders://host=api.example.net
```

两者不是一回事。

### Mock JSON

短 JSON 可内联：

```txt
www.example.com/api/user statusCode://200
www.example.com/api/user resType://json
www.example.com/api/user file://({"id":1})
```

多行 JSON 放 Values：

```txt
www.example.com/api/user file://{user.json}
```

不要写成：

```txt
www.example.com/api/user file://{"id":1}
```

因为这容易被解析成路径或非法值。

也不要写成：

```txt
www.example.com/api/user responseFor://({"id":1})
```

`responseFor://` 不是响应体内容，它只影响 Whistle Network 面板里显示的 `ServerIP` / `x-whistle-response-for`。

### 修改 Path

`pathReplace://` 处理的是 URL 的 path 部分，且不包含开头 `/`：

```txt
# 把 https://www.example.com/api/user 变成 https://www.example.com/mock-api/user
www.example.com pathReplace://(^api=mock-api)
```

不要把它写成：

```txt
www.example.com pathReplace://^/api=/mock-api
```

如果要删除开头的 `api/`，用：

```txt
www.example.com pathReplace://(/^api//=)
```

`pathReplace://` 的源码 canonical name 是 `urlReplace`，对外规则中通常仍写 `pathReplace://`。多组替换优先用 JSON/Values：

```txt
www.example.com pathReplace://({"old":"new","/v1/ig":"v2"})
```

注意官方语义里的 path 不包含开头 `/`，所以替换 path 开头时不要写 `^/api`。

### 状态码

`statusCode://` 和 `replaceStatus://` 行为不同：

```txt
# 直接返回 500，请求不会到达服务器
www.example.com/api statusCode://500

# 请求照常到达服务器，只把响应状态替换为 500
www.example.com/api replaceStatus://500
```

### CORS

简单调试：

```txt
www.example.com/api resCors://*
```

需要凭证时精确写响应头：

```txt
www.example.com/api resHeaders://access-control-allow-origin=https://app.example.com
www.example.com/api resHeaders://access-control-allow-credentials=true
```

不要用请求头解决响应跨域错误。

### Redirect 和 Map Remote

想让浏览器地址栏跳转：

```txt
www.example.com/old redirect://https://www.example.com/new
```

想让代理层把请求转到另一个后端但浏览器地址不变：

```txt
www.example.com/api https://test-api.example.com/api
```

普通跳转用 `redirect://`；某些 iframe 或页面场景 302 不触发时再考虑 `locationHref://`。需要 301 时可组合：

```txt
www.example.com/old redirect://https://www.example.com/new replaceStatus://301
```

### 组合 Operation

一行可以写多个 operation，filters 作用于整条规则：

```txt
www.example.com/api file://({"ok":true}) resType://json cache://no-store includeFilter://m:GET
```

## Filters 选择

完整说明见 `filter-matching.md`。注意：匹配请求体内容用 `includeFilter://b:...`，不是 `reqBody://...`。

适合 filters：

```txt
includeFilter://m:GET
includeFilter://b:keyword
includeFilter://b:/regexp/i
includeFilter://reqH.content-type:json
includeFilter://s:/^20/
includeFilter://clientIp:192.168.1.23
includeFilter://chance:0.1
```

不适合 filters：

- 需要同时判断多个条件且必须 AND。
- 需要解析 JSON body。
- 需要根据响应内容决定规则。
- 需要生成多条规则。

这些情况用 `reqScript` 或 `resScript`。

## 输出自检

返回规则前检查：

1. 规则是否对应用户真实意图，而不是关键词匹配。
2. `pattern` 是否过宽；能用 path 就不要只用 host。
3. `operation` 方向是否正确：请求用 `req*`，响应用 `res*`。
4. Map Remote、上游代理、DNS host 是否区分清楚。
5. JSON 是否用括号、Values 或内嵌块。
6. 本地路径是否是绝对路径，或明确是占位符。
7. filters 是否真的表达用户条件；表达不了就换 script。
8. 是否需要 HTTPS capture、是否可能被证书锁定影响。
9. 是否给出 Network/Overview/Replay 验证方法。
