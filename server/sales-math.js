// Sales' pure parts (spec 2026-11-05-sales-design.md 2, 4 and 5): the checks of a delivery, a buyer and a paid body (each
// throws SalesError with the field of the box), deliveries grouped from their lines, what is owed, the figures per crop and
// per buyer, the summary Costs reads, and the CSV rows. No database, no HTTP.

import { CROP_KEYS, cropShortName } from '../web/crops.js';
import { localDate, localTime } from './task-rules.js';
import { round } from './harvest-math.js';
import { cell } from './csv.js';

export const MAX_KG = 10_000;
export const MAX_PRICE = 1_000;
export const MAX_LINES = 9;
const FIRST_MS = Date.UTC(2020, 0, 1) - 8 * 3_600_000; // 1 Jan 2020 at the farm
const GRACE_MS = 60_000; // a minute for clocks

// A refused request: status 400, 404 or 409; field the input it is about.
export class SalesError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'SalesError';
    this.status = status;
    this.field = field;
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isId = (v) => Number.isSafeInteger(v) && v > 0;
const cropOrder = (a, b) => CROP_KEYS.indexOf(a.crop) - CROP_KEYS.indexOf(b.crop);
// Rows grouped by a key (a Map, first appearance first).
const groupBy = (list, keyOf) => {
  const by = new Map();
  for (const x of list) {
    const k = keyOf(x);
    if (by.has(k)) by.get(k).push(x);
    else by.set(k, [x]);
  }
  return by;
};
const sum = (list, key) => round(list.reduce((s, x) => s + x[key], 0), 2);

// Optional text: empty or missing is null; otherwise trimmed and at most max characters.
function textOf(v, max, field, words, what) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new SalesError(400, `${what} must be text`, field);
  const t = v.trim();
  if (t.length > max) throw new SalesError(400, words, field);
  return t || null;
}

// A time: a whole number of ms from 1 Jan 2020 at the farm to now (a minute's grace).
function timeOf(v, now, field, future) {
  if (!Number.isSafeInteger(v)) throw new SalesError(400, 'Give the date', field);
  if (v < FIRST_MS) throw new SalesError(400, "The date can't be before 2020", field);
  if (v > now + GRACE_MS) throw new SalesError(400, future, field);
  return v;
}

// A delivery's body: { soldAt, buyerId, invoiceNo?, note?, lines: [{ crop, kg, priceKg, roomId? }] }. → { soldAt, buyerId,
// invoiceNo, note, lines: [{ crop, kg, priceKg, total, roomId }] } in the body's order (a field names a line by its index).
// The store checks the buyer and the rooms exist.
export function deliveryBody(body, { now }) {
  if (!isObject(body)) throw new SalesError(400, 'Body must be a JSON object');
  const soldAt = timeOf(body.soldAt, now, 'soldAt', "The sale can't be in the future");
  if (!isId(body.buyerId)) throw new SalesError(400, 'Pick a buyer', 'buyerId');
  const invoiceNo = textOf(body.invoiceNo, 40, 'invoiceNo', 'The reference is at most 40 characters', 'The reference');
  const note = textOf(body.note, 200, 'note', 'A note is at most 200 characters', 'A note');
  if (!Array.isArray(body.lines) || body.lines.length === 0) throw new SalesError(400, 'Add at least one crop', 'lines');
  if (body.lines.length > MAX_LINES) throw new SalesError(400, `At most ${MAX_LINES} crops in a sale`, 'lines');
  const seen = new Set();
  const lines = body.lines.map((l, i) => {
    const at = `lines.${i}`;
    if (!isObject(l) || !CROP_KEYS.includes(l.crop)) throw new SalesError(400, 'Pick a crop', `${at}.crop`);
    if (seen.has(l.crop)) throw new SalesError(400, 'This crop is on another line', `${at}.crop`);
    seen.add(l.crop);
    const kg = isNumber(l.kg) ? round(l.kg, 2) : NaN;
    if (!(kg > 0 && kg <= MAX_KG)) throw new SalesError(400, 'kg must be a number over 0 up to 10,000', `${at}.kg`);
    const priceKg = isNumber(l.priceKg) && l.priceKg >= 0 ? round(l.priceKg, 2) : NaN;
    if (!(priceKg >= 0 && priceKg <= MAX_PRICE)) throw new SalesError(400, 'RM per kg must be 0 to 1,000', `${at}.priceKg`);
    const roomId = l.roomId === undefined || l.roomId === null ? null : l.roomId;
    if (roomId !== null && !isId(roomId)) throw new SalesError(400, 'Pick a room or Mixed', `${at}.roomId`);
    return { crop: l.crop, kg, priceKg, total: round(kg * priceKg, 2), roomId };
  });
  return { soldAt, buyerId: body.buyerId, invoiceNo, note, lines };
}

