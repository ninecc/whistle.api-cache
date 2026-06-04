import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import setupRulesServer from '../src/rulesServer';
import { getEngine } from '../src/shared/state';

test('rules server only injects styles and does not replay cached bodies', async () => {
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

  assert.equal(
    JSON.parse(response.body).rules,
    '* style://bgColor=@1d4ed8 style://color=@dbeafe style://fontStyle=bold',
  );
  const [entry] = await getEngine(options).list();
  assert.equal(entry.hitCount, 0);
});

function createTextResponse() {
  return {
    body: '',
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
  };
}
