# SQLite 与可编辑 Body 存储方案

本文记录 `whistle.api-cache` 下一阶段存储层改造方案。当前只沉淀设计，不代表代码已经实现。

## 背景

当前实现使用 `cache-index.json` 保存缓存元数据，使用 `objects/<bodyHash>.body` 保存响应 body。这个方案适合第一版录制和回放，但后续要支持“修改已保存 body 内容”和“自由代理”时会遇到两个核心问题：

- `bodyHash` 文件天然适合不可变内容，不适合直接承载可编辑内容。
- JSON 索引缺少跨进程写保护、事务、查询索引和结构演进能力。

下一阶段存储层应从“只服务缓存回放”调整为“同时服务录制原文、可编辑响应和代理规则编排”。

## 目标

- 使用 SQLite 保存元数据、索引、状态和扩展字段。
- 保留文件 body，避免大响应内容全部写入数据库。
- 区分不可变原始 body 和可编辑 active body。
- 上层 `CacheEngine` 尽量保持现有调用语义，降低迁移影响。
- 为后续自由代理能力预留字段和边界，但本方案不实现自由代理业务逻辑。
- 明确并发写入、迁移失败、文件缺失和版本升级时的恢复策略。

## 非目标

- 本阶段不实现 SQLite 存储代码。
- 本阶段不实现 UI 编辑器。
- 本阶段不实现自由代理规则编排。
- 本阶段不改变现有缓存命中策略、TTL 策略和可缓存策略。
- 本阶段不实现 body 多版本历史、差异对比、协同编辑或远端同步。
- 本阶段不把完整响应 body 存入 SQLite。

## 总体结构

推荐目录结构：

```txt
<dataDir>/
  cache.db
  objects/
    original/
      <sha256>.body
    editable/
      <entryId>.body
```

SQLite 负责保存条目元数据、查询索引和 active body 指针；文件系统负责保存响应 body 内容。

`original/` 保存录制得到的原始响应内容，按 sha256 命名，默认不可变。`editable/` 保存用户编辑后的响应内容，按稳定业务 id 命名，允许覆盖式更新或版本化扩展。

路径约束：

- 数据库中不保存可直接拼接到文件系统的任意绝对路径，优先保存 `original_body_key`、`active_body_key` 这类受控对象 key。
- `BodyObjectStore` 负责把对象 key 映射到 `<dataDir>/objects/` 内部路径，并校验解析后的路径仍在 `objects/` 下。
- 所有临时文件写入同一个目标目录后再 `rename`，避免跨设备移动导致原子性失效。
- editable 文件名使用内部生成的 `entryId`，不得使用 URL、cache key、profile 名称等用户可控字符串。

## 核心数据模型

第一阶段建议先落一张主表，避免过早拆分：

```sql
CREATE TABLE schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE cache_entries (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  method TEXT NOT NULL,
  original_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  request_body_hash TEXT,
  status_code INTEGER NOT NULL,
  response_headers_json TEXT NOT NULL,
  original_body_hash TEXT NOT NULL,
  original_body_key TEXT NOT NULL,
  original_body_size INTEGER NOT NULL,
  active_body_kind TEXT NOT NULL,
  active_body_key TEXT NOT NULL,
  active_body_hash TEXT NOT NULL,
  active_body_size INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
```

初始化时写入：

```sql
INSERT INTO schema_meta(key, value) VALUES ('schema_version', '1');
```

建议索引：

```sql
CREATE UNIQUE INDEX idx_cache_entries_profile_key
  ON cache_entries(profile_id, cache_key)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cache_entries_profile_method_url
  ON cache_entries(profile_id, method, normalized_url)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_cache_entries_expires_at
  ON cache_entries(expires_at)
  WHERE deleted_at IS NULL;
```

`active_body_kind` 只允许：

- `original`：当前响应读取原始 body。
- `editable`：当前响应读取编辑 body。

建议在 store 层或数据库层增加检查约束：

```sql
CHECK (active_body_kind IN ('original', 'editable'))
```

如果后续需要 body 多版本历史，再新增 `response_bodies` 表，不在第一阶段提前复杂化。

### 字段映射说明

为降低迁移风险，第一阶段保持现有业务字段语义：

- `cache_key` 对应当前 `CacheEntry.key`。
- `original_url` 对应当前原始请求 URL。
- `normalized_url` 对应当前归一化 URL。
- `request_body_hash` 保留空值与空 body 的区别，必须延续现有“`undefined` 才代表无请求体”的判断。
- `response_headers_json` 存储清理前的可回放响应头快照；回放时仍需要经过统一 header 清理。
- `original_body_key` 形如 `original/<sha256>.body`。
- `active_body_key` 形如 `original/<sha256>.body` 或 `editable/<entryId>.body`。

