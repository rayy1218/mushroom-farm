import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleFor, bandBar, readingTiles, controlNote, freshAirLine, machineTiles, filterSummary, filterFrom, bottomLine, blocksLine, roomCard, cropFacts, stayed,
  traceOf, cropSummary, hourPoints, traceScale,
} from '../web/room-card-math.js';
import { formatDateTime } from '../web/simulation-math.js';
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

test('readingTiles: name, value and unit (humidity to one decimal, as the bands are set), chip, edge and bar per reading', () => {
  const [t, rh, co2] = readingTiles(draw(), control);
  assert.deepEqual([t.key, t.name, t.value, t.unit], ['T', 'Temperature', '21.5', '°C']);
  assert.deepEqual(t.chip, { lvl: 'good', text: '✓ In band' });
  assert.equal(t.edge, '');
  assert.deepEqual([rh.name, rh.value, rh.unit, rh.chip.text, rh.edge], ['Humidity', '88.0', '% RH', '▼ Below band', 'warn']);
  assert.deepEqual([co2.name, co2.value, co2.unit, co2.chip.text, co2.edge], ['CO₂', '960', 'ppm', '▲ Over the start point', 'warn'], 'over the start point and the exchange off');
  assert.equal(t.label, 'Temperature 21.5 °C, band 21 to 23');
  assert.deepEqual(t.bar.zone, { from: 6 / 15, to: 8 / 15 });
});

test('readingTiles: the band written out for the reading card ("Band 21–23 °C"), empty before the bands loaded', () => {
  const [t, rh, co2] = readingTiles(draw(), control);
  assert.equal(t.band, 'Band 21–23 °C');
  assert.equal(rh.band, 'Band 90–95 % RH');
  assert.equal(co2.band, 'Air exchange starts at 900 ppm, stops at 600 ppm');
  assert.equal(readingTiles(draw(), null)[0].band, '');
});

// ---- the reading cards' trace of the recent readings (redesign 2026-10-28) ----

test('traceOf: a line through the recent readings over the time they span, the band shaded, zoomed to the band and the values', () => {
  const pts = [{ at: 0, value: 20 }, { at: 60_000, value: 21 }, { at: 120_000, value: 22 }];
  const tr = traceOf(pts, 19, 21, { w: 100, h: 30 });
  // range: 19..22 padded by 15 % of 3 (0.45) → 18.55..22.45; y = 30 − (v − 18.55) / 3.9 × 30
  const y = (v) => Number((30 - ((v - 18.55) / 3.9) * 30).toFixed(2));
  assert.equal(tr.line, `M0 ${y(20)}L50 ${y(21)}L100 ${y(22)}`);
  assert.deepEqual(tr.band, { y: y(21), h: Number((y(19) - y(21)).toFixed(2)) });
  assert.equal(tr.span, 'Last 2 min');
});

test('traceOf: a failed poll breaks the line; no band without one; nothing with fewer than two readings', () => {
  const pts = [{ at: 0, value: 800 }, { at: 5_000, value: null }, { at: 10_000, value: 820 }, { at: 15_000, value: 840 }];
  const tr = traceOf(pts, null, null, { w: 30, h: 10 });
  assert.match(tr.line, /^M0 [\d.]+M20 [\d.]+L30 [\d.]+$/, 'a new M after the gap');
  assert.equal(tr.band, null);
  assert.equal(tr.span, 'Last 15 s');
  assert.equal(traceOf([{ at: 0, value: 1 }], 0, 2), null);
  assert.equal(traceOf([], 0, 2), null);
  assert.equal(traceOf(undefined, 0, 2), null);
  const flat = traceOf([{ at: 0, value: 5 }, { at: 3_600_000, value: 5 }], null, null, { w: 10, h: 10 });
  assert.equal(flat.line, 'M0 5L10 5', 'a flat line sits in the middle');
  assert.equal(flat.span, 'Last hour');
});

