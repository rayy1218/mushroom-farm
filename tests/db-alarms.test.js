// The alarm queries and the safety control columns of the database (spec 2026-10-19-safety-and-history-design.md 2.5, 3, 5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const a = db.createRoom(fields).id;
  const b = db.createRoom({ ...fields, name: 'Room 2' }).id;
  return { db, a, b };
}

test('control: the safety settings and states have defaults and are stored', (t) => {
  const { db, a } = setup(t);
  const c = db.getControl(a);
  assert.deepEqual([c.co2Safety, c.exchangeMaxMin, c.exchangeEndedAt, c.cappedInRow, c.humidifierSince], [1250, 10, null, 0, null]);
  db.setControl(a, { ...c, co2Safety: 1500, exchangeMaxMin: 20 });
  assert.deepEqual([db.getControl(a).co2Safety, db.getControl(a).exchangeMaxMin], [1500, 20]);
  db.setControlState(a, { exchange: false, humidifier: true, exchangeSince: null, exchangeEndedAt: 700, cappedInRow: 2, humidifierSince: 800 }, 900);
  const s = db.getControl(a);
  assert.deepEqual([s.exchangeEndedAt, s.cappedInRow, s.humidifierSince, s.humidifier], [700, 2, 800, true]);
  // fields not given are kept; exchangeSince keeps the old rule without an explicit value
  db.setControlState(a, { exchange: true, humidifier: true }, 1000);
  const k = db.getControl(a);
  assert.deepEqual([k.exchangeSince, k.exchangeEndedAt, k.cappedInRow, k.humidifierSince], [1000, 700, 2, 800]);
  db.setControlState(a, { exchange: true, humidifier: true, exchangeSince: 555 }, 2000);
  assert.equal(db.getControl(a).exchangeSince, 555);
  db.setControlState(a, { exchange: true, humidifier: true, exchangeEndedAt: null, cappedInRow: 0, humidifierSince: null }, 3000);
  assert.deepEqual([db.getControl(a).exchangeEndedAt, db.getControl(a).cappedInRow, db.getControl(a).humidifierSince], [null, 0, null]);
});

test('raise, list, clear: one active alarm per room and key', (t) => {
  const { db, a } = setup(t);
  const id = db.raiseAlarm(a, 'tHigh', 'warning', 'Temperature 24.3 °C, above 23 + 1', 1000);
  assert.deepEqual(db.getAlarm(id), {
    id, roomId: a, roomName: 'Room 1', key: 'tHigh', level: 'warning', text: 'Temperature 24.3 °C, above 23 + 1',
    raisedAt: 1000, clearedAt: null, ackedAt: null,
  });
  assert.deepEqual(db.activeAlarms(a).map((x) => x.key), ['tHigh']);
  assert.throws(() => db.raiseAlarm(a, 'tHigh', 'warning', 'again', 1001), /UNIQUE/);
  assert.equal(db.clearAlarm(a, 'tHigh', 2000), true);
  assert.equal(db.clearAlarm(a, 'tHigh', 2001), false);
  assert.deepEqual(db.activeAlarms(a), []);
  assert.equal(db.getAlarm(id).clearedAt, 2000);
  db.raiseAlarm(a, 'tHigh', 'warning', 'second', 3000); // allowed once the first is cleared
  assert.equal(db.getAlarm(99), null);
});

test('current alarms: active, or cleared and not acknowledged; critical first, then newest', (t) => {
  const { db, a, b } = setup(t);
  const warn = db.raiseAlarm(a, 'tHigh', 'warning', 'w', 1000);
  const serious = db.raiseAlarm(b, 'sensorCo2', 'serious', 's', 2000);
  const critical = db.raiseAlarm(a, 'co2Safety', 'critical', 'c', 1500);
  const newer = db.raiseAlarm(b, 'rhLow', 'warning', 'n', 3000);
  assert.deepEqual(db.currentAlarms().map((x) => x.id), [critical, newer, serious, warn]);
  assert.deepEqual(db.currentAlarms(a).map((x) => x.id), [critical, warn]);
  assert.equal(db.currentAlarms()[0].roomName, 'Room 1');

  db.clearAlarm(a, 'tHigh', 4000); // cleared, not acknowledged: stays
  assert.equal(db.currentAlarms(a).some((x) => x.id === warn), true);
  db.ackAlarm(warn, 4500); // cleared and acknowledged: leaves
  assert.equal(db.currentAlarms(a).some((x) => x.id === warn), false);
  db.ackAlarm(serious, 4600); // active and acknowledged: stays
  assert.equal(db.currentAlarms().some((x) => x.id === serious), true);
  assert.equal(db.getAlarm(serious).ackedAt, 4600);
});

test('ackAlarm twice keeps the first time; unknown id is null', (t) => {
  const { db, a } = setup(t);
  const id = db.raiseAlarm(a, 'tHigh', 'warning', 'w', 1000);
  assert.equal(db.ackAlarm(id, 2000).ackedAt, 2000);
  assert.equal(db.ackAlarm(id, 3000).ackedAt, 2000);
  assert.equal(db.ackAlarm(99, 3000), null);
});

test('ackRoomAlarms acknowledges the current alarms of one room and counts them', (t) => {
  const { db, a, b } = setup(t);
  db.raiseAlarm(a, 'tHigh', 'warning', 'w', 1000);
  db.raiseAlarm(a, 'co2High', 'warning', 'w', 1100);
  db.raiseAlarm(b, 'tHigh', 'warning', 'w', 1200);
  assert.equal(db.ackRoomAlarms(a, 2000), 2);
  assert.equal(db.ackRoomAlarms(a, 2100), 0);
  assert.equal(db.currentAlarms(b)[0].ackedAt, null);
});

test('roomAlarms: current and the last 50 of any state, newest first', (t) => {
  const { db, a } = setup(t);
  for (let i = 0; i < 60; i++) {
    db.raiseAlarm(a, 'tHigh', 'warning', `n${i}`, 1000 + i);
    db.clearAlarm(a, 'tHigh', 1000 + i);
    db.ackRoomAlarms(a, 1000 + i);
  }
  const live = db.raiseAlarm(a, 'co2High', 'warning', 'live', 5000);
  const { current, history } = db.roomAlarms(a);
  assert.deepEqual(current.map((x) => x.id), [live]);
  assert.equal(history.length, 50);
  assert.equal(history[0].id, live);
  assert.equal(history[1].text, 'n59');
});

test('deleting the room deletes its alarms', (t) => {
  const { db, a, b } = setup(t);
  db.raiseAlarm(a, 'tHigh', 'warning', 'w', 1000);
  db.raiseAlarm(b, 'tHigh', 'warning', 'w', 1000);
  db.deleteRoom(a);
  assert.deepEqual(db.currentAlarms().map((x) => x.roomId), [b]);
});
