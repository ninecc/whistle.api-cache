# Whistle Pattern 匹配详解

用于生成或审查规则的第一列 `pattern`。优先从 Network 复制完整 URL，再按目标缩窄匹配范围。

## 必读速记

- 普通路径前缀：`www.example.com/api`，适合匹配 `/api/...`。
- 路径通配：必须加 `^`，例如 `^www.example.com/api/*/users/**`。
- 路径通配里 `*`、`**` 会按出现顺序形成 `$1`、`$2`，可在 operation 中回填。
- `*` 匹配单级路径片段，不含 `/` 和 `?`；`**` 匹配多级路径片段，不含 `?`；`***` 才考虑 query。
- 路径通配场景不要依赖普通前缀映射的自动拼接；要保留后续路径，显式写 `$1/$2`。
- `**.example.com` 不匹配根域 `example.com`，需要根域时另写一条。
- 正则的 `$1/$2` 来自括号捕获；通配的 `$1/$2` 来自 `*`/`**` 的出现顺序。

## URL 类型

Whistle pattern 可匹配三类请求：

```txt
http://www.example.com/path?a=1
https://www.example.com/path?a=1
ws://www.example.com/socket
wss://www.example.com/socket
tunnel://www.example.com:443
```

注意：`tunnel://` 没有 path。不要给 tunnel pattern 写路径。

## 域名匹配

格式：

```txt
[[schema]://]domain[:port]
```

示例：

```txt
# 匹配该 host 的 HTTP/HTTPS/WS/WSS 等适用请求
www.example.com operation://value

# 明确不指定协议，但保留 URL 形态
//www.example.com operation://value

# 只匹配 HTTPS
https://www.example.com operation://value

# 匹配指定端口
www.example.com:port operation://value

# 匹配 tunnel
tunnel://www.example.com:443 operation://value
```

## 域名通配符

域名、协议、端口部分支持通配符。

```txt
# * 匹配 0 或多个非 . 字符，不能跨域名层级
*.example.com operation://value

# ** 匹配 0 或多个非 / ? 字符，可跨域名层级
**.example.com operation://value

# 域名中间通配
www.example*.com operation://value

# 协议通配，匹配 http 和 https
http*://www.example.com operation://value

# 端口通配
http://www.example.com:8*8 operation://value
```

语义要点：

- `*` 在域名中不跨 `.`，例如 `*.example.com` 可匹配 `www.example.com`，不匹配 `x.www.example.com`。
- `**` 可跨多层子域，例如 `**.example.com` 可匹配 `x.y.example.com`，但不匹配根域 `example.com`。
- `***` 及更多星号不推荐使用。
- 端口里的 `*` 只匹配数字。
- 协议里的 `*` 匹配协议字符，例如 `http*://` 可匹配 `http://` 和 `https://`。

如需同时匹配根域和子域，写两条：

```txt
example.com operation://value
**.example.com operation://value
```

## 路径前缀匹配

普通 path pattern 是路径前缀匹配，不是任意包含匹配。

```txt
www.example.com/api operation://value
```

匹配：

```txt
www.example.com/api
www.example.com/api/
www.example.com/api/user
www.example.com/api/user?id=1
```

不匹配：

```txt
www.example.com/api2
www.example.com/x/api
www.example.com/static/api.js
```

## 路径通配符

路径里的 `*` 是合法 URL 字符。要把它当通配符，pattern 前必须加 `^`。

```txt
^https://**.example.com/api/*/users operation://value
```

路径通配符语义：

```txt
*    匹配单级路径片段，不含 / 和 ?
**   匹配多级路径片段，不含 ?
***  匹配任意字符，包含 / 和 ?
```

示例：

```txt
# 匹配 /api/v1/users 和 /api/v2/users，不匹配 /api/v1/admin/users
^www.example.com/api/*/users operation://value

# 匹配 /static/a/app.js 和 /static/a/b/app.js
^www.example.com/static/**/app.js operation://value

# 需要连 query 也一起通配时才用 ***
^www.example.com/data/***file operation://value
```

没有 `^` 时，路径中的 `*` 不能按通配匹配使用。

## Query 匹配

pattern 可以带 query 条件。

