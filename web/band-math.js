// Near a band's edge, the same on the Overview and the room page (critique 2026-10-28: amber on a CO₂ that was low and
// good, and on a humidity the humidifier holds at the band's low edge on purpose, taught people to ignore amber).

const KEY = { t: 'T', rh: 'RH', co2: 'CO2', T: 'T', RH: 'RH', CO2: 'CO2' };
// Which edge hurts: temperature both; humidity the top, and the bottom only while it is falling (the humidifier switches
// on there, so a steady or rising humidity at the bottom is the controller working). CO₂ has no band to stay in: its words
// say what the air exchange is doing (co2Status).
const HARM = { T: { top: true, bottom: true }, RH: { top: true, bottom: 'falling' } };
const FALLING = -0.3; // % RH over the trend's span: less than this is falling
export const NEAR_SHARE = 0.15; // within 15 % of the band's width of an edge

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

// The change over the last spanMs of [{ at, value }] (last value minus the first one inside the span), or null.
export function trendOf(points, spanMs) {
  const list = (points ?? []).filter((p) => p && num(p.at) !== null && num(p.value) !== null);
  if (list.length < 2) return null;
  const last = list[list.length - 1];
  const first = list.find((p) => p.at >= last.at - spanMs);
  return first && first !== last ? last.value - first.value : null;
}

// 'top', 'bottom', 'falling' (near the bottom and falling) or null: an in-band value near an edge that hurts. trend: trendOf the reading (null: not known).
export function nearEdge(key, value, low, high, trend = null) {
  const harm = HARM[KEY[key]];
  if (!harm || num(value) === null || num(low) === null || num(high) === null || !(high > low)) return null;
  if (value > high || value < low) return null;
  const room = NEAR_SHARE * (high - low);
  if (high - value <= room) return harm.top ? 'top' : null;
  if (value - low <= room) {
    if (harm.bottom === 'falling') return num(trend) !== null && trend < FALLING ? 'falling' : null;
    return harm.bottom ? 'bottom' : null;
  }
  return null;
}

const NEAR_TEXT = { top: 'near the top', bottom: 'near the bottom', falling: 'near the bottom and falling' };
export const nearText = (edge) => NEAR_TEXT[edge] ?? '';

// The two CO₂ numbers are where the air exchange starts (co2High) and stops (co2Low), not a band to stay in (owner,
// 2026-10-28): "starts at 900 ppm, stops at 700 ppm". fmt: how a number is written (grouped by default).
export const exchangePoints = (low, high, fmt = (x) => Number(x).toLocaleString('en-US', { maximumFractionDigits: 1 })) =>
  `starts at ${fmt(high)} ppm, stops at ${fmt(low)} ppm`;

// CO₂ in the air exchange's words (critique 2026-10-28: "In band · near the top" for a CO₂ the exchange was bringing down
// taught people to ignore amber): { text, tone } with tone 'good', 'neutral', 'amber' or 'critical', or null without a
// value or its points. stop, start: co2Low, co2High; safety: co2Safety (null: not known); exchange: whether the air exchange
// runs (null: not known, taken as off). Near the safety level: within 15 % of the gap from the start point to it.
export function co2Status(value, { stop, start, safety = null, exchange = null } = {}) {
  if (num(value) === null || num(stop) === null || num(start) === null) return null;
  if (num(safety) !== null && value >= safety) return { text: 'At the safety level', tone: 'critical' };
  if (num(safety) !== null && safety > start && value >= safety - NEAR_SHARE * (safety - start)) return { text: 'Near the safety level', tone: 'amber' };
  if (exchange === true) return { text: 'Exchange running', tone: 'neutral' };
  if (value < stop) return { text: 'Below the stop point', tone: 'good' };
  if (value >= start) return { text: 'Over the start point', tone: 'amber' };
  return { text: 'Exchange off', tone: 'good' };
}
