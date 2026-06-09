import test from 'node:test';
import assert from 'node:assert/strict';
import { runAutoReplayE2E } from '../../e2e/autoReplay';

test('local auto replay e2e stores once then replays without hitting fake server again', async () => {
  const result = await runAutoReplayE2E();

  assert.equal(result.fakeServerHits, 1);
  assert.ok(result.firstRules.includes('style://'));
  assert.ok(!result.firstRules.includes('statusCode://200'));
  assert.ok(result.secondRules.includes('statusCode://200'));
  assert.ok(result.events.some((event: string) => event.startsWith('STORE:')));
  assert.ok(result.events.some((event: string) => event.startsWith('HIT:AUTO HIT -> SKIP STORE')));
});
