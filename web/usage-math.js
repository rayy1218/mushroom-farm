// Pure helpers for the energy and water cards (no DOM, so they can be tested in Node).
// Spec 2026-10-20-energy-water-outdoor-design.md sections 5 and 7. Every function takes a missing or odd reply
// (an older server) and shows dashes instead of throwing.

import { roomHash } from './route.js';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DASH = '—';

export const USAGE_DAYS = 30;
export const USAGE_REFRESH_MS = 60_000; // usage changes slowly: asked at most once a minute

// ---------------- numbers as text ----------------

const grouped = (n, digits) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatKWh(v) {
  if (!finite(v)) return DASH;
  return `${grouped(v, v >= 100 ? 0 : 1)} kWh`;
}

export function formatRM(v) {
  return finite(v) ? `RM ${grouped(v, 2)}` : DASH;
}

export function formatLitres(v) {
  if (!finite(v)) return DASH;
  return `${grouped(v, v < 10 ? 1 : 0)} L`;
}

// "2026-10-12" → "12 Oct"; anything else comes back as it is.
export function dateLabel(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(date ?? DASH);
}

// ---------------- the tiles ----------------

// One period of the reply ({ kWh, cost, waterL, waterCost, metered }) → the texts of a tile.
// waterCost is null without a water price: the line is then left out (null).
export function periodTile(label, p) {
  const ok = p && typeof p === 'object';
  return {
    label,
    kWh: formatKWh(ok ? p.kWh : null),
    cost: formatRM(ok ? p.cost : null),
    water: formatLitres(ok ? p.waterL : null),
    waterCost: ok && finite(p.waterCost) ? formatRM(p.waterCost) : null,
    basis: !ok ? '' : p.metered === true ? 'metered' : 'estimated',
  };
}

// The three tiles of the room card, or the two of the farm card (withWeek false).
export function usageTiles(usage, withWeek = true) {
  const u = usage ?? {};
  const tiles = [periodTile('Today', u.today)];
  if (withWeek) tiles.push(periodTile('7 days', u.last7));
  tiles.push(periodTile('30 days', u.last30));
  return tiles;
}

// ---------------- the bar charts ----------------

// The days of the reply as bars of one value: key 'kWh' or 'waterL'. A day without a number is 0 high but keeps its slot.
export function barSeries(days, key) {
  return (Array.isArray(days) ? days : []).map((d) => ({
    date: d?.date ?? '',
    v: finite(d?.[key]) ? d[key] : null,
    metered: d?.metered === true,
  }));
}

