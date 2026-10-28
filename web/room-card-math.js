// Pure helpers for the Room card of the room page (web/room-card.js): the reading tiles with their band bars, the control
// note and the fresh-air line, the machine tiles in air-path order and the line with the outdoor air and the filter.
// No DOM, so Node tests cover it. Spec 2026-10-26-room-picture-design.md section 3.

import { nearEdge, nearText, exchangePoints } from './band-math.js';
import { view } from './mimic-math.js';
import { exchangeLine } from './control-math.js';
import { filterCard, intakeRunning, lastRunningOf } from './filter-math.js';
import { CROPS, STAGES } from './crops.js';
import { hasCrops, stageDay } from './crop-math.js';
import { formatDateTime } from './simulation-math.js';
import { lightShort } from './light-math.js';

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const DASH = '—';
// A band limit as written under the bar: CO₂ grouped like its value, the others to one decimal (a ramping band moves in
// small steps: 20.9333 → "20.9").
const limit = (x, key) => (key === 'CO2' ? Math.round(x).toLocaleString('en-US') : String(Math.round(x * 10) / 10));

// ---------------- reading tiles ----------------

// The three readings: the DrawState field, the control fields of the band, the scale and the step it widens by.
const READINGS = [
  { key: 'T', name: 'Temperature', unit: '°C', low: 'tLow', high: 'tHigh', min: 15, max: 30, step: 1, text: (v) => v.toFixed(1) },
  { key: 'RH', name: 'Humidity', unit: '% RH', low: 'rhLow', high: 'rhHigh', min: 70, max: 100, step: 5, text: (v) => v.toFixed(1) },
  { key: 'CO2', name: 'CO₂', unit: 'ppm', low: 'co2Low', high: 'co2High', safety: 'co2Safety', min: 400, max: 1500, step: 100,
    text: (v) => Math.round(v).toLocaleString('en-US') },
];
const READING = Object.fromEntries(READINGS.map((r) => [r.key, r]));

// A reading's scale: T 15–30 °C, RH 70–100 %, CO₂ 400 to the larger of 1500 and the safety level + 100 ppm; widened to the
// reading and the band (to a whole step) so the mark and the zone always sit on the bar.
export function scaleFor(key, { value, low, high, safety } = {}) {
  const r = READING[key];
  let min = r.min;
  let max = key === 'CO2' && num(safety) !== null ? Math.max(r.max, safety + 100) : r.max;
  for (const x of [value, low, high].map(num)) {
    if (x === null) continue;
    if (x < min) min = Math.floor(x / r.step) * r.step;
    if (x > max) max = Math.ceil(x / r.step) * r.step;
  }
  return { min, max };
}

// The band bar: { zone: { from, to } | null, mark: share | null, limits: [{ at, text }] }, as shares of the scale.
export function bandBar(key, value, low, high, safety) {
  const s = scaleFor(key, { value, low, high, safety });
  const at = (x) => clamp01((x - s.min) / (s.max - s.min));
  const hasBand = num(low) !== null && num(high) !== null;
  return {
    zone: hasBand ? { from: at(low), to: at(high) } : null,
    mark: num(value) === null ? null : at(value),
    limits: hasBand ? [{ at: at(low), text: limit(low, key) }, { at: at(high), text: limit(high, key) }] : [],
  };
}

// The tile's edge by the chip's level: amber out of band, red at the safety level, grey without a current reading.
const EDGE = { good: '', warning: 'warn', critical: 'bad', serious: 'none', none: 'none' };

