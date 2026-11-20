// A run against its plan (web/economics-plan.js, spec 2026-11-12-economics-stage-2-design.md 7.5, 7.6 and 7.9): the plan's
// and the run's month, the rows, the one-at-a-time gaps and the two named, a run whose loss is not measured, a run before
// stage 2, a plan missing a key, the run in progress. Made-up figures: the plan is stage 1's 11.1 inputs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planValuesOf, runValuesOf, runMonths, gapsOf, runRows, againstLine, gapsLine, planLine, mixedLine, partialLine,
  missingLine, progressOf, progressLine, runTitle, leftOutLine, emptyLine, olderText, noDayLine, PAST_SHOWN,
} from '../web/economics-plan.js';

const r2 = (v) => Math.round(v * 100) / 100;
const plain = (s) => s.replaceAll('\u00a0', ' ').replaceAll('\u2060', '').replaceAll('\u2011', '-');
const SEP_1 = Date.UTC(2026, 8, 1, 0, 12); // 08:12 on the farm, 1 Sep 2026

// Stage 1's 11.1 inputs (the model page's), as the figures a plan saves (the shared ones and Your container's).
const V = {
  price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, life: 60,
  'yours.blocks': 1740, 'yours.yieldG': 250.015, 'yours.flushes': 2, 'yours.loss': 10, 'yours.first': 12, 'yours.interval': 14,
  'yours.turn': 16, 'yours.kwhBlock': (506 * 42) / (1740 * 30.4), 'yours.labourMin': 2.52, 'yours.transport': 0, 'yours.rent': 0,
  'yours.container': 18500, 'yours.cooling': 8580, 'yours.humidifier': 3000, 'yours.fans': 3300, 'yours.racks': 2610,
};
const figuresOf = (values) => Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value, source: 'research' }]));
const PLAN = { at: SEP_1, figures: figuresOf(V), context: { otherBlocks: 0, register: null } };
const TODAY = { ...V, price: 44 }; // today's figures, for a run before stage 2
// A made-up finished run: 1,740 blocks in 1 Sep, out 29 Sep, 87 lost by Batches' checks, 380.6 kg picked, 300 kg sold for
// RM 16,200.00, 0.45 kWh a block, its blocks RM 6.50.
const RUN = {
  runId: 7, from: SEP_1, to: SEP_1 + 28 * 86_400_000, days: 28, partial: false, mixed: [], blocks: 1740, lost: 87, measured: true,
  kg: 380.6, sold: { kg: 300, total: 16200 }, price: 54, blockPrice: 6.5, batchesLeftOut: 0, kwhBlock: 0.45, kwhPending: false,
};
const NOT_MEASURED = { ...RUN, lost: null, measured: false };
const at = (plan = PLAN, run = RUN) => [plan, run, TODAY, { otherBlocks: 0, register: null }, 'lionsmane'];

test('the plan and the run: RM 3,003.16 against RM 2,832.85, RM 170.31 under; the run\'s figures and block life', () => {
  const plan = planValuesOf(PLAN, TODAY, {}, 'lionsmane');
  assert.equal(plan.before, false);
  assert.equal(plan.values.price, 50, 'the plan\'s own, not today\'s');
  const run = runValuesOf(plan.values, RUN);
  assert.equal(r2(run.values['yours.yieldG']), 230.25, '380.6 kg ÷ 1,653 good blocks');
  assert.equal(run.values['yours.loss'], 5);
  assert.deepEqual([run.values.price, run.values.blockPrice, run.values['yours.kwhBlock'], run.life], [54, 6.5, 0.45, 44]);
  const m = runMonths(...at());
  assert.deepEqual([r2(m.plan.profit), r2(m.run.profit), r2(m.diff), r2(m.run.kgSold), m.run.life], [3003.16, 2832.85, -170.31, 236.66, 44]);
  assert.equal(plain(againstLine(m.diff)), 'RM 170.31 a month under the plan.');
  assert.equal(plain(againstLine(85)), 'RM 85.00 a month over the plan.');
  assert.equal(againstLine(0.004), 'The same as the plan.');
});

