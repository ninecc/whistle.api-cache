# Whistle Filters 匹配详解

用于根据 URL 之外的属性进一步限定规则是否生效。过滤器写在规则行的 operation 后面。

## 必读速记

- 匹配请求体内容用 `includeFilter://b:keyword` 或 `includeFilter://b:/regexp/i`。
- `reqBody://...` 是改写请求体，不是匹配请求体。
- 匹配请求方法用 `includeFilter://m:GET`。
- 匹配请求头用 `includeFilter://reqH.header-name:pattern`。
- 匹配响应头用 `includeFilter://resH.header-name:pattern`。
- 匹配响应状态码用 `includeFilter://s:/^20/`。
- 多个 `includeFilter` 任一命中即可通过；多个 `excludeFilter` 任一命中即排除。
- 同时存在 include 和 exclude 时，必须至少命中一个 include，且不能命中任何 exclude。
- 复杂 AND、JSON body 字段判断、依赖响应体内容时，优先考虑 `reqScript/resScript`。

## 基本语法

```txt
pattern operation includeFilter://filterPattern
pattern operation excludeFilter://filterPattern
```

示例：

```txt
www.example.com/api http://localhost:port includeFilter://m:GET
www.example.com/api file://({"ok":true}) includeFilter://b:e40ab9f5742cee484c09a3d3429df0bc
www.example.com/api resCors://* excludeFilter://reqH.user-agent:/bot/i
```

如果用户只给了路径，没有给域名，可以用路径 pattern，但要说明匹配范围更宽：

```txt
/energy/hummer/api/resource/display file://({"ok":true}) includeFilter://b:e40ab9f5742cee484c09a3d3429df0bc
```

更精确的写法是补上实际域名：

```txt
www.example.com/energy/hummer/api/resource/display file://({"ok":true}) includeFilter://b:e40ab9f5742cee484c09a3d3429df0bc
```

## 请求体匹配

请求体内容匹配使用 `b:pattern`：

```txt
# 请求体包含字符串
www.example.com/api file://({"ok":true}) includeFilter://b:e40ab9f5742cee484c09a3d3429df0bc

# 请求体正则匹配
www.example.com/api file://({"ok":true}) includeFilter://b:/e40ab9f5742cee484c09a3d3429df0bc/

# 表单编码、JSON、文本体都可按原始 body 文本匹配
www.example.com/api reqHeaders://x-hit=1 includeFilter://b:cmdname=foo
```

不要写成：

```txt
# 错误：这是改写请求体，不是匹配请求体
www.example.com/api file://({"ok":true}) reqBody://e40ab9f5742cee484c09a3d3429df0bc
```

如果用户说“匹配请求体中包含 xxx 的请求”，首选：

```txt
<url-pattern> <operation> includeFilter://b:xxx
```

## 方法匹配

```txt
www.example.com/api http://localhost:port includeFilter://m:GET
www.example.com/api statusCode://403 excludeFilter://m:GET
```

## 请求头匹配

```txt
# content-type 包含 json
www.example.com/api reqHeaders://x-debug=1 includeFilter://reqH.content-type:json

# user-agent 正则
www.example.com/api disable://capture includeFilter://reqH.user-agent:/android/i

# authorization 包含 token 片段
www.example.com/api reqHeaders://x-hit=1 includeFilter://reqH.authorization:Bearer
```

注意：这里的 `reqH.*` 是过滤匹配请求头；`reqHeaders://...` 是改写请求头。

## 响应头和状态码匹配

```txt
# 响应状态码 2xx
www.example.com/api resHeaders://x-ok=1 includeFilter://s:/^20/

# 响应头 content-type 包含 json
www.example.com/api resAppend://("\n") includeFilter://resH.content-type:json
```

需要基于响应信息的 filter 只会在响应阶段相关 operation 上有意义。若不确定，先用 Network/Overview 验证匹配。

## IP 和概率匹配

```txt
# 客户端 IP
www.example.com/api statusCode://500 includeFilter://clientIp:192.168.1.23
www.example.com/api statusCode://500 includeFilter://clientIp:/^192\.168\./

# 服务端 IP
www.example.com/api resHeaders://x-server=1 includeFilter://serverIp:10.0.0.1

# 客户端或服务端 IP
www.example.com/api resHeaders://x-ip=1 includeFilter://i:/^10\./

# 概率命中
www.example.com/api statusCode://500 includeFilter://chance:0.1
www.example.com/api statusCode://500 includeFilter://probability:0.1
```

其他可用过滤维度包括 `clientPort`、`serverPort`、`remoteAddress`、`remotePort`、`host`、`from`、`env`。冷门维度在不同版本可能有差异，生成生产规则前让用户确认当前 Whistle 版本。

## URL filter

没有类型前缀的 filter pattern 按 URL pattern 处理：

```txt
www.example.com http://localhost:port excludeFilter://*/api excludeFilter://*/static
www.example.com resHeaders://x-hit=1 includeFilter://https://www.example.com/path
```

## include/exclude 关系

准确语义：

- 多个 `includeFilter`：任一 include 命中即可通过。
- 多个 `excludeFilter`：任一 exclude 命中即排除。
- include 与 exclude 同时存在：必须至少命中一个 include，且不能命中任何 exclude。
- 没有 include 时，只要未命中 exclude 即可通过。

实践建议：

- 单个条件直接用 filter。
- 多个候选条件任一满足，用多个 include filter。
- 必须同时满足多个条件时，优先把 pattern 缩窄，再加一个 filter。
- 仍表达不了时，用 `reqScript/resScript`。

## filter/ignore/skip

老式 `filter://...` 可表达过滤条件，但新规则优先用语义更清楚的 `includeFilter://...` / `excludeFilter://...`。

`includeFilter` / `excludeFilter` 是过滤当前规则是否生效；`ignore://` / `skip://` 用于忽略或跳过某类协议匹配，语义层级不同。

```txt
# 忽略所有映射协议，但保留 file 映射
www.example.com ignore://*|-file

# 跳过当前同类匹配，继续尝试后续同类型规则；具体行为按当前 Whistle 版本验证
www.example.com skip://http
```

官方文档描述：`ignore://` 忽略后不再继续匹配同类型规则，`skip://` 跳过但继续尝试同类型其他规则。源码协议别名中 `skip` 会归一到 `ignore`，遇到两者行为差异时以用户当前 Whistle 版本和官方文档为准。

## 常见意图映射

```txt
请求体包含 token              -> includeFilter://b:token
请求体匹配正则                -> includeFilter://b:/regexp/i
只匹配 GET                    -> includeFilter://m:GET
排除 POST                     -> excludeFilter://m:POST
请求头 content-type 包含 json -> includeFilter://reqH.content-type:json
响应状态为 2xx                -> includeFilter://s:/^20/
只对本人 IP 生效              -> includeFilter://clientIp:192.168.1.23
10% 概率生效                  -> includeFilter://chance:0.1
排除 API                      -> excludeFilter://*/api
```

## 输出自检

返回带 filter 的规则前检查：

1. 用户是要“匹配”还是要“改写”。匹配请求体用 `includeFilter://b`，改写请求体才用 `reqBody://`。
2. `includeFilter://b` 后面是否是字符串或 `/regexp/[i]`。
3. 多个 include filter 是否被误当成 AND。
4. 响应状态/响应头 filter 是否配合响应阶段 operation 使用。
5. 是否给出了实际 operation；只有 filter 没有 operation 不会产生效果。
