# 插件运行时基础知识

本文记录本项目实际依赖的 Whistle 插件运行时知识。通用 Rules/Values、证书、系统代理、`w2` 命令和抓包排障以 `skills/whistle` 为准；通用插件 hook API 以 `skills/whistle-plugin` 为准。这里不复制完整 Whistle 手册，只记录影响 `whistle.api-cache` 维护的边界。

## 与 Skill 的边界

- 写普通代理、mock、映射、过滤、证书和抓包规则：回到 `skills/whistle`。
- 判断插件 hook、`whistleConfig`、`lack watch`、插件加载问题：回到 `skills/whistle-plugin`。
- 判断本项目在各 hook 中如何读取上下文、何时录制/回放、哪些边界已有测试：看本文和 `project-technical.md`。

## Whistle 插件 Hook 分工

本项目导出了四类 hook。下面只说明本项目如何使用它们，hook 的完整能力不要在本文扩写：

| Hook | 运行时位置 | 适合做什么 |
| --- | --- | --- |
| `server` | 请求阶段 | 直接处理或放行请求；适合在回放命中时立即写响应。 |
| `rulesServer` | 动态规则阶段 | 根据当前请求生成 Whistle 规则；适合返回 `statusCode`、`resHeaders`、`resBody` 等规则。 |
| `resStatsServer` | 响应完成后 | 读取完整 session；适合录制真实上游响应和诊断统计。 |
| `uiServer` | 插件 UI 和 CGI | 提供插件页面、静态资源和本地管理接口。 |

维护时要把 hook 视为不同运行阶段，而不是同一个请求对象的不同包装。某些字段在一个 hook 中存在，在另一个 hook 中可能缺失或只是占位。

## 请求上下文来源

Whistle hook 中常见可用来源：

- 当前 `req`：当前 hook 收到的请求对象。
- `req.originalReq`：Whistle 封装的原始请求信息，可能是完整对象，也可能是空壳占位对象。
- `req.getSession()` / `req.getReqSession()`：读取 session 里的请求和响应信息。
- `res.getReqSession()`：部分链路会把请求 session reader 挂在响应对象上。

运行时经验：

- `originalReq` 不能无条件信任。它可能携带 `ruleValue`，但缺少 `method`、`url` 或 `body`。
- 空字符串、`null`、`undefined` 都要视为缺失上下文，继续回退到其他来源。
- 非字符串但有意义的值，例如 `0`、`false`，不能简单当作缺失值丢弃；它们可能代表测试或 Whistle 封装后的可见 body。

本项目把这些差异集中到 `src/shared/requestContext.ts` 与 `src/shared/requestBody.ts`，避免各 hook 自己实现回退链。

## 规则模式与运行链路

插件规则示例：

```txt
www.example.com/api whistle.api-cache://record
www.example.com/api whistle.api-cache://replay
www.example.com/api whistle.api-cache://auto
```

运行语义：

- `record`：只录制真实响应。
- `replay`：优先回放缓存，未命中放行真实请求。
- `auto`：先尝试回放，未命中后请求真实服务并录制。
- `record,replay`：等价于自动闭环。

插件不会自动改写 Whistle 主 Rules。真实生效范围始终由用户在 Whistle Rules 中匹配到的流量决定。

## 动态规则回放

`rulesServer` 可以返回动态规则完成回放。本项目命中缓存时生成类似规则：

```txt
* statusCode://200 resHeaders://{headersKey} resBody://{bodyKey}
```

这条链路适合接入 Whistle 原生规则系统。维护时如果发现回放响应没有走 `server`，也要检查 `rulesServer` 是否生成了回放规则。

## Network 高亮与诊断

本项目通过动态 `style://` 规则和 `x-whistle-cache` 响应头辅助观察运行态：

- `record`、`replay`、`auto` 会生成不同高亮样式。
- 回放命中响应会注入 `x-whistle-cache: HIT`。
- 未命中或非标准环境兜底会使用 `x-whistle-cache: MISS`。

诊断事件里的 `requestId` 优先读取 Whistle 请求对象中的 `requestId`、`id` 或 `reqId`；缺失时生成本地递增标识。这个标识用于关联同一次请求中的 `MISS -> STORE`、`HIT -> SKIP STORE`、`ERROR` 等事件。

## 防劣化规则

- 不把 `skills/whistle` 里的通用规则语法搬进本文；只写本项目使用 `whistle.api-cache://record|replay|auto` 的约定。
- 不新增未经真实 Whistle 或测试验证的 hook 字段断言；不确定时写“需按当前 Whistle 版本验证”。
- 不把沙箱里的 `w2`、证书、系统代理、真实 storage 结果写成用户机器结论。
- 新增 hook 边界时，同步检查 `src/shared/requestContext.ts`、`src/shared/requestBody.ts` 和对应测试。

## 真实运行态与测试运行态

进程内测试只能证明本项目 hook 调用逻辑和缓存引擎行为正确，不等于真实 Whistle 代理环境联调。

真实联调时还需要确认：

- Whistle 进程正在运行。
- 客户端代理确实经过 Whistle。
- HTTPS 流量已按需解密。
- 插件已安装、启用，并且 Rules 匹配了目标请求。
- 插件 UI 路径使用 `http://localhost:8899/plugin.api-cache/`。

如果看到 `Not Found`，先检查路径拼写；例如 `plugin.api-cahce` 这类拼写错误不会进入插件 UI。
