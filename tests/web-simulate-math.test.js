import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROGRAM_DEFAULTS, programDays as serverProgramDays } from '../server/program.js';
import {
  PHYSICS_FIELDS, DEFAULT_CROPS, DAYS_DEFAULT, initialState, checkStep, firstField, stepOf, buildBody, mixSummary, wholeProgram,
  programDays, programOf, stagesOf, fixStage, roomLine, summaryLines, progressLine, bandLines, removeLabel,
  TARGET_DEFAULT, checkTarget, sizingBody, sizingProgress, sizingRows, estimateLines, useSetup,
  COOL_START_HOUR, coolDownLine, startChoices, filterFromRoom,
  RUN_CONTROL, runControl, setRunControl, resetRunControl, controlLine, controlText, fixedControlLine,
} from '../web/simulate-math.js';
import { COOL_START_HOUR as SERVER_COOL_START_HOUR } from '../server/sizing.js';

const room = { id: 3, name: 'Room 1', length: 6, width: 4, height: 3, volume: 72, humidifierLH: 1.5 };

test('the limits and defaults are those of the device app (device/sim-store.js PARAMS)', () => {
  const src = readFileSync(new URL('../device/sim-store.js', import.meta.url), 'utf8');
  for (const f of PHYSICS_FIELDS.filter((x) => x.device !== false)) { // the dehumidifier's limit is the spec's, not a PARAMS entry
    const m = new RegExp(`^\\s*${f.key}: \\{ min: (-?\\d+), max: (\\d+), whole: (true|false),.* value: (\\d+) \\}`, 'm').exec(src);
    assert.ok(m, `${f.key} is in PARAMS`);
    assert.equal(f.min, Number(m[1]), `${f.key} min`);
    assert.equal(f.max, Number(m[2]), `${f.key} max`);
    assert.equal(f.whole, m[3] === 'true', `${f.key} whole`);
    if (f.key !== 'humidifierLH') assert.equal(f.def, Number(m[4]), `${f.key} default`);
  }
  assert.deepEqual(PHYSICS_FIELDS.map((f) => f.key), ['wallUA', 'outdoorHigh', 'outdoorLow', 'outdoorDew', 'sunW', 'fanFlow', 'acBTU', 'humidifierLH', 'dehumidifierLday',
    'fanMaxPa', 'filterCleanPa', 'filterFinalPa', 'filterLifeDays', 'filterChangeDays', 'filterUsedDays']);
});

test('the page copy of programDays agrees with server/program.js', () => {
  const cases = [];
  for (const farmType of ['ready', 'full']) {
    for (const stage of farmType === 'ready' ? ['fruiting', 'rest'] : ['spawn', 'pinning', 'fruiting', 'rest']) {
      for (const flushes of [1, 2, 4, 10]) {
        for (const flush of [1, Math.min(2, flushes)]) cases.push({ farmType, stage, flushes, flush });
      }
    }
  }
  for (const c of cases) {
    const p = { ...PROGRAM_DEFAULTS, ...c, crops: [{ crop: 'oyster', blocks: 5 }], days: { spawn: 20, pinning: 3, fruiting: 6, rest: 9 } };
    assert.equal(programDays(p, c.stage, c.flush), serverProgramDays(p, c.stage, c.flush), JSON.stringify(c));
  }
  assert.equal(programDays({ ...PROGRAM_DEFAULTS, crops: [] }, 'fruiting', 1), 68); // 4 flushes of 7 + 10, the last rest included 
});

test('first open: the defaults, the humidifier from the room rating, 7 days', () => {
  const s = initialState({ room });
  assert.deepEqual(s.physics, { wallUA: '80', outdoorHigh: '33', outdoorLow: '25', outdoorDew: '24', sunW: '300', fanFlow: '600', acBTU: '12000', humidifierLH: '1.5', dehumidifierLday: '0',
    fanMaxPa: '200', filterCleanPa: '40', filterFinalPa: '80', filterLifeDays: '30', filterChangeDays: '30', filterUsedDays: '0' });
  assert.deepEqual(s.crops, [{ crop: 'oyster', blocks: '500' }]);
  assert.deepEqual([s.farmType, s.stage, s.daysMode, s.days], ['ready', 'fruiting', 'days', String(DAYS_DEFAULT)]);
  assert.equal(DEFAULT_CROPS[0].crop, 'oyster');
  assert.equal(initialState({ room: { ...room, humidifierLH: undefined } }).physics.humidifierLH, '2');
});

