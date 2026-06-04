import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import setupResStatsServer from '../resStatsServer';
import setupRulesServer from '../rulesServer';
import { clearRecentEvents, getEngine, getRecentEvents, resetStateForTests } from '../shared/state';

interface TextResponse {
  body: string;
  end(data?: string | Buffer): void;
}

export interface AutoReplayE2EResult {
  fakeServerHits: number;
  firstRules: string;
  secondRules: string;
  events: string[];
}

export async function runAutoReplayE2E(): Promise<AutoReplayE2EResult> {
  const root = await mkdtemp(join(tmpdir(), 'whistle-cache-e2e-auto-'));
  const options = { baseDir: root };
  resetStateForTests();
  await getEngine(options).clearAll();
  clearRecentEvents();

  const fakeServer = createFakeServer();
  const url = 'https://fake.local/api/users';
  try {
    const rulesHandler = createRulesHandler(options);
    const resStatsHandler = createResStatsHandler(options);

    const firstRules = await runRules(rulesHandler, url);
    if (JSON.parse(firstRules).rules.includes('statusCode://')) {
      throw new Error('first auto request unexpectedly replayed cache');
    }

    const firstResponse = fakeServer.request();
    await runResStats(resStatsHandler, url, firstResponse);
    await waitForStoredEntry(options);

    const secondRules = await runRules(rulesHandler, url);
    if (!JSON.parse(secondRules).rules.includes('statusCode://200')) {
      throw new Error(`second auto request did not replay cached status: ${secondRules}`);
    }
    if (fakeServer.hits !== 1) throw new Error(`fake server expected 1 hit, got ${fakeServer.hits}`);

    return {
      fakeServerHits: fakeServer.hits,
      firstRules,
      secondRules,
      events: getRecentEvents().map((event) => `${event.type}:${event.reason || 'ok'}`),
    };
  } finally {
    fakeServer.close();
  }
}

function createFakeServer() {
  return {
    hits: 0,
    request() {
      this.hits += 1;
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ from: 'fake-server', hit: this.hits })),
      };
    },
    close() {
      return undefined;
    },
  };
}

function createRulesHandler(options: Record<string, unknown>) {
  let handler: ((req: any, res: TextResponse) => void | Promise<void>) | undefined;
  setupRulesServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);
  if (!handler) throw new Error('rules server handler was not registered');
  return handler;
}

function createResStatsHandler(options: Record<string, unknown>) {
  let handler: ((req: any) => void) | undefined;
  setupResStatsServer({
    on(event: string, nextHandler: typeof handler) {
      if (event === 'request') handler = nextHandler;
    },
  }, options);
  if (!handler) throw new Error('res stats server handler was not registered');
  return handler;
}

async function runRules(handler: (req: any, res: TextResponse) => void | Promise<void>, url: string): Promise<string> {
  const response = createTextResponse();
  await handler({
    method: 'GET',
    url,
    originalReq: {
      method: 'GET',
      fullUrl: url,
      ruleValue: 'auto',
      headers: {},
    },
  }, response);
  return response.body;
}

async function runResStats(
  handler: (req: any) => void,
  url: string,
  response: { statusCode: number; headers: Record<string, string>; body: Buffer },
): Promise<void> {
  handler({
    originalReq: {
      method: 'GET',
      fullUrl: url,
      ruleValue: 'auto',
      headers: {},
    },
    originalRes: {
      statusCode: response.statusCode,
      headers: response.headers,
    },
    getSession(callback: (session: any) => void) {
      callback({
        req: {
          method: 'GET',
          url,
          headers: {},
        },
        res: response,
      });
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForStoredEntry(options: Record<string, unknown>): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if ((await getEngine(options).list()).length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('cache entry was not stored before e2e replay check');
}

function createTextResponse(): TextResponse {
  return {
    body: '',
    end(data?: string | Buffer) {
      this.body = data?.toString() || '';
    },
  };
}

if (process.argv[1]?.endsWith('autoReplay.js')) {
  runAutoReplayE2E()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
