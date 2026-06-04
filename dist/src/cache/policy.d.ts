import { CacheProfile, HeaderMap } from './types';
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
export declare function isCacheableResponse(input: CacheabilityInput): CacheabilityResult;
export declare function sanitizeReplayHeaders(headers: HeaderMap, bodySize: number): Record<string, string>;
