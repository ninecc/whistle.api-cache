import http, { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_FAKE_API_PORT = 18080;
const DEFAULT_WHISTLE_PORT = 8899;
const PREFIX = '/__whistle_api_cache_e2e';
const E2E_RULES_NAME = 'plugin_api_cache_e2e';

interface JsonResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

interface ScenarioResult {
  name: string;
  fakeServerHits: number;
  first: unknown;
  second: unknown;
  replayed: boolean;
}

interface RulesProperties {
  filesOrder?: string[];
  selectedList?: string[];
  [key: string]: unknown;
}

interface InstallRulesOptions {
  rulesDir?: string;
  fakeApiPort: number;
  selectForRun: boolean;
  whistlePort?: number;
}

export function createWhistleLocalE2ERules(fakeApiPort: number): string {
  return [
    '# whistle.api-cache 本机真实联调临时规则',
    '# 测试完成后删除本段规则即可',
    `http://127.0.0.1:${fakeApiPort}${PREFIX} whistle.api-cache://auto`,
    `http://localhost:${fakeApiPort}${PREFIX} whistle.api-cache://auto`,
  ].join('\n');
}

export async function installWhistleLocalE2ERules(options: InstallRulesOptions): Promise<() => Promise<void>> {
  if (!options.rulesDir) {
    return installWhistleLocalE2ERulesViaApi(options.whistlePort || DEFAULT_WHISTLE_PORT, options.fakeApiPort, options.selectForRun);
  }
  return installWhistleLocalE2ERulesOnDisk(options);
}

async function installWhistleLocalE2ERulesViaApi(
  whistlePort: number,
  fakeApiPort: number,
  selectForRun: boolean,
): Promise<() => Promise<void>> {
  const previousSelectedList = await getSelectedRulesList(whistlePort);
  const value = createWhistleLocalE2ERules(fakeApiPort);
  await postWhistleCgi(whistlePort, '/cgi-bin/rules/add', {
    name: E2E_RULES_NAME,
    value,
  });

  if (selectForRun) {
    for (const name of previousSelectedList) {
      if (name !== E2E_RULES_NAME) {
        await postWhistleCgi(whistlePort, '/cgi-bin/rules/unselect', { name, value: '' });
      }
    }
    await postWhistleCgi(whistlePort, '/cgi-bin/rules/select', { name: E2E_RULES_NAME, value });
  }

  return async () => {
    if (!selectForRun) return;
    await postWhistleCgi(whistlePort, '/cgi-bin/rules/unselect', { name: E2E_RULES_NAME, value });
    for (const name of previousSelectedList) {
      await postWhistleCgi(whistlePort, '/cgi-bin/rules/select', { name, value: '' });
    }
  };
}

async function installWhistleLocalE2ERulesOnDisk(options: InstallRulesOptions): Promise<() => Promise<void>> {
  const rulesDir = options.rulesDir || getDefaultWhistleRulesDir();
  const filesDir = join(rulesDir, 'files');
  const propertiesPath = join(rulesDir, 'properties');
  await mkdir(filesDir, { recursive: true });

  const properties = await readRulesProperties(propertiesPath);
  const previousSelectedList = Array.isArray(properties.selectedList) ? [...properties.selectedList] : [];
  const existing = await findRulesFile(filesDir, E2E_RULES_NAME);
  const fileName = existing || `${await nextRulesIndex(filesDir)}.${encodeURIComponent(E2E_RULES_NAME)}`;

  await writeFile(join(filesDir, fileName), createWhistleLocalE2ERules(options.fakeApiPort));

  const filesOrder = Array.isArray(properties.filesOrder) ? properties.filesOrder : [];
  if (!filesOrder.includes(E2E_RULES_NAME)) filesOrder.push(E2E_RULES_NAME);
  properties.filesOrder = filesOrder;
  if (options.selectForRun) properties.selectedList = [E2E_RULES_NAME];
  await writeRulesProperties(propertiesPath, properties);

  return async () => {
    const latest = await readRulesProperties(propertiesPath);
    latest.selectedList = previousSelectedList;
    await writeRulesProperties(propertiesPath, latest);
  };
}

export async function runWhistleLocalE2E(): Promise<ScenarioResult[]> {
  const fakeApiPort = readPort('FAKE_API_PORT', DEFAULT_FAKE_API_PORT);
  const whistlePort = readPort('WHISTLE_PORT', DEFAULT_WHISTLE_PORT);
  const run = process.env.WHISTLE_E2E_RUN === '1';
  const runId = `run-${Date.now()}`;
  const restoreRulesSelection = await installWhistleLocalE2ERules({
    fakeApiPort,
    whistlePort,
    selectForRun: run,
  });

  console.log(`\n已写入 Rules 列表：${E2E_RULES_NAME}`);
  console.log('\nRules 内容：\n');
  console.log(createWhistleLocalE2ERules(fakeApiPort));

  if (!run) {
    await restoreRulesSelection();
    console.log('\n准备好后运行：WHISTLE_E2E_RUN=1 npm run e2e:whistle-local');
    return [];
  }

  const fakeServer = createFakeApiServer();
  try {
    await listen(fakeServer, fakeApiPort);
    await assertWhistleReachable(whistlePort);
    const results = [
      await runGetAutoReplayScenario(fakeApiPort, whistlePort, runId),
      await runPostBodyReplayScenario(fakeApiPort, whistlePort, runId),
    ];
    console.log(JSON.stringify({ ok: true, results }, null, 2));
    return results;
  } finally {
    if (fakeServer.listening) {
      fakeServer.close();
      await once(fakeServer, 'close');
    }
    await restoreRulesSelection();
  }
}

async function readRulesProperties(propertiesPath: string): Promise<RulesProperties> {
  try {
    return JSON.parse(await readFile(propertiesPath, 'utf8'));
  } catch (_) {
    return {};
  }
}

async function writeRulesProperties(propertiesPath: string, properties: RulesProperties): Promise<void> {
  await mkdir(join(propertiesPath, '..'), { recursive: true });
  await writeFile(propertiesPath, JSON.stringify(properties, null, 2));
}

async function findRulesFile(filesDir: string, name: string): Promise<string | undefined> {
  let files: string[];
  try {
    files = await readdir(filesDir);
  } catch (_) {
    return undefined;
  }
  return files.find((file) => decodeRulesFileName(file)?.name === name);
}

async function nextRulesIndex(filesDir: string): Promise<number> {
  let files: string[];
  try {
    files = await readdir(filesDir);
  } catch (_) {
    return 0;
  }
  return files.reduce((max, file) => Math.max(max, decodeRulesFileName(file)?.index ?? -1), -1) + 1;
}

function decodeRulesFileName(file: string): { index: number; name: string } | undefined {
  const match = /^(\d+)\.(.+)$/.exec(file);
  if (!match) return undefined;
  try {
    return { index: Number(match[1]), name: decodeURIComponent(match[2]) };
  } catch (_) {
    return { index: Number(match[1]), name: match[2] };
  }
}

function getDefaultWhistleRulesDir(): string {
  const root = process.env.WHISTLE_PATH || (process.env.HOME ? join(process.env.HOME, '.WhistleAppData') : '');
  if (!root) throw new Error('无法定位 Whistle rules 目录：请设置 WHISTLE_PATH 或 HOME');
  return join(root, '.whistle', 'rules');
}

function createFakeApiServer(): http.Server {
  const counters = new Map<string, number>();

  return http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (!url.pathname.startsWith(PREFIX)) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    const body = await readBody(req);
    const key = `${req.method || 'GET'} ${url.pathname} ${body}`;
    const hits = (counters.get(key) || 0) + 1;
    counters.set(key, hits);

    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      from: 'fake-api',
      method: req.method,
      path: url.pathname,
      body,
      hits,
    }));
  });
}

