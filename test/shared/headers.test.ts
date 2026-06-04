import test from 'node:test';
import assert from 'node:assert/strict';
import { getHeaderValue, normalizeHeaderMap } from '../../src/shared/headers';

test('normalizes header keys to lower case and joins array values', () => {
  const normalized = normalizeHeaderMap({
    'Content-Type': 'application/json',
    'X-Test': ['a', 'b'],
    'ignore': undefined as unknown as string,
  });

  assert.equal(normalized['content-type'], 'application/json');
  assert.equal(normalized['x-test'], 'a, b');
  assert.equal('ignore' in normalized, false);
});

test('reads header value case-insensitively', () => {
  const headers = {
    'Content-Type': 'application/json',
    'Set-Cookie': ['a=1', 'b=2'],
  };

  assert.equal(getHeaderValue(headers, 'content-type'), 'application/json');
  assert.deepEqual(getHeaderValue(headers, 'SET-COOKIE'), ['a=1', 'b=2']);
  assert.equal(getHeaderValue(headers, 'missing'), undefined);
});
