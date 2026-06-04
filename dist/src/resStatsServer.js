"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = setupResStatsServer;
const state_1 = require("./shared/state");
function setupResStatsServer(server, options) {
    server.on('request', (req) => {
        if (typeof req.getSession !== 'function') {
            console.warn('[whistle.cache] req.getSession is unavailable');
            return;
        }
        req.getSession(async (session) => {
            try {
                const originalReq = req.originalReq || session?.req || {};
                const originalRes = req.originalRes || session?.res || {};
                const method = originalReq.method || session?.req?.method || 'GET';
                const url = originalReq.fullUrl || session?.url || session?.req?.url;
                const statusCode = Number(originalRes.statusCode || session?.res?.statusCode || 0);
                const requestBody = toBuffer(originalReq.body ?? session?.req?.body);
                const responseBody = toBuffer(session?.res?.body);
                if (!url || !responseBody) {
                    console.warn('[whistle.cache] BYPASS missing url or response body');
                    (0, state_1.recordEvent)({
                        type: 'BYPASS',
                        method,
                        url,
                        reason: 'missing url or response body',
                    });
                    return;
                }
                const result = await (0, state_1.getEngine)(options).record({
                    method,
                    url,
                    requestHeaders: normalizeHeaders(originalReq.headers || session?.req?.headers || {}),
                    requestBody,
                    statusCode,
                    responseHeaders: normalizeHeaders(originalRes.headers || session?.res?.headers || {}),
                    body: responseBody,
                });
                if (result.stored) {
                    console.log(`[whistle.cache] STORE ${method} ${url}`);
                    (0, state_1.recordEvent)({ type: 'STORE', method, url });
                }
                else {
                    console.log(`[whistle.cache] BYPASS ${method} ${url}: ${result.reason || 'not cacheable'}`);
                    (0, state_1.recordEvent)({
                        type: 'BYPASS',
                        method,
                        url,
                        reason: result.reason || 'not cacheable',
                    });
                }
            }
            catch (error) {
                console.error('[whistle.cache] record failed:', error);
                (0, state_1.recordEvent)({
                    type: 'ERROR',
                    reason: error instanceof Error ? error.message : String(error),
                });
            }
        });
    });
}
function normalizeHeaders(headers) {
    const result = {};
    for (const [name, value] of Object.entries(headers)) {
        result[name.toLowerCase()] = value;
    }
    return result;
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
