// The costs' figures (spec 2026-11-05-costs-design.md 2.1 and 4), pure: a monthly item's charges, the run of a room on a
// day, a run's block-days, a shared cost's split; the period's lines and figures (part 2). Dates are 'YYYY-MM-DD', the
// farm's days; months 'YYYY-MM'. RM to 2 places at each sum.

import { addDays, daysBetween } from './task-rules.js';
import { round, costPerKgOf, valueOf } from './harvest-math.js';

export const CATEGORIES = ['blocks', 'spawn', 'labour', 'rent', 'repairs', 'transport', 'packaging', 'utilities', 'other'];
export const CATEGORY_LABELS = {
  blocks: 'Blocks', spawn: 'Spawn', labour: 'Labour', rent: 'Rent', repairs: 'Repairs', transport: 'Transport',
  packaging: 'Packaging', utilities: 'Utilities', other: 'Other',
};
// The bills whose measured part the app already counts (section 4: the top-up).
export const BILLS = ['electricity', 'water'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthOf = (date) => date.slice(0, 7);
export const firstDayOf = (month) => `${month}-01`;
export function lastDayOf(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
export const monthName = (month) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`; // "Nov 2026"
export const dayMonth = (date) => `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`; // "3 Oct"
export const isBill = (cost) => cost.category === 'utilities' && BILLS.includes(cost.utility);

// The day a monthly item charges in `month`: the day of its date, or the month's last day when the month is shorter.
export function chargeDate(date, month) {
  const day = Math.min(Number(date.slice(8)), Number(lastDayOf(month).slice(8)));
  return `${month}-${String(day).padStart(2, '0')}`;
}

// A cost's charges in [from, to], none after today: [{ cost, date }]. A one-off charges on its date; a monthly item once a
// month from its date's month through repeatUntil (or on).
export function chargesOf(cost, from, to, today) {
  const end = to < today ? to : today;
  if (cost.repeat !== 'monthly') return cost.date >= from && cost.date <= end ? [{ cost, date: cost.date }] : [];
  const out = [];
  const last = cost.repeatUntil && cost.repeatUntil < monthOf(end) ? cost.repeatUntil : monthOf(end);
  for (let m = monthOf(cost.date > from ? cost.date : from); m <= last; m = addMonths(m, 1)) {
    const date = chargeDate(cost.date, m);
    if (date >= from && date <= end && date >= cost.date) out.push({ cost, date });
  }
  return out;
}

// A run is { id, roomId, startDate, endDate (null while open), blocks }: an open run reaches today.
export const runEnd = (run, today) => run.endDate ?? today;

// The room's run open on `date`: of those whose days hold it, the one started last (the day one ends and the next starts is
// the new one's), or null.
export function runOn(runs, roomId, date, today) {
  let found = null;
  for (const r of runs) {
    if (r.roomId !== roomId || r.startDate > date || date > runEnd(r, today)) continue;
    if (!found || r.startDate > found.startDate || (r.startDate === found.startDate && r.id > found.id)) found = r;
  }
  return found;
}

// The run's blocks × its days open in [from, to], its first and last day both counted.
export function blockDays(run, from, to, today) {
  const a = run.startDate > from ? run.startDate : from;
  const end = runEnd(run, today);
  const b = end < to ? end : to;
  return b < a ? 0 : run.blocks * (daysBetween(a, b) + 1);
}

// `amount` split over the weights to 2 places, the last taking the remainder so the shares sum to it.
export function split(amount, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let left = amount;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return round(left, 2);
    const share = round((amount * w) / total, 2);
    left -= share;
    return share;
  });
}

// An Inventory kind's cost category and line name (the contract's kinds; 'blocks' never comes: Batches wins).
export const INVENTORY_LINES = {
  spawn: ['spawn', 'Spawn'], bags: ['other', 'Bags'], chemical: ['other', 'Chemicals'], packaging: ['packaging', 'Packaging'],
  other: ['other', 'Other supplies'],
};
const rm = (v) => `RM ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sum = (list, key) => round(list.reduce((s, x) => s + (x[key] ?? 0), 0), 2);
const note = (kind, text, runId = null) => ({ kind, text, ...(runId === null ? {} : { runId }) });
const WHAT = { electricity: 'electricity', water: 'water' };

// The measured kWh and litres of every room over [from, to] (bills' periods may reach before the period on show).
function measuredOver(from, to, data) {
  let kWh = 0;
  let waterL = 0;
  let pending = false;
  for (const days of data.usage.values()) {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const day = days.get(d);
      if (!day) continue;
      if (day.pending) pending = true;
      else {
        kWh += day.kWh;
        waterL += day.waterL;
      }
    }
  }
  return { kWh: round(kWh, 3), waterL: round(waterL, 3), pending };
}

// A bill's top-up (section 4): the bill − the measured cost of that utility over its period, shared when over 0; a note when
// the measured cost is higher, or when the bill counts in full (days not kept, no water price).
function topUp(bill, data) {
  const what = WHAT[bill.utility];
  const line = (amount) => ({
    key: `unmeasured-${bill.utility}`, category: 'utilities', label: `Unmeasured ${what}`, source: 'bill', amount,
    roomId: null, runId: null, shared: true, costId: bill.id,
  });
  if (bill.periodFrom < data.keptFrom) {
    return { line: line(bill.amount), note: note('bill-not-kept', `The ${what} bill of ${dayMonth(bill.date)} covers days before the energy kept: all of it counts`) };
  }
  if (bill.utility === 'water' && data.prices.water === null) {
    return { line: line(bill.amount), note: note('no-water-price', 'No water price is set: the water bill counts in full') };
  }
  const m = measuredOver(bill.periodFrom, bill.periodTo, data);
  if (m.pending) return { pending: true };
  const measured = bill.utility === 'electricity' ? round(m.kWh * data.prices.electricity, 2) : round((m.waterL / 1000) * data.prices.water, 2);
  const diff = round(bill.amount - measured, 2);
  if (diff > 0) return { line: line(diff) };
  return { note: note('bill-below', `Measured ${rm(measured)} is above the ${what} bill of ${rm(bill.amount)}: the estimate runs high`) };
}

// Each room's measured electricity and water over [from, to], one line per room and run (null: no run that day).
function measuredLines(from, to, data) {
  const lines = [];
  let pending = false;
  let notKept = false;
  for (const [roomId, days] of data.usage) {
    const groups = new Map();
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (d < data.keptFrom) {
        notKept = true;
        continue;
      }
      const day = days.get(d);
      if (!day) continue;
      if (day.pending) {
        pending = true;
        continue;
      }
      const runId = runOn(data.runs, roomId, d, data.today)?.id ?? null;
      const g = groups.get(runId) ?? { kWh: 0, waterL: 0 };
      g.kWh += day.kWh;
      g.waterL += day.waterL;
      groups.set(runId, g);
    }
    for (const [runId, g] of groups) {
      const at = { roomId, runId, shared: false };
      lines.push({ key: 'electricity', category: 'utilities', label: 'Electricity', source: 'measured', amount: round(round(g.kWh, 3) * data.prices.electricity, 2), ...at });
      if (data.prices.water !== null) {
        lines.push({ key: 'water', category: 'utilities', label: 'Water', source: 'measured', amount: round((round(g.waterL, 3) / 1000) * data.prices.water, 2), ...at });
      }
    }
  }
  const notes = notKept ? [note('energy-not-kept', `Energy before ${dayMonth(data.keptFrom)} ${data.keptFrom.slice(0, 4)} is not kept: not counted`)] : [];
  return { lines, notes, pending };
}

