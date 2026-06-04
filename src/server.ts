import { getEngine, markRecentReplayHit, recordEvent } from './shared/state';
import { createReplayHitReason, createReplayMissReason } from './shared/replayReasons';
import { shouldReplay } from './ruleMode';
import { getBufferedRequestBody } from './shared/requestBody';

export default function setupServer(server: any, options?: Record<string, unknown>) {
  server.on('request', async (req: any, res: any) => {
    const originalReq = req.originalReq || req;
    const method = originalReq.method || req.method || 'GET';
    const fullUrl = originalReq.fullUrl || req.fullUrl || req.url;

    if (!shouldReplay(originalReq.ruleValue)) {
      return passThrough(req, res);
    }

    if (!fullUrl) {
      return passThrough(req, res);
    }

    try {
      const requestBody = await getBufferedRequestBody(req, originalReq);
      const replay = await getEngine(options).replay({ method, url: fullUrl, requestBody });
      if (!replay.hit) {
        recordEvent({ type: 'MISS', method, url: fullUrl, reason: createReplayMissReason(originalReq.ruleValue) });
        return passThrough(req, res);
      }

      recordEvent({ type: 'HIT', method, url: fullUrl, reason: createReplayHitReason(originalReq.ruleValue) });
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
