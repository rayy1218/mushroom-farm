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

// Σ each row's cost (a made row's share of its materials, Money truth: the same figure Costs charges; else blocks × price per
// block), to 2 places; null when any row's price is unknown (the contract's rule); 0 with no rows.
const rowCost = (b) => (b.cost !== undefined ? b.cost : b.pricePerBlock == null ? null : b.blocks * b.pricePerBlock);
export function blockCost(rows) {
  if (rows.some((b) => rowCost(b) === null)) return null;
  return round(rows.reduce((s, b) => s + rowCost(b), 0), 2);
}

// 'making' (a made batch not yet ready: not in a room, and not an area's blocks marked ready to fruit), 'waiting' (not yet in
// a room), 'placed' (in a room's open run) or 'past' (its run ended, or its room was deleted: a placed time with no room).
export function statusOf(b) {
  if (b.kind === 'made' && b.placedAt == null && !(b.incubation === 'area' && b.incubatedTo != null)) return 'making';
  return b.runId == null ? (b.placedAt == null ? 'waiting' : 'past') : b.runEndedAt == null ? 'placed' : 'past';
}

// ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 4): a made batch's materials at what their lots cost.
// drawOf(stockItemId) → the delivery's draws on that item, costed by Inventory's costedMoves ({ cost, unpricedQty }), or null
// when it drew nothing (its item gone); nameOf(line) → the line's name. A line with no item, or whose draw has an unpriced part,
// is missing. → { total (RM, 2 places; null when no line has a price), missing: [names] }.
export function madeCost(materials, drawOf, nameOf) {
  const missing = [];
  const seen = new Set();
  let total = 0;
  let priced = false;
  for (const m of materials) {
    const draw = m.stockItemId == null ? null : drawOf(m.stockItemId);
    if (!draw) {
      missing.push(nameOf(m));
      continue;
    }
    if (seen.has(m.stockItemId)) continue; // two lines on one item: its draws counted once
    seen.add(m.stockItemId);
    if (draw.unpricedQty > 0) missing.push(nameOf(m));
    if (draw.cost > 0 || draw.unpricedQty === 0) priced = true; // some of it came off a priced lot
    total += draw.cost;
  }
  return { total: priced ? round(total, 2) : null, missing: [...new Set(missing)] };
}

// The price per block of a made batch's cost over the blocks made, to 4 places; null with no total or no blocks.
export const madePerBlock = (cost, blocks) => (cost.total === null || !(blocks > 0) ? null : round(cost.total / blocks, 4));
// Over this a block, a made price is a slip in the amounts or the prices: unknown, never charged (Batches and Costs alike).
export const MADE_CAP = 1000;
export const madeOver = (cost, blocks) => {
  const price = madePerBlock(cost, blocks);
  return price !== null && price > MADE_CAP;
};

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
// receiptCost (Money truth): the blocks' unit cost on their receipt when given (a made batch with a material unpriced: null, so
// Inventory does not value its blocks at a part price); else the first row's price.
export function movesOf(family, checksOf, materials = [], receiptCost = undefined) {
  const first = family.find((b) => b.parentId == null) ?? family[0]; // a first row is always there (it is never deleted with parts)
  const total = family.reduce((s, b) => s + b.blocks, 0);
  const unitCost = receiptCost !== undefined ? receiptCost : first.pricePerBlock ?? null;
  const moves = [{ refId: first.id, at: first.mixedAt ?? first.receivedAt, qty: total, unitCost, note: null }];
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
