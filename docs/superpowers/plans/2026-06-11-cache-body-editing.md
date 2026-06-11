# 缓存响应数据修改实现计划

> **面向智能体执行者：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐项实现本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 在插件面板中查看、编辑、保存、恢复单条缓存响应 body，并让后续回放立即使用修改后的 active body。

**架构：** 后端在现有 `active body` / `original body` 语义上补齐读取 API，把 `CacheStore.readBody` 扩展为按 `active | original` 读取，`CacheEngine` 负责把 body 转成 UI payload。前端继续使用当前无构建的 `public/index.html`、`public/app.js`、`public/styles.css`，在主工作区增加 `缓存列表` / `缓存管理` Tab。

**技术栈：** TypeScript、Node.js 内置 `node:test`、better-sqlite3、Whistle plugin UI 静态资源、原生 DOM API。

---

## 文件结构

- 修改：`src/cache/types.ts`，增加 body 读取相关类型。
- 修改：`src/cache/store.ts`，扩展文件存储读取 active/original body。
- 修改：`src/cache/sqliteStore.ts`，扩展 SQLite 存储读取 active/original body。
- 修改：`src/cache/engine.ts`，增加 `readBody`、文本判断和 UTF-8 安全解码。
- 修改：`src/uiServer/requestParsers.ts`，增加读取 body 查询参数解析。
- 新建：`src/uiServer/httpError.ts`，统一 HTTP 错误状态与错误码。
- 修改：`src/uiServer/index.ts`，新增 `GET /cgi-bin/cache/body` 并映射保存/恢复错误。
- 修改：`public/index.html`，增加主工作区 Tab 和缓存管理容器。
- 修改：`public/app.js`，增加缓存管理状态、筛选、读取、编辑、保存、恢复、未保存保护。
- 修改：`public/styles.css`，增加缓存管理分栏、列表、编辑器和状态标记样式。
- 修改：`test/cache/store.test.ts`，覆盖文件存储 active/original 读取。
- 修改：`test/cache/sqliteStore.test.ts`，覆盖 SQLite active/original 读取。
- 修改：`test/cache/engine.test.ts`，覆盖 engine body payload。
- 修改：`test/uiServer/requestParsers.test.ts`，覆盖查询参数解析。
- 修改：`test/uiServer/clearAll.test.ts`，覆盖 UI 读取接口、冲突状态和页面结构。

---

### 任务 1：存储层支持按 active/original 读取 body

**文件：**
- 修改： `src/cache/types.ts`
- 修改： `src/cache/store.ts`
- 修改： `src/cache/sqliteStore.ts`
- 测试： `test/cache/store.test.ts`
- 测试： `test/cache/sqliteStore.test.ts`

- [ ] **步骤 1：写文件存储失败测试**

在 `test/cache/store.test.ts` 的 `updates active editable body without losing original body` 测试后增加：

```ts
test('reads active and original bodies separately from file store', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-read-body-kind-'));
  const store = new FileCacheStore(root);

  await store.putEntry(createEntry('entry-1', 'GET https://api.example.com/edit'), Buffer.from('original'));
  const edited = await store.updateActiveBody('entry-1', Buffer.from('edited'));

  assert.equal((await store.readBody(edited)).toString(), 'edited');
  assert.equal((await store.readBody(edited, 'active')).toString(), 'edited');
  assert.equal((await store.readBody(edited, 'original')).toString(), 'original');
});
```

- [ ] **步骤 2：写 SQLite 存储失败测试**

在 `test/cache/sqliteStore.test.ts` 的 `sqlite store restores original body state` 测试后增加：

```ts
test('sqlite store reads active and original bodies separately', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-sqlite-read-body-kind-'));
  const store = new SqliteCacheStore(root);
  const entry = createEntry('entry-1', 'GET https://api.example.com/users');

  await store.putEntry(entry, Buffer.from('original'));
  const edited = await store.updateActiveBody('entry-1', Buffer.from('edited'));

  assert.equal((await store.readBody(edited)).toString(), 'edited');
  assert.equal((await store.readBody(edited, 'active')).toString(), 'edited');
  assert.equal((await store.readBody(edited, 'original')).toString(), 'original');
  store.close();
});
```

- [ ] **步骤 3：运行测试确认失败**

运行： `rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/cache/store.test.js .tmp/test/test/cache/sqliteStore.test.js`

预期： TypeScript 编译失败，提示 `readBody` 不接受第二个参数。

- [ ] **步骤 4：增加共享类型**

在 `src/cache/types.ts` 末尾增加：

```ts
export type CacheBodyKind = 'active' | 'original';
```

- [ ] **步骤 5：扩展 store 接口和文件存储实现**

在 `src/cache/store.ts` 顶部 import 改为：

```ts
import { CacheBodyKind, CacheEntry } from './types';
```

把接口方法改为：

```ts
readBody(entry: CacheEntry, kind?: CacheBodyKind): Promise<Buffer>;
```

把 `FileCacheStore.readBody` 改为：

```ts
async readBody(entry: CacheEntry, kind: CacheBodyKind = 'active'): Promise<Buffer> {
  return this.bodyObjects.read(getBodyKey(entry, kind));
}
```

在 `getActiveBodyKey` 前增加：

```ts
function getBodyKey(entry: CacheEntry, kind: CacheBodyKind): string {
  return kind === 'original' ? getOriginalBodyKey(entry) : getActiveBodyKey(entry);
}
```

- [ ] **步骤 6：扩展 SQLite 存储实现**

在 `src/cache/sqliteStore.ts` 顶部 import 改为：

```ts
import { CacheBodyKind, CacheEntry } from './types';
```

把 `SqliteCacheStore.readBody` 改为：

