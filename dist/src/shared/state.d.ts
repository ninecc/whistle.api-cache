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
export declare const defaultProfile: CacheProfile;
export declare function getDataDir(options?: Record<string, unknown>): string;
export declare function getStore(options?: Record<string, unknown>): FileCacheStore;
export declare function getEngine(options?: Record<string, unknown>): CacheEngine;
export declare function getState(options?: Record<string, unknown>): Promise<{
    profile: CacheProfile;
    dataDir: string;
    entryCount: number;
    totalSize: number;
    entries: import("../cache/types").CacheEntry[];
    events: CacheEvent[];
}>;
export declare function recordEvent(event: Omit<CacheEvent, 'id' | 'timestamp'>): CacheEvent;
export declare function getRecentEvents(): CacheEvent[];
export declare function updateIgnoredQueryNames(names: string[]): string[];
