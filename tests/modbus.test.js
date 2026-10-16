import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { createModbusClient, ModbusError } from '../server/modbus.js';

// A fake gateway: onFrame(frame, socket) is called for each complete 12-byte request.
async function fakeGateway(t, onFrame) {
  const sockets = new Set();
  const frames = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 12) {
        const frame = buf.subarray(0, 12);
        buf = buf.subarray(12);
        frames.push(Buffer.from(frame));
        onFrame?.(frame, socket);
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const gateway = {
    port: server.address().port,
    frames,
    dropAll() { for (const s of sockets) s.destroy(); },
    close: () => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(resolve); }),
  };
  t.after(() => gateway.close());
  return gateway;
}

// A normal reply frame for a request frame.
function reply(frame, regs, { tid = frame.readUInt16BE(0), unit = frame[6], fn = frame[7] } = {}) {
  const out = Buffer.alloc(9 + regs.length * 2);
  out.writeUInt16BE(tid, 0);
  out.writeUInt16BE(0, 2);
  out.writeUInt16BE(3 + regs.length * 2, 4);
  out[6] = unit;
  out[7] = fn;
  out[8] = regs.length * 2;
  regs.forEach((r, i) => out.writeUInt16BE(r, 9 + i * 2));
  return out;
}

function client(t, gateway, extra = {}) {
  const c = createModbusClient({ host: '127.0.0.1', port: gateway.port, timeoutMs: 100, ...extra });
  t.after(() => c.close());
  return c;
}