```ts
async readBody(entry: CacheEntry, kind: CacheBodyKind = 'active'): Promise<Buffer> {
  const key = kind === 'original'
    ? (entry.originalBodyKey || legacyBodyKey(entry.originalBodyHash || entry.bodyHash))
    : (entry.activeBodyKey || entry.originalBodyKey || legacyBodyKey(entry.bodyHash));
  return this.bodyObjects.read(key);
}
```

- [ ] **步骤 7：运行测试确认通过**

运行： `rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/cache/store.test.js .tmp/test/test/cache/sqliteStore.test.js`

预期： 两个测试文件全部通过。

- [ ] **步骤 8：提交**

```bash
rtk git add src/cache/types.ts src/cache/store.ts src/cache/sqliteStore.ts test/cache/store.test.ts test/cache/sqliteStore.test.ts
rtk git commit -m "feat: read active and original cache bodies"
```

---

### 任务 2：CacheEngine 返回前端可用的 body payload

**文件：**
- 修改： `src/cache/engine.ts`
- 测试： `test/cache/engine.test.ts`

- [ ] **步骤 1：写读取 active/original 的失败测试**

在 `test/cache/engine.test.ts` 的基础回放测试后增加：

```ts
test('reads active and original cache body payloads for UI editing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-read-body-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  await engine.record({
    method: 'GET',
    url: 'https://api.example.com/users',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json; charset=utf-8' },
    body: Buffer.from('{"ok":true}'),
  });

  const [entry] = await engine.list();
  await engine.updateActiveBody({
    id: entry.id,
    body: Buffer.from('{"ok":false}'),
    expectedUpdatedAt: entry.updatedAt,
  });

  const active = await engine.readBody({ id: entry.id, kind: 'active' });
  const original = await engine.readBody({ id: entry.id, kind: 'original' });

  assert.equal(active.kind, 'active');
  assert.equal(active.editable, true);
  assert.equal(active.encoding, 'utf8');
  assert.equal(active.bodyText, '{"ok":false}');
  assert.equal(active.bodyBase64, '');
  assert.equal(active.entry.activeBodyKind, 'editable');
  assert.equal(original.kind, 'original');
  assert.equal(original.bodyText, '{"ok":true}');
});
```

- [ ] **步骤 2：写非文本 body 的失败测试**

在同一文件增加：

```ts
test('returns base64 payload for non-text cache bodies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-binary-body-'));
  const engine = new CacheEngine(new FileCacheStore(root), {
    ...profile,
    cacheableContentTypes: ['application/octet-stream'],
  });

  await engine.record({
    method: 'GET',
    url: 'https://api.example.com/file',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/octet-stream' },
    body: Buffer.from([0, 1, 2, 3]),
  });

  const [entry] = await engine.list();
  const payload = await engine.readBody({ id: entry.id, kind: 'active' });

  assert.equal(payload.editable, false);
  assert.equal(payload.encoding, 'base64');
  assert.equal(payload.bodyText, '');
  assert.equal(payload.bodyBase64, Buffer.from([0, 1, 2, 3]).toString('base64'));
});
```

- [ ] **步骤 3：运行测试确认失败**

运行： `rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/cache/engine.test.js`

预期： TypeScript 编译失败，提示 `readBody` 不存在。

- [ ] **步骤 4：增加 engine 类型与方法**

在 `src/cache/engine.ts` import 改为：

```ts
import { TextDecoder } from 'node:util';
import { createCacheKey, hashRequestBody, normalizeUrl } from './key';
import { isCacheableResponse, sanitizeReplayHeaders } from './policy';
import { CacheStore, hashBody } from './store';
import { CacheBodyKind, CacheEntry, CacheProfile, CacheRecordInput } from './types';
```

在 `CacheExportBundle` 后增加：

```ts
export interface ReadBodyInput {
  id: string;
  kind?: CacheBodyKind;
}

export interface ReadBodyResult {
  entry: CacheEntry;
  kind: CacheBodyKind;
  contentType: string;
  encoding: 'utf8' | 'base64';
  editable: boolean;
  bodyText: string;
  bodyBase64: string;
  size: number;
  hash: string;
  updatedAt: string;
}
```

在 `restoreOriginalBody` 后增加：

```ts
async readBody(input: ReadBodyInput): Promise<ReadBodyResult> {
  const kind = input.kind || 'active';
  const entry = (await this.store.listEntries()).find((item) => item.id === input.id);
  if (!entry) throw new Error(`cache entry not found: ${input.id}`);

  const body = await this.store.readBody(entry, kind);
  const text = decodeEditableText(body, entry.contentType);
  const hash = kind === 'original'
    ? (entry.originalBodyHash || entry.bodyHash)
    : (entry.activeBodyHash || entry.bodyHash);
  const size = kind === 'original'
    ? (entry.originalBodySize || entry.bodySize)
    : (entry.activeBodySize || entry.bodySize);

  return {
    entry,
    kind,
    contentType: entry.contentType || '',
    encoding: text === undefined ? 'base64' : 'utf8',
    editable: text !== undefined,
    bodyText: text || '',
    bodyBase64: text === undefined ? body.toString('base64') : '',
    size,
    hash,
    updatedAt: entry.updatedAt || entry.createdAt,
  };
}
```

在文件底部增加：

```ts
function decodeEditableText(body: Buffer, contentType: string): string | undefined {
  if (!isEditableContentType(contentType)) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return undefined;
  }
}

function isEditableContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase().split(';')[0].trim();
  return normalized === 'application/json' ||
    normalized.endsWith('+json') ||
    normalized === 'application/javascript' ||
    normalized === 'application/xml' ||
    normalized === 'application/x-www-form-urlencoded' ||
    normalized.startsWith('text/');
}
```