// DrawState (fromRoom) and the control view → three tiles { key, name, value, unit, chip: { lvl, text }, edge, bar, label }.
export function readingTiles(draw, control, trends = {}) {
  const d = draw || {};
  return READINGS.map((r) => {
    const value = num(d[r.key]);
    const st = d.status?.[r.key] || {};
    const low = num(control?.[r.low]);
    const high = num(control?.[r.high]);
    const shown = value === null ? DASH : r.text(value);
    // In band but close to an edge that hurts (band-math.js): say which, so a worker sees it coming.
    const edge = st.lvl === 'good' ? nearEdge(r.key, value, low, high, trends[r.key] ?? null) : null;
    const near = edge ? ` · ${nearText(edge)}` : '';
    return {
      key: r.key, name: r.name, value: shown, unit: r.unit,
      // CO₂'s two numbers are where the air exchange starts and stops (owner, 2026-10-28), the others a band to stay in
      band: low === null || high === null ? '' : r.key === 'CO2' ? `Air exchange ${exchangePoints(low, high, (x) => limit(x, r.key))}`
        : `Band ${limit(low, r.key)}–${limit(high, r.key)} ${r.unit}`,
      chip: { lvl: near ? 'near' : st.lvl || 'none', text: `${st.icon ? `${st.icon} ` : ''}${st.text || ''}${near}` }, // near an edge: amber
      edge: EDGE[st.lvl] ?? 'none',
      bar: bandBar(r.key, value, low, high, r.safety ? num(control?.[r.safety]) : null),
      label: value === null ? `${r.name} no data` : `${r.name} ${shown} ${r.unit}${low !== null && high !== null ? `, band ${limit(low, r.key)} to ${limit(high, r.key)}` : ''}`,
    };
  });
}

// ---------------- the reading cards' trace (redesign 2026-10-28) ----------------

const r2 = (x) => Number(x.toFixed(2));

// A reading card's trace scale: the band and twice its width above and below (humidity kept within 0–100), so normal
// cycling inside the band stays calm and the band is always about a fifth of the height. null without a band.
export function traceScale(key, low, high) {
  if (num(low) === null || num(high) === null || high <= low) return null;
  const w = high - low;
  let min = low - 2 * w;
  let max = high + 2 * w;
  if (key === 'RH') { min = Math.max(0, min); max = Math.min(100, max); }
  if (key === 'CO2') min = Math.max(0, min);
  return { min, max };
}

// How long the recent readings span: "Last 15 s", "Last 4 min", "Last 2 h".
function spanText(ms) {
  if (ms < 60_000) return `Last ${Math.round(ms / 1000)} s`;
  if (ms >= 50 * 60_000 && ms <= 70 * 60_000) return 'Last hour'; // the reading cards' usual window: one stable word
  if (ms < 3_600_000) return `Last ${Math.round(ms / 60_000)} min`;
  return `Last ${Math.round(ms / 3_600_000)} h`;
}

// The small trace on a reading card: the recent readings ([{ at, value }], value null for a failed poll) as an SVG path in a
// w × h box over the time they span, the band as a shaded strip with its edges as lines, the newest point marked. scale: a
// fixed range for the reading (scaleFor's), widened to hold the readings, so normal cycling inside the band stays calm;
// without one the trace zooms to the readings and the band (15 % air above and below).
// → { line, band: { y, h } | null, edges: { top, bottom } | null, last: { x, y } | null, span } or null with fewer than two.
export function traceOf(points, low, high, { w = 100, h = 32, scale = null } = {}) {
  const list = (points ?? []).filter((p) => p && Number.isFinite(p.at));
  const values = list.map((p) => num(p.value)).filter((v) => v !== null);
  if (values.length < 2) return null;
  const hasBand = num(low) !== null && num(high) !== null;
  let lo = Math.min(...values, ...(hasBand ? [low] : []));
  let hi = Math.max(...values, ...(hasBand ? [high] : []));
  if (scale) {
    lo = Math.min(scale.min, ...values);
    hi = Math.max(scale.max, ...values);
  } else {
    const pad = hi > lo ? (hi - lo) * 0.15 : 0.5;
    lo -= pad;
    hi += pad;
  }
  const t0 = list[0].at;
  const t1 = list[list.length - 1].at;
  const x = (at) => r2(t1 > t0 ? ((at - t0) / (t1 - t0)) * w : 0);
  const y = (v) => r2(h - ((v - lo) / (hi - lo)) * h);
  let line = '';
  let pen = false;
  let last = null;
  for (const p of list) {
    const v = num(p.value);
    if (v === null) { pen = false; continue; }
    line += `${pen ? 'L' : 'M'}${x(p.at)} ${y(v)}`;
    pen = true;
    last = { x: x(p.at), y: y(v) };
  }
  return {
    line,
    band: hasBand ? { y: y(high), h: r2(y(low) - y(high)) } : null,
    edges: hasBand ? { top: y(high), bottom: y(low) } : null,
    last,
    span: spanText(t1 - t0),
  };
}

