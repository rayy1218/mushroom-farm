// The Costs page's pure parts (spec 2026-11-05-costs-design.md 6): the one formatter, the month words, the tiles, the rows and
// the profit bars' layout.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  moneyText, perKgText, monthTitle, monthTiles, categoryRows, categoryTotal, entryLine, repeatingLine, runRow, runParts, profitBars,
  monthsBetween, monthNotes, amountOf, bodyOf, clampMonth, runOn, landingText, billPeriod, checkCost, stopCharges, stopWords,
  deleteWords, monthSpan, chartMonths, chartTitle, noFigures, AMOUNT_MESSAGE, WORKER_MESSAGE, amountBox,
} from '../web/costs-math.js';
import { DOT } from '../web/text-math.js';

const NB = ' ';

test('money: RM, 2 places, grouping; a loss with a minus sign; a dash for nothing', () => {
  assert.equal(moneyText(1240.5), `RM${NB}1,240.50`);
  assert.equal(moneyText(-1240.5), `−RM${NB}1,240.50`);
  assert.equal(moneyText(0), `RM${NB}0.00`);
  assert.equal(moneyText(null), '—');
  assert.equal(perKgText(0.004), `RM${NB}0.004`);
  assert.equal(perKgText(-3.1), `−RM${NB}3.10`);
});

test('month words', () => {
  assert.equal(monthTitle('2026-11'), 'November 2026');
  assert.deepEqual(monthsBetween('2026-10', '2026-12'), ['2026-10', '2026-11', '2026-12']);
});

test('the tiles: Profit first; a loss says so in words and takes the loss tone; pending says why in short', () => {
  const tiles = monthTiles({ pending: false, tiles: { income: 300, costs: 640, profit: -340, costPerKg: 32, profitPerKg: -17, kgHarvested: 20, kgSold: 20 } });
  assert.deepEqual(tiles.map((x) => [x.label, x.value, x.line ?? null, x.tone ?? null]), [
    ['Profit', `−RM${NB}340.00`, 'Loss', 'loss'],
    ['Income', `RM${NB}300.00`, `20.0${NB}kg sold`, null],
    ['Costs', `RM${NB}640.00`, null, null],
    ['Cost per kg', `RM${NB}32.00`, `20.0${NB}kg picked`, null],
    ['Profit per kg', `−RM${NB}17.00`, `on 20.0${NB}kg sold`, 'loss'],
  ]);
  const gain = monthTiles({ pending: false, tiles: { income: 900, costs: 640, profit: 260, costPerKg: 32, profitPerKg: 13, kgHarvested: 20, kgSold: 20 } });
  assert.deepEqual(gain.map((x) => x.tone ?? null), [null, null, null, null, null]);
  const pending = monthTiles({ pending: true, tiles: { income: 0, costs: null, profit: null, costPerKg: null, profitPerKg: null, kgHarvested: 0, kgSold: 0 } });
  assert.deepEqual(pending.map((x) => [x.label, x.value, x.line]), [
    ['Profit', '—', 'working out'], ['Income', `RM${NB}0.00`, 'Nothing sold'], ['Costs', '—', 'working out'],
    ['Cost per kg', '—', 'working out'], ['Profit per kg', '—', 'working out'],
  ]);
  const none = monthTiles({ pending: false, tiles: { income: 0, costs: 10, profit: -10, costPerKg: null, profitPerKg: null, kgHarvested: 0, kgSold: 0 } });
  assert.equal(none[1].line, 'Nothing sold');
  assert.equal(none[4].line, 'Nothing sold', 'one wording on both tiles');
});

