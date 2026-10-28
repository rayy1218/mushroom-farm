// Lights on a schedule per stage (spec 2026-10-26-lighting-design.md): the machine, the schedule in the crop program, the
// automatic rule, energy, the simulation runs and upgrade 16.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RELAY_KEYS } from '../server/machine-codes.js';
import { decide, protect, createController } from '../server/controller.js';
import { createMachines, CommandError } from '../server/machines.js';
import { createPoller } from '../server/poller.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { validateRoom, RATINGS } from '../server/rooms.js';
import { PROGRAM_DEFAULTS, validateProgram } from '../server/program.js';
import { createCropApi } from '../server/crop-api.js';
import { estimateDay } from '../server/usage.js';
import { MACHINE_NAMES } from '../server/alarms.js';
import { simulate } from '../server/simulate.js';
import { DEFAULTS } from '../server/controller.js';
import { lightsNow, lightRow, lightSummary, isClock } from '../web/light-math.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, exchangeMaxMin: 10, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 };
const at = (h, m = 0, day = 26) => new Date(2026, 9, day, h, m).getTime(); // local time
const fruiting = (over = {}) => ({ ...PROGRAM_DEFAULTS, crops: [{ crop: 'oyster', blocks: 500 }], stage: 'fruiting', ...over });

// ---- machine ----

test('lights are the 6th relay key, named Lights', () => {
  assert.deepEqual(RELAY_KEYS, ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights']);
  assert.equal(MACHINE_NAMES.lights, 'Lights');
  assert.deepEqual(Object.keys(MACHINE_NAMES), ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights', 'ac']);
});

test('room fields: lights fitted (true/false) and Lights power 0–5000 W, default 60', () => {
  const rating = RATINGS.find((r) => r.field === 'lightsW');
  assert.deepEqual([rating.label, rating.unit, rating.default, rating.min, rating.max], ['Lights power', 'W', 60, 0, 5000]);
  assert.equal(validateRoom(ROOM).room.lightsW, 60);
  assert.equal(validateRoom(ROOM).room.lights, undefined, 'left out: kept on update');
  assert.equal(validateRoom({ ...ROOM, lights: true, lightsW: 120 }).room.lights, true);
  assert.deepEqual(validateRoom({ ...ROOM, lights: 'yes' }), { error: 'Lights fitted must be true or false', field: 'lights' });
  assert.deepEqual(validateRoom({ ...ROOM, lightsW: 5001 }), { error: 'Lights power must be a number from 0 to 5000 W', field: 'lightsW' });
});

test('db: a new room has no lights at 60 W; fitted and power are stored; unfitting logs them off', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const id = db.createRoom({ ...ROOM, relayAddress: 3 }).id;
  assert.deepEqual([db.getRoom(id).lights, db.getRoom(id).lightsW], [false, 60]);
  db.updateRoom(id, { ...ROOM, relayAddress: 3, lights: true, lightsW: 90 });
  assert.deepEqual([db.getRoom(id).lights, db.getRoom(id).lightsW], [true, 90]);
  db.updateRoom(id, { ...ROOM, relayAddress: 3, lightsW: 90 }); // an older page: kept
  assert.equal(db.getRoom(id).lights, true);
  db.setRelayCommand(id, 'lights', true, 100);
  db.logMachine(id, 'lights', { on: true }, 'manual', 100);
  assert.equal(db.getCommands(id).relay.lights, true);
  db.updateRoom(id, { ...ROOM, relayAddress: 3, lights: false }, 200);
  assert.equal(db.getRoom(id).lights, false);
  assert.deepEqual(db.machineLog(id, 'lights').map((r) => [r.at, r.on]), [[100, true], [200, false]]);
  assert.equal(db.createRoom({ ...ROOM, name: 'B', lights: true }).lights, true);
});

function machinesSetup(t, room, polls = []) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const writes = [];
  const client = { async writeCoil(...a) { writes.push(a); }, async writeRegisters() {} };
  const id = db.createRoom(room).id;
  const poller = { machineState: () => ({ relay: { address: room.relayAddress ?? null, polls }, ac: { address: null, polls: [] } }) };
  return { db, id, writes, machines: createMachines({ db, client, poller, now: () => 1_000_000 }) };
}

