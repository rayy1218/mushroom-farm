// The event bus and the alarm change hooks (spec 2026-10-26-live-alarms-outdoor-design.md section 2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvents } from '../server/events.js';
import { openDb } from '../server/db.js';

test('publish reaches every listener; unsubscribe; a throwing listener is logged and the others still run', () => {
  const logged = [];
  const events = createEvents({ log: (e) => logged.push(e.message) });
  const got = [];
  const off = events.subscribe((type, data) => got.push([type, data]));
  events.subscribe(() => { throw new Error('boom'); });
  events.subscribe((type) => got.push([`second ${type}`]));
  events.publish('room', { id: 1 });
  assert.deepEqual(got, [['room', { id: 1 }], ['second room']]);
  assert.deepEqual(logged, ['boom']);
  assert.equal(events.listeners(), 3);
  off();
  events.publish('alarms');
  assert.deepEqual(got.at(-1), ['second alarms']);
  assert.equal(events.listeners(), 2);
});

test('db alarm hooks: raised, cleared (with the alarm), acked and acked-room; a throwing listener does not stop the change', (t) => {
  const logged = [];
  const db = openDb(':memory:', { log: (e) => logged.push(e.message) });
  t.after(() => db.close());
  const id = db.createRoom({ name: 'R', length: 6, width: 4, height: 2.5 }).id;
  const seen = [];
  db.onAlarmChange((e) => seen.push([e.change, e.alarm?.key ?? e.roomId, e.alarm?.clearedAt ?? null]));
  db.onAlarmChange(() => { throw new Error('listener'); });
  const a = db.raiseAlarm(id, 'tHigh', 'warning', 'Temperature high', 10);
  assert.equal(db.clearAlarm(id, 'tHigh', 20), true);
  assert.equal(db.clearAlarm(id, 'tHigh', 30), false, 'nothing active');
  db.ackAlarm(a, 40);
  db.raiseAlarm(id, 'co2High', 'warning', 'CO₂ high', 50);
  db.ackRoomAlarms(id, 60);
  assert.deepEqual(seen, [['raised', 'tHigh', null], ['cleared', 'tHigh', 20], ['acked', 'tHigh', 20], ['raised', 'co2High', null], ['acked-room', id, null]]);
  assert.equal(logged.length, 5);
  assert.equal(db.getAlarm(a).ackedAt, 40);
});

test('upgrade 15: the room control has outdoorAir (on) and exchangeKind (none); setControl stores outdoorAir', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const id = db.createRoom({ name: 'R', length: 6, width: 4, height: 2.5 }).id;
  const c = db.getControl(id);
  assert.deepEqual([c.outdoorAir, c.exchangeKind], [true, null]);
  db.setControl(id, { ...c, outdoorAir: false });
  assert.equal(db.getControl(id).outdoorAir, false);
  db.setControlState(id, { exchange: true, humidifier: false, exchangeKind: 'cooling' }, 1);
  assert.equal(db.getControl(id).exchangeKind, 'cooling');
  db.setControlState(id, { exchange: true, humidifier: false }, 2);
  assert.equal(db.getControl(id).exchangeKind, 'cooling', 'kept when not given');
});
