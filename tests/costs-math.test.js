// The costs' figures (spec 2026-11-05-costs-design.md 2.1 and 4), pure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lastDayOf, addMonths, monthName, chargeDate, chargesOf, runOn, blockDays, split, firstDayOf, figuresOf, runTotals, summaryOf,
  runFirstMonth, billTopUp, csvRows, CSV_HEADER,
} from '../server/costs-math.js';

export const cost = (over = {}) => ({
  id: 1, date: '2026-11-01', category: 'rent', amount: 100, roomId: null, runId: null, note: '', repeat: null,
  repeatUntil: null, worker: null, utility: null, periodFrom: null, periodTo: null, ...over,
});
export const run = (over = {}) => ({ id: 1, roomId: 1, startDate: '2026-10-01', endDate: null, blocks: 100, ...over });

test('months: the last day, a month on, the name', () => {
  assert.equal(lastDayOf('2026-02'), '2026-02-28');
  assert.equal(lastDayOf('2024-02'), '2024-02-29');
  assert.equal(lastDayOf('2026-11'), '2026-11-30');
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(monthName('2026-11'), 'Nov 2026');
});

test('a monthly item charges on its day, the month\'s last when shorter', () => {
  assert.equal(chargeDate('2026-01-31', '2026-02'), '2026-02-28');
  assert.equal(chargeDate('2026-10-31', '2026-11'), '2026-11-30');
  assert.equal(chargeDate('2026-10-05', '2026-12'), '2026-12-05');
});

test('the charges of a cost in a range: none in the future, none after its last month', () => {
  const today = '2026-11-15';
  const rent = cost({ date: '2026-08-31', repeat: 'monthly' });
  assert.deepEqual(chargesOf(rent, '2026-08-01', '2026-12-31', today).map((c) => c.date), ['2026-08-31', '2026-09-30', '2026-10-31'],
    'not 30 Nov: after today');
  assert.deepEqual(chargesOf({ ...rent, repeatUntil: '2026-09' }, '2026-01-01', '2026-12-31', today).map((c) => c.date), ['2026-08-31', '2026-09-30']);
  assert.deepEqual(chargesOf(rent, '2026-10-01', '2026-10-31', today).map((c) => c.date), ['2026-10-31']);
  assert.deepEqual(chargesOf(rent, '2026-07-01', '2026-07-31', today), [], 'before it starts');
  const one = cost({ date: '2026-11-03' });
  assert.deepEqual(chargesOf(one, '2026-11-01', '2026-11-30', today).map((c) => c.date), ['2026-11-03']);
  assert.deepEqual(chargesOf(one, '2026-10-01', '2026-10-31', today), []);
  assert.equal(chargesOf(one, '2026-11-01', '2026-11-30', today)[0].cost, one);
});

test('the run of a room on a day: the later one on the day one ends and the next starts', () => {
  const today = '2026-11-15';
  const runs = [run({ id: 1, endDate: '2026-11-03' }), run({ id: 2, startDate: '2026-11-03' }), run({ id: 3, roomId: 2 })];
  assert.equal(runOn(runs, 1, '2026-11-02', today).id, 1);
  assert.equal(runOn(runs, 1, '2026-11-03', today).id, 2);
  assert.equal(runOn(runs, 1, '2026-09-30', today), null);
  assert.equal(runOn(runs, 2, '2026-11-15', today).id, 3);
  assert.equal(runOn(runs, 2, '2026-11-16', today), null, 'an open run reaches today, not past it');
});

test('block-days: blocks × the days open in the range, both ends counted', () => {
  const today = '2026-11-15';
  assert.equal(blockDays(run({ startDate: '2026-10-25' }), '2026-11-01', '2026-11-30', today), 1500, '15 days to today');
  assert.equal(blockDays(run({ startDate: '2026-10-25' }), '2026-10-01', '2026-10-31', today), 700);
  assert.equal(blockDays(run({ startDate: '2026-10-25', endDate: '2026-11-03' }), '2026-11-01', '2026-11-30', today), 300);
  assert.equal(blockDays(run({ startDate: '2026-12-01' }), '2026-11-01', '2026-11-30', today), 0);
});

