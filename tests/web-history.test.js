// Pure helpers of the long-range charts and the machine timeline (web/history-math.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANGES, rangeOf, timeTicks, historyPoints, timelineSpans, acMarks, thinMarks, markLabel, tickCountFor, chartDrawKey, TIMELINE_ROWS, wiredTimelineRows, formatStamp } from '../web/history-math.js';

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();

test('the range choice: Live first, then 1 h, 6 h, 24 h, 7 d, 30 d', () => {
  assert.deepEqual(RANGES.map((r) => [r.key, r.label, r.hours]), [
    ['live', 'Live', null], ['1h', '1 h', 1], ['6h', '6 h', 6], ['24h', '24 h', 24], ['7d', '7 d', 168], ['30d', '30 d', 720],
  ]);
  assert.equal(rangeOf('6h').hours, 6);
  assert.equal(rangeOf('nope').key, 'live');
});

test('time ticks sit on round local times, about one per 90 px, with the time of day', () => {
  const ticks = timeTicks(at(19, 9, 11), at(19, 10, 11), 6);
  assert.ok(ticks.length >= 3 && ticks.length <= 6, String(ticks.length));
  assert.deepEqual(ticks.map((t) => t.label).slice(0, 2), ['09:20', '09:30']);
  for (const t of ticks) assert.ok(t.at >= at(19, 9, 11) && t.at <= at(19, 10, 11));
});

test('a day-long range ticks on hours', () => {
  const ticks = timeTicks(at(18, 10), at(19, 10), 6);
  assert.deepEqual(ticks.map((t) => t.label), ['12:00', '16:00', '20:00', '00:00', '04:00', '08:00']);
});

test('7 and 30 day ranges tick on days and show the date', () => {
  const week = timeTicks(at(12, 10), at(19, 10), 8);
  assert.deepEqual(week.map((t) => t.label), ['13 Oct', '14 Oct', '15 Oct', '16 Oct', '17 Oct', '18 Oct', '19 Oct']);
  const month = timeTicks(at(19, 10) - 30 * 86_400_000, at(19, 10), 6);
  assert.ok(month.length >= 4 && month.length <= 8);
  assert.match(month[0].label, /^\d{1,2} [A-Z][a-z]{2}$/);
});

test('no ticks for an empty or reversed window', () => {
  assert.deepEqual(timeTicks(5, 5, 6), []);
  assert.deepEqual(timeTicks(9, 5, 6), []);
});

test('a stamp is the clock today and the date and clock on another day', () => {
  assert.equal(formatStamp(at(19, 10, 42), at(19, 12)), '10:42');
  assert.equal(formatStamp(at(12, 10, 42), at(19, 12)), '12 Oct 10:42');
});

test('history points: one per bucket, a gap of more than 3 buckets breaks the line', () => {
  const rows = [{ at: 0, t: 20 }, { at: 60_000, t: 21 }, { at: 600_000, t: 22 }];
  const pts = historyPoints(rows, 't', 60);
  assert.deepEqual(pts, [
    { at: 0, value: 20 }, { at: 60_000, value: 21 }, { at: 330_000, value: null }, { at: 600_000, value: 22 },
  ]);
  assert.deepEqual(historyPoints([], 't', 60), []);
  // a slow reading interval widens the limit: 15 s buckets of 300 s polls are 300 s apart and must not be dots
  const slow = [{ at: 0, t: 20 }, { at: 300_000, t: 21 }, { at: 600_000, t: 22 }, { at: 1_800_000, t: 23 }];
  assert.equal(historyPoints(slow, 't', 15).length, 7);
  assert.deepEqual(historyPoints(slow, 't', 15, 300).map((p) => p.value), [20, 21, 22, null, 23]);
  assert.deepEqual(historyPoints([{ at: 1, t: null }], 't', 60), []);
});

test('timeline spans: on-periods, the last state runs to the end, off rows give none', () => {
  const rows = [
    { at: 1000, on: true, source: 'auto' },
    { at: 2000, on: false, source: 'auto' },
    { at: 3000, on: true, source: 'manual' },
    { at: 3500, on: true, source: 'manual' },
  ];
  assert.deepEqual(timelineSpans(rows, 1000, 5000), [
    { from: 1000, to: 2000, source: 'auto' },
    { from: 3000, to: 5000, source: 'manual' },
  ]);
  assert.deepEqual(timelineSpans([], 0, 10), []);
  assert.deepEqual(timelineSpans([{ at: 1, on: false, source: 'auto' }], 0, 10), []);
});

