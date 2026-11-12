// Inventory's figures (spec 2026-11-05-inventory-design.md 3 and 5.1): in stock, the lots (oldest purchase first), the use-by
// states, Low, an item's view, the attention counts and the myGAP 4-5 rows. Pure: no database, no clock.

import { localDate, daysBetween } from './task-rules.js';

export const KINDS = ['blocks', 'spawn', 'bags', 'chemical', 'packaging', 'other'];
// The units of an item made on the page; 'blocks' is the unit of Batches' block items alone.
export const ITEM_UNITS = ['pcs', 'kg', 'g', 'L', 'mL'];
// The units counted in whole numbers (kg and L take 2 decimals).
export const WHOLE_UNITS = ['pcs', 'g', 'mL', 'blocks'];
export const SOON_DAYS = 7;

export const round3 = (n) => Math.round(n * 1000) / 1000;
const byTime = (a, b) => a.at - b.at || a.id - b.id;

// The item's moves summed (may be under 0: a use recorded beyond the records, put right by a count).
export const stockOf = (moves) => round3(moves.reduce((sum, m) => sum + m.qty, 0));

// The item's lots: each in-move (a purchase, a batch receipt, a count that added) in time order, with what is left of it.
// A throw-out (a use with lotId) comes off its own lot first; every other out, and any part of a throw-out beyond its lot,
// comes off the lots oldest first, each to 0 before the next. → [{ moveId, at, qty, left, useBy, refKind, refId }], those
// with nothing left included.
export function lotsOf(moves) {
  const sorted = [...moves].sort(byTime);
  const lots = sorted.filter((m) => m.qty > 0).map((m) => ({
    moveId: m.id, at: m.at, qty: m.qty, left: m.qty, useBy: m.useBy ?? null, refKind: m.refKind, refId: m.refId ?? null,
  }));
  const byId = new Map(lots.map((l) => [l.moveId, l]));
  let rest = 0;
  for (const m of sorted) {
    if (m.qty >= 0) continue;
    let out = -m.qty;
    const own = m.lotId === null || m.lotId === undefined ? null : byId.get(m.lotId);
    if (own) {
      const take = Math.min(own.left, out);
      own.left = round3(own.left - take);
      out = round3(out - take);
    }
    rest = round3(rest + out);
  }
  for (const lot of lots) {
    if (rest <= 0) break;
    const take = Math.min(lot.left, rest);
    lot.left = round3(lot.left - take);
    rest = round3(rest - take);
  }
  return lots;
}

// ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 3): what each lot cost and what each move out took of them.
const money = (n) => Math.round(n * 100) / 100;

// A lot's unit cost (RM a unit): a purchase's total ÷ its qty (the RM paid), else its unit cost; a batch receipt's unit cost
// (Batches' price per block); a count that added: last, the unit cost of the item's latest priced lot before it. null: unpriced.
export function lotUnitCost(m, last = null) {
  if (m.refKind === 'purchase') return m.total != null && m.qty > 0 ? m.total / m.qty : m.unitCost ?? null;
  if (m.refKind === 'adjust') return last;
  return m.unitCost ?? null;
}

