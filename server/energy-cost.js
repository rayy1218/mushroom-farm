// One way to price usage days (spec 2026-11-12-data-integrity-design.md 9): each room-day's measured and estimated
// electricity at that day's tariff price, and its water at the water price, each rounded to the sen (Sales' round2: half away
// from zero on the decimal text), then the rounded days summed. Costs, Runs, Harvest and the Energy card all price days here,
// so a run's electricity is the same RM on every page and a month is the sum of its rooms. Pure.

import { round2 } from './sales-math.js';
import { priceOn } from './tariff-math.js';

// A day's kWh split: the day's own fields, or (a day of before, a fixture) all of it measured unless it says it is not.
export const splitOf = (d) => (d.kWhMeasured !== undefined
  ? { measured: d.kWhMeasured, estimated: d.kWhEstimated ?? 0 }
  : d.metered === false ? { measured: 0, estimated: d.kWh ?? 0 } : { measured: d.kWh ?? 0, estimated: 0 });

// The electricity price of a day: the tariff's (rates from tariffOf) or a flat price.
export const dayPrice = (date, { tariff = null, electricity = null } = {}) => (tariff?.length ? priceOn(tariff, date) : electricity);

// One day { date, kWh, kWhMeasured?, kWhEstimated?, waterL } → { measured, estimated, electricity, water (null without a
// water price) } in RM, each to the sen. prices: { tariff?, electricity?, water }.
export function dayCost(day, prices) {
  const price = dayPrice(day.date, prices) ?? 0;
  const { measured, estimated } = splitOf(day);
  const m = round2(measured * price);
  const e = round2(estimated * price);
  return {
    measured: m, estimated: e, electricity: round2(m + e),
    water: prices.water === null || prices.water === undefined ? null : round2(((day.waterL ?? 0) / 1000) * prices.water),
  };
}

// Days (pending ones left out by the caller) → { measured, estimated, electricity, water, kWhMeasured, kWhEstimated, kWh,
// waterL, unseenMs }: the RM sums of the rounded days.
export function energyCost(days, prices) {
  const out = { measured: 0, estimated: 0, electricity: 0, water: prices.water === null || prices.water === undefined ? null : 0, kWhMeasured: 0, kWhEstimated: 0, kWh: 0, waterL: 0, unseenMs: 0 };
  for (const d of days) {
    const c = dayCost(d, prices);
    const { measured, estimated } = splitOf(d);
    out.measured = round2(out.measured + c.measured);
    out.estimated = round2(out.estimated + c.estimated);
    out.electricity = round2(out.electricity + c.electricity);
    if (out.water !== null) out.water = round2(out.water + c.water);
    out.kWhMeasured += measured;
    out.kWhEstimated += estimated;
    out.waterL += d.waterL ?? 0;
    out.unseenMs += d.unseenMs ?? 0;
  }
  const r3 = (n) => Math.round(n * 1000) / 1000;
  return { ...out, kWhMeasured: r3(out.kWhMeasured), kWhEstimated: r3(out.kWhEstimated), kWh: r3(out.kWhMeasured + out.kWhEstimated), waterL: r3(out.waterL) };
}
