import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeleteBatchBody, parseUpdateTtlBody } from '../../src/uiServer/requestParsers';

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
