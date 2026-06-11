import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import setupUiServer, { resolvePublicDir } from '../../src/uiServer';
import { getEngine, getRecentEvents, recordEvent, clearRecentEvents } from '../../src/shared/state';

test('ui status panel presents proxy state as a readable overview', async () => {
  const html = await readFile(join(__dirname, '../../../..', 'public/index.html'), 'utf8');
  const app = await readFile(join(__dirname, '../../../..', 'public/app.js'), 'utf8');
  const styles = await readFile(join(__dirname, '../../../..', 'public/styles.css'), 'utf8');

  assert.ok(/<h2>状态总览<\/h2>/.test(html));
  assert.ok(/id="statusOverview"/.test(html));
  assert.ok(/当前处理/.test(app));
  assert.ok(/缓存边界/.test(app));
  assert.ok(/数据目录/.test(app));
  assert.ok(/录制与回放都已开启/.test(app));
  assert.ok(/已修改/.test(app));
  assert.ok(/data-action="manage"/.test(app));
  assert.ok(/openEntryManager/.test(app));
  assert.ok(/id="cacheListView"/.test(html));
  assert.ok(/id="requestManagerView"/.test(html));
  assert.ok(/缓存管理/.test(html));
  assert.ok(!/请求管理/.test(html));
  assert.ok(/在缓存管理中打开/.test(app));
  assert.ok(/缓存管理 Method 过滤/.test(html));
  assert.ok(/id="managerBodyEditor"/.test(html));
  assert.ok(/id="managerJsonEditor"/.test(html));
  assert.ok(/vendor\/vanilla-jsoneditor\/standalone\.js/.test(html));
  assert.ok(/renderRequestManager/.test(app));
  assert.ok(/saveManagedBody/.test(app));
  assert.ok(/restoreManagedBody/.test(app));
  assert.ok(/reconcileManagedSelection/.test(app));
  assert.ok(/clearManagedSelection/.test(app));
  assert.ok(/!hasEntry\(entryId\)/.test(app));
  assert.ok(/getFormattedBodyText/.test(app));
  assert.ok(/getEditableDraft/.test(app));
  assert.ok(/managerSavedDraft/.test(app));
  assert.ok(/initManagedJsonEditor/.test(app));
  assert.ok(/createJSONEditor/.test(html));
  assert.ok(/onRenderContextMenu/.test(app));
  assert.ok(/copyManagedJsonSubtree/.test(app));
  assert.ok(/copyManagedJsonPath/.test(app));
  assert.ok(/managerShell/.test(html));
  assert.ok(/managerListHeader/.test(html));
  assert.ok(/managerEditorPanel/.test(html));
  assert.ok(/managerRequestSummary/.test(app));
  assert.ok(/没有符合条件的缓存/.test(app));
  assert.ok(/jsonEditorHost/.test(styles));
  assert.ok(/\.managerShell/.test(styles));
  assert.ok(/\.managerListPanel/.test(styles));
  assert.ok(/\.managerEditorPanel/.test(styles));
  assert.ok(/\.jsonEditorHost\s*\{[^}]*--jse-theme-color/s.test(styles));
  assert.ok(/button:disabled\s*\{[^}]*cursor: default/s.test(styles));
});

test('ui server resolves public assets from the runtime dist layout', () => {
  assert.equal(resolvePublicDir(join(__dirname, '../../../..', 'dist/uiServer')), join(__dirname, '../../../..', 'public'));
});

test('ui server clears all cache entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-clear-all-'));
  const options = { baseDir: root };
  await (await getEngine(options)).record({
    method: 'GET',
    url: 'https://api.example.com/users',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createJsonResponse();
  await handler?.({ method: 'POST', url: '/cgi-bin/cache/clear-all' }, response);

  assert.deepEqual(response.body, { removed: 1 });
  assert.equal((await (await getEngine(options)).list()).length, 0);
});

test('ui server accepts plugin-prefixed cgi paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-prefixed-'));
  const options = { baseDir: root };
  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createJsonResponse();
  await handler?.({ method: 'GET', url: '/whistle.api-cache/cgi-bin/events?after=0' }, response);

  assert.deepEqual(response.body, { events: [] });
});

test('ui server clears recent diagnostic events', async () => {
  clearRecentEvents();
  recordEvent({
    type: 'MISS',
    method: 'GET',
    url: 'https://api.example.com/users',
  });

  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-clear-events-'));
  const options = { baseDir: root };
  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createJsonResponse();
  await handler?.({ method: 'POST', url: '/whistle.api-cache/cgi-bin/events/clear' }, response);

  assert.deepEqual(response.body, { removed: 1 });
  assert.deepEqual(getRecentEvents(), []);
  clearRecentEvents();
});

test('ui server returns an empty favicon response without throwing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-favicon-'));
  const options = { baseDir: root };
  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createEmptyResponse();
  await handler?.({ method: 'GET', url: '/whistle.api-cache/favicon.ico' }, response);

  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
});

