// Closed months (spec 2026-11-12-data-integrity-design.md 8.3): a month closes at the end of the 14th of the next (the bill has
// usually come) and its figures are kept; a later change that moves them marks it re-priced, with what it was and the change
// log's entries since, until the owner keeps the new figures. A write that reprices a closed month asks once first.

import { askOrThrow, confirmedOf } from './asks.js';

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};
// The last day before a month closes: the 14th of the next.
export const closeDayOf = (month) => `${nextMonth(month)}-14`;
export const isClosable = (month, today) => today > closeDayOf(month);
export const monthWords = (m) => `${FULL_MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const monthsOfRange = (from, to) => {
  const out = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = nextMonth(m)) out.push(m);
  return out;
};

// A month's figures as they are kept (figuresOf's f): { income, costs, profit, writeOff, kWh, runs: { id: { income, costs,
// profit } } }.
export function keptFigures(f) {
  const runs = {};
  for (const [id, p] of f.runs) {
    const costs = Math.round((p.blocks + p.energy + p.water + p.own + p.equipment + p.shared) * 100) / 100;
    runs[id] = { income: p.income, costs, profit: Math.round((p.income - costs) * 100) / 100 };
  }
  return { income: f.income, costs: f.costs, profit: f.profit, writeOff: f.writeOff, kWh: f.kWh ?? null, runs };
}

// Whether two kept figures differ by a sen or more (income, costs, profit; any run's).
export function differs(a, b) {
  const off = (x, y) => Math.abs((x ?? 0) - (y ?? 0)) >= 0.005;
  if (off(a.income, b.income) || off(a.costs, b.costs) || off(a.profit, b.profit)) return true;
  const ids = new Set([...Object.keys(a.runs ?? {}), ...Object.keys(b.runs ?? {})]);
  for (const id of ids) {
    const [x, y] = [a.runs?.[id] ?? {}, b.runs?.[id] ?? {}];
    if (off(x.income, y.income) || off(x.costs, y.costs) || off(x.profit, y.profit)) return true;
  }
  return false;
}

// The dates an entry's record is about (its before and after): a sale's sold day, a cost's date, a harvest's pick, … as
// [from, to] farm dates (an item written off from its day, a rate from its day: to today).
function entryDays(e, localDate, today) {
  const out = [];
  for (const r of [e.before, e.after]) {
    if (!r) continue;
    const ms = r.soldAt ?? r.pickedAt ?? (e.kind === 'move' || e.kind === 'not-sold' ? r.at : undefined);
    if (typeof ms === 'number') out.push([localDate(ms), localDate(ms)]);
    if (e.kind === 'cost' && r.date) out.push([r.date, r.repeat ? today : r.date]);
    if (e.kind === 'cost' && r.periodFrom && r.periodTo) out.push([r.periodFrom, r.periodTo]); // a bill: its period's months
    if (e.kind === 'equipment' && r.boughtOn) out.push([r.boughtOn, today]);
    if (e.kind === 'tariff' && r.from) out.push([r.from, today]);
  }
  return out;
}

// The change log's entries made after `since` that reach `month`.
export function changesReaching(db, month, since, { localDate, today }) {
  const [a, b] = [`${month}-01`, `${month}-31`];
  return db.changesBetween(since + 1, Number.MAX_SAFE_INTEGER, { limit: 10_000 })
    .filter((e) => e.kind !== 'month' && entryDays(e, localDate, today).some(([from, to]) => from <= b && to >= a));
}

// The closed-month ask (5.2) of a write repricing the days of `ranges` ([{ from, to }] farm dates, or a date for one day):
// [ask] when one of their months is closed, else []. askClosed throws it unless the body confirmed it.
export function closedAsks(db, ranges, field) {
  const closed = new Set(db.monthCloses().map((c) => c.month));
  const days = ranges.filter(Boolean).map((r) => (typeof r === 'string' ? { from: r, to: r } : r));
  const hit = [...new Set(days.flatMap(({ from, to }) => monthsOfRange(from, to)))].filter((m) => closed.has(m)).sort();
  if (!hit.length) return [];
  const names = hit.length === 1 ? monthWords(hit[0])
    : `${hit.slice(0, -1).map((m) => FULL_MONTHS[Number(m.slice(5, 7)) - 1]).join(', ')} and ${monthWords(hit.at(-1))}`;
  const text = hit.length === 1
    ? `${names} is closed: this changes its figures, and the month will say re-priced.`
    : `${names} are closed: this changes their figures, and they will say re-priced.`;
  return [{ kind: 'closed-month', field, text }];
}
export function askClosed(db, ranges, body, field) {
  askOrThrow(closedAsks(db, ranges, field), confirmedOf(body));
}
