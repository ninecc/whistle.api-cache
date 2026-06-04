import test from 'node:test';
import assert from 'node:assert/strict';
import { getBufferedRequestBody, toBuffer } from '../../src/shared/requestBody';

test('converts known body types to Buffer', () => {
  assert.deepEqual(toBuffer(Buffer.from('hello')), Buffer.from('hello'));
  assert.deepEqual(toBuffer('hello'), Buffer.from('hello'));
  assert.deepEqual(toBuffer(''), Buffer.from(''));
  assert.deepEqual(toBuffer(Uint8Array.from([104, 105])), Buffer.from('hi'));
  assert.deepEqual(toBuffer({ a: 1 }), Buffer.from('[object Object]'));
});

test('returns undefined for empty bodies', () => {
  assert.equal(toBuffer(undefined), undefined);
  assert.equal(toBuffer(null), undefined);
});

test('reads request body from request session when body is not preloaded', async () => {
  const body = await getBufferedRequestBody(
    {
      getReqSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'session-body' } });
      },
    },
    {},
  );

  assert.equal(body?.toString(), 'session-body');
});

test('treats empty string as missing and reads session body', async () => {
  const body = await getBufferedRequestBody(
    {
      getReqSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'session-body' } });
      },
    },
    { body: '' },
  );

  assert.equal(body?.toString(), 'session-body');
});

test('prefers direct body when both direct and session body exist', async () => {
  const body = await getBufferedRequestBody(
    {
      getReqSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'session-body' } });
      },
    },
    { body: 'direct-body' },
  );

  assert.equal(body?.toString(), 'direct-body');
});
