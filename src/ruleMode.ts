export type RuleMode = 'record' | 'replay';

const KNOWN_MODES = new Set<RuleMode>(['record', 'replay']);

/**
 * 将规则串按逗号切分并规范化空白，保留结构化的 mode token。
 */
function parseModeTokens(ruleValue: string): string[] {
  return ruleValue
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseRuleModes(ruleValue: unknown): Set<RuleMode> {
  const modes = new Set<RuleMode>();
  if (typeof ruleValue !== 'string' || !ruleValue.trim()) {
    modes.add('record');
    return modes;
  }

  for (const part of parseModeTokens(ruleValue)) {
    if (part === 'auto') {
      modes.add('record');
      modes.add('replay');
      continue;
    }
    const mode = part as RuleMode;
    if (KNOWN_MODES.has(mode)) modes.add(mode);
  }
  return modes;
}

export function shouldRecord(ruleValue: unknown): boolean {
  return parseRuleModes(ruleValue).has('record');
}

export function shouldReplay(ruleValue: unknown): boolean {
  return parseRuleModes(ruleValue).has('replay');
}
