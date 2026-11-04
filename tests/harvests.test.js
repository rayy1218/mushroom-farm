// The harvest service (server/harvests.js, spec 2026-11-04-harvest-design.md 3, 4 and 6) and the tasks module's Done with kg
// per crop: harvests stamped from a harvest check's Done, Record a harvest, edit and delete with the task's total kept, the
// room and farm views, the CSV and the change hooks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createTasks, TaskError } from '../server/tasks.js';
import { createCropApi } from '../server/crop-api.js';
import { createHarvests, HarvestError } from '../server/harvests.js';
import { harvestCropsOf } from '../server/task-rules.js';
import { fixedZone } from '../server/usage.js';
import { CSV_HEADER, round } from '../server/harvest-math.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 4, 1); // 4 Nov 2026 09:00 on the farm's clock
const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1 };
const OYSTER = [{ crop: 'oyster', blocks: 500 }];
const MIXED = [{ crop: 'oyster', blocks: 500 }, { crop: 'lionsmane', blocks: 100 }];

// A room given its crops through the Crop tab (a run opens) at `start`, then put in fruiting so the harvest checks are wanted.
function setup(t, { crops = OYSTER, start = NOW, fields = {} } = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = start;
  const now = () => clock;
  const cropApi = createCropApi({ db, now });
  const harvested = [];
  const tasks = createTasks({ db, now, log: (e) => { throw e; }, onHarvest: (roomId) => harvested.push(roomId) });
  const harvests = createHarvests({ db, now, zone: fixedZone(480) });
  const changes = [];
  harvests.onChange((roomId) => changes.push(roomId));
  let address = 0;
  const room = (name = ROOM.name, list = crops) => {
    address += 1;
    const id = db.createRoom({ ...ROOM, ...fields, name, trhAddress: address }, clock).id;
    if (list.length) {
      cropApi.put(id, { crops: list });
      db.setProgram(id, { ...db.getProgram(id), stage: 'fruiting', stageSince: clock });
    }
    return id;
  };
  const id = room();
  return {
    db, tasks, harvests, cropApi, id, room, changes, harvested,
    set: (ms) => { clock = ms; },
    later: (ms) => { clock += ms; },
    row: (key, roomId = id) => tasks.roomView(roomId).today.find((r) => r.ruleKey === key),
  };
}

// Calls fn and checks the error it throws: its class, status, message (when given) and field.
function refused(fn, Kind, status, message, field) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof Kind, `a ${Kind.name}, not ${err?.constructor?.name}: ${err?.message}`);
    assert.equal(err.status, status);
    if (message !== null) assert.equal(err.message, message);
    assert.equal(err.field, field);
    return true;
  });
}

test('Done on a harvest check with kg: a harvest stamped with the run, crop, stage, flush and blocks; the task keeps the total', (t) => {
  const s = setup(t);
  const row = s.row('harvestAm');
  assert.deepEqual(row.harvestCrops, [{ crop: 'oyster', name: 'Grey oyster' }]);
  assert.equal(s.row('footbath').harvestCrops, null, 'another rule: null');
  const closed = s.tasks.done(row.id, { worker: 'Ali', amount: 2.4 });
  assert.equal(closed.amount, 2.4);
  assert.equal(closed.harvestCrops, null, 'a closed row: null');
  const run = s.db.openRun(s.id);
  const [h, ...rest] = s.db.taskHarvests(row.id);
  assert.equal(rest.length, 0);
  assert.deepEqual(
    { crop: h.crop, kg: h.kg, flush: h.flush, stage: h.stage, blocks: h.blocks, runId: h.runId, roomId: h.roomId, pickedAt: h.pickedAt, worker: h.worker },
    { crop: 'oyster', kg: 2.4, flush: 1, stage: 'fruiting', blocks: 500, runId: run.id, roomId: s.id, pickedAt: NOW, worker: 'Ali' },
  );

  const pm = s.row('harvestPm');
  assert.equal(s.tasks.done(pm.id, { worker: 'Ali', amount: 0 }).amount, 0, '0 stays on the task');
  assert.deepEqual(s.db.taskHarvests(pm.id), [], 'and makes no harvest');
  s.later(DAY);
  const next = s.row('harvestAm');
  assert.equal(s.tasks.done(next.id, { worker: 'Ali', amount: '' }).amount, null, 'empty: no amount');
  assert.deepEqual(s.db.taskHarvests(next.id), []);
  const one = s.row('harvestPm');
  assert.equal(s.tasks.done(one.id, { worker: 'Ali', amounts: { oyster: 1.5 } }).amount, 1.5, 'amounts with the one crop is taken too');
  assert.equal(s.db.taskHarvests(one.id)[0].kg, 1.5);
});

