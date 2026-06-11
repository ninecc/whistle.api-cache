import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CacheEngine } from '../../src/cache/engine';
import { FileCacheStore } from '../../src/cache/store';
import { CacheProfile } from '../../src/cache/types';

const profile: CacheProfile = {
  id: 'default',
  recordEnabled: true,
  replayEnabled: true,
  ttlSeconds: 1800,
  ignoredQueryNames: ['_t'],
  maxBodySize: 1024 * 1024,
  cacheableContentTypes: ['application/json', 'text/'],
};

test('records cacheable responses and replays them by key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  const recorded = await engine.record({
    method: 'GET',
    url: 'https://api.example.com/users?_t=9',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"users":[]}'),
  });

  assert.equal(recorded.stored, true);

  const replay = await engine.replay({
    method: 'GET',
    url: 'https://api.example.com/users?_t=10',
  });

  assert.equal(replay.hit, true);
  if (replay.hit) {
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.body.toString(), '{"users":[]}');
    assert.equal(replay.headers['x-whistle-cache'], 'HIT');
  }
});

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
    body: Buffer.from(new Uint8Array([0, 1, 2, 3])),
  });

  const [entry] = await engine.list();
  const payload = await engine.readBody({ id: entry.id, kind: 'active' });

  assert.equal(payload.editable, false);
  assert.equal(payload.encoding, 'base64');
  assert.equal(payload.bodyText, '');
  assert.equal(payload.bodyBase64, Buffer.from(new Uint8Array([0, 1, 2, 3])).toString('base64'));
});

test('normalizes lowercase methods for engine replay matching', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-lowercase-method-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  await engine.record({
    method: 'post',
    url: 'https://api.example.com/login',
    requestHeaders: {},
    requestBody: Buffer.from('user=alpha&pwd=1'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  const replay = await engine.replay({
    method: 'post',
    url: 'https://api.example.com/login',
    requestBody: Buffer.from('user=alpha&pwd=1'),
  });

  assert.equal(replay.hit, true);
});

test('bypasses unsafe responses and misses absent cache entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-bypass-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  const recorded = await engine.record({
    method: 'PUT',
    url: 'https://api.example.com/users',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  assert.equal(recorded.stored, false);
  assert.equal((await engine.replay({ method: 'GET', url: 'https://api.example.com/users' })).hit, false);
});

test('records and replays POST responses by request body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-post-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"alpha"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"alpha"}'),
  });
  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"beta"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"beta"}'),
  });

  const alphaReplay = await engine.replay({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestBody: Buffer.from('{"keyword":"alpha"}'),
  });
  const missingReplay = await engine.replay({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestBody: Buffer.from('{"keyword":"gamma"}'),
  });

  assert.equal(alphaReplay.hit, true);
  if (alphaReplay.hit) {
    assert.equal(alphaReplay.body.toString(), '{"result":"alpha"}');
  }
  assert.equal(missingReplay.hit, false);
});

test('distinguishes empty POST body from unavailable request body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-empty-post-body-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from(''),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"empty"}'),
  });
  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"alpha"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"alpha"}'),
  });

  const emptyReplay = await engine.replay({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestBody: Buffer.from(''),
  });
  const unavailableReplay = await engine.replay({
    method: 'POST',
    url: 'https://api.example.com/search',
  });
  const match = await engine.match({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestBody: Buffer.from(''),
  });

  assert.equal(emptyReplay.hit, true);
  if (emptyReplay.hit) {
    assert.equal(emptyReplay.body.toString(), '{"result":"empty"}');
  }
  assert.equal(unavailableReplay.hit, false);
  assert.equal(match.hit, true);
  assert.equal(match.entry?.requestBodyHash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('replays single body-bound POST variant when ignored query changes and request body is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-post-fallback-'));
  const engine = new CacheEngine(new FileCacheStore(root), {
    ...profile,
    ignoredQueryNames: ['wsgsig'],
  });

  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search?wsgsig=first',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"alpha"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"alpha"}'),
  });

  const replay = await engine.replay({
    method: 'POST',
    url: 'https://api.example.com/search?wsgsig=second',
  });

  assert.equal(replay.hit, true);
  if (replay.hit) {
    assert.equal(replay.body.toString(), '{"result":"alpha"}');
  }
});

test('misses same-url body-bound POST when request body is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-post-same-url-unavailable-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"alpha"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"alpha"}'),
  });

  const replay = await engine.replay({
    method: 'POST',
    url: 'https://api.example.com/search',
  });

  assert.equal(replay.hit, false);
});

test('replays POST entry without request body hash when request body is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-post-no-body-fallback-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"no-body"}'),
  });

  const replay = await engine.replay({
    method: 'POST',
    url: 'https://api.example.com/search',
  });

  assert.equal(replay.hit, true);
  if (replay.hit) {
    assert.equal(replay.body.toString(), '{"result":"no-body"}');
  }
});

