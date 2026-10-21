import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startDevice } from '../device/server.js';

let device;
let base;

before(async () => {
  device = await startDevice({ modbusPort: 0, httpPort: 0, spinUpMs: 0 });
  base = `http://127.0.0.1:${device.httpPort}`;
});

after(async () => {
  await device.close();
});

async function call(method, path, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function modbus(unit, pdu) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(device.modbusPort, '127.0.0.1');
    const b = Buffer.alloc(7 + pdu.length);
    b.writeUInt16BE(1, 0);
    b.writeUInt16BE(1 + pdu.length, 4);
    b.writeUInt8(unit, 6);
    pdu.copy(b, 7);
    socket.once('connect', () => socket.write(b));
    socket.once('data', (data) => { socket.destroy(); resolve(data); });
    socket.once('error', reject);
  });
}

const pdu = (fn, a, b) => Buffer.from([fn, a >> 8, a & 255, b >> 8, b & 255]);

function reset() {
  for (const s of device.sensors.list()) device.sensors.remove(s.address);
}

test('POST adds a relay module and an aircon gateway with their defaults', async () => {
  reset();
  const relay = await call('POST', '/api/sensors', { address: 10, kind: 'relay' });
  assert.equal(relay.status, 201);
  assert.deepEqual(relay.body, {
    address: 10, kind: 'relay', coils: [false, false, false, false, false], stuck: [false, false, false, false, false],
    dead: [false, false, false, false, false], running: [false, false, false, false, false], answering: true,
  });
  const ac = await call('POST', '/api/sensors', { address: 20, kind: 'ac' });
  assert.equal(ac.status, 201);
  assert.deepEqual(ac.body, { address: 20, kind: 'ac', power: false, mode: 0, setpoint: 25, fan: 0, roomT: 25, error: 0, refuse: false, answering: true });
  const dup = await call('POST', '/api/sensors', { address: 20, kind: 'relay' });
  assert.equal(dup.status, 409);
  assert.equal((await call('GET', '/api/sensors')).body.map((s) => s.kind).join(), 'relay,ac');
});

test('PUT patches a relay module and an aircon gateway', async () => {
  reset();
  device.sensors.add({ address: 10, kind: 'relay' });
  device.sensors.add({ address: 20, kind: 'ac' });
  const r = await call('PUT', '/api/sensors/10', { stuck: [true, false, false, false, false], dead: [false, false, true, false, false], answering: false });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.stuck, [true, false, false, false, false]);
  assert.deepEqual(r.body.dead, [false, false, true, false, false]);
  assert.equal(r.body.answering, false);
  const a = await call('PUT', '/api/sensors/20', { roomT: 27.5, error: 4, refuse: true });
  assert.equal(a.status, 200);
  assert.equal(a.body.roomT, 27.5);
  assert.equal(a.body.error, 4);
  assert.equal(a.body.refuse, true);
});

test('PUT errors on machines: 400 with the field', async () => {
  reset();
  device.sensors.add({ address: 10, kind: 'relay' });
  device.sensors.add({ address: 20, kind: 'ac' });
  const cases = [
    [10, { stuck: [true] }, 'stuck'], [10, { dead: 'x' }, 'dead'], [10, { coils: [true, true, true, true, false] }, 'coils'],
    [20, { error: 300 }, 'error'], [20, { roomT: 100 }, 'roomT'], [20, { refuse: 1 }, 'refuse'], [20, { power: true }, 'power'],
  ];
  for (const [address, body, field] of cases) {
    const res = await call('PUT', `/api/sensors/${address}`, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.field, field);
  }
});

test('Modbus writes show in the API state and in the log', async () => {
  reset();
  device.sensors.add({ address: 10, kind: 'relay' });
  device.sensors.add({ address: 20, kind: 'ac' });
  await modbus(10, pdu(5, 2, 0xff00));
  const ac = Buffer.alloc(14);
  ac.writeUInt8(16, 0);
  ac.writeUInt16BE(4, 3);
  ac.writeUInt8(8, 5);
  [1, 0, 235, 1].forEach((v, i) => ac.writeUInt16BE(v, 6 + i * 2));
  await modbus(20, ac);
  const list = (await call('GET', '/api/sensors')).body;
  assert.deepEqual(list[0].coils, [false, false, true, false, false]);
  assert.deepEqual(list[0].running, [false, false, true, false, false]);
  assert.deepEqual({ power: list[1].power, mode: list[1].mode, setpoint: list[1].setpoint, fan: list[1].fan }, { power: true, mode: 0, setpoint: 23.5, fan: 1 });
  const log = (await call('GET', '/api/log')).body;
  assert.deepEqual(log.slice(0, 2).map((e) => e.result), ['write ac cool 23.5 low on', 'write coil 2 on']);
});

test('the page offers relay and ac kinds and has the machine controls', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<option value="relay">Relay module<\/option>/);
  assert.match(html, /<option value="ac">Aircon gateway<\/option>/);
  const js = await (await fetch(`${base}/app.js`)).text();
  assert.match(js, /stuck/);
  assert.match(js, /refuse/);
});
