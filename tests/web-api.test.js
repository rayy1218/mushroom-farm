import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request, ApiError } from '../web/api.js';

function stub(t, response) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => response();
  t.after(() => { globalThis.fetch = real; });
}

test('a good reply is its JSON; 204 is null', async (t) => {
  stub(t, () => new Response('{"a":1}', { status: 200 }));
  assert.deepEqual(await request('GET', '/x'), { a: 1 });
  stub(t, () => new Response(null, { status: 204 }));
  assert.equal(await request('DELETE', '/x'), null);
});

test('a 2xx whose body cannot be read is a failure to reach the server, not null', async (t) => {
  stub(t, () => new Response('{"a":', { status: 200 }));
  await assert.rejects(request('GET', '/x'), (e) => e instanceof ApiError && e.status === 0);
  stub(t, () => new Response('', { status: 202 }));
  await assert.rejects(request('POST', '/x', {}), (e) => e.status === 0);
});

test('an error reply keeps its status and field', async (t) => {
  stub(t, () => new Response('{"error":"No","field":"days"}', { status: 400 }));
  await assert.rejects(request('POST', '/x', {}), (e) => e.status === 400 && e.field === 'days' && e.message === 'No');
  stub(t, () => new Response('oops', { status: 502 }));
  await assert.rejects(request('GET', '/x'), (e) => e.status === 502);
});
