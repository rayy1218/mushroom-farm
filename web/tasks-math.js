// Pure helpers for the Tasks tab, the Today page, Plan this on Suggest machines and the Settings task rules (spec
// docs/superpowers/specs/2026-10-30-tasks-design.md section 7; no DOM, so they can be tested in Node). Days are the farm's
// local days ('YYYY-MM-DD', Asia/Kuala_Lumpur) as the server sends them; times show on the farm's clock whatever the
// browser's time zone.

import { STAGES } from './crops.js';
import { monthly } from './suggest-math.js';
import { fieldTexts, parseRoomFields, roomBody } from './room-fields.js';

export const FARM_TZ = 'Asia/Kuala_Lumpur';
export const SLOTS = ['morning', 'afternoon', 'any'];
export const SLOT_LABELS = { morning: 'Morning', afternoon: 'Afternoon', any: 'Any time' };
export const LOG_DAYS = 14; // the Log shows the closed tasks of the last 14 days, then Older…
export const LOG_PAGE = 50; // GET /api/rooms/:id/tasks/log answers 50 a page
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 86_400_000;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// '12,000', '0.125': thousands grouped with a comma, at most 3 decimals (as the server writes its numbers).
const grouped = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 3 });
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---- days and times ----

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: FARM_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function farmParts(ms) {
  const p = Object.fromEntries(PARTS.formatToParts(ms).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export const farmDate = (ms) => farmParts(ms).date;
export const farmTime = (ms) => farmParts(ms).time;
const utcOf = (date) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const dayMonth = (date) => { const [, m, d] = date.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
export const dayTitle = (date) => `${WEEKDAYS[new Date(utcOf(date)).getUTCDay()]} ${dayMonth(date)}`;
export const daysFrom = (a, b) => Math.round((utcOf(b) - utcOf(a)) / DAY_MS);

// ---- counts ----

export const tasksDueWords = (n) => (n > 0 ? `${plural(n, 'task')} due` : 'Nothing due');
export const longtermWords = (n) => plural(n, 'long-term task');
export const todayLinkLabel = (n) => (n > 0 ? `Today: ${tasksDueWords(n)}` : 'Today');

// The Tasks tab's dot (spec 7.1): counts.due (the stage tasks open today and the upkeep due or overdue), amber with an
// overdue one; null: no dot. Long-term tasks never make a dot.
export function tabDot(counts) {
  const due = finite(counts?.due) ? counts.due : 0;
  if (due <= 0) return null;
  const overdue = finite(counts.overdue) ? counts.overdue : 0;
  return { text: due > 99 ? '99+' : String(due), level: overdue > 0 ? 'warning' : 'due', label: `${tasksDueWords(due)}${overdue > 0 ? `, ${overdue} overdue` : ''}` };
}

// The Today link's number: every room's counts.due (the open rows when a room has no counts). null: not a Today reply.
export function todayCount(view) {
  if (!Array.isArray(view?.rooms)) return null;
  const open = (rows) => (rows ?? []).filter((r) => r.status === 'open').length;
  return view.rooms.reduce((n, r) => n + (finite(r.counts?.due) ? r.counts.due : open(r.today) + open(r.upkeepDue)), 0);
}

// ---- rows ----

const STATUS_WORDS = { open: 'Open', done: 'Done', skipped: 'Skipped', missed: 'Missed', cancelled: 'Cancelled' };
const CLOSED = ['done', 'skipped', 'missed', 'cancelled'];

// The closed rows of a slot in words: "6 done", "2 done · 1 skipped".
export function foldLine(rows) {
  return CLOSED.map((s) => [s, rows.filter((r) => r.status === s).length]).filter(([, n]) => n > 0).map(([s, n]) => `${n} ${s}`).join(' · ');
}

// Today's daily rows by Morning, Afternoon and Any time (a slot with no rows is left out): [{ slot, label, open, closed, fold }].
export function slotGroups(rows) {
  return SLOTS.map((slot) => {
    const mine = (rows ?? []).filter((r) => (SLOTS.includes(r.slot) ? r.slot : 'any') === slot);
    const closed = mine.filter((r) => r.status !== 'open');
    return { slot, label: SLOT_LABELS[slot], open: mine.filter((r) => r.status === 'open'), closed, fold: foldLine(closed) };
  }).filter((g) => g.open.length + g.closed.length > 0);
}

export const amountText = (row) => (finite(row?.amount) ? `${grouped(row.amount)}${row.unit ? ` ${row.unit}` : ''}` : '');

// A closed row in one line: "Done by Ali at 09:12 · 2.4 kg", "Skipped by Siti at 10:05 · No bags opened yet", "Missed".
export function closedLine(row) {
  if (row.status === 'missed') return 'Missed';
  const head = `${STATUS_WORDS[row.status] ?? row.status}${row.worker ? ` by ${row.worker}` : ''}${finite(row.closedAt) ? ` at ${farmTime(row.closedAt)}` : ''}`;
  return [head, amountText(row), row.reason ?? ''].filter(Boolean).join(' · ');
}

// A rule that records an amount (the harvest's kg, the bags taken out) gives its open rows a unit or a label.
export const recordsAmount = (row) => Boolean(row?.unit || row?.amountLabel);
// The box's label names the unit once: "kg picked" as it is, "Weight (kg)" (the unit as a whole word, so 'g' is not in "Eggs").
const hasWord = (text, word) => new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(text);
export function amountField(row) {
  const label = row.amountLabel || 'Amount';
  const unit = row.unit || null;
  return { label: unit && !hasWord(label, unit) ? `${label} (${unit})` : label, unit };
}

// An upkeep row's due words (spec 7.1): "overdue 3 days" (amber), "due today", "due 2 Nov"; group: overdue, soon (within
// 7 days) or later; late: days past the due date (negative before it).
const dueDateOf = (row) => row.dueDate ?? (finite(row.dueAt) ? farmDate(row.dueAt) : null);
export function dueWords(row, today) {
  const due = dueDateOf(row);
  if (!due) return { text: '', tone: null, group: 'later', late: null };
  const late = daysFrom(due, today);
  if (late > 0) return { text: `overdue ${plural(late, 'day')}`, tone: 'amber', group: 'overdue', late };
  if (late === 0) return { text: 'due today', tone: null, group: 'soon', late };
  return { text: `due ${dayMonth(due)}`, tone: null, group: late >= -7 ? 'soon' : 'later', late };
}

// The Upkeep part's open rows: overdue first, then due within 7 days, then the rest, each by date. → [{ row, due }]
export function upkeepRows(rows, today) {
  const order = { overdue: 0, soon: 1, later: 2 };
  return (rows ?? []).filter((r) => r.status === 'open').map((row) => ({ row, due: dueWords(row, today) }))
    .sort((a, b) => order[a.due.group] - order[b.due.group] || (b.due.late ?? -1e9) - (a.due.late ?? -1e9) || a.row.id - b.row.id);
}
