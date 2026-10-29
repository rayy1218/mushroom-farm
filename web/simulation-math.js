// Pure helpers for the simulation results page and the Simulations card (no DOM, so they can be tested in Node).
// Spec 2026-10-20-crops-and-simulation-design.md sections 4.3 and 4.5. Times of a run are seconds from its start (day 1, at
// its start hour: 00:00 unless the run says startHour).

import { CROPS, STAGES } from './crops.js';
import { formatKWh, formatRM, formatLitres } from './usage-math.js';
import { TIMELINE_ROWS } from './history-math.js';

export const DAY_S = 86_400;
const DASH = '—';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (v) => (finite(v) ? `${v.toFixed(1)} %` : DASH);

// A number keeps its unit on its line (critique 2026-10-28 and 2026-10-29: 'L/day', '°C' and 'min' were left alone on a
// line): a no-break space between a number and the unit after it ('% RH' as one), and a range of numbers ('25–33') does not
// break at its dash (word joiners around it).
const UNIT = /(?<=\d) (?=(?:°C|% RH|%|W\/K|m³\/h|m³|kWh|kW|BTU\/h|L\/h|L\/day|L|W|Pa|ppm|min|h|m)(?![\w/³]))/g;
export const keepUnits = (text) => text.replace(UNIT, '\u00a0').replace(/(?<=\d\u00a0%) RH/g, '\u00a0RH').replace(/(?<=\d)–(?=\d)/g, '\u2060–\u2060');

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
// The time in band as a verdict, as the Simulations list's pill: 95 % and up good, under 50 % bad, a warning between.
const inBandTone = (x) => (!finite(x) ? 'none' : x >= 95 ? 'good' : x >= 50 ? 'amber' : 'warn');
export const tileList = (summary) => TILES.map((t) => ({ ...t, value: pct(summary?.inBand?.[t.key]), tone: inBandTone(summary?.inBand?.[t.key]) }));

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
    const to = Math.max(from, Math.ceil(s.to / DAY_S));
    return {
      name: stageName(s.stage, s.flush),
      days: `day ${from} to day ${to}`,
      daysShort: from === to ? String(from) : `${from}–${to}`, // under the Days column of a narrow screen
      t: pct(s.inBand?.t), rh: pct(s.inBand?.rh), co2: pct(s.inBand?.co2), all: pct(s.inBand?.all),
    };
  });
}

// The per-stage table's columns: the long names, and the short ones a phone shows so the table fits (critique 2026-10-28).
export const STAGE_COLUMNS = [
  { long: 'Stage', short: 'Stage' }, { long: 'Days', short: 'Days' }, { long: 'Temperature', short: 'T' },
  { long: 'Humidity', short: 'RH' }, { long: 'CO₂', short: 'CO₂' }, { long: 'All three', short: 'All' },
];

// Which edges of a sideways scroller have more to show: 'none', 'end', 'start' or 'both' (a fade marks them).
export function scrollEdges(left, width, full) {
  const start = left > 1;
  const end = left + width < full - 1;
  return start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
}

// ---- charts ----

