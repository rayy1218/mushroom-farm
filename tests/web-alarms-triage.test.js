// The alarm list's triage on the pages (web/alarms-math.js, spec 2026-11-12-alarms-triage-design.md 5 and 6): active first, the
// cleared ones folded and grouped by room and cause, the one-line strip off the Now tab.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitAlarms, causeGroups, foldText, stripText, heldText, timesLine } from '../web/alarms-math.js';

const T = new Date(2026, 10, 12, 11, 53).getTime();
let next = 1;
const alarm = (roomId, key, text, more = {}) => ({
  id: next++, roomId, roomName: `Room ${roomId}`, key, level: 'serious', text, raisedAt: T - 3_600_000, clearedAt: T, ackedAt: null, ...more,
});

test('split: active ones (cleared at null) and cleared ones, each in the order given', () => {
  const on = alarm(1, 'tHigh', 'hot', { clearedAt: null });
  const off = alarm(1, 'tLow', 'cold');
  const acked = alarm(2, 'rhLow', 'dry', { clearedAt: null, ackedAt: T });
  assert.deepEqual(splitAlarms([on, off, acked]), { active: [on, acked], cleared: [off] });
  assert.deepEqual(splitAlarms(null), { active: [], cleared: [] });
});

test('groups: a room\'s silent devices as one outage, other faults by what went wrong, repeats; a lone alarm is its own text', () => {
  const relay = ['Intake fan', 'Exhaust fan', 'Humidifier'].map((m, i) => alarm(1, `machine.k${i}`, `${m}: no answer from the relay module`, { clearedAt: T - i * 60_000 }));
  const ac = alarm(1, 'machine.ac', 'Aircon: no answer from the aircon gateway', { clearedAt: T - 120_000 });
  const sensors = [alarm(1, 'sensorTrh', 'T/RH probe fault: no reading'), alarm(1, 'sensorCo2', 'CO₂ sensor fault: no reading')];
  const otherRoom = alarm(2, 'machine.intake', 'Intake fan: no answer from the relay module');
  const gateway = [alarm(3, 'gateway', 'Gateway 127.0.0.1:1512 not answering', { clearedAt: T - 60_000 }), alarm(3, 'gateway', 'Gateway again', { clearedAt: T - 30_000 })];
  const running = [alarm(1, 'machine.exhaust', 'Exhaust fan: not running (switch on, no current)', { clearedAt: T - 5_000_000 }),
    alarm(1, 'machine.intake', 'Intake fan: not running (switch on, no current)', { clearedAt: T - 5_000_000 })];
  const jumps = [alarm(1, 'sensorTrh', 'T/RH probe fault: jump', { clearedAt: T - 6_000_000 }), alarm(1, 'sensorCo2', 'CO₂ sensor fault: jump', { clearedAt: T - 6_000_000 })];
  const hot = [alarm(1, 'tHigh', 'Temperature 27.0 °C: more than 1 °C over the band (24–26 °C)', { clearedAt: T - 7_200_000 }),
    alarm(1, 'tHigh', 'Temperature 27.4 °C: more than 1 °C over the band (24–26 °C)', { clearedAt: T - 7_000_000 })];
  const lone = alarm(1, 'machine.ac', 'Aircon: fault (error code 7)', { clearedAt: T - 9_000_000 });
  const groups = causeGroups([...relay, ac, ...sensors, otherRoom, ...gateway, ...running, ...jumps, ...hot, lone]);
  assert.deepEqual(groups.map((g) => [g.roomId, g.text, g.ids.length, g.lastCleared]), [
    [1, 'No answer (4 machines, 2 sensors)', 6, T],
    [2, 'Intake fan: no answer from the relay module', 1, T],
    [3, 'Gateway not answering', 2, T - 30_000],
    [1, 'Not running (switch on, no current) (2 machines)', 2, T - 5_000_000],
    [1, 'Sensor fault: jump (2 sensors)', 2, T - 6_000_000],
    [1, 'Temperature 27.4 °C: more than 1 °C over the band (24–26 °C) (2 times)', 2, T - 7_000_000],
    [1, 'Aircon: fault (error code 7)', 1, T - 9_000_000],
  ]);
  assert.equal(groups[0].roomName, 'Room 1');
  assert.equal(groups[0].unacked, 6);
  assert.deepEqual(causeGroups([]), []);
});

