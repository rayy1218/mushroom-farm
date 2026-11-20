// The tariff's days (spec 2026-11-12-data-integrity-design.md 8.1), pure: the rates not voided with their last days and
// prices, and the price of a day. server/tariffs.js keeps the rates; server/energy-cost.js prices the days.

import { addDays } from './task-rules.js';

const round4 = (n) => Math.round(n * 10_000) / 10_000;

// The rates not voided, oldest first, each with its last day (to: null for the last) and its price (rate + AFA).
export function liveRates(list) {
  const live = list.filter((r) => !r.voided).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.id - b.id));
  return live.map((r, i) => ({ ...r, to: i + 1 < live.length ? addDays(live[i + 1].from, -1) : null, price: round4(r.rate + r.afa) }));
}

// The price (RM per kWh) on a farm date: the rate holding that day (the first rate before it). rates: liveRates' list.
export function priceOn(rates, date) {
  let found = rates[0] ?? null;
  for (const r of rates) {
    if (r.from <= date) found = r;
    else break;
  }
  return found === null ? null : found.price;
}