test('prefill: the physics from the last run, the crops from the room', () => {
  const lastRun = { input: { physics: { wallUA: 120, outdoorHigh: 35, outdoorLow: 26, outdoorDew: 25, sunW: 500, fanFlow: 800, acBTU: 18000, humidifierLH: 3 }, crops: [{ crop: 'pink', blocks: 40 }], farmType: 'full', stage: 'spawn', days: 30 } };
  const cropData = { crops: [{ crop: 'milky', blocks: 70 }, { crop: 'pink', blocks: 30 }], farmType: 'full', stage: 'pinning', flush: 1, flushes: 3, days: { spawn: 20, pinning: 3, fruiting: 6, rest: 9 } };
  const s = initialState({ room, lastRun, cropData });
  assert.equal(s.physics.wallUA, '120');
  assert.equal(s.physics.humidifierLH, '3');
  assert.deepEqual(s.crops, [{ crop: 'milky', blocks: '70' }, { crop: 'pink', blocks: '30' }]);
  assert.deepEqual([s.farmType, s.stage, s.days], ['full', 'pinning', '7']);
  // a room without crops: Grey oyster 500 but its farm type and stage
  const none = initialState({ room, cropData: { ...cropData, crops: [] } });
  assert.deepEqual(none.crops, [{ crop: 'oyster', blocks: '500' }]);
  // a room without crops and a last run: that run's crops, farm type and stage
  const again = initialState({ room, lastRun, cropData: { ...cropData, crops: [] } });
  assert.deepEqual(again.crops, [{ crop: 'pink', blocks: '40' }]);
  assert.deepEqual([again.farmType, again.stage], ['full', 'spawn']);
  // an odd last run (no input, a missing number) falls back to the defaults
  assert.equal(initialState({ room, lastRun: { input: { physics: { wallUA: null } } } }).physics.wallUA, '80');
  assert.equal(initialState({ room, lastRun: {} }).physics.wallUA, '80');
});

test('step 1 checks the numbers like the device app and the outdoor order', () => {
  const s = initialState({ room });
  assert.deepEqual(checkStep(1, s), {});
  s.physics.wallUA = '-1';
  s.physics.acBTU = '12000.5';
  s.physics.fanFlow = '';
  s.physics.outdoorHigh = '61';
  const e = checkStep(1, s);
  assert.equal(e['physics.wallUA'], 'Wall heat transfer must be a number from 0 to 100000 W/K');
  assert.equal(e['physics.acBTU'], 'Aircon size must be a number from 0 to 58.6 kW');
  assert.ok(e['physics.fanFlow']);
  assert.equal(e['physics.outdoorHigh'], 'Outdoor day high must be a number from -40 to 60 °C');
  assert.equal(firstField(e), 'physics.wallUA');
  const t = initialState({ room });
  t.physics.outdoorLow = '34';
  assert.deepEqual(Object.keys(checkStep(1, t)), ['physics.outdoorLow']);
  assert.equal(checkStep(1, t)['physics.outdoorLow'], 'Outdoor night low must not be above the day high');
  const u = initialState({ room });
  u.physics.outdoorDew = '26';
  assert.equal(checkStep(1, u)['physics.outdoorDew'], 'Outdoor dew point must not be above the night low');
});

test('step 2 checks the crops and the stage', () => {
  const s = initialState({ room });
  assert.deepEqual(checkStep(2, s), {});
  s.crops = [{ crop: 'oyster', blocks: '0' }];
  assert.equal(checkStep(2, s).crops, 'Blocks must be a whole number from 1 to 100000');
  s.crops = [{ crop: 'oyster', blocks: '5' }, { crop: 'oyster', blocks: '5' }];
  assert.equal(checkStep(2, s).crops, 'Grey oyster is in the list twice');
  s.crops = [];
  assert.equal(checkStep(2, s).crops, 'Add at least one crop');
  s.crops = [{ crop: 'oyster', blocks: '2.5' }];
  assert.ok(checkStep(2, s).crops);
  s.crops = [{ crop: 'oyster', blocks: '5' }];
  s.stage = 'spawn';
  assert.equal(checkStep(2, s).stage, 'Stage must be one of fruiting, rest');
});

test('step 3 checks the days; the whole program counts them', () => {
  const s = initialState({ room });
  assert.deepEqual(checkStep(3, s), {});
  for (const bad of ['0', '91', '2.5', '', 'x']) {
    s.days = bad;
    assert.equal(checkStep(3, s).days, 'Days must be a whole number from 1 to 90', bad);
  }
  s.daysMode = 'whole'; // the typed days are not used
  assert.deepEqual(checkStep(3, s), {});
  assert.deepEqual(wholeProgram(s, null), { days: 68, total: 68, capped: false });
  assert.deepEqual(wholeProgram({ ...s, farmType: 'full', stage: 'spawn' }, null), { days: 90, total: 21 + 4 + 4 * 17, capped: true });
  assert.deepEqual(wholeProgram(s, { flushes: 2, days: { spawn: 21, pinning: 4, fruiting: 8, rest: 5 } }), { days: 26, total: 26, capped: false });
});

