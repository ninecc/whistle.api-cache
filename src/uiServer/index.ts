import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IncomingMessage, ServerResponse } from 'node:http';
import {
  getDataDir,
  getEngine,
  getRecentEvents,
  getState,
  clearRecentEvents,
  updateIgnoredQueryNames,
} from '../shared/state';
import { DeleteBatchInput, TtlOperation, UpdateTtlInput } from '../cache/engine';

const publicDir = join(__dirname, '../../../public');
const pluginBasePath = '/whistle.api-cache';

export default function setupUiServer(server: any, options?: Record<string, unknown>) {
  server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const method = req.method || 'GET';
      const url = new URL(req.url || '/', 'http://whistle.api-cache');
      const pathname = normalizePathname(url.pathname);

      if (method === 'GET' && pathname === '/cgi-bin/state') {
        return sendJson(res, await getState(options));
      }

      if (method === 'GET' && pathname === '/cgi-bin/events') {
        return sendJson(res, { events: getEventsAfter(url.searchParams.get('after')) });
      }

      if (method === 'POST' && pathname === '/cgi-bin/events/clear') {
        return sendJson(res, { removed: clearRecentEvents() });
      }

      if (method === 'GET' && pathname === '/cgi-bin/cache') {
        return sendJson(res, { entries: await getEngine(options).list() });
      }

      if (method === 'GET' && pathname === '/cgi-bin/cache/export') {
        return sendJson(res, await getEngine(options).exportBundle());
      }

      if (method === 'POST' && pathname === '/cgi-bin/cache/clear-expired') {
        return sendJson(res, { removed: await getEngine(options).clearExpired() });
      }

      if (method === 'POST' && pathname === '/cgi-bin/cache/clear-all') {
        return sendJson(res, { removed: await getEngine(options).clearAll() });
      }

      if (method === 'POST' && pathname === '/cgi-bin/cache/delete') {
        const body = await readJsonBody(req);
        return sendJson(res, { deleted: await getEngine(options).delete(String(body.id || '')) });
      }

      if (method === 'POST' && pathname === '/cgi-bin/cache/delete-batch') {
        const body = await readJsonBody(req);
        return sendJson(res, { removed: await getEngine(options).deleteBatch(parseDeleteBatchBody(body)) });
      }

      if (method === 'POST' && pathname === '/cgi-bin/cache/enabled') {
        const body = await readJsonBody(req);
        return sendJson(res, {
          updated: await getEngine(options).setEnabled(String(body.id || ''), Boolean(body.enabled)),
        });
      }

      if (method === 'POST' && pathname === '/cgi-bin/cache/ttl') {
        const body = await readJsonBody(req);
        return sendJson(res, { updated: await getEngine(options).updateTtl(parseUpdateTtlBody(body)) });
      }

      if (method === 'POST' && pathname === '/cgi-bin/cache/import') {
        const body = await readJsonBody(req);
        return sendJson(res, { imported: await getEngine(options).importBundle(body.bundle as any) });
      }

      if (method === 'POST' && pathname === '/cgi-bin/cache/match') {
        const body = await readJsonBody(req);
        const requestBody = typeof body.requestBody === 'string' && body.requestBody.length
          ? Buffer.from(body.requestBody)
          : undefined;
        return sendJson(res, await getEngine(options).match({
          method: String(body.method || 'GET'),
          url: String(body.url || ''),
          requestBody,
        }));
      }

      if (method === 'POST' && pathname === '/cgi-bin/open-data-dir') {
        const dataDir = getDataDir(options);
        await openDirectory(dataDir);
        return sendJson(res, { opened: true, dataDir });
      }

      if (method === 'POST' && pathname === '/cgi-bin/profile/ignored-query-names') {
        const body = await readJsonBody(req);
        const names = Array.isArray(body.names) ? body.names.map(String) : [];
        return sendJson(res, { ignoredQueryNames: updateIgnoredQueryNames(names) });
      }

      return serveStatic(res, pathname === '/' ? '/index.html' : pathname);
    } catch (error) {
      console.error('[whistle.cache] ui error:', error);
      res.statusCode = 500;
      sendJson(res, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

function normalizePathname(pathname: string): string {
  if (pathname === pluginBasePath) return '/';
  if (pathname.startsWith(`${pluginBasePath}/`)) return pathname.slice(pluginBasePath.length);
  return pathname;
}

function getEventsAfter(after: string | null) {
  const afterId = Number(after || 0);
  return getRecentEvents().filter((event) => !Number.isFinite(afterId) || event.id > afterId);
}

async function openDirectory(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const { command, args } = getOpenDirectoryCommand(dir);
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

export function getOpenDirectoryCommand(
  dir: string,
  platform: typeof process.platform = process.platform,
): { command: string; args: string[] } {
  if (platform === 'darwin') return { command: 'open', args: [dir] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', dir] };
  return { command: 'xdg-open', args: [dir] };
}

function sendJson(res: ServerResponse, body: unknown) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function serveStatic(res: ServerResponse, pathname: string) {
  const safePath = pathname.replace(/^\/+/, '').replace(/\.\.+/g, '');
  const filePath = join(publicDir, safePath);
  const content = await readStaticFile(res, filePath, pathname);
  if (!content) return;
  res.setHeader('content-type', contentType(filePath));
  res.setHeader('cache-control', 'no-store');
  res.end(content);
}

async function readStaticFile(res: ServerResponse, filePath: string, pathname: string): Promise<Buffer | undefined> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (isNotFoundError(error)) {
      res.statusCode = pathname === '/favicon.ico' ? 204 : 404;
      res.end();
      return undefined;
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  return 'application/octet-stream';
}

function parseDeleteBatchBody(body: Record<string, unknown>): DeleteBatchInput {
  const scope = String(body.scope || '');
  if (scope === 'ids') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    return { scope, ids };
  }
  if (scope === 'same-host' || scope === 'same-path') {
    return { scope, entryId: String(body.entryId || '') };
  }
  if (scope === 'expired' || scope === 'never-hit') {
    return { scope };
  }
  return { scope: 'ids' as const, ids: [] };
}

function parseUpdateTtlBody(body: Record<string, unknown>): UpdateTtlInput {
  return {
    ...parseDeleteBatchBody(body),
    operation: parseTtlOperation(body.operation),
  };
}

function parseTtlOperation(value: unknown): TtlOperation {
  const operation = String(value || '');
  if (
    operation === 'extend-30m' ||
    operation === 'never-expire' ||
    operation === 'default-ttl' ||
    operation === 'expire-now'
  ) {
    return operation;
  }
  return 'default-ttl';
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = chunks.map((chunk) => chunk.toString()).join('');
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (error) {
        rejectBody(error);
      }
    });
    req.on('error', rejectBody);
  });
}
