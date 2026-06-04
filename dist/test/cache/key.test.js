"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const key_1 = require("../../src/cache/key");
(0, node_test_1.default)('normalizes URLs by removing ignored query names and sorting the rest', () => {
    const normalized = (0, key_1.normalizeUrl)('https://api.example.com/users?b=2&_t=9&a=1', ['_t']);
    strict_1.default.equal(normalized, 'https://api.example.com/users?a=1&b=2');
});
(0, node_test_1.default)('creates a stable method plus URL cache key', () => {
    const key = (0, key_1.createCacheKey)({
        method: 'get',
        url: 'https://api.example.com/users?b=2&_t=9&a=1',
        ignoredQueryNames: ['_t'],
    });
    strict_1.default.equal(key, 'GET https://api.example.com/users?a=1&b=2');
});
(0, node_test_1.default)('includes request body hash in POST cache keys', () => {
    const firstKey = (0, key_1.createCacheKey)({
        method: 'POST',
        url: 'https://api.example.com/search',
        requestBody: Buffer.from('{"keyword":"alpha"}'),
    });
    const secondKey = (0, key_1.createCacheKey)({
        method: 'POST',
        url: 'https://api.example.com/search',
        requestBody: Buffer.from('{"keyword":"beta"}'),
    });
    strict_1.default.ok(firstKey !== secondKey);
    strict_1.default.ok(firstKey.startsWith('POST https://api.example.com/search body:'));
});
