import { CacheProfile, HeaderMap } from './types';
import { getHeaderValue } from '../shared/headers';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export interface CacheabilityInput {
  method: string;
  statusCode: number;
  requestHeaders: HeaderMap;
  responseHeaders: HeaderMap;
  bodySize: number;
  profile: CacheProfile;
}

export interface CacheabilityResult {
  cacheable: boolean;
  reason?: string;
}

export interface ReplayHeaderPolicy {
  removedHeaders: string[];
  injectedHeaders: string[];
}

export interface ContentTypePolicy {
  cacheableContentTypes: string[];
  skippedContentTypes: string[];
}

export function isCacheableResponse(input: CacheabilityInput): CacheabilityResult {
  if (!input.profile.recordEnabled) return { cacheable: false, reason: 'recording disabled' };
  if (!['GET', 'POST'].includes(input.method.toUpperCase())) return { cacheable: false, reason: 'method not supported' };
  if (input.statusCode < 200 || input.statusCode > 299) return { cacheable: false, reason: 'status not cacheable' };
  if (input.bodySize > input.profile.maxBodySize) return { cacheable: false, reason: 'body too large' };

  if (hasHeaderValue(input.requestHeaders, 'authorization') || hasHeaderValue(input.requestHeaders, 'cookie')) {
    return { cacheable: false, reason: 'sensitive request headers' };
  }
  if (hasHeaderValue(input.responseHeaders, 'set-cookie')) return { cacheable: false, reason: 'set-cookie response' };

  const contentType = String(getHeaderValue(input.responseHeaders, 'content-type') || '').toLowerCase();
  const matchesType = input.profile.cacheableContentTypes.some((prefix) => contentType.startsWith(prefix));
  if (!matchesType) return { cacheable: false, reason: 'content type not cacheable' };

  return { cacheable: true };
}

export function sanitizeReplayHeaders(headers: HeaderMap, bodySize: number): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(name) || name === 'content-length' || name === 'content-encoding' || name === 'set-cookie') continue;
    const normalized = Array.isArray(value) ? value.join(', ') : value;
    if (normalized !== undefined) result[name] = String(normalized);
  }
  result['content-length'] = String(bodySize);
  result['x-whistle-cache'] = 'HIT';
  return result;
}

export function getReplayHeaderPolicy(): ReplayHeaderPolicy {
  return {
    removedHeaders: Array.from(new Set([
      ...HOP_BY_HOP_HEADERS,
      'content-encoding',
      'content-length',
      'set-cookie',
    ])).sort(),
    injectedHeaders: ['content-length', 'x-whistle-cache'],
  };
}

export function getContentTypePolicy(profile: CacheProfile): ContentTypePolicy {
  return {
    cacheableContentTypes: [...profile.cacheableContentTypes],
    skippedContentTypes: [
      'application/octet-stream',
      'image/*',
      'audio/*',
      'video/*',
      'application/pdf',
    ],
  };
}

function hasHeaderValue(headers: HeaderMap, name: string): boolean {
  return getHeaderValue(headers, name) !== undefined;
}
