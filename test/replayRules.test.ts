import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginRulesPayload } from '../src/replayRules';

test('creates style rules for record, replay, and combined modes', () => {
  assert.equal(JSON.parse(createPluginRulesPayload('record')).rules, '* style://bgColor=@1f4d2b style://color=@dcfce7 style://fontStyle=bold');
  assert.equal(JSON.parse(createPluginRulesPayload('replay')).rules, '* style://bgColor=@1d4ed8 style://color=@dbeafe style://fontStyle=bold');
  assert.equal(JSON.parse(createPluginRulesPayload('auto')).rules, '* style://bgColor=@7c2d12 style://color=@ffedd5 style://fontStyle=bold');
  assert.equal(JSON.parse(createPluginRulesPayload('record,replay')).rules, '* style://bgColor=@7c2d12 style://color=@ffedd5 style://fontStyle=bold');
});

test('creates replay body rules when replay hits', () => {
  const replay = {
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
  } as const;

  const payload = JSON.parse(createPluginRulesPayload('replay', replay));

  assert.equal(payload.values.whistleApiCacheentry1Body, '{"ok":true}');
  assert.deepEqual(payload.values.whistleApiCacheentry1Headers, {
    'content-type': 'application/json',
    'x-whistle-cache': 'HIT',
  });
  assert.equal(
    payload.rules,
    '* style://bgColor=@1d4ed8 style://color=@dbeafe style://fontStyle=bold\n* statusCode://201 resHeaders://{whistleApiCacheentry1Headers} resBody://{whistleApiCacheentry1Body}',
  );
});