test('a mixed room: amounts per crop; amount alone refused; a crop the rule is not for refused', (t) => {
  const s = setup(t, { crops: MIXED });
  const row = s.row('harvestAm');
  assert.deepEqual(row.harvestCrops, [{ crop: 'oyster', name: 'Grey oyster' }, { crop: 'lionsmane', name: "Lion's mane (draft)" }]);
  refused(() => s.tasks.done(row.id, { worker: 'Ali', amount: 3 }), TaskError, 400, 'Give the kg of each crop', 'amount');
  refused(() => s.tasks.done(row.id, { worker: 'Ali', amounts: { oyster: -1 } }), TaskError, 400, null, 'amounts');
  refused(() => s.tasks.done(row.id, { worker: 'Ali', amounts: [2] }), TaskError, 400, null, 'amounts');
  assert.equal(s.tasks.done(row.id, { worker: 'Ali', amounts: { oyster: 2, lionsmane: 0.5 } }).amount, 2.5);
  assert.deepEqual(s.db.taskHarvests(row.id).map((h) => [h.crop, h.kg, h.blocks]), [['oyster', 2, 500], ['lionsmane', 0.5, 100]]);

  const pm = s.row('harvestPm');
  assert.equal(s.tasks.done(pm.id, { worker: 'Ali', amounts: { oyster: '', lionsmane: null } }).amount, null, 'all empty: no amount');
  assert.deepEqual(s.db.taskHarvests(pm.id), []);

  const other = s.room('Room 2', [{ crop: 'oyster', blocks: 300 }, { crop: 'woodear', blocks: 200 }]);
  const am = s.row('harvestAm', other);
  assert.deepEqual(am.harvestCrops, [{ crop: 'oyster', name: 'Grey oyster' }], 'only the crops the rule is for');
  refused(() => s.tasks.done(am.id, { worker: 'Ali', amounts: { woodear: 1 } }), TaskError, 400, null, 'amounts');
  assert.deepEqual(s.row('harvestDaily', other).harvestCrops, [{ crop: 'woodear', name: 'Black jelly (wood ear)' }]);
  refused(() => s.tasks.done(s.row('footbath', other).id, { worker: 'Ali', amounts: { oyster: 1 } }), TaskError, 400, null, 'amounts');
  assert.equal(s.tasks.done(am.id, { worker: 'Ali', amount: 1.2 }).amount, 1.2, 'one crop of the rule: amount as now');
  assert.deepEqual(s.db.taskHarvests(am.id).map((h) => [h.crop, h.blocks]), [['oyster', 300]]);
});

test('harvestCropsOf: the room\'s crops a harvest rule is for, in the room\'s order; null for another rule', () => {
  assert.deepEqual(harvestCropsOf('reishiRim', [{ crop: 'oyster', blocks: 1 }, { crop: 'reishi', blocks: 2 }]), [{ crop: 'reishi', name: 'Reishi (lingzhi)' }]);
  assert.deepEqual(harvestCropsOf('harvestAm', [{ crop: 'lionsmane', blocks: 1 }, { crop: 'pink', blocks: 2 }]).map((c) => c.crop), ['lionsmane', 'pink']);
  assert.equal(harvestCropsOf('footbath', OYSTER), null);
  assert.deepEqual(harvestCropsOf('harvestAm', []), []);
});

test('a Done with kg in a room with no open run makes no harvest; the amount stays', (t) => {
  const s = setup(t);
  s.db.setProgram(s.id, s.db.getProgram(s.id), { change: 'end', at: NOW });
  const row = s.row('harvestAm');
  assert.equal(s.tasks.done(row.id, { worker: 'Ali', amount: 2 }).amount, 2);
  assert.deepEqual(s.db.taskHarvests(row.id), []);
  assert.deepEqual(s.harvested, []);
});

