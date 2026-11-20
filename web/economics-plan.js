// A run against its plan (spec 2026-11-12-economics-stage-2-design.md 7.5 and 7.6): the plan's figures (saved when the run
// started, or today's for a run before plans were kept), the run's own in their place, both months worked out with the model,
// the rows of the table, the gaps one at a time and the two that made the difference, and a run in progress against the plan
// by now. Pure: no DOM, no fetch, no clock.
//   planValuesOf · runValuesOf · runMonths · gapsOf · runRows · againstLine · gapsLine · planLine · mixedLine · partialLine
//   · missingLine · progressOf · progressLine · runTitle · leftOutLine · emptyLine · olderText · noDayLine · PAST_SHOWN

import { grow, inputsOf } from './economics-model.js';
import { figureOf, figuresFor, keepTogether } from './economics-defaults.js';
import { figureText } from './economics-math.js';
import { moneyText, perKgText } from './costs-math.js';
import { kgText } from './harvest-math.js';
import { grouped } from './overview-math.js';
import { farmDate, farmTime, dayMonth } from './tasks-math.js';
import { cropShortName } from './crops.js';

const NB = '\u00a0';
const cents = (v) => Math.sign(v) * Math.round(Math.abs(v) * 100);
const signed = (v) => (cents(v) > 0 ? `+${moneyText(v)}` : moneyText(v)); // "+RM 1,020.20", "−RM 947.76"
const plural = (n, one, many) => `${grouped(n, 0)}${NB}${n === 1 ? one : many}`;
const dateText = (ms) => dayMonth(farmDate(ms));
// The plan's days in the room: to its first harvest and between its flushes (the turnaround after is not the run's).
const daysIn = (v) => v['yours.first'] + v['yours.interval'] * Math.max(0, v['yours.flushes'] - 1);
// The plan's kg picked over a run: its blocks less the lost, at its yield per good block.
const planKgOf = (v) => (v['yours.blocks'] * (1 - v['yours.loss'] / 100) * v['yours.yieldG']) / 1000;

// plan: the plans view's { at, figures, context } or { at, before: true }; today: the page's values and the view's context;
// crop: the room's crop; run: the finished run (a run before plans takes its own blocks, not today's room: the review).
// → { values, ctx, before, missing, cropBlocks }: missing the plan keys the plan lacks that today has (an older plan), taken
// from today; keys the code no longer knows are left out; cropBlocks the crop's own blocks in the plan (its yours.blocks the
// room's, every crop's), null when the plan did not keep them.
export function planValuesOf(plan, todayValues, todayCtx, crop, run = null) {
  if (!plan || plan.before || !plan.figures) {
    const values = { ...todayValues };
    if (run) values['yours.blocks'] = run.roomBlocks ?? run.blocks;
    return { values, ctx: todayCtx ?? {}, before: true, missing: [], cropBlocks: run ? run.blocks : null };
  }
  const values = { ...todayValues };
  const missing = [];
  for (const f of figuresFor(crop)) {
    if (f.way !== 'shared' && f.way !== 'yours') continue;
    const saved = plan.figures[f.key];
    if (saved && typeof saved.value === 'number') values[f.key] = saved.value;
    else if (typeof todayValues[f.key] === 'number') missing.push(f.key);
  }
  const { cropBlocks = null, ...ctx } = plan.context ?? {};
  return { values, ctx, before: false, missing, cropBlocks };
}

// The run's figures in the plan's place (7.5): its blocks, its loss and yield (per good block when its loss is measured, else
// over every block put in with no loss), its price, block price and kWh when it has them; its block life its days in the
// room + the plan's turnaround. cropBlocks: the plan's own blocks of the crop (planValuesOf's). → { values, life }.
export function runValuesOf(planValues, run, cropBlocks = null) {
  // the room's blocks set the month: the room as the plan had it, at this crop's blocks against the plan's (a crop added to an
  // open run is not compared with the room it joined, the review); a plan without the crop's blocks, the run's room. The
  // crop's own set its yield and loss
  const blocks = cropBlocks > 0 ? (planValues['yours.blocks'] * run.blocks) / cropBlocks : run.roomBlocks ?? run.blocks;
  const values = { ...planValues, 'yours.blocks': blocks };
  if (run.measured && run.blocks > run.lost) {
    values['yours.loss'] = (run.lost / run.blocks) * 100;
    values['yours.yieldG'] = (run.kg / (run.blocks - run.lost)) * 1000;
  } else {
    values['yours.loss'] = 0;
    values['yours.yieldG'] = run.blocks > 0 ? (run.kg / run.blocks) * 1000 : 0;
  }
  if (typeof run.price === 'number') values.price = run.price;
  if (typeof run.blockPrice === 'number') values.blockPrice = run.blockPrice;
  if (typeof run.kwhBlock === 'number') values['yours.kwhBlock'] = run.kwhBlock;
  return { values, life: Math.max(1, run.days + planValues['yours.turn']) }; // a run in and out the same day: a day (the review)
}

