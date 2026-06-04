export interface ParsedRequestContext {
  method: string;
  url: string | undefined;
}

/**
 * 统一从 Whistle 请求上下文中提取 method 与 url。
 * method 优先级：requestContext.originalReq.method > requestContext.method > fallback.method > GET。
 * url 优先级：requestContext.fullUrl > requestContext.url > fallback.fullUrl > fallback.url > fallback.req.url。
 * 空字符串会被视为未设置，继续向后回退。
 */
export function parseRequestContext(req: unknown, fallback?: unknown): ParsedRequestContext {
  const root = toRecord(req);
  const alt = toRecord(fallback);
  const requestLike = getRequestLikeSource(root);
  const method = normalizeMethod(requestLike.method || root.method || alt.method, 'GET');
  const url = requestLike.fullUrl || root.fullUrl || root.url || alt.url || alt.fullUrl || alt.req?.url;

  return { method, url };
}

function getRequestLikeSource(root: Record<string, unknown>): Record<string, unknown> {
  if (!root.originalReq) return root;
  const originalReq = toRecord(root.originalReq);
  // 原始 req 可能是空壳对象：当其中无可用 method/url/fullUrl 时，避免覆盖当前请求上下文。
  return hasRequestContext(originalReq, ['fullUrl', 'url', 'method']) ? originalReq : root;
}

function hasRequestContext(source: Record<string, unknown>, fields: string[]): boolean {
  return fields.some((field) => Boolean(source[field]));
}

export function normalizeMethod(value: unknown, fallback = 'GET'): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value === '') return fallback;
  return String(value).toUpperCase();
}

function toRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object') ? (value as Record<string, unknown>) : {};
}
