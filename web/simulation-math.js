// Pure helpers for the simulation results page and the Simulations card (no DOM, so they can be tested in Node).
// Spec 2026-10-20-crops-and-simulation-design.md sections 4.3 and 4.5. Times of a run are seconds from its start (day 1, 00:00).

import { CROPS, STAGES } from './crops.js';
import { formatKWh, formatRM, formatLitres } from './usage-math.js';
import { TIMELINE_ROWS } from './history-math.js';

export const DAY_S = 86_400;
const DASH = '—';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (v) => (finite(v) ? `${v.toFixed(1)} %` : DASH);

// "20 Oct 10:42" in local time.
export function formatDateTime(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ---- time in band ----

export const TILES = [
  { key: 't', label: 'Temperature' },
  { key: 'rh', label: 'Humidity' },
  { key: 'co2', label: 'CO₂' },
  { key: 'all', label: 'All three' },
];

// The four tiles of summary.inBand as texts.
export const tileList = (summary) => TILES.map((t) => ({ ...t, value: pct(summary?.inBand?.[t.key]) }));

// "Fruiting, flush 2", "Rest after flush 2", "Spawn run".
export function stageName(stage, flush) {
  if (stage === 'fruiting') return `${STAGES.fruiting}, flush ${flush}`;
  if (stage === 'rest') return `Rest after flush ${flush}`;
  return STAGES[stage] ?? String(stage);
}

// The per-stage table rows of summary.perStage.
export function stageRows(perStage) {
  return (Array.isArray(perStage) ? perStage : []).map((s) => {
    const from = Math.floor(s.from / DAY_S) + 1;
    return {
      name: stageName(s.stage, s.flush),
      days: `day ${from} to day ${Math.max(from, Math.ceil(s.to / DAY_S))}`,
      t: pct(s.inBand?.t), rh: pct(s.inBand?.rh), co2: pct(s.inBand?.co2), all: pct(s.inBand?.all),
    };
  });
}

// ---- charts ----

// "day 3 13:05" for a second of the run.
export function formatRunTime(s) {
  const day = Math.floor(s / DAY_S) + 1;
  const m = Math.floor((s % DAY_S) / 60);
  return `day ${day} ${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

// The length of the run in seconds: its days, else its last sample, else one day.
export function runEnd(result) {
  if (finite(result?.summary?.days)) return result.summary.days * DAY_S;
  const last = result?.series?.at(-1);
  return last && last.s > 0 ? last.s : DAY_S;
}

// Axis ticks "day 1, day 2 …" at the start of days, every few days when there are many; a run shorter than two days gets
// hour ticks ("04:00") with day starts labelled. at is in seconds. Never more than maxTicks.
export function dayTicks(totalS, maxTicks) {
  const ticks = [];
  if (totalS >= 2 * DAY_S) {
    const step = Math.ceil(totalS / DAY_S / Math.max(1, maxTicks));
    for (let d = 0; d * DAY_S < totalS; d += step) ticks.push({ at: d * DAY_S, label: `day ${d + 1}` });
    return ticks;
  }
  const hours = totalS / 3600;
  const step = [1, 2, 3, 4, 6, 12].find((h) => Math.ceil(hours / h) <= maxTicks) ?? 12;
  for (let h = 0; h * 3600 < totalS; h += step) {
    const at = h * 3600;
    ticks.push({ at, label: at % DAY_S === 0 ? `day ${at / DAY_S + 1}` : `${pad2(h % 24)}:00` });
  }
  return ticks;
}

// The three charts: result.series field, the band's fields, the outdoor field (none for CO₂).
export const CHARTS = [
  { id: 'sim-t', field: 't', low: 'tLow', high: 'tHigh', outdoor: 'outT', label: 'Temperature', unit: '°C', color: 'var(--s-t)', digits: 1, minSpan: 1 },
  { id: 'sim-rh', field: 'rh', low: 'rhLow', high: 'rhHigh', outdoor: 'outRH', label: 'Humidity', unit: '%RH', color: 'var(--s-rh)', digits: 1, minSpan: 5, bounds: [0, 100] },
  { id: 'sim-co2', field: 'co2', low: 'co2Low', high: 'co2High', label: 'CO₂', unit: 'ppm', color: 'var(--s-co2)', digits: 0, minSpan: 100 },
];

// result.series → [{ at, value }] with at in seconds.
export const chartPoints = (series, field) => (series ?? []).map((r) => ({ at: r.s, value: finite(r[field]) ? r[field] : null }));

// At most about 2 x `max` points: every bucket of points keeps its lowest and its highest, so a peak never disappears.
export function thinPoints(points, max) {
  if (points.length <= 2 * max) return points;
  const size = Math.ceil(points.length / max);
  const out = [];
  for (let i = 0; i < points.length; i += size) {
    const part = points.slice(i, i + size);
    let lo = part[0];
    let hi = part[0];
    for (const p of part) {
      if (p.value !== null && (lo.value === null || p.value < lo.value)) lo = p;
      if (p.value !== null && (hi.value === null || p.value > hi.value)) hi = p;
    }
    out.push(...(lo === hi ? [lo] : lo.at < hi.at ? [lo, hi] : [hi, lo]));
  }
  return out;
}

// The dashed second line of a chart (the outdoor values), or null when the series has none.
export function outdoorLine(series, field) {
  const points = chartPoints(series, field);
  return points.some((p) => p.value !== null) ? { label: 'Outdoor', points } : null;
}

// The band as it moved: [{ from, to, low, high }] in seconds, one step for each change; the last step runs to endS.
export function bandSteps(series, lowKey, highKey, endS) {
  const steps = [];
  (series ?? []).forEach((r, i) => {
    const to = i + 1 < series.length ? series[i + 1].s : endS;
    if (!(to > r.s) || !finite(r[lowKey]) || !finite(r[highKey])) return;
    const prev = steps.at(-1);
    if (prev && prev.low === r[lowKey] && prev.high === r[highKey] && prev.to === r.s) prev.to = to;
    else steps.push({ from: r.s, to, low: r[lowKey], high: r[highKey] });
  });
  return steps;
}

// ---- machine timeline ----

// Whether the run was asked to have a dehumidifier (the input as it was posted).
const hasDehumidifier = (input) => input?.physics?.dehumidifierLday > 0;

// Spans closer together than minGap seconds drawn as one (a long run has tens of thousands; they cannot be told apart).
// A span keeps its own length, so a short one stays; `same` (optional) says whether two neighbours may be joined.
export function mergeSpans(spans, minGap, same = () => true) {
  const out = [];
  for (const s of spans) {
    const last = out.at(-1);
    if (last && minGap > 0 && s.from - last.to < minGap && same(last, s)) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

// The rows of drawTimeline: the on-spans (seconds) of result.machines and the aircon's setpoint marks. minGap: spans closer
// than this many seconds (one pixel of the chart) are joined; the aircon's only when the setpoint is the same.
// The dehumidifier's row is there when the run had one (input.physics.dehumidifierLday above 0) or it has spans.
export function timelineRows(machines, minGap = 0, input = null) {
  const hadDehumidifier = hasDehumidifier(input) || (machines?.dehumidifier?.length ?? 0) > 0;
  return TIMELINE_ROWS.filter((r) => !r.fitted || hadDehumidifier).map((r) => {
    const raw = (machines?.[r.key] ?? []).map((s) => ({ from: s.from, to: s.to, source: 'auto', setpoint: s.setpoint }));
    const marks = [];
    if (r.key === 'ac') {
      let prev = null;
      for (const s of raw) {
        if (!prev || prev.to !== s.from || prev.setpoint !== s.setpoint) marks.push({ at: s.from, text: `${s.setpoint} °C` });
        prev = s;
      }
    }
    const spans = mergeSpans(raw, minGap, (a, b) => a.setpoint === b.setpoint).map(({ setpoint, ...span }) => span);
    return { ...r, spans, marks };
  });
}

// ---- energy and water ----

const MACHINES = [['intake', 'Intake'], ['exhaust', 'Exhaust'], ['circulation', 'Circulation'], ['humidifier', 'Humidifier'], ['dehumidifier', 'Dehumidifier'], ['ac', 'Aircon']];

// summary → the texts of the energy and water part: totals, cost (null without a price) and a row per machine.
// The dehumidifier's row is there when the run had one (input) or it used energy; removed is the "Water taken out" text, or null.
export function energyView(summary, input = null) {
  const e = summary?.energy;
  const w = summary?.water;
  const by = e?.byMachine;
  const total = MACHINES.reduce((a, [k]) => a + (finite(by?.[k]) ? by[k] : 0), 0);
  return {
    kWh: formatKWh(e?.kWh),
    cost: finite(e?.cost) ? formatRM(e.cost) : null,
    litres: formatLitres(w?.litres),
    waterCost: finite(w?.cost) ? formatRM(w.cost) : null,
    removed: finite(w?.removedLitres) && w.removedLitres > 0 ? formatLitres(w.removedLitres) : null,
    rows: by ? MACHINES.filter(([key]) => key !== 'dehumidifier' || hasDehumidifier(input) || by.dehumidifier > 0).map(([key, label]) => ({
      key, label, kWh: formatKWh(by[key]), share: total > 0 && finite(by[key]) ? `${Math.round((by[key] / total) * 100)} %` : DASH,
    })) : [],
  };
}

// summary.perDay → the series of the bar chart of usage.js (key 'kWh' or 'litres'), labelled "day 1" …
export const perDayBars = (perDay, key) =>
  (Array.isArray(perDay) ? perDay : []).map((d) => ({ date: `day ${d.day}`, v: finite(d[key]) ? d[key] : null, metered: false }));

// ---- words ----

export const headLine = (roomName) => `Simulation of ${roomName}`;

const grouped = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// What was asked, in one line (the input as it was posted).
export function inputLine(input) {
  const p = input?.physics;
  if (!p) return '';
  const crops = (input.crops ?? []).map((c) => `${CROPS[c.crop]?.name ?? c.crop} ${c.blocks}`).join(' and ');
  const stage = STAGES[input.stage]?.toLowerCase() ?? input.stage;
  return [
    `${crops} blocks, starting at ${stage}, ${plural(input.days, 'day', 'days')}`,
    `walls ${p.wallUA} W/K, sun ${p.sunW} W, outdoor ${p.outdoorLow}–${p.outdoorHigh} °C, dew point ${p.outdoorDew} °C`,
    `fan ${p.fanFlow} m³/h, aircon ${grouped(p.acBTU)} BTU/h, humidifier ${p.humidifierLH} L/h${p.dehumidifierLday > 0 ? `, dehumidifier ${p.dehumidifierLday} L/day` : ''}`,
  ].join(' · ');
}

const STATUS_WORDS = { queued: 'Waiting', done: 'Done', failed: 'Failed' };

// One run of GET /api/rooms/:id/simulations as the texts of a row of the Simulations card.
export function runRow(run, roomId) {
  const days = run.summary?.days ?? run.input?.days;
  const done = run.status === 'done';
  return {
    id: run.id,
    href: `#/rooms/${roomId}/simulations/${run.id}`,
    date: formatDateTime(run.createdAt),
    days: finite(days) ? plural(days, 'day', 'days') : DASH,
    all: done ? pct(run.summary?.inBand?.all) : DASH,
    kWh: done ? formatKWh(run.summary?.energy?.kWh) : DASH,
    litres: done ? formatLitres(run.summary?.water?.litres) : DASH,
    status: run.status === 'running' ? `Running ${Math.round((finite(run.progress) ? run.progress : 0) * 100)} %` : STATUS_WORDS[run.status] ?? String(run.status),
  };
}

export const isActive = (run) => run?.status === 'queued' || run?.status === 'running';
