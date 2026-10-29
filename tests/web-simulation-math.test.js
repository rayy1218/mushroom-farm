import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_S, tileList, stageRows, formatRunTime, dayTicks, runEnd, chartPoints, thinPoints, outdoorLine, bandSteps, CHARTS, timelineRows,
  energyView, perDayBars, mergeSpans, inputLine, runRow, headLine, stageName,
} from '../web/simulation-math.js';

const series = [
  { s: 0, t: 25, rh: 88, co2: 420, outT: 26, outRH: 90, tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, stage: 'fruiting' },
  { s: 300, t: 25.2, rh: 88.5, co2: 500, outT: 26.1, outRH: 90, tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, stage: 'fruiting' },
  { s: 600, t: 25.4, rh: 89, co2: 600, outT: 26.2, outRH: 89, tLow: 24.1, tHigh: 26.1, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, stage: 'fruiting' },
  { s: 900, t: 25.5, rh: 89, co2: 650, outT: 26.2, outRH: 89, tLow: 24.1, tHigh: 26.1, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, stage: 'fruiting' },
];

test('the time in band tiles', () => {
  assert.deepEqual(tileList({ inBand: { t: 96.2, rh: 88, co2: 100, all: 85.6 } }), [
    { key: 't', label: 'Temperature', value: '96.2 %', tone: 'good' }, { key: 'rh', label: 'Humidity', value: '88.0 %', tone: 'amber' },
    { key: 'co2', label: 'CO₂', value: '100.0 %', tone: 'good' }, { key: 'all', label: 'All three', value: '85.6 %', tone: 'amber' },
  ]);
  assert.equal(tileList({ inBand: { t: 0.8 } })[0].tone, 'warn', 'under 50 % bad, as the Simulations list');
  assert.equal(tileList({})[0].tone, 'none');
  assert.equal(tileList({}).every((t) => t.value === '—'), true);
});

test('the stage table: names, days and the four percentages', () => {
  const rows = stageRows([
    { stage: 'fruiting', flush: 1, from: 0, to: 7 * DAY_S, inBand: { t: 99, rh: 80.6, co2: 100, all: 79 } },
    { stage: 'rest', flush: 1, from: 7 * DAY_S, to: 17.5 * DAY_S, inBand: { t: 90, rh: 91, co2: 92, all: 93 } },
    { stage: 'spawn', flush: 1, from: 17.5 * DAY_S, to: 18 * DAY_S, inBand: { t: 1, rh: 2, co2: 3, all: 0 } },
  ]);
  assert.deepEqual(rows[0], { name: 'Fruiting, flush 1', days: 'day 1 to day 7', daysShort: '1–7', t: '99.0 %', rh: '80.6 %', co2: '100.0 %', all: '79.0 %' });
  assert.equal(rows[1].name, 'Rest after flush 1');
  assert.equal(rows[1].days, 'day 8 to day 18');
  assert.equal(rows[1].daysShort, '8–18');
  assert.equal(rows[2].daysShort, '18');
  assert.equal(rows[2].name, 'Spawn run');
  assert.equal(rows[2].days, 'day 18 to day 18');
  assert.equal(stageName('pinning', 1), 'Pinning');
  assert.deepEqual(stageRows(undefined), []);
});

test('run time and the end of a run', () => {
  assert.equal(formatRunTime(0), 'day 1 00:00');
  assert.equal(formatRunTime(DAY_S + 13 * 3600 + 5 * 60 + 59), 'day 2 13:05');
  assert.equal(runEnd({ summary: { days: 7 }, series }), 7 * DAY_S);
  assert.equal(runEnd({ summary: {}, series }), 900);
  assert.equal(runEnd({ series: [] }), DAY_S);
});

test('ticks: day 1, day 2, thinned to fit; hours for a short run', () => {
  assert.deepEqual(dayTicks(3 * DAY_S, 10), [{ at: 0, label: 'day 1' }, { at: DAY_S, label: 'day 2' }, { at: 2 * DAY_S, label: 'day 3' }]);
  const t = dayTicks(30 * DAY_S, 6);
  assert.ok(t.length <= 6 && t.length >= 3);
  assert.equal(t[0].label, 'day 1');
  assert.equal(t[1].at - t[0].at, 5 * DAY_S);
  assert.equal(t[1].label, 'day 6');
  const h = dayTicks(DAY_S, 6);
  assert.deepEqual(h.slice(0, 3).map((x) => x.label), ['day 1', '04:00', '08:00']);
  assert.deepEqual(dayTicks(2 * DAY_S, 2).map((x) => x.label), ['day 1', 'day 2']);
});