test('machines: not fitted is not-fitted and a manual command is refused; fitted follows coil 5 and input 5', async (t) => {
  const six = (v) => Array(6).fill(v);
  const poll = { at: 1, ok: true, coils: [...six(false).slice(0, 5), true], inputs: [...six(false).slice(0, 5), true] };
  const off = machinesSetup(t, { ...ROOM, relayAddress: 3 }, [poll]);
  assert.equal(off.machines.get(off.id).relay.machines[5].status, 'not-fitted');
  assert.equal(off.machines.get(off.id).relay.machines[5].key, 'lights');
  await assert.rejects(off.machines.command(off.id, 'lights', { on: true }), (err) => {
    assert.ok(err instanceof CommandError);
    assert.deepEqual([err.status, err.message, err.field], [400, 'This room has no lights', 'lights']);
    return true;
  });
  assert.deepEqual(off.writes, []);
  const on = machinesSetup(t, { ...ROOM, relayAddress: 3, lights: true }, [poll]);
  on.db.setRelayCommand(on.id, 'lights', true, 1);
  assert.equal(on.machines.get(on.id).relay.machines[5].status, 'on');
  await on.machines.command(on.id, 'lights', { on: false });
  assert.deepEqual(on.writes, [[3, 5, false]]);
});

test('poller: a relay module is read with 6 coils and 6 inputs', async () => {
  const calls = [];
  const client = {
    async readBits(unit, fn, start, qty) { calls.push([unit, fn, start, qty]); return Array(qty).fill(false); },
    async readRegisters() { return [0, 0, 0, 0]; },
  };
  const db = {
    listWiredSensors: () => [], listWiredMachines: () => [{ roomId: 1, kind: 'relay', address: 10 }], listMeters: () => [],
    listFilterSensors: () => [], outdoorAddress: () => null, addReading() {},
  };
  const poller = createPoller({ db, client });
  await poller.cycle();
  assert.deepEqual(calls, [[10, 1, 0, 6], [10, 2, 0, 6]]);
  assert.equal(poller.machineState(1).relay.polls.at(-1).coils.length, 6);
});

// ---- schedule (crop program) ----

test('program: the light defaults, and the checks of lightHours and lightStart', () => {
  assert.deepEqual(PROGRAM_DEFAULTS.lightHours, { spawn: 0, pinning: 12, fruiting: 12, rest: 0 });
  assert.equal(PROGRAM_DEFAULTS.lightStart, '07:00');
  assert.equal(validateProgram(fruiting()), null);
  for (const v of [-1, 25, 1.5, '12', null]) {
    assert.deepEqual(validateProgram(fruiting({ lightHours: { ...PROGRAM_DEFAULTS.lightHours, pinning: v } })),
      { error: 'Light hours must be a whole number from 0 to 24', field: 'lightHours.pinning' }, String(v));
  }
  for (const v of ['7:00', '24:00', '07:60', '', 7, null, '07:00:00']) {
    assert.deepEqual(validateProgram(fruiting({ lightStart: v })), { error: 'Light start must be a time like 07:00', field: 'lightStart' }, String(v));
  }
  assert.equal(validateProgram(fruiting({ lightHours: { spawn: 24, pinning: 0, fruiting: 8, rest: 1 }, lightStart: '23:59' })), null);
  assert.deepEqual(validateProgram(fruiting({ lightHours: null })), { error: 'Light hours must be given per stage', field: 'lightHours' });
});

test('db: the light schedule is stored with the program and defaults without one', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const id = db.createRoom(ROOM).id;
  assert.deepEqual([db.getProgram(id).lightHours, db.getProgram(id).lightStart], [PROGRAM_DEFAULTS.lightHours, '07:00']);
  db.getProgram(id).lightHours.fruiting = 3; // a copy, not the defaults
  assert.equal(PROGRAM_DEFAULTS.lightHours.fruiting, 12);
  db.setProgram(id, fruiting({ lightHours: { spawn: 1, pinning: 2, fruiting: 3, rest: 4 }, lightStart: '21:30' }));
  assert.deepEqual([db.getProgram(id).lightHours, db.getProgram(id).lightStart], [{ spawn: 1, pinning: 2, fruiting: 3, rest: 4 }, '21:30']);
});

