import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getEngine, clearRecentEvents, getRecentEvents } from '../src/shared/state';
import setupServer from '../src/server';

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
  assert.equal(getRecentEvents(), []);
});

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