test('the aircon: a span per setpoint, labelled with the setpoint where it changes', () => {
  const rows = [
    { at: 1000, on: true, setpoint: 24, mode: 'cool', fan: 'auto', source: 'auto' },
    { at: 2000, on: true, setpoint: 23.5, mode: 'cool', fan: 'auto', source: 'auto' },
    { at: 3000, on: true, setpoint: 23.5, mode: 'cool', fan: 'high', source: 'auto' },
    { at: 4000, on: false, setpoint: 23.5, mode: 'cool', fan: 'high', source: 'auto' },
  ];
  assert.deepEqual(acMarks(rows), [{ at: 1000, text: '24 °C' }, { at: 2000, text: '23.5 °C' }]);
  assert.deepEqual(timelineSpans(rows, 1000, 5000), [{ from: 1000, to: 4000, source: 'auto' }]);
});

test('the timeline rows are Intake, Exhaust, Circulation, Humidifier, Dehumidifier, Aircon', () => {
  assert.deepEqual(TIMELINE_ROWS.map((r) => r.key), ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'ac']);
  assert.deepEqual(TIMELINE_ROWS.map((r) => r.label), ['Intake', 'Exhaust', 'Circulation', 'Humidifier', 'Dehumidifier', 'Aircon']);
});

test('the room page shows the rows of what is wired; the Dehumidifier only when the room has one', () => {
  const keys = (room) => wiredTimelineRows(room).map((r) => r.key);
  assert.deepEqual(keys({ relayAddress: 3, acAddress: 4, dehumidifier: false }), ['intake', 'exhaust', 'circulation', 'humidifier', 'ac']);
  assert.deepEqual(keys({ relayAddress: 3, acAddress: null, dehumidifier: true }), ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier']);
  assert.deepEqual(keys({ relayAddress: null, acAddress: 4, dehumidifier: true }), ['ac']);
  assert.deepEqual(keys({ relayAddress: null, acAddress: null }), []);
  assert.deepEqual(keys({ relayAddress: 3, acAddress: null }), ['intake', 'exhaust', 'circulation', 'humidifier']);
});

test('marks closer than 40 px to the previous kept one are skipped', () => {
  const marks = [{ at: 0, text: 'a' }, { at: 30, text: 'b' }, { at: 40, text: 'c' }, { at: 70, text: 'd' }, { at: 90, text: 'e' }];
  assert.deepEqual(thinMarks(marks, (at) => at).map((m) => m.text), ['a', 'c', 'e']);
  assert.deepEqual(thinMarks(marks, (at) => at / 10).map((m) => m.text), ['a']);
  assert.deepEqual(thinMarks(undefined, (at) => at), []);
});

test('one axis label per 90 px, at least 2', () => {
  assert.equal(tickCountFor(900), 10);
  assert.equal(tickCountFor(359), 3);
  assert.equal(tickCountFor(50), 2);
});

test('the chart redraw key changes with the bands, the sensor statuses and the relay and aircon addresses', () => {
  const sensors = { trh: { status: 'online' }, co2: { status: 'online' } };
  const room = { relayAddress: 3, acAddress: 4 };
  const key = chartDrawKey({ tLow: 21 }, sensors, room);
  assert.equal(chartDrawKey({ tLow: 21 }, sensors, { ...room }), key);
  assert.notEqual(chartDrawKey({ tLow: 22 }, sensors, room), key);
  assert.notEqual(chartDrawKey({ tLow: 21 }, { ...sensors, co2: { status: 'offline' } }, room), key);
  assert.notEqual(chartDrawKey({ tLow: 21 }, sensors, { ...room, relayAddress: null }), key);
  assert.notEqual(chartDrawKey({ tLow: 21 }, sensors, { ...room, acAddress: 9 }), key);
  assert.notEqual(chartDrawKey({ tLow: 21 }, sensors, { ...room, dehumidifier: true }), key);
});

test('markLabel: a label right of its mark, or left of it when it would run past the right edge', () => {
  assert.deepEqual(markLabel(100, '22 °C', 400), { x: 103, anchor: 'start' });
  // 5 characters at 11 px: about 33 px wide
  assert.deepEqual(markLabel(365, '22 °C', 400), { x: 362, anchor: 'end' });
  assert.deepEqual(markLabel(390, '22 °C', 400), { x: 387, anchor: 'end' });
  assert.deepEqual(markLabel(364, '22 °C', 400), { x: 367, anchor: 'start' }, 'fits exactly');
  assert.deepEqual(markLabel(398, '17.5 °C', 400, 12), { x: 395, anchor: 'end' });
});