test('ui server tests cache matches from request input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-match-'));
  const options = { baseDir: root };
  await (await getEngine(options)).record({
    method: 'POST',
    url: 'https://api.example.com/search?_t=1',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"alpha"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"alpha"}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createJsonResponse();
  await handler?.(createJsonRequest('/cgi-bin/cache/match', {
    method: 'POST',
    url: 'https://api.example.com/search?_t=2',
    requestBody: '{"keyword":"alpha"}',
  }), response);

  const body = response.body as { hit: boolean; reason: string; entry: { url: string } };
  assert.equal(body.hit, true);
  assert.equal(body.reason, 'HIT');
  assert.equal(body.entry.url, 'https://api.example.com/search?_t=1');
});

test('ui server preserves empty POST body when testing cache matches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-empty-body-match-'));
  const options = { baseDir: root };
  await (await getEngine(options)).record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from(''),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"empty"}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createJsonResponse();
  await handler?.(createJsonRequest('/cgi-bin/cache/match', {
    method: 'POST',
    url: 'https://api.example.com/search',
    requestBody: '',
  }), response);

  const body = response.body as { hit: boolean; reason: string };
  assert.equal(body.hit, true);
  assert.equal(body.reason, 'HIT');
});

test('ui server deletes cache entries by batch scope', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-delete-batch-'));
  const options = { baseDir: root };
  await (await getEngine(options)).clearAll();
  await (await getEngine(options)).record({
    method: 'GET',
    url: 'https://api.example.com/users/1',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"id":1}'),
  });
  await (await getEngine(options)).record({
    method: 'GET',
    url: 'https://api.example.com/users/2',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"id":2}'),
  });

  const [entry] = await (await getEngine(options)).list();
  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createJsonResponse();
  await handler?.(createJsonRequest('/cgi-bin/cache/delete-batch', {
    scope: 'same-host',
    entryId: entry.id,
  }), response);

  assert.deepEqual(response.body, { removed: 2 });
  assert.equal((await (await getEngine(options)).list()).length, 0);
});

test('ui server toggles cache entry enabled state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-toggle-'));
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
  await handler?.(createJsonRequest('/cgi-bin/cache/enabled', {
    id: entry.id,
    enabled: false,
  }), response);

  assert.deepEqual(response.body, { updated: true });
  assert.equal((await (await getEngine(options)).list())[0].enabled, false);
});

test('ui server updates cache entry TTL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-ttl-'));
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
  await handler?.(createJsonRequest('/cgi-bin/cache/ttl', {
    scope: 'ids',
    ids: [entry.id],
    operation: 'never-expire',
  }), response);

  assert.deepEqual(response.body, { updated: 1 });
  assert.equal((await (await getEngine(options)).list())[0].expiresAt, '9999-12-31T23:59:59.999Z');
});

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
  const activeBody = activeResponse.body as { bodyText: string; kind: string };
  assert.equal(activeBody.bodyText, '{"ok":false}');
  assert.equal(activeBody.kind, 'active');

  const originalResponse = createJsonResponse();
  await handler?.({ method: 'GET', url: `/cgi-bin/cache/body?id=${entry.id}&kind=original` }, originalResponse);
  const originalBody = originalResponse.body as { bodyText: string; kind: string };
  assert.equal(originalBody.bodyText, '{"ok":true}');
  assert.equal(originalBody.kind, 'original');
});

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
  assert.equal((response.body as { code: string }).code, 'CACHE_BODY_CONFLICT');
});

test('ui server exports and imports cache bundles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-import-export-'));
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

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const exportResponse = createJsonResponse();
  await handler?.({ method: 'GET', url: '/cgi-bin/cache/export' }, exportResponse);
  const bundle = exportResponse.body as { version: 1; entries: Array<{ bodyBase64: string }> };
  assert.equal(bundle.version, 1);
  assert.equal(bundle.entries.length, 1);

  await (await getEngine(options)).clearAll();
  const importResponse = createJsonResponse();
  await handler?.(createJsonRequest('/cgi-bin/cache/import', { bundle }), importResponse);

  assert.deepEqual(importResponse.body, { imported: 1 });
  assert.equal((await (await getEngine(options)).list()).length, 1);
});

function createJsonResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    setHeader() {
      return this;
    },
    end(data?: string | Buffer) {
      this.body = data ? JSON.parse(data.toString()) : undefined;
    },
  };
}

function createEmptyResponse() {
  return {
    statusCode: 200,
    ended: false,
    setHeader() {
      return this;
    },
    end() {
      this.ended = true;
    },
  };
}

function createJsonRequest(url: string, body: Record<string, unknown>) {
  const listeners = new Map<string, Function>();
  return {
    method: 'POST',
    url,
    on(event: string, listener: Function) {
      listeners.set(event, listener);
      if (event === 'end') {
        queueMicrotask(() => {
          listeners.get('data')?.(Buffer.from(JSON.stringify(body)));
          listener();
        });
      }
      return this;
    },
  };
}
