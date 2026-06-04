import { createHash } from 'node:crypto';

export interface CacheKeyInput {
  method: string;
  url: string;
  ignoredQueryNames?: string[];
  requestBody?: Buffer;
}

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
  const baseKey = `${input.method.toUpperCase()} ${normalizeUrl(input.url, input.ignoredQueryNames)}`;
  if (!input.requestBody || !input.requestBody.byteLength) return baseKey;
  return `${baseKey} body:${hashRequestBody(input.requestBody)}`;
}

export function hashRequestBody(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}
