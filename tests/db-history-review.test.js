// Review fixes for the history/overview queries in server/db.js: speed (covering index, bucket cache), bucket edges,
// plausible ranges, the overview exchange flag and the machine-log query plan.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, HISTORY_SQL, MACHINE_LOG_SQL } from '../server/db.js';

const HOUR = 3_600_000;
const fields = { name: 'R', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };

function tempDb(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-hist-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'h.db');
}

const timed = (fn) => {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
};

test('30 days of 5 s polls: a repeated 168 h / 720 h history and the overview are fast, and equal an uncached answer', { timeout: 60_000 }, (t) => {
  const path = tempDb(t);
  const db = openDb(path);
  t.after(() => db.close());
  const room = db.createRoom(fields);
  const now = 1_000 * HOUR + 12_345;
  const raw = new DatabaseSync(path);
  raw.exec('BEGIN');
  const insert = raw.prepare('INSERT INTO readings (room_id, kind, address, at, ok, t, rh, co2, error) VALUES (?, ?, ?, ?, 1, ?, ?, NULL, NULL)');
  const N = 30 * 24 * 720; // 518 400
  for (let i = 0; i < N; i++) insert.run(room.id, 'trh', 1, now - i * 5000, 20 + (i % 50) / 10, 80 + (i % 20));
  raw.exec('COMMIT');
  raw.close();

  const report = {};
  for (const hours of [168, 720]) {
    const first = timed(() => db.history(room.id, hours, now));
    const again = timed(() => db.history(room.id, hours, now));
    const later = timed(() => db.history(room.id, hours, now + 5000)); // the next poll
    report[hours] = `first ${first.ms.toFixed(0)} ms, repeated ${again.ms.toFixed(1)} ms, next poll ${later.ms.toFixed(1)} ms`;
    assert.ok(first.value.trh.length > 300);
    assert.deepEqual(again.value, first.value);
    assert.ok(again.ms < 100, `${hours} h repeated took ${again.ms} ms`);
    assert.ok(later.ms < 100, `${hours} h next poll took ${later.ms} ms`);
    // The same answer from a fresh connection (nothing cached).
    const fresh = openDb(path);
    try {
      assert.deepEqual(fresh.history(room.id, hours, now + 5000), later.value);
    } finally {
      fresh.close();
    }
  }
  db.overview(now); // first call fills the cache
  const ov = timed(() => db.overview(now));
  report.overview = `${ov.ms.toFixed(1)} ms per room, repeated`;
  assert.ok(ov.ms < 25, `overview took ${ov.ms} ms`);
  console.log('history timings:', JSON.stringify(report));
});

test('a reading that arrives in an already completed bucket is in the next answer', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom(fields);
  const now = 1_000 * HOUR;
  const b = 1_800_000; // 168 h
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: now - 5 * b + 10, ok: true, t: 20, rh: 80 });
  assert.equal(db.history(room.id, 168, now).trh[0].t, 20);
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: now - 5 * b + 20, ok: true, t: 22, rh: 90 });
  assert.equal(db.history(room.id, 168, now).trh[0].t, 21);
});

test('deleting a room drops its cached buckets (a new room may reuse the id)', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const now = 1_000 * HOUR;
  const a = db.createRoom(fields);
  db.addReading({ roomId: a.id, kind: 'trh', address: 1, at: now - 3 * HOUR, ok: true, t: 20, rh: 80 });
  assert.equal(db.history(a.id, 24, now).trh.length, 1);
  db.deleteRoom(a.id);
  const b = db.createRoom(fields);
  assert.equal(b.id, a.id);
  assert.deepEqual(db.history(b.id, 24, now).trh, []);
});

test('buckets are epoch aligned but never partial at the start, and every at lies inside [from, to]', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom(fields);
  const now = 1_000 * HOUR + 12_345; // not on a bucket boundary
  const b = 60_000; // 6 h
  const from = now - 6 * HOUR;
  const firstBoundary = Math.ceil(from / b) * b;
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: from + 1000, ok: true, t: 99, rh: 50 }); // in the partial first bucket
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: firstBoundary + 5000, ok: true, t: 20, rh: 80 });
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: firstBoundary + 25_000, ok: true, t: 22, rh: 90 });
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: now - 100, ok: true, t: 30, rh: 60 });
  const h = db.history(room.id, 6, now);
  assert.equal(h.from, from);
  assert.deepEqual(h.trh.map((p) => p.t), [21, 30]);
  assert.equal(h.trh[0].at, firstBoundary + b / 2);
  assert.ok(h.trh.every((p) => p.at >= h.from && p.at <= h.to));
  assert.equal(h.trh[1].at, now); // the middle of the running bucket would be later than now: clamped
});

