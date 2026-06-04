# whistle.api-cache MVP 实施计划

> **给执行代理的要求：** 实施本计划时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项执行带复选框的任务。

**目标：** 构建一个 Whistle 插件 MVP，能够录制匹配的 GET JSON/text 响应，并从持久化缓存回放。

**架构：** 缓存引擎独立于 Whistle hooks，便于测试和复用。Whistle 相关文件只负责把 hook/session 数据转换成引擎调用。UI server 提供状态、缓存条目、设置和静态页面。

**技术栈：** TypeScript、Node.js 内置模块、Whistle 插件 hook 约定、Node 内置测试运行器。

---

## 文件结构

- `package.json`：插件包元信息、脚本和 `whistleConfig`。
- `tsconfig.json`：TypeScript 构建配置。
- `src/cache/types.ts`：配置、策略、缓存条目、回放响应等共享类型。
- `src/cache/key.ts`：URL 归一化和缓存 key 计算。
- `src/cache/policy.ts`：可缓存性判断和回放响应头清理。
- `src/cache/store.ts`：持久化 JSON 索引和 body 对象存储。
- `src/cache/engine.ts`：录制/回放编排。
- `src/shared/state.ts`：hooks 和 UI 共用的单例引擎与配置。
- `src/server.ts`：回放 hook。
- `src/resStatsServer.ts`：录制 hook。
- `src/uiServer/index.ts`：UI API 和静态资源服务。
- `public/index.html`：插件 UI 页面骨架。
- `public/app.js`：UI 交互逻辑。
- `public/styles.css`：插件 UI 样式。
- `test/cache/*.test.ts`：key、policy、store、engine 单元测试。

## 任务 1：搭建包结构和 key 测试

**文件：**

- 新建：`package.json`
- 新建：`tsconfig.json`
- 新建：`test/cache/key.test.ts`
- 新建：`src/cache/key.ts`

- [x] **步骤 1：编写失败测试**

创建 `test/cache/key.test.ts`，验证忽略 query 参数、排序 query、生成稳定缓存 key。

- [x] **步骤 2：添加包元信息**

创建 `package.json`，包名使用 `whistle.api-cache`，添加 `build`、`dev`、`test` 脚本，并配置 `whistleConfig.networkColumn`。不能使用 `whistle.cache`，因为短名 `cache` 与 Whistle 内置协议冲突。

- [x] **步骤 3：添加 TypeScript 配置**

创建 `tsconfig.json`，输出目录为 `dist`，开启 `strict`。

- [x] **步骤 4：运行测试并确认失败**

运行：`npm test`

预期：因为 `src/cache/key.ts` 尚不存在而失败。

- [x] **步骤 5：实现缓存 key 工具**

创建 `src/cache/key.ts`，提供 `normalizeUrl` 和 `createCacheKey`。

- [x] **步骤 6：运行测试并确认通过**

运行：`npm test`

预期：key 相关测试通过。

## 任务 2：实现缓存策略

**文件：**

- 新建：`src/cache/types.ts`
- 新建：`src/cache/policy.ts`
- 新建：`test/cache/policy.test.ts`

- [x] **步骤 1：编写失败测试**

创建 `test/cache/policy.test.ts`，覆盖：

- 安全的 GET JSON 2xx 响应可缓存。
- 带 `authorization` 的请求不可缓存。
- 带 `set-cookie` 的响应不可缓存。
- 回放响应头会过滤 `transfer-encoding`、`connection`，并重新计算 `content-length`。

- [x] **步骤 2：运行测试并确认失败**

运行：`npm test`

预期：因为 policy/types 模块尚不存在而失败。

- [x] **步骤 3：实现共享类型和策略**

创建 `src/cache/types.ts` 和 `src/cache/policy.ts`，实现 `CacheProfile`、`CacheEntry`、`isCacheableResponse`、`sanitizeReplayHeaders`。

- [x] **步骤 4：运行测试并确认通过**

运行：`npm test`

预期：key 和 policy 测试通过。

## 任务 3：实现持久化存储和缓存引擎

**文件：**

- 新建：`src/cache/store.ts`
- 新建：`src/cache/engine.ts`
- 新建：`test/cache/store.test.ts`
- 新建：`test/cache/engine.test.ts`

- [x] **步骤 1：编写 store 和 engine 测试**

测试覆盖：

- 写入条目会创建索引记录和 body 文件。
- 按 key 读取条目并读取 body。
- 标记命中会递增命中次数并写入 `lastHitAt`。
- 引擎会录制可缓存响应并拒绝不安全响应。
- 引擎回放缺失条目时返回 miss，命中时返回 hit。

- [x] **步骤 2：运行测试并确认失败**

运行：`npm test`

预期：因为 store/engine 模块尚不存在而失败。