test('misses ambiguous POST entries when request body is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-post-ambiguous-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"alpha"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"alpha"}'),
  });
  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"beta"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"beta"}'),
  });

  const replay = await engine.replay({
    method: 'POST',
    url: 'https://api.example.com/search',
  });

  assert.equal(replay.hit, false);
});

test('replays entries when ignored query names change between requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-ignore-query-'));
  const engine = new CacheEngine(new FileCacheStore(root), {
    ...profile,
    ignoredQueryNames: ['wsgsig'],
  });

  await engine.record({
    method: 'GET',
    url: 'https://api.example.com/users?wsgsig=first&page=1',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  const replay = await engine.replay({
    method: 'GET',
    url: 'https://api.example.com/users?wsgsig=second&page=1',
  });

  assert.equal(replay.hit, true);
});

test('default profile ignores signed ticket query names for replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-default-signed-query-'));
  const { defaultProfile } = await import('../../src/shared/state');
  const engine = new CacheEngine(new FileCacheStore(root), defaultProfile);

  await engine.record({
    method: 'POST',
    url: 'https://energy.example.com/station-api/user/homePageExtInfo?source=1&ttid=driver&ticket=record-ticket&wsgsig=record-signature',
    requestHeaders: {},
    requestBody: Buffer.from('{"source":"1","token":"same-token"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  const replay = await engine.replay({
    method: 'POST',
    url: 'https://energy.example.com/station-api/user/homePageExtInfo?source=1&ttid=driver&ticket=replay-ticket&wsgsig=replay-signature',
    requestBody: Buffer.from('{"source":"1","token":"same-token"}'),
  });

  assert.equal(replay.hit, true);
});

test('default profile replays POST when only signed query values change and body is unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-default-signed-query-post-'));
  const { defaultProfile } = await import('../../src/shared/state');
  const engine = new CacheEngine(new FileCacheStore(root), defaultProfile);
  const requestBody = Buffer.from('station-list-body');

  await engine.record({
    method: 'POST',
    url: 'https://energy.xiaojukeji.com/station-api/homepage/stationList?source=1&ttid=driver&wsgsig=dd05-record-signature&ticket=record-ticket',
    requestHeaders: {},
    requestBody,
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  const replay = await engine.replay({
    method: 'POST',
    url: 'https://energy.xiaojukeji.com/station-api/homepage/stationList?source=1&ttid=driver&wsgsig=dd05-replay-signature&ticket=replay-ticket',
    requestBody,
  });

  assert.equal(replay.hit, true);
});

test('default profile replays single signed-query POST variant when request body is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-default-signed-query-post-unavailable-'));
  const { defaultProfile } = await import('../../src/shared/state');
  const engine = new CacheEngine(new FileCacheStore(root), defaultProfile);

  await engine.record({
    method: 'POST',
    url: 'https://energy.xiaojukeji.com/station-api/homepage/stationList?source=1&ttid=driver&wsgsig=dd05-record-signature&ticket=record-ticket',
    requestHeaders: {},
    requestBody: Buffer.from('station-list-body'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  const replay = await engine.replay({
    method: 'POST',
    url: 'https://energy.xiaojukeji.com/station-api/homepage/stationList?source=1&ttid=driver&wsgsig=dd05-replay-signature&ticket=replay-ticket',
  });

  assert.equal(replay.hit, true);
});

test('replays entries recorded before default signed query names were ignored', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-legacy-signed-query-'));
  const store = new FileCacheStore(root);
  const requestBody = Buffer.from('{"source":"1","token":"same-token"}');

  await new CacheEngine(store, profile).record({
    method: 'POST',
    url: 'https://energy.example.com/station-api/user/homePageExtInfo?source=1&ttid=driver&ticket=record-ticket&wsgsig=record-signature',
    requestHeaders: {},
    requestBody,
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"legacy":true}'),
  });

  const { defaultProfile } = await import('../../src/shared/state');
  const replay = await new CacheEngine(store, defaultProfile).replay({
    method: 'POST',
    url: 'https://energy.example.com/station-api/user/homePageExtInfo?source=1&ttid=driver&ticket=replay-ticket&wsgsig=replay-signature',
    requestBody,
  });

  assert.equal(replay.hit, true);
  if (replay.hit) {
    assert.equal(replay.body.toString(), '{"legacy":true}');
  }
});

test('explains cache match results without marking hits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-match-'));
  const store = new FileCacheStore(root);
  const engine = new CacheEngine(store, profile);

  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search?_t=1',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"alpha"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"alpha"}'),
  });

  const hit = await engine.match({
    method: 'POST',
    url: 'https://api.example.com/search?_t=2',
    requestBody: Buffer.from('{"keyword":"alpha"}'),
  });

  assert.equal(hit.hit, true);
  assert.equal(hit.reason, 'HIT');
  assert.equal(hit.entry?.hitCount, 0);
  assert.deepEqual(hit.reasons, []);

  const miss = await engine.match({
    method: 'POST',
    url: 'https://api.example.com/search?_t=2',
    requestBody: Buffer.from('{"keyword":"beta"}'),
  });

  assert.equal(miss.hit, false);
  assert.equal(miss.reason, 'request body hash mismatch');
  assert.equal(miss.reasons[0].type, 'BODY_HASH_MISMATCH');
  assert.equal(miss.candidates.length, 1);

  assert.equal((await store.listEntries())[0].hitCount, 0);
});

