import { FileCacheStore } from './store';
import { CacheEntry, CacheProfile, CacheRecordInput } from './types';
export type RecordResult = {
    stored: boolean;
    reason?: string;
    entry?: CacheEntry;
};
export type ReplayResult = {
    hit: false;
} | {
    hit: true;
    entry: CacheEntry;
    body: Buffer;
    headers: Record<string, string>;
    statusCode: number;
};
export declare class CacheEngine {
    private readonly store;
    private readonly profile;
    constructor(store: FileCacheStore, profile: CacheProfile);
    record(input: Omit<CacheRecordInput, 'profile'>): Promise<RecordResult>;
    replay(input: {
        method: string;
        url: string;
        requestBody?: Buffer;
    }): Promise<ReplayResult>;
    private createReplayHit;
    list(): Promise<CacheEntry[]>;
    delete(id: string): Promise<boolean>;
    clearExpired(): Promise<number>;
    clearAll(): Promise<number>;
}
