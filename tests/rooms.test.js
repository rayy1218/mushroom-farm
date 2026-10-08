// tests/rooms.test.js: C2 room manager and simulated adapter tests (docs/contracts/rooms.md section 17).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../controller.js');
require('../sim.js');
require('../runtime.js');
const CC = globalThis.ClimateController;
const SIM = globalThis.ClimateSim;
const { openFakeDb } = require('./fakes/db.js');
const { fromJson, toJson } = require('../server/db-common.js');
const { createSimAdapter, MAX_CATCH_UP_S, TZ_OFFSET_S, START_CO2 } = require('../server/sim-adapter.js');
const rooms = require('../server/rooms.js');
const roomsCommon = require('../server/rooms-common.js');
const { createFakeRoomManager } = require('./fakes/rooms.js');

const T0 = 1791424800; // 2026-10-08 10:00 farm time (outside the harvest windows)

function setup(adapterFactory) {
  let clock = T0;
  const now = () => clock;
  const db = openFakeDb({ now });
  const mgr = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: adapterFactory || rooms.defaultAdapterFactory });
  const log = [];
  for (const n of ['reading', 'event', 'alarm', 'settings', 'room', 'fatal']) mgr.on(n, p => log.push([n, p]));
  const step = n => { for (let i = 0; i < n; i++) { clock += 1; mgr.tick(); } };
  const jump = s => { clock += s; mgr.tick(); };
  return { db, mgr, log, step, jump, now, advanceClock: ds => { clock += ds; } };
}

function scripted() {
  const knobs = { failRead: false, values: {}, reads: 0 };
  const factory = ({ cfg, snapshot, now }) => {
    let t = now(), seq = snapshot ? snapshot.seq : 0, next = 0, r = null;
    const sample = () => {
      const w = ++seq % 2, v = knobs.values;
      r = {
        seq, t, hour: ((t + 28800) % 86400) / 3600,
        T: 'T' in v ? v.T : cfg.spT + w * 0.1, RH: 'RH' in v ? v.RH : cfg.spRH + w * 0.5,
        CO2: 'CO2' in v ? v.CO2 : cfg.co2Lim - 200 + w * 10, tOut: 30 + w * 0.1, rhOut: 70 + w * 0.5,
      };
      next = t + 30;
    };
    sample();
    return {
      io: {
        read() { knobs.reads++; if (knobs.failRead) throw new Error('sensor bus down'); return r; },
        write() {}, advance(dt) { if (dt <= 0) return; t += dt; if (t >= next) sample(); },
      },
      view: () => null, snapshot: () => ({ seq }),
    };
  };
  return { factory, knobs };
}

function simSpyFactory() {
  const made = [], writes = [];
  const factory = args => {
    const a = createSimAdapter(args);
    const w = a.io.write;
    a.io.write = c => { writes.push(c); w(c); };
    made.push({ args, a });
    return a;
  };
  return { factory, made, writes };
}

// Wraps any factory to record the args (notably the live cfg object) given at each loop start.
function capture(factory) {
  const made = [];
  return { factory: args => { made.push(args); return factory(args); }, made };
}

// ---------------------------------------------------------------------------
// Task 1: Simulated adapter (C2 section 13, 12.1)
// ---------------------------------------------------------------------------

test('sim adapter: constants', () => {
  assert.equal(MAX_CATCH_UP_S, 300);
  assert.equal(TZ_OFFSET_S, 28800);
  assert.equal(START_CO2, 750);
});

test('sim adapter: env', (t) => {
  const origCreate = SIM.create;
  let capturedEnv = null;
  SIM.create = (env, snapshot) => {
    capturedEnv = env;
    return origCreate(env, snapshot);
  };
  t.after(() => { SIM.create = origCreate; });

  const defaultEnvBefore = structuredClone(SIM.DEFAULT_ENV);
  const now = () => T0;
  const room = { id: 1, volume: 80, vent: 'exhaust', adapter: 'sim' };
  const calib = { ua: 90, infAch: 0.4, moistBuffer: 3, co2PerBlock: 41.6 };
  const cfg = CC.defaultSettings();
  cfg.stage = 'pinning';

  createSimAdapter({ room, calib, blocks: 500, cfg, snapshot: null, now });
  assert.ok(capturedEnv);
  assert.equal(capturedEnv.vent, 'exhaust');
  assert.deepEqual(capturedEnv.room, { volume: 80, ua: 90, infAch: 0.4, moistBuffer: 3 });
  assert.equal(capturedEnv.co2PerBlock, 42);
  assert.equal(capturedEnv.blocks, 500);
  assert.equal(capturedEnv.blockStage, 'pinning');
  assert.equal(capturedEnv.startHour, ((now() + TZ_OFFSET_S) % 86400) / 3600);
  for (const k of Object.keys(SIM.DEFAULT_ENV)) {
    if (['vent', 'room', 'co2PerBlock', 'blocks', 'blockStage', 'startHour'].includes(k)) continue;
    assert.deepEqual(capturedEnv[k], SIM.DEFAULT_ENV[k], `key ${k}`);
  }

  capturedEnv = null;
  createSimAdapter({ room, calib: null, blocks: null, cfg, snapshot: null, now });
  assert.deepEqual(capturedEnv.room, { volume: 80 });
  assert.equal(capturedEnv.co2PerBlock, 45);
  assert.equal(capturedEnv.blocks, 2000);

  assert.deepEqual(SIM.DEFAULT_ENV, defaultEnvBefore);
});

test('sim adapter: new room at its targets', () => {
  const now = () => T0;
  const cfg = CC.defaultSettings();
  const a = createSimAdapter({ room: { id: 1, volume: 60, vent: 'supply', adapter: 'sim' }, calib: null, blocks: null, cfg, snapshot: null, now });
  assert.equal(a.io.read().t, now());
  assert.equal(a.io.read().hour, 10);
  assert.equal(a.view().T, cfg.spT);
  assert.equal(a.view().CO2, 750);
});

test('sim adapter: one reading per 30 s', (t) => {
  const origCreate = SIM.create;
  let capturedEnv = null;
  SIM.create = (env, snapshot) => {
    capturedEnv = env;
    return origCreate(env, snapshot);
  };
  t.after(() => { SIM.create = origCreate; });

  let clock = T0;
  const now = () => clock;
  const cfg = CC.defaultSettings();
  const a = createSimAdapter({ room: { id: 1, volume: 60, vent: 'supply', adapter: 'sim' }, calib: null, blocks: null, cfg, snapshot: null, now });
  const r0 = a.io.read();
  a.io.write({ ac: { power: true, mode: 'cool', setpoint: 25, fan: 'auto' }, hu: { level: 0 }, fan: { level: 0 }, lights: { on: false }, circ: { on: false } });
  for (let i = 0; i < 30; i++) { clock += 1; a.io.advance(1); }
  const r1 = a.io.read();
  assert.notEqual(r1.seq, r0.seq);
  assert.equal(r1.t, T0 + 30);

  // C2 section 13.1 io.advance: env.blockStage = cfg.stage before each inner.advance(1), so a cfg.stage
  // change between steps shows in the captured env.blockStage after the next step.
  assert.equal(capturedEnv.blockStage, 'fruiting'); // the old stage, unmoved before the step
  cfg.stage = 'rest';
  clock += 1; a.io.advance(1);
  assert.equal(capturedEnv.blockStage, 'rest');
});

test('sim adapter: CO₂ jitter', (t) => {
  let clock = T0;
  const now = () => clock;
  const cfg = CC.defaultSettings();
  const origCreate = SIM.create;
  let capturedSim = null;
  SIM.create = (env, snapshot) => { capturedSim = origCreate(env, snapshot); return capturedSim; };
  t.after(() => { SIM.create = origCreate; });
  const a = createSimAdapter({ room: { id: 1, volume: 60, vent: 'supply', adapter: 'sim' }, calib: null, blocks: null, cfg, snapshot: null, now });
  a.io.write({ ac: { power: true, mode: 'cool', setpoint: 25, fan: 'auto' }, hu: { level: 0 }, fan: { level: 0 }, lights: { on: false }, circ: { on: false } });
  for (let i = 0; i < 5; i++) {
    clock += 1; a.io.advance(1);
    const r = a.io.read();
    const raw = capturedSim.read();
    if (r.seq % 2 === 1) assert.ok(Math.abs(r.CO2 - (raw.CO2 + 1e-6)) < 1e-12);
    else assert.equal(r.CO2, raw.CO2);
  }
  capturedSim.env.faults.CO2 = 'missing';
  for (let i = 0; i < 30; i++) { clock += 1; a.io.advance(1); }
  assert.equal(a.io.read().CO2, null);
});

test('sim adapter: gap', () => {
  let clock = T0;
  const now = () => clock;
  const cfg = CC.defaultSettings();
  const a = createSimAdapter({ room: { id: 1, volume: 60, vent: 'supply', adapter: 'sim' }, calib: null, blocks: null, cfg, snapshot: null, now });
  a.io.write({ ac: { power: true, mode: 'cool', setpoint: 25, fan: 'auto' }, hu: { level: 0 }, fan: { level: 0 }, lights: { on: false }, circ: { on: false } });
  const seqBefore = a.io.read().seq;
  clock += 301;
  a.io.advance(301);
  assert.equal(a.view().t, now());
  assert.equal(a.io.read().seq, seqBefore);

  const viewBefore = a.view();
  a.io.advance(0);
  assert.deepEqual(a.view(), viewBefore);
  a.io.advance(-5);
  assert.deepEqual(a.view(), viewBefore);
});

test('sim adapter: resume from a snapshot', () => {
  let clock = T0;
  const now = () => clock;
  const cfg = CC.defaultSettings();
  const a = createSimAdapter({ room: { id: 1, volume: 60, vent: 'supply', adapter: 'sim' }, calib: null, blocks: null, cfg, snapshot: null, now });
  a.io.write({ ac: { power: true, mode: 'cool', setpoint: 25, fan: 'auto' }, hu: { level: 0 }, fan: { level: 0 }, lights: { on: false }, circ: { on: false } });
  for (let i = 0; i < 60; i++) { clock += 1; a.io.advance(1); }
  const oldView = a.view();
  const oldSeq = a.io.read().seq;
  const snap = fromJson(toJson(a.snapshot()));

  clock += 600;
  const b = createSimAdapter({ room: { id: 1, volume: 60, vent: 'supply', adapter: 'sim' }, calib: null, blocks: null, cfg, snapshot: snap, now });
  assert.equal(b.view().T, oldView.T);
  assert.equal(b.view().RH, oldView.RH);
  assert.equal(b.view().CO2, oldView.CO2);
  assert.equal(b.view().t, now());
  assert.equal(b.io.read().seq, oldSeq);
  assert.ok(b.io.read().t > a.io.read().t);
  assert.deepEqual(b.snapshot(), snap);
});

