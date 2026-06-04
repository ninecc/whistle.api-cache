/**
 * 将 Whistle 请求对象中的可用 body 数据安全转换为 Buffer。
 */
export async function getBufferedRequestBody(req: any, originalReq: any): Promise<Buffer | undefined> {
  // 注意：toBuffer('') 返回空 Buffer，为了保持与回放键一致，空 Buffer 按“无请求体”处理，
  // 因此这里使用 truthy 判断触发回退逻辑，可从会话继续尝试获取更完整 body。
  const directBody = toBuffer(originalReq?.body ?? req?.body);
  if (directBody) return directBody;

  // 优先使用 getReqSession（兼容回放链路），否则回退到 getSession（resStats 场景）。
  const getSession =
    typeof req.getReqSession === 'function'
      ? req.getReqSession.bind(req)
      : typeof req.getSession === 'function'
        ? req.getSession.bind(req)
        : undefined;
  if (!getSession) return undefined;

  return new Promise((resolveBody) => {
    getSession((session: any) => {
      resolveBody(toBuffer(session?.req?.body));
    });
  });
}

/**
 * 支持 Buffer / string / Uint8Array 之外的常见占位值。
 */
export function toBuffer(body: unknown): Buffer | undefined {
  // 空字符串会转为长度 0 的 Buffer；调用方用 truthy 判定时可识别为“空体”。
  // 仅 undefined/null 与空字符串会被视为空值，false/0 会转为字符串缓冲区保留参与匹配。
  if (body === undefined || body === null) return undefined;
  if (body instanceof Buffer) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(String(body));
}
