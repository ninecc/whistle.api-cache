import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCacheMatchBody,
  parseDeleteBody,
  parseDeleteBatchBody,
  parseImportBody,
  filterEventsAfter,
  parseEnabledBody,
  parseEventsAfter,
  parseIgnoredQueryNames,
  parseUpdateTtlBody,
} from '../../src/uiServer/requestParsers';
import { CacheEvent } from '../../src/shared/state';

test('defaults unknown delete scope to empty id list scope', () => {
  assert.deepEqual(parseDeleteBatchBody({ scope: 'unknown' }), {
    scope: 'ids',
    ids: [],
  });
  assert.deepEqual(parseDeleteBatchBody({}), {
    scope: 'ids',
    ids: [],
  });
});

test('parses ids and host/path scopes for delete batch input', () => {
  assert.deepEqual(parseDeleteBatchBody({ scope: 'ids', ids: [1, '2'] }), {
    scope: 'ids',
    ids: ['1', '2'],
  });

  assert.deepEqual(parseDeleteBatchBody({ scope: 'same-host', entryId: 12 }), {
    scope: 'same-host',
    entryId: '12',
  });

  assert.deepEqual(parseDeleteBatchBody({ scope: 'expired' }), {
    scope: 'expired',
  });
});

test('defaults invalid ttl operations to default-ttl', () => {
  assert.equal(parseUpdateTtlBody({ scope: 'ids', ids: [], operation: 'never-expire' }).operation, 'never-expire');
  assert.equal(parseUpdateTtlBody({ scope: 'ids', ids: [], operation: 'bad-op' }).operation, 'default-ttl');
});

test('parses events after query parameter with defaults and invalid values', () => {
  assert.equal(parseEventsAfter(null), 0);
  assert.equal(parseEventsAfter('12'), 12);
  assert.equal(Number.isNaN(parseEventsAfter('bad')), true);
});

test('parses cache match request body with defaults and non-empty request payload', () => {
  assert.deepEqual(parseCacheMatchBody({}), {
    method: 'GET',
    url: '',
  });

  assert.deepEqual(parseCacheMatchBody({ method: 'post', url: 'https://api.example.com/search', requestBody: 'a=1' }), {
    method: 'POST',
    url: 'https://api.example.com/search',
    requestBody: Buffer.from('a=1'),
  });

  assert.deepEqual(parseCacheMatchBody({ method: 'post', requestBody: 12 }), {
    method: 'POST',
    url: '',
  });
});

test('normalizes ignored query names input', () => {
  assert.deepEqual(parseIgnoredQueryNames({ names: ['a', 1, 'b'] }), ['a', '1', 'b']);
  assert.deepEqual(parseIgnoredQueryNames({}), []);
  assert.deepEqual(parseIgnoredQueryNames({ names: 'not-array' as unknown as string[] }), []);
});

test('parses enabled request body with defaults', () => {
  assert.deepEqual(parseEnabledBody({ id: 'entry-1', enabled: true }), {
    id: 'entry-1',
    enabled: true,
  });

  assert.deepEqual(parseEnabledBody({}), {
    id: '',
    enabled: false,
  });

  assert.deepEqual(parseEnabledBody({ id: 12, enabled: '1' }), {
    id: '12',
    enabled: true,
  });
});

test('normalizes delete body with fallback default', () => {
  assert.deepEqual(parseDeleteBody({}), {
    id: '',
  });

  assert.deepEqual(parseDeleteBody({ id: 123 }), {
    id: '123',
  });
});

test('normalizes import body with default values and fallback for invalid input', () => {
  const fallback = parseImportBody({});
  assert.equal(fallback.version, 1);
  assert.equal(fallback.entries.length, 0);

  const withEntries = parseImportBody({
    bundle: {
      version: 2,
      exportedAt: 't',
      entries: [1, 2, 3],
    },
  });
  assert.equal(withEntries.version, 2);
  assert.equal(withEntries.exportedAt, 't');
  assert.deepEqual(withEntries.entries, [1, 2, 3]);
});

test('filters events by after id with invalid input fallback', () => {
  const events: CacheEvent[] = [
    { id: 1, type: 'HIT', timestamp: '2026-01-01T00:00:00.000Z' },
    { id: 3, type: 'MISS', timestamp: '2026-01-01T00:00:01.000Z' },
    { id: 5, type: 'STORE', timestamp: '2026-01-01T00:00:02.000Z' },
  ];

  assert.deepEqual(filterEventsAfter(events, 1), [events[1], events[2]]);
  assert.deepEqual(filterEventsAfter(events, Number.NaN), events);
});
