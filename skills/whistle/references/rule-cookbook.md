# Whistle 规则 Cookbook

## 基本语法

```txt
pattern operation [operation...] [lineProps...] [filters...]
```

`pattern` 决定匹配哪些请求，`operation` 决定处理动作，`filters` 决定进一步缩小作用范围。
一行可以组合多个 operation，filters 作用于整条规则。

生成规则前先读用户意图，不要只按关键词套模板。尤其区分：

- 转发到目标服务：`http://` / `https://`
- 走上游代理：`proxy://` / `https-proxy://` / `socks://`
- 改连接 IP：`host://`
- 改请求 Host 头：`reqHeaders://host=...`
- Mock 响应体：`file://({...})` / `resBody://` / Values 引用
- 浏览器跳转：`redirect://`

## Pattern 常见写法

完整通配、路径和正则说明见 `pattern-matching.md`。这里只放高频模板。

```txt
# host
www.example.com operation://value

# 协议 + host + path
https://www.example.com/api operation://value

# 一层子域
*.example.com operation://value

# 任意层级子域
**.example.com operation://value

# 根域 + 任意层级子域，需要两条
example.com operation://value
**.example.com operation://value

# 路径前缀
www.example.com/api operation://value

# 路径通配，必须加 ^
^www.example.com/api/*/users operation://value

# 路径多级通配，必须加 ^
^www.example.com/static/**/app.js operation://value

# 路径通配映射本地目录时，不要依赖自动拼接，显式使用捕获值
^www.example.com/static/** file:///Users/me/project/dist/$1

# WebSocket
wss://www.example.com/socket operation://value

# CONNECT 隧道
tunnel://www.example.com:443 operation://value

# 正则
/\/api\/v\d+\// operation://value
```

## 本地开发

```txt
# 整站转发到 Vite/webpack dev server
www.example.com http://localhost:port

# 只把页面转到本地，排除 API 和静态目录
www.example.com http://localhost:port excludeFilter://*/api excludeFilter://*/static

# API 转到本地后端
www.example.com/api http://localhost:port

# 静态目录映射
www.example.com/static file:///Users/me/project/dist/static

# 单个文件映射
www.example.com/app.js file:///Users/me/project/dist/app.js
```

给本地映射加 CORS：

```txt
www.example.com/static file:///Users/me/project/dist/static
www.example.com/static resCors://*
```

## 远程映射和代理

```txt
# API 转到测试环境
www.example.com/api https://test.example.com/api

# WebSocket 转发
wss://www.example.com/socket ws://localhost:port/socket

# Host 覆盖
www.example.com host://10.0.0.10

# 上游 HTTP 代理
www.example.com proxy://127.0.0.1:8080

# 上游 HTTPS 代理
www.example.com https-proxy://proxy.example.com:443

# SOCKS 代理
www.example.com socks://127.0.0.1:1080
```

如果需要同时让 `proxy` 和 `host` 生效，考虑：

```txt
www.example.com proxy://127.0.0.1:8080 lineProps://proxyHost
www.example.com host://10.0.0.10
```

## 请求改写

```txt
# 添加查询参数
www.example.com/api urlParams://debug=1
www.example.com/api urlParams://traceId=`${reqId}`

# 替换 path（pathReplace 匹配的 path 不含开头 /）
www.example.com pathReplace://(^api=mock-api)
www.example.com pathReplace://({"old":"new","/v1/ig":"v2"})

# 修改方法
www.example.com/api method://POST

# 请求头
www.example.com/api reqHeaders://x-debug=1
www.example.com/api ua://Mozilla/5.0
www.example.com/api referer://https://www.example.com/

# Cookie
www.example.com reqCookies://token=abc

# 请求体
www.example.com/api reqBody://({"name":"mock"})
www.example.com/api reqMerge://({"extra":true})
www.example.com/api reqAppend://&debug=1
```

## 响应改写

```txt
# 状态码
www.example.com/api statusCode://500       # 直接返回 500，请求不到服务器
www.example.com/api replaceStatus://200    # 请求到服务器，只替换响应状态

# Redirect
www.example.com/old redirect://https://www.example.com/new
www.example.com/old redirect://https://www.example.com/new replaceStatus://301

# 响应头
www.example.com/api resHeaders://x-debug=1
www.example.com/api resCors://*

# 响应类型和编码
www.example.com/api resType://json
www.example.com/api resCharset://utf8

# Mock 响应
www.example.com/api/user file://({"id":1,"name":"mock"}) resType://json cache://no-store

# 动态 mock/header，可用模板变量
www.example.com/api/user file://({"id":"`${reqId}`","time":"`${now}`"}) resType://json
www.example.com/api reqHeaders://x-client-ip=`${clientIp}`

# 合并/追加/替换响应体
www.example.com/api resMerge://({"extra":true})
www.example.com/api resAppend://("\n<!-- debug -->")
www.example.com/api resReplace://old=new
```

