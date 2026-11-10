// Work it out's body and figure (server/economics-sim.js, spec 2026-11-06-economics-design.md 6.1): the room's machines
// from Setup, the walls and weather of its newest simulation else Simulate's defaults, the block life as the days (1 to 90),
// a body the simulation's own checks take; kWh per block from a done run, scaled when the life is over 90 days.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { validateSimulation } from '../server/simulations.js';
import { simBody, simFigure, MAX_SIM_DAYS } from '../server/economics-sim.js';

const T = Date.UTC(2026, 10, 6, 6);
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

test('a room with nothing rated and no simulation: Simulate\'s defaults, said in the note; one block life of the crop', () => {
  const db = openDb(':memory:');
  const room = db.getRoom(db.createRoom(ROOM, T).id);
  const { body, days, machinesNote } = simBody({ room, lastRun: null, crop: 'lionsmane', blocks: 1482, life: 42 });
  assert.deepEqual(body, {
    physics: { wallUA: 80, sunW: 300, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, fanFlow: 600, acBTU: 12000, humidifierLH: room.humidifierLH, dehumidifierLday: 0 },
    crops: [{ crop: 'lionsmane', blocks: 1482 }], farmType: 'ready', stage: 'fruiting', start: 'band', days: 42,
  });
  assert.equal(days, 42);
  assert.match(machinesNote, /Fan flow/);
  assert.equal(validateSimulation(body).error, undefined, 'the simulation\'s checks take it');
  db.close();
});

test('the newest run\'s walls, weather and filter; the room\'s rated aircon; the days 1 to 90', () => {
  const db = openDb(':memory:');
  const id = db.createRoom(ROOM, T).id;
  db.updateRoom(id, { ...db.getRoom(id), acInputW: 2100, humidifierLH: 4 });
  const room = db.getRoom(id);
  const lastRun = { createdAt: T, input: { physics: {
    wallUA: 30, sunW: 900, outdoorHigh: 34, outdoorLow: 24, outdoorDew: 23, fanFlow: 450, acBTU: 9000, humidifierLH: 2,
    fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterLifeDays: 90, filterChangeDays: 0, filterUsedDays: 10, filterSensor: false,
  } } };
  const { body } = simBody({ room, lastRun, crop: 'oyster', blocks: 500, life: 60 });
  assert.deepEqual(body.physics, {
    wallUA: 30, sunW: 900, outdoorHigh: 34, outdoorLow: 24, outdoorDew: 23, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80,
    filterLifeDays: 90, filterChangeDays: 0, filterUsedDays: 10, filterSensor: false, fanFlow: 450, acBTU: 24000, humidifierLH: 4, dehumidifierLday: 0,
  });
  assert.equal(validateSimulation(body).error, undefined);
  assert.equal(simBody({ room, lastRun, crop: 'woodear', blocks: 500, life: 120 }).days, MAX_SIM_DAYS);
  assert.equal(simBody({ room, lastRun, crop: 'pink', blocks: 500, life: 0.4 }).days, 1);
  db.close();
});

test('simFigure: kWh ÷ blocks to 3 places; a life over the run\'s days scales the kWh; no energy, no figure', () => {
  const run = { input: { days: 42, crops: [{ crop: 'lionsmane', blocks: 1482 }] }, summary: { energy: { kWh: 708.7 } } };
  assert.deepEqual(simFigure(run, 42), { value: 0.478, kwh: 708.7, blocks: 1482, days: 42 });
  const long = { input: { days: 90, crops: [{ crop: 'woodear', blocks: 1000 }] }, summary: { energy: { kWh: 600 } } };
  assert.deepEqual(simFigure(long, 120), { value: 0.8, kwh: 800, blocks: 1000, days: 120 });
  assert.deepEqual(simFigure(long, undefined), { value: 0.6, kwh: 600, blocks: 1000, days: 90 }, 'the life unknown: the run\'s days');
  assert.equal(simFigure({ ...run, summary: null }, 42), null);
});
