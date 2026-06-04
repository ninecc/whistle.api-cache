"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const uiServer_1 = __importDefault(require("../../src/uiServer"));
const state_1 = require("../../src/shared/state");
(0, node_test_1.default)('ui server clears all cache entries', async () => {
    const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'whistle-cache-ui-clear-all-'));
    const options = { baseDir: root };
    await (0, state_1.getEngine)(options).record({
        method: 'GET',
        url: 'https://api.example.com/users',
        requestHeaders: {},
        statusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        body: Buffer.from('{"ok":true}'),
    });
    let handler;
    (0, uiServer_1.default)({
        on(event, nextHandler) {
            if (event === 'request')
                handler = nextHandler;
        },
    }, options);
    const response = createJsonResponse();
    await handler?.({ method: 'POST', url: '/cgi-bin/cache/clear-all' }, response);
    strict_1.default.deepEqual(response.body, { removed: 1 });
    strict_1.default.equal((await (0, state_1.getEngine)(options).list()).length, 0);
});
function createJsonResponse() {
    return {
        statusCode: 200,
        body: undefined,
        setHeader() {
            return this;
        },
        end(data) {
            this.body = data ? JSON.parse(data.toString()) : undefined;
        },
    };
}
