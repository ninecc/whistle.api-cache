export interface ParsedRequestContext {
  method: string;
  url: string | undefined;
}

/**
 * 统一从 Whistle 请求上下文中提取 method 与 url。
 * method 优先级：requestContext.originalReq.method > requestContext.method > fallback.method > GET。
 * url 优先级：requestContext.originalReq.fullUrl > requestContext.originalReq.url > requestContext.fullUrl > requestContext.url > fallback.fullUrl > fallback.url > fallback.req.url。
 * 空字符串会被视为未设置，继续向后回退。
 */
export function parseRequestContext(req: unknown, fallback?: unknown): ParsedRequestContext {
  const root = toRecord(req);
  const alt = toRecord(fallback);
  const altReq = toRecord(alt.req);
  const requestLike = getRequestLikeSource(root);
  const method = normalizeMethod(selectFirstValue(requestLike.method, root.method, alt.method, altReq.method), 'GET');
  // URL 回退时统一按：原始上下文(fullUrl/url) -> 当前 req(fullUrl/url) -> fallback(fullUrl/url) -> fallback.req.url。
  const url = selectFirstStringValue(
    requestLike.fullUrl,
    requestLike.url,
    root.fullUrl,
    root.url,
    alt.fullUrl,
    alt.url,
    altReq.url,
  );

  return { method, url };
}

function selectFirstValue(...values: unknown[]): unknown {
  // 空值定义：undefined/null/空字符串会被跳过，其他值（包括数字 0、对象）按原样返回。
  for (const value of values) {
    if (value !== undefined && value !== null && !(typeof value === 'string' && value.length === 0)) {
      return value;
    }
  }
  return undefined;
}

function selectFirstStringValue(...values: unknown[]): string | undefined {
  const value = selectFirstValue(...values);
  return value === undefined ? undefined : String(value);
}

function getRequestLikeSource(root: Record<string, unknown>): Record<string, unknown> {
  if (!root.originalReq) return root;
  const originalReq = toRecord(root.originalReq);
  // 原始 req 可能是空壳对象：当其中无可用 method/url/fullUrl 时，避免覆盖当前请求上下文。
  return hasRequestContext(originalReq, ['fullUrl', 'url', 'method']) ? originalReq : root;
}

function hasRequestContext(source: Record<string, unknown>, fields: string[]): boolean {
  return selectFirstValue(...fields.map((field) => source[field])) !== undefined;
}

export function normalizeMethod(value: unknown, fallback = 'GET'): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value === '') return fallback;
  return String(value).toUpperCase();
}

function toRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object') ? (value as Record<string, unknown>) : {};
}
