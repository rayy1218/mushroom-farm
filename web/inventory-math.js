// Inventory's one formatter and the pages' pure parts (spec 2026-11-05-inventory-design.md 5): a qty with its unit, RM, the
// price per unit, a farm day; the pills, the words and the dialogs' bodies (below). A number keeps its unit at a wrap (a
// no-break space, as the Units Rule has it). server/inventory-alerts.js uses the formatter for its messages.

import { DOT } from './text-math.js';
import { farmDate, farmTime, daysFrom } from './tasks-math.js';
import { whenMs } from './harvest-math.js';
import { normaliseClock } from './light-math.js';

const NB = ' ';
const DASH = '—';
const MINUS = '−';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const grouped = (n, min, max = min) => n.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });

// The units counted in whole numbers (kg and L take 2 decimals): as server/inventory-math.js WHOLE_UNITS.
export const WHOLE_UNITS = ['pcs', 'g', 'mL', 'blocks'];
// A unit in words, for a screen reader ("Qty used, in litres") and the errors.
export const UNIT_WORDS = { pcs: 'pieces', kg: 'kilograms', g: 'grams', L: 'litres', mL: 'millilitres', blocks: 'blocks' };
// "per piece", "per block"; the others by their symbol.
const ONE = { pcs: 'piece', blocks: 'block' };

// "3.50 L", "120 pcs", "−2.00 L"; signed: "+5.00 L" for an in-move. A figure that shows as 0 has no sign.
export function qtyText(qty, unit, { signed = false } = {}) {
  if (!finite(qty)) return DASH;
  const places = WHOLE_UNITS.includes(unit) ? 0 : 2;
  const shown = grouped(Math.abs(qty), places);
  const zero = Number(shown.replace(/,/g, '')) === 0;
  const sign = zero ? '' : qty < 0 ? MINUS : signed ? '+' : '';
  return `${sign}${shown}${NB}${unit}`;
}

// "RM 1,240.50".
export const rmText = (v) => (finite(v) ? `RM${NB}${grouped(v, 2)}` : DASH);

// What one unit cost: "RM 8.33 per L"; under RM 0.10 its first two significant digits up to 4 decimals ("RM 0.0035 per
// mL"), under RM 0.0001 "under RM 0.0001 per g", as Harvest's cost per kg. '' without a qty.
export function perUnitText(total, qty, unit) {
  if (!finite(total) || !finite(qty) || qty <= 0 || total < 0) return '';
  const p = total / qty;
  const per = `per${NB}${ONE[unit] ?? unit}`;
  if (p > 0 && p < 0.0001) return `under${NB}RM${NB}0.0001 ${per}`;
  const text = p === 0 || p >= 0.1 ? grouped(p, 2) : grouped(p, 2, Math.min(4, 1 - Math.floor(Math.log10(p))));
  return `RM${NB}${text} ${per}`;
}

const dateParts = (date) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
// "12 Nov" and "12 Nov 2026" from 'YYYY-MM-DD'.
export function dayText(date) {
  const m = dateParts(date);
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : DASH;
}
export function longDayText(date) {
  const m = dateParts(date);
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : DASH;
}

// The farm day n days before `date` ('YYYY-MM-DD'): the date boxes' earliest day.
export const daysBefore = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

// ---- the pages (spec 5) ----

export const KIND_NAMES = { blocks: 'Blocks', spawn: 'Spawn', bags: 'Bags', chemical: 'Chemicals', packaging: 'Packaging', other: 'Other' };
const KIND_ORDER = Object.keys(KIND_NAMES);
// The kinds an item is made with here (Batches makes the block items) and the units: [value, label].
export const KIND_OPTIONS = [['spawn', 'Spawn'], ['bags', 'Bags'], ['chemical', 'Chemical'], ['packaging', 'Packaging'], ['other', 'Other']];
export const KIND_ONE = Object.fromEntries([...KIND_OPTIONS, ['blocks', 'Blocks']]);
export const UNIT_OPTIONS = [['pcs', 'pcs (a count)'], ['kg', 'kg'], ['g', 'g'], ['L', 'L'], ['mL', 'mL']];
const MAX_QTY = 100_000;
const MAX_TOTAL = 1_000_000;
const MAX_TEXT = 60;

// Part of the stock in expired lots (useBy.qty, under the item's qty): the pill and the tile name that part, not the whole.
const partExpired = (item) => item.useBy?.state === 'expired' && finite(item.useBy.qty) && finite(item.qty) && item.useBy.qty < item.qty - 1e-9;

