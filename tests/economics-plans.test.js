// A run's plan (server/economics-plans.js through server/economics.js, spec 2026-11-12-economics-stage-2-design.md 7.1 and
// 7.4): saved when the run starts (the room's crop event), for each crop of the four, once, with the crop's own blocks; new
// blocks and a crop added; a missed event caught on a read (not at start); a part not read saves nothing until it is; the
// plans view, a run before stage 2, the refusals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createEvents } from '../server/events.js';
import { fixedZone } from '../server/usage.js';
import { createEconomics, EconomicsError } from '../server/economics.js';
import { figuresFor } from '../web/economics-defaults.js';

const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8);
const zone = fixedZone(480);
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };
const PLAN_KEYS = (crop) => figuresFor(crop).filter((f) => f.way === 'shared' || f.way === 'yours').map((f) => f.key);

function setup(t) {
  const db = openDb(':memory:');
  let clock = at('2026-09-01', 9);
  const now = () => clock;
  const events = createEvents();
  const heard = [];
  events.subscribe((type, data) => { if (type === 'economics') heard.push(data); });
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const room = db.createRoom(ROOM, clock).id;
  const other = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, clock).id;
  const made = [];
  const make = () => {
    const e = createEconomics({ db, harvests, batches, events, now, zone, log: () => {}, days: () => [] });
    made.push(e);
    return e;
  };
  const econ = make();
  t.after(async () => {
    for (const e of made) e.close();
    harvests.stop();
    await harvests.warmed();
    db.close();
  });
  // The Crop tab's save: the program and the run, then the room's crop event (api.js publishes it after the save).
  const crops = (roomId, list, change, { tell = true } = {}) => {
    db.setProgram(roomId, { ...db.getProgram(roomId), crops: list }, change && { change, at: clock });
    if (tell) events.publish('room', { id: roomId, part: 'crop' });
  };
  return { db, events, heard, econ, make, harvests, room, other, crops, setClock: (ms) => { clock = ms; } };
}

test('a run opened on the Crop tab saves its plan: every shared and Your container figure, the model\'s context; once', (t) => {
  const s = setup(t);
  s.crops(s.other, [{ crop: 'oyster', blocks: 300 }], 'start');
  s.heard.length = 0;
  s.crops(s.room, [{ crop: 'lionsmane', blocks: 1200 }], 'start');
  const run = s.db.openRun(s.room).id;
  const plan = s.db.economicsPlan(run, 'lionsmane');
  assert.equal(plan.at, at('2026-09-01', 9));
  assert.deepEqual(Object.keys(plan.figures), PLAN_KEYS('lionsmane'));
  assert.deepEqual(plan.figures['yours.blocks'], { value: 1200, source: 'runs' }, 'the room\'s blocks from its Crop tab');
  assert.deepEqual(plan.figures.price, { value: 50, source: 'research' });
  assert.equal(plan.figures['highland.yieldG'], undefined, 'nothing of the other ways');
  assert.deepEqual(plan.context, { otherBlocks: 300, register: null, cropBlocks: 1200 }, 'the crop\'s own blocks beside the room\'s');
  assert.deepEqual(s.heard, [{ roomId: s.room, crop: 'lionsmane', plan: true }]);
  // the next crop event (a stage change) saves nothing; a figure changed later leaves the plan as saved
  s.econ.setFigure({ room: s.room, crop: 'lionsmane', key: 'price', value: 61 });
  s.heard.length = 0;
  s.events.publish('room', { id: s.room, part: 'crop' });
  assert.deepEqual(s.heard, []);
  assert.deepEqual(s.db.economicsPlan(run, 'lionsmane').figures.price, { value: 50, source: 'research' });
  // another part of the room says nothing about runs
  s.events.publish('room', { id: s.room, part: 'readings' });
  assert.deepEqual(s.heard, []);
});