test('crop API: PUT takes lightHours (any of the four) and lightStart, checked; GET returns them', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const id = db.createRoom(ROOM).id;
  const api = createCropApi({ db, now: () => at(12) });
  assert.deepEqual([api.get(id).lightHours, api.get(id).lightStart], [PROGRAM_DEFAULTS.lightHours, '07:00']);
  const r = api.put(id, { lightHours: { fruiting: 10 }, lightStart: '06:30' });
  assert.deepEqual([r.lightHours, r.lightStart], [{ spawn: 0, pinning: 12, fruiting: 10, rest: 0 }, '06:30']);
  assert.throws(() => api.put(id, { lightHours: { rest: 25 } }), (err) => err.status === 400 && err.field === 'lightHours.rest'
    && err.message === 'Light hours must be a whole number from 0 to 24');
  assert.throws(() => api.put(id, { lightStart: '6:30' }), (err) => err.status === 400 && err.field === 'lightStart'
    && err.message === 'Light start must be a time like 07:00');
  assert.throws(() => api.put(id, { lightHours: 5 }), (err) => err.status === 400 && err.field === 'lightHours');
  assert.equal(api.get(id).lightHours.fruiting, 10, 'a refused change changes nothing');
});

// ---- the rule ----

const rule = ({ fitted = true, program = fruiting(), now = at(12) } = {}) => decide({
  bands, state: { exchange: false, humidifier: false }, readings: { co2: 650, rh: 90 }, now, lightsFitted: fitted, program,
});

test('rule: not fitted is never on and has no reason', () => {
  const r = rule({ fitted: false });
  assert.deepEqual([r.desired.lights, r.reasons.lights], [false, '']);
  const plain = decide({ bands, state: { exchange: false, humidifier: false }, readings: { co2: 650, rh: 90 }, now: at(12) });
  assert.deepEqual([plain.desired.lights, plain.reasons.lights], [false, '']);
});

test('rule: no crops or no program is off', () => {
  for (const program of [null, { ...PROGRAM_DEFAULTS, crops: [] }]) {
    const r = rule({ program });
    assert.deepEqual([r.desired.lights, r.reasons.lights], [false, 'Lights off: no crop set']);
  }
});

test('rule: a stage with 0 hours is off all day', () => {
  const spawn = rule({ program: fruiting({ farmType: 'full', stage: 'spawn' }) });
  assert.deepEqual([spawn.desired.lights, spawn.reasons.lights], [false, 'Lights off: none in the spawn run']);
  const rest = rule({ program: fruiting({ stage: 'rest' }) });
  assert.equal(rest.reasons.lights, 'Lights off: none in the rest between flushes');
});

test('rule: on inside today\'s window, off outside', () => {
  const cases = [[at(6, 59), false], [at(7), true], [at(12), true], [at(18, 59), true], [at(19), false], [at(23), false], [at(0, 30), false]];
  for (const [now, on] of cases) {
    const r = rule({ now });
    assert.equal(r.desired.lights, on, new Date(now).toString());
    assert.equal(r.reasons.lights, on ? 'Lights on: 07:00–19:00 for fruiting (12 h)' : 'Lights off: on 07:00–19:00 for fruiting');
  }
});

test('rule: a window crossing midnight is on before and after midnight', () => {
  const program = fruiting({ lightStart: '20:00', lightHours: { ...PROGRAM_DEFAULTS.lightHours, fruiting: 10 } });
  for (const [now, on] of [[at(19, 59), false], [at(20), true], [at(23, 59), true], [at(0), true], [at(5, 59), true], [at(6), false], [at(12), false]]) {
    assert.equal(rule({ now, program }).desired.lights, on, new Date(now).toString());
  }
  assert.equal(rule({ now: at(2), program }).reasons.lights, 'Lights on: 20:00–06:00 for fruiting (10 h)');
});

test('rule: 24 h is on all day', () => {
  const program = fruiting({ lightHours: { ...PROGRAM_DEFAULTS.lightHours, fruiting: 24 } });
  for (const now of [at(0), at(6, 59), at(7), at(23, 59)]) {
    const r = rule({ now, program });
    assert.equal(r.desired.lights, true);
    assert.equal(r.reasons.lights, 'Lights on all day for fruiting (24 h)');
  }
});

test('rule: a stage change mid-day follows the new stage\'s hours', () => {
  assert.equal(rule({ program: fruiting({ stage: 'fruiting' }) }).desired.lights, true);
  assert.equal(rule({ program: fruiting({ stage: 'rest' }) }).desired.lights, false);
});