test('the notes: one pending note first; a price left out in the warning tone', () => {
  const notes = monthNotes({ pending: true, notes: [{ kind: 'unpriced-batch', text: 'a' }, { kind: 'no-unit-cost', text: 'b' }, { kind: 'no-sales', text: 'c' }] });
  assert.deepEqual(notes.map((n) => [n.kind, n.text, n.warn]), [
    ['pending', 'Working out the energy cost…', false], ['unpriced-batch', 'a', true], ['no-unit-cost', 'b', true], ['no-sales', 'c', false],
  ]);
  assert.deepEqual(monthNotes({ pending: false, notes: [] }), []);
});

test('the Costs tile says when some costs have no price; a pending run shows dashes', () => {
  const t = (over) => monthTiles({ pending: false, tiles: { income: 0, costs: 10, profit: -10, costPerKg: null, profitPerKg: null, kgHarvested: 0, kgSold: 0, ...over } });
  assert.equal(t({ incomplete: true })[2].line, 'Some costs have no price');
  assert.equal(t({ incomplete: false })[2].line, undefined);
  const pend = monthTiles({ pending: true, tiles: { income: 0, costs: null, profit: null, costPerKg: null, profitPerKg: null, kgHarvested: 0, kgSold: 0, incomplete: true } });
  assert.equal(pend[2].line, 'working out');
  const run = { startedAt: Date.UTC(2026, 9, 2, 16), endedAt: null, roomName: 'Container 1', crops: [{ crop: 'oyster', blocks: 100 }], income: 300, costs: null, profit: null, profitPerKg: null, pending: true, parts: { blocks: 0, energy: 0, water: 0, own: 0, shared: 0 } };
  assert.deepEqual(runRow(run).cells, [`RM${NB}300.00`, '—', '—', '—']);
  assert.equal(runRow(run).loss, false);
});

test('rows: categories with their source, entries, monthly items, runs', () => {
  assert.deepEqual(categoryRows([{ key: 'blocks-batches', label: 'Blocks', source: 'batches', amount: 250, share: 83 }]),
    [{ label: 'Blocks', source: 'from Batches', amount: `RM${NB}250.00`, share: `83${NB}%` }]);
  assert.deepEqual(entryLine({ date: '2026-11-03', label: 'Labour', worker: 'Ali', note: 'Oct sales bonus', roomName: null, amount: 230, repeat: null }),
    { date: '3 Nov', what: `Labour${DOT}Ali${DOT}Oct sales bonus`, whom: 'The farm', amount: `RM${NB}230.00`, monthly: false, bill: false, topUp: null });
  assert.deepEqual(repeatingLine({ date: '2026-08-31', category: 'rent', note: 'Shop lot', worker: null, roomName: null, amount: 1500 }),
    { what: `Rent${DOT}Shop lot`, whom: 'The farm', amount: `RM${NB}1,500.00 a${NB}month`, since: 'since Aug 2026' });
  const rent = { date: '2026-08-31', category: 'rent', note: '', roomName: null, amount: 1500 };
  assert.equal(repeatingLine({ ...rent, repeatUntil: '2026-10' }).since, 'since Aug 2026, until Oct 2026');
  assert.equal(repeatingLine({ ...rent, repeatUntil: '2026-08' }).since, 'Aug 2026 only');
  assert.equal(repeatingLine({ ...rent, repeatUntil: null }).since, 'since Aug 2026');
  const run = {
    startedAt: Date.UTC(2026, 9, 2, 16), endedAt: null, roomName: 'Container 1', crops: [{ crop: 'oyster', blocks: 100 }],
    income: 300, costs: 640, profit: -340, profitPerKg: -17, parts: { blocks: 250, energy: 40, water: 0, own: 50, shared: 300 },
  };
  assert.deepEqual(runRow(run).cells, [`RM${NB}300.00`, `RM${NB}640.00`, `−RM${NB}340.00`, `−RM${NB}17.00`]);
  assert.equal(runRow(run).dates, `3 Oct${NB}–${NB}now`);
  assert.equal(runRow(run).crops, 'Grey oyster');
  assert.equal(runRow(run).crop, run.crops[0].crop, 'the main crop, for its picture');
  assert.equal(runRow({ ...run, crops: [] }).crop, null);
  assert.deepEqual(runParts(run).map(([label]) => label), ['Blocks', 'Electricity', 'Own costs', 'Share of shared costs', 'Income', 'Picked', 'Sold']);
});

