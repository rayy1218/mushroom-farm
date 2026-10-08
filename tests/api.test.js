'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { openFakeDb } = require('../tests/fakes/db.js');
const { createFakeRoomManager } = require('../tests/fakes/rooms.js');
const { createApi } = require('../server/api.js');
const { RoomError } = require('../server/rooms-common.js');

require('../sim.js');
require('../controller.js');

let NOW = 1791450000;
const now = () => NOW;

function startApi(extra) {
  const db = openFakeDb({ now });
  const rooms = createFakeRoomManager({ db, now });
  const fatals = [];
  const api = createApi({ db, rooms, root, now, heartbeatMs: 50, onFatal: e => fatals.push(e), ...extra });
  const server = http.createServer(api.handle).listen(0, '127.0.0.1');
  const ready = new Promise(resolve => server.on('listening', resolve));
  const url = () => `http://127.0.0.1:${server.address().port}`;
  function stop() {
    api.close();
    server.close();
  }
  return { get url() { return url(); }, db, rooms, api, fatals, stop, server, ready };
}

function seedRoom(db, name) {
  return db.createRoom({ name, volume: 60, vent: 'supply', settings: globalThis.ClimateController.defaultSettings() }).id;
}

function reading(t) {
  return { t, T: 18, RH: 88, CO2: 800, t_out: 30, rh_out: 60, ac_mode: 'cool', ac_setpoint: 17.5, fog: 1, fan: 1, lights: 1, circ: 0, power_w: 1000, kwh: 1 };
}