test('split: shares to 2 places, the last taking the remainder', () => {
  assert.deepEqual(split(100, [1, 2]), [33.33, 66.67]);
  assert.deepEqual(split(10, [1, 1, 1]), [3.33, 3.33, 3.34]);
  assert.deepEqual(split(300, [1500, 2000]), [128.57, 171.43]);
});
// A farm's data on 15 Nov 2026: electricity RM 0.50 a kWh, no water price; Container 1 and 2.
const data = (over = {}) => ({
  today: '2026-11-15', keptFrom: '2025-10-12', prices: { electricity: 0.5, water: null },
  rooms: new Map([[1, 'Container 1'], [2, 'Container 2']]), runs: [], costs: [], usage: new Map(), batches: [], purchases: [],
  sales: [], harvests: [], cropYield: {}, ...over,
});
// A room's usage days from `from` to `to`, `kWh` each.
const days = (from, to, kWh, extra = {}) => {
  const out = new Map();
  for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) out.set(d, { kWh, waterL: 0, ...extra });
  return out;
};
const NOV = ['2026-11-01', '2026-11-15'];
const line = (f, key) => f.lines.filter((l) => l.key === key);

test('shared costs go to the runs by block-days; a room\'s cost to its run', () => {
  const f = figuresOf(...NOV, data({
    runs: [run({ id: 1, roomId: 1, blocks: 100 }), run({ id: 2, roomId: 2, startDate: '2026-11-06', blocks: 200 })],
    costs: [cost({ id: 1, amount: 300 }), cost({ id: 2, category: 'repairs', amount: 40, roomId: 2, runId: 2, date: '2026-11-07' })],
    sales: [{ id: 1, date: '2026-11-10', kg: 20, total: 500, roomId: 1, runId: 1 }],
  }));
  assert.equal(f.costs, 340);
  assert.equal(f.income, 500);
  assert.equal(f.profit, 160);
  assert.equal(f.kgSold, 20);
  assert.equal(f.profitPerKg, 8);
  assert.equal(f.runs.get(1).shared, 128.57, '1,500 of 3,500 block-days');
  assert.equal(f.runs.get(2).shared, 171.43);
  assert.equal(f.runs.get(2).own, 40);
  assert.equal(f.runs.get(1).income, 500);
  assert.deepEqual(f.byCategory.map((c) => [c.key, c.amount, c.share]), [['rent', 300, 88], ['repairs', 40, 12]]);
});

test('measured electricity goes to the room\'s run; a room with no run keeps it on the month', () => {
  const f = figuresOf(...NOV, data({
    runs: [run({ id: 1, roomId: 1 })],
    usage: new Map([[1, days(...NOV, 10)], [2, days(...NOV, 2)]]),
  }));
  assert.deepEqual(line(f, 'electricity').map((l) => [l.roomId, l.runId, l.amount, l.shared]), [[1, 1, 75, false], [2, null, 15, false]]);
  assert.equal(f.runs.get(1).energy, 75);
  assert.equal(f.costs, 90);
  assert.ok(f.notes.some((n) => n.kind === 'no-water-price'));
});

test('a bill tops up what was not measured, never counts twice', () => {
  const usage = new Map([[1, days(...NOV, 10)]]);
  const runs = [run({ id: 1 })];
  const bill = (amount) => cost({ id: 5, category: 'utilities', utility: 'electricity', amount, date: '2026-11-15', periodFrom: NOV[0], periodTo: NOV[1] });
  const over = figuresOf(...NOV, data({ runs, usage, costs: [bill(100)] }));
  assert.deepEqual(line(over, 'unmeasured-electricity').map((l) => [l.amount, l.shared]), [[25, true]], 'the bill RM 100 − measured RM 75');
  assert.equal(over.costs, 100, 'measured 75 + top-up 25');
  const under = figuresOf(...NOV, data({ runs, usage, costs: [bill(60)] }));
  assert.equal(line(under, 'unmeasured-electricity').length, 0);
  assert.equal(under.costs, 75);
  assert.equal(under.notes.find((n) => n.kind === 'bill-below').text, 'Measured RM 75.00 is above the electricity bill of RM 60.00: the estimate runs high');
  const water = figuresOf(...NOV, data({ runs, usage, costs: [cost({ id: 6, category: 'utilities', utility: 'water', amount: 30, date: '2026-11-10', periodFrom: NOV[0], periodTo: NOV[1] })] }));
  assert.equal(line(water, 'unmeasured-water')[0].amount, 30, 'no water price: the whole water bill');
});

