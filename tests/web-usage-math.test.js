// Pure helpers of the energy and water cards (web/usage-math.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatKWh, formatRM, formatLitres, dateLabel, periodTile, usageTiles, barSeries, niceMax, barLayout, barAt, barsSummary, barTip,
  breakdown, breakdownNote, roomLines, axisLabel,
} from '../web/usage-math.js';

const day = (date, kWh, metered, byMachine = {}, waterL = 0) => ({ date, kWh, metered, waterL, byMachine: { intake: 0, exhaust: 0, circulation: 0, humidifier: 0, ac: 0, rest: 0, ...byMachine } });

test('numbers as text: kWh, RM and litres; missing numbers are a dash', () => {
  assert.equal(formatKWh(12.345), '12.3 kWh');
  assert.equal(formatKWh(1234.5), '1,235 kWh');
  assert.equal(formatKWh(null), '—');
  assert.equal(formatKWh(undefined), '—');
  assert.equal(formatRM(6.7), 'RM 6.70');
  assert.equal(formatRM(NaN), '—');
  assert.equal(formatLitres(4.25), '4.3 L');
  assert.equal(formatLitres(48), '48 L');
  assert.equal(formatLitres(1440), '1,440 L');
  assert.equal(formatLitres('x'), '—');
});

test('dateLabel: 12 Oct; an odd value comes back as it is', () => {
  assert.equal(dateLabel('2026-10-12'), '12 Oct');
  assert.equal(dateLabel('2026-01-05'), '5 Jan');
  assert.equal(dateLabel('soon'), 'soon');
  assert.equal(dateLabel(undefined), '—');
});

test('a tile: the water cost line only with a water price; metered or estimated', () => {
  const t = periodTile('Today', { kWh: 9.8, cost: 5.39, waterL: 36, waterCost: null, metered: false });
  assert.deepEqual(t, { label: 'Today', kWh: '9.8 kWh', cost: 'RM 5.39', water: '36 L', waterCost: null, basis: 'estimated' });
  const w = periodTile('30 days', { kWh: 300, cost: 165, waterL: 1080, waterCost: 0.54, metered: true });
  assert.equal(w.waterCost, 'RM 0.54');
  assert.equal(w.basis, 'metered');
});

test('tiles of a missing reply are dashes and do not throw', () => {
  const tiles = usageTiles(null);
  assert.deepEqual(tiles.map((t) => t.label), ['Today', '7 days', '30 days']);
  assert.equal(tiles[0].kWh, '—');
  assert.equal(tiles[0].basis, '');
  assert.deepEqual(usageTiles({ today: {}, last30: {} }, false).map((t) => t.label), ['Today', '30 days']);
});

test('niceMax rounds up to 1, 2 or 5 times a power of ten', () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(NaN), 1);
  assert.equal(niceMax(0.7), 1);
  assert.equal(niceMax(1.2), 2);
  assert.equal(niceMax(3.4), 5);
  assert.equal(niceMax(5.1), 10);
  assert.equal(niceMax(14.2), 20);
  assert.equal(niceMax(480), 500);
});

test('bar layout: bars sit in their slots, the tallest reaches the nice top, the last bar is labelled', () => {
  const series = barSeries([day('2026-10-18', 5, false), day('2026-10-19', 10, true), day('2026-10-20', null, false)], 'kWh');
  assert.deepEqual(series.map((s) => s.v), [5, 10, null]);
  const L = barLayout(series, 300, 200);
  assert.equal(L.max, 10);
  assert.equal(L.bars.length, 3);
  assert.equal(L.bars[1].y, L.plot.y1); // 10 of 10: full height
  assert.ok(Math.abs(L.bars[0].h - L.bars[1].h / 2) < 1e-9);
  assert.equal(L.bars[2].h, 0); // no number: empty slot
  assert.ok(L.bars.every((b) => b.x >= L.plot.x0 && b.x + b.w <= L.plot.x1));
  assert.ok(L.bars[0].x < L.bars[1].x && L.bars[1].x < L.bars[2].x);
  assert.equal(L.xTicks[L.xTicks.length - 1].label, '20 Oct');
  assert.deepEqual(L.yTicks.map((t) => t.v), [0, 5, 10]);
});

