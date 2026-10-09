// tests/fakes/rooms.js: the fake C2 room manager (C2 section 16; lead-fakes brief task 8).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../air.js');
require('../controller.js');
const CC = globalThis.ClimateController;
const { openFakeDb } = require('./fakes/db.js');
const { createFakeRoomManager } = require('./fakes/rooms.js');
const { RoomError } = require('../server/rooms-common.js');

let clock = 1791446400;
const now = () => clock;

function setup() {
  clock = 1791446400;
  const db = openFakeDb({ now });
  const rooms = createFakeRoomManager({ db, now });
  const seen = [];
  for (const n of ['reading', 'event', 'alarm', 'settings', 'room']) rooms.on(n, p => seen.push([n, p]));
  return { db, rooms, seen };
}

test('calls records every public method, including failed and internal-free calls', () => {
  const { rooms } = setup();
  rooms.start();
  rooms.stop();
  rooms.tick();
  assert.deepEqual(rooms.calls.map(c => c.method), ['start', 'stop', 'tick']);

  try { rooms.update(999, {}); } catch (e) { /* expected: a failed call is still recorded */ }
  assert.equal(rooms.calls.at(-1).method, 'update');

  const { room } = rooms.create({ name: 'A', volume: 60, vent: 'supply' });
  rooms.calls.length = 0;
  rooms.applySettings(room.id, { spT: 20 }, undefined);
  const last = rooms.calls.at(-1);
  assert.equal(last.method, 'applySettings');
  assert.equal(last.args.length, 3);

  rooms.calls.length = 0;
  rooms.list();
  assert.deepEqual(rooms.calls.map(c => c.method), ['list']);
});

test('default live summary; list and get; archived rooms', () => {
  const { db, rooms } = setup();
  const room = db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings: CC.defaultSettings() });
  db.raiseAlarm(room.id, { alarm_key: 'a', level: 'warning', label: 'A', at: 1 });
  db.raiseAlarm(room.id, { alarm_key: 'b', level: 'warning', label: 'B', at: 1 });
  const got = rooms.get(room.id);
  assert.deepEqual(got.live, { reading: null, stage: 'fruiting', crop: 'oyster', targets: null, status: null, alarms: 2, running: true, error: null });
  assert.ok(rooms.list().some(r => r.id === room.id));
  assert.equal(rooms.get(999), null);
  assert.equal(rooms.get('x'), null);

  const archived = db.createRoom({ name: 'B', volume: 60, vent: 'supply', settings: CC.defaultSettings() });
  db.archiveRoom(archived.id);
  assert.equal(rooms.get(archived.id).live, null);
  assert.ok(!rooms.list().some(r => r.id === archived.id));
});

test('setLive test helper; restart', () => {
  const { db, rooms, seen } = setup();
  const room = db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings: CC.defaultSettings() });
  const callsBefore = rooms.calls.length;
  rooms.setLive(room.id, { running: false, error: 'boom' });
  // setLive itself is not recorded in calls (checked before any get() call below adds its own entry)
  assert.equal(rooms.calls.length, callsBefore);
  assert.equal(seen.length, 0); // setLive emits nothing
  assert.equal(rooms.get(room.id).live.running, false);
  assert.equal(rooms.get(room.id).live.error, 'boom');

  const eventsBefore = db.listEvents(room.id).length;
  const restarted = rooms.restart(room.id);
  assert.equal(restarted.live.running, true);
  assert.equal(restarted.live.error, null);
  assert.deepEqual(seen.map(([name]) => name), ['room']); // exactly one room emit, nothing else
  assert.equal(db.listEvents(room.id).length, eventsBefore); // no db event written
});

test('create: trims name, stores first settings, emits in order, returns warnings', () => {
  const { db, rooms, seen } = setup();
  const { room, warnings } = rooms.create({ name: ' North ', volume: 80, vent: 'exhaust' });
  assert.equal(room.name, 'North');
  assert.deepEqual(warnings, []);
  const expected = CC.defaultSettings();
  expected.roomM3 = 80;
  assert.deepEqual(db.currentSettings(room.id).settings, expected); // the stored first settings
  const history = db.settingsHistory(room.id);
  assert.equal(history.length, 1); // exactly one version stored
  assert.equal(history[0].note, 'Created');
  assert.deepEqual(seen.map(([name]) => name), ['settings', 'event', 'room']);
  assert.equal(seen[0][1].auto, false);
  assert.deepEqual(seen[0][1].warnings, []);
  assert.deepEqual(seen[0][1].version, db.currentSettings(room.id)); // the settings emit's version
  assert.equal(seen[1][1].event.text, 'Room created');
  assert.deepEqual(seen[2][1].room.id, room.id);

  const { room: room2 } = rooms.create({ name: 'Same', volume: 80, vent: 'exhaust', settings: undefined });
  assert.equal(room2.name, 'Same');
  assert.deepEqual(db.currentSettings(room2.id).settings, expected); // settings: undefined behaves the same
});