test('a day not worked out yet: costs and profit unknown, never partial', () => {
  const f = figuresOf(...NOV, data({ runs: [run()], usage: new Map([[1, days(...NOV, 10, { pending: true })]]), costs: [cost()] }));
  assert.equal(f.pending, true);
  assert.equal(f.costs, null);
  assert.equal(f.profit, null);
  assert.equal(f.costPerKg, null);
});

test('Batches\' block cost on its run; a batch without a price named, left out', () => {
  const f = figuresOf(...NOV, data({
    runs: [run({ id: 1 })],
    batches: [
      { batchId: 1, runId: 1, roomId: 1, date: '2026-11-02', cost: 1175 },
      { batchId: 2, runId: 1, roomId: 1, date: '2026-11-03', cost: null },
    ],
  }));
  assert.equal(f.runs.get(1).blocks, 1175);
  assert.deepEqual(line(f, 'blocks-batches').map((l) => [l.source, l.amount]), [['batches', 1175]]);
  const note = f.notes.find((n) => n.kind === 'unpriced-batch');
  assert.equal(note.text, 'Container 1’s blocks of 3 Nov have no price');
  assert.equal(note.runId, 1);
});

test('Inventory\'s purchases are shared; one without a unit cost named', () => {
  const f = figuresOf(...NOV, data({
    runs: [run({ id: 1 })],
    purchases: [
      { id: 1, name: 'PP bags 1 kg', kind: 'packaging', date: '2026-11-04', total: 45 },
      { id: 2, name: 'Alcohol 75 %', kind: 'chemical', date: '2026-11-05', total: null },
    ],
  }));
  assert.deepEqual(line(f, 'inventory-packaging').map((l) => [l.category, l.label, l.source, l.shared]), [['packaging', 'Packaging', 'inventory', true]]);
  assert.equal(f.runs.get(1).shared, 45);
  assert.equal(f.notes.find((n) => n.kind === 'no-unit-cost').text, 'Alcohol 75 % bought 5 Nov has no unit cost');
});

test('no blocks in: shared costs stay with the farm', () => {
  const f = figuresOf(...NOV, data({ costs: [cost({ amount: 300 })] }));
  assert.equal(f.costs, 300);
  assert.equal(f.runs.size, 0);
  assert.equal(f.notes.find((n) => n.kind === 'not-shared').text, 'RM 300.00 of shared costs not shared: no blocks in this month');
});

test('picked and not yet sold: a note, never income', () => {
  const f = figuresOf(...NOV, data({
    runs: [run({ id: 1 })],
    harvests: [{ roomId: 1, runId: 1, date: '2026-11-05', kg: 10, crop: 'oyster' }],
    sales: [{ id: 1, date: '2026-11-06', kg: 4, total: 56, roomId: 1, runId: null }],
    cropYield: { oyster: { dryKg: 0.9, priceKg: 14 } },
  }));
  assert.equal(f.income, 56);
  assert.equal(f.kgHarvested, 10);
  assert.deepEqual(f.unsold, { kg: 6, value: 84 });
  assert.equal(f.notes[0].text, '6.0 kg picked and not yet sold (about RM 84.00 at your expected prices)');
  assert.equal(f.runs.get(1).income, 56, 'a sale with a room and no run: the run open that day');
  assert.equal(f.runs.get(1).kgHarvested, 10);
});