// A buyer's body: { name, phone?, note?, prices? } (partial: only the keys given, and archived). prices: { <crop>: RM per kg }
// with an empty value (null, '') left out. → the fields.
export function buyerBody(body, { partial = false } = {}) {
  if (!isObject(body)) throw new SalesError(400, 'Body must be a JSON object');
  const out = {};
  if (!partial || 'name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new SalesError(400, 'Give the buyer a name', 'name');
    if (name.length > 60) throw new SalesError(400, 'A name is at most 60 characters', 'name');
    out.name = name;
  }
  if (!partial || 'phone' in body) out.phone = textOf(body.phone, 30, 'phone', 'A phone number is at most 30 characters', 'A phone number');
  if (!partial || 'note' in body) out.note = textOf(body.note, 200, 'note', 'A note is at most 200 characters', 'A note');
  if (!partial || 'prices' in body) {
    const prices = body.prices ?? {};
    if (!isObject(prices)) throw new SalesError(400, 'Prices must be per crop', 'prices');
    out.prices = {};
    for (const [crop, v] of Object.entries(prices)) {
      if (!CROP_KEYS.includes(crop)) throw new SalesError(400, 'Unknown crop', 'prices');
      if (v === null || v === '') continue;
      const p = isNumber(v) && v >= 0 ? round(v, 2) : NaN;
      if (!(p >= 0 && p <= MAX_PRICE)) throw new SalesError(400, 'RM per kg must be 0 to 1,000', `prices.${crop}`);
      out.prices[crop] = p;
    }
  }
  if (partial && 'archived' in body) {
    if (typeof body.archived !== 'boolean') throw new SalesError(400, 'archived must be true or false', 'archived');
    out.archived = body.archived;
  }
  return out;
}

// Mark paid or unpaid: { paidAt: ms | null }. Paid not before the sale's farm day and not in the future. → ms or null.
export function paidBody(body, { soldAt, now }) {
  if (!isObject(body) || !('paidAt' in body)) throw new SalesError(400, 'Give the day it was paid', 'paidAt');
  if (body.paidAt === null) return null;
  if (!isNumber(soldAt)) throw new SalesError(400, 'Sale not found');
  const paidAt = timeOf(body.paidAt, now, 'paidAt', "Paid can't be in the future");
  if (localDate(paidAt) < localDate(soldAt)) throw new SalesError(400, 'Paid before the sale', 'paidAt');
  return paidAt;
}

// Deliveries from their lines (db rows), newest first. rooms: Map id → { name }; runs: Map id → { startedAt }; buyers: Map
// id → { archived }. A delivery: { id, soldAt, buyerId, buyer, buyerArchived, invoiceNo, note, paidAt, kg, total, lines }.
export function deliveriesOf(rows, { rooms = new Map(), runs = new Map(), buyers = new Map() } = {}) {
  return [...groupBy(rows, (r) => r.deliveryId).entries()].map(([id, own]) => {
    const [h] = own;
    const lines = [...own].sort(cropOrder).map((l) => ({
      id: l.id, crop: l.crop, kg: l.kg, priceKg: l.priceKg, total: l.total, roomId: l.roomId,
      roomName: l.roomId === null ? null : rooms.get(l.roomId)?.name ?? null, runId: l.runId,
      runStartedAt: l.runId === null ? null : runs.get(l.runId)?.startedAt ?? null,
    }));
    return {
      id, soldAt: h.soldAt, buyerId: h.buyerId, buyer: h.buyer, buyerArchived: buyers.get(h.buyerId)?.archived ?? false,
      invoiceNo: h.invoiceNo, note: h.note, paidAt: h.paidAt, kg: sum(own, 'kg'), total: sum(own, 'total'), lines,
    };
  }).sort((a, b) => b.soldAt - a.soldAt || b.id - a.id);
}