// ---------------------------------------------------------------------------
// Task 2: Module surface, listeners, factory (C2 section 1, 3, 7, 12.2)
// ---------------------------------------------------------------------------

test('rooms: exports', () => {
  assert.equal(typeof rooms.createRoomManager, 'function');
  assert.equal(typeof rooms.defaultAdapterFactory, 'function');
  assert.deepEqual(rooms.TARGET_KEYS, Object.keys(CC.profileTargets('oyster', 'fruiting')));
  assert.equal(rooms.RoomError, roomsCommon.RoomError);
  assert.equal(rooms.DEMO_ROOM, roomsCommon.DEMO_ROOM);
  assert.equal(rooms.FIRST_NOTE, roomsCommon.FIRST_NOTE);
  assert.equal(rooms.cleanSettings, roomsCommon.cleanSettings);

  const roomsPath = require.resolve('../server/rooms.js');
  const mod = require.cache[roomsPath];
  for (const child of mod.children) {
    assert.ok(/[\\/](controller|runtime|sim-adapter|rooms-common)\.js$/.test(child.id), `unexpected require: ${child.id}`);
  }

  // Requiring rooms.js loads no node:sqlite and no server/db.js (C2 section 17). node:sqlite is a
  // built-in and is never a require.cache key at all (even when it has been required elsewhere), so this
  // only rules out server/db.js being reachable through rooms.js's own require graph.
  assert.ok(!('node:sqlite' in require.cache));
  assert.ok(!Object.keys(require.cache).some(k => /[\\/]server[\\/]db\.js$/.test(k)));
});

test('rooms: defaultAdapterFactory', () => {
  const cfg = CC.defaultSettings();
  const a = rooms.defaultAdapterFactory({ room: { id: 1, volume: 60, vent: 'supply', adapter: 'sim' }, calib: null, blocks: null, cfg, snapshot: null, now: () => T0 });
  assert.equal(typeof a.io.read, 'function');
  assert.equal(typeof a.io.write, 'function');
  assert.equal(typeof a.io.advance, 'function');
  assert.equal(typeof a.view, 'function');
  assert.equal(typeof a.snapshot, 'function');
  assert.throws(() => rooms.defaultAdapterFactory({ room: { id: 1, volume: 60, vent: 'supply', adapter: 'hw' }, calib: null, blocks: null, cfg, snapshot: null, now: () => T0 }), /Unknown adapter "hw"/);
});

test('rooms: listeners', () => {
  const { mgr } = setup();
  const order = [];
  const fn1 = () => order.push('1');
  const fn2 = () => order.push('2');
  mgr.on('event', fn1);
  mgr.on('event', fn2);
  mgr.tick(); // no-op before start, but exercise listeners directly below
  // Fire manually through a method that emits 'event'
  // (use create, which is available even before start())
  mgr.create({ name: 'X', volume: 60, vent: 'supply' });
  assert.ok(order.includes('1') && order.includes('2'));
  const i1 = order.indexOf('1'), i2 = order.indexOf('2');
  assert.ok(i1 < i2);

  order.length = 0;
  mgr.off('event', fn1);
  mgr.create({ name: 'Y', volume: 60, vent: 'supply' });
  assert.ok(!order.includes('1'));
  assert.ok(order.includes('2'));

  const origError = console.error;
  let errorCalls = 0;
  console.error = () => { errorCalls++; };
  const throwing = () => { throw new Error('boom'); };
  const after = () => order.push('after');
  mgr.off('event', fn2);
  mgr.on('event', throwing);
  mgr.on('event', after);
  order.length = 0;
  mgr.create({ name: 'Z', volume: 60, vent: 'supply' });
  console.error = origError;
  assert.ok(errorCalls > 0);
  assert.ok(order.includes('after'));
});

test('rooms: nothing before start', () => {
  let clock = T0;
  const db = openFakeDb({ now: () => clock });
  let callCount = 0;
  const countedDb = new Proxy(db, {
    get(target, prop) {
      const v = target[prop];
      if (typeof v === 'function') return (...args) => { callCount++; return v.apply(target, args); };
      return v;
    },
  });
  const mgr = rooms.createRoomManager({ db: countedDb, now: () => clock, tickMs: 0, adapterFactory: rooms.defaultAdapterFactory });
  mgr.tick();
  assert.equal(callCount, 0);
});

// ---------------------------------------------------------------------------
// Task 3: create and the demo room (C2 section 4, 6.1, 9.4, 8.5)
// ---------------------------------------------------------------------------

test('Demo room', () => {
  const { db, mgr } = setup();
  mgr.start();
  const room = db.getRoom(1);
  assert.equal(room.name, 'Room 1');
  assert.equal(room.volume, 60);
  assert.equal(room.vent, 'supply');
  assert.equal(room.adapter, 'sim');
  const version = db.currentSettings(1);
  assert.equal(version.note, 'Created');
  const base = CC.defaultSettings();
  base.roomM3 = 60;
  assert.deepEqual(version.settings, base);
  assert.equal(db.settingsHistory(1).length, 1);

  // A second manager's start() on the same db creates nothing.
  const mgr2 = rooms.createRoomManager({ db, now: () => T0, tickMs: 0, adapterFactory: rooms.defaultAdapterFactory });
  mgr2.start();
  assert.equal(db.listRooms({ includeArchived: true }).length, 1);
  assert.equal(db.settingsHistory(1).length, 1);
});

test('First settings', () => {
  const { db, mgr, log } = setup();

  // Key left out
  let { room: room1, warnings: w1 } = mgr.create({ name: 'A', volume: 80, vent: 'supply' });
  let v1 = db.currentSettings(room1.id);
  assert.equal(v1.note, 'Created');
  let base1 = CC.defaultSettings(); base1.roomM3 = 80;
  assert.deepEqual(v1.settings, base1);
  assert.deepEqual(w1, []);

  // settings: undefined explicitly
  const { room: room2, warnings: w2 } = mgr.create({ name: 'B', volume: 90, vent: 'supply', settings: undefined });
  const v2 = db.currentSettings(room2.id);
  assert.equal(v2.note, 'Created');
  let base2 = CC.defaultSettings(); base2.roomM3 = 90;
  assert.deepEqual(v2.settings, base2);
  assert.deepEqual(w2, []);

  // Emit order check, on a manager not started
  log.length = 0;
  const { room: room3 } = mgr.create({ name: 'C', volume: 70, vent: 'supply' });
  assert.equal(log.length, 3);
  assert.equal(log[0][0], 'settings');
  assert.equal(log[0][1].auto, false);
  assert.deepEqual(log[0][1].version, db.currentSettings(room3.id));
  assert.deepEqual(log[0][1].warnings, []);
  assert.equal(log[1][0], 'event');
  assert.equal(log[1][1].event.text, 'Room created');
  assert.equal(log[1][1].event.level, 'info');
  assert.equal(log[1][1].event.t, T0);
  assert.equal(log[2][0], 'room');

  // Bad settings with warnings
  const { warnings: w4 } = mgr.create({ name: 'D', volume: 60, vent: 'supply', settings: { spT: 99, bogus: 1 } });
  const v4 = db.currentSettings(mgr.list().find(r => r.name === 'D').id);
  assert.equal(v4.settings.spT, 35);
  assert.ok(w4.includes('"spT" = 99 is outside 10–35: set to 35.'));
  assert.ok(w4.includes('Unknown setting "bogus" is ignored.'));

  // Merge over base with a given volume
  const { room: room5 } = mgr.create({ name: 'E', volume: 200, vent: 'supply', settings: { crop: 'pink' } });
  const v5 = db.currentSettings(room5.id);
  assert.equal(v5.settings.roomM3, 200);
  assert.equal(v5.settings.crop, 'pink');

  // Given roomM3 wins
  const { room: room6 } = mgr.create({ name: 'F', volume: 60, vent: 'supply', settings: { roomM3: 150 } });
  const v6 = db.currentSettings(room6.id);
  assert.equal(v6.settings.roomM3, 150);

  // Name stored trimmed
  const { room: room7 } = mgr.create({ name: '  Trimmed  ', volume: 60, vent: 'supply' });
  assert.equal(db.getRoom(room7.id).name, 'Trimmed');
});

test('Errors: create input', () => {
  const { db, mgr } = setup();
  const before = db.listRooms({ includeArchived: true }).length;

  function expectError(input, texts) {
    try {
      mgr.create(input);
      assert.fail('expected a RoomError');
    } catch (err) {
      assert.equal(err.name, 'RoomError');
      assert.equal(err.code, 'bad_input');
      assert.equal(err.message, 'Bad input');
      assert.ok(err instanceof roomsCommon.RoomError);
      for (const text of texts) assert.ok(err.details.includes(text), `missing: ${text} in ${JSON.stringify(err.details)}`);
    }
  }

  expectError({ name: '', volume: 60, vent: 'supply' }, ['name must be 1 to 60 characters']);
  expectError({ name: 'x'.repeat(61), volume: 60, vent: 'supply' }, ['name must be 1 to 60 characters']);
  expectError({ name: 'A', volume: 4.9, vent: 'supply' }, ['volume must be a number from 5 to 5000 (m³)']);
  expectError({ name: 'A', volume: NaN, vent: 'supply' }, ['volume must be a number from 5 to 5000 (m³)']);
  expectError({ name: 'A', volume: '60', vent: 'supply' }, ['volume must be a number from 5 to 5000 (m³)']);
  expectError({ name: 'A', volume: 60, vent: 'side' }, ['vent must be "supply" or "exhaust"']);
  expectError({ name: 'A', volume: 60, vent: 'supply', settings: [] }, ['settings must be an object']);
  expectError({ name: 'A', volume: 60, vent: 'supply', settings: null }, ['settings must be an object']);
  expectError({ name: 'A', volume: 60, vent: 'supply', settings: 5 }, ['settings must be an object']);

  // Several broken rules, all texts, in table order (C2 section 6.1)
  try {
    mgr.create({ name: '', volume: 4.9, vent: 'side' });
    assert.fail('expected a RoomError');
  } catch (err) {
    assert.deepStrictEqual(err.details, [
      'name must be 1 to 60 characters',
      'volume must be a number from 5 to 5000 (m³)',
      'vent must be "supply" or "exhaust"',
    ]);
  }

  assert.equal(db.listRooms({ includeArchived: true }).length, before);
});

