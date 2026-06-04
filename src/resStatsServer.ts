import { consumeRecentReplayHit, getEngine, getRequestId, recordEvent } from './shared/state';
import { toBuffer } from './shared/requestBody';
import { normalizeHeaderMap } from './shared/headers';
import { HeaderMap } from './cache/types';
import { shouldRecord } from './ruleMode';
import { parseRequestContext } from './shared/requestContext';

export default function setupResStatsServer(server: any, options?: Record<string, unknown>) {
  server.on('request', (req: any) => {
    if (typeof req.getSession !== 'function') {
      console.warn('[whistle.cache] req.getSession is unavailable');
      return;
    }

    req.getSession(async (session: any) => {
      try {
        const originalReq = req.originalReq || session?.req || {};
        if (!shouldRecord(originalReq.ruleValue)) return;

        const originalRes = req.originalRes || session?.res || {};
        // originalReq 可能是占位对象；补充 session.req 可兜底 method/url，避免回放上下文回退后误判。
        const { method, url } = parseRequestContext(req, { ...originalReq, ...session, ...session?.req });
        const requestId = getRequestId(originalReq, session?.req, req);
        const statusCode = Number(originalRes.statusCode || session?.res?.statusCode || 0);
        // 空字符串应视作“无 body”，因此优先尝试 originalReq.body 之后不应直接截断；
        // 当 direct 结果为空时回退到 session.req.body，保持与 replay 路径一致。
        const requestBody = toBuffer(originalReq.body) || toBuffer(session?.req?.body);
        const responseBody = toBuffer(session?.res?.body);

        if (url && consumeRecentReplayHit(method, url)) return;

        if (!url || !responseBody) {
          console.warn('[whistle.cache] BYPASS missing url or response body');
          recordEvent({
            type: 'BYPASS',
            requestId,
            method,
            url,
            reason: 'missing url or response body',
          });
          return;
        }

        const result = await getEngine(options).record({
          method,
          url,
          requestHeaders: normalizeHeaders(originalReq.headers || session?.req?.headers || {}),
          requestBody,
          statusCode,
          responseHeaders: normalizeHeaders(originalRes.headers || session?.res?.headers || {}),
          body: responseBody,
        });

        if (result.stored) {
          console.log(`[whistle.cache] STORE ${method} ${url}`);
          recordEvent({ type: 'STORE', requestId, method, url });
        } else {
          console.log(`[whistle.cache] BYPASS ${method} ${url}: ${result.reason || 'not cacheable'}`);
          recordEvent({
            type: 'BYPASS',
            requestId,
            method,
            url,
            reason: result.reason || 'not cacheable',
          });
        }
      } catch (error) {
        console.error('[whistle.cache] record failed:', error);
        recordEvent({
          type: 'ERROR',
          requestId: getRequestId(req),
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });
}

/**
 * 统一请求/响应头部的大小写标准化行为。
 */
function normalizeHeaders(headers: HeaderMap): HeaderMap {
  return normalizeHeaderMap(headers) as HeaderMap;
}
