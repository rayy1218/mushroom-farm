// Near a band's edge, the same on the Overview and the room page (critique 2026-10-28: amber on a CO₂ that was low and
// good, and on a humidity the humidifier holds at the band's low edge on purpose, taught people to ignore amber).

const KEY = { t: 'T', rh: 'RH', co2: 'CO2', T: 'T', RH: 'RH', CO2: 'CO2' };
// Which edge hurts: temperature both; humidity the top, and the bottom only while it is falling (the humidifier switches
// on there, so a steady or rising humidity at the bottom is the controller working); CO₂ the top only (low is good).
const HARM = { T: { top: true, bottom: true }, RH: { top: true, bottom: 'falling' }, CO2: { top: true, bottom: false } };
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
// 2026-10-28): "starts at 900, stops at 700 ppm". fmt: how a number is written (grouped by default).
export const exchangePoints = (low, high, fmt = (x) => Number(x).toLocaleString('en-US', { maximumFractionDigits: 1 })) =>
  `starts at ${fmt(high)}, stops at ${fmt(low)} ppm`;
