// The Costs page's pure parts (spec 2026-11-05-costs-design.md 6): the one formatter for RM (a loss with a leading "−", the
// One Format Rule), the month words, the month tiles, the rows of By category, Entries, Monthly items and Runs, a run's
// breakdown and the 12 months' profit bars. Every formatter shows a dash for a missing figure. A number keeps its unit at a
// wrap (a no-break space, the Units Rule); kg and cost per kg come from Harvest's formatter.

import { kgText, costKgText } from './harvest-math.js';
import { cropShortName } from './crops.js';
import { DOT } from './text-math.js';
import { niceScale } from './usage-math.js';

const NB = ' ';
const DASH = '—';
const MINUS = '−';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FARM_OFFSET_MS = 8 * 3_600_000; // the farm's time is UTC+8 all year
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const grouped = (n, places) => n.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });

// "RM 1,240.50", "−RM 1,240.50".
export function moneyText(v) {
  if (!finite(v)) return DASH;
  const t = `RM${NB}${grouped(Math.abs(v), 2)}`;
  return v < 0 ? `${MINUS}${t}` : t;
}
// A cost or profit per kg: Harvest's rule (never a false RM 0.00), a loss with a "−".
export const perKgText = (v) => (!finite(v) ? DASH : v < 0 ? `${MINUS}${costKgText(-v)}` : costKgText(v));
const axisMoney = (v) => `${v < 0 ? MINUS : ''}RM${NB}${grouped(Math.abs(v), 0)}`;

