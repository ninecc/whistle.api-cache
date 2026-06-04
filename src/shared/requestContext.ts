export interface ParsedRequestContext {
  method: string;
  url: string | undefined;
}

/**
 * 统一从 Whistle 请求上下文中提取 method 与 url。
 * method 优先级：requestContext.originalReq.method > requestContext.method > fallback.method > GET。
 * url 优先级：requestContext.fullUrl > requestContext.fullUrl > requestContext.url > fallback.url > fallback.fullUrl > fallback.req.url。
 */
export function parseRequestContext(req: unknown, fallback?: unknown): ParsedRequestContext {
  const root = toRecord(req);
  const alt = toRecord(fallback);
  const requestLike = root.originalReq && toRecord(root.originalReq).method ? toRecord(root.originalReq) : root;
  const rawMethod = requestLike.method || root.method || alt.method || 'GET';
  const method = String(rawMethod).toUpperCase();
  const url = requestLike.fullUrl || root.fullUrl || root.url || alt.url || alt.fullUrl || alt.req?.url;

  return { method, url };
}

function toRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object') ? (value as Record<string, unknown>) : {};
}