- [ ] **步骤 5：运行测试确认通过**

运行： `rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/cache/engine.test.js`

预期： `engine.test.js` 全部通过。

- [ ] **步骤 6：提交**

```bash
rtk git add src/cache/engine.ts test/cache/engine.test.ts
rtk git commit -m "feat: expose cache body payloads"
```

---

### 任务 3：UI Server 提供读取接口和结构化错误

**文件：**
- 新建： `src/uiServer/httpError.ts`
- 修改： `src/uiServer/requestParsers.ts`
- 修改： `src/uiServer/index.ts`
- 测试： `test/uiServer/requestParsers.test.ts`
- 测试： `test/uiServer/clearAll.test.ts`

- [ ] **步骤 1：写 parser 失败测试**

在 `test/uiServer/requestParsers.test.ts` import 列表加入 `parseReadBodyQuery`，并增加：

```ts
test('parses cache body read query with active fallback', () => {
  assert.deepEqual(parseReadBodyQuery(new URLSearchParams('id=entry-1&kind=original')), {
    id: 'entry-1',
    kind: 'original',
  });

  assert.deepEqual(parseReadBodyQuery(new URLSearchParams('id=entry-2&kind=bad')), {
    id: 'entry-2',
    kind: 'active',
  });

  assert.deepEqual(parseReadBodyQuery(new URLSearchParams('')), {
    id: '',
    kind: 'active',
  });
});
```

- [ ] **步骤 2：写 UI Server 读取接口失败测试**

在 `test/uiServer/clearAll.test.ts` 增加：

```ts
test('ui server reads active and original cache body payloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-read-body-'));
  const options = { baseDir: root };
  await (await getEngine(options)).clearAll();
  await (await getEngine(options)).record({
    method: 'GET',
    url: 'https://api.example.com/users',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  const [entry] = await (await getEngine(options)).list();
  await (await getEngine(options)).updateActiveBody({
    id: entry.id,
    body: Buffer.from('{"ok":false}'),
    expectedUpdatedAt: entry.updatedAt,
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const activeResponse = createJsonResponse();
  await handler?.({ method: 'GET', url: `/cgi-bin/cache/body?id=${entry.id}&kind=active` }, activeResponse);
  assert.equal(activeResponse.body.bodyText, '{"ok":false}');
  assert.equal(activeResponse.body.kind, 'active');

  const originalResponse = createJsonResponse();
  await handler?.({ method: 'GET', url: `/cgi-bin/cache/body?id=${entry.id}&kind=original` }, originalResponse);
  assert.equal(originalResponse.body.bodyText, '{"ok":true}');
  assert.equal(originalResponse.body.kind, 'original');
});
```

- [ ] **步骤 3：写冲突状态失败测试**

在同一文件增加：

```ts
test('ui server maps cache body update conflicts to 409', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-body-conflict-'));
  const options = { baseDir: root };
  await (await getEngine(options)).clearAll();
  await (await getEngine(options)).record({
    method: 'GET',
    url: 'https://api.example.com/users',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  const [entry] = await (await getEngine(options)).list();
  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createJsonResponse();
  await handler?.(createJsonRequest('/cgi-bin/cache/body', {
    id: entry.id,
    bodyText: '{"ok":false}',
    expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
  }), response);

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, 'CACHE_BODY_CONFLICT');
});
```

- [ ] **步骤 4：运行测试确认失败**

运行： `rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/requestParsers.test.js .tmp/test/test/uiServer/clearAll.test.js`

预期： TypeScript 编译失败，提示 `parseReadBodyQuery` 和读取路由不存在。

- [ ] **步骤 5：新建 HTTP 错误模块**

创建 `src/uiServer/httpError.ts`：

```ts
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('cache entry not found')) {
    return new HttpError(404, 'CACHE_ENTRY_NOT_FOUND', message);
  }
  if (message.includes('cache entry update conflict')) {
    return new HttpError(409, 'CACHE_BODY_CONFLICT', message);
  }
  return new HttpError(500, 'CACHE_BODY_ERROR', message);
}
```

- [ ] **步骤 6：增加查询 parser**

在 `src/uiServer/requestParsers.ts` import 改为：

```ts
import { CacheBodyKind } from '../cache/types';
```

在 `UpdateBodyRequestBody` 后增加：

```ts
export interface ReadBodyQuery {
  id: string;
  kind: CacheBodyKind;
}

export function parseReadBodyQuery(searchParams: URLSearchParams): ReadBodyQuery {
  const kind = searchParams.get('kind') === 'original' ? 'original' : 'active';
  return {
    id: String(searchParams.get('id') || ''),
    kind,
  };
}
```

- [ ] **步骤 7：接入 UI Server 路由和错误映射**

在 `src/uiServer/index.ts` import 中加入：

```ts
  parseReadBodyQuery,
```

并加入：

```ts
import { toHttpError } from './httpError';
```

在 `GET /cgi-bin/cache/export` 之前加入：

```ts
if (method === 'GET' && pathname === '/cgi-bin/cache/body') {
  return sendJson(res, await (await getEngine(options)).readBody(parseReadBodyQuery(url.searchParams)));
}
```

把 catch 块改为：

```ts
    } catch (error) {
      const httpError = toHttpError(error);
      console.error('[whistle.cache] ui error:', error);
      res.statusCode = httpError.statusCode;
      sendJson(res, { error: httpError.message, code: httpError.code });
    }
```

- [ ] **步骤 8：运行测试确认通过**

运行： `rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/requestParsers.test.js .tmp/test/test/uiServer/clearAll.test.js`

预期： 两个测试文件全部通过。

- [ ] **步骤 9：提交**

