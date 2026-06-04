import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import setupRulesServer from '../src/rulesServer';
import { clearRecentEvents, consumeRecentReplayHit, getEngine, getRecentEvents } from '../src/shared/state';

test('rules server injects replay rules for cache hits and marks them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-'));
  const options = { baseDir: root };
  await getEngine(options).record({
    method: 'GET',
    url: 'https://api.example.com/users',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'GET',
    url: 'https://api.example.com/users',
    originalReq: {
      method: 'GET',
      fullUrl: 'https://api.example.com/users',
      ruleValue: 'replay',
    },
  }, response);

  const rules = JSON.parse(response.body).rules;
  assert.ok(rules.startsWith('* style://bgColor=@1d4ed8 style://color=@dbeafe style://fontStyle=bold\n* statusCode://200'));
  assert.ok(rules.includes('resHeaders://{whistleApiCache'));
  assert.ok(rules.includes('resBody://{whistleApiCache'));
  const [entry] = await getEngine(options).list();
  assert.equal(entry.hitCount, 1);
  assert.equal(consumeRecentReplayHit('GET', 'https://api.example.com/users'), true);
});

test('rules server reports ambiguous POST candidates in miss diagnostics', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-ambiguous-'));
  const options = { baseDir: root };
  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"alpha"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"alpha"}'),
  });
  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/search',
    requestHeaders: {},
    requestBody: Buffer.from('{"keyword":"beta"}'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"result":"beta"}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'POST',
    url: 'https://api.example.com/search',
    originalReq: {
      id: 'req-ambiguous-1',
      method: 'POST',
      fullUrl: 'https://api.example.com/search',
      ruleValue: 'replay',
    },
  }, response);

  const [event] = getRecentEvents();
  assert.equal(event.type, 'MISS');
  assert.equal(event.requestId, 'req-ambiguous-1');
  assert.equal(event.reason, 'REPLAY MISS -> PASS THROUGH: ambiguous POST candidates: 2');
  clearRecentEvents();
});

test('rules server falls back to req context when originalReq is empty shell', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-empty-original-'));
  const options = { baseDir: root };
  clearRecentEvents();
  await getEngine(options).record({
    method: 'GET',
    url: 'https://api.example.com/empty-original',
    requestHeaders: {},
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'GET',
    url: 'https://api.example.com/empty-original',
    originalReq: {
      ruleValue: 'replay',
    },
  }, response);

  const rules = JSON.parse(response.body).rules;
  assert.ok(rules.includes('resBody://{whistleApiCache'));
  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'GET');
  assert.equal(event.url, 'https://api.example.com/empty-original');
});

test('rules server normalizes method for empty-shell originalReq fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-empty-original-method-'));
  const options = { baseDir: root };
  clearRecentEvents();
  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/method-lowercase',
    requestHeaders: {},
    requestBody: Buffer.from('k=v'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'post',
    url: 'https://api.example.com/method-lowercase',
    body: Buffer.from('k=v'),
    originalReq: {
      ruleValue: 'replay',
    },
  }, response);

  const rules = JSON.parse(response.body).rules;
  assert.ok(rules.includes('resBody://{whistleApiCache'));
  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/method-lowercase');
});

test('rules server falls back requestBody from req.body when originalReq.body is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-body-fallback-'));
  const options = { baseDir: root };
  clearRecentEvents();
  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/body-from-req',
    requestHeaders: {},
    requestBody: Buffer.from('x=1'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'post',
    url: 'https://api.example.com/body-from-req',
    body: Buffer.from('x=1'),
    originalReq: {
      ruleValue: 'replay',
    },
  }, response);

  const rules = JSON.parse(response.body).rules;
  assert.ok(rules.includes('resBody://{whistleApiCache'));
  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/body-from-req');
});