test('readingTiles: red edge at the safety level, grey without data; thousands grouped', () => {
  const high = readingTiles(draw({ sensors: { ...sensors, co2: { status: 'online', lastOk: { co2: 1400 } } } }), control)[2];
  assert.deepEqual([high.value, high.chip.text, high.chip.lvl, high.edge], ['1,400', '▲ At the safety level', 'critical', 'bad']);
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
    'Air exchange on since 10:42 (stops by 10:52)\u00a0·\u00a0CO₂', 'no-break: "· CO₂" never alone on a line');
  assert.equal(freshAirLine({ ...control, auto: false, exchange: true }, now), '', 'auto off: the Control card says Manual, no line here');
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
    [1, 'Intake fan', 'Air in'], [2, 'Aircon', 'Cools'], [3, 'Circulation', 'Mixes the air'],
    [4, 'Humidifier', 'Adds moisture'], [5, 'Dehumidifier', 'Dries'], [6, 'Exhaust fan', 'Air out'],
  ]);
  assert.deepEqual(tiles.map((m) => m.detail), ['Filter 40.4\u00a0Pa', 'Cool 21.5 °C · fan auto', 'Always on', 'On at 90\u00a0%\u00a0RH, off at 95\u00a0%\u00a0RH',
    'On at 95\u00a0%\u00a0RH, off at 92.5\u00a0%\u00a0RH', 'With the intake'], 'a number and its unit never part at a wrap');
  // the role lines say the controller's real rule (server/controller.js): the humidifier on at the lower limit and off at the
  // upper, the dehumidifier on at the upper and off at the middle of the band
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
  assert.equal(nothing[3].detail, 'On below the band');
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
  assert.equal(lineText(f.line), 'Filter 40.4 Pa, change by 22 Nov', 'one decimal, as the Filter card');
  assert.deepEqual(f.line, ['Filter ', '40.4 Pa', ', change by 22 Nov']);
  const late = filterSummary({ room: { ...room, filterChangedAt: new Date(2026, 8, 1).getTime() }, sensor, intake: true, now });
  assert.equal(lineText(late.line), 'Filter 40.4 Pa, due since 1 Oct');
  assert.equal(lineText(filterSummary({ room: { ...room, filterChangeDays: 0 }, sensor, now }).line), 'Filter 40.4 Pa');
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

test('the crop facts: what grows, the stage, how long in it, how long it normally lasts, what comes next', () => {
  const now = Date.UTC(2026, 9, 27, 4);
  const since = now - (30 * 3_600_000 + 20 * 60_000), next = now + 5 * 86_400_000;
  const crop = { crops: [{ crop: 'lionsmane', blocks: 950 }], stage: 'fruiting', stageSince: since, flush: 1, flushes: 4,
    days: { fruiting: 7, rest: 10 }, autoAdvance: true, done: false, ramp: null, nextStage: { stage: 'rest', flush: 1, at: next } };
  const f = cropFacts(crop, now);
  assert.equal(f.short, 'Fruiting');
  assert.deepEqual(f.items, [
    { label: 'Growing', value: "Lion's mane", sub: '950 blocks' },
    { label: 'Stage', value: 'Fruiting', sub: 'flush 1 of 4' },
    { label: 'In this stage', value: '1 day 6 h', sub: `since ${formatDateTime(since)}` },
    { label: 'Normally', value: '7 days', sub: 'then it changes by itself' },
    { label: 'Next', value: 'Rest between flushes', sub: `about ${formatDateTime(next)}` },
  ]);
  // Two crops; a stage without flushes; automatic change off; the program done.
  const two = cropFacts({ ...crop, crops: [{ crop: 'oyster', blocks: 300 }, { crop: 'golden', blocks: 200 }], stage: 'spawn', days: { spawn: 21 } }, now);
  assert.deepEqual(two.items[0], { label: 'Growing', value: 'Grey oyster + Golden oyster', sub: '500 blocks (300 + 200)' });
  assert.deepEqual(two.items[1], { label: 'Stage', value: 'Spawn run', sub: '' });
  assert.deepEqual(two.items[3], { label: 'Normally', value: '21 days', sub: 'then it changes by itself' });
  const manual = cropFacts({ ...crop, autoAdvance: false, nextStage: { stage: 'rest', flush: 1, at: null } }, now);
  assert.deepEqual(manual.items[3], { label: 'Normally', value: '7 days', sub: 'you change it (automatic change is off)' });
  assert.deepEqual(manual.items[4], { label: 'Next', value: 'Rest between flushes', sub: 'when you start it' });
  const done = cropFacts({ ...crop, stage: 'rest', flush: 4, done: true, nextStage: null }, now);
  assert.deepEqual(done.items[4], { label: 'Next', value: 'Replace the blocks', sub: 'flush 4 of 4 done' });
  assert.equal(cropFacts({ ...crop, crops: [] }, now), null, 'no crops: nothing');
  assert.equal(cropFacts(null, now), null);
});

test('how long: minutes, hours, days', () => {
  assert.equal(stayed(12 * 60_000), '12 min');
  assert.equal(stayed(5 * 3_600_000 + 20 * 60_000), '5 h 20 min');
  assert.equal(stayed(30 * 3_600_000), '1 day 6 h');
  assert.equal(stayed(3 * 86_400_000), '3 days');
  assert.equal(stayed(-5), '0 min');
});