// Every cost line of [from, to]: { key, category, label, source ('manual' | 'batches' | 'inventory' | 'measured' | 'bill'),
// amount, roomId, runId, shared, date?, costId? }, with the notes of what is missing and pending (a day not worked out).
export function linesOf(from, to, data) {
  const lines = [];
  const notes = [];
  let pending = false;
  const roomOf = (id) => (id !== null && data.rooms.has(id) ? id : null);
  for (const c of data.costs) {
    for (const { date } of chargesOf(c, from, to, data.today)) {
      if (isBill(c)) {
        const t = topUp(c, data);
        if (t.pending) pending = true;
        if (t.line) lines.push({ ...t.line, date });
        if (t.note) notes.push(t.note);
        continue;
      }
      const roomId = roomOf(c.roomId);
      const runId = roomId === null ? null : c.repeat === 'monthly' ? (runOn(data.runs, roomId, date, data.today)?.id ?? null) : c.runId;
      lines.push({ key: c.category, category: c.category, label: CATEGORY_LABELS[c.category], source: 'manual', amount: c.amount, date, roomId, runId, shared: roomId === null, costId: c.id });
    }
  }
  for (const b of data.batches) {
    if (b.date < from || b.date > to) continue;
    const roomId = roomOf(b.roomId);
    if (b.cost === null) {
      notes.push(note('unpriced-batch', `${data.rooms.get(roomId) ?? 'A batch'}’s blocks of ${dayMonth(b.date)} have no price`, b.runId));
      continue;
    }
    lines.push({ key: 'blocks-batches', category: 'blocks', label: 'Blocks', source: 'batches', amount: b.cost, date: b.date, roomId, runId: b.runId, shared: roomId === null && b.runId === null });
  }
  for (const p of data.purchases) {
    if (p.date < from || p.date > to) continue;
    if (p.total === null) {
      notes.push(note('no-unit-cost', `${p.name} bought ${dayMonth(p.date)} has no unit cost`));
      continue;
    }
    const [category, label] = INVENTORY_LINES[p.kind] ?? INVENTORY_LINES.other;
    lines.push({ key: `inventory-${p.kind in INVENTORY_LINES ? p.kind : 'other'}`, category, label, source: 'inventory', amount: p.total, date: p.date, roomId: null, runId: null, shared: true });
  }
  const m = measuredLines(from, to, data);
  if (m.pending) pending = true;
  return { lines: [...lines, ...m.lines], notes: [...notes, ...m.notes], pending };
}