async function runGetAutoReplayScenario(fakeApiPort: number, whistlePort: number, runId: string): Promise<ScenarioResult> {
  const url = `http://127.0.0.1:${fakeApiPort}${PREFIX}/${runId}/users`;
  const first = await requestViaWhistle(whistlePort, 'GET', url);
  await waitForCacheEntries(whistlePort, url, 1);
  const second = await requestViaWhistle(whistlePort, 'GET', url);
  const firstBody = parseJson(first.body);
  const secondBody = parseJson(second.body);
  assertReplay('GET auto replay', firstBody, secondBody);
  return {
    name: 'GET auto replay',
    fakeServerHits: Number(secondBody.hits),
    first: firstBody,
    second: secondBody,
    replayed: second.headers['x-whistle-cache'] === 'HIT',
  };
}

async function runPostBodyReplayScenario(fakeApiPort: number, whistlePort: number, runId: string): Promise<ScenarioResult> {
  const url = `http://127.0.0.1:${fakeApiPort}${PREFIX}/${runId}/post-body`;
  const alpha = JSON.stringify({ keyword: 'alpha' });
  const beta = JSON.stringify({ keyword: 'beta' });

  const firstAlpha = await requestViaWhistle(whistlePort, 'POST', url, alpha);
  await waitForCacheEntries(whistlePort, url, 1);
  await requestViaWhistle(whistlePort, 'POST', url, beta);
  await waitForCacheEntries(whistlePort, url, 2);
  const secondAlpha = await requestViaWhistle(whistlePort, 'POST', url, alpha);

  const firstBody = parseJson(firstAlpha.body);
  const secondBody = parseJson(secondAlpha.body);
  assertReplay('POST body replay', firstBody, secondBody);
  return {
    name: 'POST body replay',
    fakeServerHits: Number(secondBody.hits),
    first: firstBody,
    second: secondBody,
    replayed: secondAlpha.headers['x-whistle-cache'] === 'HIT',
  };
}