// The item's moves costed in time order: each move out takes from the lots in at that time, oldest first (a throw-out its own
// lot first); what it takes beyond the stock then comes off the next lots to come in, so a lot's left ends as lotsOf's.
// → { outs: Map moveId → { moveId, qty, cost (RM of what came off priced lots), unpricedQty }, lots: [{ moveId, at, qty, left,
// unitCost, value }], value (Σ the lots' values), unpriced (a lot with some left and no price, or the stock below zero) }.
// lotCost(m) (optional): a lot's own cost when another module knows it better, { unitCost, partial } (partial: some of it
// has no price), or undefined: a made delivery's blocks at Batches' live price.
export function costedMoves(moves, lotCost = () => undefined) {
  const sorted = [...moves].sort(byTime);
  const lots = [];
  const byId = new Map();
  const outs = new Map();
  const owed = []; // [{ rec, need }]: what outs took beyond the stock, waiting for the next lots
  const ownOwed = new Map(); // lot id → [{ rec, need }]: throw-outs dated before their own lot (its day edited later)
  const inIds = new Set(sorted.filter((m) => m.qty > 0).map((m) => m.id));
  let last = null;
  const take = (lot, rec, n) => {
    lot.left = round3(lot.left - n);
    if (lot.unitCost === null) rec.unpricedQty = round3(rec.unpricedQty + n);
    else rec.cost += n * lot.unitCost;
  };
  for (const m of sorted) {
    if (m.qty > 0) {
      const known = lotCost(m);
      const lot = { moveId: m.id, at: m.at, qty: m.qty, left: m.qty, unitCost: known ? known.unitCost : lotUnitCost(m, last), partial: Boolean(known?.partial) };
      if (lot.unitCost !== null) last = lot.unitCost;
      lots.push(lot);
      byId.set(m.id, lot);
      // a throw-out of this lot dated before it takes it first, as lotsOf's own-lot takes come first; the rest is owed
      for (const o of ownOwed.get(m.id) ?? []) {
        const n = Math.min(lot.left, o.need);
        take(lot, o.rec, n);
        o.need = round3(o.need - n);
        if (o.need > 0) owed.push(o);
      }
      ownOwed.delete(m.id);
      while (owed.length && lot.left > 0) {
        const n = Math.min(lot.left, owed[0].need);
        take(lot, owed[0].rec, n);
        owed[0].need = round3(owed[0].need - n);
        if (owed[0].need <= 0) owed.shift();
      }
      continue;
    }
    if (m.qty === 0) continue;
    const rec = { moveId: m.id, qty: round3(-m.qty), cost: 0, unpricedQty: 0 };
    outs.set(m.id, rec);
    let need = rec.qty;
    if (m.lotId != null && !byId.has(m.lotId) && inIds.has(m.lotId)) { // its own lot comes later: owed from that lot
      if (!ownOwed.has(m.lotId)) ownOwed.set(m.lotId, []);
      ownOwed.get(m.lotId).push({ rec, need });
      continue;
    }
    const own = m.lotId == null ? null : byId.get(m.lotId);
    for (const lot of own ? [own, ...lots] : lots) {
      if (need <= 0) break;
      if (lot.left <= 0) continue;
      const n = Math.min(lot.left, need);
      take(lot, rec, n);
      need = round3(need - n);
    }
    if (need > 0) owed.push({ rec, need });
  }
  for (const { rec, need } of owed) rec.unpricedQty = round3(rec.unpricedQty + need);
  for (const rec of outs.values()) rec.cost = money(rec.cost);
  for (const lot of lots) lot.value = lot.unitCost === null ? null : money(lot.left * lot.unitCost);
  return {
    outs, lots,
    value: money(lots.reduce((sum, l) => sum + (l.value ?? 0), 0)),
    unpriced: owed.length > 0 || lots.some((l) => l.left > 0 && (l.unitCost === null || l.partial)),
  };
}
// ---- end Money truth ----

// A lot's use-by on the farm's day `today`: 'soon' from SOON_DAYS before it to the day itself, 'expired' after, else null.
export function useByState(useBy, today) {
  if (!useBy) return null;
  const days = daysBetween(today, useBy);
  if (days < 0) return 'expired';
  return days <= SOON_DAYS ? 'soon' : null;
}

const WORST = { expired: 0, soon: 1 };

