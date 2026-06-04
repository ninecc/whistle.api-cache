import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileCacheStore } from '../../src/cache/store';
import { CacheEntry } from '../../src/cache/types';

test('writes entries, reads bodies, and marks hits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-store-'));
  const store = new FileCacheStore(root);
  const entry: CacheEntry = {
    id: 'entry-1',
    profileId: 'default',
    key: 'GET https://api.example.com/users',
    method: 'GET',
    url: 'https://api.example.com/users',
    normalizedUrl: 'https://api.example.com/users',
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    contentType: 'application/json',
    bodyHash: 'body-1',
    bodySize: 11,
    createdAt: '2026-06-04T00:00:00.000Z',
    expiresAt: '2026-06-04T01:00:00.000Z',
    hitCount: 0,
    enabled: true,
  };

  await store.putEntry(entry, Buffer.from('{"ok":true}'));

  const found = await store.getEntryByKey('default', entry.key);
  assert.equal(found?.id, 'entry-1');
  assert.equal((await store.readBody(entry)).toString(), '{"ok":true}');

  await store.markHit('entry-1', new Date('2026-06-04T00:05:00.000Z'));
  const hit = await store.getEntryByKey('default', entry.key);
  assert.equal(hit?.hitCount, 1);
  assert.equal(hit?.lastHitAt, '2026-06-04T00:05:00.000Z');
});

test('clears expired entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-expired-'));
  const store = new FileCacheStore(root);

  await store.putEntry({
    id: 'old',
    profileId: 'default',
    key: 'GET https://api.example.com/old',
    method: 'GET',
    url: 'https://api.example.com/old',
    normalizedUrl: 'https://api.example.com/old',
    statusCode: 200,
    headers: { 'content-type': 'text/plain' },
    contentType: 'text/plain',
    bodyHash: 'old-body',
    bodySize: 3,
    createdAt: '2026-06-04T00:00:00.000Z',
    expiresAt: '2026-06-04T00:01:00.000Z',
    hitCount: 0,
    enabled: true,
  }, Buffer.from('old'));

  const removed = await store.clearExpired(new Date('2026-06-04T00:02:00.000Z'));

  assert.equal(removed, 1);
  assert.equal((await store.listEntries()).length, 0);
});