test('record: a crop of the open run, kg 0 < kg ≤ 10,000, a worker, a time from the run start to now; no crops 409', (t) => {
  const s = setup(t, { start: NOW - DAY });
  s.set(NOW);
  const run = s.db.openRun(s.id);
  const h = s.harvests.record(s.id, { crop: 'oyster', kg: 1.25, worker: 'Ali' });
  assert.deepEqual(
    { crop: h.crop, kg: h.kg, pickedAt: h.pickedAt, taskId: h.taskId, runId: h.runId, worker: h.worker, stage: h.stage, flush: h.flush, blocks: h.blocks },
    { crop: 'oyster', kg: 1.25, pickedAt: NOW, taskId: null, runId: run.id, worker: 'Ali', stage: 'fruiting', flush: 1, blocks: 500 },
  );
  assert.equal(s.harvests.record(s.id, { crop: 'oyster', kg: 2, worker: 'Ali', pickedAt: run.startedAt }).pickedAt, run.startedAt, 'the run start is allowed');
  assert.equal(s.harvests.record(s.id, { crop: 'oyster', kg: 1.23456, worker: 'Ali' }).kg, 1.235, 'kg to 3 places');
  const PICKED = "Pick a time from the run's start to now";
  refused(() => s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: 'Ali', pickedAt: run.startedAt - 1 }), HarvestError, 400, PICKED, 'pickedAt');
  refused(() => s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: 'Ali', pickedAt: NOW + 1 }), HarvestError, 400, PICKED, 'pickedAt');
  refused(() => s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: 'Ali', pickedAt: NOW - 0.5 }), HarvestError, 400, PICKED, 'pickedAt');
  const KG = 'kg must be a number over 0 up to 10,000';
  refused(() => s.harvests.record(s.id, { crop: 'oyster', kg: 0, worker: 'Ali' }), HarvestError, 400, KG, 'kg');
  refused(() => s.harvests.record(s.id, { crop: 'oyster', kg: 10_000.5, worker: 'Ali' }), HarvestError, 400, KG, 'kg');
  refused(() => s.harvests.record(s.id, { crop: 'oyster', kg: '2', worker: 'Ali' }), HarvestError, 400, KG, 'kg');
  refused(() => s.harvests.record(s.id, { crop: 'pink', kg: 1, worker: 'Ali' }), HarvestError, 400, null, 'crop');
  refused(() => s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: ' ' }), HarvestError, 400, 'Pick who did it', 'worker');
  s.db.setWorkers([{ name: 'Siti', active: true }]);
  refused(() => s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: 'Ali' }), HarvestError, 400, 'That name is not on the workers list', 'worker');
  assert.equal(s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: 'siti' }).worker, 'Siti', 'kept as the list spells it');
  refused(() => s.harvests.record(s.id, null), HarvestError, 400, null, undefined);

  const bare = s.room('Bare', []);
  refused(() => s.harvests.record(bare, { crop: 'oyster', kg: 1, worker: 'Siti' }), HarvestError, 409, 'No crops in this room', undefined);
  refused(() => s.harvests.record(9999, { crop: 'oyster', kg: 1, worker: 'Siti' }), HarvestError, 404, 'Room not found', undefined);
});

test('edit and delete keep the task total: the sum left, null when nothing is left', (t) => {
  const s = setup(t, { crops: MIXED, start: NOW - DAY });
  s.set(NOW);
  const row = s.row('harvestAm');
  s.tasks.done(row.id, { worker: 'Ali', amounts: { oyster: 2, lionsmane: 0.5 } });
  const [oyster, mane] = s.db.taskHarvests(row.id);
  const edited = s.harvests.edit(oyster.id, { kg: 3 });
  assert.equal(edited.kg, 3);
  assert.equal(edited.pickedAt, NOW, 'the time kept');
  assert.equal(s.db.getTask(row.id).amount, 3.5);
  assert.equal(s.harvests.edit(oyster.id, { pickedAt: NOW - 3_600_000 }).pickedAt, NOW - 3_600_000);
  assert.equal(s.db.getTask(row.id).amount, 3.5, 'a new time leaves the total');
  refused(() => s.harvests.edit(oyster.id, { kg: -1 }), HarvestError, 400, null, 'kg');
  refused(() => s.harvests.edit(oyster.id, { pickedAt: NOW + 1 }), HarvestError, 400, null, 'pickedAt');
  refused(() => s.harvests.edit(oyster.id, {}), HarvestError, 400, null, undefined);
  refused(() => s.harvests.edit(9999, { kg: 1 }), HarvestError, 404, 'Harvest not found', undefined);
  s.harvests.remove(oyster.id);
  assert.equal(s.db.getTask(row.id).amount, 0.5);
  assert.equal(s.db.getHarvest(oyster.id), null);
  s.harvests.remove(mane.id);
  assert.equal(s.db.getTask(row.id).amount, null);
  refused(() => s.harvests.remove(mane.id), HarvestError, 404, 'Harvest not found', undefined);
});

