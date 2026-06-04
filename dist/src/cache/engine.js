"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheEngine = void 0;
const node_crypto_1 = require("node:crypto");
const key_1 = require("./key");
const policy_1 = require("./policy");
const store_1 = require("./store");
class CacheEngine {
    constructor(store, profile) {
        this.store = store;
        this.profile = profile;
    }
    async record(input) {
        const cacheability = (0, policy_1.isCacheableResponse)({
            method: input.method,
            statusCode: input.statusCode,
            requestHeaders: input.requestHeaders,
            responseHeaders: input.responseHeaders,
            bodySize: input.body.byteLength,
            profile: this.profile,
        });
        if (!cacheability.cacheable)
            return { stored: false, reason: cacheability.reason };
        const now = new Date();
        const bodyHash = (0, store_1.hashBody)(input.body);
        const key = (0, key_1.createCacheKey)({
            method: input.method,
            url: input.url,
            ignoredQueryNames: this.profile.ignoredQueryNames,
            requestBody: input.requestBody,
        });
        const requestBodyHash = input.requestBody?.byteLength ? (0, key_1.hashRequestBody)(input.requestBody) : undefined;
        const entry = {
            id: (0, node_crypto_1.randomUUID)(),
            profileId: this.profile.id,
            key,
            method: input.method.toUpperCase(),
            url: input.url,
            normalizedUrl: (0, key_1.normalizeUrl)(input.url, this.profile.ignoredQueryNames),
            requestBodyHash,
            statusCode: input.statusCode,
            headers: normalizeHeaders(input.responseHeaders),
            contentType: String(getHeader(input.responseHeaders, 'content-type') || ''),
            bodyHash,
            bodySize: input.body.byteLength,
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + this.profile.ttlSeconds * 1000).toISOString(),
            hitCount: 0,
            enabled: true,
        };
        await this.store.putEntry(entry, input.body);
        return { stored: true, entry };
    }
    async replay(input) {
        if (!this.profile.replayEnabled)
            return { hit: false };
        const method = input.method.toUpperCase();
        const key = (0, key_1.createCacheKey)({
            method,
            url: input.url,
            ignoredQueryNames: this.profile.ignoredQueryNames,
            requestBody: input.requestBody,
        });
        const entry = await this.store.getEntryByKey(this.profile.id, key);
        if (entry && new Date(entry.expiresAt).getTime() > Date.now()) {
            return this.createReplayHit(entry);
        }
        if (method === 'POST' && !input.requestBody?.byteLength) {
            const normalizedUrl = (0, key_1.normalizeUrl)(input.url, this.profile.ignoredQueryNames);
            const candidates = (await this.store.listEntries()).filter((item) => (item.profileId === this.profile.id &&
                item.enabled &&
                item.method === method &&
                item.normalizedUrl === normalizedUrl &&
                new Date(item.expiresAt).getTime() > Date.now()));
            if (candidates.length === 1)
                return this.createReplayHit(candidates[0]);
        }
        return { hit: false };
    }
    async createReplayHit(entry) {
        const body = await this.store.readBody(entry);
        await this.store.markHit(entry.id);
        return {
            hit: true,
            entry,
            body,
            headers: (0, policy_1.sanitizeReplayHeaders)(entry.headers, body.byteLength),
            statusCode: entry.statusCode,
        };
    }
    async list() {
        return this.store.listEntries();
    }
    async delete(id) {
        return this.store.deleteEntry(id);
    }
    async clearExpired() {
        return this.store.clearExpired();
    }
    async clearAll() {
        return this.store.clearAll();
    }
}
exports.CacheEngine = CacheEngine;
function normalizeHeaders(headers) {
    const result = {};
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined)
            continue;
        result[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    return result;
}
function getHeader(headers, name) {
    const lower = name.toLowerCase();
    for (const [headerName, value] of Object.entries(headers)) {
        if (headerName.toLowerCase() === lower)
            return value;
    }
    return undefined;
}
