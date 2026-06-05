import { createHash } from 'node:crypto';
import { normalizeMethod } from '../shared/requestContext';

export interface CacheKeyInput {
  method: string;
  url: string;
  ignoredQueryNames?: string[];
  requestBody?: Buffer;
}

export interface CacheKeyDescriptionInput {
  method: string;
  normalizedUrl: string;
  requestBodyHash?: string;
  ignoredQueryNames?: string[];
}

export interface CacheKeyDescription {
  method: string;
  normalizedUrl: string;
  includesRequestBodyHash: boolean;
  ignoredQueryNames: string[];
}

// 缓存 key 逻辑统一依赖共享方法标准化入口，避免输入 method 大小写分歧导致 key 映射漂移。

export function normalizeUrl(rawUrl: string, ignoredQueryNames: string[] = []): string {
  const ignored = new Set(ignoredQueryNames);
  const url = new URL(rawUrl);
  url.hash = '';

  const pairs = Array.from(url.searchParams.entries())
    .filter(([name]) => !ignored.has(name))
    .sort(([leftName, leftValue], [rightName, rightValue]) => {
      const nameOrder = leftName.localeCompare(rightName);
      return nameOrder || leftValue.localeCompare(rightValue);
    });

  url.search = '';
  for (const [name, value] of pairs) {
    url.searchParams.append(name, value);
  }
  return url.toString();
}

export function createCacheKey(input: CacheKeyInput): string {
  const baseKey = `${normalizeMethod(input.method)} ${normalizeUrl(input.url, input.ignoredQueryNames)}`;
  if (!input.requestBody) return baseKey;
  return `${baseKey} body:${hashRequestBody(input.requestBody)}`;
}

export function hashRequestBody(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

export function describeCacheKey(input: CacheKeyDescriptionInput): CacheKeyDescription {
  return {
    method: normalizeMethod(input.method),
    normalizedUrl: input.normalizedUrl,
    includesRequestBodyHash: Boolean(input.requestBodyHash),
    ignoredQueryNames: input.ignoredQueryNames || [],
  };
}