test('new blocks on a done room, a crop added to the open run, a crop not of the four', (t) => {
  const s = setup(t);
  s.crops(s.room, [{ crop: 'lionsmane', blocks: 1000 }], 'start');
  const first = s.db.openRun(s.room).id;
  s.setClock(at('2026-10-15', 9));
  s.crops(s.room, [{ crop: 'lionsmane', blocks: 900 }], 'restart');
  const second = s.db.openRun(s.room).id;
  assert.notEqual(first, second);
  assert.equal(s.db.economicsPlan(second, 'lionsmane').figures['yours.blocks'].value, 900);
  assert.equal(s.db.economicsPlan(second, 'lionsmane').at, at('2026-10-15', 9));
  s.setClock(at('2026-10-20', 9));
  s.crops(s.room, [{ crop: 'lionsmane', blocks: 900 }, { crop: 'oyster', blocks: 200 }], 'update');
  assert.equal(s.db.economicsPlan(second, 'oyster').at, at('2026-10-20', 9), 'its blocks went in then');
  assert.deepEqual(Object.keys(s.db.economicsPlan(second, 'oyster').figures), PLAN_KEYS('oyster'));
  // the room's blocks then (every crop's) and the crop's own: the run is compared at the room as the plan had it
  assert.equal(s.db.economicsPlan(second, 'oyster').figures['yours.blocks'].value, 1100);
  assert.equal(s.db.economicsPlan(second, 'oyster').context.cropBlocks, 200);
  assert.equal(s.db.economicsPlan(second, 'lionsmane').context.cropBlocks, 900);
  s.crops(s.other, [{ crop: 'black', blocks: 500 }], 'start');
  assert.equal(s.db.economicsPlan(s.db.openRun(s.other).id, 'black'), null);
});

test('a missed event: the plan is saved on a plans read, not when the service starts', (t) => {
  const s = setup(t);
  s.crops(s.room, [{ crop: 'lionsmane', blocks: 1000 }], 'start', { tell: false });
  const run = s.db.openRun(s.room).id;
  assert.equal(s.db.economicsPlan(run, 'lionsmane'), null);
  s.make();
  assert.equal(s.db.economicsPlan(run, 'lionsmane'), null, 'not at start: no figures worked out as the app comes up');
  s.econ.plans({ room: s.room, crop: 'lionsmane' });
  assert.notEqual(s.db.economicsPlan(run, 'lionsmane'), null, 'on a read');
  s.crops(s.other, [{ crop: 'pink', blocks: 400 }], 'start', { tell: false });
  const pink = s.db.openRun(s.other).id;
  s.econ.plans({ room: s.other, crop: 'oyster' });
  assert.notEqual(s.db.economicsPlan(pink, 'pink'), null, 'a read of the room checks its open run, whatever the crop read');
});

test('the plans view: the run in progress, the finished runs with their plans, a run before stage 2; refusals', (t) => {
  const s = setup(t);
  // a run before stage 2: its row with no figures, as the upgrade writes it
  s.crops(s.room, [{ crop: 'lionsmane', blocks: 1000 }], 'start', { tell: false });
  const before = s.db.openRun(s.room).id;
  s.db.saveEconomicsPlan({ runId: before, roomId: s.room, crop: 'lionsmane', at: at('2026-09-01', 9), figures: null, context: null });
  s.db.insertHarvest({ roomId: s.room, runId: before, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1000, kg: 200, pickedAt: at('2026-09-14'), worker: null, taskId: null, at: at('2026-09-14') });
  s.setClock(at('2026-10-01', 9));
  s.crops(s.room, [{ crop: 'lionsmane', blocks: 1100 }], 'restart');
  const planned = s.db.openRun(s.room).id;
  s.db.insertHarvest({ roomId: s.room, runId: planned, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1100, kg: 120, pickedAt: at('2026-10-14'), worker: null, taskId: null, at: at('2026-10-14') });
  s.setClock(at('2026-10-21', 12));
  const v = s.econ.plans({ room: s.room, crop: 'lionsmane' });
  assert.deepEqual(Object.keys(v), ['room', 'crop', 'current', 'past', 'leftOut', 'plans', 'errors']);
  assert.deepEqual(v.room, { id: s.room, name: 'Container 1', type: 'container' });
  assert.deepEqual(v.current, { runId: planned, from: at('2026-10-01', 9), partial: false, blocksInAt: null, day: 20, kg: 120, blocks: 1100 });
  assert.deepEqual(v.past.map((r) => [r.runId, r.kg, r.blocks]), [[before, 200, 1000]]);
  assert.deepEqual(v.plans[before], { at: at('2026-09-01', 9), before: true });
  assert.equal(v.plans[planned].at, at('2026-10-01', 9));
  assert.equal(v.plans[planned].figures['yours.blocks'].value, 1100);
  assert.deepEqual(v.plans[planned].context, { otherBlocks: 0, register: null, cropBlocks: 1100 });
  assert.deepEqual(v.errors, {});
  assert.throws(() => s.econ.plans({ room: s.room, crop: 'reishi' }), (e) => e instanceof EconomicsError && e.status === 400 && e.field === 'crop');
  assert.throws(() => s.econ.plans({ room: 99, crop: 'lionsmane' }), (e) => e instanceof EconomicsError && e.status === 404);
});

