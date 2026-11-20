// The change log's words (spec 2026-11-12-data-integrity-design.md 3.3), pure: what a record is ("Sale of 3 Nov to Restoran
// Wong"), what an entry did ("Edited: Pink oyster RM 18.00 → RM 0.10 a kg; total RM 57.60 → RM 0.32") and its line ("10 Nov
// 14:03 · Lim · …"). The server's CSV and the pages read them, so the log says one thing everywhere.

import { cropShortName } from './crops.js';
import { kgText, rmText } from './harvest-math.js';
import { farmDate, farmTime, dayMonth } from './tasks-math.js';
import { qtyText } from './inventory-math.js';
import { CATEGORY_NAMES, PART_OPTIONS } from './costs-math.js';
import { DOT } from './text-math.js';
import { SALES_HASH, COSTS_HASH, costsHash, roomHash, inventoryItemHash, INVENTORY_HASH } from './route.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// a part's name, read when asked (costs-math imports this module too)
const partName = (v) => PART_OPTIONS.find(([k]) => k === v)?.[1] ?? v;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const exact = (kg) => kgText(kg, { exact: true });
const day = (ms) => dayMonth(farmDate(ms)); // "3 Nov"
const date = (d) => (typeof d === 'string' && d ? dayMonth(d) : '—'); // a YYYY-MM-DD's "3 Nov"
const when = (ms) => `${day(ms)} ${farmTime(ms)}`;
const crop = (c) => cropShortName(c);
const place = (name) => name ?? 'the farm';
const text = (v) => (v === null || v === undefined || v === '' ? 'none' : `“${v}”`);
const rate = (v) => (finite(v) ? `RM ${v.toFixed(4)} a kWh` : '—');

export const REASON_WORDS = { spoiled: 'Spoiled', rejected: 'Rejected by the buyer', sample: 'Sample', staff: 'Eaten by staff', dried: 'Dried', given: 'Given away' };
export const KIND_WORDS = {
  sale: 'Sales', cost: 'Costs', equipment: 'Equipment', harvest: 'Harvests', move: 'Inventory', 'not-sold': 'Not sold', tariff: 'Tariff',
  month: 'Months', room: 'Rooms',
};
const MOVE_WORDS = { purchase: 'purchase', use: 'use', adjust: 'count', batch: 'batch move' };
// A YYYYMM row id's month ("October 2026").
export const monthOfRow = (id) => `${MONTHS[(id % 100) - 1]} ${Math.floor(id / 100)}`;

// What the record is, from an entry's after (else before): "Sale of 3 Nov to Restoran Wong".
const BILL_NAMES = { electricity: 'Electricity bill', water: 'Water bill' }; // a utility bill named as the bill it is
export function recordTitle(e) {
  const r = e.after ?? e.before ?? {};
  switch (e.kind) {
    case 'sale': return finite(r.soldAt) ? `Sale of ${day(r.soldAt)} to ${r.buyer ?? 'a buyer'}` : `Sale no. ${e.rowId}`; // a paid or unpaid entry keeps only the day paid
    case 'cost': return `${BILL_NAMES[r.category === 'utilities' ? r.utility : ''] ?? CATEGORY_NAMES[r.category] ?? 'Cost'}, ${rmText(r.amount)} on ${date(r.date)}${r.repeat === 'monthly' ? ' a month' : ''}`;
    case 'equipment': return `${r.name ?? 'Equipment'} (equipment)`;
    case 'harvest': return `${crop(r.crop)}, ${exact(r.kg)} in ${r.roomName ?? 'a deleted room'} on ${finite(r.pickedAt) ? day(r.pickedAt) : '—'}`;
    case 'move': return `${r.itemName ?? 'An item'}: ${MOVE_WORDS[r.refKind] ?? 'record'} of ${qtyText(Math.abs(r.qty ?? 0), r.unit ?? '')} on ${finite(r.at) ? day(r.at) : '—'}`;
    case 'not-sold': return `Not sold: ${crop(r.crop)} ${exact(r.kg)} on ${finite(r.at) ? day(r.at) : '—'}`;
    case 'tariff': return `Electricity rate from ${date(r.from)}${r.from ? ` ${r.from.slice(0, 4)}` : ''}`;
    case 'month': return `${monthOfRow(e.rowId)}'s figures`;
    case 'room': return `Room ${r.name ?? ''}`.trim();
    default: return 'A record';
  }
}