test('chart points are in seconds; long series are thinned and keep the peaks', () => {
  assert.deepEqual(chartPoints(series, 't').map((p) => p.at), [0, 300, 600, 900]);
  assert.deepEqual(chartPoints(series, 'co2').map((p) => p.value), [420, 500, 600, 650]);
  const long = Array.from({ length: 5000 }, (_, i) => ({ at: i, value: i === 2500 ? 99 : i % 10 }));
  const thin = thinPoints(long, 400);
  assert.ok(thin.length <= 800);
  assert.ok(thin.some((p) => p.value === 99), 'the peak stays');
  assert.equal(thin[0].at, 0);
  assert.equal(thin.at(-1).at <= 4999, true);
  assert.deepEqual(thinPoints(long.slice(0, 10), 400), long.slice(0, 10));
});

test('the outdoor line', () => {
  assert.deepEqual(outdoorLine(series, 'outT').points.map((p) => p.value), [26, 26.1, 26.2, 26.2]);
  assert.equal(outdoorLine(series, 'outT').label, 'Outdoor');
  assert.equal(outdoorLine(series.map(({ outT, ...r }) => r), 'outT'), null);
  assert.deepEqual(CHARTS.map((c) => [c.field, c.low, c.high, c.outdoor ?? null]), [['t', 'tLow', 'tHigh', 'outT'], ['rh', 'rhLow', 'rhHigh', 'outRH'], ['co2', 'co2Low', 'co2High', null]]);
});

test('bandSteps: one step per change of the band, the last to the end', () => {
  assert.deepEqual(bandSteps(series, 'tLow', 'tHigh', 1200), [{ from: 0, to: 600, low: 24, high: 26 }, { from: 600, to: 1200, low: 24.1, high: 26.1 }]);
  assert.deepEqual(bandSteps(series, 'rhLow', 'rhHigh', 1200), [{ from: 0, to: 1200, low: 85, high: 91 }]);
  assert.deepEqual(bandSteps([], 'tLow', 'tHigh', 10), []);
  assert.deepEqual(bandSteps(series.slice(0, 1), 'tLow', 'tHigh', 0), []);
});

test('timeline rows from the machine spans', () => {
  const rows = timelineRows({ intake: [{ from: 10, to: 20 }], exhaust: [], circulation: [{ from: 0, to: 100 }], humidifier: [],
    ac: [{ from: 0, to: 50, setpoint: 24 }, { from: 50, to: 80, setpoint: 24 }, { from: 200, to: 300, setpoint: 23.5 }] });
  assert.deepEqual(rows.map((r) => r.key), ['intake', 'exhaust', 'circulation', 'humidifier', 'ac']);
  assert.deepEqual(rows[0].spans, [{ from: 10, to: 20, source: 'auto' }]);
  assert.deepEqual(rows[4].marks, [{ at: 0, text: '24 °C' }, { at: 200, text: '23.5 °C' }]);
  assert.deepEqual(rows[2].marks, []);
  assert.equal(timelineRows(undefined).length, 5);
});

test('energy and water in words', () => {
  const v = energyView({ energy: { byMachine: { intake: 1.2, exhaust: 1, circulation: 8, humidifier: 3, ac: 30 }, kWh: 43.2, cost: 18.9 }, water: { litres: 120.4, cost: null } });
  assert.deepEqual([v.kWh, v.cost, v.litres, v.waterCost], ['43.2 kWh', 'RM 18.90', '120 L', null]);
  assert.deepEqual(v.rows.map((r) => [r.label, r.kWh, r.share]), [
    ['Intake', '1.2 kWh', '3 %'], ['Exhaust', '1.0 kWh', '2 %'], ['Circulation', '8.0 kWh', '19 %'], ['Humidifier', '3.0 kWh', '7 %'], ['Aircon', '30.0 kWh', '69 %'],
  ]);
  const none = energyView({});
  assert.equal(none.kWh, '—');
  assert.equal(none.cost, null);
  assert.deepEqual(none.rows, []);
});

test('per day bars: "day 1, day 2", one value each', () => {
  const bars = perDayBars([{ day: 1, kWh: 5, litres: 10 }, { day: 2, kWh: 6.5, litres: 12 }], 'kWh');
  assert.deepEqual(bars, [{ date: 'day 1', v: 5, metered: false }, { date: 'day 2', v: 6.5, metered: false }]);
  assert.deepEqual(perDayBars([{ day: 1, litres: 10 }], 'litres').map((b) => b.v), [10]);
  assert.deepEqual(perDayBars(undefined, 'kWh'), []);
});

