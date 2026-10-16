import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDevice } from '../device/server.js';

function modbusRequest(port, unit, fn, start, qty) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const b = Buffer.alloc(12);
    b.writeUInt16BE(1, 0);
    b.writeUInt16BE(6, 4);
    b.writeUInt8(unit, 6);
    b.writeUInt8(fn, 7);
    b.writeUInt16BE(start, 8);
    b.writeUInt16BE(qty, 10);
    socket.once('connect', () => socket.write(b));
    socket.once('data', (data) => { socket.destroy(); resolve(data); });
    socket.once('error', reject);
  });
}

const canConnect = (port) => new Promise((resolve) => {
  const socket = net.connect(port, '127.0.0.1');
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

test('startDevice binds both ports, answers Modbus and HTTP, and close frees them', async () => {
  const device = await startDevice({ modbusPort: 0, httpPort: 0 });
  assert.ok(device.modbusPort > 0);
  assert.ok(device.httpPort > 0);
  device.sensors.add({ address: 1, kind: 'trh' });
  device.sensors.update(1, { t: 20, rh: 60 });

  const reply = await modbusRequest(device.modbusPort, 1, 4, 1, 2);
  assert.equal(reply.readUInt16BE(9), 200);
  assert.equal(reply.readUInt16BE(11), 600);

  const res = await fetch(`http://127.0.0.1:${device.httpPort}/api/sensors`);
  assert.equal(res.status, 200);
  assert.equal((await res.json())[0].address, 1);
  const log = await (await fetch(`http://127.0.0.1:${device.httpPort}/api/log`)).json();
  assert.equal(log[0].result, 'answered');

  await device.close();
  assert.equal(await canConnect(device.modbusPort), false);
  assert.equal(await canConnect(device.httpPort), false);
});

test('close drops open Modbus connections', async () => {
  const device = await startDevice({ modbusPort: 0, httpPort: 0 });
  const socket = net.connect(device.modbusPort, '127.0.0.1');
  await new Promise((resolve) => socket.once('connect', resolve));
  const closed = new Promise((resolve) => socket.once('close', resolve));
  await device.close();
  await closed;
});

test('state is saved to statePath and loaded by the next device', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-server-'));
  const statePath = join(dir, 'state.json');
  const a = await startDevice({ modbusPort: 0, httpPort: 0, statePath });
  a.sensors.add({ address: 8, kind: 'co2' });
  await a.close();
  assert.ok(existsSync(statePath));
  const b = await startDevice({ modbusPort: 0, httpPort: 0, statePath });
  assert.deepEqual(b.sensors.list().map((s) => s.address), [8]);
  await b.close();
});

test('a port already in use rejects and frees the other port', async () => {
  const taken = net.createServer();
  await new Promise((resolve) => taken.listen(0, '127.0.0.1', resolve));
  const port = taken.address().port;
  await assert.rejects(startDevice({ modbusPort: port, httpPort: 0 }), { code: 'EADDRINUSE' });
  await new Promise((resolve) => taken.close(resolve));
});
