import { getEngine, recordEvent } from './shared/state';
import { shouldReplay } from './ruleMode';
import { createReplayRulesPayload } from './replayRules';

export default function setupRulesServer(server: any, options?: Record<string, unknown>) {
  server.on('request', async (req: any, res: any) => {
    const originalReq = req.originalReq || req;
    const method = originalReq.method || req.method || 'GET';
    const fullUrl = originalReq.fullUrl || req.fullUrl || req.url;

    if (!shouldReplay(originalReq.ruleValue) || !fullUrl) {
      return res.end('');
    }

    try {
      const requestBody = await getBufferedRequestBody(req, originalReq);
      const replay = await getEngine(options).replay({ method, url: fullUrl, requestBody });
      if (!replay.hit) {
        recordEvent({ type: 'MISS', method, url: fullUrl, reason: 'cache miss or expired' });
        return res.end('');
      }

      recordEvent({ type: 'HIT', method, url: fullUrl });
      res.end(createReplayRulesPayload(replay));
    } catch (error) {
      recordEvent({
        type: 'ERROR',
        method,
        url: fullUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
      res.end('');
    }
  });
}

async function getBufferedRequestBody(req: any, originalReq: any): Promise<Buffer | undefined> {
  const directBody = toBuffer(originalReq?.body ?? req?.body);
  if (directBody) return directBody;

  if (typeof req.getReqSession !== 'function') return undefined;

  return new Promise((resolveBody) => {
    req.getReqSession((session: any) => {
      resolveBody(toBuffer(session?.req?.body));
    });
  });
}

function toBuffer(body: unknown): Buffer | undefined {
  if (body === undefined || body === null) return undefined;
  if (body instanceof Buffer) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(String(body));
}
