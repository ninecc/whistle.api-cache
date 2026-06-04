import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import setupResStatsServer from '../src/resStatsServer';
import {
  clearRecentEvents,
  getEngine,
  getRecentEvents,
  markRecentReplayHit,
} from '../src/shared/state';

test('res stats skips recording responses served from replay hits', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-replay-'));
  const options = { baseDir: root };
  const url = 'https://api.example.com/users';
  markRecentReplayHit('GET', url);

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  handler?.({
    originalReq: {
      method: 'GET',
      fullUrl: url,
      ruleValue: 'auto',
      headers: {},
    },
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'GET',
          url,
          headers: {},
        },
        res: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"ok":true}'),
        },
      });
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal((await getEngine(options).list()).length, 0);
  assert.deepEqual(getRecentEvents(), []);
});

test('res stats records requestId on store diagnostics', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-request-id-'));
  const options = { baseDir: root };
  const url = 'https://api.example.com/users';

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  handler?.({
    originalReq: {
      id: 'req-store-1',
      method: 'GET',
      fullUrl: url,
      ruleValue: 'auto',
      headers: {},
    },
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'GET',
          url,
          headers: {},
        },
        res: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"ok":true}'),
        },
      });
    },
  });

  const event = await waitForEvent('STORE');
  assert.equal(event.type, 'STORE');
  assert.equal(event.requestId, 'req-store-1');
  clearRecentEvents();
});

async function waitForEvent(type: string) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    const event = getRecentEvents().find((item) => item.type === type);
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${type} event`);
}
