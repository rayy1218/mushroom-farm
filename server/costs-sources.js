// The other business modules' rows Costs reads (spec 2026-11-05-costs-design.md 3), by the contract's column names
// (~/.claude/task-logs/business/CONTRACT.md 5). raw: the node:sqlite DatabaseSync (db.js's costSources passes it; the
// database object has no raw SQL). A table not made yet (its module not merged) gives an empty list, never an error. Times in
// ms, from and to inclusive. Inventory's purchases of kind 'blocks' are left out: Batches wins for blocks (owner 2026-11-05).

const exists = (raw, name) => Boolean(raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
const hasColumn = (raw, table, name) => Boolean(raw.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(table, name));
const money = (v) => Math.round(v * 100) / 100;

// → { batches: [{ batchId, runId, roomId, at, blocks, pricePerBlock, cost (null: no price) }], purchases: [{ id, itemId,
// name, kind, at, qty, unitCost, total (null: no unit cost) }], sales: [{ id, at, crop, kg, total, roomId, runId }] }
export function readSources(raw, from, to) {
  // a made batch (Batches' optional kind column): its materials are Inventory purchases already (owner 2026-11-05)
  const notMade = exists(raw, 'batches') && hasColumn(raw, 'batches', 'kind') ? "AND kind IS NOT 'made'" : '';
  const batches = !exists(raw, 'batches') ? [] : raw.prepare(`
    SELECT id, run_id, room_id, received_at, blocks, price_per_block FROM batches
    WHERE received_at BETWEEN ? AND ? ${notMade} ORDER BY received_at, id`).all(from, to).map((r) => ({
    batchId: r.id, runId: r.run_id, roomId: r.room_id, at: r.received_at, blocks: r.blocks, pricePerBlock: r.price_per_block,
    cost: r.price_per_block === null ? null : money(r.blocks * r.price_per_block),
  }));
  // the total as paid (Inventory's own total column when it has one), else qty x unit cost
  const paid = exists(raw, 'stock_moves') && hasColumn(raw, 'stock_moves', 'total') ? 'COALESCE(m.total, m.qty * m.unit_cost)' : 'm.qty * m.unit_cost';
  const purchases = !(exists(raw, 'stock_moves') && exists(raw, 'stock_items')) ? [] : raw.prepare(`
    SELECT m.id, m.item_id, i.name, i.kind, m.at, m.qty, m.unit_cost, ${paid} AS paid FROM stock_moves m JOIN stock_items i ON i.id = m.item_id
    WHERE m.ref_kind = 'purchase' AND m.qty > 0 AND i.kind <> 'blocks' AND m.at BETWEEN ? AND ? ORDER BY m.at, m.id`)
    .all(from, to).map((r) => ({
      id: r.id, itemId: r.item_id, name: r.name, kind: r.kind, at: r.at, qty: r.qty, unitCost: r.unit_cost,
      total: r.paid === null ? null : money(r.paid),
    }));
  const sales = !exists(raw, 'sales') ? [] : raw.prepare(`
    SELECT id, sold_at, crop, kg, total, room_id, run_id FROM sales WHERE sold_at BETWEEN ? AND ? ORDER BY sold_at, id`)
    .all(from, to).map((r) => ({ id: r.id, at: r.sold_at, crop: r.crop, kg: r.kg, total: r.total, roomId: r.room_id, runId: r.run_id }));
  return { batches, purchases, sales };
}
