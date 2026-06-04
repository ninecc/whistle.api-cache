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
const store_1 = require("../../src/cache/store");
(0, node_test_1.default)('writes entries, reads bodies, and marks hits', async () => {
    const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'whistle-cache-store-'));
    const store = new store_1.FileCacheStore(root);
    const entry = {
        id: 'entry-1',
        profileId: 'default',
        key: 'GET https://api.example.com/users',
        method: 'GET',
        url: 'https://api.example.com/users',
        normalizedUrl: 'https://api.example.com/users',
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        contentType: 'application/json',
        bodyHash: 'body-1',
        bodySize: 11,
        createdAt: '2026-06-04T00:00:00.000Z',
        expiresAt: '2026-06-04T01:00:00.000Z',
        hitCount: 0,
        enabled: true,
    };
    await store.putEntry(entry, Buffer.from('{"ok":true}'));
    const found = await store.getEntryByKey('default', entry.key);
    strict_1.default.equal(found?.id, 'entry-1');
    strict_1.default.equal((await store.readBody(entry)).toString(), '{"ok":true}');
    await store.markHit('entry-1', new Date('2026-06-04T00:05:00.000Z'));
    const hit = await store.getEntryByKey('default', entry.key);
    strict_1.default.equal(hit?.hitCount, 1);
    strict_1.default.equal(hit?.lastHitAt, '2026-06-04T00:05:00.000Z');
});
(0, node_test_1.default)('clears expired entries', async () => {
    const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'whistle-cache-expired-'));
    const store = new store_1.FileCacheStore(root);
    await store.putEntry({
        id: 'old',
        profileId: 'default',
        key: 'GET https://api.example.com/old',
        method: 'GET',
        url: 'https://api.example.com/old',
        normalizedUrl: 'https://api.example.com/old',
        statusCode: 200,
        headers: { 'content-type': 'text/plain' },
        contentType: 'text/plain',
        bodyHash: 'old-body',
        bodySize: 3,
        createdAt: '2026-06-04T00:00:00.000Z',
        expiresAt: '2026-06-04T00:01:00.000Z',
        hitCount: 0,
        enabled: true,
    }, Buffer.from('old'));
    const removed = await store.clearExpired(new Date('2026-06-04T00:02:00.000Z'));
    strict_1.default.equal(removed, 1);
    strict_1.default.equal((await store.listEntries()).length, 0);
});
