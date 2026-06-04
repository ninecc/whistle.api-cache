# whistle.api-cache 项目知识库

本文整理当前项目已经实现的功能点、核心实现方式和维护入口，后续排查问题或扩展功能时优先参考本文。

## 项目定位

`whistle.api-cache` 是一个 Whistle 插件，用于录制接口响应，并在后续调试请求中从本地缓存回放响应。

当前功能闭环：

- 通过 Whistle 规则显式选择录制、回放或自动模式。
- 录制符合策略的 `GET`、`POST` 接口响应。
- 回放命中缓存时返回本地响应，未命中时放行真实请求。
- 提供插件 UI 管理缓存、诊断事件、忽略 query 参数、导入导出和 TTL。
- 在 Whistle Network 列中通过 `x-whistle-cache` 标记回放命中。

包名使用 `whistle.api-cache`，避免和 Whistle 内置 `cache` 协议冲突。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `src/index.ts` | 导出 Whistle 插件 hook：`server`、`resStatsServer`、`rulesServer`、`uiServer`。 |
| `src/server.ts` | 请求阶段直接回放缓存，命中时写响应，未命中时 `passThrough()`。 |
| `src/rulesServer.ts` | 动态生成 Whistle 规则。回放命中时生成 `statusCode`、`resHeaders`、`resBody` 规则。 |
| `src/resStatsServer.ts` | 响应完成后读取 session，执行录制逻辑。 |
| `src/ruleMode.ts` | 解析 `record`、`replay`、`auto` 规则模式。 |
| `src/replayRules.ts` | 生成动态规则 payload，并注入 Network 高亮样式。 |
| `src/shared/state.ts` | 维护默认 profile、缓存引擎单例、最近诊断事件和数据目录。 |
| `src/cache/key.ts` | URL 归一化、cache key 生成、请求 body hash。 |
| `src/cache/policy.ts` | 判断响应是否可缓存，清理回放响应头。 |
| `src/cache/store.ts` | 文件存储实现，索引和响应 body 分离。 |
| `src/cache/engine.ts` | 缓存录制、回放、匹配诊断、批量操作、导入导出。 |
| `src/uiServer/index.ts` | 插件 UI 静态资源和 CGI API。 |
| `public/` | 插件前端页面、样式和交互脚本。 |
| `test/` | Node test 测试用例，覆盖核心模块和 UI API。 |
| `src/e2e/autoReplay.ts` | 进程内自动模式端到端验证脚本。 |

## Whistle Hook 分工

### `server`

`src/server.ts` 监听请求阶段：

1. 读取 `originalReq.ruleValue` 判断是否需要回放。
2. 尝试读取请求 body，用于 POST cache key。
3. 调用 `CacheEngine.replay()`。
4. 命中时写入状态码、响应头和 body。
5. 未命中时调用 `req.passThrough()` 继续请求真实上游。
6. MISS/HIT 诊断原因通过 `src/shared/replayReasons.ts` 统一生成，避免 server 与 rulesServer 在提示文案上的分歧。

`test/server.test.ts` 覆盖了 `originalReq` 为空壳对象且携带非字符串 `method`（如 `0`）时的边界：会回退到当前 `req` 上下文（`method`、`url`）进行回放，避免误判。
`test/server.test.ts` 也覆盖了 `fullUrl` 无法解析到合法 URL 时的 `passThrough` 降级路径，确保空地址不误触发缓存回放。

如果环境中没有 `passThrough()`，会返回 `502` 和 `x-whistle-cache: MISS`，这是测试或非标准 Whistle 环境下的兜底。

### `rulesServer`

`src/rulesServer.ts` 用动态规则完成回放：

1. 非回放模式只返回样式规则，让 Network 中对应请求高亮。
2. 回放模式先调用 `CacheEngine.replay()`。
3. 命中时通过 `createPluginRulesPayload()` 生成动态规则：

