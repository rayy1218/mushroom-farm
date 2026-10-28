import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { openDb } from '../server/db.js';
import { TELEGRAM_VIEW_DEFAULT } from '../server/settings.js';

// A port nothing listens on (never the owner's 1502).
async function freePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  probe.close();
  await once(probe, 'close');
  return port;
}

const MAIN = new URL('../server/main.js', import.meta.url).pathname;

// Starts server/main.js with the given env and resolves with the first line it prints.
function start(t, env) {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN], {
    env: { ...process.env, ...env },
  });
  const exited = once(child, 'exit');
  t.after(() => child.kill('SIGKILL'));
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const firstLine = new Promise((resolve) => {
    const onData = (chunk) => {
      out += chunk;
      if (out.includes('\n')) resolve(out.split('\n')[0]);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
  return { child, firstLine, exited };
}

test('starts on FARM_PORT with FARM_DB and stops cleanly on SIGINT', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-main-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'nested', 'farm.db');
  const gateway = `127.0.0.1:${await freePort()}`;
  const { child, firstLine, exited } = start(t, { FARM_PORT: '0', FARM_DB: dbPath, FARM_GATEWAY: gateway });
  const line = await firstLine;
  const match = /^Farm app on http:\/\/localhost:(\d+) \(database (.+), gateway (.+), reading every (\d+) s\)$/.exec(line);
  assert.ok(match, line);
  assert.equal(match[4], '5', 'the default interval');
  assert.equal(match[2], dbPath);
  assert.equal(match[3], gateway);
  assert.ok(existsSync(dbPath), 'creates the database folder and file');

  const res = await fetch(`http://localhost:${match[1]}/api/rooms`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);

  child.kill('SIGINT');
  const [code] = await exited;
  assert.equal(code, 0);
});

test('the startup line shows the stored reading interval, and a changed one is kept', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-main-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'farm.db');
  const seed = openDb(dbPath);
  seed.setSetting('pollSeconds', '17');
  seed.close();
  const gateway = `127.0.0.1:${await freePort()}`;
  const env = { FARM_PORT: '0', FARM_DB: dbPath, FARM_GATEWAY: gateway };
  const first = start(t, env);
  const line = await first.firstLine;
  assert.ok(line.endsWith(', reading every 17 s)'), line);
  const base = `http://localhost:${/localhost:(\d+)/.exec(line)[1]}`;
  assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), { pollSeconds: 17, outdoorAddress: null, electricityPrice: 0.55, waterPrice: null, ...TELEGRAM_VIEW_DEFAULT, farmGateway: gateway });
  const res = await fetch(`${base}/api/settings`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"pollSeconds":30}',
  });
  assert.equal(res.status, 200);
  first.child.kill('SIGINT');
  assert.equal((await first.exited)[0], 0);

  const second = start(t, env);
  assert.ok((await second.firstLine).endsWith(', reading every 30 s)'));
  second.child.kill('SIGINT');
  assert.equal((await second.exited)[0], 0);
});

test('a bad FARM_PORT stops with a message', async (t) => {
  const { firstLine, exited } = start(t, { FARM_PORT: 'abc', FARM_DB: ':memory:', FARM_GATEWAY: '127.0.0.1:1' });
  assert.equal(await firstLine, 'FARM_PORT must be a whole number from 0 to 65535, got "abc"');
  const [code] = await exited;
  assert.equal(code, 1);
});

test('a bad FARM_GATEWAY stops with a message', async (t) => {
  for (const value of ['nocolon', 'host:', ':1502', 'host:abc', 'host:0', 'host:65536', 'host:1:2x']) {
    const { firstLine, exited } = start(t, { FARM_PORT: '0', FARM_DB: ':memory:', FARM_GATEWAY: value });
    assert.equal(await firstLine, `FARM_GATEWAY must look like host:port, got "${value}"`);
    const [code] = await exited;
    assert.equal(code, 1);
  }
});

test('polls the gateway: readings reach the API, and SIGTERM stops cleanly', async (t) => {
  // A tiny gateway: answers every request with T 26.5, RH 88.1.
  const gateway = net.createServer((socket) => {
    socket.on('error', () => {});
    socket.on('data', (f) => {
      const out = Buffer.from([f[0], f[1], 0, 0, 0, 7, f[6], f[7], 4, 0x01, 0x09, 0x03, 0x71]);
      socket.write(out);
    });
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  t.after(() => gateway.close());
  const dir = mkdtempSync(join(tmpdir(), 'farm-main-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { child, firstLine, exited } = start(t, {
    FARM_PORT: '0',
    FARM_DB: join(dir, 'farm.db'),
    FARM_GATEWAY: `127.0.0.1:${gateway.address().port}`,
  });
  const port = /localhost:(\d+)/.exec(await firstLine)[1];
  const base = `http://localhost:${port}`;
  const post = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'R', length: 2, width: 2, height: 2, trhAddress: 1 }),
  });
  const { id } = await post.json();
  const deadline = Date.now() + 8000; // the first cycle may run before the room exists: wait for the next (5 s)
  let sensor;
  while (Date.now() < deadline) {
    [sensor] = await (await fetch(`${base}/api/rooms/${id}/sensors`)).json();
    if (sensor.status === 'online') break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(sensor.status, 'online');
  assert.deepEqual(sensor.lastOk.t, 26.5);
  assert.deepEqual(sensor.lastOk.rh, 88.1);
  child.kill('SIGTERM');
  const [code] = await exited;
  assert.equal(code, 0);
});

test('FARM_GATEWAY with an IPv6 address in brackets reaches the gateway', async (t) => {
  const gateway = net.createServer((socket) => socket.on('error', () => {}));
  gateway.listen(0, '::1');
  try {
    await once(gateway, 'listening');
  } catch {
    t.skip('no IPv6 loopback on this machine');
    return;
  }
  t.after(() => gateway.close());
  const dir = mkdtempSync(join(tmpdir(), 'farm-main-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'farm.db');
  const seed = openDb(dbPath); // a wired room, so the first cycle connects at once
  seed.createRoom({ name: 'R', length: 2, width: 2, height: 2, trhAddress: 1 });
  seed.close();
  const connected = once(gateway, 'connection');
  const gatewayText = `[::1]:${gateway.address().port}`;
  const { child, firstLine, exited } = start(t, { FARM_PORT: '0', FARM_DB: dbPath, FARM_GATEWAY: gatewayText });
  assert.match(await firstLine, /^Farm app on /);
  const [socket] = await Promise.race([
    connected,
    new Promise((_, reject) => setTimeout(() => reject(new Error('the app never connected to [::1]')), 3000)),
  ]);
  socket.destroy();
  child.kill('SIGTERM');
  const [code] = await exited;
  assert.equal(code, 0);
});
