"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultProfile = void 0;
exports.getDataDir = getDataDir;
exports.getStore = getStore;
exports.getEngine = getEngine;
exports.getState = getState;
exports.recordEvent = recordEvent;
exports.getRecentEvents = getRecentEvents;
exports.updateIgnoredQueryNames = updateIgnoredQueryNames;
const node_path_1 = require("node:path");
const engine_1 = require("../cache/engine");
const store_1 = require("../cache/store");
exports.defaultProfile = {
    id: 'default',
    recordEnabled: true,
    replayEnabled: true,
    ttlSeconds: 1800,
    ignoredQueryNames: ['_t', 't', 'timestamp'],
    maxBodySize: 1024 * 1024,
    cacheableContentTypes: ['application/json', 'text/'],
};
let engine;
let store;
let nextEventId = 1;
const recentEvents = [];
const maxRecentEvents = 20;
function getDataDir(options) {
    const candidate = [
        options?.storage,
        options?.storageDir,
        options?.dataDir,
        options?.baseDir,
    ].find((value) => typeof value === 'string' && value.length > 0);
    return candidate ? (0, node_path_1.resolve)(candidate, 'whistle.cache') : (0, node_path_1.resolve)('.whistle-cache-data');
}
function getStore(options) {
    if (!store) {
        store = new store_1.FileCacheStore(getDataDir(options));
    }
    return store;
}
function getEngine(options) {
    if (!engine) {
        engine = new engine_1.CacheEngine(getStore(options), exports.defaultProfile);
    }
    return engine;
}
async function getState(options) {
    const currentEngine = getEngine(options);
    const entries = await currentEngine.list();
    const totalSize = entries.reduce((sum, entry) => sum + entry.bodySize, 0);
    return {
        profile: exports.defaultProfile,
        dataDir: getDataDir(options),
        entryCount: entries.length,
        totalSize,
        entries,
        events: getRecentEvents(),
    };
}
function recordEvent(event) {
    const nextEvent = {
        ...event,
        id: nextEventId,
        timestamp: new Date().toISOString(),
    };
    nextEventId += 1;
    recentEvents.unshift(nextEvent);
    recentEvents.splice(maxRecentEvents);
    return nextEvent;
}
function getRecentEvents() {
    return recentEvents.map((event) => ({ ...event }));
}
function updateIgnoredQueryNames(names) {
    const normalized = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    exports.defaultProfile.ignoredQueryNames = normalized;
    recordEvent({
        type: 'CONFIG',
        reason: `ignored query names updated: ${normalized.join(', ') || 'none'}`,
    });
    return [...exports.defaultProfile.ignoredQueryNames];
}
