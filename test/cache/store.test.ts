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
  assert.equal((await store.readBody(found!)).toString(), '{"ok":true}');

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

test('serializes concurrent entry writes without losing index updates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-concurrent-'));
  const store = new FileCacheStore(root);

  const entries = Array.from({ length: 25 }, (_, index): CacheEntry => ({
    id: `entry-${index}`,
    profileId: 'default',
    key: `POST https://api.example.com/items/${index}`,
    method: 'POST',
    url: `https://api.example.com/items/${index}`,
    normalizedUrl: `https://api.example.com/items/${index}`,
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    contentType: 'application/json',
    bodyHash: `body-${index}`,
    bodySize: 12,
    createdAt: '2026-06-04T00:00:00.000Z',
    expiresAt: '2026-06-04T01:00:00.000Z',
    hitCount: 0,
    enabled: true,
  }));

  await Promise.all(entries.map((entry) => store.putEntry(entry, Buffer.from(`{"id":${entry.id.split('-')[1]}}`))));

  const stored = await store.listEntries();
  assert.equal(stored.length, entries.length);
  assert.deepEqual(
    stored.map((entry) => entry.id).sort(),
    entries.map((entry) => entry.id).sort(),
  );
});

test('keeps shared original body while another entry still references it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-shared-body-'));
  const store = new FileCacheStore(root);
  const body = Buffer.from('shared');

  await store.putEntry(createEntry('entry-1', 'GET https://api.example.com/a'), body);
  await store.putEntry(createEntry('entry-2', 'GET https://api.example.com/b'), body);

  assert.equal(await store.deleteEntry('entry-1'), true);
  const remaining = await store.getEntryByKey('default', 'GET https://api.example.com/b');

  assert.equal((await store.readBody(remaining!)).toString(), 'shared');
});

test('updates active editable body without losing original body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-editable-body-'));
  const store = new FileCacheStore(root);

  await store.putEntry(createEntry('entry-1', 'GET https://api.example.com/edit'), Buffer.from('original'));
  const edited = await store.updateActiveBody('entry-1', Buffer.from('edited'));

  assert.equal(edited.activeBodyKind, 'editable');
  assert.equal((await store.readBody(edited)).toString(), 'edited');

  const restored = await store.restoreOriginalBody('entry-1');
  assert.equal(restored.activeBodyKind, 'original');
  assert.equal((await store.readBody(restored)).toString(), 'original');
});

function createEntry(id: string, key: string): CacheEntry {
  const url = key.replace(/^GET /, '');
  return {
    id,
    profileId: 'default',
    key,
    method: 'GET',
    url,
    normalizedUrl: url,
    statusCode: 200,
    headers: { 'content-type': 'text/plain' },
    contentType: 'text/plain',
    bodyHash: id,
    bodySize: 0,
    createdAt: '2026-06-04T00:00:00.000Z',
    expiresAt: '2026-06-04T01:00:00.000Z',
    hitCount: 0,
    enabled: true,
  };
}