删除字段、参数或头：

```txt
www.example.com/api delete://urlParams.debug
www.example.com/api delete://reqHeaders.authorization
www.example.com/api delete://resHeaders.x-powered-by
www.example.com/api delete://reqBody.token
www.example.com/api delete://resBody.data.secret
www.example.com/api delete://pathname.0
```

## HTML/CSS/JS 注入

优先限定到页面 HTML，避免注入 JSON 接口：

```txt
www.example.com htmlAppend://(<script src="http://localhost:port/debug.js"></script>) lineProps://safeHtml
www.example.com cssAppend://(body{outline:1px solid red}) lineProps://safeHtml
www.example.com jsAppend://(console.log('whistle debug')) lineProps://safeHtml
```

如果必须严格只注入 HTML，可考虑 `lineProps://strictHtml`。

## 限速和延迟

```txt
# 请求延迟/响应延迟，单位通常按协议文档解释
www.example.com/api reqDelay://1000
www.example.com/api resDelay://2000

# 请求/响应限速
www.example.com/api reqSpeed://10
www.example.com/api resSpeed://20
```

## 调试工具

```txt
# Weinre 远程调试
www.example.com weinre://page-debug

# 页面 console 和异常收集
www.example.com log://page-log
```

`log://id` 会把页面 console 和异常按 id 分组显示在 Whistle 管理界面。

## Filters

完整 filters 说明见 `filter-matching.md`。先区分“匹配”和“改写”：匹配请求体用 `includeFilter://b:...`，改写请求体才用 `reqBody://...`。

```txt
# 方法
includeFilter://m:GET
excludeFilter://m:POST

# URL
includeFilter://*/api
excludeFilter://*.png

# 请求体
includeFilter://b:keyword
includeFilter://b:/cmdname=foo/i
includeFilter://b:e40ab9f5742cee484c09a3d3429df0bc

# 请求/响应头
includeFilter://reqH.content-type:json
includeFilter://resH.content-type:json
excludeFilter://reqH.user-agent:/android/i

# 状态码
includeFilter://s:/^20/

# IP
includeFilter://clientIp:/^192\.168\./
includeFilter://serverIp:10.0.0.1

# 概率
includeFilter://chance:0.1
```

组合过滤器时先单独测试，因为多个 include 条件通常不是简单 AND。需要复杂逻辑时改用 `reqScript` 或更窄的 pattern。

## 容易误判的语义

- `responseFor://` 不是响应体 mock，它只用于设置 Whistle Network 面板里展示的 `ServerIP` / `x-whistle-response-for`。Mock JSON 用 `file://({...})`、`resBody://` 或 Values。
- `pathReplace://` 改的是 URL 的 path 部分，且 path 不包含开头 `/`。如果要删掉或替换开头的 `api/`，写 `pathReplace://(/^api//=)` 这类表达，不要写 `^/api`。
- `pathReplace://` 的源码 canonical name 是 `urlReplace`，但规则里常用 `pathReplace://`。
- `statusCode://` 会直接返回状态码，不请求服务器；`replaceStatus://` 会让请求到达服务器，只替换响应状态。
- `reqBody://` 是改写请求体；按请求体内容筛选规则用 `includeFilter://b:...`。
- `proxy://` 是上游代理；把请求转发到本地服务用 `http://localhost:port`。
- `host://` 改连接目标 IP/host；改 HTTP Host 头用 `reqHeaders://host=...`。

## 优先级和 lineProps

```txt
# 提升同协议规则优先级
www.example.com/path file:///Users/me/a.html
www.example.com/path file:///Users/me/b.html lineProps://important

# 代理和 host 同时生效
www.example.com proxy://127.0.0.1:port lineProps://proxyHost
www.example.com host://10.0.0.10

# HTML 注入保护
www.example.com jsAppend://(console.log(1)) lineProps://safeHtml
```

`lineProps` 只作用于同一行的 operation，不能单独作为 operation 使用。