const rejects = (promise, kind, code) =>
  assert.rejects(promise, (err) => {
    assert.ok(err instanceof ModbusError, String(err));
    assert.equal(err.kind, kind);
    assert.equal(err.code, code);
    return true;
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('sends a function 4 request for T/RH and parses the registers', async (t) => {
  const gw = await fakeGateway(t, (f, s) => s.write(reply(f, [265, 881])));
  assert.deepEqual(await client(t, gw).readRegisters(7, 4, 1, 2), [265, 881]);
  assert.equal(gw.frames[0].toString('hex'), '000100000006' + '07' + '04' + '0001' + '0002');
});

test('sends a function 3 request for CO2', async (t) => {
  const gw = await fakeGateway(t, (f, s) => s.write(reply(f, [950])));
  assert.deepEqual(await client(t, gw).readRegisters(2, 3, 0, 1), [950]);
  assert.equal(gw.frames[0].toString('hex'), '000100000006' + '02' + '03' + '0000' + '0001');
});

test('registers come back unsigned (0xFFC9 stays 65481)', async (t) => {
  const gw = await fakeGateway(t, (f, s) => s.write(reply(f, [0xffc9, 0])));
  assert.deepEqual(await client(t, gw).readRegisters(1, 4, 1, 2), [0xffc9, 0]);
});

test('transaction ids count up and wrap at 65535', async (t) => {
  const gw = await fakeGateway(t, (f, s) => s.write(reply(f, [1])));
  const c = client(t, gw);
  for (let i = 0; i < 3; i++) await c.readRegisters(1, 3, 0, 1);
  assert.deepEqual(gw.frames.map((f) => f.readUInt16BE(0)), [1, 2, 3]);
  const c2 = client(t, gw, { firstTid: 65535 });
  for (let i = 0; i < 3; i++) await c2.readRegisters(1, 3, 0, 1);
  assert.deepEqual(gw.frames.slice(3).map((f) => f.readUInt16BE(0)), [65535, 0, 1]);
});

test('an exception reply fails with the exception code', async (t) => {
  const gw = await fakeGateway(t, (f, s) => s.write(Buffer.from([f[0], f[1], 0, 0, 0, 3, f[6], f[7] | 0x80, 2])));
  await rejects(client(t, gw).readRegisters(1, 4, 1, 2), 'exception', 2);
});

test('no reply in time fails with timeout', async (t) => {
  const gw = await fakeGateway(t);
  const started = Date.now();
  await rejects(client(t, gw).readRegisters(1, 4, 1, 2), 'timeout', undefined);
  assert.ok(Date.now() - started >= 90);
});

test('a late reply is dropped and the next request still works', async (t) => {
  let n = 0;
  const gw = await fakeGateway(t, (f, s) => {
    n++;
    if (n === 1) setTimeout(() => s.write(reply(f, [111])), 150); // after the 100 ms timeout
    else setTimeout(() => s.write(reply(f, [222])), 100);
  });
  const c = client(t, gw, { timeoutMs: 120 });
  await rejects(c.readRegisters(1, 3, 0, 1), 'timeout', undefined);
  // The late reply (tid 1) arrives while request 2 (tid 2) is in flight and must not answer it.
  assert.deepEqual(await c.readRegisters(1, 3, 0, 1), [222]);
  assert.deepEqual(await c.readRegisters(1, 3, 0, 1), [222]);
});

test('a reply for the wrong tid never answers the request in flight', async (t) => {
  const gw = await fakeGateway(t, (f, s) => s.write(reply(f, [5], { tid: f.readUInt16BE(0) + 100 })));
  await rejects(client(t, gw).readRegisters(1, 3, 0, 1), 'timeout', undefined);
});

test('a malformed reply is a bad reply', async (t) => {
  const cases = [
    (f) => reply(f, [1, 2]), // wrong byte count for quantity 1
    (f) => reply(f, [1], { unit: f[6] + 1 }),
    (f) => reply(f, [1], { fn: 4 }),
  ];
  for (const make of cases) {
    const gw = await fakeGateway(t, (f, s) => s.write(make(f)));
    await rejects(client(t, gw).readRegisters(1, 3, 0, 1), 'bad reply', undefined);
  }
});

test('a reply split over chunks is reassembled', async (t) => {
  const gw = await fakeGateway(t, (f, s) => {
    const r = reply(f, [265, 881]);
    s.write(r.subarray(0, 3));
    setTimeout(() => s.write(r.subarray(3, 8)), 10);
    setTimeout(() => s.write(r.subarray(8)), 20);
  });
  assert.deepEqual(await client(t, gw).readRegisters(1, 4, 1, 2), [265, 881]);
});

test('connection refused fails with no connection, every time', async (t) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  probe.close();
  await once(probe, 'close');
  const c = createModbusClient({ host: '127.0.0.1', port, timeoutMs: 100 });
  t.after(() => c.close());
  await rejects(c.readRegisters(1, 3, 0, 1), 'no connection', undefined);
  await rejects(c.readRegisters(1, 3, 0, 1), 'no connection', undefined);
});

test('after the server closes the connection the next call reconnects', async (t) => {
  const gw = await fakeGateway(t, (f, s) => s.write(reply(f, [9])));
  const c = client(t, gw);
  assert.deepEqual(await c.readRegisters(1, 3, 0, 1), [9]);
  gw.dropAll();
  await sleep(30);
  assert.deepEqual(await c.readRegisters(1, 3, 0, 1), [9]);
});

test('a connection lost mid-request fails that request with no connection', async (t) => {
  const gw = await fakeGateway(t, (f, s) => s.destroy());
  await rejects(client(t, gw).readRegisters(1, 3, 0, 1), 'no connection', undefined);
});

test('one request in flight: the rest queue and run in order', async (t) => {
  let inFlight = 0;
  let maxInFlight = 0;
  const gw = await fakeGateway(t, (f, s) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    setTimeout(() => {
      inFlight--;
      s.write(reply(f, [f[6]]));
    }, 10);
  });
  const c = client(t, gw);
  const results = await Promise.all([1, 2, 3, 4].map((unit) => c.readRegisters(unit, 3, 0, 1)));
  assert.deepEqual(results, [[1], [2], [3], [4]]);
  assert.deepEqual(gw.frames.map((f) => f[6]), [1, 2, 3, 4]);
  assert.equal(maxInFlight, 1);
});

test('a timed-out request does not hold up the queue', async (t) => {
  let n = 0;
  const gw = await fakeGateway(t, (f, s) => { if (++n > 1) s.write(reply(f, [7])); });
  const c = client(t, gw);
  const [a, b] = await Promise.allSettled([c.readRegisters(1, 3, 0, 1), c.readRegisters(2, 3, 0, 1)]);
  assert.equal(a.status, 'rejected');
  assert.deepEqual(b.value, [7]);
});

test('close fails what is waiting', async (t) => {
  const gw = await fakeGateway(t);
  const c = createModbusClient({ host: '127.0.0.1', port: gw.port, timeoutMs: 1000 });
  const p1 = c.readRegisters(1, 3, 0, 1);
  const p2 = c.readRegisters(2, 3, 0, 1);
  await sleep(30);
  c.close();
  await rejects(p1, 'no connection', undefined);
  await rejects(p2, 'no connection', undefined);
});
