import { shouldReplay } from './ruleMode';
import { createPluginRulesPayload } from './replayRules';
import { getEngine, getRequestId, markRecentReplayHit, recordEvent } from './shared/state';
import { getBufferedRequestBody } from './shared/requestBody';
import { parseRequestContext } from './shared/requestContext';
import { createReplayHitReason, createReplayMissReason } from './shared/replayReasons';

export default function setupRulesServer(server: any, options?: Record<string, unknown>) {
  server.on('request', async (req: any, res: any) => {
    const originalReq = req.originalReq || req;
    const { method, url: fullUrl } = parseRequestContext(req, originalReq);
    const requestId = getRequestId(originalReq, req);

    if (!fullUrl) {
      return res.end('');
    }

    if (!shouldReplay(originalReq.ruleValue)) {
      return res.end(createPluginRulesPayload(originalReq.ruleValue));
    }

    try {
      const requestBody = await getBufferedRequestBody(req, originalReq);
      const replay = await getEngine(options).replay({ method, url: fullUrl, requestBody });
      if (!replay.hit) {
        const match = await getEngine(options).match({ method, url: fullUrl, requestBody });
        recordEvent({ type: 'MISS', requestId, method, url: fullUrl, reason: createReplayMissReason(originalReq.ruleValue, match.reason) });
        return res.end(createPluginRulesPayload(originalReq.ruleValue, replay));
      }

      recordEvent({ type: 'HIT', requestId, method, url: fullUrl, reason: createReplayHitReason(originalReq.ruleValue) });
      markRecentReplayHit(method, fullUrl);
      return res.end(createPluginRulesPayload(originalReq.ruleValue, replay));
    } catch (error) {
      recordEvent({
        type: 'ERROR',
        requestId,
        method,
        url: fullUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
      return res.end(createPluginRulesPayload(originalReq.ruleValue));
    }
  });
}


// 与 server.ts 共享 body 解析路径，避免重复实现。
