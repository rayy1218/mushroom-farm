// Modbus TCP server for the device's sensors (function 03 and 04 only).
// Written on its own, not shared with the farm app's client.

import net from 'node:net';

const MAX_LENGTH = 254; // unit id + PDU

// What each kind of sensor answers to: function, first register, register count.
const MAP = {
  trh: { fn: 4, start: 1, qty: 2 },
  co2: { fn: 3, start: 0, qty: 1 },
};

function registersOf(sensor) {
  if (sensor.kind === 'trh') return [Math.round(sensor.t * 10) & 0xffff, Math.round(sensor.rh * 10) & 0xffff];
  return [Math.round(sensor.co2) & 0xffff];
}

function reply(tid, unit, pdu) {
  const out = Buffer.alloc(7 + pdu.length);
  out.writeUInt16BE(tid, 0);
  out.writeUInt16BE(0, 2);
  out.writeUInt16BE(1 + pdu.length, 4);
  out.writeUInt8(unit, 6);
  pdu.copy(out, 7);
  return out;
}

function exception(tid, unit, fn, code) {
  return reply(tid, unit, Buffer.from([fn | 0x80, code]));
}

function normal(tid, unit, fn, regs) {
  const pdu = Buffer.alloc(2 + regs.length * 2);
  pdu.writeUInt8(fn, 0);
  pdu.writeUInt8(regs.length * 2, 1);
  regs.forEach((value, i) => pdu.writeUInt16BE(value, 2 + i * 2));
  return reply(tid, unit, pdu);
}

export function createModbusServer(sensors, { onRequest = () => {} } = {}) {
  // Returns the bytes to send back, or null for no reply.
  function answer(tid, unit, pdu) {
    const fn = pdu[0];
    const entry = { at: Date.now(), address: unit, fn, result: 'ignored' };
    let out = null;
    const sensor = sensors.get(unit);
    if (sensor?.answering) {
      const want = MAP[sensor.kind];
      if (fn !== want.fn) {
        out = exception(tid, unit, fn, 1);
        entry.result = 'exception 1';
      } else if (pdu.readUInt16BE(1) !== want.start || pdu.readUInt16BE(3) !== want.qty) {
        out = exception(tid, unit, fn, 2);
        entry.result = 'exception 2';
      } else {
        out = normal(tid, unit, fn, registersOf(sensor));
        entry.result = 'answered';
      }
    }
    onRequest(entry);
    return out;
  }

  return net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 6) {
        const length = buffer.readUInt16BE(4);
        if (buffer.readUInt16BE(2) !== 0 || length < 2 || length > MAX_LENGTH) return socket.destroy();
        const total = 6 + length;
        if (buffer.length < total) return;
        const tid = buffer.readUInt16BE(0);
        const unit = buffer[6];
        const pdu = buffer.subarray(7, total);
        buffer = buffer.subarray(total);
        if ((pdu[0] === 3 || pdu[0] === 4) && pdu.length !== 5) return socket.destroy();
        const out = answer(tid, unit, pdu);
        if (out) socket.write(out);
      }
    });
  });
}
