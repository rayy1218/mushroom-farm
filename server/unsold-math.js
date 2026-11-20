// The unsold balance (spec 2026-11-12-data-integrity-design.md 6.2), pure: what is left of each crop's picks once the sales
// and the Not sold records have taken theirs, still to sell (picked within the crop's keeping days up to today) or past its
// keeping days. A sale takes from the picks still fresh on its day, oldest first, then from older ones, then from later ones;
// a Not sold record takes the oldest first.

import { CROP_KEYS, keepDaysOf } from '../web/crops.js';
import { addDays } from './task-rules.js';

const round2 = (n) => Math.round(n * 100) / 100;

// picks [{ crop, kg, date }], sales [{ crop, kg, date, at }], notSold [{ crop, kg, date, at }] (not voided; dates the farm's),
// cropYield (Settings → Yield: keepDays, priceKg), today. → { crops: [{ crop, picked, sold, notSold, fresh, past, pastSince,
// value }] (the crops with any left, the crop list's order), total: { fresh, past, value } } (value: still to sell × the
// expected price; null when a crop with some still to sell has no price).
export function unsoldBalance({ picks, sales, notSold }, cropYield, today) {
  const crops = [];
  for (const crop of CROP_KEYS) {
    const own = picks.filter((p) => p.crop === crop).map((p) => ({ date: p.date, left: p.kg })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!own.length) continue;
    const keep = keepDaysOf(crop, cropYield);
    const take = (list, kg) => {
      let need = kg;
      for (const p of list) {
        if (need <= 0) break;
        const t = Math.min(p.left, need);
        p.left = round2(p.left - t);
        need = round2(need - t);
      }
    };
    const events = [...sales.filter((s) => s.crop === crop).map((s) => ({ ...s, sale: true })), ...notSold.filter((n) => n.crop === crop)]
      .sort((a, b) => a.at - b.at);
    for (const e of events) {
      if (!e.sale) {
        take(own, e.kg);
        continue;
      }
      const freshFrom = addDays(e.date, -(keep - 1));
      const fresh = own.filter((p) => p.date >= freshFrom && p.date <= e.date);
      const older = own.filter((p) => p.date < freshFrom);
      const later = own.filter((p) => p.date > e.date);
      take([...fresh, ...older, ...later], e.kg);
    }
    const freshFrom = addDays(today, -(keep - 1));
    const sum = (list) => round2(list.reduce((s, p) => s + p.left, 0));
    const freshPicks = own.filter((p) => p.date >= freshFrom);
    const pastPicks = own.filter((p) => p.date < freshFrom && p.left > 0);
    const fresh = sum(freshPicks);
    const past = sum(pastPicks);
    if (fresh <= 0 && past <= 0) continue;
    const price = cropYield?.[crop]?.priceKg;
    crops.push({
      crop, picked: round2(picks.filter((p) => p.crop === crop).reduce((s, p) => s + p.kg, 0)),
      sold: round2(sales.filter((s) => s.crop === crop).reduce((s, x) => s + x.kg, 0)),
      notSold: round2(notSold.filter((n) => n.crop === crop).reduce((s, x) => s + x.kg, 0)),
      fresh, past, pastSince: pastPicks.length ? addDays(pastPicks[0].date, keep) : null,
      value: fresh > 0 ? (typeof price === 'number' ? round2(fresh * price) : null) : 0,
    });
  }
  const total = {
    fresh: round2(crops.reduce((s, c) => s + c.fresh, 0)), past: round2(crops.reduce((s, c) => s + c.past, 0)),
    value: crops.some((c) => c.value === null) ? null : round2(crops.reduce((s, c) => s + c.value, 0)),
  };
  return { crops, total };
}

// A crop's unsold kg (still to sell and past its days), 0 when none.
export const unsoldOf = (balance, crop) => {
  const c = balance.crops.find((x) => x.crop === crop);
  return c ? round2(c.fresh + c.past) : 0;
};
