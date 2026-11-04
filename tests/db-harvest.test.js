// Runs and harvests in the database (spec 2026-11-04-harvest-design.md 2): upgrade 19 to 20, the run's life, the harvest rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return { db, id: db.createRoom(ROOM, 1000).id };
}
const withCrops = (db, id, crops) => ({ ...db.getProgram(id), crops });

test('a version 19 file is upgraded to 20: an open partial run per room with crops, done harvest rows with kg copied', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'v19.db');
  const first = openDb(path);
  const a = first.createRoom(ROOM, 1000).id;
  const b = first.createRoom({ ...ROOM, name: 'Room 2' }, 1000).id;
  first.setProgram(a, withCrops(first, a, [{ crop: 'oyster', blocks: 500 }, { crop: 'lionsmane', blocks: 100 }]));
  first.insertDailyTask({ roomId: a, ruleKey: 'harvestAm', date: '2026-11-01', slot: 'morning', text: 'Harvest check', unit: 'kg', at: 5000 });
  first.insertDailyTask({ roomId: a, ruleKey: 'harvestPm', date: '2026-11-01', slot: 'afternoon', text: 'Harvest check', unit: 'kg', at: 5000 });
  const [am, pm] = first.dailyTasks(a, '2026-11-01');
  first.closeTask(am.id, { status: 'done', at: 7000, worker: 'Ali', amount: 2.5 });
  first.closeTask(pm.id, { status: 'done', at: 8000, worker: 'Ali', amount: null });
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec('DROP TABLE harvests; DROP TABLE runs; PRAGMA user_version = 19;');
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  const run = db.openRun(a);
  assert.equal(run.partial, true);
  assert.equal(run.startedAt, 7000, 'the first copied harvest is earlier than the upgrade');
  assert.deepEqual(run.crops, [{ crop: 'oyster', blocks: 500 }, { crop: 'lionsmane', blocks: 100 }]);
  assert.equal(db.openRun(b), null, 'no crops: no run');
  const rows = db.runHarvests(run.id);
  assert.equal(rows.length, 1, 'a row without kg is not copied');
  assert.deepEqual({ crop: rows[0].crop, kg: rows[0].kg, flush: rows[0].flush, blocks: rows[0].blocks, pickedAt: rows[0].pickedAt, worker: rows[0].worker, taskId: rows[0].taskId },
    { crop: 'oyster', kg: 2.5, flush: null, blocks: 500, pickedAt: 7000, worker: 'Ali', taskId: am.id });
});

test('the upgrade copies to the first crop the rule is for, with the stage as now; a file already on 20 keeps its runs', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'v19.db');
  const first = openDb(path);
  const a = first.createRoom(ROOM, 1000).id;
  first.setProgram(a, { ...withCrops(first, a, [{ crop: 'milky', blocks: 200 }, { crop: 'woodear', blocks: 300 }]), stage: 'rest' });
  first.insertDailyTask({ roomId: a, ruleKey: 'harvestDaily', date: '2026-11-01', slot: 'morning', text: 'Harvest check', unit: 'kg', at: 5000 });
  first.insertDailyTask({ roomId: a, ruleKey: 'footbath', date: '2026-11-01', slot: 'morning', text: 'Footbath', unit: 'kg', at: 5000 });
  const [harvest, footbath] = first.dailyTasks(a, '2026-11-01');
  first.closeTask(harvest.id, { status: 'done', at: 7000, worker: null, amount: 4 });
  first.closeTask(footbath.id, { status: 'done', at: 7000, worker: null, amount: 1 });
  // A harvestAm row (oyster and lion's mane) in a room of reishi then oyster goes to the oyster; in a reishi room, nowhere.
  const b = first.createRoom({ ...ROOM, name: 'Room 2' }, 1000).id;
  const c = first.createRoom({ ...ROOM, name: 'Room 3' }, 1000).id;
  first.setProgram(b, withCrops(first, b, [{ crop: 'reishi', blocks: 100 }, { crop: 'oyster', blocks: 400 }]));
  first.setProgram(c, withCrops(first, c, [{ crop: 'reishi', blocks: 100 }]));
  for (const roomId of [b, c]) {
    first.insertDailyTask({ roomId, ruleKey: 'harvestAm', date: '2026-11-01', slot: 'morning', text: 'Harvest check', unit: 'kg', at: 5000 });
    first.closeTask(first.dailyTasks(roomId, '2026-11-01')[0].id, { status: 'done', at: 7000, worker: null, amount: 2 });
  }
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec('DROP TABLE harvests; DROP TABLE runs; PRAGMA user_version = 19;');
  raw.close();
  const db = openDb(path);
  const run = db.openRun(a);
  assert.deepEqual(db.runHarvests(run.id).map((h) => ({ crop: h.crop, stage: h.stage, blocks: h.blocks, kg: h.kg })),
    [{ crop: 'milky', stage: 'rest', blocks: 200, kg: 4 }], 'not the footbath row');
  assert.deepEqual(db.runHarvests(db.openRun(b).id).map((h) => ({ crop: h.crop, blocks: h.blocks, kg: h.kg })), [{ crop: 'oyster', blocks: 400, kg: 2 }]);
  const reishi = db.openRun(c);
  assert.deepEqual(db.runHarvests(reishi.id), [], 'a reishi room has no crop the harvestAm row is for');
  assert.ok(reishi.startedAt > 7000, 'nothing copied: the run starts at the upgrade');
  assert.equal(db.getTask(db.dailyTasks(c, '2026-11-01')[0].id).amount, 2, 'it stays a task row');
  db.close();
  const again = new DatabaseSync(path);
  again.exec('PRAGMA user_version = 19;');
  again.close();
  const reopened = openDb(path);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.cropRuns(a).map((r) => r.id), [run.id], 'not copied twice');
  assert.equal(reopened.runHarvests(run.id).length, 1);
});

