// Your runs on the Economics page (server/economics-runs.js, spec 2026-11-06-economics-design.md 4.4 and 4.5): the real
// Harvest, Batches and Sales on one farm; which runs count, the yield and the loss in it, the price tied and farm-wide, the
// block price with an unpriced batch, the electricity per block from the usage days, the room's blocks, a part that throws.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createSales } from '../server/sales.js';
import { fixedZone } from '../server/usage.js';
import { yourRuns, PART_FAILED } from '../server/economics-runs.js';

mkdirSync('/tmp/economics', { recursive: true });
const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // a farm day and hour
const zone = fixedZone(480);
const NOW = at('2026-12-01');
const TODAY = '2026-12-01';
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

// A farm on a database file (a partial run is made by hand): Container 1 with two finished runs of lion's mane (the first
// mixed with grey oyster), an ended run of grey oyster only, an open run, and Container 2 with its own lion's mane run.
function farm(t) {
  const dir = mkdtempSync('/tmp/economics/runs-');
  const file = join(dir, 'farm.db');
  let db = openDb(file);
  let clock = at('2026-08-01');
  const now = () => clock;
  const services = () => {
    const batches = createBatches({ db, now });
    return { batches, harvests: createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor }), sales: createSales({ db, now }) };
  };
  let s = services();
  t.after(async () => {
    s.harvests.stop();
    await s.harvests.warmed();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const one = db.createRoom(ROOM, clock).id;
  const two = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, clock).id;
  const run = (room, crops, from, to) => {
    clock = at(from, 9);
    db.setProgram(room, { ...db.getProgram(room), crops }, { change: 'start', at: clock });
    const r = db.openRun(room);
    if (to) {
      clock = at(to, 9);
      db.setProgram(room, { ...db.getProgram(room), crops: [] }, { change: 'end', at: clock });
    }
    return r.id;
  };
  const pick = (room, runId, crop, kg, day) => db.insertHarvest({
    roomId: room, runId, crop, stage: 'fruiting', flush: 1, blocks: 1, kg, pickedAt: at(day), worker: null, taskId: null, at: at(day),
  });
  // a partial run (recorded from the harvest upgrade): ended, with picks, never counted
  const partial = run(one, [{ crop: 'lionsmane', blocks: 500 }], '2026-07-01', '2026-07-30');
  pick(one, partial, 'lionsmane', 400, '2026-07-20');
  // run 1, mixed; its lion's mane blocks bought at RM 6 and placed while it is open
  clock = at('2026-08-11');
  const b1 = s.batches.receive({ crop: 'lionsmane', supplier: 'Agro', receivedAt: at('2026-08-11'), blocks: 1000, pricePerBlock: 6 });
  const r1 = run(one, [{ crop: 'lionsmane', blocks: 1000 }, { crop: 'oyster', blocks: 500 }], '2026-08-12');
  s.batches.place(b1.id, { roomId: one });
  pick(one, r1, 'lionsmane', 200, '2026-09-01');
  pick(one, r1, 'oyster', 50, '2026-09-02');
  clock = at('2026-09-23', 9);
  db.setProgram(one, { ...db.getProgram(one), crops: [] }, { change: 'end', at: clock });
  // run 2: 600 blocks at RM 5 and 400 without a price
  clock = at('2026-09-23', 10);
  const b2 = s.batches.receive({ crop: 'lionsmane', supplier: 'Agro', receivedAt: clock, blocks: 600, pricePerBlock: 5 });
  const b3 = s.batches.receive({ crop: 'lionsmane', supplier: 'Agro', receivedAt: clock, blocks: 400 });
  const r2 = run(one, [{ crop: 'lionsmane', blocks: 1000 }], '2026-09-24');
  s.batches.place(b2.id, { roomId: one });
  s.batches.place(b3.id, { roomId: one });
  pick(one, r2, 'lionsmane', 250, '2026-10-10');
  clock = at('2026-11-03', 9);
  db.setProgram(one, { ...db.getProgram(one), crops: [] }, { change: 'end', at: clock });
  // an ended run of grey oyster only, then the open run (picks, not counted)
  const r3 = run(one, [{ crop: 'oyster', blocks: 300 }], '2026-11-04', '2026-11-05');
  pick(one, r3, 'oyster', 5, '2026-11-04');
  const open = run(one, [{ crop: 'lionsmane', blocks: 800 }], '2026-11-05');
  pick(one, open, 'lionsmane', 30, '2026-11-08');
  // Container 2's own run
  const other = run(two, [{ crop: 'lionsmane', blocks: 100 }], '2026-08-01', '2026-09-01');
  pick(two, other, 'lionsmane', 90, '2026-08-20');
  clock = NOW;
  // the partial flag, set by hand as the harvest upgrade would have
  db.close();
  const raw = new DatabaseSync(file);
  raw.prepare('UPDATE runs SET partial = 1 WHERE id = ?').run(partial);
  raw.close();
  s.harvests.stop();
  db = openDb(file);
  s = services();
  const buyer = s.sales.addBuyer({ name: 'Kedai' }).id;
  const sell = (soldAt, lines) => s.sales.record({ soldAt, buyerId: buyer, lines });
  return { db, ...s, one, two, r1, r2, sell, room: () => db.getRoom(one) };
}

