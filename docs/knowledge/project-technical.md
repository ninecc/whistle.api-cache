# 当前项目技术知识

本文记录 `whistle.api-cache` 自身的技术知识。这里关注缓存业务、模块职责、数据结构、接口和测试覆盖。

## 维护边界

- 本文只记录当前代码真实行为、稳定设计约束和维护入口。
- Whistle 通用规则、抓包、证书、代理问题不写入本文，优先查 `skills/whistle`。
- Whistle 插件框架、hook API、`lack`、`whistleConfig` 的通用说明不写入本文，优先查 `skills/whistle-plugin`。
- 单次 bug 修复过程不要追加成流水账；只有沉淀为稳定规则、测试覆盖或扩展检查项后才写入本文。

## 模块职责

| 路径 | 职责 |
| --- | --- |
| `src/index.ts` | 导出 Whistle 插件 hook：`server`、`resStatsServer`、`rulesServer`、`uiServer`。 |
| `src/server.ts` | 请求阶段直接回放缓存，命中时写响应，未命中时 `passThrough()`。 |
| `src/rulesServer.ts` | 动态生成 Whistle 规则。回放命中时生成 `statusCode`、`resHeaders`、`resBody` 规则。 |
| `src/resStatsServer.ts` | 响应完成后读取 session，执行录制逻辑。 |
| `src/ruleMode.ts` | 解析 `record`、`replay`、`auto` 规则模式。 |
| `src/replayRules.ts` | 生成动态规则 payload，并注入 Network 高亮样式。 |
| `src/shared/state.ts` | 维护默认 profile、缓存引擎单例、最近诊断事件和数据目录。 |
| `src/shared/requestContext.ts` | 统一 method/url 取值、回退和大小写规范化。 |
| `src/shared/requestBody.ts` | 统一请求体读取、类型转换和 session fallback。 |
| `src/shared/headers.ts` | 统一 header key 大小写、空值过滤和读取。 |
| `src/shared/replayReasons.ts` | 统一 HIT/MISS/STORE/BYPASS 诊断 reason。 |
| `src/cache/key.ts` | URL 归一化、cache key 生成、请求 body hash。 |
| `src/cache/policy.ts` | 判断响应是否可缓存，清理回放响应头。 |
| `src/cache/store.ts` | 文件存储实现，索引和响应 body 分离。 |
| `src/cache/engine.ts` | 缓存录制、回放、匹配诊断、批量操作、导入导出。 |
| `src/uiServer/index.ts` | 插件 UI 静态资源和 CGI API。 |
| `src/uiServer/requestParsers.ts` | UI CGI 请求参数解析。 |
| `src/uiServer/bodyParsers.ts` | UI CGI JSON body 读取。 |
| `public/` | 插件前端页面、样式和交互脚本。 |
| `test/` | Node test 测试用例，覆盖核心模块和 UI API。 |
| `src/e2e/autoReplay.ts` | 进程内自动模式端到端验证脚本。 |

## 默认 Profile

当前只实现内存中的默认 profile，定义在 `src/shared/state.ts`：

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

注意：

- `ignoredQueryNames` 可通过 UI 修改，但当前没有单独持久化配置文件；进程重启后会回到默认值。
- `recordEnabled` 和 `replayEnabled` 是 profile 级开关，目前 UI 主要展示状态，没有提供开关按钮。
- 真实生效范围仍由 Whistle Rules 决定。

## 录制数据流

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

## 回放数据流

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

命中后记录 `HIT` 事件，未命中记录 `MISS` 事件。自动模式下，命中原因显示为 `AUTO HIT -> SKIP STORE`，未命中原因显示为 `AUTO MISS -> STORE`。

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

`requestBody === undefined` 与长度为 0 的 `Buffer` 不是同一个语义：

- `undefined` 表示“插件没有读取到请求体”，POST 回放会允许唯一候选兜底命中。
- `Buffer.from('')` 表示“明确读到了空 body”，cache key 仍会带空 body 的 sha256。
- `CacheEngine.replay()`、`findCompatibleEntry()` 与 `createCacheKey()` 都要保持这个区分。
- `CacheEngine.record()`、`CacheEngine.match()` 和兼容查询也必须使用同一判断：只有 `requestBody === undefined` 才代表无请求体。

## 请求体读取统一策略

