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
  const { body, days, machinesNote } = simBody({ room, lastRun: null, crop: 'lionsmane', blocks: 1482, life: 42, now: T });
  assert.deepEqual(body, {
    physics: { wallUA: 80, sunW: 300, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterLifeDays: 30, filterChangeDays: 30, filterUsedDays: 0, filterSensor: false,
      fanFlow: 600, acBTU: 12000, humidifierLH: room.humidifierLH, dehumidifierLday: 0 },
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
  const { body } = simBody({ room, lastRun, crop: 'oyster', blocks: 500, life: 60, now: T });
  assert.deepEqual(body.physics, {
    wallUA: 30, sunW: 900, outdoorHigh: 34, outdoorLow: 24, outdoorDew: 23, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80,
    filterLifeDays: 90, filterChangeDays: 0, filterUsedDays: 0, filterSensor: false, fanFlow: 450, acBTU: 24000, humidifierLH: 4, dehumidifierLday: 0,
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

test('no newest run, or one from before the filter: the room\'s own filter from Setup, its days since the last change, its sensor', () => {
  const db = openDb(':memory:');
  const id = db.createRoom({ ...ROOM, dpAddress: 7 }, T).id;
  db.updateRoom(id, { ...db.getRoom(id), fanMaxPa: 300, filterCleanPa: 50, filterFinalPa: 120, filterChangeDays: 45 });
  db.markFilterChanged(id, T - 10 * 86400000, null);
  const room = db.getRoom(id);
  const old = { createdAt: T, input: { physics: { wallUA: 30, sunW: 900, outdoorHigh: 34, outdoorLow: 24, outdoorDew: 23 } } };
  for (const lastRun of [null, old]) {
    const { body } = simBody({ room, lastRun, crop: 'oyster', blocks: 500, life: 30, now: T });
    assert.equal(body.physics.fanMaxPa, 300);
    assert.equal(body.physics.filterCleanPa, 50);
    assert.equal(body.physics.filterFinalPa, 120);
    assert.equal(body.physics.filterChangeDays, 45);
    assert.equal(body.physics.filterLifeDays, 30, 'the filter life has no room field: Simulate\'s default');
    assert.equal(body.physics.filterUsedDays, 10, 'the room\'s days since its last change, not the run\'s');
    assert.equal(body.physics.filterSensor, true);
    assert.equal(validateSimulation(body).error, undefined);
  }
  assert.equal(simBody({ room: { ...room, filterChangedAt: T - 900 * 86400000 }, lastRun: null, crop: 'oyster', blocks: 5, life: 30, now: T }).body.physics.filterUsedDays, 365, 'capped at the field\'s limit');
  db.close();
});

test('a room with a dehumidifier fitted: its capacity in the body', () => {
  const db = openDb(':memory:');
  const id = db.createRoom(ROOM, T).id;
  db.updateRoom(id, { ...db.getRoom(id), dehumidifier: true, dehumidifierLday: 12 });
  const room = db.getRoom(id);
  const { body } = simBody({ room, lastRun: null, crop: 'oyster', blocks: 500, life: 30, now: T });
  assert.equal(body.physics.dehumidifierLday, 12);
  assert.equal(validateSimulation(body).error, undefined);
  db.close();
});

test('edges: a life that is not a number or below one day is one day; simFigure with no crops or no days is null', () => {
  const room = { name: 'R', length: 5, width: 3, height: 2.5 };
  for (const life of [NaN, -5, 0]) assert.equal(simBody({ room, lastRun: null, crop: 'oyster', blocks: 5, life }).days, 1, String(life));
  assert.equal(simFigure({ input: { days: 42, crops: [] }, summary: { energy: { kWh: 10 } } }, 42), null);
  assert.equal(simFigure({ input: { crops: [{ crop: 'oyster', blocks: 5 }] }, summary: { energy: { kWh: 10 } } }, 42), null);
});
