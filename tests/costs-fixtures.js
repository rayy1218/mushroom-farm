// The tables Batches, Inventory and Sales make, with the contract's columns (~/.claude/task-logs/business/CONTRACT.md 5),
// for Costs' tests before those modules merge. add(raw, rows) puts rows in them, and also in the modules' real tables once
// they exist (after the merge): a column those require and a row leaves out is filled (Batches' created_at and placed_at,
// Sales' delivery_id, buyer_id with its buyers row, created_at; any other NOT NULL column without a default by its type).
// COSTS_REAL_SCHEMAS (a file of SQL, optional): made first when none of the three tables exists yet, to run these tests'
// rows against the real tables (the merge check); the tests never need it.

import { readFileSync } from 'node:fs';

export const CONTRACT_TABLES = `
CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY, run_id INTEGER, room_id INTEGER, crop TEXT, supplier TEXT,
  received_at INTEGER, blocks INTEGER, price_per_block REAL, spawn_batch TEXT, note TEXT) STRICT;
CREATE TABLE IF NOT EXISTS stock_items (id INTEGER PRIMARY KEY, name TEXT, kind TEXT, unit TEXT, reorder_at REAL) STRICT;
CREATE TABLE IF NOT EXISTS stock_moves (id INTEGER PRIMARY KEY, item_id INTEGER, at INTEGER, qty REAL, unit_cost REAL,
  ref_kind TEXT, ref_id INTEGER, note TEXT) STRICT;
CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY, sold_at INTEGER, crop TEXT, kg REAL, price_kg REAL, total REAL,
  buyer TEXT, invoice_no TEXT, room_id INTEGER, run_id INTEGER, note TEXT) STRICT;`;

const exists = (raw, name) => Boolean(raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
// A table's columns that must be given: NOT NULL, no default, not the row id.
const required = (raw, table) => raw.prepare('SELECT name, type FROM pragma_table_info(?) WHERE "notnull" = 1 AND dflt_value IS NULL AND pk = 0')
  .all(table);
const hasColumn = (raw, table, name) => Boolean(raw.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(table, name));

// Sales' buyer: its buyers row by name, made when missing.
function buyerId(raw, name, at) {
  const found = raw.prepare('SELECT id FROM buyers WHERE name = ?').get(name);
  if (found) return found.id;
  return Number(raw.prepare('INSERT INTO buyers (name, created_at) VALUES (?, ?)').run(name, at).lastInsertRowid);
}

// The row as the table takes it: the columns it requires and the row leaves out filled.
function fill(raw, table, row) {
  const out = { ...row };
  if (table === 'batches') {
    if (hasColumn(raw, table, 'placed_at') && out.run_id != null && out.placed_at === undefined) out.placed_at = out.received_at;
    if (out.created_at === undefined && hasColumn(raw, table, 'created_at')) out.created_at = out.received_at ?? 0;
  }
  if (table === 'sales') {
    if (out.buyer_id === undefined && hasColumn(raw, table, 'buyer_id') && exists(raw, 'buyers')) {
      out.buyer_id = buyerId(raw, out.buyer ?? 'A buyer', out.sold_at ?? 0);
    }
    if (out.delivery_id === undefined && hasColumn(raw, table, 'delivery_id')) out.delivery_id = out.id ?? 1;
    if (out.created_at === undefined && hasColumn(raw, table, 'created_at')) out.created_at = out.sold_at ?? 0;
  }
  for (const c of required(raw, table)) {
    if (out[c.name] !== undefined) continue;
    out[c.name] = /INT|REAL/i.test(c.type) ? 0 : '';
  }
  return out;
}

// raw: a node:sqlite DatabaseSync. rows: { batches, items, moves, sales } of objects keyed by column name.
export function add(raw, { batches = [], items = [], moves = [], sales = [] } = {}) {
  const real = process.env.COSTS_REAL_SCHEMAS;
  if (real && !['batches', 'stock_items', 'stock_moves', 'sales'].some((t) => exists(raw, t))) raw.exec(readFileSync(real, 'utf8'));
  raw.exec(CONTRACT_TABLES);
  const put = (table, given) => {
    const row = fill(raw, table, given);
    const cols = Object.keys(row);
    raw.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(row));
  };
  for (const r of batches) put('batches', r);
  for (const r of items) put('stock_items', r);
  for (const r of moves) put('stock_moves', r);
  for (const r of sales) put('sales', r);
}
