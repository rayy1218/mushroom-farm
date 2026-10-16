import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createSensors } from '../device/sensors.js';
import { createModbusServer } from '../device/modbus-server.js';
import { createDeviceHttp, createRequestLog } from '../device/http.js';

let sensors;
let log;
let http;
let modbus;
let base;

before(async () => {
  sensors = createSensors({});
  log = createRequestLog();
  http = createDeviceHttp(sensors, log);
  modbus = createModbusServer(sensors, { onRequest: log.add });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve) => modbus.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${http.address().port}`;
});

after(async () => {
  await new Promise((resolve) => http.close(resolve));
  await new Promise((resolve) => modbus.close(resolve));
});

function reset() {
  for (const s of sensors.list()) sensors.remove(s.address);
}

async function call(method, path, body, headers) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json', ...headers };
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type'), body: text ? JSON.parse(text) : null };
}

test('GET /api/sensors lists sensors by address', async () => {
  reset();
  sensors.add({ address: 9, kind: 'co2' });
  sensors.add({ address: 3, kind: 'trh' });
  const res = await call('GET', '/api/sensors');
  assert.equal(res.status, 200);
  assert.equal(res.type, 'application/json; charset=utf-8');
  assert.deepEqual(res.body.map((s) => s.address), [3, 9]);
  assert.deepEqual(res.body[0], { address: 3, kind: 'trh', t: 25, rh: 85, co2: null, answering: true });
});

test('POST /api/sensors adds a sensor', async () => {
  reset();
  const res = await call('POST', '/api/sensors', { address: 4, kind: 'co2' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { address: 4, kind: 'co2', t: null, rh: null, co2: 800, answering: true });
  assert.equal(sensors.get(4).kind, 'co2');
});

test('POST errors: 400 with field, 409 duplicate', async () => {
  reset();
  assert.deepEqual((await call('POST', '/api/sensors', { address: 0, kind: 'trh' })).body.field, 'address');
  assert.deepEqual((await call('POST', '/api/sensors', { address: 1, kind: 'x' })).body.field, 'kind');
  assert.equal((await call('POST', '/api/sensors', { address: 1, kind: 'x' })).status, 400);
  assert.equal((await call('POST', '/api/sensors', '[1]')).status, 400);
  await call('POST', '/api/sensors', { address: 1, kind: 'trh' });
  const dup = await call('POST', '/api/sensors', { address: 1, kind: 'co2' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.field, 'address');
  assert.equal(typeof dup.body.error, 'string');
});

test('invalid JSON is 400', async () => {
  const res = await call('POST', '/api/sensors', '{nope');
  assert.equal(res.status, 400);
});

test('bodies need a JSON content type: 415', async () => {
  const res = await fetch(`${base}/api/sensors`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"address":1,"kind":"trh"}' });
  assert.equal(res.status, 415);
  const none = await fetch(`${base}/api/sensors`, { method: 'POST', body: 'x'.repeat(5) });
  assert.equal(none.status, 415);
  const put = await fetch(`${base}/api/sensors/1`, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(put.status, 415);
});

test('PUT updates values and answering', async () => {
  reset();
  sensors.add({ address: 1, kind: 'trh' });
  sensors.add({ address: 2, kind: 'co2' });
  const a = await call('PUT', '/api/sensors/1', { t: 22.5, rh: 70 });
  assert.equal(a.status, 200);
  assert.equal(a.body.t, 22.5);
  const b = await call('PUT', '/api/sensors/2', { co2: 1500, answering: false });
  assert.equal(b.body.co2, 1500);
  assert.equal(b.body.answering, false);
  assert.equal(sensors.get(2).answering, false);
});

test('PUT errors: 400 limits, 404 unknown, 404 bad path', async () => {
  reset();
  sensors.add({ address: 1, kind: 'trh' });
  const high = await call('PUT', '/api/sensors/1', { t: 81 });
  assert.equal(high.status, 400);
  assert.equal(high.body.field, 't');
  assert.equal((await call('PUT', '/api/sensors/1', { co2: 5 })).status, 400);
  assert.equal((await call('PUT', '/api/sensors/55', { t: 20 })).status, 404);
  assert.equal((await call('PUT', '/api/sensors/abc', { t: 20 })).status, 404);
  assert.equal(sensors.get(1).t, 25);
});

test('DELETE removes a sensor', async () => {
  reset();
  sensors.add({ address: 1, kind: 'trh' });
  const res = await fetch(`${base}/api/sensors/1`, { method: 'DELETE' });
  assert.equal(res.status, 204);
  assert.equal(sensors.list().length, 0);
  const again = await call('DELETE', '/api/sensors/1');
  assert.equal(again.status, 404);
});

test('unknown API routes are 404 JSON', async () => {
  const res = await call('GET', '/api/nope');
  assert.equal(res.status, 404);
  assert.equal(typeof res.body.error, 'string');
  assert.equal((await call('DELETE', '/api/sensors')).status, 404);
});

test('GET /api/log shows the latest 20 requests, newest first, after a Modbus request', async () => {
  reset();
  sensors.add({ address: 1, kind: 'trh' });
  const socket = net.connect(modbus.address().port, '127.0.0.1');
  await new Promise((resolve) => socket.once('connect', resolve));
  const request = (tid, unit) => {
    const b = Buffer.alloc(12);
    b.writeUInt16BE(tid, 0);
    b.writeUInt16BE(6, 4);
    b.writeUInt8(unit, 6);
    b.writeUInt8(4, 7);
    b.writeUInt16BE(1, 8);
    b.writeUInt16BE(2, 10);
    return b;
  };
  const got = new Promise((resolve) => socket.once('data', resolve));
  socket.write(request(1, 1));
  await got;
  let res = await call('GET', '/api/log');
  assert.equal(res.status, 200);
  assert.equal(res.body[0].address, 1);
  assert.equal(res.body[0].fn, 4);
  assert.equal(res.body[0].result, 'answered');
  assert.equal(typeof res.body[0].at, 'number');
  for (let i = 0; i < 25; i += 1) socket.write(request(2 + i, 200));
  const deadline = Date.now() + 1000;
  while (log.list()[0].address !== 200 || log.list().filter((e) => e.address === 200).length < 20) {
    if (Date.now() > deadline) assert.fail('log not filled');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  res = await call('GET', '/api/log');
  assert.equal(res.body.length, 20);
  assert.equal(res.body[0].result, 'ignored');
  socket.destroy();
});

test('serves the page files', async () => {
  for (const [path, type] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/styles.css', 'text/css']]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), new RegExp(type));
    assert.ok((await res.text()).length > 100, path);
  }
  assert.equal((await fetch(`${base}/nope.js`)).status, 404);
  assert.equal((await fetch(`${base}/..%2Fsensors.js`)).status, 404);
  assert.equal((await fetch(`${base}/state.json`)).status, 404);
});

test('a request line the URL parser rejects gets a 4xx and the server stays up', async () => {
  const raw = await new Promise((resolve, reject) => {
    const sock = net.connect(http.address().port, '127.0.0.1', () => {
      sock.write('GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    });
    let out = '';
    sock.setEncoding('utf8');
    sock.on('data', (d) => { out += d; });
    sock.on('end', () => resolve(out));
    sock.on('error', reject);
  });
  assert.match(raw, /^HTTP\/1\.1 (400|404) /);
  assert.equal((await fetch(`${base}/api/sensors`)).status, 200);
});
