import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IncomingMessage, ServerResponse } from 'node:http';
import { getDataDir, getEngine, getState, updateIgnoredQueryNames } from '../shared/state';

const publicDir = join(__dirname, '../../../public');

export default function setupUiServer(server: any, options?: Record<string, unknown>) {
  server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const method = req.method || 'GET';
      const url = new URL(req.url || '/', 'http://whistle.api-cache');

      if (method === 'GET' && url.pathname === '/cgi-bin/state') {
        return sendJson(res, await getState(options));
      }

      if (method === 'GET' && url.pathname === '/cgi-bin/cache') {
        return sendJson(res, { entries: await getEngine(options).list() });
      }

      if (method === 'POST' && url.pathname === '/cgi-bin/cache/clear-expired') {
        return sendJson(res, { removed: await getEngine(options).clearExpired() });
      }

      if (method === 'POST' && url.pathname === '/cgi-bin/cache/clear-all') {
        return sendJson(res, { removed: await getEngine(options).clearAll() });
      }

      if (method === 'POST' && url.pathname === '/cgi-bin/cache/delete') {
        const body = await readJsonBody(req);
        return sendJson(res, { deleted: await getEngine(options).delete(String(body.id || '')) });
      }

      if (method === 'POST' && url.pathname === '/cgi-bin/open-data-dir') {
        const dataDir = getDataDir(options);
        await openDirectory(dataDir);
        return sendJson(res, { opened: true, dataDir });
      }

      if (method === 'POST' && url.pathname === '/cgi-bin/profile/ignored-query-names') {
        const body = await readJsonBody(req);
        const names = Array.isArray(body.names) ? body.names.map(String) : [];
        return sendJson(res, { ignoredQueryNames: updateIgnoredQueryNames(names) });
      }

      return serveStatic(res, url.pathname === '/' ? '/index.html' : url.pathname);
    } catch (error) {
      console.error('[whistle.cache] ui error:', error);
      res.statusCode = 500;
      sendJson(res, { error: error instanceof Error ? error.message : String(error) });
    }
  });
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
  res.end(JSON.stringify(body));
}

async function serveStatic(res: ServerResponse, pathname: string) {
  const safePath = pathname.replace(/^\/+/, '').replace(/\.\.+/g, '');
  const filePath = join(publicDir, safePath);
  const content = await readFile(filePath);
  res.setHeader('content-type', contentType(filePath));
  res.end(content);
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  return 'application/octet-stream';
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
