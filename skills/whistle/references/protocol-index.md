# Whistle 协议索引

用于判断“该用哪个 operation”。不要把索引当成完整协议文档；生成高风险或冷门协议规则前，优先核对官方文档或让用户提供当前 Whistle 版本。

## 解析事实

- 一行规则格式是 `pattern operation [operation...] [lineProps...] [filters...]`；Whistle UI 的规则解析会把同一行多个 operation 展开为多条同 pattern 规则，并保留 filters。
- `lineProps://...` 和 `includeFilter://...` / `excludeFilter://...` 可放在行尾；filters 过滤当前规则是否生效，不是 operation。
- 源码别名：`pathReplace` 归一到 `urlReplace`，`reqScript` / `reqRules` 归一到 `rulesFile`，`resRules` 归一到 `resScript`，`includeFilter` / `excludeFilter` 归一到 `filter`。
- 对用户输出时仍使用更直观的公开写法：`pathReplace://`、`reqScript://`、`reqRules://`、`resRules://`、`includeFilter://`、`excludeFilter://`。

## Map Local

把响应映射到本地内容。

```txt
file://      # 本地文件或目录，常用于静态资源、本地 mock
xfile://     # file 的 x 前缀形式；目标不存在时回退原始请求
tpl://       # 模板内容
xtpl://      # tpl 的 x 前缀形式；目标不存在时回退原始请求
dust://      # dust.js 模板渲染
rawfile://   # 原始文件响应
xrawfile://  # rawfile 的 x 前缀形式；目标不存在时回退原始请求
jsonp://     # JSONP 响应处理
```

优先用 `file://` 解决常见本地开发。遇到模板渲染、原始响应格式、二进制或保留头部问题时，再考虑 `tpl/rawfile` 系列。

## Map Remote

把请求映射到其他远程地址。

```txt
http://
https://
ws://
wss://
tunnel://
```

示例：

```txt
www.example.com/api https://test.example.com/api
wss://www.example.com/socket ws://localhost:port/socket
```

## DNS 和上游代理

控制目标连接地址或链式代理。

```txt
host://
xhost://
proxy://
xproxy://
https-proxy://
xhttps-proxy://
socks://
xsocks://
pac://
```

常见选择：

- 改目标 IP：`host://10.0.0.10`
- 走 HTTP 代理：`proxy://127.0.0.1:port`
- 走 SOCKS：`socks://127.0.0.1:port`
- 需要代理和 host 同时生效：考虑 `lineProps://proxyHost`
- `xhost/xproxy/xhttps-proxy/xsocks` 是 x 前缀形式：目标不可用或映射失败时回退原始请求

## Special

```txt
@              # 引入远程规则，或设置客户端证书
%              # 设置插件变量
G              # 只匹配 GET 请求
P              # G 的别名，只匹配 POST 请求
```

`@clientCert://...` 用于 mTLS 客户端证书场景；普通规则文件引入可以用 `@https://...`。插件变量使用 `%pluginName=value` 这类特殊规则，具体插件变量名以插件文档为准。

## Rewrite Request

改请求 URL、方法、头、Cookie、Body。

```txt
urlParams://
pathReplace://   # 对外常用名；源码 canonical 为 urlReplace
urlReplace://    # pathReplace 的 canonical name
sniCallback://   # 为 HTTPS SNI 选择证书/回调，冷门证书场景先查官方文档
method://
tlsOptions://    # cipher 的别名
cipher://        # TLS cipher/options canonical name
reqHeaders://
forwardedFor://
ua://
auth://
cache://
referer://
reqType://
reqCharset://
reqCookies://
reqCors://
reqBody://
reqMerge://
reqPrepend://
reqAppend://
reqReplace://
reqWrite://
reqWriteRaw://
reqRules://
reqScript://
```

选择建议：

- 加参数：`urlParams://`
- 改路径：`pathReplace://`，匹配 path 不含开头 `/`
- 改方法：`method://`
- 改 headers：`reqHeaders://`
- 改 cookies：`reqCookies://`
- JSON 合并：`reqMerge://`
- 复杂条件：`reqScript://`，源码中归一到 `rulesFile`
- 同一匹配下多条请求规则：`reqRules://`，源码中归一到 `rulesFile`

`cache://N` 设置缓存 N 秒；`cache://no-cache` 不缓存，`cache://no-store` 不存储。`reqCors://` 用于设置请求 CORS 头，如 origin、method、headers。`sniCallback://`、`cipher://` 属 TLS/证书高级场景，生成前优先查官方文档。

## Rewrite Response

改状态码、响应头、Cookie、Body，或注入资源。