test('create: merges settings over the base; drops prototype-polluting keys', () => {
  const { db, rooms } = setup();
  const r1 = rooms.create({ name: 'A', volume: 200, vent: 'supply', settings: { crop: 'pink' } });
  assert.equal(r1.room.live.crop, 'pink');
  assert.equal(db.currentSettings(r1.room.id).settings.roomM3, 200); // stored roomM3 from volume

  const r2 = rooms.create({ name: 'B', volume: 10, vent: 'supply', settings: { roomM3: 150 } });
  assert.equal(r2.warnings.length, 0);
  assert.equal(db.currentSettings(r2.room.id).settings.roomM3, 150); // the given roomM3 wins over volume

  const r3 = rooms.create({ name: 'C', volume: 60, vent: 'supply', settings: { spT: 99 } });
  assert.ok(r3.warnings.some(w => w.includes('"spT" = 99 is outside 10–35: set to 35.')));
  assert.equal(db.currentSettings(r3.room.id).settings.spT, 35); // clamped value is what gets stored

  const polluted = JSON.parse('{"__proto__":{"polluted":1},"spT":20}');
  const r4 = rooms.create({ name: 'D', volume: 60, vent: 'supply', settings: polluted });
  assert.ok(r4.warnings.some(w => w === 'Setting "__proto__" is not allowed: ignored.'));
  assert.equal(({}).polluted, undefined);
  assert.equal(db.currentSettings(r4.room.id).settings.spT, 20); // stored despite the dropped __proto__ key
});

test('create: bad_input with all broken rules together; nothing stored or emitted', () => {
  const { db, rooms, seen } = setup();
  assert.throws(() => rooms.create({}), err => {
    assert.ok(err instanceof RoomError);
    assert.equal(err.name, 'RoomError');
    assert.equal(err.code, 'bad_input');
    assert.equal(err.message, 'Bad input');
    assert.ok(err.details.includes('name must be 1 to 60 characters'));
    assert.ok(err.details.includes('volume must be a number from 5 to 5000 (m³)'));
    assert.ok(err.details.includes('vent must be "supply" or "exhaust"'));
    return true;
  });
  assert.equal(seen.length, 0);
  assert.equal(db.listRooms().length, 0); // nothing stored
  assert.throws(() => rooms.create({ name: 'A', volume: 60, vent: 'supply', settings: [] }), err => err.details.includes('settings must be an object'));
  assert.equal(db.listRooms().length, 0);
});

test('update: trims name, unknown field, archived room, unknown room', () => {
  const { db, rooms, seen } = setup();
  const room = db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings: CC.defaultSettings() });
  const updated = rooms.update(room.id, { name: ' B ' });
  assert.equal(updated.name, 'B');
  assert.deepEqual(seen.map(([name]) => name), ['room']); // exactly one room emit
  assert.equal(seen[0][1].room.id, room.id);
  assert.throws(() => rooms.update(room.id, { colour: 1 }), err => err.details.includes('unknown field "colour"'));
  assert.equal(db.getRoom(room.id).name, 'B'); // nothing stored by the failed call
  db.archiveRoom(room.id);
  assert.throws(() => rooms.update(room.id, { name: 'C' }), err => err.details.includes(`room ${room.id} is archived`));
  assert.equal(db.getRoom(room.id).name, 'B'); // nothing stored
  assert.throws(() => rooms.update(999, {}), err => err.code === 'not_found' && err.message === 'Room 999 not found');
});

test('archive: sets archived_at, writes Room archived, emits event then room; twice is a no-op', () => {
  const { rooms, seen } = setup();
  const { room } = rooms.create({ name: 'A', volume: 60, vent: 'supply' });
  seen.length = 0;
  const archived = rooms.archive(room.id);
  assert.equal(archived.archived_at, now());
  assert.equal(archived.live, null);
  assert.deepEqual(seen.map(([name]) => name), ['event', 'room']);
  assert.equal(seen[0][1].event.text, 'Room archived');
  seen.length = 0;
  const again = rooms.archive(room.id);
  assert.deepEqual(again, archived);
  assert.equal(seen.length, 0);
});

test('applySettings: stores partial merge, writes event, emits event then settings', () => {
  const { db, rooms, seen } = setup();
  const { room } = rooms.create({ name: 'A', volume: 60, vent: 'supply' });
  const before = db.currentSettings(room.id);
  seen.length = 0;
  const result = rooms.applySettings(room.id, { spT: 20 }, ' warmer ');
  assert.equal(result.settings.spT, 20);
  const after = db.currentSettings(room.id);
  const expectedSettings = Object.assign({}, before.settings, { spT: 20 });
  assert.deepEqual(after.settings, expectedSettings); // the previous version with only spT changed
  assert.equal(after.note, 'warmer'); // the trimmed note, stored
  assert.deepEqual(result.settings, after.settings); // the returned settings equal the stored ones
  assert.deepEqual(seen.map(([name]) => name), ['event', 'settings']);
  assert.equal(seen[0][1].event.text, `Settings saved (version ${after.id}): warmer`); // exact event text
  assert.ok(seen[0][1].event.text.startsWith('Settings saved (version'));
  assert.ok(seen[0][1].event.text.endsWith(': warmer'));
  assert.equal(seen[1][1].auto, false);

  seen.length = 0;
  const noNote = rooms.applySettings(room.id, { spT: 21 });
  assert.ok(!seen[0][1].event.text.includes(':'));

  const exact = rooms.applySettings(room.id, { spT: 22 }, undefined, { exact: true });
  assert.equal(exact.settings.spT, 22);
  assert.deepEqual(rooms.calls.at(-1).args[3], { exact: true }); // recorded in calls; no other effect (no controller)
});

