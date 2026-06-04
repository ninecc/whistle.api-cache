import { shouldRecord, shouldReplay } from './ruleMode';
import { createPluginRulesPayload } from './replayRules';
import { getEngine, getRequestId, markRecentReplayHit, recordEvent } from './shared/state';
import { getBufferedRequestBody } from './shared/requestBody';

export default function setupRulesServer(server: any, options?: Record<string, unknown>) {
  server.on('request', async (req: any, res: any) => {
    const originalReq = req.originalReq || req;
    const method = originalReq.method || req.method || 'GET';
    const fullUrl = originalReq.fullUrl || req.fullUrl || req.url;
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
        recordEvent({ type: 'MISS', requestId, method, url: fullUrl, reason: replayMissReason(originalReq.ruleValue, match.reason) });
        return res.end(createPluginRulesPayload(originalReq.ruleValue, replay));
      }

      recordEvent({ type: 'HIT', requestId, method, url: fullUrl, reason: replayHitReason(originalReq.ruleValue) });
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

function isAutoMode(ruleValue: unknown): boolean {
  return shouldRecord(ruleValue) && shouldReplay(ruleValue);
}

function replayMissReason(ruleValue: unknown, reason?: string): string {
  const prefix = isAutoMode(ruleValue) ? 'AUTO MISS -> STORE' : 'REPLAY MISS -> PASS THROUGH';
  return reason && reason !== 'HIT' ? `${prefix}: ${reason}` : prefix;
}

function replayHitReason(ruleValue: unknown): string {
  return isAutoMode(ruleValue) ? 'AUTO HIT -> SKIP STORE' : 'REPLAY HIT';
}

// 与 server.ts 共享 body 解析路径，避免重复实现。
