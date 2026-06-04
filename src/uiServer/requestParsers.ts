import { CacheExportBundle, CacheExportEntry, DeleteBatchInput, TtlOperation, UpdateTtlInput } from '../cache/engine';
import { CacheEvent } from '../shared/state';

/**
 * 规范化单条缓存删除接口参数，缺省 id 为空字符串。
 */
export function parseDeleteBody(body: Record<string, unknown>): { id: string } {
  return { id: String(body.id || '') };
}

export function parseImportBody(body: Record<string, unknown>): CacheExportBundle {
  const bundle = body.bundle;
  if (!bundle || typeof bundle !== 'object') {
    return { version: 1, exportedAt: new Date().toISOString(), entries: [] };
  }

  const candidate = bundle as Partial<CacheExportBundle>;
  return {
    version: typeof candidate.version === 'number' ? candidate.version : 1,
    exportedAt: String(candidate.exportedAt || ''),
    entries: Array.isArray(candidate.entries) ? candidate.entries.filter((entry): entry is CacheExportEntry => (
      Boolean(entry) && typeof entry === 'object' && typeof (entry as Partial<CacheExportEntry>).bodyBase64 === 'string'
    )) : [],
  };
}

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

/**
 * 按事件 id 过滤最近事件，支持返回 after 之后的数据。
 */
export function filterEventsAfter(events: CacheEvent[], after: number): CacheEvent[] {
  return events.filter((event) => !Number.isFinite(after) || event.id > after);
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