test('explains unavailable request body for body-bound POST matches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-match-unavailable-body-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"alpha"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"alpha"}'),
  });
  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"beta"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"beta"}'),
  });

  const result = await engine.match({
    method: 'POST',
    url: 'https://api.example.com/search',
  });

  assert.equal(result.hit, false);
  assert.equal(result.reason, 'request body unavailable for body-bound POST cache');
  assert.equal(result.reasons[0].type, 'REQUEST_BODY_UNAVAILABLE');
  assert.equal(result.candidates.length, 2);
});

test('matches single body-bound POST variant when ignored query changes and request body is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-match-single-unavailable-body-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);

  await engine.record({
    method: 'POST',
    url: 'https://api.example.com/search?_t=1',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"alpha"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"alpha"}'),
  });

  const result = await engine.match({
    method: 'POST',
    url: 'https://api.example.com/search?_t=2',
  });

  assert.equal(result.hit, true);
  assert.equal(result.reason, 'HIT');
});

test('deletes cache entries by batch scope', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-delete-batch-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);
  await engine.record({
    method: 'GET',
    url: 'https://api.example.com/users/1',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"id":1}'),
  });
  await engine.record({
    method: 'GET',
    url: 'https://api.example.com/users/2',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"id":2}'),
  });
  await engine.record({
    method: 'GET',
    url: 'https://other.example.com/users/1',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"id":3}'),
  });

  const [reference] = await engine.list();
  const removed = await engine.deleteBatch({ scope: 'same-host', entryId: reference.id });

  assert.equal(removed, 2);
  assert.deepEqual((await engine.list()).map((entry) => entry.url), ['https://other.example.com/users/1']);
});

test('disables and enables cache entries for replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-toggle-'));
  const engine = new CacheEngine(new FileCacheStore(root), profile);
  await engine.record({
    method: 'GET',
    url: 'https://api.example.com/users',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  const [entry] = await engine.list();
  assert.equal(await engine.setEnabled(entry.id, false), true);
  assert.equal((await engine.replay({ method: 'GET', url: entry.url })).hit, false);

  assert.equal(await engine.setEnabled(entry.id, true), true);
  assert.equal((await engine.replay({ method: 'GET', url: entry.url })).hit, true);
});

test('updates cache entry TTL by operation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-ttl-'));
  const now = new Date('2026-06-05T08:00:00.000Z');
  const engine = new CacheEngine(new FileCacheStore(root), profile);
  await engine.record({
    method: 'GET',
    url: 'https://api.example.com/users',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  const [entry] = await engine.list();
  assert.equal(await engine.updateTtl({ scope: 'ids', ids: [entry.id], operation: 'extend-30m', now }), 1);
  assert.equal((await engine.list())[0].expiresAt, '2026-06-05T08:30:00.000Z');

  assert.equal(await engine.updateTtl({ scope: 'ids', ids: [entry.id], operation: 'default-ttl', now }), 1);
  assert.equal((await engine.list())[0].expiresAt, '2026-06-05T08:30:00.000Z');

  assert.equal(await engine.updateTtl({ scope: 'ids', ids: [entry.id], operation: 'expire-now', now }), 1);
  assert.equal((await engine.list())[0].expiresAt, '2026-06-05T08:00:00.000Z');

  assert.equal(await engine.updateTtl({ scope: 'ids', ids: [entry.id], operation: 'never-expire', now }), 1);
  assert.equal((await engine.list())[0].expiresAt, '9999-12-31T23:59:59.999Z');
});

test('exports and imports cache entries with response bodies', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-export-'));
  const targetRoot = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-import-'));
  const source = new CacheEngine(new FileCacheStore(sourceRoot), profile);
  const target = new CacheEngine(new FileCacheStore(targetRoot), profile);

  await source.record({
    method: 'GET',
    url: 'https://api.example.com/users',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"users":[1]}'),
  });

  const bundle = await source.exportBundle();
  assert.equal(bundle.version, 1);
  assert.equal(bundle.entries.length, 1);
  assert.equal(bundle.entries[0].bodyBase64, Buffer.from('{"users":[1]}').toString('base64'));

  const imported = await target.importBundle(bundle);
  const replay = await target.replay({ method: 'GET', url: 'https://api.example.com/users' });

  assert.equal(imported, 1);
  assert.equal(replay.hit, true);
  if (replay.hit) {
    assert.equal(replay.body.toString(), '{"users":[1]}');
  }
});