test('the rows: plan against this run', () => {
  const rows = runRows(...at()).map((r) => [r.label, plain(r.plan), plain(r.run), r.sub && plain(r.sub)]);
  assert.deepEqual(rows, [
    ['Blocks put in', '1,740', '1,740', null],
    ['Blocks lost', '10 % (174)', '5 % (87)', null],
    ['Yield per good block', '250 g', '230 g', null],
    ['kg picked', '391.5 kg', '380.6 kg', null],
    ['Selling price', 'RM 50.00 a kg', 'RM 54.00 a kg', '300.0 kg sold'],
    ['Block price', 'RM 6.00 a block', 'RM 6.50 a block', null],
    ['Electricity per block', '0.40 kWh', '0.45 kWh', null],
    ['Days in the room', '26 days', '28 days', null],
    ['Profit a month at these figures', 'RM 3,003.16', 'RM 2,832.85', null],
  ]);
  const none = runRows(...at(PLAN, { ...NOT_MEASURED, price: null, sold: null, blockPrice: null, kwhBlock: null, kwhPending: true }));
  const by = Object.fromEntries(none.map((r) => [r.key, [plain(r.label), plain(r.run)]]));
  assert.deepEqual(by.loss, ['Blocks lost', 'In the yield']);
  assert.deepEqual(by.yield, ['Yield per block put in', '219 g']);
  assert.equal(plain(none.find((r) => r.key === 'yield').plan), '225 g', 'the plan\'s yield over every block put in');
  assert.deepEqual([by.price[1], by.blockPrice[1], by.kwh[1]], ['No sales reached it', 'No price', 'Working out…']);
  assert.equal(plain(runRows(...at(PLAN, { ...RUN, kwhBlock: null })).find((r) => r.key === 'kwh').run), 'Not measured');
});

test('the gaps one at a time, the two biggest named; not measured: the yield and loss together', () => {
  const gaps = gapsOf(...at());
  assert.deepEqual(gaps.map((g) => [g.key, r2(g.delta)]), [
    ['price', 1020.2], ['yield', -947.76], ['loss', 665.96], ['blockPrice', -629.71], ['days', -164.68], ['kwh', -33.47],
  ], 'Blocks put in moved nothing: left out');
  assert.equal(plain(gapsLine(gaps)), 'What made the difference, each on its own: Selling price RM 54.00 a kg against RM 50.00 planned, '
    + '+RM 1,020.20 a month; Yield per good block 230 g against 250 g planned, −RM 947.76 a month.');
  const nm = gapsOf(...at(PLAN, NOT_MEASURED));
  assert.deepEqual(nm.map((g) => [g.key, r2(g.delta)]).slice(0, 3), [['price', 1020.2], ['blockPrice', -629.71], ['yield', -334.45]]);
  assert.equal(plain(nm[2].label), 'Yield per block put in');
  assert.equal(r2(runMonths(...at(PLAN, NOT_MEASURED)).run.profit), 2832.85, 'the same month either way');
  assert.equal(plain(gapsLine(gaps.slice(0, 1))), 'What made the difference, each on its own: Selling price RM 54.00 a kg against RM 50.00 planned, +RM 1,020.20 a month.');
  assert.equal(gapsLine([]), 'Nothing moved it more than a sen.');
});