```txt
* statusCode://200 resHeaders://{headersKey} resBody://{bodyKey}
```

4. 未命中时返回样式规则，并记录结构化 MISS 原因。
5. MISS/HIT 原因字符串与 `server.ts` 采用同一共享规则，便于 e2e 与日志一致性验证。

`test/rulesServer.test.ts` 覆盖了 `originalReq` 为空壳对象但携带 `ruleValue` 的场景：回放时仍应使用当前 `req` 的 `method/url`。

这个 hook 适合 Whistle 原生规则链路。维护时如果发现回放响应没有走 `server.ts`，也要检查 `rulesServer.ts` 是否已经生成了回放规则。

### `resStatsServer`

`src/resStatsServer.ts` 在响应完成后录制：

1. 读取 `req.getSession()` 拿到原始请求、响应头和响应 body。
2. 判断规则是否包含录制模式。
3. 如果当前请求刚刚被回放命中，则跳过录制，避免把回放响应再次写入缓存。
4. 调用 `CacheEngine.record()`。
5. 根据结果记录 `STORE` 或 `BYPASS` 诊断事件。

`test/resStatsServer.test.ts` 覆盖了 `parseRequestContext` 解析不到 URL 时的兜底分支：应记录 `BYPASS`（原因 `missing url or response body`）而非入库。
`test/resStatsServer.test.ts` 还覆盖了 `originalReq.body` 缺失时从 `session.req.body` 回退记录请求体的场景，确保 POST 录制可被同样 body 重放命中。

`resStatsServer` 使用 `src/shared/requestBody.ts` 的 `toBuffer` 统一请求/响应 body 转 Buffer，和服务端回放阶段共享同一边界行为。
`resStatsServer` 及 `cache/engine`、`cache/policy` 的 headers 处理统一使用 `src/shared/headers.ts`，包括：统一 header key 为小写、忽略空值、按大小写不敏感读取 header 值。
`server.ts`、`rulesServer.ts`、`resStatsServer.ts`、`uiServer/index.ts` 的 `method/url` 取值统一到 `src/shared/requestContext.ts`，其中 `method` 也被统一为大写，规避重复分支下的边界差异与大小写不一致问题。
`parseRequestContext` 的回退链条与大小写行为均已有测试覆盖，位于 `test/shared/requestContext.test.ts`。
文档说明中补充了回退优先级细节，并新增边界测试覆盖了 `req.url` 回退场景，确保 `parseRequestContext` 在缺少 `fullUrl` 时仍可从 `url` 提取上下文。
`parseRequestContext` 同样会在 `originalReq` 仅携带 `fullUrl`（但不带 `method`）时优先采用其绝对 URL，避免将 `req.url` 的相对路径误当作请求 URL 继续下游匹配。
当 `originalReq` 仅是占位对象且无 `fullUrl/url/method` 时，会回退到当前 `req` 的上下文，避免空壳 `originalReq` 覆盖有效取值。
当 `originalReq.fullUrl` 或 `fallback.fullUrl` 为 `''` 时，会继续沿链条向 `url` 回退，减少空值导致的错误 URL 进入回放路径。
当 `fallback.fullUrl` 与 `fallback.url` 均为空字符串时，回退会继续落到 `fallback.req.url`。
`resStatsServer` 在构建回放上下文时，会把 `session` 与 `session.req` 一并并入 fallback，确保在 `originalReq` 不完整时可以从会话读取 `method` 与 `url`。
`parseRequestContext` 在方法回退时已改为显式跳过 `undefined/null/空字符串`，避免 `0` 等非字符串有效值被错误当作缺省回退。
另外，`parseRequestContext` 的 `url` 回退顺序修复为 `requestLike.fullUrl > requestLike.url > root.fullUrl > root.url > fallback.fullUrl > fallback.url > fallback.req.url`，避免 `fallback.fullUrl` 被错误落在 `fallback.url` 之后。
`hasRequestContext` 已同步使用同一“空值定义”（`undefined/null/空字符串`视为无效），因此 `originalReq` 中的合法 `0` 等值也会被正确识别为有效上下文，不会被误判为占位对象而被丢弃。
`normalizeMethod` 现在对 `null/undefined/空字符串` 使用兜底值，其他可转换类型（包括数字 `0`）会保留并转为字符串，防止把有效值误判为默认方法。
新增 `normalizeMethod` 共享方法后，`uiServer/requestParsers.ts` 的 `parseCacheMatchBody` 也复用同一标准化逻辑（包括非字符串的 `toString` + `toUpperCase`），并同步补充对应测试。
`src/cache/engine.ts` 中 `record/replay/match` 输入方法也改为走 `normalizeMethod`，确保记录与回放路径在方法大小写规则上完全一致，避免因输入大小写导致的分支漂移。
`cache/key.ts` 与 `cache/policy.ts`、`shared/state.ts` 也加入统一的 `normalizeMethod`，
使 Cache key、可缓存性判断与回放命中标记在任意场景下都采用统一的 `method` 规范化策略。
`shared/state.ts` 的 `markRecentReplayHit/consumeRecentReplayHit` 同样走同一规范化策略，确保大小写或类型异常输入不会导致同一请求的命中标记错过。