test('a run: costs left out say so; a loss per kg in the loss tone; the breakdown names unpriced blocks and the kg', () => {
  const run = {
    startedAt: Date.UTC(2026, 9, 2, 16), endedAt: null, roomName: 'Container 2', crops: [], income: 2800, costs: 4945.27, profit: -2145.27,
    profitPerKg: -12.26, kgHarvested: 210.5, kgSold: 175, incomplete: true,
    parts: { blocks: 0, energy: 40, water: 0, own: 0, shared: 300 }, notes: [{ kind: 'unpriced-batch', text: 'Container 2’s blocks of 12 Oct have no price', runId: 2 }],
  };
  const r = runRow(run);
  assert.equal(r.incomplete, true);
  assert.equal(r.loss, true);
  assert.equal(r.perKgLoss, true);
  assert.equal(runRow({ ...run, incomplete: false, profit: 10, profitPerKg: 0.5 }).perKgLoss, false);
  assert.equal(runRow({ ...run, profitPerKg: -0.00001 }).perKgLoss, false, 'a loss rounding to zero is not one');
  assert.deepEqual(runParts(run), [
    ['Blocks', 'no price'], ['Electricity', `RM${NB}40.00`], ['Share of shared costs', `RM${NB}300.00`], ['Income', `RM${NB}2,800.00`],
    ['Picked', `210.5${NB}kg`], ['Sold', `175.0${NB}kg`],
  ]);
  assert.equal(runParts({ ...run, parts: { ...run.parts, blocks: 250 } })[0][1], `RM${NB}250.00, some with no price`);
});

test('profit bars: above and below one zero line, the shown month marked', () => {
  const months = [{ month: '2026-10', profit: 200 }, { month: '2026-11', profit: -100 }, { month: '2026-12', profit: null, pending: true }];
  const { bars, zeroY, ticks } = profitBars(months, '2026-11', 300, 160);
  assert.equal(bars.length, 3);
  assert.ok(bars[0].y + bars[0].h <= zeroY + 0.001, 'a profit above the line');
  assert.ok(Math.abs(bars[1].y - zeroY) < 0.001, 'a loss from the line down');
  assert.equal(bars[1].loss, true);
  assert.equal(bars[1].shown, true);
  assert.equal(bars[2].pending, true);
  assert.ok(ticks.some((x) => x.label === '0'));
});

test('profit bars: one scale both sides of zero, bare tick numbers, none closer than 28 px', () => {
  const months = [{ month: '2026-09', income: 1, costs: 1, profit: 10000 }, { month: '2026-10', income: 1, costs: 1, profit: -4805 }];
  const { bars, zeroY, ticks } = profitBars(months, '2026-10', 600, 200);
  assert.deepEqual(ticks.map((t) => t.label), ['10,000', '5,000', '0', '−5,000']);
  const step = (ticks[2].y - ticks[1].y);
  assert.ok(Math.abs((ticks[3].y - ticks[2].y) - step) < 0.001, 'the same step below zero');
  assert.ok(Math.abs(ticks[2].y - zeroY) < 0.001);
  assert.ok(Math.abs(bars[1].h - step * 4805 / 5000) < 0.01, 'a loss on the same scale');
  const tight = profitBars(months, '2026-10', 600, 90);
  for (let i = 1; i < tight.ticks.length; i++) {
    assert.ok(Math.abs(tight.ticks[i].y - tight.ticks[i - 1].y) >= 28, 'ticks 28 px apart');
  }
  assert.ok(tight.ticks.some((t) => t.label === '0'), 'zero kept');
});

