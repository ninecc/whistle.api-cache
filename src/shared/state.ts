import { resolve } from 'node:path';
import { CacheEngine } from '../cache/engine';
import { FileCacheStore } from '../cache/store';
import { CacheProfile } from '../cache/types';

export type CacheEventType = 'STORE' | 'BYPASS' | 'HIT' | 'MISS' | 'ERROR' | 'CONFIG';

export interface CacheEvent {
  id: number;
  type: CacheEventType;
  timestamp: string;
  method?: string;
  url?: string;
  reason?: string;
}

export const defaultProfile: CacheProfile = {
  id: 'default',
  recordEnabled: true,
  replayEnabled: true,
  ttlSeconds: 1800,
  ignoredQueryNames: ['_t', 't', 'timestamp', 'ticket', 'wsgsig'],
  maxBodySize: 1024 * 1024,
  cacheableContentTypes: ['application/json', 'text/'],
};

let engine: CacheEngine | undefined;
let store: FileCacheStore | undefined;
let nextEventId = 1;
const recentEvents: CacheEvent[] = [];
const maxRecentEvents = 20;
const recentReplayHits = new Set<string>();

export function getDataDir(options?: Record<string, unknown>): string {
  const candidate = [
    options?.storage,
    options?.storageDir,
    options?.dataDir,
    options?.baseDir,
  ].find((value): value is string => typeof value === 'string' && value.length > 0);

  return candidate ? resolve(candidate, 'whistle.cache') : resolve('.whistle-cache-data');
}

export function getStore(options?: Record<string, unknown>): FileCacheStore {
  if (!store) {
    store = new FileCacheStore(getDataDir(options));
  }
  return store;
}

export function getEngine(options?: Record<string, unknown>): CacheEngine {
  if (!engine) {
    engine = new CacheEngine(getStore(options), defaultProfile);
  }
  return engine;
}

export async function getState(options?: Record<string, unknown>) {
  const currentEngine = getEngine(options);
  const entries = await currentEngine.list();
  const totalSize = entries.reduce((sum, entry) => sum + entry.bodySize, 0);

  return {
    profile: defaultProfile,
    dataDir: getDataDir(options),
    entryCount: entries.length,
    totalSize,
    entries,
    events: getRecentEvents(),
  };
}

export function recordEvent(event: Omit<CacheEvent, 'id' | 'timestamp'>): CacheEvent {
  const nextEvent: CacheEvent = {
    ...event,
    id: nextEventId,
    timestamp: new Date().toISOString(),
  };
  nextEventId += 1;
  recentEvents.unshift(nextEvent);
  recentEvents.splice(maxRecentEvents);
  return nextEvent;
}

export function getRecentEvents(): CacheEvent[] {
  return recentEvents.map((event) => ({ ...event }));
}

export function clearRecentEvents(): number {
  const removed = recentEvents.length;
  recentEvents.length = 0;
  return removed;
}

export function markRecentReplayHit(method: string, url: string): void {
  recentReplayHits.add(replayHitKey(method, url));
}

export function consumeRecentReplayHit(method: string, url: string): boolean {
  const key = replayHitKey(method, url);
  const found = recentReplayHits.has(key);
  recentReplayHits.delete(key);
  return found;
}

function replayHitKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

export function updateIgnoredQueryNames(names: string[]): string[] {
  const normalized = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  defaultProfile.ignoredQueryNames = normalized;
  recordEvent({
    type: 'CONFIG',
    reason: `ignored query names updated: ${normalized.join(', ') || 'none'}`,
  });
  return [...defaultProfile.ignoredQueryNames];
}
