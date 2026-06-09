import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { CacheEntry } from './types';

interface CacheIndex {
  entries: CacheEntry[];
}

export interface CacheStore {
  listEntries(): Promise<CacheEntry[]>;
  getEntryByKey(profileId: string, key: string): Promise<CacheEntry | undefined>;
  readBody(entry: CacheEntry): Promise<Buffer>;
  putEntry(entry: CacheEntry, body: Buffer): Promise<void>;
  updateActiveBody(id: string, body: Buffer, options?: { expectedUpdatedAt?: string }): Promise<CacheEntry>;
  restoreOriginalBody(id: string): Promise<CacheEntry>;
  deleteEntry(id: string): Promise<boolean>;
  setEnabled(id: string, enabled: boolean): Promise<boolean>;
  updateExpiresAt(ids: string[], expiresAt: string): Promise<number>;
  clearExpired(now?: Date): Promise<number>;
  clearAll(): Promise<number>;
  markHit(id: string, now?: Date): Promise<void>;
}

export interface BodyWriteResult {
  key: string;
  hash: string;
  size: number;
}

export interface GarbageCollectResult {
  removed: string[];
  missing: string[];
}

export class BodyObjectStore {
  private readonly objectsDir: string;

  constructor(rootDir: string) {
    this.objectsDir = join(rootDir, 'objects');
  }

  async writeOriginal(body: Buffer): Promise<BodyWriteResult> {
    const hash = hashBody(body);
    const key = `original/${hash}.body`;
    await this.writeObject(key, body, { keepExisting: true });
    return { key, hash, size: body.byteLength };
  }

  async writeEditable(entryId: string, body: Buffer): Promise<BodyWriteResult> {
    const safeEntryId = entryId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const hash = hashBody(body);
    const key = `editable/${safeEntryId}.body`;
    await this.writeObject(key, body, { keepExisting: false });
    return { key, hash, size: body.byteLength };
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.objectPath(key));
  }

  async deleteIfUnreferenced(key: string, referencedKeys: Set<string>): Promise<void> {
    if (referencedKeys.has(key)) return;
    await unlink(this.objectPath(key)).catch(() => undefined);
  }

  async clear(): Promise<void> {
    await rm(this.objectsDir, { recursive: true, force: true });
    await mkdir(this.objectsDir, { recursive: true });
  }

  private async writeObject(key: string, body: Buffer, options: { keepExisting: boolean }): Promise<void> {
    const finalPath = this.objectPath(key);
    const dir = dirname(finalPath);
    await mkdir(dir, { recursive: true });
    if (options.keepExisting) {
      try {
        await readFile(finalPath);
        return;
      } catch {
        // Missing original objects are written below. Other read errors will surface on write/rename.
      }
    }
    const tmpPath = join(dir, `${randomUUID()}.tmp`);
    await writeFile(tmpPath, body);
    await rename(tmpPath, finalPath).catch(async (error) => {
      await unlink(tmpPath).catch(() => undefined);
      if (options.keepExisting && isFileExistsError(error)) return;
      throw error;
    });
  }

  private objectPath(key: string): string {
    const normalizedKey = key.replace(/\\/g, '/');
    if (normalizedKey.startsWith('/') || normalizedKey.includes('..')) {
      throw new Error(`invalid body object key: ${key}`);
    }
    const resolvedObjectsDir = resolve(this.objectsDir);
    const resolvedPath = resolve(resolvedObjectsDir, normalizedKey);
    if (resolvedPath !== resolvedObjectsDir && !resolvedPath.startsWith(`${resolvedObjectsDir}${sep}`)) {
      throw new Error(`body object key escapes objects directory: ${key}`);
    }
    return resolvedPath;
  }
}