// The points of a reading card's trace: the room history of the last hour ([{ at, value }]; null before it loaded), then the
// live polls newer than its last point; nothing older than an hour.
export function hourPoints(base, live, now = Date.now()) {
  const from = now - 3_600_000;
  const old = (base ?? []).filter((p) => p.at >= from);
  const last = old.length ? old[old.length - 1].at : -Infinity;
  return [...old, ...(live ?? []).filter((p) => p.at > last && p.at >= from)];
}

// ---------------- the header note and the fresh-air line ----------------

const every = (c) => (num(c?.exchangeEveryMin) ?? 0);

// "Automatic control on · fresh air every 15 min", "Automatic control off", or '' before the control settings loaded.
export function controlNote(c) {
  if (!c) return '';
  if (!c.auto) return 'Automatic control off';
  return every(c) > 0 ? `Automatic control on · fresh air every ${every(c)} min` : 'Automatic control on';
}

// The line under the room picture: the running exchange, why fresh air waits, or when it comes next ('' with auto off: the
// Control card says Manual).
export function freshAirLine(c, now = Date.now()) {
  if (!c) return '';
  if (!c.auto) return '';
  if (c.exchange) return exchangeLine(c, now);
  if (every(c) <= 0) return '';
  const why = c.reasons?.exchange;
  if (typeof why === 'string' && why.startsWith('Fresh air waits')) return why;
  // the wait counts from freshFrom, else the end of the last exchange (as server/controller.js decide); with neither, from
  // the next cycle
  const from = num(c.freshFrom) ?? num(c.exchangeEndedAt);
  if (from === null) return `Fresh air every ${every(c)} min`;
  const left = from + every(c) * 60_000 - now;
  return left > 0 ? `Next fresh air in ${Math.ceil(left / 60_000)} min` : 'Fresh air due';
}

// ---------------- machine tiles ----------------

const fanWord = (sub) => sub.replace(/^fan (\S+)/, (_, f) => `fan ${f.toLowerCase()}`);

const hasRh = (c) => num(c?.rhLow) !== null && num(c?.rhHigh) !== null;
const rhText = (x) => String(Math.round(x * 10) / 10);

// In the order the air meets them, the lights after the circulation; the dehumidifier and the lights only when the room has them.
const MACHINES = [
  { key: 'intake', name: 'Intake fan', effect: 'Air in',
    detail: (u, c, f) => (!f ? 'No filter sensor' : f.pa === null ? 'Filter: no reading yet' : `Filter ${f.pa.toFixed(1)} Pa`) },
  { key: 'ac', name: 'Aircon', effect: 'Cools', detail: (u) => (u.sub ? `${u.state} · ${fanWord(u.sub)}` : u.state) },
  { key: 'circ', name: 'Circulation', effect: 'Mixes the air', detail: (u, c) => (c?.auto ? 'Always on' : 'Set by hand') },
  { key: 'lights', name: 'Lights', effect: 'Light for the crop', detail: (u, c, f, crop) => (c?.auto ? lightShort(crop) : 'Set by hand') },
  // The controller's real rule (server/controller.js decide): the humidifier on at the lower limit, off at the upper; the
  // dehumidifier on at the upper limit, off at the middle of the band.
  { key: 'hu', name: 'Humidifier', effect: 'Adds moisture',
    detail: (u, c) => (hasRh(c) ? `On at ${rhText(c.rhLow)} %, off at ${rhText(c.rhHigh)} %` : 'On below the band') },
  { key: 'dh', name: 'Dehumidifier', effect: 'Dries',
    detail: (u, c) => (hasRh(c) ? `On at ${rhText(c.rhHigh)} %, off at ${rhText((c.rhLow + c.rhHigh) / 2)} %` : 'On above the band') },
  { key: 'exhaust', name: 'Exhaust fan', effect: 'Air out', detail: () => 'With the intake' },
];

