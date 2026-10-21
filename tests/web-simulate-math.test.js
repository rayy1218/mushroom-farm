import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROGRAM_DEFAULTS, programDays as serverProgramDays } from '../server/program.js';
import {
  PHYSICS_FIELDS, DEFAULT_CROPS, DAYS_DEFAULT, initialState, checkStep, firstField, stepOf, buildBody, mixSummary, wholeProgram,
  programDays, programOf, stagesOf, fixStage, roomLine, summaryLines, progressLine, bandLines, removeLabel,
} from '../web/simulate-math.js';

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
  assert.deepEqual(PHYSICS_FIELDS.map((f) => f.key), ['wallUA', 'outdoorHigh', 'outdoorLow', 'outdoorDew', 'sunW', 'fanFlow', 'acBTU', 'humidifierLH', 'dehumidifierLday']);
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
  assert.deepEqual(s.physics, { wallUA: '80', outdoorHigh: '33', outdoorLow: '25', outdoorDew: '24', sunW: '300', fanFlow: '600', acBTU: '12000', humidifierLH: '1.5', dehumidifierLday: '0' });
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
  assert.equal(e['physics.acBTU'], 'Aircon capacity must be a whole number from 0 to 200000 BTU/h');
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
    physics: { wallUA: 95.5, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 1.5, dehumidifierLday: 0 },
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
  assert.deepEqual(m.lines, ['Temperature 24–26 °C', 'Humidity 85–91 %', 'CO₂ 700–900 ppm']);
  assert.deepEqual(m.warnings, []);
  s.crops = [{ crop: 'oyster', blocks: '500' }, { crop: 'milky', blocks: '10' }];
  assert.ok(mixSummary(s).warnings.some((w) => /do not fit one temperature band/.test(w)));
  s.crops = [{ crop: 'pink', blocks: '5' }]; // fruiting 26 °C: inside 24 to 29; 
  assert.deepEqual(mixSummary(s).warnings, []);
  s.crops = [{ crop: 'oyster', blocks: '5' }, { crop: 'pink', blocks: '5' }, { crop: 'lionsmane', blocks: '5' }];
  assert.ok(mixSummary(s).warnings.length >= 1);
  s.crops = [{ crop: 'oyster', blocks: 'x' }];
  assert.equal(mixSummary(s), null);
  assert.deepEqual(bandLines({ tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, co2Safety: 1500 }), ['Temperature 24–26 °C', 'Humidity 85–91 %', 'CO₂ 700–900 ppm']);
});

test('the summary and the room line', () => {
  assert.equal(roomLine(room), 'Room size 6 × 4 × 3 m, 72.0 m³');
  const s = initialState({ room });
  const lines = summaryLines(s, room);
  assert.deepEqual(lines.map((l) => l.label), ['Room', 'Walls and weather', 'Machines', 'Crops', 'Run']);
  assert.equal(lines[3].text, 'Grey oyster, 500 blocks; ready-to-fruit blocks, starting at fruiting');
  assert.equal(lines[2].text, 'Fan 600 m³/h, aircon 12,000 BTU/h, humidifier 1.5 L/h, no dehumidifier');
  assert.equal(lines[1].text, 'Walls 80 W/K, sun on the roof 300 W, outdoor 25–33 °C, dew point 24 °C');
  assert.equal(lines[4].text, '7 days');
  s.daysMode = 'whole';
  assert.equal(summaryLines(s, room)[4].text, 'Whole program, 68 days');
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
  assert.equal(summaryLines(s, room)[2].text, 'Fan 600 m³/h, aircon 12,000 BTU/h, humidifier 1.5 L/h, dehumidifier 20 L/day');
});