// The fields of each kind an edit names: [key, label, format].
const FIELDS = {
  cost: [['date', 'date', date], ['category', 'category', (v) => CATEGORY_NAMES[v] ?? v], ['amount', 'amount', rmText],
    ['roomName', 'for', place], ['worker', 'paid to', text], ['note', 'note', text], ['periodFrom', 'bill from', date], ['periodTo', 'bill to', date],
    ['repeatUntil', 'last month', (v) => v ?? 'none']],
  equipment: [['name', 'name', text], ['roomName', 'for', place], ['part', 'part', partName], ['boughtOn', 'bought', date],
    ['amount', 'RM', rmText], ['lifeMonths', 'written off over', (v) => `${v} months`], ['resale', 'resale value', rmText], ['note', 'note', text]],
  harvest: [['kg', 'kg', (v) => (finite(v) ? v.toFixed(2) : '—')], ['pickedAt', 'picked', (v) => (finite(v) ? when(v) : '—')], ['worker', 'picker', text]],
  move: [['qty', 'qty', (v) => (finite(v) ? Math.abs(v).toString() : '—')], ['total', 'paid', rmText], ['supplier', 'supplier', text],
    ['useBy', 'use by', date], ['at', 'when', (v) => (finite(v) ? when(v) : '—')], ['roomName', 'room', (v) => v ?? 'none'],
    ['reason', 'reason', text], ['worker', 'who', text]],
  'not-sold': [['at', 'day', (v) => (finite(v) ? day(v) : '—')], ['crop', 'crop', crop], ['kg', 'kg', (v) => (finite(v) ? v.toFixed(2) : '—')],
    ['reason', 'why', (v) => REASON_WORDS[v] ?? v], ['roomName', 'room', (v) => v ?? 'none'], ['note', 'note', text]],
  tariff: [['from', 'from', date], ['rate', 'rate', rate], ['afa', 'AFA', rate], ['note', 'note', text]],
};
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// A sale's edit: each crop's kg and price, lines added and removed, then the delivery's total, date, buyer, reference, note.
function saleDiff(a, b) {
  const out = [];
  const lines = (r) => new Map((r.lines ?? []).map((l) => [l.crop, l]));
  const [was, now] = [lines(a), lines(b)];
  for (const [c, l] of now) {
    const o = was.get(c);
    if (!o) { out.push(`${crop(c)} ${exact(l.kg)} added`); continue; }
    if (!same(o.kg, l.kg)) out.push(`${crop(c)} ${exact(o.kg)} → ${exact(l.kg)}`);
    if (!same(o.priceKg, l.priceKg)) out.push(`${crop(c)} ${rmText(o.priceKg)} → ${rmText(l.priceKg)} a kg`);
    if (!same(o.roomName, l.roomName)) out.push(`${crop(c)} from ${o.roomName ?? 'Mixed'} → ${l.roomName ?? 'Mixed'}`);
  }
  for (const [c, o] of was) if (!now.has(c)) out.push(`${crop(c)} ${exact(o.kg)} removed`);
  const total = (r) => Math.round((r.lines ?? []).reduce((s, l) => s + l.total, 0) * 100) / 100;
  if (total(a) !== total(b)) out.push(`total ${rmText(total(a))} → ${rmText(total(b))}`);
  if (!same(a.soldAt, b.soldAt) && finite(a.soldAt) && finite(b.soldAt) && farmDate(a.soldAt) !== farmDate(b.soldAt)) out.push(`date ${day(a.soldAt)} → ${day(b.soldAt)}`);
  if (!same(a.buyer, b.buyer)) out.push(`buyer ${a.buyer} → ${b.buyer}`);
  if (!same(a.invoiceNo, b.invoiceNo)) out.push(`reference ${text(a.invoiceNo)} → ${text(b.invoiceNo)}`);
  if (!same(a.note, b.note)) out.push(`note ${text(a.note)} → ${text(b.note)}`);
  return out;
}

// What changed between before and after, in words joined by "; " ('' when nothing a person reads changed).
export function diffWords(kind, before, after) {
  if (!before || !after) return '';
  if (kind === 'sale') return saleDiff(before, after).join('; ');
  return (FIELDS[kind] ?? []).filter(([k]) => !same(before[k], after[k])).map(([k, label, f]) => `${label} ${f(before[k])} → ${f(after[k])}`).join('; ');
}

