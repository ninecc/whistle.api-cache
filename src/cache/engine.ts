import { randomUUID } from 'node:crypto';
import { createCacheKey, hashRequestBody, normalizeUrl } from './key';
import { isCacheableResponse, sanitizeReplayHeaders } from './policy';
import { FileCacheStore, hashBody } from './store';
import { CacheEntry, CacheProfile, CacheRecordInput } from './types';

export type RecordResult = {
  stored: boolean;
  reason?: string;
  entry?: CacheEntry;
};

export type ReplayResult =
  | { hit: false }
  | {
      hit: true;
      entry: CacheEntry;
      body: Buffer;
      headers: Record<string, string>;
      statusCode: number;
    };

export type MatchReasonType =
  | 'HIT'
  | 'URL_MISMATCH'
  | 'BODY_HASH_MISMATCH'
  | 'EXPIRED'
  | 'DISABLED'
  | 'AMBIGUOUS_POST_CANDIDATES'
  | 'METHOD_MISMATCH'
  | 'NO_ENTRIES';

export interface MatchReason {
  type: MatchReasonType;
  message: string;
  entryId?: string;
}

export interface MatchResult {
  hit: boolean;
  reason: string;
  entry?: CacheEntry;
  candidates: CacheEntry[];
  reasons: MatchReason[];
}

export type DeleteBatchInput =
  | { scope: 'ids'; ids: string[] }
  | { scope: 'same-host' | 'same-path'; entryId: string }
  | { scope: 'expired' | 'never-hit' };

export class CacheEngine {
  constructor(
    private readonly store: FileCacheStore,
    private readonly profile: CacheProfile,
  ) {}

  async record(input: Omit<CacheRecordInput, 'profile'>): Promise<RecordResult> {
    const cacheability = isCacheableResponse({
      method: input.method,
      statusCode: input.statusCode,
      requestHeaders: input.requestHeaders,
      responseHeaders: input.responseHeaders,
      bodySize: input.body.byteLength,
      profile: this.profile,
    });
    if (!cacheability.cacheable) return { stored: false, reason: cacheability.reason };

    const now = new Date();
    const bodyHash = hashBody(input.body);
    const key = createCacheKey({
      method: input.method,
      url: input.url,
      ignoredQueryNames: this.profile.ignoredQueryNames,
      requestBody: input.requestBody,
    });
    const requestBodyHash = input.requestBody?.byteLength ? hashRequestBody(input.requestBody) : undefined;
    const entry: CacheEntry = {
      id: randomUUID(),
      profileId: this.profile.id,
      key,
      method: input.method.toUpperCase(),
      url: input.url,
      normalizedUrl: normalizeUrl(input.url, this.profile.ignoredQueryNames),
      requestBodyHash,
      statusCode: input.statusCode,
      headers: normalizeHeaders(input.responseHeaders),
      contentType: String(getHeader(input.responseHeaders, 'content-type') || ''),
      bodyHash,
      bodySize: input.body.byteLength,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.profile.ttlSeconds * 1000).toISOString(),
      hitCount: 0,
      enabled: true,
    };

