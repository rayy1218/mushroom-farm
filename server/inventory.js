// Inventory (spec 2026-11-05-inventory-design.md 4 and 7): stock items, purchases, uses, counts and throw-outs with their
// checks, and the views the routes send. Batch moves are Batches' (contract section 7): shown, never written or changed
// here. No HTTP.

import { localDate, dayStart, addDays } from './task-rules.js';
import { checkWorker } from './tasks.js';
import { CROPS, CROP_KEYS, cropShortName } from '../web/crops.js';
import { KINDS, ITEM_UNITS, WHOLE_UNITS, itemView, attentionOf, sheetRows, stockOf, round3 } from './inventory-math.js';

// The names Batches gives its block items ("<crop> blocks", by the crop's short name or its full name), lower case. Batches
// finds or makes that item with `WHERE kind = 'blocks' AND name = ?`; a worker's own item of such a name (any case) would
// make its insert fail on the unique NOCASE name index, so Inventory keeps these names free.
const BLOCK_NAMES = new Set(CROP_KEYS.flatMap((key) => [cropShortName(key), CROPS[key].name].map((n) => `${n} blocks`.toLowerCase())));

export const MAX_QTY = 100_000;
export const MAX_TOTAL = 1_000_000;
export const MAX_TEXT = 60;
export const BACK_DAYS = 400;
export const SHEET_DAYS = [30, 90, 365];
const MAX_COUNTS = 500;
const SUGGESTED = 20; // earlier suppliers and reasons offered in the dialogs
const DAY_MS = 86_400_000;
const NOON_MS = 12 * 3_600_000;
const MOVE_FIELDS = ['id', 'at', 'qty', 'refKind', 'refId', 'note', 'total', 'unitCost', 'supplier', 'useBy', 'roomId', 'reason', 'worker', 'counted', 'lotId'];

// A refused request: status 400, 404 or 409, field the input it is about (the routes reply { error, field }).
export class InventoryError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'InventoryError';
    this.status = status;
    this.field = field;
  }
}

const bodyOf = (body) => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new InventoryError(400, 'Body must be a JSON object');
  return body;
};
const given = (v) => v !== undefined;
// A real farm day, 'YYYY-MM-DD'.
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && localDate(dayStart(s)) === s;

// A short text: trimmed, up to MAX_TEXT characters, no control characters; empty is null (refused when required).
function textOf(v, field, label, required = false) {
  const s = typeof v === 'string' ? v.trim() : v;
  if (s === undefined || s === null || s === '') {
    if (required) throw new InventoryError(400, `Give the ${label}`, field);
    return null;
  }
  if (typeof s !== 'string' || s.length > MAX_TEXT || /[\u0000-\u001f\u007f]/.test(s)) {
    throw new InventoryError(400, `The ${label} must be text of at most ${MAX_TEXT} characters`, field);
  }
  return s;
}

// A qty in the item's unit: whole numbers for pcs, g, mL and blocks, up to 2 decimals for kg and L; over 0 (from 0 for a
// count or a reorder level) up to MAX_QTY.
function qtyOf(v, unit, field = 'qty', { zero = false } = {}) {
  const places = WHOLE_UNITS.includes(unit) ? 0 : 2;
  const scaled = typeof v === 'number' && Number.isFinite(v) ? v * 10 ** places : NaN;
  const fits = Math.abs(scaled - Math.round(scaled)) < 1e-6;
  if (!(fits && (zero ? v >= 0 : v > 0) && v <= MAX_QTY)) {
    const from = zero ? 'from 0' : 'over 0';
    throw new InventoryError(400, places
      ? `Give the ${unit} as a number ${from} up to 100,000, at most 2 decimals`
      : `Give a whole number of ${unit} ${from} up to 100,000`, field);
  }
  return Math.round(scaled) / 10 ** places;
}

const reorderOf = (v, unit) => (v === null || v === undefined ? null : qtyOf(v, unit, 'reorderAt', { zero: true }));

// The total paid: RM 0 to MAX_TOTAL, at most 2 decimals.
function totalOf(v) {
  const ok = typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_TOTAL && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  if (!ok) throw new InventoryError(400, 'Give the total paid in RM, from 0 to 1,000,000', 'total');
  return Math.round(v * 100) / 100;
}

