import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplayRulesPayload } from '../src/replayRules';

test('creates dynamic rules and values for replay hits', () => {
  const payload = createReplayRulesPayload({
    hit: true,
    entry: {
      id: 'entry-1',
      profileId: 'default',
      key: 'GET https://api.example.com/data',
      method: 'GET',
      url: 'https://api.example.com/data',
      normalizedUrl: 'https://api.example.com/data',
      statusCode: 201,
      headers: {},
      contentType: 'application/json',
      bodyHash: 'body-hash',
      bodySize: 11,
      createdAt: '2026-06-04T00:00:00.000Z',
      expiresAt: '2026-06-04T01:00:00.000Z',
      hitCount: 0,
      enabled: true,
    },
    body: Buffer.from('{"ok":true}'),
    headers: {
      'content-type': 'application/json',
      'content-length': '11',
      'x-whistle-cache': 'HIT',
    },
    statusCode: 201,
  });

  const parsed = JSON.parse(payload);
  assert.equal(parsed.values.whistleApiCacheentry1Body, '{"ok":true}');
  assert.deepEqual(parsed.values.whistleApiCacheentry1Headers, {
    'content-type': 'application/json',
    'x-whistle-cache': 'HIT',
  });
  assert.equal(
    parsed.rules,
    '* statusCode://201 resHeaders://{whistleApiCacheentry1Headers} resBody://{whistleApiCacheentry1Body}',
  );
});

test('creates no rules for replay misses', () => {
  assert.equal(createReplayRulesPayload({ hit: false }), '');
});