## 规则模式

规则示例：

```txt
www.example.com/api whistle.api-cache://record
www.example.com/api whistle.api-cache://replay
www.example.com/api whistle.api-cache://auto
```

`src/ruleMode.ts` 的解析规则：

- 空规则值默认视为 `record`。
- `record` 只录制真实响应。
- `replay` 优先回放缓存，未命中放行真实请求。
- `auto` 等价于 `record,replay`：先尝试回放，未命中后请求真实服务并录制。
- 逗号分隔的 `record,replay` 也会启用自动闭环。
- 解析会先标准化逗号分隔 token，跳过空白/空 token；例如 `record, replay, , auto` 仍会得到 `record + replay`。
- 未知模式会被忽略。

`src/replayRules.ts` 还会根据模式生成不同的 `style://` 规则，用于 Network 高亮。

## 缓存 Profile

当前只实现了内存中的默认 profile，定义在 `src/shared/state.ts`：

```ts
{
  id: 'default',
  recordEnabled: true,
  replayEnabled: true,
  ttlSeconds: 1800,
  ignoredQueryNames: ['_t', 't', 'timestamp', 'ticket', 'wsgsig'],
  maxBodySize: 1024 * 1024,
  cacheableContentTypes: ['application/json', 'text/'],
}
```

注意事项：

- `ignoredQueryNames` 可通过 UI 修改，但当前没有单独持久化配置文件；进程重启后会回到默认值。
- `recordEnabled` 和 `replayEnabled` 是 profile 级开关，目前 UI 主要展示状态，没有提供开关按钮。
- 真实生效范围仍由 Whistle Rules 决定，插件不会自动改写主规则。

## 录制数据流

录制路径：

```txt
Whistle 匹配规则
  -> 真实上游响应完成
  -> resStatsServer 读取 session
  -> CacheEngine.record()
  -> policy 判断是否可缓存
  -> key 计算
  -> FileCacheStore 写入索引和 body
  -> 记录 STORE 或 BYPASS 事件
```

可缓存条件由 `src/cache/policy.ts` 控制：

- 方法必须是 `GET` 或 `POST`。
- 状态码必须是 `2xx`。
- body 大小不能超过 `profile.maxBodySize`，默认 1 MB。
- 请求头不能包含 `authorization` 或 `cookie`。
- 响应头不能包含 `set-cookie`。
- `content-type` 必须以 `application/json` 或 `text/` 开头。

录制成功后会写入 `CacheEntry` 元数据，并把响应 body 写入对象文件。

## 回放数据流

回放路径：