const monthOf = (values, ctx) => grow(inputsOf(values, 'yours', ctx));
// The crop's share of the plan's room: its own blocks in the plan over the room's (a plan without them: the run's share of
// its room's).
const shareOf = (m, run) => (m.cropBlocks > 0 && m.planValues['yours.blocks'] > 0 ? m.cropBlocks / m.planValues['yours.blocks']
  : run.roomBlocks > 0 ? run.blocks / run.roomBlocks : 1);

// → { plan: the plan's month, run: the run's month at its own figures, diff: run − plan (RM a month), planValues, runValues }.
export function runMonths(plan, run, todayValues, todayCtx, crop) {
  const p = planValuesOf(plan, todayValues, todayCtx, crop, run);
  const r = runValuesOf(p.values, run, p.cropBlocks);
  const planMonth = monthOf(p.values, p.ctx);
  const runMonth = monthOf(r.values, { ...p.ctx, life: r.life });
  return {
    plan: planMonth, run: runMonth, diff: runMonth.profit - planMonth.profit, planValues: p.values, runValues: r.values, life: r.life, ctx: p.ctx,
    cropBlocks: p.cropBlocks, missing: p.missing,
  };
}

// The yield's label: per good block when the run's loss is measured, else over every block put in (stage 1's rule).
const yieldLabel = (run) => (run.measured ? 'Yield per good block' : 'Yield per block put in');
const planYield = (v, run) => (run.measured ? v['yours.yieldG'] : v['yours.yieldG'] * (1 - v['yours.loss'] / 100));