test('edit: a harvest of an ended run keeps within the run', (t) => {
  const s = setup(t, { start: NOW - 2 * DAY });
  s.set(NOW - DAY);
  const h = s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: 'Ali' });
  s.set(NOW - DAY / 2);
  s.cropApi.put(s.id, { crops: [] });
  s.set(NOW);
  refused(() => s.harvests.edit(h.id, { pickedAt: NOW - DAY / 4 }), HarvestError, 400, "Pick a time from the run's start to its end", 'pickedAt');
  assert.equal(s.harvests.edit(h.id, { pickedAt: NOW - DAY / 2 }).pickedAt, NOW - DAY / 2);
});

test('roomView: the current run with figures and harvests newest first; past runs; cost from the usage days', (t) => {
  const s = setup(t, { start: NOW - 10 * DAY });
  s.db.setSetting('cropYield', JSON.stringify({ oyster: { dryKg: 1, priceKg: 10 } }));
  assert.deepEqual(s.harvests.roomView(s.id).past, []);
  s.set(NOW - 9 * DAY);
  s.harvests.record(s.id, { crop: 'oyster', kg: 50, worker: 'Ali' });
  s.set(NOW - 8 * DAY);
  s.db.setProgram(s.id, { ...s.db.getProgram(s.id), done: true });
  s.cropApi.put(s.id, { crops: [{ crop: 'oyster', blocks: 400 }], newBlocks: true });
  s.set(NOW - 2 * DAY);
  s.harvests.record(s.id, { crop: 'oyster', kg: 10, worker: 'Ali' });
  s.set(NOW);
  s.harvests.record(s.id, { crop: 'oyster', kg: 30, worker: 'Ali', pickedAt: NOW - DAY });

  const v = s.harvests.roomView(s.id);
  assert.equal(v.past.length, 1);
  const [past] = v.past;
  assert.deepEqual([past.kg, past.perBlock, past.be, past.value, past.partial], [50, 0.1, 10, 500, false]);
  assert.equal(past.endedAt, NOW - 8 * DAY);
  assert.deepEqual(past.harvests.map((h) => h.kg), [50]);
  assert.deepEqual(past.cost.days, 3, 'its start day to its end day');
  const cur = v.current;
  assert.equal(cur.endedAt, null);
  assert.deepEqual(cur.crops, [{ crop: 'oyster', blocks: 400 }]);
  assert.deepEqual(cur.harvests.map((h) => h.kg), [30, 10], 'newest pick first');
  assert.deepEqual([cur.kg, cur.perBlock, cur.be, cur.value], [40, 0.1, 10, 400]);
  assert.equal(cur.byCrop.length, 1);
  assert.deepEqual(cur.flushes.map((f) => [f.flush, f.kg]), [[1, 40]]);
  assert.deepEqual(cur.missing, { dryKg: [], price: [] });
  assert.deepEqual(cur.cost, { costPerKg: 0, cost: 0, days: 9, water: false }, 'a room with no machine log costs nothing');

  s.db.setSetting('waterPrice', '2');
  assert.equal(s.harvests.roomView(s.id).current.cost.water, true);
  assert.equal(s.harvests.roomView(9999), null);
});

test('roomView: a run that started over 400 days ago has no cost; a room with no run ever', (t) => {
  const s = setup(t, { start: NOW - 401 * DAY });
  s.set(NOW);
  s.harvests.record(s.id, { crop: 'oyster', kg: 5, worker: 'Ali' });
  const v = s.harvests.roomView(s.id);
  assert.equal(v.current.cost, null);
  assert.equal(v.current.kg, 5);
  assert.deepEqual(s.harvests.roomView(s.room('Bare', [])), { current: null, past: [] });
});