```txt
Whistle 匹配规则
  -> server 或 rulesServer 判断 replay 模式
  -> 读取请求 body
  -> CacheEngine.replay()
  -> 命中则读取 body
  -> sanitizeReplayHeaders()
  -> 返回缓存响应
  -> markHit() 更新命中次数和最近命中时间
```

回放头部清理由 `sanitizeReplayHeaders()` 完成：

- 移除 hop-by-hop headers。
- 移除 `content-length`、`content-encoding`、`set-cookie`。
- 重新注入 `content-length`。
- 注入 `x-whistle-cache: HIT`。

命中后会记录 `HIT` 事件，未命中会记录 `MISS` 事件。自动模式下，命中原因会显示为 `AUTO HIT -> SKIP STORE`，未命中原因会显示为 `AUTO MISS -> STORE`。

## Cache Key 规则

`src/cache/key.ts` 负责 cache key：

```txt
METHOD normalizedUrl [body:<requestBodySha256>]
```

URL 归一化规则：

- 使用 `new URL()` 解析原始 URL。
- 清空 fragment。
- 删除 `profile.ignoredQueryNames` 中配置的 query 参数。
- 对剩余 query 按参数名和值排序。
- 输出 `url.toString()`。

POST 或其他带请求 body 的请求会把 body 的 sha256 加入 key。当前策略只允许 `GET`、`POST` 被录制，所以实际 body hash 主要服务于 POST。

### 请求体读取统一策略

`server.ts` 与 `rulesServer.ts` 在回放匹配时都需要读取 request body 来计算匹配 key。为避免重复实现差异，当前已抽离到 `src/shared/requestBody.ts`，并在两个服务内共享。

该工具采用同一优先级：

- 先读取 `originalReq.body` / `req.body` 的直接 body。
- 若缺失则调用 `req.getReqSession()` 读取 session 上的 body。
- 支持 `Buffer`、`string`、`Uint8Array`，其余值按 `String(value)` 转为缓冲区。

对应测试已补充到 `test/shared/requestBody.test.ts`。

维护注意：

- 如果某个接口一直 MISS，先检查动态 query 是否在忽略列表中。
- 如果 POST 接口 MISS，检查请求 body 是否可被 Whistle hook 读取到。
- 如果没有 request body 且同 URL 有多条 POST 候选，`match()` 会返回 `AMBIGUOUS_POST_CANDIDATES`。

## 存储结构

数据目录由 `getDataDir()` 计算：

- 优先读取 Whistle 传入的 `options.storage`、`storageDir`、`dataDir`、`baseDir`。
- 找到候选路径后在其下创建 `whistle.cache` 子目录。
- 没有候选路径时使用当前工作目录下的 `.whistle-cache-data`。

实际文件：

```txt
<dataDir>/
  cache-index.json
  objects/
    <bodyHash>.body
```

`FileCacheStore` 的关键实现：

- `cache-index.json` 只保存元数据，不直接保存大 body。
- body 文件名使用响应 body 的 sha256。
- 写索引时先写临时文件，再 `rename()`，减少半写入风险。
- `writeQueue` 串行化写操作，避免并发写互相覆盖。
- `putEntry()` 会按 `id` 和 `key` 去重，同 key 新条目会替换旧条目。

删除条目时会同步尝试删除对应 body 文件。当前没有引用计数，如果两个条目共享同一个 body hash，删除其中一条可能删除共享 body 文件；因为 `putEntry()` 通常按 key 替换，实际风险较小，但扩展导入冲突策略时需要注意。

## UI 和 CGI API

`src/uiServer/index.ts` 提供静态页面和 JSON API。前端入口是 `public/index.html` 和 `public/app.js`。

### 请求参数解析统一

`uiServer` 曾在 delete/ttl 接口中内联了参数解析逻辑。为降低重复和行为偏差，现将解析统一到 `src/uiServer/requestParsers.ts`。

统一行为包含：

