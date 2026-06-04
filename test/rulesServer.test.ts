import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import setupRulesServer from '../src/rulesServer';
import { consumeRecentReplayHit, getEngine } from '../src/shared/state';

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

function createTextResponse() {
  return {
    body: '',
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
  };
}
