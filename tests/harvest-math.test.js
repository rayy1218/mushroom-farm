import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFigures, buckets, recordRows, csvRows, round } from '../server/harvest-math.js';

const H = (crop, kg, flush, pickedAt, extra = {}) => ({ id: pickedAt, crop, kg, flush, pickedAt, blocks: 500, stage: 'fruiting', worker: 'Ali', taskId: null, ...extra });
const RUN = { id: 1, startedAt: 0, endedAt: null, partial: false, crops: [{ crop: 'oyster', blocks: 500 }] };
const YIELD = { oyster: { dryKg: 0.9, priceKg: 12 } };

test('one crop: kg, kg per block, BE, value, cost per kg, flushes', () => {
  const f = runFigures(RUN, [H('oyster', 100, 1, 10), H('oyster', 60, 2, 20), H('oyster', 40, 2, 30)], YIELD, { cost: 500, days: 40, water: true });
  assert.equal(f.kg, 200);
  assert.equal(f.perBlock, 0.4);
  assert.equal(f.be, 44, '200 / (500 × 0.9) = 44.4 %');
  assert.equal(f.value, 2400);
  assert.deepEqual(f.cost, { costPerKg: 2.5, cost: 500, days: 40, water: true });
  assert.deepEqual(f.flushes.map((x) => [x.flush, x.kg, x.from, x.to]), [[1, 100, 10, 10], [2, 100, 20, 30]]);
  assert.deepEqual(f.missing, { dryKg: [], price: [] });
});

test('missing figures: BE and value null, the crops named; no kg: no cost per kg', () => {
  const f = runFigures(RUN, [H('oyster', 10, 1, 1)], {}, { cost: 100, days: 3, water: false });
  assert.equal(f.be, null);
  assert.equal(f.value, null);
  assert.deepEqual(f.missing, { dryKg: ['oyster'], price: ['oyster'] });
  assert.equal(runFigures(RUN, [], YIELD, { cost: 100, days: 3, water: false }).cost.costPerKg, null);
  assert.equal(runFigures(RUN, [H('oyster', 10, 1, 1)], YIELD, null).cost, null, 'no usage known');
});

test('a mixed room: per crop and totals; a copied harvest without a flush comes first as "before records"', () => {
  const run = { ...RUN, crops: [{ crop: 'oyster', blocks: 500 }, { crop: 'lionsmane', blocks: 100 }] };
  const y = { ...YIELD, lionsmane: { dryKg: 1, priceKg: 40 } };
  const f = runFigures(run, [H('oyster', 50, null, 1), H('oyster', 100, 1, 10), H('lionsmane', 30, 1, 11, { blocks: 100 })], y, null);
  assert.equal(f.kg, 180);
  assert.equal(f.perBlock, 0.3);
  assert.equal(f.be, 33, '180 / (500 × 0.9 + 100 × 1) = 32.7 %');
  assert.deepEqual(f.byCrop.map((c) => [c.crop, c.kg, c.perBlock, c.value]), [['oyster', 150, 0.3, 1800], ['lionsmane', 30, 0.3, 1200]]);
  assert.deepEqual(f.flushes.map((x) => x.flush), [null, 1]);
  assert.deepEqual(f.flushes[1].byCrop, { oyster: 100, lionsmane: 30 });
});

test('buckets: days for 7 and 30, Monday weeks for 90, months for 365 (farm time)', () => {
  const day = (d) => Date.UTC(2026, 10, d) - 8 * 3_600_000; // midnight in Kuala Lumpur
  const b = buckets([H('oyster', 2, 1, day(3) + 1000), H('oyster', 3, 1, day(4) + 1000)], { days: 7, to: day(5) + 1000 });
  assert.equal(b.bucket, 'day');
  assert.equal(b.buckets.length, 7);
  assert.deepEqual(b.buckets.slice(-3).map((x) => x.kg), [2, 3, 0]);
  assert.equal(buckets([], { days: 90, to: day(5) }).bucket, 'week');
  assert.equal(buckets([], { days: 365, to: day(5) }).bucket, 'month');
});

