import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import setupUiServer from '../../src/uiServer';
import { getEngine, getRecentEvents, recordEvent, clearRecentEvents } from '../../src/shared/state';

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

test('ui server accepts plugin-prefixed cgi paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-prefixed-'));
  const options = { baseDir: root };
  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createJsonResponse();
  await handler?.({ method: 'GET', url: '/whistle.api-cache/cgi-bin/events?after=0' }, response);

  assert.deepEqual(response.body, { events: [] });
});

test('ui server clears recent diagnostic events', async () => {
  clearRecentEvents();
  recordEvent({
    type: 'MISS',
    method: 'GET',
    url: 'https://api.example.com/users',
  });

  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-clear-events-'));
  const options = { baseDir: root };
  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createJsonResponse();
  await handler?.({ method: 'POST', url: '/whistle.api-cache/cgi-bin/events/clear' }, response);

  assert.deepEqual(response.body, { removed: 1 });
  assert.deepEqual(getRecentEvents(), []);
  clearRecentEvents();
});

test('ui server returns an empty favicon response without throwing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-ui-favicon-'));
  const options = { baseDir: root };
  let handler: ((req: any, res: any) => void | Promise<void>) | undefined;
  setupUiServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const response = createEmptyResponse();
  await handler?.({ method: 'GET', url: '/whistle.api-cache/favicon.ico' }, response);

  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
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

function createEmptyResponse() {
  return {
    statusCode: 200,
    ended: false,
    setHeader() {
      return this;
    },
    end() {
      this.ended = true;
    },
  };
}