test('a run before stage 2: today\'s figures, said; a plan missing a key: today\'s value, said', () => {
  const before = planValuesOf({ at: null, before: true }, TODAY, { otherBlocks: 5 }, 'lionsmane');
  assert.deepEqual([before.before, before.values.price, before.ctx.otherBlocks], [true, 44, 5]);
  assert.equal(planLine({ at: null, before: true }), 'Started before plans were kept: compared with today\'s figures.');
  assert.equal(plain(planLine(PLAN)), 'Plan saved 1 Sep 08:12 with that day\'s figures.');
  const older = { ...PLAN, figures: { ...PLAN.figures, gone: { value: 1, source: 'owner' } } };
  delete older.figures['yours.racks'];
  const p = planValuesOf(older, { ...TODAY, 'yours.racks': 999 }, {}, 'lionsmane');
  assert.deepEqual([p.values['yours.racks'], p.values.gone, p.missing], [999, undefined, ['yours.racks']]);
  assert.equal(plain(missingLine(p.missing)), 'Racks: today\'s figure (not in the plan).');
  assert.equal(plain(missingLine(['yours.racks', 'yours.fans'])), 'Racks, Fans, controller and wiring: today\'s figures (not in the plan).');
  assert.equal(missingLine([]), null);
});

test('a mixed run and a partial one say so', () => {
  assert.equal(plain(mixedLine({ ...RUN, mixed: ['oyster'] }, 'Container 1')), 'Container 1 also grew Grey oyster in this run; its electricity is shared by every block.');
  assert.equal(mixedLine(RUN, 'Container 1'), null);
  assert.equal(plain(partialLine({ ...RUN, partial: true, from: Date.UTC(2026, 8, 20, 1) })), 'Counted from 20 Sep, the day its blocks went in.');
  assert.equal(partialLine(RUN), null);
});

test('a run in progress against the plan by now (equal flushes, each due on its day)', () => {
  const p = (day, kg) => progressOf({ runId: 9, day, kg, blocks: 1740, partial: false }, V);
  assert.deepEqual(Object.keys(p(20, 180)), ['day', 'days', 'kg', 'planKg', 'planTotal', 'firstDay']);
  assert.deepEqual([p(20, 180).day, p(20, 180).days, p(20, 180).kg, p(20, 180).firstDay], [20, 26, 180, 12]);
  assert.equal(r2(p(20, 180).planKg), 195.76);
  assert.equal(r2(p(20, 180).planTotal), 391.52);
  assert.equal(plain(progressLine(p(20, 180))), 'Day 20 of 26: 180.0 kg so far, the plan by now 195.8 kg.');
  assert.equal(plain(progressLine(p(30, 380.6))), 'Day 30, past the plan\'s 26 days: 380.6 kg so far, the plan 391.5 kg.');
  assert.equal(plain(progressLine(p(5, 0))), 'Day 5 of 26: nothing picked yet; the plan\'s first harvest is on day 12.');
  assert.equal(plain(progressLine(p(14, 0))), 'Day 14 of 26: nothing picked yet; the plan by now 195.8 kg.');
  assert.equal(p(11, 0).planKg, 0, 'no flush due before day 12');
  assert.equal(progressOf({ runId: 9, day: null, kg: 5, blocks: 100, partial: true }, V), null, 'a partial run without its block-in day');
});

test('the section\'s words: a run\'s title, the left out, nothing yet, the older runs, an open run without its block-in day', () => {
  const m = runMonths(...at());
  assert.equal(plain(runTitle(RUN, m)), '1 Sep – 29 Sep · RM 2,832.85 a month at its figures · RM 170.31 under the plan');
  assert.equal(plain(runTitle(RUN, { ...m, diff: 0 })), '1 Sep – 29 Sep · RM 2,832.85 a month at its figures · the same as the plan');
  assert.equal(leftOutLine(0), null);
  assert.equal(leftOutLine(1), '1 run left out: recorded without the day its blocks went in.');
  assert.equal(leftOutLine(2), '2 runs left out: recorded without the day their blocks went in.');
  assert.equal(emptyLine({ crop: 'lionsmane', room: 'Container 1', current: false }),
    "No finished runs of Lion's mane in Container 1 yet. When blocks go in on its Crop tab, that day's figures are saved as the run's plan.");
  assert.equal(emptyLine({ crop: 'lionsmane', room: 'Container 1', current: true }), "No finished run of Lion's mane in Container 1 yet.");
  assert.equal(PAST_SHOWN, 5);
  assert.deepEqual([olderText(1), olderText(4)], ['1 older run', '4 older runs']);
  assert.equal(plain(noDayLine({ from: Date.UTC(2026, 9, 12, 1) })), 'Recorded from 12 Oct; give the day its blocks went in to compare it.');
});