// An item's one pill, the worst: Archived (grey), Expired or "4.50 kg expired" (red: only part of the stock), Low, Use by
// 12 Nov (amber); null when nothing to say.
export function pillOf(item) {
  if (item.archived) return { text: 'Archived', tone: 'none' };
  if (item.useBy?.state === 'expired') return { text: partExpired(item) ? `${qtyText(item.useBy.qty, item.unit)} expired` : 'Expired', tone: 'warn' };
  if (item.low) return { text: 'Low', tone: 'amber' };
  if (item.useBy?.state === 'soon') return { text: `Use by ${dayText(item.useBy.date)}`, tone: 'amber' };
  return null;
}
// The In stock tile's use-by line: "4.50 kg expired 1 Nov" (red), "3.00 kg use by 12 Nov" (amber); without a qty the day
// alone. The figure itself is toned only for Low (it is about the whole figure). null with no use-by near.
export function useByLine(item) {
  const u = item.useBy;
  if (!u?.state) return null;
  const expired = u.state === 'expired';
  const day = dayText(u.date);
  if (!finite(u.qty)) return { text: `${expired ? 'Expired' : 'Use by'} ${day}`, tone: expired ? 'warn' : 'amber' };
  return { text: `${qtyText(u.qty, item.unit)} ${expired ? 'expired' : 'use by'} ${day}`, tone: expired ? 'warn' : 'amber' };
}
export function lotPill(lot) {
  if (lot.state === 'expired') return { text: 'Expired', tone: 'warn' };
  if (lot.state === 'soon') return { text: `Use by ${dayText(lot.useBy)}`, tone: 'amber' };
  return null;
}

// Last counted in words ("today", "3 days ago", "10 days ago": the column head says Last counted); stale (muted) over 7 days or never: a reminder, not a fault, so never amber.
export function countedText(at, now) {
  if (!finite(at)) return { text: 'never', stale: true };
  const days = daysFrom(farmDate(at), farmDate(now));
  if (days <= 0) return { text: 'today', stale: false };
  if (days === 1) return { text: 'yesterday', stale: false };
  if (days <= 7) return { text: `${days} days ago`, stale: false };
  return { text: `${days} days ago`, stale: true };
}

// The list's line under a name on a phone (audit #12): "Reorder at 2.00 L · counted today", "Counted 10 days ago".
export function metaLine(item, now) {
  const c = countedText(item.lastCountedAt, now);
  const counted = c.text === 'never' ? 'never counted' : `counted ${c.text}`;
  if (item.reorderAt === null || item.reorderAt === undefined) return counted[0].toUpperCase() + counted.slice(1);
  return `Reorder at ${qtyText(item.reorderAt, item.unit)}${DOT}${counted}`;
}

// Whether an item (not archived) is one an attention part counts: 'low', 'soon' (its worst use-by), 'expired'; any item
// for no key.
export function needsLook(item, key) {
  if (!key) return true;
  if (item.archived) return false;
  return key === 'low' ? Boolean(item.low) : item.useBy?.state === key;
}

// The attention line's parts: "2 low" and "1 to use by 12 Nov" amber, "1 expired" red. items: the list (a lone soon item's day).
export function attentionParts(attention, items = []) {
  const parts = [];
  if (attention?.low) parts.push({ key: 'low', text: `${attention.low} low`, tone: 'amber' });
  if (attention?.soon) {
    const dates = items.filter((i) => !i.archived && i.useBy?.state === 'soon').map((i) => i.useBy.date).sort();
    parts.push({ key: 'soon', text: attention.soon === 1 && dates.length ? `1 to use by ${dayText(dates[0])}` : `${attention.soon} to use within 7 days`, tone: 'amber' });
  }
  if (attention?.expired) parts.push({ key: 'expired', text: `${attention.expired} expired`, tone: 'warn' });
  return parts;
}

// The list's groups in the contract's order of kinds (an empty kind left out); in a group the items with a pill first,
// each part in the order given (the server's: by name).
export function groupItems(items) {
  return KIND_ORDER.map((kind) => {
    const list = items.filter((i) => i.kind === kind);
    const first = list.filter((i) => !i.archived && pillOf(i));
    return { kind, name: KIND_NAMES[kind], items: [...first, ...list.filter((i) => !first.includes(i))] };
  }).filter((g) => g.items.length);
}

// The Item picker's groups (an <optgroup> each): the kinds in the list's order, the items in the order given (the server's:
// by name). → [{ kind, label, items }]
export const itemGroups = (items) => KIND_ORDER.map((kind) => ({ kind, label: KIND_NAMES[kind], items: items.filter((i) => i.kind === kind) }))
  .filter((g) => g.items.length);