test('profit bars: words for a reader, the value on the shown bar (all when a slot is 60 px)', () => {
  const months = [
    { month: '2026-08', income: 0, costs: 0, profit: 0 },
    { month: '2026-09', income: 100, costs: 4905, profit: -4805 },
    { month: '2026-10', income: 4000, costs: 236, profit: 3764 },
    { month: '2026-11', income: 0, costs: null, profit: null, pending: true },
  ];
  const narrow = profitBars(months, '2026-10', 44 + 8 + 4 * 40, 200);
  assert.deepEqual(narrow.bars.map((b) => b.words), [
    'August 2026: nothing recorded', `September 2026: loss RM${NB}4,805.00`, `October 2026: profit RM${NB}3,764.00`, 'November 2026: working out',
  ]);
  assert.deepEqual(narrow.bars.map((b) => b.empty), [true, false, false, false]);
  assert.deepEqual(narrow.bars.map((b) => b.showValue), [false, false, true, false]);
  assert.equal(narrow.bars[2].value, '3,764');
  const wide = profitBars(months, '2026-10', 44 + 8 + 4 * 60, 200);
  assert.deepEqual(wide.bars.map((b) => b.showValue), [false, true, true, false]);
  assert.equal(wide.bars[1].value, '−4,805');
});

test('the chart: 6 months when 12 would make a slot under 24 px; its title; no figures at all', () => {
  const last12 = Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, income: 0, costs: 0, profit: 0, pending: false }));
  assert.equal(chartMonths(last12, 44 + 8 + 12 * 24).length, 12);
  assert.deepEqual(chartMonths(last12, 44 + 8 + 12 * 23).map((m) => m.month), last12.slice(-6).map((m) => m.month));
  assert.equal(chartTitle(12), 'Profit, last 12 months (RM)');
  assert.equal(chartTitle(6), 'Profit, last 6 months (RM)');
  assert.equal(chartTitle(1), 'Profit, 1 month (RM)', 'one month kept');
  assert.equal(noFigures(last12), true);
  assert.equal(noFigures([...last12.slice(1), { month: '2027-01', income: 0, costs: 5, profit: -5 }]), false);
  assert.equal(noFigures([{ month: '2026-11', income: 0, costs: null, profit: null, pending: true }]), false, 'pending is not nothing');
});

test('signs come from the rounded value', () => {
  assert.equal(moneyText(-0.004), `RM${NB}0.00`);
  assert.equal(moneyText(-0), `RM${NB}0.00`);
  assert.equal(moneyText(-0.005), `−RM${NB}0.01`);
  assert.equal(perKgText(-0), `RM${NB}0.00`);
  assert.equal(perKgText(0), `RM${NB}0.00`);
  assert.equal(perKgText(-0.00001), `RM${NB}0.00`);
  assert.equal(perKgText(0.00001), `under${NB}RM${NB}0.0001`);
  assert.equal(perKgText(-0.004), `−RM${NB}0.004`);
});

test('money: a large grouped value and its loss', () => {
  assert.equal(moneyText(1234567.89), `RM${NB}1,234,567.89`);
  assert.equal(moneyText(-1234567.89), `−RM${NB}1,234,567.89`);
});