// ---- the final review's notes ----
test('a mixed run on plan reads on plan: the room\'s blocks set its month, the crop\'s its yield; the plan by now at the crop\'s share', () => {
  // the plan saved the room's 1,500 blocks (1,000 lion's mane + 500 grey oyster); the run picks lion's mane exactly at the plan's rates
  const plan = { ...PLAN, figures: { ...PLAN.figures, 'yours.blocks': { value: 1500, source: 'runs' } } };
  const kg = (1000 * 0.9 * 250.015) / 1000;
  const run = { ...RUN, blocks: 1000, roomBlocks: 1500, lost: 100, kg, price: 50, blockPrice: 6, kwhBlock: V['yours.kwhBlock'], days: 26, mixed: ['oyster'] };
  const m = runMonths(plan, run, TODAY, {}, 'lionsmane');
  assert.equal(r2(m.diff), 0, 'exactly on plan');
  const rows = Object.fromEntries(runRows(plan, run, TODAY, {}, 'lionsmane').map((r) => [r.key, [plain(r.plan), plain(r.run)]]));
  assert.deepEqual(rows.blocks, ['1,000', '1,000'], 'this crop\'s share of the plan\'s blocks');
  assert.deepEqual(rows.kg, ['225.0 kg', '225.0 kg']);
  const p = progressOf({ day: 13, kg: 112.5, blocks: 1000 }, { ...V, 'yours.blocks': 1500 });
  assert.equal(r2(p.planKg), 112.51, 'the plan by now at this crop\'s blocks');
});

test('a run of 0 days in the room: at least a day of block life, no NaN', () => {
  const m = runMonths(PLAN, { ...RUN, days: 0 }, TODAY, {}, 'lionsmane');
  assert.ok(Number.isFinite(m.run.profit));
  const noTurn = { ...PLAN, figures: { ...PLAN.figures, 'yours.turn': { value: 0, source: 'owner' } } };
  assert.equal(runMonths(noTurn, { ...RUN, days: 0 }, TODAY, {}, 'lionsmane').life, 1);
});

test('a part of the plans not read: its rows say so in the warning tone; the month at the plan\'s figure', () => {
  const run = { ...RUN, price: null, sold: null, blockPrice: null, measured: false, lost: null, kwhBlock: null };
  const rows = Object.fromEntries(runRows(PLAN, run, TODAY, {}, 'lionsmane', { errors: { sales: 'x', batches: 'x', energy: 'x' } }).map((r) => [r.key, r]));
  assert.deepEqual([rows.price.run, rows.price.tone], ["Couldn't read Sales just now", 'warn']);
  assert.deepEqual([rows.blockPrice.run, rows.loss.run, rows.kwh.run], ["Couldn't read Batches just now", "Couldn't read Batches just now", "Couldn't read the electricity just now"]);
  const m = runMonths(PLAN, RUN, TODAY, {}, 'lionsmane');
  assert.equal(runRows(PLAN, RUN, TODAY, {}, 'lionsmane', { months: m }).at(-1).run, runRows(PLAN, RUN, TODAY, {}, 'lionsmane').at(-1).run, 'a month worked out once can be passed in');
});

