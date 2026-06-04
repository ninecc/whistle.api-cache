import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplayHitReason, createReplayMissReason } from '../../src/shared/replayReasons';

test('creates replay hit reasons for replay and auto modes', () => {
  assert.equal(createReplayHitReason('replay'), 'REPLAY HIT');
  assert.equal(createReplayHitReason('auto'), 'AUTO HIT -> SKIP STORE');
});

test('creates replay miss reasons with optional extra reason detail', () => {
  assert.equal(createReplayMissReason('replay'), 'REPLAY MISS -> PASS THROUGH');
  assert.equal(createReplayMissReason('auto'), 'AUTO MISS -> STORE');
  assert.equal(createReplayMissReason('auto', 'ambiguous POST candidates: 2'), 'AUTO MISS -> STORE: ambiguous POST candidates: 2');
  assert.equal(createReplayMissReason('replay', 'HIT'), 'REPLAY MISS -> PASS THROUGH');
});