不要让 `CacheEngine` 直接依赖这些列名。SQLite 行到领域对象的转换应收敛在 `SqliteCacheStore` 内部。

## 录制流程

录制新响应时：

1. 计算响应 body 的 sha256，得到 `originalBodyHash`。
2. 写入临时文件 `objects/original/<hash>.<uuid>.tmp`。
3. 写入完成后原子 `rename` 为 `objects/original/<hash>.body`。
4. 在 SQLite 事务中 upsert `cache_entries`。
5. 新条目的 `active_body_kind` 默认为 `original`，`active_body_key` 指向原始 body。

相同 body 内容可以复用同一个 original 文件。并发写入同一个 hash 时，如果正式文件已经存在，可以删除本次临时文件并继续写数据库记录。

录制 upsert 需要保留用户编辑语义：

- 如果目标条目不存在，插入新条目，`active_body_kind = original`。
- 如果目标条目已存在且 active body 仍是 `original`，可以用新录制结果更新原始 body、响应头、状态码和过期时间。
- 如果目标条目已存在且 active body 是 `editable`，默认不得用录制结果覆盖用户编辑；只更新 `original_*` 字段和必要元数据，active 指针继续指向 editable body。
- 如后续需要“重新录制并覆盖编辑内容”，必须通过明确 API 或 UI 动作表达。

## 编辑流程

用户第一次编辑某条缓存 body 时：

1. 读取当前 active body，作为编辑初始内容。
2. 写入临时文件 `objects/editable/<entryId>.<uuid>.tmp`。
3. 原子 `rename` 为 `objects/editable/<entryId>.body`。
4. 更新 SQLite 中的 `active_body_kind`、`active_body_key`、`active_body_hash`、`active_body_size` 和 `updated_at`。

再次编辑时可以覆盖同一个 `editable/<entryId>.body`。如果需要撤销、对比、版本历史，再扩展为 `editable/<entryId>/<versionId>.body`，并引入 body 版本表。

编辑 body 后必须重新处理响应头：

- 回放时不要信任旧的 `content-length`。
- `content-encoding` 已按现有策略移除，编辑内容默认按明文响应处理。
- `content-type` 是否允许用户编辑，应由后续 UI/API 方案单独定义。

编辑写入的并发策略：

- `updateActiveBody()` 应在数据库事务中读取当前 `updated_at` 或 revision，并支持乐观并发检查。
- UI/API 后续落地时应传入 `expectedUpdatedAt` 或 `expectedRevision`，避免两个编辑请求互相覆盖。
- 第一阶段没有 UI 时，内部 API 可以先不暴露冲突参数，但 store 设计要预留。
- 编辑失败时不得留下 active 指针指向未完成文件；已经写出的临时文件交给垃圾清理。

## 回放与自由代理读取

回放和后续自由代理都应只读取 active body：

1. SQLite 按现有 cache key 策略找到条目。
2. 检查 `enabled`、`expires_at` 和业务策略。
3. 通过 `BodyObjectStore` 读取 `active_body_key` 指向的文件。
4. 清理响应头并重新注入 `content-length`、`x-whistle-cache`。
5. 更新 `hit_count` 和 `last_hit_at`。

如果 active body 文件缺失，应返回结构化 MISS 或错误诊断，不应抛出未处理异常。原始 body 仍存在时，可以在诊断中提示“active body 缺失，original body 可恢复”，但不要静默回退，以免用户编辑结果被意外忽略。

回放读取必须通过 `BodyObjectStore.read(activeBodyKey)` 完成，禁止直接读取数据库里的路径字符串。诊断事件至少包含：

- `entryId`
- `profileId`
- `cacheKey`
- `activeBodyKind`
- `activeBodyKey`
- 是否存在可恢复的 `originalBodyKey`

## 删除与清理

删除缓存条目时优先软删除：

1. 设置 `deleted_at`。
2. 条目不再参与回放、匹配和列表默认展示。
3. 不立即删除 original body。
4. editable body 可以保留到下一次垃圾清理，也可以在确认无引用后删除。

垃圾清理单独执行：

- 扫描 SQLite 中仍被引用的 `original_body_key` 和 `active_body_key`。
- 删除 `objects/` 下未被引用的 body 文件。
- 对缺失文件生成诊断报告，辅助修复数据。

这样可以避免删除一条缓存时误删多个条目共享的 original body。

文件存储兼容实现也必须遵守引用感知删除：删除单条缓存时不能无条件 `unlink(objects/<bodyHash>.body)`，至少要先确认没有其他未删除条目引用同一 `bodyHash`。

## 迁移策略

从当前文件存储迁移到 SQLite 时：