test('bar layout with 30 days at 390 px thins the date labels and keeps them inside', () => {
  const days = Array.from({ length: 30 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, i + 1, false));
  const L = barLayout(barSeries(days, 'kWh'), 342, 170);
  assert.ok(L.xTicks.length < 8 && L.xTicks.length >= 3);
  assert.equal(L.xTicks[L.xTicks.length - 1].label, '30 Sep');
  assert.ok(L.xTicks.every((t) => t.x >= L.plot.x0 && t.x <= L.plot.x1));
  for (let i = 1; i < L.xTicks.length; i++) assert.ok(L.xTicks[i].x - L.xTicks[i - 1].x >= 60);
});

test('bar layout of nothing does not throw', () => {
  const L = barLayout([], 300, 200);
  assert.deepEqual(L.bars, []);
  assert.deepEqual(L.xTicks, []);
  assert.equal(L.max, 1);
  assert.equal(barAt(L, 100), -1);
});

test('barAt finds the bar nearest to the pointer', () => {
  const L = barLayout(barSeries([day('2026-10-19', 1, false), day('2026-10-20', 2, false)], 'kWh'), 300, 200);
  assert.equal(barAt(L, L.plot.x0 + 2), 0);
  assert.equal(barAt(L, L.plot.x1 - 2), 1);
});

test('the summary says the finding in words', () => {
  const series = barSeries([day('2026-10-18', 5, true), day('2026-10-19', 14.2, false), day('2026-10-20', 9.8, false)], 'kWh');
  assert.equal(barsSummary(series, 'energy'),
    'Energy per day, last 3 days: total 29.0 kWh, highest 14.2 kWh on 19 Oct, today 9.8 kWh, 1 day metered, the rest estimated');
  assert.match(barsSummary(barSeries([day('2026-10-20', 1, false)], 'kWh'), 'energy'), /all estimated$/);
  assert.match(barsSummary(barSeries([day('2026-10-20', 1, true)], 'kWh'), 'energy'), /all metered$/);
  const water = barsSummary(barSeries([day('2026-10-19', 0, false, {}, 30), day('2026-10-20', 0, false, {}, 48)], 'waterL'), 'water');
  assert.equal(water, 'Water per day, last 2 days: total 78 L, highest 48 L on 20 Oct, today 48 L');
  assert.equal(barsSummary([], 'energy'), 'Energy per day: no data');
});

test('the tooltip of a bar names the day, the value and how it was worked out', () => {
  assert.equal(barTip({ date: '2026-10-12', v: 12.34, metered: true }, 'energy'), '12 Oct  12.3 kWh (metered)');
  assert.equal(barTip({ date: '2026-10-12', v: 40, metered: false }, 'water'), '12 Oct  40 L');
  assert.equal(axisLabel(5), '5');
  assert.equal(axisLabel(2.5), '2.5');
});

test('breakdown of estimated days: the aircon row, shares and cost', () => {
  const days = [
    day('2026-10-19', 8, false, { intake: 1, exhaust: 1, circulation: 2, humidifier: 1, ac: 3 }),
    day('2026-10-20', 4, false, { intake: 1, exhaust: 1, circulation: 0, humidifier: 1, ac: 1 }),
  ];
  const b = breakdown(days, 0.5);
  assert.deepEqual(b.rows.map((r) => r.key), ['intake', 'exhaust', 'circulation', 'humidifier', 'ac']);
  assert.equal(b.total.kWh, 12);
  assert.equal(b.total.cost, 6);
  const ac = b.rows.find((r) => r.key === 'ac');
  assert.equal(ac.kWh, 4);
  assert.ok(Math.abs(ac.share - 4 / 12) < 1e-9);
  assert.equal(ac.cost, 2);
});

test('breakdown of metered days: "rest" replaces the aircon; a mix shows both', () => {
  const metered = [day('2026-10-20', 10, true, { intake: 1, exhaust: 1, circulation: 1, humidifier: 1, rest: 6 })];
  assert.deepEqual(breakdown(metered, 0.5).rows.map((r) => r.key), ['intake', 'exhaust', 'circulation', 'humidifier', 'rest']);
  assert.equal(breakdown(metered, 0.5).rows.at(-1).label, 'Not split by machine (mostly the aircon)');
  const mix = [...metered, day('2026-10-19', 5, false, { ac: 2 })];
  assert.deepEqual(breakdown(mix, 0.5).rows.map((r) => r.key).slice(-2), ['ac', 'rest']);
});

