import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonBody } from '../../src/uiServer/bodyParsers';

test('returns empty object when request body is empty', async () => {
  const body = await readJsonBody(createMockRequest(''));
  assert.deepEqual(body, {});
});

test('rejects malformed json body', async () => {
  await assert.rejects(() => readJsonBody(createMockRequest('{bad json')), SyntaxError);
});

test('parses json object body', async () => {
  const body = await readJsonBody(createMockRequest('{"x":1}'));
  assert.deepEqual(body, { x: 1 });
});

function createMockRequest(raw: string) {
  const listeners = new Map<string, ((chunk?: Buffer) => void)[]>();
  return {
    on(event: string, listener: (chunk?: Buffer) => void) {
      listeners.set(event, [...(listeners.get(event) || []), listener]);
      if (event === 'end') {
        queueMicrotask(() => {
          listeners.get('data')?.forEach((fn) => fn(Buffer.from(raw)));
          listener();
        });
      }
      return this;
    },
  } as any;
}