function rawGet(url, pathAndQuery, method = 'GET') {
  return new Promise((resolve, reject) => {
    const u = new URL(url + pathAndQuery);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

// `root`: a temporary folder holding short known texts for the static-file and main.js tests.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-'));
fs.writeFileSync(path.join(root, 'index.html'), '<html>farm</html>');
fs.writeFileSync(path.join(root, 'styles.css'), 'body{}');
fs.writeFileSync(path.join(root, 'sim.js'), '// sim');
fs.writeFileSync(path.join(root, 'room-rules.js'), '// room-rules');
fs.mkdirSync(path.join(root, 'web', 'sub'), { recursive: true });
fs.writeFileSync(path.join(root, 'web', 'a.js'), '// a');
fs.writeFileSync(path.join(root, 'web', 'sub', 'b.css'), '/* b */');
fs.writeFileSync(path.join(root, 'web', 'x.txt'), 'x');
fs.writeFileSync(path.join(root, 'web', '.hidden.js'), '// hidden');
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'farm.db'), 'binary');
fs.mkdirSync(path.join(root, 'server'), { recursive: true });
fs.writeFileSync(path.join(root, 'server', 'api.js'), '// api');
fs.writeFileSync(path.join(root, 'package.json'), '{}');
fs.writeFileSync(path.join(root, 'README.md'), '# readme');
fs.mkdirSync(path.join(root, '.git'), { recursive: true });
fs.writeFileSync(path.join(root, '.git', 'config'), '[core]');

describe('static files', () => {
  let ctx;
  test.before(async () => { ctx = startApi(); await ctx.ready; });
  test.after(() => ctx.stop());

  test('GET / and GET /index.html', async () => {
    for (const p of ['/', '/index.html']) {
      const r = await rawGet(ctx.url, p);
      assert.equal(r.status, 200);
      assert.equal(r.text, '<html>farm</html>');
      assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
      assert.equal(r.headers['cache-control'], 'no-cache');
      assert.equal(Number(r.headers['content-length']), Buffer.byteLength('<html>farm</html>'));
    }
  });

  test('known shared modules and web files give 200 with the right content type', async () => {
    const cases = [
      ['/styles.css', 'text/css; charset=utf-8'],
      ['/sim.js?v=2', 'text/javascript; charset=utf-8'],
      ['/room-rules.js', 'text/javascript; charset=utf-8'],
      ['/web/a.js', 'text/javascript; charset=utf-8'],
      ['/web/sub/b.css', 'text/css; charset=utf-8'],
    ];
    for (const [p, type] of cases) {
      const r = await rawGet(ctx.url, p);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers['content-type'], type, p);
    }
  });

  test('HEAD / gives the same headers, empty body', async () => {
    const r = await rawGet(ctx.url, '/', 'HEAD');
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(r.text, '');
  });

  test('POST / gives the static 404', async () => {
    const r = await rawGet(ctx.url, '/', 'POST');
    assert.equal(r.status, 404);
    assert.equal(r.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(r.text, 'Not found');
  });

  test('path-safety and unknown paths give 404', async () => {
    const paths = [
      '/controller.js', '/web/x.txt', '/web/', '/web', '/web/sub',
      '/web/../server/api.js', '/web/%2e%2e/server/api.js', '/web/.hidden.js',
      '/web/a%5Cb.js', '/web/a%00.js', '/web/%E0%A4%A', '/web//a.js',
      '/data/farm.db', '/package.json', '/server/api.js', '/README.md', '/.git/config', '/api',
    ];
    for (const p of paths) {
      const r = await rawGet(ctx.url, p);
      assert.equal(r.status, 404, p);
      assert.equal(r.text, 'Not found', p);
    }
  });
});

describe('serveStatic called directly', () => {
  test('GET /api/x returns false, writes nothing', () => {
    const { serveStatic } = require('../server/static.js');
    const req = { url: '/api/x', method: 'GET' };
    let wrote = false;
    const res = { writeHead: () => { wrote = true; }, end: () => { wrote = true; } };
    const result = serveStatic(req, res, root);
    assert.equal(result, false);
    assert.equal(wrote, false);
  });
});

describe('server/api.js core: routing, check order, bodies', () => {
  let ctx;
  test.before(async () => { ctx = startApi(); await ctx.ready; });
  test.after(() => ctx.stop());

  test('unmatched method/path combinations give 404 Unknown route', async () => {
    const cases = [
      ['GET', '/api/nope'], ['DELETE', '/api/rooms/1'], ['PUT', '/api/rooms'],
      ['HEAD', '/api/rooms'], ['GET', '/api/rooms/'], ['POST', '/api/stream'], ['GET', '/api/unknown'],
    ];
    for (const [method, p] of cases) {
      const r = await rawGet(ctx.url, p, method);
      assert.equal(r.status, 404, `${method} ${p}`);
      assert.equal(r.headers['cache-control'], 'no-store', `${method} ${p}`);
      if (method !== 'HEAD') assert.deepStrictEqual(JSON.parse(r.text), { error: 'Unknown route', details: [] }, `${method} ${p}`);
    }
  });

  test('bad :id formats and unknown/archived rooms give 404 Unknown room', async () => {
    const id = seedRoom(ctx.db, 'A');
    const archivedId = seedRoom(ctx.db, 'B');
    ctx.rooms.archive(archivedId);
    const bad = ['0', '01', '1.5', 'abc', '9999999999999999', '999999', String(archivedId)];
    for (const x of bad) {
      const r = await fetch(`${ctx.url}/api/rooms/${x}/settings`);
      assert.equal(r.status, 404, x);
      assert.deepStrictEqual(await r.json(), { error: 'Unknown room', details: [] }, x);
    }
  });

  test('room check comes before body parsing', async () => {
    const r = await fetch(`${ctx.url}/api/rooms/999999/settings`, {
      method: 'PUT', body: '{not json', headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(r.status, 404);
    assert.deepStrictEqual(await r.json(), { error: 'Unknown room', details: [] });
  });

  test('invalid JSON and an empty body give 400 Body is not valid JSON', async () => {
    const id = seedRoom(ctx.db, 'C');
    for (const body of ['{not json', '']) {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/mix`, { method: 'PUT', body });
      assert.equal(r.status, 400);
      assert.deepStrictEqual(await r.json(), { error: 'Body is not valid JSON', details: [] });
    }
  });

  test('a body over 1 MB gives 400 and stores nothing; exactly 1 MB is accepted', async () => {
    const id = seedRoom(ctx.db, 'D');
    const big = JSON.stringify({ verdict: 'good', runs: [], pad: 'x'.repeat(1048577) });
    const over = Buffer.byteLength(big) > 1048576 ? big : big + 'x'.repeat(1048577 - Buffer.byteLength(big) + 1);
    assert.ok(Buffer.byteLength(over) > 1048576);
    const r1 = await fetch(`${ctx.url}/api/rooms/${id}/capacity`, { method: 'POST', body: over });
    assert.equal(r1.status, 400);
    assert.deepStrictEqual(await r1.json(), { error: 'Body is larger than 1 MB', details: [] });
    assert.equal(ctx.db.latestCapacityReport(id), null);

    const base = { verdict: 'good', runs: [] };
    const overhead = Buffer.byteLength(JSON.stringify({ ...base, pad: '' }));
    const padLen = 1048576 - overhead;
    const exact = JSON.stringify({ ...base, pad: 'x'.repeat(padLen) });
    assert.equal(Buffer.byteLength(exact), 1048576);
    const r2 = await fetch(`${ctx.url}/api/rooms/${id}/capacity`, { method: 'POST', body: exact });
    assert.equal(r2.status, 201);
  });
});

describe('room routes 6.1, 6.2, 6.3, 6.19', () => {
  let ctx;
  test.before(async () => { ctx = startApi(); await ctx.ready; });
  test.after(() => ctx.stop());

  test('GET /api/rooms', async () => {
    const r0 = await fetch(`${ctx.url}/api/rooms`);
    assert.deepStrictEqual(await r0.json(), []);

    const a = seedRoom(ctx.db, 'A');
    const b = seedRoom(ctx.db, 'B');
    const r1 = await fetch(`${ctx.url}/api/rooms`);
    assert.equal(r1.status, 200);
    assert.deepStrictEqual(await r1.json(), ctx.rooms.list());

    ctx.rooms.archive(a);
    const r2 = await fetch(`${ctx.url}/api/rooms`);
    const ids = (await r2.json()).map(r => r.id);
    assert.ok(!ids.includes(a));
    assert.ok(ids.includes(b));
  });

  test('POST /api/rooms', async () => {
    const r = await fetch(`${ctx.url}/api/rooms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New room', volume: 60, vent: 'supply' }),
    });
    assert.equal(r.status, 201);
    const room = await r.json();
    assert.ok(room.live);
    const last = ctx.rooms.calls[ctx.rooms.calls.length - 1];
    assert.equal(last.method, 'create');
    assert.deepStrictEqual(last.args, [{ name: 'New room', volume: 60, vent: 'supply', settings: undefined }]);
  });

  test('POST with settings (C3 6.2, C2 9.4)', async () => {
    const r1 = await fetch(`${ctx.url}/api/rooms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Pink', volume: 200, vent: 'supply', settings: { crop: 'pink' } }),
    });
    assert.equal(r1.status, 201);
    const room1 = await r1.json();
    const s1 = await (await fetch(`${ctx.url}/api/rooms/${room1.id}/settings`)).json();
    assert.equal(s1.crop, 'pink');
    assert.equal(s1.roomM3, 200);
    const defaults = globalThis.ClimateController.defaultSettings();
    assert.equal(s1.spT, defaults.spT);

    const r2 = await fetch(`${ctx.url}/api/rooms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Pink2', volume: 200, vent: 'supply', settings: { crop: 'pink', roomM3: 90 } }),
    });
    const room2 = await r2.json();
    const s2 = await (await fetch(`${ctx.url}/api/rooms/${room2.id}/settings`)).json();
    assert.equal(s2.roomM3, 90);
  });

  test('POST 400s', async () => {
    const callsBefore = ctx.rooms.calls.length;
    const roomsBefore = ctx.db.listRooms();
    const badBodies = [
      {}, { name: '', volume: 60, vent: 'supply' }, { name: 'A', volume: 1, vent: 'supply' },
      { name: 'A', volume: 60, vent: 'side' }, null, 'x', [],
    ];
    for (const body of badBodies) {
      const r = await fetch(`${ctx.url}/api/rooms`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal((await r.json()).error, 'Invalid room', JSON.stringify(body));
    }
    for (const settings of [null, [], 5]) {
      const r = await fetch(`${ctx.url}/api/rooms`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'A', volume: 60, vent: 'supply', settings }),
      });
      assert.equal(r.status, 400, JSON.stringify(settings));
      assert.equal((await r.json()).error, 'Invalid settings', JSON.stringify(settings));
    }
    assert.equal(ctx.rooms.calls.length, callsBefore);
    assert.deepStrictEqual(ctx.db.listRooms(), roomsBefore);
  });

  test('PATCH', async () => {
    const id = seedRoom(ctx.db, 'Patchable');
    const r1 = await fetch(`${ctx.url}/api/rooms/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'B' }),
    });
    assert.equal(r1.status, 200);
    const last1 = ctx.rooms.calls[ctx.rooms.calls.length - 1];
    assert.equal(last1.method, 'update');
    assert.deepStrictEqual(last1.args, [id, { name: 'B' }]);

    const r2 = await fetch(`${ctx.url}/api/rooms/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }),
    });
    assert.equal(r2.status, 200);
    const body2 = await r2.json();
    assert.equal(body2.archived_at, NOW);
    assert.equal(body2.live, null);
    const methodsCalled = ctx.rooms.calls.slice(-1).map(c => c.method);
    assert.deepStrictEqual(methodsCalled, ['archive']);
    const r2b = await fetch(`${ctx.url}/api/rooms/${id}/settings`);
    assert.equal(r2b.status, 404);

    const id2 = seedRoom(ctx.db, 'Patchable2');
    const r3 = await fetch(`${ctx.url}/api/rooms/${id2}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ volume: 80, archived: true }),
    });
    const body3 = await r3.json();
    assert.equal(body3.archived_at, NOW);
    const recentMethods = ctx.rooms.calls.slice(-2).map(c => c.method);
    assert.deepStrictEqual(recentMethods, ['update', 'archive']);
  });

  test('PATCH 400s', async () => {
    const id = seedRoom(ctx.db, 'PatchBad');
    const callsBefore = ctx.rooms.calls.length;
    for (const body of [{}, { archived: false }, { colour: 1 }, { volume: 1 }]) {
      const r = await fetch(`${ctx.url}/api/rooms/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal((await r.json()).error, 'Invalid room', JSON.stringify(body));
    }
    assert.equal(ctx.rooms.calls.length, callsBefore);
  });

  test('POST /restart', async () => {
    const id = seedRoom(ctx.db, 'Restartable');
    ctx.rooms.setLive(id, { running: false, error: 'boom' });
    const r = await fetch(`${ctx.url}/api/rooms/${id}/restart`, { method: 'POST' });
    assert.equal(r.status, 200);
    const last = ctx.rooms.calls[ctx.rooms.calls.length - 1];
    assert.equal(last.method, 'restart');
    assert.deepStrictEqual(last.args, [id]);
    const body = await r.json();
    assert.equal(body.live.running, true);
    assert.equal(body.live.error, null);
  });
});

