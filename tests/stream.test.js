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

function startApi(extra) {
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
  const ready = new Promise(resolve => server.on('listening', resolve));
  const url = () => `http://127.0.0.1:${server.address().port}`;
  function stop() {
    api.close();
    server.close();
  }
  return { get url() { return url(); }, db, rooms, api, fatals, stop, server, ready, onCalls, offCalls };
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

function connectStream(url, { pause, resumeAfterMs } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url + '/api/stream', res => {
      if (pause) {
        res.pause();
        // A paused stream stops libuv from watching the socket at all, so a server-initiated close is never
        // observed until the stream is resumed; resume once the server has had time to act on backpressure.
        if (resumeAfterMs) setTimeout(() => res.resume(), resumeAfterMs);
      }
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
            if (messages.length >= waiters[i].count) { waiters[i].resolve(); waiters.splice(i, 1); }
          }
        }
      });
      function waitForCount(count, timeoutMs = 3000) {
        if (messages.length >= count) return Promise.resolve();
        return new Promise((res2, rej2) => {
          const timer = setTimeout(() => rej2(new Error(`timeout waiting for ${count} messages, have ${messages.length}`)), timeoutMs);
          waiters.push({ count, resolve: () => { clearTimeout(timer); res2(); } });
        });
      }
      resolve({ req, res, status: res.statusCode, headers: res.headers, messages, waitForCount });
    });
    req.on('error', reject);
  });
}