// ---------------------------------------------------------------------------
// Task 4: Loop start (fresh), tick, Record, state save (C2 section 8.1 fresh, 8.2-8.4, 5.2, 5.3)
// ---------------------------------------------------------------------------

const READING_KEYS = ['room_id', 't', 'T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint', 'fog', 'fan', 'lights', 'circ', 'power_w', 'kwh'];

test('Recording', (t) => {
  const spy = simSpyFactory();
  const origCreate = CC.create;
  let capturedOnEvent = null;
  CC.create = (cfg, snapshot, onEvent) => {
    capturedOnEvent = onEvent;
    return origCreate(cfg, snapshot, onEvent);
  };
  t.after(() => { CC.create = origCreate; });

  const { db, mgr: mgr2, log, step, now } = setup(spy.factory);
  mgr2.start();

  const rowsAfterStart = db.queryReadings(1, { from: 0, to: now() });
  assert.equal(rowsAfterStart.length, 1);
  assert.equal(rowsAfterStart[0].t, T0);
  const stateAfterStart = db.loadControllerState(1);
  assert.equal(stateAfterStart.saved_at, T0);
  assert.notEqual(stateAfterStart.sim, null);
  const startedEvents = db.listEvents(1, { limit: 50 });
  assert.ok(startedEvents.some(e => e.text === 'Started'));

  step(30);
  const rowsAfter30 = db.queryReadings(1, { from: 0, to: now() });
  assert.equal(rowsAfter30.length, 2);
  const row = rowsAfter30[1];
  assert.equal(row.t, T0 + 30);
  assert.deepEqual(Object.keys(row).sort(), READING_KEYS.slice().sort());
  assert.equal(row.room_id, 1);

  const lastCmd = spy.writes[spy.writes.length - 1];
  assert.equal(row.ac_mode, lastCmd.ac.power ? lastCmd.ac.mode : 'off');
  assert.equal(row.ac_setpoint, lastCmd.ac.power ? lastCmd.ac.setpoint : null);
  assert.equal(row.fog, Math.min(3, Math.max(0, Math.round(lastCmd.hu.level || 0))));
  assert.equal(row.fan, Math.min(3, Math.max(0, Math.round(lastCmd.fan.level || 0))));
  assert.equal(row.lights, lastCmd.lights.on ? 1 : 0);
  assert.equal(row.circ, lastCmd.circ.on ? 1 : 0);

  const r = spy.made[0].a.io.read();
  const sumPower = Object.values(r.power).reduce((a, b) => a + b, 0);
  const sumKwh = Object.values(r.kwh).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(row.power_w - sumPower) < 1e-9);
  assert.ok(Math.abs(row.kwh - sumKwh) < 1e-9);

  const readingEmits = log.filter(([n]) => n === 'reading');
  const last = readingEmits[readingEmits.length - 1][1];
  assert.equal(last.roomId, 1);
  assert.deepEqual(last.live.reading, db.latestReading(1));

  const live = mgr2.get(1).live;
  assert.equal(live.running, true);
  assert.equal(live.error, null);
  assert.equal(live.stage, 'fruiting');
  assert.equal(live.crop, 'oyster');
  assert.equal(live.targets.T, 25);
  assert.equal(typeof live.targets.RH, 'number');
  assert.equal(live.targets.CO2, 1000);
  for (const k of ['T', 'RH', 'CO2']) {
    assert.equal(typeof live.status[k].lvl, 'string');
    assert.equal(typeof live.status[k].icon, 'string');
    assert.equal(typeof live.status[k].text, 'string');
  }

  // Controller events become rows: an event queued by the controller before the next Record is written
  // through db.addEvent and emitted (C2 section 8.3, step d).
  assert.ok(capturedOnEvent);
  capturedOnEvent({ t: now(), lvl: 'info', text: 'Test controller event' });
  const eventEmitsBefore = log.filter(([n]) => n === 'event').length;
  step(30);
  assert.ok(db.listEvents(1, { limit: 50 }).some(e => e.text === 'Test controller event'));
  const eventEmits = log.filter(([n]) => n === 'event');
  assert.ok(eventEmits.length > eventEmitsBefore);
  assert.ok(eventEmits.some(([, p]) => p.event.text === 'Test controller event'));
});

test('Rounded humidity target', () => {
  let clock = T0;
  const now = () => clock;
  const db = openFakeDb({ now });
  const spy = simSpyFactory();
  const mgr = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: spy.factory });
  mgr.start();
  for (let i = 0; i < 90; i++) { clock += 1; mgr.tick(); }
  const x = mgr.get(1).live.targets.RH;
  assert.ok(Math.abs(x * 10 - Math.round(x * 10)) < 1e-9);

  const { room } = mgr.create({ name: 'RH', volume: 60, vent: 'supply', settings: { humMode: 'rh' } });
  assert.equal(mgr.get(room.id).live.targets.RH, 88);
});

test('Catch-up', () => {
  const spy = simSpyFactory();
  const { db, mgr: mgr2, jump, now } = setup(spy.factory);
  mgr2.start();
  jump(300);
  const rows = db.queryReadings(1, { from: 0, to: now() });
  // 1 at start + 10 more from the 300 s jump
  assert.equal(rows.length, 11);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].t - rows[i - 1].t, 30);
  assert.equal(rows[rows.length - 1].t, now());
});

test('Gap', () => {
  const spy = simSpyFactory();
  const { db, mgr: mgr2, jump, step, now } = setup(spy.factory);
  mgr2.start();
  const before = db.queryReadings(1, { from: 0, to: now() });
  jump(301);
  const afterGap = db.queryReadings(1, { from: 0, to: now() });
  assert.equal(afterGap.length, before.length);
  let found = false;
  for (let i = 0; i < 30; i++) {
    step(1);
    const rows = db.queryReadings(1, { from: 0, to: now() });
    if (rows.length > afterGap.length) {
      const newRow = rows[rows.length - 1];
      assert.ok(newRow.t > before[before.length - 1].t);
      assert.ok(newRow.t <= now());
      found = true;
      break;
    }
  }
  assert.ok(found);
});

test('Periodic save', () => {
  const spy = simSpyFactory();
  const { db, mgr: mgr2, step } = setup(spy.factory);
  mgr2.start();
  assert.equal(db.loadControllerState(1).saved_at, T0);
  step(299);
  assert.equal(db.loadControllerState(1).saved_at, T0);
  step(1);
  assert.equal(db.loadControllerState(1).saved_at, T0 + 300);
});

test('Block count', () => {
  let clock = T0;
  const now = () => clock;
  const db = openFakeDb({ now });
  const spy = simSpyFactory();
  const mgr = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: spy.factory });
  const { room: a } = mgr.create({ name: 'A', volume: 60, vent: 'supply' });
  const { room: b } = mgr.create({ name: 'B', volume: 60, vent: 'supply' });
  const { room: c } = mgr.create({ name: 'C', volume: 60, vent: 'supply' });
  db.replaceMix(a.id, [{ crop: 'oyster', blocks: 300 }, { crop: 'golden', blocks: 200 }]);
  db.replaceMix(c.id, [{ crop: 'oyster', blocks: 0 }]);
  mgr.start();
  const byRoom = new Map(spy.made.map(m => [m.args.room.id, m.args.blocks]));
  assert.equal(byRoom.get(a.id), 500);
  assert.equal(byRoom.get(b.id), null);
  assert.equal(byRoom.get(c.id), null);
});

test('list and get', () => {
  const { db, mgr } = setup();
  mgr.create({ name: 'A', volume: 60, vent: 'supply' });
  mgr.create({ name: 'B', volume: 60, vent: 'supply' });
  const list = mgr.list();
  assert.deepEqual(list.map(r => r.id), [1, 2]);
  for (const r of list) assert.ok('live' in r);

  assert.equal(mgr.get(1.5), null);
  assert.equal(mgr.get('1'), null);
  assert.equal(mgr.get(999), null);
});

test('create on a started manager', () => {
  const { db, mgr, log, step, now } = setup();
  mgr.start(); // creates the demo room (id 1)
  log.length = 0;
  const { room } = mgr.create({ name: 'Live', volume: 60, vent: 'supply' });
  const names = log.map(([n]) => n);
  assert.deepEqual(names, ['settings', 'event', 'event', 'reading', 'room']);
  assert.equal(log[1][1].event.text, 'Room created');
  assert.equal(log[2][1].event.text, 'Started');

  const before = db.queryReadings(room.id, { from: 0, to: now() }).length;
  step(30);
  const after = db.queryReadings(room.id, { from: 0, to: now() }).length;
  assert.ok(after > before);
});

// ---------------------------------------------------------------------------
// Task 5: Controller events and alarms (C2 section 10, 8.2 Record b and c)
// ---------------------------------------------------------------------------