test('the program numbers come from the room, else the defaults', () => {
  assert.deepEqual(programOf(null), { flushes: 4, days: { spawn: 21, pinning: 4, fruiting: 7, rest: 10 } });
  assert.equal(programOf({ flushes: 2, days: { spawn: 1, pinning: 2, fruiting: 3, rest: 4 } }).flushes, 2);
  assert.equal(programOf({ flushes: 'x' }).flushes, 4);
});

test('the body is what POST /api/rooms/:id/simulations takes', () => {
  const s = initialState({ room });
  s.physics.wallUA = '95.5';
  s.crops = [{ crop: 'oyster', blocks: '500' }, { crop: 'pink', blocks: '20' }];
  s.days = '14';
  assert.deepEqual(buildBody(s), {
    physics: { wallUA: 95.5, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 1.5, dehumidifierLday: 0,
      fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterLifeDays: 30, filterChangeDays: 30, filterUsedDays: 0, filterSensor: false },
    crops: [{ crop: 'oyster', blocks: 500 }, { crop: 'pink', blocks: 20 }], farmType: 'ready', stage: 'fruiting', days: 14,
  });
  s.daysMode = 'whole';
  assert.equal(buildBody(s).days, 68);
  assert.equal(buildBody(s, { flushes: 2, days: { spawn: 1, pinning: 1, fruiting: 10, rest: 5 } }).days, 30);
});

test('a server field belongs to a step', () => {
  assert.equal(stepOf('physics.wallUA'), 1);
  assert.equal(stepOf('crops'), 2);
  assert.equal(stepOf('farmType'), 2);
  assert.equal(stepOf('stage'), 2);
  assert.equal(stepOf('days'), 3);
  assert.equal(stepOf('physics'), 1);
  assert.equal(stepOf(undefined), null);
  assert.equal(stepOf('name'), null);
});

test('farm type decides the stages', () => {
  assert.deepEqual(stagesOf('ready'), ['fruiting', 'rest']);
  assert.deepEqual(stagesOf('full'), ['spawn', 'pinning', 'fruiting', 'rest']);
  assert.equal(fixStage('ready', 'spawn'), 'fruiting');
  assert.equal(fixStage('full', 'rest'), 'rest');
});

test('the mix: bands and warnings in words', () => {
  const s = initialState({ room });
  const m = mixSummary(s);
  assert.deepEqual(m.lines, ['Temperature 24–26 °C', 'Humidity 85–91 % RH', 'Air exchange starts at 900, stops at 700 ppm']);
  assert.deepEqual(m.warnings, []);
  s.crops = [{ crop: 'oyster', blocks: '500' }, { crop: 'milky', blocks: '10' }];
  assert.ok(mixSummary(s).warnings.some((w) => /do not fit one temperature band/.test(w)));
  s.crops = [{ crop: 'pink', blocks: '5' }]; // fruiting 26 °C: inside 24 to 29; 
  assert.deepEqual(mixSummary(s).warnings, []);
  s.crops = [{ crop: 'oyster', blocks: '5' }, { crop: 'pink', blocks: '5' }, { crop: 'lionsmane', blocks: '5' }];
  assert.ok(mixSummary(s).warnings.length >= 1);
  s.crops = [{ crop: 'oyster', blocks: 'x' }];
  assert.equal(mixSummary(s), null);
  assert.deepEqual(bandLines({ tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, co2Safety: 1500 }), ['Temperature 24–26 °C', 'Humidity 85–91 % RH', 'Air exchange starts at 900, stops at 700 ppm']);
});

test('the summary and the room line', () => {
  assert.equal(roomLine(room), 'Room size 6 × 4 × 3 m, 72.0 m³');
  const s = initialState({ room });
  const lines = summaryLines(s, room);
  const line = (label, of = lines) => of.find((l) => l.label === label).text;
  assert.deepEqual(lines.map((l) => l.label), ['Room', 'Walls and weather', 'Machines', 'Control', 'Filter', 'Crops', 'Run']);
  assert.equal(line('Crops'), 'Grey oyster, 500 blocks; ready-to-fruit blocks, starting at fruiting');
  assert.equal(line('Machines'), 'Fan 600 m³/h, aircon 3.5 kW (12,000 BTU/h class), humidifier 1.5 L/h, no dehumidifier');
  assert.equal(line('Walls and weather'), 'Walls 80 W/K, sun on the roof 300 W, outdoor 25–33 °C, dew point 24 °C');
  assert.equal(line('Run'), '7 days');
  s.daysMode = 'whole';
  assert.equal(line('Run', summaryLines(s, room)), 'Whole program, 68 days');
});