async function assertWhistleReachable(whistlePort: number): Promise<void> {
  try {
    await requestViaWhistle(whistlePort, 'GET', 'http://127.0.0.1/');
  } catch (error) {
    throw new Error(`无法通过 127.0.0.1:${whistlePort} 访问 Whistle 代理，请先确认 w2 status --all 显示实例运行。原始错误：${formatError(error)}`);
  }
}

async function getSelectedRulesList(whistlePort: number): Promise<string[]> {
  const response = await requestWhistleManagement(whistlePort, 'GET', '/cgi-bin/rules/list');
  const data = parseJson(response.body);
  if (!Array.isArray(data.list)) return [];
  return data.list
    .filter((item: any) => item && item.selected && typeof item.name === 'string')
    .map((item: any) => item.name);
}

async function postWhistleCgi(
  whistlePort: number,
  path: string,
  fields: Record<string, string>,
): Promise<void> {
  const body = new URLSearchParams(fields).toString();
  const response = await requestWhistleManagement(whistlePort, 'POST', path, body);
  const data = parseJson(response.body);
  if (data.ec !== 0) {
    throw new Error(`Whistle 管理接口 ${path} 返回失败：${response.body.slice(0, 200)}`);
  }
}

async function waitForCacheEntries(whistlePort: number, url: string, minCount: number): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const entries = await listPluginCacheEntries(whistlePort);
    const count = entries.filter((entry: any) => entry && (entry.url === url || entry.normalizedUrl === url)).length;
    if (count >= minCount) return;
    await delay(50);
  }
  throw new Error(`等待缓存录制超时：${url}，期望至少 ${minCount} 条缓存。请在 whistle.api-cache 面板查看最近诊断是否有 STORE/BYPASS/ERROR。`);
}

async function listPluginCacheEntries(whistlePort: number): Promise<any[]> {
  const response = await requestWhistleManagement(whistlePort, 'GET', '/whistle.api-cache/cgi-bin/cache');
  const data = parseJson(response.body);
  return Array.isArray(data.entries) ? data.entries : [];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWhistleManagement(
  whistlePort: number,
  method: string,
  path: string,
  body?: string,
): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {};
    if (body !== undefined) {
      headers['content-type'] = 'application/x-www-form-urlencoded; charset=utf-8';
      headers['content-length'] = Buffer.byteLength(body);
    }

    const req = http.request({
      host: '127.0.0.1',
      port: whistlePort,
      method,
      path,
      headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({
        statusCode: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString(),
      }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function requestViaWhistle(
  whistlePort: number,
  method: string,
  targetUrl: string,
  body?: string,
): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const headers: Record<string, string | number> = {
      host: target.host,
    };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(body);
    }

    const req = http.request({
      host: '127.0.0.1',
      port: whistlePort,
      method,
      path: targetUrl,
      headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({
        statusCode: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString(),
      }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function assertReplay(name: string, firstBody: any, secondBody: any): void {
  if (firstBody.hits !== 1 || secondBody.hits !== 1) {
    throw new Error(`${name} 未命中缓存回放：首次 hits=${firstBody.hits}，二次 hits=${secondBody.hits}。请确认 Whistle Rules 使用脚本当前输出的 http:// 前缀规则，且 whistle.api-cache 插件已启用。`);
  }
}

function parseJson(body: string): any {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`响应不是 JSON：${body.slice(0, 200)}；原始错误：${formatError(error)}`);
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function listen(server: http.Server, port: number): Promise<void> {
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
}

function readPort(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`${name} 必须是有效端口号，当前值：${value}`);
  }
  return parsed;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1]?.endsWith('whistleLocal.js')) {
  runWhistleLocalE2E().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
