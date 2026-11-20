// What moves profit most (spec 2026-11-12-economics-stage-2-design.md 5): Your container's profit a month with each of its
// figures and the shared ones set to its low then its high, every other figure held. A research figure swings over its
// research range; yours, your runs', your sales', your costs' and equipment's, Settings' and the simulator's (and one typed,
// not yet saved) by 20 % each way; whole figures rounded outwards; every figure within its limits. A flush more or less brings
// its share of the yield (equal flushes). The register's write-off follows a swung part (the model's register scale). Pure.
//   SWING · TOP · DECISIONS · rangeOf · swings · swingText · swingEnds · stillLine

import { grow, inputsOf, asRegister } from './economics-model.js';
import { figureOf, figureLabel, EQUIPMENT_KEYS } from './economics-defaults.js';
import { arrowText, figureText } from './economics-math.js';
import { moneyText } from './costs-math.js';

export const SWING = 0.2;
// The owner's decisions, not risks (the owner, 2026-11-12: "Set these first"): what the room costs to rent, how many work the
// farm and what each costs, the months the equipment is written off over, and what the equipment costs. They sit apart from
// the chart, which ranks the rest.
export const DECISIONS = ['yours.rent', 'yours.workers', 'yours.workerMonth', 'life', ...EQUIPMENT_KEYS];
export const TOP = 8; // the rows shown before Show all
const NB = '\u00a0';
const cents = (v) => Math.sign(v) * Math.round(Math.abs(v) * 100);
const signed = (v) => (cents(v) > 0 ? `+${moneyText(v)}` : moneyText(v));

// f: a view figure ({ key, source, research }); value: the value the sums use; typed: one typed and not yet saved (yours).
// → { low, high, how: 'research' | 'twenty' }.
export function rangeOf(f, value, { typed = false } = {}) {
  const def = figureOf(f.key);
  let low;
  let high;
  let how = 'twenty';
  if (!typed && f.source === 'research' && f.research && Number.isFinite(f.research.low) && Number.isFinite(f.research.high)) {
    [low, high, how] = [f.research.low, f.research.high, 'research'];
  } else {
    [low, high] = [value * (1 - SWING), value * (1 + SWING)];
    if (def.whole) [low, high] = [Math.floor(low), Math.ceil(high)];
  }
  const clamp = (v) => Math.max(def.min, Math.min(def.max, v));
  return { low: clamp(low), high: clamp(high), how };
}

// figures: the view's; values: the page's (typing included); ctx: the view's context; typed: the keys typed and not saved.
// → { base, rows: [{ key, low, high, how, atLow, atHigh, down, up, spread }] biggest spread first (as shown, to the sen; ties
// in the figures' order), decisions: [the same, the DECISIONS' rows], still: [the other keys whose spread shows as RM 0.00] }.
export function swings(figures, values, ctx = {}, { typed = [] } = {}) {
  // the register scaled only when the figures now are the register's: else the model's own rule, as the tiles (the review)
  const sctx = asRegister(values, ctx) ? { ...ctx, register: { ...ctx.register, scale: true } } : ctx;
  const profit = (v) => grow(inputsOf(v, 'yours', sctx)).profit;
  const base = profit(values);
  const at = (key, v) => (key === 'yours.flushes'
    ? { ...values, [key]: v, 'yours.yieldG': (values['yours.yieldG'] * v) / values[key] } // a flush brings its share of the yield
    : { ...values, [key]: v });
  const rows = [];
  const decisions = [];
  const still = [];
  figures.forEach((f, order) => {
    if ((f.way !== 'shared' && f.way !== 'yours') || f.key === 'yours.blocks') return;
    const value = values[f.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const { low, high, how } = rangeOf(f, value, { typed: typed.includes(f.key) });
    const atLow = profit(at(f.key, low)) - base;
    const atHigh = profit(at(f.key, high)) - base;
    const down = Math.min(atLow, atHigh);
    const up = Math.max(atLow, atHigh);
    const row = { key: f.key, low, high, how, atLow, atHigh, down, up, spread: up - down, order };
    if (DECISIONS.includes(f.key)) decisions.push(row); // every one, moving or not: the owner sets them
    else if (cents(up - down) === 0) still.push(f.key);
    else rows.push(row);
  });
  const bySpread = (a, b) => cents(b.spread) - cents(a.spread) || a.order - b.order;
  const clean = (list) => list.sort(bySpread).map(({ order, ...r }) => r);
  return { base, rows: clean(rows), decisions: clean(decisions), still };
}

// A row's words: "Selling price RM 40.00 → 60.00 a kg: −RM 2,550.50 to +RM 2,550.50 a month" (the change at the low, then
// at the high). type: the room's (the building's label follows it).
export function swingText(row, type = 'container') {
  const flush = row.key === 'yours.flushes';
  const range = arrowText(row.key, row.low, row.high, { unit: !flush });
  return `${figureLabel(row.key, type)} ${range}${flush ? ' (the yield with them)' : ''}: ${signed(row.atLow)} to ${signed(row.atHigh)} a${NB}month`;
}

// A row's ends for its bar (the UI check: the fall at the left, the rise at the right, each with the figure that gives it):
// { down: { text, at }, up: { text, at } }.
export function swingEnds(row) {
  const fall = row.atLow <= row.atHigh ? ['atLow', 'low'] : ['atHigh', 'high'];
  const rise = fall[0] === 'atLow' ? ['atHigh', 'high'] : ['atLow', 'low'];
  const end = ([change, value]) => ({ text: signed(row[change]), at: figureText(row.key, row[value]) });
  return { down: end(fall), up: end(rise) };
}

// The figures that move nothing at these figures. With labour as people (workers figures), the hourly cost of the other ways
// is no figure of Your container's and is left out, and the minutes a block are said to set only the hours (the UI check).
export function stillLine(keys, type = 'container', { people = false } = {}) {
  const shown = people ? keys.filter((k) => k !== 'wage' && k !== 'yours.labourMin') : keys;
  const out = [];
  if (shown.length) out.push(`Not moving it at these figures: ${shown.map((k) => `“${figureLabel(k, type)}”`).join(', ')}.`);
  if (people && keys.includes('yours.labourMin')) out.push(`${figureLabel('yours.labourMin', type)} sets only the hours needed: labour is counted as workers.`);
  return out.length ? out.join(' ') : null;
}
