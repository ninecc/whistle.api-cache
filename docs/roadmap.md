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

## 缓存管理增强

### 导入和导出缓存

支持导出当前缓存数据和响应 body，再导入到另一台机器或另一个环境。适合移动端调试协作。

## 回放可靠性增强

### 命中策略可视化

在缓存详情或列表中展示 key 组成：

- method
- normalized URL
- 是否包含 request body hash
- 当前忽略的 query 参数

### 响应头策略展示

在当前策略区域展示回放时会移除的响应头，例如：

- `content-length`
- `content-encoding`
- `transfer-encoding`
- `set-cookie`
- hop-by-hop headers

后续可考虑提供配置能力，但默认仍应保持保守。

### 非 JSON 和二进制保护

当前插件主要面向 JSON 和 text。后续如果支持二进制，需要重新设计 body 存储和动态规则输出方式。在此之前，UI 应明确显示哪些 content type 会被跳过。

## 工程质量

### 端到端回放验证

增加本地 fake server + Whistle proxy 的端到端测试脚本，验证：

1. 第一次 `auto` 请求访问真实 fake server 并 `STORE`。
2. 第二次 `auto` 请求由缓存 `HIT`。
3. fake server 第二次不再收到请求。

这是最能证明真实回放链路有效的测试。

### 诊断事件 requestId

当前诊断主要依赖 method 和 URL 串联事件。并发同接口请求下可能混淆。建议引入 requestId，用于关联：

- `MISS -> STORE`
- `HIT -> SKIP STORE`
- `ERROR`

## 建议实施顺序

1. 响应头策略展示。
2. 端到端回放验证脚本。