1. 读取现有 `cache-index.json`。
2. 对每条缓存写入 `cache_entries`。
3. 现有 `objects/<bodyHash>.body` 可迁移到 `objects/original/<bodyHash>.body`。
4. `active_body_kind` 初始化为 `original`。
5. 迁移成功后保留旧 `cache-index.json` 作为备份，不在首次迁移时删除。

迁移必须幂等。重复执行时，应以 `(profile_id, cache_key)` upsert，避免重复导入。

迁移过程建议拆成可恢复阶段：

1. 创建 `cache.db.tmp` 并写入 `schema_meta.schema_version = 1`。
2. 读取并校验 `cache-index.json`，坏 JSON 时停止迁移，不改动旧数据。
3. 复制或硬链接 existing body 到 `objects/original/`；目标文件存在且 hash 一致时跳过。
4. 导入条目到临时数据库，并记录迁移来源版本和导入数量。
5. 完整校验条目数量、body 引用和关键索引后，将 `cache.db.tmp` 原子 rename 为 `cache.db`。
6. 写入 `cache-index.json.bak.<timestamp>` 或迁移标记文件，保留旧文件供降级和人工排查。

启动时的兼容策略：

- 如果 `cache.db` 存在且 schema 版本可识别，优先使用 SQLite。
- 如果只存在 `cache.db.tmp`，视为上次迁移失败，删除临时数据库后重新迁移。
- 如果 SQLite 打开失败，不自动写回旧 JSON；进入只读诊断或明确降级路径，避免双写分叉。
- 首次上线可以提供配置开关选择继续使用文件存储，便于 native SQLite 依赖验证。

## Store 接口边界

建议先定义存储接口，再分别实现当前文件版和未来 SQLite 版：

```ts
interface CacheStore {
  listEntries(): Promise<CacheEntry[]>;
  getEntryByKey(profileId: string, key: string): Promise<CacheEntry | undefined>;
  readBody(entry: CacheEntry): Promise<Buffer>;
  putEntry(entry: CacheEntry, body: Buffer): Promise<void>;
  deleteEntry(id: string): Promise<boolean>;
  setEnabled(id: string, enabled: boolean): Promise<boolean>;
  updateExpiresAt(ids: string[], expiresAt: string): Promise<number>;
  clearExpired(now?: Date): Promise<number>;
  clearAll(): Promise<number>;
  markHit(id: string, now?: Date): Promise<void>;
}
```

建议把 body 文件职责进一步拆出：

```ts
interface BodyObjectStore {
  writeOriginal(body: Buffer): Promise<{ key: string; hash: string; size: number }>;
  writeEditable(entryId: string, body: Buffer): Promise<{ key: string; hash: string; size: number }>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  collectGarbage(referencedKeys: Set<string>): Promise<GarbageCollectResult>;
}
```

编辑能力不要塞进 `putEntry()`，应新增明确方法：

```ts
interface EditableBodyStore {
  updateActiveBody(id: string, body: Buffer, options?: { expectedUpdatedAt?: string }): Promise<CacheEntry>;
  restoreOriginalBody(id: string): Promise<CacheEntry>;
}
```

这样可以让录制写入和用户编辑写入保持不同语义，避免后续维护时混淆“录制覆盖”和“手工编辑”。

`putEntry()` 应仅表示录制或导入写入；编辑、恢复原始 body、启停、TTL 更新都用独立方法表达。

## 依赖选择

推荐优先评估 `better-sqlite3`：

- API 简单，事务语义清晰。
- 本地插件场景通常是单机本地数据，SQLite 同步接口可接受。
- 适合把复杂并发控制交给 SQLite，减少手写 JSON 锁逻辑。

风险：

- 它是 native 依赖，安装和打包复杂度高于纯 TypeScript。
- 需要确认 Whistle 插件运行环境能正常加载 native module。

如果 native 依赖不可接受，再评估纯 JS/WASM SQLite 或继续强化文件存储。不要在没有验证运行环境前贸然提交依赖迁移。

依赖验收门槛：

- 在当前插件启动方式下完成安装、构建、`lack watch` 或等价本地加载验证。
- 验证 macOS 本机 Node 版本和 Whistle 运行 Node 版本是否 ABI 兼容。
- 验证打包发布后 native module 路径可被 Whistle 插件解析。
- 验证数据库文件位于 `dataDir`，不会写入插件安装目录。
- 确认失败时能给出明确诊断，而不是让插件 UI 或代理链路崩溃。

如果以上任一项不能通过，第一阶段应保留 `FileCacheStore + BodyObjectStore` 抽象，只把 SQLite 实现放在实验分支或配置开关后。

## 并发与一致性

