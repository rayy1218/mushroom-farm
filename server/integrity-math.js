// Data integrity's asks (spec 2026-11-12-data-integrity-design.md 5), pure: the duplicates of a sale, a cost, a harvest and a
// Not sold record; a pick over 0.3 kg a block with the room's picks of the last 10 minutes; an unlikely price or kg; the
// crop's balance (sold and not sold against picked) and a sale before any pick. Each → [{ kind, field, text }]. The words use
// the pages' formatters (web/harvest-math.js), so an ask reads as the page around it.

import { cropShortName } from '../web/crops.js';
import { kgText, rmText } from '../web/harvest-math.js';
import { PICK_MAX_PER_BLOCK } from '../web/harvest-math.js';
import { localDate, localTime, dayStart, addDays } from './task-rules.js';

export const DUPLICATE_MS = 10 * 60_000; // two of a kind within 10 minutes look like one entered twice
export const QUICK_PICKS_MS = 10 * 60_000; // the room's picks summed for the pick check
export const UNLIKELY_TIMES = 3; // RM per kg over 3 times the expected
export const UNLIKELY_KG = 500; // a sale line over 500 kg
export const OVERSELL = 1.05; // sold and not sold above picked by more than 5 %

const crop = (c) => cropShortName(c);
const exact = (kg) => kgText(kg, { exact: true });
const sameKg = (a, b) => Math.round(a * 100) === Math.round(b * 100);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "10 Nov" of a farm date.
export const dayWords = (date) => `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
// When a record was entered, against now: "just now", "1 minute ago", "7 minutes ago", else "on 10 Nov".
export function agoWords(now, at) {
  const min = Math.round((now - at) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  return `on ${dayWords(localDate(at))}`;
}

// A sale (deliveryBody's checked delivery: { soldAt, buyerId, buyer, lines }) against the buyer's other deliveries not voided
// near it ([{ id, soldAt, createdAt, lines: [{ crop, kg, total }] }], the delivery itself left out): a line of the same crop
// and kg sold within 10 minutes, or sold the same farm day and recorded within the last 10 minutes (a back-dated sale is
// 12:00 every time).
export function saleDuplicateAsks(d, others, now) {
  const asks = [];
  d.lines.forEach((l, i) => {
    for (const o of others) {
      const near = Math.abs(o.soldAt - d.soldAt) <= DUPLICATE_MS
        || (localDate(o.soldAt) === localDate(d.soldAt) && now - o.createdAt <= DUPLICATE_MS);
      const twin = near && o.lines.find((x) => x.crop === l.crop && sameKg(x.kg, l.kg));
      if (!twin) continue;
      asks.push({
        kind: 'duplicate', field: `lines.${i}.kg`,
        text: `${d.buyer} already has ${exact(twin.kg)} of ${crop(l.crop)} at ${localTime(o.soldAt)} (${rmText(twin.total)}), recorded ${agoWords(now, o.createdAt)}. Is this another sale?`,
      });
      return;
    }
  });
  return asks;
}

// A sale's lines against the expected prices (Settings → Yield): RM per kg over 3 times, kg over 500 (as the dialog asked).
export function salePriceAsks(lines, cropYield) {
  return lines.flatMap((l, i) => {
    const out = [];
    const expected = cropYield?.[l.crop]?.priceKg;
    if (typeof expected === 'number' && expected > 0 && l.priceKg > UNLIKELY_TIMES * expected) {
      const times = (Math.round((l.priceKg / expected) * 10) / 10).toFixed(1);
      const many = times === '3.0' ? 'over 3' : times;
      out.push({ kind: 'price', field: `lines.${i}.priceKg`, text: `That's ${many} times the expected ${rmText(expected)} per kg. Is ${rmText(l.priceKg)} right?` });
    }
    if (l.kg > UNLIKELY_KG) out.push({ kind: 'kg', field: `lines.${i}.kg`, text: `Is ${exact(l.kg)} right?` });
    return out;
  });
}

// A crop's balance on a farm day (spec 5.3): from its first pick not voided, the kg picked to the day's end, and the kg sold
// and not sold from the first pick's day to the day's end. picks [{ kg, pickedAt }], sales [{ kg, soldAt }], notSold [{ kg,
// at }], all not voided. → { firstAt (null: never picked), picked, sold, notSold }.
export function cropBalance({ picks, sales, notSold }, date) {
  const end = dayStart(addDays(date, 1)) - 1;
  const firstAt = picks.length ? Math.min(...picks.map((p) => p.pickedAt)) : null;
  if (firstAt === null) return { firstAt, picked: 0, sold: 0, notSold: 0 };
  const from = dayStart(localDate(firstAt));
  const sum = (list, at) => Math.round(list.filter((x) => x[at] >= from && x[at] <= end).reduce((s, x) => s + x.kg, 0) * 100) / 100;
  return { firstAt, picked: sum(picks, 'pickedAt'), sold: sum(sales, 'soldAt'), notSold: sum(notSold, 'at') };
}

// Over: sold + not sold above picked × 1.05, to 0.01 kg.
export const oversold = (b) => Math.round((b.sold + b.notSold) * 100) > Math.round(b.picked * OVERSELL * 100 + 1e-6);

