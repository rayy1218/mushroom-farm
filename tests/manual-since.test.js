// A room left in Manual: since when its automatic control is off (room_controls.auto_changed_at, upgrade 17), and the
// 'manualLong' reminder alarm after MANUAL_REMIND_MS.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createAlarms, MANUAL_REMIND_MS } from '../server/alarms.js';
import { createController } from '../server/controller.js';
import { createMachines } from '../server/machines.js';
import { createApp } from '../server/app.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const H = 60 * 60_000;
const TEXT = (h) => `Automatic control off for ${h} h: the machines stay as set by hand`;

test('the reminder is due after 2 h', () => {
  assert.equal(MANUAL_REMIND_MS, 2 * H);
});

// ---- upgrade 16 → 17 ----

function v16(t) {
  const dir = mkdtempSync(join(tmpdir(), 'manual-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'farm.db');
  const first = openDb(path);
  const manual = first.createRoom({ ...ROOM, relayAddress: 3 }, 1000).id;
  const auto = first.createRoom({ ...ROOM, name: 'Room 2', relayAddress: 5 }, 1000).id;
  first.setControl(auto, { ...first.getControl(auto), auto: true });
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec('ALTER TABLE room_controls DROP COLUMN auto_changed_at; PRAGMA user_version = 16;');
  raw.close();
  return { path, manual, auto };
}

test('upgrade 16 to 17: a room in Manual counts from the upgrade, a room in auto is not known (null), the rest kept', (t) => {
  const { path, manual, auto } = v16(t);
  const before = Date.now();
  const db = openDb(path);
  t.after(() => db.close());
  const after = Date.now();
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 17);
  const m = db.getControl(manual);
  assert.equal(m.auto, false);
  assert.ok(m.autoChangedAt >= before && m.autoChangedAt <= after, `${m.autoChangedAt} in [${before}, ${after}]`);
  const a = db.getControl(auto);
  assert.equal(a.auto, true);
  assert.equal(a.autoChangedAt, null);
  assert.equal(db.getRoom(manual).relayAddress, 3);
});

test('upgrade 16 to 17: running it again keeps the stored times', (t) => {
  const { path, manual } = v16(t);
  openDb(path).close();
  const w = new DatabaseSync(path);
  w.exec(`UPDATE room_controls SET auto_changed_at = 42 WHERE room_id = ${manual}; PRAGMA user_version = 16;`);
  w.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.equal(db.getControl(manual).autoChangedAt, 42);
});

test('a new database is at version 17; a new room counts from when it was made', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'manual-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'farm.db');
  const db = openDb(path);
  t.after(() => db.close());
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 17);
  const { id } = db.createRoom(ROOM, 5000);
  assert.equal(db.getControl(id).autoChangedAt, 5000);
});

test('a room without a control row (made by older code) counts from when the row is made', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'manual-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'farm.db');
  const first = openDb(path);
  const { id } = first.createRoom(ROOM, 5000);
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec('DELETE FROM room_controls');
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  const before = Date.now();
  const c = db.getControl(id);
  assert.ok(c.autoChangedAt >= before && c.autoChangedAt <= Date.now());
});

// ---- the command ----

function controllerSetup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = 1000;
  const client = { async writeCoil() {}, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, client, poller, now: () => clock });
  const controller = createController({ db, machines, now: () => clock, log: (e) => { throw e; } });
  const id = db.createRoom({ ...ROOM, relayAddress: 3 }, 1000).id;
  return { db, controller, machines, id, set: (at) => { clock = at; }, now: () => clock };
}

test('the command stores autoChangedAt only when auto changes', (t) => {
  const s = controllerSetup(t);
  assert.equal(s.controller.get(s.id).autoChangedAt, 1000);
  s.set(5000);
  assert.equal(s.controller.update(s.id, { co2High: 800 }).autoChangedAt, 1000); // auto not changed
  assert.equal(s.controller.update(s.id, { auto: false }).autoChangedAt, 1000); // sent unchanged
  s.set(6000);
  assert.equal(s.controller.update(s.id, { auto: true }).autoChangedAt, 6000);
  s.set(7000);
  assert.equal(s.controller.update(s.id, { auto: true, tLow: 20 }).autoChangedAt, 6000);
  s.set(8000);
  assert.equal(s.controller.update(s.id, { auto: false }).autoChangedAt, 8000);
  assert.equal(s.db.getControl(s.id).autoChangedAt, 8000);
});

