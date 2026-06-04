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

test('prioritizes req.url over fallback.fullUrl when fullUrl missing', () => {
  const context = parseRequestContext(
    {
      url: '/api/from-req',
    },
    {
      fullUrl: 'https://example.test/api/fallback',
    },
  );

  assert.equal(context.url, '/api/from-req');
});

test('prefers req.url when req.fullUrl is empty', () => {
  const context = parseRequestContext(
    {
      fullUrl: '',
      url: '/api/from-req',
    },
    {
      fullUrl: 'https://example.test/api/fallback',
      url: 'https://example.test/api/fallback-url',
    },
  );

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

test('uses root method before fallback method', () => {
  const context = parseRequestContext(
    { method: 'get', fullUrl: 'https://example.test/api/root' },
    { method: 'post', fullUrl: 'https://example.test/api/fallback' },
  );

  assert.equal(context.method, 'GET');
  assert.equal(context.url, 'https://example.test/api/root');
});

test('stringifies non-string methods before uppercasing', () => {
  const context = parseRequestContext({ method: 123 }, {});

  assert.equal(context.method, '123');
});

test('keeps zero as string method instead of falling back', () => {
  const context = parseRequestContext({ method: 0 }, {});

  assert.equal(context.method, '0');
});

test('keeps zero method with fallback for empty originalReq url fields', () => {
  const context = parseRequestContext(
    {
      method: 'POST',
      url: '/api/from-root',
      originalReq: {
        method: 0,
        fullUrl: '',
        url: '',
      },
    },
  );

  assert.equal(context.method, '0');
  assert.equal(context.url, '/api/from-root');
});

test('prefers fallback fullUrl before fallback.req.url', () => {
  const context = parseRequestContext({}, {
    fullUrl: 'https://example.test/api/fallback-full',
    req: { url: 'https://example.test/api/fallback-req' },
  });

  assert.equal(context.method, 'GET');
  assert.equal(context.url, 'https://example.test/api/fallback-full');
});

test('prefers fallback fullUrl before fallback.url', () => {
  const context = parseRequestContext(
    {},
    {
      fullUrl: 'https://example.test/api/fallback-full',
      url: 'https://example.test/api/fallback-url',
    },
  );

  assert.equal(context.url, 'https://example.test/api/fallback-full');
});

test('falls back to fallback.req.url when fallback.fullUrl and fallback.url are empty', () => {
  const context = parseRequestContext(
    {},
    {
      fullUrl: '',
      url: '',
      req: { url: 'https://example.test/api/fallback-req' },
    },
  );

  assert.equal(context.url, 'https://example.test/api/fallback-req');
});

test('keeps originalReq.method when it is number-like value 0', () => {
  const context = parseRequestContext(
    {
      method: 'GET',
      url: '/api/from-req',
      originalReq: { method: 0 },
    },
  );

  assert.equal(context.method, '0');
  assert.equal(context.url, '/api/from-req');
});

test('keeps numeric method while falling back to fallback req.url when originalReq url fields are empty', () => {
  const context = parseRequestContext(
    {
      method: 0,
      originalReq: {
        method: 0,
        fullUrl: '',
        url: '',
      },
    },
    {
      req: {
        url: '/api/fallback-req',
      },
    },
  );

  assert.equal(context.method, '0');
  assert.equal(context.url, '/api/fallback-req');
});

test('uses originalReq.fullUrl before req.url when method missing', () => {
  const context = parseRequestContext(
    {
      method: 'GET',
      url: '/api/from-req',
      originalReq: { fullUrl: 'https://example.test/api/from-original' },
    },
  );

  assert.equal(context.url, 'https://example.test/api/from-original');
});

test('uses originalReq.url before req.fullUrl when method is present', () => {
  const context = parseRequestContext(
    {
      method: 'GET',
      fullUrl: 'https://example.test/api/from-root-full',
      originalReq: { url: 'https://example.test/api/from-original-url' },
    },
  );

  assert.equal(context.url, 'https://example.test/api/from-original-url');
});

test('uses root method when originalReq has empty url fields', () => {
  const context = parseRequestContext(
    {
      method: 'POST',
      url: '/api/from-root',
      originalReq: {
        method: 'GET',
        fullUrl: '',
        url: '',
      },
    },
  );

  assert.equal(context.method, 'GET');
  assert.equal(context.url, '/api/from-root');
});

test('ignores empty originalReq object and keeps root values', () => {
  const context = parseRequestContext(
    {
      method: 'GET',
      url: 'https://example.test/api/from-root',
      originalReq: {},
    },
    {
      fullUrl: 'https://example.test/api/fallback',
      method: 'POST',
    },
  );

  assert.equal(context.method, 'GET');
  assert.equal(context.url, 'https://example.test/api/from-root');
});

test('ignores empty originalReq.method and keeps root method', () => {
  const context = parseRequestContext(
    {
      method: 'POST',
      url: '/api/from-root',
      originalReq: { method: '' },
    },
  );

  assert.equal(context.method, 'POST');
  assert.equal(context.url, '/api/from-root');
});

test('prefers non-empty url from fallback before fallback.req.url', () => {
  const context = parseRequestContext(
    {
      originalReq: { fullUrl: '' },
    },
    {
      fullUrl: 'https://example.test/api/fallback-full',
      url: 'https://example.test/api/fallback-req',
    },
  );

  assert.equal(context.url, 'https://example.test/api/fallback-full');
});

test('treats empty-string url fields as unavailable for fallback', () => {
  const context = parseRequestContext(
    {
      method: 'GET',
      fullUrl: '',
      url: '',
      originalReq: { fullUrl: '' },
    },
    { url: 'https://example.test/api/fallback' },
  );

  assert.equal(context.url, 'https://example.test/api/fallback');
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