// Under the Item box: "1.20 L in stock" ('' with no item picked). In the hint, not the option, so a phone never cuts it.
export const stockHint = (item) => (item ? `${qtyText(item.qty, item.unit)} in stock` : '');

// The line a page shows after a record (audit #2), with Undo for a new purchase, use, throw-out or count for UNDO_MS.
export const UNDO_MS = 60_000;
export function doneText({ kind, qty, unit, name, room = null, worker = null, count = 0 }) {
  const by = worker ? ` by ${worker}` : '';
  if (kind === 'use') return `Used ${qtyText(qty, unit)} of ${name}${room ? ` in ${room}` : ''}${by}`;
  if (kind === 'purchase') return `Bought ${qtyText(qty, unit)} of ${name}`;
  if (kind === 'throwOut') return `Threw out ${qtyText(qty, unit)} of ${name}${by}`;
  if (kind === 'count') return `Saved ${count} count${count === 1 ? '' : 's'}${by}`;
  if (kind === 'added') return `Added ${name}`;
  if (kind === 'deleted') return name ? `Deleted ${name}` : 'Deleted';
  return 'Saved';
}
// What is left of Undo's minute for a record saved at `at` (ms), at `now`; 0 when over or unknown.
export const undoLeft = (at, now) => (finite(at) ? Math.max(0, Math.min(UNDO_MS, UNDO_MS - (now - at))) : 0);

// A lot's name: "Bought 1 Nov", "Batch 14", "Count 3 Nov".
export function lotLabel(lot) {
  if (lot.refKind === 'batch') return `Batch ${lot.refId}`;
  if (lot.refKind === 'adjust') return `Count ${dayText(farmDate(lot.at))}`;
  return `Bought ${dayText(farmDate(lot.at))}`;
}

const joined = (...parts) => parts.filter(Boolean).join(DOT);

// A history row: { when ("3 Nov" for a purchase, "3 Nov 08:12" else), what, qty (signed), edit: 'edit' (a purchase or a
// use), 'delete' (a count: deleted, not edited) or null (a batch move: Batches') }.
export function moveLine(m, item) {
  const when = m.refKind === 'purchase' ? dayText(farmDate(m.at)) : `${dayText(farmDate(m.at))} ${farmTime(m.at)}`;
  let what;
  if (m.refKind === 'purchase') what = joined(m.supplier ? `Bought from ${m.supplier}` : 'Bought', rmText(m.total), m.useBy && `use by ${dayText(m.useBy)}`);
  else if (m.refKind === 'adjust') what = joined(`Counted ${qtyText(m.counted, item.unit)}`, m.worker);
  else if (m.refKind === 'batch') what = joined(`Batch ${m.refId}`, m.qty > 0 ? 'received' : item.kind === 'blocks' ? `into ${m.roomName ?? 'a room'}` : 'made');
  else if (m.lotId !== null && m.lotId !== undefined) what = joined('Thrown out', m.reason === 'Expired' ? 'expired' : null, m.worker);
  else what = joined(m.roomId === null || m.roomId === undefined ? 'Used' : `Used in ${m.roomName ?? 'a deleted room'}`, m.reason, m.worker);
  const edit = m.refKind === 'batch' ? null : m.refKind === 'adjust' ? 'delete' : 'edit';
  return { when, what, qty: qtyText(m.qty, item.unit, { signed: true }), edit };
}

// The Delete confirm: "Delete the purchase of 5.00 L of Bleach on 3 Nov?"; its lead (null for none).
export function deleteTitle(m, item) {
  const day = dayText(farmDate(m.at));
  if (m.refKind === 'adjust') return `Delete the count of ${item.name} on ${day}?`;
  const what = m.refKind === 'purchase' ? 'purchase' : m.lotId !== null && m.lotId !== undefined ? 'throw-out' : 'use';
  return `Delete the ${what} of ${qtyText(Math.abs(m.qty), item.unit)} of ${item.name} on ${day}?`;
}
export function deleteLead(m, { throwOuts = false } = {}) {
  if (m.refKind === 'adjust') return 'In stock goes back to what the records said without it.';
  return m.refKind === 'purchase' && throwOuts ? 'The throw-outs taken from it go with it.' : null;
}

