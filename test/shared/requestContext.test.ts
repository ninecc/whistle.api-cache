import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequestContext } from '../../src/shared/requestContext';

test('parses context from originalReq priority and fallback method/url', () => {
  const context = parseRequestContext(
    {
      originalReq: { method: 'POST', fullUrl: 'https://example.test/api/orig' },
      method: 'GET',
      fullUrl: 'https://example.test/api/root',
    },
    { req: { method: 'PUT', url: 'https://example.test/api/fallback' } },
  );

  assert.equal(context.method, 'POST');
  assert.equal(context.url, 'https://example.test/api/orig');
});

test('falls back to req.url when fullUrl fields are unavailable', () => {
  const context = parseRequestContext({ url: '/api/from-req' }, {});

  assert.equal(context.method, 'GET');
  assert.equal(context.url, '/api/from-req');
});

test('falls back to req and fallback values when original missing', () => {
  const context = parseRequestContext(
    { method: 'GET', fullUrl: 'https://example.test/api/root' },
    { req: { method: 'POST', url: 'https://example.test/api/fallback' } },
  );

  assert.equal(context.method, 'GET');
  assert.equal(context.url, 'https://example.test/api/root');
});

test('falls back to fallback.req method when root method missing', () => {
  const context = parseRequestContext(
    {},
    { req: { method: 'patch', url: 'https://example.test/api/fallback' } },
  );

  assert.equal(context.method, 'PATCH');
});

test('stringifies non-string methods before uppercasing', () => {
  const context = parseRequestContext({ method: 123 }, {});

  assert.equal(context.method, '123');
});

test('prefers fallback fullUrl before fallback.req.url', () => {
  const context = parseRequestContext({}, {
    fullUrl: 'https://example.test/api/fallback-full',
    req: { url: 'https://example.test/api/fallback-req' },
  });

  assert.equal(context.method, 'GET');
  assert.equal(context.url, 'https://example.test/api/fallback-full');
});

test('returns undefined url when unavailable', () => {
  const context = parseRequestContext({}, {});

  assert.equal(context.method, 'GET');
  assert.equal(context.url, undefined);
});

test('normalizes method to uppercase', () => {
  const context = parseRequestContext({ method: 'post' }, {});

  assert.equal(context.method, 'POST');
});
