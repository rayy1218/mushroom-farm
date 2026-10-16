// readBits, writeCoil and writeRegisters of server/modbus.js, against a fake gateway.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { createModbusClient, ModbusError } from '../server/modbus.js';

// A fake gateway: onFrame(frame, socket) is called for each complete request (any length).
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
      while (buf.length >= 7 && buf.length >= 6 + buf.readUInt16BE(4)) {
        const size = 6 + buf.readUInt16BE(4);
        const frame = Buffer.from(buf.subarray(0, size));
        buf = buf.subarray(size);
        frames.push(frame);
        onFrame?.(frame, socket);
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const gateway = {
    port: server.address().port,
    frames,
    close: () => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(resolve); }),
  };
  t.after(() => gateway.close());
  return gateway;
}

// A reply frame with the transaction id and unit of the request, then the PDU bytes.
function pdu(frame, ...bytes) {
  const body = Buffer.from(bytes.flat());
  const out = Buffer.alloc(7 + body.length);
  frame.copy(out, 0, 0, 2);
  out.writeUInt16BE(1 + body.length, 4);
  out[6] = frame[6];
  body.copy(out, 7);
  return out;
}

const hex = (...parts) => parts.join('');
const echo = (f, s) => s.write(pdu(f, [...f.subarray(7, 12)]));
const bitsReply = (...bytes) => (f, s) => s.write(pdu(f, f[7], bytes.length, bytes));
const exception = (code) => (f, s) => s.write(pdu(f, f[7] | 0x80, code));

