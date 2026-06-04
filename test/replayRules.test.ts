import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginRulesPayload } from '../src/replayRules';

test('creates style rules for record, replay, and combined modes', () => {
  assert.equal(JSON.parse(createPluginRulesPayload('record')).rules, '* style://bgColor=@1f4d2b style://color=@dcfce7 style://fontStyle=bold');
  assert.equal(JSON.parse(createPluginRulesPayload('replay')).rules, '* style://bgColor=@1d4ed8 style://color=@dbeafe style://fontStyle=bold');
  assert.equal(JSON.parse(createPluginRulesPayload('auto')).rules, '* style://bgColor=@7c2d12 style://color=@ffedd5 style://fontStyle=bold');
  assert.equal(JSON.parse(createPluginRulesPayload('record,replay')).rules, '* style://bgColor=@7c2d12 style://color=@ffedd5 style://fontStyle=bold');
});

test('creates no replay body rules from style payloads', () => {
  const payload = JSON.parse(createPluginRulesPayload('replay'));

  assert.equal(payload.rules, '* style://bgColor=@1d4ed8 style://color=@dbeafe style://fontStyle=bold');
  assert.equal(payload.values, undefined);
  assert.equal(payload.rules.includes('resBody://'), false);
});
