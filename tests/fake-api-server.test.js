// tests/fakes/api-server.js: the fake C3/C5 HTTP server (docs/contracts/web.md section 4.5; lead-fakes task 9).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
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

  const del = await fetch(api.url + '/api/rooms/3/simulations/7', { method: 'DELETE' });
  assert.equal(del.status, 200); // C5 4.5 revision 7: DELETE under /api/ answers {}
  assert.deepEqual(await del.json(), {});
  const del2 = await fetch(api.url + '/api/batches/1/crates/2', { method: 'DELETE' });
  assert.equal(del2.status, 200);
  assert.deepEqual(await del2.json(), {});

  const patch = await fetch(api.url + '/api/rooms/3', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x' }) });
  assert.deepEqual(await patch.json(), { name: 'x' });
  const options = await fetch(api.url + '/api/rooms/3', { method: 'OPTIONS' });
  assert.equal(options.status, 404); // any other method

  const page = await fetch(api.url + '/index.html');
  assert.equal(page.status, 404);
  assert.deepEqual(await page.json(), { error: 'Unknown route', details: [] });
});

test('default replies: simulations and batches are arrays, equipment is null (C5 4.5)', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());
  for (const p of ['/api/rooms/3/simulations', '/api/rooms/3/simulations?limit=5&before=9', '/api/batches', '/api/batches?room=1&open=1']) {
    const res = await fetch(api.url + p);
    assert.equal(res.status, 200, p);
    assert.deepEqual(await res.json(), [], p);
  }
  const eq = await fetch(api.url + '/api/rooms/3/equipment');
  assert.equal(eq.status, 200);
  assert.equal(eq.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(await eq.text(), 'null');
  // The other routes keep the {} default: one simulation run, one batch, a room's calibration list is an array.
  assert.deepEqual(await (await fetch(api.url + '/api/rooms/3/simulations/7')).json(), {});
  assert.deepEqual(await (await fetch(api.url + '/api/batches/4')).json(), {});
  assert.deepEqual(await (await fetch(api.url + '/api/rooms/3/calibrations')).json(), []);
  // A reply set by the test beats a default.
  api.reply('GET', '/api/rooms/3/equipment', 200, { room_id: 3 });
  assert.deepEqual(await (await fetch(api.url + '/api/rooms/3/equipment')).json(), { room_id: 3 });
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

test('reply(): of two patterns that both match the same path, the one set last wins', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());

  // Both the RegExp and the string pattern match '/api/rooms/9'; the RegExp was set first.
  api.reply('GET', /^\/api\/rooms\/\d+$/, 200, { from: 'regexp' });
  api.reply('GET', '/api/rooms/9', 200, { from: 'string' });
  const r1 = await fetch(api.url + '/api/rooms/9');
  assert.deepEqual(await r1.json(), { from: 'string' });

  // Set again in the opposite order: now the RegExp (set last) wins.
  api.reply('GET', '/api/rooms/9', 200, { from: 'string' });
  api.reply('GET', /^\/api\/rooms\/\d+$/, 200, { from: 'regexp' });
  const r2 = await fetch(api.url + '/api/rooms/9');
  assert.deepEqual(await r2.json(), { from: 'regexp' });
});

test('stream: default retry is 3000', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());
  const res = await fetch(api.url + '/api/stream');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const reader = res.body.getReader();
  const { value } = await reader.read();
  assert.equal(Buffer.from(value).toString('utf8'), 'retry: 3000\n\n');
  await reader.cancel();
});

test('stream: retry line, emit, dropStreams, reconnect, reply override', async (t) => {
  const api = await startFakeApi({ retryMs: 50 });
  t.after(() => api.close());

  const controller1 = new AbortController();
  const res1 = await fetch(api.url + '/api/stream', { signal: controller1.signal });
  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(res1.headers.get('cache-control'), 'no-store');
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

test('stream: a client-aborted stream is removed; emit and dropStreams after do not throw', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());

  const aborted = new AbortController();
  const abortedRes = await fetch(api.url + '/api/stream', { signal: aborted.signal });
  await abortedRes.body.getReader().read();
  aborted.abort();
  // Give the server a tick to notice the aborted connection before touching the still-open stream below.
  await new Promise(r => setTimeout(r, 20));

  const kept = await fetch(api.url + '/api/stream');
  const keptReader = kept.body.getReader();
  await keptReader.read();

  assert.doesNotThrow(() => api.emit('reading', { t: 1 }));
  const { value } = await keptReader.read();
  assert.equal(Buffer.from(value).toString('utf8'), 'event: reading\ndata: {"t":1}\n\n'); // the live stream still works

  assert.doesNotThrow(() => api.dropStreams());
  const done = await keptReader.read();
  assert.equal(done.done, true);
});

test('root: static files by C3 section 9 rules', async (t) => {
  const api = await startFakeApi({ root: ROOT });
  t.after(() => api.close());

  const indexBytes = fs.readFileSync(path.join(ROOT, 'index.html'));
  for (const p of ['/', '/index.html']) {
    const res = await fetch(api.url + p);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.ok(res.headers.get('content-length'));
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    const body = Buffer.from(await res.arrayBuffer());
    assert.ok(body.equals(indexBytes), `${p} body must be the bytes of index.html`);
  }

  const roomRules = await fetch(api.url + '/room-rules.js');
  assert.equal(roomRules.status, 200);
  assert.equal(roomRules.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.ok(Buffer.from(await roomRules.arrayBuffer()).equals(fs.readFileSync(path.join(ROOT, 'room-rules.js'))));

  const webRooms = await fetch(api.url + '/web/rooms.js?v=2');
  assert.equal(webRooms.status, 200);
  assert.equal(webRooms.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.ok(Buffer.from(await webRooms.arrayBuffer()).equals(fs.readFileSync(path.join(ROOT, 'web', 'rooms.js'))));

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

test('root: the shared modules of C3 9, air.js, cycle.js, equipment.js and harvest-rules.js included', async (t) => {
  // A temporary root: the test does not depend on which modules exist in the repo yet.
  const names = ['controller', 'sim', 'air', 'runtime', 'capacity', 'calib', 'room-rules', 'cycle', 'equipment', 'harvest-rules'];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-api-root-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const n of names) fs.writeFileSync(path.join(root, `${n}.js`), `// ${n}\nglobalThis.x_${n.replace('-', '_')} = 1;\n`);
  const api = await startFakeApi({ root });
  t.after(() => api.close());
  for (const n of names) {
    const res = await fetch(`${api.url}/${n}.js`);
    assert.equal(res.status, 200, n);
    assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8', n);
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(fs.readFileSync(path.join(root, `${n}.js`))), n);
  }
  // A module that is not in the list is a 404, even when the file exists.
  fs.writeFileSync(path.join(root, 'secret.js'), 'x');
  const secret = await fetch(`${api.url}/secret.js`);
  assert.equal(secret.status, 404);
  assert.equal(await secret.text(), 'Not found');
});

test('root: /air.js, /cycle.js are the repo files', async (t) => {
  const api = await startFakeApi({ root: ROOT });
  t.after(() => api.close());
  for (const n of ['air', 'cycle']) {
    const res = await fetch(`${api.url}/${n}.js`);
    assert.equal(res.status, 200, n);
    assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8', n);
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(fs.readFileSync(path.join(ROOT, `${n}.js`))), n);
  }
});

test('close(): ends open streams, server unreachable after', async () => {
  const api = await startFakeApi();
  const streamRes = await fetch(api.url + '/api/stream');
  const reader = streamRes.body.getReader();
  await reader.read();
  await api.close();
  await assert.rejects(fetch(api.url + '/api/rooms'));
});