```bash
rtk git add src/uiServer/httpError.ts src/uiServer/requestParsers.ts src/uiServer/index.ts test/uiServer/requestParsers.test.ts test/uiServer/clearAll.test.ts
rtk git commit -m "feat: add cache body read api"
```

---

### 任务 4：缓存列表显示已修改状态并提供管理入口

**文件：**
- 修改： `public/app.js`
- 修改： `public/styles.css`
- 测试： `test/uiServer/clearAll.test.ts`

- [ ] **步骤 1：写 UI 文案失败测试**

在 `test/uiServer/clearAll.test.ts` 的 `ui status panel presents proxy state as a readable overview` 测试中增加断言：

```ts
  assert.ok(/已修改/.test(app));
  assert.ok(/data-action="manage"/.test(app));
  assert.ok(/openEntryManager/.test(app));
```

- [ ] **步骤 2：运行测试确认失败**

运行： `rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/clearAll.test.js`

预期： 测试失败，提示 app 中没有管理入口文案或函数。

- [ ] **步骤 3：增加状态标记渲染**

在 `public/app.js` 的 URL cell 中，放在 `bodyHint` 后面：

```js
        ${entry.activeBodyKind === 'editable' ? '<small class="modifiedHint">已修改</small>' : ''}
```

在行操作区的 `详情` 按钮后增加：

```js
        <button type="button" data-action="manage" data-id="${escapeHtml(entry.id)}">管理</button>
```

在事件绑定区增加：

```js
    row.querySelector('[data-action="manage"]').addEventListener('click', () => openEntryManager(entry.id));
```

- [ ] **步骤 4：详情区增加 active/original 元信息和入口**

在 `renderEntryDetails(entry)` 返回内容中增加以下 HTML 片段：

```js
    <div>
      <dt>响应体状态</dt>
      <dd>${entry.activeBodyKind === 'editable' ? '已修改响应' : '原始响应'}</dd>
    </div>
    <div>
      <dt>Active Body</dt>
      <dd>${escapeHtml(shortHash(entry.activeBodyHash || entry.bodyHash))} · ${formatBytes(entry.activeBodySize || entry.bodySize || 0)}</dd>
    </div>
    <div>
      <dt>Original Body</dt>
      <dd>${escapeHtml(shortHash(entry.originalBodyHash || entry.bodyHash))} · ${formatBytes(entry.originalBodySize || entry.bodySize || 0)}</dd>
    </div>
    <div>
      <dt>响应数据</dt>
      <dd><button type="button" data-action="manage" data-id="${escapeHtml(entry.id)}">在缓存管理中打开</button></dd>
    </div>
```

如果详情区通过字符串渲染后没有绑定按钮事件，在 `renderEntries()` 添加详情行之后增加：

```js
      detailRow.querySelector('[data-action="manage"]').addEventListener('click', () => openEntryManager(entry.id));
```

- [ ] **步骤 5：增加临时跳转函数**

在 `renderEntries` 后增加，Task 5 会补齐真实 Tab：

```js
function openEntryManager(entryId) {
  state.managerSelectedId = entryId;
  showToast('缓存管理即将打开该缓存。');
}
```

- [ ] **步骤 6：增加样式**

在 `public/styles.css` 的 `.badge` 样式附近增加：

```css
.modifiedHint {
  display: inline-flex;
  width: max-content;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  padding: 4px 7px;
  font-size: 12px;
  line-height: 1;
}
```

- [ ] **步骤 7：运行测试确认通过**

运行： `rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/clearAll.test.js`

预期： `clearAll.test.js` 全部通过。

- [ ] **步骤 8：提交**

```bash
rtk git add public/app.js public/styles.css test/uiServer/clearAll.test.ts
rtk git commit -m "feat: mark edited cache entries"
```

---

### 任务 5：新增缓存管理 Tab 和 body 编辑闭环

**文件：**
- 修改： `public/index.html`
- 修改： `public/app.js`
- 修改： `public/styles.css`
- 测试： `test/uiServer/clearAll.test.ts`

- [ ] **步骤 1：写静态结构失败测试**

在 `test/uiServer/clearAll.test.ts` 的 UI 静态测试增加：

```ts
  assert.ok(/id="cacheListView"/.test(html));
  assert.ok(/id="requestManagerView"/.test(html));
  assert.ok(/id="managerBodyEditor"/.test(html));
  assert.ok(/renderRequestManager/.test(app));
  assert.ok(/saveManagedBody/.test(app));
  assert.ok(/restoreManagedBody/.test(app));
```

- [ ] **步骤 2：运行测试确认失败**

运行： `rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/clearAll.test.js`

预期： 测试失败，提示 HTML/JS 中缺少缓存管理结构。

- [ ] **步骤 3：调整 HTML 主工作区**

把当前缓存列表 panel 中 `<h2>缓存列表</h2>` 所在 header 改成：

```html
<div class="panelHeader mainWorkspaceHeader">
  <div>
    <h2>缓存数据</h2>
    <div class="workspaceTabs" role="tablist" aria-label="缓存工作区">
      <button id="cacheListTab" class="active" type="button" role="tab" aria-selected="true">缓存列表</button>
      <button id="requestManagerTab" type="button" role="tab" aria-selected="false">缓存管理</button>
    </div>
  </div>
  <span id="loadingText" class="loadingText" hidden>正在刷新缓存数据...</span>
  <div class="tableActions">
    <button id="exportCacheBtn" type="button">导出</button>
    <button id="importCacheBtn" type="button">导入</button>
    <input id="importCacheInput" type="file" accept="application/json,.json" hidden>
    <button id="clearE2eBtn" type="button">清理测试缓存</button>
    <button id="deleteSelectedBtn" class="danger" type="button" disabled>删除选中</button>
    <select id="ttlSelectedSelect" aria-label="批量 TTL 操作" disabled>
      <option value="">TTL</option>
      <option value="extend-30m">延长 30 分钟</option>
      <option value="never-expire">固定不过期</option>
      <option value="default-ttl">恢复默认 TTL</option>
      <option value="expire-now">立即设为过期</option>
    </select>
    <input id="searchInput" type="search" placeholder="搜索 URL / 类型 / Method">
    <select id="filterSelect" aria-label="缓存过滤">
      <option value="all">全部</option>
      <option value="fresh">可回放</option>
      <option value="expired">已过期</option>
      <option value="hit">有命中</option>
    </select>
  </div>
</div>
```