// A round top for an axis: 1, 2 or 5 times a power of ten, not below v.
export function niceMax(v) {
  if (!finite(v) || v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export const BAR_M = { left: 44, right: 8, top: 10, bottom: 24 };

// Where everything goes in a chart of `width` x `height` pixels, drawn 1:1.
// { plot: { x0, x1, y0, y1 }, max, bars: [{ x, y, w, h, date, v, metered }], yTicks: [{ v, y }], xTicks: [{ x, label }] }
export function barLayout(series, width, height, m = BAR_M) {
  const x0 = m.left;
  const x1 = width - m.right;
  const y0 = height - m.bottom;
  const y1 = m.top;
  const n = series.length;
  const top = niceMax(Math.max(0, ...series.map((s) => (finite(s.v) ? s.v : 0))));
  const slot = n > 0 ? (x1 - x0) / n : 0;
  const bw = Math.max(1, Math.min(slot - 2, slot * 0.72));
  const yFor = (v) => y0 - (v / top) * (y0 - y1);
  const bars = series.map((s, i) => {
    const v = finite(s.v) ? s.v : 0;
    const y = yFor(v);
    return { x: x0 + slot * i + (slot - bw) / 2, y, w: bw, h: y0 - y, date: s.date, v: s.v, metered: s.metered };
  });
  // about one date label per 70 px, counted back from today so the last bar is always labelled
  const every = slot > 0 ? Math.max(1, Math.ceil(70 / slot)) : 1;
  const xTicks = [];
  for (let i = n - 1; i >= 0; i -= every) xTicks.unshift({ x: x0 + slot * i + slot / 2, label: dateLabel(series[i].date) });
  // the last label ends at the plot's right edge, so it is not cut off
  const last = xTicks.at(-1);
  if (last) Object.assign(last, { anchor: 'end', x: Math.min(last.x + slot / 2, x1) });
  const yTicks = [0, top / 2, top].map((v) => ({ v, y: yFor(v) }));
  return { plot: { x0, x1, y0, y1 }, max: top, bars, yTicks, xTicks };
}

// The text of an axis value: whole numbers stay whole, others get the decimals they need (0.05 stays 0.05, not 0.1).
export function axisLabel(v) {
  if (Number.isInteger(v)) return grouped(v, 0);
  const places = Math.min(3, Math.max(1, -Math.floor(Math.log10(Math.abs(v))) + 1));
  return grouped(Number(v.toFixed(places)), places).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

// Index of the bar nearest to x (a pointer position); -1 for no bars.
export function barAt(layout, x) {
  let best = -1;
  let gap = Infinity;
  layout.bars.forEach((b, i) => {
    const d = Math.abs(b.x + b.w / 2 - x);
    if (d < gap) { gap = d; best = i; }
  });
  return best;
}

// The finding in words, for the chart's aria-label: total, the highest day, today, and how many days are metered.
// kind: 'energy' (kWh), 'water' (L), or 'run-energy' / 'run-water' (the days of a simulation).
export function barsSummary(series, kind) {
  const water = kind === 'water' || kind === 'run-water';
  const fmt = water ? formatLitres : formatKWh;
  const title = water ? 'Water per day' : 'Energy per day';
  const have = series.filter((s) => finite(s.v));
  if (have.length === 0) return `${title}: no data`;
  const total = have.reduce((a, s) => a + s.v, 0);
  const peak = have.reduce((a, s) => (s.v > a.v ? s : a), have[0]);
  const today = series[series.length - 1];
  const run = kind.startsWith('run-'); // a simulation's days: no "last", no today, nothing metered
  const parts = [`${title}, ${run ? '' : 'last '}${series.length} days: total ${fmt(total)}`, `highest ${fmt(peak.v)} on ${dateLabel(peak.date)}`];
  if (!run && finite(today.v)) parts.push(`today ${fmt(today.v)}`);
  if (kind === 'energy') {
    const metered = series.filter((s) => s.metered).length;
    parts.push(metered === 0 ? 'all estimated' : metered === series.length ? 'all metered' : `${metered} ${metered === 1 ? 'day' : 'days'} metered, the rest estimated`);
  }
  return parts.join(', ');
}

// The tooltip of a bar.
export function barTip(bar, kind) {
  const fmt = kind === 'water' || kind === 'run-water' ? formatLitres : formatKWh;
  const basis = kind !== 'energy' ? '' : bar.metered ? ' (metered)' : ' (estimated)';
  return `${dateLabel(bar.date)}  ${fmt(bar.v)}${basis}`;
}

// ---------------- the breakdown table ----------------

// The machines' names as the Machines list says them (critique 2026-10-29: "Intake" here, "Intake fan" there).
export const MACHINE_ROWS = [
  { key: 'intake', label: 'Intake fan' },
  { key: 'exhaust', label: 'Exhaust fan' },
  { key: 'circulation', label: 'Circulation fan' },
  { key: 'humidifier', label: 'Humidifier' },
  { key: 'dehumidifier', label: 'Dehumidifier' },
  { key: 'lights', label: 'Lights' },
  { key: 'ac', label: 'Aircon' },
  { key: 'rest', label: 'Aircon and the rest (not split by machine)' }, // a metered day: the meter less the estimates
];

// The per machine breakdown of the days: [{ key, label, kWh, share (0..1), cost }] and the total.
// The aircon row is left out when the days are all metered (its share is in "rest"); "rest" only when there is some, and
// beside an Aircon row (the estimated days') it says it is the metered days' (critique 2026-10-29c: "Not split by machine
// (mostly the aircon)" at 71 % with no Aircon row).
// The dehumidifier and lights rows show when the room has them (options.dehumidifier, options.lights) or when they used energy.
export function breakdown(days, electricityPrice, { dehumidifier = false, lights = false } = {}) {
  const list = Array.isArray(days) ? days : [];
  const sums = Object.fromEntries(MACHINE_ROWS.map((r) => [r.key, 0]));
  for (const d of list) for (const r of MACHINE_ROWS) if (finite(d?.byMachine?.[r.key])) sums[r.key] += d.byMachine[r.key];
  const rows = MACHINE_ROWS.filter((r) => (r.key === 'rest' ? sums.rest > 0 : r.key === 'ac' ? sums.ac > 0 || sums.rest <= 0
    : r.key === 'dehumidifier' ? dehumidifier || sums.dehumidifier > 0 : r.key === 'lights' ? lights || sums.lights > 0 : true));
  const total = rows.reduce((a, r) => a + sums[r.key], 0);
  const both = rows.some((r) => r.key === 'ac') && rows.some((r) => r.key === 'rest');
  return {
    rows: rows.map((r) => ({
      key: r.key,
      label: both && r.key === 'rest' ? 'Aircon and the rest on metered days (not split by machine)' : r.label,
      kWh: sums[r.key],
      share: total > 0 ? sums[r.key] / total : null,
      cost: finite(electricityPrice) ? sums[r.key] * electricityPrice : null,
    })),
    total: { kWh: total, cost: finite(electricityPrice) ? total * electricityPrice : null },
  };
}

// How the 30 days were worked out, one line under the table.
export function breakdownNote(days, { dehumidifier = false, lights = false } = {}) {
  const list = Array.isArray(days) ? days : [];
  const metered = list.filter((d) => d?.metered === true).length;
  if (list.length === 0) return '';
  const parts = ['The fans', 'the humidifier', ...(dehumidifier ? ['the dehumidifier'] : []), ...(lights ? ['the lights'] : [])];
  const estimated = `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  if (metered === list.length) return `Metered: the meter measures the whole room. ${estimated} are estimated from their run time and rating; the aircon and the rest is what is left of the meter.`;
  if (metered === 0) return 'Estimated from run time and rated power. The aircon is counted at its rated input, so this is an upper bound.';
  return `${metered} of ${list.length} days metered, the rest estimated from run time and rated power. On a metered day the meter measures the whole room and the aircon and the rest is what is left of it.`;
}

// ---------------- the farm card ----------------

// One line per room of GET /api/usage: { id, href, name, today, last30 } as texts.
export function roomLines(usage) {
  return (Array.isArray(usage?.rooms) ? usage.rooms : []).map((r) => ({
    id: r.id,
    href: roomHash(r.id, 'history'),
    name: r.name,
    today: `${formatKWh(r.today?.kWh)}\u00a0· ${formatRM(r.today?.cost)}`, // a '·' keeps to the words before it (text-math.js DOT)
    last30: `${formatKWh(r.last30?.kWh)}\u00a0· ${formatRM(r.last30?.cost)}`,
  }));
}