test('the blocks under the picture carry the stage', () => {
  assert.equal(blocksLine([{ crop: 'lionsmane', blocks: 950 }], 'Fruiting'), "950 lion's mane blocks · Fruiting");
  assert.equal(blocksLine([{ crop: 'lionsmane', blocks: 950 }]), "950 lion's mane blocks");
  assert.equal(blocksLine([], 'Fruiting'), '');
});

test("cropSummary: the Now tab's Crop card (name, stage, blocks and flush, the day of the stage as on the Crop tab, what is next)", () => {
  const now = Date.UTC(2026, 9, 27, 4);
  const since = now - (30 * 3_600_000 + 20 * 60_000), next = now + 5 * 86_400_000;
  const crop = { crops: [{ crop: 'lionsmane', blocks: 950 }], stage: 'fruiting', stageSince: since, flush: 1, flushes: 4,
    days: { fruiting: 7, rest: 10 }, autoAdvance: true, done: false, ramp: null, nextStage: { stage: 'rest', flush: 1, at: next } };
  assert.deepEqual(cropSummary(crop, now), {
    name: "Lion's mane", stage: 'Fruiting', sub: '950 blocks · flush 1 of 4', day: 'Day 2 of 7', share: 2 / 7,
    next: `Next: Rest between flushes · about ${formatDateTime(next)}`, done: false,
  });
  const manual = cropSummary({ ...crop, autoAdvance: false, nextStage: { stage: 'rest', flush: 1, at: null } }, now);
  assert.equal(manual.day, 'Day 2', 'no length without automatic change, as the Crop tab');
  assert.equal(manual.share, null);
  assert.equal(manual.next, 'Next: Rest between flushes · when you start it');
  const late = cropSummary({ ...crop, stageSince: now - 9 * 86_400_000 }, now);
  assert.equal(late.day, 'Day 7 of 7', 'stops at the length once the change is due');
  assert.equal(late.share, 1);
  const done = cropSummary({ ...crop, stage: 'rest', flush: 4, done: true, nextStage: null }, now);
  assert.equal(done.next, 'Replace the blocks: flush 4 of 4 done');
  assert.equal(done.done, true);
  assert.equal(cropSummary({ ...crop, crops: [] }, now), null);
  assert.equal(cropSummary(null, now), null);
});

test('hourPoints: the reading cards trace the last hour: the history of the hour, then the newer live polls', () => {
  const now = 10_000_000;
  const base = [{ at: now - 4_000_000, value: 1 }, { at: now - 3_000_000, value: 2 }, { at: now - 60_000, value: 3 }];
  const live = [{ at: now - 120_000, value: 9 }, { at: now - 30_000, value: 4 }, { at: now, value: null }];
  assert.deepEqual(hourPoints(base, live, now), [{ at: now - 3_000_000, value: 2 }, { at: now - 60_000, value: 3 }, { at: now - 30_000, value: 4 }, { at: now, value: null }],
    'older than an hour dropped; live polls only after the last history point');
  assert.deepEqual(hourPoints(null, live, now), live, 'no history yet: the live polls');
  assert.deepEqual(hourPoints(base, [], now), base.slice(1));
});

test('traceOf with a scale: a fixed range per reading (normal cycling stays calm), the band edges as lines, the newest point, "Last hour"', () => {
  const pts = [{ at: 0, value: 88 }, { at: 1_800_000, value: 92 }, { at: 3_600_000, value: 90 }];
  const tr = traceOf(pts, 87, 93, { w: 100, h: 30, scale: { min: 70, max: 100 } });
  const y = (v) => Number((30 - ((v - 70) / 30) * 30).toFixed(2));
  assert.equal(tr.line, `M0 ${y(88)}L50 ${y(92)}L100 ${y(90)}`);
  assert.deepEqual(tr.edges, { top: y(93), bottom: y(87) });
  assert.deepEqual(tr.last, { x: 100, y: y(90) });
  assert.equal(tr.span, 'Last hour', 'an hour or near it reads "Last hour"');
  const wide = traceOf([{ at: 0, value: 60 }, { at: 60_000, value: 65 }], 87, 93, { w: 10, h: 10, scale: { min: 70, max: 100 } });
  assert.ok(wide.line.startsWith('M0 10'), 'a value below the scale widens it (the lowest point at the bottom)');
});

