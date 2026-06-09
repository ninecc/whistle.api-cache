import { FileCacheStore, CacheStore } from './store';
import { createSqliteCacheStore } from './sqliteStore';

export type StorageMode = 'sqlite-first' | 'sqlite-only' | 'file-only';
export type ActiveStorageKind = 'sqlite' | 'file';

export interface CacheStoreStatus {
  mode: StorageMode;
  active: ActiveStorageKind;
  sqliteAvailable: boolean;
  fallbackReason?: string;
}

export interface CacheStoreHandle {
  store: CacheStore;
  status: CacheStoreStatus;
}

export async function createCacheStore(rootDir: string, mode: StorageMode = 'sqlite-first'): Promise<CacheStoreHandle> {
  if (mode === 'file-only') {
    return {
      store: new FileCacheStore(rootDir),
      status: {
        mode,
        active: 'file',
        sqliteAvailable: false,
        fallbackReason: 'storage mode is file-only',
      },
    };
  }

  try {
    return {
      store: await createSqliteCacheStore(rootDir),
      status: {
        mode,
        active: 'sqlite',
        sqliteAvailable: true,
      },
    };
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : String(error);
    if (mode === 'sqlite-only') throw error;
    return {
      store: new FileCacheStore(rootDir),
      status: {
        mode,
        active: 'file',
        sqliteAvailable: false,
        fallbackReason,
      },
    };
  }
}

export function parseStorageMode(value: unknown): StorageMode {
  if (value === 'sqlite-only' || value === 'file-only' || value === 'sqlite-first') return value;
  return 'sqlite-first';
}