// What an entry did, in words (3.3).
export function changeWords(e) {
  const reason = e.reason ? `: ${e.reason}` : '';
  switch (e.action) {
    case 'add': return 'Recorded';
    case 'edit': {
      const d = diffWords(e.kind, e.before, e.after);
      return d ? `Edited: ${d}` : 'Edited';
    }
    case 'paid': return `Marked paid on ${finite(e.after?.paidAt) ? day(e.after.paidAt) : '—'}`;
    case 'unpaid': return `Marked unpaid (was paid ${finite(e.before?.paidAt) ? day(e.before.paidAt) : '—'})${reason}`;
    case 'void': return `Voided${reason}`;
    case 'restore': return `Restored${reason}`;
    case 'undo': return 'Undone within a minute';
    case 'change': return `From ${e.after?.from ? monthWords(e.after.from) : '—'}: ${rmText(e.before?.amount)} → ${rmText(e.after?.amount)} a month`;
    case 'stop': return `Stopped after ${e.after?.repeatUntil ? monthWords(e.after.repeatUntil) : '—'}`;
    case 'keep': return `New figures kept: profit ${rmText(e.before?.profit)} → ${rmText(e.after?.profit)}${reason}`;
    case 'delete': return `${e.before?.name ?? 'A room'} deleted with ${plural(e.before?.runs ?? 0, 'run')} and ${plural(e.before?.harvests ?? 0, 'harvest')}, ${exact(e.before?.kg ?? 0)}`;
    default: return e.action;
  }
}
const plural = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;
// "Nov 2026" of a YYYY-MM.
const monthWords = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(0, 4)}`;

// An entry's line in a History fold: "10 Nov 14:03 · Lim · Marked unpaid (was paid 6 Nov): The buyer's transfer bounced".
export const entryLine = (e) => `${when(e.at)}${DOT}${e.by}${DOT}${changeWords(e)}`;

// The History fold's first line for a record older than the log.
export const BEFORE_LOG = (since) => `Recorded before the change log began${since ? ` (${dayMonth(farmDate(since))} ${farmDate(since).slice(0, 4)})` : ''}`;

// ---- a voided record (section 11) ----
// "Voided 10 Nov by Lim: Entered twice" (the row's second line, the voided dialog's lead).
export const voidLine = (v) => (v ? `Voided ${day(v.at)} by ${v.by}${v.reason ? `: ${v.reason}` : ''}` : '');
// "edited" after a row's date when it was changed after it was made.
export const editedMark = (edits) => (edits > 0 ? 'edited' : '');

// ---- the Changes page (section 11) ----
export const CHANGES_LEAD = 'Every change to a money record: who, when, before and after.';
// A worker's page (the log holds money: 403).
export const CHANGES_OWNER = 'The change log holds money, so only the owner sees it. Ask the owner.';
// The period segments: [days, words].
export const CHANGE_PERIODS = [[7, '7 days'], [30, '30 days'], [90, '13 weeks'], [365, '12 months']];
const periodOf = (days) => CHANGE_PERIODS.find(([d]) => d === days)?.[1] ?? `${days} days`;
// The What filter: ['', 'All'] then each kind's words.
export const KIND_FILTERS = [['', 'All'], ...Object.entries(KIND_WORDS)];

// The page that keeps the record, or null (a deleted room, a harvest of one).
export function recordHref(e) {
  const r = e.after ?? e.before ?? {};
  switch (e.kind) {
    case 'sale': case 'not-sold': return SALES_HASH;
    case 'cost': return typeof r.date === 'string' ? costsHash(r.date.slice(0, 7)) : COSTS_HASH;
    case 'equipment': return COSTS_HASH;
    case 'harvest': return Number.isInteger(r.roomId) && r.roomName ? roomHash(r.roomId, 'harvest') : null;
    case 'move': return Number.isInteger(r.itemId) ? inventoryItemHash(r.itemId) : INVENTORY_HASH;
    case 'tariff': return '#/settings';
    case 'month': return costsHash(`${Math.floor(e.rowId / 100)}-${String(e.rowId % 100).padStart(2, '0')}`);
    default: return null;
  }
}

// "10 Nov 14:03"; "30 Dec 2025 09:05" for a day not of today's year.
export const whenText = (ms, today) => {
  const d = farmDate(ms);
  return `${dayMonth(d)}${d.slice(0, 4) === today.slice(0, 4) ? '' : ` ${d.slice(0, 4)}`} ${farmTime(ms)}`;
};

// A row of the page: { id, when, who, what, href, change, why }; the reason said once, under Why.
export const changeRow = (e, today) => ({
  id: e.id, when: whenText(e.at, today), who: e.by, what: recordTitle(e), href: recordHref(e),
  change: changeWords({ ...e, reason: null }), why: e.reason || '—',
});

// The page's rows; an entry that keeps too little to name its record (a Mark paid or unpaid: the paid day only) takes the
// record from another entry of it in the reply.
export function changeRows(entries, today) {
  const known = new Map();
  for (const e of entries) {
    const r = e.after ?? e.before;
    if (e.kind === 'sale' && finite(r?.soldAt) && !known.has(e.rowId)) known.set(e.rowId, r);
  }
  return entries.map((e) => {
    const r = e.after ?? e.before;
    const named = e.kind === 'sale' && !finite(r?.soldAt) && known.has(e.rowId);
    const row = changeRow(e, today);
    return named ? { ...row, what: recordTitle({ ...e, after: known.get(e.rowId), before: null }) } : row;
  });
}

// One record's page: "Every change to this record: Sale of 3 Nov to Restoran Wong." (named from its fullest entry: the newest
// that keeps the record, not a Mark paid's day alone).
export function recordLead(entries) {
  const full = entries.toReversed().find((e) => ['add', 'edit', 'change', 'void', 'restore', 'undo', 'stop', 'delete'].includes(e.action)) ?? entries.at(-1);
  return full ? `Every change to this record: ${recordTitle(full)}.` : 'No changes to this record.';
}

// The line over a period cut at the page's rows (the CSV has them all).
export const CHANGES_MORE = (n) => `Showing the newest ${n} changes. Export CSV holds every one.`;

// "No changes in the last 30 days." ("No changes to Costs by Lim in the last 7 days." with the filters on).
export const changesEmpty = ({ days, kind = null, by = null }) =>
  `No changes${kind ? ` to ${KIND_WORDS[kind] ?? kind}` : ''}${by ? ` by ${by}` : ''} in the last ${periodOf(days)}.`;
