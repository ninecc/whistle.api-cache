import { CacheEntry } from './types';
export declare class FileCacheStore {
    private readonly rootDir;
    private readonly indexPath;
    private readonly objectsDir;
    constructor(rootDir: string);
    listEntries(): Promise<CacheEntry[]>;
    getEntryByKey(profileId: string, key: string): Promise<CacheEntry | undefined>;
    readBody(entry: CacheEntry): Promise<Buffer>;
    putEntry(entry: CacheEntry, body: Buffer): Promise<void>;
    deleteEntry(id: string): Promise<boolean>;
    clearExpired(now?: Date): Promise<number>;
    clearAll(): Promise<number>;
    markHit(id: string, now?: Date): Promise<void>;
    private bodyPath;
    private ensureDirs;
    private readIndex;
    private writeIndex;
}
export declare function hashBody(body: Buffer): string;