const unitCost = (total, qty) => Math.round((total / qty) * 1e6) / 1e6;
const byKindThenName = (a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

// The first SUGGESTED different texts (case aside), in the order given.
function distinct(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length === SUGGESTED) break;
  }
  return out;
}

// db: the farm database; now injectable. onChange(fn(itemId)) hears every write (itemId of the item it was about).
export function createInventory({ db, now = Date.now, log = console.error }) {
  const listeners = new Set();
  function tell(itemId) {
    for (const fn of [...listeners]) {
      try { fn(itemId); } catch (err) { log(err); }
    }
  }
  const today = () => localDate(now());

  function itemOf(id) {
    const item = Number.isInteger(id) ? db.stockItem(id) : null;
    if (!item) throw new InventoryError(404, 'No such item');
    return item;
  }
  function moveOf(id) {
    const m = Number.isInteger(id) ? db.stockMove(id) : null;
    if (!m) throw new InventoryError(404, 'No such record');
    return m;
  }
  const roomNames = () => new Map(db.listRooms().map((r) => [r.id, r.name]));
  // Every move, by item.
  function movesByItem() {
    const by = new Map();
    for (const m of db.stockMoves()) {
      if (!by.has(m.itemId)) by.set(m.itemId, []);
      by.get(m.itemId).push(m);
    }
    return by;
  }
  // The suppliers of earlier purchases (any item), newest first.
  const suppliers = () => distinct(db.stockMoves().filter((m) => m.refKind === 'purchase').reverse().map((m) => m.supplier));

  // ---- views ----

  // The list: { items (no lots), attention, archivedCount, suppliers }; archived items only when asked.
  function list({ archived = false } = {}) {
    const by = movesByItem();
    const views = db.stockItems().map((item) => itemView(item, by.get(item.id) ?? [], now()));
    return {
      items: views.filter((v) => archived || !v.archived).sort(byKindThenName).map(({ lots, ...v }) => v),
      attention: attentionOf(views),
      archivedCount: views.filter((v) => v.archived).length,
      suppliers: suppliers(),
    };
  }

  // An item's page: its view with its lots, its moves newest first (roomName: a use's room; a batch move's, its batch's room
  // when Batches' table is there; null for none or a deleted room), the earlier suppliers and the item's earlier reasons.
  function item(id) {
    const it = itemOf(id);
    const moves = db.itemStockMoves(it.id);
    const rooms = roomNames();
    const batchIds = [...new Set(moves.filter((m) => m.refKind === 'batch' && m.refId !== null).map((m) => m.refId))];
    const batchRooms = db.batchRooms(batchIds);
    const roomName = (m) => {
      const roomId = m.refKind === 'batch' ? batchRooms.get(m.refId) ?? null : m.roomId;
      return roomId === null ? null : rooms.get(roomId) ?? null;
    };
    return {
      ...itemView(it, moves, now()),
      moves: moves.slice().reverse().map((m) => ({ ...Object.fromEntries(MOVE_FIELDS.map((f) => [f, m[f]])), roomName: roomName(m) })),
      suppliers: suppliers(),
      reasons: distinct(moves.filter((m) => m.refKind === 'use' && m.lotId === null).reverse().map((m) => m.reason)),
    };
  }

  // ---- items ----

  function nameOf(v, id = null) {
    const name = textOf(v, 'name', 'name', true);
    // A block item (Batches') keeps its own name on rename (editItem refuses block items before it gets here).
    if (BLOCK_NAMES.has(name.toLowerCase())) throw new InventoryError(400, 'That name is kept for the block item Batches makes', 'name');
    if (db.stockNameUsed(name, id)) throw new InventoryError(400, `There is already an item called ${name}`, 'name');
    return name;
  }
  function kindOf(v) {
    if (!KINDS.includes(v) || v === 'blocks') throw new InventoryError(400, 'Pick a kind', 'kind');
    return v;
  }
  function unitOf(v) {
    if (!ITEM_UNITS.includes(v)) throw new InventoryError(400, 'Pick a unit', 'unit');
    return v;
  }
  const ingredientOf = (v) => textOf(v, 'ingredient', 'active ingredient');
  const lrmpOf = (v) => textOf(v, 'lrmpNo', 'LRMP No.');

  // { name, kind (not blocks), unit, reorderAt?, ingredient?, lrmpNo? } → the item's view.
  function addItem(body) {
    const b = bodyOf(body);
    const name = nameOf(b.name);
    const kind = kindOf(b.kind);
    const unit = unitOf(b.unit);
    const chemical = kind === 'chemical';
    const made = db.insertStockItem({
      name, kind, unit, reorderAt: reorderOf(b.reorderAt, unit),
      ingredient: chemical ? ingredientOf(b.ingredient) : null, lrmpNo: chemical ? lrmpOf(b.lrmpNo) : null,
    });
    tell(made.id);
    return itemView(made, [], now());
  }

  // Any of name, kind, unit (only while the item has no moves), reorderAt, ingredient, lrmpNo, archived. A block item
  // (Batches') takes its reorder level only. → the item's view.
  function editItem(id, body) {
    const it = itemOf(id);
    const b = bodyOf(body);
    const moves = db.itemStockMoves(it.id);
    if (it.kind === 'blocks') {
      if (['name', 'kind', 'unit', 'ingredient', 'lrmpNo', 'archived'].some((k) => given(b[k]))) {
        throw new InventoryError(409, "A block item is Batches': only its reorder level changes here");
      }
      const saved = db.updateStockItem(it.id, { ...it, reorderAt: given(b.reorderAt) ? reorderOf(b.reorderAt, it.unit) : it.reorderAt });
      tell(it.id);
      return itemView(saved, moves, now());
    }
    const kind = given(b.kind) ? kindOf(b.kind) : it.kind;
    const unit = given(b.unit) ? unitOf(b.unit) : it.unit;
    if (unit !== it.unit && moves.length) throw new InventoryError(409, 'The unit cannot change once the item has records', 'unit');
    if (given(b.archived) && typeof b.archived !== 'boolean') throw new InventoryError(400, 'Archived must be true or false', 'archived');
    const chemical = kind === 'chemical';
    const saved = db.updateStockItem(it.id, {
      name: given(b.name) ? nameOf(b.name, it.id) : it.name, kind, unit,
      reorderAt: reorderOf(given(b.reorderAt) ? b.reorderAt : it.reorderAt, unit),
      ingredient: !chemical ? null : given(b.ingredient) ? ingredientOf(b.ingredient) : it.ingredient,
      lrmpNo: !chemical ? null : given(b.lrmpNo) ? lrmpOf(b.lrmpNo) : it.lrmpNo,
      archived: given(b.archived) ? b.archived : it.archived,
    });
    tell(it.id);
    return itemView(saved, moves, now());
  }

  // Only an item with no moves (else archive it).
  function removeItem(id) {
    const it = itemOf(id);
    if (db.itemStockMoves(it.id).length) throw new InventoryError(409, 'Archive it instead: it has records');
    db.deleteStockItem(it.id);
    tell(it.id);
  }

  // ---- moves ----

  function roomOf(v) {
    if (v === null || v === undefined) return null;
    if (!Number.isInteger(v) || !db.listRooms().some((r) => r.id === v)) throw new InventoryError(400, 'Pick a room', 'roomId');
    return v;
  }
  // When a use happened: now when not given; not in the future (a minute's grace for a clock), not over BACK_DAYS ago.
  function atOf(v) {
    const t = now();
    if (v === undefined || v === null) return t;
    if (!Number.isInteger(v) || v > t + 60_000 || v < t - BACK_DAYS * DAY_MS) {
      throw new InventoryError(400, 'Pick a time from the last 400 days up to now', 'at');
    }
    return v;
  }
  // A purchase's day: today (the time now) or an earlier day of the last BACK_DAYS (12:00 of it).
  function dayAt(v) {
    const d = today();
    if (v === undefined || v === null || v === d) return now();
    if (!isDay(v) || v > d || v < addDays(d, -BACK_DAYS)) throw new InventoryError(400, 'Pick a day from the last 400 days up to today', 'day');
    return dayStart(v) + NOON_MS;
  }
  // A use-by: none, or a date not before the day bought (`at`).
  function useByOf(v, at) {
    if (v === undefined || v === null || v === '') return null;
    if (!isDay(v)) throw new InventoryError(400, 'Give the use-by as a date', 'useBy');
    if (v < localDate(at)) throw new InventoryError(400, 'The use-by cannot be before the day it was bought', 'useBy');
    return v;
  }
  const workerOf = (v) => checkWorker(db, v); // the tasks' rule (400, field 'worker')
  const supplierOf = (v) => textOf(v, 'supplier', 'supplier');
  const reasonOf = (v) => textOf(v, 'reason', 'reason');
  function openItem(id) {
    const it = itemOf(id);
    if (it.archived) throw new InventoryError(409, 'Bring the item back first: it is archived');
    return it;
  }

  // { itemId, qty, total, supplier?, useBy?, day? } → the move. Not a block item: Batches brings blocks in.
  function purchase(body) {
    const b = bodyOf(body);
    const it = openItem(b.itemId);
    if (it.kind === 'blocks') throw new InventoryError(409, 'Blocks come in from Batches');
    const qty = qtyOf(b.qty, it.unit);
    const total = totalOf(b.total);
    const at = dayAt(b.day);
    const [move] = db.insertStockMoves([{
      itemId: it.id, at, qty, refKind: 'purchase', total, unitCost: unitCost(total, qty), supplier: supplierOf(b.supplier), useBy: useByOf(b.useBy, at),
    }]);
    tell(it.id);
    return move;
  }

  // { itemId, qty (the amount used, over 0), roomId?, reason?, worker, at? } → the move (its qty under 0).
  function use(body) {
    const b = bodyOf(body);
    const it = openItem(b.itemId);
    const qty = qtyOf(b.qty, it.unit);
    const fields = { roomId: roomOf(b.roomId), reason: reasonOf(b.reason), worker: workerOf(b.worker), at: atOf(b.at) };
    const [move] = db.insertStockMoves([{ itemId: it.id, qty: -qty, refKind: 'use', ...fields }]);
    tell(it.id);
    return move;
  }

  // A purchase's qty, total, supplier, useBy, day; a use's qty, roomId, reason, worker, at. A count is deleted and counted
  // again; a batch move is Batches'. → the move.
  function editMove(id, body) {
    const m = moveOf(id);
    const b = bodyOf(body);
    if (m.refKind === 'batch') throw new InventoryError(409, 'Change it in Batches');
    if (m.refKind === 'adjust') throw new InventoryError(409, 'A count is not edited: delete it and count again');
    const it = db.stockItem(m.itemId);
    let next;
    if (m.refKind === 'purchase') {
      const qty = given(b.qty) ? qtyOf(b.qty, it.unit) : m.qty;
      const total = given(b.total) ? totalOf(b.total) : m.total;
      const at = given(b.day) && b.day !== localDate(m.at) ? dayAt(b.day) : m.at;
      const useBy = useByOf(given(b.useBy) ? b.useBy : m.useBy, at);
      next = {
        ...m, qty, total, unitCost: total === null ? m.unitCost : unitCost(total, qty), at,
        supplier: given(b.supplier) ? supplierOf(b.supplier) : m.supplier, useBy, useBySentAt: useBy === m.useBy ? m.useBySentAt : null,
      };
    } else {
      next = {
        ...m, qty: given(b.qty) ? -qtyOf(b.qty, it.unit) : m.qty, roomId: given(b.roomId) ? roomOf(b.roomId) : m.roomId,
        reason: given(b.reason) ? reasonOf(b.reason) : m.reason, worker: given(b.worker) ? workerOf(b.worker) : m.worker,
        at: given(b.at) ? atOf(b.at) : m.at,
      };
    }
    const saved = db.updateStockMove(m.id, next);
    tell(m.itemId);
    return saved;
  }

  // A purchase (with the throw-outs taken from it), a use or a count; never a batch move.
  function removeMove(id) {
    const m = moveOf(id);
    if (m.refKind === 'batch') throw new InventoryError(409, 'Change it in Batches');
    db.deleteStockMove(m.id);
    tell(m.itemId);
  }

  // What is left of a soon or expired lot, taken from that lot: a use with the reason "Expired" (or "Thrown out" before its
  // day) and lotId. { worker } → the move.
  function throwOut(moveId, body) {
    const b = bodyOf(body);
    const m = moveOf(moveId);
    const it = db.stockItem(m.itemId);
    const lot = itemView(it, db.itemStockMoves(it.id), now()).lots.find((l) => l.moveId === m.id);
    if (!lot) throw new InventoryError(409, 'Nothing is left of it');
    if (!lot.state) throw new InventoryError(409, 'It is not near its use-by');
    const worker = workerOf(b.worker);
    const [move] = db.insertStockMoves([{
      itemId: it.id, at: now(), qty: -lot.left, refKind: 'use', reason: lot.state === 'expired' ? 'Expired' : 'Thrown out', worker, lotId: m.id,
    }]);
    tell(it.id);
    return move;
  }

  // ---- counts, the purchases for Costs, the 4-5 sheet ----

  // { worker, counts: [{ itemId, qty }] }: each a count against the records at this moment (qty: the difference, 0 when it
  // matches; counted: the figure), all in one transaction; one bad entry (field counts.<index>) saves none. → { moves }.
  function count(body) {
    const b = bodyOf(body);
    if (!Array.isArray(b.counts) || b.counts.length === 0 || b.counts.length > MAX_COUNTS) {
      throw new InventoryError(400, 'Give at least one count', 'counts');
    }
    const worker = workerOf(b.worker);
    const at = now();
    const seen = new Set();
    const list = b.counts.map((c, i) => {
      const field = `counts.${i}`;
      const it = c !== null && typeof c === 'object' && Number.isInteger(c.itemId) ? db.stockItem(c.itemId) : null;
      if (!it || it.archived) throw new InventoryError(400, 'No such item', field);
      if (seen.has(it.id)) throw new InventoryError(400, 'That item is counted twice', field);
      seen.add(it.id);
      const counted = qtyOf(c.qty, it.unit, field, { zero: true });
      return { itemId: it.id, at, qty: round3(counted - stockOf(db.itemStockMoves(it.id))), refKind: 'adjust', counted, worker };
    });
    const moves = db.insertStockMoves(list);
    for (const id of seen) tell(id);
    return { moves };
  }

  // The contract's read for Costs: the purchases whose farm day is from–to ('YYYY-MM-DD', inclusive), oldest first.
  function purchases(from, to) {
    if (!isDay(from)) throw new InventoryError(400, 'from must be a date, YYYY-MM-DD', 'from');
    if (!isDay(to)) throw new InventoryError(400, 'to must be a date, YYYY-MM-DD', 'to');
    if (from > to) throw new InventoryError(400, 'from must not be after to', 'from');
    const rows = db.stockPurchasesBetween(dayStart(from), dayStart(addDays(to, 1)) - 1);
    return { purchases: rows.map((m) => ({ id: m.id, itemId: m.itemId, name: m.name, kind: m.kind, at: m.at, qty: m.qty, unitCost: m.unitCost, total: m.total })) };
  }

  // The myGAP 4-5 sheet of the last `days` farm days (today included): { from, to, days, rows } (inventory-math sheetRows).
  function sheet(days) {
    if (!SHEET_DAYS.includes(days)) throw new InventoryError(400, 'days must be 30, 90 or 365', 'days');
    const to = today();
    const from = addDays(to, -(days - 1));
    const start = dayStart(from);
    const end = dayStart(addDays(to, 1)) - 1;
    const items = new Map(db.stockItems().map((i) => [i.id, i]));
    const runs = new Map();
    const runsOf = (roomId) => {
      if (!runs.has(roomId)) runs.set(roomId, db.cropRuns(roomId));
      return runs.get(roomId);
    };
    const moves = db.stockMoves().filter((m) => m.at >= start && m.at <= end);
    return { from, to, days, rows: sheetRows(moves, { items, rooms: roomNames(), runsOf, cropName: cropShortName }) };
  }

  return {
    list, item, addItem, editItem, removeItem, purchase, use, editMove, removeMove, throwOut, count, purchases, sheet,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
