// The Batches figures (spec 2026-11-05-batches-design.md 3.1, 3.2 and 4), pure: a batch here is a store row (camelCase,
// with lost, runEndedAt and runCrops) or its API view (blockCost needs only blocks and pricePerBlock).

export const round = (v, places) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

// The blocks not lost to contamination.
export const goodOf = (b) => b.blocks - (b.lost ?? 0);

// Dry substrate kg per block: the block's weight less its water; null without them.
export const dryKgOf = (b) => (b.blockKg == null || b.waterPct == null ? null : round(b.blockKg * (1 - b.waterPct / 100), 3));

// A run's batches → { <crop>: dry kg per block } for each crop whose batches all have a weight, weighted by their blocks
// (spec 3.2: Harvest's BE then uses it instead of Settings → Yield).
export function runDryKg(rows) {
  const byCrop = new Map();
  for (const b of rows) {
    if (!byCrop.has(b.crop)) byCrop.set(b.crop, []);
    byCrop.get(b.crop).push(b);
  }
  const out = {};
  for (const [crop, list] of byCrop) {
    if (list.some((b) => dryKgOf(b) === null)) continue;
    const blocks = list.reduce((s, b) => s + b.blocks, 0);
    out[crop] = round(list.reduce((s, b) => s + b.blocks * b.blockKg * (1 - b.waterPct / 100), 0) / blocks, 3);
  }
  return out;
}

// Σ blocks × price per block, to 2 places; null when any row's price is unknown (the contract's rule); 0 with no rows.
export function blockCost(rows) {
  if (rows.some((b) => b.pricePerBlock == null)) return null;
  return round(rows.reduce((s, b) => s + b.blocks * b.pricePerBlock, 0), 2);
}

// 'making' (a made batch not yet ready: not in a room, and not an area's blocks marked ready to fruit), 'waiting' (not yet in
// a room), 'placed' (in a room's open run) or 'past' (its run ended, or its room was deleted: a placed time with no room).
export function statusOf(b) {
  if (b.kind === 'made' && b.placedAt == null && !(b.incubation === 'area' && b.incubatedTo != null)) return 'making';
  return b.runId == null ? (b.placedAt == null ? 'waiting' : 'past') : b.runEndedAt == null ? 'placed' : 'past';
}

// A made block's price (spec 4): Σ material qty × its item's latest purchase price ÷ the blocks made, to 4 places; null with no
// lines, a line with no Inventory item, or an item with no purchase price. priceOf(stockItemId) → RM per unit, or null.
export function madePrice(materials, priceOf, blocks) {
  if (!materials.length || !(blocks > 0)) return null;
  let total = 0;
  for (const m of materials) {
    const cost = m.stockItemId == null ? null : priceOf(m.stockItemId);
    if (cost == null) return null;
    total += m.qty * cost;
  }
  return round(total / blocks, 4);
}

// The run's blocks of the batch's crop (the Crop tab's count; 0 when the run's crops no longer have it); null without a run
// (waiting, or its room deleted).
export function runBlocksOf(b) {
  if (b.runId == null || !Array.isArray(b.runCrops)) return null;
  return b.runCrops.find((c) => c.crop === b.crop)?.blocks ?? 0;
}

// The stock moves a delivery should have (spec 3.1), from its rows (the first row and its parts) and checksOf(id) (a row's
// checks, oldest first): + the delivery's blocks on the first row at its receipt; a waiting row's losses out; a placed row's
// losses before it went in out, then the rest of its blocks out when it went in (a loss after that is in a room, not stock).
// A row whose room was deleted keeps its placed time, so its move out stays. A made batch's materials (its first row's lines)
// with an Inventory item go out on their own items (itemId): the mix's at the mix, the spawn at the inoculation (none before
// it). family: not empty.
export function movesOf(family, checksOf, materials = []) {
  const first = family.find((b) => b.parentId == null) ?? family[0]; // a first row is always there (it is never deleted with parts)
  const total = family.reduce((s, b) => s + b.blocks, 0);
  const moves = [{ refId: first.id, at: first.receivedAt, qty: total, unitCost: first.pricePerBlock ?? null, note: null }];
  for (const b of family) {
    const checks = checksOf(b.id);
    const before = b.placedAt == null ? checks : checks.filter((c) => c.at <= b.placedAt);
    for (const c of before) moves.push({ refId: b.id, at: c.at, qty: -c.lost, unitCost: null, note: 'contaminated' });
    if (b.placedAt == null) continue;
    const out = b.blocks - before.reduce((s, c) => s + c.lost, 0);
    if (out > 0) moves.push({ refId: b.id, at: b.placedAt, qty: -out, unitCost: null, note: 'into a room' });
  }
  for (const m of materials) {
    const at = m.item === 'spawn' ? first.inoculatedAt : first.mixedAt ?? first.receivedAt;
    if (m.stockItemId == null || at == null) continue;
    moves.push({ itemId: m.stockItemId, refId: first.id, at, qty: -m.qty, unitCost: null, note: m.item === 'spawn' ? 'spawn' : 'mixed' });
  }
  return moves;
}
