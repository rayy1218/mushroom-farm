// The costs' figures (spec 2026-11-05-costs-design.md 2.1 and 4), pure: a monthly item's charges, the run of a room on a
// day, a run's block-days, a shared cost's split; the period's lines and figures (part 2). Dates are 'YYYY-MM-DD', the
// farm's days; months 'YYYY-MM'. RM to 2 places at each sum.

import { addDays, daysBetween } from './task-rules.js';
import { round, costPerKgOf, valueOf, unpricedOf } from './harvest-math.js';
import { cell } from './csv.js';
import { cropShortName } from '../web/crops.js';

export const CATEGORIES = ['blocks', 'spawn', 'labour', 'rent', 'repairs', 'transport', 'packaging', 'utilities', 'other'];
export const CATEGORY_LABELS = {
  blocks: 'Blocks', spawn: 'Spawn', labour: 'Labour', rent: 'Rent', repairs: 'Repairs', transport: 'Transport',
  packaging: 'Packaging', utilities: 'Utilities', other: 'Other', equipment: 'Equipment written off',
};
// Every category a line may have: the entered ones and the equipment register's write-off (Money truth; never entered here).
const LINE_CATEGORIES = [...CATEGORIES, 'equipment'];
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

// `amount` split over the weights: every share but the last floored to the whole sen, the last taking the remainder, so the
// shares sum to it and none is negative (rounding 4 × RM 0.005 up would leave the last −RM 0.01).
export function split(amount, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  const shares = weights.slice(0, -1).map((w) => Math.floor(((amount * w) / total) * 100 + 1e-9) / 100);
  return [...shares, round(amount - shares.reduce((s, x) => s + x, 0), 2)];
}

// ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 7) Sales reach runs. A sale line goes to its own run; else its
// room's run open on its day (each only when it grows the line's crop; none: that room's runs that picked its crop lately); else the one run open that day
// growing its crop; else the runs that picked its crop in the SALE_DAYS up to its day, by their kg of it then. → [{ runId, share, how ('run' | 'room' | 'only' | 'picked') }],
// the shares summing to 1; [] when it reaches none (not tied: the month's only).
export const SALE_DAYS = 14;
// The picks by crop, each crop's oldest first, and the runs' ids, made once per data (a month's view asks for every sale).
const PICKS = new WeakMap();
const KNOWN = new WeakMap();
function picksOf(data, crop) {
  if (!PICKS.has(data.harvests)) {
    const by = new Map();
    for (const h of data.harvests) {
      if (!by.has(h.crop)) by.set(h.crop, []);
      by.get(h.crop).push(h);
    }
    for (const list of by.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    PICKS.set(data.harvests, by);
  }
  return PICKS.get(data.harvests).get(crop) ?? [];
}
function knownOf(data) {
  if (!KNOWN.has(data.runs)) KNOWN.set(data.runs, new Set(data.runs.map((r) => r.id)));
  return KNOWN.get(data.runs);
}
// A run grows the crop (a run with no crops given, an older caller's: it does).
const grows = (r, crop) => !r.crops || r.crops.some((c) => c.crop === crop);
export function saleRuns(s, data) {
  const known = knownOf(data);
  if (s.runId !== null && s.runId !== undefined) {
    if (!known.has(s.runId)) return [];
    // its own run, when that run grows its crop (Sales ties a line to its room's run whatever the crop): else the rules below
    if (grows(data.runs.find((r) => r.id === s.runId), s.crop)) return [{ runId: s.runId, share: 1, how: 'run' }];
  }
  const room = s.roomId ?? null;
  if (room !== null) {
    const r = runOn(data.runs, room, s.date, data.today);
    if (r && grows(r, s.crop)) return [{ runId: r.id, share: 1, how: 'room' }];
    // no run open in its room that day (sold after the run ended): that room's runs that picked the crop lately
    const own = picked(s, data, known, room);
    if (own.length) return own;
  }
  const open = data.runs.filter((r) => r.startDate <= s.date && runEnd(r, data.today) >= s.date && (r.crops ?? []).some((c) => c.crop === s.crop));
  if (open.length === 1) return [{ runId: open[0].id, share: 1, how: 'only' }];
  return picked(s, data, known);
}
// The runs that picked the sale's crop in the SALE_DAYS up to its day, by their kg of it.
// room: only that room's picks (null: every room's). The answer is kept per crop, day and room for the data's other sales.
const PICKED = new WeakMap();
function picked(s, data, known, room = null) {
  if (!PICKED.has(data.harvests)) PICKED.set(data.harvests, new Map());
  const memo = PICKED.get(data.harvests);
  const key = `${s.crop}|${s.date}|${room ?? ''}|${data.runs.length}`;
  if (!memo.has(key)) memo.set(key, pickedNow(s, data, known, room));
  return memo.get(key);
}
function pickedNow(s, data, known, room) {
  const from = addDays(s.date, -(SALE_DAYS - 1));
  const list = picksOf(data, s.crop);
  let lo = 0;
  let hi = list.length;
  while (lo < hi) { // the first pick on or after `from`
    const mid = (lo + hi) >> 1;
    if (list[mid].date < from) lo = mid + 1;
    else hi = mid;
  }
  const kg = new Map();
  for (let i = lo; i < list.length && list[i].date <= s.date; i += 1) {
    const h = list[i];
    if (!known.has(h.runId) || (room !== null && h.roomId !== room)) continue;
    kg.set(h.runId, (kg.get(h.runId) ?? 0) + h.kg);
  }
  const total = [...kg.values()].reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [];
  return [...kg].sort((a, b) => a[0] - b[0]).map(([runId, k]) => ({ runId, share: k / total, how: 'picked' }));
}
// A sale line's RM and kg over the runs it reaches (saleRuns), split to the sen and to 0.01 kg, the last run the rest:
// [{ runId, share, how, total, kg }].
export function saleParts(s, data) {
  const runs = saleRuns(s, data);
  if (!runs.length) return [];
  const totals = split(s.total, runs.map((r) => r.share));
  const kgs = split(s.kg, runs.map((r) => r.share));
  return runs.map((r, i) => ({ ...r, total: totals[i], kg: kgs[i] }));
}
// The sale lines in [from, to] that reach no run: { total, kg, count }.
export function untiedOf(from, to, data, crop = null) {
  const lines = data.sales.filter((s) => s.date >= from && s.date <= to && (crop === null || s.crop === crop) && !saleRuns(s, data).length);
  return { total: sum(lines, 'total'), kg: sum(lines, 'kg'), count: lines.length };
}
// ---- end Money truth ----

// An Inventory kind's cost category and line name (the contract's kinds; 'blocks' never comes: Batches wins).
export const INVENTORY_LINES = {
  spawn: ['spawn', 'Spawn'], bags: ['other', 'Bags'], chemical: ['other', 'Chemicals'], packaging: ['packaging', 'Packaging'],
  other: ['other', 'Other supplies'],
};
const rm = (v) => `RM ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sum = (list, key) => round(list.reduce((s, x) => s + (x[key] ?? 0), 0), 2);
const note = (kind, text, runId = null, batchId = null) => ({ kind, text, ...(runId === null ? {} : { runId }), ...(batchId === null ? {} : { batchId }) });
// "Plastic bags", "Lime and Plastic bags", "Lime, Gypsum and Plastic bags".
const listText = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
const qtyWords = (qty, unit) => `${qty.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${unit ?? ''}`.trim();
// The notes once each: the same text for two runs is two notes.
const uniqueNotes = (notes) => {
  const key = (n) => `${n.kind}|${n.text}|${n.runId ?? ''}`;
  return notes.filter((n, i) => notes.findIndex((x) => key(x) === key(n)) === i);
};
// The notes of an input left out of the costs (they are then incomplete, never guessed).
const LEFT_OUT = ['unpriced-batch', 'no-unit-cost'];

// ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 6.1) An equipment item's write-off charges in [from, to], none
// after today: once a month on its bought day's day (the month's last when shorter), from the month bought for its months;
// each (RM − resale) ÷ months floored to the sen, the last the rest. → [{ date, amount }].
export function writeOffCharges(item, from, to, today) {
  const end = to < today ? to : today;
  const total = round(item.amount - item.resale, 2);
  const each = Math.floor((total / item.lifeMonths) * 100 + 1e-9) / 100;
  const out = [];
  const first = monthOf(item.boughtOn);
  const skip = Math.max(0, monthsBetween(first, monthOf(from)) - 1); // the months before the range, without walking them
  for (let i = skip; i < item.lifeMonths; i++) {
    const date = chargeDate(item.boughtOn, addMonths(first, i));
    if (date > end) break;
    if (date < from) continue;
    out.push({ date, amount: i === item.lifeMonths - 1 ? round(total - each * (item.lifeMonths - 1), 2) : each });
  }
  return out;
}
const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

// Each room's measured kWh and litres over [from, to] grouped by the run open that day (null: none): groups [{ roomId, runId,
// kWh, waterL }]; pending when a day is not worked out yet, pendingRuns the runs open on such a day; notKept when the range
// reaches before the energy kept. The month's lines and a bill's measured part both read it, so they round alike.
function measuredGroups(from, to, data) {
  const groups = [];
  const pendingRuns = new Set();
  let pending = false;
  let notKept = false;
  for (const [roomId, days] of data.usage) {
    const byRun = new Map();
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (d < data.keptFrom) {
        notKept = true;
        continue;
      }
      const day = days.get(d);
      if (!day) continue;
      const runId = runOn(data.runs, roomId, d, data.today)?.id ?? null;
      if (day.pending) {
        pending = true;
        if (runId !== null) pendingRuns.add(runId);
        continue;
      }
      const g = byRun.get(runId) ?? { roomId, runId, kWh: 0, waterL: 0 };
      g.kWh += day.kWh;
      g.waterL += day.waterL;
      byRun.set(runId, g);
    }
    groups.push(...byRun.values());
  }
  return { groups, pending, pendingRuns, notKept };
}
// A group's measured cost to 2 places: its electricity, or its water by the m³ (a water price set).
const electricityOf = (g, prices) => round(round(g.kWh, 3) * prices.electricity, 2);
const waterOf = (g, prices) => round((round(g.waterL, 3) / 1000) * prices.water, 2);

// A bill's period: its own, or (an old row) its date's calendar month.
const periodOf = (bill) => ({
  from: bill.periodFrom ?? firstDayOf(monthOf(bill.date)), to: bill.periodTo ?? lastDayOf(monthOf(bill.date)),
});
// The day a bill's top-up lands on (owner 2026-11-05: the month its period ends): its period's last day, today while that is
// still to come.
const landingOf = (bill, today) => {
  const { to } = periodOf(bill);
  return to < today ? to : today;
};

// The measured cost of the bill's utility over its period, taken off the bill. Where another bill of the same utility covers
// the same days, those days' measured cost is shared between the bills by their amounts, so it is taken off once. → the RM
// amount, or null while a day of the period is not worked out yet.
function measuredFor(bill, from, to, data) {
  const costOf = bill.utility === 'electricity' ? electricityOf : waterOf;
  // each room's and run's part rounded as its line is, so the month's lines and top-up sum to the bill to the sen
  const over = (a, b) => {
    const m = measuredGroups(a, b, data);
    return m.pending ? null : round(m.groups.reduce((s, g) => s + costOf(g, data.prices), 0), 2);
  };
  const others = data.costs.filter((o) => o.id !== bill.id && isBill(o) && o.utility === bill.utility)
    .map((o) => ({ amount: o.amount, ...periodOf(o) }))
    .filter((o) => o.from <= to && o.to >= from && o.from >= data.keptFrom); // a bill counted in full takes no measured part
  if (!others.length) return over(from, to);
  // the period cut where the bills covering it change; each piece's measured cost × this bill's share of the covering amounts
  const cuts = [...new Set([from, ...others.flatMap((o) => [o.from, addDays(o.to, 1)])])].filter((d) => d >= from && d <= to).sort();
  let measured = 0;
  for (const [i, a] of cuts.entries()) {
    const b = i + 1 < cuts.length ? addDays(cuts[i + 1], -1) : to;
    const part = over(a, b);
    if (part === null) return null;
    const covering = others.filter((o) => o.from <= a && o.to >= b).reduce((s, o) => s + o.amount, 0);
    measured += (part * bill.amount) / (bill.amount + covering);
  }
  return round(measured, 2);
}

// A bill's top-up (section 4): the bill − the measured cost of that utility over its period, shared when over 0; a note when
// the measured cost is higher, or when the bill counts in full (days not kept, no water price); nothing when they are equal.
function topUp(bill, data) {
  const what = bill.utility;
  const { from, to } = periodOf(bill);
  const line = (amount) => ({
    key: `unmeasured-${bill.utility}`, category: 'utilities', label: `Unmeasured ${what}`, source: 'bill', amount,
    roomId: null, runId: null, shared: true, costId: bill.id,
  });
  if (from < data.keptFrom) {
    const text = `The ${what} bill of ${dayMonth(bill.date)} covers days before the energy kept: all of it counts`;
    return { line: line(bill.amount), note: note('bill-not-kept', text) };
  }
  if (bill.utility === 'water' && data.prices.water === null) {
    return { line: line(bill.amount), note: note('no-water-price', 'No water price is set: the water bill counts in full') };
  }
  const measured = measuredFor(bill, from, to, data);
  if (measured === null) return { pending: true };
  const diff = round(bill.amount - measured, 2);
  if (diff > 0) return { line: line(diff) };
  if (diff === 0) return {};
  const text = `Measured ${rm(measured)} is above the ${what} bill of ${rm(bill.amount)}: the estimate runs high`;
  return { note: note('bill-below', text) };
}

// What an electricity or water bill adds, for its entry: { amount (its Unmeasured line; 0 when the measured cost covers it;
// null while a day of its own period is not worked out), month (where it lands: the month its period ends) }.
export function billTopUp(bill, data) {
  const t = topUp(bill, data);
  return { amount: t.pending ? null : t.line ? t.line.amount : 0, month: monthOf(landingOf(bill, data.today)) };
}

// Each room's measured electricity and water over [from, to], one line per room and run (null: no run that day).
function measuredLines(from, to, data) {
  const m = measuredGroups(from, to, data);
  const lines = [];
  for (const g of m.groups) {
    const at = { roomId: g.roomId, runId: g.runId, shared: false };
    const amount = electricityOf(g, data.prices);
    lines.push({ key: 'electricity', category: 'utilities', label: 'Electricity', source: 'measured', amount, ...at });
    if (data.prices.water !== null) {
      lines.push({ key: 'water', category: 'utilities', label: 'Water', source: 'measured', amount: waterOf(g, data.prices), ...at });
    }
  }
  const kept = `${dayMonth(data.keptFrom)} ${data.keptFrom.slice(0, 4)}`;
  const notes = m.notKept ? [note('energy-not-kept', `Energy before ${kept} is not kept: not counted`)] : [];
  return { lines, notes, pending: m.pending, pendingRuns: m.pendingRuns };
}

// Every cost line of [from, to]: { key, category, label, source ('manual' | 'batches' | 'inventory' | 'measured' | 'bill'),
// amount, roomId, runId, shared, date?, costId? }, with the notes of what is missing; pending when a day is not worked out
// (pendingRuns: the runs open on such a day; sharedPending: a bill's top-up, so every run's share, not known yet).
export function linesOf(from, to, data) {
  const lines = [];
  const notes = [];
  let pending = false;
  let sharedPending = false;
  const roomOf = (id) => (id !== null && data.rooms.has(id) ? id : null);
  for (const c of data.costs) {
    if (isBill(c)) { // its top-up on the day its period ends (today while to come), whatever the bill's date
      const date = landingOf(c, data.today);
      if (date < from || date > to) continue;
      const t = topUp(c, data);
      if (t.pending) pending = sharedPending = true;
      if (t.line) lines.push({ ...t.line, date });
      if (t.note) notes.push(t.note);
      continue;
    }
    for (const { date } of chargesOf(c, from, to, data.today)) {
      const roomId = roomOf(c.roomId);
      // a monthly room item: the run open on each charge's date; a one-off: the run set on save
      const runId = roomId === null ? null
        : c.repeat === 'monthly' ? (runOn(data.runs, roomId, date, data.today)?.id ?? null) : c.runId;
      lines.push({
        key: c.category, category: c.category, label: CATEGORY_LABELS[c.category], source: 'manual', amount: c.amount, date,
        roomId, runId, shared: roomId === null, costId: c.id,
      });
    }
  }
  // ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 5.1) blocks are a cost when they go into a room: a batch row
  // on its placing day (date), on its run (none: its room deleted, the farm month's, not shared); a row never placed, its blocks
  // lost while waiting on each check's day, the farm month's, not shared. A made row's cost is its share of the delivery's
  // materials at their lots; a material with no price named, and the costs incomplete.
  for (const b of data.batches) {
    const roomId = roomOf(b.roomId);
    if (b.date != null) {
      if (b.date < from || b.date > to) continue;
      const missing = b.missing ?? [];
      if (b.cost === null || missing.length) {
        const room = data.rooms.get(roomId);
        const whose = room ? `${room}’s blocks of ${dayMonth(b.date)}` : `Blocks put in ${dayMonth(b.date)}`;
        const text = b.cost === null || !missing.length ? `${whose} have no price` : `${whose}: no price for ${listText(missing)}`;
        notes.push(note('unpriced-batch', text, b.runId, b.batchId ?? null));
      }
      if (b.cost === null) continue;
      lines.push({
        key: 'blocks-batches', category: 'blocks', label: 'Blocks', source: 'batches', amount: b.cost, date: b.date, roomId,
        runId: b.runId, shared: false, blocks: b.blocks ?? null,
      });
      continue;
    }
    for (const l of b.lost ?? []) {
      if (l.date < from || l.date > to) continue;
      if (l.cost === null) {
        notes.push(note('unpriced-batch', `Blocks lost ${dayMonth(l.date)} before a room have no price`, null, b.batchId ?? null));
        continue;
      }
      lines.push({
        key: 'blocks-lost', category: 'blocks', label: 'Blocks lost before a room', source: 'batches', amount: l.cost, date: l.date,
        roomId: null, runId: null, shared: false, blocks: l.blocks,
      });
    }
  }
  // Inventory's materials when used (a use, a count that found less, a throw-out), at what they took of the lots: a use in a
  // room on the room's run open that day (none: the farm month's, not shared), else shared. Purchases are not a cost (boughtOf).
  for (const u of data.uses ?? []) {
    if (u.date < from || u.date > to) continue;
    const kind = u.kind in INVENTORY_LINES ? u.kind : 'other';
    const [category, label] = INVENTORY_LINES[kind];
    const roomId = roomOf(u.roomId);
    const runId = roomId === null ? null : runOn(data.runs, roomId, u.date, data.today)?.id ?? null;
    if (u.unpricedQty > 0) {
      const many = u.unpricedQty !== 1 || u.unit !== 'pcs';
      notes.push(note('no-unit-cost', `${u.name} used ${dayMonth(u.date)}: ${qtyWords(u.unpricedQty, u.unit)} ${many ? 'have' : 'has'} no price`, runId));
    }
    if (!(u.cost > 0)) continue;
    // a use in a room since deleted (Inventory keeps it as room 0): the farm month's, not shared, as a batch row's
    lines.push({
      key: `inventory-${kind}`, category, label, source: 'inventory', amount: u.cost, date: u.date, roomId, runId,
      shared: u.roomId === null || u.roomId === undefined, name: u.name,
    });
  }
  // The equipment register's write-off: a room's item on the room's run open that day (none: the farm month's, not shared),
  // the farm's shared.
  for (const item of data.equipment ?? []) {
    const roomId = roomOf(item.roomId);
    for (const { date, amount } of writeOffCharges(item, from, to, data.today)) {
      if (!(amount > 0)) continue;
      const runId = roomId === null ? null : runOn(data.runs, roomId, date, data.today)?.id ?? null;
      lines.push({
        key: 'equipment', category: 'equipment', label: 'Equipment written off', source: 'register', amount, date, roomId, runId,
        shared: roomId === null, name: item.name, equipmentId: item.id,
      });
    }
  }
  // ---- end Money truth ----
  const m = measuredLines(from, to, data);
  if (m.pending) pending = true;
  return { lines: [...lines, ...m.lines], notes: [...notes, ...m.notes], pending, sharedPending, pendingRuns: m.pendingRuns };
}

// ---- Money truth ---- (spec 5.2) What was bought for stock in [from, to], at what was paid: Inventory's purchases (kind not
// blocks) and the bought batches received. A cash line, never a cost. → { total, lines: [{ key, label, amount }] (biggest
// first), unpriced: [what has no price] }.
export function boughtOf(from, to, data) {
  const by = new Map();
  const unpriced = [];
  const put = (key, label, amount) => {
    const g = by.get(key) ?? { key, label, amount: 0 };
    g.amount = round(g.amount + amount, 2);
    by.set(key, g);
  };
  for (const p of data.purchases) {
    if (p.date < from || p.date > to) continue;
    if (p.total === null) {
      unpriced.push(`${p.name} bought ${dayMonth(p.date)}`);
      continue;
    }
    const kind = p.kind in INVENTORY_LINES ? p.kind : 'other';
    put(`inventory-${kind}`, INVENTORY_LINES[kind][1], p.total);
  }
  for (const b of data.batches) {
    if (b.kind === 'made' || !b.receivedDate || b.receivedDate < from || b.receivedDate > to) continue;
    if (b.cost === null) unpriced.push(`Blocks received ${dayMonth(b.receivedDate)}`);
    else put('blocks', 'Blocks', b.cost);
  }
  const lines = [...by.values()].filter((g) => g.amount > 0).sort((a, b) => b.amount - a.amount);
  return { total: sum(lines, 'amount'), lines, unpriced: [...new Set(unpriced)] };
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

// What was picked and not yet sold: { kg, value }, or null. value: the unsold kg at the picked crops' average price, null
// when a picked crop has no price (a value without it would read low).
function unsoldOf(harvests, picked, sold, cropYield) {
  if (!(picked > sold)) return null;
  const kg = round(picked - sold, 2);
  const value = unpricedOf(harvests, cropYield).length ? null : valueOf(harvests, cropYield);
  return { kg, value: value === null ? null : round((value * kg) / picked, 2) };
}

const PARTS = ['blocks', 'energy', 'water', 'own', 'equipment', 'shared'];
const emptyPart = () => ({
  blocks: 0, energy: 0, water: 0, own: 0, equipment: 0, shared: 0, income: 0, kgHarvested: 0, kgSold: 0, byCategory: {}, pending: false,
});
// equipment (Money truth): a room's own items written off; the farm's are in the shared costs
const partOf = (l) => (l.source === 'batches' ? 'blocks' : l.source === 'register' ? 'equipment'
  : l.source === 'measured' ? (l.key === 'electricity' ? 'energy' : 'water') : 'own');

// The figures of [from, to] (section 4): { from, to, lines, byCategory, income, costs, profit, kgHarvested, kgSold, costPerKg,
// profitPerKg, unsold, runs (Map run id → { blocks, energy, water, own, shared, income, kgHarvested, kgSold, byCategory,
// pending }), notes [{ kind, text, runId? }], pending, sharedPending (a bill's top-up not known yet), incomplete (a batch
// or a purchase with no price left out), waterPriced }. While pending: costs, profit and the per-kg figures null.
export function figuresOf(from, to, data) {
  const { lines, notes, pending, sharedPending, pendingRuns } = linesOf(from, to, data);
  const incomplete = notes.some((n) => LEFT_OUT.includes(n.kind));
  const known = new Set(data.runs.map((r) => r.id));
  const runs = new Map();
  const part = (id) => {
    if (!runs.has(id)) runs.set(id, emptyPart());
    return runs.get(id);
  };
  for (const id of pendingRuns) part(id).pending = true;
  for (const l of lines) {
    if (l.shared || l.runId === null || !known.has(l.runId)) continue; // a run no longer there: the month only
    const p = part(l.runId);
    const k = partOf(l);
    p[k] = round(p[k] + l.amount, 2);
    if (k !== 'energy' && k !== 'water') p.byCategory[l.category] = round((p.byCategory[l.category] ?? 0) + l.amount, 2);
  }
  const sharedTotal = sum(lines.filter((l) => l.shared), 'amount');
  const open = data.runs.map((r) => ({ id: r.id, w: blockDays(r, from, to, data.today) })).filter((x) => x.w > 0);
  if (sharedTotal > 0 && open.length === 0) {
    notes.push(note('not-shared', `${rm(sharedTotal)} of shared costs not shared: no blocks in this month`));
  }
  if (sharedTotal > 0 && open.length > 0) {
    split(sharedTotal, open.map((x) => x.w)).forEach((amount, i) => {
      const p = part(open[i].id);
      p.shared = round(p.shared + amount, 2);
    });
  }
  const sales = data.sales.filter((s) => s.date >= from && s.date <= to);
  // a sale's runs (Money truth 7: saleParts); one it reaches no run of: the month only
  for (const s of sales) {
    for (const x of saleParts(s, data)) {
      const p = part(x.runId);
      p.income = round(p.income + x.total, 2);
      p.kgSold = round(p.kgSold + x.kg, 2);
    }
  }
  const harvests = data.harvests.filter((h) => h.date >= from && h.date <= to);
  for (const h of harvests) {
    if (h.runId === null || !known.has(h.runId)) continue;
    const p = part(h.runId);
    p.kgHarvested = round(p.kgHarvested + h.kg, 2);
  }
  const costs = sum(lines, 'amount');
  const writeOff = sum(lines.filter((l) => l.source === 'register'), 'amount'); // ---- Money truth ---- the register's
  const income = sum(sales, 'total');
  const kgSold = sum(sales, 'kg');
  const kgHarvested = sum(harvests, 'kg');
  const profit = round(income - costs, 2);
  const unsold = unsoldOf(harvests, kgHarvested, kgSold, data.cropYield);
  if (unsold) {
    const about = unsold.value === null ? '' : ` (about ${rm(unsold.value)} at your expected prices)`;
    notes.unshift(note('unsold', `${unsold.kg.toFixed(1)} kg picked and not yet sold${about}`));
  }
  if (sales.length === 0) notes.push(note('no-sales', 'No sales recorded'));
  const waterPriced = data.prices.water !== null;
  if (!waterPriced && !notes.some((n) => n.kind === 'no-water-price')) {
    notes.push(note('no-water-price', 'No water price is set: energy is electricity only'));
  }
  return {
    from, to, lines, byCategory: categoryLines(lines, costs), income, kgHarvested, kgSold, unsold, runs, bought: boughtOf(from, to, data),
    costs: pending ? null : costs,
    profit: pending ? null : profit,
    writeOff, profitBeforeWriteOff: pending ? null : round(profit + writeOff, 2),
    costPerKg: pending || kgHarvested === 0 ? null : costPerKgOf(costs, kgHarvested),
    profitPerKg: pending || kgSold === 0 ? null : costPerKgOf(profit, kgSold),
    notes: uniqueNotes(notes),
    pending, sharedPending, incomplete, waterPriced,
  };
}

// Blocks are received before their run starts: a run's figures start this many days before it (before the start only the
// run's own lines land on it: no block-days, so no share).
export const RUN_LEAD_DAYS = 62;
export const runFirstMonth = (run) => monthOf(addDays(run.startDate, -RUN_LEAD_DAYS));

// A run's whole figures: its parts summed over every month from RUN_LEAD_DAYS before its start to today (its blocks are
// received before it starts; sales and costs tied to it may come after it ends). figs(month) → figuresOf's result for that month. → { parts, byCategory [{ category, amount }] ('shared' last),
// income, kgHarvested, kgSold, costs, profit, costPerKg, profitPerKg, notes, pending, incomplete }. Pending only when a day
// not worked out falls on the run, or a month it had block-days in has a bill's top-up not known yet: another room's
// pending day never hides a closed run's figures.
export function runTotals(run, figs, today) {
  const t = emptyPart();
  const notes = [];
  let pending = false;
  for (let m = runFirstMonth(run); m <= monthOf(today); m = addMonths(m, 1)) {
    const f = figs(m);
    const p = f.runs.get(run.id);
    pending ||= Boolean(p?.pending) || (f.sharedPending && blockDays(run, f.from, f.to, today) > 0);
    notes.push(...f.notes.filter((n) => n.runId === run.id || (n.kind === 'energy-not-kept' && m === monthOf(run.startDate))));
    if (!p) continue;
    for (const k of [...PARTS, 'income', 'kgHarvested', 'kgSold']) t[k] = round(t[k] + p[k], 2);
    for (const [c, v] of Object.entries(p.byCategory)) t.byCategory[c] = round((t.byCategory[c] ?? 0) + v, 2);
  }
  const costs = round(PARTS.reduce((s, k) => s + t[k], 0), 2);
  const profit = round(t.income - costs, 2);
  const byCategory = [
    ...LINE_CATEGORIES.filter((c) => t.byCategory[c]).map((c) => ({ category: c, amount: t.byCategory[c] })),
    ...(t.shared > 0 ? [{ category: 'shared', amount: t.shared }] : []),
  ];
  return {
    parts: Object.fromEntries(PARTS.map((k) => [k, t[k]])), byCategory, income: t.income, kgHarvested: t.kgHarvested,
    kgSold: t.kgSold,
    costs: pending ? null : costs,
    profit: pending ? null : profit,
    costPerKg: pending || t.kgHarvested === 0 ? null : costPerKgOf(costs, t.kgHarvested),
    profitPerKg: pending || t.kgSold === 0 ? null : costPerKgOf(profit, t.kgSold),
    notes: uniqueNotes(notes),
    pending,
    incomplete: notes.some((n) => LEFT_OUT.includes(n.kind)),
  };
}

// The contract's summary (GET /api/costs/summary): { total, byCategory [{ category, amount }] (the measured energy and water
// apart), energy, water, income, profit, profitPerKg }. energy and water null while pending (never a partial figure); water
// null when no water price is set.
export function summaryOf(f) {
  const by = {};
  for (const l of f.lines) if (l.source !== 'measured') by[l.category] = round((by[l.category] ?? 0) + l.amount, 2);
  const measured = (key) => sum(f.lines.filter((l) => l.source === 'measured' && l.key === key), 'amount');
  return {
    total: f.costs, byCategory: LINE_CATEGORIES.filter((c) => by[c]).map((c) => ({ category: c, amount: by[c] })),
    energy: f.pending ? null : measured('electricity'),
    water: f.pending || !f.waterPriced ? null : measured('water'),
    income: f.income, profit: f.profit, profitPerKg: f.profitPerKg,
  };
}

// ---- Export CSV (2026-11-05, the Business audit): GET /api/costs.csv?month= ----
export const CSV_HEADER = 'date,type,category,what,room,run started,source,amount';
const CSV_SOURCES = { manual: 'entered', batches: 'Batches', inventory: 'Inventory', measured: 'measured', bill: 'bill − measured', register: 'equipment register' };
const PENDING_ROW = ['', 'cost', 'Utilities', 'Electricity and water still being worked out: export again in a minute', '', '', 'measured', ''];

// A period's lines (figuresOf's f over data) as the CSV's lines, the header first: each cost line, each sale (income) and
// each purchase for stock (bought) by date, the measured electricity and water (one line per room and run, no date) last; a row saying so while they are worked out.
export function csvRows(f, data) {
  const runStart = (id) => data.runs.find((r) => r.id === id)?.startDate ?? '';
  const roomName = (id) => (id === null ? 'The farm' : data.rooms.get(id) ?? '');
  const costOf = (id) => data.costs.find((c) => c.id === id);
  const span = `${Number(f.from.slice(8))}–${dayMonth(f.to)}`;
  const whatOf = (l) => {
    if (l.source === 'manual') {
      const c = costOf(l.costId);
      return [c?.worker, c?.note].filter(Boolean).join(' · ');
    }
    if (l.source === 'batches') return l.blocks === null || l.blocks === undefined ? '' : `${l.blocks} blocks`;
    if (l.source === 'inventory' || l.source === 'register') return l.name ?? ''; // the item used; the equipment written off
    if (l.source === 'bill') return `${l.label}, bill of ${dayMonth(costOf(l.costId)?.date ?? l.date)}`;
    return `${l.label} measured ${span}`;
  };
  // a line of 0 (a room that used nothing) is left out, as By category leaves it
  const rows = f.lines.filter((l) => l.amount > 0).map((l, i) => ({
    date: l.source === 'measured' ? '' : l.date, order: i,
    cells: [l.source === 'measured' ? '' : l.date, 'cost', CATEGORY_LABELS[l.category] ?? l.label, whatOf(l), roomName(l.roomId),
      runStart(l.runId), CSV_SOURCES[l.source] ?? l.source, l.amount.toFixed(2)],
  }));
  data.sales.filter((s) => s.date >= f.from && s.date <= f.to).forEach((s, i) => {
    const parts = saleParts(s, data);
    const runId = parts.length === 1 ? parts[0].runId : null; // shared over several: no one run's start
    rows.push({
      date: s.date, order: f.lines.length + i,
      cells: [s.date, 'income', 'Sales', `${cropShortName(s.crop)} ${s.kg} kg`, s.roomId === null ? '' : roomName(s.roomId),
        runId === null ? '' : runStart(runId), 'Sales', s.total.toFixed(2)],
    });
  });
  // ---- Money truth ---- what was bought for stock: its own type, never in the costs (a cost once used)
  const bought = [
    ...data.purchases.filter((p) => p.total !== null && p.date >= f.from && p.date <= f.to).map((p) => {
      const [category] = INVENTORY_LINES[p.kind in INVENTORY_LINES ? p.kind : 'other'];
      return { date: p.date, cells: [p.date, 'bought', CATEGORY_LABELS[category], p.name, 'The farm', '', 'Inventory', p.total.toFixed(2)] };
    }),
    ...data.batches.filter((b) => b.kind !== 'made' && b.cost !== null && b.receivedDate && b.receivedDate >= f.from && b.receivedDate <= f.to)
      .map((b) => ({ date: b.receivedDate, cells: [b.receivedDate, 'bought', 'Blocks', `${b.blocks} blocks`, roomName(b.roomId), '', 'Batches', b.cost.toFixed(2)] })),
  ];
  bought.forEach((r, i) => rows.push({ ...r, order: f.lines.length + data.sales.length + i }));
  rows.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date === '' ? 1 : b.date === '' ? -1 : a.date < b.date ? -1 : 1));
  if (f.pending) rows.push({ cells: PENDING_ROW });
  return [CSV_HEADER, ...rows.map((r) => r.cells.map(cell).join(','))];
}
