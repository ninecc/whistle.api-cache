import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteCacheStore } from '../../src/cache/sqliteStore';
import { CacheEntry } from '../../src/cache/types';

test('sqlite store writes and reads cache entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-sqlite-'));
  const store = new SqliteCacheStore(root);
  const entry = createEntry('entry-1', 'GET https://api.example.com/users');

  await store.putEntry(entry, Buffer.from('{"ok":true}'));

  const found = await store.getEntryByKey('default', entry.key);
  assert.equal(found?.id, 'entry-1');
  assert.equal(found?.activeBodyKind, 'original');
  assert.equal((await store.readBody(found!)).toString(), '{"ok":true}');

  await store.markHit('entry-1', new Date('2026-06-04T00:05:00.000Z'));
  const hit = await store.getEntryByKey('default', entry.key);
  assert.equal(hit?.hitCount, 1);
  assert.equal(hit?.lastHitAt, '2026-06-04T00:05:00.000Z');
  store.close();
});

test('sqlite store keeps editable body after re-recording the same cache key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-sqlite-edit-'));
  const store = new SqliteCacheStore(root);
  const entry = createEntry('entry-1', 'GET https://api.example.com/users');

  await store.putEntry(entry, Buffer.from('original-1'));
  const edited = await store.updateActiveBody('entry-1', Buffer.from('edited'));
  await store.putEntry({ ...entry, statusCode: 201 }, Buffer.from('original-2'));

  const found = await store.getEntryByKey('default', entry.key);
  assert.equal(found?.id, edited.id);
  assert.equal(found?.statusCode, 201);
  assert.equal(found?.activeBodyKind, 'editable');
  assert.equal((await store.readBody(found!)).toString(), 'edited');
  store.close();
});

test('sqlite store restores original body state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-sqlite-restore-'));
  const store = new SqliteCacheStore(root);
  const entry = createEntry('entry-1', 'GET https://api.example.com/users');

  await store.putEntry(entry, Buffer.from('original'));
  await store.updateActiveBody('entry-1', Buffer.from('edited'));
  const restored = await store.restoreOriginalBody('entry-1');

  assert.equal(restored.activeBodyKind, 'original');
  assert.equal((await store.readBody(restored)).toString(), 'original');
  store.close();
});

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

test('sqlite store migrates legacy cache-index to sqlite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-sqlite-migrate-'));
  const entry = createEntry('entry-1', 'GET https://api.example.com/users');
  const body = Buffer.from('legacy');
  await writeFile(join(root, 'cache-index.json'), `${JSON.stringify({ entries: [entry] }, null, 2)}\n`);
  await mkdir(join(root, 'objects'), { recursive: true });
  await writeFile(join(root, 'objects', `${entry.bodyHash}.body`), body);

  const store = new SqliteCacheStore(root);
  const found = await store.getEntryByKey('default', entry.key);

  assert.equal(found?.id, 'entry-1');
  assert.equal((await store.readBody(found!)).toString(), 'legacy');
  store.close();
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
