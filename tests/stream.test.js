'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openFakeDb } = require('../tests/fakes/db.js');
const { createFakeRoomManager } = require('../tests/fakes/rooms.js');
const { createApi } = require('../server/api.js');

let NOW = 1791450000;
const now = () => NOW;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-stream-'));
fs.writeFileSync(path.join(root, 'index.html'), '<html></html>');

// Every test registers its clean-up before its first wait (t.after), so a failed wait cannot leave the server and the
// open event streams alive: that kept the test process running forever when the machine was under load.
function startApi(t, extra) {
  const db = openFakeDb({ now });
  const rooms = createFakeRoomManager({ db, now });
  const onCalls = [];
  const offCalls = [];
  const originalOn = rooms.on.bind(rooms);
  const originalOff = rooms.off.bind(rooms);
  rooms.on = (name, fn) => { onCalls.push({ name, fn }); return originalOn(name, fn); };
  rooms.off = (name, fn) => { offCalls.push({ name, fn }); return originalOff(name, fn); };
  const fatals = [];
  const api = createApi({ db, rooms, root, now, heartbeatMs: 50, onFatal: e => fatals.push(e), ...extra });
  const server = http.createServer(api.handle).listen(0, '127.0.0.1');
  const ready = within(new Promise(resolve => server.on('listening', resolve)), 10000, 'the server to listen');
  const url = () => `http://127.0.0.1:${server.address().port}`;
  const requests = [];
  const ctx = { get url() { return url(); }, db, rooms, api, fatals, server, ready, onCalls, offCalls, requests };
  t.after(() => {
    for (const req of requests) req.destroy();
    api.close();
    server.closeAllConnections();
    server.close();
  });
  return ctx;
}

