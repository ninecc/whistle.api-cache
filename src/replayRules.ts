import { ReplayResult } from './cache/engine';

export function createReplayRulesPayload(replay: ReplayResult): string {
  if (!replay.hit) return '';

  const safeId = replay.entry.id.replace(/[^a-zA-Z0-9]/g, '');
  const bodyKey = `whistleApiCache${safeId}Body`;
  const headersKey = `whistleApiCache${safeId}Headers`;
  const headers = { ...replay.headers };
  delete headers['content-length'];

  return JSON.stringify({
    values: {
      [bodyKey]: replay.body.toString(),
      [headersKey]: headers,
    },
    rules: `* statusCode://${replay.statusCode} resHeaders://{${headersKey}} resBody://{${bodyKey}}`,
  });
}
