// Review fixes of the filter on the farm server (spec 2026-10-22-filter-design.md 3 to 6): a filter change during another
// room's sends, a partial room save against the stored settings, the intake really running, the fan factor's ceiling,
// readings of the old filter, and the daily mean in one pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createController } from '../server/controller.js';
import { changeFilter, filterInput, meanCountedPa, intakeOnThrough } from '../server/filter.js';
import { fanWattFactor } from '../device/sim-power.js';

const S = 1000;
const MIN = 60_000;
const DAY = 86_400_000;
const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

test('a Filter changed during another room\'s sends is not undone: the room is read again before its filter alarms', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const a = db.createRoom({ ...ROOM, name: 'A', relayAddress: 3 }, 0).id;
  const b = db.createRoom({ ...ROOM, name: 'B', filterChangeDays: 1 }, 0).id;
  let release;
  const held = new Promise((r) => { release = r; });
  let sends = 0;
  const machines = { get: () => null, async command() { if (sends++ === 0) await held; }, forget() {} };
  const clock = 2 * DAY;
  const controller = createController({ db, machines, now: () => clock });
  controller.update(a, { auto: true });
  const running = controller.run(clock); // room A sends its first command and waits there
  await new Promise((r) => setImmediate(r));
  assert.equal(sends, 1, 'room A is sending');
  changeFilter(db, b, clock); // the API's Filter changed for room B
  controller.filterChanged(b);
  release();
  await running;
  assert.deepEqual(db.activeAlarms(b).map((x) => x.key), [], 'room B: just changed, not due');
});

async function app(t) {
  const db = openDb(':memory:');
  const server = createApp(db, {});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { db, call };
}

test('a save with some filter settings is checked against the room\'s stored others, not the defaults', async (t) => {
  const { call } = await app(t);
  const big = (await call('POST', '/api/rooms', { ...ROOM, fanMaxPa: 500, filterCleanPa: 40, filterFinalPa: 300 })).body;
  const ok = await call('PUT', `/api/rooms/${big.id}`, { ...ROOM, name: 'Big', filterFinalPa: 300 });
  assert.equal(ok.status, 200, 'fan maximum 500 is stored: 300 is below it');
  assert.deepEqual([ok.body.fanMaxPa, ok.body.filterFinalPa], [500, 300]);
  const small = (await call('POST', '/api/rooms', { ...ROOM, name: 'Small', fanMaxPa: 100, filterCleanPa: 40, filterFinalPa: 80 })).body;
  const bad = await call('PUT', `/api/rooms/${small.id}`, { ...ROOM, name: 'Small', filterFinalPa: 150 });
  assert.deepEqual(bad, { status: 400, body: { error: "Filter change pressure must be below the fan's maximum pressure", field: 'filterFinalPa' } });
});

function room(t, fields = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const r = db.createRoom({ ...ROOM, relayAddress: 3, dpAddress: 7, ...fields }, 0);
  return { db, id: r.id };
}
const view = (status) => ({ relay: { machines: [{ key: 'intake', status }] } });

test('a reading counts only while the intake really runs when the machines view says so; without a view, as commanded', (t) => {
  const { db, id } = room(t);
  db.logMachine(id, 'intake', { on: true }, 'auto', DAY);
  db.addFilterReading({ roomId: id, address: 7, at: DAY + 5 * MIN, ok: true, pa: 12 });
  const at = DAY + 5 * MIN + 2 * S;
  assert.equal(filterInput(db, db.getRoom(id), at).pa, 12, 'no view: the commanded rule');
  assert.equal(filterInput(db, db.getRoom(id), at, view('on')).pa, 12);
  for (const status of ['not-running', 'no-answer', 'switching', 'not-following']) {
    assert.equal(filterInput(db, db.getRoom(id), at, view(status)).pa, null, status);
  }
  assert.equal(filterInput(db, db.getRoom(id), at, view('not-wired')).pa, 12, 'no relay: the commanded rule');
});

test('the controller passes the machines view: a dead intake fan does not raise filterMissing', async (t) => {
  const { db, id } = room(t);
  db.logMachine(id, 'intake', { on: true }, 'manual', 0);
  const machines = { get: () => view('not-running'), async command() {}, forget() {} };
  let clock = 0;
  const controller = createController({ db, machines, now: () => clock });
  for (let i = 1; i <= 15; i++) {
    clock = i * MIN;
    db.addFilterReading({ roomId: id, address: 7, at: clock, ok: true, pa: 1 }); // the fan stands still: about 0 Pa
    await controller.run(clock);
  }
  assert.equal(db.activeAlarms(id).some((x) => x.key === 'filterMissing'), false);
});

test('the fan factor never exceeds 1.15, even for a mean far above the fan maximum', () => {
  assert.equal(fanWattFactor(2000, 40, 200), 1.15);
  assert.equal(fanWattFactor(201, 40, 200), 1.15);
});

test('readings of the old filter do not count: not for the alarms, not as the pressure before the next change', (t) => {
  const { db, id } = room(t);
  db.logMachine(id, 'intake', { on: true }, 'auto', 0);
  db.addFilterReading({ roomId: id, address: 7, at: DAY, ok: true, pa: 160 });
  changeFilter(db, id, DAY + 10 * S); // the fan kept running through the change
  assert.equal(filterInput(db, db.getRoom(id), DAY + 20 * S).pa, null, 'the 160 Pa was the old filter');
  db.addFilterReading({ roomId: id, address: 7, at: DAY + 30 * S, ok: true, pa: 41 });
  assert.equal(filterInput(db, db.getRoom(id), DAY + 35 * S).pa, 41);
  changeFilter(db, id, DAY + 5 * MIN);
  assert.deepEqual(db.filterChanges(id).map((c) => c.paBefore), [41, 160]);
  changeFilter(db, id, DAY + 6 * MIN);
  assert.equal(db.filterChanges(id)[0].paBefore, null, 'no reading since the last change');
});

// The day mean as it was: every reading against the whole log.
const oldMean = (readings, log) => {
  const counted = readings.filter((r) => intakeOnThrough(log, r.at - MIN, r.at));
  return counted.length === 0 ? null : counted.reduce((sum, r) => sum + r.pa, 0) / counted.length;
};

test('meanCountedPa in one pass gives what the reading-by-reading rule gave, on a mixed day', () => {
  const log = [];
  let on = false;
  for (let at = 0; at < DAY; at += 7 * MIN + 13 * S) {
    on = !on;
    log.push({ at, on });
    if (at % 3 === 0) log.push({ at, on }); // a repeated row
  }
  const readings = [];
  for (let at = 0; at < DAY; at += 37 * S) readings.push({ at, pa: 30 + ((at / S) % 50) });
  assert.equal(meanCountedPa(readings, log), oldMean(readings, log));
  assert.equal(meanCountedPa(readings.slice(0, 3), [{ at: 0, on: true }]), oldMean(readings.slice(0, 3), [{ at: 0, on: true }]));
  assert.equal(meanCountedPa([], log), null);
  assert.equal(meanCountedPa(readings, []), null);
  // an off and an on at the same time, and the edges of the spin-up
  const edge = [{ at: 0, on: true }, { at: 100 * S, on: false }, { at: 100 * S, on: true }];
  const r = [60 * S, 99 * S, 100 * S, 159 * S, 160 * S, 200 * S].map((at) => ({ at, pa: at / S }));
  assert.equal(meanCountedPa(r, edge), oldMean(r, edge));
});