test('the inputs in one line and the head', () => {
  const input = { physics: { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 },
    crops: [{ crop: 'oyster', blocks: 500 }, { crop: 'pink', blocks: 20 }], farmType: 'ready', stage: 'fruiting', days: 7 };
  assert.equal(inputLine(input), 'Grey oyster 500 and Pink oyster 20 blocks, starting at fruiting, 7 days · walls 80 W/K, sun 300 W, outdoor 25–33 °C, dew point 24 °C · fan 600 m³/h, aircon 3.5 kW (12,000 BTU/h class), humidifier 2 L/h');
  assert.equal(inputLine(undefined), '');
  const at = new Date(2026, 9, 20, 10, 42).getTime();
  assert.equal(headLine('Room 1'), 'Simulation of Room 1');
  assert.deepEqual(runRow({ id: 5, roomId: 3, createdAt: at, status: 'done', input: { days: 7 }, summary: { days: 7, inBand: { all: 81.26 }, energy: { kWh: 43.2 }, water: { litres: 120.4 } } }, 3),
    { id: 5, href: '#/rooms/3/simulations/5', date: '20 Oct 10:42', days: '7 days', all: '81.3 %', tone: 'amber', kWh: '43.2 kWh', litres: '120 L', status: 'Done', machines: '' });
  // the time in band as a verdict (redesign 2026-10-28: a bad run must not look like a good one): 95 % and up good (the
  // Suggest machines target), under 50 % bad, between them a warning; nothing before the run is done
  const tone = (all) => runRow({ id: 5, createdAt: at, status: 'done', summary: { days: 7, inBand: { all } } }, 3).tone;
  assert.deepEqual([tone(98.3), tone(95), tone(94.9), tone(50), tone(0.8), tone(undefined)], ['good', 'good', 'amber', 'amber', 'warn', 'none']);
  const running = runRow({ id: 6, createdAt: at, status: 'running', progress: 0.35, input: { days: 1 } }, 3);
  assert.deepEqual([running.status, running.all, running.days, running.kWh, running.tone], ['Running 35 %', '—', '1 day', '—', 'none']);
  assert.equal(runRow({ id: 7, createdAt: at, status: 'failed', error: 'x' }, 3).status, 'Failed');
  assert.equal(runRow({ id: 8, createdAt: at, status: 'queued' }, 3).status, 'Waiting');
});

test('spans closer than the gap are drawn as one (a long run has tens of thousands)', () => {
  const spans = [{ from: 0, to: 10, source: 'auto' }, { from: 12, to: 20, source: 'auto' }, { from: 100, to: 110, source: 'auto' }];
  assert.deepEqual(mergeSpans(spans, 5), [{ from: 0, to: 20, source: 'auto' }, { from: 100, to: 110, source: 'auto' }]);
  assert.deepEqual(mergeSpans(spans, 0), spans);
  assert.deepEqual(mergeSpans([], 5), []);
  // a span shorter than the gap stays visible
  assert.deepEqual(mergeSpans([{ from: 0, to: 1, source: 'auto' }, { from: 500, to: 501, source: 'auto' }], 10).length, 2);
  const long = Array.from({ length: 20000 }, (_, i) => ({ from: i * 60, to: i * 60 + 30 }));
  const rows = timelineRows({ intake: long }, 90 * 86400 / 700);
  assert.ok(rows[0].spans.length <= 700, `${rows[0].spans.length} spans`);
  // the aircon keeps its setpoint changes apart
  const ac = timelineRows({ ac: [{ from: 0, to: 10, setpoint: 24 }, { from: 11, to: 20, setpoint: 25 }] }, 5)[4];
  assert.equal(ac.spans.length, 2);
  assert.equal(ac.marks.length, 2);
});

const withDehum = { physics: { dehumidifierLday: 20 } };

test('the Dehumidifier timeline row shows when the run had one (dehumidifierLday above 0) or it has spans', () => {
  const keys = (rows) => rows.map((r) => r.key);
  assert.deepEqual(keys(timelineRows({}, 0, withDehum)), ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'ac']);
  assert.deepEqual(keys(timelineRows({}, 0, { physics: { dehumidifierLday: 0 } })), ['intake', 'exhaust', 'circulation', 'humidifier', 'ac']);
  assert.deepEqual(keys(timelineRows({ dehumidifier: [] }, 0, { physics: {} })), ['intake', 'exhaust', 'circulation', 'humidifier', 'ac']);
  const spans = timelineRows({ dehumidifier: [{ from: 5, to: 50 }] }, 0, { physics: { dehumidifierLday: 0 } });
  assert.deepEqual(spans.find((r) => r.key === 'dehumidifier').spans, [{ from: 5, to: 50, source: 'auto' }]);
  assert.equal(timelineRows({}, 0, withDehum).find((r) => r.key === 'dehumidifier').label, 'Dehumidifier');
});

