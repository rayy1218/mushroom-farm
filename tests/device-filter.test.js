import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors } from '../device/sensors.js';
import { createModbusServer } from '../device/modbus-server.js';

function thrown(fn) {
  try { fn(); } catch (err) { return err; }
  assert.fail('expected a throw');
}

// ---- The filter pressure sensor ----

test('a filter pressure sensor starts at 40 Pa and is edited like other devices', () => {
  const s = createSensors({});
  s.add({ address: 9, kind: 'dp' });
  assert.deepEqual(s.get(9), { address: 9, kind: 'dp', pa: 40, answering: true });
  s.update(9, { pa: 123.45 });
  assert.equal(s.get(9).pa, 123.5);
  s.update(9, { pa: -12.3 });
  assert.equal(s.get(9).pa, -12.3);
});

test('its pressure has limits and it has no other values; other kinds are named', () => {
  const s = createSensors({});
  s.add({ address: 9, kind: 'dp' });
  s.add({ address: 8, kind: 'trh' });
  let err = thrown(() => s.update(9, { pa: 2000.1 }));
  assert.deepEqual([err.status, err.field, err.message], [400, 'pa', 'Pressure must be a number from -50 to 2000 Pa']);
  err = thrown(() => s.update(9, { pa: -50.1 }));
  assert.equal(err.status, 400);
  err = thrown(() => s.update(9, { t: 20 }));
  assert.deepEqual([err.status, err.field, err.message], [400, 't', 'A filter pressure sensor has no t value']);
  err = thrown(() => s.update(8, { pa: 5 }));
  assert.deepEqual([err.status, err.field], [400, 'pa']);
  err = thrown(() => s.add({ address: 10, kind: 'flow' }));
  assert.deepEqual([err.status, err.field, err.message], [400, 'kind', 'Kind must be trh, co2, relay, ac, meter or dp']);
});

test('a filter pressure sensor is saved in the state file and comes back', () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'mf-dp-')), 'state.json');
  const a = createSensors({ statePath });
  a.add({ address: 9, kind: 'dp' });
  a.update(9, { pa: 88 });
  assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), [{ address: 9, kind: 'dp', pa: 88, answering: true }]);
  assert.deepEqual(createSensors({ statePath }).get(9), { address: 9, kind: 'dp', pa: 88, answering: true });
  writeFileSync(statePath, JSON.stringify([{ address: 9, kind: 'dp', pa: 99999, answering: true }, { address: 10, kind: 'dp', pa: 12 }]));
  const c = createSensors({ statePath });
  assert.equal(c.get(9), undefined, 'a bad value skips the entry');
  assert.equal(c.get(10).pa, 12);
});

test('the simulation writes the pressure, clamped to the limits', () => {
  const s = createSensors({});
  s.add({ address: 9, kind: 'dp' });
  s.simWrite(9, { pa: 96.789 });
  assert.equal(s.get(9).pa, 96.8);
  s.simWrite(9, { pa: 5000 });
  assert.equal(s.get(9).pa, 2000);
  s.simWrite(9, { pa: 'x' });
  assert.equal(s.get(9).pa, 2000);
});

// ---- Modbus ----

async function ask(server, frames) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socket = net.connect(server.address().port, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    const replies = [];
    for (const f of frames) {
      const got = new Promise((resolve) => socket.once('data', resolve));
      socket.write(f);
      replies.push(await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 300))]));
    }
    return replies;
  } finally {
    socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

function frame(unit, fn, start, qty) {
  const b = Buffer.alloc(12);
  b.writeUInt16BE(1, 0);
  b.writeUInt16BE(6, 4);
  b.writeUInt8(unit, 6);
  b.writeUInt8(fn, 7);
  b.writeUInt16BE(start, 8);
  b.writeUInt16BE(qty, 10);
  return b;
}

test('a filter pressure sensor answers function 04 register 0 with Pa x 10, signed', async () => {
  const s = createSensors({});
  s.add({ address: 9, kind: 'dp' });
  s.update(9, { pa: 123.4 });
  s.add({ address: 10, kind: 'dp' });
  s.update(10, { pa: -12.3 });
  const [up, down] = await ask(createModbusServer(s), [frame(9, 4, 0, 1), frame(10, 4, 0, 1)]);
  assert.deepEqual([...up.subarray(7, 9)], [4, 2]);
  assert.equal(up.readInt16BE(9), 1234);
  assert.equal(down.readInt16BE(9), -123);
  assert.equal(down.readUInt16BE(9), 0xff85);
});

test('any other range is an illegal address, any other function an illegal function; a silent one does not answer', async () => {
  const s = createSensors({});
  s.add({ address: 9, kind: 'dp' });
  const replies = await ask(createModbusServer(s), [frame(9, 4, 1, 1), frame(9, 4, 0, 2), frame(9, 3, 0, 1)]);
  assert.deepEqual(replies.map((r) => [r[7], r[8]]), [[0x84, 2], [0x84, 2], [0x83, 1]]);
  s.update(9, { answering: false });
  const [silent] = await ask(createModbusServer(s), [frame(9, 4, 0, 1)]);
  assert.equal(silent, null);
});
