"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = setupServer;
const state_1 = require("./shared/state");
function setupServer(server, options) {
    server.on('request', async (req, res) => {
        const originalReq = req.originalReq || req;
        const method = originalReq.method || req.method || 'GET';
        const fullUrl = originalReq.fullUrl || req.fullUrl || req.url;
        if (!fullUrl) {
            return passThrough(req, res);
        }
        try {
            const requestBody = await getBufferedRequestBody(req, originalReq);
            const replay = await (0, state_1.getEngine)(options).replay({ method, url: fullUrl, requestBody });
            if (!replay.hit) {
                (0, state_1.recordEvent)({ type: 'MISS', method, url: fullUrl, reason: 'cache miss or expired' });
                return passThrough(req, res);
            }
            (0, state_1.recordEvent)({ type: 'HIT', method, url: fullUrl });
            res.statusCode = replay.statusCode;
            for (const [name, value] of Object.entries(replay.headers)) {
                res.setHeader(name, value);
            }
            res.end(replay.body);
        }
        catch (error) {
            console.error('[whistle.cache] replay failed:', error);
            (0, state_1.recordEvent)({
                type: 'ERROR',
                method,
                url: fullUrl,
                reason: error instanceof Error ? error.message : String(error),
            });
            passThrough(req, res);
        }
    });
}
function passThrough(req, res) {
    if (typeof req.passThrough === 'function') {
        req.passThrough();
        return;
    }
    res.statusCode = 502;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('x-whistle-cache', 'MISS');
    res.end('whistle.cache miss and passThrough is unavailable');
}
async function getBufferedRequestBody(req, originalReq) {
    const directBody = toBuffer(originalReq?.body ?? req?.body);
    if (directBody)
        return directBody;
    if (typeof req.getReqSession !== 'function')
        return undefined;
    return new Promise((resolveBody) => {
        req.getReqSession((session) => {
            resolveBody(toBuffer(session?.req?.body));
        });
    });
}
function toBuffer(body) {
    if (body === undefined || body === null)
        return undefined;
    if (body instanceof Buffer)
        return body;
    if (typeof body === 'string')
        return Buffer.from(body);
    if (body instanceof Uint8Array)
        return Buffer.from(body);
    return Buffer.from(String(body));
}