test('energy by machine has a Dehumidifier row when the run had one; Water taken out only above 0', () => {
  const summary = { energy: { byMachine: { intake: 1, exhaust: 1, circulation: 2, humidifier: 1, dehumidifier: 5, ac: 10 }, kWh: 20, cost: null },
    water: { litres: 100, cost: null, removedLitres: 41.6 } };
  const v = energyView(summary, withDehum);
  assert.deepEqual(v.rows.map((r) => [r.label, r.kWh, r.share]).filter((r) => r[0] === 'Dehumidifier'), [['Dehumidifier', '5.0 kWh', '25 %']]);
  assert.equal(v.removed, '42 L');
  const none = energyView({ energy: { byMachine: { intake: 1, exhaust: 1, circulation: 2, humidifier: 1, dehumidifier: 0, ac: 10 } }, water: { litres: 1, removedLitres: 0 } }, { physics: { dehumidifierLday: 0 } });
  assert.equal(none.rows.some((r) => r.key === 'dehumidifier'), false);
  assert.equal(none.removed, null);
  assert.equal(energyView({}).removed, null);
  // a dehumidifier that ran shows even if the input line is missing
  assert.ok(energyView(summary).rows.some((r) => r.key === 'dehumidifier'));
  // fitted but never on: the row shows 0
  assert.equal(energyView({ energy: { byMachine: { intake: 1, dehumidifier: 0 } } }, withDehum).rows.find((r) => r.key === 'dehumidifier').kWh, '0.0 kWh');
});

test('the inputs line mentions the dehumidifier only above 0', () => {
  const base = { crops: [{ crop: 'oyster', blocks: 5 }], stage: 'fruiting', days: 7,
    physics: { wallUA: 80, sunW: 300, outdoorLow: 25, outdoorHigh: 33, outdoorDew: 24, fanFlow: 600, acBTU: 12000, humidifierLH: 2 } };
  assert.ok(!/dehumidifier/.test(inputLine(base)));
  assert.ok(!/dehumidifier/.test(inputLine({ ...base, physics: { ...base.physics, dehumidifierLday: 0 } })));
  assert.ok(inputLine({ ...base, physics: { ...base.physics, dehumidifierLday: 20 } }).endsWith('humidifier 2 L/h, dehumidifier 20 L/day'));
});

test('the inputs line names the air exchange time limit of the run', () => {
  const base = { crops: [{ crop: 'oyster', blocks: 5 }], stage: 'fruiting', days: 7,
    physics: { wallUA: 80, sunW: 300, outdoorLow: 25, outdoorHigh: 33, outdoorDew: 24, fanFlow: 600, acBTU: 12000, humidifierLH: 2 } };
  assert.ok(!/time limit/.test(inputLine(base)));
  assert.ok(!/time limit/.test(inputLine({ ...base, ctx: { control: { exchangeMaxMin: 10 } } })));
  const given = { ...base, control: { exchangeMaxMin: 60 }, ctx: { control: { exchangeMaxMin: 60 } } };
  assert.ok(inputLine(given).endsWith(' · air exchange time limit 60 min (set for this run)'));
  assert.ok(inputLine(given, 10).endsWith(' · air exchange time limit 60 min (the room: 10 min)'));
  assert.ok(!/time limit/.test(inputLine(given, 60)));
  // the one used is ctx's
  assert.ok(inputLine({ ...base, control: { exchangeMaxMin: 60 }, ctx: { control: { exchangeMaxMin: 45 } } }).includes('time limit 45 min'));
});

test('inputLine names the aircon drop and the humidifier setting of a run that set them', () => {
  const base = { physics: { wallUA: 30, sunW: 100, outdoorLow: 25, outdoorHigh: 33, outdoorDew: 24, fanFlow: 150, acBTU: 9000, humidifierLH: 0.5, dehumidifierLday: 10 }, crops: [{ crop: 'lionsmane', blocks: 950 }], stage: 'fruiting', days: 7 };
  const line = inputLine({ ...base, control: { acDrop: 0, humidifierDuringExchange: false }, ctx: { control: { exchangeMaxMin: 10, acDrop: 0, humidifierDuringExchange: false } } });
  assert.ok(line.endsWith(' · aircon lower during air exchange 0 °C, humidifier not forced on during air exchange (set for this run)'), line);
});

test('inputLine says what the room had when the run stored it', () => {
  const base = { physics: { wallUA: 30, sunW: 100, outdoorLow: 25, outdoorHigh: 33, outdoorDew: 24, fanFlow: 150, acBTU: 9000, humidifierLH: 0.5, dehumidifierLday: 10 }, crops: [{ crop: 'lionsmane', blocks: 950 }], stage: 'fruiting', days: 7 };
  const line = inputLine({ ...base, control: { exchangeMaxMin: 60, acDrop: 0 }, ctx: { control: { exchangeMaxMin: 60, acDrop: 0 }, roomControl: { exchangeMaxMin: 10, acDrop: 5 } } });
  assert.ok(line.includes('air exchange time limit 60 min (the room: 10 min)'), line);
  assert.ok(line.endsWith('aircon lower during air exchange 0 °C (the room: 5 °C)'), line);
});

test('acSize: an aircon in kW, with the BTU/h class it is sold by in brackets (PRODUCT.md: metric first)', async () => {
  const { acSize } = await import('../web/simulation-math.js');
  assert.equal(acSize(12000), '3.5 kW (12,000 BTU/h class)');
  assert.equal(acSize(9000), '2.6 kW (9,000 BTU/h class)');
  assert.equal(acSize(0), 'none');
  assert.equal(acSize(undefined), '—');
});

