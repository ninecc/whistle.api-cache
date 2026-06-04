/**
 * 将 header key 统一到小写并忽略值为 undefined 的字段。
 */
export function normalizeHeaderMap(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    result[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return result;
}

/**
 * 按不区分大小写查找原始 header map 的值，保持既有类型。
 */
export function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | string[] | undefined {
  const lower = name.toLowerCase();
  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() === lower) return value;
  }
  return undefined;
}
