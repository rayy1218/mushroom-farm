'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { openFakeDb } = require('../tests/fakes/db.js');
const { createFakeRoomManager } = require('../tests/fakes/rooms.js');
const { createApi } = require('../server/api.js');
const { RoomError } = require('../server/rooms-common.js');
const { NotFoundError } = require('../server/db-common.js');
const { HttpError } = require('../server/api-common.js');

require('../air.js');
require('../sim.js');
require('../controller.js');
require('../capacity.js');
require('../cycle.js');
require('../equipment.js');

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
  return db.createRoom({ name, volume: 60, settings: globalThis.ClimateController.defaultSettings() }).id;
}

function reading(t) {
  return { t, T: 18, RH: 88, CO2: 800, t_out: 30, rh_out: 60, ac_mode: 'cool', ac_setpoint: 17.5, fog: 1, air: 1, lights: 1, circ: 0, power_w: 1000, kwh: 1 };
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
fs.writeFileSync(path.join(root, 'air.js'), '// air');
fs.writeFileSync(path.join(root, 'room-rules.js'), '// room-rules');
fs.writeFileSync(path.join(root, 'cycle.js'), '// cycle');
fs.writeFileSync(path.join(root, 'equipment.js'), '// equipment');
fs.writeFileSync(path.join(root, 'harvest-rules.js'), '// harvest-rules');
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
      ['/air.js', 'text/javascript; charset=utf-8'],
      ['/room-rules.js', 'text/javascript; charset=utf-8'],
      ['/cycle.js', 'text/javascript; charset=utf-8'],
      ['/equipment.js', 'text/javascript; charset=utf-8'],
      ['/harvest-rules.js', 'text/javascript; charset=utf-8'],
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
    const base = { verdict: 'good', runs: [] };
    const overhead = Buffer.byteLength(JSON.stringify({ ...base, pad: '' }));

    // Exactly one byte past the limit (1,048,577 bytes), built the same way as the exact body below.
    const overPadLen = 1048577 - overhead;
    const over = JSON.stringify({ ...base, pad: 'x'.repeat(overPadLen) });
    assert.equal(Buffer.byteLength(over), 1048577);
    const r1 = await fetch(`${ctx.url}/api/rooms/${id}/capacity`, { method: 'POST', body: over });
    assert.equal(r1.status, 400);
    assert.deepStrictEqual(await r1.json(), { error: 'Body is larger than 1 MB', details: [] });
    assert.equal(ctx.db.latestCapacityReport(id), null);

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
      body: JSON.stringify({ name: 'New room', volume: 60 }),
    });
    assert.equal(r.status, 201);
    const room = await r.json();
    assert.ok(room.live);
    const last = ctx.rooms.calls[ctx.rooms.calls.length - 1];
    assert.equal(last.method, 'create');
    assert.deepStrictEqual(last.args, [{ name: 'New room', volume: 60, settings: undefined }]);
  });

  test('POST with settings (C3 6.2, C2 9.4)', async () => {
    const r1 = await fetch(`${ctx.url}/api/rooms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Pink', volume: 200, settings: { crop: 'pink' } }),
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
      body: JSON.stringify({ name: 'Pink2', volume: 200, settings: { crop: 'pink', roomM3: 90 } }),
    });
    const room2 = await r2.json();
    const s2 = await (await fetch(`${ctx.url}/api/rooms/${room2.id}/settings`)).json();
    assert.equal(s2.roomM3, 90);
  });

  test('POST 400s', async () => {
    const callsBefore = ctx.rooms.calls.length;
    const roomsBefore = ctx.db.listRooms();
    // The full task 2 checkRoom(body, false) invalid-body list (room-rules.test.js), run over HTTP.
    const badBodies = [
      { volume: 60 },                        // missing name
      { name: 'A' },                          // missing volume
      { name: '   ', volume: 60 },            // blank after trim
      { name: 'x'.repeat(61), volume: 60 },   // too long
      { name: 5, volume: 60 },                // not a string
      { name: 'A', volume: 4.99 },
      { name: 'A', volume: 5000.01 },
      { name: 'A', volume: '60' },
      { name: 'A', volume: null },
      { name: 'A', volume: 60, vent: 'supply' },              // vent is an unknown field (C9 6.3)
      { name: 'A', volume: 60, colour: 'red' },   // unknown field
      { name: 'A', volume: 60, archived: true },  // archived on POST
      {}, null, 'x', [],
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
        body: JSON.stringify({ name: 'A', volume: 60, settings }),
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

    const before2 = ctx.rooms.calls.length;
    const r2 = await fetch(`${ctx.url}/api/rooms/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }),
    });
    assert.equal(r2.status, 200);
    const body2 = await r2.json();
    assert.equal(body2.archived_at, NOW);
    assert.equal(body2.live, null);
    assert.deepStrictEqual(ctx.rooms.calls.slice(before2), [{ method: 'archive', args: [id] }]);
    const r2b = await fetch(`${ctx.url}/api/rooms/${id}/settings`);
    assert.equal(r2b.status, 404);

    const id2 = seedRoom(ctx.db, 'Patchable2');
    const before3 = ctx.rooms.calls.length;
    const r3 = await fetch(`${ctx.url}/api/rooms/${id2}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ volume: 80, archived: true }),
    });
    const body3 = await r3.json();
    assert.equal(body3.archived_at, NOW);
    assert.deepStrictEqual(ctx.rooms.calls.slice(before3), [
      { method: 'update', args: [id2, { volume: 80 }] },
      { method: 'archive', args: [id2] },
    ]);
  });

  test('PATCH 400s', async () => {
    const id = seedRoom(ctx.db, 'PatchBad');
    const callsBefore = ctx.rooms.calls.length;
    for (const body of [{}, { archived: false }, { colour: 1 }, { volume: 1 }, { vent: 'supply' }]) {
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

    const raw2 = '{"__proto__":{"polluted":1},"name":"PollutedRoom","volume":60}';
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
        'CO2', 'RH', 'T', 'ac_fan', 'ac_mode', 'ac_setpoint', 'air', 'circ', 'core', 'fog', 'kwh', 'lights', 'power_w', 'rh_out', 'room_id', 'stage', 't', 't_out',
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
    // The full task 2 checkCalibration invalid-body list (room-rules.test.js), run over HTTP.
    const { rmse_t, ...fullCalibNoRmseT } = fullCalib;
    const badCalibs = [
      { ...fullCalib, ua: 19.9 },
      { ...fullCalib, inf_ach: 3.1 },
      { ...fullCalib, moist_buffer: 0.9 },
      { ...fullCalib, co2_per_block: 4.9 },
      fullCalibNoRmseT,
      { ...fullCalib, rmse_rh: -0.1 },
      { ...fullCalib, log_rows: 1 },
      { ...fullCalib, log_rows: 2.5 },
      { ...fullCalib, run_at: 0 },
      { ...fullCalib, run_at: 1.5 },
      { ...fullCalib, run_at: NOW + 61 },
      { ...fullCalib, extra: 1 },
      null, 'x',
    ];
    for (const bad of badCalibs) {
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
    // The full task 2 checkMix invalid-row list (room-rules.test.js), run over HTTP.
    const badMixes = [
      {},                                                     // not an array
      ['x'],                                                  // a row not an object
      [{ crop: 'shiitake', blocks: 1 }],                       // unknown crop
      [{ crop: 'oyster', blocks: 1.5 }],
      [{ crop: 'oyster', blocks: -1 }],
      [{ crop: 'oyster', blocks: 200001 }],
      [{ crop: 'oyster', blocks: '5' }],
      [{ crop: 'oyster', blocks: 1, co2_per_block: 0 }],
      [{ crop: 'oyster', blocks: 1, co2_per_block: 1001 }],
      [{ crop: 'oyster', blocks: 1, co2_per_block: 'x' }],
      [{ crop: 'oyster', blocks: 1, extra: 1 }],
    ];
    for (const bad of badMixes) {
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

const READING_KEYS = ['room_id', 't', 'T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint', 'fog', 'air', 'lights', 'circ', 'power_w', 'kwh', 'ac_fan', 'stage', 'core'];

describe('revision 8 and 9 shapes: readings, rooms, calibrations (C3 3.1, 3.2, 6.8, 6.13)', () => {
  let ctx;
  test.before(async () => { ctx = startApi(); await ctx.ready; });
  test.after(() => ctx.stop());
  const post = (u, body) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  test('readings: 18 keys in order, air and no fan (C3 3.2)', async () => {
    const id = seedRoom(ctx.db, 'K1');
    ctx.db.insertReading(id, { ...reading(NOW), ac_fan: 'auto', stage: 'fruiting', core: 19.1 });
    const rows = await (await fetch(`${ctx.url}/api/rooms/${id}/readings`)).json();
    assert.equal(rows.length, 1);
    assert.deepStrictEqual(Object.keys(rows[0]), READING_KEYS);
    assert.equal(rows[0].air, 1);
    assert.equal('fan' in rows[0], false);
    assert.equal(rows[0].stage, 'fruiting');
  });

  test('rooms: no vent; vent gives Invalid room (C3 3.1, 7.2)', async () => {
    const id = seedRoom(ctx.db, 'V1');
    const list = await (await fetch(`${ctx.url}/api/rooms`)).json();
    for (const room of list) assert.equal('vent' in room, false);
    const before = ctx.rooms.calls.length;
    const r1 = await post(`${ctx.url}/api/rooms`, { name: 'A', volume: 60, vent: 'supply' });
    assert.equal(r1.status, 400);
    const b1 = await r1.json();
    assert.equal(b1.error, 'Invalid room');
    assert.ok(b1.details.includes('vent: unknown field'));
    const r2 = await fetch(`${ctx.url}/api/rooms/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vent: 'supply' }) });
    assert.equal(r2.status, 400);
    const b2 = await r2.json();
    assert.equal(b2.error, 'Invalid room');
    assert.ok(b2.details.includes('vent: unknown field'));
    assert.equal(ctx.rooms.calls.length, before);
  });

  test('rooms: live relays flush, blocks and air (C3 3.1)', async () => {
    const id = seedRoom(ctx.db, 'L1');
    const find = async () => (await (await fetch(`${ctx.url}/api/rooms`)).json()).find(r => r.id === id);
    const first = await find();
    assert.equal(first.live.flush, null);
    assert.equal(first.live.blocks, null);
    assert.equal(first.live.air, null);
    const air = { on: true, state: 'purge', reason: 'co2', delayed: false, timed: true, manual: false, manualOn: false, nextPurgeS: null, purgeS: 40, why: 'x', today: { purges: 3, avgS: 60, capped: 0 } };
    ctx.rooms.setLive(id, { flush: 2, blocks: 500, air });
    const live = (await find()).live;
    assert.equal(live.flush, 2);
    assert.equal(live.blocks, 500);
    assert.deepStrictEqual(live.air, air);
  });

  test('readings range: step 3600 over 400 days, step 600 over 40 days (C3 6.8)', async () => {
    const id = seedRoom(ctx.db, 'G1');
    const day = 86400;
    const q = (days, step) => fetch(`${ctx.url}/api/rooms/${id}/readings?from=${NOW - days * day}&to=${NOW}&step=${step}`);
    assert.equal((await q(400, 3600)).status, 200);
    const r = await q(40, 600);
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'Invalid query');
    assert.equal((await q(1300, 3600)).status, 200);
    assert.equal((await q(1301, 3600)).status, 400);
    assert.equal((await q(1301, 86400)).status, 400);
    assert.equal((await q(31, 3599)).status, 200);
    assert.equal((await q(32, 3599)).status, 400);
  });

  test('POST /calibrations: source, log_from, log_to, equipment (C3 6.13)', async () => {
    const id = seedRoom(ctx.db, 'Q1');
    const base = { ua: 92, inf_ach: 0.3, moist_buffer: 3, co2_per_block: 41, rmse_t: 0.2, rmse_rh: 1, rmse_co2: 10, log_rows: 100 };
    const r1 = await post(`${ctx.url}/api/rooms/${id}/calibrations`, { ...base, source: 'history' });
    assert.equal(r1.status, 400);
    assert.equal((await r1.json()).error, 'Invalid calibration');
    assert.equal(ctx.db.listCalibrations(id).length, 0);
    const eq = { ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: null, roof: null, height: 3 };
    const r2 = await post(`${ctx.url}/api/rooms/${id}/calibrations`, { ...base, source: 'history', log_from: NOW - 5000, log_to: NOW - 100, equipment: eq });
    assert.equal(r2.status, 201);
    const rows = await (await fetch(`${ctx.url}/api/rooms/${id}/calibrations`)).json();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'history');
    assert.equal(rows[0].log_from, NOW - 5000);
    assert.equal(rows[0].log_to, NOW - 100);
    assert.deepStrictEqual(rows[0].equipment, eq);
    assert.equal(rows[0].equipment.air_m3h, 1800);
  });
});