describe('stream (C4)', () => {
  test('open: status, headers, first bytes retry: 3000', async () => {
    const ctx = startApi();
    await ctx.ready;
    const c = await connectStream(ctx.url);
    await c.waitForCount(1);
    assert.equal(c.status, 200);
    assert.equal(c.headers['content-type'], 'text/event-stream; charset=utf-8');
    assert.equal(c.headers['cache-control'], 'no-store');
    assert.equal(c.headers['connection'], 'keep-alive');
    assert.deepStrictEqual(c.messages[0], { retry: 3000 });
    c.req.destroy();
    ctx.stop();
  });

  test('reading event', async () => {
    const ctx = startApi();
    await ctx.ready;
    const c = await connectStream(ctx.url);
    await c.waitForCount(1);
    const R = { room_id: 1, t: NOW, T: 18, RH: 88, CO2: 800, t_out: 30, rh_out: 60, ac_mode: 'cool', ac_setpoint: 17.5, fog: 1, fan: 1, lights: 1, circ: 0, power_w: 1000, kwh: 1 };
    ctx.rooms.emit('reading', { roomId: 1, live: { reading: R, running: true, error: null, stage: 'fruiting', crop: 'oyster', alarms: 0 } });
    await c.waitForCount(2);
    assert.equal(c.messages[1].event, 'reading');
    assert.deepStrictEqual(c.messages[1].data, R);
    c.req.destroy();
    ctx.stop();
  });

  test('event, alarm, room events are relayed unchanged', async () => {
    const ctx = startApi();
    await ctx.ready;
    const c = await connectStream(ctx.url);
    await c.waitForCount(1);
    const ev = { id: 1, room_id: 1, t: NOW, level: 'info', text: 'Started' };
    const alarm = { id: 2, room_id: 1, alarm_key: 'rhHi', level: 'warning', label: 'High humidity', raised_at: NOW, cleared_at: null, acked_at: null };
    const room = { id: 1, name: 'Room 1', volume: 60, vent: 'supply', adapter: 'sim', created_at: NOW, archived_at: null, live: null };
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
    c.req.destroy();
    ctx.stop();
  });

  test('settings event', async () => {
    const ctx = startApi();
    await ctx.ready;
    const c = await connectStream(ctx.url);
    await c.waitForCount(1);
    const V = { id: 5, room_id: 1, saved_at: NOW, note: 'Created' };
    const S = { spT: 25 };
    ctx.rooms.emit('settings', { roomId: 1, version: V, settings: S, warnings: [], auto: false });
    await c.waitForCount(2);
    assert.equal(c.messages[1].event, 'settings');
    assert.deepStrictEqual(c.messages[1].data, { ...V, room_id: 1, settings: S });
    c.req.destroy();
    ctx.stop();
  });

  test('one message per emit, in order; no extra room after a reading and the next ping', async () => {
    const ctx = startApi();
    await ctx.ready;
    const c = await connectStream(ctx.url);
    await c.waitForCount(1);
    const R = { room_id: 1, t: NOW, T: 18, RH: 88, CO2: 800, t_out: 30, rh_out: 60, ac_mode: 'cool', ac_setpoint: 17.5, fog: 1, fan: 1, lights: 1, circ: 0, power_w: 1000, kwh: 1 };
    ctx.rooms.emit('reading', { roomId: 1, live: { reading: R } });
    ctx.rooms.emit('alarm', { roomId: 1, change: 'raised', alarm: { id: 1, room_id: 1, alarm_key: 'rhHi', level: 'warning', label: 'x', raised_at: NOW, cleared_at: null, acked_at: null } });
    ctx.rooms.emit('event', { roomId: 1, event: { id: 1, room_id: 1, t: NOW, level: 'info', text: 'x' } });
    ctx.rooms.emit('settings', { roomId: 1, version: { id: 1, room_id: 1, saved_at: NOW, note: null }, settings: {}, warnings: [], auto: false });
    ctx.rooms.emit('room', { room: { id: 1, name: 'R', volume: 60, vent: 'supply', adapter: 'sim', created_at: NOW, archived_at: null, live: null } });
    await c.waitForCount(6);
    assert.deepStrictEqual(c.messages.slice(1, 6).map(m => m.event), ['reading', 'alarm', 'event', 'settings', 'room']);

    // Wait for the next heartbeat ping; no extra 'room' message should appear after the reading alone.
    ctx.rooms.emit('reading', { roomId: 1, live: { reading: { ...R, t: NOW + 1 } } });
    await c.waitForCount(8); // the reading message, plus the next ping comment
    assert.equal(c.messages[6].event, 'reading');
    assert.equal(c.messages.length, 8);
    assert.equal(c.messages[7].comment, 'ping');
    c.req.destroy();
    ctx.stop();
  });

  test('two clients both get every message', async () => {
    const ctx = startApi();
    await ctx.ready;
    const c1 = await connectStream(ctx.url);
    const c2 = await connectStream(ctx.url);
    await c1.waitForCount(1);
    await c2.waitForCount(1);
    ctx.rooms.emit('event', { roomId: 1, event: { id: 1, room_id: 1, t: NOW, level: 'info', text: 'x' } });
    await c1.waitForCount(2);
    await c2.waitForCount(2);
    assert.deepStrictEqual(c1.messages[1], c2.messages[1]);
    c1.req.destroy();
    c2.req.destroy();
    ctx.stop();
  });

  test('fatal sends nothing', async () => {
    const ctx = startApi({ heartbeatMs: 100000 });
    await ctx.ready;
    const c = await connectStream(ctx.url);
    await c.waitForCount(1);
    ctx.rooms.emit('fatal', { error: new Error('x') });
    await new Promise(r => setTimeout(r, 100));
    assert.equal(c.messages.length, 1);
    c.req.destroy();
    ctx.stop();
  });

  test('heartbeat: every client gets a ping within 500 ms', async () => {
    const ctx = startApi({ heartbeatMs: 50 });
    await ctx.ready;
    const c = await connectStream(ctx.url);
    await c.waitForCount(2, 500);
    assert.equal(c.messages[1].comment, 'ping');
    c.req.destroy();
    ctx.stop();
  });

  test('client gone: destroying one client does not throw, the other still gets the message', async () => {
    const ctx = startApi({ heartbeatMs: 100000 });
    await ctx.ready;
    const c1 = await connectStream(ctx.url);
    const c2 = await connectStream(ctx.url);
    await c1.waitForCount(1);
    await c2.waitForCount(1);
    c1.req.destroy();
    await new Promise(r => setTimeout(r, 100));
    assert.doesNotThrow(() => ctx.rooms.emit('event', { roomId: 1, event: { id: 1, room_id: 1, t: NOW, level: 'info', text: 'x' } }));
    await c2.waitForCount(2);
    assert.equal(c2.messages[1].event, 'event');
    c2.req.destroy();
    ctx.stop();
  });

  test('slow client: the server ends it once writableLength passes 1 MB; another client still gets messages', { timeout: 15000 }, async () => {
    const ctx = startApi();
    await ctx.ready;
    const slow = await connectStream(ctx.url, { pause: true, resumeAfterMs: 1500 });
    assert.equal(slow.status, 200);
    const other = await connectStream(ctx.url);
    await other.waitForCount(1);

    const closed = new Promise(resolve => slow.res.on('close', resolve));
    const bigRoom = { id: 1, name: 'R', volume: 60, vent: 'supply', adapter: 'sim', created_at: NOW, archived_at: null, live: null, pad: 'x'.repeat(65536) };
    const timer = setInterval(() => {
      try { ctx.rooms.emit('room', { room: bigRoom }); } catch { /* ignore */ }
    }, 5);
    await closed;
    clearInterval(timer);

    const beforeCount = other.messages.length;
    ctx.rooms.emit('event', { roomId: 1, event: { id: 1, room_id: 1, t: NOW, level: 'info', text: 'still alive' } });
    await other.waitForCount(beforeCount + 1);
    assert.ok(other.messages.some(m => m.event === 'event' && m.data && m.data.text === 'still alive'));
    other.req.destroy();
    ctx.stop();
  });

  test('close(): ends connections, removes the C2 listeners, a second close does nothing', async () => {
    const ctx = startApi();
    await ctx.ready;
    const c1 = await connectStream(ctx.url);
    const c2 = await connectStream(ctx.url);
    await c1.waitForCount(1);
    await c2.waitForCount(1);

    assert.equal(ctx.onCalls.length, 5);
    assert.deepStrictEqual(ctx.onCalls.map(c => c.name).sort(), ['alarm', 'event', 'reading', 'room', 'settings']);

    const ended1 = new Promise(resolve => c1.res.on('end', resolve));
    const ended2 = new Promise(resolve => c2.res.on('end', resolve));
    ctx.api.close();
    await ended1;
    await ended2;

    assert.equal(ctx.offCalls.length, 5);
    for (const off of ctx.offCalls) {
      const on = ctx.onCalls.find(o => o.name === off.name);
      assert.equal(off.fn, on.fn, off.name);
    }

    assert.doesNotThrow(() => ctx.rooms.emit('event', { roomId: 1, event: { id: 1, room_id: 1, t: NOW, level: 'info', text: 'x' } }));
    assert.doesNotThrow(() => ctx.api.close());
    ctx.server.close();
  });
});
