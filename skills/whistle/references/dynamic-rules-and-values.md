# Whistle Values、批量规则和脚本规则

## 什么时候用 Values

这些情况优先使用 Values：

- JSON、HTML、CSS、JS、headers 等内容多行或包含空格。
- 同一段内容被多条规则复用。
- 想避免 Rules 中过长的内联值。
- 需要编辑 mock 数据而不改规则。

Rules 中引用：

```txt
www.example.com/api/user file://{user.json}
www.example.com/api reqHeaders://{headers.txt}
www.example.com htmlAppend://{debug.html}
```

Values 内容示例：

```json
{"id":1,"name":"mock"}
```

headers 内容示例：

```txt
x-debug: 1
authorization: Bearer token
```

## 操作值格式和来源

常见 operation value 支持三种数据格式：

```txt
# JSON 格式
reqHeaders://({"x-debug":"1"})

# 行格式，冒号加空格分隔，支持点号嵌套
reqHeaders://(x-debug: 1)

# 内联格式
reqHeaders://x-debug=1&x-env=test
```

多数请求/响应参数、头、body、trailers 类 operation 支持 Inline、内嵌块、Values、本地文件和远程 URL。`http/https/ws/wss/tunnel/host/enable/cache/method` 等连接、设置或简单值类协议通常不支持从本地文件或远程 URL 加载内容，生成冷门组合前先查官方文档。

括号会强制按字面量处理，避免被当成文件、远程 URL 或 Values：

```txt
reqHeaders:///Users/me/header.txt    # 尝试从文件加载
reqHeaders://(/Users/me/header.txt)  # 使用这个路径字符串本身
file://({"ok":true})                 # 内联 JSON mock
```

## 模板字符串变量

Whistle 支持 ES6 风格模板字符串变量，可用于 inline、内嵌块、Values 和括号内容：

```txt
www.example.com/api reqHeaders://x-req-id=`${reqId}`
www.example.com/api urlParams://t=`${now}`&r=`${random}`
www.example.com/api file://({"host":"`${url.hostname}`","method":"`${method}`"})
```

常用变量：

```txt
${now} ${random} ${randomUUID} ${randomInt(10)} ${randomInt(1-100)}
${reqId} ${method} ${url} ${querystring} ${searchstring}
${url.protocol} ${url.hostname} ${url.host} ${url.port}
${url.path} ${url.pathname} ${url.search} ${query.name}
${reqHeaders.name} ${resHeaders.name}
${reqCookies.name} ${resCookies.name}
${statusCode} ${clientIp} ${clientPort} ${serverIp} ${serverPort}
${version} ${port} ${host} ${realPort} ${realHost}
${env.NAME}
```

这只是常用变量。冷门变量还可能包括 `${hostname}`、`${path}`、`${remoteAddress}`、`${remotePort}`、`${clientId}`、`${localClientId}`、`${realUrl}`、`${whistle.plugin-name}` 等；生产关键规则使用前按当前 Whistle 版本核对。

## 内嵌块

需要在 Rules 里放一次性内容时，用内嵌块：

````txt
``` user.json
{"id":1,"name":"mock"}
```

www.example.com/api/user file://{user.json}
````

当值看起来像路径、URL 或 `{key}`，但只是字面量时，用小括号：

```txt
www.example.com/api file://({"ok":true})
www.example.com/api reqHeaders://(/Users/me/not-a-file)
```

## reqRules/resRules

复杂场景需要一次性追加多条规则时，用批量规则。

````txt
``` api-mock.txt
* statusCode://200
* resType://json
* file://({"ok":true})
```

www.example.com/api/test reqRules://{api-mock.txt}
````

响应阶段批量规则：

````txt
``` response-debug.txt
* resHeaders://x-debug=1
* resAppend://("\n<!-- debug -->")
```

www.example.com/page resRules://{response-debug.txt}
````

源码别名关系：`reqScript` / `reqRules` 会归一到 `rulesFile`，`resRules` 会归一到 `resScript`。对用户输出时仍可使用更直观的 `reqRules://`、`reqScript://`、`resRules://`。

UI 解析同一行多个 operation 时，会拆成多条同 pattern 规则；但批量规则仍更适合可复用、多行、需要注释的组合，不要把复杂规则硬塞到一行。

`resRules` / `resScript` 只在响应阶段生成响应阶段规则。不要期望 `file://`、`http://` 这类请求阶段规则在响应阶段短路返回；响应阶段改内容用 `resBody://`、`resHeaders://`、`replaceStatus://` 等。

适合：

- 同一个匹配条件下组合多条改写。
- 把 mock、headers、类型、延迟拆成可复用块。
- 避免主 Rules 文件变得很长。

## reqScript

`reqScript` 在请求阶段用 JavaScript 动态生成规则，适合复杂条件。

````txt
``` pick-rule.js
if (method === 'GET' && /\/api\/user/.test(url)) {
  rules.push('* resType://json');
  rules.push('* file://({"id":1,"from":"reqScript"})');
} else {
  rules.push('* statusCode://403');
}
```

www.example.com/api reqScript://{pick-rule.js}
````

常见全局变量/方法：

- `url`：完整请求 URL。
- `method`：请求方法。
- `ip` / `clientIp`：客户端 IP。
- `headers`：请求头对象。
- `body`：请求体，适合小 body 条件判断。
- `rawBody`：原始请求体。
- `query`：查询参数对象。
- `oTime` / `startTime`：请求开始时间。
- `rules`：规则数组，通过 `rules.push(...)` 添加规则。
- `values`：临时值存储对象。
- `getValue(key)`：读取 Values。
- `render(tpl, data)`：模板渲染。
- `parseUrl`、`parseQuery`：URL/query 解析。

## resScript

需要基于响应状态、响应头或响应体再决定规则时，用 `resScript`。

常见全局变量/方法：

- `url`、`method`、`headers`、`body`、`rawBody`、`query`：请求相关信息。
- `statusCode`：响应状态码。
- `resHeaders`：响应头对象。
- `resBody`：响应体，适合小响应体条件判断。
- `serverIp`：服务端 IP。
- `rules`：规则数组，通过 `rules.push(...)` 添加响应阶段规则。
- `values`、`getValue(key)`、`render(tpl, data)`、`parseUrl`、`parseQuery`：与 `reqScript` 类似的辅助能力。

变量能力会随 Whistle 版本变化；遇到生产关键脚本或冷门变量时，让用户确认当前版本或查官方文档。

## 选择建议

- 简单映射/mock：直接写一条规则。
- 多行内容：Values。
- 同一匹配下固定多条规则：`reqRules` / `resRules`。
- 条件逻辑依赖 method、URL、headers、body：`reqScript`。
- 需要长逻辑、UI、外部服务、复用能力：考虑 Whistle 插件。
- 已经出现插件包、`whistle.xxx`、hook、`whistleConfig`、`lack watch`：切换到 `whistle-plugin` skill。

## 生成动态规则的回答格式

```txt
# Rules
www.example.com/api reqScript://{pick-rule.js}
```

```js
// Values: pick-rule.js
if (method === 'GET') {
  rules.push('* resType://json');
  rules.push('* file://({"ok":true})');
}
```

说明验证方式：访问哪个 URL、Network Overview 应看到哪个规则、响应体/状态码应是什么。
