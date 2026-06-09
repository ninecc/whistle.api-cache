import { getEngine, markRecentReplayHit, recordEvent } from './shared/state';
import { createReplayHitReason, createReplayMissReason } from './shared/replayReasons';
import { shouldReplay } from './ruleMode';
import { getBufferedRequestBody } from './shared/requestBody';
import { parseRequestContext } from './shared/requestContext';

export default function setupServer(server: any, options?: Record<string, unknown>) {
  server.on('request', async (req: any, res: any) => {
    const originalReq = req.originalReq || req;
    const parseSource = hasOriginalReqUrl(originalReq) ? req : { ...req, originalReq: {} };
    const { method, url: fullUrl } = parseRequestContext(parseSource, originalReq);
    const ruleValue = originalReq.ruleValue ?? req.ruleValue;

    if (!shouldReplay(ruleValue)) {
      return passThrough(req, res);
    }

    if (!fullUrl) {
      return passThrough(req, res);
    }

    try {
      // 注意：空字符串 body 视作缺省触发回退；false/0 等有效值要保留参与 key 计算，避免误判 MISS。
      const requestBody = await getBufferedRequestBody(withResponseSessionReader(req, res), originalReq);
      const replay = await (await getEngine(options)).replay({ method, url: fullUrl, requestBody });
      if (!replay.hit) {
        recordEvent({ type: 'MISS', method, url: fullUrl, reason: createReplayMissReason(ruleValue) });
        return passThrough(req, res);
      }

      recordEvent({ type: 'HIT', method, url: fullUrl, reason: createReplayHitReason(ruleValue) });
      markRecentReplayHit(method, fullUrl);
      res.statusCode = replay.statusCode;
      for (const [name, value] of Object.entries(replay.headers)) {
        res.setHeader(name, value);
      }
      res.end(replay.body);
    } catch (error) {
      console.error('[whistle.cache] replay failed:', error);
      recordEvent({
        type: 'ERROR',
        method,
        url: fullUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
      passThrough(req, res);
    }
  });
}

function hasOriginalReqUrl(originalReq: any): boolean {
  return typeof originalReq?.fullUrl === 'string' && originalReq.fullUrl.length > 0
    || typeof originalReq?.url === 'string' && originalReq.url.length > 0;
}

function withResponseSessionReader(req: any, res: any): any {
  if (typeof req.getReqSession === 'function' || typeof res?.getReqSession !== 'function') return req;
  return { ...req, getReqSession: res.getReqSession.bind(res) };
}

function passThrough(req: any, res: any) {
  if (typeof req.passThrough === 'function') {
    req.passThrough();
    return;
  }

  res.statusCode = 502;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('x-whistle-cache', 'MISS');
  res.end('whistle.cache miss and passThrough is unavailable');
}

// 保持逻辑与 rulesServer 一致，通过共享工具读取请求体。