test('records: one per day, room and crop; csv rows oldest first with the formula guard', () => {
  const rooms = new Map([[7, { name: '=Room' }]]);
  const runs = new Map([[1, { startedAt: 0 }]]);
  const hs = [H('oyster', 2, 1, 1000, { roomId: 7, runId: 1 }), H('oyster', 1.5, 1, 2000, { roomId: 7, runId: 1 })];
  assert.deepEqual(recordRows(hs, rooms, runs).map((r) => [r.roomName, r.crop, r.kg]), [['=Room', 'oyster', 3.5]]);
  const csv = csvRows(hs, rooms, runs);
  assert.equal(csv[0], 'date,time,room,crop,run started,stage,flush,blocks,kg,worker,from');
  assert.match(csv[1], /^1970-01-01,08:00,'=Room,Grey oyster,1970-01-01,Fruiting,1,500,2,Ali,recorded$/);
});

test('a flush is room-wide: its figures divide by all the run crops blocks', () => {
  const run = { ...RUN, crops: [{ crop: 'oyster', blocks: 500 }, { crop: 'lionsmane', blocks: 500 }] };
  const hs = [H('oyster', 100, 1, 10), H('oyster', 100, 2, 20), H('lionsmane', 100, 2, 21, { blocks: 500 })];
  const f = runFigures(run, hs, { oyster: { dryKg: 1, priceKg: 10 }, lionsmane: { dryKg: 1 } }, null);
  assert.deepEqual(f.flushes.map((x) => [x.perBlock, x.be]), [[0.1, 10], [0.2, 20]]);
  assert.equal(f.perBlock, 0.3);
  assert.equal(f.value, null, 'lionsmane has kg and no price');
  assert.deepEqual(f.missing, { dryKg: [], price: ['lionsmane'] });
  assert.deepEqual(f.byCrop.map((c) => [c.crop, c.value]), [['oyster', 2000], ['lionsmane', null]]);
  const g = runFigures(run, hs, { oyster: { dryKg: 1 } }, null);
  assert.deepEqual(g.flushes.map((x) => x.be), [null, null]);
});

test('a harvest of a crop no longer in the run still counts, with its stamped blocks', () => {
  const run = { ...RUN, crops: [{ crop: 'oyster', blocks: 100 }] };
  const f = runFigures(run, [H('oyster', 10, 1, 1, { blocks: 100 }), H('pink', 10, 1, 2, { blocks: 50 }), H('pink', 5, 1, 3, { blocks: 80 })], { oyster: { dryKg: 1, priceKg: 10 } }, null);
  assert.equal(f.kg, 25);
  assert.equal(f.value, null);
  assert.deepEqual(f.missing, { dryKg: ['pink'], price: ['pink'] });
  assert.deepEqual(f.byCrop.map((c) => [c.crop, c.blocks, c.kg]), [['oyster', 100, 10], ['pink', 80, 15]]);
  assert.equal(f.perBlock, round(25 / 180, 2));
});

test('buckets: weeks start on Monday, months cross the year, the range ends today', () => {
  const day = (m, d, y = 2026) => Date.UTC(y, m - 1, d) - 8 * 3_600_000 + 1000;
  const w = buckets([H('oyster', 4, 1, day(11, 2)), H('oyster', 1, 1, day(11, 8)), H('oyster', 9, 1, day(1, 1))], { days: 90, to: day(11, 4) });
  assert.equal(w.buckets.length, 13);
  assert.ok(w.buckets.every((b) => new Date(`${b.from}T00:00:00Z`).getUTCDay() === 1));
  assert.equal(w.buckets[12].from, '2026-11-02');
  assert.equal(w.buckets[12].to, '2026-11-04');
  assert.equal(w.buckets[12].kg, 4, 'the pick after today is outside');
  assert.equal(w.from, w.buckets[0].from);
  assert.equal(w.to, '2026-11-04');
  const m = buckets([H('oyster', 6, 1, day(12, 31)), H('oyster', 7, 1, day(1, 1, 2026))], { days: 365, to: day(2, 10, 2027) });
  assert.equal(m.buckets.length, 12);
  assert.deepEqual(m.buckets.map((b) => b.from).slice(-3), ['2026-12-01', '2027-01-01', '2027-02-01']);
  assert.deepEqual(m.buckets.slice(-3).map((b) => b.kg), [6, 0, 0]);
  assert.equal(m.buckets[11].to, '2027-02-10');
  assert.equal(m.buckets[10].to, '2027-01-31');
  assert.equal(m.from, '2026-03-01');
});

test('records split by run; csv: empty flush, harvest check, one crop unpriced', () => {
  const rooms = new Map([[7, { name: 'A' }]]);
  const runs = new Map([[1, { startedAt: 0 }], [2, { startedAt: 86_400_000 }]]);
  const hs = [H('oyster', 2, 1, 1000, { roomId: 7, runId: 1 }), H('oyster', 1, 1, 2000, { roomId: 7, runId: 2 })];
  assert.deepEqual(recordRows(hs, rooms, runs).map((r) => [r.kg, r.runStartedAt]), [[2, 0], [1, 86_400_000]]);
  const csv = csvRows([H('oyster', 2, null, 1000, { roomId: 7, runId: 1, taskId: 5 })], rooms, runs);
  assert.match(csv[1], /^1970-01-01,08:00,A,Grey oyster,1970-01-01,Fruiting,,500,2,Ali,harvest check$/);
});