function client(t, gateway, extra = {}) {
  const c = createModbusClient({ host: '127.0.0.1', port: gateway.port, timeoutMs: 1000, ...extra });
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

// --- readBits ---

test('readBits sends fn 1 and unpacks the coils, bit 0 first', async (t) => {
  const gw = await fakeGateway(t, bitsReply(0b0101));
  assert.deepEqual(await client(t, gw).readBits(10, 1, 0, 4), [true, false, true, false]);
  assert.equal(gw.frames[0].toString('hex'), hex('000100000006', '0a', '01', '0000', '0004'));
});

test('readBits sends fn 2 for the discrete inputs', async (t) => {
  const gw = await fakeGateway(t, bitsReply(0b1000));
  assert.deepEqual(await client(t, gw).readBits(3, 2, 0, 4), [false, false, false, true]);
  assert.equal(gw.frames[0].toString('hex'), hex('000100000006', '03', '02', '0000', '0004'));
});

test('readBits ignores the padding bits and reads more than 8 bits over two bytes', async (t) => {
  const gw = await fakeGateway(t, bitsReply(0xf0));
  assert.deepEqual(await client(t, gw).readBits(1, 1, 0, 4), [false, false, false, false]);
  const gw2 = await fakeGateway(t, bitsReply(0b00000001, 0b10));
  assert.deepEqual(await client(t, gw2).readBits(1, 1, 0, 10), [true, false, false, false, false, false, false, false, false, true]);
});

test('readBits: a bad reply is rejected (byte count, function, unit, short, long)', async (t) => {
  const cases = {
    'wrong byte count': (f, s) => s.write(pdu(f, f[7], 2, [1, 0])),
    'byte count and data disagree': (f, s) => s.write(pdu(f, f[7], 1, [1, 0])),
    'wrong function': (f, s) => s.write(pdu(f, 2, 1, [1])),
    'no data': (f, s) => s.write(pdu(f, f[7], 1)),
    'wrong unit': (f, s) => { const r = pdu(f, f[7], 1, [1]); r[6] = 99; s.write(r); },
  };
  for (const [name, onFrame] of Object.entries(cases)) {
    const gw = await fakeGateway(t, onFrame);
    await assert.rejects(client(t, gw).readBits(1, 1, 0, 4), (err) => err.kind === 'bad reply', name);
  }
});

test('readBits: an exception reply fails with its code', async (t) => {
  const gw = await fakeGateway(t, exception(2));
  await rejects(client(t, gw).readBits(1, 1, 0, 4), 'exception', 2);
});

test('readBits: no reply in time fails with timeout', async (t) => {
  const gw = await fakeGateway(t);
  await rejects(client(t, gw, { timeoutMs: 80 }).readBits(1, 2, 0, 4), 'timeout', undefined);
});

test('readBits accepts only fn 1 and 2, 1 to 2000 bits', async (t) => {
  const gw = await fakeGateway(t, bitsReply(1));
  const c = client(t, gw);
  await assert.rejects(c.readBits(1, 3, 0, 4), RangeError);
  await assert.rejects(c.readBits(1, 1, 0, 0), RangeError);
  await assert.rejects(c.readBits(1, 1, 0, 2001), RangeError);
  await assert.rejects(c.readBits(1, 1, -1, 1), RangeError);
  await assert.rejects(c.readBits(1, 1, 0.5, 1), RangeError);
  assert.equal(gw.frames.length, 0);
});

// --- writeCoil ---

test('writeCoil sends fn 5 with 0xFF00 for on and 0x0000 for off; the echo is the success', async (t) => {
  const gw = await fakeGateway(t, echo);
  const c = client(t, gw);
  assert.equal(await c.writeCoil(10, 2, true), undefined);
  assert.equal(await c.writeCoil(10, 3, false), undefined);
  assert.equal(gw.frames[0].toString('hex'), hex('000100000006', '0a', '05', '0002', 'ff00'));
  assert.equal(gw.frames[1].toString('hex'), hex('000200000006', '0a', '05', '0003', '0000'));
});

test('writeCoil: an echo that differs is a bad reply', async (t) => {
  const cases = {
    'other address': (f, s) => s.write(pdu(f, 5, 0, 3, 0xff, 0)),
    'other value': (f, s) => s.write(pdu(f, 5, 0, 2, 0, 0)),
    'other function': (f, s) => s.write(pdu(f, 6, 0, 2, 0xff, 0)),
    'too short': (f, s) => s.write(pdu(f, 5, 0, 2, 0xff)),
    'too long': (f, s) => s.write(pdu(f, 5, 0, 2, 0xff, 0, 0)),
    'wrong unit': (f, s) => { const r = pdu(f, 5, 0, 2, 0xff, 0); r[6] = 1; s.write(r); },
  };
  for (const [name, onFrame] of Object.entries(cases)) {
    const gw = await fakeGateway(t, onFrame);
    await assert.rejects(client(t, gw).writeCoil(10, 2, true), (err) => err.kind === 'bad reply', name);
  }
});

test('writeCoil: an exception reply fails with its code', async (t) => {
  const gw = await fakeGateway(t, exception(3));
  await rejects(client(t, gw).writeCoil(10, 2, true), 'exception', 3);
});

test('writeCoil: no reply in time fails with timeout', async (t) => {
  const gw = await fakeGateway(t);
  await rejects(client(t, gw, { timeoutMs: 80 }).writeCoil(10, 2, true), 'timeout', undefined);
});

// --- writeRegisters ---

test('writeRegisters sends fn 16 with the byte count and values; the reply is fn, start, qty', async (t) => {
  const gw = await fakeGateway(t, (f, s) => s.write(pdu(f, 16, [...f.subarray(8, 12)])));
  assert.equal(await client(t, gw).writeRegisters(20, 0, [1, 0, 235, 2]), undefined);
  assert.equal(gw.frames[0].toString('hex'),
    hex('00010000000f', '14', '10', '0000', '0004', '08', '0001', '0000', '00eb', '0002'));
});

test('writeRegisters: a reply that does not match is a bad reply', async (t) => {
  const cases = {
    'other start': (f, s) => s.write(pdu(f, 16, 0, 1, 0, 4)),
    'other quantity': (f, s) => s.write(pdu(f, 16, 0, 0, 0, 3)),
    'other function': (f, s) => s.write(pdu(f, 6, 0, 0, 0, 4)),
    'too short': (f, s) => s.write(pdu(f, 16, 0, 0, 0)),
    'too long': (f, s) => s.write(pdu(f, 16, 0, 0, 0, 4, 0)),
    'a full register echo of the request': (f, s) => s.write(pdu(f, [...f.subarray(7)])),
  };
  for (const [name, onFrame] of Object.entries(cases)) {
    const gw = await fakeGateway(t, onFrame);
    await assert.rejects(client(t, gw).writeRegisters(20, 0, [1, 0, 235, 2]), (err) => err.kind === 'bad reply', name);
  }
});

test('writeRegisters: an exception reply fails with its code', async (t) => {
  const gw = await fakeGateway(t, exception(3));
  await rejects(client(t, gw).writeRegisters(20, 0, [1, 0, 235, 2]), 'exception', 3);
});

test('writeRegisters: no reply in time fails with timeout', async (t) => {
  const gw = await fakeGateway(t);
  await rejects(client(t, gw, { timeoutMs: 80 }).writeRegisters(20, 0, [1, 0, 235, 2]), 'timeout', undefined);
});

test('writeRegisters takes 1 to 123 values of 0 to 65535', async (t) => {
  const gw = await fakeGateway(t, (f, s) => s.write(pdu(f, 16, [...f.subarray(8, 12)])));
  const c = client(t, gw);
  await assert.rejects(c.writeRegisters(1, 0, []), RangeError);
  await assert.rejects(c.writeRegisters(1, 0, new Array(124).fill(0)), RangeError);
  await assert.rejects(c.writeRegisters(1, 0, [65536]), RangeError);
  await assert.rejects(c.writeRegisters(1, 0, [-1]), RangeError);
  await assert.rejects(c.writeRegisters(1, 0, [1.5]), RangeError);
  assert.equal(gw.frames.length, 0);
  await c.writeRegisters(1, 0, [65535]);
  assert.equal(gw.frames.length, 1);
});

// --- shared queue and connection rules ---

test('reads and writes share one queue: a write waits for the read in flight', async (t) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const order = [];
  const gw = await fakeGateway(t, async (f, s) => {
    order.push(f[7]);
    if (f[7] === 3) await held; // the first request is held back
    s.write(f[7] === 3 ? pdu(f, 3, 2, 0, 7) : pdu(f, [...f.subarray(7, 12)]));
  });
  const c = client(t, gw);
  const read = c.readRegisters(1, 3, 0, 1);
  const write = c.writeCoil(2, 0, true);
  const read2 = c.readBits(2, 1, 0, 4).catch((e) => e);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(order, [3], 'only the first request was sent');
  release();
  assert.deepEqual(await read, [7]);
  await write;
  await read2;
  assert.deepEqual(order, [3, 5, 1]);
  assert.deepEqual(gw.frames.map((f) => f.readUInt16BE(0)), [1, 2, 3]);
});