// The lines grouped by key: [{ key, label, source, category, amount, share (whole % of the costs) }], biggest first.
function categoryLines(lines, total) {
  const by = new Map();
  for (const l of lines) {
    const g = by.get(l.key) ?? { key: l.key, label: l.label, source: l.source, category: l.category, amount: 0 };
    g.amount = round(g.amount + l.amount, 2);
    by.set(l.key, g);
  }
  return [...by.values()].filter((g) => g.amount > 0) // a room that used nothing: no 0 line
    .map((g) => ({ ...g, share: total > 0 ? Math.round((g.amount / total) * 100) : null }))
    .sort((a, b) => b.amount - a.amount);
}

// What was picked and not yet sold: { kg, value (at the crop prices, null when none is priced) }, or null.
function unsoldOf(harvests, picked, sold, cropYield) {
  if (!(picked > sold)) return null;
  const kg = round(picked - sold, 2);
  const value = valueOf(harvests, cropYield);
  return { kg, value: value === null ? null : round((value * kg) / picked, 2) };
}

const PARTS = ['blocks', 'energy', 'water', 'own', 'shared'];
const emptyPart = () => ({ blocks: 0, energy: 0, water: 0, own: 0, shared: 0, income: 0, kgHarvested: 0, kgSold: 0, byCategory: {} });
const partOf = (l) => (l.source === 'batches' ? 'blocks' : l.source === 'measured' ? (l.key === 'electricity' ? 'energy' : 'water') : 'own');

// The figures of [from, to] (section 4): { from, to, lines, byCategory, income, costs, profit, kgHarvested, kgSold, costPerKg,
// profitPerKg, unsold, runs (Map run id → { blocks, energy, water, own, shared, income, kgHarvested, kgSold, byCategory }),
// notes [{ kind, text, runId? }], pending }. While pending: costs, profit and the per-kg figures null.
export function figuresOf(from, to, data) {
  const { lines, notes, pending } = linesOf(from, to, data);
  const runs = new Map();
  const part = (id) => {
    if (!runs.has(id)) runs.set(id, emptyPart());
    return runs.get(id);
  };
  for (const l of lines) {
    if (l.shared || l.runId === null) continue;
    const p = part(l.runId);
    const k = partOf(l);
    p[k] = round(p[k] + l.amount, 2);
    if (k !== 'energy' && k !== 'water') p.byCategory[l.category] = round((p.byCategory[l.category] ?? 0) + l.amount, 2);
  }
  const sharedTotal = sum(lines.filter((l) => l.shared), 'amount');
  const open = data.runs.map((r) => ({ id: r.id, w: blockDays(r, from, to, data.today) })).filter((x) => x.w > 0);
  if (sharedTotal > 0 && open.length === 0) notes.push(note('not-shared', `${rm(sharedTotal)} of shared costs not shared: no blocks in`));
  if (sharedTotal > 0 && open.length > 0) {
    split(sharedTotal, open.map((x) => x.w)).forEach((amount, i) => {
      const p = part(open[i].id);
      p.shared = round(p.shared + amount, 2);
    });
  }
  const sales = data.sales.filter((s) => s.date >= from && s.date <= to);
  for (const s of sales) {
    const runId = s.runId ?? (s.roomId === null ? null : runOn(data.runs, s.roomId, s.date, data.today)?.id ?? null);
    if (runId === null) continue;
    const p = part(runId);
    p.income = round(p.income + s.total, 2);
    p.kgSold = round(p.kgSold + s.kg, 2);
  }
  const harvests = data.harvests.filter((h) => h.date >= from && h.date <= to);
  for (const h of harvests) {
    if (h.runId === null) continue;
    const p = part(h.runId);
    p.kgHarvested = round(p.kgHarvested + h.kg, 2);
  }
  const costs = sum(lines, 'amount');
  const income = sum(sales, 'total');
  const kgSold = sum(sales, 'kg');
  const kgHarvested = sum(harvests, 'kg');
  const profit = round(income - costs, 2);
  const unsold = unsoldOf(harvests, kgHarvested, kgSold, data.cropYield);
  if (unsold) {
    const about = unsold.value === null ? '' : ` (about ${rm(unsold.value)} at your prices)`;
    notes.unshift(note('unsold', `${unsold.kg.toFixed(1)} kg picked and not yet sold${about}`));
  }
  if (sales.length === 0) notes.push(note('no-sales', 'No sales recorded'));
  if (data.prices.water === null && !notes.some((n) => n.kind === 'no-water-price')) notes.push(note('no-water-price', 'No water price is set: energy is electricity only'));
  return {
    from, to, lines, byCategory: categoryLines(lines, costs), income, kgHarvested, kgSold, unsold, runs,
    costs: pending ? null : costs,
    profit: pending ? null : profit,
    costPerKg: pending || kgHarvested === 0 ? null : costPerKgOf(costs, kgHarvested),
    profitPerKg: pending || kgSold === 0 ? null : costPerKgOf(profit, kgSold),
    notes: notes.filter((n, i) => notes.findIndex((x) => x.text === n.text) === i),
    pending,
  };
}

