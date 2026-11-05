import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

// Inventory's two tables by the contract's columns (section 5), as Inventory's own step will make them: the Batches tests
// make them to see the stock moves (spec 2026-11-05-batches-design.md 3.1).
export const STOCK = `
CREATE TABLE stock_items (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('blocks', 'spawn', 'bags', 'chemical', 'packaging', 'other')),
  unit TEXT NOT NULL, reorder_at REAL, ingredient TEXT, lrmp_no TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)), low_sent_at INTEGER
) STRICT;
CREATE UNIQUE INDEX stock_items_name ON stock_items (name COLLATE NOCASE);
CREATE TABLE stock_moves (
  id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES stock_items (id), at INTEGER NOT NULL, qty REAL NOT NULL, unit_cost REAL,
  ref_kind TEXT NOT NULL CHECK (ref_kind IN ('purchase', 'use', 'batch', 'adjust')), ref_id INTEGER, note TEXT, total REAL,
  supplier TEXT, use_by TEXT, room_id INTEGER, reason TEXT, worker TEXT, counted REAL, lot_id INTEGER, use_by_sent_at INTEGER
) STRICT;`;

// A farm database that already has Inventory's tables (made first, as a merged farm's would be), removed after the test, and
// Inventory's side of them as its own pages would write it: item(name, kind, unit) → the item's id; buy(itemId, unitCost, at)
// a purchase of 100 at that price (the made price per block reads the latest); move(itemId, { at, unitCost, refKind }) any other
// move; archive(itemId).
export function openWithInventory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-batches-'));
  const path = join(dir, 'stock.db');
  const raw = new DatabaseSync(path);
  raw.exec(STOCK);
  const db = openDb(path);
  t.after(() => { raw.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });
  return {
    db,
    item: (name, kind = 'other', unit = 'kg') => Number(raw.prepare('INSERT INTO stock_items (name, kind, unit, reorder_at) VALUES (?, ?, ?, NULL)').run(name, kind, unit).lastInsertRowid),
    move: (itemId, { at = 1000, qty = 1, unitCost = null, refKind = 'adjust' } = {}) => {
      raw.prepare('INSERT INTO stock_moves (item_id, at, qty, unit_cost, ref_kind) VALUES (?, ?, ?, ?, ?)').run(itemId, at, qty, unitCost, refKind);
    },
    archive: (itemId) => { raw.prepare('UPDATE stock_items SET archived = 1 WHERE id = ?').run(itemId); },
    buy(itemId, unitCost, at = 1000) {
      raw.prepare("INSERT INTO stock_moves (item_id, at, qty, unit_cost, ref_kind, ref_id, note) VALUES (?, ?, 100, ?, 'purchase', NULL, NULL)").run(itemId, at, unitCost);
    },
  };
}

// A farm database that already has Inventory's tables (openWithInventory's, without its helpers).
export const openWithStock = (t) => openWithInventory(t).db;
