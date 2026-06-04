import { DeleteBatchInput, TtlOperation, UpdateTtlInput } from '../cache/engine';

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

/**
 * 解析 ttl 操作枚举，非法输入回退到默认值。
 */
function parseTtlOperation(value: unknown): TtlOperation {
  const operation = String(value || '');
  return TTL_OPERATIONS.includes(operation as TtlOperation) ? (operation as TtlOperation) : 'default-ttl';
}