describe('error mapping and the database-error stop (4.4)', () => {
  let ctx, id;
  test.before(async () => { ctx = startApi(); await ctx.ready; id = seedRoom(ctx.db, 'E1'); });
  test.after(() => ctx.stop());

  const fullCalib = { ua: 92, inf_ach: 0.3, moist_buffer: 3, co2_per_block: 41 };

  test('rooms.create bad_input -> 400 Invalid room with details', async () => {
    await withReplaced(ctx.rooms, 'create', () => { throw new RoomError('bad_input', 'Bad input', ['name: x']); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'A', volume: 60 }),
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

  test('rooms.restart bad_input -> 404 Unknown room (6.14 apply, and 6.19 restart)', async () => {
    const run = ctx.db.saveCalibration(id, fullCalib);
    await withReplaced(ctx.rooms, 'restart', () => { throw new RoomError('bad_input', 'Bad input', []); }, async () => {
      const before = ctx.fatals.length;
      const r1 = await fetch(`${ctx.url}/api/rooms/${id}/calibrations/${run.id}/apply`, { method: 'POST' });
      assert.equal(r1.status, 404);
      assert.equal((await r1.json()).error, 'Unknown room');
      const r2 = await fetch(`${ctx.url}/api/rooms/${id}/restart`, { method: 'POST' });
      assert.equal(r2.status, 404);
      assert.equal((await r2.json()).error, 'Unknown room');
      assert.equal(ctx.fatals.length, before);
    });
  });

  test('rooms.restart not_found -> 404 Unknown room (6.14 apply, then restart)', async () => {
    const run = ctx.db.saveCalibration(id, fullCalib);
    await withReplaced(ctx.rooms, 'restart', () => { throw new RoomError('not_found', 'Room not found', []); }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/calibrations/${run.id}/apply`, { method: 'POST' });
      assert.equal(r.status, 404);
      assert.equal((await r.json()).error, 'Unknown room');
      assert.equal(ctx.fatals.length, before);
    });
  });

  test('rooms.applySettings not_found -> 404 Unknown room (6.7 restore)', async () => {
    const v = ctx.db.currentSettings(id);
    await withReplaced(ctx.rooms, 'applySettings', () => { throw new RoomError('not_found', 'Room not found', []); }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/settings/restore/${v.id}`, { method: 'POST' });
      assert.equal(r.status, 404);
      assert.equal((await r.json()).error, 'Unknown room');
      assert.equal(ctx.fatals.length, before);
    });
  });

  test('rooms.applySettings bad_input -> 400 Invalid settings (6.7 restore), with C2 details', async () => {
    const v = ctx.db.currentSettings(id);
    await withReplaced(ctx.rooms, 'applySettings', () => { throw new RoomError('bad_input', 'Bad input', ['x: y']); }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/settings/restore/${v.id}`, { method: 'POST' });
      assert.equal(r.status, 400);
      const body = await r.json();
      assert.equal(body.error, 'Invalid settings');
      assert.deepStrictEqual(body.details, ['x: y']);
      assert.equal(ctx.fatals.length, before);
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

  test('HttpError comes from server/api-common.js (C3 2.1)', async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'api.js'), 'utf8');
    assert.ok(!source.includes('class HttpError'));
    assert.ok(!source.includes('errorText'));
    await withReplaced(ctx.rooms, 'list', () => { throw new HttpError(400, 'Invalid thing', ['x: bad']); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms`);
      assert.equal(r.status, 400);
      assert.deepStrictEqual(await r.json(), { error: 'Invalid thing', details: ['x: bad'] });
      assert.equal(ctx.fatals.length, 0);
    });
  });

  test('error mapping: NotFoundError simulation, batch, crate (C3 4.1)', async () => {
    for (const [what, text] of [['simulation', 'Unknown simulation run'], ['batch', 'Unknown batch'], ['crate', 'Unknown crate']]) {
      await withReplaced(ctx.rooms, 'list', () => { throw new NotFoundError(what, 7); }, async () => {
        const r = await fetch(`${ctx.url}/api/rooms`);
        assert.equal(r.status, 404);
        assert.deepStrictEqual(await r.json(), { error: text, details: [] });
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
    const err10 = dbErr(10);
    await withReplaced(ctx.db, 'listEvents', () => { throw err10; }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/events`);
      assert.equal(r.status, 500);
      assert.equal(ctx.fatals.length, before + 1);
      assert.equal(ctx.fatals.at(-1).message, 'disk I/O error');
      assert.equal(ctx.fatals.at(-1), err10);
    });
    const err13 = dbErr(13);
    await withReplaced(ctx.db, 'listEvents', () => { throw err13; }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/events`);
      assert.equal(r.status, 500);
      assert.equal(ctx.fatals.length, before + 1);
      assert.equal(ctx.fatals.at(-1), err13);
    });
    const originalGetRoom = ctx.db.getRoom;
    const errGetRoom = dbErr(10);
    await withReplaced(ctx.db, 'getRoom', () => { throw errGetRoom; }, async () => {
      const before = ctx.fatals.length;
      const r = await fetch(`${ctx.url}/api/rooms/${id}/settings`);
      assert.equal(r.status, 500);
      assert.equal(ctx.fatals.length, before + 1);
      assert.equal(ctx.fatals.at(-1), errGetRoom);
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

// ---- simulation runs and equipment (C3 6.20-6.26) ----

const CC = globalThis.ClimateController;
const EQ = globalThis.ClimateEquipment;
const send = (url, method, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

function runInputs(over = {}) {
  return { mix: [{ crop: 'oyster', blocks: 2000, co2_per_block: null }], settings: CC.defaultSettings(), region: 'my-lowland', tariff: 0.57, volume: 60, calibration: null, empty_below: null, equipment: null, ...over };
}
function cycleResult(pass = true) {
  return { verdict: 'ok', totals: { days: 1, pass, kwh: 10, rm: 5.7, rmPerBlock: 0.003 }, stages: [{ stage: 'fruiting' }], series: Array.from({ length: 24 }, (_, h) => ({ h })) };
}
const cycleRun = (over = {}) => ({ kind: 'cycle', inputs: runInputs(), result: cycleResult(), ...over });
function eqReport() {
  return {
    verdict: 'ok', ac: { verdict: 'too-small' },
    air: { verdict: 'enough', own: 1800, capS: 180, needM3h: 800, recommended: null, margin: null, purgeS: 69, stage: 'pinning', text: 'Your 1,800 m³/h air exchange is enough: a purge takes at most 1.2 min (pinning), the limit is 3 min.' },
    runs: [{ kind: 'ac', ac_hp: 1 }], summary: ['x'],
  };
}

describe('simulation runs 6.20-6.24', () => {
  let ctx;
  test.before(async () => { ctx = startApi(); await ctx.ready; });
  test.after(() => ctx.stop());

  test('simulation runs: create, list, get, patch, delete (C3 6.20-6.24)', async () => {
    const id = seedRoom(ctx.db, 'S1');
    const base = `${ctx.url}/api/rooms/${id}/simulations`;
    const r1 = await send(base, 'POST', cycleRun({ note: '  x  ' }));
    assert.equal(r1.status, 201);
    assert.equal(r1.headers.get('cache-control'), 'no-store');
    const info1 = await r1.json();
    assert.equal('result' in info1, false);
    assert.equal(info1.kind, 'cycle');
    assert.equal(info1.verdict, 'pass');
    assert.equal(info1.blocks, 2000);
    assert.equal(info1.days, 1);
    assert.equal(info1.note, 'x');
    assert.equal(info1.room_id, id);
    const info2 = await (await send(base, 'POST', cycleRun({ note: '  ' }))).json();
    assert.equal(info2.note, null);
    const info3 = await (await send(base, 'POST', cycleRun())).json();
    assert.equal(info3.note, null);

    const list = await (await fetch(base)).json();
    assert.deepStrictEqual(list.map(r => r.id), [info3.id, info2.id, info1.id]);
    for (const row of list) assert.equal('result' in row, false);
    const page = await (await fetch(`${base}?limit=1`)).json();
    assert.deepStrictEqual(page.map(r => r.id), [info3.id]);
    const page2 = await (await fetch(`${base}?limit=2&before=${info3.id}`)).json();
    assert.deepStrictEqual(page2.map(r => r.id), [info2.id, info1.id]);

    const full = await (await fetch(`${base}/${info1.id}`)).json();
    assert.deepStrictEqual(full.result, cycleResult());
    assert.equal(full.id, info1.id);

    const rp = await send(`${base}/${info1.id}`, 'PATCH', { note: 'later', real_start: NOW - 86400 });
    assert.equal(rp.status, 200);
    const patched = await rp.json();
    assert.equal('result' in patched, false);
    assert.equal(patched.note, 'later');
    assert.equal(patched.real_start, NOW - 86400);
    const cleared = await (await send(`${base}/${info1.id}`, 'PATCH', { note: '   ' })).json();
    assert.equal(cleared.note, null);

    const rd = await fetch(`${base}/${info1.id}`, { method: 'DELETE' });
    assert.equal(rd.status, 200);
    const deleted = await rd.json();
    assert.equal(deleted.id, info1.id);
    assert.equal('result' in deleted, false);
    const gone = await fetch(`${base}/${info1.id}`);
    assert.equal(gone.status, 404);
    assert.equal((await gone.json()).error, 'Unknown simulation run');
    assert.deepStrictEqual((await (await fetch(base)).json()).map(r => r.id), [info3.id, info2.id]);
  });

  test('simulation runs: 400s and 404s (C3 6.20-6.24, 7.6)', async () => {
    const id = seedRoom(ctx.db, 'S2');
    const other = seedRoom(ctx.db, 'S2b');
    const archived = seedRoom(ctx.db, 'S2c');
    ctx.rooms.archive(archived);
    const base = `${ctx.url}/api/rooms/${id}/simulations`;
    const run = await (await send(base, 'POST', cycleRun())).json();
    const rowsBefore = ctx.db.listSimulationRuns(id, {}).length;

    for (const body of [null, JSON.stringify('x'), { ...cycleRun(), extra: 1 }, cycleRun({ kind: 'heat' }), cycleRun({ inputs: runInputs({ vent: 1 }) }), cycleRun({ note: 'x'.repeat(201) })]) {
      const r = await send(base, 'POST', body);
      assert.equal(r.status, 400, JSON.stringify(body)?.slice(0, 80));
      assert.equal((await r.json()).error, 'Invalid simulation run');
    }
    for (const body of [{}, { extra: 1 }, { real_start: 0 }, { note: 5 }, [], null]) {
      const r = await send(`${base}/${run.id}`, 'PATCH', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal((await r.json()).error, 'Invalid simulation run');
    }
    const rBad = await send(base, 'POST', '{not json');
    assert.equal(rBad.status, 400);
    assert.equal((await rBad.json()).error, 'Body is not valid JSON');
    assert.equal(ctx.db.listSimulationRuns(id, {}).length, rowsBefore);
    assert.equal(ctx.db.getSimulationRun(id, run.id).note, null);

    for (const q of ['limit=0', 'limit=201', 'limit=abc', 'before=0', 'before=x']) {
      const r = await fetch(`${base}?${q}`);
      assert.equal(r.status, 400, q);
      assert.equal((await r.json()).error, 'Invalid query', q);
    }

    const otherRun = await (await send(`${ctx.url}/api/rooms/${other}/simulations`, 'POST', cycleRun())).json();
    for (const runId of ['0', 'abc', '99999', '01', String(otherRun.id)]) {
      for (const [method, body] of [['GET', undefined], ['PATCH', { note: 'x' }], ['DELETE', undefined]]) {
        const r = await fetch(`${base}/${runId}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
        assert.equal(r.status, 404, `${method} ${runId}`);
        assert.deepStrictEqual(await r.json(), { error: 'Unknown simulation run', details: [] }, `${method} ${runId}`);
      }
    }
    // the other room's run is untouched
    assert.equal(ctx.db.getSimulationRun(other, otherRun.id).id, otherRun.id);

    const ab = `${ctx.url}/api/rooms/${archived}/simulations`;
    for (const [method, p] of [['GET', ''], ['POST', ''], ['GET', '/1'], ['PATCH', '/1'], ['DELETE', '/1']]) {
      const r = await fetch(ab + p, { method, ...(method === 'POST' || method === 'PATCH' ? { body: '{}' } : {}) });
      assert.equal(r.status, 404, `${method} ${p}`);
      assert.equal((await r.json()).error, 'Unknown room');
    }
  });

  test('simulation runs: body limits 8 MB on 6.21, 1 MB on 6.23', async () => {
    const id = seedRoom(ctx.db, 'S3');
    const base = `${ctx.url}/api/rooms/${id}/simulations`;
    const padded = n => { const run = cycleRun(); run.result.pad = 'x'.repeat(n); return JSON.stringify(run); };
    const ok = await send(base, 'POST', padded(7 * 1024 * 1024));
    assert.equal(ok.status, 201);
    const stored = ctx.db.listSimulationRuns(id, {}).length;
    assert.equal(stored, 1);
    const big = await send(base, 'POST', padded(9 * 1024 * 1024));
    assert.equal(big.status, 400);
    assert.deepStrictEqual(await big.json(), { error: 'Body is larger than 8 MB', details: [] });
    assert.equal(ctx.db.listSimulationRuns(id, {}).length, stored);
    const runId = ctx.db.listSimulationRuns(id, {})[0].id;
    const patch = await send(`${base}/${runId}`, 'PATCH', JSON.stringify({ note: 'x'.repeat(2 * 1024 * 1024) }));
    assert.equal(patch.status, 400);
    assert.equal((await patch.json()).error, 'Body is larger than 1 MB');
    // another route keeps the 1 MB limit
    const put = await send(`${ctx.url}/api/rooms/${id}/mix`, 'PUT', JSON.stringify([{ crop: 'oyster', blocks: 1, pad: 'x'.repeat(2 * 1024 * 1024) }]));
    assert.equal(put.status, 400);
    assert.equal((await put.json()).error, 'Body is larger than 1 MB');
  });

  test('simulation runs: an equipment Report (C3 6.21)', async () => {
    const id = seedRoom(ctx.db, 'S4');
    const body = { kind: 'equipment', inputs: runInputs({ equipment: { ...EQ.DEFAULTS } }), result: eqReport() };
    const r = await send(`${ctx.url}/api/rooms/${id}/simulations`, 'POST', body);
    assert.equal(r.status, 201);
    const info = await r.json();
    assert.equal(info.kind, 'equipment');
    assert.equal(info.verdict, 'too-small');
  });

  test('simulation errors: a NotFoundError from db.getSimulationRun gives 404 Unknown simulation run (C3 4.1)', async () => {
    const id = seedRoom(ctx.db, 'S5');
    await withReplaced(ctx.db, 'getSimulationRun', () => { throw new NotFoundError('simulation', 5); }, async () => {
      const r = await fetch(`${ctx.url}/api/rooms/${id}/simulations/5`);
      assert.equal(r.status, 404);
      assert.equal((await r.json()).error, 'Unknown simulation run');
    });
  });

  test('DELETE on another path gives Unknown route', async () => {
    seedRoom(ctx.db, 'S6');
    for (const p of ['/api/rooms/1', '/api/rooms/1/settings', '/api/rooms/1/simulations', '/api/rooms']) {
      const r = await fetch(ctx.url + p, { method: 'DELETE' });
      assert.equal(r.status, 404, p);
      assert.deepStrictEqual(await r.json(), { error: 'Unknown route', details: [] }, p);
    }
  });
});

describe('equipment 6.25-6.26', () => {
  let ctx;
  test.before(async () => { ctx = startApi(); await ctx.ready; });
  test.after(() => ctx.stop());

  const body = (over = {}) => ({ ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: 'pu50', roof: 'pu50', height: 3, ...over });
  const applyCalls = r => r.calls.filter(x => x.method === 'applySettings');

  test('equipment: GET null then the saved row; PUT stores (C3 6.25, 6.26)', async () => {
    const id = seedRoom(ctx.db, 'E1');
    const url = `${ctx.url}/api/rooms/${id}/equipment`;
    const r0 = await fetch(url);
    assert.equal(r0.status, 200);
    assert.equal(await r0.json(), null);
    const r1 = await send(url, 'PUT', body());
    assert.equal(r1.status, 200);
    const eq = await r1.json();
    assert.deepStrictEqual(Object.keys(eq), ['room_id', 'saved_at', 'ac_hp', 'ac_units', 'fog_lph', 'air_m3h', 'walls', 'roof', 'height']);
    assert.equal(eq.room_id, id);
    assert.equal(eq.saved_at, NOW);
    assert.equal(eq.ac_hp, 2.5);
    const again = await (await fetch(url)).json();
    assert.deepStrictEqual(again, eq);
    const replaced = await (await send(url, 'PUT', body({ ac_hp: 3, walls: null, roof: null }))).json();
    assert.equal(replaced.ac_hp, 3);
    assert.equal(replaced.walls, null);
  });

  test('equipment: an air_m3h that differs syncs the settings airM3h (lead decision 35)', async () => {
    const id = seedRoom(ctx.db, 'E2');
    const before = applyCalls(ctx.rooms).length;
    assert.equal(ctx.db.currentSettings(id).settings.airM3h, 1800);
    const r = await send(`${ctx.url}/api/rooms/${id}/equipment`, 'PUT', body({ air_m3h: 900 }));
    assert.equal(r.status, 200);
    const eq = await r.json();
    assert.equal(eq.air_m3h, 900);
    assert.equal('settings' in eq, false);
    const calls = applyCalls(ctx.rooms);
    assert.equal(calls.length, before + 1);
    const call = calls.at(-1);
    assert.deepStrictEqual(call.args, [id, { airM3h: 900 }, 'Air exchange size from Your machines']);
    assert.equal(call.args.length, 3);
    const settings = await (await fetch(`${ctx.url}/api/rooms/${id}/settings`)).json();
    assert.equal(settings.airM3h, 900);
  });

  test('equipment: the same air_m3h makes no applySettings call', async () => {
    const id = seedRoom(ctx.db, 'E3');
    await send(`${ctx.url}/api/rooms/${id}/equipment`, 'PUT', body({ air_m3h: 900 }));
    const calls = applyCalls(ctx.rooms).length;
    const versions = ctx.db.settingsHistory(id).length;
    const r = await send(`${ctx.url}/api/rooms/${id}/equipment`, 'PUT', body({ air_m3h: 900, ac_hp: 3 }));
    assert.equal(r.status, 200);
    assert.equal(applyCalls(ctx.rooms).length, calls);
    assert.equal(ctx.db.settingsHistory(id).length, versions);
    // the default size equals the default settings' airM3h: no call either
    const id2 = seedRoom(ctx.db, 'E3b');
    const c2 = applyCalls(ctx.rooms).length;
    await send(`${ctx.url}/api/rooms/${id2}/equipment`, 'PUT', body({ air_m3h: 1800 }));
    assert.equal(applyCalls(ctx.rooms).length, c2);
  });

  test('equipment: 400 Invalid equipment, nothing stored (C3 7.7)', async () => {
    const id = seedRoom(ctx.db, 'E4');
    const url = `${ctx.url}/api/rooms/${id}/equipment`;
    const calls = applyCalls(ctx.rooms).length;
    const { air_m3h, ...rest } = body();
    const r = await send(url, 'PUT', { ...rest, fan_m3h: 900 });
    assert.equal(r.status, 400);
    const b = await r.json();
    assert.equal(b.error, 'Invalid equipment');
    assert.ok(b.details.includes('air_m3h: missing'));
    assert.ok(b.details.includes('fan_m3h: unknown field'));
    assert.equal(await (await fetch(url)).json(), null);
    for (const bad of [body({ ac_hp: 1.25 }), [], null, JSON.stringify('x'), body({ walls: 'pu50', roof: null })]) {
      const rb = await send(url, 'PUT', bad);
      assert.equal(rb.status, 400, JSON.stringify(bad));
      assert.equal((await rb.json()).error, 'Invalid equipment');
      assert.equal(await (await fetch(url)).json(), null);
    }
    const rj = await send(url, 'PUT', '{nope');
    assert.equal(rj.status, 400);
    assert.equal((await rj.json()).error, 'Body is not valid JSON');
    assert.equal(applyCalls(ctx.rooms).length, calls);
  });

  test('equipment: applySettings bad_input is a 500 Server fault (C3 4.1)', async () => {
    const id = seedRoom(ctx.db, 'E5');
    await withReplaced(ctx.rooms, 'applySettings', () => { throw new RoomError('bad_input', 'Bad input', ['x']); }, async () => {
      const r = await send(`${ctx.url}/api/rooms/${id}/equipment`, 'PUT', body({ air_m3h: 900 }));
      assert.equal(r.status, 500);
      assert.equal((await r.json()).error, 'Server fault');
      assert.equal(ctx.fatals.length, 0);
    });
  });

  test('equipment: 404 for an unknown or archived room', async () => {
    const archived = seedRoom(ctx.db, 'E6');
    ctx.rooms.archive(archived);
    for (const x of [archived, 99999]) {
      for (const [method, b] of [['GET'], ['PUT', body()]]) {
        const r = await fetch(`${ctx.url}/api/rooms/${x}/equipment`, { method, ...(b ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}) });
        assert.equal(r.status, 404);
        assert.equal((await r.json()).error, 'Unknown room');
      }
    }
  });
});

describe('extra routes (C3 2.1, C10 13)', () => {
  const seen = [];
  let behaviour = () => ({ status: 201, body: { ok: true } });
  const extraRoutes = [
    { method: 'POST', segs: ['api', 'rooms', ':id', 'probe', ':thing'], needsRoom: true, hasBody: true, run: ctx => { seen.push(ctx); return behaviour(ctx); } },
    { method: 'GET', segs: ['api', 'probes', ':thing'], needsRoom: false, hasBody: false, run: ctx => { seen.push(ctx); return behaviour(ctx); } },
    { method: 'DELETE', segs: ['api', 'probes', ':probeId'], needsRoom: false, hasBody: false, run: ctx => { seen.push(ctx); return { status: 200, body: { deleted: ctx.params.probeId } }; } },
    { method: 'GET', segs: ['api', 'rooms'], needsRoom: false, hasBody: false, run: ctx => { seen.push(ctx); return { status: 200, body: ['extra'] }; } },
    { method: 'GET', segs: ['api', 'stream'], needsRoom: false, hasBody: false, run: ctx => { seen.push(ctx); return { status: 200, body: 'extra stream' }; } },
  ];
  let ctx;
  test.before(async () => { ctx = startApi({ extraRoutes }); await ctx.ready; });
  test.after(() => ctx.stop());
  test.beforeEach(() => { seen.length = 0; behaviour = () => ({ status: 201, body: { ok: true } }); });
  const probe = (id, thing, body, init = {}) => fetch(`${ctx.url}/api/rooms/${id}/probe/${thing}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body ?? {}), ...init });

  test('needsRoom: run gets ctx.id after the room check; not called for an unknown or archived room', async () => {
    const id = seedRoom(ctx.db, 'X1');
    const archived = seedRoom(ctx.db, 'X2');
    ctx.rooms.archive(archived);
    const ok = await probe(id, 'a');
    assert.equal(ok.status, 201);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].id, id);
    for (const x of [archived, 99999, 'abc', '0']) {
      const r = await probe(x, 'a');
      assert.equal(r.status, 404, String(x));
      assert.deepStrictEqual(await r.json(), { error: 'Unknown room', details: [] });
    }
    assert.equal(seen.length, 1);
  });

  test('hasBody: ctx.body parsed with the __proto__ reviver', async () => {
    const id = seedRoom(ctx.db, 'X3');
    await probe(id, 'a', '{"__proto__":{"polluted":1},"a":1}');
    assert.deepStrictEqual(seen[0].body, { a: 1 });
    assert.equal(({}).polluted, undefined);
    assert.equal(Object.hasOwn(seen[0].body, '__proto__'), false);
  });

  test('hasBody: over 1 MB and bad JSON answer 400 without calling run', async () => {
    const id = seedRoom(ctx.db, 'X4');
    const big = await probe(id, 'a', JSON.stringify({ pad: 'x'.repeat(1024 * 1024 + 10) }));
    assert.equal(big.status, 400);
    assert.deepStrictEqual(await big.json(), { error: 'Body is larger than 1 MB', details: [] });
    const bad = await probe(id, 'a', '{nope');
    assert.equal(bad.status, 400);
    assert.deepStrictEqual(await bad.json(), { error: 'Body is not valid JSON', details: [] });
    assert.equal(seen.length, 0);
  });

  test('ctx.params holds raw segments; ctx.query is the URLSearchParams', async () => {
    const id = seedRoom(ctx.db, 'X5');
    await fetch(`${ctx.url}/api/rooms/${id}/probe/a%20b?x=1`, { method: 'POST', body: '{}' });
    assert.equal(seen[0].params.thing, 'a%20b');
    assert.equal(seen[0].query.get('x'), '1');
    assert.ok(seen[0].query instanceof URLSearchParams);
    await fetch(`${ctx.url}/api/probes/zz%2F?y=2`);
    assert.equal(seen[1].id, undefined);
    assert.equal(seen[1].body, undefined);
    assert.equal(seen[1].params.thing, 'zz%2F');
    assert.equal(seen[1].query.get('y'), '2');
  });

  test("run's { status, body } is the reply", async () => {
    const id = seedRoom(ctx.db, 'X6');
    behaviour = () => ({ status: 201, body: { made: 1 } });
    const r = await probe(id, 'a');
    assert.equal(r.status, 201);
    assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepStrictEqual(await r.json(), { made: 1 });
    behaviour = () => ({ status: 200, body: null });
    const r2 = await probe(id, 'a');
    assert.equal(r2.status, 200);
    assert.equal(await r2.json(), null);
  });

  test('an HttpError from server/api-common.js is answered with status, error and details', async () => {
    const id = seedRoom(ctx.db, 'X7');
    behaviour = () => { throw new HttpError(404, 'Unknown batch', ['d']); };
    const r = await probe(id, 'a');
    assert.equal(r.status, 404);
    assert.deepStrictEqual(await r.json(), { error: 'Unknown batch', details: ['d'] });
    behaviour = () => { throw new HttpError(400, 'Batch is cleared'); };
    const r2 = await probe(id, 'a');
    assert.equal(r2.status, 400);
    assert.deepStrictEqual(await r2.json(), { error: 'Batch is cleared', details: [] });
    assert.equal(ctx.fatals.length, 0);
  });

  test('a constraint error gives 500 and no onFatal; a non-constraint sqlite error 500 and onFatal once', async () => {
    const id = seedRoom(ctx.db, 'X8');
    behaviour = () => { throw dbErr(275); };
    const r = await probe(id, 'a');
    assert.equal(r.status, 500);
    assert.equal((await r.json()).error, 'Server fault');
    assert.equal(ctx.fatals.length, 0);
    const err = dbErr(10);
    behaviour = () => { throw err; };
    const r2 = await probe(id, 'a');
    assert.equal(r2.status, 500);
    assert.equal(ctx.fatals.length, 1);
    assert.equal(ctx.fatals[0], err);
    ctx.fatals.length = 0;
    behaviour = () => { throw new NotFoundError('crate', 3); };
    const r3 = await probe(id, 'a');
    assert.equal(r3.status, 404);
    assert.equal((await r3.json()).error, 'Unknown crate');
  });

  test('a DELETE extra route answers', async () => {
    const r = await fetch(`${ctx.url}/api/probes/7`, { method: 'DELETE' });
    assert.equal(r.status, 200);
    assert.deepStrictEqual(await r.json(), { deleted: '7' });
    const r2 = await fetch(`${ctx.url}/api/probes`, { method: 'DELETE' });
    assert.equal(r2.status, 404);
    assert.equal((await r2.json()).error, 'Unknown route');
    const r3 = await fetch(`${ctx.url}/api/probes/7`, { method: 'PUT' });
    assert.equal(r3.status, 404);
    assert.equal((await r3.json()).error, 'Unknown route');
  });

  test('a C3 route wins over an extra route with the same method and path', async () => {
    seedRoom(ctx.db, 'X9');
    const r = await fetch(`${ctx.url}/api/rooms`);
    assert.equal(r.status, 200);
    assert.notDeepEqual(await r.json(), ['extra']);
    assert.equal(seen.length, 0);
  });

  test('extra routes come before /api/stream', async () => {
    // an extra GET api/stream is never reached: the C3 stream answers
    const controller = new AbortController();
    const r = await fetch(`${ctx.url}/api/stream`, { signal: controller.signal });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    controller.abort();
    assert.equal(seen.length, 0);
    // a path no route has gives Unknown route
    const r2 = await fetch(`${ctx.url}/api/nothing/here`);
    assert.equal(r2.status, 404);
    assert.equal((await r2.json()).error, 'Unknown route');
  });

  test('a pattern extra route does not take over /api/stream (lead decision 85)', async () => {
    const pat = startApi({ extraRoutes: [{ method: 'GET', segs: ['api', ':thing'], needsRoom: false, hasBody: false, run: () => ({ status: 200, body: 'extra' }) }] });
    await pat.ready;
    try {
      const controller = new AbortController();
      const r = await fetch(`${pat.url}/api/stream`, { signal: controller.signal });
      assert.equal(r.headers.get('content-type'), 'text/event-stream; charset=utf-8');
      controller.abort();
      assert.equal(await (await fetch(`${pat.url}/api/other`)).json(), 'extra');
    } finally { pat.stop(); }
  });

  test('without extraRoutes the C3 routes are unchanged (default [])', async () => {
    const plain = startApi();
    await plain.ready;
    try {
      const r = await fetch(`${plain.url}/api/probes/1`);
      assert.equal(r.status, 404);
      assert.equal((await r.json()).error, 'Unknown route');
    } finally { plain.stop(); }
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

  // The harvest stand-ins of C3 12.1 (C10 8.4): main.js does not load them until the lead wires it at gate 2.5.
  fs.writeFileSync(path.join(tmp, 'server', 'harvest-db.js'), `
'use strict';
const { openFakeHarvest } = require(${JSON.stringify(path.join(worktreeRoot, 'tests', 'fakes', 'harvest-db.js'))});
module.exports = {
  openHarvest(db) {
    console.log('stub: openHarvest');
    if (process.env.STUB_HARVEST_THROW) throw new Error('stub cannot open harvest');
    return openFakeHarvest(db);
  },
};
`);

  fs.writeFileSync(path.join(tmp, 'server', 'harvest-api.js'), `
'use strict';
module.exports = { createHarvestRoutes() { return []; } };
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
  test('the stub folder holds harvest-db.js and harvest-api.js (C3 12.1)', async () => {
    const tmp = buildMainTmp();
    const worktreeRoot = path.join(__dirname, '..');
    const code = `
      const { openFakeDb } = require(${JSON.stringify(path.join(worktreeRoot, 'tests', 'fakes', 'db.js'))});
      const { openHarvest } = require(${JSON.stringify(path.join(tmp, 'server', 'harvest-db.js'))});
      const { createHarvestRoutes } = require(${JSON.stringify(path.join(tmp, 'server', 'harvest-api.js'))});
      const h = openHarvest(openFakeDb());
      console.log(typeof h.createBatch);
      console.log(JSON.stringify(createHarvestRoutes()));
    `;
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('STUB_')));
    const ok = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: clean });
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepStrictEqual(ok.stdout.trim().split('\n'), ['stub: openHarvest', 'function', '[]']);
    const bad = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: { ...clean, STUB_HARVEST_THROW: '1' } });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stdout, /stub: openHarvest/);
    assert.match(bad.stderr, /stub cannot open harvest/);
  });

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
