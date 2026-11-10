// The Economics service (server/economics.js, spec 2026-11-06-economics-design.md 4, 6 and 7): the real Harvest and Batches
// on one farm; every figure's source in its order, the owner's figure over a real one, the scopes, Settings' prices, the
// room-size research, a part not read; Work it out with a stand-in queue: working, done, failed, deleted, refused, one at a
// time, the room's limit, a restart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createEvents } from '../server/events.js';
import { validateSimulation, RESTART_TEXT } from '../server/simulations.js';
import { writeSettings } from '../server/settings.js';
import { fixedZone } from '../server/usage.js';
import { createEconomics, EconomicsError } from '../server/economics.js';
import { DELETED_TEXT } from '../server/economics-sim.js';

const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8);
const NOW = at('2026-11-10');
const zone = fixedZone(480);
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 }; // 69 m³: a 40 ft

// A stand-in for simulations.start: the real checks, a stored queued run; full: the room's limit reached.
function standIn(db, now) {
  return {
    full: false,
    start(roomId, body) {
      const checked = validateSimulation(body);
      if (checked.error) return checked;
      if (this.full) return { error: 'This room already has 5 simulations waiting or running', conflict: true };
      return { run: db.createRun(roomId, { ...checked.input, ctx: {} }, now()) };
    },
  };
}

function setup(t, { rooms = 1, ...more } = {}) {
  const db = openDb(':memory:');
  let clock = NOW;
  const now = () => clock;
  const events = createEvents();
  const heard = [];
  events.subscribe((type, data) => { if (type === 'economics') heard.push(data); });
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const ids = Array.from({ length: rooms }, (_, i) => db.createRoom({ ...ROOM, name: `Container ${i + 1}`, trhAddress: i + 1 }, NOW).id);
  const simulations = standIn(db, now);
  const make = () => createEconomics({ db, harvests, batches, simulations, events, now, zone, log: () => {}, days: (room, count) => [], ...more });
  const econ = make();
  t.after(async () => {
    econ.close();
    harvests.stop();
    await harvests.warmed();
    db.close();
  });
  return { db, events, heard, econ, make, simulations, ids, room: ids[0], setClock: (ms) => { clock = ms; } };
}
const fig = (v, key) => v.figures.find((f) => f.key === key);
const pick = (f) => ({ value: f.value, source: f.source });

test('a new farm: every figure research but the electricity price (Settings); the room\'s size; lion\'s mane without a crop', (t) => {
  const s = setup(t);
  const v = s.econ.view();
  assert.deepEqual(v.rooms, [{ id: s.room, name: 'Container 1' }]);
  assert.deepEqual(v.room, { id: s.room, name: 'Container 1', volume: 69, size: '40 ft', humidifierLH: s.db.getRoom(s.room).humidifierLH });
  assert.deepEqual([v.crop, v.ways, v.left], ['lionsmane', ['yours', 'highland', 'import', 'warm'], [{ way: 'shed', reason: 'warm-strain' }]]);
  assert.deepEqual(v.errors, {});
  assert.equal(v.sim, null);
  assert.ok(v.machinesNote.includes("Simulate's default"));
  assert.deepEqual(pick(fig(v, 'tariff')), { value: 0.55, source: 'settings' });
  assert.deepEqual(pick(fig(v, 'yours.blocks')), { value: 1518, source: 'research' });
  assert.deepEqual(pick(fig(v, 'yours.racks')), { value: 1062.6, source: 'research' }, 'RM 0.70 a block');
  assert.ok(v.figures.filter((f) => f.key !== 'tariff').every((f) => f.source === 'research'));
  assert.deepEqual(Object.keys(fig(v, 'price').research), ['value', 'low', 'high', 'confidence', 'sources', 'note']);
  assert.deepEqual(v.figures.slice(0, 3).map((f) => [f.key, f.way, f.scope]), [['price', 'shared', 'crop'], ['shrink', 'shared', 'crop'], ['pack', 'shared', 'crop']]);
  assert.deepEqual(s.econ.view({ room: s.room, crop: 'oyster' }).ways, ['yours', 'shed']);
});