test('the progress line', () => {
  assert.equal(progressLine({ status: 'queued', progress: 0 }), 'Waiting for its turn…');
  assert.equal(progressLine({ status: 'running', progress: 0.354 }), 'Running… 35 %');
  assert.equal(progressLine({ status: 'running', progress: undefined }), 'Running… 0 %');
  assert.equal(progressLine({ status: 'done', progress: 1 }), 'Done');
  assert.equal(progressLine({ status: 'failed', error: 'Stopped by a restart of the farm app' }), 'Failed: Stopped by a restart of the farm app');
});

test('the Remove button of a crop row is named after the crop it holds now', () => {
  assert.equal(removeLabel('black'), 'Remove Black oyster');
  assert.equal(removeLabel('golden'), 'Remove Golden oyster');
  assert.equal(removeLabel('nope'), 'Remove crop');
});

test('the dehumidifier input: 0 to 200 L/day, 0 is none; the room (when fitted) or the last run prefill it', () => {
  const f = PHYSICS_FIELDS.find((x) => x.key === 'dehumidifierLday');
  assert.deepEqual([f.label, f.unit, f.min, f.max, f.def], ['Dehumidifier', 'L/day', 0, 200, 0]);
  assert.equal(initialState({ room }).physics.dehumidifierLday, '0');
  assert.equal(initialState({ room: { ...room, dehumidifier: false, dehumidifierLday: 20 } }).physics.dehumidifierLday, '0');
  assert.equal(initialState({ room: { ...room, dehumidifier: true, dehumidifierLday: 12.5 } }).physics.dehumidifierLday, '12.5');
  const lastRun = { input: { physics: { dehumidifierLday: 30 } } };
  assert.equal(initialState({ room: { ...room, dehumidifier: true, dehumidifierLday: 12.5 }, lastRun }).physics.dehumidifierLday, '30');
  // a last run from before the dehumidifier has none: the room's
  assert.equal(initialState({ room: { ...room, dehumidifier: true, dehumidifierLday: 12.5 }, lastRun: { input: { physics: { wallUA: 90 } } } }).physics.dehumidifierLday, '12.5');
  const s = initialState({ room });
  s.physics.dehumidifierLday = '201';
  assert.equal(checkStep(1, s)['physics.dehumidifierLday'], 'Dehumidifier must be a number from 0 to 200 L/day');
  s.physics.dehumidifierLday = '20';
  assert.deepEqual(checkStep(1, s), {});
  assert.equal(buildBody(s).physics.dehumidifierLday, 20);
  assert.equal(stepOf('physics.dehumidifierLday'), 1);
  assert.equal(summaryLines(s, room).find((l) => l.label === 'Machines').text, 'Fan 600 m³/h, aircon 3.5 kW (12,000 BTU/h class), humidifier 1.5 L/h, dehumidifier 20 L/day');
});

// ---- suggest machines (spec 2026-10-22 section 7) ----

const job = {
  id: 'j1', status: 'done', progress: 1,
  result: {
    target: 95, days: 7,
    estimate: { fanFlow: 150, humidifierLH: 0.5, dehumidifierMaxLday: 20, acBTU: 9000, exchangeMaxMin: 30,
      why: { fanFlow: 'Fresh air for the CO₂ of 500 blocks', humidifierLH: 'Moisture the fan takes out', dehumidifierLday: 'Water the crops give off', acBTU: 'Heat the walls let in', exchangeMaxMin: 'A longer limit saves energy' } },
    best: [
      { machines: { fanFlow: 150, humidifierLH: 0.5, dehumidifierLday: 10, acBTU: 9000 }, exchangeMaxMin: 30, inBand: { t: 99.12, rh: 97, co2: 98, all: 96.04 }, kWh: 41.26, litres: 12, removedLitres: 3 },
      { machines: { fanFlow: 200, humidifierLH: 1, dehumidifierLday: 0, acBTU: 12000 }, exchangeMaxMin: 10, inBand: { t: 99, rh: 90, co2: 99, all: 88 }, kWh: 55, litres: 20, removedLitres: 0 },
    ],
    reached: true, notes: ['A tighter wall would save energy'],
  },
};

test('the target: a whole number from 50 to 99, default 95', () => {
  assert.equal(TARGET_DEFAULT, '95');
  for (const ok of ['50', '95', '99', ' 80 ']) assert.equal(checkTarget(ok), null, ok);
  for (const bad of ['49', '100', '', 'abc', '95.5', '-5', '9 5']) assert.equal(checkTarget(bad), 'Target must be a whole number from 50 to 99 %', bad);
});

