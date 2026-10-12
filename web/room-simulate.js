// web/room-simulate.js: the Simulate tab of the room page (docs/contracts/web.md 3.10).
(function (global) {
'use strict';

const FIELDS7 = ['ac_hp', 'ac_units', 'fog_lph', 'air_m3h', 'walls', 'roof', 'height'];

// ---------------- pure helpers (no DOM, no network) ----------------
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const toCapacityMix = rows => rows.map(r => ({ crop: r.crop, blocks: r.blocks, ...(r.co2_per_block !== null ? { co2PerBlock: r.co2_per_block } : {}) }));
const toMixRows = mix => mix.map(m => ({ crop: m.crop, blocks: m.blocks, co2_per_block: m.co2PerBlock ?? null }));
function sameMix(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((m, i) => m.crop === b[i].crop && m.blocks === b[i].blocks && m.co2PerBlock === b[i].co2PerBlock);
}
function appliedCalib(runs) {
  const c = runs.find(x => x.applied === true);
  if (!c) return null;
  return { ua: c.ua, infAch: c.inf_ach, moistBuffer: c.moist_buffer, co2PerBlock: c.co2_per_block,
    rmse: { T: c.rmse_t, RH: c.rmse_rh, CO2: c.rmse_co2 }, date: new Date(c.run_at * 1000).toISOString() };
}
const pick7 = eq => Object.fromEntries(FIELDS7.map(k => [k, eq[k]]));
function runInputs(kind, d) {
  const row = d.calibrations.find(x => x.applied === true) || null;
  const calib = appliedCalib(d.calibrations);
  const room = { name: d.room.name, volume: d.room.volume, airM3h: d.settings.airM3h, calib };
  if (d.equipment) room.plant = global.ClimateEquipment.plantOf(d.equipment, { volume: d.room.volume, calib });
  const mix = toCapacityMix(d.draft);
  const inputs = { mix: toMixRows(mix), settings: d.settings, region: d.region, tariff: d.tariff, volume: d.room.volume,
    calibration: row ? { id: row.id, ua: row.ua, inf_ach: row.inf_ach, moist_buffer: row.moist_buffer, co2_per_block: row.co2_per_block } : null,
    empty_below: kind === 'capacity' ? d.emptyBelow : null,
    equipment: d.equipment ? pick7(d.equipment) : null };
  return { room, mix, settings: d.settings, region: d.region, tariff: d.tariff, emptyBelow: d.emptyBelow, inputs };
}

function cycleSummary(res) {
  if (res.verdict === 'impossible') return { chip: { lvl: 'warning', icon: '✕', text: 'impossible' }, line: res.why };
  const n = res.stages.filter(g => g.pass === false).length;
  const chip = n === 0 ? { lvl: 'good', icon: '✓', text: 'all stages pass' } : { lvl: 'warning', icon: '✕', text: `${n} stage(s) fail` };
  const t = res.totals;
  return { chip, line: `${plural(t.days, 'day', 'days')} · ${plural(res.inputs.flushes, 'flush', 'flushes')} · ${Math.round(t.kwh)} kWh · RM ${t.rm.toFixed(2)} · RM ${t.rmPerBlock.toFixed(2)} per block` };
}
function stageRows(res) {
  return res.stages.map(g => {
    const judged = g.stage !== 'spawn';
    const alarms = Object.entries(g.alarms).map(([id, count]) => `${id} ×${count}`).join(', ');
    return [global.ClimateController.STAGES[g.stage], String(g.flush), String(g.days), g.inT.toFixed(1),
      judged ? g.rhOk.toFixed(1) : 'not judged', judged ? g.co2Below.toFixed(1) : 'not judged', g.maxCore.toFixed(1),
      alarms || '–', String(Math.round(g.kwh)), g.rm.toFixed(2), g.pass ? 'Pass' : g.fails.join(', ')];
  });
}
function seriesPoints(res) {
  return res.series.map(p => {
    const g = res.stages.find(x => x.stage === p.stage && x.flush === p.flush);
    const t = g ? g.targets : null;
    const rules = t ? global.ClimateController.defaultRules(t.co2Lim) : null;
    return { t: p.h * 3600, T: p.T, RH: p.RH, C: p.CO2, core: p.core, spT: t ? t.spT : NaN, spRH: t ? t.spRH : NaN, co2Lim: t ? t.co2Lim : NaN,
      fanOff: rules ? rules.fanOff : NaN, fanOn: rules ? rules.fanOn : NaN };
  });
}

const CHIPS = {
  cycle: { pass: ['good', '✓', 'Passes'], fail: ['warning', '✕', 'Fails'] },
  capacity: { good: ['good', '✓', 'Good'], tight: ['info', '●', 'Tight'], 'too-dense': ['warning', '✕', 'Too many blocks'], 'too-empty': ['info', '●', 'Too few blocks'] },
  equipment: { enough: ['good', '✓', 'Enough'], 'too-small': ['warning', '✕', 'Too small'], 'too-big': ['warning', '✕', 'Too big'],
    oversized: ['info', '●', 'Bigger than needed'] },
};
function runChip(kind, verdict) {
  const own = Object.hasOwn(CHIPS, kind) ? CHIPS[kind] : {};
  const c = verdict === 'impossible' ? ['warning', '✕', 'Impossible'] : Object.hasOwn(own, verdict) ? own[verdict] : ['info', '●', verdict];
  return { lvl: c[0], icon: c[1], text: c[2] };
}
const KIND_NAME = { cycle: 'Cycle', capacity: 'Capacity', equipment: 'Equipment' };
function runRowTexts(info) {
  const CROPS = global.ClimateController.CROPS;
  const parts = info.inputs.mix.filter(m => m.blocks > 0).map(m => `${m.blocks} ${Object.hasOwn(CROPS, m.crop) ? CROPS[m.crop].name : m.crop}`);
  let energy = '–';
  if (info.kind === 'cycle' && info.rm !== null && info.blocks > 0) energy = `RM ${(info.rm / info.blocks).toFixed(2)} per block`;
  else if (info.kind === 'capacity' && info.utilisation !== null) energy = `${info.utilisation} %`;
  return { run: `${KIND_NAME[info.kind] || info.kind} · ${global.FarmUi.farmClock().stamp(info.created_at)}`, mix: parts.length ? parts.join(' + ') : '–',
    chip: runChip(info.kind, info.verdict), energy, note: info.note ?? '' };
}
const int = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function progressText(p) {
  if (p.day === undefined) return `Simulation run ${p.runs}: ${global.FarmUi.nf(p.blocks)} blocks, ${p.pass ? 'pass' : 'fail'}…`;
  const flush = p.stage === 'fruiting' || p.stage === 'rest' ? ` · flush ${p.flush}` : '';
  return `Day ${p.day} of ${p.days} · ${global.ClimateController.STAGES[p.stage]}${flush}`;
}
function machinesText(eq) {
  if (!eq) return 'Typical machines';
  const label = k => global.ClimateEquipment.CONSTRUCTIONS[k].label;
  const ac = eq.ac_units > 1 ? `${eq.ac_units} × ${eq.ac_hp} hp` : `${eq.ac_hp} hp`;
  const walls = eq.walls === null && eq.roof === null ? 'Typical walls' : eq.walls === eq.roof ? `${label(eq.walls)} walls and roof`
    : `${label(eq.walls)} walls, ${label(eq.roof)} roof`;
  return `${ac} aircond · ${eq.fog_lph} L/h fogger · ${int(eq.air_m3h)} m³/h air exchange · ${walls}`;
}
function clampBlocks(text) {
  const n = Math.round(+text);
  return text === '' || !Number.isFinite(n) ? 0 : Math.min(200000, Math.max(0, n));
}
function clampCo2(text) {
  const n = Math.round(+text);
  return text === '' || !Number.isFinite(n) ? null : Math.min(1000, Math.max(1, n));
}
// C11 6: a crop already in another row is not offered again.
function availableCrops(mix, rowIndex, keys) {
  const all = keys || Object.keys(global.ClimateController.CROPS).filter(global.ClimateRoomRules.hasCrop);
  const taken = new Set(mix.filter((_, i) => i !== rowIndex).map(r => r.crop));
  const own = (mix[rowIndex] || {}).crop;
  return all.filter(k => k === own || !taken.has(k));
}
// C11 6: why the run buttons are off, or '' when a run can start.
const NEEDS_MIX = 'Add a mushroom and the number of blocks first.';
const TWICE = 'The same mushroom is in the mix twice.';
function runBlockReason(mix) {
  if (!Array.isArray(mix) || !mix.some(r => r.blocks > 0)) return NEEDS_MIX;
  return new Set(mix.map(r => r.crop)).size < mix.length ? TWICE : '';
}
const regionText = key => (key === 'my-lowland' ? 'Lowland Peninsular Malaysia' : key);
const helpers = { toCapacityMix, toMixRows, sameMix, appliedCalib, runInputs, cycleSummary, stageRows,
  seriesPoints, runRowTexts, progressText, machinesText, clampBlocks, clampCo2, regionText, availableCrops, runBlockReason,
  bulletZones, bulletVerdict, bulletFigure, cycleDays, cycleFigure };

// ---------------- the capacity report (moved from web/capacity.js, wave 1) ----------------
const VERDICT_CHIP = {
  impossible: { lvl: 'critical', icon: '◆', text: 'Impossible' },
  'too-dense': { lvl: 'serious', icon: '▲', text: 'Too dense' },
  tight: { lvl: 'warning', icon: '▲', text: 'Tight' },
  good: { lvl: 'good', icon: '✓', text: 'Good' },
  'too-empty': { lvl: 'warning', icon: '▼', text: 'Too empty' },
};
const LIMIT_WORD = { air: 'the air exchange (CO₂ purges)', ac: 'the AC (heat)', fog: 'the fogger (water)' };
const FAIL_MACHINE = { 'temperature too high': 'the AC cannot cool enough', 'temperature too low': 'the AC cannot heat enough',
  'humidity too low': 'the fogger cannot keep up', 'humidity at the low alarm': 'the fogger cannot keep up',
  'humidity near saturation': 'the AC cannot dry enough', 'CO₂ above the limit': 'the air exchange is too small for short purges' };

const cropName = k => { const C = global.ClimateController.CROPS; return Object.hasOwn(C, k) ? C[k].name : k; };
// ---- plan charts (C13 4): hand-made inline SVG ----
const S = (tag, attrs, parent) => global.FarmUi.svgEl(tag, attrs, parent);
function label(parent, x, y, s, cls, extra) {
  const e = S('text', { x, y, class: cls, ...(extra || {}) }, parent);
  e.textContent = s;
  return e;
}
// A figure with its question as heading; the chart sits in a box that scrolls on a narrow screen.
function figure(cls, question, aria, w, h, minW) {
  const fig = mk('figure', { cls: `plan-fig ${cls}` }, mk('h4', { cls: 'plan-q', text: question }));
  const svg = S('svg', { viewBox: `0 0 ${w} ${h}`, class: 'plan-svg', role: 'img', 'aria-label': aria, style: `min-width:${minW || Math.min(w, 560)}px;max-width:${Math.round(w * (minW ? 1.25 : 1.1))}px` });
  const scroll = mk('div', { cls: 'plan-scroll' }, svg);
  fig.append(scroll);
  return { fig, svg };
}
function more(summary, ...kids) {
  return mk('details', { cls: 'plan-more' }, mk('summary', { text: summary }), ...kids);
}
const niceStep = (span, target) => {
  const raw = span / target, mag = 10 ** Math.floor(Math.log10(raw || 1)), n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
};

// Where the zones of the capacity bullet lie. emptyBelow = the "too empty" percentage of the capacity (the tab's setting).
function bulletZones(rep, emptyBelow) {
  const cap = rep && rep.capacity;
  if (!cap || !(cap.max > 0)) return null;
  const eb = Number.isFinite(emptyBelow) ? emptyBelow : global.ClimateCapacity.VERDICT.emptyBelow;
  const max = cap.max, lo = Math.min(max, Math.max(cap.min || 0, Math.ceil(max * eb / 100)));
  const tried = (rep.runs || []).reduce((m, r) => Math.max(m, r.blocks), 0);
  const end = Math.max(tried, rep.planned || 0, max);
  const zones = [{ key: 'empty', label: 'Too empty', from: 0, to: lo }, { key: 'fits', label: 'Fits', from: lo, to: max },
    { key: 'full', label: 'Too full', from: max, to: end }].filter(z => z.to > z.from);
  return { end, lo, hi: max, plan: rep.planned || 0, zones, settled: cap.settled !== false, efficient: null };
}
// The verdict in one or two sentences (C13 4: "2,000 blocks fit. The room holds up to 3,652.").
function bulletVerdict(rep, emptyBelow) {
  if (rep.verdict === 'impossible') return rep.why || 'No size of this mix passes on all design days, even with almost no blocks.';
  const z = bulletZones(rep, emptyBelow);
  if (!z) return '';
  const n = int, upTo = `The room holds up to ${z.settled ? '' : 'about '}${n(z.hi)}.`;
  switch (rep.verdict) {
    case 'too-dense': return `${n(z.plan)} blocks are too many. ${upTo}`;
    case 'tight': return `${n(z.plan)} blocks fit, but only just. ${upTo} There is no margin for a hotter week than the design days.`;
    case 'too-empty': return rep.why === 'wet'
      ? `${n(z.plan)} blocks are too few: below about ${n(rep.capacity.min)} the room gets too wet. ${upTo}`
      : `${n(z.plan)} blocks are too few for this room. It fits ${n(z.lo)} to ${n(z.hi)} blocks.`;
    default: return `${n(z.plan)} blocks fit. ${upTo}`;
  }
}
function bulletFigure(rep, emptyBelow) {
  const z = bulletZones(rep, emptyBelow);
  if (!z) return null;
  const W = 420, PAD = 16, PW = W - 2 * PAD, H = 122, BY = 40, BH = 22;
  const x = v => PAD + (v / z.end) * PW;
  const verdict = bulletVerdict(rep, emptyBelow);
  const aria = `${verdict} Too empty below ${int(z.lo)} blocks, fits ${int(z.lo)} to ${int(z.hi)}, too full above ${int(z.hi)}. Your plan: ${int(z.plan)} blocks.`;
  const { fig, svg } = figure('cap-bullet', 'Does your plan fit this room?', aria, W, H, 320);
  const lvl = VERDICT_CHIP[rep.verdict];
  const chip = mk('span', { cls: 'chip' }); global.FarmUi.paintChip(chip, lvl);
  fig.insertBefore(mk('p', { cls: 'plan-verdict' }, chip, ` ${verdict}`), fig.lastChild);
  const FILL = { empty: 'plan-z-empty', fits: 'plan-z-fits', full: 'plan-z-full' };
  z.zones.forEach((zn, i) => {
    const a = x(zn.from), b = x(zn.to);
    S('rect', { class: FILL[zn.key], x: a, y: BY, width: Math.max(0, b - a - (i < z.zones.length - 1 ? 1 : 0)), height: BH,
      rx: 4 }, svg);
    const mid = (a + b) / 2, narrow = b - a < 70;
    label(svg, Math.min(W - 30, Math.max(30, mid)), BY + BH + 17 + (narrow ? 16 : 0), zn.label, 'pt pt-zone', { 'text-anchor': 'middle' });
  });
  // the boundaries, as numbers under the bar
  const marks = [[0, 'start'], [z.lo, 'middle'], [z.hi, 'middle'], [z.end, 'end']];
  const seen = new Set();
  for (const [v, anchor] of marks) {
    if (seen.has(v) || (v === z.end && x(z.end) - x(z.hi) < 46)) continue;
    seen.add(v);
    label(svg, x(v), BY + BH + 52, int(v), 'pt pt-muted', { 'text-anchor': anchor });
    S('line', { class: 'plan-tick', x1: x(v), x2: x(v), y1: BY + BH, y2: BY + BH + 4 }, svg);
  }
  // your plan
  const px = x(z.plan), anchor = px < 90 ? 'start' : px > W - 90 ? 'end' : 'middle';
  label(svg, px, 17, `Your plan · ${int(z.plan)}`, 'pt pt-strong', { 'text-anchor': anchor });
  S('path', { class: 'plan-pin', d: `M${px - 6} 24 L${px + 6} 24 L${px} 34 Z` }, svg);
  S('line', { class: 'plan-pin-line', x1: px, x2: px, y1: 34, y2: BY + BH + 2 }, svg);
  return fig;
}

function renderReport(host, rep, opts) {
  const UI = global.FarmUi;
  host.replaceChildren();
  const p = (txt, cls) => { const e = document.createElement('p'); e.textContent = txt; if (cls) e.className = cls; host.append(e); return e; };
  const emptyBelow = opts && opts.emptyBelow;
  const fig = rep.verdict === 'impossible' ? null : bulletFigure(rep, emptyBelow);
  if (fig) host.append(fig);
  else {
    const chip = document.createElement('span'); chip.className = 'chip'; UI.paintChip(chip, VERDICT_CHIP[rep.verdict]);
    const head = document.createElement('p'); head.append(chip, ` ${bulletVerdict(rep, emptyBelow)}`); host.append(head);
  }
  for (const w of rep.warnings || []) p(w, 'warn');
  if (!rep.capacity) return;
  const t = rep.targets;
  p(`Targets: ${t.spT} °C, ${t.spRH} % RH, CO₂ limit ${UI.nf(t.co2Lim)} ppm (${cropName(t.crop)} sets the CO₂ limit).`);
  const split = (rep.perCrop || []).filter(c => c.max > 0);
  if (split.length > 1) p(`Capacity in the same mix: ${split.map(c => `${UI.nf(c.max)} ${cropName(c.crop)}`).join(' + ')}.`);
  if (rep.capacity.min && rep.why !== 'wet') p(`Needs at least about ${UI.nf(rep.capacity.min)} blocks: below that the room gets too wet (near saturation).`);
  if (rep.limit.length) p(`${rep.why === 'wet' ? 'Upper limit' : 'Limit'}: ${rep.limit.map(l => `${l.fails.map(f => `${f}${FAIL_MACHINE[f] ? ` (${FAIL_MACHINE[f]})` : ''}`).join(', ')} on the ${l.day.toLowerCase()} day`).join('; ')}.`);
  if (rep.energy && rep.energy.rmPerBlockCycle != null) p(`Energy: ${rep.energy.kwhDay.toFixed(1)} kWh per day, RM ${rep.energy.rmPerBlockCycle.toFixed(2)} per block per cycle (${rep.energy.cycleDays} days at RM ${rep.energy.tariff.toFixed(2)}/kWh)${rep.energy.planPass === false ? ', at the planned size, which fails' : ''}.`);
  const b = rep.balance;
  p(`Simple balance: ${Number.isFinite(b.estimate) ? UI.nf(b.estimate) : 'no limit'} blocks, limit ${LIMIT_WORD[b.limit]}.${rep.disagree ? ' The simple balance and the simulation disagree; the simulation decides.' : ''}`, 'note');
  const plan = rep.runs[0];
  if (!plan) return;
  const tbl = document.createElement('table'), thead = document.createElement('thead'), tb = document.createElement('tbody'), hr = document.createElement('tr');
  for (const h of ['Design day', 'Temp in band', 'RH ≥ target − 3', 'RH > 95 %', 'CO₂ ≤ limit', `Result, ${UI.nf(plan.blocks)} blocks`]) hr.append(UI.cell('th', h));
  thead.append(hr);
  for (const d of plan.days) {
    const tr = document.createElement('tr');
    tr.append(UI.cell('td', d.name), UI.cell('td', `${d.inT.toFixed(0)} %`), UI.cell('td', `${d.rhOk.toFixed(0)} %`), UI.cell('td', `${d.wet.toFixed(0)} %`), UI.cell('td', `${d.co2Below.toFixed(0)} %`), UI.cell('td', d.pass ? 'Pass' : d.fails.join(', ')));
    tb.append(tr);
  }
  tbl.append(thead, tb); host.append(more('Show the three design days', tbl));
}

// ---- the cycle chart ----
const STAGE_ORDER = ['spawn', 'pinning', 'fruiting', 'rest'];
// The numbers of the cycle chart from a C7 result: kWh per day (summed from the hourly series), the stage spans and the flush days.
function cycleDays(res) {
  const series = res.series || [];
  const last = series.reduce((m, p) => Math.max(m, p.h), -1);
  const n = Math.max(res.totals ? res.totals.days : 0, Math.floor(last / 24) + 1);
  const kwh = new Array(n).fill(0);
  for (const p of series) kwh[Math.floor(p.h / 24)] += p.kwh;
  const stages = res.stages.map(g => ({ stage: g.stage, flush: g.flush, from: g.startDay, to: g.startDay + g.days, pass: g.pass }));
  return { days: kwh.map((k, day) => ({ day, kwh: k })), stages,
    flushes: stages.filter(g => g.stage === 'fruiting').map(g => ({ flush: g.flush, day: g.from })),
    maxKwh: kwh.reduce((m, k) => Math.max(m, k), 0), total: { days: n, kwh: res.totals.kwh, rm: res.totals.rm } };
}
function cycleFigure(res) {
  const CD = cycleDays(res), N = CD.total.days, STG = { spawn: 'Spawn run', pinning: 'Pinning', fruiting: 'Fruiting', rest: 'Rest' };
  const rowsOf = STAGE_ORDER.filter(s => CD.stages.some(g => g.stage === s));
  const W = 720, LW = 92, RP = 16, PW = W - LW - RP, RH = 24, RG = 6, TOP = 8;
  const bandsH = rowsOf.length * (RH + RG), EY = TOP + bandsH + 20, EH = 70, AY = EY + EH, H = AY + 30;
  const x = d => LW + (d / N) * PW;
  const fails = CD.stages.filter(g => !g.pass).length;
  const fl = CD.flushes.length;
  const aria = `Your grow cycle takes ${N} days with ${fl} ${fl === 1 ? 'flush' : 'flushes'} and uses ${int(CD.total.kwh)} kWh, RM ${CD.total.rm.toFixed(2)}. `
    + (fails ? `${fails} ${fails === 1 ? 'stage does' : 'stages do'} not pass.` : 'Every stage passes.');
  const { fig, svg } = figure('cycle-gantt', 'Your grow cycle, day by day', aria, W, H);
  const step = niceStep(N, 8);
  for (let d = 0; d <= N + 1e-9; d += step) {
    S('line', { class: 'plan-grid', x1: x(d), x2: x(d), y1: TOP, y2: AY }, svg);
    label(svg, x(d), AY + 17, `${d}`, 'pt pt-muted', { 'text-anchor': 'middle' });
  }
  label(svg, LW - 10, AY + 17, 'day', 'pt pt-muted', { 'text-anchor': 'end' });
  rowsOf.forEach((st, i) => {
    const y = TOP + i * (RH + RG);
    label(svg, LW - 10, y + 16, STG[st], 'pt', { 'text-anchor': 'end' });
    for (const g of CD.stages.filter(s => s.stage === st)) {
      const a = x(g.from), w = Math.max(2, x(g.to) - a - 1);
      S('rect', { class: `plan-st plan-st-${st}${g.pass ? '' : ' plan-st-fail'}`, x: a, y, width: w, height: RH, rx: 3 }, svg);
      if (st === 'fruiting') {
        S('path', { class: 'plan-flush', d: `M${a + 4} ${y + 6} l8 0 l-4 7 z` }, svg);
        if (w > 30) label(svg, a + 16, y + 16, w >= 62 ? `Flush ${g.flush}` : `${g.flush}`, 'pt pt-strong');
      }
    }
  });
  label(svg, LW - 10, EY + 10, 'kWh a day', 'pt', { 'text-anchor': 'end' });
  label(svg, LW - 10, EY + 25, `up to ${CD.maxKwh.toFixed(1)}`, 'pt pt-muted', { 'text-anchor': 'end' });
  S('line', { class: 'plan-axis', x1: LW, x2: LW + PW, y1: AY, y2: AY }, svg);
  const bw = Math.max(1, PW / N - 1), top = CD.maxKwh || 1;
  for (const d of CD.days) {
    const h = d.kwh / top * EH;
    S('rect', { class: 'plan-day', x: x(d.day) + 0.5, y: AY - h, width: bw, height: h }, svg);
  }
  const chip = mk('span', { cls: 'chip' }); global.FarmUi.paintChip(chip, cycleSummary(res).chip);
  fig.insertBefore(mk('p', { cls: 'plan-verdict' }, chip, ` ${cycleSummary(res).line}`), fig.lastChild);
  return fig;
}

// ---------------- the tab ----------------
const EXPLAIN = 'Simulate = try a plan before you do it. Enter the crop mix, then Check capacity (fast: will the climate hold on a hot-dry, a hot-humid and a rainy day, and how many blocks fit?) or Run full cycle (spawn run, pinning, fruiting and rest for every flush, with the energy cost). Every result is saved and can later be compared with what really happens.';
const NOT_INSTALLED = 'The machines check is not installed.';
const MAX_DAYS = 180;
const STAGE_HEAD = ['Stage', 'Flush', 'Days', 'Temp in band %', 'RH ok %', 'CO₂ ok %', 'Max core °C', 'Alarms', 'kWh', 'RM', 'Result'];

function mk(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'cls') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
}
const btn = (text, props) => mk('button', { type: 'button', cls: 'btn', text, ...props });

// State of the mounted tab (closure; reset at each mount).
let el = null, ctx = null, id = 0, room = null, saved = null, draft = [], calibrations = null, settings = null, version = null;
let equipment, runs = [], running = false, saving = false, alive = false, card = null, charts = null, streamed = false, olderDone = false;
let mountSeq = 0; // counts mounts and unmounts: a reply of an earlier mount never matches the present one
const here = me => alive && me === mountSeq;
let gen = 0; // never reset: a run of an earlier mount can never match it again

const q = sel => el.querySelector(sel);
const msg = (text, lvl) => { if (el) global.FarmUi.say(q('#smMsg'), lvl || 'info', text); };
const ready = () => saved !== null && calibrations !== null && settings !== null && equipment !== undefined;

function currentData(over) {
  const r = q('#smRegion'), tariff = Number(q('#smTariff').value), empty = Number(q('#smEmpty').value);
  const CAPY = global.ClimateCapacity, UI = global.FarmUi;
  return { room, settings, draft, calibrations, equipment, region: r.value,
    tariff: q('#smTariff').value !== '' && Number.isFinite(tariff) ? UI.clamp(tariff, 0, 10) : 0.57,
    emptyBelow: q('#smEmpty').value !== '' && Number.isFinite(empty) ? UI.clamp(empty, 0, 100) : CAPY.VERDICT.emptyBelow, ...over };
}
// What the machines card runs a check with: the cycle inputs without `plant` (web.md 3.12).
function cardInputs() {
  const d = currentData();
  const r = runInputs('cycle', { ...d, equipment: null });
  r.inputs.equipment = d.equipment ? pick7(d.equipment) : null;
  return { room: r.room, mix: r.mix, settings: r.settings, region: r.region, tariff: r.tariff, inputs: r.inputs };
}

function cycleDaysText() {
  try { return `Run full cycle · simulates ${plural(global.ClimateCycle.cycleDays(settings.farmType, settings.program), 'day', 'days')} in about 30 s`; } catch { return 'Run full cycle'; }
}
function paintValues() {
  const UI = global.FarmUi, clock = UI.farmClock();
  const row = calibrations && calibrations.find(c => c.applied === true);
  UI.paintChip(q('#smCalib'), row ? { lvl: 'good', icon: UI.ICON.good, text: `calibrated ${clock.stamp(row.run_at).slice(0, 10)}` }
    : { lvl: 'info', icon: UI.ICON.info, text: 'not calibrated — typical values' });
  q('#smSettings').textContent = version ? `Settings: version ${version.id} saved ${clock.stamp(version.saved_at)}` : '';
  q('#smMachines').textContent = equipment === undefined ? '' : `Machines: ${machinesText(equipment)}`;
  if (settings) q('#smCycle').textContent = cycleDaysText();
}
function syncControls() {
  const reason = runBlockReason(draft);
  const ok = ready() && !running && !reason;
  q('#smCap').disabled = q('#smCycle').disabled = !ok;
  const help = q('#smRunHelp');
  help.textContent = reason; help.hidden = !reason;
  q('#smAddCrop').disabled = running || availableCrops(draft, draft.length).length === 0;
  for (const c of q('#smMix').querySelectorAll('input, select, button')) c.disabled = running;
  q('#smSaveMix').disabled = running || saving || saved === null || sameMix(toCapacityMix(draft), toCapacityMix(saved));
}

function paintMix() {
  const CC = global.ClimateController;
  const body = q('#smMix tbody');
  body.replaceChildren(...draft.map((row, i) => {
    const sel = mk('select', { name: 'mixCrop' });
    for (const k of availableCrops(draft, i)) sel.append(mk('option', { value: k, text: CC.CROPS[k].name }));
    sel.value = row.crop;
    const blocks = mk('input', { type: 'number', min: '0', max: '200000', step: '1', name: 'mixBlocks' }); blocks.value = String(row.blocks);
    const co2 = mk('input', { type: 'number', min: '1', max: '1000', step: '1', name: 'mixCo2' }); co2.value = row.co2_per_block === null ? '' : String(row.co2_per_block);
    const del = btn('Remove');
    const labels = () => {
      const n = cropName(row.crop);
      sel.setAttribute('aria-label', 'Mushroom'); del.setAttribute('aria-label', `Remove ${n}`);
      blocks.setAttribute('aria-label', `Blocks of ${n}`); co2.setAttribute('aria-label', `CO₂ per block of ${n}, mL/h`);
    };
    labels();
    sel.addEventListener('change', () => {
      row.crop = sel.value; paintMix();
      const again = q('#smMix tbody').children[i]; const next = again && again.querySelector('select');
      if (next && next.focus) next.focus();
    });
    blocks.addEventListener('input', () => { row.blocks = clampBlocks(blocks.value); syncControls(); });
    blocks.addEventListener('change', () => { row.blocks = clampBlocks(blocks.value); blocks.value = String(row.blocks); syncControls(); });
    co2.addEventListener('input', () => { row.co2_per_block = clampCo2(co2.value); syncControls(); });
    co2.addEventListener('change', () => { row.co2_per_block = clampCo2(co2.value); co2.value = row.co2_per_block === null ? '' : String(row.co2_per_block); syncControls(); });
    del.addEventListener('click', () => { draft.splice(i, 1); paintMix(); syncControls(); });
    return mk('tr', {}, ...[sel, blocks, co2, del].map(c => mk('td', {}, c)));
  }));
  syncControls();
}

// ---- results ----
function clearResult() {
  if (charts) { try { charts.destroy(); } catch { /* the charts are gone with the page */ } charts = null; }
  const host = q('#smResult');
  host.replaceChildren();
  q('#smCharts').replaceChildren();
  return host;
}
const emptyBelowNow = () => { const e = q('#smEmpty'); return e && e.value !== '' ? Number(e.value) : undefined; };
function showResult(kind, result) {
  const UI = global.FarmUi;
  const host = clearResult();
  host.hidden = false;
  if (kind === 'capacity') { const box = mk('div', { cls: 'cap-report' }); host.append(box); renderReport(box, result, { emptyBelow: emptyBelowNow() }); return; }
  if (kind === 'equipment') {
    if (global.FarmEquipmentCard) global.FarmEquipmentCard.renderReport(host, result);
    else host.append(mk('p', { cls: 'est-note', text: NOT_INSTALLED }));
    return;
  }
  if (result.verdict === 'impossible') {
    const sum = cycleSummary(result);
    const chip = mk('span', { cls: 'chip' }); UI.paintChip(chip, sum.chip);
    host.append(mk('p', {}, chip, ` ${sum.line}`));
    return;
  }
  host.append(cycleFigure(result));
  const head = mk('tr', {}, ...STAGE_HEAD.map(h => UI.cell('th', h)));
  const rows = stageRows(result).map(r => mk('tr', {}, ...r.map(c => UI.cell('td', c))));
  host.append(more('Show the stage table', mk('table', { cls: 'run-list' }, mk('thead', {}, head), mk('tbody', {}, ...rows)),
    mk('p', { cls: 'est-note', text: 'Spawn run judges temperature and block core only (the bags are sealed).' })));
  if (global.FarmCharts) {
    charts = global.FarmCharts.createTrendCharts(q('#smCharts'), { keys: ['T', 'RH', 'C'], clock: UI.simClock(0) });
    charts.draw({ t0: 0, t1: result.totals.days * 86400, pts: seriesPoints(result) });
  }
}

// ---- saved runs ----
function paintRuns() {
  const UI = global.FarmUi;
  const body = q('#smRuns tbody');
  body.replaceChildren(...runs.map(info => {
    const t = runRowTexts(info);
    const chip = mk('span', { cls: 'chip' }); UI.paintChip(chip, t.chip);
    const noteCell = UI.cell('td', t.note);
    const open = btn('Open'), note = btn('Note'), del = btn('Delete');
    const actions = [open];
    if (info.kind === 'cycle' && (info.verdict === 'pass' || info.verdict === 'fail')) {
      actions.push(mk('a', { cls: 'btn btn-link', href: `#/rooms/${id}/calibrate/${info.id}`, text: 'Compare with real' }));
    }
    actions.push(note, del);
    open.addEventListener('click', () => guarded(open, async () => {
      const me = mountSeq;
      const run = await global.FarmApi.getSimulation(id, info.id);
      if (!here(me)) return;
      try { showResult(run.kind, run.result); } catch (err) { msg(`The saved result could not be read: ${err.message}`, 'error'); }
    }));
    note.addEventListener('click', () => guarded(note, async () => {
      const text = prompt(`Note for run ${info.id}`, info.note ?? '');
      if (text === null) return;
      const me = mountSeq;
      const updated = await global.FarmApi.updateSimulation(id, info.id, { note: text });
      if (!here(me)) return;
      const at = runs.findIndex(r => r.id === info.id);
      if (at >= 0) { runs[at] = updated; paintRuns(); }
    }));
    del.addEventListener('click', () => guarded(del, async () => {
      if (!confirm('Delete this run? It cannot be undone.')) return;
      const me = mountSeq;
      await global.FarmApi.deleteSimulation(id, info.id);
      if (!here(me)) return;
      runs = runs.filter(r => r.id !== info.id); paintRuns();
    }));
    return mk('tr', { 'data-run-id': String(info.id) }, UI.cell('td', t.run), UI.cell('td', t.mix), mk('td', {}, chip), UI.cell('td', t.energy), noteCell,
      mk('td', {}, ...actions));
  }));
  q('#smOlder').hidden = olderDone || !runs.length;
}
// One request at a time per button; every ApiError becomes a message.
async function guarded(button, fn) {
  if (button.disabled) return;
  const me = mountSeq;
  button.disabled = true;
  try { await fn(); } catch (err) { if (here(me)) msg(global.FarmUi.errorText(err), 'error'); } finally { if (here(me) && button.isConnected) button.disabled = false; }
}

// ---- runs ----
async function startRun(kind) {
  const UI = global.FarmUi;
  if (running || !alive || !ready()) return;
  const me = mountSeq;
  let r, it;
  try {
    if (kind === 'cycle') {
      const days = global.ClimateCycle.cycleDays(settings.farmType, settings.program);
      if (days > MAX_DAYS && !confirm(`This program is ${days} days long and may take several minutes in the browser. Run it?`)) return;
    }
    r = runInputs(kind, currentData());
    it = kind === 'cycle'
      ? global.ClimateCycle.runCycleSteps(r.room, r.mix, { settings: r.settings, region: r.region, tariff: r.tariff })
      : global.ClimateCapacity.checkSteps(r.room, r.mix, { region: r.region, tariff: r.tariff, emptyBelow: r.emptyBelow });
  } catch (err) { msg(`The run stopped: ${err.message}`, 'error'); return; }

  running = true;
  const myGen = ++gen;
  const bar = q('#smProgress'), fill = bar.firstElementChild, label = bar.lastElementChild;
  bar.hidden = false; fill.style.width = '0%'; label.textContent = ''; msg('');
  syncControls();
  let result, finished = false;
  try {
    for (;;) {
      const s = it.next();
      if (s.done) { result = s.value; finished = true; break; }
      label.textContent = progressText(s.value);
      fill.style.width = s.value.day === undefined ? '0%' : `${UI.clamp(s.value.day / s.value.days * 100, 0, 100)}%`;
      await new Promise(done => setTimeout(done, 0));
      if (!here(me) || myGen !== gen) return;
    }
  } catch (err) {
    if (here(me) && myGen === gen) msg(`The run stopped: ${err.message}`, 'error');
  } finally {
    if (here(me) && myGen === gen) { running = false; bar.hidden = true; syncControls(); }
  }
  if (!finished || !here(me) || myGen !== gen) return;

  try { showResult(kind, result); } catch (err) { msg(`The result could not be drawn: ${err.message}`, 'error'); }
  try {
    const info = await global.FarmApi.createSimulation(id, { kind, inputs: r.inputs, result });
    if (!here(me)) return;
    runs.unshift(info); paintRuns(); msg(`Saved as run ${info.id}.`, 'good');
  } catch (err) {
    if (here(me)) msg(`The result was not saved: ${UI.errorText(err)}`, 'error');
  }
}

async function saveMix() {
  const UI = global.FarmUi;
  if (saving || running) return;
  const me = mountSeq;
  saving = true; syncControls();
  try {
    const rows = await global.FarmApi.saveMix(id, draft);
    if (!here(me)) return;
    saved = rows; draft = rows.map(x => ({ ...x }));
    paintMix();
    msg(`Saved. The simulated live room uses ${rows.reduce((n, x) => n + x.blocks, 0)} blocks after its next restart.`, 'good');
  } catch (err) {
    if (here(me)) msg(UI.errorText(err), 'error');
  } finally {
    if (here(me)) { saving = false; syncControls(); }
  }
}

async function loadOlder() {
  const button = q('#smOlder');
  await guarded(button, async () => {
    const me = mountSeq;
    const page = await global.FarmApi.listSimulations(id, { limit: 50, before: Math.min(...runs.map(r => r.id)) });
    if (!here(me)) return;
    if (!page.length) olderDone = true;
    runs = runs.concat(page); paintRuns();
  });
}

function build() {
  const CAPY = global.ClimateCapacity;
  const calibChip = mk('span', { cls: 'chip', id: 'smCalib' });
  const region = mk('select', { id: 'smRegion' });
  for (const k of Object.keys(CAPY.DESIGN_DAYS)) region.append(mk('option', { value: k, text: regionText(k) }));
  const tariff = mk('input', { id: 'smTariff', type: 'number', min: '0', max: '10', step: '0.01' }); tariff.value = '0.57';
  const empty = mk('input', { id: 'smEmpty', type: 'number', min: '0', max: '100' }); empty.value = String(CAPY.VERDICT.emptyBelow);
  const mixHead = mk('tr', {}, ...['Crop', 'Blocks', 'CO₂ per block (mL/h)', '–'].map(h => global.FarmUi.cell('th', h)));
  const runHead = mk('tr', {}, ...['Run', 'Mix', 'Result', 'Energy', 'Note', '–'].map(h => global.FarmUi.cell('th', h)));
  el.replaceChildren(
    mk('p', { cls: 'explain', text: EXPLAIN }),
    mk('section', { cls: 'card' }, mk('h3', { text: 'Crop mix' }),
      mk('table', { cls: 'mix-table', id: 'smMix' }, mk('thead', {}, mixHead), mk('tbody')),
      mk('div', { cls: 'btn-row' }, btn('Add a crop', { id: 'smAddCrop' }), btn("Save as this room's crop mix", { id: 'smSaveMix', cls: 'btn btn-primary' }))),
    mk('p', { cls: 'tag', id: 'smValues' }, calibChip, mk('span', { cls: 'tag', id: 'smSettings' }), mk('span', { cls: 'tag', id: 'smMachines' })),
    mk('div', { cls: 'section-head' },
      mk('label', { for: 'smRegion', text: 'Region' }), region,
      mk('label', { for: 'smTariff', text: 'Tariff (RM per kWh)' }), tariff,
      mk('label', { for: 'smEmpty', text: 'Too empty below (%)' }), empty,
      mk('div', { cls: 'btn-row' },
        btn('Check capacity (≈ 2 s)', { id: 'smCap', cls: 'btn btn-primary' }), btn('Run full cycle', { id: 'smCycle' }),
        mk('a', { cls: 'btn btn-link', id: 'smBench', href: `#/simulator/${id}`, text: 'Open test bench' })),
      mk('p', { cls: 'field-help', id: 'smRunHelp', role: 'status' })),
    mk('div', { cls: 'run-progress', id: 'smProgress', hidden: '' }, mk('span'), mk('span')),
    mk('p', { cls: 'alert room-msg', id: 'smMsg', role: 'status', hidden: '' }),
    mk('section', { cls: 'card result-card', id: 'smResult', hidden: '' }),
    mk('div', { cls: 'contents', id: 'smCharts' }),
    mk('div', { cls: 'contents', 'data-slot': 'equipment-check' }),
    mk('section', { cls: 'card' }, mk('h3', { text: 'Saved runs' }),
      mk('table', { cls: 'run-list', id: 'smRuns' }, mk('thead', {}, runHead), mk('tbody')), btn('Older', { id: 'smOlder' })));
  q('#smAddCrop').addEventListener('click', () => { const next = availableCrops(draft, draft.length)[0]; if (next) { draft.push({ crop: next, blocks: 500, co2_per_block: null }); paintMix(); } });
  q('#smSaveMix').addEventListener('click', saveMix);
  q('#smCap').addEventListener('click', () => startRun('capacity'));
  q('#smCycle').addEventListener('click', () => startRun('cycle'));
  q('#smOlder').addEventListener('click', loadOlder);
}

function mountCard() {
  const slot = q('[data-slot="equipment-check"]');
  if (!global.FarmEquipmentCard) { slot.append(mk('p', { cls: 'est-note', text: NOT_INSTALLED })); return; }
  card = global.FarmEquipmentCard.mount(slot, { id, equipment, runInputs: cardInputs,
    onEquipment: eq => { equipment = eq; paintValues(); },
    onSaved: info => { runs.unshift(info); paintRuns(); } });
}

function mount(host, context) {
  const API = global.FarmApi, UI = global.FarmUi;
  unmount();
  el = host; ctx = context; id = context.id; room = context.room();
  saved = null; draft = []; calibrations = null; settings = null; version = null; equipment = undefined;
  runs = []; running = false; saving = false; streamed = false; olderDone = false; card = null; charts = null;
  alive = true; gen++;
  const me = ++mountSeq;
  build();
  paintMix(); paintRuns(); paintValues();
  ctx.on('settings', data => {
    if (!here(me)) return;
    streamed = true; settings = data.settings; version = { id: data.id, saved_at: data.saved_at };
    paintValues(); syncControls();
  });
  ctx.on('room', r => { room = r; });

  const load = (promise, apply) => promise.then(v => { if (here(me)) apply(v); }).catch(err => { if (here(me)) msg(UI.errorText(err), 'error'); });
  return Promise.all([
    load(API.getMix(id), rows => { saved = rows; draft = rows.map(x => ({ ...x })); paintMix(); }),
    load(API.listCalibrations(id), rows => { calibrations = rows; paintValues(); }),
    load(API.getSettings(id), s => { if (!streamed) settings = s; }),
    load(API.listSettingsHistory(id), rows => { if (!streamed && rows.length) version = { id: rows[0].id, saved_at: rows[0].saved_at }; }),
    load(API.getEquipment(id), eq => { equipment = eq; }),
    load(API.listSimulations(id, { limit: 50 }), rows => { runs = rows; paintRuns(); }),
  ]).then(() => {
    if (!here(me)) return;
    paintValues(); syncControls();
    if (settings !== null && equipment !== undefined) mountCard();
  });
}

function unmount() {
  alive = false; gen++; mountSeq++;
  try { if (card) card.unmount(); } catch { /* the card is gone with the page */ }
  card = null;
  try { if (charts) charts.destroy(); } catch { /* the charts are gone with the page */ }
  charts = null; running = false;
}

global.FarmRoomTabs.register('simulate', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
