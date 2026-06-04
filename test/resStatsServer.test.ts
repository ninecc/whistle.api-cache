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

test('res stats falls back to session.req.method and session.req.url when originalReq is incomplete', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-session-fallback-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  handler?.({
    originalReq: {
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
          method: 'post',
          url: 'https://api.example.com/sessions',
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
  assert.equal(event.method, 'POST');
  assert.equal(event.url, 'https://api.example.com/sessions');
  clearRecentEvents();
});

test('res stats emits BYPASS when url cannot be resolved', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-empty-url-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  handler?.({
    originalReq: {
      ruleValue: 'auto',
    },
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'GET',
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

  const event = await waitForEvent('BYPASS');
  assert.equal(event.type, 'BYPASS');
  assert.equal(event.reason, 'missing url or response body');
  assert.equal(await getEngine(options).list(), 0);
});

test('res stats falls back requestBody from session.req.body when originalReq.body is absent', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-session-body-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const url = 'https://api.example.com/post-with-body';

  handler?.({
    originalReq: {
      ruleValue: 'auto',
    },
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'POST',
          url,
          body: Buffer.from('action=save'),
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

  const storeEvent = await waitForEvent('STORE');
  assert.equal(storeEvent.type, 'STORE');

  const replay = await getEngine(options).replay({
    method: 'POST',
    url,
    requestBody: Buffer.from('action=save'),
  });
  assert.equal(replay.hit, true);
});

test('res stats treats empty-string originalReq.body as missing and falls back to session req body', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-session-empty-body-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const url = 'https://api.example.com/post-with-empty-body';

  handler?.({
    originalReq: {
      ruleValue: 'auto',
      body: '',
    },
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'POST',
          url,
          body: Buffer.from('action=save'),
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

  const storeEvent = await waitForEvent('STORE');
  assert.equal(storeEvent.type, 'STORE');

  const replay = await getEngine(options).replay({
    method: 'POST',
    url,
    requestBody: Buffer.from('action=save'),
  });
  assert.equal(replay.hit, true);
});

test('res stats falls back when req.body is empty string', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-req-empty-body-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const url = 'https://api.example.com/post-with-empty-req-body';

  handler?.({
    originalReq: {
      ruleValue: 'auto',
      method: 'POST',
      fullUrl: url,
      body: '',
    },
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'POST',
          url,
          body: Buffer.from('action=save'),
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

  const storeEvent = await waitForEvent('STORE');
  assert.equal(storeEvent.type, 'STORE');

  const replay = await getEngine(options).replay({
    method: 'POST',
    url,
    requestBody: Buffer.from('action=save'),
  });
  assert.equal(replay.hit, true);
});

test('res stats falls back when req.body is undefined', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-req-undefined-body-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const url = 'https://api.example.com/post-with-undefined-req-body';

  handler?.({
    originalReq: {
      ruleValue: 'auto',
      method: 'POST',
      fullUrl: url,
      body: undefined,
    },
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'POST',
          url,
          body: Buffer.from('action=save'),
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

  const storeEvent = await waitForEvent('STORE');
  assert.equal(storeEvent.type, 'STORE');

  const replay = await getEngine(options).replay({
    method: 'POST',
    url,
    requestBody: Buffer.from('action=save'),
  });
  assert.equal(replay.hit, true);
});

test('res stats falls back when originalReq.body is null and req.body is empty', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-null-req-empty-body-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const url = 'https://api.example.com/post-with-null-body-and-empty-req-body';

  handler?.({
    originalReq: {
      ruleValue: 'auto',
      method: 'POST',
      fullUrl: url,
      body: null,
    },
    body: '',
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'POST',
          url,
          body: Buffer.from('action=save'),
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

  const storeEvent = await waitForEvent('STORE');
  assert.equal(storeEvent.type, 'STORE');

  const replay = await getEngine(options).replay({
    method: 'POST',
    url,
    requestBody: Buffer.from('action=save'),
  });
  assert.equal(replay.hit, true);
});

test('res stats preserves originalReq body when it is undefined and req.body has value', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-req-body-precedence-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const url = 'https://api.example.com/post-with-req-body-preferred';

  handler?.({
    originalReq: {
      ruleValue: 'auto',
      method: 'POST',
      fullUrl: url,
      body: undefined,
    },
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    body: Buffer.from('request-body-direct'),
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'POST',
          url,
          body: Buffer.from('session-body'),
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

  const storeEvent = await waitForEvent('STORE');
  assert.equal(storeEvent.type, 'STORE');

  const replayByRequestBody = await getEngine(options).replay({
    method: 'POST',
    url,
    requestBody: Buffer.from('request-body-direct'),
  });
  assert.equal(replayByRequestBody.hit, true);

  const replayBySessionBody = await getEngine(options).replay({
    method: 'POST',
    url,
    requestBody: Buffer.from('session-body'),
  });
  assert.equal(replayBySessionBody.hit, false);
});

test('res stats treats missing originalReq.body and req.body as missing body', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-missing-both-body-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const url = 'https://api.example.com/post-with-missing-both-body';

  handler?.({
    originalReq: {
      ruleValue: 'auto',
      method: 'POST',
      fullUrl: url,
    },
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'POST',
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

  const storeEvent = await waitForEvent('STORE');
  assert.equal(storeEvent.type, 'STORE');

  const replay = await getEngine(options).replay({
    method: 'POST',
    url,
  });
  assert.equal(replay.hit, true);
});

test('res stats falls back to session body when originalReq.body is null', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-null-body-session-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const url = 'https://api.example.com/post-with-null-body';

  handler?.({
    originalReq: {
      ruleValue: 'auto',
      body: null,
      method: 'POST',
      fullUrl: url,
    },
    originalRes: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'POST',
          url,
          body: Buffer.from('action=save'),
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

  const storeEvent = await waitForEvent('STORE');
  assert.equal(storeEvent.type, 'STORE');

  const replay = await getEngine(options).replay({
    method: 'POST',
    url,
    requestBody: Buffer.from('action=save'),
  });
  assert.equal(replay.hit, true);
});

test('res stats prefers originalReq.body over session body for non-empty values', async () => {
  clearRecentEvents();
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-res-stats-non-empty-body-priority-'));
  const options = { baseDir: root };

  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);

  const url = 'https://api.example.com/post-with-priority-body';

  const cases: Array<[unknown, string]> = [
    [0, '0'],
    [false, 'false'],
  ];

  for (const [bodyValue, expectedBody] of cases) {
    clearRecentEvents();
    handler?.({
      originalReq: {
        ruleValue: 'auto',
        body: bodyValue,
      },
      originalRes: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
      },
      getSession(callback: (session: any) => void) {
        callback({
          req: {
            method: 'POST',
            url,
            body: Buffer.from('session-body'),
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

    const storeEvent = await waitForEvent('STORE');
    assert.equal(storeEvent.type, 'STORE');

    const replay = await getEngine(options).replay({
      method: 'POST',
      url,
      requestBody: Buffer.from(expectedBody),
    });
    assert.equal(replay.hit, true);
  }
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
