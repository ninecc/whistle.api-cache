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

