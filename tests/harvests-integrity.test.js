// Harvests and Data integrity (spec 2026-11-12-data-integrity-design.md 3 to 5): Record, Edit and a check's Done logged
// with who; a likely duplicate and the room's quick picks over 0.3 kg a block asked once (G6); void and restore, out of
// every figure, listed struck; a Done's Undo logged. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createTasks } from '../server/tasks.js';
import { createCropApi } from '../server/crop-api.js';
import { createHarvests, HarvestError } from '../server/harvests.js';
import { fixedZone } from '../server/usage.js';
import { AskError } from '../server/asks.js';

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 10, 0, 0); // 10 Nov 2026 08:00 on the farm
const AMINAH = { name: 'Aminah', role: 'worker' };
const LIM = { name: 'Lim', role: 'owner' };
const plain = (s) => s.replace(/ /g, ' ');

function setup(t) {
  const db = openDb(':memory:');
  let clock = NOW;
  const now = () => clock;
  db.setWorkers([{ name: 'Aminah', active: true }]);
  const tasks = createTasks({ db, now, log: (e) => { throw e; } });
  const harvests = createHarvests({ db, now, zone: fixedZone(480) });
  t.after(async () => { await harvests.warmed(); db.close(); });
  const id = db.createRoom({ name: 'Container 4', length: 6, width: 2.4, height: 2.4, trhAddress: 1 }, clock).id;
  createCropApi({ db, now }).put(id, { crops: [{ crop: 'oyster', blocks: 500 }] });
  db.setProgram(id, { ...db.getProgram(id), stage: 'fruiting', stageSince: clock });
  return { db, tasks, harvests, id, at: (hh, mm) => { clock = NOW + ((hh - 8) * 60 + mm) * MIN; }, row: (key) => tasks.roomView(id).today.find((r) => r.ruleKey === key) };
}
const asks = (fn) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof AskError) return e.asks.map((a) => ({ ...a, text: plain(a.text) }));
    throw e;
  }
  return [];
};

test('G6: crate by crate is no duplicate; 165.25 kg in 4 minutes from 500 blocks asks the pick; the same kg again asks the duplicate', (t) => {
  const { db, harvests, id, at } = setup(t);
  at(7, 50);
  const first = harvests.record(id, { crop: 'oyster', kg: 38.4, worker: 'Aminah' }, AMINAH);
  at(7, 52);
  harvests.record(id, { crop: 'oyster', kg: 41.75, worker: 'Aminah' }, AMINAH);
  assert.deepEqual(asks(() => harvests.record(id, { crop: 'oyster', kg: 38.4, worker: 'Aminah' }, AMINAH)), [{
    kind: 'duplicate', field: 'kg', text: '38.40 kg of Grey oyster was recorded in Container 4 at 07:50 by Aminah. Is this another pick?',
  }]);
  at(7, 54);
  assert.deepEqual(asks(() => harvests.record(id, { crop: 'oyster', kg: 85.1, worker: 'Aminah' }, AMINAH)), [{
    kind: 'pick', field: 'kg', text: 'With the picks of the last 10 minutes that makes 165.25 kg from 500 blocks, 0.33 kg a block. Is 85.10 kg right?',
  }]);
  harvests.record(id, { crop: 'oyster', kg: 85.1, worker: 'Aminah', confirmed: ['pick'] }, AMINAH);
  assert.deepEqual(db.changesOf('harvest', first.id).map((c) => [c.action, c.by, c.role, c.after.kg, c.after.roomName]),
    [['add', 'Aminah', 'worker', 38.4, 'Container 4']]);
  at(9, 0);
  assert.deepEqual(asks(() => harvests.record(id, { crop: 'oyster', kg: 200, worker: 'Aminah' }, AMINAH)), [{
    kind: 'pick', field: 'kg', text: "That's 0.40 kg a block in one pick. Is 200.00 kg right?",
  }], 'one pick: the words of before');
});

test('an edit asks about a new kg (no duplicate), not about a new time; it is logged before and after', (t) => {
  const { db, harvests, id, at } = setup(t);
  at(8, 0);
  const h = harvests.record(id, { crop: 'oyster', kg: 38.4, worker: 'Aminah' }, AMINAH);
  assert.deepEqual(asks(() => harvests.edit(h.id, { kg: 384 }, LIM)).map((a) => a.kind), ['pick']);
  at(8, 30);
  harvests.edit(h.id, { pickedAt: NOW + 10 * MIN }, LIM);
  harvests.edit(h.id, { kg: 3.84 }, LIM);
  const log = db.changesOf('harvest', h.id);
  assert.deepEqual(log.map((c) => [c.action, c.by]), [['add', 'Aminah'], ['edit', 'Lim'], ['edit', 'Lim']]);
  assert.deepEqual([log[2].before.kg, log[2].after.kg], [38.4, 3.84]);
});