SQLite 建议启用：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 3000;
```

一致性规则：

- 所有元数据变更必须通过 store 方法进入，不允许 UI/API 直接执行 SQL。
- 命中计数可以使用轻量更新，但不能阻塞回放主路径太久；更新失败只记录诊断，不影响 body 返回。
- 批量删除、清理过期和导入导出要使用事务。
- 文件写入先落临时文件并完成 fsync 或等价安全写入，再更新数据库指针。
- 数据库提交后残留的旧 editable 文件由垃圾清理回收，不在请求链路里同步清理。

跨进程场景下，SQLite 负责元数据写锁；文件层仍需使用唯一临时文件名和原子 rename 防止互相覆盖。

## 测试计划

落地实现时至少覆盖：

- 当前 `FileCacheStore` 删除共享 body 的回归测试。
- 录制后生成 SQLite 元数据和 original body 文件。
- 回放读取 active original body。
- 编辑 body 后回放读取 editable body。
- 恢复原始 body 后回放读取 original body。
- 已编辑条目再次录制时不覆盖 active editable body。
- 编辑 API 并发冲突时返回明确错误。
- 删除条目不误删共享 original body。
- active body 文件缺失时返回结构化诊断。
- 从 `cache-index.json` 迁移到 SQLite 的幂等性。
- 迁移中断后再次启动能重新迁移或进入明确诊断。
- 数据库 schema 版本不兼容时拒绝写入并提示升级路径。
- 导入导出仍包含 active body 内容和必要元数据。

人工验证还需要覆盖：

- Whistle 插件环境能加载 SQLite 依赖。
- 插件重启后 SQLite 数据、body 文件和 UI 列表一致。
- active body 缺失时 UI/诊断事件可定位到具体条目。

## 设计原则

### 可维护性

存储职责应拆成三层：

- `CacheEngine` 只处理缓存业务语义。
- `CacheStore` 处理元数据查询和状态更新。
- `BodyObjectStore` 处理 body 文件的原子读写、路径计算和垃圾清理。

这样可以避免 SQLite SQL、文件系统细节和缓存命中策略混在同一个文件里。

### 可扩展性

`active_body_kind + active_body_key` 能支撑当前编辑能力；后续新增自由代理时，可以把代理规则指向同一套 active body 读取逻辑，而不是重新实现一套响应存储。

如果后续需要多版本 body、环境变量替换或响应模板，可以在不改变 `CacheEngine.replay()` 主路径的前提下扩展 `response_bodies` 或 `proxy_rules` 表。

### 风险控制

SQLite 事务不能覆盖外部 body 文件，因此写入顺序必须固定为“先原子写 body，再提交元数据”。这会留下少量孤儿文件风险，但可以通过垃圾清理解决。不要先提交数据库再写 body，否则会产生命中元数据但 body 缺失的严重问题。

额外风险与处理：

- native SQLite 依赖不可用：保留文件存储实现和配置开关，不让插件不可启动。
- 半迁移状态：只认完整 `cache.db`，临时数据库可删除重建。
- editable body 被误删：不静默回退，提供恢复原始 body 的显式操作。
- schema 演进失败：拒绝写入，保留数据库备份，并输出可行动诊断。
- 大 body 编辑内存压力：本阶段沿用现有最大 body 限制，后续如放宽限制再引入流式读写。

## 建议实施顺序

1. 修复当前 `FileCacheStore` 删除共享 body 的风险，并补回归测试。
2. 定义 `CacheStore` 接口，保持现有 `FileCacheStore` 对外行为不变。
3. 抽出 `BodyObjectStore`，让当前文件存储也复用原子 body 写入和路径校验逻辑。
4. 验证 `better-sqlite3` 在 Whistle 插件运行环境里的可用性，失败则暂缓 SQLite 依赖落地。
5. 增加 SQLite store 的最小实现、schema 版本表和幂等迁移逻辑。
6. 增加 active body 编辑 API，但暂不接 UI。
7. 增加恢复原始 body、诊断事件和垃圾清理。
8. 最后接入 UI 编辑和自由代理能力。

## 阶段验收标准

SQLite 存储阶段完成时，应满足：

- 不改现有缓存命中策略和 UI 主流程。
- 原文件存储测试继续通过。
- SQLite store 与 File store 共享同一组 store contract 测试。
- 迁移前后的缓存列表、回放结果、导入导出结果一致。
- 所有 body 读取都经过 `BodyObjectStore`，没有裸路径拼接。
- native 依赖不可用时有明确诊断或可配置回退。

可编辑 body 阶段完成时，应满足：

- 编辑后回放只读取 editable body。
- 恢复原始 body 是显式操作。
- 再次录制不会悄悄覆盖用户编辑内容。
- active body 缺失有结构化诊断。
- 删除和垃圾清理不会误删共享 original body。