// The Throw out confirm.
export const throwOutTitle = (lot, item) => `Throw out ${qtyText(lot.left, item.unit)} of ${item.name} bought ${dayText(farmDate(lot.at))}?`;
export const throwOutLead = (lot) => `Its use-by ${lot.state === 'expired' ? 'was' : 'is'} ${dayText(lot.useBy)}.`;

// ---- the dialogs' bodies: { …body } or { error, field } ----

// A number typed for the unit: whole for pcs, g, mL and blocks; up to 2 decimals for kg and L; a point, never a comma.
export function numberIn(text, unit, { zero = false, label = 'qty' } = {}) {
  const s = String(text ?? '').trim();
  if (s === '') return { error: `Give the ${label}` };
  const whole = WHOLE_UNITS.includes(unit);
  const n = (whole ? /^[0-9]{1,6}$/ : /^[0-9]{1,6}(\.[0-9]{1,2})?$/).test(s) ? Number(s) : NaN;
  if ((zero ? n >= 0 : n > 0) && n <= MAX_QTY) return { value: n };
  const from = zero ? 'from 0' : 'over 0';
  return { error: whole ? `Give a whole number of ${unit} ${from} up to 100,000` : `Give the ${unit} as a number ${from} up to 100,000, at most 2 decimals` };
}
const textIn = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};
const tooLong = (s) => s !== null && s.length > MAX_TEXT;

// Add or Edit item. A block item (Batches') sends its level only.
export function itemBody(values, item = null) {
  const blocks = item?.kind === 'blocks';
  const unit = blocks ? item.unit : values.unit;
  const body = {};
  if (!blocks) {
    const name = textIn(values.name);
    if (!name) return { error: 'Give the name', field: 'name' };
    if (tooLong(name)) return { error: `The name must be at most ${MAX_TEXT} characters`, field: 'name' };
    Object.assign(body, { name, kind: values.kind, unit });
    if (values.kind === 'chemical') {
      for (const [field, label] of [['ingredient', 'active ingredient'], ['lrmpNo', 'LRMP No.']]) {
        const s = textIn(values[field]);
        if (tooLong(s)) return { error: `The ${label} must be at most ${MAX_TEXT} characters`, field };
        body[field] = s;
      }
    }
  }
  if (textIn(values.reorderAt) === null) {
    body.reorderAt = null;
  } else {
    const r = numberIn(values.reorderAt, unit, { zero: true, label: 'reorder level' });
    if (r.error) return { error: r.error, field: 'reorderAt' };
    body.reorderAt = r.value;
  }
  return body;
}