test('the crop shown without one: the room\'s main crop when one of the four, else lion\'s mane; a bad crop or room refused', (t) => {
  const s = setup(t);
  s.db.setProgram(s.room, { ...s.db.getProgram(s.room), crops: [{ crop: 'oyster', blocks: 300 }, { crop: 'pink', blocks: 500 }] }, { change: 'start', at: NOW });
  assert.equal(s.econ.view().crop, 'pink');
  s.db.setProgram(s.room, { ...s.db.getProgram(s.room), crops: [{ crop: 'black', blocks: 300 }] }, { change: 'restart', at: NOW });
  assert.equal(s.econ.view().crop, 'lionsmane', 'black oyster is not one of the four');
  assert.equal(fig(s.econ.view(), 'yours.blocks').source, 'runs', 'the room\'s own blocks still count');
  assert.throws(() => s.econ.view({ crop: 'black' }), (e) => e instanceof EconomicsError && e.status === 400 && e.message === 'Pick a crop' && e.field === 'crop');
  assert.throws(() => s.econ.view({ room: 99 }), (e) => e.status === 404 && e.message === 'Room not found');
});

test('no rooms: no room, no figures', (t) => {
  const s = setup(t, { rooms: 0 });
  assert.deepEqual(s.econ.view(), {
    rooms: [], room: null, crop: 'lionsmane', ways: ['yours', 'highland', 'import', 'warm'], left: [{ way: 'shed', reason: 'warm-strain' }],
    figures: [], sim: null, machinesNote: null, errors: {},
  });
  // a room asked for that is not there is a 404 (spec 7.1), with no rooms too: the page then asks without it
  assert.throws(() => s.econ.view({ room: 1 }), (e) => e instanceof EconomicsError && e.status === 404 && e.message === 'Room not found');
  assert.equal(s.econ.view({ crop: 'oyster' }).room, null);
});

test('the sources in order: You set over Your runs (kept beside it), Your runs, Settings\' expected price, Research', (t) => {
  const s = setup(t);
  const { db, room } = s;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'lionsmane', blocks: 1000 }] }, { change: 'start', at: at('2026-10-01', 9) });
  const run = db.openRun(room);
  db.insertHarvest({ roomId: room, runId: run.id, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1000, kg: 230, pickedAt: at('2026-10-20'), worker: null, taskId: null, at: at('2026-10-20') });
  db.setProgram(room, { ...db.getProgram(room), crops: [] }, { change: 'end', at: at('2026-11-05', 9) });
  let v = s.econ.view();
  assert.deepEqual(pick(fig(v, 'yours.yieldG')), { value: 230, source: 'runs' });
  assert.equal(fig(v, 'yours.yieldG').runs.count, 1);
  assert.deepEqual([fig(v, 'yours.loss').value, fig(v, 'yours.loss').source, fig(v, 'yours.loss').notes], [0, 'runs', ['loss-in-yield']]);
  assert.deepEqual(pick(fig(v, 'yours.blocks')), { value: 1000, source: 'runs' }, 'the latest run\'s blocks in an empty room');
  assert.deepEqual(pick(fig(v, 'price')), { value: 50, source: 'research' });
  writeSettings(db, { cropYield: { lionsmane: { dryKg: 0.4, priceKg: 55 } } });
  writeSettings(db, { electricityPrice: 0.6 });
  v = s.econ.view();
  assert.deepEqual(pick(fig(v, 'price')), { value: 55, source: 'settings' });
  assert.deepEqual(pick(fig(v, 'tariff')), { value: 0.6, source: 'settings' });
  s.econ.setFigure({ room, crop: 'lionsmane', key: 'yours.yieldG', value: 250 });
  s.econ.setFigure({ room, crop: 'lionsmane', key: 'yours.loss', value: 5 });
  v = s.econ.setFigure({ room, crop: 'lionsmane', key: 'price', value: 60 });
  assert.deepEqual([fig(v, 'yours.yieldG').source, fig(v, 'yours.yieldG').value, fig(v, 'yours.yieldG').at], ['owner', 250, NOW]);
  assert.deepEqual(fig(v, 'yours.yieldG').real, { value: 230, source: 'runs' });
  assert.deepEqual(fig(v, 'price').real, { value: 55, source: 'settings' });
  assert.deepEqual(pick(fig(v, 'yours.loss')), { value: 5, source: 'owner' });
  assert.deepEqual(fig(v, 'yours.loss').notes, [], 'the yield is the owner\'s now: no runs\' loss under it');
  v = s.econ.clearFigure({ room, crop: 'lionsmane', key: 'yours.yieldG' });
  assert.deepEqual(fig(v, 'yours.loss').notes, ['loss-twice'], 'a loss set over your runs\' yield counts lost blocks twice');
  assert.equal(fig(v, 'yours.loss').real.source, 'runs');
  v = s.econ.clearFigure({ room, crop: 'lionsmane', key: 'yours.loss' });
  assert.deepEqual(pick(fig(v, 'yours.loss')), { value: 0, source: 'runs' });
  assert.equal(fig(s.econ.setFigure({ room, crop: 'lionsmane', key: 'wage', value: 12 }), 'wage').real, null, 'nothing real under it');
});

