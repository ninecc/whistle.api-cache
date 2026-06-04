export type RuleMode = 'record' | 'replay';

const KNOWN_MODES = new Set<RuleMode>(['record', 'replay']);

export function parseRuleModes(ruleValue: unknown): Set<RuleMode> {
  const modes = new Set<RuleMode>();
  if (typeof ruleValue !== 'string' || !ruleValue.trim()) {
    modes.add('record');
    return modes;
  }

  for (const part of ruleValue.split(',')) {
    if (part.trim() === 'auto') {
      modes.add('record');
      modes.add('replay');
      continue;
    }
    const mode = part.trim() as RuleMode;
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