test('the sizing body: the walls, weather and sun, the crops and the target', () => {
  const s = initialState({ room });
  const b = sizingBody(s, '90');
  assert.deepEqual(Object.keys(b), ['physics', 'crops', 'farmType', 'stage', 'target']);
  assert.deepEqual(b.physics, { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300 });
  assert.deepEqual([b.crops, b.farmType, b.stage, b.target], [[{ crop: 'oyster', blocks: 500 }], 'ready', 'fruiting', 90]);
});

test('sizing progress words', () => {
  assert.equal(sizingProgress({ status: 'queued' }), 'Waiting for its turn…');
  assert.equal(sizingProgress({ status: 'running', progress: 0.354 }), 'Trying setups… 35 %');
  assert.equal(sizingProgress({ status: 'running' }), 'Trying setups… 0 %');
  assert.equal(sizingProgress({ status: 'running', progress: 0.3, tried: 34, total: 96 }), 'Trying 34 of 96 setups…');
  assert.equal(sizingProgress({ status: 'running', progress: 0.5, total: 48 }), 'Trying 24 of 48 setups…', 'the server sends total and progress');
  assert.equal(sizingProgress({ status: 'failed', error: 'boom' }), 'Failed: boom');
  assert.equal(sizingProgress({ status: 'failed' }), 'Failed: the search stopped');
  assert.equal(sizingProgress({ status: 'done' }), 'Done');
});

test('the table rows: texts, Best on the first, reached marks by words', () => {
  const rows = sizingRows(job.result);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    index: 0, best: true, reached: true, mark: 'Best, reaches 95 %',
    fan: '150', humidifier: '0.5', dehumidifier: '10', aircon: '2.6 kW (9,000 BTU/h class)', limit: '30', t: '99.1', rh: '97.0', co2: '98.0', all: '96.0', kWh: '41.3',
    coolDown: '—', // a suggestion from before the cool-down check
  });
  assert.deepEqual([rows[1].best, rows[1].reached, rows[1].mark, rows[1].dehumidifier], [false, false, 'Below 95 %', '0']);
  // the second reaches the target when it is lower
  assert.equal(sizingRows({ ...job.result, target: 90 })[1].mark, 'Reaches 90 %'); // t, rh, co2 each 90 or more (all three is 88: information only)
  assert.equal(sizingRows({ ...job.result, target: 91 })[1].mark, 'Below 91 %'); // humidity 90
  assert.equal(sizingRows({ ...job.result, target: 98 })[0].reached, false); // rh 97
  // a Best row that misses
  assert.equal(sizingRows({ ...job.result, target: 99 })[0].mark, 'Best, below 99 %');
  assert.deepEqual(sizingRows({ best: [] }), []);
  assert.deepEqual(sizingRows(null), []);
});

test('the estimates with their reasons', () => {
  assert.deepEqual(estimateLines(job.result.estimate), [
    'Fan 150 m³/h: Fresh air for the CO₂ of 500 blocks',
    'Humidifier 0.5 L/h: Moisture the fan takes out',
    'Dehumidifier up to 20 L/day: Water the crops give off',
    'Aircon 2.6 kW (9,000 BTU/h class): Heat the walls let in',
    'Air exchange time limit 30 min: A longer limit saves energy',
  ]);
  assert.deepEqual(estimateLines(null), []);
  assert.equal(estimateLines({ fanFlow: 100 })[0], 'Fan 100 m³/h');
});

test('Use this fills step 1 and the run\'s time limit; the POST carries it only when it differs from the room', () => {
  const s = initialState({ room });
  const rows = sizingRows(job.result);
  useSetup(s, job.result.best[0], 10);
  assert.deepEqual([s.physics.fanFlow, s.physics.humidifierLH, s.physics.dehumidifierLday, s.physics.acBTU], ['150', '0.5', '10', '9000']);
  assert.equal(s.physics.wallUA, '80'); // walls and weather stay
  assert.equal(s.exchangeMaxMin, 30);
  assert.deepEqual(buildBody(s).control, { exchangeMaxMin: 30 });
  assert.deepEqual(Object.keys(buildBody(s)), ['physics', 'crops', 'farmType', 'stage', 'days', 'control']);
  assert.equal(rows[0].index, 0);
  // the same as the room's: no control in the body
  useSetup(s, job.result.best[1], 10);
  assert.equal(s.exchangeMaxMin, null);
  assert.equal('control' in buildBody(s), false);
  // the room's limit unknown: the run carries it
  useSetup(s, job.result.best[1], null);
  assert.equal(s.exchangeMaxMin, 10);
  assert.deepEqual(buildBody(s).control, { exchangeMaxMin: 10 });
  // no control by default
  assert.equal('control' in buildBody(initialState({ room })), false);
});