// ---- the independent review ----
test('a crop added to an open run, on plan, reads "The same as the plan.": the plan\'s own blocks, the room as the plan had it', () => {
  // lion's mane's plan saved at the room's 1,000 (lion's mane alone); 500 grey oyster added to the run later
  const plan = { ...PLAN, figures: { ...PLAN.figures, 'yours.blocks': { value: 1000, source: 'runs' } }, context: { otherBlocks: 0, register: null, cropBlocks: 1000 } };
  const kg = (1000 * 0.9 * 250.015) / 1000;
  const run = { ...RUN, blocks: 1000, roomBlocks: 1500, lost: 100, kg, price: 50, blockPrice: 6, kwhBlock: V['yours.kwhBlock'], days: 26, mixed: ['oyster'] };
  const m = runMonths(plan, run, TODAY, {}, 'lionsmane');
  assert.equal(m.runValues['yours.blocks'], 1000, 'the room as the plan had it');
  assert.equal(againstLine(m.diff), 'The same as the plan.');
  const rows = Object.fromEntries(runRows(plan, run, TODAY, {}, 'lionsmane').map((r) => [r.key, [plain(r.plan), plain(r.run)]]));
  assert.deepEqual(rows.blocks, ['1,000', '1,000']);
  assert.deepEqual(rows.kg, ['225.0 kg', '225.0 kg']);
  assert.deepEqual(rows.loss, ['10 % (100)', '10 % (100)']);
  assert.equal(gapsLine(gapsOf(plan, run, TODAY, {}, 'lionsmane')), 'Nothing moved it more than a sen.');
  // the grey oyster added: its plan saved the room's 1,500 then, its own 500; the run at its 500 is the room's 1,500
  const oysterPlan = { ...plan, figures: { ...plan.figures, 'yours.blocks': { value: 1500, source: 'runs' } }, context: { ...plan.context, cropBlocks: 500 } };
  const oyster = { ...run, blocks: 500, lost: 50, kg: (500 * 0.9 * 250.015) / 1000, mixed: ['lionsmane'] };
  const mo = runMonths(oysterPlan, oyster, TODAY, {}, 'lionsmane');
  assert.equal(mo.runValues['yours.blocks'], 1500);
  assert.equal(againstLine(mo.diff), 'The same as the plan.');
  assert.deepEqual(runRows(oysterPlan, oyster, TODAY, {}, 'lionsmane').find((r) => r.key === 'blocks').plan, '500');
  // fewer blocks of the crop than planned: the room's month at the plan's room less the gap
  const fewer = runMonths(plan, { ...run, blocks: 800, lost: 80, kg: (800 * 0.9 * 250.015) / 1000 }, TODAY, {}, 'lionsmane');
  assert.equal(fewer.runValues['yours.blocks'], 800);
});

test('a run from before plans: its own blocks, not today\'s room', () => {
  const before = { at: null, before: true };
  const run = { ...RUN, blocks: 1000, roomBlocks: 1200 };
  const p = planValuesOf(before, TODAY, {}, 'lionsmane', run);
  assert.deepEqual([p.values['yours.blocks'], p.cropBlocks], [1200, 1000]);
  assert.equal(planValuesOf(before, TODAY, {}, 'lionsmane', { ...RUN, blocks: 900 }).values['yours.blocks'], 900, 'a run of one crop');
  const m = runMonths(before, run, TODAY, {}, 'lionsmane');
  assert.deepEqual([m.planValues['yours.blocks'], m.runValues['yours.blocks']], [1200, 1200]);
  assert.equal(runRows(before, run, TODAY, {}, 'lionsmane').find((r) => r.key === 'blocks').plan, '1,000');
  assert.equal(planValuesOf(before, TODAY, {}, 'lionsmane').values['yours.blocks'], 1740, 'no run given (the run in progress): today\'s');
});

test('the blocks gap says the crop\'s blocks, as the table does', () => {
  const plan = { ...PLAN, figures: { ...PLAN.figures, 'yours.blocks': { value: 1500, source: 'runs' } }, context: { otherBlocks: 0, register: null, cropBlocks: 1000 } };
  const run = { ...RUN, blocks: 800, roomBlocks: 1300, mixed: ['oyster'] };
  const blocks = gapsOf(plan, run, TODAY, {}, 'lionsmane').find((x) => x.key === 'blocks');
  assert.deepEqual([blocks.planText, blocks.runText], ['1,000', '800']);
  assert.ok(blocks.delta < 0);
});