test('the scopes: a crop\'s price for every room, a farm\'s wage for every crop, a room\'s rent for every crop, a yield for one room and crop', (t) => {
  const s = setup(t, { rooms: 2 });
  const [one, two] = s.ids;
  s.econ.setFigure({ room: one, crop: 'lionsmane', key: 'price', value: 60 });
  s.econ.setFigure({ room: one, crop: 'lionsmane', key: 'wage', value: 12 });
  s.econ.setFigure({ room: one, crop: 'lionsmane', key: 'yours.rent', value: 300 });
  s.econ.setFigure({ room: one, crop: 'lionsmane', key: 'yours.yieldG', value: 260 });
  const other = s.econ.view({ room: two, crop: 'lionsmane' });
  assert.deepEqual([fig(other, 'price').value, fig(other, 'wage').value, fig(other, 'yours.rent').source, fig(other, 'yours.yieldG').source], [60, 12, 'research', 'research']);
  const oyster = s.econ.view({ room: one, crop: 'oyster' });
  assert.deepEqual([fig(oyster, 'price').source, fig(oyster, 'wage').value, fig(oyster, 'yours.rent').value, fig(oyster, 'yours.yieldG').source], ['research', 12, 300, 'research']);
  assert.equal(s.heard.length, 4, 'an economics event a save');
  assert.deepEqual(s.heard[0], { roomId: one, crop: 'lionsmane' });
});

test('setFigure and clearFigure refuse: a room not there, a bad crop, a figure not of the crop\'s ways, the electricity price, out of range', (t) => {
  const s = setup(t);
  const refused = (fn, status, message, field) => assert.throws(fn, (e) => e.status === status && e.message === message && e.field === field);
  refused(() => s.econ.setFigure({ room: 99, crop: 'oyster', key: 'price', value: 1 }), 404, 'Room not found', undefined);
  refused(() => s.econ.setFigure({ room: s.room, crop: 'x', key: 'price', value: 1 }), 400, 'Pick a crop', 'crop');
  refused(() => s.econ.setFigure({ room: s.room, crop: 'oyster', key: 'highland.yieldG', value: 1 }), 400, 'Unknown figure', 'key');
  refused(() => s.econ.setFigure({ room: s.room, crop: 'oyster', key: 'tariff', value: 1 }), 400, 'Electricity price is set in Settings', 'key');
  refused(() => s.econ.setFigure({ room: s.room, crop: 'oyster', key: 'yours.loss', value: 100 }), 400, 'Blocks lost must be a number from 0 to 90\u00a0%', 'value');
  refused(() => s.econ.clearFigure({ room: s.room, crop: 'oyster', key: 'nope' }), 400, 'Unknown figure', 'key');
  assert.equal(fig(s.econ.clearFigure({ room: s.room, crop: 'oyster', key: 'price' }), 'price').source, 'research', 'nothing set: as it was');
  assert.deepEqual(s.heard, [], 'nothing saved, nothing told');
});

test('a part not read: logged, named in errors, its figures noted and from the next source', (t) => {
  const logged = [];
  const s = setup(t, { batches: { list() { throw new Error('boom'); } }, log: (what) => logged.push(what) });
  const { db, room } = s;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'lionsmane', blocks: 1000 }] }, { change: 'start', at: at('2026-10-01', 9) });
  const run = db.openRun(room);
  db.insertHarvest({ roomId: room, runId: run.id, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1000, kg: 230, pickedAt: at('2026-10-20'), worker: null, taskId: null, at: at('2026-10-20') });
  db.setProgram(room, { ...db.getProgram(room), crops: [] }, { change: 'end', at: at('2026-11-05', 9) });
  const v = s.econ.view();
  assert.deepEqual(v.errors, { batches: 'Something went wrong' });
  assert.deepEqual(logged, ["Economics: couldn't read batches:"]);
  assert.deepEqual([fig(v, 'blockPrice').source, fig(v, 'blockPrice').notes], ['research', ['not-read:batches']]);
  assert.equal(fig(v, 'yours.yieldG').source, 'runs', 'the rest still read');
});