test('Alarms', () => {
  const s = scripted();
  const { db, mgr, log, step, now } = setup(s.factory);
  s.knobs.values = { RH: null };
  mgr.start(); // reading 1 (bad RH, count 1)
  log.length = 0;
  step(30); // reading 2 (count 2)
  step(30); // reading 3 (count 3) -> raises sensor_RH

  const alarmRows = db.listAlarms(1, { recent: 10 });
  const raised = alarmRows.find(a => a.alarm_key === 'sensor_RH');
  assert.ok(raised);
  assert.equal(raised.level, 'serious');
  assert.equal(raised.label, 'Room humidity sensor fault: no reading');
  const expectedT = now();
  assert.equal(raised.raised_at, expectedT);

  const raisedEmit = log.find(([n, p]) => n === 'alarm' && p.change === 'raised');
  assert.ok(raisedEmit);
  assert.deepEqual(raisedEmit[1].alarm, raised);

  const alarmEvent = db.listEvents(1, { limit: 50 }).find(e => e.text === `Alarm: ${raised.label}`);
  assert.ok(alarmEvent);
  assert.equal(alarmEvent.t, expectedT);
  assert.equal(alarmEvent.level, 'serious');

  assert.equal(mgr.get(1).live.alarms, 1);

  s.knobs.values = {};
  step(30);
  const cleared = db.listAlarms(1, { recent: 10 }).find(a => a.alarm_key === 'sensor_RH' && a.cleared_at !== null);
  assert.ok(cleared);
  assert.equal(cleared.cleared_at, now());
  const clearedEmit = log.find(([n, p]) => n === 'alarm' && p.change === 'cleared');
  assert.ok(clearedEmit);
  assert.equal(mgr.get(1).live.alarms, 0);

  log.length = 0;
  const acked = mgr.ackAlarm(1, 'sensor_RH');
  assert.equal(acked.acked_at, now());
  const ackedEmits = log.filter(([n, p]) => n === 'alarm' && p.change === 'acked');
  assert.equal(ackedEmits.length, 1);
  const ackEvent = db.listEvents(1, { limit: 50 })[0];
  assert.equal(ackEvent.text, 'Acknowledged: Room humidity sensor fault: no reading');

  log.length = 0;
  const acked2 = mgr.ackAlarm(1, 'sensor_RH');
  assert.deepEqual(acked2, acked);
  assert.equal(log.length, 0);
});

test('Alarms: ack every unacknowledged row', () => {
  const s = scripted();
  const { db, mgr, log, step } = setup(s.factory);
  s.knobs.values = { RH: null };
  mgr.start();
  step(30);
  step(30); // raise 1
  s.knobs.values = {};
  step(30); // clear 1
  s.knobs.values = { RH: null };
  step(30);
  step(30);
  step(30); // raise 2 (new row)

  log.length = 0;
  const latest = mgr.ackAlarm(1, 'sensor_RH');
  const ackedEmits = log.filter(([n, p]) => n === 'alarm' && p.change === 'acked');
  assert.equal(ackedEmits.length, 2);
  const openRows = db.listAlarms(1, { recent: 10 }).filter(a => a.alarm_key === 'sensor_RH');
  const newest = openRows.reduce((a, b) => (b.id > a.id ? b : a));
  assert.deepEqual(latest, newest);
});

test('Alarms: bad keys', () => {
  const { mgr } = setup();
  mgr.start();
  try {
    mgr.ackAlarm(1, 'nope');
    assert.fail('expected not_found');
  } catch (err) {
    assert.equal(err.code, 'not_found');
    assert.equal(err.message, 'No alarm "nope" in room 1');
    assert.deepEqual(err.details, []);
  }
  for (const bad of ['', 5]) {
    try {
      mgr.ackAlarm(1, bad);
      assert.fail('expected bad_input');
    } catch (err) {
      assert.equal(err.code, 'bad_input');
      assert.deepEqual(err.details, ['alarmKey must be a non-empty string']);
    }
  }
  try {
    mgr.ackAlarm(999, 'x');
    assert.fail('expected not_found');
  } catch (err) {
    assert.equal(err.code, 'not_found');
    assert.equal(err.message, 'Room 999 not found');
  }
});

test('Alarms: state saved after ack', () => {
  const s = scripted();
  const { db, mgr, step } = setup(s.factory);
  s.knobs.values = { RH: null };
  mgr.start();
  step(30);
  step(30);
  mgr.ackAlarm(1, 'sensor_RH');
  const state = db.loadControllerState(1);
  assert.equal(state.controller.alarms.sensor_RH.acked, true);
});

test('No frozen CO₂', () => {
  const { db, mgr, jump } = setup();
  mgr.start();
  const { room } = mgr.create({ name: 'Circ', volume: 60, vent: 'supply', settings: { manual: { circ: { auto: false, on: true } } } });
  for (let i = 0; i < 144; i++) jump(300); // 12 h
  const co2Alarms = db.listAlarms(room.id, { recent: 500 }).filter(a => a.alarm_key === 'sensor_CO2');
  assert.equal(co2Alarms.length, 0);
  const frozenEvents = db.listEvents(room.id, { limit: 1000 }).filter(e => e.text.includes('value does not change (frozen)'));
  assert.equal(frozenEvents.length, 0);
});

// ---------------------------------------------------------------------------
// Task 6: stop() and resume (C2 section 4 stop, 8.1 resumed path)
// ---------------------------------------------------------------------------

test('Resume: sim room', () => {
  let clock = T0;
  const now = () => clock;
  const db = openFakeDb({ now });
  const spy1 = simSpyFactory();
  const mgr1 = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: spy1.factory });
  const log1 = [];
  mgr1.on('room', p => log1.push(p));
  mgr1.start();
  for (let i = 0; i < 90; i++) { clock += 1; mgr1.tick(); }
  const viewBeforeStop = spy1.made[0].a.view();

  log1.length = 0;
  mgr1.stop();
  const state = db.loadControllerState(1);
  assert.equal(state.saved_at, now());
  assert.ok(db.listEvents(1, { limit: 50 }).some(e => e.text === 'Stopped'));
  assert.equal(log1.length, 0);
  const rowCountAfterStop = db.queryReadings(1, { from: 0, to: now() }).length;
  mgr1.tick();
  assert.equal(db.queryReadings(1, { from: 0, to: now() }).length, rowCountAfterStop);

  clock += 600;
  const spy2 = simSpyFactory();
  const mgr2 = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: spy2.factory });
  const log2 = [];
  mgr2.on('event', p => log2.push(p));
  const rowsBefore = db.queryReadings(1, { from: 0, to: now() });
  mgr2.start();
  assert.ok(log2.some(p => p.event.text === 'Resumed after 10 min stopped'));
  assert.equal(db.queryReadings(1, { from: 0, to: now() }).length, rowsBefore.length);
  assert.deepEqual(mgr2.get(1).live.reading, db.latestReading(1));
  const viewAfterResume = spy2.made[0].a.view();
  assert.equal(viewAfterResume.T, viewBeforeStop.T);
  assert.equal(viewAfterResume.RH, viewBeforeStop.RH);
  assert.equal(viewAfterResume.CO2, viewBeforeStop.CO2);

  const lastBeforeT = rowsBefore[rowsBefore.length - 1].t;
  for (let i = 0; i < 30; i++) { clock += 1; mgr2.tick(); }
  const rowsAfter = db.queryReadings(1, { from: 0, to: now() });
  assert.equal(rowsAfter.length, rowsBefore.length + 1);
  assert.ok(rowsAfter[rowsAfter.length - 1].t > lastBeforeT);

  assert.equal(mgr2.get(1).live.stage, 'fruiting');
});

test('Resume: alarms carry on', () => {
  const s = scripted();
  let clock = T0;
  const now = () => clock;
  const db = openFakeDb({ now });
  const mgr1 = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: s.factory });
  s.knobs.values = { RH: null };
  mgr1.start();
  clock += 30; mgr1.tick();
  clock += 30; mgr1.tick(); // raises sensor_RH
  assert.equal(mgr1.get(1).live.alarms, 1);
  mgr1.stop();

  const rowsBefore = db.queryReadings(1, { from: 0, to: now() }).length;
  const log2 = [];
  const mgr2 = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: s.factory });
  mgr2.on('alarm', p => log2.push(p));
  mgr2.start();
  assert.equal(db.queryReadings(1, { from: 0, to: now() }).length, rowsBefore);
  assert.equal(log2.filter(p => p.change === 'raised').length, 0);
  assert.equal(mgr2.get(1).live.alarms, 1);

  // RH is still null after resume: the next reading (where a re-raise would actually happen in
  // syncAlarms) must not add a second sensor_RH row or re-raise the alarm.
  clock += 30; mgr2.tick();
  assert.equal(log2.filter(p => p.change === 'raised').length, 0);
  assert.equal(db.listAlarms(1, { recent: 10 }).filter(a => a.alarm_key === 'sensor_RH').length, 1);
  assert.equal(mgr2.get(1).live.alarms, 1);
});

test('Resume: alarm cleared while stopped', () => {
  const s = scripted();
  let clock = T0;
  const now = () => clock;
  const db = openFakeDb({ now });
  const mgr1 = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: s.factory });
  s.knobs.values = { RH: null };
  mgr1.start();
  clock += 30; mgr1.tick();
  clock += 30; mgr1.tick();
  assert.equal(mgr1.get(1).live.alarms, 1);
  mgr1.stop();

  s.knobs.values = {};
  const log2 = [];
  const mgr2 = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: s.factory });
  mgr2.on('alarm', p => log2.push(p));
  mgr2.start();
  clock += 30; mgr2.tick();
  assert.ok(log2.some(p => p.change === 'cleared'));
  assert.equal(mgr2.get(1).live.alarms, 0);
});

test('One reading shape', () => {
  let clock = T0;
  const now = () => clock;
  const db = openFakeDb({ now });
  const spy1 = simSpyFactory();
  const mgr1 = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: spy1.factory });
  mgr1.start();
  mgr1.stop();

  const mgr2 = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: rooms.defaultAdapterFactory });
  mgr2.start();
  const live = mgr2.get(1).live;
  const expected = db.queryReadings(1, { from: 0, to: now() }).at(-1);
  assert.deepEqual(live.reading, expected);
  assert.deepEqual(Object.keys(live.reading).sort(), READING_KEYS.slice().sort());
  mgr2.stop();

  clock += 3601;
  const mgr3 = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: rooms.defaultAdapterFactory });
  mgr3.start();
  assert.equal(mgr3.get(1).live.reading, null);
});

// ---------------------------------------------------------------------------
// Task 7: Room summary (C2 section 7 room rules, 8.2 step 4)
// ---------------------------------------------------------------------------

