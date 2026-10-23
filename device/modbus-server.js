// Modbus TCP server for the device's sensors, relay modules and aircon gateways, energy meters
// and filter pressure sensors (functions 01, 02, 03, 04, 05 and 16).
// Written on its own, not shared with the farm app's client.

import net from 'node:net';

const MAX_LENGTH = 254; // unit id + PDU

// What each kind of device answers to: function, first register, register count.
const MAP = {
  trh: { reads: { 4: { start: 1, qty: 2 } } },
  co2: { reads: { 3: { start: 0, qty: 1 } } },
  relay: { reads: { 1: { start: 0, qty: 5 }, 2: { start: 0, qty: 5 } }, writes: [5] },
  ac: { reads: { 3: { start: 0, qty: 4 }, 4: { start: 0, qty: 2 } }, writes: [16] },
  // An SDM120-style meter: two float32 values, each read on its own; any other range is an illegal address.
  meter: { reads: { 4: [{ start: 0x000c, qty: 2, field: 'power' }, { start: 0x0156, qty: 2, field: 'energy' }] } },
  // A differential pressure transmitter across the filter: Pa x 10, signed.
  dp: { reads: { 4: { start: 0, qty: 1 } } },
};
const MODES = ['cool', 'heat', 'dry', 'fan'];
const FANS = ['auto', 'low', 'high'];
const COIL_ON = 0xff00;

// A float32 as two registers, high word first.
function floatRegisters(value) {
  const b = Buffer.alloc(4);
  b.writeFloatBE(value);
  return [b.readUInt16BE(0), b.readUInt16BE(2)];
}

function registersOf(device, fn, range) {
  if (device.kind === 'meter') return floatRegisters(device[range.field]);
  if (device.kind === 'trh') return [Math.round(device.t * 10) & 0xffff, Math.round(device.rh * 10) & 0xffff];
  if (device.kind === 'co2') return [Math.round(device.co2) & 0xffff];
  if (device.kind === 'dp') return [Math.round(device.pa * 10) & 0xffff];
  if (fn === 3) return [device.power ? 1 : 0, device.mode, Math.round(device.setpoint * 10), device.fan];
  return [Math.round(device.roomT * 10) & 0xffff, device.error];
}

// Bit 0 = output 0, as the reply to function 01 and 02 wants them.
const packBits = (bits) => bits.reduce((byte, on, i) => byte | (on ? 1 << i : 0), 0);

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

function bits(tid, unit, fn, byte) {
  return reply(tid, unit, Buffer.from([fn, 1, byte]));
}

function normal(tid, unit, fn, regs) {
  const pdu = Buffer.alloc(2 + regs.length * 2);
  pdu.writeUInt8(fn, 0);
  pdu.writeUInt8(regs.length * 2, 1);
  regs.forEach((value, i) => pdu.writeUInt16BE(value, 2 + i * 2));
  return reply(tid, unit, pdu);
}

// Requests have a fixed shape: 5 bytes for functions 1 to 5, and for 16 the byte count must match the data.
function wellFormed(pdu) {
  const fn = pdu[0];
  if (fn >= 1 && fn <= 5) return pdu.length === 5;
  if (fn === 16) return pdu.length >= 6 && pdu.length === 6 + pdu[5];
  return true;
}

export function createModbusServer(sensors, { onRequest = () => {} } = {}) {
  function fail(tid, unit, fn, entry, code) {
    entry.result = `exception ${code}`;
    return exception(tid, unit, fn, code);
  }

  // Function 05: one coil. Replies with the request itself.
  function writeCoil(tid, unit, pdu, entry) {
    const [fn, index, value] = [pdu[0], pdu.readUInt16BE(1), pdu.readUInt16BE(3)];
    if (index > 4) return fail(tid, unit, fn, entry, 2);
    if (value !== COIL_ON && value !== 0) return fail(tid, unit, fn, entry, 3);
    const stuck = sensors.get(unit).stuck[index];
    sensors.writeCoil(unit, index, value === COIL_ON);
    entry.result = `write coil ${index} ${value === COIL_ON ? 'on' : 'off'}${stuck ? ' (stuck)' : ''}`;
    return reply(tid, unit, pdu);
  }

  // Function 16: power, mode, setpoint x 10 and fan, all four at once.
  function writeAc(tid, unit, pdu, entry) {
    const fn = pdu[0];
    if (pdu.readUInt16BE(1) !== 0 || pdu.readUInt16BE(3) !== 4) return fail(tid, unit, fn, entry, 2);
    if (pdu[5] !== 8) return fail(tid, unit, fn, entry, 3);
    const [power, mode, setpoint, fan] = [0, 1, 2, 3].map((i) => pdu.readUInt16BE(6 + i * 2));
    if (power > 1 || mode >= MODES.length || fan >= FANS.length || setpoint < 160 || setpoint > 300 || setpoint % 5 !== 0) {
      return fail(tid, unit, fn, entry, 3);
    }
    const refused = sensors.get(unit).refuse;
    sensors.writeAc(unit, { power: power === 1, mode, setpoint: setpoint / 10, fan });
    entry.result = `write ac ${MODES[mode]} ${setpoint / 10} ${FANS[fan]} ${power ? 'on' : 'off'}${refused ? ' (refused)' : ''}`;
    return reply(tid, unit, pdu.subarray(0, 5));
  }

  // Returns the bytes to send back, or null for no reply.
  function answer(tid, unit, pdu) {
    const fn = pdu[0];
    const entry = { at: Date.now(), address: unit, fn, result: 'ignored' };
    let out = null;
    const device = sensors.get(unit);
    if (device?.answering) {
      const map = MAP[device.kind];
      const reads = [].concat(map.reads[fn] ?? []);
      try {
        if (reads.length > 0) {
          const start = pdu.readUInt16BE(1), qty = pdu.readUInt16BE(3);
          const read = reads.find((r) => r.start === start && r.qty === qty);
          if (!read) {
            out = fail(tid, unit, fn, entry, 2);
          } else {
            entry.result = 'answered';
            if (device.kind === 'relay') out = bits(tid, unit, fn, packBits(fn === 1 ? device.coils : device.running));
            else out = normal(tid, unit, fn, registersOf(device, fn, read));
          }
        } else if (map.writes?.includes(fn)) {
          out = fn === 5 ? writeCoil(tid, unit, pdu, entry) : writeAc(tid, unit, pdu, entry);
        } else {
          out = fail(tid, unit, fn, entry, 1);
        }
      } catch (err) {
        console.error(err);
        out = fail(tid, unit, fn, entry, 4); // device failure, e.g. the state file could not be saved
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
        if (!wellFormed(pdu)) return socket.destroy();
        const out = answer(tid, unit, pdu);
        if (out) socket.write(out);
      }
    });
  });
}
