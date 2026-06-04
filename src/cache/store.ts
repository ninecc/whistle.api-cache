import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CacheEntry } from './types';

interface CacheIndex {
  entries: CacheEntry[];
}

export class FileCacheStore {
  private readonly indexPath: string;
  private readonly objectsDir: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly rootDir: string) {
    this.indexPath = join(rootDir, 'cache-index.json');
    this.objectsDir = join(rootDir, 'objects');
  }

  async listEntries(): Promise<CacheEntry[]> {
    return (await this.readIndex()).entries;
  }

  async getEntryByKey(profileId: string, key: string): Promise<CacheEntry | undefined> {
    const index = await this.readIndex();
    return index.entries.find((entry) => entry.profileId === profileId && entry.key === key && entry.enabled);
  }

  async readBody(entry: CacheEntry): Promise<Buffer> {
    return readFile(this.bodyPath(entry.bodyHash));
  }

  async putEntry(entry: CacheEntry, body: Buffer): Promise<void> {
    await this.withWriteLock(async () => {
      await this.ensureDirs();
      const bodyHash = entry.bodyHash || hashBody(body);
      const nextEntry = { ...entry, bodyHash, bodySize: body.byteLength };
      const index = await this.readIndex();
      const withoutExisting = index.entries.filter((item) => item.id !== nextEntry.id && item.key !== nextEntry.key);
      withoutExisting.push(nextEntry);
      await writeFile(this.bodyPath(bodyHash), body);
      await this.writeIndex({ entries: withoutExisting });
    });
  }

  async deleteEntry(id: string): Promise<boolean> {
    const entry = await this.withWriteLock(async () => {
      const index = await this.readIndex();
      const found = index.entries.find((item) => item.id === id);
      if (!found) return undefined;
      await this.writeIndex({ entries: index.entries.filter((item) => item.id !== id) });
      return found;
    });
    if (!entry) return false;
    await unlink(this.bodyPath(entry.bodyHash)).catch(() => undefined);
    return true;
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
      await this.writeIndex({ entries: index.entries.filter((entry) => !expiredIds.has(entry.id)) });
      return expiredEntries;
    });
    if (!expired.length) return 0;
    await Promise.all(expired.map((entry) => unlink(this.bodyPath(entry.bodyHash)).catch(() => undefined)));
    return expired.length;
  }

  async clearAll(): Promise<number> {
    const count = await this.withWriteLock(async () => {
      const index = await this.readIndex();
      await this.writeIndex({ entries: [] });
      await rm(this.objectsDir, { recursive: true, force: true });
      await mkdir(this.objectsDir, { recursive: true });
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

  private bodyPath(bodyHash: string): string {
    return join(this.objectsDir, `${bodyHash}.body`);
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(this.objectsDir, { recursive: true });
  }

  private async readIndex(): Promise<CacheIndex> {
    await this.ensureDirs();
    try {
      const raw = await readFile(this.indexPath, 'utf8');
      const parsed = JSON.parse(raw) as CacheIndex;
      return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
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