test('void: a reason; out of the run\'s figures, listed struck; edit refused until restored; DELETE refused; logged', (t) => {
  const { db, harvests, id, at } = setup(t);
  at(8, 0);
  const h = harvests.record(id, { crop: 'oyster', kg: 7.6, worker: 'Aminah' }, AMINAH);
  assert.throws(() => harvests.remove(h.id), (e) => e instanceof HarvestError && e.status === 409);
  assert.throws(() => harvests.voidHarvest(h.id, {}, LIM), (e) => e instanceof HarvestError && e.field === 'reason');
  harvests.voidHarvest(h.id, { reason: 'Weighed with the crate' }, LIM);
  const view = harvests.roomView(id);
  assert.equal(view.current.kg, 0);
  assert.deepEqual(view.current.harvests.map((x) => [x.id, x.voided.reason, x.voided.by]), [[h.id, 'Weighed with the crate', 'Lim']]);
  assert.equal(harvests.farmView({ days: 7 }).totals.kg, 0);
  assert.throws(() => harvests.edit(h.id, { kg: 7 }, LIM), (e) => e.status === 409);
  harvests.restoreHarvest(h.id, {}, LIM);
  assert.equal(harvests.roomView(id).current.kg, 7.6);
  assert.deepEqual(db.changesOf('harvest', h.id).map((c) => c.action), ['add', 'void', 'restore']);
});

test("a check's Done asks as a pick does, its harvests logged with who; its Undo logs each harvest it takes back", (t) => {
  const { db, tasks, harvests, id, at, row } = setup(t);
  at(8, 0);
  harvests.record(id, { crop: 'oyster', kg: 12.5, worker: 'Aminah' }, AMINAH);
  const am = row('harvestAm');
  assert.deepEqual(asks(() => tasks.done(am.id, { worker: 'Aminah', amount: 12.5 }, AMINAH)).map((a) => [a.kind, a.field]), [['duplicate', 'amount']]);
  tasks.done(am.id, { worker: 'Aminah', amount: 12.5, confirmed: ['duplicate'] }, AMINAH);
  const made = db.taskHarvests(am.id);
  assert.equal(made.length, 1);
  assert.deepEqual(db.changesOf('harvest', made[0].id).map((c) => [c.action, c.by]), [['add', 'Aminah']]);
  tasks.undo(am.id, AMINAH);
  assert.deepEqual(db.changesOf('harvest', made[0].id).map((c) => [c.action, c.by]), [['add', 'Aminah'], ['undo', 'Aminah']]);
  assert.equal(db.getHarvest(made[0].id), null, 'gone; the log keeps it');
});

// ---- the Harvest tab and page (Data integrity 10 and 11) ----
test("a run's Not sold records under its harvests, voided ones too, newest first; the Harvest page lists a voided harvest struck", async (t) => {
  const { db, harvests, id, at } = setup(t);
  const { createNotSold } = await import('../server/not-sold.js');
  let clock = NOW;
  const notSold = createNotSold({ db, now: () => clock });
  at(8, 0);
  const kept = harvests.record(id, { crop: 'oyster', kg: 30, worker: 'Aminah' }, AMINAH);
  const gone = harvests.record(id, { crop: 'oyster', kg: 6.25, worker: 'Aminah', confirmed: ['duplicate', 'pick'] }, AMINAH);
  harvests.voidHarvest(gone.id, { reason: 'Weighed with the crate' }, LIM);
  clock = NOW + 60 * MIN;
  const spoiled = notSold.record({ at: clock, crop: 'oyster', kg: 4.5, reason: 'spoiled', roomId: id, worker: 'Aminah' }, AMINAH);
  clock = NOW + 61 * MIN;
  const sample = notSold.record({ at: clock, crop: 'oyster', kg: 1.2, reason: 'sample', roomId: id, worker: 'Aminah' }, AMINAH);
  notSold.voidNotSold(sample.id, { reason: 'They paid for it' }, LIM);
  const run = harvests.roomView(id).current;
  assert.deepEqual(run.notSold.map((r) => [r.id, r.kg, r.reason, r.worker, r.voided?.reason ?? null, r.edits]),
    [[sample.id, 1.2, 'sample', 'Aminah', 'They paid for it', 0], [spoiled.id, 4.5, 'spoiled', 'Aminah', null, 0]]);
  assert.equal(run.kg, 30, 'figures: the voided harvest left out');
  const page = harvests.farmView({ days: 7 });
  assert.equal(page.totals.kg, 30);
  assert.deepEqual(page.records.map((r) => [r.kg, r.voided?.reason ?? null]), [[30, null], [6.25, 'Weighed with the crate']],
    'the voided pick its own row, after the day\'s kept ones');
  assert.equal(kept.kg, 30);
});
