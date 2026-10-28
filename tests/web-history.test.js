// Pure helpers of the long-range charts and the machine timeline (web/history-math.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANGES, rangeOf, timeTicks, historyPoints, timelineSpans, acMarks, markLabel, markRuns, tickCountFor, chartDrawKey, TIMELINE_ROWS, wiredTimelineRows, formatStamp } from '../web/history-math.js';

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
  assert.deepEqual(acMarks(rows), [{ at: 1000, text: '24 °C', value: 24 }, { at: 2000, text: '23.5 °C', value: 23.5 }]);
  assert.deepEqual(timelineSpans(rows, 1000, 5000), [{ from: 1000, to: 4000, source: 'auto' }]);
});

test('the timeline rows are Intake, Exhaust, Circulation, Humidifier, Dehumidifier, Lights, Aircon', () => {
  assert.deepEqual(TIMELINE_ROWS.map((r) => r.key), ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights', 'ac']);
  assert.deepEqual(TIMELINE_ROWS.map((r) => r.label), ['Intake', 'Exhaust', 'Circulation', 'Humidifier', 'Dehumidifier', 'Lights', 'Aircon']);
});

test('the room page shows the rows of what is wired; the Dehumidifier only when the room has one', () => {
  const keys = (room) => wiredTimelineRows(room).map((r) => r.key);
  assert.deepEqual(keys({ relayAddress: 3, acAddress: 4, dehumidifier: false }), ['intake', 'exhaust', 'circulation', 'humidifier', 'ac']);
  assert.deepEqual(keys({ relayAddress: 3, acAddress: null, dehumidifier: true }), ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier']);
  assert.deepEqual(keys({ relayAddress: null, acAddress: 4, dehumidifier: true }), ['ac']);
  assert.deepEqual(keys({ relayAddress: null, acAddress: null }), []);
  assert.deepEqual(keys({ relayAddress: 3, acAddress: null }), ['intake', 'exhaust', 'circulation', 'humidifier']);
});

// Critique 2026-10-28: a setpoint switching 16 ↔ 20 °C faster than labels fit showed a tidy "20 °C 16 °C 20 °C" that
// was not what happened. A run of marks too close to label each is named once.
test('markRuns: a run of setpoints switching faster than labels fit is labelled once ("16–20 °C, switching")', () => {
  const mark = (at, v) => ({ at, text: `${v} °C`, value: v });
  const fast = [mark(0, 20), mark(10, 16), mark(20, 20), mark(30, 16), mark(40, 20), mark(300, 18)];
  assert.deepEqual(markRuns(fast, (at) => at, 1000), [
    { at: 0, x: 3, anchor: 'start', text: '16–20 °C, switching' },
    { at: 300, x: 303, anchor: 'start', text: '18 °C' },
  ]);
  assert.deepEqual(markRuns([mark(0, 20), mark(20, 16), mark(300, 16)], (at) => at, 1000).map((l) => l.text), ['20 → 16 °C'], 'two close marks: the change; the same words again are not repeated');
  assert.deepEqual(markRuns([mark(0, 20), mark(100, 20), mark(200, 16)], (at) => at, 1000).map((l) => l.text), ['20 °C', '16 °C']);
  assert.deepEqual(markRuns([...fast.slice(0, 5), mark(100, 18)], (at) => at, 1000).map((l) => l.text), ['16–20 °C, switching'], 'a label that would run over the last one is left out');
  assert.deepEqual(markRuns([mark(990, 20)], (at) => at, 1000), [{ at: 990, x: 987, anchor: 'end', text: '20 °C' }], 'kept inside on the right');
  assert.deepEqual(markRuns(undefined, (at) => at, 1000), []);
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

// A gap in the readings (the app or the sensors were off) is the same gap on every chart of the History tab (critique
// 2026-10-28: water bars and the machine timeline ran solidly through "No readings").
test('readingGaps: the stretches with no readings, by the same rule as the chart lines', async () => {
  const { readingGaps } = await import('../web/history-math.js');
  const rows = [{ at: 0, t: 20 }, { at: 300_000, t: 20 }, { at: 3_900_000, t: 21 }, { at: 4_200_000, t: 21 }];
  assert.deepEqual(readingGaps(rows, 300, 5), [{ from: 300_000, to: 3_900_000 }]);
  assert.deepEqual(readingGaps([], 300, 5), []);
  assert.deepEqual(readingGaps(undefined, 300, 5), []);
});

test('outsideGaps: a bar inside a gap is dropped; a timeline span is cut where the gap is', async () => {
  const { barsOutsideGaps, spansOutsideGaps } = await import('../web/history-math.js');
  const gaps = [{ from: 100, to: 200 }];
  assert.deepEqual(barsOutsideGaps([{ from: 0, to: 100, v: 1 }, { from: 120, to: 180, v: 2 }, { from: 200, to: 300, v: 3 }], gaps).map((b) => b.v), [1, 3]);
  assert.deepEqual(spansOutsideGaps([{ from: 50, to: 250, source: 'auto' }, { from: 130, to: 170, source: 'manual' }], gaps),
    [{ from: 50, to: 100, source: 'auto' }, { from: 200, to: 250, source: 'auto' }]);
  assert.deepEqual(spansOutsideGaps([{ from: 0, to: 10, source: 'auto' }], []), [{ from: 0, to: 10, source: 'auto' }]);
});

test('the timeline writes its row names and setpoint labels at 12 px, the setpoints through markRuns', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../web/timeline.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /'font-size': 11/);
  assert.match(src, /svg\.append\(el\('text', \{ x: 4, y: y \+ 11, style: 'fill:var\(--muted\)', 'font-size': 12 \}, row\.label\)\);/, 'above its bar: wider than the margin at 12 px');
  assert.match(src, /for \(const label of markRuns\(row\.marks, xAt, width - 2\)\)/);
});