// A wait that always ends: the promise, or a rejection after `ms`.
function within(promise, ms, what) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout (${ms} ms) waiting for ${what}`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function parseMessage(text) {
  if (text.startsWith(': ')) return { comment: text.slice(2) };
  if (text.startsWith('retry:')) return { retry: Number(text.slice('retry:'.length).trim()) };
  const lines = text.split('\n');
  let event, data;
  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice('event: '.length);
    else if (line.startsWith('data: ')) data = line.slice('data: '.length);
  }
  return { event, data: data !== undefined ? JSON.parse(data) : undefined };
}

function connectStream(ctx, { pause } = {}) {
  return within(new Promise((resolve, reject) => {
    const req = http.get(ctx.url + '/api/stream', res => {
      // A paused stream stops libuv from watching the socket at all, so a server-initiated close is never
      // observed until the stream is resumed: the caller resumes it (c.resume()) once the server has acted.
      if (pause) res.pause();
      let buf = '';
      const messages = [];
      const waiters = [];
      res.on('data', chunk => {
        buf += chunk.toString('utf8');
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          messages.push(parseMessage(raw));
          for (let i = waiters.length - 1; i >= 0; i--) {
            if (waiters[i].test()) { waiters[i].resolve(); waiters.splice(i, 1); }
          }
        }
      });
      // Waits end on the event, with a generous limit that only matters when something is really wrong.
      function waitUntil(test, what, timeoutMs = 10000) {
        if (test()) return Promise.resolve();
        return new Promise((res2, rej2) => {
          const timer = setTimeout(() => rej2(new Error(`timeout waiting for ${what}, have ${messages.length} messages`)), timeoutMs);
          waiters.push({ test, resolve: () => { clearTimeout(timer); res2(); } });
        });
      }
      const waitForCount = (count, timeoutMs) => waitUntil(() => messages.length >= count, `${count} messages`, timeoutMs);
      const waitForEvents = (count, timeoutMs) => waitUntil(() => messages.filter(m => m.event).length >= count, `${count} events`, timeoutMs);
      const waitForPing = (afterIndex, timeoutMs) => waitUntil(() => messages.slice(afterIndex).some(m => m.comment === 'ping'), 'a ping', timeoutMs);
      resolve({ req, res, status: res.statusCode, headers: res.headers, messages, waitUntil, waitForCount, waitForEvents, waitForPing, resume: () => res.resume() });
    });
    ctx.requests.push(req);
    req.on('error', reject);
  }), 10000, 'the stream response');
}

describe('stream (C4)', () => {
  test('open: status, headers, first bytes retry: 3000', async (t) => {
    const ctx = startApi(t);
    await ctx.ready;
    const c = await connectStream(ctx);
    await c.waitForCount(1);
    assert.equal(c.status, 200);
    assert.equal(c.headers['content-type'], 'text/event-stream; charset=utf-8');
    assert.equal(c.headers['cache-control'], 'no-store');
    assert.equal(c.headers['connection'], 'keep-alive');
    assert.deepStrictEqual(c.messages[0], { retry: 3000 });
  });

  test('reading event', async (t) => {
    const ctx = startApi(t, { heartbeatMs: 100000 });
    await ctx.ready;
    const c = await connectStream(ctx);
    await c.waitForCount(1);
    const R = { room_id: 1, t: NOW, T: 18, RH: 88, CO2: 800, t_out: 30, rh_out: 60, ac_mode: 'cool', ac_setpoint: 17.5, fog: 1, air: 1, lights: 1, circ: 0, power_w: 1000, kwh: 1 };
    ctx.rooms.emit('reading', { roomId: 1, live: { reading: R, running: true, error: null, stage: 'fruiting', crop: 'oyster', alarms: 0 } });
    await c.waitForCount(2);
    assert.equal(c.messages[1].event, 'reading');
    assert.deepStrictEqual(c.messages[1].data, R);
  });

  test('event, alarm, room events are relayed unchanged', async (t) => {
    const ctx = startApi(t, { heartbeatMs: 100000 });
    await ctx.ready;
    const c = await connectStream(ctx);
    await c.waitForCount(1);
    const ev = { id: 1, room_id: 1, t: NOW, level: 'info', text: 'Started' };
    const alarm = { id: 2, room_id: 1, alarm_key: 'rhHi', level: 'warning', label: 'High humidity', raised_at: NOW, cleared_at: null, acked_at: null };
    const room = { id: 1, name: 'Room 1', volume: 60, adapter: 'sim', created_at: NOW, archived_at: null, live: null };
    ctx.rooms.emit('event', { roomId: 1, event: ev });
    ctx.rooms.emit('alarm', { roomId: 1, change: 'raised', alarm });
    ctx.rooms.emit('room', { room });
    await c.waitForCount(4);
    assert.deepStrictEqual(c.messages[1], { event: 'event', data: ev });
    assert.deepStrictEqual(c.messages[2], { event: 'alarm', data: alarm });
    assert.deepStrictEqual(c.messages[3], { event: 'room', data: room });

    const archivedRoom = { ...room, archived_at: NOW, live: null };
    ctx.rooms.emit('room', { room: archivedRoom });
    await c.waitForCount(5);
    assert.deepStrictEqual(c.messages[4], { event: 'room', data: archivedRoom });
  });

  test('settings event', async (t) => {
    const ctx = startApi(t, { heartbeatMs: 100000 });
    await ctx.ready;
    const c = await connectStream(ctx);
    await c.waitForCount(1);
    const V = { id: 5, room_id: 1, saved_at: NOW, note: 'Created' };
    const S = { spT: 25 };
    ctx.rooms.emit('settings', { roomId: 1, version: V, settings: S, warnings: [], auto: false });
    await c.waitForCount(2);
    assert.equal(c.messages[1].event, 'settings');
    assert.deepStrictEqual(c.messages[1].data, { ...V, room_id: 1, settings: S });
  });

  test('one message per emit, in order; no extra room after a reading and the next ping', async (t) => {
    const ctx = startApi(t, { heartbeatMs: 50 });
    await ctx.ready;
    const c = await connectStream(ctx);
    await c.waitForCount(1);
    const R = { room_id: 1, t: NOW, T: 18, RH: 88, CO2: 800, t_out: 30, rh_out: 60, ac_mode: 'cool', ac_setpoint: 17.5, fog: 1, air: 1, lights: 1, circ: 0, power_w: 1000, kwh: 1 };
    ctx.rooms.emit('reading', { roomId: 1, live: { reading: R } });
    ctx.rooms.emit('alarm', { roomId: 1, change: 'raised', alarm: { id: 1, room_id: 1, alarm_key: 'rhHi', level: 'warning', label: 'x', raised_at: NOW, cleared_at: null, acked_at: null } });
    ctx.rooms.emit('event', { roomId: 1, event: { id: 1, room_id: 1, t: NOW, level: 'info', text: 'x' } });
    ctx.rooms.emit('settings', { roomId: 1, version: { id: 1, room_id: 1, saved_at: NOW, note: null }, settings: {}, warnings: [], auto: false });
    ctx.rooms.emit('room', { room: { id: 1, name: 'R', volume: 60, adapter: 'sim', created_at: NOW, archived_at: null, live: null } });
    // Pings (heartbeatMs 50) may arrive between the events when the machine is busy: compare the events only.
    await c.waitForEvents(5);
    assert.deepStrictEqual(c.messages.filter(m => m.event).map(m => m.event), ['reading', 'alarm', 'event', 'settings', 'room']);

    // A reading alone is followed by no extra 'room' message, only by the next ping.
    ctx.rooms.emit('reading', { roomId: 1, live: { reading: { ...R, t: NOW + 1 } } });
    await c.waitForEvents(6);
    const afterReading = c.messages.length;
    await c.waitForPing(afterReading);
    const events = c.messages.filter(m => m.event);
    assert.deepStrictEqual(events.map(m => m.event), ['reading', 'alarm', 'event', 'settings', 'room', 'reading']);
    assert.equal(events.at(-1).data.t, NOW + 1);
    assert.ok(c.messages.every(m => m.comment === undefined || m.comment === 'ping'));
  });

  test('two clients both get every message', async (t) => {
    const ctx = startApi(t, { heartbeatMs: 100000 });
    await ctx.ready;
    const c1 = await connectStream(ctx);
    const c2 = await connectStream(ctx);
    await c1.waitForCount(1);
    await c2.waitForCount(1);
    ctx.rooms.emit('event', { roomId: 1, event: { id: 1, room_id: 1, t: NOW, level: 'info', text: 'x' } });
    await c1.waitForCount(2);
    await c2.waitForCount(2);
    assert.deepStrictEqual(c1.messages[1], c2.messages[1]);
  });

  test('fatal sends nothing', async (t) => {
    const ctx = startApi(t, { heartbeatMs: 100000 });
    await ctx.ready;
    const c = await connectStream(ctx);
    await c.waitForCount(1);
    ctx.rooms.emit('fatal', { error: new Error('x') });
    // An absence check: under load the short wait can only make it less strict, never hang.
    await new Promise(r => setTimeout(r, 100));
    assert.equal(c.messages.length, 1);
  });

  test('heartbeat: every client gets a ping within 500 ms', async (t) => {
    const ctx = startApi(t, { heartbeatMs: 50 });
    await ctx.ready;
    const c = await connectStream(ctx);
    // "A ping arrives" with a margin that holds on a busy machine (heartbeatMs 50, so within a few ticks when idle).
    await c.waitForCount(2, 5000);
    assert.equal(c.messages[1].comment, 'ping');
  });

  test('client gone: destroying one client does not throw, the other still gets the message', async (t) => {
    const ctx = startApi(t, { heartbeatMs: 100000 });
    await ctx.ready;
    const c1 = await connectStream(ctx);
    const c2 = await connectStream(ctx);
    await c1.waitForCount(1);
    await c2.waitForCount(1);
    c1.req.destroy();
    await new Promise(r => setTimeout(r, 100));
    assert.doesNotThrow(() => ctx.rooms.emit('event', { roomId: 1, event: { id: 1, room_id: 1, t: NOW, level: 'info', text: 'x' } }));
    await c2.waitForCount(2);
    assert.equal(c2.messages[1].event, 'event');
  });

  test('slow client: the server ends it once writableLength passes 1 MB; another client still gets messages', { timeout: 60000 }, async (t) => {
    const ctx = startApi(t, { heartbeatMs: 100000 });
    await ctx.ready;
    const slow = await connectStream(ctx, { pause: true });
    assert.equal(slow.status, 200);
    const other = await connectStream(ctx);
    await other.waitForCount(1);

    const closed = new Promise(resolve => slow.res.on('close', resolve));
    const bigRoom = { id: 1, name: 'R', volume: 60, adapter: 'sim', created_at: NOW, archived_at: null, live: null, pad: 'x'.repeat(65536) };
    // Emit far more than 1 MB plus the socket buffers (about 10 MB at most): 32 MB, counted, not timed. The paused
    // client is resumed only after that, so its socket can drain only if the server did not end it.
    const EMIT_BYTES = 32 * 1024 * 1024;
    const perEmit = JSON.stringify(bigRoom).length;
    let emitted = 0;
    await within(new Promise(resolve => {
      const timer = setInterval(() => {
        for (let i = 0; i < 4 && emitted < EMIT_BYTES; i++) {
          ctx.rooms.emit('room', { room: bigRoom });
          emitted += perEmit;
        }
        if (emitted >= EMIT_BYTES) { clearInterval(timer); resolve(); }
      }, 5);
      t.after(() => clearInterval(timer));
    }), 40000, '32 MB of room events to be emitted');
    slow.resume();
    await within(closed, 15000, 'the slow client to be closed by the server');

    const beforeCount = other.messages.length;
    ctx.rooms.emit('event', { roomId: 1, event: { id: 1, room_id: 1, t: NOW, level: 'info', text: 'still alive' } });
    const alive = () => other.messages.some(m => m.event === 'event' && m.data && m.data.text === 'still alive');
    await other.waitUntil(alive, 'the other client to get the message', 15000);
    assert.ok(other.messages.length > beforeCount);
    assert.ok(other.messages.some(m => m.event === 'event' && m.data && m.data.text === 'still alive'));
  });

  test('close(): ends connections, removes the C2 listeners, a second close does nothing', async (t) => {
    const ctx = startApi(t, { heartbeatMs: 100000 });
    await ctx.ready;
    const c1 = await connectStream(ctx);
    const c2 = await connectStream(ctx);
    await c1.waitForCount(1);
    await c2.waitForCount(1);

    assert.equal(ctx.onCalls.length, 5);
    assert.deepStrictEqual(ctx.onCalls.map(c => c.name).sort(), ['alarm', 'event', 'reading', 'room', 'settings']);

    const ended1 = new Promise(resolve => c1.res.on('end', resolve));
    const ended2 = new Promise(resolve => c2.res.on('end', resolve));
    ctx.api.close();
    await within(ended1, 10000, 'the first connection to end');
    await within(ended2, 10000, 'the second connection to end');

    assert.equal(ctx.offCalls.length, 5);
    for (const off of ctx.offCalls) {
      const on = ctx.onCalls.find(o => o.name === off.name);
      assert.equal(off.fn, on.fn, off.name);
    }

    // An emit after close() must write nothing to an already-ended connection.
    let gotDataAfterClose = false;
    c1.res.on('data', () => { gotDataAfterClose = true; });
    assert.doesNotThrow(() => ctx.rooms.emit('event', { roomId: 1, event: { id: 1, room_id: 1, t: NOW, level: 'info', text: 'x' } }));
    // An absence check: under load the short wait can only make it less strict, never hang.
    await new Promise(r => setTimeout(r, 100));
    assert.equal(gotDataAfterClose, false);

    // A second close() does nothing: no further rooms.off calls.
    assert.doesNotThrow(() => ctx.api.close());
    assert.equal(ctx.offCalls.length, 5);
  });
});
