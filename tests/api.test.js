'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