- `scope` 非法时默认回退到 `{ scope: 'ids', ids: [] }`。
- `ids` 全部转为字符串。
- `same-host/same-path` 解析并返回 `entryId` 字符串。
- `/cgi-bin/cache/delete` 也统一使用 `parseDeleteBody`，只返回 `{ id: string }`，并将缺省 id 处理为 `''`，保证前后端行为一致。
- `/cgi-bin/cache/import` 的请求体解析统一到 `parseImportBody`。该解析会在非法 `bundle` 时回退到空 bundle（`version: 1`、`entries: []`），并过滤掉 `entries` 里缺少 `bodyBase64` 的非法项，避免 `importBundle` 解包异常。
- `/cgi-bin/events` 的返回结果过滤移到 `filterEventsAfter`，对 `after` 解析后做统一筛选，`after` 非数字时返回完整列表（复用行为定义，便于测试）。
- TTL 操作仅接受 `extend-30m`、`never-expire`、`default-ttl`、`expire-now`，非法值回退为 `default-ttl`。

对应验证用例见 `test/uiServer/requestParsers.test.ts`。

### UI CGI 统一 JSON 解析

`uiServer` 的 POST 接口统一使用 `src/uiServer/bodyParsers.ts` 的 `readJsonBody` 读取并解析请求体。

- 空 body：返回 `{}`。
- 非法 JSON：抛错由上层统一错误处理（返回 500 错误响应）。
- 常规对象：按 JSON 解析后供下游逻辑使用。

对应验证用例见 `test/uiServer/bodyParsers.test.ts`。

### Cache match 入参统一

`/cgi-bin/cache/match` 的参数解析也已集中到 `src/uiServer/requestParsers.ts` 的 `parseCacheMatchBody`。

- 默认请求方法为 `GET`。
- `method` 会统一大写。
- `url` 统一转字符串。
- `requestBody` 只在字符串且非空时转换为 `Buffer`。

这样可以保证 `match` 接口在不同入口下的行为一致。

### 事件增量参数解析统一

`/cgi-bin/events` 的 `after` 参数解析已抽到 `src/uiServer/requestParsers.ts` 的 `parseEventsAfter`。

- `null` 时返回 `0`。
- 非法值保留为 `NaN`，上层保持“返回全部事件”语义。

对应验证用例见 `test/uiServer/requestParsers.test.ts`。

### ignored query names 解析统一

`/cgi-bin/profile/ignored-query-names` 的参数解析也已抽到 `src/uiServer/requestParsers.ts`。

- 仅当 `names` 为数组时逐项转字符串。
- 非数组输入返回空数组。

对应验证用例见 `test/uiServer/requestParsers.test.ts`。

### enabled 参数解析统一

`/cgi-bin/cache/enabled` 的参数解析已抽到 `src/uiServer/requestParsers.ts` 的 `parseEnabledBody`。

- `id` 按字符串返回，缺失时返回空字符串。
- `enabled` 使用 `Boolean` 转换为布尔值。

对应验证用例见 `test/uiServer/requestParsers.test.ts`。

主要 API：

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| `GET` | `/cgi-bin/state` | 获取 profile、数据目录、缓存列表、诊断事件和策略说明。 |
| `GET` | `/cgi-bin/events` | 按事件 id 增量获取最近诊断。 |
| `POST` | `/cgi-bin/events/clear` | 清空最近诊断事件。 |
| `GET` | `/cgi-bin/cache` | 获取缓存条目列表。 |
| `GET` | `/cgi-bin/cache/export` | 导出缓存 bundle。 |
| `POST` | `/cgi-bin/cache/import` | 导入缓存 bundle。 |
| `POST` | `/cgi-bin/cache/match` | dry-run 测试请求能否命中缓存。 |
| `POST` | `/cgi-bin/cache/delete` | 删除单条缓存。 |
| `POST` | `/cgi-bin/cache/delete-batch` | 批量删除缓存。 |
| `POST` | `/cgi-bin/cache/enabled` | 启用或禁用缓存条目。 |
| `POST` | `/cgi-bin/cache/ttl` | 批量更新 TTL。 |
| `POST` | `/cgi-bin/cache/clear-expired` | 清理过期缓存。 |
| `POST` | `/cgi-bin/cache/clear-all` | 清理全部缓存。 |
| `POST` | `/cgi-bin/open-data-dir` | 调用系统命令打开数据目录。 |
| `POST` | `/cgi-bin/profile/ignored-query-names` | 更新内存中的忽略 query 参数。 |

