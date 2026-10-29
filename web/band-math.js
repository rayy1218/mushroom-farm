// Near a band's edge, the same on the Overview and the room page (critique 2026-10-28: amber on a CO₂ that was low and
// good, and on a humidity the humidifier holds at the band's low edge on purpose, taught people to ignore amber).

const KEY = { t: 'T', rh: 'RH', co2: 'CO2', T: 'T', RH: 'RH', CO2: 'CO2' };
export const NEAR_SHARE = 0.15; // within 15 % of the band's width of an edge
export const NEAR_DWELL_MS = 15 * 60_000; // near an edge this long is amber whatever the machines do
// A trend toward an edge over the trend's span worth a word: humidity in % RH, temperature in °C.
const TREND_WORD = { T: 0.1, RH: 0.3 };

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

// The humidifier's switch points sit inside the humidity band (owner, 2026-10-29: on at the lower limit and off at the upper
// held the room at its edges): on at the lower limit plus a margin, off at the upper limit less it. The margin is 1 % RH for a
// band 6 % RH or wider and a quarter of a narrower band, so the two points never meet. Rounded to 0.1. The controller
// (server/controller.js decide) and every page that states the points use this. → { on, off } in % RH.
export const HUMIDIFIER_MARGIN = 1;
export function humidifierPoints(low, high) {
  const m = high - low >= 6 ? HUMIDIFIER_MARGIN : (high - low) / 4;
  return { on: Math.round((low + m) * 10) / 10, off: Math.round((high - m) * 10) / 10 };
}

// The change over the last spanMs of [{ at, value }] (last value minus the first one inside the span), or null.
export function trendOf(points, spanMs) {
  const list = (points ?? []).filter((p) => p && num(p.at) !== null && num(p.value) !== null);
  if (list.length < 2) return null;
  const last = list[list.length - 1];
  const first = list.find((p) => p.at >= last.at - spanMs);
  return first && first !== last ? last.value - first.value : null;
}

// 'top', 'bottom' or null: an in-band temperature or humidity within 15 % of the band's width of an edge. CO₂ has no band
// to stay in: its words say what the air exchange is doing (co2Status).
export function nearEdge(key, value, low, high) {
  if (!TREND_WORD[KEY[key]] || num(value) === null || num(low) === null || num(high) === null || !(high > low)) return null;
  if (value > high || value < low) return null;
  const room = NEAR_SHARE * (high - low);
  if (high - value <= room) return 'top';
  if (value - low <= room) return 'bottom';
  return null;
}

// How long (ms) the readings [{ at, value }] have stayed near that edge or past it: the newest stretch, a failed poll (value
// null) not breaking it. 0 when the newest reading is not near it.
export function nearFor(points, low, high, edge) {
  const list = (points ?? []).filter((p) => p && num(p.at) !== null && num(p.value) !== null);
  if (!list.length || num(low) === null || num(high) === null) return 0;
  const room = NEAR_SHARE * (high - low);
  const near = (v) => (edge === 'top' ? v >= high - room : v <= low + room);
  let first = null;
  for (let i = list.length - 1; i >= 0 && near(list[i].value); i--) first = list[i];
  return first ? list[list.length - 1].at - first.at : 0;
}

// Whether the machine that should act at this edge is known not to: humidity low, at or under the humidifier's on-point and
// the humidifier off; humidity high, at the dehumidifier's on-point (the band's top) and a fitted dehumidifier off, or at or
// over the humidifier's off-point and the humidifier still on; temperature high and the aircon not cooling; temperature low
// and the aircon cooling. A machine that has not reached its own on-point is acting as told (critique 2026-10-29).
// machines: { humidifier, dehumidifier, cooling }, each true (running), false (fitted and not running) or null (none, or
// not known): null is never "not acting", so such a reading turns amber only after 15 min near the edge.
function notActing(key, edge, machines, value, low, high) {
  const m = machines ?? {};
  if (key === 'RH') {
    const points = humidifierPoints(low, high);
    if (edge === 'bottom') return m.humidifier === false && value <= points.on;
    return (m.dehumidifier === false && value >= high) || (m.humidifier === true && value >= points.off);
  }
  return edge === 'top' ? m.cooling === false : m.cooling === true;
}

// The amber near-edge words (critique 2026-10-28, owner: amber on a reading the machines were holding taught people to
// ignore it): { edge, text } when an in-band temperature or humidity is near an edge and the machine that should act is not
// acting, or the reading has stayed near that edge 15 min (points: its recent readings, oldest first); null otherwise (the
// calm state). text: "Near low", "Near high", with "· falling" or "· rising" when the trend runs toward that edge.
export function nearChip(key, value, low, high, { trend = null, points = null, machines = null } = {}) {
  const k = KEY[key];
  const edge = nearEdge(k, value, low, high);
  if (!edge) return null;
  if (!notActing(k, edge, machines, value, low, high) && nearFor(points, low, high, edge) < NEAR_DWELL_MS) return null;
  const toward = num(trend) !== null && (edge === 'top' ? trend > TREND_WORD[k] : trend < -TREND_WORD[k]);
  return { edge, text: `Near ${edge === 'top' ? 'high' : 'low'}${toward ? ` · ${edge === 'top' ? 'rising' : 'falling'}` : ''}` };
}

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