test('protect: the lights are never held', () => {
  const commands = { relay: { intake: false, exhaust: false, circulation: true, humidifier: false, dehumidifier: false, lights: false }, ac: { power: true, mode: 'cool', setpoint: 22, fan: 'auto' } };
  const want = { intake: false, exhaust: false, circulation: true, humidifier: false, dehumidifier: false, lights: true, ac: { power: true, mode: 'cool', setpoint: 22, fan: 'auto' } };
  const p = protect({ desired: want, commands, changedAt: { lights: 1_000_000 }, now: 1_000_001 });
  assert.equal(p.desired.lights, true);
  assert.equal(p.held.lights, undefined);
});

// ---- the runner ----

const WIRED = { ...ROOM, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };

function runner(t, room = { ...WIRED, lights: true }, start = at(6, 50)) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const writes = [];
  const client = { async writeCoil(...a) { writes.push(['coil', ...a]); }, async writeRegisters(...a) { writes.push(['regs', ...a]); } };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  let clock = start;
  const now = () => clock;
  const machines = createMachines({ db, client, poller, now });
  const controller = createController({ db, machines, now, log: (e) => { throw e; } });
  const id = db.createRoom(room).id;
  return {
    db, controller, machines, writes, id,
    async cycle(dt = 30_000) {
      clock += dt;
      const s = clock;
      db.addReading({ roomId: id, kind: 'trh', address: 1, at: s, ok: true, t: 22, rh: 90, error: null });
      db.addReading({ roomId: id, kind: 'co2', address: 2, at: s, ok: true, co2: 650, error: null });
      clock += 1;
      await controller.run(s);
    },
    coil: () => db.getCommands(id).relay.lights,
  };
}

test('runner: fitted lights follow the schedule and the reason is shown', async (t) => {
  const s = runner(t);
  s.db.setProgram(s.id, fruiting({ stageSince: at(0) }));
  s.controller.update(s.id, { auto: true });
  await s.cycle(); // 06:50:30
  assert.equal(s.coil(), false);
  assert.equal(s.controller.get(s.id).reasons.lights, 'Lights off: on 07:00–19:00 for fruiting');
  await s.cycle(10 * 60_000); // 07:00:31
  assert.equal(s.coil(), true);
  assert.deepEqual(s.writes.filter((w) => w[2] === 5), [['coil', 3, 5, true]]);
  assert.equal(s.controller.get(s.id).reasons.lights, 'Lights on: 07:00–19:00 for fruiting (12 h)');
});

test('runner: the stage changing mid-day switches the lights to the new stage\'s hours', async (t) => {
  const s = runner(t, { ...WIRED, lights: true }, at(11, 59));
  // fruiting of 7 days that ends at 12:00 today: the rest has no light
  s.db.setProgram(s.id, fruiting({ stageSince: at(12, 0, 19), rampH: 0 }));
  s.controller.update(s.id, { auto: true });
  await s.cycle(10_000);
  assert.equal(s.coil(), true);
  await s.cycle(60_000);
  assert.equal(s.db.getProgram(s.id).stage, 'rest');
  assert.equal(s.coil(), false);
  assert.equal(s.controller.get(s.id).reasons.lights, 'Lights off: none in the rest between flushes');
});

test('runner: not fitted or auto off never commands the lights', async (t) => {
  const s = runner(t, WIRED, at(11));
  s.db.setProgram(s.id, fruiting({ stageSince: at(0) }));
  s.controller.update(s.id, { auto: true });
  await s.cycle();
  assert.deepEqual(s.writes.filter((w) => w[2] === 5), []);
  assert.equal(s.controller.get(s.id).reasons.lights, '');
  const m = runner(t, { ...WIRED, lights: true }, at(11));
  m.db.setProgram(m.id, fruiting({ stageSince: at(0) }));
  await m.cycle();
  assert.deepEqual(m.writes, []);
});

test('runner: no crops turns fitted lights off', async (t) => {
  const s = runner(t, { ...WIRED, lights: true }, at(11));
  await s.machines.command(s.id, 'lights', { on: true });
  s.controller.update(s.id, { auto: true });
  await s.cycle();
  assert.equal(s.coil(), false);
  assert.equal(s.controller.get(s.id).reasons.lights, 'Lights off: no crop set');
});

