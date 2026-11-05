// The tables Batches, Inventory and Sales will make, with the contract's columns (~/.claude/task-logs/business/CONTRACT.md 5),
// for Costs' tests before those modules merge. add(raw, rows) puts rows in them.

export const CONTRACT_TABLES = `
CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY, run_id INTEGER, room_id INTEGER, crop TEXT, supplier TEXT,
  received_at INTEGER, blocks INTEGER, price_per_block REAL, spawn_batch TEXT, note TEXT) STRICT;
CREATE TABLE IF NOT EXISTS stock_items (id INTEGER PRIMARY KEY, name TEXT, kind TEXT, unit TEXT, reorder_at REAL) STRICT;
CREATE TABLE IF NOT EXISTS stock_moves (id INTEGER PRIMARY KEY, item_id INTEGER, at INTEGER, qty REAL, unit_cost REAL,
  ref_kind TEXT, ref_id INTEGER, note TEXT) STRICT;
CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY, sold_at INTEGER, crop TEXT, kg REAL, price_kg REAL, total REAL,
  buyer TEXT, invoice_no TEXT, room_id INTEGER, run_id INTEGER, note TEXT) STRICT;`;

// raw: a node:sqlite DatabaseSync. rows: { batches, items, moves, sales } of objects keyed by column name.
export function add(raw, { batches = [], items = [], moves = [], sales = [] } = {}) {
  raw.exec(CONTRACT_TABLES);
  const put = (table, row) => {
    const cols = Object.keys(row);
    raw.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(row));
  };
  for (const r of batches) put('batches', r);
  for (const r of items) put('stock_items', r);
  for (const r of moves) put('stock_moves', r);
  for (const r of sales) put('sales', r);
}
