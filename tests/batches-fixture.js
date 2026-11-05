import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

// Inventory's two tables by the contract's columns (section 5), as Inventory's own step will make them: the Batches tests
// make them to see the stock moves (spec 2026-11-05-batches-design.md 3.1).
export const STOCK = `
CREATE TABLE stock_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, unit TEXT NOT NULL, reorder_at REAL) STRICT;
CREATE TABLE stock_moves (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, at INTEGER NOT NULL, qty REAL NOT NULL, unit_cost REAL,
  ref_kind TEXT NOT NULL, ref_id INTEGER, note TEXT) STRICT;`;


// A farm database that already has Inventory's tables (made first, as a merged farm's would be), removed after the test.
export function openWithStock(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-batches-'));
  const path = join(dir, 'stock.db');
  const raw = new DatabaseSync(path);
  raw.exec(STOCK);
  raw.close();
  const db = openDb(path);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}
