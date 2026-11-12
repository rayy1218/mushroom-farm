// The other business modules' rows Costs reads (spec 2026-11-05-costs-design.md 3; Money truth, 2026-11-12-money-truth-
// design.md 4 and 5), by the contract's column names (~/.claude/task-logs/business/CONTRACT.md 5). raw: the node:sqlite
// DatabaseSync (db.js's costSources passes it; the database object has no raw SQL). A table not made yet (its module not
// merged) gives an empty list, never an error; an optional column not there is read as its module did before it. Times in
// ms, from and to inclusive. Inventory's moves are costed with Inventory's own costedMoves (each move out at what it took of
// the lots, oldest first), a made batch's materials with Batches' madeCost.

import { costedMoves } from './inventory-math.js';
import { madeCost, madeOver } from './batches-math.js';
import { ITEM_NAMES } from './batches-making.js';
import { split } from './costs-math.js';

const exists = (raw, name) => Boolean(raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
const hasColumn = (raw, table, name) => Boolean(raw.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(table, name));
const money = (v) => Math.round(v * 100) / 100;

// Every stock move with its item, oldest first, and what each move out took of its item's lots: { moves, items: Map id →
// { id, name, kind, unit }, outs: Map moveId → { cost, unpricedQty } }.
function stockOf(raw) {
  if (!(exists(raw, 'stock_moves') && exists(raw, 'stock_items'))) return { moves: [], items: new Map(), outs: new Map() };
  const col = (name, sql = name) => (hasColumn(raw, 'stock_moves', name) ? sql : `NULL AS ${name}`);
  const items = new Map(raw.prepare('SELECT id, name, kind, unit FROM stock_items').all().map((r) => [r.id, { ...r }]));
  const moves = raw.prepare(`SELECT id, item_id, at, qty, unit_cost, ref_kind, ref_id, ${col('total')}, ${col('lot_id')}, ${col('room_id')}
    FROM stock_moves ORDER BY at, id`).all().map((r) => ({
    id: r.id, itemId: r.item_id, at: r.at, qty: r.qty, unitCost: r.unit_cost, refKind: r.ref_kind, refId: r.ref_id, total: r.total,
    lotId: r.lot_id, roomId: r.room_id,
  }));
  const byItem = new Map();
  for (const m of moves) {
    if (!byItem.has(m.itemId)) byItem.set(m.itemId, []);
    byItem.get(m.itemId).push(m);
  }
  const outs = new Map();
  for (const list of byItem.values()) for (const [id, o] of costedMoves(list).outs) outs.set(id, o);
  return { moves, items, outs };
}

// Every batch row with what it costs (Money truth 5.1): { batchId, kind, runId, roomId, receivedAt, placedAt, blocks,
// pricePerBlock, cost (null: no price), missing ([names]: a made delivery's materials with no price), lost: [{ at, blocks,
// cost }] (a row never placed: its blocks lost while waiting) }. A bought row: blocks × its price; a made row: its share by
// blocks of the delivery's materials at their lots (split to the sen, the last row the rest).
function batchesOf(raw, stock) {
  if (!exists(raw, 'batches')) return [];
  const col = (name, sql) => (hasColumn(raw, 'batches', name) ? name : `${sql} AS ${name}`);
  const rows = raw.prepare(`SELECT id, run_id, room_id, received_at, blocks, price_per_block, ${col('kind', "'bought'")},
    ${col('parent_id', 'NULL')}, ${col('placed_at', 'CASE WHEN run_id IS NULL THEN NULL ELSE received_at END')} FROM batches
    ORDER BY received_at, id`).all();
  const checks = exists(raw, 'batch_checks') ? raw.prepare('SELECT batch_id, at, lost FROM batch_checks ORDER BY at, id').all() : [];
  const materials = exists(raw, 'batch_materials') ? raw.prepare('SELECT batch_id, item, name, qty, stock_item_id FROM batch_materials ORDER BY id').all() : [];
  const families = new Map();
  for (const r of rows) {
    const first = r.parent_id ?? r.id;
    if (!families.has(first)) families.set(first, []);
    families.get(first).push(r);
  }
  const costs = new Map(); // row id → { cost, missing }
  for (const [first, family] of families) {
    if (!family.some((r) => r.kind === 'made')) {
      for (const r of family) costs.set(r.id, { cost: r.price_per_block === null ? null : money(r.blocks * r.price_per_block), missing: [] });
      continue;
    }
    // the delivery's draws on each item (its first row's moves out), at what they took of the lots
    const draws = stock.moves.filter((m) => m.refKind === 'batch' && m.refId === first && m.qty < 0);
    const drawOf = (itemId) => {
      const own = draws.filter((m) => m.itemId === itemId);
      if (!own.length) return null;
      return own.reduce((s, m) => {
        const o = stock.outs.get(m.id);
        return { cost: s.cost + (o?.cost ?? 0), unpricedQty: s.unpricedQty + (o ? o.unpricedQty : -m.qty) };
      }, { cost: 0, unpricedQty: 0 });
    };
    const lines = materials.filter((m) => m.batch_id === first).map((m) => ({
      item: m.item, name: m.name, qty: m.qty, stockItemId: stock.items.has(m.stock_item_id) ? m.stock_item_id : null, // its item gone: none
    }));
    const nameOf = (m) => (m.stockItemId !== null ? stock.items.get(m.stockItemId).name : m.item === 'other' && m.name ? m.name : ITEM_NAMES[m.item]);
    const made = madeCost(lines, drawOf, nameOf);
    // over RM 1,000 a block Batches calls it no price (a slip): never charged, the unpriced note said instead
    const blocks = family.reduce((a, r) => a + r.blocks, 0);
    const shares = made.total === null || madeOver(made, blocks) ? family.map(() => null) : split(made.total, family.map((r) => r.blocks));
    family.forEach((r, i) => costs.set(r.id, { cost: shares[i], missing: made.missing }));
  }
  return rows.map((r) => {
    const { cost, missing } = costs.get(r.id);
    const lost = r.placed_at !== null ? [] : checks.filter((c) => c.batch_id === r.id).map((c) => ({
      at: c.at, blocks: c.lost, cost: cost === null ? null : money((cost * c.lost) / r.blocks),
    }));
    return {
      batchId: r.id, kind: r.kind === 'made' ? 'made' : 'bought', runId: r.run_id, roomId: r.room_id, receivedAt: r.received_at,
      placedAt: r.placed_at, blocks: r.blocks, pricePerBlock: r.price_per_block, cost, missing, lost,
    };
  });
}

// → { batches (batchesOf's: every row, whatever its days), purchases: [{ id, itemId, name, kind, at, qty, unitCost, total
// (null: no unit cost) }] (in the range, not blocks: what was bought for stock), uses: [{ id, itemId, name, kind, unit, at, qty,
// refKind, roomId, cost, unpricedQty }] (in the range: a use, a count that found less or a throw-out of an item not blocks, at
// what it took of the lots), sales: [{ id, at, crop, kg, total, roomId, runId }] }
export function readSources(raw, from, to) {
  const stock = stockOf(raw);
  const batches = batchesOf(raw, stock);
  // the total as paid (Inventory's own total column when it has one), else qty x unit cost
  const paid = exists(raw, 'stock_moves') && hasColumn(raw, 'stock_moves', 'total') ? 'COALESCE(m.total, m.qty * m.unit_cost)' : 'm.qty * m.unit_cost';
  const purchases = !(exists(raw, 'stock_moves') && exists(raw, 'stock_items')) ? [] : raw.prepare(`
    SELECT m.id, m.item_id, i.name, i.kind, m.at, m.qty, m.unit_cost, ${paid} AS paid FROM stock_moves m JOIN stock_items i ON i.id = m.item_id
    WHERE m.ref_kind = 'purchase' AND m.qty > 0 AND i.kind <> 'blocks' AND m.at BETWEEN ? AND ? ORDER BY m.at, m.id`)
    .all(from, to).map((r) => ({
      id: r.id, itemId: r.item_id, name: r.name, kind: r.kind, at: r.at, qty: r.qty, unitCost: r.unit_cost,
      total: r.paid === null ? null : money(r.paid),
    }));
  const uses = stock.moves.filter((m) => m.qty < 0 && (m.refKind === 'use' || m.refKind === 'adjust') && m.at >= from && m.at <= to
    && stock.items.get(m.itemId)?.kind !== 'blocks').map((m) => {
    const item = stock.items.get(m.itemId);
    const o = stock.outs.get(m.id);
    return {
      id: m.id, itemId: m.itemId, name: item?.name ?? '', kind: item?.kind ?? 'other', unit: item?.unit ?? null, at: m.at, qty: -m.qty,
      refKind: m.refKind, roomId: m.roomId ?? null, cost: o?.cost ?? 0, unpricedQty: o ? o.unpricedQty : -m.qty,
    };
  });
  const sales = !exists(raw, 'sales') ? [] : raw.prepare(`
    SELECT id, sold_at, crop, kg, total, room_id, run_id FROM sales WHERE sold_at BETWEEN ? AND ? ORDER BY sold_at, id`)
    .all(from, to).map((r) => ({ id: r.id, at: r.sold_at, crop: r.crop, kg: r.kg, total: r.total, roomId: r.room_id, runId: r.run_id }));
  return { batches, purchases, uses, sales };
}