// Usage days with kWh a day (or pending on the given dates), back count days from today.
const daysOf = (kWh, pending = [], today = TODAY) => (room, count) => Array.from({ length: count }, (_, i) => {
  const date = new Date(at(today) - (count - 1 - i) * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10);
  return pending.includes(date) ? { date, pending: true } : { date, kWh };
});
const read = (f, crop = 'lionsmane', more = {}) => yourRuns({
  db: f.db, harvests: f.harvests, batches: f.batches, days: daysOf(10), room: f.room(), crop, today: TODAY, zone, ...more,
});

test('the counted runs: ended, not partial, with kg of the crop; the yield over every block put in, the loss read as 0', (t) => {
  const f = farm(t);
  const { figures, errors } = read(f);
  assert.deepEqual(errors, {});
  assert.deepEqual(figures['yours.yieldG'], {
    value: 225, runs: { count: 2, from: at('2026-08-12', 9), to: at('2026-11-03', 9), kg: 450, blocks: 2000 },
  });
  assert.deepEqual(figures['yours.loss'], { value: 0, runs: { count: 2, from: at('2026-08-12', 9), to: at('2026-11-03', 9) } });
  assert.equal(read(f, 'oyster').figures['yours.yieldG'].value, 68.8, 'grey oyster: 55 kg from 800 blocks, run 1 and the oyster-only run');
  assert.equal(read(f, 'pink').figures['yours.yieldG'], undefined, 'no run of pink');
});

test('the room\'s blocks: its Crop tab now, else its latest run\'s', (t) => {
  const f = farm(t);
  assert.deepEqual(read(f).figures['yours.blocks'], { value: 800, runs: { from: 'crop' } });
  f.db.setProgram(f.one, { ...f.db.getProgram(f.one), crops: [] }, { change: 'end', at: NOW });
  assert.deepEqual(read(f).figures['yours.blocks'], { value: 800, runs: { from: 'run', at: at('2026-11-05', 9) } });
});

test('the price: the crop\'s lines tied to a counted run (its run, or its room on a day of it); else farm-wide over the runs\' weeks', (t) => {
  const f = farm(t);
  f.sell(at('2026-09-05'), [{ crop: 'lionsmane', kg: 100, priceKg: 50, roomId: f.one }]); // run 1 (Sales ties it)
  f.sell(at('2026-11-03', 15), [{ crop: 'lionsmane', kg: 50, priceKg: 40, roomId: f.one }]); // run 2's last day, after its end
  f.sell(at('2026-11-08'), [{ crop: 'lionsmane', kg: 10, priceKg: 99, roomId: f.one }]); // the open run: not counted
  f.sell(at('2026-10-01'), [{ crop: 'lionsmane', kg: 10, priceKg: 99 }]); // no room: not tied
  assert.deepEqual(read(f).figures.price, {
    value: 46.67, runs: { count: 2, from: at('2026-08-12', 9), to: at('2026-11-03', 9), kg: 150, total: 7000, farmWide: false },
  });
  // grey oyster: no line tied, so its sales farm-wide from run 1's start to 14 days after the oyster-only run's end
  f.sell(at('2026-11-10'), [{ crop: 'oyster', kg: 20, priceKg: 10 }]);
  f.sell(at('2026-11-30'), [{ crop: 'oyster', kg: 20, priceKg: 90 }]); // after the 14 days
  const oyster = read(f, 'oyster').figures.price;
  assert.equal(oyster.value, 10);
  assert.equal(oyster.runs.farmWide, true);
  assert.equal(oyster.runs.until, at('2026-11-05', 9) + 14 * 86_400_000);
});

