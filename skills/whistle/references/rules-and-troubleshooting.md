# Whistle 快速参考

## 规则检查表

返回规则前检查：

- `pattern` 是否匹配真实完整 URL，必要时包含协议和路径。
- `operation` 是否属于正确类型：本地映射、远程映射、DNS/proxy、请求改写、响应改写、工具、设置或过滤。
- 文件映射是否使用 `file:///abs/path`，本地绝对路径必须是三个斜杠。
- 内联 JSON 响应是否用小括号包裹：`file://({"ok":true})`。
- filters 会作用于整条规则，不确定时先单独测试。
- 一行可以组合多个 operation，但要确认每个 operation 都属于同一意图。
- 规则顺序是否有意设计，因为后面的规则可能覆盖前面的效果。

## 常用 Pattern

```txt
# 匹配某 host 的 HTTP/HTTPS
www.example.com operation://value

# 只匹配 HTTPS
https://www.example.com operation://value

# 匹配某路径树
www.example.com/api operation://value

# 一层子域名
*.example.com operation://value

# 任意层级子域名，不含根域
**.example.com operation://value

# 根域 + 任意层级子域名，需要两条
example.com operation://value
**.example.com operation://value

# 路径通配，必须加 ^
^www.example.com/api/*/users operation://value

# WebSocket
wss://www.example.com/socket operation://value

# CONNECT tunnel
tunnel://www.example.com:443 operation://value
```

## 快速规则块

```txt
# 本地 Web 开发：页面到本地 dev server，API 和 static 保持不变
www.example.com http://localhost:port excludeFilter://*/api excludeFilter://*/static

# 本地静态文件
www.example.com/static file:///Users/me/project/dist/static

# API 转发到测试后端
www.example.com/api http://test-api.example.net

# Host 覆盖
www.example.com host://10.0.0.10

# 上游 HTTP 代理
www.example.com proxy://127.0.0.1:8080

# SOCKS 代理
www.example.com socks://127.0.0.1:1080

# CORS 响应头
www.example.com/api resHeaders://access-control-allow-origin=*

# 请求头
www.example.com/api reqHeaders://authorization=Bearer%20token
www.example.com/api reqHeaders://x-req-id=`${reqId}`

# Mock JSON
www.example.com/api/user file://({"id":1,"name":"mock"}) resType://json cache://no-store

# Redirect
www.example.com/old redirect://https://www.example.com/new

# 模拟慢响应
www.example.com/api resDelay://2000

# 直接返回状态码，不请求服务器
www.example.com/api statusCode://500

# 请求到服务器后替换响应状态
www.example.com/api replaceStatus://500
```

## Values 和内嵌内容

复用或多行内容优先放 Values：

```txt
www.example.com/api/user file://{user.json}
www.example.com/api reqHeaders://{headers.txt}
```

一次性多行内容可用内嵌块：

````txt
``` user.json
{"id":1,"name":"mock"}
```
www.example.com/api/user file://{user.json}
````

当字面值看起来像文件路径、URL 或 `{key}`，但不希望被间接引用时，用小括号：

```txt
www.example.com/api reqHeaders://(/Users/me/not-a-file)
www.example.com/api file://({"ok":true})
```

常用模板变量：

```txt
`${now}` `${reqId}` `${url.hostname}` `${query.id}` `${method}`
`${reqHeaders.authorization}` `${statusCode}` `${clientIp}` `${serverIp}`
```

## Filters

```txt
# HTTP 方法
includeFilter://m:GET
excludeFilter://m:POST

# 请求体
includeFilter://b:keyword
includeFilter://b:/cmdname=foo/i

# 请求/响应头
includeFilter://reqH.content-type:json
excludeFilter://reqH.user-agent:/android/i
includeFilter://resH.content-type:json

# 状态码
includeFilter://s:/^20/

# 客户端/服务端 IP
includeFilter://clientIp:/^192\.168\./
includeFilter://serverIp:10.0.0.1

# 概率
includeFilter://chance:0.1
```

多个 include filter 是 OR 关系。组合过滤时要谨慎，建议先测试单个 filter。

## HTTPS 排查

症状和常见处理：

- `Tunnel to ...`：HTTPS 未解密、流量是普通 TCP，或请求 IP 缺少 SNI。
- `captureError`：根证书未信任、证书锁定、Firefox 证书处理独立，或目标/客户端拒绝生成证书。
- 移动端 HTTP 正常但 HTTPS 失败：通常是证书安装了但没有完全信任，iOS 尤其常见。
- 特定 App 抓不到：可能不信任用户 CA，或启用了证书锁定。

有用规则：

```txt
# 捕获发往 IP 的 HTTPS
192.168.1.10 enable://captureIp
192.168.1.10:443 enable://capture

# 避免解密有证书锁定的域名
api.example.com disable://capture
api.example.com disable://capture includeFilter://reqH.user-agent:/android/i
```

## 验证流程

1. 从 Network 中已经可见的简单请求开始。
2. 复制完整 URL，写最窄的 pattern。
3. 只添加一个 operation。
4. 刷新或 Replay 请求。
5. 在 Network Overview 检查规则匹配。
6. 基础规则生效后，再添加 filters 或更多 operation。

## 常用 UI 区域

- Network：抓包列表、Replay/Edit、Overview 匹配信息、Tools 里的 Console/Server 日志。
- Rules：编辑和启用规则，用 `#` 临时注释规则。
- Values：保存可复用内容，通过 `{key}` 引用。
- HTTPS：下载根证书、HTTPS capture 开关、HTTP/2 开关、自定义证书。
- Online：远程设备设置代理时使用的 IP/端口。
- Plugins：插件安装和管理。

Network 搜索可用 `m:` 方法、`h:` 请求头、`b:` 请求体、`i:` IP、`s:` 状态码、`t:` 类型、`mark:` 标记、`app:` 应用、`e:` 错误。Rules/Values 搜索可用 `k:` 只搜名称、`v:` 只搜内容。

## 深入资料

- 配置和抓包：`setup-and-capture.md`
- 本地文件路径：`file-paths.md`
- 意图到语法：`intent-to-syntax.md`
- Pattern 通配和正则：`pattern-matching.md`
- Filters 请求体/头/状态匹配：`filter-matching.md`
- 实操写入、lint、最小修改、回滚：`operational-workflows.md`
- 规则 cookbook：`rule-cookbook.md`
- Values、批量规则、脚本规则：`dynamic-rules-and-values.md`
- 排错手册：`troubleshooting.md`
- 场景模板：`scenario-templates.md`
- 协议索引：`protocol-index.md`
- 问诊决策树：`diagnostic-decision-tree.md`
- 安全和版本确认：`safety-and-intake.md`