// On / Off, or the state word for no data or a fault (an aircon's fault code stays in its detail line).
function pillOf(key, u) {
  if (!u.known) return { text: u.state, tone: 'none' };
  if (u.warn) {
    if (key !== 'ac') return { text: u.state.replace(/ \(.*\)$/, ''), tone: 'warn' };
    return { text: u.state.startsWith('Fault') ? 'Fault' : 'Not following', tone: 'warn' };
  }
  return u.on ? { text: 'On', tone: 'on' } : { text: 'Off', tone: 'off' };
}

// DrawState, the control view, filterSummary() and the crop program (the lights' schedule) → [{ key, step, name, effect, on,
// pill: { text, tone }, detail }].
export function machineTiles(draw, control, filter, crop = null) {
  const v = view(draw);
  const unitOf = (key) => (key === 'dh' || key === 'lights' ? v[key] : v.units[key]);
  return MACHINES.filter((m) => unitOf(m.key)).map((m, i) => {
    const u = unitOf(m.key);
    return {
      key: m.key, step: i + 1, name: m.name, effect: m.effect, on: u.on,
      pill: pillOf(m.key, u),
      detail: u.known || m.key !== 'ac' ? m.detail(u, control, filter, crop) : '', // the pill already says "No data"
    };
  });
}

// ---------------- the filter, the bottom line and the blocks ----------------

// The filter as the Filter card shows it (the reading, the last one with the intake on while it is off, and the due date):
// { pa (null: no reading yet), line } or null when the room has no filter pressure sensor.
export function filterSummary({ room, sensor, intake = null, lastRunning = null, now = Date.now() } = {}) {
  if (!room) return null;
  const c = filterCard({ room, sensor, changes: [], now, intake, lastRunning });
  if (!c.pressure) return null;
  const pa = c.pressure.value;
  const due = c.due === 'No reminder' ? '' : `, ${c.due.replace(/ \(every [^)]*\)$/, '').replace(/^./, (x) => x.toLowerCase())}`;
  return { pa, line: pa === null ? [`Filter: no reading yet${due}`] : ['Filter ', `${pa.toFixed(1)} Pa`, due] }; // one decimal, as the Filter card
}

// The filter from replies that came in together (a page load: the room, its sensors and the machines): { last, filter }.
// last: the last reading with the intake on, kept between loads. Not for a machines reply alone (after a command): the
// pressure reading of the last load was taken before it, with the intake in its old state.
export function filterFrom({ last = null, room, sensor, machines, now = Date.now() } = {}) {
  const intake = intakeRunning(machines);
  const next = lastRunningOf(last, intake, sensor);
  return { last: next, filter: filterSummary({ room, sensor, intake, lastRunning: next, now }) };
}

// "Outdoor 32.9 °C · 62 % RH" (or "No outdoor sensor"; a missing value "—", like the tiles) and the filter's line when the
// room has one. A line is parts: plain and bold text taking turns (the even parts plain, the odd ones bold).
export function bottomLine(draw, filter) {
  const v = view(draw);
  const dash = (x) => (x.startsWith('--') ? DASH : x);
  const outdoor = v.hasOut ? ['Outdoor ', dash(v.outT), ` · ${dash(v.outRH)}`] : [v.outLine];
  return filter ? [outdoor, filter.line] : [outdoor];
}

// The crop's short name: "Lion's mane (draft)" → "lion's mane".
const cropWord = (key) => (CROPS[key] ? CROPS[key].name.replace(/\s*\(.*\)$/, '').replace(/^./, (x) => x.toLowerCase()) : '');

// The crops' blocks under the container: "950 lion's mane blocks", "950 blocks: 500 grey oyster, 450 reishi", or ''.
export function blocksLine(crops, stage = '') {
  const rows = (Array.isArray(crops) ? crops : []).filter((c) => num(c?.blocks) !== null && c.blocks > 0);
  if (!rows.length) return '';
  const n = (x) => x.toLocaleString('en-US');
  const tail = stage ? ` · ${stage}` : ''; // the stage after the blocks under the picture
  if (rows.length === 1) return `${n(rows[0].blocks)}${cropWord(rows[0].crop) ? ` ${cropWord(rows[0].crop)}` : ''} blocks${tail}`;
  return `${n(rows.reduce((s, c) => s + c.blocks, 0))} blocks: ${rows.map((c) => `${n(c.blocks)} ${cropWord(c.crop) || 'blocks'}`).join(', ')}${tail}`;
}