test('Room summary', () => {
  const s = scripted();
  const { mgr, log, step, jump } = setup(s.factory);
  mgr.start();
  log.length = 0;
  step(1); // no new reading
  assert.equal(log.filter(([n]) => n === 'room').length, 0);
  step(30); // a new reading, but no summary change
  assert.equal(log.filter(([n]) => n === 'room').length, 0);

  log.length = 0;
  s.knobs.values = { RH: null };
  step(30); // bad count 1
  step(30); // bad count 2
  step(30); // bad count 3 -> raises sensor_RH
  const raiseRoomEmits = log.filter(([n]) => n === 'room');
  assert.equal(raiseRoomEmits.length, 1);
  assert.equal(raiseRoomEmits[0][1].room.live.alarms, 1);
  s.knobs.values = {};

  const { room } = mgr.create({ name: 'Auto', volume: 60, vent: 'supply', settings: { program: { auto: true, days: { fruiting: 1 } } } });
  log.length = 0;
  jump(86400);
  const stageRoomEmits = log.filter(([n, p]) => n === 'room' && p.room.id === room.id);
  assert.equal(stageRoomEmits.length, 1);
  assert.equal(stageRoomEmits[0][1].room.live.stage, 'rest');

  const statusBefore = mgr.get(room.id).live.status.T.text;
  const co2Before = mgr.get(room.id).live.targets.CO2;
  log.length = 0;
  step(300); // ramp moves the targets, no room
  assert.equal(log.filter(([n, p]) => n === 'room' && p.room.id === room.id).length, 0);
  const co2After = mgr.get(room.id).live.targets.CO2;
  assert.notEqual(co2After, co2Before);

  log.length = 0;
  s.knobs.values.T = 26.5;
  step(30); step(30); step(30); // the sensor spike filter needs 3 consistent readings before it accepts the jump
  assert.equal(log.filter(([n, p]) => n === 'room' && p.room.id === room.id).length, 0);
  assert.notEqual(mgr.get(room.id).live.status.T.text, statusBefore);
});

// ---------------------------------------------------------------------------
// Task 8: Crashes, restart, ack while crashed (C2 section 11, 4 restart, 8.1/8.2)
// ---------------------------------------------------------------------------

function newEventTextsSince(db, roomId, beforeId) {
  return db.listEvents(roomId, { limit: 1000 }).filter(e => e.id > beforeId).reverse().map(e => e.text);
}
function maxEventId(db, roomId) {
  const rows = db.listEvents(roomId, { limit: 1 });
  return rows.length ? rows[0].id : 0;
}

test('Crash isolation', () => {
  const sa = scripted(), sb = scripted();
  const factory = args => (args.room.name === 'A' ? sa.factory(args) : sb.factory(args));
  const { db, mgr, log, step, now } = setup(factory);
  mgr.create({ name: 'A', volume: 60, vent: 'supply' });
  mgr.create({ name: 'B', volume: 60, vent: 'supply' });
  mgr.start();
  const savedBeforeA = db.loadControllerState(1).saved_at;

  sa.knobs.failRead = true;
  log.length = 0;
  step(1);
  const a = mgr.get(1);
  assert.equal(a.live.running, false);
  assert.equal(a.live.error, 'sensor bus down');
  const ev = db.listEvents(1, { limit: 50 }).find(e => e.text === 'Stopped by an error: sensor bus down');
  assert.ok(ev);
  assert.equal(ev.level, 'serious');
  assert.ok(log.some(([n, p]) => n === 'room' && p.room.id === 1));
  assert.equal(db.loadControllerState(1).saved_at, savedBeforeA);

  const bRowsBefore = db.queryReadings(2, { from: 0, to: now() }).length;
  const aRowsBefore = db.queryReadings(1, { from: 0, to: now() }).length;
  step(30);
  assert.ok(db.queryReadings(2, { from: 0, to: now() }).length > bRowsBefore);
  assert.equal(db.queryReadings(1, { from: 0, to: now() }).length, aRowsBefore);
});

test('Crash at loop start', () => {
  const { db, mgr, step, now } = setup();
  db.createRoom({ name: 'Bad', volume: 60, vent: 'supply', adapter: 'hw', settings: CC.defaultSettings(), note: 'Created', at: now() });
  mgr.create({ name: 'Good', volume: 60, vent: 'supply' });
  mgr.start();
  const bad = mgr.get(1);
  assert.equal(bad.live.running, false);
  assert.equal(bad.live.error, 'Unknown adapter "hw"');
  assert.equal(bad.live.stage, 'fruiting');
  assert.equal(bad.live.targets, null);
  assert.equal(bad.live.status, null);
  assert.ok(db.listEvents(1, { limit: 50 }).some(e => e.text === 'Stopped by an error: Unknown adapter "hw"'));

  const before = db.queryReadings(2, { from: 0, to: now() }).length;
  step(30);
  assert.ok(db.queryReadings(2, { from: 0, to: now() }).length > before);
});

test('Restart', () => {
  const s = scripted();
  const { db, mgr, log, step, now } = setup(s.factory);
  mgr.start();
  step(30);
  s.knobs.failRead = true;
  step(1); // crash
  assert.equal(mgr.get(1).live.running, false);

  s.knobs.failRead = false;
  const beforeRestartId = maxEventId(db, 1);
  const rowsBeforeCrashRestart = db.queryReadings(1, { from: 0, to: now() });
  log.length = 0;
  const restarted = mgr.restart(1);
  assert.equal(restarted.live.running, true);
  assert.equal(restarted.live.error, null);
  const textsAfterCrashRestart = newEventTextsSince(db, 1, beforeRestartId);
  assert.ok(!textsAfterCrashRestart.includes('Stopped'));
  assert.ok(log.some(([n]) => n === 'room'));

  // Resumed from the last save: no reading is repeated or lost, and the live reading matches the resume
  // point, exactly as a resume across managers does (the "Resume" tests).
  assert.equal(db.queryReadings(1, { from: 0, to: now() }).length, rowsBeforeCrashRestart.length);
  assert.deepEqual(mgr.get(1).live.reading, rowsBeforeCrashRestart.at(-1));
  const lastTBeforeCrashRestart = rowsBeforeCrashRestart.at(-1).t;
  step(30);
  const rowsAfterCrashRestart = db.queryReadings(1, { from: 0, to: now() });
  assert.equal(rowsAfterCrashRestart.length, rowsBeforeCrashRestart.length + 1);
  assert.ok(rowsAfterCrashRestart.at(-1).t > lastTBeforeCrashRestart);

  // Running room restart: Stopped, then Resumed after 0 min stopped.
  const beforeRunningRestartId = maxEventId(db, 1);
  const savedBeforeRunningRestart = db.loadControllerState(1).saved_at;
  const rowsBeforeRunningRestart = db.queryReadings(1, { from: 0, to: now() });
  mgr.restart(1);
  const textsAfterRunningRestart = newEventTextsSince(db, 1, beforeRunningRestartId);
  assert.ok(textsAfterRunningRestart.includes('Stopped'));
  assert.ok(textsAfterRunningRestart.some(t => t.startsWith('Resumed after 0 min stopped')));

  // The running room's state is saved (at now()) right before the stop, and the new loop resumes from it:
  // no reading repeated or lost, and the sim continues forward from there.
  assert.equal(db.loadControllerState(1).saved_at, now());
  assert.notEqual(db.loadControllerState(1).saved_at, savedBeforeRunningRestart);
  assert.equal(db.queryReadings(1, { from: 0, to: now() }).length, rowsBeforeRunningRestart.length);
  assert.deepEqual(mgr.get(1).live.reading, rowsBeforeRunningRestart.at(-1));
  const lastTBeforeRunningRestart = rowsBeforeRunningRestart.at(-1).t;
  step(30);
  const rowsAfterRunningRestart = db.queryReadings(1, { from: 0, to: now() });
  assert.equal(rowsAfterRunningRestart.length, rowsBeforeRunningRestart.length + 1);
  assert.ok(rowsAfterRunningRestart.at(-1).t > lastTBeforeRunningRestart);

  // Archived
  const { room: archRoom } = mgr.create({ name: 'Arch', volume: 60, vent: 'supply' });
  mgr.archive(archRoom.id);
  try {
    mgr.restart(archRoom.id);
    assert.fail('expected bad_input');
  } catch (err) {
    assert.equal(err.code, 'bad_input');
    assert.deepEqual(err.details, [`room ${archRoom.id} is archived`]);
  }

  // Unknown id
  try {
    mgr.restart(999);
    assert.fail('expected not_found');
  } catch (err) {
    assert.equal(err.code, 'not_found');
  }
});

test('Ack while crashed', () => {
  const s = scripted();
  const { db, mgr, step, jump } = setup(s.factory);
  s.knobs.values = { RH: null };
  mgr.start(); // reading 1, bad count 1
  step(30); // reading 2, bad count 2
  step(30); // reading 3, bad count 3 -> raises
  assert.equal(mgr.get(1).live.alarms, 1);

  jump(300 - 60); // advance to the next periodic save boundary (T0 + 300)
  assert.equal(db.loadControllerState(1).saved_at, T0 + 300);

  s.knobs.failRead = true;
  step(1); // crash
  assert.equal(mgr.get(1).live.running, false);

  const savedBeforeAck = db.loadControllerState(1).saved_at;
  const acked = mgr.ackAlarm(1, 'sensor_RH');
  assert.equal(db.loadControllerState(1).saved_at, savedBeforeAck);
  assert.notEqual(acked.acked_at, null);
  const ackedRow = db.listAlarms(1, { recent: 10 }).find(a => a.alarm_key === 'sensor_RH');
  assert.notEqual(ackedRow.acked_at, null);

  s.knobs.failRead = false;
  mgr.restart(1);
  mgr.stop();
  assert.equal(db.loadControllerState(1).controller.alarms.sensor_RH.acked, true);
});

// ---------------------------------------------------------------------------
// Task 9: Database errors and the timer (C2 section 11, 3 tickMs)
// ---------------------------------------------------------------------------

test('Database error', () => {
  const s = scripted();
  const { db, mgr, log, step } = setup(s.factory);
  mgr.start();
  const dbErr = Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10, errstr: 'disk I/O error' });
  const origInsert = db.insertReading;
  db.insertReading = () => { throw dbErr; };
  log.length = 0;
  step(30);
  const fatalEmits = log.filter(([n]) => n === 'fatal');
  assert.equal(fatalEmits.length, 1);
  assert.equal(fatalEmits[0][1].error, dbErr);

  const readsBefore = s.knobs.reads;
  log.length = 0;
  mgr.tick();
  assert.equal(s.knobs.reads, readsBefore);
  assert.equal(log.length, 0);

  db.insertReading = origInsert;
});