test('a run\'s whole figures sum the months it spans, sales after it ends included', () => {
  const d = data({
    runs: [run({ id: 1, startDate: '2026-10-25', endDate: '2026-11-05' })],
    costs: [cost({ id: 1, date: '2026-10-31', amount: 100, repeat: 'monthly' }), cost({ id: 2, category: 'labour', worker: 'Ali', amount: 50, roomId: 1, runId: 1, date: '2026-10-26' })],
    sales: [{ id: 1, date: '2026-11-10', kg: 10, total: 400, roomId: 1, runId: 1 }],
    harvests: [{ roomId: 1, runId: 1, date: '2026-11-01', kg: 12, crop: 'oyster' }],
  });
  const figs = (m) => figuresOf(firstDayOf(m), m === '2026-11' ? '2026-11-15' : lastDayOf(m), d);
  const r = runTotals(d.runs[0], figs, d.today);
  assert.deepEqual(r.parts, { blocks: 0, energy: 0, water: 0, own: 50, shared: 100 }, 'Oct rent 100, all its; Nov rent on 30 Nov: after today');
  assert.equal(r.costs, 150);
  assert.equal(r.income, 400);
  assert.equal(r.profit, 250);
  assert.equal(r.kgSold, 10);
  assert.equal(r.profitPerKg, 25);
  assert.equal(r.costPerKg, 12.5);
  assert.deepEqual(r.byCategory, [{ category: 'labour', amount: 50 }, { category: 'shared', amount: 100 }]);
});

test('the contract\'s summary shape', () => {
  const f = figuresOf(...NOV, data({
    runs: [run({ id: 1 })], usage: new Map([[1, days(...NOV, 10)]]),
    costs: [cost({ amount: 300 })], purchases: [{ id: 1, name: 'PP bags', kind: 'packaging', date: '2026-11-04', total: 45 }],
    sales: [{ id: 1, date: '2026-11-06', kg: 10, total: 500, roomId: 1, runId: 1 }],
  }));
  assert.deepEqual(summaryOf(f), {
    total: 420, byCategory: [{ category: 'rent', amount: 300 }, { category: 'packaging', amount: 45 }], energy: 75, water: null,
    income: 500, profit: 80, profitPerKg: 8,
  });
});

// Review fixes (pending per run, incomplete, split, bill rounding, notes, the spec's section 7 gaps).
const figsOf = (d) => (m) => figuresOf(firstDayOf(m), lastDayOf(m) < d.today ? lastDayOf(m) : d.today, d);
const bill = (over = {}) => cost({
  id: 5, category: 'utilities', utility: 'electricity', amount: 100, date: '2026-11-15', periodFrom: NOV[0], periodTo: NOV[1], ...over,
});

test('a pending day pends only the run open that day in that room, not a closed run', () => {
  const d = data({
    runs: [run({ id: 1, roomId: 1, startDate: '2026-03-01', endDate: '2026-03-31' }), run({ id: 2, roomId: 2, startDate: '2026-10-01' })],
    costs: [cost({ id: 1, category: 'repairs', amount: 40, roomId: 1, runId: 1, date: '2026-03-10' })],
    usage: new Map([[2, days('2026-10-05', '2026-10-05', 1, { pending: true })]]),
  });
  const figs = figsOf(d);
  assert.equal(figs('2026-10').pending, true, 'the month still pending');
  assert.equal(figs('2026-10').runs.get(2).pending, true);
  const march = runTotals(d.runs[0], figs, d.today);
  assert.equal(march.pending, false);
  assert.equal(march.costs, 40);
  assert.equal(runTotals(d.runs[1], figs, d.today).costs, null, 'the run open on the pending day');
});

test('a pending top-up: the month pending, its costs null; the runs with block-days in it pending', () => {
  const d = data({
    runs: [run({ id: 1, roomId: 1, startDate: '2026-10-01' }), run({ id: 3, roomId: 1, startDate: '2026-09-01', endDate: '2026-09-30' })],
    usage: new Map([[2, days('2026-10-20', '2026-10-20', 1, { pending: true })]]),
    costs: [bill({ periodFrom: '2026-10-15', periodTo: '2026-11-14' })],
  });
  const nov = figsOf(d)('2026-11');
  assert.equal(nov.pending, true);
  assert.equal(nov.sharedPending, true);
  assert.equal(nov.costs, null);
  assert.equal(runTotals(d.runs[0], figsOf(d), d.today).pending, true, 'open in Nov: its share of the top-up unknown');
  assert.equal(runTotals(d.runs[1], figsOf(d), d.today).pending, false, 'ended in Sep');
});

