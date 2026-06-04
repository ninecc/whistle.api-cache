"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const policy_1 = require("../../src/cache/policy");
const profile = {
    id: 'default',
    recordEnabled: true,
    replayEnabled: false,
    ttlSeconds: 1800,
    ignoredQueryNames: ['_t'],
    maxBodySize: 1024 * 1024,
    cacheableContentTypes: ['application/json', 'text/'],
};
(0, node_test_1.default)('accepts safe GET JSON 2xx responses', () => {
    const result = (0, policy_1.isCacheableResponse)({
        method: 'GET',
        statusCode: 200,
        requestHeaders: {},
        responseHeaders: { 'content-type': 'application/json; charset=utf-8' },
        bodySize: 42,
        profile,
    });
    strict_1.default.equal(result.cacheable, true);
});
(0, node_test_1.default)('accepts safe POST JSON 2xx responses', () => {
    const result = (0, policy_1.isCacheableResponse)({
        method: 'POST',
        statusCode: 200,
        requestHeaders: {},
        responseHeaders: { 'content-type': 'application/json; charset=utf-8' },
        bodySize: 42,
        profile,
    });
    strict_1.default.equal(result.cacheable, true);
});
(0, node_test_1.default)('rejects authenticated requests and set-cookie responses', () => {
    strict_1.default.equal((0, policy_1.isCacheableResponse)({
        method: 'GET',
        statusCode: 200,
        requestHeaders: { authorization: 'Bearer token' },
        responseHeaders: { 'content-type': 'application/json' },
        bodySize: 42,
        profile,
    }).cacheable, false);
    strict_1.default.equal((0, policy_1.isCacheableResponse)({
        method: 'GET',
        statusCode: 200,
        requestHeaders: {},
        responseHeaders: { 'content-type': 'application/json', 'set-cookie': 'sid=1' },
        bodySize: 42,
        profile,
    }).cacheable, false);
});
(0, node_test_1.default)('sanitizes replay headers and recalculates content length', () => {
    const headers = (0, policy_1.sanitizeReplayHeaders)({
        'content-type': 'application/json',
        'transfer-encoding': 'chunked',
        connection: 'keep-alive',
        'content-length': '999',
    }, 13);
    strict_1.default.deepEqual(headers, {
        'content-type': 'application/json',
        'content-length': '13',
        'x-whistle-cache': 'HIT',
    });
});
