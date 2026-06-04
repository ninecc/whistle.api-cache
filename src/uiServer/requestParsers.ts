import { DeleteBatchInput, TtlOperation, UpdateTtlInput } from '../cache/engine';

/**
 * 规范化 getEvents 查询参数。
 */
export function parseEventsAfter(after: string | null): number {
  return Number(after || 0);
}

const TTL_OPERATIONS = ['extend-30m', 'never-expire', 'default-ttl', 'expire-now'] as const;

/**
 * 规范化删除批量操作参数，统一处理不完整输入的默认行为。
 */
export function parseDeleteBatchBody(body: Record<string, unknown>): DeleteBatchInput {
  const scope = String(body.scope || '');
  if (scope === 'ids') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    return { scope, ids };
  }
  if (scope === 'same-host' || scope === 'same-path') {
    return { scope, entryId: String(body.entryId || '') };
  }
  if (scope === 'expired' || scope === 'never-hit') {
    return { scope };
  }
  return { scope: 'ids', ids: [] };
}

/**
 * 规范化 TTL 更新输入。
 */
export function parseUpdateTtlBody(body: Record<string, unknown>): UpdateTtlInput {
  return {
    ...parseDeleteBatchBody(body),
    operation: parseTtlOperation(body.operation),
  };
}

export interface MatchRequestBody {
  method: string;
  url: string;
  requestBody?: Buffer;
}

export interface EnabledRequestBody {
  id: string;
  enabled: boolean;
}

/**
 * 规范化缓存启用状态切换参数。
 */
export function parseEnabledBody(body: Record<string, unknown>): EnabledRequestBody {
  return {
    id: String(body.id || ''),
    enabled: Boolean(body.enabled),
  };
}

/**
 * 规范化 ignored query names 配置。
 */
export function parseIgnoredQueryNames(body: Record<string, unknown>): string[] {
  return Array.isArray(body.names) ? body.names.map(String) : [];
}

/**
 * 规范化 cache match 接口输入，统一处理 method/url/requestBody 缺省值。
 */
export function parseCacheMatchBody(body: Record<string, unknown>): MatchRequestBody {
  return {
    method: String(body.method || 'GET').toUpperCase(),
    url: String(body.url || ''),
    requestBody: typeof body.requestBody === 'string' && body.requestBody.length
      ? Buffer.from(body.requestBody)
      : undefined,
  };
}

/**
 * 解析 ttl 操作枚举，非法输入回退到默认值。
 */
function parseTtlOperation(value: unknown): TtlOperation {
  const operation = String(value || '');
  return TTL_OPERATIONS.includes(operation as TtlOperation) ? (operation as TtlOperation) : 'default-ttl';
}
