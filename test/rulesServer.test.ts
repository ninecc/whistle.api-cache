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
      method: 'POST',
      fullUrl: 'https://api.example.com/search',
      ruleValue: 'replay',
    },
  }, response);

  const [event] = getRecentEvents();
  assert.equal(event.type, 'MISS');
  assert.equal(event.reason, 'REPLAY MISS -> PASS THROUGH: ambiguous POST candidates: 2');
  clearRecentEvents();
});

function createTextResponse() {
  return {
    body: '',
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
  };
}