// Each figure the run has, the plan's profit with only it taken from the run, less the plan's (7.5). → [{ key, label,
// delta, planText, runText }], the biggest |delta| first, those under RM 0.005 left out.
// months: runMonths' when the caller has it (worked out once a repaint, the review).
export function gapsOf(plan, run, todayValues, todayCtx, crop, { months = null } = {}) {
  const m = months ?? runMonths(plan, run, todayValues, todayCtx, crop);
  const { planValues: pv, runValues: rv, ctx } = m;
  const base = m.plan.profit;
  const only = (keys, life) => monthOf({ ...pv, ...Object.fromEntries(keys.map((k) => [k, rv[k]])) }, life ? { ...ctx, life } : ctx).profit - base;
  const g = (key, label, delta, planText, runText) => ({ key, label, delta, planText, runText });
  // the crop's blocks, as the table says them (the month moves with the room's)
  const out = [g('blocks', 'Blocks put in', only(['yours.blocks']), grouped(Math.round(pv['yours.blocks'] * shareOf(m, run)), 0), grouped(run.blocks, 0))];
  const yieldText = (v) => figureText('yours.yieldG', v);
  if (run.measured) {
    out.push(g('loss', 'Blocks lost', only(['yours.loss']), figureText('yours.loss', pv['yours.loss']), figureText('yours.loss', rv['yours.loss'])));
    out.push(g('yield', yieldLabel(run), only(['yours.yieldG']), yieldText(pv['yours.yieldG']), yieldText(rv['yours.yieldG'])));
  } else {
    out.push(g('yield', yieldLabel(run), only(['yours.yieldG', 'yours.loss']), yieldText(planYield(pv, run)), yieldText(rv['yours.yieldG'])));
  }
  if (typeof run.price === 'number') out.push(g('price', 'Selling price', only(['price']), perKgText(pv.price), `${perKgText(rv.price)}${NB}a${NB}kg`));
  if (typeof run.blockPrice === 'number') out.push(g('blockPrice', 'Block price', only(['blockPrice']), figureText('blockPrice', pv.blockPrice), figureText('blockPrice', rv.blockPrice)));
  if (typeof run.kwhBlock === 'number') out.push(g('kwh', 'Electricity per block', only(['yours.kwhBlock']), figureText('yours.kwhBlock', pv['yours.kwhBlock']), figureText('yours.kwhBlock', rv['yours.kwhBlock'])));
  out.push(g('days', 'Days in the room', only([], m.life), plural(daysIn(pv), 'day', 'days'), plural(run.days, 'day', 'days')));
  return out.filter((x) => Math.abs(x.delta) >= 0.005).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// The table's rows (7.5): [{ key, label, plan, run, sub, tone }]. The plan's blocks and kg its own of the crop (a plan
// without them: this crop's share of the room's); errors: the plans view's (a part not read says so in its rows, the month at
// the plan's figure).
const PART_WORDS = { sales: 'Sales', batches: 'Batches', energy: 'the electricity' };
export function runRows(plan, run, todayValues, todayCtx, crop, { months = null, errors = {} } = {}) {
  const m = months ?? runMonths(plan, run, todayValues, todayCtx, crop);
  const pv = m.planValues;
  const share = shareOf(m, run);
  const lostOf = (v) => Math.round((v['yours.blocks'] * share * v['yours.loss']) / 100);
  const lossText = (pct, n) => `${figureText('yours.loss', pct)} (${grouped(n, 0)})`;
  const row = (key, label, planText, runText, sub = null, tone = null) => ({ key, label, plan: planText, run: runText, sub, tone });
  const notRead = (part) => (errors[part] ? `Couldn't read ${PART_WORDS[part]} just now` : null);
  const or = (part, text) => notRead(part) ?? text;
  const warnIf = (part) => (errors[part] ? 'warn' : null);
  return [
    row('blocks', 'Blocks put in', grouped(Math.round(pv['yours.blocks'] * share), 0), grouped(run.blocks, 0)),
    row('loss', 'Blocks lost', lossText(pv['yours.loss'], lostOf(pv)), run.measured ? lossText(Math.round((run.lost / run.blocks) * 1000) / 10, run.lost) : or('batches', 'In the yield'), null, warnIf('batches')),
    row('yield', yieldLabel(run), figureText('yours.yieldG', planYield(pv, run)), figureText('yours.yieldG', m.runValues['yours.yieldG'])),
    row('kg', 'kg picked', kgText(planKgOf(pv) * share), kgText(run.kg)),
    row('price', 'Selling price', `${perKgText(pv.price)}${NB}a${NB}kg`, typeof run.price === 'number' ? `${perKgText(run.price)}${NB}a${NB}kg` : or('sales', 'No sales reached it'),
      run.sold ? `${kgText(run.sold.kg)} sold` : null, warnIf('sales')),
    row('blockPrice', 'Block price', figureText('blockPrice', pv.blockPrice), typeof run.blockPrice === 'number' ? figureText('blockPrice', run.blockPrice) : or('batches', 'No price'), null, warnIf('batches')),
    row('kwh', 'Electricity per block', figureText('yours.kwhBlock', pv['yours.kwhBlock']),
      typeof run.kwhBlock === 'number' ? figureText('yours.kwhBlock', run.kwhBlock) : or('energy', run.kwhPending ? 'Working out…' : 'Not measured'), null, warnIf('energy')),
    row('days', 'Days in the room', plural(daysIn(pv), 'day', 'days'), plural(run.days, 'day', 'days')),
    row('profit', 'Profit a month at these figures', moneyText(m.plan.profit), moneyText(m.run.profit)),
  ];
}

// "RM 170.31 a month under the plan." (no colour: under a plan is not a fault), "… over the plan.", "The same as the plan."
export function againstLine(diff) {
  if (cents(diff) === 0) return 'The same as the plan.';
  return `${moneyText(Math.abs(diff))} a${NB}month ${diff > 0 ? 'over' : 'under'} the plan.`;
}

// The two biggest gaps, each on its own.
export function gapsLine(gaps) {
  if (!gaps.length) return 'Nothing moved it more than a sen.';
  const clause = (x) => `${x.label} ${x.runText} against ${x.planText} planned, ${signed(x.delta)} a${NB}month`;
  return keepTogether(`What made the difference, each on its own: ${gaps.slice(0, 2).map(clause).join('; ')}.`);
}

// Where the plan came from.
export const planLine = (plan) => (!plan || plan.before || !plan.figures
  ? "Started before plans were kept: compared with today's figures."
  : `Plan saved ${dateText(plan.at)} ${farmTime(plan.at)} with that day's figures.`);

// A mixed run, a partial one, a plan missing figures: one line each, or null.
export const mixedLine = (run, room) => (run.mixed?.length
  ? `${room} also grew ${run.mixed.map(cropShortName).join(' and ')} in this run; its electricity is shared by every block.` : null);
export const partialLine = (run) => (run.partial ? `Counted from ${dateText(run.from)}, the day its blocks went in.` : null);
export const missingLine = (keys) => (keys.length
  ? `${keys.map((k) => figureOf(k).label).join(', ')}: today's ${keys.length === 1 ? 'figure' : 'figures'} (not in the plan).` : null);

// A run in progress (7.6): current the plans view's, planValues the plan's (or today's). → { day, days, kg, planKg, planTotal,
// firstDay }, or null with no day (a partial run without its block-in day). Equal flushes, each due on its day.
export function progressOf(current, planValues) {
  if (!current || current.day === null || current.day === undefined) return null;
  const v = planValues;
  const flushes = Math.max(1, v['yours.flushes']);
  let due = 0;
  for (let n = 1; n <= flushes; n++) if (v['yours.first'] + v['yours.interval'] * (n - 1) <= current.day) due += 1;
  // the plan's kg at this run's blocks of the crop (a mixed run's plan saved the room's)
  const planTotal = planKgOf(v) * (current.blocks > 0 && v['yours.blocks'] > 0 ? current.blocks / v['yours.blocks'] : 1);
  return { day: current.day, days: daysIn(v), kg: current.kg, planKg: (planTotal * due) / flushes, planTotal, firstDay: v['yours.first'] };
}

export function progressLine(p) {
  const so = `${kgText(p.kg)} so far`;
  if (p.day > p.days) return `Day ${p.day}, past the plan's ${plural(p.days, 'day', 'days')}: ${so}, the plan ${kgText(p.planTotal)}.`;
  const head = `Day ${p.day} of ${p.days}`;
  if (!(p.kg >= 0.05)) {
    return p.planKg > 0 ? `${head}: nothing picked yet; the plan by now ${kgText(p.planKg)}.` : `${head}: nothing picked yet; the plan's first harvest is on day ${p.firstDay}.`;
  }
  return `${head}: ${so}, the plan by now ${kgText(p.planKg)}.`;
}

// ---- The section's words (7.8) ----
export const PAST_SHOWN = 5; // the newest finished runs shown; the rest in a fold of their own

// A finished run's fold title: its days, its month at its figures and against the plan.
export function runTitle(run, months) {
  const against = cents(months.diff) === 0 ? 'the same as the plan'
    : `${moneyText(Math.abs(months.diff))} ${months.diff > 0 ? 'over' : 'under'} the plan`;
  return `${dateText(run.from)} – ${dateText(run.to)} · ${moneyText(months.run.profit)} a${NB}month at its figures · ${against}`;
}
export const leftOutLine = (n) => (n > 0
  ? `${n} ${n === 1 ? 'run' : 'runs'} left out: recorded without the day ${n === 1 ? 'its' : 'their'} blocks went in.` : null);
export const emptyLine = ({ crop, room, current }) => (current
  ? `No finished run of ${cropShortName(crop)} in ${room} yet.`
  : `No finished runs of ${cropShortName(crop)} in ${room} yet. When blocks go in on its Crop tab, that day's figures are saved as the run's plan.`);
export const olderText = (n) => `${n} older ${n === 1 ? 'run' : 'runs'}`;
// An open partial run without its block-in day.
export const noDayLine = (current) => `Recorded from ${dateText(current.from)}; give the day its blocks went in to compare it.`;
