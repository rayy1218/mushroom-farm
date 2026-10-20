// The pure helpers of the alarms in the web app, the stubbed-fetch calls, and the control card additions
// (web/alarms-math.js, web/alarms.js, web/control-math.js; spec 2026-10-19-safety-and-history-design.md section 6).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  levelLabel, isActive, isDimmed, highestLevel, activeCounts, chipText, alarmTime, timesLine, unackedCount, ackLabel,
} from '../web/alarms-math.js';
import { fetchAlarms, fetchRoomAlarms, ackAlarm, ackAllAlarms } from '../web/alarms.js';
import {
  exchangeLine, checkLines, heldLine, SAFETY_FIELDS, checkSafety, locateSafetyField, bandsBody, formatHm,
} from '../web/control-math.js';

const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
const alarm = (patch) => ({ id: 1, roomId: 1, roomName: 'Room 1', key: 'tHigh', level: 'warning', text: 'x', raisedAt: 0, clearedAt: null, ackedAt: null, ...patch });

test('level labels', () => {
  assert.deepEqual(['critical', 'serious', 'warning'].map(levelLabel), ['Critical', 'Serious', 'Warning']);
  assert.equal(levelLabel('odd'), 'odd');
});

test('active and dimmed: an acknowledged alarm is dimmed only while it is still active', () => {
  assert.equal(isActive(alarm({})), true);
  assert.equal(isActive(alarm({ clearedAt: 5 })), false);
  assert.equal(isDimmed(alarm({ ackedAt: 5 })), true);
  assert.equal(isDimmed(alarm({ ackedAt: 5, clearedAt: 6 })), false);
  assert.equal(isDimmed(alarm({})), false);
});

test('highest level: critical over serious over warning, null for none', () => {
  assert.equal(highestLevel([]), null);
  assert.equal(highestLevel([alarm({ level: 'warning' }), alarm({ level: 'serious' })]), 'serious');
  assert.equal(highestLevel([alarm({ level: 'critical' }), alarm({ level: 'serious' }), alarm({ level: 'warning' })]), 'critical');
});

test('active counts per room, coloured by the highest level; cleared ones do not count', () => {
  const list = [
    alarm({ id: 1, roomId: 1, level: 'warning' }),
    alarm({ id: 2, roomId: 1, level: 'critical' }),
    alarm({ id: 3, roomId: 2, level: 'serious', ackedAt: 4 }), // acknowledged but active: counts
    alarm({ id: 4, roomId: 2, level: 'critical', clearedAt: 9 }), // cleared: does not count
    alarm({ id: 5, roomId: 3, level: 'warning', clearedAt: 9 }),
  ];
  const counts = activeCounts(list);
  assert.deepEqual(counts.get(1), { count: 2, level: 'critical' });
  assert.deepEqual(counts.get(2), { count: 1, level: 'serious' });
  assert.equal(counts.has(3), false);
  assert.equal(activeCounts(null).size, 0);
});

test('chip text and ack label', () => {
  assert.equal(chipText(1), '1 alarm');
  assert.equal(chipText(3), '3 alarms');
  assert.equal(ackLabel(alarm({ level: 'critical', text: 'CO₂ 1300 ppm' })), 'Acknowledge critical alarm: CO₂ 1300 ppm');
  assert.equal(unackedCount([alarm({}), alarm({ ackedAt: 1 }), alarm({ clearedAt: 2 })]), 2);
});

test('times: 10:42 today, with the date before today', () => {
  const now = at(19, 12, 0);
  assert.equal(alarmTime(at(19, 10, 42), now), '10:42');
  assert.equal(alarmTime(at(19, 9, 5), now), '09:05');
  assert.equal(alarmTime(at(12, 10, 42), now), '12 Oct 10:42');
  assert.equal(timesLine(alarm({ raisedAt: at(19, 10, 42) }), now), 'Raised 10:42');
  assert.equal(timesLine(alarm({ raisedAt: at(19, 10, 42), clearedAt: at(19, 10, 50) }), now), 'Raised 10:42 · Cleared 10:50');
  assert.equal(timesLine(alarm({ raisedAt: at(18, 23, 58), clearedAt: at(19, 0, 3) }), now), 'Raised 18 Oct 23:58 · Cleared 00:03');
});

// ---- the calls, with a stubbed fetch ----

function stubFetch(t, replies) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (path, init) => {
    calls.push([init.method, path, init.body]);
    const reply = replies[`${init.method} ${path}`];
    if (!reply) return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  };
  t.after(() => { globalThis.fetch = real; });
  return calls;
}

