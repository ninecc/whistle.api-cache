import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCacheMatchBody, parseDeleteBatchBody, parseUpdateTtlBody } from '../../src/uiServer/requestParsers';

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