test('the electricity per block: Your runs while a day is worked out notes pending and falls to the simulator, then research', (t) => {
  const s = setup(t, { days: (room, count) => Array.from({ length: count }, (_, i) => ({ date: zone.label(NOW - (count - 1 - i) * 86_400_000), pending: true })) });
  const { db, room } = s;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'lionsmane', blocks: 1000 }] }, { change: 'start', at: at('2026-10-01', 9) });
  const run = db.openRun(room);
  db.insertHarvest({ roomId: room, runId: run.id, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1000, kg: 230, pickedAt: at('2026-10-20'), worker: null, taskId: null, at: at('2026-10-20') });
  db.setProgram(room, { ...db.getProgram(room), crops: [] }, { change: 'end', at: at('2026-11-05', 9) });
  let f = fig(s.econ.view(), 'yours.kwhBlock');
  assert.deepEqual([f.source, f.value, f.notes, f.runs], ['research', 0.4, ['pending'], { count: 1 }]);
  db.startEconomicsSim({ roomId: room, crop: 'lionsmane', simId: null, at: NOW });
  db.settleEconomicsSim({ roomId: room, crop: 'lionsmane', value: 0.48, at: NOW - 5, kwh: 480, blocks: 1000, days: 42 });
  f = fig(s.econ.view(), 'yours.kwhBlock');
  assert.deepEqual([f.source, f.value, f.at], ['simulator', 0.48, NOW - 5]);
});

test('Work it out: queued (waiting), working with the run\'s progress, done (kWh ÷ blocks saved), again, failed (the figure kept)', (t) => {
  const s = setup(t);
  const { db, room, events } = s;
  const out = s.econ.workOut({ room, crop: 'lionsmane' });
  assert.equal(out.status, 202);
  const [run] = db.listRuns(room);
  assert.deepEqual(run.input.crops, [{ crop: 'lionsmane', blocks: 1518 }]);
  assert.equal(run.input.days, 42, 'one block life at the research defaults');
  assert.deepEqual([out.view.sim.status, out.view.sim.simId, out.view.sim.startedAt, out.view.sim.value], ['waiting', run.id, NOW, null]);
  db.setRunProgress(run.id, 'running', 0.4);
  assert.deepEqual([s.econ.view().sim.status, s.econ.view().sim.progress], ['working', 0.4]);
  assert.throws(() => s.econ.workOut({ room, crop: 'lionsmane' }), (e) => e.status === 409 && e.message === "Already working it out for Container 1 and Lion's mane");
  db.finishRun(run.id, { status: 'done', summary: { energy: { kWh: 725.6 } } }, NOW + 4000);
  events.publish('simulation', { id: run.id, roomId: room, status: 'done', progress: 1 });
  let v = s.econ.view();
  assert.deepEqual([v.sim.status, v.sim.value, v.sim.kwh, v.sim.blocks, v.sim.days, v.sim.at], ['done', 0.478, 725.6, 1518, 42, NOW + 4000]);
  assert.deepEqual(pick(fig(v, 'yours.kwhBlock')), { value: 0.478, source: 'simulator' });
  assert.deepEqual(s.heard.map((h) => h.crop), ['lionsmane', 'lionsmane'], 'told when it started and when it settled');
  s.econ.workOut({ room, crop: 'lionsmane' });
  const again = db.listRuns(room)[0];
  assert.equal(fig(s.econ.view(), 'yours.kwhBlock').value, 0.478, 'the figure before it stays while it works');
  db.finishRun(again.id, { status: 'failed', error: 'The simulation worker stopped (exit code 1)' }, NOW + 9000);
  events.publish('simulation', { id: again.id, roomId: room, status: 'failed', progress: 0 });
  v = s.econ.view();
  assert.deepEqual([v.sim.status, v.sim.error, v.sim.value], ['failed', 'The simulation worker stopped (exit code 1)', 0.478]);
  assert.equal(fig(v, 'yours.kwhBlock').value, 0.478);
});

