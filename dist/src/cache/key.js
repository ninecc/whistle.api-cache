"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUrl = normalizeUrl;
exports.createCacheKey = createCacheKey;
exports.hashRequestBody = hashRequestBody;
const node_crypto_1 = require("node:crypto");
function normalizeUrl(rawUrl, ignoredQueryNames = []) {
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
function createCacheKey(input) {
    const baseKey = `${input.method.toUpperCase()} ${normalizeUrl(input.url, input.ignoredQueryNames)}`;
    if (!input.requestBody || !input.requestBody.byteLength)
        return baseKey;
    return `${baseKey} body:${hashRequestBody(input.requestBody)}`;
}
function hashRequestBody(body) {
    return (0, node_crypto_1.createHash)('sha256').update(body).digest('hex');
}