test('three timeouts in a row over reads and writes drop the connection; the next call reconnects', async (t) => {
  let connections = 0;
  const sockets = new Set();
  const server = net.createServer((socket) => { connections++; sockets.add(socket); socket.on('error', () => {}); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { for (const s of sockets) s.destroy(); server.close(); });
  const c = createModbusClient({ host: '127.0.0.1', port: server.address().port, timeoutMs: 40 });
  t.after(() => c.close());
  await rejects(c.writeCoil(1, 0, true), 'timeout', undefined);
  await rejects(c.readBits(1, 1, 0, 4), 'timeout', undefined);
  await rejects(c.writeRegisters(1, 0, [1]), 'timeout', undefined);
  assert.equal(connections, 1);
  await rejects(c.readBits(1, 1, 0, 4), 'timeout', undefined);
  assert.equal(connections, 2);
});

test('close fails queued writes and reads', async (t) => {
  const gw = await fakeGateway(t);
  const c = client(t, gw, { timeoutMs: 5000 });
  const a = c.writeCoil(1, 0, true);
  const b = c.readBits(1, 1, 0, 4);
  await new Promise((resolve) => setTimeout(resolve, 30));
  c.close();
  await rejects(a, 'no connection', undefined);
  await rejects(b, 'no connection', undefined);
});

test('a refused connection fails writes with no connection', async (t) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  probe.close();
  await once(probe, 'close');
  const c = createModbusClient({ host: '127.0.0.1', port, timeoutMs: 200 });
  t.after(() => c.close());
  await rejects(c.writeCoil(1, 0, true), 'no connection', undefined);
});