test('incomplete: an unpriced batch or a purchase with no unit cost left out', () => {
  const runs = [run({ id: 1 }), run({ id: 2, roomId: 2 })];
  const batches = [{ batchId: 1, runId: 1, roomId: 1, date: '2026-11-03', cost: null }];
  assert.equal(figuresOf(...NOV, data({ runs, batches })).incomplete, true);
  assert.equal(figuresOf(...NOV, data({ runs, purchases: [{ id: 1, name: 'Alcohol', kind: 'chemical', date: '2026-11-05', total: null }] })).incomplete, true);
  assert.equal(figuresOf(...NOV, data({ runs })).incomplete, false);
  const d = data({ runs, batches });
  assert.equal(runTotals(runs[0], figsOf(d), d.today).incomplete, true);
  assert.equal(runTotals(runs[1], figsOf(d), d.today).incomplete, false);
});

test('not yet sold: no value when a picked crop has no price', () => {
  const f = figuresOf(...NOV, data({
    runs: [run({ id: 1 })],
    harvests: [{ roomId: 1, runId: 1, date: '2026-11-05', kg: 10, crop: 'oyster' }, { roomId: 1, runId: 1, date: '2026-11-05', kg: 5, crop: 'lion' }],
    sales: [{ id: 1, date: '2026-11-06', kg: 4, total: 56, roomId: 1, runId: 1 }],
    cropYield: { oyster: { dryKg: 0.9, priceKg: 14 } },
  }));
  assert.deepEqual(f.unsold, { kg: 11, value: null });
  assert.equal(f.notes[0].text, '11.0 kg picked and not yet sold');
});

test('split: never a negative share, the shares sum to the amount', () => {
  const shares = split(0.02, [1, 1, 1, 1]);
  assert.ok(shares.every((s) => s >= 0), String(shares));
  assert.equal(Math.round(shares.reduce((s, x) => s + x, 0) * 100), 2);
});

test('a bill equal to the measured cost: no line, no note', () => {
  const f = figuresOf(...NOV, data({ runs: [run({ id: 1 })], usage: new Map([[1, days(...NOV, 10)]]), costs: [bill({ amount: 75 })] }));
  assert.equal(line(f, 'unmeasured-electricity').length, 0);
  assert.ok(!f.notes.some((n) => n.kind === 'bill-below'));
  assert.equal(f.costs, 75);
});

test('the bill\'s measured part rounds as the measured lines: the month never over its bill', () => {
  const day = ['2026-11-03', '2026-11-03'];
  const f = figuresOf(...NOV, data({
    usage: new Map([[1, days(...day, 0.01)], [2, days(...day, 0.01)]]),
    costs: [bill({ amount: 10, periodFrom: day[0], periodTo: day[1] })],
  }));
  assert.deepEqual(line(f, 'electricity').map((l) => l.amount), [0.01, 0.01]);
  assert.equal(f.costs, 10);
});

test('notes: two runs\' unpriced batches with the same text both kept; no known room reads "Blocks received"', () => {
  const f = figuresOf(...NOV, data({
    runs: [run({ id: 1 }), run({ id: 2, roomId: 2 })],
    batches: [{ batchId: 1, runId: 1, roomId: null, date: '2026-11-03', cost: null }, { batchId: 2, runId: 2, roomId: null, date: '2026-11-03', cost: null }],
  }));
  const unpriced = f.notes.filter((n) => n.kind === 'unpriced-batch');
  assert.deepEqual(unpriced.map((n) => [n.text, n.runId]), [['Blocks received 3 Nov have no price', 1], ['Blocks received 3 Nov have no price', 2]]);
});

test('a sale or harvest of an unknown run: on the month only', () => {
  const f = figuresOf(...NOV, data({
    runs: [run({ id: 1 })],
    sales: [{ id: 1, date: '2026-11-06', kg: 4, total: 56, roomId: 1, runId: 99 }],
    harvests: [{ roomId: 1, runId: 98, date: '2026-11-05', kg: 10, crop: 'oyster' }],
  }));
  assert.equal(f.income, 56);
  assert.equal(f.kgHarvested, 10);
  assert.ok(!f.runs.has(99) && !f.runs.has(98));
});