test('farmView: buckets, totals, rooms, crops, today/last7/last30, records; csv', (t) => {
  const s = setup(t, { start: NOW - 40 * DAY });
  const other = s.room('Room 2', [{ crop: 'lionsmane', blocks: 200 }]);
  s.db.setSetting('cropYield', JSON.stringify({ oyster: { dryKg: 1, priceKg: 10 } }));
  s.set(NOW - 35 * DAY);
  s.harvests.record(s.id, { crop: 'oyster', kg: 100, worker: 'Ali' }); // outside 30 days
  s.set(NOW - 10 * DAY);
  s.harvests.record(s.id, { crop: 'oyster', kg: 4, worker: 'Ali' });
  s.set(NOW - 2 * DAY);
  s.harvests.record(other, { crop: 'lionsmane', kg: 4, worker: 'Ali' });
  s.set(NOW);
  s.harvests.record(s.id, { crop: 'oyster', kg: 2, worker: 'Ali', pickedAt: NOW - 60_000 });
  s.harvests.record(s.id, { crop: 'oyster', kg: 2.5, worker: 'Siti' });

  const v = s.harvests.farmView({ days: 30 });
  assert.equal(v.days, 30);
  assert.equal(v.bucket, 'day');
  assert.equal(v.buckets.length, 30);
  assert.deepEqual([v.from, v.to], ['2026-10-06', '2026-11-04']);
  assert.equal(v.buckets.at(-1).kg, 4.5);
  assert.equal(v.totals.kg, 12.5);
  assert.equal(v.buckets.reduce((sum, b) => sum + b.kg, 0), v.totals.kg, 'the bars add up to the kg tile');
  assert.equal(v.totals.value, null, "lion's mane has no price");
  assert.deepEqual(v.totals.cost, { costPerKg: 0, cost: 0, days: 30, water: false });
  assert.deepEqual(v.rooms.map((r) => [r.id, r.name, r.kg, r.value]), [[s.id, 'Room 1', 8.5, 85], [other, 'Room 2', 4, null]]);
  assert.deepEqual(v.rooms[0].crops, OYSTER);
  assert.deepEqual(v.rooms[0].current, { kg: 108.5, perBlock: 0.22, be: 22 }, 'the current run, beyond the range');
  assert.deepEqual(v.rooms[1].current, { kg: 4, perBlock: 0.02, be: null });
  assert.deepEqual(v.crops, [{ crop: 'oyster', kg: 8.5, value: 85 }, { crop: 'lionsmane', kg: 4, value: null }]);
  assert.deepEqual(v.today, { kg: 4.5, value: 45 }, 'only oyster today, which has a price');
  assert.deepEqual(v.last7, { kg: 8.5, value: null });
  assert.deepEqual(v.last30, { kg: 12.5, value: null });
  assert.deepEqual(v.missing, { dryKg: ['lionsmane'], price: ['lionsmane'] });
  const run = s.db.openRun(s.id);
  assert.deepEqual(v.records.map((r) => [r.date, r.roomName, r.crop, r.kg]), [
    ['2026-10-25', 'Room 1', 'oyster', 4], ['2026-11-02', 'Room 2', 'lionsmane', 4], ['2026-11-04', 'Room 1', 'oyster', 4.5],
  ]);
  assert.equal(v.records[0].runStartedAt, run.startedAt);

  assert.equal(s.harvests.farmView({ days: 7 }).totals.kg, 8.5);
  for (const [days, bucket, count] of [[90, 'week', 13], [365, 'month', 12]]) {
    const long = s.harvests.farmView({ days });
    assert.deepEqual([long.bucket, long.buckets.length, long.totals.kg], [bucket, count, 112.5], `${days} days`);
    assert.equal(round(long.buckets.reduce((sum, b) => sum + b.kg, 0), 2), long.totals.kg, `${days} days: the bars add up to the kg tile`);
  }
  assert.equal(s.harvests.farmView().days, 30, 'default 30');
  refused(() => s.harvests.farmView({ days: 45 }), HarvestError, 400, 'days must be 7, 30, 90 or 365', 'days');

  const csv = s.harvests.csv(30);
  assert.equal(csv.name, 'harvests 2026-10-06–2026-11-04.csv');
  const lines = csv.text.split('\r\n');
  assert.equal(lines[0], CSV_HEADER);
  assert.equal(lines.length, 1 + 4 + 1, 'four harvests and the last line break');
  assert.ok(lines.slice(1, -1).every((l) => l.endsWith(',recorded')), 'recorded by hand');
  assert.equal(lines.at(-1), '');
  assert.match(lines[1], /^2026-10-25,/);
  refused(() => s.harvests.csv(45), HarvestError, 400, 'days must be 7, 30, 90 or 365', 'days');
});

test('farmView: the day buckets, records and today follow the farm\'s clock', (t) => {
  const s = setup(t, { start: NOW - DAY });
  s.set(Date.UTC(2026, 10, 3, 16, 30)); // 4 Nov 00:30 on the farm
  s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: 'Ali' });
  s.set(NOW);
  const v = s.harvests.farmView({ days: 7 });
  assert.deepEqual(v.today, { kg: 1, value: null });
  assert.equal(v.records[0].date, '2026-11-04');
});