test('Database error: halted rooms stay halted (no state save, no Stopped) after fatal', () => {
  // C2 section 11: a fatal halts every room, with no state save tried. Methods that gate a state save
  // (and, for stop/restart/archive, the "Stopped" event) on a loop's "running" flag must see every loop
  // as not running once a fatal has happened, not just the room whose tick actually threw.
  const s = scripted();
  const { db, mgr, log, step } = setup(s.factory);
  mgr.start();
  mgr.create({ name: 'B', volume: 60, vent: 'supply' });

  const dbErr = Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10, errstr: 'disk I/O error' });
  const origInsert = db.insertReading;
  db.insertReading = () => { throw dbErr; };
  step(30);
  db.insertReading = origInsert;

  assert.equal(mgr.get(1).live.running, false);
  assert.equal(mgr.get(2).live.running, false);

  const saved1 = db.loadControllerState(1).saved_at;
  const saved2 = db.loadControllerState(2).saved_at;

  // applySettings on a halted room must not try a state save.
  mgr.applySettings(1, { spT: 20 });
  assert.equal(db.loadControllerState(1).saved_at, saved1);

  // stop() must not save state or write "Stopped" for any halted room.
  log.length = 0;
  mgr.stop();
  assert.equal(db.loadControllerState(1).saved_at, saved1);
  assert.equal(db.loadControllerState(2).saved_at, saved2);
  assert.ok(!db.listEvents(1, { limit: 10 }).some(e => e.text === 'Stopped'));
  assert.ok(!db.listEvents(2, { limit: 10 }).some(e => e.text === 'Stopped'));
});

test('Database error in a method', () => {
  const s = scripted();
  const { db, mgr, log } = setup(s.factory);
  mgr.start();
  const dbErr = Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10, errstr: 'disk I/O error' });
  const origSave = db.saveSettings;
  db.saveSettings = () => { throw dbErr; };
  log.length = 0;
  assert.throws(() => mgr.applySettings(1, { spT: 20 }), err => err === dbErr);
  assert.equal(log.filter(([n]) => n === 'fatal').length, 0);
  db.saveSettings = origSave;
});

test('Database error during applySettings step 10 (running room)', () => {
  // C2 section 9.2's "Error in steps 5-9" row only covers the controller/cfg work; step 10's db writes
  // (flushPendingEvents, the "Targets restored" event, syncAlarms) are a db error inside a method
  // (section 11): it must reach the caller, not be swallowed as a room crash.
  const s = scripted();
  const { db, mgr, log } = setup(s.factory);
  mgr.start();
  const A = mgr.applySettings(1, { spT: 23 }).version;
  mgr.applySettings(1, { stage: 'pinning' });

  const dbErr = Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10, errstr: 'disk I/O error' });
  const origAddEvent = db.addEvent;
  db.addEvent = (id, ev) => {
    if (ev.text && ev.text.startsWith('Targets restored')) throw dbErr;
    return origAddEvent(id, ev);
  };
  log.length = 0;
  assert.throws(() => mgr.applySettings(1, A.settings, `Restored version ${A.id}`, { exact: true }), err => err === dbErr);
  assert.equal(mgr.get(1).live.running, true);
  assert.equal(mgr.get(1).live.error, null);
  assert.equal(log.filter(([n]) => n === 'fatal').length, 0);
  assert.ok(!log.some(([n, p]) => n === 'event' && p.event && p.event.text && p.event.text.startsWith('Stopped by an error')));
  db.addEvent = origAddEvent;
});

test('Timer', async () => {
  const s = scripted();
  const db = openFakeDb({ now: () => T0 });
  const mgr = rooms.createRoomManager({ db, now: () => T0, tickMs: 10, adapterFactory: s.factory });
  mgr.start();
  await new Promise(r => setTimeout(r, 100));
  assert.ok(s.knobs.reads > 0);
  mgr.stop();
  const readsAfterStop = s.knobs.reads;
  await new Promise(r => setTimeout(r, 50));
  assert.equal(s.knobs.reads, readsAfterStop);

  // The timer also stops after a fatal. Use a clock compressed to 10 ms "seconds" so the scripted
  // adapter's 30 s sensor period (and so a real db call from Record) happens within a short real wait.
  const compressedNow = () => Math.floor(Date.now() / 10);
  const s2 = scripted();
  const db2 = openFakeDb({ now: compressedNow });
  const mgr2 = rooms.createRoomManager({ db: db2, now: compressedNow, tickMs: 10, adapterFactory: s2.factory });
  let fatalSeen = false;
  mgr2.on('fatal', () => { fatalSeen = true; });
  mgr2.start();
  const dbErr = Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10, errstr: 'disk I/O error' });
  db2.insertReading = () => { throw dbErr; };
  await new Promise(r => setTimeout(r, 600));
  assert.ok(fatalSeen);
  const readsAfterFatal = s2.knobs.reads;
  await new Promise(r => setTimeout(r, 50));
  assert.equal(s2.knobs.reads, readsAfterFatal);
});

// ---------------------------------------------------------------------------
// Task 10: applySettings basics (C2 section 9.1, 9.2 steps 1-4 and 10-13)
// ---------------------------------------------------------------------------

test('Settings at once', () => {
  const spy = simSpyFactory();
  const { db, mgr, log, step, now } = setup(spy.factory);
  mgr.start();
  step(600); // T0 + 600: the room has been running a while, not just at the moment it started
  const rowBefore = db.queryReadings(1, { from: 0, to: 10 ** 12 }).at(-1);

  log.length = 0;
  const result = mgr.applySettings(1, { spT: 20 }, '  colder  ');
  assert.deepEqual(result.warnings, []);
  assert.equal(result.version.note, 'colder');
  assert.equal(result.settings.spT, 20);
  assert.equal(spy.made[0].args.cfg.spT, 20);

  const ev = db.listEvents(1, { limit: 50 }).find(e => e.text === `Settings saved (version ${result.version.id}): colder`);
  assert.ok(ev);
  assert.equal(db.loadControllerState(1).saved_at, now());

  const settingsEmit = log.find(([n]) => n === 'settings');
  assert.ok(settingsEmit);
  assert.equal(settingsEmit[1].auto, false);
  assert.deepEqual(settingsEmit[1].warnings, []);

  step(30); // the next reading, 30 s after the last (the sensor period): the controller's trim has not drifted
  const newRow = db.queryReadings(1, { from: 0, to: 10 ** 12 }).at(-1);
  assert.notEqual(newRow.t, rowBefore.t);
  assert.equal(newRow.ac_setpoint, 20);
});

test('Partial merge', () => {
  const { db, mgr } = setup();
  mgr.start();
  const before = db.currentSettings(1).settings;
  const result = mgr.applySettings(1, { spT: 20 });
  const after = db.currentSettings(1).settings;
  for (const k of Object.keys(before)) {
    if (k === 'spT') assert.equal(after.spT, 20);
    else assert.deepEqual(after[k], before[k], `key ${k} should be unchanged`);
  }

  const base = { a: { b: 1 } };
  const input = { a: { c: 2 } };
  const { settings: merged } = roomsCommon.cleanSettings(input, base);
  assert.notEqual(merged, base);
  assert.notEqual(merged, input);
  assert.notEqual(merged.a, base.a);
  assert.notEqual(merged.a, input.a);
});

test('Whole machine levels', () => {
  const { db, mgr, step } = setup();
  mgr.start();
  const { room: a } = mgr.create({ name: 'A', volume: 60, vent: 'supply' });
  const { room: b } = mgr.create({ name: 'B', volume: 60, vent: 'supply' });
  mgr.applySettings(a.id, { manual: { hu: { auto: false, level: 1.5 } } });
  mgr.applySettings(b.id, { rules: { baseFan: { fruiting: 5 }, rhLock: false } });

  const fatalLog = [];
  mgr.on('fatal', p => fatalLog.push(p));
  step(30);

  const rowA = db.queryReadings(a.id, { from: 0, to: 10 ** 12 }).at(-1);
  const rowB = db.queryReadings(b.id, { from: 0, to: 10 ** 12 }).at(-1);
  assert.equal(rowA.fog, 2);
  assert.equal(rowB.fan, 3);
  assert.equal(fatalLog.length, 0);
});

test('Settings: warnings and stopped rooms', () => {
  const s = scripted();
  const { db, mgr } = setup(s.factory);
  mgr.start();

  const result = mgr.applySettings(1, { spRH: 120 });
  assert.ok(result.warnings.includes('"spRH" = 120 is outside 40–99: set to 99.'));
  assert.equal(db.currentSettings(1).settings.spRH, 99);

  // A crashed room stores the version (stored = next) with no state save.
  s.knobs.failRead = true;
  mgr.tick();
  assert.equal(mgr.get(1).live.running, false);
  const savedBefore = db.loadControllerState(1).saved_at;
  const result2 = mgr.applySettings(1, { spT: 18 });
  assert.equal(result2.settings.spT, 18);
  assert.equal(db.loadControllerState(1).saved_at, savedBefore);

  const expectErr = (fn, code, details) => {
    try { fn(); assert.fail('expected an error'); } catch (err) {
      assert.equal(err.code, code);
      if (details) assert.deepEqual(err.details, details);
    }
  };
  expectErr(() => mgr.applySettings(1, { spT: 1 }, 'x'.repeat(201)), 'bad_input', ['note must be text of at most 200 characters']);
  expectErr(() => mgr.applySettings(1, null), 'bad_input', ['settings must be an object']);
  expectErr(() => mgr.applySettings(1, []), 'bad_input', ['settings must be an object']);

  const { room } = mgr.create({ name: 'Arch', volume: 60, vent: 'supply' });
  mgr.archive(room.id);
  expectErr(() => mgr.applySettings(room.id, { spT: 20 }), 'bad_input', [`room ${room.id} is archived`]);
  expectErr(() => mgr.applySettings(999, { spT: 20 }), 'not_found');

  const versionsBefore = db.settingsHistory(1).length;
  try { mgr.applySettings(1, { spT: 1 }, 'x'.repeat(201)); } catch (e) { /* expected */ }
  assert.equal(db.settingsHistory(1).length, versionsBefore);

  const r = mgr.applySettings(1, { spT: 19 }, '   ');
  assert.equal(r.version.note, null);
});

// ---------------------------------------------------------------------------
// Task 11: Targets, stages, ramps, automatic versions (C2 section 9.2 steps 5,6,8,9, 9.3)
// ---------------------------------------------------------------------------

