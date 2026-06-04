import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRecentEvents,
  consumeRecentReplayHit,
  getRecentEvents,
  getRequestId,
  markRecentReplayHit,
  recordEvent,
  updateIgnoredQueryNames,
  defaultProfile,
} from '../../src/shared/state';

test('recordEvent keeps the newest cache diagnostic events first', () => {
  clearRecentEvents();
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

test('clearRecentEvents removes diagnostic events', () => {
  clearRecentEvents();
  recordEvent({
    type: 'HIT',
    method: 'GET',
    url: 'https://example.test/api',
  });

  assert.equal(getRecentEvents().length, 1);

  const removed = clearRecentEvents();

  assert.equal(removed, 1);
  assert.deepEqual(getRecentEvents(), []);
});

test('recent replay hit markers are consumed once', () => {
  markRecentReplayHit('GET', 'https://example.test/api');

  assert.equal(consumeRecentReplayHit('GET', 'https://example.test/api'), true);
  assert.equal(consumeRecentReplayHit('GET', 'https://example.test/api'), false);
  assert.equal(consumeRecentReplayHit('POST', 'https://example.test/api'), false);
});

test('recent replay hit markers are method-case insensitive', () => {
  markRecentReplayHit('post', 'https://example.test/api');

  assert.equal(consumeRecentReplayHit('POST', 'https://example.test/api'), true);
});

test('recent replay hit markers handle non-string methods consistently', () => {
  markRecentReplayHit(12 as unknown as string, 'https://example.test/api');

  assert.equal(consumeRecentReplayHit('12', 'https://example.test/api'), true);
});

test('updateIgnoredQueryNames normalizes and stores query names', () => {
  clearRecentEvents();
  const original = [...defaultProfile.ignoredQueryNames];

  try {
    const updated = updateIgnoredQueryNames([' _t ', 'wsgsig', '', 'wsgsig']);

    assert.deepEqual(updated, ['_t', 'wsgsig']);
    assert.deepEqual(defaultProfile.ignoredQueryNames, ['_t', 'wsgsig']);
  } finally {
    updateIgnoredQueryNames(original);
  }
});

test('getRequestId reads request identifiers and falls back locally', () => {
  assert.equal(getRequestId({ requestId: 'request-1' }), 'request-1');
  assert.equal(getRequestId({ id: 42 }), '42');
  assert.equal(getRequestId({}), 'local-1');
  assert.equal(getRequestId({}), 'local-2');
});
