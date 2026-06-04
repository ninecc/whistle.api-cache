export interface CacheKeyInput {
    method: string;
    url: string;
    ignoredQueryNames?: string[];
    requestBody?: Buffer;
}
export declare function normalizeUrl(rawUrl: string, ignoredQueryNames?: string[]): string;
export declare function createCacheKey(input: CacheKeyInput): string;
export declare function hashRequestBody(body: Buffer): string;
