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

// A lot's use-by on the farm's day `today`: 'soon' from SOON_DAYS before it to the day itself, 'expired' after, else null.
export function useByState(useBy, today) {
  if (!useBy) return null;
  const days = daysBetween(today, useBy);
  if (days < 0) return 'expired';
  return days <= SOON_DAYS ? 'soon' : null;
}

const WORST = { expired: 0, soon: 1 };

// An item with its figures at `now` (ms): { id, name, kind, unit, reorderAt, ingredient, lrmpNo, archived, qty, low,
// lastCountedAt, useBy: { date, state } | null (the worst of its lots: expired before soon, then the earliest), lots: the
// lots with some left, each with its state }.
export function itemView(item, moves, now) {
  const today = localDate(now);
  const qty = stockOf(moves);
  const lots = lotsOf(moves).filter((l) => l.left > 0).map((l) => ({ ...l, state: useByState(l.useBy, today) }));
  const counted = moves.filter((m) => m.refKind === 'adjust' && m.counted !== null && m.counted !== undefined).map((m) => m.at);
  const dated = lots.filter((l) => l.state).sort((a, b) => WORST[a.state] - WORST[b.state] || a.useBy.localeCompare(b.useBy));
  return {
    id: item.id, name: item.name, kind: item.kind, unit: item.unit, reorderAt: item.reorderAt, ingredient: item.ingredient,
    lrmpNo: item.lrmpNo, archived: item.archived, qty, low: item.reorderAt !== null && qty <= item.reorderAt,
    lastCountedAt: counted.length ? Math.max(...counted) : null,
    useBy: dated.length ? { date: dated[0].useBy, state: dated[0].state } : null,
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