test('onChange tells the room on record, edit, delete and a Done with kg', (t) => {
  const s = setup(t);
  const h = s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: 'Ali' });
  s.harvests.edit(h.id, { kg: 2 });
  s.harvests.remove(h.id);
  assert.deepEqual(s.changes, [s.id, s.id, s.id]);
  assert.throws(() => s.harvests.record(s.id, { crop: 'oyster', kg: 0, worker: 'Ali' }));
  assert.deepEqual(s.changes, [s.id, s.id, s.id], 'a refused write tells no one');
  s.tasks.done(s.row('harvestPm').id, { worker: 'Ali', amount: 0 });
  assert.deepEqual(s.harvested, [], 'a Done with no kg made no harvest');
  s.tasks.done(s.row('harvestAm').id, { worker: 'Ali', amount: 1 });
  assert.deepEqual(s.harvested, [s.id]);
  const stop = s.harvests.onChange(() => assert.fail('stopped'));
  stop();
  s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: 'Ali' });
});

test('the CSV says which harvests came from a harvest check', (t) => {
  const s = setup(t);
  s.tasks.done(s.row('harvestAm').id, { worker: 'Ali', amount: 2.5 });
  s.later(60_000);
  s.harvests.record(s.id, { crop: 'oyster', kg: 1, worker: 'Siti' });
  const [, check, recorded] = s.harvests.csv(7).text.split('\r\n');
  assert.equal(check, '2026-11-04,09:00,Room 1,Grey oyster,2026-11-04,Fruiting,1,500,2.5,Ali,harvest check');
  assert.equal(recorded, '2026-11-04,09:01,Room 1,Grey oyster,2026-11-04,Fruiting,1,500,1,Siti,recorded');
});

test('cost: the room\'s electricity and water over each run\'s days at today\'s prices; the farm\'s over the range', (t) => {
  // An intake of 1 kW and a humidifier of 50 L/h that draws nothing, so each hour on is 1 kWh or 50 L.
  const s = setup(t, { start: NOW - 10 * DAY, fields: { intakeW: 1000, humidifierW: 0, humidifierLH: 50 } });
  const farm = (month, day, hour) => Date.UTC(2026, month - 1, day, hour - 8); // the farm's clock
  const on = (machine, from, hours) => {
    s.db.logMachine(s.id, machine, { on: true }, 'auto', from);
    s.db.logMachine(s.id, machine, { on: false }, 'auto', from + hours * 3_600_000);
  };
  on('intake', farm(10, 25, 10), 2); // the first run's first day: 2 kWh
  on('intake', farm(11, 1, 10), 3); // the second run: 3 kWh
  on('humidifier', farm(11, 1, 10), 1); // and 50 L
  s.db.setSetting('electricityPrice', '2');
  s.db.setSetting('waterPrice', '100');
  s.set(NOW - 9 * DAY);
  s.harvests.record(s.id, { crop: 'oyster', kg: 50, worker: 'Ali' });
  s.set(NOW - 8 * DAY); // 27 Oct 09:00: new blocks
  s.db.setProgram(s.id, { ...s.db.getProgram(s.id), done: true });
  s.cropApi.put(s.id, { crops: OYSTER, newBlocks: true });
  s.set(NOW);
  s.harvests.record(s.id, { crop: 'oyster', kg: 14, worker: 'Ali', pickedAt: NOW - DAY });
  s.harvests.record(s.id, { crop: 'oyster', kg: 30, worker: 'Ali' });

  const v = s.harvests.roomView(s.id);
  assert.deepEqual(v.past[0].cost, { costPerKg: 0.08, cost: 4, days: 3, water: true }, '25 to 27 Oct: 2 kWh × RM 2, not 1 Nov');
  assert.deepEqual(v.current.cost, { costPerKg: 0.25, cost: 11, days: 9, water: true }, '27 Oct to today: 3 kWh × RM 2 + 0.05 m³ × RM 100, not 25 Oct');
  const f = s.harvests.farmView({ days: 30 });
  assert.deepEqual(f.totals.cost, { costPerKg: 0.16, cost: 15, days: 30, water: true }, 'RM 15 over 94 kg');
  assert.equal(s.harvests.farmView({ days: 7 }).totals.cost.cost, 11, 'the last 7 days: 1 Nov only');

  s.db.setSetting('waterPrice', '');
  assert.deepEqual(s.harvests.roomView(s.id).current.cost, { costPerKg: 0.14, cost: 6, days: 9, water: false }, 'no water price: electricity only');
});
