/**
 * 将 Whistle 请求对象中的可用 body 数据安全转换为 Buffer。
 */
export async function getBufferedRequestBody(req: any, originalReq: any): Promise<Buffer | undefined> {
  const directBody = toBuffer(originalReq?.body ?? req?.body);
  if (directBody) return directBody;

  if (typeof req.getReqSession !== 'function') return undefined;

  return new Promise((resolveBody) => {
    req.getReqSession((session: any) => {
      resolveBody(toBuffer(session?.req?.body));
    });
  });
}

/**
 * 支持 Buffer / string / Uint8Array 之外的常见占位值。
 */
export function toBuffer(body: unknown): Buffer | undefined {
  if (body === undefined || body === null) return undefined;
  if (body instanceof Buffer) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(String(body));
}
