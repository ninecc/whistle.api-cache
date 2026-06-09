/**
 * 将 Whistle 请求对象中的可用 body 数据安全转换为 Buffer。
 */
export async function getBufferedRequestBody(req: any, originalReq: any): Promise<Buffer | undefined> {
  // 注意：toBuffer('') 返回空 Buffer，为了保持与回放键一致，空 Buffer 按“无请求体”处理，
  // 因此这里使用 truthy 判断触发回退逻辑，可从会话继续尝试获取更完整 body。
  const directBody = toBuffer(originalReq?.body ?? req?.body);

  // 这段 fallback 统一了三种请求上下文场景：
  // - server/rulesServer：优先从当前请求体读取，必要时回退 getReqSession。
  // - resStatsServer：仅有 getSession 时，也能沿同一规则拿到会话请求体。
  if (directBody && directBody.length > 0) return directBody;

  // 同时存在多个 session reader 时按优先级尝试；若高优先级 reader 暂时没有 body，
  // 继续回退到另一个 reader，避免 replay 阶段拿不到而 record 阶段又能拿到。
  const sessionReaders = getSessionReadersFromRequest(req, req?.body === '');
  for (const readSession of sessionReaders) {
    const sessionBody = await new Promise<Buffer | undefined>((resolveBody) => {
      readSession((session: any) => {
        const body = toBuffer(session?.req?.body);
        resolveBody(body && body.length > 0 ? body : undefined);
      });
    });
    if (sessionBody) return sessionBody;
  }

  return directBody;
}

type SessionReader = (callback: (session: any) => void) => void;

function getSessionReadersFromRequest(req: any, preferGetSession = false): SessionReader[] {
  const readers: SessionReader[] = [];
  const addReader = (reader: unknown) => {
    if (typeof reader !== 'function') return;
    const boundReader = reader.bind(req);
    if (!readers.includes(boundReader)) readers.push(boundReader);
  };

  if (preferGetSession) {
    addReader(req?.getSession);
    addReader(req?.getReqSession);
  } else {
    addReader(req?.getReqSession);
    addReader(req?.getSession);
  }

  return readers;
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
