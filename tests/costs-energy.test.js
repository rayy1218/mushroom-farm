// Costs' electricity (spec 2026-11-12-data-integrity-design.md 7.2 and 8.2), pure: measured and estimated lines apart, the
// month's kWh, the notes when estimates pass 20 % (G13) and when a room was unseen (G12), and a bill that lowers the counted
// (G15). Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figuresOf, billTopUp, summaryOf, unseenWords } from '../server/costs-math.js';

const H = 3_600_000;
const data = (over = {}) => ({
  today: '2026-11-10', keptFrom: '2025-11-01', prices: { electricity: 1, water: null }, tariff: null,
  rooms: new Map([[1, 'Container 1'], [2, 'Container 2'], [5, 'Container 5']]), runs: [], costs: [], usage: new Map(), batches: [],
  purchases: [], sales: [], harvests: [], cropYield: {}, ...over,
});
const run = (over) => ({ id: 1, roomId: 1, startDate: '2026-10-01', endDate: null, blocks: 500, ...over });
const days = (from, to, day) => {
  const out = new Map();
  for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) out.set(d, { date: d, waterL: 0, ...day });
  return out;
};
const plain = (s) => s.replace(/ /g, ' ');

test('G13: measured for Container 2, estimated for Container 5; 94 % of November so far estimated: the note', () => {
  const f = figuresOf('2026-11-01', '2026-11-10', data({
    usage: new Map([[2, days('2026-11-01', '2026-11-10', { kWh: 1.48, kWhMeasured: 1.48, kWhEstimated: 0, metered: true })],
      [5, days('2026-11-01', '2026-11-10', { kWh: 23.3, kWhMeasured: 0, kWhEstimated: 23.3, metered: false })]]),
  }));
  assert.deepEqual(f.lines.filter((l) => l.category === 'utilities').map((l) => [l.label, l.roomId, l.amount]),
    [['Electricity · measured', 2, 14.8], ['Electricity · estimated', 5, 233]]);
  assert.deepEqual(f.kWh, { measured: 14.8, estimated: 233, unseenMs: 0 });
  assert.equal(plain(f.notes.find((n) => n.kind === 'estimated-high').text),
    '94 % of November’s electricity so far (233.0 of 247.8 kWh) is estimated from machine run time. Enter the TNB bill to check it.');
  assert.equal(summaryOf(f).energy, 247.8, 'the contract\'s energy: all of the counted electricity');
  const low = figuresOf('2026-11-01', '2026-11-10', data({
    usage: new Map([[2, days('2026-11-01', '2026-11-10', { kWh: 10, kWhMeasured: 9, kWhEstimated: 1 })]]),
  }));
  assert.equal(low.notes.some((n) => n.kind === 'estimated-high'), false, '10 %: no note');
});

test('G12: a room unseen 5 days 6 h 55 min this month: the note; under an hour: none', () => {
  const u = new Map([...days('2026-11-01', '2026-11-02', { kWh: 4, kWhMeasured: 4, kWhEstimated: 0 }),
    ['2026-11-03', { date: '2026-11-03', kWh: 2.8, kWhMeasured: 2.8, kWhEstimated: 0, unseenMs: (6 * 60 + 55) * 60_000, waterL: 0 }],
    ...days('2026-11-04', '2026-11-08', { kWh: 0, kWhMeasured: 0, kWhEstimated: 0, unseenMs: 24 * H })]);
  const f = figuresOf('2026-11-01', '2026-11-10', data({ usage: new Map([[2, u], [1, days('2026-11-01', '2026-11-10', { kWh: 1, kWhMeasured: 1, kWhEstimated: 0, unseenMs: 50 * 60_000 })]]) }));
  assert.deepEqual(f.notes.filter((n) => n.kind === 'unseen').map((n) => n.text), [
    'The app could not see Container 2 for 5 days 6 h 55 min this month: no electricity is counted for that time. Enter the TNB bill: its top-up counts it.',
    'The app could not see Container 1 for 8 h 20 min this month: no electricity is counted for that time. Enter the TNB bill: its top-up counts it.',
  ]);
  assert.equal(unseenWords(24 * H), '1 day');
});

