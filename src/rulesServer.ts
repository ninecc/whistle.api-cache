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
    const ruleValue = originalReq.ruleValue ?? req.ruleValue;

    if (!fullUrl) {
      return res.end('');
    }

    if (!shouldReplay(ruleValue)) {
      return res.end(createPluginRulesPayload(ruleValue));
    }

    try {
      // 注意：仅空字符串/空值会回退到 session，false/0 这类 body 仍应直接参与 replay key 计算。
      const requestBody = await getBufferedRequestBody(req, originalReq);
      const replay = await (await getEngine(options)).replay({ method, url: fullUrl, requestBody });
      if (!replay.hit) {
        const match = await (await getEngine(options)).match({ method, url: fullUrl, requestBody });
        recordEvent({ type: 'MISS', requestId, method, url: fullUrl, reason: createReplayMissReason(ruleValue, match.reason) });
        return res.end(createPluginRulesPayload(ruleValue, replay));
      }

      recordEvent({ type: 'HIT', requestId, method, url: fullUrl, reason: createReplayHitReason(ruleValue) });
      markRecentReplayHit(method, fullUrl);
      return res.end(createPluginRulesPayload(ruleValue, replay));
    } catch (error) {
      recordEvent({
        type: 'ERROR',
        requestId,
        method,
        url: fullUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
      return res.end(createPluginRulesPayload(ruleValue));
    }
  });
}


// 与 server.ts 共享 body 解析路径，避免重复实现。