test('Work it out: a run deleted meanwhile fails it; the room\'s limit and the simulation\'s checks refuse; no queue, no route', (t) => {
  const s = setup(t);
  const { db, room } = s;
  s.econ.workOut({ room, crop: 'oyster' });
  db.deleteRun(db.listRuns(room)[0].id);
  assert.deepEqual([s.econ.view({ room, crop: 'oyster' }).sim.status, s.econ.view({ room, crop: 'oyster' }).sim.error], ['failed', 'The simulation was deleted']);
  s.simulations.full = true;
  assert.throws(() => s.econ.workOut({ room, crop: 'pink' }), (e) => e.status === 409 && e.message === 'This room already has 5 simulations waiting or running');
  s.simulations.full = false;
  db.createRun(room, { physics: { wallUA: 999_999 } }, NOW); // the newest run's walls: out of the simulation's range
  const refused = s.econ.workOut({ room, crop: 'pink' });
  assert.equal(refused.status, 200);
  assert.deepEqual([refused.view.sim.status, refused.view.sim.error], ['failed', 'Wall heat transfer must be a number from 0 to 100000 W/K']);
  const none = createEconomics({ db, harvests: { roomView: () => ({ past: [] }) }, batches: { list: () => ({ batches: [] }) }, now: () => NOW, zone });
  assert.throws(() => none.workOut({ room, crop: 'pink' }), (e) => e.status === 404 && e.message === 'Not found');
});

test('a restart settles every row still working from its run: Simulate\'s restart failure', (t) => {
  const s = setup(t);
  const { db, room } = s;
  s.econ.workOut({ room, crop: 'lionsmane' });
  s.econ.close();
  db.failUnfinishedRuns(RESTART_TEXT, NOW + 1); // what createSimulations does as the farm app starts
  const after = s.make();
  t.after(() => after.close());
  assert.deepEqual([after.view().sim.status, after.view().sim.error], ['failed', 'Stopped by a restart of the farm app']);
});

test('a late event of an older run never settles the run working now (only the row\'s own simulation settles it)', (t) => {
  const s = setup(t);
  const { db, room, events } = s;
  s.econ.workOut({ room, crop: 'lionsmane' });
  const [first] = db.listRuns(room);
  db.finishRun(first.id, { status: 'done', summary: { energy: { kWh: 725.6 } } }, NOW + 4000);
  assert.equal(s.econ.view().sim.value, 0.478, 'its event missed: the view settled it');
  s.econ.workOut({ room, crop: 'lionsmane' });
  const [second] = db.listRuns(room);
  events.publish('simulation', { id: first.id, roomId: room, status: 'done', progress: 1 });
  let v = s.econ.view();
  assert.deepEqual([v.sim.status, v.sim.simId, v.sim.value, v.sim.at], ['waiting', second.id, 0.478, NOW + 4000]);
  db.finishRun(second.id, { status: 'done', summary: { energy: { kWh: 607.2 } } }, NOW + 9000);
  events.publish('simulation', { id: second.id, roomId: room, status: 'done', progress: 1 });
  v = s.econ.view();
  assert.deepEqual([v.sim.status, v.sim.simId, v.sim.value, v.sim.at], ['done', second.id, 0.4, NOW + 9000]);
});

test('a run id reused after its run was deleted (cancelled, no event): the row fails as deleted, its figure kept; the other room\'s run its own', (t) => {
  const s = setup(t, { rooms: 2 });
  const { db, events, setClock } = s;
  const [one, two] = s.ids;
  s.econ.workOut({ room: one, crop: 'lionsmane' });
  const [done] = db.listRuns(one);
  db.finishRun(done.id, { status: 'done', summary: { energy: { kWh: 725.6 } } }, NOW + 4000);
  events.publish('simulation', { id: done.id, roomId: one, status: 'done', progress: 1 });
  s.econ.workOut({ room: one, crop: 'lionsmane' });
  const [cancelled] = db.listRuns(one);
  db.deleteRun(cancelled.id); // simulations.cancel: no event
  setClock(NOW + 60_000);
  s.econ.setFigure({ room: two, crop: 'lionsmane', key: 'yours.turn', value: 70 }); // a 96-day block life: the run's 90 scaled
  s.econ.workOut({ room: two, crop: 'lionsmane' });
  const [impostor] = db.listRuns(two);
  assert.equal(impostor.id, cancelled.id, 'SQLite gives the deleted top id to the next run');
  db.finishRun(impostor.id, { status: 'done', summary: { energy: { kWh: 900 } } }, NOW + 70_000);
  events.publish('simulation', { id: impostor.id, roomId: two, status: 'done', progress: 1 });
  const v = s.econ.view({ room: one, crop: 'lionsmane' });
  assert.deepEqual([v.sim.status, v.sim.error, v.sim.value, v.sim.at], ['failed', DELETED_TEXT, 0.478, NOW + 4000]);
  const other = s.econ.view({ room: two, crop: 'lionsmane' });
  assert.deepEqual([other.sim.status, other.sim.value, other.sim.kwh, other.sim.days], ['done', 0.632, 960, 96], 'scaled by its own life');
});