test('the fold line and the strip off the Now tab say only what is not 0', () => {
  assert.equal(foldText(8), '8 cleared to review');
  assert.equal(foldText(1), '1 cleared to review');
  assert.equal(stripText({ active: 1, cleared: 7 }), '1 active alarm · 7 cleared to review · Open on Now');
  assert.equal(stripText({ active: 3, cleared: 0 }), '3 active alarms · Open on Now');
  assert.equal(stripText({ active: 0, cleared: 2 }), '2 cleared alarms to review · Open on Now');
  assert.equal(stripText({ active: 0, cleared: 1 }), '1 cleared alarm to review · Open on Now');
  assert.equal(stripText({ active: 0, cleared: 0 }), null);
});

test('held: what a gateway or relay module alarm holds, one line', () => {
  assert.equal(heldText(undefined), '');
  assert.equal(heldText([]), '');
  assert.equal(heldText([{ roomId: 1, roomName: 'Container 1', machines: ['Intake fan', 'Exhaust fan', 'Aircon'], sensors: ['T/RH probe', 'CO₂ sensor'] }]),
    'Waiting on it: Intake fan, Exhaust fan, Aircon, T/RH probe, CO₂ sensor');
  assert.equal(heldText([
    { roomId: 1, roomName: 'Room 1', machines: ['Intake fan'], sensors: [] },
    { roomId: 5, roomName: 'Room 5', machines: [], sensors: ['T/RH probe'] },
  ]), 'Waiting on it: Room 1: Intake fan · Room 5: T/RH probe');
});

test('the Alarms card row keeps the alarm text before what it holds and its times (a row once lost its text)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../web/alarms.js', import.meta.url), 'utf8');
  const item = src.slice(src.indexOf('function alarmItem('), src.indexOf('export function clearedItem('));
  const order = ['body.append(text);', "el('span', 'al-held', held)", "el('span', 'al-times', `${timesLine(a)}"].map((x) => item.indexOf(x));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
});

test('an acknowledged alarm that is on says who acknowledged it (database 27), or only that it was for one from before', () => {
  const on = alarm(1, 'tHigh', 'hot', { clearedAt: null, raisedAt: T, ackedAt: T });
  assert.equal(timesLine({ ...on, ackedBy: 'Me' }, T), 'Raised 11:53 · Acknowledged by Me');
  assert.equal(timesLine({ ...on, ackedBy: null }, T), 'Raised 11:53 · Acknowledged');
  // History: a cleared one keeps who acknowledged it
  assert.equal(timesLine({ ...on, ackedBy: 'Ray', clearedAt: T }, T), 'Raised 11:53 · Cleared 11:53 · Acknowledged by Ray');
});

// ---- the critique's fixes (2026-11-12) ----
import { tierText } from '../web/alarms-math.js';

test('a tier change is announced: "Now Serious, …"; nothing for the same level or a new id', () => {
  const a = alarm(1, 'tHigh', 'hot for 30 min', { clearedAt: null, level: 'serious' });
  assert.equal(tierText(new Map([[a.id, 'warning']]), [a]), 'Now Serious, hot for 30 min');
  assert.equal(tierText(new Map([[a.id, 'serious']]), [a]), '');
  assert.equal(tierText(new Map(), [a]), '');
});

test('after an Acknowledge the focus never lands on a live alarm\'s button', async () => {
  globalThis.document ??= { createElement: () => ({}) }; // alarms.js only touches the DOM when its cards are made
  const { focusAfterAck } = await import('../web/alarms.js');
  const focused = [];
  const button = (name) => ({ name, offsetParent: {}, focus: () => focused.push(name) });
  const card = ({ cleared = [], toggle = true, hidden = false }) => ({
    hidden,
    querySelectorAll: (sel) => (sel.includes('.al-cleared') ? cleared : [button('live alarm')]),
    querySelector: (sel) => (sel.includes('al-fold-toggle') ? (toggle ? button('toggle') : null) : sel === 'h2' ? { focus: () => focused.push('title') } : button('live alarm')),
  });
  focusAfterAck(card({ cleared: [button('group 1'), button('group 2')] }), { zone: 'cleared', index: 1 });
  focusAfterAck(card({ cleared: [button('group 1')] }), { zone: 'cleared', index: 3 });
  focusAfterAck(card({}), { zone: 'cleared', index: 0 });
  focusAfterAck(card({ toggle: false }), { zone: 'cleared', index: 0 });
  focusAfterAck(card({ cleared: [button('group 1')] }), { zone: 'active', index: 0 });
  focusAfterAck(card({ hidden: true }), { zone: 'cleared', index: 0 }, () => focused.push('page title'));
  assert.deepEqual(focused, ['group 2', 'group 1', 'toggle', 'title', 'title', 'page title']);
});
