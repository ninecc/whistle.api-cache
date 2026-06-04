import { createPluginRulesPayload } from './replayRules';

export default function setupRulesServer(server: any, options?: Record<string, unknown>) {
  server.on('request', async (req: any, res: any) => {
    const originalReq = req.originalReq || req;
    const fullUrl = originalReq.fullUrl || req.fullUrl || req.url;

    if (!fullUrl) {
      return res.end('');
    }

    res.end(createPluginRulesPayload(originalReq.ruleValue));
  });
}