test('setProgram with a run: start, update, end, restart; one open run per room', (t) => {
  const { db, id } = fresh(t);
  db.setProgram(id, withCrops(db, id, [{ crop: 'oyster', blocks: 500 }]), { change: 'start', at: 10_000 });
  const first = db.openRun(id);
  assert.deepEqual({ startedAt: first.startedAt, endedAt: first.endedAt, partial: first.partial }, { startedAt: 10_000, endedAt: null, partial: false });
  db.setProgram(id, withCrops(db, id, [{ crop: 'oyster', blocks: 480 }]), { change: 'update', at: 11_000 });
  assert.deepEqual(db.openRun(id).crops, [{ crop: 'oyster', blocks: 480 }]);
  assert.throws(() => db.setProgram(id, withCrops(db, id, [{ crop: 'pink', blocks: 300 }]), { change: 'start', at: 11_500 }));
  assert.deepEqual(db.getProgram(id).crops, [{ crop: 'oyster', blocks: 480 }], 'a start while a run is open writes nothing');
  assert.equal(db.openRun(id).id, first.id);
  db.setProgram(id, withCrops(db, id, [{ crop: 'pink', blocks: 300 }]), { change: 'restart', at: 12_000 });
  const second = db.openRun(id);
  assert.notEqual(second.id, first.id);
  assert.equal(db.getRunById(first.id).endedAt, 12_000);
  db.setProgram(id, withCrops(db, id, []), { change: 'end', at: 13_000 });
  assert.equal(db.openRun(id), null);
  assert.deepEqual(db.cropRuns(id).map((r) => r.id), [second.id, first.id], 'newest first');
  assert.deepEqual(db.runsBetween(11_500, 12_500).map((r) => r.id).sort(), [first.id, second.id].sort());
  assert.deepEqual(db.runsBetween(12_500, 20_000).map((r) => r.id), [second.id]);
  assert.throws(() => db.setProgram(id, withCrops(db, id, [{ crop: 'oyster', blocks: 1 }]), { change: 'update', at: 14_000 }), /no open run/i);
  assert.deepEqual(db.getProgram(id).crops, [], 'the program is not written when its run change fails');
  db.setProgram(id, withCrops(db, id, [{ crop: 'oyster', blocks: 1 }]), { change: 'restart', at: 15_000 });
  assert.equal(db.openRun(id).startedAt, 15_000, 'restart with no open run just starts one');
});