test('Settings rules', () => {
  const s = scripted();
  const cap = capture(s.factory);
  const { db, mgr, log, jump, now } = setup(cap.factory);
  mgr.start();
  const cfg = cap.made[0].cfg;

  const result1 = mgr.applySettings(1, { stage: 'pinning' });
  assert.equal(db.loadControllerState(1).controller.stage.ramp.to.spT, 24);
  assert.equal(result1.version.settings.stage, 'pinning');
  assert.equal(result1.version.settings.spT, 25); // the ramp's "from" (fruiting) value, unmoved yet

  jump(3600); // a gap; an unrelated edit during the ramp does not stop it
  mgr.applySettings(1, { offsets: { T: 0.5 } });
  assert.notEqual(db.loadControllerState(1).controller.stage.ramp, null);

  jump(1800);
  const keep = {
    spRH: cfg.spRH, co2Lim: cfg.co2Lim, fanOn: cfg.rules.fanOn, fanOff: cfg.rules.fanOff,
    acOff: cfg.rules.acOff, acOn: cfg.rules.acOn, safetyAt: cfg.rules.co2SafetyAt,
  };
  mgr.applySettings(1, { spT: 20 });
  assert.equal(cfg.spT, 20);
  assert.equal(cfg.spRH, keep.spRH);
  assert.equal(cfg.co2Lim, keep.co2Lim);
  assert.equal(cfg.rules.fanOn, keep.fanOn);
  assert.equal(cfg.rules.fanOff, keep.fanOff);
  assert.equal(cfg.rules.acOff, keep.acOff);
  assert.equal(cfg.rules.acOn, keep.acOn);
  assert.equal(cfg.rules.co2SafetyAt, keep.safetyAt);
  assert.equal(db.loadControllerState(1).controller.stage.ramp, null);

  const { room } = mgr.create({ name: 'Ramp2', volume: 60, vent: 'supply' });
  mgr.applySettings(room.id, { stage: 'pinning' });
  log.length = 0;
  jump(4 * 3600 + 30);
  const versions = db.settingsHistory(room.id);
  const latest = versions[0];
  assert.equal(latest.note, 'Automatic: targets for Pinning reached');
  assert.ok(db.listEvents(room.id, { limit: 50 }).some(e => e.text === `Settings saved (version ${latest.id}): Automatic: targets for Pinning reached`));
  const autoEmit = log.find(([n, p]) => n === 'settings' && p.roomId === room.id && p.auto === true);
  assert.ok(autoEmit);
  assert.deepEqual(autoEmit[1].warnings, []);
  assert.equal(db.loadControllerState(room.id).saved_at, now());
});

test('Automatic stage version', () => {
  const s = scripted();
  const { db, mgr, jump, step } = setup(s.factory);
  mgr.start();
  mgr.applySettings(1, { program: { auto: true, days: { fruiting: 1 } } });
  jump(86400);
  const versions = db.settingsHistory(1);
  assert.equal(versions[0].note, 'Automatic: stage Rest between flushes');
  const countAfterStageChange = versions.length;
  step(30); step(30); step(30);
  assert.equal(db.settingsHistory(1).length, countAfterStageChange);
});

test('Crop and farm type', () => {
  const s = scripted();
  const { db, mgr } = setup(s.factory);
  mgr.start();
  const before1 = maxEventId(db, 1);
  mgr.applySettings(1, { crop: 'pink' });
  const texts1 = newEventTextsSince(db, 1, before1);
  assert.ok(texts1.some(t => t.startsWith('Stage: ')));
  assert.equal(db.currentSettings(1).settings.crop, 'pink');

  // Room 1 is still at the default stage ('fruiting'). "ready" is a valid farm type for "fruiting"
  // (C2 section 9.1), so this input (as the brief gives it) exercises setFarmType, not setStage or
  // setCrop, while leaving the stage itself unchanged -- the "Stage: " event and new farmType below are
  // proof applySettings called setFarmType.
  const before2 = maxEventId(db, 1);
  mgr.applySettings(1, { farmType: 'ready', stage: 'fruiting' });
  const texts2 = newEventTextsSince(db, 1, before2);
  assert.ok(texts2.some(t => t.startsWith('Stage: ')));
  assert.equal(db.currentSettings(1).settings.farmType, 'ready');

  // Step 10 (the Stage: event) is written before step 11 (Settings saved), for both the crop case above
  // and the farm-type case here.
  const stageIdx2 = texts2.findIndex(t => t.startsWith('Stage: '));
  const savedIdx2 = texts2.findIndex(t => t.startsWith('Settings saved'));
  assert.ok(stageIdx2 !== -1 && savedIdx2 !== -1 && stageIdx2 < savedIdx2);
  const stageIdx1 = texts1.findIndex(t => t.startsWith('Stage: '));
  const savedIdx1 = texts1.findIndex(t => t.startsWith('Settings saved'));
  assert.ok(stageIdx1 !== -1 && savedIdx1 !== -1 && stageIdx1 < savedIdx1);
});

// ---------------------------------------------------------------------------
// Task 12: Pair corrections (C2 section 9.2 step 7)
// ---------------------------------------------------------------------------

test('Pair correction', () => {
  const s = scripted();
  const cap = capture(s.factory);
  const { db, mgr, jump } = setup(cap.factory);
  mgr.start();
  mgr.applySettings(1, { crop: 'golden', stage: 'pinning' });
  jump(14256); // f = 0.99 along the ramp: live fanOn 600, fanOff 450
  const result = mgr.applySettings(1, { rules: { fanOff: 800 } });
  assert.equal(result.settings.rules.fanOff, 550);
  assert.equal(result.settings.rules.fanOn, 600);
  assert.deepEqual(result.warnings, ['"rules.fanOff" = 800 must be at least 50 ppm below "rules.fanOn" (600 now): set to 550.']);

  // The correction reaches the live cfg (section 9.1 "Pairs") and the stored version, not just the
  // returned settings.
  assert.equal(cap.made[0].cfg.rules.fanOff, 550);
  assert.equal(cap.made[0].cfg.rules.fanOn, 600);
  assert.equal(db.currentSettings(1).settings.rules.fanOff, 550);
  assert.equal(db.currentSettings(1).settings.rules.fanOn, 600);

  const imported = CC.importSettings({ format: 'mushroom-climate-settings', version: CC.SETTINGS_VERSION, settings: result.settings });
  assert.ok(!imported.warnings.some(w => w.includes('Fan stop level')));
  assert.ok(!imported.warnings.some(w => w.includes('AC "until" level')));
});

// Note (contract gap, reported to the lead): the brief's own numbers for this test ("Same setup" as
// "Pair correction", i.e. golden/pinning, then { rules: { acOff: 450 } } with "live acOn 450" expecting
// acOff corrected to 500) cannot occur with this implementation. During the golden/pinning ramp, acOn
// ramps *down* from the base's 700 to the live 450; cleanSettings merges the edit over the stale base
// (acOn still 700 there), and `ClimateController.importSettings` enforces the same pair rule on that
// merged object *before* step 7 runs: 700 > 450 - 50 is already true, so importSettings itself corrects
// `acOn` down to 400, which then counts as "changed" in step 5 (next.acOn 400 !== base.acOn 700) -- so
// step 7's "exactly one of the two keys changed" guard is never true and our correction never fires (the
// version is stored as importSettings left it: acOff 450, acOn 400, with importSettings' own pair
// warning, not ours). This is inherent to any ramp where the kept key moves *down* away from the base:
// importSettings always corrects the low side first using the stale base value. The symmetric case this
// test wants (only the high key in `changed`) needs a ramp where the kept low key moves *up* away from
// the base instead (so the merged/base-relative check stays safe while the live-relative one does not);
// oyster fruiting -> rest does that (co2Lim 1000 -> 2000, so acOn ramps 700 -> 1700), so it is used here.
test('Pair correction, high key', () => {
  const s = scripted();
  const { mgr, jump } = setup(s.factory);
  mgr.start();
  mgr.applySettings(1, { stage: 'rest' });
  jump(14256); // f = 0.99 along the ramp: live acOff 1890, acOn 1690
  const result = mgr.applySettings(1, { rules: { acOff: 1650 } });
  assert.equal(result.settings.rules.acOff, 1740);
  assert.equal(result.settings.rules.acOn, 1690);
  assert.deepEqual(result.warnings, ['"rules.acOff" = 1650 must be at least 50 ppm above "rules.acOn" (1690 now): set to 1740.']);
});

// ---------------------------------------------------------------------------
// Task 13: update and archive (C2 section 4, 6.1)
// ---------------------------------------------------------------------------

test('update', () => {
  const spy = simSpyFactory();
  const { db, mgr, log } = setup(spy.factory);
  mgr.start();

  log.length = 0;
  const r1 = mgr.update(1, { name: '  New name  ' });
  assert.equal(r1.name, 'New name');
  assert.equal(db.getRoom(1).name, 'New name');
  assert.equal(log.filter(([n]) => n === 'room').length, 1);
  assert.ok(!db.listEvents(1, { limit: 10 }).some(e => e.text === 'Stopped'));

  const roomM3Before = db.currentSettings(1).settings.roomM3;
  log.length = 0;
  const beforeId = maxEventId(db, 1);
  const madeBefore = spy.made.length;
  const r2 = mgr.update(1, { volume: 90 });
  assert.equal(r2.volume, 90);
  const texts = newEventTextsSince(db, 1, beforeId);
  assert.ok(texts.includes('Stopped'));
  assert.ok(texts.some(t => t.startsWith('Resumed after 0 min stopped')));
  assert.equal(log.filter(([n]) => n === 'room').length, 1);
  assert.equal(db.currentSettings(1).settings.roomM3, roomM3Before);
  assert.ok(spy.made.length > madeBefore);
  assert.equal(spy.made[spy.made.length - 1].args.room.volume, 90);

  // Sending the same volume (already 90) must not restart the room: no new "Stopped" or "Resumed"
  // event, and no new adapter built.
  log.length = 0;
  const beforeId2 = maxEventId(db, 1);
  const madeBefore2 = spy.made.length;
  mgr.update(1, { volume: 90 });
  const texts2 = newEventTextsSince(db, 1, beforeId2);
  assert.ok(!texts2.includes('Stopped'));
  assert.equal(spy.made.length, madeBefore2);
  assert.equal(log.filter(([n]) => n === 'room').length, 1);

  try {
    mgr.update(1, { archived_at: 123 });
    assert.fail('expected bad_input');
  } catch (err) {
    assert.equal(err.code, 'bad_input');
    assert.deepEqual(err.details, ['unknown field "archived_at"']);
  }

  try {
    mgr.update(1, { name: '' });
    assert.fail('expected bad_input');
  } catch (err) {
    assert.deepEqual(err.details, ['name must be 1 to 60 characters']);
  }

  try {
    mgr.update(1, { volume: '90' });
    assert.fail('expected bad_input');
  } catch (err) {
    assert.deepEqual(err.details, ['volume must be a number from 5 to 5000 (m³)']);
  }

  try {
    mgr.update(1, { vent: 'side' });
    assert.fail('expected bad_input');
  } catch (err) {
    assert.deepEqual(err.details, ['vent must be "supply" or "exhaust"']);
  }

  const { room: arch } = mgr.create({ name: 'Arch', volume: 60, vent: 'supply' });
  mgr.archive(arch.id);
  try {
    mgr.update(arch.id, { name: 'X' });
    assert.fail('expected bad_input');
  } catch (err) {
    assert.equal(err.code, 'bad_input');
    assert.deepEqual(err.details, [`room ${arch.id} is archived`]);
  }

  try {
    mgr.update(999, { name: 'X' });
    assert.fail('expected not_found');
  } catch (err) {
    assert.equal(err.code, 'not_found');
  }
});

