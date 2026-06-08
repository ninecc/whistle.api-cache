# API 参考

## PluginOptions 完整工具

`options` 对象在所有 hook 中可用，提供以下工具：

### 存储

| 工具 | 说明 |
|------|------|
| `options.storage` / `options.localStorage` | 当前插件的 Storage 实例（两者相同） |
| `options.sharedStorage` | 跨插件共享的 SharedStorage 实例 |
| `options.Storage` | Storage 类 |

### 网络请求

| 工具 | 说明 |
|------|------|
| `options.request(options, cb)` | 发起 HTTP 请求 |
| `options.connect(options)` | 建立 CONNECT 隧道 |

### 流与解析

| 工具 | 说明 |
|------|------|
| `options.streamUtils` | 流工具（readRawBuffer, readBuffer, readText, readJson） |
| `options.zipBody(data, svrRes, cb)` | 压缩响应体 |
| `options.parseUrl(url)` | URL 解析 |

### WebSocket

| 工具 | 说明 |
|------|------|
| `options.wsParser` | WebSocket 帧解析器 |
| `options.wrapWsReader` | 包装 WebSocket 读取流 |
| `options.wrapWsWriter` | 包装 WebSocket 写入流 |

### 模块加载

| 工具 | 说明 |
|------|------|
| `options.require(path)` | 加载 whistle 内置模块（如 `./lib/util/common`） |
| `options.whistleRequire(path)` | 加载 whistle 根模块 |

### Whistle 状态查询

| 工具 | 说明 |
|------|------|
| `options.getValue(name, cb)` | 获取 Whistle Values |
| `options.getCert(domain, cb)` | 获取证书 |
| `options.getRootCA(cb)` | 获取根 CA |
| `options.getHttpsStatus(cb)` | 获取 HTTPS 状态 |
| `options.getRuntimeInfo(cb)` | 获取运行时信息 |
| `options.getRules(cb)` | 获取当前规则列表 |
| `options.getValues(cb)` | 获取当前 Values 列表 |
| `options.getPlugins(cb)` | 获取当前插件列表 |
| `options.getCustomCertsInfo(cb)` | 获取自定义证书信息 |
| `options.isActive(cb)` | 检查插件是否激活 |
| `options.updateRules()` | 触发规则更新 |

### 其他

| 工具 | 说明 |
|------|------|
| `options.name` | 插件包名 |
| `options.version` | 插件版本 |
| `options.debugMode` | 是否调试模式 |
| `options.config` | 插件配置 |
| `options.shortName` | 插件短名（如 `"mock-api"`） |
| `options.baseUrl` | 插件基础 URL |
| `options.ctx` | 插件上下文对象 |
| `options.compose(options, cb)` | 组合中间件 |
| `options.getTempFilePath(ruleValue)` | 根据规则值获取临时文件路径 |
| `options.generateSaz(sessions)` | 生成 SAZ 归档 |
| `options.extractSaz(saz, cb)` | 提取 SAZ 归档 |
| `options.LRU` | LRU 缓存类 |

类型定义中未确认 `options.requestInternal`、`options.readStream`、`options.formatHeaders`；不要在新代码里依赖这些名称，除非已在目标 Whistle 版本实测。

## Storage API

`options.storage` 提供当前插件的文件式持久化存储。TypeScript 类型定义里多为同步返回值；部分运行时版本也支持回调。写兼容代码时优先按目标版本实测。

### 文件操作

| 方法 | 说明 |
|------|------|
| `storage.writeFile(file, data)` | 写文件，返回 boolean；部分版本支持 `cb` |
| `storage.readFile(file)` | 读文件，返回 string/null；部分版本支持 `cb` |
| `storage.updateFile(file, data)` | 更新文件（存在才写入） |
| `storage.removeFile(file)` | 删除文件 |
| `storage.renameFile(file, newFile)` | 重命名文件 |
| `storage.moveTo(fromName, toName)` | 移动文件 |
| `storage.existsFile(file)` | 判断文件是否存在 |
| `storage.getFileList(origin)` | 列出文件 |
| `storage.count()` | 获取文件数量 |

### 属性操作（轻量，适合配置项）

| 方法 | 说明 |
|------|------|
| `storage.setProperty(name, value)` | 设置属性 |
| `storage.getProperty(name)` | 获取属性 |
| `storage.hasProperty(name)` | 判断属性是否存在 |
| `storage.setProperties(obj)` | 批量设置属性 |
| `storage.removeProperty(name)` | 删除属性 |

## SharedStorage API

`options.sharedStorage` 是跨插件共享的 key-value 异步存储，不是文件式 Storage。

| 方法 | 说明 |
|------|------|
| `sharedStorage.getAll()` | 返回全部键值 |
| `sharedStorage.setItem(key, value?)` | 设置键值 |
| `sharedStorage.getItem(key)` | 获取键值 |
| `sharedStorage.removeItem(key)` | 删除键值 |

## 导出别名映射

whistle 内部解析插件导出时的名称回退。该映射来源于源码实现，不是稳定公开 API；新代码建议始终使用标准名称。