describe('settings routes 6.4-6.7', () => {
  let ctx;
  test.before(async () => { ctx = startApi(); await ctx.ready; });
  test.after(() => ctx.stop());

  test('GET /settings', async () => {
    const id = seedRoom(ctx.db, 'S1');
    const r = await fetch(`${ctx.url}/api/rooms/${id}/settings`);
    assert.equal(r.status, 200);
    assert.deepStrictEqual(await r.json(), ctx.db.currentSettings(id).settings);
  });

  test('PUT /settings', async () => {
    const id = seedRoom(ctx.db, 'S2');
    const before = ctx.db.currentSettings(id).settings;
    const r = await fetch(`${ctx.url}/api/rooms/${id}/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { spT: 20 }, note: '  x  ' }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok('settings' in body && 'warnings' in body);
    assert.equal('version' in body, false);
    const last = ctx.rooms.calls[ctx.rooms.calls.length - 1];
    assert.equal(last.method, 'applySettings');
    assert.deepStrictEqual(last.args, [id, { spT: 20 }, 'x']);

    const after = await (await fetch(`${ctx.url}/api/rooms/${id}/settings`)).json();
    assert.equal(after.spT, 20);
    const expected = { ...before, spT: 20 };
    assert.deepStrictEqual(after, expected);

    for (const note of [null, undefined, '   ']) {
      const b = note === undefined ? { settings: { spT: 21 } } : { settings: { spT: 21 }, note };
      const rr = await fetch(`${ctx.url}/api/rooms/${id}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
      });
      assert.equal(rr.status, 200);
      const call = ctx.rooms.calls[ctx.rooms.calls.length - 1];
      assert.equal(call.args.length, 3, String(note));
      assert.equal(call.args[2], undefined, String(note));
    }
  });

  test('PUT /settings 400s', async () => {
    const id = seedRoom(ctx.db, 'S3');
    const callsBefore = ctx.rooms.calls.length;
    const historyBefore = ctx.db.settingsHistory(id).length;
    const badBodies = [
      {}, { settings: null }, { settings: [] }, { settings: 'x' },
      { settings: { spT: 20 }, note: 5 }, { settings: { spT: 20 }, note: '  ' + 'x'.repeat(201) },
      { settings: { spT: 20 }, extra: 1 }, null, 'x',
    ];
    for (const body of badBodies) {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal((await r.json()).error, 'Invalid settings', JSON.stringify(body));
    }
    assert.equal(ctx.rooms.calls.length, callsBefore);
    assert.equal(ctx.db.settingsHistory(id).length, historyBefore);
  });

  test('__proto__ pollution: PUT /settings and POST /api/rooms', async () => {
    const id = seedRoom(ctx.db, 'S4');
    const raw1 = '{"__proto__":{"polluted":1},"settings":{"__proto__":{"polluted":1},"spT":22},"note":null}';
    const r1 = await fetch(`${ctx.url}/api/rooms/${id}/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: raw1,
    });
    assert.equal(r1.status, 200);
    assert.equal(({}).polluted, undefined);
    assert.deepStrictEqual(Object.keys(Object.prototype), []);

    const raw2 = '{"__proto__":{"polluted":1},"name":"PollutedRoom","volume":60,"vent":"supply"}';
    const r2 = await fetch(`${ctx.url}/api/rooms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw2,
    });
    assert.equal(r2.status, 201);
    assert.equal(({}).polluted, undefined);
    assert.deepStrictEqual(Object.keys(Object.prototype), []);
  });

  test('GET /settings/history', async () => {
    const id = seedRoom(ctx.db, 'S5');
    await fetch(`${ctx.url}/api/rooms/${id}/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: { spT: 23 } }),
    });
    const rows = await (await fetch(`${ctx.url}/api/rooms/${id}/settings/history`)).json();
    assert.equal(rows.length, 2);
    assert.ok(rows[0].id > rows[1].id);
    for (const row of rows) assert.deepStrictEqual(Object.keys(row).sort(), ['id', 'note', 'room_id', 'saved_at']);
  });

  test('POST /settings/restore/:v', async () => {
    const id = seedRoom(ctx.db, 'S6');
    const v1 = ctx.db.currentSettings(id);
    await fetch(`${ctx.url}/api/rooms/${id}/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: { spT: 24 } }),
    });
    const r = await fetch(`${ctx.url}/api/rooms/${id}/settings/restore/${v1.id}`, { method: 'POST' });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok('settings' in body && 'warnings' in body);
    const last = ctx.rooms.calls[ctx.rooms.calls.length - 1];
    assert.equal(last.method, 'applySettings');
    assert.deepStrictEqual(last.args, [id, v1.settings, `Restored version ${v1.id}`, { exact: true }]);
    const history = await (await fetch(`${ctx.url}/api/rooms/${id}/settings/history`)).json();
    assert.equal(history[0].note, `Restored version ${v1.id}`);
  });

  test('Restore 404s', async () => {
    const id = seedRoom(ctx.db, 'S7');
    const otherId = seedRoom(ctx.db, 'S8');
    const otherVersion = ctx.db.currentSettings(otherId).id;
    const callsBefore = ctx.rooms.calls.length;
    for (const v of ['abc', '0', '999999', String(otherVersion)]) {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/settings/restore/${v}`, { method: 'POST' });
      assert.equal(r.status, 404, v);
      assert.equal((await r.json()).error, 'Unknown settings version', v);
    }
    assert.equal(ctx.rooms.calls.length, callsBefore);
  });
});

describe('readings, events, alarms, ack (6.8-6.11)', () => {
  let ctx;
  test.before(async () => { ctx = startApi(); await ctx.ready; });
  test.after(() => ctx.stop());

  test('readings default', async () => {
    const id = seedRoom(ctx.db, 'R1');
    ctx.db.insertReading(id, reading(NOW - 3601));
    ctx.db.insertReading(id, reading(NOW - 3600));
    ctx.db.insertReading(id, reading(NOW));
    const rows = await (await fetch(`${ctx.url}/api/rooms/${id}/readings`)).json();
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.deepStrictEqual(Object.keys(row).sort(), [
        'CO2', 'RH', 'T', 'ac_mode', 'ac_setpoint', 'circ', 'fan', 'fog', 'kwh', 'lights', 'power_w', 'rh_out', 'room_id', 't', 't_out',
      ]);
    }
    assert.deepStrictEqual(rows, ctx.db.queryReadings(id, { from: NOW - 3600, to: NOW, step: null }));
  });

  test('readings step', async () => {
    const id = seedRoom(ctx.db, 'R2');
    ctx.db.insertReading(id, reading(NOW - 100));
    ctx.db.insertReading(id, reading(NOW));
    const stepped = await (await fetch(`${ctx.url}/api/rooms/${id}/readings?step=60`)).json();
    assert.deepStrictEqual(stepped, ctx.db.queryReadings(id, { from: NOW - 3600, to: NOW, step: 60 }));
    const raw = await (await fetch(`${ctx.url}/api/rooms/${id}/readings?step=0`)).json();
    assert.deepStrictEqual(raw, ctx.db.queryReadings(id, { from: NOW - 3600, to: NOW, step: null }));
  });

  test('readings 400', async () => {
    const id = seedRoom(ctx.db, 'R3');
    const bad = [
      'from=abc', 'from=-1', 'to=1.5', 'from=', 'step=86401', `from=${NOW}&to=${NOW - 10}`,
      `from=${NOW - 604801}&to=${NOW}`, `from=${NOW - 2678401}&to=${NOW}&step=900`,
    ];
    for (const q of bad) {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/readings?${q}`);
      assert.equal(r.status, 400, q);
      assert.equal((await r.json()).error, 'Invalid query', q);
    }
    const r2 = await fetch(`${ctx.url}/api/rooms/${id}/readings?foo=1`);
    assert.equal(r2.status, 200);
  });

  test('events', async () => {
    const id = seedRoom(ctx.db, 'R4');
    for (let i = 0; i < 5; i++) ctx.db.addEvent(id, { t: NOW + i, level: 'info', text: `e${i}` });
    const page1 = await (await fetch(`${ctx.url}/api/rooms/${id}/events?limit=2`)).json();
    assert.equal(page1.length, 2);
    assert.ok(page1[0].id > page1[1].id);
    const smallest = page1[page1.length - 1].id;
    const page2 = await (await fetch(`${ctx.url}/api/rooms/${id}/events?before=${smallest}`)).json();
    assert.ok(page2.every(e => e.id < smallest));
    const allPage = await (await fetch(`${ctx.url}/api/rooms/${id}/events`)).json();
    assert.ok(allPage.length <= 100);

    for (const q of ['limit=0', 'limit=501', 'before=0', 'before=x']) {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/events?${q}`);
      assert.equal(r.status, 400, q);
      assert.equal((await r.json()).error, 'Invalid query', q);
    }
  });

  test('alarms', async () => {
    const id = seedRoom(ctx.db, 'R5');
    ctx.db.raiseAlarm(id, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: NOW });
    const rows = await (await fetch(`${ctx.url}/api/rooms/${id}/alarms`)).json();
    assert.deepStrictEqual(rows, ctx.db.listAlarms(id, { recent: 20 }));
  });

  test('ack', async () => {
    const id = seedRoom(ctx.db, 'R6');
    ctx.db.raiseAlarm(id, { alarm_key: 'sensor_RH', level: 'warning', label: 'Sensor', at: NOW });
    const r1 = await fetch(`${ctx.url}/api/rooms/${id}/alarms/sensor_RH/ack`, { method: 'POST' });
    assert.equal(r1.status, 200);
    const body1 = await r1.json();
    assert.equal(body1.acked_at, NOW);
    const last = ctx.rooms.calls[ctx.rooms.calls.length - 1];
    assert.equal(last.method, 'ackAlarm');
    assert.deepStrictEqual(last.args, [id, 'sensor_RH']);

    const r2 = await fetch(`${ctx.url}/api/rooms/${id}/alarms/sensor_RH/ack`, { method: 'POST' });
    assert.equal(r2.status, 200);
    assert.deepStrictEqual(await r2.json(), body1);

    ctx.db.raiseAlarm(id, { alarm_key: 'rh Hi', level: 'warning', label: 'Spaced key', at: NOW });
    const r3 = await fetch(`${ctx.url}/api/rooms/${id}/alarms/rh%20Hi/ack`, { method: 'POST' });
    assert.equal(r3.status, 200);
    assert.equal((await r3.json()).alarm_key, 'rh Hi');

    const r4 = await fetch(`${ctx.url}/api/rooms/${id}/alarms/%E0%A4%A/ack`, { method: 'POST' });
    assert.equal(r4.status, 404);
    assert.equal((await r4.json()).error, 'Unknown alarm');

    const r5 = await fetch(`${ctx.url}/api/rooms/${id}/alarms/noSuchKey/ack`, { method: 'POST' });
    assert.equal(r5.status, 404);
    assert.equal((await r5.json()).error, 'Unknown alarm');
  });
});

describe('calibrations, mix, capacity (6.12-6.18)', () => {
  let ctx;
  test.before(async () => { ctx = startApi(); await ctx.ready; });
  test.after(() => ctx.stop());

  const fullCalib = { ua: 92, inf_ach: 0.3, moist_buffer: 3, co2_per_block: 41, rmse_t: 0.2, rmse_rh: 1, rmse_co2: 10, log_rows: 100 };

  test('POST /calibrations', async () => {
    const id = seedRoom(ctx.db, 'C1');
    const r1 = await fetch(`${ctx.url}/api/rooms/${id}/calibrations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fullCalib),
    });
    assert.equal(r1.status, 201);
    const body1 = await r1.json();
    assert.equal(body1.applied_at, null);
    assert.equal(body1.applied, false);
    assert.equal(body1.run_at, NOW);

    const r2 = await fetch(`${ctx.url}/api/rooms/${id}/calibrations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fullCalib, run_at: NOW - 500 }),
    });
    const body2 = await r2.json();
    assert.equal(body2.run_at, NOW - 500);

    const rowsBefore = ctx.db.listCalibrations(id).length;
    for (const bad of [{ ...fullCalib, ua: 19.9 }, { ...fullCalib, log_rows: 1 }, null, { ...fullCalib, extra: 1 }]) {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/calibrations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bad),
      });
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal((await r.json()).error, 'Invalid calibration', JSON.stringify(bad));
    }
    assert.equal(ctx.db.listCalibrations(id).length, rowsBefore);
  });

  test('GET /calibrations', async () => {
    const id = seedRoom(ctx.db, 'C2');
    const empty = await (await fetch(`${ctx.url}/api/rooms/${id}/calibrations`)).json();
    assert.deepStrictEqual(empty, []);
    const run1 = ctx.db.saveCalibration(id, { ...fullCalib, run_at: NOW - 100 });
    const run2 = ctx.db.saveCalibration(id, { ...fullCalib, run_at: NOW });
    await fetch(`${ctx.url}/api/rooms/${id}/calibrations/${run2.id}/apply`, { method: 'POST' });
    const rows = await (await fetch(`${ctx.url}/api/rooms/${id}/calibrations`)).json();
    assert.ok(rows[0].run_at >= rows[1].run_at);
    assert.equal(rows.filter(r => r.applied).length, 1);
    assert.equal(rows.find(r => r.id === run2.id).applied, true);
  });

  test('POST /calibrations/:run/apply', async () => {
    const id = seedRoom(ctx.db, 'C3');
    const run = ctx.db.saveCalibration(id, fullCalib);
    const r = await fetch(`${ctx.url}/api/rooms/${id}/calibrations/${run.id}/apply`, { method: 'POST' });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.applied, true);
    assert.equal(body.applied_at, NOW);
    const last = ctx.rooms.calls[ctx.rooms.calls.length - 1];
    assert.equal(last.method, 'restart');
    assert.deepStrictEqual(last.args, [id]);

    const otherId = seedRoom(ctx.db, 'C3b');
    const otherRun = ctx.db.saveCalibration(otherId, fullCalib);
    const callsBefore = ctx.rooms.calls.length;
    for (const runId of ['x', '0', '999999', String(otherRun.id)]) {
      const rr = await fetch(`${ctx.url}/api/rooms/${id}/calibrations/${runId}/apply`, { method: 'POST' });
      assert.equal(rr.status, 404, runId);
      assert.equal((await rr.json()).error, 'Unknown calibration run', runId);
    }
    assert.equal(ctx.rooms.calls.length, callsBefore);
  });

  test('Mix', async () => {
    const id = seedRoom(ctx.db, 'M1');
    const sent = [{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 300, co2_per_block: 55 }];
    const r1 = await fetch(`${ctx.url}/api/rooms/${id}/mix`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent),
    });
    assert.equal(r1.status, 200);
    const body1 = await r1.json();
    assert.equal(body1[0].co2_per_block, null);
    assert.equal(body1[1].co2_per_block, 55);
    const got = await (await fetch(`${ctx.url}/api/rooms/${id}/mix`)).json();
    assert.deepStrictEqual(got, body1);

    const r2 = await fetch(`${ctx.url}/api/rooms/${id}/mix`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([]),
    });
    assert.deepStrictEqual(await r2.json(), []);

    const before = ctx.db.getMix(id);
    for (const bad of ['not-array', [{ crop: 'shiitake', blocks: 1 }], [{ crop: 'oyster', blocks: -1 }]]) {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/mix`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bad),
      });
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal((await r.json()).error, 'Invalid crop mix', JSON.stringify(bad));
    }
    assert.deepStrictEqual(ctx.db.getMix(id), before);
  });

  test('Capacity', async () => {
    const id = seedRoom(ctx.db, 'CAP1');
    const r0 = await fetch(`${ctx.url}/api/rooms/${id}/capacity`);
    assert.equal(r0.status, 404);
    assert.equal((await r0.json()).error, 'No capacity report');

    const report = { verdict: 'good', utilisation: 74, runs: [] };
    const r1 = await fetch(`${ctx.url}/api/rooms/${id}/capacity`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report),
    });
    assert.equal(r1.status, 201);
    const body1 = await r1.json();
    assert.equal(body1.verdict, 'good');
    assert.equal(body1.utilisation, 74);
    assert.equal(body1.run_at, NOW);

    const r2 = await fetch(`${ctx.url}/api/rooms/${id}/capacity`);
    assert.deepStrictEqual(await r2.json(), body1);

    for (const bad of [{ verdict: 'bogus', runs: [] }, { verdict: 'good', runs: [], utilisation: 74.5 }]) {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/capacity`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bad),
      });
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal((await r.json()).error, 'Invalid capacity report', JSON.stringify(bad));
    }
  });
});

function dbErr(errcode) {
  return Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode });
}

async function withReplaced(obj, method, impl, fn) {
  const original = obj[method];
  obj[method] = impl;
  try {
    await fn();
  } finally {
    obj[method] = original;
  }
}

describe('error mapping and the database-error stop (4.4)', () => {
  let ctx, id;
  test.before(async () => { ctx = startApi(); await ctx.ready; id = seedRoom(ctx.db, 'E1'); });
  test.after(() => ctx.stop());

  test('rooms.create bad_input -> 400 Invalid room with details', async () => {
    await withReplaced(ctx.rooms, 'create', () => { throw new RoomError('bad_input', 'Bad input', ['name: x']); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'A', volume: 60, vent: 'supply' }),
      });
      assert.equal(r.status, 400);
      const body = await r.json();
      assert.equal(body.error, 'Invalid room');
      assert.deepStrictEqual(body.details, ['name: x']);
      assert.equal(ctx.fatals.length, 0);
    });
  });

  test('rooms.update bad_input -> 400 Invalid room', async () => {
    await withReplaced(ctx.rooms, 'update', () => { throw new RoomError('bad_input', 'Bad input', []); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'B' }),
      });
      assert.equal(r.status, 400);
      assert.equal((await r.json()).error, 'Invalid room');
    });
  });

  test('rooms.update, archive, restart, applySettings: not_found -> 404 Unknown room', async () => {
    await withReplaced(ctx.rooms, 'update', () => { throw new RoomError('not_found', 'Room not found', []); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'B' }),
      });
      assert.equal(r.status, 404);
      assert.equal((await r.json()).error, 'Unknown room');
    });
    await withReplaced(ctx.rooms, 'archive', () => { throw new RoomError('not_found', 'Room not found', []); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }),
      });
      assert.equal(r.status, 404);
      assert.equal((await r.json()).error, 'Unknown room');
    });
    await withReplaced(ctx.rooms, 'restart', () => { throw new RoomError('not_found', 'Room not found', []); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/restart`, { method: 'POST' });
      assert.equal(r.status, 404);
      assert.equal((await r.json()).error, 'Unknown room');
    });
    await withReplaced(ctx.rooms, 'applySettings', () => { throw new RoomError('not_found', 'Room not found', []); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: { spT: 20 } }),
      });
      assert.equal(r.status, 404);
      assert.equal((await r.json()).error, 'Unknown room');
    });
  });

  test('rooms.applySettings bad_input -> 400 Invalid settings', async () => {
    await withReplaced(ctx.rooms, 'applySettings', () => { throw new RoomError('bad_input', 'Bad input', ['x']); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: { spT: 20 } }),
      });
      assert.equal(r.status, 400);
      assert.equal((await r.json()).error, 'Invalid settings');
    });
  });

  test('rooms.ackAlarm not_found and bad_input -> 404 Unknown alarm', async () => {
    for (const code of ['not_found', 'bad_input']) {
      await withReplaced(ctx.rooms, 'ackAlarm', () => { throw new RoomError(code, 'x', []); }, async () => {
        const r = await fetch(`${ctx.url}/api/rooms/${id}/alarms/someKey/ack`, { method: 'POST' });
        assert.equal(r.status, 404, code);
        assert.equal((await r.json()).error, 'Unknown alarm', code);
      });
    }
  });

  test('db.currentSettings RangeError -> 500 Server fault', async () => {
    await withReplaced(ctx.db, 'currentSettings', () => { throw new RangeError('x'); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/settings`);
      assert.equal(r.status, 500);
      const body = await r.json();
      assert.equal(body.error, 'Server fault');
      assert.deepStrictEqual(body.details, ['x']);
      assert.equal(ctx.fatals.length, 0);
    });
  });

  test('db.listEvents and db.getRoom non-constraint sqlite errors -> 500, onFatal once', async () => {
    await withReplaced(ctx.db, 'listEvents', () => { throw dbErr(10); }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/events`);
      assert.equal(r.status, 500);
      assert.equal(ctx.fatals.length, before + 1);
      assert.equal(ctx.fatals[ctx.fatals.length - 1].message, 'disk I/O error');
    });
    await withReplaced(ctx.db, 'listEvents', () => { throw dbErr(13); }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/events`);
      assert.equal(r.status, 500);
      assert.equal(ctx.fatals.length, before + 1);
    });
    const originalGetRoom = ctx.db.getRoom;
    await withReplaced(ctx.db, 'getRoom', () => { throw dbErr(10); }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/settings`);
      assert.equal(r.status, 500);
      assert.equal(ctx.fatals.length, before + 1);
    });
    assert.equal(ctx.db.getRoom, originalGetRoom);
  });

  test('db.replaceMix CHECK constraint -> 500, no onFatal', async () => {
    await withReplaced(ctx.db, 'replaceMix', () => { throw dbErr(275); }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/mix`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([]),
      });
      assert.equal(r.status, 500);
      assert.equal(ctx.fatals.length, before);
    });
  });

  test('rooms.restart plain Error, and a thrown string -> 500, no onFatal', async () => {
    await withReplaced(ctx.rooms, 'restart', () => { throw new Error('boom'); }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/restart`, { method: 'POST' });
      assert.equal(r.status, 500);
      assert.deepStrictEqual((await r.json()).details, ['boom']);
      assert.equal(ctx.fatals.length, before);
    });
    await withReplaced(ctx.rooms, 'list', () => { throw 'x'; }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms`);
      assert.equal(r.status, 500);
      assert.deepStrictEqual((await r.json()).details, ['x']);
      assert.equal(ctx.fatals.length, before);
    });
  });
});

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function buildMainTmp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-main-'));
  const worktreeRoot = path.join(__dirname, '..');
  fs.mkdirSync(path.join(tmp, 'server'), { recursive: true });
  fs.copyFileSync(path.join(worktreeRoot, 'server', 'main.js'), path.join(tmp, 'server', 'main.js'));
  fs.copyFileSync(path.join(worktreeRoot, 'server', 'config.js'), path.join(tmp, 'server', 'config.js'));

  fs.writeFileSync(path.join(tmp, 'server', 'api.js'), `
'use strict';
const { createApi } = require(${JSON.stringify(path.join(worktreeRoot, 'server', 'api.js'))});
module.exports = {
  createApi(opts) {
    const real = createApi(opts);
    return {
      handle: real.handle,
      close: () => { console.log('stub: api.close'); return real.close(); },
    };
  },
};
`);

  fs.writeFileSync(path.join(tmp, 'server', 'db.js'), `
'use strict';
const { openFakeDb } = require(${JSON.stringify(path.join(worktreeRoot, 'tests', 'fakes', 'db.js'))});
module.exports = {
  openDb(p) {
    console.log('stub: openDb ' + p);
    if (process.env.STUB_DB_THROW) throw new Error('stub cannot open');
    const db = openFakeDb();
    const originalClose = db.close;
    db.close = function () { console.log('stub: db.close'); return originalClose(); };
    return db;
  },
};
`);

  fs.writeFileSync(path.join(tmp, 'server', 'rooms.js'), `
'use strict';
const { createFakeRoomManager } = require(${JSON.stringify(path.join(worktreeRoot, 'tests', 'fakes', 'rooms.js'))});
module.exports = {
  createRoomManager({ db }) {
    const rooms = createFakeRoomManager({ db });
    const originalStop = rooms.stop;
    const originalStart = rooms.start;
    rooms.stop = function (...args) { console.log('stub: rooms.stop'); return originalStop(...args); };
    rooms.start = function (...args) {
      console.log('stub: rooms.start');
      if (process.env.STUB_START_THROW === 'sqlite') {
        throw Object.assign(new Error('stub disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10 });
      }
      if (process.env.STUB_START_THROW === 'plain') {
        throw new Error('stub start failed');
      }
      const result = originalStart(...args);
      if (process.env.STUB_FATAL_MS) {
        setTimeout(() => {
          rooms.emit('fatal', { error: Object.assign(new Error('stub disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10 }) });
        }, Number(process.env.STUB_FATAL_MS));
      }
      return result;
    };
    return rooms;
  },
};
`);

  fs.writeFileSync(path.join(tmp, 'preload-os.js'), `
'use strict';
require('node:os').networkInterfaces = () => JSON.parse(process.env.STUB_IFACES || '{}');
`);

  fs.writeFileSync(path.join(tmp, 'index.html'), 'main-test-index');
  return tmp;
}

function spawnMain(tmp, env) {
  const cleanEnv = {};
  for (const k of Object.keys(process.env)) {
    if (!k.startsWith('FARM_') && !k.startsWith('STUB_')) cleanEnv[k] = process.env[k];
  }
  Object.assign(cleanEnv, env);
  const child = spawn(process.execPath, ['-r', path.join(tmp, 'preload-os.js'), path.join(tmp, 'server', 'main.js')], { env: cleanEnv, cwd: tmp });
  let out = '', err = '';
  const waiters = [];
  function checkWaiters() {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].test()) { waiters[i].resolve(); waiters.splice(i, 1); }
    }
  }
  child.stdout.on('data', d => { out += d.toString('utf8'); checkWaiters(); });
  child.stderr.on('data', d => { err += d.toString('utf8'); checkWaiters(); });
  const exitPromise = new Promise(resolve => child.on('exit', code => resolve(code)));
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 10000);
  exitPromise.then(() => clearTimeout(killTimer));

  function waitFor(testFn, timeoutMs = 5000) {
    if (testFn()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout; stdout=${out} stderr=${err}`)), timeoutMs);
      waiters.push({ test: testFn, resolve: () => { clearTimeout(t); resolve(); } });
    });
  }
  return {
    child,
    get stdout() { return out; },
    get stderr() { return err; },
    waitForStdout(text, timeoutMs) { return waitFor(() => out.includes(text), timeoutMs); },
    waitForExit(timeoutMs) {
      if (timeoutMs === undefined) return exitPromise;
      return Promise.race([exitPromise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout waiting for exit')), timeoutMs))]);
    },
  };
}

describe('server/main.js', () => {
  test('FARM_PORT=abc -> Bad configuration', async () => {
    const tmp = buildMainTmp();
    const p = spawnMain(tmp, { FARM_PORT: 'abc', FARM_HOST: '127.0.0.1' });
    const code = await p.waitForExit(10000);
    assert.equal(code, 1);
    assert.ok(p.stderr.startsWith('Bad configuration:'), p.stderr);
  });

  test('bad farm.config.json -> Bad configuration', async () => {
    const tmp = buildMainTmp();
    fs.writeFileSync(path.join(tmp, 'farm.config.json'), '{bad');
    const p = spawnMain(tmp, { FARM_HOST: '127.0.0.1' });
    const code = await p.waitForExit(10000);
    assert.equal(code, 1);
    assert.ok(p.stderr.startsWith('Bad configuration:'), p.stderr);
  });

  test('env FARM_PORT wins over farm.config.json port', async () => {
    const tmp = buildMainTmp();
    fs.writeFileSync(path.join(tmp, 'farm.config.json'), JSON.stringify({ port: 1 }));
    const port = await freePort();
    const p = spawnMain(tmp, { FARM_PORT: String(port), FARM_HOST: '127.0.0.1' });
    await p.waitForStdout(`Open http://127.0.0.1:${port}`);
    p.child.kill('SIGTERM');
    await p.waitForExit(10000);
  });

  test('no FARM_HOST, no usable network address -> exit 1', async () => {
    const tmp = buildMainTmp();
    const ifaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      eth0: [{ address: '203.0.113.5', family: 'IPv4', internal: false }],
    };
    const p = spawnMain(tmp, { STUB_IFACES: JSON.stringify(ifaces) });
    const code = await p.waitForExit(10000);
    assert.equal(code, 1);
    assert.ok(p.stderr.includes('No farm network address found; set FARM_HOST (for example 127.0.0.1).'), p.stderr);
  });

  test('no FARM_HOST, multiple candidates, listen fails on an address this machine lacks', async () => {
    const tmp = buildMainTmp();
    const ifaces = {
      wlan0: [{ address: '192.168.254.253', family: 'IPv4', internal: false }],
      eth0: [{ address: '10.254.253.252', family: 'IPv4', internal: false }],
    };
    const p = spawnMain(tmp, { STUB_IFACES: JSON.stringify(ifaces) });
    const code = await p.waitForExit(10000);
    assert.ok(p.stdout.includes('Farm network addresses: 10.254.253.252 (eth0), 192.168.254.253 (wlan0)'), p.stdout);
    assert.equal(code, 1);
    assert.ok(/Cannot listen on 10\.254\.253\.252:\d+:/.test(p.stderr), p.stderr);
    const order = ['stub: api.close', 'stub: rooms.stop', 'stub: db.close'].map(s => p.stdout.indexOf(s));
    assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], p.stdout);
  });

  test('normal start with FARM_DB; serves the API and index.html', async () => {
    const tmp = buildMainTmp();
    const port = await freePort();
    const p = spawnMain(tmp, { FARM_HOST: '127.0.0.1', FARM_PORT: String(port), FARM_DB: 'x/y.db' });
    await p.waitForStdout(`Open http://127.0.0.1:${port}`);
    assert.ok(p.stdout.includes(`stub: openDb ${path.join(tmp, 'x/y.db')}`), p.stdout);
    const idxOpenDb = p.stdout.indexOf('stub: openDb');
    const idxRoomsStart = p.stdout.indexOf('stub: rooms.start');
    const idxOpen = p.stdout.indexOf(`Open http://127.0.0.1:${port}`);
    assert.ok(idxOpenDb >= 0 && idxOpenDb < idxRoomsStart && idxRoomsStart < idxOpen, p.stdout);
    const line = p.stdout.split('\n').find(l => l.startsWith('Open http://'));
    assert.equal(line, `Open http://127.0.0.1:${port}`);

    const r1 = await fetch(`http://127.0.0.1:${port}/api/rooms`);
    assert.equal(r1.status, 200);
    assert.deepStrictEqual(await r1.json(), []);
    const r2 = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(await r2.text(), fs.readFileSync(path.join(tmp, 'index.html'), 'utf8'));

    p.child.kill('SIGTERM');
    await p.waitForExit(10000);
  });

  test('no FARM_DB -> default db path', async () => {
    const tmp = buildMainTmp();
    const port = await freePort();
    const p = spawnMain(tmp, { FARM_HOST: '127.0.0.1', FARM_PORT: String(port) });
    await p.waitForStdout('Open http://');
    assert.ok(p.stdout.includes(`stub: openDb ${path.join(tmp, 'data/farm.db')}`), p.stdout);
    p.child.kill('SIGTERM');
    await p.waitForExit(10000);
  });

  for (const sig of ['SIGTERM', 'SIGINT']) {
    test(`${sig} after a normal start -> exit 0, ordered shutdown`, async () => {
      const tmp = buildMainTmp();
      const port = await freePort();
      const p = spawnMain(tmp, { FARM_HOST: '127.0.0.1', FARM_PORT: String(port) });
      await p.waitForStdout('Open http://');
      p.child.kill(sig);
      const code = await p.waitForExit(10000);
      assert.equal(code, 0);
      const order = ['stub: api.close', 'stub: rooms.stop', 'stub: db.close'].map(s => p.stdout.indexOf(s));
      assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], p.stdout);
    });
  }

  test('STUB_DB_THROW=1 -> Cannot open the database', async () => {
    const tmp = buildMainTmp();
    const p = spawnMain(tmp, { FARM_HOST: '127.0.0.1', STUB_DB_THROW: '1' });
    const code = await p.waitForExit(10000);
    assert.equal(code, 1);
    assert.ok(p.stderr.includes('Cannot open the database: stub cannot open'), p.stderr);
  });

  test('STUB_START_THROW=sqlite -> Database error, no Cannot start the rooms', async () => {
    const tmp = buildMainTmp();
    const p = spawnMain(tmp, { FARM_HOST: '127.0.0.1', STUB_START_THROW: 'sqlite' });
    const code = await p.waitForExit(10000);
    assert.equal(code, 1);
    assert.ok(p.stdout.includes('stub: db.close'), p.stdout);
    assert.ok(p.stderr.includes('Database error: stub disk I/O error'), p.stderr);
    assert.ok(!p.stderr.includes('Cannot start the rooms'), p.stderr);
  });

  test('STUB_START_THROW=plain -> Cannot start the rooms, with a stack, no Database error', async () => {
    const tmp = buildMainTmp();
    const p = spawnMain(tmp, { FARM_HOST: '127.0.0.1', STUB_START_THROW: 'plain' });
    const code = await p.waitForExit(10000);
    assert.equal(code, 1);
    assert.ok(p.stdout.includes('stub: db.close'), p.stdout);
    assert.ok(p.stderr.includes('Cannot start the rooms: stub start failed'), p.stderr);
    assert.ok(p.stderr.split('\n').some(l => l.startsWith('    at ')), p.stderr);
    assert.ok(!p.stderr.includes('Database error'), p.stderr);
  });

  test('STUB_FATAL_MS=100 after a normal start -> Database error, no rooms.stop', async () => {
    const tmp = buildMainTmp();
    const port = await freePort();
    const p = spawnMain(tmp, { FARM_HOST: '127.0.0.1', FARM_PORT: String(port), STUB_FATAL_MS: '100' });
    await p.waitForStdout('Open http://');
    const code = await p.waitForExit(10000);
    assert.equal(code, 1);
    assert.ok(p.stderr.includes('Database error: stub disk I/O error'), p.stderr);
    assert.ok(!p.stdout.includes('stub: rooms.stop'), p.stdout);
  });
});