前端实现重点：

- 每 1 秒增量同步诊断事件。
- 每 30 秒静默刷新一次状态作为兜底。
- 缓存列表支持搜索、状态过滤、详情展开、启用禁用、单条和批量 TTL、同 host/path 删除。
- 命中测试工具调用 `/cgi-bin/cache/match`，不会读取响应 body，也不会增加命中次数。
- 导出文件包含条目元数据和 base64 body，适合跨环境共享。

## 诊断事件

事件定义在 `src/shared/state.ts`：

```ts
type CacheEventType = 'STORE' | 'BYPASS' | 'HIT' | 'MISS' | 'ERROR' | 'CONFIG';
```

最近只保留 20 条事件。事件包含：

- `id`
- `requestId`
- `type`
- `timestamp`
- `method`
- `url`
- `reason`

`requestId` 优先从 Whistle 请求对象的 `requestId`、`id`、`reqId` 读取，缺失时生成 `local-<n>`。

常见 reason：

- `AUTO MISS -> STORE`
- `AUTO HIT -> SKIP STORE`
- `REPLAY MISS -> PASS THROUGH`
- `REPLAY HIT`
- `method not supported`
- `status not cacheable`
- `body too large`
- `sensitive request headers`
- `set-cookie response`
- `content type not cacheable`
- `request body hash mismatch`
- `ambiguous POST candidates: <n>`

## 匹配诊断

`CacheEngine.match()` 是排查 MISS 的核心接口。它会返回：

- `hit`
- `reason`
- `entry`
- `candidates`
- `reasons`

判断顺序：

1. 是否存在当前 profile 的缓存。
2. method 是否匹配。
3. normalized URL 是否匹配。
4. 条目是否启用。
5. 条目是否过期。
6. request body hash 是否匹配。
7. POST 无 body 且多候选时是否存在歧义。

UI 的“测试匹配”功能直接依赖这个接口。扩展命中规则时，应同步更新 `match()`，否则 UI 诊断会和真实回放行为脱节。

## 导入导出

导出结构定义在 `src/cache/engine.ts`：

```ts
interface CacheExportBundle {
  version: 1;
  exportedAt: string;
  entries: CacheExportEntry[];
}
```

每个导出条目在 `CacheEntry` 基础上增加 `bodyBase64`。

导入逻辑：

- 只接受 `version === 1` 且 `entries` 是数组的 bundle。
- 每条记录必须包含 `bodyBase64`。
- 导入时会把 `profileId` 改为当前 profile id。
- 写入仍走 `FileCacheStore.putEntry()`，同 key 会替换旧条目。

## 批量操作和 TTL

批量删除范围：

- `ids`：指定 id 列表。
- `same-host`：和参考条目同 host。
- `same-path`：和参考条目同 host 且同 pathname。
- `expired`：已过期条目。
- `never-hit`：`hitCount` 为 0 的条目。

TTL 操作：

- `extend-30m`：从当前时间延长 30 分钟。
- `never-expire`：设置为 `9999-12-31T23:59:59.999Z`。
- `default-ttl`：从当前时间使用 profile 默认 TTL。
- `expire-now`：设置为当前时间，后续立即视为过期。

## 测试和验证

常用命令：

```bash
rtk npm run build
rtk npm test
rtk npm run e2e:auto-replay
```

测试覆盖重点：