test('the summary: energy and water null while pending; water null with no water price', () => {
  const pending = figuresOf(...NOV, data({ runs: [run()], usage: new Map([[1, days(...NOV, 10, { pending: true })]]) }));
  assert.deepEqual([summaryOf(pending).energy, summaryOf(pending).water], [null, null]);
  const priced = figuresOf(...NOV, data({ prices: { electricity: 0.5, water: 5 }, usage: new Map([[1, days(...NOV, 10)]]) }));
  assert.deepEqual([summaryOf(priced).energy, summaryOf(priced).water], [75, 0]);
  const unpriced = figuresOf(...NOV, data({ usage: new Map([[1, days(...NOV, 10)]]) }));
  assert.equal(summaryOf(unpriced).water, null);
});

test('a bill with no period (an old row): its date\'s month', () => {
  const f = figuresOf(...NOV, data({ usage: new Map([[1, days(...NOV, 10)]]), costs: [bill({ periodFrom: null, periodTo: null })] }));
  assert.equal(line(f, 'unmeasured-electricity')[0].amount, 25, 'RM 100 − measured RM 75 to 15 Nov');
});

test('a bill whose period starts before the energy kept: all of it shared, noted', () => {
  const f = figuresOf(...NOV, data({ keptFrom: '2026-11-05', runs: [run({ id: 1 })], usage: new Map([[1, days(...NOV, 10)]]), costs: [bill()] }));
  assert.deepEqual(line(f, 'unmeasured-electricity').map((l) => [l.amount, l.shared]), [[100, true]]);
  assert.equal(f.notes.find((n) => n.kind === 'bill-not-kept').text,
    'The electricity bill of 15 Nov covers days before the energy kept: all of it counts');
  assert.equal(f.notes.find((n) => n.kind === 'energy-not-kept').text, 'Energy before 5 Nov 2026 is not kept: not counted');
  assert.equal(line(f, 'electricity')[0].amount, 55, '11 days kept × 10 kWh × RM 0.50');
});

test('measured water with a water price', () => {
  const f = figuresOf(...NOV, data({
    prices: { electricity: 0.5, water: 5 }, runs: [run({ id: 1 })], usage: new Map([[1, days(...NOV, 0, { waterL: 100 })]]),
  }));
  assert.deepEqual(line(f, 'water').map((l) => [l.roomId, l.runId, l.amount]), [[1, 1, 7.5]], '1.5 m³ × RM 5');
  assert.equal(f.runs.get(1).water, 7.5);
  assert.ok(!f.notes.some((n) => n.kind === 'no-water-price'));
});

test('a monthly room item\'s charge lands on the run open on its charge date', () => {
  const d = data({
    runs: [run({ id: 1, startDate: '2026-09-01', endDate: '2026-10-05' }), run({ id: 2, startDate: '2026-10-06' })],
    costs: [cost({ id: 1, category: 'labour', worker: 'Ali', amount: 50, roomId: 1, date: '2026-09-10', repeat: 'monthly' })],
  });
  assert.deepEqual(line(figsOf(d)('2026-09'), 'labour').map((l) => l.runId), [1]);
  assert.deepEqual(line(figsOf(d)('2026-10'), 'labour').map((l) => l.runId), [2]);
});

test('a batch with no run (waiting, or its container deleted): on the month it was received, not shared (owner 2026-11-05)', () => {
  const f = figuresOf(...NOV, data({ runs: [run({ id: 1 })], batches: [{ batchId: 1, runId: null, roomId: null, date: '2026-11-02', cost: 50 }] }));
  assert.deepEqual(line(f, 'blocks-batches').map((l) => [l.shared, l.runId, l.amount]), [[false, null, 50]]);
  assert.equal(f.costs, 50, 'on the farm month');
  assert.equal(f.runs.get(1)?.shared ?? 0, 0, 'shared over no run');
  assert.ok(!f.notes.some((n) => n.kind === 'not-shared'));
});