```txt
statusCode://    # 直接返回状态码，不请求服务器；status:// 是别名
replaceStatus:// # 请求仍到达服务器，只替换响应状态码
redirect://
locationHref://  # 页面场景下用 location.href 跳转，适合部分 302 不触发的 iframe/页面跳转
resHeaders://
responseFor://
resType://
resCharset://
resCookies://
attachment://
resCors://
resBody://
resMerge://
resPrepend://
resAppend://
resReplace://
htmlPrepend://
htmlBody://
htmlAppend://
cssPrepend://
cssBody://
cssAppend://
jsPrepend://
jsBody://
jsAppend://
trailers://
resWrite://
resWriteRaw://
resRules://
resScript://
frameScript://
```

选择建议：

- Mock 状态码：`statusCode://`
- 替换真实响应状态：`replaceStatus://`
- 修复跨域：`resCors://` 或 `resHeaders://`
- Mock JSON 响应体：`file://({...})`、`resBody://` 或 Values 引用；`responseFor://` 不是响应体 mock
- 页面注入：`htmlAppend/cssAppend/jsAppend` 加 `lineProps://safeHtml`
- 复杂响应条件：`resScript://`
- iframe 注入脚本：`frameScript://`

`resRules://` 是 `resScript` 的别名。`resCookies://` 支持设置 cookie 属性，如 `domain`、`path`、`expires`、`httpOnly`、`secure`、`sameSite`。`redirect://` 返回跳转状态，配合 `replaceStatus://301` 可做 301；`locationHref://` 更偏浏览器页面跳转场景。

`responseFor://` 的语义是设置 `x-whistle-response-for`，用于自定义 Network 面板里显示的 `ServerIP`。不要用它返回 JSON、HTML 或其他响应体。

## General

```txt
pipe://          # 把请求/响应内容交给插件处理，常用于流式或加解密展示
delete://        # 删除 URL 参数、头、cookie、body 字段、pathname 片段等
headerReplace:// # 对已有 header/trailer 值做部分字符串替换
```

删除示例：

```txt
delete://urlParams.name
delete://reqHeaders.name
delete://resHeaders.name
delete://reqBody.fieldName
delete://resBody.fieldName
delete://reqCookies.name
delete://resCookies.name
delete://pathname.0
```

`headerReplace://req.header-name:pattern=replacement` 替换请求头局部值；`headerReplace://res.header-name:pattern=replacement` 替换响应头局部值；`headerReplace://trailer.name:pattern=replacement` 替换 trailer 局部值。

## Throttle

```txt
reqDelay://
resDelay://
reqSpeed://
resSpeed://
```

用于弱网、慢接口、上传/下载限速测试。

## Tools

```txt
weinre://
log://
```

- `weinre://id`：页面远程调试。
- `log://id`：采集页面 console 和 JS 异常。

## Settings

```txt
style://       # Network 面板视觉标记
enable://
disable://
lineProps://
```

常见：

```txt
# 捕获发往 IP 的 HTTPS
192.168.1.10 enable://captureIp

# 禁用特定域名 HTTPS 解密
api.example.com disable://capture

# 提升同协议规则优先级
www.example.com/path file:///Users/me/a.html lineProps://important

# 注入 HTML 时避免误注入 JSON
www.example.com jsAppend://(console.log(1)) lineProps://safeHtml
```

`lineProps` 只影响同一行 operation，不能单独作为 operation。

常见 `enable/disable`：`capture`、`captureIp`、`captureHttp`、`captureHttps`、`captureSNI`、`captureNoSNI`、`forHttp`、`forHttps`、`https`、`http2`/`h2`、`intercept`、`cache`、`safeHtml`、`strictHtml`、`proxyFirst`、`proxyHost`、`gzip`、`br`、`deflate`、`abort`、`abortReq`、`abortRes`、`hide`、`keepCSP`、`keepCache`、`bigData`、`auto2http`、`ignoreSend`、`ignoreReceive`、`pauseSend`、`pauseReceive`、`authCapture`、`customParser`。

常见 `lineProps`：`important`、`safeHtml`、`strictHtml`、`disableAutoCors`、`disableUserLogin`、`proxyHost`、`proxyFirst`、`proxyTunnel`、`internal`、`internalOnly`、`internalProxy`、`weakRule`、`enableBigData`。

HTML 注入保护优先输出 `lineProps://safeHtml` / `lineProps://strictHtml` 或 `enable://safeHtml`；不要推荐旧式 `includeFilter://safeHtml` / `includeFilter://strictHtml`，即使部分版本会兼容归一。

`style://color=@f00` 或 `style://color=red` 设置文字颜色，`style://bgColor=@ffeeaa` 设置背景色，`style://fontStyle=italic|bold` 设置字体样式。

## Filters

```txt
includeFilter://
excludeFilter://
ignore://
skip://
```

简单条件优先用 filter；多字段复杂逻辑优先用 `reqScript`。

`excludeFilter://...` 只是让当前规则不生效。`ignore://*|-file` 用于忽略某类协议匹配；`skip://` 官方文档描述为跳过当前匹配并继续尝试同类型其他规则，但源码协议别名会归一到 `ignore`，遇到版本差异时以当前 Whistle 文档/版本为准。