- [x] **步骤 3：实现文件存储**

实现 `FileCacheStore`：

```ts
export class FileCacheStore {
  constructor(rootDir: string) {}
  listEntries(): Promise<CacheEntry[]> {}
  getEntryByKey(profileId: string, key: string): Promise<CacheEntry | undefined> {}
  readBody(entry: CacheEntry): Promise<Buffer> {}
  putEntry(entry: CacheEntry, body: Buffer): Promise<void> {}
  deleteEntry(id: string): Promise<boolean> {}
  clearExpired(now?: Date): Promise<number> {}
  markHit(id: string, now?: Date): Promise<void> {}
}
```

索引写入使用临时文件加 rename，避免写坏 `cache-index.json`。

- [x] **步骤 4：实现缓存引擎**

实现 `CacheEngine`，负责录制、回放、列表、删除和清理过期缓存。

- [x] **步骤 5：运行测试并确认通过**

运行：`npm test`

预期：key、policy、store、engine 测试全部通过。

## 任务 4：实现 Whistle hooks 和共享状态

**文件：**

- 新建：`src/index.ts`
- 新建：`src/shared/state.ts`
- 新建：`src/server.ts`
- 新建：`src/resStatsServer.ts`
- 新建：`rules.txt`

- [ ] **步骤 1：添加共享状态**

创建默认 Profile 和单例引擎。存储目录优先使用 Whistle/lack 提供的数据目录；没有时回退到插件当前目录下的 `.whistle-cache-data`。

- [ ] **步骤 2：实现回放 server hook**

`src/server.ts` 需要：

- 读取 `req.originalReq.fullUrl` 和 method。
- 调用 `engine.replay`。
- 命中时写入缓存状态码、响应头和 body。
- 未命中时调用 `req.passThrough()`。

- [ ] **步骤 3：实现录制 resStatsServer hook**

`src/resStatsServer.ts` 需要：

- 通过 `req.getSession` 读取完整 session。
- 收集 method、full URL、请求头、响应状态码、响应头和响应 body。
- 调用 `engine.record`。
- 记录 `STORE` 或 `BYPASS` 及原因。

- [ ] **步骤 4：添加默认规则文件**

创建 `rules.txt`，用中文注释说明插件是显式启用的：

```txt
# whistle.api-cache 默认不全局生效，请在 Whistle UI 中添加类似规则：
# www.example.com/api whistle.api-cache://record
# www.example.com/api whistle.api-cache://replay
# www.example.com/api whistle.api-cache://record,replay
```

- [ ] **步骤 5：运行构建和测试**

运行：`npm test`

预期：TypeScript 构建成功，所有测试通过。

## 任务 5：实现 UI server 和静态 UI

**文件：**

- 新建：`src/uiServer/index.ts`
- 新建：`public/index.html`
- 新建：`public/app.js`
- 新建：`public/styles.css`

- [ ] **步骤 1：实现 UI API**

`src/uiServer/index.ts` 提供：

- `GET /cgi-bin/state`：返回 profile、条目数量、存储摘要。
- `GET /cgi-bin/cache`：返回缓存条目列表。
- `POST /cgi-bin/cache/clear-expired`：清理过期条目。
- `POST /cgi-bin/cache/delete`：按 id 删除条目。
- 静态服务 `public/`。

- [ ] **步骤 2：实现 UI 页面骨架**

`public/index.html` 包含：

- 顶部状态条。
- 概览、规则、缓存、设置区域。
- 空状态。
- 缓存表格。
- 使用 `whistle.api-cache://record` 和 `whistle.api-cache://replay` 的规则示例。

- [ ] **步骤 3：实现 UI 交互**

`public/app.js` 需要：

- 拉取状态和缓存条目。
- 渲染表格和统计数字。
- 调用删除和清理过期 API。
- 在可见 banner 中展示 API 错误。

- [ ] **步骤 4：实现 UI 样式**

`public/styles.css` 保持克制、紧凑、易读，适合嵌在 Whistle Plugins Tab 中。

- [ ] **步骤 5：运行构建和测试**

运行：`npm test`

预期：TypeScript 构建成功，所有测试通过。

## 任务 6：验证和文档

**文件：**

- 新建：`README.md`

- [ ] **步骤 1：添加中文 README**

说明：

- 插件用途。
- MVP 范围。
- 安装/开发命令。
- 激活规则。
- 安全默认值。
- Whistle 人工验证步骤。

- [ ] **步骤 2：运行最终验证**

运行：

```bash
npm test
npm run build
```

预期：两个命令都成功。

- [ ] **步骤 3：检查 git 状态**

运行：`git status --short`

预期：只有本次插件文件和文档变更；原本存在的 `.gitignore` 不纳入本次修改，除非用户明确要求。