test('blocks received before their run starts count in the run (its first months reach 62 days back)', () => {
  const d = data({
    runs: [run({ id: 7, startDate: '2026-11-02', blocks: 1000 })],
    batches: [{ batchId: 1, runId: 7, roomId: 1, date: '2026-10-28', cost: 2500 }, { batchId: 2, runId: 7, roomId: 1, date: '2026-09-20', cost: null }],
    costs: [cost({ id: 1, date: '2026-10-05', amount: 300 })],
  });
  const r = runTotals(d.runs[0], figsOf(d), d.today);
  assert.equal(r.parts.blocks, 2500, 'received 28 Oct, the run from 2 Nov');
  assert.equal(r.parts.shared, 0, 'October\'s rent: no block-days of the run then');
  assert.equal(r.costs, 2500);
  assert.equal(r.incomplete, true, 'its unpriced batch of 20 Sep named');
  assert.equal(runFirstMonth(d.runs[0]), '2026-09');
  assert.equal(figsOf(d)('2026-10').costs, 2800, 'October\'s farm month has them too');
});

test('a sale with neither run nor room, or after its room\'s run ended: on the month only', () => {
  const f = figuresOf(...NOV, data({
    runs: [run({ id: 1, endDate: '2026-11-05' })],
    sales: [
      { id: 1, date: '2026-11-06', kg: 4, total: 56, roomId: null, runId: null },
      { id: 2, date: '2026-11-10', kg: 2, total: 30, roomId: 1, runId: null },
    ],
  }));
  assert.equal(f.income, 86);
  assert.equal(f.runs.get(1)?.income ?? 0, 0);
});

test('a bill lands in the month its period ends (owner 2026-11-05), this month while that end is still to come', () => {
  const usage = new Map([[1, days('2026-10-01', '2026-11-15', 10)]]);
  const runs = [run({ id: 1, startDate: '2026-09-01' })];
  const oct = bill({ date: '2026-11-03', periodFrom: '2026-10-01', periodTo: '2026-10-31', amount: 200 });
  const d = data({ runs, usage, costs: [oct] });
  assert.deepEqual(line(figsOf(d)('2026-10'), 'unmeasured-electricity').map((l) => [l.amount, l.date]), [[45, '2026-10-31']],
    'RM 200 − 31 days × 10 kWh × RM 0.50, on 31 Oct');
  assert.equal(line(figsOf(d)('2026-11'), 'unmeasured-electricity').length, 0, 'not in November, the month of its date');
  assert.deepEqual(billTopUp(oct, d), { amount: 45, month: '2026-10' });
  const ahead = bill({ date: '2026-11-10', periodFrom: '2026-11-01', periodTo: '2026-11-30', amount: 100 });
  const d2 = data({ runs, usage, costs: [ahead] });
  assert.deepEqual(line(figsOf(d2)('2026-11'), 'unmeasured-electricity').map((l) => [l.amount, l.date]), [[25, '2026-11-15']], 'today');
  assert.deepEqual(billTopUp(ahead, d2), { amount: 25, month: '2026-11' });
  const old = bill({ date: '2026-11-03', periodFrom: null, periodTo: null, amount: 100 });
  assert.equal(billTopUp(old, data({ runs, usage, costs: [old] })).month, '2026-11', 'no period: its date\'s month');
});

test('a bill\'s top-up for its entry: its own pending only, 0 when measured covers it', () => {
  const runs = [run({ id: 1, startDate: '2026-09-01' })];
  const usage = new Map([[1, days('2026-10-01', '2026-11-15', 10)], [2, days('2026-11-10', '2026-11-10', 1, { pending: true })]]);
  const oct = bill({ date: '2026-11-03', periodFrom: '2026-10-01', periodTo: '2026-10-31', amount: 200 });
  const nov = bill({ id: 6, date: '2026-11-15', periodFrom: '2026-11-01', periodTo: '2026-11-15', amount: 50 });
  const d = data({ runs, usage, costs: [oct, nov] });
  assert.deepEqual(billTopUp(oct, d), { amount: 45, month: '2026-10' }, 'October\'s days all worked out');
  assert.deepEqual(billTopUp(nov, d), { amount: null, month: '2026-11' }, 'a day of its own period pending');
  const low = bill({ date: '2026-11-03', periodFrom: '2026-10-01', periodTo: '2026-10-31', amount: 100 });
  assert.deepEqual(billTopUp(low, data({ runs, usage, costs: [low] })), { amount: 0, month: '2026-10' });
});

