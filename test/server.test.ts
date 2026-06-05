import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getEngine, clearRecentEvents, getRecentEvents } from '../src/shared/state';
import setupServer from '../src/server';

// server 测试分组：先覆盖请求上下文 fallback，再覆盖 body 回放匹配语义。

test('server replays by fallback context when originalReq is empty shell', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-server-empty-original-'));
  const options = { baseDir: root };
  const url = 'https://api.example.com/users';

  await getEngine(options).record({
    method: 'POST',
    url,
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  let passThroughCalled = false;
  setupServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: '',
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name] = String(Array.isArray(value) ? value.join(',') : value);
    },
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
    passThrough() {
      passThroughCalled = true;
    },
  };

  clearRecentEvents();
  await handler?.({
    ruleValue: 'replay',
    originalReq: {
      method: 0,
      fullUrl: '',
    },
    method: 'POST',
    url,
    passThrough() {
      passThroughCalled = true;
    },
  }, response);

  assert.equal(passThroughCalled, false);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '{"ok":true}');

  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, url);
});

test('server passes through when resolved url is empty', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-server-empty-url-'));
  const options = { baseDir: root };

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  let passThroughCalled = false;
  setupServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = {
    headers: {} as Record<string, string>,
    body: '',
    statusCode: 0,
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name] = String(Array.isArray(value) ? value.join(',') : value);
    },
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
    passThrough() {
      passThroughCalled = true;
    },
  };

  clearRecentEvents();
  await handler?.({
    ruleValue: 'replay',
    originalReq: {
      method: 'GET',
      fullUrl: '',
    },
    method: 'GET',
    url: '',
    passThrough() {
      passThroughCalled = true;
    },
  }, response);

  assert.equal(passThroughCalled, true);
  assert.equal(response.statusCode, 0);
  assert.equal(response.body, '');
  assert.deepEqual(getRecentEvents(), []);
});

// body 取值与优先级：直接 body 优先，空值回退 session，最后由 cache key 共同驱动回放。

test('server replays when originalReq.body is false', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-server-false-body-'));
  const options = { baseDir: root };

  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/boolean-body',
    requestHeaders: {},
    requestBody: Buffer.from('false'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  let passThroughCalled = false;
  setupServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: '',
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name] = String(Array.isArray(value) ? value.join(',') : value);
    },
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
    passThrough() {
      passThroughCalled = true;
    },
  };

  clearRecentEvents();
  await handler?.({
    ruleValue: 'replay',
    method: 'POST',
    url: 'https://api.example.com/boolean-body',
    originalReq: {
      body: false,
      ruleValue: 'replay',
    },
    passThrough() {
      passThroughCalled = true;
    },
  }, response);

  assert.equal(passThroughCalled, false);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '{"ok":true}');
  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/boolean-body');
});

test('server prefers false originalReq.body over session body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-server-false-body-session-'));
  const options = { baseDir: root };

  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/boolean-body-priority',
    requestHeaders: {},
    requestBody: Buffer.from('false'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: '',
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name] = String(Array.isArray(value) ? value.join(',') : value);
    },
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
    getReqSession(cb: (session: any) => void) {
      cb({ req: { body: 'session-body' } });
    },
  };

  clearRecentEvents();
  await handler?.({
    ruleValue: 'replay',
    method: 'POST',
    url: 'https://api.example.com/boolean-body-priority',
    originalReq: {
      body: false,
      ruleValue: 'replay',
    },
  }, response);

  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/boolean-body-priority');
});

test('server prefers numeric originalReq.body over session body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-server-number-body-session-'));
  const options = { baseDir: root };

  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/number-body-priority',
    requestHeaders: {},
    requestBody: Buffer.from('0'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: '',
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name] = String(Array.isArray(value) ? value.join(',') : value);
    },
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
    getReqSession(cb: (session: any) => void) {
      cb({ req: { body: 'session-body' } });
    },
  };

  clearRecentEvents();
  await handler?.({
    ruleValue: 'replay',
    method: 'POST',
    url: 'https://api.example.com/number-body-priority',
    originalReq: {
      body: 0,
      ruleValue: 'replay',
    },
  }, response);

  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/number-body-priority');
});

test('server prefers req.body when originalReq.body is undefined', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-server-undefined-body-preferred-'));
  const options = { baseDir: root };

  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/undefined-body-preferred',
    requestHeaders: {},
    requestBody: Buffer.from('direct-body'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: '',
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name] = String(Array.isArray(value) ? value.join(',') : value);
    },
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
    getReqSession(cb: (session: any) => void) {
      cb({ req: { body: 'session-body' } });
    },
    passThrough() {},
  };

  clearRecentEvents();
  await setupServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  await handler?.({
    ruleValue: 'replay',
    method: 'POST',
    url: 'https://api.example.com/undefined-body-preferred',
    body: Buffer.from('direct-body'),
    originalReq: {
      ruleValue: 'replay',
      body: undefined,
    },
  }, response);

  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '{"ok":true}');
});

test('server falls back req.body empty string when originalReq.body is undefined', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-server-empty-req-body-with-undefined-original-'));
  const options = { baseDir: root };

  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/empty-req-body-with-undefined-original',
    requestHeaders: {},
    requestBody: Buffer.from('session-body'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: '',
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name] = String(Array.isArray(value) ? value.join(',') : value);
    },
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
    getReqSession(cb: (session: any) => void) {
      cb({ req: { body: 'session-body' } });
    },
    passThrough() {},
  };

  clearRecentEvents();
  await setupServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  await handler?.({
    ruleValue: 'replay',
    method: 'POST',
    url: 'https://api.example.com/empty-req-body-with-undefined-original',
    body: '',
    originalReq: {
      ruleValue: 'replay',
      body: undefined,
    },
  }, response);

  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '{"ok":true}');
});

test('server falls back req.body empty string when originalReq.body is null', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-server-empty-req-body-with-null-original-'));
  const options = { baseDir: root };

  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/empty-req-body-with-null-original',
    requestHeaders: {},
    requestBody: Buffer.from('session-body'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: '',
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name] = String(Array.isArray(value) ? value.join(',') : value);
    },
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
    getReqSession(cb: (session: any) => void) {
      cb({ req: { body: 'session-body' } });
    },
    passThrough() {},
  };

  clearRecentEvents();
  await setupServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  await handler?.({
    ruleValue: 'replay',
    method: 'POST',
    url: 'https://api.example.com/empty-req-body-with-null-original',
    body: '',
    originalReq: {
      ruleValue: 'replay',
      body: null,
    },
  }, response);

  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '{"ok":true}');
});

test('server treats missing originalReq.body and missing req.body as empty body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-server-missing-both-body-'));
  const options = { baseDir: root };

  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/post-with-missing-both-body',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: '',
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name] = String(Array.isArray(value) ? value.join(',') : value);
    },
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
    getReqSession(cb: (session: any) => void) {
      cb({ req: { method: 'POST', url: 'https://api.example.com/post-with-missing-both-body' } });
    },
    passThrough() {},
  };

  clearRecentEvents();
  await setupServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  await handler?.({
    ruleValue: 'replay',
    method: 'POST',
    url: 'https://api.example.com/post-with-missing-both-body',
    originalReq: {
      ruleValue: 'replay',
    },
  }, response);

  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '{"ok":true}');
});
