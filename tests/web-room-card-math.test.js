import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleFor, bandBar, readingTiles, controlNote, freshAirLine, machineTiles, filterSummary, filterFrom, bottomLine, blocksLine, roomCard,
} from '../web/room-card-math.js';
import { fromRoom } from '../web/mimic-math.js';

// A line of parts (plain and bold text taking turns) as one text.
const lineText = (parts) => parts.join('');

const relay = (over = {}) => ({ address: 2, machines: ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier'].map((key) => ({ key, commanded: false, reported: false, running: false, status: 'off', ...over[key] })) });
const ac = (over = {}) => ({ address: 3, commanded: {}, reported: { power: true, mode: 'cool', setpoint: 21.5, fan: 'auto' }, roomT: 22, errorCode: 0, status: 'on', ...over });
const sensors = {
  trh: { status: 'online', lastOk: { t: 21.5, rh: 88, at: 1 } },
  co2: { status: 'online', lastOk: { co2: 960, at: 1 } },
};
const control = { auto: true, exchange: false, tLow: 21, tHigh: 23, rhLow: 90, rhHigh: 95, co2Low: 600, co2High: 900, co2Safety: 1250, exchangeEveryMin: 15, reasons: {} };
const draw = (over = {}) => fromRoom({ sensors, control, machines: { relay: relay(), ac: ac() }, ...over });

// ---- scales and band bars ----

test('scaleFor: T 15–30 °C, RH 70–100 %, CO₂ 400 to the larger of 1500 and the safety level + 100', () => {
  assert.deepEqual(scaleFor('T', {}), { min: 15, max: 30 });
  assert.deepEqual(scaleFor('RH', {}), { min: 70, max: 100 });
  assert.deepEqual(scaleFor('CO2', {}), { min: 400, max: 1500 });
  assert.deepEqual(scaleFor('CO2', { safety: 1250 }), { min: 400, max: 1500 });
  assert.deepEqual(scaleFor('CO2', { safety: 3000 }), { min: 400, max: 3100 });
});

test('scaleFor widens to hold the reading and the band, to a round step', () => {
  assert.deepEqual(scaleFor('T', { value: 33.4 }), { min: 15, max: 34 });
  assert.deepEqual(scaleFor('T', { value: 12.2 }), { min: 12, max: 30 });
  assert.deepEqual(scaleFor('RH', { value: 61 }), { min: 60, max: 100 });
  assert.deepEqual(scaleFor('RH', { low: 60, high: 75 }), { min: 60, max: 100 });
  assert.deepEqual(scaleFor('CO2', { value: 2140, safety: 1250 }), { min: 400, max: 2200 });
  assert.deepEqual(scaleFor('CO2', { value: 380 }), { min: 300, max: 1500 });
  assert.deepEqual(scaleFor('T', { value: null, low: NaN }), { min: 15, max: 30 }, 'missing numbers change nothing');
});

test('bandBar: the band as a zone and the reading as a mark, as shares of the scale; limits under the zone', () => {
  const b = bandBar('T', 22.5, 21, 24);
  assert.deepEqual(b.zone, { from: 6 / 15, to: 9 / 15 });
  assert.equal(b.mark, 7.5 / 15);
  assert.deepEqual(b.limits, [{ at: 6 / 15, text: '21' }, { at: 9 / 15, text: '24' }]);
  assert.deepEqual(bandBar('T', 21.5, 21.5, 23).limits[0], { at: 6.5 / 15, text: '21.5' });
  assert.deepEqual(bandBar('T', 21, 20.93333, 22.96667).limits.map((l) => l.text), ['20.9', '23'], 'a ramping band: one decimal');
  assert.deepEqual(bandBar('CO2', 900, 800, 1200, 2000).limits.map((l) => l.text), ['800', '1,200'], 'CO₂ thousands grouped like the value');
  const none = bandBar('RH', null, undefined, undefined);
  assert.equal(none.zone, null);
  assert.equal(none.mark, null);
  assert.deepEqual(none.limits, []);
  const co2 = bandBar('CO2', 3200, 600, 900, 1250);
  assert.equal(co2.mark, 1, 'the scale is widened: the mark stays on the bar');
  assert.ok(co2.zone.to < 0.2);
});

// ---- reading tiles ----

test('readingTiles: name, value and unit, chip, edge and bar per reading', () => {
  const [t, rh, co2] = readingTiles(draw(), control);
  assert.deepEqual([t.key, t.name, t.value, t.unit], ['T', 'Temperature', '21.5', '°C']);
  assert.deepEqual(t.chip, { lvl: 'good', text: '✓ In band' });
  assert.equal(t.edge, '');
  assert.deepEqual([rh.name, rh.value, rh.unit, rh.chip.text, rh.edge], ['Humidity', '88', '% RH', '▼ Below band', 'warn']);
  assert.deepEqual([co2.name, co2.value, co2.unit, co2.chip.text, co2.edge], ['CO₂', '960', 'ppm', '▲ Above band', 'warn']);
  assert.equal(t.label, 'Temperature 21.5 °C, band 21 to 23');
  assert.deepEqual(t.bar.zone, { from: 6 / 15, to: 8 / 15 });
});

test('readingTiles: red edge at the safety level, grey without data; thousands grouped', () => {
  const high = readingTiles(draw({ sensors: { ...sensors, co2: { status: 'online', lastOk: { co2: 1400 } } } }), control)[2];
  assert.deepEqual([high.value, high.chip.text, high.chip.lvl, high.edge], ['1,400', '▲ Safety level', 'critical', 'bad']);
  const none = readingTiles(fromRoom({}), null);
  for (const tile of none) {
    assert.equal(tile.value, '—');
    assert.equal(tile.edge, 'none');
    assert.equal(tile.bar.zone, null);
  }
  assert.equal(none[0].chip.text, 'Not wired');
  assert.equal(none[0].label, 'Temperature no data');
  const off = readingTiles(draw({ sensors: { ...sensors, trh: { status: 'offline', lastOk: { t: 20, rh: 91 } } } }), control)[0];
  assert.deepEqual([off.value, off.chip.text, off.edge], ['20.0', '! Offline', 'none'], 'the last value, marked offline');
});

// ---- the header note and the fresh-air line ----

test('controlNote: auto on with the fresh-air interval, auto off, nothing loaded', () => {
  assert.equal(controlNote(control), 'Automatic control on · fresh air every 15 min');
  assert.equal(controlNote({ ...control, exchangeEveryMin: 0 }), 'Automatic control on');
  assert.equal(controlNote({ auto: false }), 'Automatic control off');
  assert.equal(controlNote(null), '');
});

test('freshAirLine: exchange on, auto off, waits, next in N min, due, fresh air off', () => {
  const now = new Date(2026, 9, 26, 10, 50).getTime();
  const since = new Date(2026, 9, 26, 10, 42).getTime();
  const ends = new Date(2026, 9, 26, 10, 52).getTime();
  assert.equal(freshAirLine({ ...control, exchange: true, exchangeSince: since, exchangeEndsAt: ends, exchangeKind: 'co2' }, now),
    'Air exchange on since 10:42 (stops by 10:52) · CO₂');
  assert.equal(freshAirLine({ ...control, auto: false, exchange: true }, now), 'Automatic control off');
  assert.equal(freshAirLine({ ...control, freshFrom: now - 20 * 60_000, reasons: { exchange: 'Fresh air waits: outdoor air is very wet (dew 26.0 °C), at the latest 11:10' } }, now),
    'Fresh air waits: outdoor air is very wet (dew 26.0 °C), at the latest 11:10');
  assert.equal(freshAirLine({ ...control, freshFrom: now - 7 * 60_000 - 10_000 }, now), 'Next fresh air in 8 min');
  assert.equal(freshAirLine({ ...control, freshFrom: now - 14 * 60_000 - 50_000 }, now), 'Next fresh air in 1 min');
  assert.equal(freshAirLine({ ...control, freshFrom: now - 15 * 60_000 }, now), 'Fresh air due');
  assert.equal(freshAirLine({ ...control, freshFrom: null, exchangeEndedAt: now - 5 * 60_000 }, now), 'Next fresh air in 10 min',
    'no fresh-air start yet: it counts from the end of the last exchange, as the controller does');
  assert.equal(freshAirLine({ ...control, freshFrom: null, exchangeEndedAt: null }, now), 'Fresh air every 15 min');
  assert.equal(freshAirLine({ ...control, freshFrom: null }, now), 'Fresh air every 15 min');
  assert.equal(freshAirLine({ ...control, exchangeEveryMin: 0, freshFrom: now }, now), '');
  assert.equal(freshAirLine(null, now), '');
});

// ---- machine tiles ----

test('machineTiles: six in air-path order with their effect and detail', () => {
  const filter = { pa: 40.4 };
  const tiles = machineTiles(draw({ machines: { relay: relay({ dehumidifier: { status: 'off' }, circulation: { status: 'on', running: true } }), ac: ac() } }), control, filter);
  assert.deepEqual(tiles.map((m) => [m.step, m.name, m.effect]), [
    [1, 'Intake fan', 'Air in'], [2, 'Aircon', '− Temperature'], [3, 'Circulation', 'Mixes the air'],
    [4, 'Humidifier', '+ Humidity'], [5, 'Dehumidifier', '− Humidity'], [6, 'Exhaust fan', 'Air out'],
  ]);
  assert.deepEqual(tiles.map((m) => m.detail), ['Filter 40 Pa', 'Cool 21.5 °C · fan auto', 'Always on', 'Below 90 %', 'Above 95 %', 'With the intake']);
  assert.deepEqual(tiles.map((m) => m.on), [false, true, true, false, false, false]);
  assert.deepEqual(tiles[1].pill, { text: 'On', tone: 'on' });
  assert.deepEqual(tiles[0].pill, { text: 'Off', tone: 'off' });
});

test('machineTiles: five without a dehumidifier; no filter sensor; auto off', () => {
  const r = relay();
  r.machines = r.machines.filter((m) => m.key !== 'dehumidifier');
  const tiles = machineTiles(draw({ machines: { relay: r, ac: ac({ reported: { power: false, mode: 'cool', setpoint: 22, fan: 'low' } }) } }), { ...control, auto: false }, null);
  assert.deepEqual(tiles.map((m) => [m.step, m.key]), [[1, 'intake'], [2, 'ac'], [3, 'circ'], [4, 'hu'], [5, 'exhaust']]);
  assert.equal(tiles[0].detail, 'No filter sensor');
  assert.equal(tiles[1].detail, 'Off');
  assert.equal(tiles[2].detail, 'Set by hand');
  assert.equal(machineTiles(draw(), control, { pa: null })[0].detail, 'Filter: no reading yet');
  const fitted = relay();
  fitted.machines.find((m) => m.key === 'dehumidifier').status = 'not-fitted';
  assert.equal(machineTiles(draw({ machines: { relay: fitted, ac: ac() } }), control, null).length, 5);
});

test('machineTiles: no data and fault words in the pill', () => {
  const tiles = machineTiles(draw({ machines: { relay: relay({ intake: { status: 'not-following', running: false }, humidifier: { status: 'no-answer' } }), ac: ac({ status: 'fault', errorCode: 5 }) } }), control, null);
  const by = Object.fromEntries(tiles.map((m) => [m.key, m]));
  assert.deepEqual(by.intake.pill, { text: 'Not following', tone: 'warn' });
  assert.deepEqual(by.ac.pill, { text: 'Fault', tone: 'warn' });
  assert.equal(by.ac.detail, 'Fault (code 5) · fan auto');
  assert.deepEqual(by.hu.pill, { text: 'No answer', tone: 'none' });
  const nothing = machineTiles(fromRoom({}), null, null);
  assert.deepEqual(nothing[0].pill, { text: 'No data', tone: 'none' });
  assert.deepEqual(nothing[1].pill, { text: 'No data', tone: 'none' });
  assert.equal(nothing[1].detail, '', 'the aircon\'s pill says it: no second "No data"');
  assert.equal(nothing[3].detail, 'Below the band');
  assert.equal(nothing.length, 5);
  const notFollowing = machineTiles(draw({ machines: { relay: relay(), ac: ac({ status: 'not-following' }) } }), control, null)[1];
  assert.deepEqual(notFollowing.pill, { text: 'Not following', tone: 'warn' });
});

// ---- the filter, the bottom line and the blocks ----

test('filterSummary: the filter card\'s reading and due date, or null without a sensor', () => {
  const now = new Date(2026, 9, 26, 12).getTime();
  const room = { dpAddress: 9, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30, filterChangedAt: new Date(2026, 9, 23, 9).getTime() };
  const sensor = { status: 'online', lastOk: { pa: 40.4, at: now } };
  const f = filterSummary({ room, sensor, intake: true, lastRunning: null, now });
  assert.equal(f.pa, 40.4);
  assert.equal(lineText(f.line), 'Filter 40 Pa, change by 22 Nov');
  assert.deepEqual(f.line, ['Filter ', '40 Pa', ', change by 22 Nov']);
  const late = filterSummary({ room: { ...room, filterChangedAt: new Date(2026, 8, 1).getTime() }, sensor, intake: true, now });
  assert.equal(lineText(late.line), 'Filter 40 Pa, due since 1 Oct');
  assert.equal(lineText(filterSummary({ room: { ...room, filterChangeDays: 0 }, sensor, now }).line), 'Filter 40 Pa');
  const waiting = filterSummary({ room, sensor: { status: 'no-data', lastOk: null }, now });
  assert.equal(waiting.pa, null);
  assert.equal(lineText(waiting.line), 'Filter: no reading yet, change by 22 Nov');
  const off = filterSummary({ room, sensor: { status: 'online', lastOk: { pa: 0.2, at: now } }, intake: false, lastRunning: { at: now - 60_000, pa: 51 }, now });
  assert.equal(off.pa, 51, 'with the intake off: the last reading with it on');
  assert.equal(filterSummary({ room: { ...room, dpAddress: null }, sensor, now }), null);
  assert.equal(filterSummary({ room, sensor: { status: 'not-wired' }, now }), null);
  assert.equal(filterSummary({ room: null, sensor: null, now }), null);
});

test('bottomLine: outdoor air and the filter', () => {
  const out = fromRoom({ outdoor: { address: 7, status: 'online', last: { t: 32.94, rh: 61.6, at: 1000 } }, now: 2000 });
  const lines = bottomLine(out, { pa: 40, line: ['Filter ', '40 Pa', ', change by 22 Nov'] });
  assert.deepEqual(lines.map(lineText), ['Outdoor 32.9 °C · 62 % RH', 'Filter 40 Pa, change by 22 Nov']);
  assert.deepEqual(lines[0], ['Outdoor ', '32.9 °C', ' · 62 % RH']);
  assert.deepEqual(bottomLine(fromRoom({}), null).map(lineText), ['No outdoor sensor']);
  const half = fromRoom({ outdoor: { address: 7, status: 'offline', last: { t: null, rh: 61.6, at: 1000 } }, now: 2000 });
  assert.deepEqual(bottomLine(half, null).map(lineText), ['Outdoor — · 62 % RH'], 'a missing value: a dash, like the tiles');
  const none = fromRoom({ outdoor: { address: 7, status: 'no-data', last: null }, now: 2000 });
  assert.deepEqual(bottomLine(none, null).map(lineText), ['Outdoor — · —']);
});

test('filterFrom: the filter from replies that came in together; the last reading with the intake on is kept', () => {
  const now = new Date(2026, 9, 26, 12).getTime();
  const room = { dpAddress: 9, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30, filterChangedAt: new Date(2026, 9, 23, 9).getTime() };
  const machines = (intake) => ({ relay: relay({ intake: { status: intake ? 'on' : 'off', running: intake } }) });
  const on = filterFrom({ last: null, room, sensor: { status: 'online', lastOk: { pa: 51.2, at: now - 5000 } }, machines: machines(true), now });
  assert.equal(on.filter.pa, 51.2);
  assert.deepEqual(on.last, { at: now - 5000, pa: 51.2 });
  // the intake stops: its sensor reads about 0, the card keeps the reading taken with it on
  const off = filterFrom({ last: on.last, room, sensor: { status: 'online', lastOk: { pa: 0.1, at: now } }, machines: machines(false), now });
  assert.equal(off.filter.pa, 51.2);
  assert.deepEqual(off.last, on.last);
  assert.deepEqual(filterFrom({ last: null, room: { ...room, dpAddress: null }, sensor: null, machines: null, now }), { last: null, filter: null });
});

test('blocksLine: the crops\' blocks under the container', () => {
  assert.equal(blocksLine([{ crop: 'lionsmane', blocks: 950 }]), "950 lion's mane blocks");
  assert.equal(blocksLine([{ crop: 'oyster', blocks: 1200 }]), '1,200 grey oyster blocks');
  assert.equal(blocksLine([{ crop: 'oyster', blocks: 500 }, { crop: 'reishi', blocks: 450 }]), '950 blocks: 500 grey oyster, 450 reishi');
  assert.equal(blocksLine([{ crop: 'unknown', blocks: 10 }]), '10 blocks');
  assert.equal(blocksLine([]), '');
  assert.equal(blocksLine(undefined), '');
});

test('roomCard puts it together and never throws', () => {
  const now = Date.now();
  const card = roomCard({ draw: draw(), control: { ...control, freshFrom: now - 7 * 60_000 }, filter: null, now });
  assert.equal(card.note, 'Automatic control on · fresh air every 15 min');
  assert.equal(card.tiles.length, 3);
  assert.equal(card.fresh, 'Next fresh air in 8 min');
  assert.equal(card.machines.length, 6);
  assert.deepEqual(card.bottom.map(lineText), ['No outdoor sensor']);
  const empty = roomCard({});
  assert.equal(empty.note, '');
  assert.equal(empty.fresh, '');
  assert.equal(empty.tiles.length, 3);
});
