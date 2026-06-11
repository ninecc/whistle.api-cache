import { mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BodyObjectStore, CacheStore } from './store';
import { CacheBodyKind, CacheEntry } from './types';

interface BetterSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes: number };
  };
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
}

interface BetterSqliteConstructor {
  new(path: string): BetterSqliteDatabase;
}

interface CacheIndex {
  entries: CacheEntry[];
}

interface CacheEntryRow {
  id: string;
  profile_id: string;
  cache_key: string;
  method: string;
  original_url: string;
  normalized_url: string;
  request_body_hash: string | null;
  status_code: number;
  response_headers_json: string;
  content_type: string;
  original_body_hash: string;
  original_body_key: string;
  original_body_size: number;
  active_body_kind: 'original' | 'editable';
  active_body_key: string;
  active_body_hash: string;
  active_body_size: number;
  expires_at: string;
  hit_count: number;
  last_hit_at: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export class SqliteCacheStore implements CacheStore {
  private readonly dbPath: string;
  private readonly bodyObjects: BodyObjectStore;
  private readonly db: BetterSqliteDatabase;

  constructor(private readonly rootDir: string, Database: BetterSqliteConstructor = loadBetterSqlite()) {
    this.dbPath = join(rootDir, 'cache.sqlite3');
    this.bodyObjects = new BodyObjectStore(rootDir);
    this.db = new Database(this.dbPath);
    this.initialize();
    this.migrateLegacyIndex();
  }

  async listEntries(): Promise<CacheEntry[]> {
    const rows = this.db.prepare(`
      SELECT * FROM cache_entries
      WHERE deleted_at IS NULL
      ORDER BY created_at ASC
    `).all() as CacheEntryRow[];
    return rows.map(rowToEntry);
  }

  async getEntryByKey(profileId: string, key: string): Promise<CacheEntry | undefined> {
    const row = this.db.prepare(`
      SELECT * FROM cache_entries
      WHERE profile_id = ? AND cache_key = ? AND enabled = 1 AND deleted_at IS NULL
      LIMIT 1
    `).get(profileId, key) as CacheEntryRow | undefined;
    return row ? rowToEntry(row) : undefined;
  }

  async readBody(entry: CacheEntry, kind: CacheBodyKind = 'active'): Promise<Buffer> {
    const key = kind === 'original'
      ? (entry.originalBodyKey || legacyBodyKey(entry.originalBodyHash || entry.bodyHash))
      : (entry.activeBodyKey || entry.originalBodyKey || legacyBodyKey(entry.bodyHash));
    return this.bodyObjects.read(key);
  }

  async putEntry(entry: CacheEntry, body: Buffer): Promise<void> {
    const originalBody = await this.bodyObjects.writeOriginal(body);
    const existing = this.findEntryByProfileKey(entry.profileId, entry.key);
    const importedEditableBody = !existing && entry.activeBodyKind === 'editable'
      ? await this.bodyObjects.writeEditable(entry.id, body)
      : undefined;
    const keepEditableActive = existing?.activeBodyKind === 'editable' || Boolean(importedEditableBody);
    const now = new Date().toISOString();
    const nextEntry: CacheEntry = {
      ...entry,
      id: existing?.id || entry.id,
      createdAt: existing?.createdAt || entry.createdAt,
      updatedAt: now,
      bodyHash: keepEditableActive
        ? (existing?.activeBodyHash || importedEditableBody?.hash || originalBody.hash)
        : originalBody.hash,
      bodySize: keepEditableActive
        ? (existing?.activeBodySize || importedEditableBody?.size || originalBody.size)
        : originalBody.size,
      originalBodyHash: originalBody.hash,
      originalBodyKey: originalBody.key,
      originalBodySize: originalBody.size,
      activeBodyKind: keepEditableActive ? 'editable' : 'original',
      activeBodyKey: existing?.activeBodyKind === 'editable'
        ? existing.activeBodyKey
        : (importedEditableBody?.key || originalBody.key),
      activeBodyHash: existing?.activeBodyKind === 'editable'
        ? existing.activeBodyHash
        : (importedEditableBody?.hash || originalBody.hash),
      activeBodySize: existing?.activeBodyKind === 'editable'
        ? existing.activeBodySize
        : (importedEditableBody?.size || originalBody.size),
      hitCount: existing?.hitCount || entry.hitCount,
      lastHitAt: existing?.lastHitAt,
      enabled: existing?.enabled ?? entry.enabled,
    };
    this.upsertEntry(normalizeEntry(nextEntry));
  }

  async updateActiveBody(id: string, body: Buffer, options: { expectedUpdatedAt?: string } = {}): Promise<CacheEntry> {
    const found = this.findEntryById(id);
    if (!found) throw new Error(`cache entry not found: ${id}`);
    if (options.expectedUpdatedAt && found.updatedAt !== options.expectedUpdatedAt) {
      throw new Error(`cache entry update conflict: ${id}`);
    }
    const editableBody = await this.bodyObjects.writeEditable(id, body);
    const updated = normalizeEntry({
      ...found,
      bodyHash: editableBody.hash,
      bodySize: editableBody.size,
      activeBodyKind: 'editable',
      activeBodyKey: editableBody.key,
      activeBodyHash: editableBody.hash,
      activeBodySize: editableBody.size,
      updatedAt: new Date().toISOString(),
    });
    this.upsertEntry(updated);
    return updated;
  }

  async restoreOriginalBody(id: string): Promise<CacheEntry> {
    const found = this.findEntryById(id);
    if (!found) throw new Error(`cache entry not found: ${id}`);
    const updated = normalizeEntry({
      ...found,
      bodyHash: found.originalBodyHash || found.bodyHash,
      bodySize: found.originalBodySize || found.bodySize,
      activeBodyKind: 'original',
      activeBodyKey: found.originalBodyKey || `${found.bodyHash}.body`,
      activeBodyHash: found.originalBodyHash || found.bodyHash,
      activeBodySize: found.originalBodySize || found.bodySize,
      updatedAt: new Date().toISOString(),
    });
    this.upsertEntry(updated);
    return updated;
  }

  async deleteEntry(id: string): Promise<boolean> {
    const result = this.db.prepare(`
      UPDATE cache_entries SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(new Date().toISOString(), new Date().toISOString(), id);
    return result.changes > 0;
  }

  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    const result = this.db.prepare(`
      UPDATE cache_entries SET enabled = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(enabled ? 1 : 0, new Date().toISOString(), id);
    return result.changes > 0;
  }

  async updateExpiresAt(ids: string[], expiresAt: string): Promise<number> {
    if (!ids.length) return 0;
    const update = this.db.prepare(`
      UPDATE cache_entries SET expires_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `);
    const run = this.db.transaction((targetIds: string[]) => {
      let updated = 0;
      for (const id of targetIds) updated += update.run(expiresAt, new Date().toISOString(), id).changes;
      return updated;
    }) as (targetIds: string[]) => number;
    return run(ids);
  }

  async clearExpired(now: Date = new Date()): Promise<number> {
    const result = this.db.prepare(`
      UPDATE cache_entries SET deleted_at = ?, updated_at = ?
      WHERE deleted_at IS NULL AND expires_at <= ?
    `).run(now.toISOString(), now.toISOString(), now.toISOString());
    return result.changes;
  }

  async clearAll(): Promise<number> {
    const countRow = this.db.prepare(`
      SELECT COUNT(*) AS count FROM cache_entries WHERE deleted_at IS NULL
    `).get() as { count: number };
    this.db.prepare(`
      UPDATE cache_entries SET deleted_at = ?, updated_at = ?
      WHERE deleted_at IS NULL
    `).run(new Date().toISOString(), new Date().toISOString());
    await this.bodyObjects.clear();
    return countRow.count;
  }

  async markHit(id: string, now: Date = new Date()): Promise<void> {
    this.db.prepare(`
      UPDATE cache_entries
      SET hit_count = hit_count + 1, last_hit_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(now.toISOString(), now.toISOString(), id);
  }

  close(): void {
    this.db.close();
  }

  private initialize(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 3000;

      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cache_entries (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        method TEXT NOT NULL,
        original_url TEXT NOT NULL,
        normalized_url TEXT NOT NULL,
        request_body_hash TEXT,
        status_code INTEGER NOT NULL,
        response_headers_json TEXT NOT NULL,
        content_type TEXT NOT NULL,
        original_body_hash TEXT NOT NULL,
        original_body_key TEXT NOT NULL,
        original_body_size INTEGER NOT NULL,
        active_body_kind TEXT NOT NULL CHECK (active_body_kind IN ('original', 'editable')),
        active_body_key TEXT NOT NULL,
        active_body_hash TEXT NOT NULL,
        active_body_size INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        hit_count INTEGER NOT NULL DEFAULT 0,
        last_hit_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_entries_profile_key
        ON cache_entries(profile_id, cache_key)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_cache_entries_profile_method_url
        ON cache_entries(profile_id, method, normalized_url)
        WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at
        ON cache_entries(expires_at)
        WHERE deleted_at IS NULL;
    `);
    this.db.prepare(`
      INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('schema_version', '1')
    `).run();
  }

  private migrateLegacyIndex(): void {
    const migrationKey = 'legacy_cache_index_migrated';
    const migrated = this.db.prepare('SELECT value FROM schema_meta WHERE key = ?').get(migrationKey);
    if (migrated) return;

    const indexPath = join(this.rootDir, 'cache-index.json');
    if (!existsSync(indexPath)) {
      this.db.prepare('INSERT OR REPLACE INTO schema_meta(key, value) VALUES (?, ?)').run(migrationKey, '1');
      return;
    }

    const raw = readFileSync(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as CacheIndex;
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const importEntries = this.db.transaction((legacyEntries: CacheEntry[]) => {
      for (const entry of legacyEntries) this.upsertEntry(normalizeEntry(entry));
      this.db.prepare('INSERT OR REPLACE INTO schema_meta(key, value) VALUES (?, ?)').run(migrationKey, '1');
      this.db.prepare('INSERT OR REPLACE INTO schema_meta(key, value) VALUES (?, ?)').run('legacy_cache_index_imported_count', String(legacyEntries.length));
    }) as (legacyEntries: CacheEntry[]) => void;
    importEntries(entries);
  }

  private findEntryByProfileKey(profileId: string, key: string): CacheEntry | undefined {
    const row = this.db.prepare(`
      SELECT * FROM cache_entries
      WHERE profile_id = ? AND cache_key = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(profileId, key) as CacheEntryRow | undefined;
    return row ? rowToEntry(row) : undefined;
  }

  private findEntryById(id: string): CacheEntry | undefined {
    const row = this.db.prepare(`
      SELECT * FROM cache_entries
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(id) as CacheEntryRow | undefined;
    return row ? rowToEntry(row) : undefined;
  }

  private upsertEntry(entry: CacheEntry): void {
    this.db.prepare(`
      INSERT INTO cache_entries (
        id, profile_id, cache_key, method, original_url, normalized_url, request_body_hash,
        status_code, response_headers_json, content_type, original_body_hash, original_body_key,
        original_body_size, active_body_kind, active_body_key, active_body_hash, active_body_size,
        expires_at, hit_count, last_hit_at, enabled, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @profileId, @key, @method, @url, @normalizedUrl, @requestBodyHash,
        @statusCode, @headersJson, @contentType, @originalBodyHash, @originalBodyKey,
        @originalBodySize, @activeBodyKind, @activeBodyKey, @activeBodyHash, @activeBodySize,
        @expiresAt, @hitCount, @lastHitAt, @enabledNumber, @createdAt, @updatedAt, NULL
      )
      ON CONFLICT(id) DO UPDATE SET
        profile_id = excluded.profile_id,
        cache_key = excluded.cache_key,
        method = excluded.method,
        original_url = excluded.original_url,
        normalized_url = excluded.normalized_url,
        request_body_hash = excluded.request_body_hash,
        status_code = excluded.status_code,
        response_headers_json = excluded.response_headers_json,
        content_type = excluded.content_type,
        original_body_hash = excluded.original_body_hash,
        original_body_key = excluded.original_body_key,
        original_body_size = excluded.original_body_size,
        active_body_kind = excluded.active_body_kind,
        active_body_key = excluded.active_body_key,
        active_body_hash = excluded.active_body_hash,
        active_body_size = excluded.active_body_size,
        expires_at = excluded.expires_at,
        hit_count = excluded.hit_count,
        last_hit_at = excluded.last_hit_at,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        deleted_at = NULL
    `).run(toParams(entry));
  }
}

export async function createSqliteCacheStore(rootDir: string): Promise<SqliteCacheStore> {
  await mkdir(rootDir, { recursive: true });
  return new SqliteCacheStore(rootDir);
}

function loadBetterSqlite(): BetterSqliteConstructor {
  try {
    return require('better-sqlite3') as BetterSqliteConstructor;
  } catch (error) {
    throw new Error(`better-sqlite3 unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function rowToEntry(row: CacheEntryRow): CacheEntry {
  return {
    id: row.id,
    profileId: row.profile_id,
    key: row.cache_key,
    method: row.method,
    url: row.original_url,
    normalizedUrl: row.normalized_url,
    requestBodyHash: row.request_body_hash || undefined,
    statusCode: row.status_code,
    headers: parseHeaders(row.response_headers_json),
    contentType: row.content_type,
    bodyHash: row.active_body_hash,
    bodySize: row.active_body_size,
    originalBodyHash: row.original_body_hash,
    originalBodyKey: row.original_body_key,
    originalBodySize: row.original_body_size,
    activeBodyKind: row.active_body_kind,
    activeBodyKey: row.active_body_key,
    activeBodyHash: row.active_body_hash,
    activeBodySize: row.active_body_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    lastHitAt: row.last_hit_at || undefined,
    hitCount: row.hit_count,
    enabled: row.enabled === 1,
  };
}

function normalizeEntry(entry: CacheEntry): CacheEntry {
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

function toParams(entry: CacheEntry): Record<string, unknown> {
  return {
    ...entry,
    requestBodyHash: entry.requestBodyHash || null,
    headersJson: JSON.stringify(entry.headers),
    enabledNumber: entry.enabled ? 1 : 0,
    lastHitAt: entry.lastHitAt || null,
  };
}

function parseHeaders(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function legacyBodyKey(bodyHash: string): string {
  return bodyHash.includes('/') ? bodyHash : `${bodyHash}.body`;
}
