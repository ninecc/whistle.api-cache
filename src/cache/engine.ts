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

  async clearExpired(): Promise<number> {
    return this.store.clearExpired();
  }

  async clearAll(): Promise<number> {
    return this.store.clearAll();
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