// A run's whole figures: its parts summed over every month from its start to today (sales and costs tied to it may come after
// it ends). figs(month) → figuresOf's result for that month. → { parts, byCategory [{ category, amount }] ('shared' last),
// income, kgHarvested, kgSold, costs, profit, costPerKg, profitPerKg, notes, pending }.
export function runTotals(run, figs, today) {
  const t = emptyPart();
  const notes = [];
  let pending = false;
  for (let m = monthOf(run.startDate); m <= monthOf(today); m = addMonths(m, 1)) {
    const f = figs(m);
    pending ||= f.pending;
    notes.push(...f.notes.filter((n) => n.runId === run.id || (n.kind === 'energy-not-kept' && m === monthOf(run.startDate))));
    const p = f.runs.get(run.id);
    if (!p) continue;
    for (const k of [...PARTS, 'income', 'kgHarvested', 'kgSold']) t[k] = round(t[k] + p[k], 2);
    for (const [c, v] of Object.entries(p.byCategory)) t.byCategory[c] = round((t.byCategory[c] ?? 0) + v, 2);
  }
  const costs = round(PARTS.reduce((s, k) => s + t[k], 0), 2);
  const profit = round(t.income - costs, 2);
  const byCategory = [
    ...CATEGORIES.filter((c) => t.byCategory[c]).map((c) => ({ category: c, amount: t.byCategory[c] })),
    ...(t.shared > 0 ? [{ category: 'shared', amount: t.shared }] : []),
  ];
  return {
    parts: Object.fromEntries(PARTS.map((k) => [k, t[k]])), byCategory, income: t.income, kgHarvested: t.kgHarvested,
    kgSold: t.kgSold,
    costs: pending ? null : costs,
    profit: pending ? null : profit,
    costPerKg: pending || t.kgHarvested === 0 ? null : costPerKgOf(costs, t.kgHarvested),
    profitPerKg: pending || t.kgSold === 0 ? null : costPerKgOf(profit, t.kgSold),
    notes: notes.filter((n, i) => notes.findIndex((x) => x.text === n.text) === i),
    pending,
  };
}

// The contract's summary (GET /api/costs/summary): { total, byCategory [{ category, amount }] (the measured energy and water
// apart), energy, water, income, profit, profitPerKg }.
export function summaryOf(f) {
  const by = {};
  for (const l of f.lines) if (l.source !== 'measured') by[l.category] = round((by[l.category] ?? 0) + l.amount, 2);
  const measured = (key) => sum(f.lines.filter((l) => l.source === 'measured' && l.key === key), 'amount');
  return {
    total: f.costs, byCategory: CATEGORIES.filter((c) => by[c]).map((c) => ({ category: c, amount: by[c] })),
    energy: measured('electricity'), water: measured('water'), income: f.income, profit: f.profit, profitPerKg: f.profitPerKg,
  };
}