| Hook | 导出名（按优先级） |
|------|-------------------|
| auth | `auth` → `verify` |
| sniCallback | `sniCallback` → `SNICallback` |
| server | `pluginServer` → `server` → 默认导出（整个模块） |
| statsServer | `statServer` → `statsServer` → `reqStatServer` → `reqStatsServer` |
| resStatsServer | `resStatServer` → `resStatsServer` |
| uiServer | `uiServer` → `innerServer` → `internalServer` |
| rulesServer | `pluginRulesServer` → `rulesServer` → `reqRulesServer` |
| resRulesServer | `resRulesServer`（无别名） |
| tunnelRulesServer | 复用 `pluginRulesServer`，独立 `tunnelRulesServer` |
| tunnelServer | `pluginServer` → `tunnelServer` → `connectServer`（回退到 server） |

建议始终使用标准名称（每行第一个），别名仅为兼容旧版保留。

## Request 类型常用能力

### PluginAuthRequest

| 成员 | 说明 |
|------|------|
| `req.fullUrl` / `req.headers` | 当前请求 URL 和请求头 |
| `req.isUIRequest` | 是否插件 UI 请求 |
| `req.setHtml(html)` | 设置 HTML 响应 |
| `req.setRedirect(url)` | 设置跳转 |
| `req.setLogin(boolean)` | 标记登录态 |
| `req.setHeader(name, value)` | 设置响应头 |
| `req.setUrl(url)` | 设置重定向 URL |
| `req.setFile(url)` | 设置文件响应 |
| `req.set(key, value)` | 通用设置器 |

### PluginRequest / PluginServerRequest

| 成员 | 说明 |
|------|------|
| `req.getSession(cb)` | 获取当前 session |
| `req.getFrames(cb)` | 获取 WebSocket 帧 |
| `req.sessionStorage.set/get/remove` | 会话级存储 |
| `req.originalReq` | 请求上下文，见下节 |
| `req.originalRes` | 响应上下文，响应阶段可用 |
| `req.request(options, cb)` / `req.connect(options)` | 插件 server 子请求 |
| `req.setReqRules(rules)` / `res.setResRules(rules)` | 在 server hook 内设置请求/响应阶段规则 |
| `res.writeHead(statusCode, headers?)` | `PluginServerResponse` 写响应头 |

### originalReq 重要字段

`originalReq` 字段较多，常用但容易漏掉的包括：

```txt
id fullUrl method headers clientIp serverIp statusCode
isH2 isHttp2 enableCapture customParser
ruleValue pipeValue sniValue ruleUrl ruleProtocol realUrl
isUIRequest isFromPlugin pluginVars globalPluginVars
```

用这些封装字段优先于直接读兼容性 header。

## 兼容性 Header

插件子进程通过 HTTP header 获取请求上下文。可用 `options` 常量访问：

| 常量 | Header 名 | 含义 |
|------|-----------|------|
| `options.FULL_URL_HEADER` | `x-whistle-full-url` | 完整请求 URL |
| `options.RULE_VALUE_HEADER` | `x-whistle-rule-value` | 规则值 |
| `options.REAL_URL_HEADER` | `x-whistle-real-url` | 真实 URL |
| `options.METHOD_HEADER` | `x-whistle-method` | 请求方法 |
| `options.CLIENT_IP_HEADER` | `x-whistle-client-ip` | 客户端 IP |
| `options.SERVER_IP_HEADER` | `x-whistle-server-ip` | 服务端 IP |
| `options.STATUS_CODE_HEADER` | `x-whistle-status-code` | 状态码 |
| `options.CLIENT_INFO_HEADER` | `x-whistle-client-info` | 客户端信息 |
| `options.CLIENT_ID_HEADER` | `x-whistle-client-id` | 客户端 ID |
| `options.SNI_VALUE_HEADER` | `x-whistle-sni-value` | SNI 值 |
| `options.CUSTOM_CERT_HEADER` | `x-whistle-custom-cert` | 自定义证书标记 |
| `options.ENABLE_CAPTURE_HEADER` | `x-whistle-enable-capture` | 是否启用抓包 |
| `options.RULE_PROTO_HEADER` | `x-whistle-rule-proto` | 规则协议 |
| `options.RULE_URL_HEADER` | `x-whistle-rule-url` | 规则 URL |
| `options.PIPE_VALUE_HEADER` | `x-whistle-pipe-value` | pipe 值 |
| `options.REQ_ID_HEADER` | `x-whistle-req-id` | 请求 ID |
| `options.PLUGIN_REQUEST_HEADER` | `x-whistle-plugin-request` | 插件请求标记 |
| `options.LOCAL_HOST_HEADER` | `x-whistle-local-host` | 本地 host |
| `options.HOST_VALUE_HEADER` | `x-whistle-host-value` | host 规则值 |
| `options.PROXY_VALUE_HEADER` | `x-whistle-proxy-value` | proxy 规则值 |

这些 header 在 `req.headers` 中直接可用。插件代码中通常不需要直接读取这些 header，因为 `req.originalReq` 和 `req.originalRes` 已经提供了封装后的属性访问。