test('runRow: the machines of a run, so runs can be told apart in the list', () => {
  const input = { physics: { fanFlow: 150, acBTU: 9000, humidifierLH: 1.5, dehumidifierLday: 25 } };
  const r = runRow({ id: 5, createdAt: 0, status: 'done', input, summary: { days: 7, inBand: { all: 98 } } }, 3);
  assert.equal(r.machines, 'Aircon 2.6 kW · fan 150 m³/h · humidifier 1.5 L/h · dehumidifier 25 L/day');
});

test('inputRows: what a run was asked, as label and value rows instead of one long sentence', async () => {
  const { inputRows } = await import('../web/simulation-math.js');
  const input = { physics: { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2, dehumidifierLday: 0 },
    crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 7 };
  assert.deepEqual(inputRows(input), [
    { label: 'Crops', value: 'Grey oyster 500 blocks' },
    { label: 'Run', value: 'from fruiting, 7 days' },
    { label: 'Room', value: 'walls 80 W/K, sun 300 W' },
    { label: 'Outdoor', value: '25–33 °C, dew point 24 °C' },
    { label: 'Aircon', value: '3.5 kW (12,000 BTU/h class)' },
    { label: 'Fan', value: '600 m³/h' },
    { label: 'Humidifier', value: '2 L/h' },
    { label: 'Dehumidifier', value: 'none' },
  ]);
  assert.deepEqual(inputRows(undefined), []);
});

test('runVerdict: one sentence on how the run went and which way it missed, from its series', async () => {
  const { runVerdict } = await import('../web/simulation-math.js');
  const row = (t, rh, co2) => ({ t, rh, co2, tLow: 19, tHigh: 21, rhLow: 87, rhHigh: 93, co2Low: 700, co2High: 800 });
  const good = runVerdict([row(20, 90, 750), row(20.5, 91, 760)], { all: 100 });
  assert.deepEqual(good, { tone: 'good', text: 'The room stayed in band 100 % of the time.', lines: [] });
  const cold = runVerdict([row(16, 99, 750), row(16, 99, 750), row(16, 99, 750), row(20, 99, 750)], { t: 25, rh: 0, co2: 100, all: 0 });
  assert.equal(cold.tone, 'warn');
  assert.equal(cold.text, 'The room was in band 0 % of the time.');
  assert.deepEqual(cold.lines, ['Too cold 75 % of the time (down to 16.0 °C; the band is 19–21 °C)', 'Too wet 100 % of the time (up to 99.0 % RH; the band is 87–93 % RH)']);
  assert.equal(runVerdict([], {}), null);
});

test('compareRuns: two runs side by side, their inputs and results, the rows that differ marked', async () => {
  const { compareRuns } = await import('../web/simulation-math.js');
  const run = (id, acBTU, all) => ({ id, createdAt: 0, status: 'done', input: { physics: { fanFlow: 150, acBTU, humidifierLH: 1.5, dehumidifierLday: 0, wallUA: 30, sunW: 300, outdoorLow: 25, outdoorHigh: 33, outdoorDew: 24 }, crops: [{ crop: 'lionsmane', blocks: 950 }], stage: 'fruiting', days: 7 }, summary: { days: 7, inBand: { t: all, rh: all, co2: all, all }, energy: { kWh: 100 }, water: { litres: 50 } } });
  const rows = compareRuns(run(1, 12000, 0.8), run(2, 9000, 98.2));
  const aircon = rows.find((r) => r.label === 'Aircon');
  assert.deepEqual(aircon, { label: 'Aircon', a: '3.5 kW (12,000 BTU/h class)', b: '2.6 kW (9,000 BTU/h class)', differ: true });
  assert.equal(rows.find((r) => r.label === 'Fan').differ, false);
  assert.deepEqual(rows.find((r) => r.label === 'All three in band'), { label: 'All three in band', a: '0.8 %', b: '98.2 %', differ: true });
});

// Critique 2026-10-28: the same aircon scored 98 % and 1 %, and nothing said the second run had the aircon set below the
// band during air exchanges that ran most of the time.
test('runCauses: air exchange share, the aircon below the band and why, the humidifier during exchange', async () => {
  const { runCauses } = await import('../web/simulation-math.js');
  const H = 3_600_000;
  const series = [{ s: 0, tLow: 19 }, { s: 10 * H, tLow: 19 }];
  const result = {
    series,
    machines: {
      intake: [{ from: 0, to: 8 * H }],
      ac: [{ from: 0, to: 2 * H, setpoint: 20 }, { from: 2 * H, to: 10 * H, setpoint: 16 }],
    },
  };
  const input = { ctx: { control: { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5, humidifierDuringExchange: true } } };
  assert.deepEqual(runCauses(result, input), [
    'Air exchange ran 80 % of the time (every 15 min, up to 10 min each).',
    'The aircon was set to 16 °C, below the 19 °C band, 80 % of the time: it is set 5 °C lower during air exchange.',
    'The humidifier also ran during every air exchange.',
  ]);
  assert.deepEqual(runCauses({ series, machines: { intake: [{ from: 0, to: H }], ac: [{ from: 0, to: 10 * H, setpoint: 20 }] } }, input), []);
  assert.deepEqual(runCauses(null, input), []);
});

