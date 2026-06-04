import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import setupUiServer from '../../src/uiServer';
import { getEngine } from '../../src/shared/state';

test('ui server clears all cache entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-clear-all-'));
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
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createJsonResponse();
  await handler?.({ method: 'POST', url: '/cgi-bin/cache/clear-all' }, response);

  assert.deepEqual(response.body, { removed: 1 });
  assert.equal((await getEngine(options).list()).length, 0);
});

function createJsonResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    setHeader() {
      return this;
    },
    end(data?: string | Buffer) {
      this.body = data ? JSON.parse(data.toString()) : undefined;
    },
  };
}
