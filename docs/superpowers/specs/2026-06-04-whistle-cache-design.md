# whistle.api-cache 设计文档

## 目标

构建 `whistle.api-cache` 第一版：一个通过 UI 控制的 Whistle 插件，用于录制接口响应，并在后续请求中从本地缓存回放。

MVP 范围刻意收窄：

- 只缓存 `GET` 请求。
- 只保存成功的 `2xx` JSON/text 响应。
- 开启回放后返回已缓存响应。
- 缓存未命中时请求真实服务。
- 通过插件 UI 管理规则、缓存条目和开关状态。

## 插件形态

包名：`whistle.api-cache`。

说明：最初考虑使用 `whistle.cache`，但 Whistle 内置协议已包含 `cache`。Whistle 会排除短名与内置协议冲突的插件，因此实际插件包名必须避开 `cache`，这里采用 `whistle.api-cache`。

推荐 hooks：

- `uiServer`：提供插件 UI 和 JSON API。
- `resStatsServer`：观察已完成的匹配响应，并记录缓存条目。
- `server`：处理回放模式，命中时返回缓存，未命中时放行真实请求。

后续可扩展 hooks：

- `statsServer`：用于 POST/GraphQL 请求体参与缓存 key。
- `rulesServer`：如果未来要由 UI 动态管理 Whistle Rules，可用它生成动态规则。

## 激活模型

用户通过插件协议显式限定目标流量：

```txt
www.example.com/api whistle.api-cache://record
www.example.com/api whistle.api-cache://replay
www.example.com/api whistle.api-cache://record,replay
```

短协议 `api-cache://...` 可用，但文档和 UI 文案默认使用长协议 `whistle.api-cache://...`，避免和 Whistle 内置 `cache://...` 响应头规则混淆。

## 数据流

录制流程：

1. 请求匹配 `whistle.api-cache://record` 或 `whistle.api-cache://record,replay`。
2. 请求正常访问真实上游服务。
3. `resStatsServer` 读取完整 session。
4. 插件按当前 Profile 和规则策略判断是否可缓存。
5. 如果可缓存，写入索引元数据，并把响应 body 写入对象文件。

回放流程：

1. 请求匹配 `whistle.api-cache://replay` 或 `whistle.api-cache://record,replay`。
2. `server` 计算同一套缓存 key。
3. 如果存在启用且未过期的条目，插件返回缓存的状态码、响应头和 body。
4. 如果未命中，插件调用 `passThrough()`，让请求继续访问真实服务。

## 缓存 Key

MVP key：

```txt
method + normalized URL
```

URL 归一化规则：

- 保留协议、host、path 和 query。
- 忽略 fragment，因为 HTTP 请求不会发送 fragment。
- 支持按 Profile/规则配置忽略 query 参数名。
- 移除被忽略的 query 后，对剩余 query 排序。

POST/body 参与 key 不在 MVP 范围内。

## 存储

使用持久化文件存储，保证 Whistle 或插件重启后缓存仍然存在。

逻辑结构：

```txt
data/
  config.json
  cache-index.json
  objects/
    <bodyHash>.body
```

索引条目包含：

- id
- profile
- key
- method
- url
- normalizedUrl
- statusCode
- response headers
- content type
- body hash
- body size
- createdAt
- expiresAt
- lastHitAt
- hitCount
- enabled

实现时避免把大响应 body 直接写进索引文件。

## 缓存策略

MVP 默认值：

- 方法：`GET`。
- 状态码：`200-299`。
- 响应类型：JSON 和 text。
- 最大 body：1 MB。
- TTL：30 分钟。
- 未命中行为：请求真实服务。

安全默认值：

- 不缓存带 `set-cookie` 的响应。
- 不缓存请求头包含 `authorization` 或 `cookie` 的请求，除非后续显式开启不安全选项。
- 回放时过滤逐跳响应头。
- 回放时重新计算 `content-length`。

## UI

插件从 Plugins 面板以 Tab 方式打开。

MVP 页面区域：

- 概览：当前 Profile、录制/回放状态、缓存数量、存储大小、最近事件。
- 规则：用户维护的匹配策略，以及生成的 `whistle.api-cache://...` 规则片段。
- 缓存：可搜索的缓存条目列表，支持预览、启用/禁用、删除、清理。
- 设置：默认 TTL、忽略 query 参数名、最大 body、Profile 管理。

主要控件：

- 开启录制。
- 开启回放。
- 全部停止。
- 清理过期缓存。
- 复制规则片段。

空状态：

- 无规则：引导用户新增 URL 匹配，或复制规则片段到 Whistle Rules。
- 无缓存：说明需要在开启录制时让目标流量经过 Whistle。

错误状态：

- HTTPS 未解密或只有 Tunnel 流量。
- 存储写入失败。
- body 过大。
- 因 method、status、content-type 或敏感 header 导致不可缓存。

## Network 联动

Network 联动价值很高，但 MVP 可以先不做深度 bridge 能力。

计划中的后续能力：

- Network 右键菜单：把选中请求加入录制。
- Network 自定义列：显示 `HIT`、`MISS`、`STORE`、`BYPASS`。
- Inspector Tab：展示匹配规则、key、缓存条目和回放状态。

第一版仍可添加响应头 `x-whistle-cache`，方便调试和 Network 观察。

## 测试

单元测试覆盖：

- URL 归一化和忽略 query 参数。
- 缓存 key 计算。
- 可缓存性判断。
- 回放响应头清理。
- 文件存储读写和命中元数据更新。

集成/人工验证覆盖：

- `lack watch` 能加载插件。
- Plugins 面板能看到 `api-cache`。
- `whistle.api-cache://record` 能录制匹配的 GET JSON 响应。
- `whistle.api-cache://replay` 能返回缓存数据，并带 `x-whistle-cache: HIT` 标记。
- 缓存未命中时请求真实上游。

## 暂缓问题

这些问题不进入 MVP：

- 插件是否自动修改 Whistle UI Rules。
- 是否支持 POST/GraphQL body hash。
- 是否支持缓存包导入/导出，便于团队共享。
- 是否提供不安全的认证接口缓存模式。