test('archive', () => {
  const { db, mgr, log, step, now } = setup();
  mgr.start();
  const { room } = mgr.create({ name: 'A', volume: 60, vent: 'supply' });
  step(30); // let time pass so a genuine new save at archive is visible, not a coincidence of the creation save
  const savedBeforeArchive = db.loadControllerState(room.id).saved_at;

  log.length = 0;
  const result = mgr.archive(room.id);
  assert.ok(db.listEvents(room.id, { limit: 10 }).some(e => e.text === 'Stopped'));
  assert.ok(db.listEvents(room.id, { limit: 10 }).some(e => e.text === 'Room archived'));
  assert.equal(db.getRoom(room.id).archived_at, now());
  // The running room's state is saved (at now()) as part of the stop, before the archive.
  assert.equal(db.loadControllerState(room.id).saved_at, now());
  assert.notEqual(db.loadControllerState(room.id).saved_at, savedBeforeArchive);
  assert.equal(result.live, null);
  const roomEmits = log.filter(([n]) => n === 'room');
  assert.equal(roomEmits.length, 1);
  assert.equal(roomEmits[0][1].room.live, null);

  assert.ok(!mgr.list().some(r => r.id === room.id));
  assert.equal(mgr.get(room.id).live, null);
  const rowsBefore = db.queryReadings(room.id, { from: 0, to: now() }).length;
  step(30);
  assert.equal(db.queryReadings(room.id, { from: 0, to: now() }).length, rowsBefore);

  log.length = 0;
  const again = mgr.archive(room.id);
  assert.deepEqual(again, result);
  assert.equal(log.length, 0);

  // Crashed room: no state save.
  const s = scripted();
  const { db: db2, mgr: mgr2 } = setup(s.factory);
  mgr2.start();
  s.knobs.failRead = true;
  mgr2.tick();
  assert.equal(mgr2.get(1).live.running, false);
  const savedBefore = db2.loadControllerState(1).saved_at;
  mgr2.archive(1);
  assert.equal(db2.loadControllerState(1).saved_at, savedBefore);

  try {
    mgr.archive(999);
    assert.fail('expected not_found');
  } catch (err) {
    assert.equal(err.code, 'not_found');
  }
});

// ---------------------------------------------------------------------------
// Task 14: Restore, untrusted keys, error sweep, fake parity (C2 section 9.2 exact, 6.2, 6.3, 16)
// ---------------------------------------------------------------------------

function getPathTest(obj, k) { return k.startsWith('rules.') ? obj.rules[k.slice(6)] : obj[k]; }

function runRestoreCase(mgr, db, roomId, setupChange) {
  const A = mgr.applySettings(roomId, { spT: 23 }).version;
  mgr.applySettings(roomId, setupChange);
  const beforeId = maxEventId(db, roomId);
  const result = mgr.applySettings(roomId, A.settings, `Restored version ${A.id}`, { exact: true });
  assert.deepEqual(result.settings, A.settings);
  assert.equal(result.version.note, `Restored version ${A.id}`);
  assert.equal(db.currentSettings(roomId).settings.stage, 'fruiting');
  for (const k of rooms.TARGET_KEYS) assert.equal(getPathTest(result.settings, k), getPathTest(A.settings, k));
  assert.equal(db.loadControllerState(roomId).controller.stage.ramp, null);
  const texts = newEventTextsSince(db, roomId, beforeId);
  const stageIdx = texts.findIndex(t => t.startsWith('Stage: '));
  const restoredIdx = texts.findIndex(t => t.startsWith('Targets restored: '));
  assert.ok(stageIdx >= 0, 'expected a Stage: event');
  assert.ok(restoredIdx >= 0, 'expected a Targets restored: event');
  assert.ok(restoredIdx > stageIdx);
}

test('Restore exact', () => {
  const s = scripted();
  const { db, mgr } = setup(s.factory);
  mgr.start();

  runRestoreCase(mgr, db, 1, { stage: 'pinning' });

  const { room } = mgr.create({ name: 'R2', volume: 60, vent: 'supply' });
  runRestoreCase(mgr, db, room.id, { stage: 'pinning', program: { rampH: 0 } });

  // Case 1 without exact: ramp.to.spT === 25, no Targets restored.
  const A2 = mgr.applySettings(1, { spT: 23 }).version;
  mgr.applySettings(1, { stage: 'pinning' });
  const before2 = maxEventId(db, 1);
  mgr.applySettings(1, A2.settings, 'x');
  assert.equal(db.loadControllerState(1).controller.stage.ramp.to.spT, 25);
  assert.ok(!newEventTextsSince(db, 1, before2).some(t => t.startsWith('Targets restored:')));

  // { exact: 'yes' } acts as no exact.
  const A3 = mgr.applySettings(1, { spT: 23 }).version;
  mgr.applySettings(1, { stage: 'pinning' });
  const before3 = maxEventId(db, 1);
  mgr.applySettings(1, A3.settings, 'x', { exact: 'yes' });
  assert.notEqual(db.loadControllerState(1).controller.stage.ramp, null);
  assert.ok(!newEventTextsSince(db, 1, before3).some(t => t.startsWith('Targets restored:')));
});

test('Untrusted keys', (t) => {
  const s = JSON.parse('{"__proto__":{"polluted":1},"rules":{"constructor":{"x":1}},"spT":20}');
  const sCopy = JSON.parse(JSON.stringify(s));
  const protoNamesBefore = Object.getOwnPropertyNames(Object.prototype);

  const { db, mgr } = setup();
  mgr.start();

  const importedResults = [];
  const appliedSecondArgs = [];
  const origImport = CC.importSettings, origApply = CC.applySettings;
  CC.importSettings = (...args) => { const r = origImport(...args); importedResults.push(r.settings); return r; };
  CC.applySettings = (target, src) => { appliedSecondArgs.push(src); return origApply(target, src); };
  t.after(() => { CC.importSettings = origImport; CC.applySettings = origApply; });

  const result = mgr.applySettings(1, s);
  assert.equal(({}).polluted, undefined);
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype), protoNamesBefore);
  assert.equal(result.settings.spT, 20);
  assert.ok(result.warnings.includes('Setting "__proto__" is not allowed: ignored.'));
  assert.ok(result.warnings.includes('Setting "rules.constructor" is not allowed: ignored.'));
  assert.deepEqual(s, sCopy);

  for (const src of appliedSecondArgs) assert.ok(importedResults.includes(src));
  assert.ok(appliedSecondArgs.length > 0);

  const { warnings: createWarnings } = mgr.create({ name: 'U', volume: 60, vent: 'supply', settings: s });
  assert.equal(({}).polluted, undefined);
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype), protoNamesBefore);
  assert.ok(createWarnings.includes('Setting "__proto__" is not allowed: ignored.'));
  assert.ok(createWarnings.includes('Setting "rules.constructor" is not allowed: ignored.'));
  assert.deepEqual(s, sCopy);
  assert.equal(db.currentSettings(2).settings.spT, 20);
});

test('Errors', () => {
  const { mgr } = setup();
  mgr.start();
  const ids = [999, '1', 1.5];
  const calls = [
    id => mgr.update(id, { name: 'X' }),
    id => mgr.archive(id),
    id => mgr.restart(id),
    id => mgr.applySettings(id, { spT: 20 }),
    id => mgr.ackAlarm(id, 'x'),
  ];
  for (const id of ids) {
    for (const call of calls) {
      try {
        call(id);
        assert.fail(`expected not_found for id ${JSON.stringify(id)}`);
      } catch (err) {
        assert.equal(err.code, 'not_found');
        assert.equal(err.message, `Room ${id} not found`);
        assert.deepEqual(err.details, []);
        assert.ok(err instanceof roomsCommon.RoomError);
        assert.ok(err instanceof rooms.RoomError);
      }
    }
  }
});

test('Fake parity', () => {
  let clock = T0;
  const now = () => clock;
  const db = openFakeDb({ now });
  const fake = createFakeRoomManager({ db, now });

  const { room } = fake.create({ name: 'F', volume: 60, vent: 'supply' });
  assert.equal(db.currentSettings(room.id).note, 'Created');

  fake.applySettings(room.id, { spT: 20 });
  assert.equal(db.settingsHistory(room.id).length, 2);

  fake.archive(room.id);
  assert.equal(db.getRoom(room.id).archived_at, now());

  const { room: room2 } = fake.create({ name: 'G', volume: 60, vent: 'supply' });
  fake.setLive(room2.id, { running: false, error: 'boom' });
  const live = fake.get(room2.id).live;
  assert.equal(live.running, false);
  assert.equal(live.error, 'boom');

  const protoNamesBefore = Object.getOwnPropertyNames(Object.prototype);
  const s = JSON.parse('{"__proto__":{"polluted":1},"spT":20}');
  fake.applySettings(room2.id, s);
  assert.equal(({}).polluted, undefined);
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype), protoNamesBefore);

  try {
    fake.update(999, { name: 'X' });
    assert.fail('expected not_found');
  } catch (err) {
    assert.ok(err instanceof roomsCommon.RoomError);
  }
});
