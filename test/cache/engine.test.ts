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

test('replays the only matching POST entry when request body is unavailable', async () => {
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

test('explains ambiguous POST matches when request body is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-engine-match-ambiguous-'));
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
  assert.equal(result.reason, 'ambiguous POST candidates: 2');
  assert.equal(result.reasons[0].type, 'AMBIGUOUS_POST_CANDIDATES');
  assert.equal(result.candidates.length, 2);
});
