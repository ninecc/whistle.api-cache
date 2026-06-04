"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = setupUiServer;
exports.getOpenDirectoryCommand = getOpenDirectoryCommand;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const state_1 = require("../shared/state");
const publicDir = (0, node_path_1.join)(__dirname, '../../../public');
function setupUiServer(server, options) {
    server.on('request', async (req, res) => {
        try {
            const method = req.method || 'GET';
            const url = new URL(req.url || '/', 'http://whistle.api-cache');
            if (method === 'GET' && url.pathname === '/cgi-bin/state') {
                return sendJson(res, await (0, state_1.getState)(options));
            }
            if (method === 'GET' && url.pathname === '/cgi-bin/cache') {
                return sendJson(res, { entries: await (0, state_1.getEngine)(options).list() });
            }
            if (method === 'POST' && url.pathname === '/cgi-bin/cache/clear-expired') {
                return sendJson(res, { removed: await (0, state_1.getEngine)(options).clearExpired() });
            }
            if (method === 'POST' && url.pathname === '/cgi-bin/cache/clear-all') {
                return sendJson(res, { removed: await (0, state_1.getEngine)(options).clearAll() });
            }
            if (method === 'POST' && url.pathname === '/cgi-bin/cache/delete') {
                const body = await readJsonBody(req);
                return sendJson(res, { deleted: await (0, state_1.getEngine)(options).delete(String(body.id || '')) });
            }
            if (method === 'POST' && url.pathname === '/cgi-bin/open-data-dir') {
                const dataDir = (0, state_1.getDataDir)(options);
                await openDirectory(dataDir);
                return sendJson(res, { opened: true, dataDir });
            }
            if (method === 'POST' && url.pathname === '/cgi-bin/profile/ignored-query-names') {
                const body = await readJsonBody(req);
                const names = Array.isArray(body.names) ? body.names.map(String) : [];
                return sendJson(res, { ignoredQueryNames: (0, state_1.updateIgnoredQueryNames)(names) });
            }
            return serveStatic(res, url.pathname === '/' ? '/index.html' : url.pathname);
        }
        catch (error) {
            console.error('[whistle.cache] ui error:', error);
            res.statusCode = 500;
            sendJson(res, { error: error instanceof Error ? error.message : String(error) });
        }
    });
}
async function openDirectory(dir) {
    await (0, promises_1.mkdir)(dir, { recursive: true });
    const { command, args } = getOpenDirectoryCommand(dir);
    const child = (0, node_child_process_1.spawn)(command, args, {
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
}
function getOpenDirectoryCommand(dir, platform = process.platform) {
    if (platform === 'darwin')
        return { command: 'open', args: [dir] };
    if (platform === 'win32')
        return { command: 'cmd', args: ['/c', 'start', '', dir] };
    return { command: 'xdg-open', args: [dir] };
}
function sendJson(res, body) {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
}
async function serveStatic(res, pathname) {
    const safePath = pathname.replace(/^\/+/, '').replace(/\.\.+/g, '');
    const filePath = (0, node_path_1.join)(publicDir, safePath);
    const content = await (0, promises_1.readFile)(filePath);
    res.setHeader('content-type', contentType(filePath));
    res.end(content);
}
function contentType(filePath) {
    if (filePath.endsWith('.html'))
        return 'text/html; charset=utf-8';
    if (filePath.endsWith('.css'))
        return 'text/css; charset=utf-8';
    if (filePath.endsWith('.js'))
        return 'application/javascript; charset=utf-8';
    return 'application/octet-stream';
}
function readJsonBody(req) {
    return new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            try {
                const raw = chunks.map((chunk) => chunk.toString()).join('');
                resolveBody(raw ? JSON.parse(raw) : {});
            }
            catch (error) {
                rejectBody(error);
            }
        });
        req.on('error', rejectBody);
    });
}
