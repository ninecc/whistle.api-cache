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
const engine_1 = require("../../src/cache/engine");
const store_1 = require("../../src/cache/store");
const profile = {
    id: 'default',
    recordEnabled: true,
    replayEnabled: true,
    ttlSeconds: 1800,
    ignoredQueryNames: ['_t'],
    maxBodySize: 1024 * 1024,
    cacheableContentTypes: ['application/json', 'text/'],
};
(0, node_test_1.default)('records cacheable responses and replays them by key', async () => {
    const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'whistle-cache-engine-'));
    const engine = new engine_1.CacheEngine(new store_1.FileCacheStore(root), profile);
    const recorded = await engine.record({
        method: 'GET',
        url: 'https://api.example.com/users?_t=9',
        requestHeaders: {},
        statusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        body: Buffer.from('{"users":[]}'),
    });
    strict_1.default.equal(recorded.stored, true);
    const replay = await engine.replay({
        method: 'GET',
        url: 'https://api.example.com/users?_t=10',
    });
    strict_1.default.equal(replay.hit, true);
    if (replay.hit) {
        strict_1.default.equal(replay.statusCode, 200);
        strict_1.default.equal(replay.body.toString(), '{"users":[]}');
        strict_1.default.equal(replay.headers['x-whistle-cache'], 'HIT');
    }
});
(0, node_test_1.default)('bypasses unsafe responses and misses absent cache entries', async () => {
    const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'whistle-cache-engine-bypass-'));
    const engine = new engine_1.CacheEngine(new store_1.FileCacheStore(root), profile);
    const recorded = await engine.record({
        method: 'PUT',
        url: 'https://api.example.com/users',
        requestHeaders: {},
        statusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        body: Buffer.from('{"ok":true}'),
    });
    strict_1.default.equal(recorded.stored, false);
    strict_1.default.equal((await engine.replay({ method: 'GET', url: 'https://api.example.com/users' })).hit, false);
});
(0, node_test_1.default)('records and replays POST responses by request body', async () => {
    const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'whistle-cache-engine-post-'));
    const engine = new engine_1.CacheEngine(new store_1.FileCacheStore(root), profile);
    await engine.record({
        method: 'POST',
        url: 'https://api.example.com/search',
        requestHeaders: {},
        requestBody: Buffer.from('{"keyword":"alpha"}'),
        statusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        body: Buffer.from('{"result":"alpha"}'),
    });
    await engine.record({
        method: 'POST',
        url: 'https://api.example.com/search',
        requestHeaders: {},
        requestBody: Buffer.from('{"keyword":"beta"}'),
        statusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        body: Buffer.from('{"result":"beta"}'),
    });
    const alphaReplay = await engine.replay({
        method: 'POST',
        url: 'https://api.example.com/search',
        requestBody: Buffer.from('{"keyword":"alpha"}'),
    });
    const missingReplay = await engine.replay({
        method: 'POST',
        url: 'https://api.example.com/search',
        requestBody: Buffer.from('{"keyword":"gamma"}'),
    });
    strict_1.default.equal(alphaReplay.hit, true);
    if (alphaReplay.hit) {
        strict_1.default.equal(alphaReplay.body.toString(), '{"result":"alpha"}');
    }
    strict_1.default.equal(missingReplay.hit, false);
});
(0, node_test_1.default)('replays the only matching POST entry when request body is unavailable', async () => {
    const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'whistle-cache-engine-post-fallback-'));
    const engine = new engine_1.CacheEngine(new store_1.FileCacheStore(root), {
        ...profile,
        ignoredQueryNames: ['wsgsig'],
    });
    await engine.record({
        method: 'POST',
        url: 'https://api.example.com/search?wsgsig=first',
        requestHeaders: {},
        requestBody: Buffer.from('{"keyword":"alpha"}'),
        statusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        body: Buffer.from('{"result":"alpha"}'),
    });
    const replay = await engine.replay({
        method: 'POST',
        url: 'https://api.example.com/search?wsgsig=second',
    });
    strict_1.default.equal(replay.hit, true);
    if (replay.hit) {
        strict_1.default.equal(replay.body.toString(), '{"result":"alpha"}');
    }
});
(0, node_test_1.default)('misses ambiguous POST entries when request body is unavailable', async () => {
    const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'whistle-cache-engine-post-ambiguous-'));
    const engine = new engine_1.CacheEngine(new store_1.FileCacheStore(root), profile);
    await engine.record({
        method: 'POST',
        url: 'https://api.example.com/search',
        requestHeaders: {},
        requestBody: Buffer.from('{"keyword":"alpha"}'),
        statusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        body: Buffer.from('{"result":"alpha"}'),
    });
    await engine.record({
        method: 'POST',
        url: 'https://api.example.com/search',
        requestHeaders: {},
        requestBody: Buffer.from('{"keyword":"beta"}'),
        statusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        body: Buffer.from('{"result":"beta"}'),
    });
    const replay = await engine.replay({
        method: 'POST',
        url: 'https://api.example.com/search',
    });
    strict_1.default.equal(replay.hit, false);
});
(0, node_test_1.default)('replays entries when ignored query names change between requests', async () => {
    const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'whistle-cache-engine-ignore-query-'));
    const engine = new engine_1.CacheEngine(new store_1.FileCacheStore(root), {
        ...profile,
        ignoredQueryNames: ['wsgsig'],
    });
    await engine.record({
        method: 'GET',
        url: 'https://api.example.com/users?wsgsig=first&page=1',
        requestHeaders: {},
        statusCode: 200,
        responseHeaders: { 'content-type': 'application/json' },
        body: Buffer.from('{"ok":true}'),
    });
    const replay = await engine.replay({
        method: 'GET',
        url: 'https://api.example.com/users?wsgsig=second&page=1',
    });
    strict_1.default.equal(replay.hit, true);
});