test('G15: a bill of RM 500 against RM 560 counted takes RM 60 off the estimates by their shares; RM 400 the measured too; RM 600 tops up', () => {
  const runs = [run({ id: 1, roomId: 1 }), run({ id: 2, roomId: 2 }), run({ id: 3, roomId: 5 })];
  // October: Container 5 measured RM 430, Container 1 estimated RM 100, Container 2 estimated RM 30 (RM 1 a kWh)
  const usage = new Map([
    [5, days('2026-10-01', '2026-10-10', { kWh: 43, kWhMeasured: 43, kWhEstimated: 0 })],
    [1, days('2026-10-01', '2026-10-10', { kWh: 10, kWhMeasured: 0, kWhEstimated: 10 })],
    [2, days('2026-10-01', '2026-10-10', { kWh: 3, kWhMeasured: 0, kWhEstimated: 3 })],
  ]);
  const bill = (amount) => ({ id: 9, date: '2026-11-03', category: 'utilities', utility: 'electricity', amount, roomId: null, runId: null, note: '',
    repeat: null, repeatUntil: null, worker: null, periodFrom: '2026-10-01', periodTo: '2026-10-31' });
  const oct = (amount) => figuresOf('2026-10-01', '2026-10-31', data({ runs, usage, costs: [bill(amount)] }));
  const over = (f) => f.lines.filter((l) => l.key === 'over-bill-electricity').map((l) => [l.roomId, l.amount]);
  const a = oct(500);
  assert.deepEqual(over(a), [[1, -46.15], [2, -13.85]]);
  assert.equal(a.costs, 500);
  assert.deepEqual([a.runs.get(1).energy, a.runs.get(1).energyEstimated, a.runs.get(3).energy], [53.85, 53.85, 430]);
  const b = oct(400);
  assert.deepEqual(over(b), [[1, -100], [2, -30], [5, -30]]);
  assert.equal(b.costs, 400);
  const c = oct(600);
  assert.deepEqual(c.lines.filter((l) => l.key === 'unmeasured-electricity').map((l) => [l.amount, l.shared]), [[40, true]]);
  assert.equal(c.costs, 600);
  assert.deepEqual(billTopUp(bill(500), data({ runs, usage, costs: [bill(500)] })), { amount: -60, month: '2026-10' });
});

test('a run\'s own notes (7.2): its estimates over a fifth of its kWh, its room not seen for an hour or more', async () => {
  const { runTotals } = await import('../server/costs-math.js');
  const run = { id: 7, roomId: 2, roomName: 'Container 2', startDate: '2026-11-01', endDate: null, blocks: 500 };
  const part = (x) => ({ blocks: 0, energy: 10, water: 0, own: 0, equipment: 0, shared: 0, income: 0, kgHarvested: 0, kgSold: 0, kgNotSold: 0,
    byCategory: {}, pending: false, energyEstimated: 5, kWhMeasured: 0, kWhEstimated: 0, unseenMs: 0, ...x });
  const empty = { runs: new Map(), notes: [], sharedPending: false, from: '', to: '' };
  const figsOf = (p) => (m) => (m === '2026-11' ? { ...empty, runs: new Map([[7, part(p)]]) } : empty);
  const r = runTotals(run, figsOf({ kWhMeasured: 12, kWhEstimated: 23, unseenMs: (6 * 60 + 55) * 60_000 }), '2026-11-10');
  assert.deepEqual(r.notes.filter((n) => n.runId === 7).map((n) => [n.kind, n.text]), [
    ['estimated-high', '66 % of this run’s electricity (23.0 of 35.0 kWh) is estimated from machine run time. Enter the TNB bill to check it.'],
    ['unseen', 'The app could not see Container 2 for 6 h 55 min during this run: no electricity is counted for that time.'],
  ]);
  const fine = runTotals(run, figsOf({ kWhMeasured: 30, kWhEstimated: 5, unseenMs: 20 * 60_000 }), '2026-11-10');
  assert.deepEqual(fine.notes, [], 'under a fifth, under an hour: no note');
});