用一个容器包住现有 empty 和 table：

```html
<div id="cacheListView">
  <div id="empty" class="empty">
    <strong>暂无匹配缓存</strong>
    <ol>
      <li>复制录制规则并粘贴到 Whistle Rules。</li>
      <li>让目标接口流量经过 Whistle。</li>
      <li>回到这里刷新缓存列表。</li>
    </ol>
  </div>
  <div class="tableWrap">
    <table id="cacheTable" hidden>
      <thead>
        <tr>
          <th>选择</th>
          <th>Method</th>
          <th>URL</th>
          <th>状态</th>
          <th>大小</th>
          <th>命中</th>
          <th>最近命中</th>
          <th>创建</th>
          <th>过期</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody id="cacheRows"></tbody>
    </table>
  </div>
</div>
```

在 `cacheListView` 后增加：

```html
<div id="requestManagerView" class="requestManager" hidden>
  <div class="managerToolbar">
    <input id="managerSearchInput" type="search" placeholder="搜索 Method / URL / Content-Type">
    <select id="managerMethodSelect" aria-label="缓存管理 Method 过滤">
      <option value="all">全部 Method</option>
      <option value="GET">GET</option>
      <option value="POST">POST</option>
    </select>
    <label class="checkFilter"><input id="managerModifiedOnly" type="checkbox"> 已修改</label>
    <label class="checkFilter"><input id="managerEditableOnly" type="checkbox"> 仅可编辑</label>
    <button id="managerPrevBtn" type="button">上一条</button>
    <button id="managerNextBtn" type="button">下一条</button>
  </div>
  <div class="managerLayout">
    <div id="managerRequestList" class="managerRequestList"></div>
    <div class="managerDetail">
      <div id="managerEntryInfo" class="managerEntryInfo"></div>
      <div class="managerBodyHeader">
        <div class="segmented" role="group" aria-label="响应体视图">
          <button id="managerPreviewModeBtn" class="active" type="button">预览</button>
          <button id="managerEditModeBtn" type="button">编辑</button>
          <button id="managerOriginalModeBtn" type="button">原始</button>
        </div>
        <div class="inlineActions">
          <button id="managerFormatJsonBtn" type="button">格式化 JSON</button>
          <button id="managerSaveBtn" type="button">保存修改</button>
          <button id="managerRestoreBtn" class="danger" type="button">恢复原始</button>
        </div>
      </div>
      <textarea id="managerBodyEditor" spellcheck="false"></textarea>
      <pre id="managerBodyPreview" class="bodyPreview"></pre>
      <div id="managerBodyNotice" class="hint"></div>
    </div>
  </div>
</div>
```

- [ ] **步骤 4：初始化前端状态和元素**

在 `state` 中增加：

```js
  workspaceTab: 'list',
  managerSelectedId: undefined,
  managerBody: undefined,
  managerOriginalBody: undefined,
  managerMode: 'preview',
  managerDraft: '',
  managerDirty: false,
  managerFilters: {
    search: '',
    method: 'all',
    modifiedOnly: false,
    editableOnly: false,
  },
```

在 `elements` 中增加：

```js
  cacheListTab: document.querySelector('#cacheListTab'),
  requestManagerTab: document.querySelector('#requestManagerTab'),
  cacheListView: document.querySelector('#cacheListView'),
  requestManagerView: document.querySelector('#requestManagerView'),
  managerSearchInput: document.querySelector('#managerSearchInput'),
  managerMethodSelect: document.querySelector('#managerMethodSelect'),
  managerModifiedOnly: document.querySelector('#managerModifiedOnly'),
  managerEditableOnly: document.querySelector('#managerEditableOnly'),
  managerPrevBtn: document.querySelector('#managerPrevBtn'),
  managerNextBtn: document.querySelector('#managerNextBtn'),
  managerRequestList: document.querySelector('#managerRequestList'),
  managerEntryInfo: document.querySelector('#managerEntryInfo'),
  managerPreviewModeBtn: document.querySelector('#managerPreviewModeBtn'),
  managerEditModeBtn: document.querySelector('#managerEditModeBtn'),
  managerOriginalModeBtn: document.querySelector('#managerOriginalModeBtn'),
  managerFormatJsonBtn: document.querySelector('#managerFormatJsonBtn'),
  managerSaveBtn: document.querySelector('#managerSaveBtn'),
  managerRestoreBtn: document.querySelector('#managerRestoreBtn'),
  managerBodyEditor: document.querySelector('#managerBodyEditor'),
  managerBodyPreview: document.querySelector('#managerBodyPreview'),
  managerBodyNotice: document.querySelector('#managerBodyNotice'),
```

- [ ] **步骤 5：绑定缓存管理事件**

在现有事件绑定区增加：

