import test from 'node:test';
import assert from 'node:assert/strict';
import { getBufferedRequestBody, toBuffer } from '../../src/shared/requestBody';

// 语义按优先级逐层验证：
// 1) 先转化输入类型为 Buffer（含空值定义）
// 2) 再验证 direct body 与 session body 的优先级
// 3) 最后确认缺失场景返回 undefined

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

test('prefers getReqSession over getSession when both are present', async () => {
  const body = await getBufferedRequestBody(
    {
      getReqSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'getReqSession-body' } });
      },
      getSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'getSession-body' } });
      },
    },
    {},
  );

  assert.equal(body?.toString(), 'getReqSession-body');
});

test('prefers direct body over session body', async () => {
  for (const [directBody, expected] of [
    [false, 'false'],
    [0, '0'],
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

  for (const [directBody, expected] of [
    [false, 'false'],
    [0, '0'],
  ] as const) {
    const body = await getBufferedRequestBody(
      {
        getSession: (cb: (session: any) => void) => {
          cb({ req: { body: 'session-body' } });
        },
      },
      { body: directBody },
    );

    assert.equal(body?.toString(), expected);
  }
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


test('uses req.body when originalReq.body is missing', async () => {
  const body = await getBufferedRequestBody(
    {
      body: Buffer.from('req-body'),
      getReqSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'session-body' } });
      },
    },
    {},
  );

  assert.equal(body?.toString(), 'req-body');
});

test('reads session body when req.body is empty string', async () => {
  const body = await getBufferedRequestBody(
    {
      body: '',
      getSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'session-body' } });
      },
      getReqSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'req-session-body' } });
      },
    },
    {},
  );

  assert.equal(body?.toString(), 'session-body');
});

test('treats null originalReq.body and empty req.body as missing', async () => {
  const body = await getBufferedRequestBody(
    {
      body: '',
      getSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'session-body' } });
      },
      getReqSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'req-session-body' } });
      },
    },
    { body: null },
  );

  assert.equal(body?.toString(), 'session-body');
});

test('falls back to session body when direct body is null', async () => {
  const body = await getBufferedRequestBody(
    {
      getSession: (cb: (session: any) => void) => {
        cb({ req: { body: 'session-body' } });
      },
    },
    { body: null },
  );

  assert.equal(body?.toString(), 'session-body');
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
