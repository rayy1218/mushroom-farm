// Fresh air at least every N minutes (spec 2026-10-19-safety-and-history-design.md 2.6): the pure decide, the validation,
// the database columns and upgrade, and the runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decide, validateControl, DEFAULTS, createController } from '../server/controller.js';
import { openDb } from '../server/db.js';
import { createMachines } from '../server/machines.js';

const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, exchangeMaxMin: 10, exchangeEveryMin: 15, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 };
const NOW = 10_000_000;
const S = 1000;
const MIN = 60_000;

const offFor = (ms, extra = {}) => ({
  exchange: false, exchangeSince: null, exchangeEndedAt: ms === null ? null : NOW - ms, cappedInRow: 0, humidifier: false, humidifierSince: null, ...extra,
});
const forcedFor = (ms, extra = {}) => ({
  exchange: true, exchangeSince: NOW - ms, exchangeEndedAt: null, exchangeForced: true, cappedInRow: 0, humidifier: false, humidifierSince: null, ...extra,
});
const go = (state, co2, extra = {}) => decide({ bands, state, readings: { co2, rh: 90 }, now: NOW, ...extra });

// ---- decide ----

test('no air exchange for 15 min: the fans run for 1 min, whatever the CO₂', () => {
  for (const co2 of [500, 650]) {
    const r = go(offFor(15 * MIN), co2);
    assert.equal(r.state.exchange, true, `CO₂ ${co2}`);
    assert.equal(r.state.exchangeForced, true);
    assert.equal(r.state.exchangeSince, NOW);
    assert.equal(r.desired.intake, true);
    assert.equal(r.desired.exhaust, true);
    assert.equal(r.reasons.exchange, 'Fresh air: no air exchange for 15 min, fans on for 1 min');
  }
});

test('the fresh-air wait: not before 15 min, counted from the last exchange end or the time it began counting', () => {
  assert.equal(go(offFor(15 * MIN - S), 650).state.exchange, false);
  assert.equal(go(offFor(15 * MIN - S), 650).reasons.exchange, 'Air exchange kept off: CO₂ 650 between 600 and 750');
  // freshFrom (the auto-on time) wins over an older end
  assert.equal(go(offFor(60 * MIN, { freshFrom: NOW - 10 * MIN }), 650).state.exchange, false);
  assert.equal(go(offFor(60 * MIN, { freshFrom: NOW - 15 * MIN }), 650).state.exchange, true);
});

test('never ended and no count yet: the count starts now and is kept', () => {
  const r = go(offFor(null), 650);
  assert.equal(r.state.exchange, false);
  assert.equal(r.state.freshFrom, NOW);
  const later = decide({ bands, state: { ...r.state }, readings: { co2: 650, rh: 90 }, now: NOW + 15 * MIN });
  assert.equal(later.state.exchange, true);
  assert.equal(later.state.exchangeForced, true);
});

test('0 min (or a missing setting) turns the rule off', () => {
  assert.equal(go(offFor(60 * MIN), 650, { bands: { ...bands, exchangeEveryMin: 0 } }).state.exchange, false);
  const { exchangeEveryMin, ...older } = bands;
  assert.equal(go(offFor(60 * MIN), 650, { bands: older }).state.exchange, false);
});

test('a fresh-air run keeps going for its minute even below the lower CO₂ limit, then stops', () => {
  const r = go(forcedFor(40 * S), 550);
  assert.equal(r.state.exchange, true);
  assert.equal(r.reasons.exchange, 'Fresh air: fans on, 20 s to go');
  const done = go(forcedFor(MIN, { cappedInRow: 2 }), 550);
  assert.equal(done.state.exchange, false);
  assert.equal(done.state.exchangeForced, false);
  assert.equal(done.state.exchangeEndedAt, NOW);
  assert.equal(done.state.freshFrom, NOW);
  assert.equal(done.state.cappedInRow, 2, 'a fresh-air run is not an exchange stopped at its limit');
  assert.equal(done.reasons.exchange, 'Fresh air done: fans ran 1 min');
});

test('a fresh-air run whose CO₂ reaches the upper limit becomes a normal exchange', () => {
  const r = go(forcedFor(40 * S), 760);
  assert.equal(r.state.exchange, true);
  assert.equal(r.state.exchangeForced, false);
  assert.equal(r.state.exchangeSince, NOW - 40 * S, 'its start time is kept');
  assert.equal(r.reasons.exchange, 'Air exchange: CO₂ 760 ≥ 750');
  const safety = go(forcedFor(2 * MIN), 1300);
  assert.equal(safety.state.exchange, true);
  assert.equal(safety.state.exchangeForced, false);
});

test('CO₂ not usable: the fresh-air run still starts and stops on its time', () => {
  const r = go(offFor(15 * MIN), null);
  assert.equal(r.state.exchange, true);
  assert.equal(r.state.exchangeForced, true);
  assert.equal(go(forcedFor(MIN), null).state.exchange, false);
  assert.equal(go(forcedFor(30 * S), null).state.exchange, true);
});

test('a CO₂ sensor fault: the timed exchange rests at most the fresh-air interval', () => {
  const fault = { faults: { co2: true } };
  assert.equal(go(offFor(15 * MIN), null, fault).state.exchange, true);
  assert.equal(go(offFor(15 * MIN - S), null, fault).state.exchange, false);
  assert.equal(go(offFor(15 * MIN), null, fault).reasons.exchange, 'CO₂ sensor fault: timed air exchange, 10 min of every 25');
  assert.equal(go(offFor(15 * MIN), null, fault).state.exchangeForced, false);
  // a 30 min interval keeps the normal 20 min rest
  const wide = { ...fault, bands: { ...bands, exchangeEveryMin: 30 } };
  assert.equal(go(offFor(15 * MIN), null, wide).state.exchange, false);
  assert.equal(go(offFor(20 * MIN), null, wide).reasons.exchange, 'CO₂ sensor fault: timed air exchange, 10 min of every 30');
  // a fault during a fresh-air run: the timed exchange takes over (10 min)
  const taken = go(forcedFor(MIN), null, fault);
  assert.equal(taken.state.exchange, true);
  assert.equal(taken.state.exchangeForced, false);
});

