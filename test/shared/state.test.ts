import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecentEvents, recordEvent, updateIgnoredQueryNames, defaultProfile } from '../../src/shared/state';

test('recordEvent keeps the newest cache diagnostic events first', () => {
  for (let index = 0; index < 25; index += 1) {
    recordEvent({
      type: 'BYPASS',
      method: 'GET',
      url: `https://example.test/api/${index}`,
      reason: `reason-${index}`,
    });
  }

  const events = getRecentEvents();

  assert.equal(events.length, 20);
  assert.equal(events[0].url, 'https://example.test/api/24');
  assert.equal(events[0].reason, 'reason-24');
  assert.equal(events[19].url, 'https://example.test/api/5');
  assert.equal(events[0].type, 'BYPASS');
  assert.ok(events[0].timestamp);
});

test('updateIgnoredQueryNames normalizes and stores query names', () => {
  const original = [...defaultProfile.ignoredQueryNames];

  try {
    const updated = updateIgnoredQueryNames([' _t ', 'wsgsig', '', 'wsgsig']);

    assert.deepEqual(updated, ['_t', 'wsgsig']);
    assert.deepEqual(defaultProfile.ignoredQueryNames, ['_t', 'wsgsig']);
  } finally {
    updateIgnoredQueryNames(original);
  }
});