test('rules server can hit replay even when originalReq.body is missing for empty-shell body path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-miss-body-fallback-'));
  const options = { baseDir: root };
  clearRecentEvents();

  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/body-miss-candidate',
    requestHeaders: {},
    requestBody: Buffer.from('foo=bar'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'post',
    url: 'https://api.example.com/body-miss-candidate',
    originalReq: {
      ruleValue: 'replay',
    },
  }, response);

  const parsed = JSON.parse(response.body);
  assert.ok(parsed.rules.includes('resBody://{whistleApiCache'));
  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/body-miss-candidate');
});

test('rules server treats empty-string req.body as missing request body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-empty-body-'));
  const options = { baseDir: root };
  clearRecentEvents();

  await getEngine(options).record({
    method: 'POST',
    url: 'https://api.example.com/empty-body',
    requestHeaders: {},
    requestBody: Buffer.from('x=1'),
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    body: Buffer.from('{"ok":true}'),
  });

  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'post',
    url: 'https://api.example.com/empty-body',
    body: '',
    originalReq: {
      ruleValue: 'replay',
    },
  }, response);

  const parsed = JSON.parse(response.body);
  assert.ok(parsed.rules.includes('* style://bgColor=@1d4ed8') || parsed.rules.includes('statusCode://200'));
  const [event] = getRecentEvents();
  assert.equal(event.type, 'MISS');
  assert.equal(event.url, 'https://api.example.com/empty-body');
});

test('rules server replays with false body when it is provided directly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-boolean-body-'));
  const options = { baseDir: root };
  clearRecentEvents();

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
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'POST',
    url: 'https://api.example.com/boolean-body',
    originalReq: {
      ruleValue: 'replay',
      body: false,
    },
  }, response);

  const parsed = JSON.parse(response.body);
  assert.ok(parsed.rules.includes('resBody://{whistleApiCache'));
  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/boolean-body');
});

test('rules server prefers false originalReq.body over session body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-boolean-body-session-'));
  const options = { baseDir: root };
  clearRecentEvents();

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
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'POST',
    url: 'https://api.example.com/boolean-body-priority',
    originalReq: {
      body: false,
      ruleValue: 'replay',
    },
    getReqSession(cb: (session: any) => void) {
      cb({ req: { body: 'session-body' } });
    },
  }, response);

  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/boolean-body-priority');
});

test('rules server prefers numeric originalReq.body over session body', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-number-body-session-'));
  const options = { baseDir: root };
  clearRecentEvents();

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
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'POST',
    url: 'https://api.example.com/number-body-priority',
    originalReq: {
      body: 0,
      ruleValue: 'replay',
    },
    getReqSession(cb: (session: any) => void) {
      cb({ req: { body: 'session-body' } });
    },
  }, response);

  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/number-body-priority');
});

test('rules server prefers req.body when originalReq.body is undefined', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-undefined-body-preferred-'));
  const options = { baseDir: root };
  clearRecentEvents();

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
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'POST',
    url: 'https://api.example.com/undefined-body-preferred',
    body: Buffer.from('direct-body'),
    originalReq: {
      ruleValue: 'replay',
      body: undefined,
    },
    getReqSession(cb: (session: any) => void) {
      cb({ req: { body: 'session-body' } });
    },
  }, response);

  const parsed = JSON.parse(response.body);
  assert.ok(parsed.rules.includes('resBody://{whistleApiCache'));
  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/undefined-body-preferred');
});

test('rules server falls back req.body empty string when originalReq.body is undefined', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-rules-server-empty-req-body-with-undefined-original-'));
  const options = { baseDir: root };
  clearRecentEvents();

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
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createTextResponse();
  await handler?.({
    method: 'POST',
    url: 'https://api.example.com/empty-req-body-with-undefined-original',
    body: '',
    originalReq: {
      ruleValue: 'replay',
      body: undefined,
    },
    getReqSession(cb: (session: any) => void) {
      cb({ req: { body: 'session-body' } });
    },
  }, response);

  const parsed = JSON.parse(response.body);
  assert.ok(parsed.rules.includes('resBody://{whistleApiCache'));
  const [event] = getRecentEvents();
  assert.equal(event.type, 'HIT');
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/empty-req-body-with-undefined-original');
});

function createTextResponse() {
  return {
    body: '',
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
  };
}
