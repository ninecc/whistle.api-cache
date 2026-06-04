import { IncomingMessage } from 'node:http';

export interface ParsedRequestContext {
  method: string;
  url: string | undefined;
}

/**
 * 统一从 Whistle 请求上下文中提取 method 与 url。
 */
export function parseRequestContext(req: unknown, fallback?: unknown): ParsedRequestContext {
  const root = toRecord(req);
  const alt = toRecord(fallback);
  const requestLike = root.originalReq && toRecord(root.originalReq).method ? toRecord(root.originalReq) : root;
  const method = requestLike.method || root.method || alt.method || 'GET';
  const url = requestLike.fullUrl || root.fullUrl || alt.url || alt.fullUrl || alt.req?.url;

  return { method, url };
}

function toRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object') ? (value as Record<string, unknown>) : {};
}
