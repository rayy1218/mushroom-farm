// Review fixes of the dehumidifier (2026-10-21): taken out of a room while running, an older page's room save, the history
// keys, no humidity probe, the compressor's wait after a restart, upgrade 12 on a database with a machine log.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMachines } from '../server/machines.js';
import { createController, decide } from '../server/controller.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };
const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, exchangeMaxMin: 10, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 };

async function app(t) {
  const db = openDb(':memory:');
  const writes = [];
  const client = { async writeCoil(...a) { writes.push(a); }, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, client, poller });
  const controller = createController({ db, machines });
  const server = createApp(db, { machines, controller });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, writes, call };
}

test('a running dehumidifier taken out of the room is switched off, its log ends and its band state starts again', async (t) => {
  const s = await app(t);
  const id = s.db.createRoom({ ...ROOM, dehumidifier: true }).id;
  assert.equal((await s.call('PUT', `/api/rooms/${id}/machines/dehumidifier`, { on: true })).status, 200);
  s.db.setControlState(id, { exchange: false, humidifier: false, dehumidifier: true }, 1);
  const r = await s.call('PUT', `/api/rooms/${id}`, { ...ROOM, dehumidifier: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.dehumidifier, false);
  assert.equal(s.db.getCommands(id).relay.dehumidifier, false, 'commanded off');
  assert.deepEqual(s.writes.at(-1).slice(1), [4, false], 'coil 5 written off');
  assert.equal(s.db.getControl(id).dehumidifier, false, 'band state cleared');
  const log = s.db.history(id, 1).machines.dehumidifier;
  assert.equal(log.at(-1).on, false, 'the log ends with off');
});

test('a room saved without the dehumidifier field (an older page) keeps it fitted', async (t) => {
  const s = await app(t);
  const id = s.db.createRoom({ ...ROOM, dehumidifier: true }).id;
  const { dehumidifier, ...older } = { ...ROOM, dehumidifier: true };
  const r = await s.call('PUT', `/api/rooms/${id}`, { ...older, name: 'Renamed' });
  assert.equal(r.body.dehumidifier, true);
  assert.equal(s.db.createRoom({ name: 'New', length: 3, width: 3, height: 2.5 }).dehumidifier, false, 'a new room without the field has none');
});

test('history has the dehumidifier', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const id = db.createRoom({ ...ROOM, dehumidifier: true }).id;
  db.setRelayCommand(id, 'dehumidifier', true, 1000);
  assert.ok(Array.isArray(db.history(id, 1, 5000).machines.dehumidifier));
});

test('no humidity probe wired: the dehumidifier is off (a running one too)', () => {
  const r = decide({ bands, state: { exchange: false, humidifier: false, dehumidifier: true }, readings: { co2: 650, rh: null }, now: 1e7, dehumidifierFitted: true, rhUnwired: true });
  assert.equal(r.desired.dehumidifier, false);
  assert.equal(r.reasons.dehumidifier, 'No humidity probe wired: dehumidifier off');
});

test('not fitted: off, but the band state is left as it was', () => {
  const r = decide({ bands, state: { exchange: false, humidifier: false, dehumidifier: true }, readings: { co2: 650, rh: 96 }, now: 1e7, dehumidifierFitted: false });
  assert.equal(r.desired.dehumidifier, false);
  assert.equal(r.state.dehumidifier, true);
});

test('after a restart the compressor still waits its 3 min: the last switch comes from the machine log', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = 1_000_000;
  const client = { async writeCoil() {}, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, client, poller, now: () => clock });
  const id = db.createRoom({ ...ROOM, dehumidifier: true }).id;
  await machines.command(id, 'dehumidifier', { on: true }); // logged at 1 000 000
  await machines.command(id, 'dehumidifier', { on: false });
  const controller = createController({ db, machines, now: () => clock }); // a fresh controller: nothing in memory
  controller.update(id, { auto: true });
  clock += 60_000;
  const start = clock;
  db.addReading({ roomId: id, kind: 'trh', address: 1, at: start, ok: true, t: 22, rh: 97, error: null });
  db.addReading({ roomId: id, kind: 'co2', address: 2, at: start, ok: true, co2: 650, error: null });
  clock += 1;
  await controller.run(start);
  assert.equal(db.getCommands(id).relay.dehumidifier, false, 'still in its minimum off time');
  assert.match(controller.get(id).reasons.held.dehumidifier, /^Dehumidifier waits: minimum off time/);
});

test('upgrade 11 to 14 rebuilds the machine log with its rows and ids, keeps its index and takes the dehumidifier', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dh-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'farm.db');
  const first = openDb(path);
  const id = first.createRoom(ROOM).id;
  first.setRelayCommand(id, 'humidifier', true, 100);
  first.setRelayCommand(id, 'humidifier', false, 200);
  first.close();
  // back to a version 11 file: the old CHECK and no dehumidifier columns
  const raw = new DatabaseSync(path);
  const rows = raw.prepare('SELECT * FROM machine_log ORDER BY id').all();
  raw.exec(`ALTER TABLE machine_log RENAME TO x; DROP INDEX machine_log_by_room;
    CREATE TABLE machine_log (id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL,
      machine TEXT NOT NULL CHECK (machine IN ('intake', 'exhaust', 'circulation', 'humidifier', 'ac')),
      at INTEGER NOT NULL, on_ INTEGER NOT NULL CHECK (on_ IN (0, 1)), setpoint REAL, mode TEXT, fan TEXT,
      source TEXT NOT NULL CHECK (source IN ('manual', 'auto'))) STRICT;
    CREATE INDEX machine_log_by_room ON machine_log (room_id, machine, at);
    INSERT INTO machine_log SELECT * FROM x WHERE machine <> 'dehumidifier'; DROP TABLE x;
    ALTER TABLE machine_commands DROP COLUMN dehumidifier;
    ALTER TABLE room_controls DROP COLUMN dehumidifier; ALTER TABLE room_controls DROP COLUMN humidifier_last_on;
    ALTER TABLE rooms DROP COLUMN dehumidifier; ALTER TABLE rooms DROP COLUMN dehumidifier_w; ALTER TABLE rooms DROP COLUMN dehumidifier_lday;
    PRAGMA user_version = 11;`);
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 18);
  assert.deepEqual(check.prepare('SELECT * FROM machine_log ORDER BY id').all().map((r) => ({ ...r })), rows.filter((r) => r.machine !== 'dehumidifier').map((r) => ({ ...r })));
  assert.ok(check.prepare("SELECT 1 FROM sqlite_master WHERE name = 'machine_log_by_room'").get(), 'index kept');
  db.updateRoom(id, { ...ROOM, dehumidifier: true });
  db.setRelayCommand(id, 'dehumidifier', true, 300); // the new machine is allowed in the log
  assert.equal(db.getRoom(id).dehumidifierW, 380);
});