test('breakdown of nothing: fan rows of zero, no shares, no cost without a price', () => {
  const b = breakdown(undefined, null);
  assert.equal(b.total.kWh, 0);
  assert.equal(b.total.cost, null);
  assert.ok(b.rows.every((r) => r.share === null && r.cost === null));
  assert.equal(breakdownNote([]), '');
});

test('the note under the table says how the days were worked out', () => {
  const m = day('a', 1, true);
  const e = day('b', 1, false);
  assert.match(breakdownNote([m, m]), /^Metered/);
  assert.match(breakdownNote([e]), /upper bound/);
  assert.match(breakdownNote([m, e]), /^1 of 2 days metered/);
});

test('farm room lines: one per room with today and 30 days; a missing list is empty', () => {
  const lines = roomLines({ rooms: [{ id: 3, name: 'A', today: { kWh: 2, cost: 1.1 }, last30: { kWh: 60 } }] });
  assert.deepEqual(lines, [{ id: 3, href: '#/rooms/3/history', name: 'A', today: '2.0 kWh ·\u00a0RM 1.10', last30: '60.0 kWh ·\u00a0—' }]);
  assert.deepEqual(roomLines(null), []);
});

test('axis labels keep the decimals small values need; the last date label ends at the plot edge', async () => {
  const { axisLabel, barLayout, barSeries } = await import('../web/usage-math.js');
  assert.deepEqual([0, 0.05, 0.1, 0.25, 2.5, 5, 1250].map(axisLabel), ['0', '0.05', '0.1', '0.25', '2.5', '5', '1,250']);
  const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, kWh: 1, metered: false }));
  const layout = barLayout(barSeries(days, 'kWh'), 600, 200);
  const last = layout.xTicks.at(-1);
  assert.equal(last.anchor, 'end');
  assert.equal(last.x, layout.plot.x1);
  assert.equal(layout.xTicks[0].anchor, undefined);
});

test('a simulation run\'s energy bars: no metered or estimated wording, no today', async () => {
  const { barsSummary, barTip } = await import('../web/usage-math.js');
  const series = [{ date: 'day 1', v: 5, metered: false }, { date: 'day 2', v: 7.5, metered: false }];
  assert.equal(barsSummary(series, 'run-energy'), 'Energy per day, 2 days: total 12.5 kWh, highest 7.5 kWh on day 2');
  assert.equal(barTip({ date: 'day 2', v: 7.5, metered: false }, 'run-energy'), 'day 2  7.5 kWh');
  assert.match(barTip({ date: '2026-10-12', v: 7.5, metered: false }, 'energy'), /estimated/);
});

test('breakdown: a Dehumidifier row after the Humidifier when the room has one, or when it used energy', () => {
  const days = [day('2026-10-19', 8, false, { intake: 1, exhaust: 1, circulation: 2, humidifier: 1, dehumidifier: 2, ac: 1 })];
  const b = breakdown(days, 0.5);
  assert.deepEqual(b.rows.map((r) => r.key), ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'ac']);
  assert.equal(b.rows.find((r) => r.key === 'dehumidifier').label, 'Dehumidifier');
  assert.equal(b.rows.find((r) => r.key === 'dehumidifier').kWh, 2);
  assert.equal(b.total.kWh, 8);
  const none = [day('2026-10-19', 5, false, { intake: 1, ac: 4 })];
  assert.equal(breakdown(none, 0.5).rows.some((r) => r.key === 'dehumidifier'), false);
  assert.equal(breakdown(none, 0.5, { dehumidifier: true }).rows.find((r) => r.key === 'dehumidifier').kWh, 0);
});

test('the breakdown note says the dehumidifier is estimated too when metered and fitted', () => {
  const metered = [day('2026-10-20', 10, true, {})];
  assert.match(breakdownNote(metered), /fans and the humidifier are estimated/);
  assert.match(breakdownNote(metered, { dehumidifier: true }), /fans, the humidifier and the dehumidifier are estimated/);
});

// Critique 2026-10-29: the energy tables said "Intake", "Exhaust", "Circulation" while the Machines list said the fans' names.
test('the energy tables name the machines as the Machines list does', async () => {
  const { MACHINE_ROWS } = await import('../web/usage-math.js');
  const { MACHINE_NAMES } = await import('../web/machines-math.js');
  for (const row of MACHINE_ROWS.filter((r) => MACHINE_NAMES[r.key])) assert.equal(row.label, MACHINE_NAMES[row.key], row.key);
});
