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

  return {
    list, item, addItem, editItem, removeItem,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
