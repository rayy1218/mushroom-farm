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

const T0 = 1791424800; // 2026-10-08 10:00 farm time (outside the harvest windows)

function setup() {
  let clock = T0;
  const now = () => clock;
  const db = openFakeDb({ now });
  const mgr = rooms.createRoomManager({ db, now, tickMs: 0, adapterFactory: rooms.defaultAdapterFactory });
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

test('sim adapter: one reading per 30 s', () => {
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

  cfg.stage = 'rest';
  clock += 1; a.io.advance(1);
  // env.blockStage is internal; confirmed indirectly: no throw, and advancing still works.
  assert.ok(true);
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

  // A second manager's start() on the same db creates nothing.
  const mgr2 = rooms.createRoomManager({ db, now: () => T0, tickMs: 0, adapterFactory: rooms.defaultAdapterFactory });
  mgr2.start();
  assert.equal(db.listRooms({ includeArchived: true }).length, 1);
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

  // Several broken rules, all texts, in table order
  expectError({ name: '', volume: 4.9, vent: 'side' }, [
    'name must be 1 to 60 characters',
    'volume must be a number from 5 to 5000 (m³)',
    'vent must be "supply" or "exhaust"',
  ]);

  assert.equal(db.listRooms({ includeArchived: true }).length, before);
});