test('the alarm calls use the server routes and return their bodies', async (t) => {
  const current = [alarm({ id: 7 })];
  const calls = stubFetch(t, {
    'GET /api/alarms': { status: 200, body: current },
    'GET /api/rooms/3/alarms': { status: 200, body: { current, history: current } },
    'POST /api/alarms/7/ack': { status: 200, body: alarm({ id: 7, ackedAt: 5 }) },
    'POST /api/rooms/3/alarms/ack': { status: 200, body: { acked: 2 } },
  });
  assert.deepEqual(await fetchAlarms(), current);
  assert.deepEqual((await fetchRoomAlarms(3)).history, current);
  assert.equal((await ackAlarm(7)).ackedAt, 5);
  assert.deepEqual(await ackAllAlarms(3), { acked: 2 });
  assert.deepEqual(calls.map((c) => [c[0], c[1]]), [
    ['GET', '/api/alarms'], ['GET', '/api/rooms/3/alarms'], ['POST', '/api/alarms/7/ack'], ['POST', '/api/rooms/3/alarms/ack'],
  ]);
  assert.equal(calls.every((c) => c[2] === undefined), true, 'no body is sent');
});

test('a failing call throws an ApiError with the status', async (t) => {
  stubFetch(t, { 'POST /api/alarms/9/ack': { status: 404, body: { error: 'Alarm not found' } } });
  await assert.rejects(ackAlarm(9), { status: 404, message: 'Alarm not found' });
  await assert.rejects(fetchAlarms(), { status: 404 });
});

// ---- the Automatic control card ----

test('the state line says when the exchange stops by, when the time limit is known', () => {
  const since = at(19, 10, 42);
  assert.equal(exchangeLine({ exchange: true, exchangeSince: since, exchangeEndsAt: since + 10 * 60000 }, since + 3 * 60000), 'Air exchange on since 10:42 (stops by 10:52)');
  assert.equal(exchangeLine({ exchange: true, exchangeSince: since, exchangeEndsAt: since + 20 * 60000 }, since), 'Air exchange on since 10:42 (stops by 11:02)');
  assert.equal(exchangeLine({ exchange: true, exchangeSince: since, exchangeEndsAt: null }, since + 12 * 60000), 'Air exchange on since 10:42 (12 min)');
  assert.equal(exchangeLine({ exchange: false, exchangeMaxMin: 10 }), 'Air exchange off');
  assert.equal(formatHm(since), '10:42');
});

test('sensor check lines appear only for a sensor that is not ok', () => {
  assert.deepEqual(checkLines(undefined), []);
  assert.deepEqual(checkLines({ trh: null, co2: null }), []);
  assert.deepEqual(checkLines({ trh: { ok: true, why: null, fault: false }, co2: { ok: true, why: null, fault: false } }), []);
  assert.deepEqual(
    checkLines({ trh: { ok: true, why: null, fault: false }, co2: { ok: false, why: 'value does not change (frozen)', fault: true } }),
    ['CO₂ sensor: fault (value does not change)'],
  );
  assert.deepEqual(
    checkLines({ trh: { ok: false, why: 'sudden jump', fault: false }, co2: { ok: false, why: 'no reading', fault: true } }),
    ['T/RH probe: reading not used (sudden jump)', 'CO₂ sensor: fault (no reading)'],
  );
});

test('a held reason is the text under its machine, empty when none', () => {
  const c = { reasons: { held: { humidifier: 'Humidifier waits: minimum on time, 40 s to go', ac: '' } } };
  assert.equal(heldLine(c, 'humidifier'), 'Humidifier waits: minimum on time, 40 s to go');
  assert.equal(heldLine(c, 'ac'), '');
  assert.equal(heldLine(c, 'exchange'), '');
  assert.equal(heldLine({}, 'ac'), '');
  assert.equal(heldLine(undefined, 'ac'), '');
});

test('the safety inputs: labels, and the same checks as the server', () => {
  assert.deepEqual(SAFETY_FIELDS.map((f) => [f.key, f.label]), [
    ['co2Safety', 'CO₂ safety level (ppm)'], ['exchangeMaxMin', 'Air exchange time limit (min)'],
  ]);
  assert.equal(checkSafety(750, 1250, 10), null);
  assert.deepEqual(checkSafety(750, 750, 10), { field: 'co2Safety', message: 'CO₂ safety level must be above the CO₂ band upper limit' });
  assert.equal(checkSafety(750, 10001, 10).field, 'co2Safety');
  assert.equal(checkSafety(750, NaN, 10).field, 'co2Safety');
  assert.equal(checkSafety(750, 10000, 10), null);
  for (const v of [0, 121, 2.5, NaN]) {
    assert.deepEqual(checkSafety(750, 1250, v), { field: 'exchangeMaxMin', message: 'Air exchange time limit must be a whole number from 1 to 120 min' }, String(v));
  }
  assert.equal(checkSafety(750, 1250, 1), null);
  assert.equal(checkSafety(750, 1250, 120), null);
  assert.equal(locateSafetyField('co2Safety').key, 'co2Safety');
  assert.equal(locateSafetyField('exchangeMaxMin').key, 'exchangeMaxMin');
  assert.equal(locateSafetyField('co2Low'), null);
  assert.equal(locateSafetyField(undefined), null);
});

test('save sends the safety values with the bands when they are given', () => {
  const six = { co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 };
  assert.deepEqual(bandsBody({ ...six, co2Safety: 1300, exchangeMaxMin: 12, auto: true }), { ...six, co2Safety: 1300, exchangeMaxMin: 12 });
  assert.deepEqual(bandsBody({ ...six, auto: true }), six);
});