test('a normal exchange is not changed by the rule', () => {
  const r = go({ ...offFor(null), exchange: true, exchangeSince: NOW - 5 * MIN }, 650);
  assert.equal(r.state.exchange, true);
  assert.equal(r.state.exchangeForced, false);
  assert.equal(r.reasons.exchange, 'Air exchange kept on: CO₂ 650 between 600 and 750');
});

// ---- validation ----

test('validateControl: the fresh-air interval is a whole number from 0 to 240 min', () => {
  const bad = (patch) => validateControl({ ...DEFAULTS, ...patch });
  assert.equal(DEFAULTS.exchangeEveryMin, 15);
  for (const v of [0, 1, 15, 240]) assert.equal(bad({ exchangeEveryMin: v }), null, String(v));
  for (const v of [-1, 241, 1.5, '15', null]) {
    assert.deepEqual(bad({ exchangeEveryMin: v }), { error: 'Fresh air interval must be a whole number from 0 to 240 min (0: off)', field: 'exchangeEveryMin' }, String(v));
  }
});

// ---- database ----

test('a new room has the rule at 15 min; the setting and the run state are stored', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const id = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 }).id;
  const c = db.getControl(id);
  assert.equal(c.exchangeEveryMin, 15);
  assert.equal(c.exchangeForced, false);
  assert.equal(c.freshFrom, null);
  db.setControl(id, { ...c, exchangeEveryMin: 30 });
  assert.equal(db.getControl(id).exchangeEveryMin, 30);
  db.setControlState(id, { exchange: true, humidifier: false, exchangeForced: true, freshFrom: 123 }, 1000);
  assert.equal(db.getControl(id).exchangeForced, true);
  assert.equal(db.getControl(id).freshFrom, 123);
  db.setControlState(id, { exchange: true, humidifier: false }, 2000);
  assert.equal(db.getControl(id).exchangeForced, true, 'kept when not given');
  assert.equal(db.getControl(id).freshFrom, 123, 'kept when not given');
});

test('upgrade to 10: existing rooms get the rule at 15 min', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'fresh-air-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'farm.db');
  const db = openDb(path);
  const id = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 }).id;
  db.close();
  // back to version 9: without the new columns
  const raw = new DatabaseSync(path);
  raw.exec(`ALTER TABLE room_controls DROP COLUMN exchange_every_min;
            ALTER TABLE room_controls DROP COLUMN exchange_forced;
            ALTER TABLE room_controls DROP COLUMN fresh_from;
            DROP TABLE room_crops; DROP TABLE room_programs; DROP TABLE simulation_runs; -- version 11
            PRAGMA user_version = 9;`);
  raw.close();
  const again = openDb(path);
  t.after(() => again.close());
  assert.equal(again.getControl(id).exchangeEveryMin, 15);
  assert.equal(again.getControl(id).exchangeForced, false);
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 12);
});

// ---- runner ----

const WIRED = { name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const client = { async writeCoil() {}, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  let clock = 1_000_000;
  const now = () => clock;
  const machines = createMachines({ db, client, poller, now });
  const controller = createController({ db, machines, now, log: (e) => { throw e; } });
  const id = db.createRoom(WIRED).id;
  return {
    db, controller, id,
    async cycle({ co2 = 650, dt = 30_000 } = {}) {
      clock += dt;
      const start = clock;
      db.addReading({ roomId: id, kind: 'trh', address: 1, at: start, ok: true, t: 22, rh: 90, error: null });
      db.addReading({ roomId: id, kind: 'co2', address: 2, at: start, ok: true, co2, error: null });
      clock += 1;
      await controller.run(start);
    },
  };
}

test('runner: the count starts when auto is turned on; 15 min later the fans run 1 min, then wait again', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle();
  for (let i = 0; i < 28; i++) await s.cycle(); // 14.5 min
  assert.equal(s.db.getCommands(s.id).relay.intake, false);
  await s.cycle(); // 15 min since the first cycle after auto on
  await s.cycle();
  const on = s.controller.get(s.id);
  assert.equal(on.exchange, true);
  assert.equal(on.exchangeForced, true);
  assert.equal(on.exchangeEndsAt, on.exchangeSince + MIN, 'planned end: 1 min after the start');
  assert.equal(on.reasons.exchange, 'Fresh air: no air exchange for 15 min, fans on for 1 min');
  assert.equal(s.db.getCommands(s.id).relay.intake, true);
  assert.equal(s.db.getCommands(s.id).relay.exhaust, true);
  await s.cycle();
  await s.cycle();
  assert.equal(s.controller.get(s.id).exchange, false);
  assert.equal(s.db.getCommands(s.id).relay.intake, false);
  assert.equal(s.controller.get(s.id).exchangeForced, false);
});

test('runner: turning auto off and on again restarts the count', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle();
  for (let i = 0; i < 20; i++) await s.cycle();
  s.controller.update(s.id, { auto: false });
  s.controller.update(s.id, { auto: true });
  for (let i = 0; i < 20; i++) await s.cycle(); // 10 min after auto on again
  assert.equal(s.controller.get(s.id).exchange, false);
});