test('GET and PUT /api/rooms/:id/control carry autoChangedAt', async (t) => {
  const s = controllerSetup(t);
  const server = createApp(s.db, { machines: s.machines, controller: s.controller });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/rooms/${s.id}/control`;
  assert.equal((await (await fetch(url)).json()).autoChangedAt, 1000);
  s.set(9000);
  const put = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auto: true }) });
  assert.equal((await put.json()).autoChangedAt, 9000);
  assert.equal((await (await fetch(url)).json()).autoChangedAt, 9000);
  // a value in the body is not taken
  s.set(9500);
  const sent = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ autoChangedAt: 1 }) });
  assert.equal((await sent.json()).autoChangedAt, 9000);
});

// ---- the alarm ----

const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, exchangeMaxMin: 10 };

function alarmSetup(t, addresses) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ ...ROOM, ...addresses }, 0);
  let clock = 0;
  const alarms = createAlarms({ db, now: () => clock });
  return {
    db, room,
    at(ms, control = {}, r = room) {
      clock = ms;
      alarms.evaluate(r, {
        readings: { t: 22, rh: 90, co2: 650 }, bands: { ...bands, auto: false, autoChangedAt: 0, ...control },
        faults: { trh: null, co2: null }, cappedInRow: 0, machines: null,
      });
    },
    active: () => db.activeAlarms(room.id),
  };
}

test('manualLong: raised once auto has been off 2 h in a room with a relay module, not before', (t) => {
  const s = alarmSetup(t, { relayAddress: 3 });
  s.at(0);
  s.at(2 * H - 1);
  assert.deepEqual(s.active(), []);
  s.at(2 * H);
  const [a] = s.active();
  assert.deepEqual([a.key, a.level, a.text, a.raisedAt], ['manualLong', 'serious', TEXT(2), 2 * H]);
  s.at(3 * H); // stays, one alarm
  assert.equal(s.active().length, 1);
});

test('manualLong: an aircon gateway alone is something to control too; the hours are rounded down', (t) => {
  const s = alarmSetup(t, { acAddress: 4 });
  s.at(5.9 * H, { autoChangedAt: 0.4 * H }); // 5.5 h
  assert.deepEqual(s.active().map((a) => [a.key, a.text]), [['manualLong', TEXT(5)]]);
});

test('manualLong: a room with nothing wired never alarms', (t) => {
  const s = alarmSetup(t, { trhAddress: 1, co2Address: 2 });
  s.at(0);
  s.at(10 * H);
  assert.deepEqual(s.active(), []);
});

test('manualLong: not raised while auto is on, nor when the time is not known', (t) => {
  const s = alarmSetup(t, { relayAddress: 3 });
  s.at(10 * H, { auto: true });
  s.at(11 * H, { autoChangedAt: null });
  assert.deepEqual(s.active(), []);
});

test('manualLong: cleared as soon as auto is on again, or the room has nothing wired', (t) => {
  const s = alarmSetup(t, { relayAddress: 3 });
  s.at(2 * H);
  assert.equal(s.active().length, 1);
  s.at(2 * H + 1000, { auto: true, autoChangedAt: 2 * H + 500 });
  assert.deepEqual(s.active(), []);
  s.at(5 * H, { autoChangedAt: 3 * H });
  assert.equal(s.active().length, 1);
  s.at(5 * H + 1, {}, { ...s.room, relayAddress: null });
  assert.deepEqual(s.active(), []);
});

test('manualLong through the controller run: raised 2 h after auto went off, cleared when auto is on', async (t) => {
  const s = controllerSetup(t);
  s.set(1000 + 2 * H - 1);
  await s.controller.run(s.now());
  assert.deepEqual(s.db.activeAlarms(s.id).map((a) => a.key), []);
  s.set(1000 + 2 * H);
  await s.controller.run(s.now());
  assert.deepEqual(s.db.activeAlarms(s.id).map((a) => [a.key, a.level, a.text]), [['manualLong', 'serious', TEXT(2)]]);
  s.controller.update(s.id, { auto: true });
  s.set(1000 + 2 * H + 30_000);
  await s.controller.run(s.now());
  assert.deepEqual(s.db.activeAlarms(s.id).map((a) => a.key), []);
});