export class FileCacheStore {
  private readonly indexPath: string;
  private readonly bodyObjects: BodyObjectStore;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly rootDir: string) {
    this.indexPath = join(rootDir, 'cache-index.json');
    this.bodyObjects = new BodyObjectStore(rootDir);
  }

  async listEntries(): Promise<CacheEntry[]> {
    return (await this.readIndex()).entries;
  }

  async getEntryByKey(profileId: string, key: string): Promise<CacheEntry | undefined> {
    const index = await this.readIndex();
    return index.entries.find((entry) => entry.profileId === profileId && entry.key === key && entry.enabled);
  }

  async readBody(entry: CacheEntry): Promise<Buffer> {
    return this.bodyObjects.read(getActiveBodyKey(entry));
  }

  async putEntry(entry: CacheEntry, body: Buffer): Promise<void> {
    await this.withWriteLock(async () => {
      await this.ensureDirs();
      const originalBody = await this.bodyObjects.writeOriginal(body);
      const index = await this.readIndex();
      const existing = index.entries.find((item) => item.profileId === entry.profileId && item.key === entry.key);
      const importedEditableBody = !existing && entry.activeBodyKind === 'editable'
        ? await this.bodyObjects.writeEditable(entry.id, body)
        : undefined;
      const keepEditableActive = existing?.activeBodyKind === 'editable' || Boolean(importedEditableBody);
      const now = new Date().toISOString();
      const nextEntry = normalizeStoredEntry({
        ...entry,
        id: existing?.id || entry.id,
        createdAt: existing?.createdAt || entry.createdAt,
        updatedAt: now,
        bodyHash: originalBody.hash,
        bodySize: originalBody.size,
        originalBodyHash: originalBody.hash,
        originalBodyKey: originalBody.key,
        originalBodySize: originalBody.size,
        activeBodyKind: keepEditableActive ? 'editable' : 'original',
        activeBodyKey: existing?.activeBodyKind === 'editable' ? getActiveBodyKey(existing) : (importedEditableBody?.key || originalBody.key),
        activeBodyHash: existing?.activeBodyKind === 'editable' ? (existing.activeBodyHash || existing.bodyHash) : (importedEditableBody?.hash || originalBody.hash),
        activeBodySize: existing?.activeBodyKind === 'editable' ? (existing.activeBodySize || existing.bodySize) : (importedEditableBody?.size || originalBody.size),
        hitCount: existing?.hitCount || entry.hitCount,
        lastHitAt: existing?.lastHitAt,
        enabled: existing?.enabled ?? entry.enabled,
      });
      await this.writeIndex({
        entries: index.entries
          .filter((item) => item.id !== nextEntry.id && !(item.profileId === nextEntry.profileId && item.key === nextEntry.key))
          .concat(nextEntry),
      });
    });
  }

  async updateActiveBody(id: string, body: Buffer, options: { expectedUpdatedAt?: string } = {}): Promise<CacheEntry> {
    return this.withWriteLock(async () => {
      const index = await this.readIndex();
      const found = index.entries.find((entry) => entry.id === id);
      if (!found) throw new Error(`cache entry not found: ${id}`);
      if (options.expectedUpdatedAt && found.updatedAt !== options.expectedUpdatedAt) {
        throw new Error(`cache entry update conflict: ${id}`);
      }
      const editableBody = await this.bodyObjects.writeEditable(id, body);
      const updated = normalizeStoredEntry({
        ...found,
        activeBodyKind: 'editable',
        activeBodyKey: editableBody.key,
        activeBodyHash: editableBody.hash,
        activeBodySize: editableBody.size,
        bodyHash: editableBody.hash,
        bodySize: editableBody.size,
        updatedAt: new Date().toISOString(),
      });
      await this.writeIndex({ entries: index.entries.map((entry) => entry.id === id ? updated : entry) });
      return updated;
    });
  }

  async restoreOriginalBody(id: string): Promise<CacheEntry> {
    return this.withWriteLock(async () => {
      const index = await this.readIndex();
      const found = index.entries.find((entry) => entry.id === id);
      if (!found) throw new Error(`cache entry not found: ${id}`);
      const originalKey = getOriginalBodyKey(found);
      const originalHash = found.originalBodyHash || found.bodyHash;
      const originalSize = found.originalBodySize || found.bodySize;
      const updated = normalizeStoredEntry({
        ...found,
        activeBodyKind: 'original',
        activeBodyKey: originalKey,
        activeBodyHash: originalHash,
        activeBodySize: originalSize,
        bodyHash: originalHash,
        bodySize: originalSize,
        updatedAt: new Date().toISOString(),
      });
      await this.writeIndex({ entries: index.entries.map((entry) => entry.id === id ? updated : entry) });
      return updated;
    });
  }

  async deleteEntry(id: string): Promise<boolean> {
    return this.withWriteLock(async () => {
      const index = await this.readIndex();
      const found = index.entries.find((item) => item.id === id);
      if (!found) return false;
      const entries = index.entries.filter((item) => item.id !== id);
      await this.writeIndex({ entries });
      const referencedKeys = collectReferencedBodyKeys(entries);
      await this.bodyObjects.deleteIfUnreferenced(getActiveBodyKey(found), referencedKeys);
      await this.bodyObjects.deleteIfUnreferenced(getOriginalBodyKey(found), referencedKeys);
      return true;
    });
  }

  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    return this.withWriteLock(async () => {
      const index = await this.readIndex();
      let found = false;
      const entries = index.entries.map((entry) => {
        if (entry.id !== id) return entry;
        found = true;
        return { ...entry, enabled };
      });
      if (!found) return false;
      await this.writeIndex({ entries });
      return true;
    });
  }

  async updateExpiresAt(ids: string[], expiresAt: string): Promise<number> {
    const targetIds = new Set(ids);
    if (!targetIds.size) return 0;

    return this.withWriteLock(async () => {
      const index = await this.readIndex();
      let updated = 0;
      const entries = index.entries.map((entry) => {
        if (!targetIds.has(entry.id)) return entry;
        updated += 1;
        return { ...entry, expiresAt };
      });
      if (!updated) return 0;
      await this.writeIndex({ entries });
      return updated;
    });
  }

  async clearExpired(now: Date = new Date()): Promise<number> {
    const expired = await this.withWriteLock(async () => {
      const index = await this.readIndex();
      const expiredEntries = index.entries.filter((entry) => new Date(entry.expiresAt).getTime() <= now.getTime());
      if (!expiredEntries.length) return [];

      const expiredIds = new Set(expiredEntries.map((entry) => entry.id));
      const entries = index.entries.filter((entry) => !expiredIds.has(entry.id));
      await this.writeIndex({ entries });
      const referencedKeys = collectReferencedBodyKeys(entries);
      for (const entry of expiredEntries) {
        await this.bodyObjects.deleteIfUnreferenced(getActiveBodyKey(entry), referencedKeys);
        await this.bodyObjects.deleteIfUnreferenced(getOriginalBodyKey(entry), referencedKeys);
      }
      return expiredEntries;
    });
    return expired.length;
  }

  async clearAll(): Promise<number> {
    const count = await this.withWriteLock(async () => {
      const index = await this.readIndex();
      await this.writeIndex({ entries: [] });
      await this.bodyObjects.clear();
      return index.entries.length;
    });
    return count;
  }

  async markHit(id: string, now: Date = new Date()): Promise<void> {
    await this.withWriteLock(async () => {
      const index = await this.readIndex();
      const entries = index.entries.map((entry) => entry.id === id
        ? { ...entry, hitCount: entry.hitCount + 1, lastHitAt: now.toISOString() }
        : entry);
      await this.writeIndex({ entries });
    });
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(join(this.rootDir, 'objects'), { recursive: true });
  }

  private async readIndex(): Promise<CacheIndex> {
    await this.ensureDirs();
    try {
      const raw = await readFile(this.indexPath, 'utf8');
      const parsed = JSON.parse(raw) as CacheIndex;
      return { entries: Array.isArray(parsed.entries) ? parsed.entries.map(normalizeStoredEntry) : [] };
    } catch {
      return { entries: [] };
    }
  }

  private async writeIndex(index: CacheIndex): Promise<void> {
    await this.ensureDirs();
    const tmpPath = `${this.indexPath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(index, null, 2)}\n`);
    await rename(tmpPath, this.indexPath);
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(operation, operation);
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }
}