// How long something has lasted: "12 min", "5 h 20 min", "1 day 6 h", "3 days".
export function stayed(ms) {
  const min = Math.max(0, Math.floor((num(ms) ?? 0) / 60_000));
  const days = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`;
  return h > 0 ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

const cropName = (key) => (CROPS[key] ? CROPS[key].name.replace(/\s*\(.*\)$/, '') : key);

// The crop facts at the top of the Room card (owner, 2026-10-26: what we grow, what stage it is, what is the next stage, how
// long it has been in this stage, how long it normally is), from the Crop card's reply (GET /api/rooms/:id/crop):
// { items: [{ label, value, sub }] × 5, short } or null without crops. short: the stage for the line under the picture.
export function cropFacts(crop, now = Date.now()) {
  if (!hasCrops(crop) || !crop.stage) return null;
  const rows = crop.crops.filter((c) => num(c?.blocks) !== null);
  const blocks = rows.reduce((s, c) => s + c.blocks, 0).toLocaleString('en-US');
  const stage = STAGES[crop.stage] ?? crop.stage;
  const flushes = crop.stage === 'fruiting' || crop.stage === 'rest';
  const length = num(crop.days?.[crop.stage]);
  const next = crop.nextStage;
  return {
    short: stage,
    items: [
      { label: 'Growing', value: rows.map((c) => cropName(c.crop)).join(' + '),
        sub: rows.length > 1 ? `${blocks} blocks (${rows.map((c) => c.blocks.toLocaleString('en-US')).join(' + ')})` : `${blocks} blocks` },
      { label: 'Stage', value: stage, sub: flushes ? `flush ${crop.flush} of ${crop.flushes}` : '' },
      { label: 'In this stage', value: num(crop.stageSince) === null ? '—' : stayed(now - crop.stageSince),
        sub: num(crop.stageSince) === null ? '' : `since ${formatDateTime(crop.stageSince)}` },
      { label: 'Normally', value: length === null ? '—' : `${length} ${length === 1 ? 'day' : 'days'}`,
        sub: crop.autoAdvance ? 'then it changes by itself' : 'you change it (automatic change is off)' },
      crop.done ? { label: 'Next', value: 'Replace the blocks', sub: `flush ${crop.flushes} of ${crop.flushes} done` }
        : next ? { label: 'Next', value: STAGES[next.stage] ?? next.stage, sub: num(next.at) === null ? 'when you start it' : `about ${formatDateTime(next.at)}` }
          : { label: 'Next', value: '—', sub: '' },
    ],
  };
}

// The Now tab's Crop card: { name, stage, sub: '950 blocks · flush 1 of 4', day: 'Day 2 of 7', share (of the stage's length,
// null without one), next, done } or null without crops or a stage. The day is stageDay's, as on the Crop tab.
export function cropSummary(crop, now = Date.now()) {
  const facts = cropFacts(crop, now);
  if (!facts) return null;
  const [growing, stage] = facts.items;
  const d = stageDay(crop, now);
  const nextStage = crop.nextStage;
  let next = '';
  if (crop.done) next = `Replace the blocks: flush ${crop.flushes} of ${crop.flushes} done`;
  else if (nextStage) next = `Next: ${STAGES[nextStage.stage] ?? nextStage.stage} · ${num(nextStage.at) === null ? 'when you start it' : `about ${formatDateTime(nextStage.at)}`}`;
  return {
    name: growing.value, stage: stage.value, sub: [growing.sub, stage.sub].filter(Boolean).join(' · '),
    day: d ? (d.length ? `Day ${d.day} of ${d.length}` : `Day ${d.day}`) : '',
    share: d?.length ? d.day / d.length : null,
    next, done: Boolean(crop.done),
  };
}

export function roomCard({ draw = null, control = null, filter = null, crop = null, now = Date.now(), trends = {} } = {}) {
  return {
    note: controlNote(control),
    crop: cropFacts(crop, now),
    summary: cropSummary(crop, now),
    tiles: readingTiles(draw, control, trends),
    fresh: freshAirLine(control, now),
    machines: machineTiles(draw, control, filter, crop),
    bottom: bottomLine(draw, filter),
  };
}