export const monthTitle = (month) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`; // "November 2026"
const monthShort = (month) => `${MONTHS[Number(month.slice(5)) - 1].slice(0, 3)} ${month.slice(0, 4)}`; // "Nov 2026"
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
export function monthsBetween(a, b) {
  const out = [];
  for (let m = a; m <= b; m = addMonths(m, 1)) out.push(m);
  return out;
}
const dayText = (date) => `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1].slice(0, 3)}`; // "3 Nov"
const farmDay = (ms) => new Date(ms + FARM_OFFSET_MS).toISOString().slice(0, 10);

const PENDING = 'Working out the energy cost…';

// The month card's tiles (harvest-card.js's tileNodes): [{ label, value, line? }].
export function monthTiles({ pending, tiles: t }) {
  const sold = t.kgSold > 0 ? `${kgText(t.kgSold)} sold` : 'Nothing sold';
  return [
    { label: 'Income', value: moneyText(t.income), line: sold },
    pending ? { label: 'Costs', value: DASH, line: PENDING } : { label: 'Costs', value: moneyText(t.costs), ...(t.incomplete ? { line: 'Some costs have no price' } : {}) },
    pending ? { label: 'Profit', value: DASH, line: PENDING } : { label: 'Profit', value: moneyText(t.profit), ...(t.profit < 0 ? { line: 'Loss' } : {}) },
    { label: 'Cost per kg', value: perKgText(t.costPerKg), line: t.kgHarvested > 0 ? `${kgText(t.kgHarvested)} picked` : 'Nothing picked' },
    { label: 'Profit per kg', value: perKgText(t.profitPerKg), line: t.kgSold > 0 ? 'per kg sold' : 'Nothing sold yet' },
  ];
}

// Where a line comes from, in a muted line under its name (nothing for one entered here).
export const SOURCE_WORDS = { manual: null, batches: 'from Batches', inventory: 'from Inventory', measured: 'measured', bill: `bill${NB}−${NB}measured` };
export const categoryRows = (list) => list.map((c) => ({
  label: c.label, source: SOURCE_WORDS[c.source] ?? null, amount: moneyText(c.amount), share: finite(c.share) ? `${c.share}${NB}%` : DASH,
}));

const LABELS = {
  blocks: 'Blocks', spawn: 'Spawn', labour: 'Labour', rent: 'Rent', repairs: 'Repairs', transport: 'Transport',
  packaging: 'Packaging', utilities: 'Utilities', other: 'Other',
};
const UTILITY_WORDS = { electricity: 'Electricity bill', water: 'Water bill', other: null };
const nameOf = (c) => c.label ?? LABELS[c.category]; // the server's label, else ours
const whatOf = (c) => [c.utility ? UTILITY_WORDS[c.utility] ?? nameOf(c) : nameOf(c), c.worker, c.note].filter(Boolean).join(DOT);

// An entry of the month: { date, what, whom, amount, monthly }.
export const entryLine = (e) => ({
  date: dayText(e.date), what: whatOf(e), whom: e.roomName ?? 'The farm', amount: moneyText(e.amount), monthly: e.repeat === 'monthly',
});

// A monthly item: { what, whom, amount, since }.
export const repeatingLine = (c) => ({
  what: whatOf(c), whom: c.roomName ?? 'The farm', amount: `${moneyText(c.amount)} a${NB}month`, since: `since ${monthShort(c.date.slice(0, 7))}`,
});

export const RUN_COLUMNS = ['Dates', 'Container', 'Crops', 'Income', 'Costs', 'Profit', 'Profit per kg'];

// A run's row: { dates, room, crops, cells (Income, Costs, Profit, Profit per kg), loss }.
export function runRow(run) {
  const to = run.endedAt === null ? 'now' : dayText(farmDay(run.endedAt));
  return {
    dates: `${dayText(farmDay(run.startedAt))}${NB}–${NB}${to}`, room: run.roomName,
    crops: run.crops.map((c) => cropShortName(c.crop)).join(', '),
    cells: [moneyText(run.income), moneyText(run.costs), moneyText(run.profit), perKgText(run.profitPerKg)],
    loss: finite(run.profit) && run.profit < 0,
  };
}

// A run's breakdown under its row: [[label, value]], the parts that are not 0, then income.
export function runParts(run) {
  const p = run.parts;
  return [
    ['Blocks', p.blocks], ['Electricity', p.energy], ['Water', p.water], ['Own costs', p.own], ['Share of shared costs', p.shared],
  ].filter(([, v]) => v > 0).map(([label, v]) => [label, moneyText(v)]).concat([['Income', moneyText(run.income)]]);
}

export const BARS_M = { left: 72, right: 8, top: 10, bottom: 22 };

// The 12 months' profit bars in a width × height box: { bars: [{ month, label, x, y, w, h, loss, pending, shown }], zeroY,
// ticks: [{ y, label }] }. Profits rise from the zero line, losses hang from it; each side scaled by niceScale.
export function profitBars(months, shown, width, height, m = BARS_M) {
  const values = months.map((x) => (finite(x.profit) ? x.profit : 0));
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const up = hi > 0 ? niceScale(hi, 4) : null;
  const down = lo < 0 ? niceScale(-lo, 4) : null;
  const top = up?.max ?? (down ? 0 : 1);
  const bottom = down?.max ?? 0;
  const plotH = height - m.top - m.bottom;
  const y = (v) => m.top + ((top - v) / (top + bottom)) * plotH;
  const slot = (width - m.left - m.right) / Math.max(1, months.length);
  const w = Math.max(2, slot * 0.64);
  const bars = months.map((x, i) => {
    const v = values[i];
    const [y0, y1] = [y(0), y(v)];
    return {
      month: x.month, label: MONTHS[Number(x.month.slice(5)) - 1].slice(0, 3), x: m.left + i * slot + (slot - w) / 2,
      y: Math.min(y0, y1), w, h: Math.max(1, Math.abs(y1 - y0)), loss: v < 0, pending: x.profit === null, shown: x.month === shown,
    };
  });
  const values2 = [...(up?.ticks ?? [0]), ...(down?.ticks.slice(1).map((v) => -v) ?? [])];
  return { bars, zeroY: y(0), ticks: values2.map((v) => ({ y: y(v), label: axisMoney(v) })) };
}