// "day 3 13:05" for a second of the run; startHour: the hour of the day the run started at (the days are the run's).
export function formatRunTime(s, startHour = 0) {
  const day = Math.floor(s / DAY_S) + 1;
  const m = Math.floor(((s + startHour * 3600) % DAY_S) / 60);
  return `day ${day} ${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

// The length of the run in seconds: its days, else its last sample, else one day.
export function runEnd(result) {
  if (finite(result?.summary?.days)) return result.summary.days * DAY_S;
  const last = result?.series?.at(-1);
  return last && last.s > 0 ? last.s : DAY_S;
}

// Axis ticks "day 1, day 2 …" at the start of days, every few days when there are many; a run shorter than two days gets
// hour ticks ("04:00", the time of day of a run that started at startHour) with day starts labelled. at is in seconds. Never
// more than maxTicks.
export function dayTicks(totalS, maxTicks, startHour = 0) {
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
    ticks.push({ at, label: at % DAY_S === 0 ? `day ${at / DAY_S + 1}` : `${pad2((h + startHour) % 24)}:00` });
  }
  return ticks;
}

// The three charts: result.series field, the band's fields, the outdoor field (none for CO₂).
export const CHARTS = [
  { id: 'sim-t', field: 't', low: 'tLow', high: 'tHigh', outdoor: 'outT', label: 'Temperature', unit: '°C', color: 'var(--s-t)', digits: 1, minSpan: 1 },
  { id: 'sim-rh', field: 'rh', low: 'rhLow', high: 'rhHigh', outdoor: 'outRH', label: 'Humidity', unit: '% RH', color: 'var(--s-rh)', digits: 1, minSpan: 5, bounds: [0, 100] },
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

// Whether the run was asked to have a dehumidifier (the input as it was posted), and whether its room had lights (the
// run's ctx.ratings: the lights follow the room's schedule).
const hasDehumidifier = (input) => input?.physics?.dehumidifierLday > 0;
const hasLights = (input) => input?.ctx?.ratings?.lights === true;

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

// The rows of drawTimeline: the on-spans (seconds) of result.machines, the aircon's setpoint marks and the filter changes
// (seconds, summary.filter.changes) on the intake's row. minGap: spans closer than this many seconds (one pixel of the chart)
// are joined; the aircon's only when the setpoint is the same.
// The dehumidifier's row is there when the run had one (input.physics.dehumidifierLday above 0) or it has spans; the lights'
// the same (the room's lights, input.ctx.ratings.lights).
export function timelineRows(machines, minGap = 0, input = null, filterChanges = []) {
  const had = {
    dehumidifier: hasDehumidifier(input) || (machines?.dehumidifier?.length ?? 0) > 0,
    lights: hasLights(input) || (machines?.lights?.length ?? 0) > 0,
  };
  return TIMELINE_ROWS.filter((r) => !r.fitted || had[r.key]).map((r) => {
    const raw = (machines?.[r.key] ?? []).map((s) => ({ from: s.from, to: s.to, source: 'auto', setpoint: s.setpoint }));
    // a short label: the timeline keeps marks at least 40 px apart, and "Filter" fits that
    const marks = r.key === 'intake' && Array.isArray(filterChanges) ? filterChanges.map((at) => ({ at, text: 'Filter' })) : [];
    if (r.key === 'ac') {
      let prev = null;
      for (const s of raw) {
        if (!prev || prev.to !== s.from || prev.setpoint !== s.setpoint) marks.push({ at: s.from, text: `${s.setpoint} °C`, value: s.setpoint });
        prev = s;
      }
    }
    const spans = mergeSpans(raw, minGap, (a, b) => a.setpoint === b.setpoint).map(({ setpoint, ...span }) => span);
    return { ...r, spans, marks };
  });
}

// ---- the intake filter (spec 2026-10-22-filter-design.md 8) ----

// summary.filter → the tiles of the filter part, or null for a run without a filter.
// startHour: the hour of the day the run started at (its change times are times of day).
export function filterView(summary, startHour = 0) {
  const f = summary?.filter;
  if (!f) return null;
  const changes = Array.isArray(f.changes) ? f.changes : [];
  return {
    tiles: [
      changes.length
        ? { label: 'Filter changes', value: String(changes.length), line: changes.map((at) => formatRunTime(at, startHour)).join(', ') }
        : { label: 'Filter changes', value: 'None', line: 'not changed in the run' },
      finite(f.meanFilterPa)
        ? { label: 'Mean filter pressure', value: `${f.meanFilterPa.toFixed(1)} Pa`, line: 'while the intake ran' }
        : { label: 'Mean filter pressure', value: DASH, line: 'the intake never ran' },
      { label: 'Unfiltered air', value: pct(f.unfilteredPct), line: 'of the exchanges, in through the leaks' },
      { label: 'Mean air exchange', value: finite(f.meanExchangeM3h) ? `${Math.round(f.meanExchangeM3h)} m³/h` : DASH, line: 'over the whole run' },
    ],
  };
}

// ---- energy and water ----

const MACHINES = [['intake', 'Intake'], ['exhaust', 'Exhaust'], ['circulation', 'Circulation'], ['humidifier', 'Humidifier'], ['dehumidifier', 'Dehumidifier'], ['lights', 'Lights'], ['ac', 'Aircon']];

// summary → the texts of the energy and water part: totals, cost (null without a price) and a row per machine.
// The dehumidifier's and the lights' rows are there when the run had them (input) or they used energy; removed is the "Water taken out" text, or null.
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
    rows: by ? MACHINES.filter(([key]) => (key === 'dehumidifier' ? hasDehumidifier(input) || by.dehumidifier > 0
      : key === 'lights' ? hasLights(input) || by.lights > 0 : true)).map(([key, label]) => ({
      key, label, kWh: formatKWh(by[key]), share: total > 0 && finite(by[key]) ? `${Math.round((by[key] / total) * 100)} %` : DASH,
    })) : [],
  };
}

// summary.perDay → the series of the bar chart of usage.js (key 'kWh' or 'litres'), labelled "day 1" …
export const perDayBars = (perDay, key) =>
  (Array.isArray(perDay) ? perDay : []).map((d) => ({ date: `day ${d.day}`, v: finite(d[key]) ? d[key] : null, metered: false }));

// ---- words ----

export const headLine = (roomName) => `Simulation of ${roomName}`;
// The back link of a result and of Suggest machines: both go to the room's Simulations tab.
export const backLabel = (roomName) => `${roomName} · Simulations`;

const grouped = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// An aircon's size: kW first, the BTU/h class it is sold by in brackets when it is one (PRODUCT.md: metric first; the
// class is its trade size).
const KW_PER_BTU = 0.00029307107;
export const AC_CLASSES = [5000, 7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000];
export const kwOfBtu = (btu) => btu * KW_PER_BTU;
export const btuOfKw = (kw) => Math.round(kw / KW_PER_BTU);
// The class a size is sold as: within 2 % of one, else null.
export const acClassOf = (btu) => (finite(btu) ? AC_CLASSES.find((c) => Math.abs(btu - c) <= 0.02 * c) ?? null : null);
export function acSize(btu) {
  if (!finite(btu)) return '—';
  if (btu === 0) return 'none';
  const cls = acClassOf(btu);
  return `${kwOfBtu(btu).toFixed(1)} kW${cls ? ` (${grouped(cls)} BTU/h class)` : ''}`;
}
const acKW = (btu) => (finite(btu) && btu > 0 ? `${(btu * 0.00029307107).toFixed(1)} kW` : 'none');

// What a run was asked, as label and value rows (the head of its page and the comparison of two runs).
export function inputRows(input) {
  const p = input?.physics;
  if (!p) return [];
  const crops = (input.crops ?? []).map((c) => `${CROPS[c.crop]?.name ?? c.crop} ${c.blocks}`).join(' and ');
  const started = startedFrom(input);
  return [
    { label: 'Crops', value: `${crops} blocks` },
    { label: 'Run', value: `from ${STAGES[input.stage]?.toLowerCase() ?? input.stage}, ${plural(input.days, 'day', 'days')}` },
    ...(started ? [{ label: 'Started from', value: started }] : []),
    { label: 'Room', value: `walls ${p.wallUA} W/K, sun ${p.sunW} W` },
    { label: 'Outdoor', value: `${p.outdoorLow}–${p.outdoorHigh} °C, dew point ${p.outdoorDew} °C` },
    { label: 'Aircon', value: acSize(p.acBTU) },
    { label: 'Fan', value: `${p.fanFlow} m³/h` },
    { label: 'Humidifier', value: `${p.humidifierLH} L/h` },
    { label: 'Dehumidifier', value: p.dehumidifierLday > 0 ? `${p.dehumidifierLday} L/day` : 'none' },
    ...controlRows(input.ctx?.control ?? input.control),
  ].map((r) => ({ ...r, value: keepUnits(r.value) }));
}

// Where a run started, when not in band at midnight: "outdoor air at 14:00", "in band at 07:00"; else null.
function startedFrom(input) {
  const hour = `${pad2(finite(input.startHour) ? input.startHour : 0)}:00`;
  if (input.start === 'outdoor') return `outdoor air at ${hour}`;
  return finite(input.startHour) && input.startHour > 0 ? `in band at ${hour}` : null;
}

// How the room was run (the control the run used; an older run without it gives none).
function controlRows(c) {
  if (!c) return [];
  const rows = [];
  if (finite(c.exchangeEveryMin) || finite(c.exchangeMaxMin)) rows.push({ label: 'Air exchange', value: `every ${c.exchangeEveryMin ?? '?'} min, up to ${c.exchangeMaxMin ?? '?'} min` });
  if (finite(c.acDrop)) rows.push({ label: 'Aircon during air exchange', value: c.acDrop > 0 ? `${c.acDrop} °C lower` : 'not lowered' });
  if (typeof c.humidifierDuringExchange === 'boolean') rows.push({ label: 'Humidifier during air exchange', value: c.humidifierDuringExchange ? 'on' : 'off' });
  return rows;
}

// How a run went, from its series: { tone, text, lines: [which way each reading missed] } or null without a series. A reading
// out of its band for 5 % of the time or more gets a line: the side, the share and how far it went.
const MISSES = [
  { key: 't', low: 'tLow', high: 'tHigh', below: 'Too cold', above: 'Too warm', unit: '°C', fmt: (v) => v.toFixed(1) },
  { key: 'rh', low: 'rhLow', high: 'rhHigh', below: 'Too dry', above: 'Too wet', unit: '% RH', fmt: (v) => v.toFixed(1) },
  // CO₂'s numbers are where the air exchange starts and stops (owner, 2026-10-28)
  { key: 'co2', low: 'co2Low', high: 'co2High', below: 'CO₂ under the air exchange stop point', above: 'CO₂ above the air exchange start point', unit: 'ppm', fmt: (v) => grouped(Math.round(v)),
    bandText: (b) => `the air exchange starts at ${grouped(b[1])} and stops at ${grouped(b[0])} ppm` },
];
// coolDownS: of a run that started from outdoor air (summary.coolDownS: null when it did not cool down; undefined: a run from
// the band, which says nothing of it).
export function runVerdict(series, inBand, coolDownS) {
  if (!series?.length) return null;
  const all = finite(inBand?.all) ? inBand.all : null;
  const share = all === null ? '' : `${Number(all.toFixed(1))} %`;
  const lines = [];
  for (const m of MISSES) {
    let below = 0, above = 0, min = Infinity, max = -Infinity, bandBelow = null, bandAbove = null;
    for (const r of series) {
      const v = r[m.key];
      if (!finite(v) || !finite(r[m.low]) || !finite(r[m.high])) continue;
      if (v < r[m.low]) { below++; if (v < min) { min = v; bandBelow = [r[m.low], r[m.high]]; } }
      if (v > r[m.high]) { above++; if (v > max) { max = v; bandAbove = [r[m.low], r[m.high]]; } }
    }
    const n = series.length;
    const band = (b) => (m.bandText ? m.bandText(b) : `the band is ${m.fmt(b[0]).replace(/\.0$/, '')}–${m.fmt(b[1]).replace(/\.0$/, '')} ${m.unit}`);
    if (below / n >= 0.05) lines.push(`${m.below} ${Math.round((below / n) * 100)} % of the time (down to ${m.fmt(min)} ${m.unit}; ${band(bandBelow)})`);
    if (above / n >= 0.05) lines.push(`${m.above} ${Math.round((above / n) * 100)} % of the time (up to ${m.fmt(max)} ${m.unit}; ${band(bandAbove)})`);
  }
  const tone = inBandTone(all);
  const sentences = [all === null ? '' : all >= 95 ? `The room stayed in band ${share} of the time.` : `The room was in band ${share} of the time.`];
  if (finite(coolDownS)) sentences.push(`Cooled down in ${(coolDownS / 3600).toFixed(1)} h.`);
  else if (coolDownS === null) sentences.push('Did not cool down within the run.');
  return { tone, text: sentences.filter(Boolean).join(' '), lines };
}

// Why a run missed, from what the machines did (result.machines) and the control it ran with: lines for the verdict card.
// Critique 2026-10-28: two runs of the same aircon scored 98 % and 1 %; the second had the aircon set below the band during
// air exchanges, and air exchange ran most of the time, which nothing on the page said.
export const runCauses = (result, input) => causesOf(result, input).lines;

// The value to try for each setting a cause of runCauses names (critique 2026-10-28: the Why section said to change the
// settings, not to what): the aircon not lowered, the humidifier off when the room was too wet, the longer time limit that
// Suggest machines allows when the fans run over half the time (server/sizing.js LIMIT_MAX_MIN).
// → [{ text, name (the change in words), control (the change for one run, as Simulate's Change for this run takes it) }]
export const runTries = (result, input) => causesOf(result, input).tries;
const LIMIT_TRY_MIN = 60;
const tryOf = (name, why, control) => ({ text: `Try ${name}${why ? `: ${why}` : ''}.`, name, control });

function causesOf(result, input) {
  const series = result?.series ?? [];
  const end = series.length ? series[series.length - 1].s : 0;
  if (!(end > 0)) return { lines: [], tries: [] };
  const on = (spans, keep = () => true) => (spans ?? []).filter(keep).reduce((t, x) => t + Math.max(0, Math.min(x.to, end) - x.from), 0);
  const share = (ms) => Math.round((ms / end) * 100);
  const control = input?.ctx?.control ?? input?.control ?? {};
  const lines = [];
  const tries = [];
  const exchange = share(on(result.machines?.intake));
  if (exchange >= 30) lines.push(`Air exchange ran ${exchange} % of the time (every ${control.exchangeEveryMin ?? '?'} min, up to ${control.exchangeMaxMin ?? '?'} min each).`);
  const tLow = series.find((r) => finite(r.tLow))?.tLow;
  if (finite(tLow)) {
    const low = (result.machines?.ac ?? []).filter((x) => finite(x.setpoint) && x.setpoint < tLow);
    const lowShare = share(on(low));
    if (lowShare >= 5) {
      const setpoint = Math.min(...low.map((x) => x.setpoint));
      const why = finite(control.acDrop) && control.acDrop > 0 ? `: it is set ${control.acDrop} °C lower during air exchange` : '';
      lines.push(`The aircon was set to ${setpoint} °C, below the ${tLow} °C band, ${lowShare} % of the time${why}.`);
      if (why) tries.push(tryOf('the aircon not lowered during air exchange (0 °C)', '', { acDrop: 0 }));
    }
  }
  if (control.humidifierDuringExchange === true && exchange >= 30) {
    lines.push('The humidifier also ran during every air exchange.');
    const wet = series.filter((r) => finite(r.rh) && finite(r.rhHigh) && r.rh > r.rhHigh).length / series.length;
    if (wet >= 0.05) tries.push(tryOf('the humidifier off during air exchange', 'the room was too wet', { humidifierDuringExchange: false }));
  }
  if (exchange >= 50 && finite(control.exchangeMaxMin) && control.exchangeMaxMin < LIMIT_TRY_MIN) {
    tries.push(tryOf(`a ${LIMIT_TRY_MIN} min air exchange time limit`, 'the fans ran over half the time', { exchangeMaxMin: LIMIT_TRY_MIN }));
  }
  return { lines, tries };
}

// How hard the machines worked for a run, beside its time in band (critique 2026-10-28: a green 98.3 % run ran its fans
// non-stop for 7 days): "Fans ran 76 % of the time · RM 58.21 for 7 days", the RM only with an electricity price.
export function runFacts(result) {
  const series = result?.series ?? [];
  const end = series.length ? series[series.length - 1].s : 0;
  if (!(end > 0)) return '';
  const on = (result.machines?.intake ?? []).reduce((t, x) => t + Math.max(0, Math.min(x.to, end) - x.from), 0);
  const parts = [`Fans ran ${Math.round((on / end) * 100)} % of the time`];
  const cost = result.summary?.energy?.cost;
  const days = result.summary?.days;
  if (finite(cost)) parts.push(`RM ${cost.toFixed(2)}${finite(days) ? ` for ${plural(days, 'day', 'days')}` : ''}`);
  return parts.join(' · ');
}

// Two runs side by side: what they were asked and how they went; differ marks the rows that are not the same.
export function compareRuns(a, b) {
  const ia = inputRows(a?.input), ib = inputRows(b?.input);
  const res = (run) => {
    const s = run?.summary;
    return [
      { label: 'Temperature in band', value: pct(s?.inBand?.t) }, { label: 'Humidity in band', value: pct(s?.inBand?.rh) },
      { label: 'CO₂ in band', value: pct(s?.inBand?.co2) }, { label: 'All three in band', value: pct(s?.inBand?.all) },
      { label: 'Energy', value: formatKWh(s?.energy?.kWh) }, { label: 'Water', value: formatLitres(s?.water?.litres) },
    ];
  };
  const left = [...ia, ...res(a)], right = [...ib, ...res(b)];
  return left.map((r) => {
    const other = right.find((x) => x.label === r.label)?.value ?? '—';
    return { label: r.label, a: r.value, b: other, differ: r.value !== other };
  });
}

// What was asked, in one line (the input as it was posted).
// roomMin: the room's own air exchange time limit when known (a run does not keep it).
export function inputLine(input, roomMin = null) {
  const p = input?.physics;
  if (!p) return '';
  const crops = (input.crops ?? []).map((c) => `${CROPS[c.crop]?.name ?? c.crop} ${c.blocks}`).join(' and ');
  const stage = STAGES[input.stage]?.toLowerCase() ?? input.stage;
  const used = input.ctx?.control?.exchangeMaxMin ?? input.control?.exchangeMaxMin;
  if (roomMin === null && finite(input.ctx?.roomControl?.exchangeMaxMin)) roomMin = input.ctx.roomControl.exchangeMaxMin; // stored with the run
  const limit = finite(input.control?.exchangeMaxMin) && finite(used) && used !== roomMin
    ? [`air exchange time limit ${used} min (${finite(roomMin) ? `the room: ${roomMin} min` : 'set for this run'})`] : [];
  const own = input.control ?? {}, usedC = input.ctx?.control ?? {};
  const settings = [];
  if (own.acDrop !== undefined) settings.push(`aircon lower during air exchange ${usedC.acDrop ?? own.acDrop} °C`);
  if (own.humidifierDuringExchange !== undefined) {
    settings.push(`humidifier ${(usedC.humidifierDuringExchange ?? own.humidifierDuringExchange) ? 'forced on' : 'not forced on'} during air exchange`);
  }
  const roomC = input.ctx?.roomControl ?? {};
  if (own.acDrop !== undefined && finite(roomC.acDrop)) settings[0] += ` (the room: ${roomC.acDrop} °C)`;
  else if (settings.length) settings[settings.length - 1] += ' (set for this run)';
  const filter = [];
  if (finite(p.fanMaxPa)) {
    const every = p.filterChangeDays > 0 ? `changed every ${plural(p.filterChangeDays, 'day', 'days')}` : '';
    const when = every && p.filterSensor ? `${every} or at the change pressure` : every || (p.filterSensor ? 'changed at the change pressure' : 'never changed');
    filter.push(`filter ${p.filterCleanPa} Pa clean, change at ${p.filterFinalPa} Pa, ${plural(p.filterUsedDays ?? 0, 'day', 'days')} in use, ${when}`);
  }
  return [
    `${crops} blocks, starting at ${stage}${input.start === 'outdoor' ? ` from ${startedFrom(input)}` : ''}, ${plural(input.days, 'day', 'days')}`,
    `walls ${p.wallUA} W/K, sun ${p.sunW} W, outdoor ${p.outdoorLow}–${p.outdoorHigh} °C, dew point ${p.outdoorDew} °C`,
    `fan ${p.fanFlow} m³/h, aircon ${acSize(p.acBTU)}, humidifier ${p.humidifierLH} L/h${p.dehumidifierLday > 0 ? `, dehumidifier ${p.dehumidifierLday} L/day` : ''}`,
    ...limit,
    ...(settings.length ? [settings.join(', ')] : []),
    ...filter,
  ].map(keepUnits).join(' · ');
}

// What a run was given beyond its machines, in short words for the Simulations list: { key: text or null (not kept) }.
function givenParts(input) {
  const c = input?.ctx?.control ?? input?.control ?? {};
  const max = finite(c.exchangeMaxMin) ? `up to ${c.exchangeMaxMin} min` : null;
  const started = input ? startedFrom(input) : null;
  return {
    exchange: max && (finite(c.exchangeEveryMin) ? (c.exchangeEveryMin > 0 ? `exchange every ${c.exchangeEveryMin} min, ${max}` : `exchange ${max}, fresh air off`) : `exchange ${max}`),
    acDrop: finite(c.acDrop) ? (c.acDrop > 0 ? `aircon ${c.acDrop} °C lower during exchange` : 'aircon not lowered during exchange') : null,
    humidifier: typeof c.humidifierDuringExchange === 'boolean' ? `humidifier ${c.humidifierDuringExchange ? 'on' : 'off'} during exchange` : null,
    outdoor: typeof c.outdoorAir === 'boolean' ? (c.outdoorAir ? 'outdoor air used' : 'no outdoor air') : null,
    start: !input ? null : started ? (input.start === 'outdoor' ? `from ${started}` : `started ${started}`) : 'started in band',
  };
}

// The Simulations list's second line of each run: what it was given beyond its machines, only the parts that differ between
// the runs shown ('' when nothing does). Critique 2026-10-28: two runs with the same machines scored 0.8 % and 98.3 % in
// band, and the list did not say that their air exchange and aircon settings were not the same.
export function differingLines(runs) {
  const parts = (runs ?? []).map((r) => givenParts(r?.input));
  const keys = Object.keys(parts[0] ?? {}).filter((k) => new Set(parts.map((p) => p[k]).filter((v) => v !== null)).size > 1);
  return parts.map((p) => keys.map((k) => p[k]).filter((v) => v !== null).map(keepUnits).join(' · '));
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
    tone: done ? inBandTone(run.summary?.inBand?.all) : 'none',
    kWh: done ? formatKWh(run.summary?.energy?.kWh) : DASH,
    litres: done ? formatLitres(run.summary?.water?.litres) : DASH,
    // the machines it ran with, so runs can be told apart in the list
    machines: run.input?.physics ? [`Aircon ${acKW(run.input.physics.acBTU)}`, `fan ${run.input.physics.fanFlow} m³/h`, `humidifier ${run.input.physics.humidifierLH} L/h`,
      ...(run.input.physics.dehumidifierLday > 0 ? [`dehumidifier ${run.input.physics.dehumidifierLday} L/day`] : [])].map(keepUnits).join(' · ') : '',
    status: run.status === 'running' ? `Running ${Math.round((finite(run.progress) ? run.progress : 0) * 100)} %` : STATUS_WORDS[run.status] ?? String(run.status),
  };
}

export const isActive = (run) => run?.status === 'queued' || run?.status === 'running';
