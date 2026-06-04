import test from 'node:test';
import assert from 'node:assert/strict';
import { getBufferedRequestBody, toBuffer } from '../../src/shared/requestBody';

test('converts known body types to Buffer', () => {
  assert.deepEqual(toBuffer(Buffer.from('hello')), Buffer.from('hello'));
  assert.deepEqual(toBuffer('hello'), Buffer.from('hello'));
  assert.deepEqual(toBuffer(''), Buffer.from(''));
  assert.deepEqual(toBuffer(Uint8Array.from([104, 105])), Buffer.from('hi'));
  assert.deepEqual(toBuffer(0), Buffer.from('0'));
  assert.deepEqual(toBuffer(false), Buffer.from('false'));
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

test('reads request body from response session when req.getSession exists', async () => {
  const body = await getBufferedRequestBody(
    {
      getSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'getSession-body' } });
      },
    },
    {},
  );

  assert.equal(body?.toString(), 'getSession-body');
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

test('prefers non-empty direct body over session body', async () => {
  for (const [directBody, expected] of [
    [0, '0'],
    [false, 'false'],
    ['direct-body', 'direct-body'],
  ] as const) {
    const body = await getBufferedRequestBody(
      {
        getReqSession: (cb: (session: any) => void) => {
          cb({ req: { body: 'session-body' } });
        },
      },
      { body: directBody },
    );

    assert.equal(body?.toString(), expected);
  }
});

test('returns undefined when request body and req session body are both missing', async () => {
  const body = await getBufferedRequestBody(
    {
      getReqSession: (cb: (session: any) => void) => {
        cb({});
      },
    },
    {},
  );

  assert.equal(body, undefined);
});

test('returns undefined when req session reader is unavailable', async () => {
  const body = await getBufferedRequestBody({}, {});

  assert.equal(body, undefined);
});