test('a run id reused in the same room by a later run: the view shows no progress of it, the row fails as deleted', (t) => {
  const s = setup(t);
  const { db, room, setClock } = s;
  s.econ.workOut({ room, crop: 'oyster' });
  const [cancelled] = db.listRuns(room);
  db.deleteRun(cancelled.id);
  setClock(NOW + 60_000);
  const later = db.createRun(room, { physics: {} }, NOW + 60_000);
  assert.equal(later.id, cancelled.id);
  db.setRunProgress(later.id, 'running', 0.7);
  const { sim } = s.econ.view({ room, crop: 'oyster' });
  assert.deepEqual([sim.status, sim.error, sim.progress], ['failed', DELETED_TEXT, null]);
});

test('Work it out after a run cancelled with no event and no view: settled as deleted, a new run started (not 409)', (t) => {
  const s = setup(t);
  const { db, room } = s;
  s.econ.workOut({ room, crop: 'pink' });
  db.deleteRun(db.listRuns(room)[0].id);
  const out = s.econ.workOut({ room, crop: 'pink' });
  assert.equal(out.status, 202);
  assert.equal(out.view.sim.status, 'waiting');
  assert.equal(db.listRuns(room).length, 1);
});

// The stand-in's start ending its run before it returns, and saying so (the real start fails a run whose worker cannot spawn).
function endsAtOnce(s, outcome) {
  const start = s.simulations.start;
  s.simulations.start = function (roomId, body) {
    const out = start.call(this, roomId, body);
    if (out.run) {
      s.db.finishRun(out.run.id, outcome, NOW + 1000);
      s.events.publish('simulation', { id: out.run.id, roomId, status: outcome.status, progress: outcome.status === 'done' ? 1 : 0 });
    }
    return out;
  };
}

test('Work it out whose run fails inside start (its event before the row): the row failed with the run\'s error, told twice', (t) => {
  const s = setup(t);
  endsAtOnce(s, { status: 'failed', error: 'boom' });
  const out = s.econ.workOut({ room: s.room, crop: 'lionsmane' });
  assert.deepEqual([out.view.sim.status, out.view.sim.error, out.view.sim.value], ['failed', 'boom', null]);
  assert.equal(s.heard.length, 2, 'started and settled');
});

test('Work it out whose run is done inside start: settled at once, a block life over 90 days scaled', (t) => {
  const s = setup(t);
  s.econ.setFigure({ room: s.room, crop: 'lionsmane', key: 'yours.turn', value: 70 }); // 12 + 14 + 70 = 96 days
  s.heard.length = 0;
  endsAtOnce(s, { status: 'done', summary: { energy: { kWh: 900 } } });
  const { view } = s.econ.workOut({ room: s.room, crop: 'lionsmane' });
  assert.equal(s.db.listRuns(s.room)[0].input.days, 90);
  assert.deepEqual([view.sim.status, view.sim.value, view.sim.kwh, view.sim.days, view.sim.at], ['done', 0.632, 960, 96, NOW + 1000]);
  assert.equal(s.heard.length, 2);
});

test('Work it out with the simulations\' clock ahead of the service\'s: the run is its own, not gone', (t) => {
  const s = setup(t);
  const start = s.simulations.start;
  s.simulations.start = (roomId, body) => {
    const out = start.call(s.simulations, roomId, body);
    s.db.deleteRun(out.run.id);
    return { run: s.db.createRun(roomId, out.run.input, NOW + 5000) };
  };
  const out = s.econ.workOut({ room: s.room, crop: 'lionsmane' });
  assert.deepEqual([out.view.sim.status, out.view.sim.error, out.view.sim.startedAt], ['waiting', null, NOW + 5000]);
});

test('clearFigure with no body: the room refused, not a TypeError', (t) => {
  const s = setup(t);
  assert.throws(() => s.econ.clearFigure(undefined), (e) => e instanceof EconomicsError && e.status === 404 && e.message === 'Room not found');
});

test('close stops listening to the events', (t) => {
  const s = setup(t);
  const n = s.events.listeners();
  s.econ.close();
  assert.equal(s.events.listeners(), n - 1);
});