test('inputRows: how the room was run (air exchange, the aircon and the humidifier during it) when the run kept it', async () => {
  const { inputRows } = await import('../web/simulation-math.js');
  const physics = { wallUA: 30, sunW: 300, outdoorLow: 25, outdoorHigh: 33, outdoorDew: 24, acBTU: 12000, fanFlow: 150, humidifierLH: 1.5, dehumidifierLday: 0 };
  const rows = inputRows({ physics, crops: [], stage: 'fruiting', days: 7, ctx: { control: { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5, humidifierDuringExchange: true } } });
  assert.deepEqual(rows.slice(-3), [
    { label: 'Air exchange', value: 'every 15 min, up to 10 min' },
    { label: 'Aircon during air exchange', value: '5 °C lower' },
    { label: 'Humidifier during air exchange', value: 'on' },
  ]);
  assert.equal(inputRows({ physics, crops: [], stage: 'fruiting', days: 7 }).at(-1).label, 'Dehumidifier');
});

test('the aircon in kW: the class it is sold as only when it is one, kW and BTU/h both ways', async () => {
  const { acSize, acClassOf, kwOfBtu, btuOfKw, AC_CLASSES } = await import('../web/simulation-math.js');
  assert.equal(acSize(btuOfKw(3.5)), '3.5 kW (12,000 BTU/h class)', '3.5 kW is about 11,942 BTU/h: sold as the 12,000 class');
  assert.equal(acSize(btuOfKw(4.2)), '4.2 kW', 'not a class');
  assert.equal(acClassOf(9000), 9000);
  assert.equal(acClassOf(10000), null);
  assert.equal(Number(kwOfBtu(18000).toFixed(1)), 5.3);
  assert.ok(AC_CLASSES.includes(24000));
});

test('the Simulate dialog asks for the aircon in kW, with a Sold as picker of BTU/h classes', async () => {
  const { readFileSync } = await import('node:fs');
  const dialog = readFileSync(new URL('../web/simulate-dialog.js', import.meta.url), 'utf8');
  assert.match(dialog, /field\(`physics\.\$\{f\.key\}`, `\$\{f\.label\} \(kW\)`, input\)/);
  assert.match(dialog, /sold\.setAttribute\('aria-label', 'Aircon sold as'\)/);
  const { checkStep, initialState } = await import('../web/simulate-math.js');
  const state = initialState({ room: {} });
  state.physics.acBTU = 'abc';
  assert.match(JSON.stringify(checkStep(1, state)), /Aircon size must be a number from 0 to 58\.6 kW/);
});

