// The Energy card's Data integrity words (spec 2026-11-12-data-integrity-design.md 7.2, 9; G12, G17): a tile part estimated, a
// day the app could not see the room, a room with no sensor, and the machines' RM shares of the server's priced total (not
// the browser's kWh × today's price). Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { periodTile, barSeries, barTip, barsSummary, breakdown, unseenText, noSensorLine, NO_SENSOR } from '../web/usage-math.js';

const H = 3_600_000;
const day = (date, kWh, extra = {}) => ({ date, kWh, metered: false, byMachine: { intake: kWh }, waterL: 0, ...extra });

test('a tile part estimated: some of its RM from the meter, some from machine run time', () => {
  assert.equal(periodTile('7 days', { kWh: 30, cost: 16.5, estimated: 5.2, waterL: 0, waterCost: null, metered: false }).basis, 'part estimated');
  assert.equal(periodTile('7 days', { kWh: 30, cost: 16.5, estimated: 16.5, waterL: 0, waterCost: null, metered: false }).basis, 'estimated');
  assert.equal(periodTile('30 days', { kWh: 30, cost: 16.5, estimated: 0, waterL: 0, waterCost: null, metered: true }).basis, 'metered');
  assert.equal(periodTile('Today', { kWh: 0, cost: 0, estimated: 0, waterL: 0, waterCost: null, metered: false }).basis, 'estimated', 'an older reply or nothing used');
});

test('the time not seen, to 5 minutes as Costs\' note: "7 h 5 min", "24 h"; none under 5 minutes', () => {
  assert.equal(unseenText(7 * H + 5 * 60_000), '7 h 5 min');
  assert.equal(unseenText(24 * H), '24 h');
  assert.equal(unseenText(40 * 60_000), '40 min');
  assert.equal(unseenText(2 * 60_000), null);
  assert.equal(unseenText(0), null);
  assert.equal(unseenText(undefined), null);
});

test('G12: a day the room was not seen says so in its read-out and in the chart\'s words', () => {
  const series = barSeries([day('2026-11-03', 3.42, { unseenMs: 7 * H + 5 * 60_000 }), day('2026-11-04', 0, { unseenMs: 24 * H }), day('2026-11-05', 2)], 'kWh');
  assert.equal(barTip(series[0], 'energy'), '3 Nov  3.4 kWh (estimated) · not seen 7 h 5 min');
  assert.equal(barTip(series[1], 'energy'), '4 Nov  0.0 kWh (estimated) · not seen 24 h');
  assert.equal(barTip(series[2], 'energy'), '5 Nov  2.0 kWh (estimated)');
  assert.match(barsSummary(series, 'energy'), /, not seen on 2 days$/);
  assert.equal(barTip({ ...series[0] }, 'water'), '3 Nov  3.4 L', 'water: no basis, no unseen');
});

test('a room with no sensor: its electricity is all the app\'s estimate', () => {
  assert.equal(NO_SENSOR, 'No sensor: estimated from what the app switched');
  assert.equal(noSensorLine({ trhAddress: null, co2Address: null, meterAddress: null, dpAddress: null, relayAddress: 3 }), NO_SENSOR);
  assert.equal(noSensorLine({ trhAddress: 2, co2Address: null, meterAddress: null, dpAddress: null }), null);
  assert.equal(noSensorLine({ meterAddress: 31 }), null);
  assert.equal(noSensorLine(null), null, 'the room not read yet');
});

test('G17: the machines\' RM are shares of the server\'s priced total, which the Total row shows as it is', () => {
  const days = [day('2026-10-19', 1.01, { byMachine: { intake: 0.505, ac: 0.505 } }), day('2026-10-20', 1.01, { byMachine: { intake: 1.01 } })];
  const b = breakdown(days, 0.55, { cost: 1.12 });
  assert.equal(b.total.cost, 1.12, 'RM 0.56 a day, not 2.02 kWh × RM 0.55 = RM 1.11');
  assert.equal(b.rows.find((r) => r.key === 'ac').cost, 0.28);
  assert.equal(b.rows.find((r) => r.key === 'intake').cost, 0.84);
  assert.equal(breakdown(days, 0.55, { cost: null }).total.cost, null);
  const card = readFileSync(new URL('../web/usage.js', import.meta.url), 'utf8');
  assert.ok(card.includes('breakdown(days, null, { dehumidifier, lights, cost: usage?.last30?.cost ?? null })'), 'the card passes the server\'s RM');
  assert.ok(card.includes('noSensorLine(getRoom?.())'));
});