test('a run with no plan row at all reads as before; close() stops listening', (t) => {
  const s = setup(t);
  s.crops(s.room, [{ crop: 'lionsmane', blocks: 1000 }], 'start', { tell: false });
  const run = s.db.openRun(s.room).id;
  s.db.insertHarvest({ roomId: s.room, runId: run, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1000, kg: 50, pickedAt: at('2026-09-10'), worker: null, taskId: null, at: at('2026-09-10') });
  s.setClock(at('2026-09-30', 9));
  s.crops(s.room, [], 'end', { tell: false });
  const v = s.econ.plans({ room: s.room, crop: 'lionsmane' });
  assert.deepEqual(v.plans[run], { at: null, before: true });
  s.econ.close();
  s.crops(s.room, [{ crop: 'oyster', blocks: 100 }], 'start');
  assert.equal(s.db.economicsPlan(s.db.openRun(s.room).id, 'oyster'), null, 'no longer listening');
});

test('a part not read when the run starts saves no plan: the next crop event or plans read saves it with the real figures', (t) => {
  const s = setup(t);
  // a first run, ended, with kg: Your runs then gives the yield
  s.crops(s.room, [{ crop: 'lionsmane', blocks: 1000 }], 'start', { tell: false });
  const first = s.db.openRun(s.room).id;
  s.db.insertHarvest({ roomId: s.room, runId: first, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1, kg: 400, pickedAt: at('2026-09-15'), worker: null, taskId: null, at: at('2026-09-15') });
  s.setClock(at('2026-10-01', 9));
  s.crops(s.room, [], 'end', { tell: false });
  // Harvest can't be read while the next run starts: the figures would be the fallbacks (research), frozen for good
  const real = s.harvests.roomView;
  s.harvests.roomView = () => { throw new Error('made-up read failure'); };
  s.setClock(at('2026-10-02', 9));
  s.heard.length = 0;
  s.crops(s.room, [{ crop: 'lionsmane', blocks: 1000 }], 'start');
  const run = s.db.openRun(s.room).id;
  assert.equal(s.db.economicsPlan(run, 'lionsmane'), null, 'nothing saved from fallback figures');
  assert.deepEqual(s.heard, []);
  assert.deepEqual(s.econ.plans({ room: s.room, crop: 'lionsmane' }).errors, { harvest: 'Something went wrong' }, 'a read still answers');
  assert.equal(s.db.economicsPlan(run, 'lionsmane'), null);
  s.harvests.roomView = real;
  s.setClock(at('2026-10-02', 10));
  s.events.publish('room', { id: s.room, part: 'crop' });
  const plan = s.db.economicsPlan(run, 'lionsmane');
  assert.deepEqual(plan.figures['yours.yieldG'], { value: 400, source: 'runs' }, 'Your runs\' yield, as read once Harvest answers');
  assert.equal(plan.at, at('2026-10-02', 10));
});
