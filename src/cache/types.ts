export type HeaderMap = Record<string, string | string[] | undefined>;

export interface CacheProfile {
  id: string;
  recordEnabled: boolean;
  replayEnabled: boolean;
  ttlSeconds: number;
  ignoredQueryNames: string[];
  maxBodySize: number;
  cacheableContentTypes: string[];
}

export interface CacheEntry {
  id: string;
  profileId: string;
  key: string;
  method: string;
  url: string;
  normalizedUrl: string;
  requestBodyHash?: string;
  statusCode: number;
  headers: Record<string, string>;
  contentType: string;
  bodyHash: string;
  bodySize: number;
  originalBodyHash?: string;
  originalBodyKey?: string;
  originalBodySize?: number;
  activeBodyKind?: 'original' | 'editable';
  activeBodyKey?: string;
  activeBodyHash?: string;
  activeBodySize?: number;
  createdAt: string;
  updatedAt?: string;
  expiresAt: string;
  lastHitAt?: string;
  hitCount: number;
  enabled: boolean;
}

export interface CacheRecordInput {
  profile: CacheProfile;
  method: string;
  url: string;
  requestHeaders: HeaderMap;
  requestBody?: Buffer;
  statusCode: number;
  responseHeaders: HeaderMap;
  body: Buffer;
}

export type CacheBodyKind = 'active' | 'original';