test('a bucket middle is the bucket middle for readings that are not aligned', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom(fields);
  const now = 1_000 * HOUR + 7_777;
  const b = 300_000; // 24 h
  const slot = Math.floor((now - 3 * HOUR) / b) * b;
  db.addReading({ roomId: room.id, kind: 'co2', address: 2, at: slot + 17, ok: true, co2: 600 });
  db.addReading({ roomId: room.id, kind: 'co2', address: 2, at: slot + b - 3, ok: true, co2: 800 });
  db.addReading({ roomId: room.id, kind: 'co2', address: 2, at: slot + b + 1, ok: true, co2: 1000 });
  assert.deepEqual(db.history(room.id, 24, now).co2, [{ at: slot + b / 2, co2: 700 }, { at: slot + b + b / 2, co2: 1000 }]);
});

test('implausible readings (spec section 1 ranges) are left out of the averages', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom(fields);
  const now = 1_000 * HOUR;
  const base = now - 2 * HOUR;
  const trh = (dt, tv, rh) => db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: base + dt, ok: true, t: tv, rh });
  const co2 = (dt, v) => db.addReading({ roomId: room.id, kind: 'co2', address: 2, at: base + dt, ok: true, co2: v });
  trh(1000, 20, 80);
  trh(2000, 61, 80); // too hot
  trh(3000, -11, 80);
  trh(4000, 20, 0); // RH out of 1..100
  trh(5000, 20, 101);
  trh(6000, 22, 100); // limits are inside
  trh(7000, 60, 1);
  co2(1000, 400);
  co2(2000, 299);
  co2(3000, 10_001);
  co2(4000, 10_000);
  const h = db.history(room.id, 6, now);
  assert.equal(h.trh.length, 1);
  assert.equal(h.trh[0].t, (20 + 22 + 60) / 3);
  assert.equal(h.trh[0].rh, (80 + 100 + 1) / 3);
  assert.equal(h.co2[0].co2, 5200);
});

test('overview exchange: with auto off it follows the commanded relays, with auto on the controller state', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom(fields);
  const ex = () => {
    const r = db.overview(Date.now()).rooms[0];
    return [r.exchange, r.exchangeSince];
  };
  assert.deepEqual(ex(), [false, null]);
  db.setRelayCommand(room.id, 'intake', true, Date.now());
  assert.deepEqual(ex(), [false, null]); // intake alone is not an exchange
  db.setRelayCommand(room.id, 'exhaust', true, Date.now());
  assert.deepEqual(ex(), [true, null]);
  // stale controller state is ignored while auto is off
  db.setControlState(room.id, { exchange: false, humidifier: false }, 5);
  assert.deepEqual(ex(), [true, null]);
  db.setControl(room.id, { ...db.getControl(room.id), auto: true });
  assert.deepEqual(ex(), [false, null]);
  db.setControlState(room.id, { exchange: true, humidifier: false }, 4242);
  assert.deepEqual(ex(), [true, 4242]);
});

test('the bucket query reads the covering index without a temp b-tree', (t) => {
  const path = tempDb(t);
  openDb(path).close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  for (const kind of ['trh', 'co2']) {
    const plan = raw.prepare(`EXPLAIN QUERY PLAN ${HISTORY_SQL.bucket(kind)}`).all(1, 0, 1e12).map((r) => r.detail);
    assert.match(plan.join('\n'), /COVERING INDEX readings_by_time/);
    assert.ok(!plan.some((d) => /TEMP B-TREE/.test(d)), plan.join('\n'));
  }
});

test('the last-log-row query is served by the (room_id, machine, at) index without a temp b-tree', (t) => {
  const path = tempDb(t);
  openDb(path).close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  const plan = raw.prepare(`EXPLAIN QUERY PLAN ${MACHINE_LOG_SQL.last}`).all(1, 'ac').map((r) => r.detail);
  assert.match(plan.join('\n'), /INDEX machine_log_by_room/);
  assert.ok(!plan.some((d) => /TEMP B-TREE/.test(d)), plan.join('\n'));
});

test('the last log row is the newest by time, then by id', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom(fields);
  db.logMachine(room.id, 'exhaust', { on: true }, 'auto', 2000);
  db.logMachine(room.id, 'exhaust', { on: false }, 'auto', 1000); // an older time written later
  assert.equal(db.logMachine(room.id, 'exhaust', { on: true }, 'auto', 3000), false); // same as the newest by time
  assert.equal(db.logMachine(room.id, 'exhaust', { on: false }, 'auto', 4000), true);
});