// A sale's lines against their crops' balances (balanceOf(crop, date) → cropBalance's, without this sale): no pick of the
// crop on or before the sale's day asks `before-picked`; else sold and not sold, this line's kg added, above picked × 1.05
// asks `oversell`.
export function saleBalanceAsks(d, balanceOf) {
  const date = localDate(d.soldAt);
  return d.lines.flatMap((l, i) => {
    const b = balanceOf(l.crop, date);
    if (b.firstAt === null || localDate(b.firstAt) > date) {
      return [{ kind: 'before-picked', field: `lines.${i}.crop`, text: `No ${crop(l.crop)} pick is recorded on or before ${dayWords(date)}. Is the crop or the date right?` }];
    }
    const after = { ...b, sold: b.sold + l.kg };
    return oversold(after) ? [oversellAsk(l.crop, after, l.kg, `lines.${i}.kg`)] : [];
  });
}

export function oversellAsk(c, b, kg, field) {
  const total = Math.round((b.sold + b.notSold) * 100) / 100;
  return { kind: 'oversell', field, text: `That makes ${exact(total)} of ${crop(c)} sold or not sold, but ${exact(b.picked)} was picked. Is ${exact(kg)} right?` };
}

// A one-off cost against the others not voided, entered by hand: the same date, category, amount and place.
// others [{ id, date, category, amount, roomId, repeat, createdAt, by }] (by: who entered it, from its add entry, or null).
// (entered by hand only: a row Batches or Inventory keep is not a duplicate of one typed)
export function costDuplicateAsks(c, others, { label }) {
  if (c.repeat) return [];
  const twin = others.find((o) => !o.repeat && (o.sourceKind ?? 'manual') === 'manual' && o.date === c.date && o.category === c.category && Math.round(o.amount * 100) === Math.round(c.amount * 100)
    && (o.roomId ?? null) === (c.roomId ?? null));
  if (!twin) return [];
  const who = twin.by ? ` (by ${twin.by} at ${localTime(twin.createdAt)})` : '';
  return [{ kind: 'duplicate', field: 'amount', text: `A ${label} cost of ${rmText(c.amount)} on ${dayWords(c.date)} is already recorded${who}. Is this another one?` }];
}

// A harvest (Record, Edit, a check's Done) in a room: { crop, kg, pickedAt, field } against the room's other picks not voided
// ([{ crop, kg, pickedAt, worker }], itself left out), the run's blocks of the crop and the room's name. A pick of the same
// crop and kg within 10 minutes asks `duplicate` (not on an edit: dup false); the crop's picks of the 10 minutes up to this one,
// with it, over 0.3 kg a block ask `pick`.
export function harvestAsks(h, others, { blocks, roomName, dup = true }) {
  const asks = [];
  const field = h.field ?? 'kg';
  const sameCrop = others.filter((o) => o.crop === h.crop);
  if (dup) {
    const twin = sameCrop.find((o) => sameKg(o.kg, h.kg) && Math.abs(o.pickedAt - h.pickedAt) <= DUPLICATE_MS);
    if (twin) {
      const by = twin.worker ? ` by ${twin.worker}` : '';
      asks.push({ kind: 'duplicate', field, text: `${exact(twin.kg)} of ${crop(h.crop)} was recorded in ${roomName} at ${localTime(twin.pickedAt)}${by}. Is this another pick?` });
    }
  }
  if (typeof blocks === 'number' && blocks > 0) {
    const recent = sameCrop.filter((o) => o.pickedAt <= h.pickedAt && h.pickedAt - o.pickedAt <= QUICK_PICKS_MS);
    const kg = Math.round((h.kg + recent.reduce((s, o) => s + o.kg, 0)) * 100) / 100;
    const perBlock = kg / blocks;
    if (perBlock > PICK_MAX_PER_BLOCK) {
      const each = `${(Math.round(perBlock * 100) / 100).toFixed(2)} kg a block`;
      const text = recent.length
        ? `With the picks of the last 10 minutes that makes ${exact(kg)} from ${blocks.toLocaleString('en-US')} blocks, ${each}. Is ${exact(h.kg)} right?`
        : `That's ${each} in one pick. Is ${exact(h.kg)} right?`;
      asks.push({ kind: 'pick', field, text });
    }
  }
  return asks;
}

const REASON_WORDS = { spoiled: 'spoiled', rejected: 'rejected', sample: 'a sample', staff: 'eaten by staff', dried: 'dried', given: 'given away' };
export const notSoldReasonWords = (r) => REASON_WORDS[r] ?? r;

// A Not sold record { at, crop, kg, reason } against the others not voided (itself left out): the same crop, kg and reason
// within 10 minutes asks `duplicate`; more than the crop's unsold kg (unsold: null when not known) asks `beyond`; the crop's
// balance (balance: cropBalance's without it) over asks `oversell`.
export function notSoldAsks(n, others, { unsold = null, balance = null } = {}) {
  const asks = [];
  const twin = others.find((o) => o.crop === n.crop && o.reason === n.reason && sameKg(o.kg, n.kg) && Math.abs(o.at - n.at) <= DUPLICATE_MS);
  if (twin) {
    asks.push({ kind: 'duplicate', field: 'kg', text: `${exact(twin.kg)} of ${crop(n.crop)} was recorded not sold (${notSoldReasonWords(twin.reason)}) at ${localTime(twin.at)}. Is this another?` });
  }
  if (unsold !== null && Math.round(n.kg * 100) > Math.round(unsold * 100)) {
    asks.push({ kind: 'beyond', field: 'kg', text: `That's more than the ${exact(unsold)} of ${crop(n.crop)} not yet sold. Is ${exact(n.kg)} right?` });
  }
  if (balance) {
    const after = { ...balance, notSold: balance.notSold + n.kg };
    if (oversold(after) && !asks.some((a) => a.kind === 'beyond')) asks.push(oversellAsk(n.crop, after, n.kg, 'kg'));
  }
  return asks;
}
