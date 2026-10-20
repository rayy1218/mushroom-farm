import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_S, tileList, stageRows, formatRunTime, dayTicks, runEnd, chartPoints, thinPoints, outdoorLine, bandSteps, CHARTS, timelineRows,
  energyView, perDayBars, inputLine, runRow, headLine, stageName,
} from '../web/simulation-math.js';

const series = [
  { s: 0, t: 25, rh: 88, co2: 420, outT: 26, outRH: 90, tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, stage: 'fruiting' },
  { s: 300, t: 25.2, rh: 88.5, co2: 500, outT: 26.1, outRH: 90, tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, stage: 'fruiting' },
  { s: 600, t: 25.4, rh: 89, co2: 600, outT: 26.2, outRH: 89, tLow: 24.1, tHigh: 26.1, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, stage: 'fruiting' },
  { s: 900, t: 25.5, rh: 89, co2: 650, outT: 26.2, outRH: 89, tLow: 24.1, tHigh: 26.1, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, stage: 'fruiting' },
];

test('the time in band tiles', () => {
  assert.deepEqual(tileList({ inBand: { t: 96.2, rh: 88, co2: 100, all: 85.6 } }), [
    { key: 't', label: 'Temperature', value: '96.2 %' }, { key: 'rh', label: 'Humidity', value: '88.0 %' },
    { key: 'co2', label: 'CO₂', value: '100.0 %' }, { key: 'all', label: 'All three', value: '85.6 %' },
  ]);
  assert.equal(tileList({}).every((t) => t.value === '—'), true);
});

test('the stage table: names, days and the four percentages', () => {
  const rows = stageRows([
    { stage: 'fruiting', flush: 1, from: 0, to: 7 * DAY_S, inBand: { t: 99, rh: 80.6, co2: 100, all: 79 } },
    { stage: 'rest', flush: 1, from: 7 * DAY_S, to: 17.5 * DAY_S, inBand: { t: 90, rh: 91, co2: 92, all: 93 } },
    { stage: 'spawn', flush: 1, from: 17.5 * DAY_S, to: 18 * DAY_S, inBand: { t: 1, rh: 2, co2: 3, all: 0 } },
  ]);
  assert.deepEqual(rows[0], { name: 'Fruiting, flush 1', days: 'day 1 to day 7', t: '99.0 %', rh: '80.6 %', co2: '100.0 %', all: '79.0 %' });
  assert.equal(rows[1].name, 'Rest after flush 1');
  assert.equal(rows[1].days, 'day 8 to day 18');
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
  assert.equal(inputLine(input), 'Grey oyster 500 and Pink oyster 20 blocks, starting at fruiting, 7 days · walls 80 W/K, sun 300 W, outdoor 25–33 °C, dew point 24 °C · fan 600 m³/h, aircon 12,000 BTU/h, humidifier 2 L/h');
  assert.equal(inputLine(undefined), '');
  const at = new Date(2026, 9, 20, 10, 42).getTime();
  assert.equal(headLine('Room 1'), 'Simulation of Room 1');
  assert.deepEqual(runRow({ id: 5, roomId: 3, createdAt: at, status: 'done', input: { days: 7 }, summary: { days: 7, inBand: { all: 81.26 }, energy: { kWh: 43.2 }, water: { litres: 120.4 } } }, 3),
    { id: 5, href: '#/rooms/3/simulations/5', date: '20 Oct 10:42', days: '7 days', all: '81.3 %', kWh: '43.2 kWh', litres: '120 L', status: 'Done' });
  const running = runRow({ id: 6, createdAt: at, status: 'running', progress: 0.35, input: { days: 1 } }, 3);
  assert.deepEqual([running.status, running.all, running.days, running.kWh], ['Running 35 %', '—', '1 day', '—']);
  assert.equal(runRow({ id: 7, createdAt: at, status: 'failed', error: 'x' }, 3).status, 'Failed');
  assert.equal(runRow({ id: 8, createdAt: at, status: 'queued' }, 3).status, 'Waiting');
});