```js
elements.cacheListTab.addEventListener('click', () => switchWorkspaceTab('list'));
elements.requestManagerTab.addEventListener('click', () => switchWorkspaceTab('manager'));
elements.managerSearchInput.addEventListener('input', () => {
  state.managerFilters.search = elements.managerSearchInput.value;
  renderRequestManager();
});
elements.managerMethodSelect.addEventListener('change', () => {
  state.managerFilters.method = elements.managerMethodSelect.value;
  renderRequestManager();
});
elements.managerModifiedOnly.addEventListener('change', () => {
  state.managerFilters.modifiedOnly = elements.managerModifiedOnly.checked;
  renderRequestManager();
});
elements.managerEditableOnly.addEventListener('change', () => {
  state.managerFilters.editableOnly = elements.managerEditableOnly.checked;
  renderRequestManager();
});
elements.managerPrevBtn.addEventListener('click', () => selectAdjacentManagedEntry(-1));
elements.managerNextBtn.addEventListener('click', () => selectAdjacentManagedEntry(1));
elements.managerPreviewModeBtn.addEventListener('click', () => setManagerMode('preview'));
elements.managerEditModeBtn.addEventListener('click', () => setManagerMode('edit'));
elements.managerOriginalModeBtn.addEventListener('click', () => setManagerMode('original'));
elements.managerFormatJsonBtn.addEventListener('click', formatManagedJson);
elements.managerSaveBtn.addEventListener('click', saveManagedBody);
elements.managerRestoreBtn.addEventListener('click', restoreManagedBody);
elements.managerBodyEditor.addEventListener('input', () => {
  state.managerDraft = elements.managerBodyEditor.value;
  state.managerDirty = state.managerBody && state.managerDraft !== state.managerBody.bodyText;
  renderManagerActions();
});
window.addEventListener('beforeunload', (event) => {
  if (!state.managerDirty) return;
  event.preventDefault();
  event.returnValue = '';
});
```

- [ ] **步骤 6：增加 Tab 和选择逻辑**

在 `renderEntries` 后增加：

```js
async function switchWorkspaceTab(tab) {
  if (tab === state.workspaceTab) return;
  if (!(await confirmDiscardManagedChanges())) return;
  state.workspaceTab = tab;
  elements.cacheListTab.classList.toggle('active', tab === 'list');
  elements.cacheListTab.setAttribute('aria-selected', String(tab === 'list'));
  elements.requestManagerTab.classList.toggle('active', tab === 'manager');
  elements.requestManagerTab.setAttribute('aria-selected', String(tab === 'manager'));
  elements.cacheListView.hidden = tab !== 'list';
  elements.requestManagerView.hidden = tab !== 'manager';
  if (tab === 'manager') {
    if (!state.managerSelectedId && state.entries[0]) state.managerSelectedId = state.entries[0].id;
    await loadManagedBody(state.managerSelectedId);
  }
}

async function openEntryManager(entryId) {
  if (!(await confirmDiscardManagedChanges())) return;
  state.managerSelectedId = entryId;
  await switchWorkspaceTab('manager');
  await loadManagedBody(entryId);
}

async function confirmDiscardManagedChanges() {
  if (!state.managerDirty) return true;
  return confirm('当前响应体有未保存修改，确定丢弃并继续吗？');
}
```

- [ ] **步骤 7：增加请求列表渲染**

在 `openEntryManager` 后增加：

```js
function getManagerEntries() {
  const search = state.managerFilters.search.trim().toLowerCase();
  return state.entries.filter((entry) => {
    if (state.managerFilters.method !== 'all' && entry.method !== state.managerFilters.method) return false;
    if (state.managerFilters.modifiedOnly && entry.activeBodyKind !== 'editable') return false;
    if (state.managerFilters.editableOnly && !isEditableEntry(entry)) return false;
    if (!search) return true;
    return [entry.method, entry.url, entry.contentType].join(' ').toLowerCase().includes(search);
  });
}

function renderRequestManager() {
  const entries = getManagerEntries();
  elements.managerRequestList.innerHTML = entries.length ? entries.map((entry) => {
    const parsed = parseUrl(entry.url);
    const selected = entry.id === state.managerSelectedId;
    return `
      <button type="button" class="managerRequestItem ${selected ? 'active' : ''}" data-id="${escapeHtml(entry.id)}">
        <strong>${escapeHtml(entry.method)} ${escapeHtml(parsed.host)}</strong>
        <span>${escapeHtml(parsed.path)}</span>
        <small>${escapeHtml(entry.contentType || '-')} · ${formatBytes(entry.bodySize || 0)}</small>
        <span class="managerBadges">
          ${entry.activeBodyKind === 'editable' ? '<em>已修改</em>' : '<em>原始</em>'}
          ${new Date(entry.expiresAt).getTime() <= Date.now() ? '<em>已过期</em>' : ''}
          ${entry.enabled ? '' : '<em>已禁用</em>'}
        </span>
      </button>
    `;
  }).join('') : '<div class="empty compact">没有符合条件的缓存请求。</div>';

  for (const item of elements.managerRequestList.querySelectorAll('[data-id]')) {
    item.addEventListener('click', () => selectManagedEntry(item.dataset.id));
  }
  renderManagedEntryInfo();
  renderManagerActions();
}

function isEditableEntry(entry) {
  const type = String(entry.contentType || '').toLowerCase().split(';')[0].trim();
  return type === 'application/json' || type.endsWith('+json') || type.startsWith('text/') ||
    type === 'application/javascript' || type === 'application/xml' || type === 'application/x-www-form-urlencoded';
}
```

- [ ] **步骤 8：增加读取和模式渲染**

继续增加：