// Purchase: today is the farm's day (the latest a purchase may be). limitBack false: an Edit leaving the day as stored.
export function purchaseBody(values, item, today, { limitBack = true } = {}) {
  if (!item) return { error: 'Pick an item', field: 'itemId' };
  const qty = numberIn(values.qty, item.unit);
  if (qty.error) return { error: qty.error, field: 'qty' };
  const t = String(values.total ?? '').trim();
  const total = /^[0-9]{1,7}(\.[0-9]{1,2})?$/.test(t) ? Number(t) : NaN;
  if (!(total >= 0 && total <= MAX_TOTAL)) return { error: 'Give the total paid in RM, from 0 to 1,000,000', field: 'total' };
  const supplier = textIn(values.supplier);
  if (tooLong(supplier)) return { error: `The supplier must be at most ${MAX_TEXT} characters`, field: 'supplier' };
  const day = String(values.day ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return { error: 'Pick a day up to today', field: 'day' };
  if (limitBack && day < daysBefore(today, 400)) return { error: 'Pick a day from the last 400 days up to today', field: 'day' };
  const useBy = String(values.useBy ?? '');
  if (useBy && useBy < day) return { error: 'The use-by cannot be before the day it was bought', field: 'useBy' };
  return { itemId: item.id, qty: qty.value, total, supplier, useBy: useBy || null, day };
}

// Record use. shown: the date and time boxes as they opened ({ date, time }); unchanged, the server takes now.
export function useBody(values, item, { now, shown }) {
  if (!item) return { error: 'Pick an item', field: 'itemId' };
  const qty = numberIn(values.qty, item.unit);
  if (qty.error) return { error: qty.error, field: 'qty' };
  const reason = textIn(values.reason);
  if (tooLong(reason)) return { error: `The reason must be at most ${MAX_TEXT} characters`, field: 'reason' };
  if (!values.worker) return { error: 'Pick who used it', field: 'worker' };
  const body = { itemId: item.id, qty: qty.value, roomId: values.roomId ? Number(values.roomId) : null, reason, worker: values.worker };
  const date = String(values.date ?? '');
  const time = normaliseClock(values.time);
  if (date === shown.date && time === shown.time) return body;
  if (Number.isNaN(whenMs(date, '00:00'))) return { error: 'Pick a date', field: 'date' };
  if (date < daysBefore(farmDate(now), 400)) return { error: 'Pick a date from the last 400 days', field: 'date' };
  const at = whenMs(date, time);
  if (Number.isNaN(at)) return { error: 'Give the time as 24 h, like 08:12', field: 'time' };
  if (at > now + 60_000) return { error: 'Pick a time up to now', field: 'time' };
  return { ...body, at };
}

// The Edit dialogs: only what changed (an empty body: nothing to send).
export function purchaseEditBody(values, m, item, today) {
  const full = purchaseBody(values, item, today, { limitBack: String(values.day ?? '') !== farmDate(m.at) });
  if (full.error) return full;
  const was = { qty: m.qty, total: m.total, supplier: m.supplier, useBy: m.useBy, day: farmDate(m.at) };
  return Object.fromEntries(Object.keys(was).filter((k) => full[k] !== was[k]).map((k) => [k, full[k]]));
}
export function useEditBody(values, m, item, { now, shown }) {
  const full = useBody(values, item, { now, shown });
  if (full.error) return full;
  const body = {};
  if (full.qty !== -m.qty) body.qty = full.qty;
  if (full.roomId !== m.roomId) body.roomId = full.roomId;
  if (full.reason !== m.reason) body.reason = full.reason;
  if (full.worker !== m.worker) body.worker = full.worker;
  if ('at' in full) body.at = full.at;
  return body;
}

// Record use asks once when the qty is over what is in stock (a check, not a fault): the words, or null.
export function overStock(qty, item) {
  const has = Math.max(item.qty ?? 0, 0);
  return qty > has + 1e-9 ? `Only ${qtyText(has, item.unit)} in stock. Record ${qtyText(qty, item.unit)} anyway?` : null;
}

// Count stock: entries [{ itemId, unit, text }]; an empty box is skipped. field: 'worker', 'count-<itemId>' or null.
export function countBody(entries, worker) {
  if (!worker) return { error: 'Pick who counted', field: 'worker' };
  const counts = [];
  for (const e of entries) {
    if (String(e.text ?? '').trim() === '') continue;
    const n = numberIn(e.text, e.unit, { zero: true, label: 'count' });
    if (n.error) return { error: n.error, field: `count-${e.itemId}` };
    counts.push({ itemId: e.itemId, qty: n.value });
  }
  if (!counts.length) return { error: 'Type at least one count', field: null };
  return { worker, counts };
}

// Count stock's typed boxes kept in this tab until saved (audit #3): of `saved` ({ itemId: text }, read back from
// sessionStorage), the typed ones of items still to count (on the list, not archived).
export function keptCounts(saved, items) {
  if (!saved || typeof saved !== 'object') return {};
  const open = new Set(items.filter((i) => !i.archived).map((i) => String(i.id)));
  return Object.fromEntries(Object.entries(saved).filter(([id, text]) => open.has(id) && typeof text === 'string' && text.trim() !== ''));
}
// The question before leaving Count stock with typed boxes.
export const leaveText = (n) => `Leave Count stock? ${n} typed count${n === 1 ? ' is' : 's are'} not saved yet.`;

// ---- the myGAP 4-5 sheet (spec 5.1) ----

export const SHEET_TITLE = 'myGAP 4-5 · Purchase and use of pesticides / chemicals (Pembelian dan penggunaan racun perosak / bahan kimia)';
export const SHEET_COLUMNS = ['Date', 'Crop', 'Location & area', 'Trade name & active ingredient', 'LRMP No.', 'Price', 'Qty bought / rate used',
  'Reason for use', 'Equipment', 'Operator', 'PHI (days)', 'Re-entry period'];
// The columns left blank to write in by hand.
export const SHEET_WRITE = [8, 10, 11];
export const SHEET_DAYS = [30, 90, 365];
export const sheetCells = (r) => [
  longDayText(r.date), r.crop, r.location, r.product, r.lrmpNo, r.price === null ? '' : rmText(r.price),
  `${qtyText(r.qty, r.unit)} ${r.kind === 'purchase' ? 'bought' : 'used'}`, r.reason, '', r.operator, '', '',
];
export const sheetRange = ({ from, to }) => `${longDayText(from)} – ${longDayText(to)}`;
export const sheetEmpty = (days) => `No chemical purchases or uses in the last ${days} days.`;