// ---- energy ----

test('usage estimate: run time × lightsW', () => {
  const est = estimateDay({ lights: { on: 2 * 3_600_000 } }, { intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, dehumidifierW: 380, acInputW: 1050, lightsW: 90 });
  assert.equal(est.lights, 0.18);
});

const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 };
const simInput = { physics, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 1 };
const simCtx = (ratings = {}, program = null) => ({
  volume: 60, ratings: { intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050, ...ratings },
  control: { ...DEFAULTS }, program, prices: null,
});

test('simulation: with lights fitted they run the schedule of the program on the run\'s clock; without, none', () => {
  const without = simulate(simInput, simCtx());
  assert.deepEqual(without.machines.lights, []);
  assert.equal(without.summary.energy.byMachine.lights, 0);
  const lit = simulate(simInput, simCtx({ lights: true, lightsW: 100 }, { lightHours: { spawn: 0, pinning: 12, fruiting: 10, rest: 0 }, lightStart: '06:00' }));
  assert.deepEqual(lit.machines.lights, [{ from: 6 * 3600, to: 16 * 3600 }]);
  assert.equal(lit.summary.energy.byMachine.lights, 1);
  assert.ok(lit.summary.energy.kWh > without.summary.energy.kWh);
  assert.ok(lit.summary.extremes.tMax >= without.summary.extremes.tMax, 'the light heat');
  const defaults = simulate(simInput, simCtx({ lights: true, lightsW: 60 }));
  assert.deepEqual(defaults.machines.lights, [{ from: 7 * 3600, to: 19 * 3600 }]);
});

// ---- the shared text helpers ----

test('light-math: clock check, the Targets row, the Climate summary and lightsNow', () => {
  assert.equal(isClock('07:00'), true);
  assert.equal(isClock('7:00'), false);
  assert.equal(lightRow(12, '07:00'), '12 h a day from 07:00');
  assert.equal(lightRow(0, '07:00'), 'Off');
  assert.equal(lightRow(24, '07:00'), 'All day');
  assert.equal(lightSummary(fruiting()), 'On 07:00–19:00 (12 h) for fruiting');
  assert.equal(lightSummary(fruiting({ farmType: 'full', stage: 'spawn' })), 'Off all day in the spawn run');
  assert.equal(lightSummary({ ...PROGRAM_DEFAULTS, crops: [] }), 'Off: no crop set');
  assert.equal(lightSummary(fruiting({ lightHours: { ...PROGRAM_DEFAULTS.lightHours, fruiting: 24 } })), 'On all day (24 h) for fruiting');
  assert.deepEqual(lightsNow(fruiting(), at(12)), { on: true, reason: 'Lights on: 07:00–19:00 for fruiting (12 h)' });
});

// ---- upgrade 15 → 16 ----

