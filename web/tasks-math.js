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

// ---- long-term tasks and Plan this (spec 7.1 and 7.4) ----

export const MACHINE_ORDER = ['fanFlow', 'acBTU', 'humidifierLH', 'dehumidifierLday'];
const MACHINE_WORDS = { fanFlow: ['Fan', 'm³/h'], acBTU: ['Aircon', 'BTU/h'], humidifierLH: ['Humidifier', 'L/h'], dehumidifierLday: ['Dehumidifier', 'L/day'] };

// A suggestion's RM a month against the room's now, in words: "RM 42 a month less", "RM 16 a month more"; '' when unknown.
export function rmWords(rm) {
  if (!finite(rm)) return '';
  const whole = Math.round(Math.abs(rm));
  return whole === 0 ? 'about the same money a month' : `RM ${grouped(whole)} a month ${rm < 0 ? 'less' : 'more'}`;
}

// A long-term row in one line: "Aircon 9,000 → 12,000 BTU/h · RM 42 a month less · from Suggest machines, 29 Oct" (no money
// without an electricity price, no day without the suggestion's time).
export function longtermLine(row) {
  const s = row.source;
  if (!s) return row.text;
  return [row.text, rmWords(s.rmMonth), `from Suggest machines${finite(s.suggestedAt) ? `, ${dayMonth(farmDate(s.suggestedAt))}` : ''}`].filter(Boolean).join(' · ');
}

// A machine change in words, as the server names its task: "Fan 150 → 200 m³/h", "Dehumidifier none → 10 L/day".
export function changeText({ key, from, to }) {
  const [name, unit] = MACHINE_WORDS[key];
  const none = (v) => key === 'dehumidifierLday' && !(v > 0);
  const value = (v) => (none(v) ? 'none' : grouped(v));
  return none(to) ? `${name} ${value(from)} ${unit} → none` : `${name} ${value(from)} → ${value(to)} ${unit}`;
}

// The machines of a setup that differ from the room's now, in the order fan, aircon, humidifier, dehumidifier (0 = none).
export function machineChanges(now, next) {
  const v = (m, k) => (k === 'dehumidifierLday' ? (Number(m?.[k]) > 0 ? Number(m[k]) : 0) : Number(m?.[k]));
  return MACHINE_ORDER.filter((k) => Number.isFinite(v(now, k)) && Number.isFinite(v(next, k)) && v(now, k) !== v(next, k)).map((k) => {
    const change = { key: k, from: v(now, k), to: v(next, k) };
    return { ...change, text: changeText(change) };
  });
}

// Plan this: setup `index` of a suggestion against its baseline (the room's now). → { changes, rmMonth (null without an
// electricity price), rmText, body (for POST /api/rooms/:id/tasks) }, or null without a baseline (the "from" is unknown).
// No changes: the room has this setup already, and the server refuses an empty plan, so the dialog offers no Plan.
export function planOf(result, index, prices, suggestedAt) {
  const base = result?.baseline;
  const next = result?.best?.[index];
  if (!base?.machines || !next?.machines) return null;
  const runDays = finite(result.days) && result.days > 0 ? result.days : 1;
  const a = monthly(base, runDays, prices).rm;
  const b = monthly(next, runDays, prices).rm;
  const rmMonth = a === null || b === null ? null : Math.round((b - a) * 100) / 100;
  const changes = machineChanges(base.machines, next.machines);
  return {
    changes, rmMonth, rmText: rmWords(rmMonth),
    body: { suggestion: { machines: changes.map(({ key, from, to }) => ({ key, from, to })), rmMonth, suggestedAt } },
  };
}

// ---- Done on a long-term machine task (spec 7.5) ----

export const BTU_PER_W = 11.25; // the class rule Simulate uses between Setup's rated input and the aircon's BTU/h
export const acInputOf = (btu) => Math.round(btu / BTU_PER_W / 10) * 10;

const field = (name, label, unit, kind, before, after) => ({ name, label, unit, kind, before, after });