// What is owed: the unpaid deliveries (any order) by buyer, most owed first, each buyer's deliveries oldest first. → { total,
// count, oldestAt (null when none), buyers: [{ buyerId, buyer, total, count, oldestAt, deliveries }] }.
export function owedOf(unpaid) {
  const oldestFirst = unpaid.filter((d) => d.paidAt === null).sort((a, b) => a.soldAt - b.soldAt || a.id - b.id);
  const buyers = [...groupBy(oldestFirst, (d) => d.buyerId).entries()].map(([buyerId, list]) => ({
    buyerId, buyer: list[list.length - 1].buyer, total: sum(list, 'total'), count: list.length, oldestAt: list[0].soldAt, deliveries: list,
  })).sort((a, b) => b.total - a.total || a.buyer.localeCompare(b.buyer));
  return { total: sum(oldestFirst, 'total'), count: oldestFirst.length, oldestAt: oldestFirst[0]?.soldAt ?? null, buyers };
}

// Per crop over a period: the sale lines and the harvests in it, the Settings → Yield prices. → [{ crop, kg, harvestedKg,
// total, avgPriceKg (null with no kg sold), expectedPriceKg (null when not set) }] in the crop list's order.
export function byCropOf(rows, harvests, cropYield) {
  const crops = CROP_KEYS.filter((c) => rows.some((r) => r.crop === c) || harvests.some((h) => h.crop === c && h.kg > 0));
  return crops.map((crop) => {
    const own = rows.filter((r) => r.crop === crop);
    const kg = sum(own, 'kg');
    const total = sum(own, 'total');
    const expected = cropYield?.[crop]?.priceKg;
    return {
      crop, kg, harvestedKg: sum(harvests.filter((h) => h.crop === crop), 'kg'), total,
      avgPriceKg: kg > 0 ? round(total / kg, 2) : null, expectedPriceKg: isNumber(expected) ? expected : null,
    };
  });
}

// Per buyer over a period's deliveries, with what each owes all time (owedOf). Most income first.
export function byBuyerOf(deliveries, owed) {
  return [...groupBy(deliveries, (d) => d.buyerId).entries()].map(([buyerId, list]) => ({
    buyerId, buyer: list[0].buyer, kg: sum(list, 'kg'), total: sum(list, 'total'),
    owed: owed.buyers.find((b) => b.buyerId === buyerId)?.total ?? 0,
  })).sort((a, b) => b.total - a.total || a.buyer.localeCompare(b.buyer));
}

// The summary Costs reads (contract section 5): exactly { kg, total, byCrop: [{ crop, kg, total }], byRun: [{ runId, kg,
// total }] }; a line with no run is in the totals and byCrop only.
export function summaryOf(rows) {
  const byCrop = [...groupBy(rows, (r) => r.crop)].map(([crop, own]) => ({ crop, kg: sum(own, 'kg'), total: sum(own, 'total') })).sort(cropOrder);
  const byRun = [...groupBy(rows.filter((r) => r.runId !== null), (r) => r.runId)].map(([runId, own]) => ({ runId, kg: sum(own, 'kg'), total: sum(own, 'total') }))
    .sort((a, b) => a.runId - b.runId);
  return { kg: sum(rows, 'kg'), total: sum(rows, 'total'), byCrop, byRun };
}

export const CSV_HEADER = 'date,time,buyer,reference,crop,room,run started,kg,price per kg,total,paid on,note';

// The CSV's lines (the header first): one row per sale line, oldest first.
export function csvRows(deliveries) {
  const rows = [...deliveries].sort((a, b) => a.soldAt - b.soldAt || a.id - b.id).flatMap((d) => d.lines.map((l) => [
    localDate(d.soldAt), localTime(d.soldAt), d.buyer, d.invoiceNo, cropShortName(l.crop), l.roomName ?? 'Mixed',
    l.runStartedAt === null ? '' : localDate(l.runStartedAt), l.kg, l.priceKg, l.total, d.paidAt === null ? '' : localDate(d.paidAt), d.note,
  ].map(cell).join(',')));
  return [CSV_HEADER, ...rows];
}