export function hashBody(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function normalizeStoredEntry(entry: CacheEntry): CacheEntry {
  const originalBodyHash = entry.originalBodyHash || entry.bodyHash;
  const originalBodyKey = entry.originalBodyKey || legacyBodyKey(entry.bodyHash);
  const originalBodySize = entry.originalBodySize || entry.bodySize;
  const activeBodyKind = entry.activeBodyKind || 'original';
  const activeBodyKey = entry.activeBodyKey || originalBodyKey;
  const activeBodyHash = entry.activeBodyHash || (activeBodyKind === 'original' ? originalBodyHash : entry.bodyHash);
  const activeBodySize = entry.activeBodySize || (activeBodyKind === 'original' ? originalBodySize : entry.bodySize);
  return {
    ...entry,
    bodyHash: activeBodyHash,
    bodySize: activeBodySize,
    originalBodyHash,
    originalBodyKey,
    originalBodySize,
    activeBodyKind,
    activeBodyKey,
    activeBodyHash,
    activeBodySize,
    updatedAt: entry.updatedAt || entry.createdAt,
  };
}

function getActiveBodyKey(entry: CacheEntry): string {
  return entry.activeBodyKey || getOriginalBodyKey(entry);
}

function getOriginalBodyKey(entry: CacheEntry): string {
  return entry.originalBodyKey || legacyBodyKey(entry.originalBodyHash || entry.bodyHash);
}

function legacyBodyKey(bodyHash: string): string {
  return bodyHash.includes('/') ? bodyHash : `${bodyHash}.body`;
}

function collectReferencedBodyKeys(entries: CacheEntry[]): Set<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    keys.add(getActiveBodyKey(entry));
    keys.add(getOriginalBodyKey(entry));
  }
  return keys;
}

function isFileExistsError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST');
}
