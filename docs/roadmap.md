# whistle.api-cache 后续功能整理

本文记录基于当前 UI 和功能闭环的后续优化方向。当前插件已经具备录制、回放、自动模式、高亮、最近诊断、缓存列表和基础策略配置能力；下一阶段重点应放在降低误判、提升回放可信度和增强缓存管理效率。

## 当前核心策略

- `record`：只录制真实响应，不回放缓存。
- `replay`：优先回放缓存；未命中时放行真实请求。
- `auto`：先尝试回放；未命中时放行真实请求，并在响应完成后录制。
- 诊断事件继续保留 `STORE`、`BYPASS`、`HIT`、`MISS`、`ERROR`、`CONFIG` 类型，不新增 `AUTO` 类型。

## 已落地

### 自动模式诊断链路

已在诊断事件的 reason 中展示关键链路：

- `AUTO MISS -> STORE`
- `AUTO HIT -> SKIP STORE`
- `REPLAY MISS -> PASS THROUGH`

当前实现仍保留 `STORE`、`BYPASS`、`HIT`、`MISS`、`ERROR`、`CONFIG` 事件类型，不新增 `AUTO` 类型。

### 缓存条目详情

缓存列表已支持展开详情，展示：

- cache key
- normalized URL
- request body hash
- body hash
- response headers
- 创建时间、过期时间、最近命中时间

### 诊断筛选

最近诊断已支持按事件类型筛选：

- 全部
- `HIT`
- `MISS`
- `STORE`
- `BYPASS`
- `ERROR`
- `CONFIG`

### 最近命中时间

缓存列表已增加“最近命中”列，用于判断缓存是否仍在被使用。

### 命中测试工具

UI 已提供“测试匹配”能力：

- 可输入请求 URL、method 和可选 request body。
- 命中时显示对应缓存条目、状态码、过期时间和 request body hash。
- 未命中时返回结构化原因，包括无缓存、method 不一致、URL 不一致、过期、禁用、body hash 不一致、多候选冲突。
- 测试匹配只做 dry-run，不读取响应 body，也不会增加缓存命中次数。

该能力适合排查 POST、多签名 query、动态参数等场景。

### POST 多候选提示和 miss 原因增强

回放 MISS 诊断已复用命中测试的 dry-run 原因。当 request body 不可得且同 URL 存在多条候选时，诊断会明确显示：

```txt
REPLAY MISS -> PASS THROUGH: ambiguous POST candidates: 3
```

避免用户误以为缓存不存在。

同时保留自动模式链路前缀，例如：

```txt
AUTO MISS -> STORE: request body hash mismatch
```

### 批量删除

缓存列表已支持按范围批量清理：

- 同 host
- 同 path
- 已过期
- 从未命中过
- 用户选中项

其中“已过期”沿用缓存健康区的清理入口；“同 host”“同 path”和“用户选中项”在缓存列表中操作。

### 启用和禁用缓存条目

每条缓存已支持启用/禁用，不必删除即可临时排除某条缓存。禁用后的条目仍保留在列表和详情中，但不会参与回放命中。适合调试多个 POST 响应候选。

### TTL 操作

已支持对单条或用户选中项批量执行：

- 延长 30 分钟
- 固定不过期
- 恢复默认 TTL
- 立即设为过期

TTL 操作会直接更新缓存条目的 `expiresAt`，并立即影响后续回放命中判断。

### 当前规则模式提示和自动高亮说明

快速规则区域已显示“当前复制规则模式”，切换录制、回放、自动时会同步更新，避免用户把 profile 级别的“录制开启/回放开启”误解为当前规则模式。

同一区域已补充说明：插件会自动为 `record`、`replay`、`auto` 注入不同颜色，无需手写 `style`。

### 响应头策略展示

当前策略区域已展示回放时会移除和注入的响应头。默认移除 `content-length`、`content-encoding`、`transfer-encoding`、`set-cookie` 以及 hop-by-hop headers，并重新注入 `content-length` 和 `x-whistle-cache`。

### 端到端回放验证

已增加 `npm run e2e:auto-replay` 本地验证脚本。脚本启动进程内 fake server，并通过 `rulesServer`、`resStatsServer` 模拟 Whistle 插件在 `auto` 模式下的核心链路：

1. 第一次请求没有缓存，规则侧产生 `AUTO MISS -> STORE`，随后 fake server 返回真实响应并被录制。
2. 第二次同请求由缓存生成 `statusCode`、`resHeaders`、`resBody` 回放规则。
3. fake server 命中次数保持为 1，证明第二次没有再访问真实服务。

该脚本也纳入 `npm test`，用于持续验证本地回放闭环。

另补充 `npm run e2e:whistle-local` 本机真实 Whistle 联调脚本。该脚本会把测试规则写入独立 Rules 列表 `plugin_api_cache_e2e`，避免污染用户已有规则列表；使用 `WHISTLE_E2E_RUN=1 npm run e2e:whistle-local` 时会临时选中该列表，启动本地 fake API，并通过 `127.0.0.1:8899` 代理验证：

1. `GET` 自动模式第一次访问真实 fake API，第二次命中缓存回放。
2. `POST` 同 URL 不同 request body 在真实 rules 阶段 body 不可得时不会误回放旧缓存，并会分别录制。

脚本运行前会清理旧的 `__whistle_api_cache_e2e` 缓存和最近诊断事件，避免历史 run 干扰面板判断；脚本结束会关闭本地 fake API，并恢复运行前选中的 Rules 列表；`plugin_api_cache_e2e` 列表会保留，方便下次复用。

### 诊断事件 requestId

诊断事件已增加 `requestId` 字段，用于关联同一次请求中的 `MISS -> STORE`、`HIT -> SKIP STORE`、`ERROR` 等事件。插件会优先读取 Whistle 请求对象中的 `requestId`、`id` 或 `reqId`；缺失时生成本地递增标识。最近诊断列表会显示该标识，便于并发同接口请求排查。

### 命中策略可视化

缓存详情已展示 key 组成，包含：

- method
- normalized URL
- request body hash 是否参与匹配
- 当前忽略的 query 参数

该信息和缓存条目的 `Cache Key`、`Normalized URL`、`Request Body Hash` 一起展示，方便判断 POST、多签名 query 和动态参数场景的命中依据。

### 非 JSON 和二进制保护

当前插件继续只缓存 JSON 和 text 响应。当前策略区域已明确展示：

- 会缓存的 content type 前缀，例如 `application/json`、`text/`。
- 会跳过的二进制或非文本类型，例如 `application/octet-stream`、`image/*`、`audio/*`、`video/*`、`application/pdf`。

这能避免用户误以为二进制响应会被安全录制和回放。

### 导入和导出缓存

已支持导出当前缓存数据和响应 body，并导入到另一台机器或另一个环境。导出文件为 JSON bundle，包含缓存条目元数据和每条响应 body 的 base64 内容；导入后会恢复 cache key、响应头、过期时间、命中状态等信息，适合移动端调试协作。

## 建议实施顺序

当前 roadmap 中第一轮功能点已全部落地。后续可继续扩展：

1. 真实 Whistle 代理环境下的端到端联调脚本。
2. 二进制 body 存储和回放格式设计。
3. 导入冲突处理策略，例如覆盖、跳过或另存 profile。
