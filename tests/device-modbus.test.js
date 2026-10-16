import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createSensors } from '../device/sensors.js';
import { createModbusServer } from '../device/modbus-server.js';

let sensors;
let server;
let port;
const log = [];

before(async () => {
  sensors = createSensors({});
  sensors.add({ address: 1, kind: 'trh' });
  sensors.update(1, { t: 26.5, rh: 88.1 });
  sensors.add({ address: 2, kind: 'co2' });
  sensors.update(2, { co2: 950 });
  server = createModbusServer(sensors, { onRequest: (entry) => log.push(entry) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function frame(tid, unit, fn, start, qty, { pid = 0, len = 6 } = {}) {
  const b = Buffer.alloc(12);
  b.writeUInt16BE(tid, 0);
  b.writeUInt16BE(pid, 2);
  b.writeUInt16BE(len, 4);
  b.writeUInt8(unit, 6);
  b.writeUInt8(fn, 7);
  b.writeUInt16BE(start, 8);
  b.writeUInt16BE(qty, 10);
  return b;
}

// Opens a socket that collects everything the server sends.
async function connect() {
  const socket = net.connect(port, '127.0.0.1');
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  const state = { data: Buffer.alloc(0), closed: false, socket };
  socket.on('data', (chunk) => { state.data = Buffer.concat([state.data, chunk]); });
  socket.on('close', () => { state.closed = true; });
  socket.on('error', () => {});
  return state;
}

async function until(check, ms = 1000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) assert.fail('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const quiet = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (b) => b.toString('hex');

test('T/RH reply', async () => {
  const c = await connect();
  c.socket.write(frame(0x1234, 1, 4, 1, 2));
  await until(() => c.data.length >= 13);
  assert.equal(hex(c.data), '1234' + '0000' + '0007' + '01' + '04' + '04' + '0109' + '0371');
  c.socket.destroy();
});

test('negative temperature is two\'s complement: -5.5 gives 0xFFC9', async () => {
  sensors.update(1, { t: -5.5, rh: 40 });
  const c = await connect();
  c.socket.write(frame(1, 1, 4, 1, 2));
  await until(() => c.data.length >= 13);
  assert.equal(c.data.readUInt16BE(9), 0xffc9);
  assert.equal(c.data.readUInt16BE(11), 400);
  sensors.update(1, { t: 26.5, rh: 88.1 });
  c.socket.destroy();
});

test('CO2 reply', async () => {
  const c = await connect();
  c.socket.write(frame(7, 2, 3, 0, 1));
  await until(() => c.data.length >= 11);
  assert.equal(hex(c.data), '0007' + '0000' + '0005' + '02' + '03' + '02' + '03b6');
  c.socket.destroy();
});

test('answering off: no reply', async () => {
  sensors.update(2, { answering: false });
  const c = await connect();
  c.socket.write(frame(1, 2, 3, 0, 1));
  await quiet(300);
  assert.equal(c.data.length, 0);
  assert.equal(c.closed, false);
  sensors.update(2, { answering: true });
  c.socket.write(frame(2, 2, 3, 0, 1));
  await until(() => c.data.length >= 11);
  assert.equal(c.data.readUInt16BE(0), 2);
  c.socket.destroy();
});

test('unknown address: no reply', async () => {
  const c = await connect();
  c.socket.write(frame(1, 99, 4, 1, 2));
  await quiet(300);
  assert.equal(c.data.length, 0);
  c.socket.destroy();
});

test('wrong function gives exception 1', async () => {
  const c = await connect();
  c.socket.write(frame(5, 1, 6, 1, 2)); // write register: not supported
  c.socket.write(frame(6, 1, 3, 1, 2)); // 03 on a T/RH probe
  c.socket.write(frame(7, 2, 4, 0, 1)); // 04 on a CO2 sensor
  await until(() => c.data.length >= 27);
  assert.equal(hex(c.data.subarray(0, 9)), '0005' + '0000' + '0003' + '01' + '86' + '01');
  assert.equal(hex(c.data.subarray(9, 18)), '0006' + '0000' + '0003' + '01' + '83' + '01');
  assert.equal(hex(c.data.subarray(18, 27)), '0007' + '0000' + '0003' + '02' + '84' + '01');
  c.socket.destroy();
});

test('wrong start or quantity gives exception 2', async () => {
  const c = await connect();
  c.socket.write(frame(1, 1, 4, 0, 2));
  c.socket.write(frame(2, 1, 4, 1, 1));
  c.socket.write(frame(3, 2, 3, 1, 1));
  c.socket.write(frame(4, 2, 3, 0, 2));
  await until(() => c.data.length >= 36);
  for (let i = 0; i < 4; i += 1) {
    const reply = c.data.subarray(i * 9, i * 9 + 9);
    assert.equal(reply.readUInt16BE(0), i + 1);
    assert.equal(reply.readUInt8(7), i < 2 ? 0x84 : 0x83);
    assert.equal(reply.readUInt8(8), 2);
  }
  c.socket.destroy();
});

test('two frames in one write give two replies with their own tids', async () => {
  const c = await connect();
  c.socket.write(Buffer.concat([frame(10, 1, 4, 1, 2), frame(11, 2, 3, 0, 1)]));
  await until(() => c.data.length >= 24);
  assert.equal(c.data.readUInt16BE(0), 10);
  assert.equal(c.data.readUInt16BE(13), 11);
  c.socket.destroy();
});

test('a frame split over chunks gives one reply', async () => {
  const c = await connect();
  const f = frame(21, 1, 4, 1, 2);
  c.socket.write(f.subarray(0, 5));
  await quiet(30);
  c.socket.write(f.subarray(5, 9));
  await quiet(30);
  assert.equal(c.data.length, 0);
  c.socket.write(f.subarray(9));
  await until(() => c.data.length >= 13);
  await quiet(50);
  assert.equal(c.data.length, 13);
  assert.equal(c.data.readUInt16BE(0), 21);
  c.socket.destroy();
});

test('protocol id other than 0 closes the connection', async () => {
  const c = await connect();
  c.socket.write(frame(1, 1, 4, 1, 2, { pid: 1 }));
  await until(() => c.closed);
  assert.equal(c.data.length, 0);
});

test('a wrong length closes the connection', async () => {
  const c = await connect();
  c.socket.write(frame(1, 1, 4, 1, 2, { len: 1 }));
  await until(() => c.closed);
  const d = await connect();
  d.socket.write(Buffer.concat([frame(1, 1, 4, 1, 2, { len: 7 }), Buffer.from([0])]));
  await until(() => d.closed);
  assert.equal(c.data.length + d.data.length, 0);
});

test('onRequest reports answered, ignored and exceptions', async () => {
  log.length = 0;
  sensors.update(2, { answering: false });
  const c = await connect();
  c.socket.write(frame(1, 1, 4, 1, 2));
  c.socket.write(frame(2, 2, 3, 0, 1));
  c.socket.write(frame(3, 1, 3, 1, 2));
  c.socket.write(frame(4, 1, 4, 5, 2));
  c.socket.write(frame(5, 77, 4, 1, 2));
  await until(() => log.length >= 5);
  sensors.update(2, { answering: true });
  assert.deepEqual(log.map(({ address, fn, result }) => ({ address, fn, result })), [
    { address: 1, fn: 4, result: 'answered' },
    { address: 2, fn: 3, result: 'ignored' },
    { address: 1, fn: 3, result: 'exception 1' },
    { address: 1, fn: 4, result: 'exception 2' },
    { address: 77, fn: 4, result: 'ignored' },
  ]);
  assert.equal(typeof log[0].at, 'number');
  c.socket.destroy();
});