test('the summary shows the time limit of the run', () => {
  const s = initialState({ room, roomControl: { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 0, humidifierDuringExchange: false, outdoorAir: true } });
  const control = () => summaryLines(s, room).find((l) => l.label === 'Control').text;
  assert.match(control(), /^Air exchange every 15 min, up to 10 min;/);
  useSetup(s, job.result.best[0], s.roomControl);
  assert.match(control(), /^Air exchange every 15 min, up to 30 min \(for this run; the room: 10 min\);/);
  // the room's limit unknown
  useSetup(s, job.result.best[0], null);
  assert.match(control(), /^Air exchange up to 30 min \(for this run\); the rest as on the Setup tab$/);
});

test('the fields of the sizing and the time limit belong to step 3', () => {
  assert.equal(stepOf('target'), 3);
  assert.equal(stepOf('control.exchangeMaxMin'), 3);
  assert.equal(stepOf('control.acDrop'), 3);
});

// ---- the search's settings: aircon drop and humidifier during exchange (2026-10-22) ----

test('Use this also carries the aircon drop and the humidifier setting when they differ from the room', () => {
  const s = initialState({ room });
  const cand = { machines: { fanFlow: 150, humidifierLH: 0.5, dehumidifierLday: 10, acBTU: 9000 }, exchangeMaxMin: 60, control: { exchangeMaxMin: 60, acDrop: 0, humidifierDuringExchange: false } };
  useSetup(s, cand, { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5, humidifierDuringExchange: true, outdoorAir: true });
  assert.deepEqual(buildBody(s).control, { exchangeMaxMin: 60, acDrop: 0, humidifierDuringExchange: false });
  assert.equal(summaryLines(s, room).find((l) => l.label === 'Control').text, 'Air exchange every 15 min, up to 60 min (for this run; the room: 10 min); '
    + 'aircon not lowered during air exchange (for this run; the room: 5 °C lower); humidifier off during air exchange (for this run; the room: on); outdoor air used');
  // a room that already has them: only the time limit
  useSetup(s, cand, { exchangeMaxMin: 10, acDrop: 0, humidifierDuringExchange: false });
  assert.deepEqual(buildBody(s).control, { exchangeMaxMin: 60 });
  assert.doesNotMatch(summaryLines(s, room).find((l) => l.label === 'Control').text, /aircon[^;]*for this run/);
  // everything as the room: no control at all
  useSetup(s, cand, { exchangeMaxMin: 60, acDrop: 0, humidifierDuringExchange: false });
  assert.equal('control' in buildBody(s), false);
});

// ---- the cool-down (2026-10-28) ----

const cooled = {
  ...job.result, coolDownMaxH: 3, coolDownStartHour: 14,
  best: [
    { ...job.result.best[0], coolDownH: 1.5 },
    { ...job.result.best[0], coolDownH: 4.2, kWh: 30 },
    { ...job.result.best[0], coolDownH: null, kWh: 20 },
    { ...job.result.best[1], coolDownH: 3 },
    { ...job.result.best[1], coolDownH: null },
  ],
};

test('the table rows: Cools down in, and a row that cools down too slowly says so like one below the target', () => {
  const rows = sizingRows(cooled);
  assert.deepEqual(rows.map((r) => r.coolDown), ['1.5 h', '4.2 h', 'not in a day', '3.0 h', 'not in a day']);
  assert.deepEqual(rows.map((r) => r.reached), [true, false, false, false, false]);
  assert.deepEqual(rows.map((r) => r.mark), [
    'Best, reaches 95 %', 'Reaches 95 %, cools down in over 3 h', 'Reaches 95 %, cools down in over 3 h', 'Below 95 %', 'Below 95 %, cools down in over 3 h',
  ]);
  assert.equal(sizingRows({ ...cooled, coolDownMaxH: 5 })[1].reached, true);
});

test('the line that says what the cool-down is', () => {
  assert.equal(coolDownLine(cooled), 'Cool-down: from outdoor air at 14:00 (just loaded, or after the door was open) until temperature and humidity are in band and hold it for an hour (at most 0.5 °C too warm or 2 % RH too dry now and then); at most 3 h.');
  assert.match(coolDownLine({ ...cooled, coolDownMaxH: 1.5 }), /; at most 1.5 h\.$/);
  assert.equal(coolDownLine(job.result), null, 'none before the check');
});

