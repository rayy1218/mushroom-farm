// tests/fakes/api-server.js: the fake C3/C5 HTTP server (docs/contracts/web.md section 4.5; lead-fakes task 9).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { startFakeApi } = require('./fakes/api-server.js');

const ROOT = path.join(__dirname, '..');

function rawGet(url, reqPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: reqPath, method }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('startFakeApi resolves; url shape', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());
  assert.match(api.url, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test('default replies', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());
  for (const p of ['/api/rooms', '/api/rooms/3/events', '/api/rooms/3/settings/history']) {
    const res = await fetch(api.url + p);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  }
  const settings = await fetch(api.url + '/api/rooms/3/settings');
  assert.deepEqual(await settings.json(), {});

  const mix = await fetch(api.url + '/api/rooms/3/mix', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ crop: 'oyster', blocks: 1 }]) });
  assert.equal(mix.status, 200);
  assert.deepEqual(await mix.json(), [{ crop: 'oyster', blocks: 1 }]);

  const noBody = await fetch(api.url + '/api/rooms', { method: 'POST' });
  assert.equal(noBody.status, 200);
  assert.deepEqual(await noBody.json(), null);

  const del = await fetch(api.url + '/api/rooms/3', { method: 'DELETE' });
  assert.equal(del.status, 404);
  assert.deepEqual(await del.json(), { error: 'Unknown route', details: [] });

  const page = await fetch(api.url + '/index.html');
  assert.equal(page.status, 404);
  assert.deepEqual(await page.json(), { error: 'Unknown route', details: [] });
});

test('requests recording', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());
  await rawGet(api.url, '/api/rooms/1/alarms/rh%20Hi/ack', 'POST');
  const r1 = api.requests.at(-1);
  assert.deepEqual(r1, { method: 'POST', path: '/api/rooms/1/alarms/rh%20Hi/ack', query: {}, body: null });

  await fetch(api.url + '/api/rooms/1/readings?from=1&to=2');
  const r2 = api.requests.at(-1);
  assert.deepEqual(r2.query, { from: '1', to: '2' });

  await fetch(api.url + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1 }) });
  const r3 = api.requests.at(-1);
  assert.deepEqual(r3.body, { a: 1 });

  await fetch(api.url + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'not json' });
  const r4 = api.requests.at(-1);
  assert.equal(r4.body, 'not json');
});

test('reply() overrides, RegExp patterns, replacement, string/undefined bodies', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());

  api.reply('GET', '/api/rooms', 500, { error: 'Server fault', details: ['x'] });
  const r1 = await fetch(api.url + '/api/rooms');
  assert.equal(r1.status, 500);
  assert.deepEqual(await r1.json(), { error: 'Server fault', details: ['x'] });

  api.reply('GET', /^\/api\/rooms\/\d+$/, 200, { id: 1 });
  const r2 = await fetch(api.url + '/api/rooms/7');
  assert.deepEqual(await r2.json(), { id: 1 });

  api.reply('GET', '/api/rooms', 200, { ok: true });
  const r3 = await fetch(api.url + '/api/rooms');
  assert.deepEqual(await r3.json(), { ok: true });

  api.reply('GET', '/api/x', 200, 'plain text');
  const r4 = await fetch(api.url + '/api/x');
  assert.equal(r4.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await r4.text(), 'plain text');

  api.reply('GET', '/api/y', 204, undefined);
  const r5 = await fetch(api.url + '/api/y');
  assert.equal(await r5.text(), '');
});

test('stream: retry line, emit, dropStreams, reconnect, reply override', async (t) => {
  const api = await startFakeApi({ retryMs: 50 });
  t.after(() => api.close());

  const controller1 = new AbortController();
  const res1 = await fetch(api.url + '/api/stream', { signal: controller1.signal });
  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const reader1 = res1.body.getReader();
  const { value: v1 } = await reader1.read();
  assert.equal(Buffer.from(v1).toString('utf8'), 'retry: 50\n\n');

  const controller2 = new AbortController();
  const res2 = await fetch(api.url + '/api/stream', { signal: controller2.signal });
  const reader2 = res2.body.getReader();
  await reader2.read();

  api.emit('reading', { t: 1 });
  const { value: e1 } = await reader1.read();
  assert.equal(Buffer.from(e1).toString('utf8'), 'event: reading\ndata: {"t":1}\n\n');
  const { value: e2 } = await reader2.read();
  assert.equal(Buffer.from(e2).toString('utf8'), 'event: reading\ndata: {"t":1}\n\n');

  api.dropStreams();
  const done1 = await reader1.read();
  assert.equal(done1.done, true);
  const done2 = await reader2.read();
  assert.equal(done2.done, true);

  const res3 = await fetch(api.url + '/api/stream');
  assert.equal(res3.status, 200);
  const reader3 = res3.body.getReader();
  await reader3.read();
  assert.ok(api.requests.filter(r => r.path === '/api/stream').length >= 3);
  await reader3.cancel();

  api.reply('GET', '/api/stream', 503, { error: 'down' });
  const res4 = await fetch(api.url + '/api/stream');
  assert.equal(res4.status, 503);
});

test('root: static files by C3 section 9 rules', async (t) => {
  const api = await startFakeApi({ root: ROOT });
  t.after(() => api.close());

  for (const p of ['/', '/index.html']) {
    const res = await fetch(api.url + p);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.ok(res.headers.get('content-length'));
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  }

  const roomRules = await fetch(api.url + '/room-rules.js');
  assert.equal(roomRules.status, 200);
  assert.equal(roomRules.headers.get('content-type'), 'text/javascript; charset=utf-8');

  const webRooms = await fetch(api.url + '/web/rooms.js?v=2');
  assert.equal(webRooms.status, 200);
  assert.equal(webRooms.headers.get('content-type'), 'text/javascript; charset=utf-8');

  const head = await fetch(api.url + '/styles.css', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.ok(head.headers.get('content-length'));
  assert.equal(await head.text(), '');

  for (const p of ['/package.json', '/web/', '/web', '/.git/HEAD']) {
    const res = await fetch(api.url + p);
    assert.equal(res.status, 404, p);
    assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8', p);
    assert.equal(await res.text(), 'Not found', p);
  }

  const dotdot = await rawGet(api.url, '/web/../package.json');
  assert.equal(dotdot.status, 404);
  assert.equal(dotdot.body, 'Not found');

  const bad = await rawGet(api.url, '/%ZZ');
  assert.equal(bad.status, 404);
  assert.equal(bad.body, 'Not found');

  api.reply('GET', '/index.html', 200, { should: 'not apply' });
  const stillFile = await fetch(api.url + '/index.html');
  assert.equal(stillFile.headers.get('content-type'), 'text/html; charset=utf-8');

  const postIndex = await fetch(api.url + '/index.html', { method: 'POST' });
  assert.equal(postIndex.status, 404);
  assert.deepEqual(await postIndex.json(), { error: 'Unknown route', details: [] });

  const rooms = await fetch(api.url + '/api/rooms');
  assert.deepEqual(await rooms.json(), []);

  assert.ok(api.requests.some(r => r.path === '/index.html'));
});

test('close(): ends open streams, server unreachable after', async () => {
  const api = await startFakeApi();
  const streamRes = await fetch(api.url + '/api/stream');
  const reader = streamRes.body.getReader();
  await reader.read();
  await api.close();
  await assert.rejects(fetch(api.url + '/api/rooms'));
});
