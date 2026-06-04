import test from 'node:test';
import assert from 'node:assert/strict';
import { getReplayHeaderPolicy, isCacheableResponse, sanitizeReplayHeaders } from '../../src/cache/policy';
import { CacheProfile } from '../../src/cache/types';

const profile: CacheProfile = {
  id: 'default',
  recordEnabled: true,
  replayEnabled: false,
  ttlSeconds: 1800,
  ignoredQueryNames: ['_t'],
  maxBodySize: 1024 * 1024,
  cacheableContentTypes: ['application/json', 'text/'],
};

test('accepts safe GET JSON 2xx responses', () => {
  const result = isCacheableResponse({
    method: 'GET',
    statusCode: 200,
    requestHeaders: {},
    responseHeaders: { 'content-type': 'application/json; charset=utf-8' },
    bodySize: 42,
    profile,
  });
  assert.equal(result.cacheable, true);
});

test('accepts safe POST JSON 2xx responses', () => {
  const result = isCacheableResponse({
    method: 'POST',
    statusCode: 200,
    requestHeaders: {},
    responseHeaders: { 'content-type': 'application/json; charset=utf-8' },
    bodySize: 42,
    profile,
  });
  assert.equal(result.cacheable, true);
});

test('rejects authenticated requests and set-cookie responses', () => {
  assert.equal(isCacheableResponse({
    method: 'GET',
    statusCode: 200,
    requestHeaders: { authorization: 'Bearer token' },
    responseHeaders: { 'content-type': 'application/json' },
    bodySize: 42,
    profile,
  }).cacheable, false);

  assert.equal(isCacheableResponse({
    method: 'GET',
    statusCode: 200,
    requestHeaders: {},
    responseHeaders: { 'content-type': 'application/json', 'set-cookie': 'sid=1' },
    bodySize: 42,
    profile,
  }).cacheable, false);
});

test('sanitizes replay headers and recalculates content length', () => {
  const headers = sanitizeReplayHeaders({
    'content-type': 'application/json',
    'content-encoding': 'gzip',
    'transfer-encoding': 'chunked',
    connection: 'keep-alive',
    'content-length': '999',
  }, 13);

  assert.deepEqual(headers, {
    'content-type': 'application/json',
    'content-length': '13',
    'x-whistle-cache': 'HIT',
  });
});

test('describes replay header policy for the UI', () => {
  assert.deepEqual(getReplayHeaderPolicy(), {
    removedHeaders: [
      'connection',
      'content-encoding',
      'content-length',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'set-cookie',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
    ],
    injectedHeaders: ['content-length', 'x-whistle-cache'],
  });
});