test('the estimates: the cool-down line after the aircon', () => {
  const est = { ...job.result.estimate, acCoolBTU: 12000, humidifierCoolLH: 2, why: { ...job.result.estimate.why, coolDown: 'From outdoor air at 14:00' } };
  assert.equal(estimateLines(est)[4], 'Cool-down aircon 3.5 kW (12,000 BTU/h class), humidifier 2 L/h: From outdoor air at 14:00');
  assert.equal(estimateLines(est).length, 6);
});

test('Start from: in band (a room that is running) by default, or outdoor air at 14:00; the body carries it only from outdoor air', () => {
  assert.equal(COOL_START_HOUR, SERVER_COOL_START_HOUR);
  assert.deepEqual(startChoices, [
    { value: 'band', label: 'In band (a room that is running)' },
    { value: 'outdoor', label: 'Outdoor air at 14:00 (just loaded)' },
  ]);
  const s = initialState({ room });
  assert.equal(s.start, 'band');
  assert.equal('start' in buildBody(s) || 'startHour' in buildBody(s), false);
  s.start = 'outdoor';
  const body = buildBody(s);
  assert.deepEqual([body.start, body.startHour], ['outdoor', 14]);
  assert.deepEqual(summaryLines(s, room).find((l) => l.label === 'Start'), { label: 'Start', text: 'From outdoor air at 14:00 (just loaded)' });
  assert.equal(summaryLines(initialState({ room }), room).some((l) => l.label === 'Start'), false);
  assert.equal(stepOf('start'), 3);
  assert.equal(stepOf('startHour'), 3);
  assert.equal(stepOf('coolDownMaxH'), 3);
});

// ---- the dialog's fold of the intake filter (critique 2026-10-28) ----

test("the intake filter folds while its values are the room's own", () => {
  const filtered = { ...room, fanMaxPa: 250, filterCleanPa: 50, filterFinalPa: 120, filterChangeDays: 14, filterChangedAt: Date.UTC(2026, 9, 20) };
  const now = Date.UTC(2026, 9, 28, 12);
  const s = initialState({ room: filtered, now });
  assert.equal(filterFromRoom(s, filtered, now), true);
  s.physics.filterFinalPa = '100';
  assert.equal(filterFromRoom(s, filtered, now), false);
  // the last run's filter life (no room field: the default 30 days) is not the room's
  const fromRun = initialState({ room: filtered, now, lastRun: { input: { physics: { filterLifeDays: 60 } } } });
  assert.equal(filterFromRoom(fromRun, filtered, now), false);
  // 80 and 80.0 are the same number
  const same = initialState({ room: filtered, now });
  same.physics.filterFinalPa = '120.0';
  assert.equal(filterFromRoom(same, filtered, now), true);
  same.physics.filterFinalPa = 'x';
  assert.equal(filterFromRoom(same, filtered, now), false);
});

// ---- step 3's Control row and Change for this run (critique 2026-10-28: two runs of the same machines scored 0.8 % and
// 98.3 % in band, and nothing in Simulate showed the control settings that made the difference) ----

const roomControl = { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5, humidifierDuringExchange: true, outdoorAir: true, auto: true, tLow: 24 };

test('the Control row: the room\'s air exchange, aircon and humidifier during it, and outdoor air', () => {
  const s = initialState({ room, roomControl });
  assert.deepEqual(s.roomControl, { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5, humidifierDuringExchange: true, outdoorAir: true });
  const lines = summaryLines(s, room);
  assert.deepEqual(lines.map((l) => l.label), ['Room', 'Walls and weather', 'Machines', 'Control', 'Filter', 'Crops', 'Run']);
  assert.equal(controlLine(s), 'Air exchange every 15 min, up to 10 min; aircon 5 °C lower during air exchange; humidifier on during air exchange; outdoor air used');
  assert.equal(lines[3].text, controlLine(s));
  const quiet = initialState({ room, roomControl: { ...roomControl, exchangeEveryMin: 0, acDrop: 0, humidifierDuringExchange: false, outdoorAir: false } });
  assert.equal(controlLine(quiet), 'Fresh air interval off; air exchange up to 10 min; aircon not lowered during air exchange; humidifier off during air exchange; outdoor air not used');
  // the room's settings could not be read
  assert.equal(controlLine(initialState({ room })), 'As on the Setup tab (they could not be read)');
});

