import test from 'node:test';
import assert from 'node:assert/strict';
import { createCacheKey, describeCacheKey, normalizeUrl } from '../../src/cache/key';

test('normalizes URLs by removing ignored query names and sorting the rest', () => {
  const normalized = normalizeUrl('https://api.example.com/users?b=2&_t=9&a=1', ['_t']);
  assert.equal(normalized, 'https://api.example.com/users?a=1&b=2');
});

test('creates a stable method plus URL cache key', () => {
  const key = createCacheKey({
    method: 'get',
    url: 'https://api.example.com/users?b=2&_t=9&a=1',
    ignoredQueryNames: ['_t'],
  });
  assert.equal(key, 'GET https://api.example.com/users?a=1&b=2');
});

test('includes request body hash in POST cache keys', () => {
  const firstKey = createCacheKey({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestBody: Buffer.from('{"keyword":"alpha"}'),
  });
  const secondKey = createCacheKey({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestBody: Buffer.from('{"keyword":"beta"}'),
  });

  assert.ok(firstKey !== secondKey);
  assert.ok(firstKey.startsWith('POST https://api.example.com/search body:'));
});

test('includes empty request body hash in cache keys', () => {
  const key = createCacheKey({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestBody: Buffer.from(''),
  });

  assert.ok(key.startsWith('POST https://api.example.com/search body:'));
});

test('describes cache key composition', () => {
  assert.deepEqual(describeCacheKey({
    method: 'POST',
    normalizedUrl: 'https://api.example.com/search?a=1',
    requestBodyHash: 'body-hash',
    ignoredQueryNames: ['_t', 'wsgsig'],
  }), {
    method: 'POST',
    normalizedUrl: 'https://api.example.com/search?a=1',
    includesRequestBodyHash: true,
    ignoredQueryNames: ['_t', 'wsgsig'],
  });
});

test('normalizes non-string methods in cache key helpers', () => {
  const key = createCacheKey({
    method: 12 as unknown as string,
    url: 'https://api.example.com/orders',
  });
  const description = describeCacheKey({ method: 12 as unknown as string, normalizedUrl: 'https://api.example.com/orders' });

  assert.equal(key, '12 https://api.example.com/orders');
  assert.equal(description.method, '12');
});
