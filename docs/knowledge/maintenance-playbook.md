# 维护与排障手册

本文记录 `whistle.api-cache` 的常见维护场景、验证命令、已知边界、防劣化规则和扩展检查清单。普通 Whistle 抓包与规则排障优先使用 `skills/whistle`；插件框架和加载排障优先使用 `skills/whistle-plugin`。

## 排障入口选择

| 问题类型 | 优先入口 |
| --- | --- |
| 普通 Rules/Values、代理、mock、过滤、证书、抓不到包 | `skills/whistle` |
| 插件不加载、hook 不触发、`lack watch`、`whistleConfig`、插件 UI 框架 | `skills/whistle-plugin` |
| 缓存未录制、未回放、TTL、导入导出、诊断事件 | 本文与 `project-technical.md` |

如果问题跨层，先用 skill 确认通用 Whistle 或插件框架前提，再回到本项目检查缓存逻辑。

## 常用验证命令

项目命令遵守仓库规则，统一加 `rtk` 前缀：

```bash
rtk npm run build
rtk npm test
rtk npm run e2e:auto-replay
rtk npm run test:body-regression
```

请求体读取语义回归命令：

```bash
rtk npm test test/shared/requestBody.test.ts
rtk npm test test/server.test.ts
rtk npm test test/rulesServer.test.ts
rtk npm test test/resStatsServer.test.ts
```

若需按 body 关键字筛选，可加 `-t body`：

```bash
rtk npm test test/shared/requestBody.test.ts test/server.test.ts test/rulesServer.test.ts test/resStatsServer.test.ts -t body
```

也可直接执行统一脚本：

```bash
rtk npm run test:body-regression
```

该命令会先编译测试到 `.tmp/test/`，再使用 `node --test --test-name-pattern body .tmp/test/test/**/*.test.js` 的过滤语法，仅运行标题中包含 `body` 的测试用例，适用于快速回归新增的请求体边界场景。

## 当前构建基线

`npm run build` 只编译插件运行时代码到 `dist/`，该目录是发布产物目录。
`npm run build:test` 编译运行时代码、测试代码和进程内 e2e 辅助代码到 `.tmp/test/`。
`npm run build:e2e` 编译运行时代码和本地联调脚本到 `.tmp/e2e/`。

测试和 e2e 产物不进入 `dist/`，避免开发验证代码被打入插件发布产物。

## 请求没有被录制

优先检查：

1. Whistle 规则是否包含 `record` 或 `auto`。
2. HTTPS 是否已解密，session 中是否有响应 body。
3. 请求是否带 `authorization` 或 `cookie`。
4. 响应是否带 `set-cookie`。
5. 状态码是否为 `2xx`。
6. `content-type` 是否是 JSON 或 text。
7. body 是否超过 1 MB。
8. UI 最近诊断中的 `BYPASS` reason。

## 请求没有命中缓存

优先检查：

1. Whistle 规则是否包含 `replay` 或 `auto`。
2. 条目是否启用。
3. 条目是否过期。
4. URL 归一化后是否一致。
5. 动态 query 是否加入忽略列表。
6. POST 请求 body 是否一致且可被读取。
7. 使用 UI “测试匹配”查看结构化 MISS 原因。

POST 相关特殊情况：

- 如果 POST 接口 MISS，先检查请求 body 是否可被 Whistle hook 读取到。
- 如果没有 request body 且同 URL 有多条 POST 候选，`match()` 会返回 `AMBIGUOUS_POST_CANDIDATES`。
- 回放 MISS 诊断会复用命中测试的 dry-run 原因，例如 `REPLAY MISS -> PASS THROUGH: ambiguous POST candidates: 3`。

## 自动模式重复访问真实上游

优先检查：

1. 第一次请求是否成功 `STORE`。
2. 第二次请求是否产生 `MISS`，reason 是什么。
3. 是否因为 query、body hash、过期或禁用导致未命中。
4. `markRecentReplayHit()` 和 `consumeRecentReplayHit()` 只负责避免回放命中后再次录制，不会影响 MISS 后录制。

自动模式典型 reason：

- `AUTO MISS -> STORE`
- `AUTO HIT -> SKIP STORE`
- `REPLAY MISS -> PASS THROUGH`

## 导入后无法回放

优先检查：

1. bundle `version` 是否为 `1`。
2. 条目是否包含 `bodyBase64`。
3. 导入后条目的 `profileId` 是否已改成当前 profile。
4. 条目是否过期或禁用。
5. 导入环境的忽略 query 参数是否和导出环境一致。

## UI 无法访问

优先检查：

1. 插件是否已在 Whistle Plugins 面板启用。
2. 访问路径是否为 `http://localhost:8899/plugin.api-cache/`。
3. 静态资源是否使用相对路径。
4. `uiServer` 是否成功导出并被编译到 `dist`。
5. `lack watch` 或 Whistle 插件日志中是否有前端资源或 CGI 报错。

如果看到 `Not Found`，先检查路径拼写；拼写错误不会进入插件 UI。

## 扩展检查清单

新增可缓存方法时，需要同步检查：

- `src/cache/policy.ts`
- `src/cache/key.ts`
- `src/cache/engine.ts`
- UI 策略展示
- 匹配诊断
- 对应测试

修改 cache key 规则时，需要同步检查：

- 旧缓存兼容逻辑。
- `findCompatibleEntry()`。
- `CacheEngine.match()`。
- URL 归一化测试。
- body hash 测试。

修改请求 body 读取或 key 规则时，要同时覆盖：

- `undefined`
- `''`
- `Buffer.from('')`
- `null`
- `false`
- `0`
- session fallback
- 唯一 POST 候选兜底
- 多 POST 候选歧义

修改回放响应头策略时，需要同步更新：

- `sanitizeReplayHeaders()`
- `getReplayHeaderPolicy()`
- UI 策略展示
- 回放头测试

修改可缓存 content type 时，需要同步更新：

- `getContentTypePolicy()`
- 前端策略展示
- policy 测试

增加 profile 持久化时，需要区分：

- 内存状态。
- 磁盘配置。
- Whistle 传入 options 的数据目录。
- UI 修改后的保存时机。

扩展二进制响应时，需要重新设计：

- body 存储格式。
- 动态规则中的 body 表达方式。
- 导入导出格式。
- UI 展示和下载策略。
- 回放响应头处理。

## 当前已知边界

- 插件不会自动改写 Whistle 主 Rules。
- 当前 profile 配置没有独立持久化，进程重启后回到默认值。
- 当前只缓存 JSON 和 text 响应，不缓存图片、音频、视频、PDF 或通用二进制响应。
- 端到端脚本是进程内模拟 hook 链路，不等同于真实 Whistle 代理环境联调。
- body 文件没有引用计数，两个条目共享同一个 body hash 时，删除其中一条可能删除共享 body 文件。
- `open-data-dir` 会调用系统打开目录命令，测试中应通过 `getOpenDirectoryCommand()` 验证平台差异，避免真实打开 GUI。

## 防劣化规则

- 不把阶段性修复流水账追加到 `project-technical.md`；只沉淀稳定规则、当前行为和必须同步维护的检查项。
- 不把 skill 已覆盖的通用 Whistle 语法、证书安装步骤、`w2` 命令说明写进项目文档。
- 不写“应该可行”“可能支持”作为知识；未验证内容只能写成待验证项，并放在 roadmap 或计划文档。
- 新增排障条目必须绑定至少一个可观察信号，例如诊断 reason、Network 标记、测试文件或具体模块。
- 修改缓存语义时，必须同步更新代码、测试、UI 展示和本文对应检查清单；只改其中一处视为文档劣化风险。
