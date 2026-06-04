import { ReplayResult } from './cache/engine';
import { parseRuleModes } from './ruleMode';

type RulesPayload = {
  values?: Record<string, unknown>;
  rules: string;
};

const MODE_STYLES = {
  record: 'style://bgColor=@1f4d2b style://color=@dcfce7 style://fontStyle=bold',
  replay: 'style://bgColor=@1d4ed8 style://color=@dbeafe style://fontStyle=bold',
  combined: 'style://bgColor=@7c2d12 style://color=@ffedd5 style://fontStyle=bold',
};

export function createPluginRulesPayload(ruleValue: unknown, replay?: ReplayResult): string {
  const payloads = [
    createStyleRulesPayload(ruleValue),
    createReplayRulesPayload(replay),
  ].filter((payload): payload is RulesPayload => Boolean(payload));

  if (!payloads.length) return '';

  const values = Object.assign({}, ...payloads.map((payload) => payload.values || {}));
  const result: RulesPayload = {
    rules: payloads.map((payload) => payload.rules).join('\n'),
  };
  if (Object.keys(values).length) result.values = values;
  return JSON.stringify(result);
}

function createReplayRulesPayload(replay?: ReplayResult): RulesPayload | undefined {
  if (!replay?.hit) return undefined;

  const safeId = replay.entry.id.replace(/[^a-zA-Z0-9]/g, '');
  const bodyKey = `whistleApiCache${safeId}Body`;
  const headersKey = `whistleApiCache${safeId}Headers`;
  const headers = { ...replay.headers };
  delete headers['content-length'];

  return {
    values: {
      [bodyKey]: replay.body.toString(),
      [headersKey]: headers,
    },
    rules: `* statusCode://${replay.statusCode} resHeaders://{${headersKey}} resBody://{${bodyKey}}`,
  };
}

function createStyleRulesPayload(ruleValue: unknown): RulesPayload {
  const modes = parseRuleModes(ruleValue);
  const style = modes.has('record') && modes.has('replay')
    ? MODE_STYLES.combined
    : modes.has('replay')
      ? MODE_STYLES.replay
      : MODE_STYLES.record;

  return { rules: `* ${style}` };
}