test('Change for this run: each setting the server takes for one run; the body carries only those that differ from the room', () => {
  assert.deepEqual(RUN_CONTROL.map((f) => f.key), ['exchangeMaxMin', 'acDrop', 'humidifierDuringExchange', 'outdoorAir']);
  assert.deepEqual(RUN_CONTROL.map((f) => f.label), ['Air exchange time limit (min)', 'Aircon lower during air exchange (°C)',
    'Humidifier on during air exchange', 'Use outdoor air (free cooling, drying, wait out wet air)']);
  const s = initialState({ room, roomControl });
  assert.equal('control' in buildBody(s), false);
  assert.deepEqual([controlText(s, 'exchangeMaxMin'), controlText(s, 'acDrop')], ['10', '5']);
  setRunControl(s, 'exchangeMaxMin', '60');
  setRunControl(s, 'acDrop', '0');
  setRunControl(s, 'humidifierDuringExchange', false);
  setRunControl(s, 'outdoorAir', false);
  assert.deepEqual(buildBody(s).control, { exchangeMaxMin: 60, acDrop: 0, humidifierDuringExchange: false, outdoorAir: false });
  assert.deepEqual(runControl(s).values, { exchangeEveryMin: 15, exchangeMaxMin: 60, acDrop: 0, humidifierDuringExchange: false, outdoorAir: false });
  assert.equal(controlLine(s), 'Air exchange every 15 min, up to 60 min (for this run; the room: 10 min); aircon not lowered during air exchange (for this run; the room: 5 °C lower); '
    + 'humidifier off during air exchange (for this run; the room: on); outdoor air not used (for this run; the room: used)');
  assert.deepEqual(checkStep(3, s), {});
  // back to the room's value: no longer the run's own
  setRunControl(s, 'exchangeMaxMin', '10');
  setRunControl(s, 'outdoorAir', true);
  assert.deepEqual(buildBody(s).control, { acDrop: 0, humidifierDuringExchange: false });
  // checked like the server, the text kept as typed
  setRunControl(s, 'exchangeMaxMin', '2.5');
  setRunControl(s, 'acDrop', '11');
  assert.equal(controlText(s, 'exchangeMaxMin'), '2.5');
  assert.deepEqual(checkStep(3, s), {
    'control.exchangeMaxMin': 'Air exchange time limit must be a whole number from 1 to 120 min',
    'control.acDrop': 'Aircon lower during air exchange must be a number from 0 to 10 °C',
  });
  assert.equal(firstField(checkStep(3, s)), 'control.exchangeMaxMin');
  setRunControl(s, 'acDrop', '2.5');
  assert.equal(buildBody({ ...s, controlTexts: {} }).control.acDrop, 2.5);
  // the room's settings again
  resetRunControl(s);
  assert.equal('control' in buildBody(s), false);
  assert.deepEqual(checkStep(3, s), {});
  assert.equal(controlText(s, 'exchangeMaxMin'), '10');
});

test('the room\'s settings unknown: a run\'s own still go with it, the rest as on the Setup tab', () => {
  const s = initialState({ room });
  assert.equal(controlText(s, 'exchangeMaxMin'), '');
  setRunControl(s, 'exchangeMaxMin', '30');
  assert.deepEqual(buildBody(s).control, { exchangeMaxMin: 30 });
  assert.equal(controlLine(s), 'Air exchange up to 30 min (for this run); the rest as on the Setup tab');
});

test('the fresh air interval is not the run\'s to change: it says so', () => {
  assert.equal(fixedControlLine(initialState({ room, roomControl })), 'Fresh air at least every 15 min: set on the Setup tab');
  assert.equal(fixedControlLine(initialState({ room, roomControl: { ...roomControl, exchangeEveryMin: 0 } })), 'Fresh air interval off: set on the Setup tab');
  assert.equal(fixedControlLine(initialState({ room })), null);
});

test('Use this replaces what was typed for this run', () => {
  const s = initialState({ room, roomControl });
  setRunControl(s, 'exchangeMaxMin', 'x');
  setRunControl(s, 'outdoorAir', false);
  useSetup(s, { machines: { fanFlow: 150, humidifierLH: 0.5, dehumidifierLday: 10, acBTU: 9000 }, exchangeMaxMin: 60, control: { exchangeMaxMin: 60, acDrop: 0, humidifierDuringExchange: false } });
  assert.deepEqual(checkStep(3, s), {});
  assert.deepEqual(buildBody(s).control, { exchangeMaxMin: 60, acDrop: 0, humidifierDuringExchange: false });
  assert.equal(controlText(s, 'exchangeMaxMin'), '60');
});

test('Simulate again with a run carries its own control settings', () => {
  const run = { input: { physics: { fanFlow: 300 }, control: { exchangeMaxMin: 60, acDrop: 0, outdoorAir: false } } };
  const s = initialState({ room, roomControl, lastRun: run, again: run });
  assert.deepEqual(buildBody(s).control, { exchangeMaxMin: 60, acDrop: 0, outdoorAir: false });
  assert.equal(controlText(s, 'exchangeMaxMin'), '60');
  // the room's newest run is only a prefill of the machines: its settings stay its own
  assert.equal('control' in buildBody(initialState({ room, roomControl, lastRun: run })), false);
});
