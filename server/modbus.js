// Modbus TCP client for the sensor gateway and the machines: reads and writes, one request at a time.

import net from 'node:net';

// kind: 'timeout' | 'no connection' | 'exception' | 'bad reply'
// code: the exception code, only for 'exception'.
export class ModbusError extends Error {
  constructor(kind, code) {
    super(kind === 'exception' ? `exception ${code}` : kind);
    this.name = 'ModbusError';
    this.kind = kind;
    this.code = code;
  }
}

const DROP_AFTER_TIMEOUTS = 3;
const HEADER = 7; // MBAP: tid, protocol id, length, unit

// Requests are queued and sent one at a time. The connection is opened on the
// first request and again after it drops. timeoutMs limits both connecting and
// waiting for a reply. After DROP_AFTER_TIMEOUTS timeouts in a row the connection is
// dropped (it may be half-open) and the next call opens a new one.
// firstTid and connectFn (a replacement for net.connect) are only for tests.
export function createModbusClient({ host, port, timeoutMs = 1000, firstTid = 1, connectFn = net.connect }) {
  let socket = null;
  let connecting = null; // socket being connected
  let buffer = Buffer.alloc(0);
  let nextTid = firstTid;
  let current = null; // the request in flight: { tid, unit, pdu, result, resolve, reject, timer }
  const queue = [];
  let busy = false;
  let timeoutsInRow = 0;

  function connect() {
    if (socket && !socket.destroyed) return Promise.resolve(socket);
    return new Promise((resolve, reject) => {
      const sock = connectFn({ host, port });
      connecting = sock;
      sock.setNoDelay(true);
      const timer = setTimeout(() => sock.destroy(), timeoutMs);
      sock.on('connect', () => {
        clearTimeout(timer);
        connecting = null;
        socket = sock;
        buffer = Buffer.alloc(0);
        timeoutsInRow = 0;
        resolve(sock);
      });
      sock.on('data', (chunk) => onData(sock, chunk));
      sock.on('error', () => {}); // 'close' follows
      sock.on('close', () => {
        clearTimeout(timer);
        if (connecting === sock) connecting = null;
        if (socket === sock) {
          socket = null;
          finish(new ModbusError('no connection'));
        }
        reject(new ModbusError('no connection')); // no effect once connected
      });
    });
  }

  // Ends the request in flight with a result (array) or an error.
  function finish(result) {
    if (!current) return;
    const { resolve, reject, timer } = current;
    current = null;
    clearTimeout(timer);
    if (result instanceof Error) reject(result);
    else resolve(result);
  }

  function onData(sock, chunk) {
    if (sock !== socket) return;
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= HEADER) {
      const length = buffer.readUInt16BE(4); // bytes after the length field
      if (buffer.readUInt16BE(2) !== 0 || length < 2 || length > 254) {
        // Not a Modbus TCP stream any more: drop the connection.
        buffer = Buffer.alloc(0);
        socket = null; // so the next call reconnects instead of using the dying socket
        sock.destroy();
        finish(new ModbusError('bad reply'));
        return;
      }
      if (buffer.length < 6 + length) return;
      const frame = buffer.subarray(0, 6 + length);
      buffer = buffer.subarray(6 + length);
      // A reply that is not for the request in flight (late, or unknown) is dropped.
      if (current && frame.readUInt16BE(0) === current.tid) {
        timeoutsInRow = 0;
        finish(parse(frame, current));
      }
    }
  }

  function onTimeout(sock) {
    finish(new ModbusError('timeout'));
    if (++timeoutsInRow >= DROP_AFTER_TIMEOUTS && socket === sock) {
      socket = null;
      sock.destroy();
    }
  }

  // The checks every reply needs; req.result(frame) checks the rest and returns the value or a ModbusError.
  function parse(frame, req) {
    if (frame[6] !== req.unit) return new ModbusError('bad reply');
    if (frame[7] === (req.pdu[0] | 0x80)) {
      return frame.length === 9 ? new ModbusError('exception', frame[8]) : new ModbusError('bad reply');
    }
    if (frame[7] !== req.pdu[0]) return new ModbusError('bad reply');
    return req.result(frame);
  }

  async function run(req) {
    let sock;
    try {
      sock = await connect();
    } catch (err) {
      return req.reject(err);
    }
    req.tid = nextTid;
    nextTid = (nextTid + 1) & 0xffff;
    const frame = Buffer.alloc(HEADER + req.pdu.length);
    frame.writeUInt16BE(req.tid, 0);
    frame.writeUInt16BE(0, 2);
    frame.writeUInt16BE(1 + req.pdu.length, 4);
    frame[6] = req.unit;
    req.pdu.copy(frame, HEADER);
    await new Promise((done) => {
      const { resolve, reject } = req;
      current = {
        ...req,
        resolve: (v) => { resolve(v); done(); },
        reject: (e) => { reject(e); done(); },
        timer: setTimeout(() => onTimeout(sock), timeoutMs),
      };
      sock.write(frame);
    });
  }

  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length > 0) await run(queue.shift());
    busy = false;
  }

  // Queues a request: pdu is the function code and its data, result(frame) checks the reply.
  function submit(unit, pdu, result) {
    return new Promise((resolve, reject) => {
      queue.push({ unit, pdu: Buffer.from(pdu), result, resolve, reject });
      pump();
    });
  }

  const isUint16 = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffff;

  // The reply must repeat the first four bytes after the function code.
  const echoOf = (pdu) => (frame) =>
    frame.length === HEADER + 5 && frame.subarray(HEADER, HEADER + 5).equals(pdu.subarray(0, 5))
      ? undefined
      : new ModbusError('bad reply');

  return {
    // Resolves with the register values (unsigned 16-bit numbers).
    readRegisters(unit, fn, start, qty) {
      if (fn !== 3 && fn !== 4) return Promise.reject(new RangeError('fn must be 3 or 4'));
      if (!isUint16(start) || !Number.isInteger(qty) || qty < 1 || qty > 125) {
        return Promise.reject(new RangeError('start must be 0 to 65535 and qty 1 to 125'));
      }
      const pdu = Buffer.alloc(5);
      pdu[0] = fn;
      pdu.writeUInt16BE(start, 1);
      pdu.writeUInt16BE(qty, 3);
      return submit(unit, pdu, (frame) => {
        if (frame[8] !== qty * 2 || frame.length !== 9 + qty * 2) return new ModbusError('bad reply');
        return Array.from({ length: qty }, (_, i) => frame.readUInt16BE(9 + i * 2));
      });
    },

    // fn 1 (coils) or 2 (discrete inputs). Resolves with qty booleans, bit 0 of the first byte first.
    readBits(unit, fn, start, qty) {
      if (fn !== 1 && fn !== 2) return Promise.reject(new RangeError('fn must be 1 or 2'));
      if (!isUint16(start) || !Number.isInteger(qty) || qty < 1 || qty > 2000) {
        return Promise.reject(new RangeError('start must be 0 to 65535 and qty 1 to 2000'));
      }
      const pdu = Buffer.alloc(5);
      pdu[0] = fn;
      pdu.writeUInt16BE(start, 1);
      pdu.writeUInt16BE(qty, 3);
      const bytes = Math.ceil(qty / 8);
      return submit(unit, pdu, (frame) => {
        if (frame[8] !== bytes || frame.length !== 9 + bytes) return new ModbusError('bad reply');
        return Array.from({ length: qty }, (_, i) => (frame[9 + (i >> 3)] >> (i & 7) & 1) === 1);
      });
    },

    // fn 5. Resolves once the module has echoed the request.
    writeCoil(unit, address, on) {
      if (!isUint16(address)) return Promise.reject(new RangeError('address must be 0 to 65535'));
      const pdu = Buffer.alloc(5);
      pdu[0] = 5;
      pdu.writeUInt16BE(address, 1);
      pdu.writeUInt16BE(on ? 0xff00 : 0, 3);
      return submit(unit, pdu, echoOf(pdu));
    },

    // fn 16. Resolves once the device has answered with the same start and quantity.
    writeRegisters(unit, start, values) {
      if (!isUint16(start) || !Array.isArray(values) || values.length < 1 || values.length > 123 || !values.every(isUint16)) {
        return Promise.reject(new RangeError('start must be 0 to 65535 and values 1 to 123 numbers from 0 to 65535'));
      }
      const pdu = Buffer.alloc(6 + values.length * 2);
      pdu[0] = 16;
      pdu.writeUInt16BE(start, 1);
      pdu.writeUInt16BE(values.length, 3);
      pdu[5] = values.length * 2;
      values.forEach((v, i) => pdu.writeUInt16BE(v, 6 + i * 2));
      return submit(unit, pdu, echoOf(pdu));
    },

    // Fails everything waiting and drops the connection.
    close() {
      for (const req of queue.splice(0)) req.reject(new ModbusError('no connection'));
      finish(new ModbusError('no connection'));
      const sock = socket;
      socket = null;
      sock?.destroy();
      connecting?.destroy();
    },
  };
}