// Critique 2026-10-28 (owner): near an edge is amber only when the machine that should act is not acting, or after 15 min
// there; the words fit one line.
test('readingTiles: near an edge with the machine that should act not acting says which ("Near high"), in amber', () => {
  const hot = { sensors: { ...sensors, trh: { status: 'online', lastOk: { t: 22.8, rh: 94.5, at: 1 } } } };
  const cooling = readingTiles(draw(hot), control);
  assert.equal(cooling[0].chip.text, '✓ In band', 'T 22.8 in 21–23 with the aircon cooling: calm');
  assert.deepEqual(cooling[1].chip, { lvl: 'near', text: 'Near high' }, 'RH 94.5 in 90–95 with the dehumidifier off');
  const off = readingTiles(draw({ ...hot, machines: { relay: relay(), ac: ac({ reported: { power: false, mode: 'cool', setpoint: 21.5, fan: 'auto' }, status: 'off' }) } }), control);
  assert.deepEqual(off[0].chip, { lvl: 'near', text: 'Near high' }, 'the aircon off');
  const mid = readingTiles(draw({ sensors: { ...sensors, trh: { status: 'online', lastOk: { t: 22, rh: 92.5, at: 1 } } } }), control);
  assert.equal(mid[0].chip.text, '✓ In band');
  const lowT = readingTiles(draw({ sensors: { ...sensors, trh: { status: 'online', lastOk: { t: 21.2, rh: 92.5, at: 1 } } } }), control)[0];
  assert.deepEqual(lowT.chip, { lvl: 'near', text: 'Near low' }, 'the aircon cooling a room near its bottom');
});

// Only the edge that hurts (critique 2026-10-28): low CO₂ is good; humidity at the bottom is the humidifier's switch point
// unless it is falling.
// CO₂'s words say what the air exchange is doing (critique 2026-10-28), from the control view in Auto and the two fans in Manual.
test('readingTiles: CO₂ in the exchange\'s words: below the stop point, running (neutral), near and at the safety level', () => {
  const at = (co2, over = {}) => readingTiles(draw({ sensors: { ...sensors, co2: { status: 'online', lastOk: { co2, at: 1 } } }, ...over }), control)[2];
  const below = at(550);
  assert.deepEqual([below.chip.text, below.chip.lvl, below.edge], ['✓ Below the stop point', 'good', '']);
  const running = readingTiles(draw({ control: { ...control, exchange: true } }), { ...control, exchange: true })[2];
  assert.deepEqual([running.chip.text, running.chip.lvl, running.edge], ['Exchange running', 'neutral', ''], 'not amber while it runs');
  const manual = { ...control, auto: false };
  const fans = { relay: relay({ intake: { running: true, reported: true, status: 'on' }, exhaust: { running: true, reported: true, status: 'on' } }), ac: ac() };
  assert.equal(readingTiles(draw({ control: manual, machines: fans }), manual)[2].chip.text, 'Exchange running', 'Manual: both fans running');
  const near = at(1200);
  assert.deepEqual([near.chip.text, near.chip.lvl, near.edge], ['▲ Near the safety level', 'warning', 'warn']);
  const safety = at(1300);
  assert.deepEqual([safety.chip.text, safety.chip.lvl, safety.edge], ['▲ At the safety level', 'critical', 'bad']);
});

test('readingTiles: CO₂ near the stop point is calm; humidity near low is amber with the humidifier off or after 15 min there', () => {
  const low = readingTiles(draw({ sensors: { ...sensors, co2: { status: 'online', lastOk: { co2: 620, at: 1 } } } }), control)[2];
  assert.equal(low.chip.text, '✓ Exchange off');
  assert.equal(low.chip.lvl, 'good');
  const rhLow = draw({ sensors: { ...sensors, trh: { status: 'online', lastOk: { t: 22, rh: 90.4, at: 1 } } } });
  assert.deepEqual(readingTiles(rhLow, control)[1].chip, { lvl: 'near', text: 'Near low' }, 'the humidifier off');
  assert.deepEqual(readingTiles(rhLow, control, { RH: -0.8 })[1].chip, { lvl: 'near', text: 'Near low · falling' });
  const humid = { relay: relay({ humidifier: { commanded: true, reported: true, running: true, status: 'on' } }), ac: ac() };
  const on = draw({ sensors: { ...sensors, trh: { status: 'online', lastOk: { t: 22, rh: 90.4, at: 1 } } }, machines: humid });
  assert.equal(readingTiles(on, control, { RH: -0.8 })[1].chip.text, '✓ In band', 'the humidifier is on it');
  const stayed = [{ at: 0, value: 90.5 }, { at: 16 * 60_000, value: 90.4 }];
  assert.deepEqual(readingTiles(on, control, {}, { RH: stayed })[1].chip, { lvl: 'near', text: 'Near low' }, '16 min near the bottom');
});

test('traceScale: the band and twice its width either side, so the band is always a fifth of the trace; humidity stays 0–100', () => {
  assert.deepEqual(traceScale('T', 19, 21), { min: 15, max: 25 });
  assert.deepEqual(traceScale('RH', 87, 93), { min: 75, max: 100 });
  assert.deepEqual(traceScale('CO2', 700, 800), { min: 500, max: 1000 });
  assert.equal(traceScale('T', null, 21), null, 'no band: the trace zooms to its readings');
});