test('the block price: the priced batches of the crop on a counted run; one without a price left out and counted', (t) => {
  const f = farm(t);
  assert.deepEqual(read(f).figures.blockPrice, { value: 5.63, runs: { count: 2, blocks: 1600, batches: 2, batchesLeftOut: 1 } });
  assert.equal(read(f, 'oyster').figures.blockPrice, undefined, 'no grey oyster batch');
});

test('the electricity per block: each day to the run open on it, ÷ every block of the counted runs; pending while a day is worked out', (t) => {
  const f = farm(t);
  // run 1: 12 Aug – 23 Sep (43 days, 1,500 blocks), run 2: 24 Sep – 3 Nov (41 days, 1,000 blocks), 10 kWh a day
  assert.deepEqual(read(f).figures['yours.kwhBlock'], { value: 0.336, runs: { count: 2, kWh: 840, days: 84, blocks: 2500 } });
  assert.deepEqual(read(f, 'lionsmane', { days: daysOf(10, ['2026-10-01']) }).figures['yours.kwhBlock'], { value: null, pending: true, runs: { count: 2 } });
  assert.equal(read(f, 'lionsmane', { days: daysOf(0) }).figures['yours.kwhBlock'], undefined, 'no kWh recorded: left to the next source');
  // 20 Sep 2027: run 1 started 405 days before, past the 400 kept; run 2 alone
  const kept = read(f, 'lionsmane', { today: '2027-09-20', days: daysOf(10, [], '2027-09-20') });
  assert.deepEqual(kept.figures['yours.kwhBlock'], { value: 0.41, runs: { count: 1, kWh: 410, days: 41, blocks: 1000 } });
  assert.equal(read(f, 'lionsmane', { today: '2027-11-15', days: daysOf(10, [], '2027-11-15') }).figures['yours.kwhBlock'], undefined, 'both past the kept days');
});

test('a part that throws is logged and named; its figures are left to the next source, the rest still read', (t) => {
  const f = farm(t);
  const logged = [];
  const broken = { list() { throw new Error('boom'); } };
  const out = read(f, 'lionsmane', { batches: broken, log: (what, err) => logged.push(`${what} ${err.message}`) });
  assert.deepEqual(out.errors, { batches: PART_FAILED });
  assert.deepEqual(logged, ["Economics: couldn't read batches: boom"]);
  assert.equal(out.figures.blockPrice, undefined);
  assert.equal(out.figures['yours.yieldG'].value, 225);
  const noHarvest = read(f, 'lionsmane', { harvests: { roomView() { throw new Error('x'); } }, log: () => {} });
  assert.deepEqual(noHarvest.errors, { harvest: PART_FAILED });
  assert.deepEqual(Object.keys(noHarvest.figures), ['yours.blocks']);
});

test('the room\'s runs that cannot be read: named under harvest, the price and electricity left out, the rest still read', (t) => {
  const f = farm(t);
  const db = Object.create(f.db, { cropRuns: { value() { throw new Error('nope'); } } });
  const out = read(f, 'lionsmane', { db, log: () => {} });
  assert.deepEqual(out.errors, { harvest: PART_FAILED });
  assert.equal(out.figures['yours.yieldG'].value, 225);
  assert.equal(out.figures.blockPrice.value, 5.63);
  assert.equal(out.figures.price, undefined);
  assert.equal(out.figures['yours.kwhBlock'], undefined);
});
