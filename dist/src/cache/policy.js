"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCacheableResponse = isCacheableResponse;
exports.sanitizeReplayHeaders = sanitizeReplayHeaders;
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
function isCacheableResponse(input) {
    if (!input.profile.recordEnabled)
        return { cacheable: false, reason: 'recording disabled' };
    if (!['GET', 'POST'].includes(input.method.toUpperCase()))
        return { cacheable: false, reason: 'method not supported' };
    if (input.statusCode < 200 || input.statusCode > 299)
        return { cacheable: false, reason: 'status not cacheable' };
    if (input.bodySize > input.profile.maxBodySize)
        return { cacheable: false, reason: 'body too large' };
    if (hasHeader(input.requestHeaders, 'authorization') || hasHeader(input.requestHeaders, 'cookie')) {
        return { cacheable: false, reason: 'sensitive request headers' };
    }
    if (hasHeader(input.responseHeaders, 'set-cookie'))
        return { cacheable: false, reason: 'set-cookie response' };
    const contentType = String(getHeader(input.responseHeaders, 'content-type') || '').toLowerCase();
    const matchesType = input.profile.cacheableContentTypes.some((prefix) => contentType.startsWith(prefix));
    if (!matchesType)
        return { cacheable: false, reason: 'content type not cacheable' };
    return { cacheable: true };
}
function sanitizeReplayHeaders(headers, bodySize) {
    const result = {};
    for (const [rawName, value] of Object.entries(headers)) {
        const name = rawName.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(name) || name === 'content-length' || name === 'set-cookie')
            continue;
        const normalized = Array.isArray(value) ? value.join(', ') : value;
        if (normalized !== undefined)
            result[name] = String(normalized);
    }
    result['content-length'] = String(bodySize);
    result['x-whistle-cache'] = 'HIT';
    return result;
}
function hasHeader(headers, name) {
    return getHeader(headers, name) !== undefined;
}
function getHeader(headers, name) {
    const lower = name.toLowerCase();
    for (const [headerName, value] of Object.entries(headers)) {
        if (headerName.toLowerCase() === lower)
            return value;
    }
    return undefined;
}