`server.ts`、`rulesServer.ts` 与 `resStatsServer.ts` 都需要读取 request body 来计算匹配 key。当前统一由 `src/shared/requestBody.ts` 处理。

优先级：

- 先读取 `originalReq.body` / `req.body` 的直接 body。
- 若直接 body 缺失，则优先尝试 `req.getReqSession()`，否则再尝试 `req.getSession()` 读取 session 上的 body。
- 若请求对象仅提供 `getSession()`，则使用同样 fallback 规则读取 `session.req.body`。

边界语义：

- `null`、`undefined` 和空字符串 `''` 视为缺失，会继续回退到 session body。
- `originalReq.body = 0` 或 `false` 会优先于 session body 使用。
- `toBuffer` 支持 `Buffer`、`string`、`Uint8Array`，其余非空值按 `String(value)` 转为缓冲区。
- 如果直接 body 与 session body 都为空，则返回 `undefined`。

## 请求上下文统一策略

`server.ts`、`rulesServer.ts`、`resStatsServer.ts`、`uiServer/index.ts` 的 `method/url` 取值统一到 `src/shared/requestContext.ts`。

关键规则：

- `method` 统一大写。
- `null`、`undefined`、空字符串视为缺失。
- 非字符串但可转换的 method，例如数字 `0`，会保留并转成字符串再大写。
- `originalReq` 仅是占位对象时，应回退到当前 `req` 或 session 上下文。
- URL 回退顺序要避免空值覆盖有效值。

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
- 写索引时先写临时文件，再 `rename()`。
- `writeQueue` 串行化写操作，避免并发写互相覆盖。
- `putEntry()` 会按 `id` 和 `key` 去重，同 key 新条目会替换旧条目。

删除条目时会同步尝试删除对应 body 文件。当前没有引用计数，如果两个条目共享同一个 body hash，删除其中一条可能删除共享 body 文件；扩展导入冲突策略时需要注意。

## UI 和 CGI API

`src/uiServer/index.ts` 提供静态页面和 JSON API。前端入口是 `public/index.html` 和 `public/app.js`。

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

参数解析集中在 `src/uiServer/requestParsers.ts`：

- delete/ttl/import/events/profile/enabled/match 参数都应通过共享解析函数进入业务逻辑。
- `readJsonBody` 统一处理 POST JSON body：空 body 返回 `{}`，非法 JSON 抛错由上层统一错误处理。
- `/cgi-bin/cache/match` 只做 dry-run，不读取响应 body，也不会增加命中次数。

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

## 测试覆盖地图

- `test/cache/key.test.ts`：URL 归一化、忽略 query、body hash key。
- `test/cache/policy.test.ts`：可缓存策略和回放响应头清理。
- `test/cache/store.test.ts`：文件存储、删除、过期清理、命中计数。
- `test/cache/engine.test.ts`：录制、回放、匹配诊断、导入导出、批量操作。
- `test/ruleMode.test.ts`：规则模式解析。
- `test/replayRules.test.ts`：动态规则 payload。
- `test/rulesServer.test.ts`：规则回放链路和 MISS 诊断。
- `test/resStatsServer.test.ts`：录制链路。
- `test/server.test.ts`：请求阶段回放链路。
- `test/shared/requestContext.test.ts`：请求上下文回退和标准化。
- `test/shared/requestBody.test.ts`：请求体读取和转换语义。
- `test/shared/headers.test.ts`：header 标准化。
- `test/shared/replayReasons.test.ts`：诊断 reason 生成。
- `test/shared/state.test.ts`：共享状态、数据目录、命中标记。
- `test/uiServer/`：UI API 和参数解析。
- `test/e2e/autoReplay.test.ts`：自动模式完整闭环。

## 防劣化规则

- 修改某个模块职责时，同步更新“模块职责”和对应测试覆盖地图。
- 修改缓存命中语义时，同步更新 Cache Key、请求体读取、匹配诊断和维护手册中的扩展检查清单。
- 修改 UI CGI API 时，同步更新 API 表、参数解析说明和 `test/uiServer/` 覆盖说明。
- 修改 Profile 默认值或策略展示时，同步更新默认 Profile、可缓存条件、UI 展示和测试。
- 不在本文复制 skill reference 的 API 表；只记录本项目采用了哪些能力以及为什么这样取舍。