function v15(t) {
  const dir = mkdtempSync(join(tmpdir(), 'lights-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'farm.db');
  const first = openDb(path);
  const id = first.createRoom({ ...ROOM, relayAddress: 3, dehumidifier: true, dehumidifierW: 400 }, 1000).id;
  for (const [key, on, when] of [['humidifier', true, 100], ['dehumidifier', true, 150], ['humidifier', false, 200]]) {
    first.setRelayCommand(id, key, on, when);
    first.logMachine(id, key, { on }, 'manual', when);
  }
  first.setProgram(id, fruiting({ farmType: 'full', stage: 'pinning', days: { spawn: 20, pinning: 5, fruiting: 8, rest: 9 } }));
  first.close();
  // back to a version 15 file: the old machine CHECK and no light columns
  const raw = new DatabaseSync(path);
  const rows = raw.prepare('SELECT * FROM machine_log ORDER BY id').all().map((r) => ({ ...r }));
  assert.equal(rows.length, 3);
  raw.exec(`ALTER TABLE machine_log RENAME TO x; DROP INDEX machine_log_by_room;
    CREATE TABLE machine_log (id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL,
      machine TEXT NOT NULL CHECK (machine IN ('intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'ac')),
      at INTEGER NOT NULL, on_ INTEGER NOT NULL CHECK (on_ IN (0, 1)), setpoint REAL, mode TEXT, fan TEXT,
      source TEXT NOT NULL CHECK (source IN ('manual', 'auto'))) STRICT;
    CREATE INDEX machine_log_by_room ON machine_log (room_id, machine, at);
    INSERT INTO machine_log SELECT * FROM x; DROP TABLE x;
    ALTER TABLE machine_commands DROP COLUMN lights;
    ALTER TABLE rooms DROP COLUMN lights; ALTER TABLE rooms DROP COLUMN lights_w;
    ALTER TABLE room_programs DROP COLUMN light_spawn; ALTER TABLE room_programs DROP COLUMN light_pinning;
    ALTER TABLE room_programs DROP COLUMN light_fruiting; ALTER TABLE room_programs DROP COLUMN light_rest;
    ALTER TABLE room_programs DROP COLUMN light_start;
    PRAGMA user_version = 15;`);
  raw.close();
  return { path, id, rows };
}

test('upgrade 15 to 16: the light columns with their defaults, the machine log rebuilt with its rows, the rest kept', (t) => {
  const { path, id, rows } = v15(t);
  const db = openDb(path);
  t.after(() => db.close());
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 17);
  assert.deepEqual(check.prepare('SELECT * FROM machine_log ORDER BY id').all().map((r) => ({ ...r })), rows);
  assert.ok(check.prepare("SELECT 1 FROM sqlite_master WHERE name = 'machine_log_by_room'").get(), 'index kept');
  const room = db.getRoom(id);
  assert.deepEqual([room.lights, room.lightsW, room.dehumidifier, room.dehumidifierW, room.relayAddress], [false, 60, true, 400, 3]);
  const p = db.getProgram(id);
  assert.deepEqual([p.stage, p.days.pinning, p.lightHours, p.lightStart], ['pinning', 5, { spawn: 0, pinning: 12, fruiting: 12, rest: 0 }, '07:00']);
  assert.deepEqual(db.getCommands(id).relay, { intake: false, exhaust: false, circulation: false, humidifier: false, dehumidifier: true, lights: false, sentAt: 200 });
  db.updateRoom(id, { ...ROOM, relayAddress: 3, lights: true });
  db.logMachine(id, 'lights', { on: true }, 'auto', 300); // the new machine is allowed in the log
  assert.deepEqual(db.machineLog(id, 'lights').map((r) => r.at), [300]);
  const w = new DatabaseSync(path);
  t.after(() => w.close());
  assert.throws(() => w.exec(`UPDATE rooms SET lights = 2 WHERE id = ${id}`), /CHECK/);
});

test('upgrade 15 to 16: running it on an already upgraded file (or again) is harmless', (t) => {
  const { path, id } = v15(t);
  openDb(path).close();
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA user_version = 15'); // as if the version had not been written
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.equal(db.getRoom(id).lightsW, 60);
  assert.equal(db.getProgram(id).lightStart, '07:00');
  db.logMachine(id, 'lights', { on: true }, 'auto', 300);
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 17);
  assert.equal(check.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'machine_log%'").get().n, 2);
});

// ---- the room API ----

test('API: lights fitted and power through the room routes; running lights taken out are switched off first', async (t) => {
  const db = openDb(':memory:');
  const writes = [];
  const client = { async writeCoil(...a) { writes.push(a); }, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, client, poller });
  const server = createApp(db, { machines });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const made = await call('POST', '/api/rooms', { ...ROOM, relayAddress: 3, lights: true, lightsW: 80 });
  assert.equal(made.status, 201);
  assert.deepEqual([made.body.lights, made.body.lightsW], [true, 80]);
  const id = made.body.id;
  assert.equal((await call('PUT', `/api/rooms/${id}/machines/lights`, { on: true })).status, 200);
  assert.deepEqual(writes, [[3, 5, true]]);
  const off = await call('PUT', `/api/rooms/${id}`, { ...ROOM, relayAddress: 3, lights: false });
  assert.equal(off.body.lights, false);
  assert.deepEqual(writes.at(-1), [3, 5, false]);
  assert.equal(db.getCommands(id).relay.lights, false);
  const refused = await call('PUT', `/api/rooms/${id}/machines/lights`, { on: true });
  assert.deepEqual([refused.status, refused.body], [400, { error: 'This room has no lights', field: 'lights' }]);
  assert.equal((await call('PUT', `/api/rooms/${id}`, { ...ROOM, lightsW: -1 })).body.field, 'lightsW');
});