- `test/cache/key.test.ts`：URL 归一化、忽略 query、body hash key。
- `test/cache/policy.test.ts`：可缓存策略和回放响应头清理。
- `test/cache/store.test.ts`：文件存储、删除、过期清理、命中计数。
- `test/cache/engine.test.ts`：录制、回放、匹配诊断、导入导出、批量操作。
- `test/ruleMode.test.ts`：规则模式解析。
- `test/replayRules.test.ts`：动态规则 payload。
- `test/rulesServer.test.ts`：规则回放链路和 MISS 诊断。
- `test/resStatsServer.test.ts`：录制链路。
- `test/uiServer/`：UI API 行为。
- `test/e2e/autoReplay.test.ts`：自动模式完整闭环。

`npm test` 会先执行 TypeScript 构建，再运行编译后的 Node test。

## 常见维护场景

### 请求没有被录制

优先检查：

1. Whistle 规则是否包含 `record` 或 `auto`。
2. HTTPS 是否已解密，session 中是否有响应 body。
3. 请求是否带 `authorization` 或 `cookie`。
4. 响应是否带 `set-cookie`。
5. 状态码是否为 `2xx`。
6. `content-type` 是否是 JSON 或 text。
7. body 是否超过 1 MB。
8. UI 最近诊断中的 `BYPASS` reason。

### 请求没有命中缓存

优先检查：

1. Whistle 规则是否包含 `replay` 或 `auto`。
2. 条目是否启用。
3. 条目是否过期。
4. URL 归一化后是否一致。
5. 动态 query 是否加入忽略列表。
6. POST 请求 body 是否一致且可被读取。
7. 使用 UI “测试匹配”查看结构化 MISS 原因。

### 自动模式重复访问真实上游

优先检查：

1. 第一次请求是否成功 `STORE`。
2. 第二次请求是否产生 `MISS`，reason 是什么。
3. 是否因为 query、body hash、过期或禁用导致未命中。
4. `markRecentReplayHit()` 和 `consumeRecentReplayHit()` 只负责避免回放命中后再次录制，不会影响 MISS 后录制。

### 导入后无法回放

优先检查：

1. bundle `version` 是否为 `1`。
2. 条目是否包含 `bodyBase64`。
3. 导入后条目的 `profileId` 是否已改成当前 profile。
4. 条目是否过期或禁用。
5. 导入环境的忽略 query 参数是否和导出环境一致。

## 扩展注意事项

- 新增可缓存方法时，需要同步修改 `policy.ts`、`key.ts` 相关测试、UI 策略展示和匹配诊断。
- 修改 cache key 规则时，需要考虑旧缓存兼容。当前 `replay()` 已有 `findCompatibleEntry()` 兼容按 normalized URL 查找的旧条目。
- 修改回放响应头策略时，应同步更新 `getReplayHeaderPolicy()`，否则 UI 展示会不准确。
- 修改可缓存 content type 时，应同步更新 `getContentTypePolicy()` 和前端策略展示。
- 增加 profile 持久化时，需要区分内存状态、磁盘配置和 Whistle 传入 options 的数据目录。
- 扩展二进制响应时，需要重新设计动态规则中的 body 表达方式，当前 `resBody://{bodyKey}` 使用字符串，更适合 JSON 和文本。
- `open-data-dir` 会调用系统打开目录命令，测试中应通过 `getOpenDirectoryCommand()` 验证平台差异，避免真实打开 GUI。

## 当前已知边界

- 只有默认 profile，没有多 profile 管理。
- 忽略 query 参数配置当前只存在内存中。
- 插件不会自动改写 Whistle 主 Rules。
- 只缓存 JSON 和文本响应，不缓存图片、音视频、PDF 或通用二进制。
- 不缓存带敏感请求头或 `set-cookie` 的响应。
- 缓存索引没有 schema migration 机制。
- body 文件没有引用计数。
- 端到端脚本是进程内模拟 hook 链路，不等同于真实 Whistle 代理环境联调。