test('harvest rows: insert, list by run and by time, edit, delete; closeTask writes harvests in its transaction; delete room', (t) => {
  const { db, id } = fresh(t);
  db.setProgram(id, withCrops(db, id, [{ crop: 'oyster', blocks: 500 }]), { change: 'start', at: 10_000 });
  const run = db.openRun(id);
  const h = db.insertHarvest({ roomId: id, runId: run.id, crop: 'oyster', stage: 'fruiting', flush: 1, blocks: 500, kg: 3.2, pickedAt: 20_000, worker: 'Ali', taskId: null, at: 20_000 });
  assert.equal(h.kg, 3.2);
  assert.deepEqual(db.harvestsBetween(0, 30_000).map((r) => r.id), [h.id]);
  assert.equal(db.updateHarvest(h.id, { kg: 3.0, pickedAt: 21_000 }).kg, 3.0);
  db.insertDailyTask({ roomId: id, ruleKey: 'harvestAm', date: '2026-11-01', slot: 'morning', text: 'Harvest check', unit: 'kg', at: 5000 });
  const task = db.dailyTasks(id, '2026-11-01')[0];
  db.closeTask(task.id, { status: 'done', at: 22_000, worker: 'Ali', amount: 1.5 }, null,
    [{ roomId: id, runId: run.id, crop: 'oyster', stage: 'fruiting', flush: 1, blocks: 500, kg: 1.5, pickedAt: 22_000, worker: 'Ali', taskId: task.id, at: 22_000 }]);
  assert.deepEqual(db.taskHarvests(task.id).map((r) => r.kg), [1.5]);
  // A row already closed records nothing (a second Done); a bad harvest on an open row throws.
  assert.equal(db.closeTask(task.id, { status: 'done', at: 23_000 }, null, [{ roomId: id, runId: run.id, crop: 'oyster', stage: 'fruiting', flush: 1, blocks: 500, kg: 9, pickedAt: 23_000, worker: 'A', taskId: task.id, at: 23_000 }]), false);
  assert.deepEqual(db.taskHarvests(task.id).map((r) => r.kg), [1.5]);
  db.insertDailyTask({ roomId: id, ruleKey: 'harvestPm', date: '2026-11-01', slot: 'afternoon', text: 'Harvest check', unit: 'kg', at: 5000 });
  const pm = db.dailyTasks(id, '2026-11-01')[1];
  assert.throws(() => db.closeTask(pm.id, { status: 'done', at: 23_000 }, null, [{ roomId: id, runId: run.id, crop: 'oyster', stage: 'fruiting', flush: 1, blocks: 500, kg: -1, pickedAt: 1, worker: 'A', taskId: pm.id, at: 1 }]));
  assert.equal(db.deleteHarvest(h.id), true);
  assert.equal(db.getHarvest(h.id), null);
  db.deleteRoom(id);
  assert.equal(db.harvestsBetween(0, 1e15).length, 0);
  assert.equal(db.cropRuns(id).length, 0);
});

test('a bad harvest rolls back the close; edit and delete set the task amount to the total of its harvests', (t) => {
  const { db, id } = fresh(t);
  db.setProgram(id, withCrops(db, id, [{ crop: 'oyster', blocks: 500 }]), { change: 'start', at: 10_000 });
  const run = db.openRun(id);
  db.insertDailyTask({ roomId: id, ruleKey: 'harvestAm', date: '2026-11-01', slot: 'morning', text: 'Harvest check', unit: 'kg', at: 5000 });
  const task = db.dailyTasks(id, '2026-11-01')[0];
  const row = (kg) => ({ roomId: id, runId: run.id, crop: 'oyster', stage: 'fruiting', flush: 1, blocks: 500, kg, pickedAt: 22_000, worker: 'Ali', taskId: task.id, at: 22_000 });
  assert.throws(() => db.closeTask(task.id, { status: 'done', at: 22_000, worker: 'Ali', amount: 20_001 }, null, [row(20_001)]));
  assert.equal(db.getTask(task.id).status, 'open', 'the close rolled back');
  assert.equal(db.closeTask(task.id, { status: 'done', at: 22_000, worker: 'Ali', amount: 3 }, null, [row(1), row(2)]), true);
  const [one, two] = db.taskHarvests(task.id);
  // The db works the total out from the task's harvests, rounded as the kg are (1.1 + 2.2 is 3.3000000000000003 in floats).
  assert.equal(db.updateHarvest(one.id, { kg: 1.1, pickedAt: 22_000 }).kg, 1.1);
  db.updateHarvest(two.id, { kg: 2.2, pickedAt: 22_000 });
  assert.equal(db.getTask(task.id).amount, 3.3);
  assert.equal(db.deleteHarvest(two.id), true);
  assert.equal(db.getTask(task.id).amount, 1.1);
  assert.equal(db.deleteHarvest(one.id), true);
  assert.equal(db.getTask(task.id).amount, null, 'none left');
  assert.equal(db.updateHarvest(one.id, { kg: 1, pickedAt: 1 }), null, 'gone');
  assert.equal(db.deleteHarvest(one.id), false);
});