```txt
www.example.com/path/to?name= operation://value
```

语义：

- path 通常要求匹配到指定路径。
- query 参数名区分大小写。
- 带 `name=` 表示必须包含该参数。

查询参数通配符也需要 `^` 路径通配模式：

```txt
^www.example.com/search?q=* operation://value
^www.example.com/search?q=** operation://value
```

query 通配符语义：

```txt
*   匹配单个参数值，不含 &
**  匹配任意字符，可包含 &
```

## 正则匹配

正则 pattern 使用 JavaScript 正则格式：

```txt
/pattern/[flags] operation://value
```

常用 flags：

```txt
i  忽略大小写
u  Unicode 模式
```

示例：

```txt
# 匹配 API 版本
/\/api\/v\d+\// operation://value

# 忽略大小写
/\/api\/v1\/data/i operation://value

# 匹配静态资源扩展名
/\.(jpg|png|gif|css|js)$/i operation://value

# 匹配完整 URL 的用户 ID
/^https?:\/\/www\.example\.com\/user\/(\d+)/ reqHeaders://x-user-id=$1
```

正则使用建议：

- 需要“包含某片段”“复杂分组”“精确边界”时用正则。
- 正则要转义 `/` 和 `.`，例如 `www\.example\.com`。
- 只要 path 前缀能表达，就不要用正则。
- 回答中说明正则匹配的是完整 URL 还是其中片段。

## 子匹配传值

通配符和正则捕获可用 `$0`、`$1` 到 `$9` 传给 operation。

```txt
# 通配符传值
^http://*.example.com/v*/users/** file:///Users/me/mock/$1/$2/$3

# 正则传值
/\/regexp\/(user|admin)\/(\d+)/ reqHeaders://x-type=$1&x-id=$2
```

注意：

- `$0` 是完整匹配。
- `$1` 到 `$9` 是捕获值。
- 使用通配符传值时，先确认每个 `*` / `**` 对应的捕获顺序。
- 映射本地文件时仍要使用 `file:///abs/path`。

## 自动拼接路径

普通 host/path 前缀映射时，Map Remote 和 Map Local 常会把匹配后的剩余路径拼接到目标路径。

```txt
https://*.example.com/path/to https://test.example.com/test
www.example.com file:///Users/me/project/dist
```

含义：

- 访问 `/path/to/a/b?x=1` 可能映射到目标 `/test/a/b?x=1`。
- 目录映射会把 URL path 拼到本地目录。
- 如果只想返回固定内容，不想拼接路径，用更精确的 pattern 或 `resBody://` / `file://({...})`。`responseFor://` 不是响应体 mock。

不要在路径通配符场景依赖自动拼接。经实际使用验证，带 `^` 的路径通配 pattern 不适用普通前缀映射的自动拼接预期。

```txt
# 不要依赖它自动拼接剩余路径
^www.example.com/static/** file:///Users/me/project/dist

# 需要动态目标路径时，显式使用通配捕获值
^www.example.com/static/** file:///Users/me/project/dist/$1
```

同理，正则 pattern 也不要假设会按普通 path 前缀自动拼接；需要动态目标路径时显式用 `$1/$2`，或写固定响应。

## 选择决策

```txt
只匹配一个 host              -> www.example.com
只匹配一个协议              -> https://www.example.com
匹配一个 API 前缀           -> www.example.com/api
匹配一层子域                -> *.example.com
匹配多层子域                -> **.example.com
根域和多层子域都匹配        -> example.com + **.example.com 两条
路径里需要通配              -> ^host/path/*/**，目标路径显式用 $1/$2
匹配任意位置或复杂边界      -> /regexp/
需要用捕获值生成目标路径    -> 通配或正则 + $1/$2
```

## 输出自检

返回 pattern 前检查：

1. 是否需要限制协议。
2. 是否误以为 `**.example.com` 包含根域。
3. path 前缀是否会误伤子路径。
4. 路径通配是否加了 `^`。
5. 正则是否正确转义 `/` 和 `.`。
6. 是否需要 query 条件，参数名大小写是否正确。
7. 本地文件映射是否使用 `file:///abs/path`。
8. 是否说明了匹配范围和不匹配范围。
