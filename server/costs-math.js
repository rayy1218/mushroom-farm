// The costs' figures (spec 2026-11-05-costs-design.md 2.1 and 4), pure: a monthly item's charges, the run of a room on a
// day, a run's block-days, a shared cost's split; the period's lines and figures (part 2). Dates are 'YYYY-MM-DD', the
// farm's days; months 'YYYY-MM'. RM to 2 places at each sum.

import { addDays, daysBetween } from './task-rules.js';
import { round } from './harvest-math.js';

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