test('applySettings: calls importSettings, never ClimateController.applySettings', (t) => {
  const { rooms } = setup();
  const { room } = rooms.create({ name: 'A', volume: 60, vent: 'supply' });
  const applySpy = t.mock.method(CC, 'applySettings');
  const importSpy = t.mock.method(CC, 'importSettings');
  rooms.create({ name: 'B', volume: 60, vent: 'supply', settings: { spT: 10 } });
  rooms.applySettings(room.id, { spT: 20 });
  assert.equal(applySpy.mock.callCount(), 0);
  assert.ok(importSpy.mock.callCount() >= 2);
});

test('applySettings: bad_input cases, nothing stored', () => {
  const { db, rooms } = setup();
  const room = db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings: CC.defaultSettings() });
  const historyLenBefore = db.settingsHistory(room.id).length;
  assert.throws(() => rooms.applySettings(room.id, null), err => err.details.includes('settings must be an object'));
  assert.throws(() => rooms.applySettings(room.id, []), err => err.details.includes('settings must be an object'));
  assert.throws(() => rooms.applySettings(room.id, {}, 'x'.repeat(201)), err => err.details.includes('note must be text of at most 200 characters'));
  assert.equal(db.settingsHistory(room.id).length, historyLenBefore); // nothing stored
  db.archiveRoom(room.id);
  assert.throws(() => rooms.applySettings(room.id, {}), err => err.details.includes(`room ${room.id} is archived`));
  assert.throws(() => rooms.applySettings(999, {}), err => err.code === 'not_found');
  assert.equal(db.settingsHistory(room.id).length, historyLenBefore); // still nothing stored
});

test('ackAlarm: acknowledges unacknowledged rows, emits event then alarms', () => {
  const { db, rooms, seen } = setup();
  const room = db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings: CC.defaultSettings() });
  const a1 = db.raiseAlarm(room.id, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: 1 });
  db.clearAlarm(room.id, 'rhHi', 2);
  const a3 = db.raiseAlarm(room.id, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: 3 });
  seen.length = 0;
  const latest = rooms.ackAlarm(room.id, 'rhHi');
  assert.equal(latest.id, a3.id); // the row with the largest id is returned
  assert.equal(latest.acked_at, now());
  assert.deepEqual(seen.map(([name]) => name), ['event', 'alarm', 'alarm']);
  assert.equal(seen[0][1].event.text, 'Acknowledged: High humidity');
  assert.ok(seen.slice(1).every(([, p]) => p.change === 'acked'));
  assert.ok(seen.slice(1).every(([, p]) => p.alarm.acked_at === now())); // each alarm payload's acked_at
  assert.deepEqual(seen.slice(1).map(([, p]) => p.alarm.id).sort((a, b) => a - b), [a1.id, a3.id].sort((a, b) => a - b));

  seen.length = 0;
  const again = rooms.ackAlarm(room.id, 'rhHi');
  assert.deepEqual(again, latest);
  assert.equal(seen.length, 0);

  assert.throws(() => rooms.ackAlarm(room.id, 'tHi'), err => err.code === 'not_found' && err.message === `No alarm "tHi" in room ${room.id}`);
  assert.throws(() => rooms.ackAlarm(room.id, ''), err => err.code === 'bad_input');
});

test('listeners: a throwing listener is caught; off removes a listener; emit test helper', (t) => {
  const { rooms, seen } = setup();
  const errStub = t.mock.method(console, 'error', () => {});
  const calls = [];
  const bad = () => { throw new Error('boom'); };
  const good = p => calls.push(p);
  rooms.on('event', bad);
  rooms.on('event', good);
  rooms.emit('event', { x: 1 });
  assert.equal(errStub.mock.callCount(), 1);
  assert.deepEqual(calls, [{ x: 1 }]);

  rooms.off('event', good);
  rooms.emit('event', { x: 2 });
  assert.deepEqual(calls, [{ x: 1 }]);

  // emit('reading', p) reaches listeners (C2 7), not just 'event'; setup() already has a 'reading' listener.
  rooms.emit('reading', { t: 5 });
  assert.deepEqual(seen.filter(([name]) => name === 'reading'), [['reading', { t: 5 }]]);
});