```js
async function selectManagedEntry(entryId) {
  if (!(await confirmDiscardManagedChanges())) return;
  state.managerSelectedId = entryId;
  await loadManagedBody(entryId);
}

async function loadManagedBody(entryId, kind = 'active') {
  if (!entryId) {
    state.managerBody = undefined;
    state.managerOriginalBody = undefined;
    state.managerDraft = '';
    state.managerDirty = false;
    renderRequestManager();
    renderManagedBody();
    return;
  }
  try {
    hideError();
    const payload = await requestJson(`cgi-bin/cache/body?id=${encodeURIComponent(entryId)}&kind=${kind}`);
    state.managerBody = kind === 'active' ? payload : state.managerBody;
    state.managerOriginalBody = kind === 'original' ? payload : state.managerOriginalBody;
    if (kind === 'active') {
      state.managerDraft = payload.bodyText || '';
      state.managerDirty = false;
    }
    renderRequestManager();
    renderManagedBody();
  } catch (error) {
    showError(error);
  }
}

async function setManagerMode(mode) {
  state.managerMode = mode;
  if (mode === 'original' && state.managerSelectedId && !state.managerOriginalBody) {
    await loadManagedBody(state.managerSelectedId, 'original');
  }
  renderManagedBody();
}

function renderManagedBody() {
  const active = state.managerBody;
  const original = state.managerOriginalBody;
  const payload = state.managerMode === 'original' ? original : active;
  elements.managerPreviewModeBtn.classList.toggle('active', state.managerMode === 'preview');
  elements.managerEditModeBtn.classList.toggle('active', state.managerMode === 'edit');
  elements.managerOriginalModeBtn.classList.toggle('active', state.managerMode === 'original');
  elements.managerBodyEditor.hidden = state.managerMode !== 'edit';
  elements.managerBodyPreview.hidden = state.managerMode === 'edit';

  if (!payload) {
    elements.managerBodyEditor.value = '';
    elements.managerBodyPreview.textContent = '请选择一条缓存请求。';
    elements.managerBodyNotice.textContent = '';
    renderManagerActions();
    return;
  }

  const text = payload.encoding === 'utf8' ? (state.managerMode === 'edit' ? state.managerDraft : payload.bodyText) : payload.bodyBase64;
  elements.managerBodyEditor.value = state.managerDraft;
  elements.managerBodyPreview.textContent = text || '';
  elements.managerBodyNotice.textContent = payload.editable
    ? `${payload.kind === 'original' ? '原始响应只读' : '当前响应'} · ${formatBytes(payload.size || 0)} · ${shortHash(payload.hash || '')}`
    : '当前响应无法安全按 UTF-8 文本编辑，已显示 base64 内容。';
  renderManagerActions();
}
```

- [ ] **步骤 9：增加保存、恢复、格式化和导航**

继续增加：

```js
function renderManagedEntryInfo() {
  const entry = state.entries.find((item) => item.id === state.managerSelectedId);
  if (!entry) {
    elements.managerEntryInfo.innerHTML = '<div class="empty compact">请选择一条缓存请求。</div>';
    return;
  }
  const expiry = getExpiryState(entry);
  elements.managerEntryInfo.innerHTML = `
    <dl class="detailGrid">
      <div><dt>Method</dt><dd>${escapeHtml(entry.method)}</dd></div>
      <div><dt>URL</dt><dd>${escapeHtml(entry.url)}</dd></div>
      <div><dt>状态码</dt><dd>${escapeHtml(String(entry.statusCode))}</dd></div>
      <div><dt>Content-Type</dt><dd>${escapeHtml(entry.contentType || '-')}</dd></div>
      <div><dt>回放状态</dt><dd>${entry.enabled ? escapeHtml(expiry.label) : '已禁用'}</dd></div>
      <div><dt>响应体状态</dt><dd>${entry.activeBodyKind === 'editable' ? '已修改响应' : '原始响应'}</dd></div>
    </dl>
  `;
}

function renderManagerActions() {
  const active = state.managerBody;
  elements.managerSaveBtn.disabled = !active || !active.editable || !state.managerDirty;
  elements.managerFormatJsonBtn.disabled = !active || !active.editable || state.managerMode !== 'edit';
  elements.managerRestoreBtn.disabled = !active || active.entry.activeBodyKind !== 'editable';
  const entries = getManagerEntries();
  const index = entries.findIndex((entry) => entry.id === state.managerSelectedId);
  elements.managerPrevBtn.disabled = index <= 0;
  elements.managerNextBtn.disabled = index < 0 || index >= entries.length - 1;
}

function formatManagedJson() {
  try {
    state.managerDraft = JSON.stringify(JSON.parse(elements.managerBodyEditor.value), null, 2);
    elements.managerBodyEditor.value = state.managerDraft;
    state.managerDirty = state.managerBody && state.managerDraft !== state.managerBody.bodyText;
    renderManagerActions();
  } catch {
    showToast('JSON 格式错误，无法格式化。');
  }
}

async function saveManagedBody() {
  if (!state.managerBody || !state.managerBody.editable) return;
  try {
    hideError();
    const data = await requestJson('cgi-bin/cache/body', {
      method: 'POST',
      body: JSON.stringify({
        id: state.managerBody.entry.id,
        bodyText: state.managerDraft,
        expectedUpdatedAt: state.managerBody.updatedAt,
      }),
    });
    state.entries = state.entries.map((entry) => entry.id === data.entry.id ? data.entry : entry);
    state.managerDirty = false;
    showToast('响应体修改已保存。');
    await loadManagedBody(data.entry.id, 'active');
    renderEntries();
  } catch (error) {
    showError(error);
  }
}

async function restoreManagedBody() {
  if (!state.managerBody || !confirm('确定恢复为原始录制响应吗？')) return;
  try {
    hideError();
    const data = await requestJson('cgi-bin/cache/body/restore-original', {
      method: 'POST',
      body: JSON.stringify({ id: state.managerBody.entry.id }),
    });
    state.entries = state.entries.map((entry) => entry.id === data.entry.id ? data.entry : entry);
    state.managerOriginalBody = undefined;
    state.managerDirty = false;
    showToast('已恢复原始响应。');
    await loadManagedBody(data.entry.id, 'active');
    renderEntries();
  } catch (error) {
    showError(error);
  }
}

async function selectAdjacentManagedEntry(offset) {
  const entries = getManagerEntries();
  const index = entries.findIndex((entry) => entry.id === state.managerSelectedId);
  const next = entries[index + offset];
  if (next) await selectManagedEntry(next.id);
}
```