test('a result page: Simulate again with these at the head, Delete run at the foot (away from the thumb)', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../web/simulation-page.js', import.meta.url), 'utf8');
  const head = page.slice(page.indexOf('<div class="page-head">'), page.indexOf('<div class="banner"'));
  assert.match(head, /data-again hidden>Simulate again with these</);
  assert.doesNotMatch(head, /data-delete/);
  assert.match(page, /<div class="page-foot" data-foot hidden><button type="button" class="danger-text" data-delete>Delete run<\/button><\/div>`;/);
  assert.match(page, /openSimulateDialog\(roomData, \{ from: run \}\)/);
  assert.match(page, /closeSimulateDialog\(\);/);
});

test('the Simulations list: a refresh with nothing new leaves it alone; each Compare box named by its run; one ticked asks for another', async () => {
  const { readFileSync } = await import('node:fs');
  const card = readFileSync(new URL('../web/sim-card.js', import.meta.url), 'utf8');
  assert.match(card, /if \(key === painted\) return;/);
  assert.match(card, /box\.setAttribute\('aria-label', `Compare the run of \$\{r\.date\}`\);/);
  assert.match(card, /'Tick one more run to compare the two side by side\.'/);
  assert.match(card, /el\('span', 'sim-status', run\.status === 'done' \? '' : r\.status\)/, 'Done is the usual: only other states are said');
});

// ---- a run that started from outdoor air (2026-10-28) ----

test('runVerdict: a run from outdoor air says how long it took to cool down', async () => {
  const { runVerdict } = await import('../web/simulation-math.js');
  const row = (t, rh, co2) => ({ t, rh, co2, tLow: 19, tHigh: 21, rhLow: 87, rhHigh: 93, co2Low: 700, co2High: 800 });
  const series = [row(20, 90, 750), row(20.5, 91, 760)];
  assert.equal(runVerdict(series, { all: 100 }, 5400).text, 'The room stayed in band 100 % of the time. Cooled down in 1.5 h.');
  assert.equal(runVerdict(series, { all: 90 }, null).text, 'The room was in band 90 % of the time. Did not cool down within the run.');
  assert.equal(runVerdict(series, { all: 100 }).text, 'The room stayed in band 100 % of the time.', 'a run from the band says nothing of it');
});

test('inputRows: where a run started', async () => {
  const { inputRows } = await import('../web/simulation-math.js');
  const input = { physics: { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 },
    crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 1 };
  const rows = inputRows({ ...input, start: 'outdoor', startHour: 14 });
  assert.deepEqual(rows[2], { label: 'Started from', value: 'outdoor air at 14:00' });
  assert.deepEqual(inputRows({ ...input, startHour: 7 })[2], { label: 'Started from', value: 'in band at 07:00' });
  assert.equal(inputRows(input).some((r) => r.label === 'Started from'), false);
  assert.match(inputLine({ ...input, start: 'outdoor', startHour: 14 }), /^Grey oyster 500 blocks, starting at fruiting from outdoor air at 14:00, 1 day · /);
});

test('the time of day of a run that started at 14:00: the clock moves, the days and seconds do not', () => {
  assert.equal(formatRunTime(0, 14), 'day 1 14:00');
  assert.equal(formatRunTime(11 * 3600, 14), 'day 1 01:00');
  assert.equal(formatRunTime(DAY_S + 3600, 14), 'day 2 15:00');
  assert.deepEqual(dayTicks(DAY_S, 6, 14).slice(0, 3), [{ at: 0, label: 'day 1' }, { at: 4 * 3600, label: '18:00' }, { at: 8 * 3600, label: '22:00' }]);
  assert.deepEqual(dayTicks(3 * DAY_S, 10, 14).map((x) => x.label), ['day 1', 'day 2', 'day 3']);
});

// ---- the Simulations list: what differs between the runs beyond their machines (critique 2026-10-28: two runs with the
// same machine line scored 0.8 % and 98.3 % in band; the control settings made the difference) ----

test('differingLines: each run\'s settings beyond its machines, only those that differ between the runs shown', async () => {
  const { differingLines } = await import('../web/simulation-math.js');
  const control = { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5, humidifierDuringExchange: true, outdoorAir: true };
  const run = (c, extra = {}) => ({ input: { physics: { acBTU: 12000 }, ctx: { control: { ...control, ...c } }, ...extra } });
  assert.deepEqual(differingLines([run({}), run({})]), ['', ''], 'nothing differs: no line');
  assert.deepEqual(differingLines([run({}), run({ exchangeMaxMin: 60, acDrop: 0 })]), [
    'exchange every 15 min, up to 10 min · aircon 5 °C lower during exchange',
    'exchange every 15 min, up to 60 min · aircon not lowered during exchange',
  ]);
  assert.deepEqual(differingLines([run({ humidifierDuringExchange: false, outdoorAir: false }), run({}), run({}, { start: 'outdoor', startHour: 14 })]), [
    'humidifier off during exchange · no outdoor air · started in band',
    'humidifier on during exchange · outdoor air used · started in band',
    'humidifier on during exchange · outdoor air used · from outdoor air at 14:00',
  ]);
  assert.deepEqual(differingLines([run({ exchangeEveryMin: 0 }), run({})]), ['exchange up to 10 min, fresh air off', 'exchange every 15 min, up to 10 min']);
  // a run's own settings without the room's (an older run): what it set still counts; a run that kept nothing says nothing of it
  const own = { input: { physics: {}, control: { exchangeMaxMin: 60 } } };
  const none = { input: { physics: {} } };
  assert.deepEqual(differingLines([own, run({}), none]), ['exchange up to 60 min', 'exchange every 15 min, up to 10 min', '']);
  assert.deepEqual(differingLines([]), []);
});

test('the Simulations list: the differing line under the machines; the Compare boxes have names; the run links are 44 px on a phone', async () => {
  const { readFileSync } = await import('node:fs');
  const card = readFileSync(new URL('../web/sim-card.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(card, /const given = differingLines\(shown\);/);
  assert.match(card, /if \(given\[i\]\) name\.append\(el\('span', 'sim-given', given\[i\]\)\);/);
  assert.match(card, /box\.name = 'compare';/);
  assert.match(card, /box\.id = `sim-pick-\$\{run\.id\}`;/);
  assert.match(css, /@media \(max-width: 600px\) \{ \.sim-item \.sim-name a \{ display: inline-flex; align-items: center; min-height: 44px; \} \}/);
});

// ---- the result page on a phone and the Why section's values to try (critique 2026-10-28) ----

test('stageColumns: short names on a narrow screen (T, RH, CO₂, All), the long ones for the eye on a wide one', async () => {
  const { STAGE_COLUMNS } = await import('../web/simulation-math.js');
  assert.deepEqual(STAGE_COLUMNS, [
    { long: 'Stage', short: 'Stage' }, { long: 'Days', short: 'Days' }, { long: 'Temperature', short: 'T' },
    { long: 'Humidity', short: 'RH' }, { long: 'CO₂', short: 'CO₂' }, { long: 'All three', short: 'All' },
  ]);
});

test('scrollEdges: which edges of a sideways scroller have more (a fade marks them)', async () => {
  const { scrollEdges } = await import('../web/simulation-math.js');
  assert.equal(scrollEdges(0, 330, 330), 'none');
  assert.equal(scrollEdges(0, 330, 420), 'end');
  assert.equal(scrollEdges(40, 330, 420), 'both');
  assert.equal(scrollEdges(90, 330, 420), 'start');
  assert.equal(scrollEdges(89.5, 330, 420), 'start', 'half a pixel short of the end is the end');
});

test('runTries: the value to try for each setting a cause names', async () => {
  const { runTries } = await import('../web/simulation-math.js');
  const H = 3600;
  const wet = (n) => Array.from({ length: n }, (_, i) => ({ s: (i * 10 * H) / (n - 1), t: 18, tLow: 19, tHigh: 21, rh: 96, rhLow: 87, rhHigh: 93 }));
  const result = {
    series: wet(11),
    machines: { intake: [{ from: 0, to: 8 * H }], ac: [{ from: 0, to: 10 * H, setpoint: 16 }] },
  };
  const control = { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5, humidifierDuringExchange: true };
  assert.deepEqual(runTries(result, { ctx: { control } }), [
    'Try the aircon not lowered during air exchange (0 °C).',
    'Try the humidifier off during air exchange: the room was too wet.',
    'Try a 60 min air exchange time limit: the fans ran over half the time.',
  ]);
  // settings that are already so: nothing to try
  assert.deepEqual(runTries(result, { ctx: { control: { ...control, acDrop: 0, humidifierDuringExchange: false, exchangeMaxMin: 60 } } }), []);
  // a room too dry keeps its humidifier; a short exchange keeps its limit
  const dry = { ...result, series: result.series.map((r) => ({ ...r, rh: 80 })), machines: { ...result.machines, intake: [{ from: 0, to: 4 * H }] } };
  assert.deepEqual(runTries(dry, { ctx: { control } }), ['Try the aircon not lowered during air exchange (0 °C).']);
  assert.deepEqual(runTries(null, { ctx: { control } }), []);
});

test('the result page on a phone: the back link, the one-line summary and the stage table', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../web/simulation-page.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(page, /<a class="back sim-back" href="#\/overview" data-back>Room<\/a>/);
  assert.match(css, /@media \(max-width: 600px\) \{\n  \.sim-back \{ display: inline-flex; align-items: center; min-height: 44px; margin-bottom: 0; \}\n  \.sim-all-inputs summary \{ padding: 12px 0; \}/);
  // the caption above the scroller, left, the table named by it; the scroller fades at the edge that has more
  assert.match(page, /const cap = text\('p', 'sim-table-cap', caption\);/);
  assert.match(page, /t\.setAttribute\('aria-labelledby', cap\.id\);/);
  assert.match(page, /const more = scrollEdges\(wrap\.scrollLeft, wrap\.clientWidth, wrap\.scrollWidth\);\s+wrap\.dataset\.more = more;/);
  assert.match(css, /\.sim-scroll\[data-more="end"\] \{ mask-image: linear-gradient\(90deg, #000 calc\(100% - 32px\), transparent\); \}/);
  assert.match(page, /STAGE_COLUMNS/);
  assert.match(css, /\.sim-short \{ display: none; \}/);
  // the Why section names the values to try
  assert.match(page, /const tries = runTries\(result, run\.input\);/);
});

test('runFacts: how long the fans ran and the RM, beside the time in band', async () => {
  const { runFacts } = await import('../web/simulation-math.js');
  const H = 3_600_000 / 1000; // seconds
  const result = { series: [{ s: 0 }, { s: 100 * H }], machines: { intake: [{ from: 0, to: 76 * H }] }, summary: { days: 7, energy: { cost: 58.21 } } };
  assert.equal(runFacts(result), 'Fans ran 76 % of the time · RM 58.21 for 7 days');
  assert.equal(runFacts({ ...result, summary: { days: 7, energy: { cost: null } } }), 'Fans ran 76 % of the time');
  assert.equal(runFacts(null), '');
});

test('the Simulations list: the length cell has its own class (not the dialog fieldset .sim-days), a Try heading on results', async () => {
  const { readFileSync } = await import('node:fs');
  const card = readFileSync(new URL('../web/sim-card.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../web/simulation-page.js', import.meta.url), 'utf8');
  assert.match(card, /el\('span', 'sim-length', r\.days\)/);
  assert.match(page, /v\.append\(text\('h3', 'sim-verdict-why', 'Try'\)\);/);
  assert.match(page, /const facts = runFacts\(result\);/);
});