// An item with its figures at `now` (ms): { id, name, kind, unit, reorderAt, ingredient, lrmpNo, archived, qty, low,
// lastCountedAt, useBy: { date, state, qty } | null (the worst of its lots: expired before soon, then the earliest; qty: what
// is left in all its lots of that state, so a page can say "4.50 kg expired" of 29.50 kg), value and unpriced (its worth,
// costedMoves'), lots: the lots with some left, each with its state, unitCost and value }.
export function itemView(item, moves, now, lotCost = undefined) {
  const today = localDate(now);
  const qty = stockOf(moves);
  const costed = costedMoves(moves, lotCost); // ---- Money truth ---- each lot's unit cost and value, the item's worth
  const costOf = new Map(costed.lots.map((l) => [l.moveId, l]));
  const lots = lotsOf(moves).filter((l) => l.left > 0).map((l) => {
    const unitCost = costOf.get(l.moveId)?.unitCost ?? null;
    const partial = costOf.get(l.moveId)?.partial ?? false;
    return { ...l, state: useByState(l.useBy, today), unitCost, value: unitCost === null ? null : money(l.left * unitCost), ...(partial ? { partial } : {}) };
  });
  const counted = moves.filter((m) => m.refKind === 'adjust' && m.counted !== null && m.counted !== undefined).map((m) => m.at);
  const dated = lots.filter((l) => l.state).sort((a, b) => WORST[a.state] - WORST[b.state] || a.useBy.localeCompare(b.useBy));
  return {
    id: item.id, name: item.name, kind: item.kind, unit: item.unit, reorderAt: item.reorderAt, ingredient: item.ingredient,
    lrmpNo: item.lrmpNo, archived: item.archived, qty, low: item.reorderAt !== null && qty <= item.reorderAt,
    lastCountedAt: counted.length ? Math.max(...counted) : null,
    value: costed.value, unpriced: costed.unpriced,
    useBy: dated.length ? {
      date: dated[0].useBy, state: dated[0].state, qty: round3(dated.filter((l) => l.state === dated[0].state).reduce((sum, l) => sum + l.left, 0)),
    } : null,
    lots,
  };
}

// How many items not archived are low, have a soon lot (their worst), have an expired lot.
export function attentionOf(views) {
  const out = { low: 0, soon: 0, expired: 0 };
  for (const v of views) {
    if (v.archived) continue;
    if (v.low) out.low += 1;
    if (v.useBy?.state === 'soon') out.soon += 1;
    if (v.useBy?.state === 'expired') out.expired += 1;
  }
  return out;
}

// The myGAP 4-5 rows (spec 5.1): the chemical items' purchases and uses among `moves`, oldest first. items: Map id → item;
// rooms: Map id → name; runsOf(roomId) → that room's runs ({ startedAt, endedAt, crops: [{ crop }] }); cropName(crop) → its
// short name. → [{ moveId, date, kind: 'purchase' | 'use', crop, location, product, lrmpNo, price, qty, unit, reason,
// operator }]; the web formats them.
export function sheetRows(moves, { items, rooms, runsOf, cropName }) {
  return moves
    .filter((m) => items.get(m.itemId)?.kind === 'chemical' && (m.refKind === 'purchase' || m.refKind === 'use'))
    .sort(byTime)
    .map((m) => {
      const item = items.get(m.itemId);
      const bought = m.refKind === 'purchase';
      const run = bought || m.roomId === null ? null
        : runsOf(m.roomId).find((r) => r.startedAt <= m.at && (r.endedAt === null || m.at < r.endedAt)) ?? null;
      return {
        moveId: m.id, date: localDate(m.at), kind: bought ? 'purchase' : 'use',
        crop: run ? run.crops.map((c) => cropName(c.crop)).join(', ') : '',
        location: bought ? '' : m.roomId === null ? 'Not in a room' : rooms.get(m.roomId) ?? 'A deleted room',
        product: item.ingredient ? `${item.name} (${item.ingredient})` : item.name,
        lrmpNo: item.lrmpNo ?? '', price: bought ? m.total : null, qty: Math.abs(m.qty), unit: item.unit,
        reason: bought ? '' : m.reason ?? '', operator: bought ? '' : m.worker ?? '',
      };
    });
}