- [ ] **步骤 10：在 state 刷新后同步缓存管理**

在 `applyState` 的 `renderEntries();` 后增加：

```js
  if (state.workspaceTab === 'manager') renderRequestManager();
```

- [ ] **步骤 11：增加 CSS**

在 `public/styles.css` 末尾增加：

```css
.mainWorkspaceHeader {
  align-items: flex-start;
}

.workspaceTabs {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.workspaceTabs button.active {
  background: #20242a;
  border-color: #20242a;
  color: #ffffff;
}

.requestManager {
  display: grid;
  gap: 12px;
}

.managerToolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 140px auto auto auto auto;
  gap: 8px;
  align-items: center;
}

.checkFilter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #475467;
  font-size: 13px;
  white-space: nowrap;
}

.checkFilter input {
  width: auto;
}

.managerLayout {
  display: grid;
  grid-template-columns: minmax(260px, 0.38fr) minmax(0, 1fr);
  gap: 12px;
  min-height: 560px;
}

.managerRequestList {
  overflow: auto;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  background: #f8fafc;
  padding: 8px;
}

.managerRequestItem {
  display: grid;
  width: 100%;
  gap: 5px;
  min-height: 88px;
  margin-bottom: 8px;
  padding: 10px;
  text-align: left;
  white-space: normal;
}

.managerRequestItem.active {
  border-color: #2563eb;
  background: #eff6ff;
}

.managerRequestItem span,
.managerRequestItem small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.managerBadges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.managerBadges em {
  border-radius: 999px;
  background: #eef2f6;
  color: #475467;
  padding: 3px 6px;
  font-style: normal;
  font-size: 11px;
}

.managerDetail {
  display: grid;
  grid-template-rows: auto auto minmax(300px, 1fr) auto;
  gap: 10px;
  min-width: 0;
}

.managerBodyHeader {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

#managerBodyEditor,
.bodyPreview {
  min-height: 360px;
  border: 1px solid #c8d0da;
  border-radius: 8px;
  background: #0f172a;
  color: #e5e7eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  padding: 12px;
  overflow: auto;
}

.bodyPreview {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 960px) {
  .managerToolbar,
  .managerLayout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **步骤 12：运行测试确认通过**

运行： `rtk npm run build:test && rtk node --test --test-concurrency=1 .tmp/test/test/uiServer/clearAll.test.js`

预期： `clearAll.test.js` 全部通过。

- [ ] **步骤 13：提交**

```bash
rtk git add public/index.html public/app.js public/styles.css test/uiServer/clearAll.test.ts
rtk git commit -m "feat: add cache request manager"
```

---

### 任务 6：全量回归和人工验证

**文件：**
- 修改： none

- [ ] **步骤 1：运行全量测试**

运行： `rtk npm test`

预期： 全部 `node:test` 用例 PASS。

- [ ] **步骤 2：运行 TypeScript 构建**

运行： `rtk npm run build`

预期： `dist/` 构建成功，无 TypeScript 错误。

- [ ] **步骤 3：人工验证缓存管理主流程**

启动插件或通过现有 Whistle 调试环境打开面板后验证：

```txt
1. 录制一条 application/json 响应。
2. 打开缓存列表，确认该条没有“已修改”标记。
3. 点击“管理”，确认切到“缓存管理”并选中该请求。
4. 在“预览”看到 active body。
5. 切到“编辑”，修改 JSON，点击“保存修改”。
6. 确认左侧列表和缓存列表都显示“已修改”。
7. 回放同一请求，确认返回修改后的 body。
8. 切到“原始”，确认看到录制时 body。
9. 点击“恢复原始”，确认“已修改”标记消失。
10. 再次回放同一请求，确认返回原始 body。
```

- [ ] **步骤 4：人工验证边界状态**

```txt
1. 禁用一条缓存后进入缓存管理，保存 body 后确认仍保持禁用。
2. 把一条缓存设为过期后进入缓存管理，保存 body 后确认仍保持过期。
3. 录制 application/octet-stream 响应，确认缓存管理显示 base64 且保存按钮不可用。
4. 编辑 JSON 时输入非法 JSON，点击“格式化 JSON”，确认只提示错误且不丢失编辑内容。
5. 编辑未保存内容后切换请求，确认浏览器提示是否丢弃。
```

- [ ] **步骤 5：检查工作树**

运行： `rtk git status --short`

预期： 只出现本计划相关变更，且没有临时构建产物进入待提交状态。

---

## 自检

- Spec 覆盖：本计划覆盖读取 active/original body、保存 editable body、恢复 original body、已修改标记、缓存管理 Tab、JSON 格式化、非文本只读、过期/禁用状态保持、冲突错误、回归验证。
- 占位扫描：计划中没有空白占位、延后补充或让实现者猜测的步骤；每个代码步骤都给出具体插入或替换内容。
- 类型一致性：`CacheBodyKind`、`ReadBodyInput`、`ReadBodyResult`、`parseReadBodyQuery`、`readBody(entry, kind)`、`openEntryManager`、`renderRequestManager`、`saveManagedBody`、`restoreManagedBody` 在前后任务中命名一致。
