"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileCacheStore = void 0;
exports.hashBody = hashBody;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
class FileCacheStore {
    constructor(rootDir) {
        this.rootDir = rootDir;
        this.indexPath = (0, node_path_1.join)(rootDir, 'cache-index.json');
        this.objectsDir = (0, node_path_1.join)(rootDir, 'objects');
    }
    async listEntries() {
        return (await this.readIndex()).entries;
    }
    async getEntryByKey(profileId, key) {
        const index = await this.readIndex();
        return index.entries.find((entry) => entry.profileId === profileId && entry.key === key && entry.enabled);
    }
    async readBody(entry) {
        return (0, promises_1.readFile)(this.bodyPath(entry.bodyHash));
    }
    async putEntry(entry, body) {
        await this.ensureDirs();
        const bodyHash = entry.bodyHash || hashBody(body);
        const nextEntry = { ...entry, bodyHash, bodySize: body.byteLength };
        const index = await this.readIndex();
        const withoutExisting = index.entries.filter((item) => item.id !== nextEntry.id && item.key !== nextEntry.key);
        withoutExisting.push(nextEntry);
        await (0, promises_1.writeFile)(this.bodyPath(bodyHash), body);
        await this.writeIndex({ entries: withoutExisting });
    }
    async deleteEntry(id) {
        const index = await this.readIndex();
        const entry = index.entries.find((item) => item.id === id);
        if (!entry)
            return false;
        await this.writeIndex({ entries: index.entries.filter((item) => item.id !== id) });
        await (0, promises_1.unlink)(this.bodyPath(entry.bodyHash)).catch(() => undefined);
        return true;
    }
    async clearExpired(now = new Date()) {
        const index = await this.readIndex();
        const expired = index.entries.filter((entry) => new Date(entry.expiresAt).getTime() <= now.getTime());
        if (!expired.length)
            return 0;
        const expiredIds = new Set(expired.map((entry) => entry.id));
        await this.writeIndex({ entries: index.entries.filter((entry) => !expiredIds.has(entry.id)) });
        await Promise.all(expired.map((entry) => (0, promises_1.unlink)(this.bodyPath(entry.bodyHash)).catch(() => undefined)));
        return expired.length;
    }
    async clearAll() {
        const index = await this.readIndex();
        await this.writeIndex({ entries: [] });
        await (0, promises_1.rm)(this.objectsDir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(this.objectsDir, { recursive: true });
        return index.entries.length;
    }
    async markHit(id, now = new Date()) {
        const index = await this.readIndex();
        const entries = index.entries.map((entry) => entry.id === id
            ? { ...entry, hitCount: entry.hitCount + 1, lastHitAt: now.toISOString() }
            : entry);
        await this.writeIndex({ entries });
    }
    bodyPath(bodyHash) {
        return (0, node_path_1.join)(this.objectsDir, `${bodyHash}.body`);
    }
    async ensureDirs() {
        await (0, promises_1.mkdir)(this.objectsDir, { recursive: true });
    }
    async readIndex() {
        await this.ensureDirs();
        try {
            const raw = await (0, promises_1.readFile)(this.indexPath, 'utf8');
            const parsed = JSON.parse(raw);
            return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
        }
        catch {
            return { entries: [] };
        }
    }
    async writeIndex(index) {
        await this.ensureDirs();
        const tmpPath = `${this.indexPath}.tmp`;
        await (0, promises_1.writeFile)(tmpPath, `${JSON.stringify(index, null, 2)}\n`);
        await (0, promises_1.rename)(tmpPath, this.indexPath);
    }
}
exports.FileCacheStore = FileCacheStore;
function hashBody(body) {
    return (0, node_crypto_1.createHash)('sha256').update(body).digest('hex');
}