test('two bills of one utility over the same days share those days\' measured cost by their amounts: taken off once', () => {
  const usage = new Map([[1, days('2026-10-01', '2026-11-15', 10)]]); // RM 5 a day measured
  const a = bill({ id: 5, date: '2026-11-03', periodFrom: '2026-10-01', periodTo: '2026-10-31', amount: 300 });
  const b = bill({ id: 6, date: '2026-11-04', periodFrom: '2026-10-22', periodTo: '2026-10-31', amount: 100 });
  const d = data({ runs: [run({ id: 1, startDate: '2026-09-01' })], usage, costs: [a, b] });
  // 21 days a alone: RM 105; 10 days both: RM 50, 3/4 to a (37.50), 1/4 to b (12.50)
  assert.deepEqual(billTopUp(a, d), { amount: 157.5, month: '2026-10' }, '300 − 105 − 37.50');
  assert.deepEqual(billTopUp(b, d), { amount: 87.5, month: '2026-10' }, '100 − 12.50');
  const f = figsOf(d)('2026-10');
  assert.equal(f.costs, 400, 'measured 155 + top-ups 245: the two bills, the overlap\'s measured part taken off once');
  const water = bill({ id: 7, utility: 'water', date: '2026-11-04', periodFrom: '2026-10-22', periodTo: '2026-10-31', amount: 100 });
  assert.deepEqual(billTopUp(a, data({ runs: d.runs, usage, costs: [a, water] })).amount, 145, 'another utility: no share');
});

// ---- the Business audit, 2026-11-05: Export CSV ----
test("the month's CSV: every cost line and sale, the formula guard, measured lines last", () => {
  const d = data({
    runs: [run({ id: 1, roomId: 1 })],
    usage: new Map([[1, days(...NOV, 10)], [2, days(...NOV, 0)]]), // Container 2 used nothing: no line of 0
    costs: [
      cost({ id: 1, amount: 300, note: '=SUM(A1)' }),
      cost({ id: 2, category: 'labour', worker: 'Ali', amount: 1700, date: '2026-11-03', roomId: 1, runId: 1 }),
      cost({ id: 5, category: 'utilities', utility: 'electricity', amount: 100, date: '2026-11-15', periodFrom: NOV[0], periodTo: NOV[1] }),
    ],
    batches: [{ batchId: 1, runId: 1, roomId: 1, date: '2026-11-02', blocks: 500, cost: 1175 }],
    purchases: [{ id: 1, name: 'PP bags, 1 kg', kind: 'packaging', date: '2026-11-04', total: 45 }],
    sales: [{ id: 1, date: '2026-11-10', crop: 'oyster', kg: 20, total: 500, roomId: 1, runId: 1 }],
  });
  const f = figuresOf(...NOV, d);
  assert.deepEqual(csvRows(f, d), [
    CSV_HEADER,
    "2026-11-01,cost,Rent,'=SUM(A1),The farm,,entered,300.00",
    '2026-11-02,cost,Blocks,500 blocks,Container 1,2026-10-01,Batches,1175.00',
    '2026-11-03,cost,Labour,Ali,Container 1,2026-10-01,entered,1700.00',
    '2026-11-04,cost,Packaging,"PP bags, 1 kg",The farm,,Inventory,45.00',
    '2026-11-10,income,Sales,Grey oyster 20 kg,Container 1,2026-10-01,Sales,500.00',
    '2026-11-15,cost,Utilities,"Unmeasured electricity, bill of 15 Nov",The farm,,bill − measured,25.00',
    ',cost,Utilities,Electricity measured 1–15 Nov,Container 1,2026-10-01,measured,75.00',
  ]);
  assert.equal(CSV_HEADER, 'date,type,category,what,room,run started,source,amount');
  const pending = data({ runs: [run()], usage: new Map([[1, days(...NOV, 10, { pending: true })]]), costs: [cost()] });
  assert.deepEqual(csvRows(figuresOf(...NOV, pending), pending).at(-1), ',cost,Utilities,Electricity and water still being worked out: export again in a minute,,,measured,');
});