    await this.store.putEntry(entry, input.body);
    return { stored: true, entry };
  }

  async replay(input: { method: string; url: string; requestBody?: Buffer }): Promise<ReplayResult> {
    if (!this.profile.replayEnabled) return { hit: false };
    const method = input.method.toUpperCase();
    const key = createCacheKey({
      method,
      url: input.url,
      ignoredQueryNames: this.profile.ignoredQueryNames,
      requestBody: input.requestBody,
    });
    const entry = await this.store.getEntryByKey(this.profile.id, key);
    if (entry && new Date(entry.expiresAt).getTime() > Date.now()) {
      return this.createReplayHit(entry);
    }

    const legacyEntry = await this.findCompatibleEntry(method, input.url, input.requestBody);
    if (legacyEntry) return this.createReplayHit(legacyEntry);

    if (method === 'POST' && !input.requestBody?.byteLength) {
      const normalizedUrl = normalizeUrl(input.url, this.profile.ignoredQueryNames);
      const candidates = (await this.store.listEntries()).filter((item) => (
        item.profileId === this.profile.id &&
        item.enabled &&
        item.method === method &&
        item.normalizedUrl === normalizedUrl &&
        new Date(item.expiresAt).getTime() > Date.now()
      ));
      if (candidates.length === 1) return this.createReplayHit(candidates[0]);
    }

    return { hit: false };
  }

  async match(input: { method: string; url: string; requestBody?: Buffer }): Promise<MatchResult> {
    const method = input.method.toUpperCase();
    const normalizedUrl = normalizeUrl(input.url, this.profile.ignoredQueryNames);
    const requestBodyHash = input.requestBody?.byteLength ? hashRequestBody(input.requestBody) : undefined;
    const entries = (await this.store.listEntries()).filter((entry) => entry.profileId === this.profile.id);

    if (!entries.length) {
      return createMatchMiss('no cache entries', [], [{ type: 'NO_ENTRIES', message: 'no cache entries' }]);
    }

    const now = Date.now();
    const methodCandidates = entries.filter((entry) => entry.method === method);
    if (!methodCandidates.length) {
      return createMatchMiss('method mismatch', [], [{ type: 'METHOD_MISMATCH', message: `no ${method} cache entries` }]);
    }

    const urlCandidates = methodCandidates.filter((entry) => (
      normalizeUrl(entry.url, this.profile.ignoredQueryNames) === normalizedUrl ||
      entry.normalizedUrl === normalizedUrl
    ));
    if (!urlCandidates.length) {
      return createMatchMiss('URL mismatch', [], [{ type: 'URL_MISMATCH', message: `no cache entry for ${normalizedUrl}` }]);
    }

    const disabled = urlCandidates.filter((entry) => !entry.enabled);
    const enabled = urlCandidates.filter((entry) => entry.enabled);
    if (!enabled.length) {
      return createMatchMiss('cache entry disabled', disabled, disabled.map((entry) => ({
        type: 'DISABLED',
        message: 'cache entry disabled',
        entryId: entry.id,
      })));
    }

    const expired = enabled.filter((entry) => new Date(entry.expiresAt).getTime() <= now);
    const fresh = enabled.filter((entry) => new Date(entry.expiresAt).getTime() > now);
    if (!fresh.length) {
      return createMatchMiss('cache entry expired', expired, expired.map((entry) => ({
        type: 'EXPIRED',
        message: 'cache entry expired',
        entryId: entry.id,
      })));
    }

    const bodyCandidates = requestBodyHash
      ? fresh.filter((entry) => entry.requestBodyHash === requestBodyHash)
      : fresh;
    if (requestBodyHash && !bodyCandidates.length) {
      return createMatchMiss('request body hash mismatch', fresh, fresh.map((entry) => ({
        type: 'BODY_HASH_MISMATCH',
        message: 'request body hash mismatch',
        entryId: entry.id,
      })));
    }

    if (method === 'POST' && !requestBodyHash && bodyCandidates.length > 1) {
      return createMatchMiss(`ambiguous POST candidates: ${bodyCandidates.length}`, bodyCandidates, [{
        type: 'AMBIGUOUS_POST_CANDIDATES',
        message: `ambiguous POST candidates: ${bodyCandidates.length}`,
      }]);
    }

    if (bodyCandidates.length === 1) {
      return {
        hit: true,
        reason: 'HIT',
        entry: bodyCandidates[0],
        candidates: bodyCandidates,
        reasons: [],
      };
    }

    return createMatchMiss('URL mismatch', bodyCandidates, [{
      type: 'URL_MISMATCH',
      message: 'multiple candidates did not resolve to one cache entry',
    }]);
  }

  private async findCompatibleEntry(method: string, url: string, requestBody?: Buffer): Promise<CacheEntry | undefined> {
    const normalizedUrl = normalizeUrl(url, this.profile.ignoredQueryNames);
    const requestBodyHash = requestBody?.byteLength ? hashRequestBody(requestBody) : undefined;
    const candidates = (await this.store.listEntries()).filter((item) => (
      item.profileId === this.profile.id &&
      item.enabled &&
      item.method === method &&
      normalizeUrl(item.url, this.profile.ignoredQueryNames) === normalizedUrl &&
      new Date(item.expiresAt).getTime() > Date.now() &&
      (!requestBodyHash || item.requestBodyHash === requestBodyHash)
    ));
    if (candidates.length === 1) return candidates[0];
    return undefined;
  }

  private async createReplayHit(entry: CacheEntry): Promise<ReplayResult> {
    const body = await this.store.readBody(entry);
    await this.store.markHit(entry.id);
    return {
      hit: true,
      entry,
      body,
      headers: sanitizeReplayHeaders(entry.headers, body.byteLength),
      statusCode: entry.statusCode,
    };
  }

  async list(): Promise<CacheEntry[]> {
    return this.store.listEntries();
  }

  async delete(id: string): Promise<boolean> {
    return this.store.deleteEntry(id);
  }

  async deleteBatch(input: DeleteBatchInput): Promise<number> {
    const entries = await this.store.listEntries();
    const ids = new Set(getBatchDeleteIds(input, entries));
    let removed = 0;
    for (const id of ids) {
      if (await this.store.deleteEntry(id)) removed += 1;
    }
    return removed;
  }

  async clearExpired(): Promise<number> {
    return this.store.clearExpired();
  }

  async clearAll(): Promise<number> {
    return this.store.clearAll();
  }
}

function createMatchMiss(reason: string, candidates: CacheEntry[], reasons: MatchReason[]): MatchResult {
  return {
    hit: false,
    reason,
    candidates,
    reasons,
  };
}

function getBatchDeleteIds(input: DeleteBatchInput, entries: CacheEntry[]): string[] {
  if (input.scope === 'ids') return input.ids;
  if (input.scope === 'expired') {
    const now = Date.now();
    return entries
      .filter((entry) => new Date(entry.expiresAt).getTime() <= now)
      .map((entry) => entry.id);
  }
  if (input.scope === 'never-hit') {
    return entries.filter((entry) => (entry.hitCount || 0) === 0).map((entry) => entry.id);
  }

  if (input.scope !== 'same-host' && input.scope !== 'same-path') return [];

  const reference = entries.find((entry) => entry.id === input.entryId);
  if (!reference) return [];
  const referenceUrl = parseEntryUrl(reference);
  return entries.filter((entry) => {
    const url = parseEntryUrl(entry);
    if (!url || !referenceUrl) return false;
    if (input.scope === 'same-host') return url.host === referenceUrl.host;
    return url.host === referenceUrl.host && url.pathname === referenceUrl.pathname;
  }).map((entry) => entry.id);
}

function parseEntryUrl(entry: CacheEntry): URL | undefined {
  try {
    return new URL(entry.url);
  } catch {
    return undefined;
  }
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    result[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return result;
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | string[] | undefined {
  const lower = name.toLowerCase();
  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() === lower) return value;
  }
  return undefined;
}
