import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuleModes, shouldRecord, shouldReplay } from '../src/ruleMode';

test('parses plugin rule modes from rule values', () => {
  assert.deepEqual(parseRuleModes('record'), new Set(['record']));
  assert.deepEqual(parseRuleModes('replay'), new Set(['replay']));
  assert.deepEqual(parseRuleModes('auto'), new Set(['record', 'replay']));
  assert.deepEqual(parseRuleModes('record,replay'), new Set(['record', 'replay']));
  assert.deepEqual(parseRuleModes('record, replay , ,auto'), new Set(['record', 'replay']));
  assert.deepEqual(parseRuleModes('unknown, ,record'), new Set(['record']));
});

test('uses record mode when rule value is omitted', () => {
  assert.equal(shouldRecord(undefined), true);
  assert.equal(shouldReplay(undefined), false);
});

test('checks record and replay modes independently', () => {
  assert.equal(shouldRecord('replay'), false);
  assert.equal(shouldReplay('replay'), true);
  assert.equal(shouldRecord('auto'), true);
  assert.equal(shouldReplay('auto'), true);
  assert.equal(shouldRecord('record,replay'), true);
  assert.equal(shouldReplay('record,replay'), true);
});