test('monthsBetween across a year end', () => {
  assert.deepEqual(monthsBetween('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('a closed run ending after farm midnight reads the farm day', () => {
  const run = { startedAt: Date.UTC(2026, 9, 2, 16), endedAt: Date.UTC(2026, 9, 31, 17), roomName: 'Container 1', crops: [], income: 0, costs: 0, profit: 0, profitPerKg: null };
  assert.equal(runRow(run).dates, `3 Oct${NB}–${NB}1 Nov`);
});

test('entry lines: a utility bill and a monthly repeat; category rows without a share or source', () => {
  assert.deepEqual(entryLine({ date: '2026-11-03', category: 'utilities', utility: 'electricity', roomName: 'Container 1', amount: 90, repeat: 'monthly' }),
    { date: '3 Nov', what: 'Electricity bill', whom: 'Container 1', amount: `RM${NB}90.00`, monthly: true, bill: true, topUp: null });
  assert.deepEqual(categoryRows([{ label: 'Other', source: 'mystery', amount: 10, share: null }]),
    [{ label: 'Other', source: null, amount: `RM${NB}10.00`, share: '—' }]);
});

test('by category: an entered line says so beside the same name from another source; the total is the Costs tile', () => {
  const rows = categoryRows([
    { label: 'Packaging', source: 'inventory', amount: 330, share: 5 }, { label: 'Packaging', source: 'manual', amount: 20, share: 0 },
    { label: 'Rent', source: 'manual', amount: 1500, share: 23 },
  ]);
  assert.deepEqual(rows.map((r) => r.source), ['from Inventory', 'entered', null]);
  assert.equal(categoryTotal({ pending: false, tiles: { costs: 6560 } }), `RM${NB}6,560.00`);
  assert.equal(categoryTotal({ pending: true, tiles: { costs: null } }), '—');
});

test('an electricity bill in Entries: tagged, with what it adds', () => {
  const bill = { date: '2026-10-31', category: 'utilities', utility: 'electricity', roomName: null, amount: 580, repeat: null };
  const adds = (amount, month = '2026-10') => entryLine({ ...bill, topUp: { amount, month } });
  assert.deepEqual([adds(580).bill, adds(580).topUp], [true, `adds RM${NB}580.00 unmeasured`]);
  assert.equal(adds(0).topUp, 'adds nothing: measured is higher');
  assert.equal(adds(null).topUp, 'working out');
  const late = { ...bill, date: '2026-11-03' };
  assert.equal(entryLine({ ...late, topUp: { amount: 580, month: '2026-10' } }).topUp, `adds RM${NB}580.00 unmeasured to October`, 'its period ended in October');
  assert.equal(entryLine({ ...late, date: '2027-01-04', topUp: { amount: 580, month: '2026-12' } }).topUp, `adds RM${NB}580.00 unmeasured to December 2026`);
  assert.equal(entryLine({ ...late, topUp: { amount: 0, month: '2026-10' } }).topUp, 'adds nothing to October: measured is higher');
  const other = entryLine({ ...bill, utility: 'other', topUp: undefined });
  assert.deepEqual([other.bill, other.topUp], [false, null]);
});

test('the dialogs\' body: a bill is the farm\'s, an empty period null, grouping commas in the amount', () => {
  assert.equal(amountOf('1,234.50'), 1234.5);
  assert.equal(amountOf(' 12 '), 12);
  assert.ok(Number.isNaN(amountOf('')));
  assert.ok(Number.isNaN(amountOf('12a')));
  const v = { date: '2026-11-03', category: 'utilities', utility: 'electricity', amount: '1,800', roomId: '2', note: '', worker: 'Ali', periodFrom: '', periodTo: '2026-11-30' };
  assert.deepEqual(bodyOf(v), { date: '2026-11-03', category: 'utilities', amount: 1800, note: '', roomId: null, utility: 'electricity', periodFrom: null, periodTo: '2026-11-30' });
  assert.deepEqual(bodyOf({ ...v, category: 'labour' }), { date: '2026-11-03', category: 'labour', amount: 1800, note: '', roomId: 2, worker: 'Ali' });
  assert.deepEqual(bodyOf({ ...v, category: 'utilities', utility: 'other' }), { date: '2026-11-03', category: 'utilities', amount: 1800, note: '', roomId: 2, utility: 'other' });
});

test('the browser\'s checks before a send: the amount and who was paid', () => {
  const ok = { category: 'repairs', amount: '12', worker: '' };
  assert.equal(checkCost(ok), null);
  assert.deepEqual(checkCost({ ...ok, amount: '' }), { field: 'amount', message: AMOUNT_MESSAGE });
  assert.deepEqual(checkCost({ ...ok, amount: '0' }), { field: 'amount', message: AMOUNT_MESSAGE });
  assert.deepEqual(checkCost({ ...ok, amount: '1,000,001' }), { field: 'amount', message: AMOUNT_MESSAGE });
  assert.equal(checkCost({ ...ok, amount: '1,000,000' }), null);
  assert.deepEqual(checkCost({ ...ok, category: 'labour' }), { field: 'worker', message: WORKER_MESSAGE });
  assert.deepEqual(checkCost({ ...ok, category: 'labour' }, { workersFailed: true }), { field: 'worker', message: 'The workers could not be read. Try again.' });
  assert.equal(checkCost({ ...ok, category: 'labour', worker: 'Ali' }), null);
  const bill = { category: 'utilities', utility: 'electricity', amount: '80', date: '2026-11-03', periodFrom: '2026-10-01', periodTo: '2026-10-31' };
  assert.equal(checkCost(bill), null);
  assert.deepEqual(checkCost({ ...bill, periodFrom: '2026-08-02', periodTo: '2026-08-31' }), { field: 'periodFrom', message: 'Pick a first day up to 92 days before the bill’s date' });
  assert.equal(checkCost({ ...bill, periodFrom: '2026-08-03', periodTo: '2026-09-02' }), null, '92 days before');
  assert.deepEqual(checkCost({ ...bill, periodFrom: '2026-09-01', periodTo: '2026-11-03' }), { field: 'periodTo', message: 'Pick the last day the bill covers, up to 62 days after the first' });
  assert.deepEqual(checkCost({ ...bill, periodFrom: '2026-11-03', periodTo: '2026-11-01' }), { field: 'periodTo', message: 'Pick the last day the bill covers, up to 62 days after the first' });
  assert.deepEqual(checkCost({ ...bill, periodFrom: '2026-11-20', periodTo: '2026-12-05' }), { field: 'periodTo', message: 'Pick a last day up to 31 days after the bill’s date' });
  assert.equal(checkCost({ ...bill, periodFrom: '2026-11-04', periodTo: '2026-12-04' }), null, '31 days after');
  assert.equal(checkCost({ ...bill, periodFrom: '', periodTo: '' }), null, 'empty: the server takes the date\'s month');
  assert.equal(checkCost({ ...bill, utility: 'other', periodFrom: '2020-01-01' }), null, 'not a bill: no period');
  assert.equal(AMOUNT_MESSAGE, 'Enter an amount over RM 0, up to RM 1,000,000');
  assert.equal(WORKER_MESSAGE, 'Pick who was paid');
});

test('where a one-off room cost lands: the room\'s run open that day, the one started last', () => {
  const at = (d, h = 1) => Date.parse(`${d}T0${h}:00:00Z`);
  const runs = [
    { id: 1, roomId: 1, startedAt: at('2026-09-20'), endedAt: at('2026-10-05') },
    { id: 2, roomId: 1, startedAt: at('2026-10-05', 5), endedAt: null },
    { id: 3, roomId: 2, startedAt: at('2026-10-01'), endedAt: null },
  ];
  assert.equal(runOn(runs, 1, '2026-09-30', '2026-11-05').id, 1);
  assert.equal(runOn(runs, 1, '2026-10-05', '2026-11-05').id, 2, 'the later one on the day they meet');
  assert.equal(runOn(runs, 1, '2026-11-05', '2026-11-05').id, 2);
  assert.equal(runOn(runs, 1, '2026-09-01', '2026-11-05'), null);
  assert.equal(runOn([{ id: 9, roomId: 1, startedAt: Date.UTC(2026, 9, 2, 16), endedAt: null }], 1, '2026-10-03', '2026-11-05').id, 9, 'the farm\'s day (UTC+8)');
  assert.equal(landingText(runs, 1, 'Container 1', '2026-10-01', '2026-11-05'), 'On Container 1’s run of 20 Sep.');
  assert.equal(landingText(runs, 1, 'Container 1', '2025-12-01', '2026-11-05'), 'No run in Container 1 then: on the farm’s month.');
  assert.equal(landingText([{ id: 4, roomId: 1, startedAt: at('2025-12-01'), endedAt: null }], 1, 'Container 1', '2026-01-02', '2026-11-05'), 'On Container 1’s run of 1 Dec 2025.');
});

test('a bill\'s period: its date\'s month', () => {
  assert.deepEqual(billPeriod('2026-02-14'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(billPeriod('2028-02-01'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(billPeriod('2026-10-31'), { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(billPeriod('2026-1'), null);
});

test('clampMonth and a month span', () => {
  const list = ['2026-08', '2026-09', '2026-10'];
  assert.equal(clampMonth('2026-07', list), '2026-08');
  assert.equal(clampMonth('2026-12', list), '2026-10');
  assert.equal(clampMonth('2026-09', list), '2026-09');
  assert.equal(monthSpan('2026-07', '2026-11'), 'Jul–Nov 2026');
  assert.equal(monthSpan('2025-12', '2026-02'), 'Dec 2025–Feb 2026');
  assert.equal(monthSpan('2026-11', '2026-11'), 'Nov 2026');
});

test('Stop: the charges a past month removes, said and on the button', () => {
  const wage = { date: '2026-07-01', amount: 1800, repeat: 'monthly', repeatUntil: null };
  const today = '2026-11-05';
  assert.deepEqual(stopCharges(wage, '2026-11', today), []);
  assert.deepEqual(stopCharges(wage, '2026-10', today).map((c) => c.date), ['2026-11-01']);
  assert.deepEqual(stopWords(wage, '2026-11', today), { warning: null, button: 'Stop', danger: false });
  assert.deepEqual(stopWords(wage, '2026-10', today), { warning: `November’s charge of RM${NB}1,800.00 goes too.`, button: 'Stop and remove 1 charge', danger: true });
  assert.deepEqual(stopWords(wage, '2026-09', today), { warning: `October’s and November’s charges, RM${NB}3,600.00, go too.`, button: 'Stop and remove 2 charges', danger: true });
  assert.deepEqual(stopWords(wage, '2026-07', today), { warning: `4 charges, RM${NB}7,200.00, Aug–Nov 2026, go too.`, button: 'Stop and remove 4 charges', danger: true });
  const late = { ...wage, date: '2026-07-31' };
  assert.deepEqual(stopCharges(late, '2026-10', today), [], 'November\'s charge on the 30th has not come yet');
  assert.deepEqual(stopCharges({ ...wage, repeatUntil: '2026-09' }, '2026-08', today).map((c) => c.month), ['2026-09'], 'only to its last month');
});

test('Delete of a monthly item names what goes', () => {
  const rent = { date: '2026-07-01', amount: 1500, repeat: 'monthly', repeatUntil: null };
  assert.equal(deleteWords(rent, '2026-11-05'), `5 charges, RM${NB}7,500.00, Jul–Nov 2026`);
  assert.equal(deleteWords({ ...rent, date: '2026-11-01' }, '2026-11-05'), `1 charge, RM${NB}1,500.00, Nov 2026`);
  assert.equal(deleteWords({ ...rent, date: '2026-11-20' }, '2026-11-05'), null, 'nothing charged yet');
});

test('profit bars: a single month does not fill the chart', () => {
  const r = profitBars([{ month: '2026-11', profit: 100 }], '2026-11', 1000, 200);
  assert.equal(r.bars[0].w, 48);
});

test('an amount box shows the amount grouped, as the page does; it reads back the same', () => {
  assert.equal(amountBox(1800), '1,800.00');
  assert.equal(amountBox(12.5), '12.50');
  assert.equal(amountOf(amountBox(1234567.89)), 1234567.89);
});
