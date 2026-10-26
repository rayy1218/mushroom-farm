import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors } from '../device/sensors.js';
import { createModbusServer } from '../device/modbus-server.js';

let sensors;
let server;
let port;
const log = [];

before(async () => {
  sensors = createSensors({ spinUpMs: 0 });
  server = createModbusServer(sensors, { onRequest: (entry) => log.push(entry) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  for (const s of sensors.list()) sensors.remove(s.address);
  sensors.add({ address: 10, kind: 'relay' });
  sensors.add({ address: 20, kind: 'ac' });
  sensors.add({ address: 1, kind: 'trh' });
  log.length = 0;
});

const hex = (b) => b.toString('hex');
const quiet = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function adu(tid, unit, pdu) {
  const b = Buffer.alloc(7 + pdu.length);
  b.writeUInt16BE(tid, 0);
  b.writeUInt16BE(1 + pdu.length, 4);
  b.writeUInt8(unit, 6);
  pdu.copy(b, 7);
  return b;
}

function pdu16(fn, a, b) {
  const p = Buffer.alloc(5);
  p.writeUInt8(fn, 0);
  p.writeUInt16BE(a, 1);
  p.writeUInt16BE(b, 3);
  return p;
}

// Function 16: start, qty, byte count, then the values.
function write16(start, qty, values, byteCount = values.length * 2) {
  const p = Buffer.alloc(6 + values.length * 2);
  p.writeUInt8(16, 0);
  p.writeUInt16BE(start, 1);
  p.writeUInt16BE(qty, 3);
  p.writeUInt8(byteCount, 5);
  values.forEach((v, i) => p.writeUInt16BE(v, 6 + i * 2));
  return p;
}

// Sends one request on a new connection and returns the reply bytes at the first data (or close), capped at 2 s.
// Where silence is the expected result, pass { expectSilence: true } to wait a short fixed 150 ms instead.
async function ask(unit, pdu, { expectSilence = false } = {}) {
  const socket = net.connect(port, '127.0.0.1');
  let data = Buffer.alloc(0);
  let closed = false;
  const first = new Promise((resolve) => {
    socket.once('data', resolve);
    socket.once('close', resolve);
  });
  socket.on('data', (chunk) => { data = Buffer.concat([data, chunk]); });
  socket.on('close', () => { closed = true; });
  socket.on('error', () => {});
  await new Promise((resolve) => socket.once('connect', resolve));
  socket.write(adu(1, unit, pdu));
  await Promise.race([first, quiet(expectSilence ? 150 : 2000)]);
  if (expectSilence) await quiet(0);
  socket.destroy();
  return { data, closed };
}

// Pdu of the reply as hex.
const replyPdu = (r) => hex(r.data.subarray(7));

test('fn 01 packs the four coils into one byte, coil 0 in bit 0', async () => {
  assert.equal(replyPdu(await ask(10, pdu16(1, 0, 6))), '010100');
  sensors.writeCoil(10, 0, true);
  assert.equal(replyPdu(await ask(10, pdu16(1, 0, 6))), '010101');
  sensors.writeCoil(10, 3, true);
  assert.equal(replyPdu(await ask(10, pdu16(1, 0, 6))), '010109');
  sensors.writeCoil(10, 1, true);
  sensors.writeCoil(10, 2, true);
  const r = await ask(10, pdu16(1, 0, 6));
  assert.equal(replyPdu(r), '01010f');
  assert.equal(hex(r.data.subarray(0, 7)), '0001' + '0000' + '0004' + '0a');
});

test('the 5th coil and input (dehumidifier) are bit 4, and coil 4 can be written', async () => {
  assert.equal(replyPdu(await ask(10, pdu16(5, 4, 0xff00))), '050004ff00');
  assert.equal(replyPdu(await ask(10, pdu16(1, 0, 6))), '010110');
  assert.equal(replyPdu(await ask(10, pdu16(2, 0, 6))), '020110');
  sensors.update(10, { dead: [false, false, false, false, true, false] });
  assert.equal(replyPdu(await ask(10, pdu16(2, 0, 6))), '020100');
  assert.equal(replyPdu(await ask(10, pdu16(1, 0, 4))), '010100'); // a 4-coil read (a room without a dehumidifier): bits 0–3
  assert.equal(replyPdu(await ask(10, pdu16(1, 0, 5))), '010110');
});

test('the 6th coil and input (lights) are bit 5, and coil 5 can be written', async () => {
  assert.equal(replyPdu(await ask(10, pdu16(5, 5, 0xff00))), '050005ff00');
  assert.equal(replyPdu(await ask(10, pdu16(1, 0, 6))), '010120');
  assert.equal(replyPdu(await ask(10, pdu16(2, 0, 6))), '020120');
  sensors.update(10, { dead: [false, false, false, false, false, true] });
  assert.equal(replyPdu(await ask(10, pdu16(2, 0, 6))), '020100');
  assert.equal(replyPdu(await ask(10, pdu16(1, 0, 5))), '010100'); // a 5-coil read leaves the lights out
});

test('fn 02 reports running: coil on, not dead; dead reads 0', async () => {
  assert.equal(replyPdu(await ask(10, pdu16(2, 0, 6))), '020100');
  sensors.writeCoil(10, 0, true);
  sensors.writeCoil(10, 2, true);
  sensors.update(10, { dead: [false, false, true, false, false, false] });
  assert.equal(replyPdu(await ask(10, pdu16(2, 0, 6))), '020101');
  sensors.update(10, { dead: [true, false, false, false, false, false] });
  assert.equal(replyPdu(await ask(10, pdu16(2, 0, 6))), '020104');
});

test('fn 02 shows not running during the spin-up', async () => {
  let now = 0;
  const own = createSensors({ now: () => now });
  own.add({ address: 5, kind: 'relay' });
  own.writeCoil(5, 1, true);
  const s = createModbusServer(own);
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  const p = s.address().port;
  async function inputs() {
    const socket = net.connect(p, '127.0.0.1');
    const chunk = new Promise((resolve) => socket.once('data', resolve));
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.write(adu(1, 5, pdu16(2, 0, 6)));
    const data = await chunk;
    socket.destroy();
    return data[9];
  }
  assert.equal(await inputs(), 0);
  now += 2000;
  assert.equal(await inputs(), 2);
  await new Promise((resolve) => s.close(resolve));
});

test('fn 05 switches a coil on and off and echoes the request', async () => {
  const r = await ask(10, pdu16(5, 1, 0xff00));
  assert.equal(hex(r.data), hex(adu(1, 10, pdu16(5, 1, 0xff00))));
  assert.deepEqual(sensors.get(10).coils, [false, true, false, false, false, false]);
  const off = await ask(10, pdu16(5, 1, 0));
  assert.equal(replyPdu(off), '05' + '0001' + '0000');
  assert.deepEqual(sensors.get(10).coils, [false, false, false, false, false, false]);
  assert.deepEqual(log.map((e) => e.result), ['write coil 1 on', 'write coil 1 off']);
});

test('fn 05 on a stuck relay is echoed and nothing changes', async () => {
  sensors.update(10, { stuck: [false, false, false, true, false, false] });
  const r = await ask(10, pdu16(5, 3, 0xff00));
  assert.equal(replyPdu(r), '05' + '0003' + 'ff00');
  assert.equal(sensors.get(10).coils[3], false);
  assert.equal(log[0].result, 'write coil 3 on (stuck)');
});

test('fn 05: address above 5 is exception 2, bad value is exception 3', async () => {
  assert.equal(replyPdu(await ask(10, pdu16(5, 6, 0xff00))), '8502');
  for (const value of [1, 0xff01, 0x00ff, 0xffff]) {
    assert.equal(replyPdu(await ask(10, pdu16(5, 0, value))), '8503', String(value));
  }
  assert.deepEqual(sensors.get(10).coils, [false, false, false, false, false, false]);
  assert.deepEqual(log.map((e) => e.result), ['exception 2', 'exception 3', 'exception 3', 'exception 3', 'exception 3']);
});

test('relay: start 0 with 1 to 6 bits is answered; another start or quantity on fn 01/02 is exception 2', async () => {
  for (const fn of [1, 2]) for (const qty of [1, 4, 5, 6]) assert.equal(replyPdu(await ask(10, pdu16(fn, 0, qty))), `0${fn}0100`, `${fn} ${qty}`);
  for (const fn of [1, 2]) {
    for (const [start, qty] of [[1, 6], [1, 4], [0, 0], [0, 7], [0, 16], [6, 6]]) {
      assert.equal(replyPdu(await ask(10, pdu16(fn, start, qty))), `${(fn | 0x80).toString(16)}02`, `${fn} ${start} ${qty}`);
    }
  }
});

test('relay: functions of other kinds are exception 1', async () => {
  assert.equal(replyPdu(await ask(10, write16(0, 4, [1, 0, 200, 0]))), '9001');
  for (const fn of [3, 4, 6, 15]) {
    assert.equal(replyPdu(await ask(10, pdu16(fn, 0, 4))), `${(fn | 0x80).toString(16)}01`, String(fn));
  }
});

test('fn 03 reads power, mode, setpoint x 10 and fan', async () => {
  assert.equal(replyPdu(await ask(20, pdu16(3, 0, 4))), '03' + '08' + '0000' + '0000' + '00fa' + '0000');
  sensors.writeAc(20, { power: true, mode: 2, setpoint: 23.5, fan: 1 });
  assert.equal(replyPdu(await ask(20, pdu16(3, 0, 4))), '03' + '08' + '0001' + '0002' + '00eb' + '0001');
});

test('fn 04 reads room T x 10 (two\'s complement) and the error code', async () => {
  assert.equal(replyPdu(await ask(20, pdu16(4, 0, 2))), '04' + '04' + '00fa' + '0000');
  sensors.update(20, { roomT: -5.5, error: 12 });
  assert.equal(replyPdu(await ask(20, pdu16(4, 0, 2))), '04' + '04' + 'ffc9' + '000c');
});

test('ac: wrong start or quantity is exception 2, other kinds\' functions exception 1', async () => {
  for (const [fn, start, qty] of [[3, 0, 3], [3, 1, 4], [3, 0, 5], [4, 0, 1], [4, 1, 2], [4, 0, 4]]) {
    assert.equal(replyPdu(await ask(20, pdu16(fn, start, qty))), `${(fn | 0x80).toString(16)}02`, `${fn} ${start} ${qty}`);
  }
  for (const fn of [1, 2, 5, 6]) {
    assert.equal(replyPdu(await ask(20, pdu16(fn, 0, 4))), `${(fn | 0x80).toString(16)}01`, String(fn));
  }
});

test('fn 16 sets the four values and replies fn, start, qty', async () => {
  const r = await ask(20, write16(0, 4, [1, 1, 235, 2]));
  assert.equal(hex(r.data), '0001' + '0000' + '0006' + '14' + '10' + '0000' + '0004');
  const { power, mode, setpoint, fan } = sensors.get(20);
  assert.deepEqual({ power, mode, setpoint, fan }, { power: true, mode: 1, setpoint: 23.5, fan: 2 });
  assert.equal(log[0].result, 'write ac heat 23.5 high on');
  await ask(20, write16(0, 4, [0, 0, 160, 0]));
  assert.equal(log[1].result, 'write ac cool 16 auto off');
  await ask(20, write16(0, 4, [0, 3, 300, 1]));
  assert.equal(log[2].result, 'write ac fan 30 low off');
  assert.equal(sensors.get(20).setpoint, 30);
});

test('fn 16 on a refusing aircon is acknowledged and changes nothing', async () => {
  sensors.update(20, { refuse: true });
  const r = await ask(20, write16(0, 4, [1, 1, 200, 1]));
  assert.equal(replyPdu(r), '10' + '0000' + '0004');
  assert.equal(sensors.get(20).power, false);
  assert.equal(sensors.get(20).setpoint, 25);
  assert.equal(log[0].result, 'write ac heat 20 low on (refused)');
});

test('fn 16: wrong start or quantity is exception 2', async () => {
  assert.equal(replyPdu(await ask(20, write16(1, 4, [1, 0, 200, 0]))), '9002');
  assert.equal(replyPdu(await ask(20, write16(0, 3, [1, 0, 200]))), '9002');
  assert.equal(replyPdu(await ask(20, write16(0, 5, [1, 0, 200, 0, 0]))), '9002');
});

test('fn 16: byte count other than 8 (with a matching frame) is exception 3', async () => {
  // quantity 4 but only 3 values and byte count 6
  assert.equal(replyPdu(await ask(20, write16(0, 4, [1, 0, 200], 6))), '9003');
  // right number of values, wrong byte count: the frame then does not fit the byte count
  const r = await ask(20, write16(0, 4, [1, 0, 200, 0], 7), { expectSilence: true });
  assert.equal(r.data.length, 0);
  assert.equal(r.closed, true);
  assert.equal(sensors.get(20).power, false);
});

test('fn 16: out of range values are exception 3 and change nothing', async () => {
  const bad = [
    [2, 0, 200, 0], [1, 4, 200, 0], [1, 0, 200, 3], [1, 0, 159, 0], [1, 0, 305, 0], [1, 0, 301, 0], [1, 0, 203, 0], [1, 0, 0, 0],
    [0xffff, 0, 200, 0],
  ];
  for (const values of bad) {
    assert.equal(replyPdu(await ask(20, write16(0, 4, values))), '9003', values.join(','));
  }
  assert.equal(sensors.get(20).setpoint, 25);
  assert.equal(sensors.get(20).power, false);
  assert.ok(log.every((e) => e.result === 'exception 3'));
});

test('fn 16 on a refusing aircon with a bad value is still exception 3', async () => {
  sensors.update(20, { refuse: true });
  assert.equal(replyPdu(await ask(20, write16(0, 4, [2, 0, 200, 0]))), '9003');
});

test('fn 16 and 05 on a sensor are exception 1', async () => {
  assert.equal(replyPdu(await ask(1, write16(0, 4, [1, 0, 200, 0]))), '9001');
  assert.equal(replyPdu(await ask(1, pdu16(5, 0, 0xff00))), '8501');
  assert.equal(replyPdu(await ask(1, pdu16(1, 0, 6))), '8101');
});

test('answering off: silence for relay and ac, also for writes', async () => {
  sensors.update(10, { answering: false });
  sensors.update(20, { answering: false });
  const silent = { expectSilence: true };
  const a = await ask(10, pdu16(5, 0, 0xff00), silent);
  const b = await ask(20, write16(0, 4, [1, 0, 200, 0]), silent);
  const c = await ask(10, pdu16(1, 0, 6), silent);
  assert.equal(a.data.length + b.data.length + c.data.length, 0);
  assert.equal(sensors.get(10).coils[0], false);
  assert.equal(sensors.get(20).power, false);
  assert.deepEqual(log.map((e) => e.result), ['ignored', 'ignored', 'ignored']);
});

test('a truncated fn 16 or fn 05 frame closes the connection', async () => {
  assert.equal((await ask(20, write16(0, 4, [1, 0, 200, 0]).subarray(0, 8))).closed, true);
  assert.equal((await ask(10, pdu16(5, 0, 0xff00).subarray(0, 4))).closed, true);
  assert.equal((await ask(10, pdu16(1, 0, 6).subarray(0, 4))).closed, true);
  assert.equal((await ask(20, Buffer.from([16]))).closed, true);
});

test('fn 05 exception 4 when the state file cannot be saved', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-machines-modbus-'));
  mkdirSync(join(dir, 'sub'));
  const own = createSensors({ statePath: join(dir, 'sub', 'state.json'), spinUpMs: 0 });
  own.add({ address: 5, kind: 'relay' });
  rmSync(join(dir, 'sub'), { recursive: true }); // saving now fails
  const s = createModbusServer(own);
  const error = console.error;
  console.error = () => {};
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  try {
    const socket = net.connect(s.address().port, '127.0.0.1');
    const chunk = new Promise((resolve) => socket.once('data', resolve));
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.write(adu(1, 5, pdu16(5, 0, 0xff00)));
    const data = await chunk;
    socket.destroy();
    assert.equal(hex(data.subarray(7)), '8504');
    assert.equal(own.get(5).coils[0], false);
  } finally {
    console.error = error;
    await new Promise((resolve) => s.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