// The Setup fields a done machine task offers to update, before and after: the aircon's rated input, the humidifier's
// output, the dehumidifier fitted and its capacity (0 = none: not fitted). null: nothing on Setup (a fan: Setup keeps no fan
// flow).
export function setupUpdate(source, room) {
  if (!source || !room) return null;
  const to = Number(source.to);
  if (source.machine === 'acBTU') return [field('acInputW', 'Aircon rated input', 'W', 'number', room.acInputW ?? null, acInputOf(to))];
  if (source.machine === 'humidifierLH') return [field('humidifierLH', 'Humidifier output', 'L/h', 'number', room.humidifierLH ?? null, to)];
  if (source.machine === 'dehumidifierLday') {
    const fitted = room.dehumidifier === true;
    const box = field('dehumidifier', 'Dehumidifier fitted', null, 'check', fitted, to > 0);
    return to > 0 ? [box, field('dehumidifierLday', 'Dehumidifier capacity', 'L/day', 'number', fitted ? room.dehumidifierLday ?? null : null, to)] : [box];
  }
  return null;
}

export const beforeText = (f) => (f.kind === 'check' ? (f.before ? 'fitted' : 'not fitted') : finite(f.before) ? `${grouped(f.before)} ${f.unit}` : 'not set');

// Save and mark done: the room's PUT body with the dialog's texts over the room (texts: { name: text, or a box's
// true/false }), checked as Setup checks them. → { body } or { errors: { name: message } }
export function setupBody(room, texts) {
  const checked = parseRoomFields({ ...fieldTexts(room), ...texts }, Object.keys(texts));
  return checked.errors ? { errors: checked.errors } : { body: roomBody(room, checked.values) };
}

// ---- the dialogs' boxes (checked as the server checks them, in its words) ----

export const AMOUNT_MAX = 10_000;
export const REASON_MAX = 200;
export const TEXT_MAX = 120;
export const NOTE_MAX = 500;

// The amount box (empty: not weighed or counted) → { value } or { error }. Up to 3 decimals, as amounts show.
export function parseAmount(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { value: null };
  const n = /^[0-9]{1,5}(\.[0-9]{1,3})?$/.test(s) ? Number(s) : NaN;
  return n >= 0 && n <= AMOUNT_MAX ? { value: n } : { error: `The amount must be a number from 0 to ${grouped(AMOUNT_MAX)}` };
}

// The reason of a skip or a cancel → { value } or { error }.
export function checkReason(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { error: 'Say why' };
  return s.length > REASON_MAX ? { error: `The reason must be at most ${REASON_MAX} characters` } : { value: s };
}

// Add a long-term task → { values: { text, note } } or { errors }.
export function checkLongterm({ text, note }) {
  const t = String(text ?? '').trim();
  const n = String(note ?? '').trim();
  const errors = {};
  if (t === '' || t.length > TEXT_MAX) errors.text = `Say what to do (1 to ${TEXT_MAX} characters)`;
  if (n.length > NOTE_MAX) errors.note = `The note must be at most ${NOTE_MAX} characters`;
  return Object.keys(errors).length ? { errors } : { values: { text: t, note: n || null } };
}

// ---- the Log ----

// A closed row as the Log shows it: { id, date, time, task, status, tone, worker, amount, reason }.
export function logLine(row) {
  const when = finite(row.closedAt) ? row.closedAt : row.createdAt;
  const at = finite(when) ? farmParts(when) : null;
  return {
    id: row.id, date: at ? dayMonth(at.date) : '', time: at ? at.time : '', task: row.text, status: STATUS_WORDS[row.status] ?? row.status,
    tone: row.status === 'done' ? 'good' : row.status === 'missed' ? 'amber' : 'none', worker: row.worker ?? '', amount: amountText(row), reason: row.reason ?? '',
  };
}

// The Log's lines: the closed rows of the last 14 days (every row read so far, after Older…).
export function logRows(rows, now, all = false) {
  const since = now - LOG_DAYS * DAY_MS;
  return (rows ?? []).filter((r) => all || (r.closedAt ?? r.createdAt ?? 0) >= since).map(logLine);
}
