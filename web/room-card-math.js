// Pure helpers for the Room card of the room page (web/room-card.js): the reading tiles with their band bars, the control
// note and the fresh-air line, the machine tiles in air-path order and the line with the outdoor air and the filter.
// No DOM, so Node tests cover it. Spec 2026-10-26-room-picture-design.md section 3.

import { view } from './mimic-math.js';
import { exchangeLine } from './control-math.js';
import { filterCard } from './filter-math.js';
import { CROPS } from './crops.js';

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const DASH = '—';

// ---------------- reading tiles ----------------

// The three readings: the DrawState field, the control fields of the band, the scale and the step it widens by.
const READINGS = [
  { key: 'T', name: 'Temperature', unit: '°C', low: 'tLow', high: 'tHigh', min: 15, max: 30, step: 1, text: (v) => v.toFixed(1) },
  { key: 'RH', name: 'Humidity', unit: '% RH', low: 'rhLow', high: 'rhHigh', min: 70, max: 100, step: 5, text: (v) => String(Math.round(v)) },
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
    limits: hasBand ? [{ at: at(low), text: String(low) }, { at: at(high), text: String(high) }] : [],
  };
}

// The tile's edge by the chip's level: amber out of band, red at the safety level, grey without a current reading.
const EDGE = { good: '', warning: 'warn', critical: 'bad', serious: 'none', none: 'none' };

// DrawState (fromRoom) and the control view → three tiles { key, name, value, unit, chip: { lvl, text }, edge, bar, label }.
export function readingTiles(draw, control) {
  const d = draw || {};
  return READINGS.map((r) => {
    const value = num(d[r.key]);
    const st = d.status?.[r.key] || {};
    const low = num(control?.[r.low]);
    const high = num(control?.[r.high]);
    const shown = value === null ? DASH : r.text(value);
    return {
      key: r.key, name: r.name, value: shown, unit: r.unit,
      chip: { lvl: st.lvl || 'none', text: `${st.icon ? `${st.icon} ` : ''}${st.text || ''}` },
      edge: EDGE[st.lvl] ?? 'none',
      bar: bandBar(r.key, value, low, high, r.safety ? num(control?.[r.safety]) : null),
      label: value === null ? `${r.name} no data` : `${r.name} ${shown} ${r.unit}${low !== null && high !== null ? `, band ${low} to ${high}` : ''}`,
    };
  });
}

// ---------------- the header note and the fresh-air line ----------------

const every = (c) => (num(c?.exchangeEveryMin) ?? 0);

// "Automatic control on · fresh air every 15 min", "Automatic control off", or '' before the control settings loaded.
export function controlNote(c) {
  if (!c) return '';
  if (!c.auto) return 'Automatic control off';
  return every(c) > 0 ? `Automatic control on · fresh air every ${every(c)} min` : 'Automatic control on';
}

// The line under the reading tiles: the running exchange, that auto is off, why fresh air waits, or when it comes next.
export function freshAirLine(c, now = Date.now()) {
  if (!c) return '';
  if (!c.auto) return 'Automatic control off';
  if (c.exchange) return exchangeLine(c, now);
  if (every(c) <= 0) return '';
  const why = c.reasons?.exchange;
  if (typeof why === 'string' && why.startsWith('Fresh air waits')) return why;
  if (num(c.freshFrom) === null) return `Fresh air every ${every(c)} min`; // the wait counts from the next cycle
  const left = c.freshFrom + every(c) * 60_000 - now;
  return left > 0 ? `Next fresh air in ${Math.ceil(left / 60_000)} min` : 'Fresh air due';
}

// ---------------- machine tiles ----------------

const fanWord = (sub) => sub.replace(/^fan (\S+)/, (_, f) => `fan ${f.toLowerCase()}`);

// In the order the air meets them; the dehumidifier only when the room has one.
const MACHINES = [
  { key: 'intake', name: 'Intake fan', effect: 'Air in',
    detail: (u, c, f) => (!f ? 'No filter sensor' : f.pa === null ? 'Filter: no reading yet' : `Filter ${Math.round(f.pa)} Pa`) },
  { key: 'ac', name: 'Aircon', effect: '− Temperature', detail: (u) => (u.sub ? `${u.state} · ${fanWord(u.sub)}` : u.state) },
  { key: 'circ', name: 'Circulation', effect: 'Mixes the air', detail: (u, c) => (c?.auto ? 'Always on' : 'Set by hand') },
  { key: 'hu', name: 'Humidifier', effect: '+ Humidity', detail: (u, c) => (num(c?.rhLow) !== null ? `Below ${c.rhLow} %` : 'Below the band') },
  { key: 'dh', name: 'Dehumidifier', effect: '− Humidity', detail: (u, c) => (num(c?.rhHigh) !== null ? `Above ${c.rhHigh} %` : 'Above the band') },
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

// DrawState, the control view and filterSummary() → [{ key, step, name, effect, on, pill: { text, tone }, detail }].
export function machineTiles(draw, control, filter) {
  const v = view(draw);
  const unitOf = (key) => (key === 'dh' ? v.dh : v.units[key]);
  return MACHINES.filter((m) => unitOf(m.key)).map((m, i) => {
    const u = unitOf(m.key);
    return {
      key: m.key, step: i + 1, name: m.name, effect: m.effect, on: u.on,
      pill: pillOf(m.key, u),
      detail: u.known || m.key !== 'ac' ? m.detail(u, control, filter) : u.state,
    };
  });
}

// ---------------- the filter, the bottom line and the blocks ----------------

// A line of parts: plain text and bold text taking turns (the even parts plain, the odd ones bold).
export const lineText = (parts) => parts.join('');

// The filter as the Filter card shows it (the reading, the last one with the intake on while it is off, and the due date):
// { pa (null: no reading yet), line } or null when the room has no filter pressure sensor.
export function filterSummary({ room, sensor, intake = null, lastRunning = null, now = Date.now() } = {}) {
  if (!room) return null;
  const c = filterCard({ room, sensor, changes: [], now, intake, lastRunning });
  if (!c.pressure) return null;
  const pa = c.pressure.value;
  const due = c.due === 'No reminder' ? '' : `, ${c.due.replace(/ \(every [^)]*\)$/, '').replace(/^./, (x) => x.toLowerCase())}`;
  return { pa, line: pa === null ? [`Filter: no reading yet${due}`] : ['Filter ', `${Math.round(pa)} Pa`, due] };
}

// "Outdoor 32.9 °C · 62 % RH" (or "No outdoor sensor") and the filter's line when the room has one.
export function bottomLine(draw, filter) {
  const v = view(draw);
  const outdoor = v.hasOut ? ['Outdoor ', v.outT, ` · ${v.outRH}`] : [v.outLine];
  return filter ? [outdoor, filter.line] : [outdoor];
}

// The crop's short name: "Lion's mane (draft)" → "lion's mane".
const cropWord = (key) => (CROPS[key] ? CROPS[key].name.replace(/\s*\(.*\)$/, '').replace(/^./, (x) => x.toLowerCase()) : '');

// The crops' blocks under the container: "950 lion's mane blocks", "950 blocks: 500 grey oyster, 450 reishi", or ''.
export function blocksLine(crops) {
  const rows = (Array.isArray(crops) ? crops : []).filter((c) => num(c?.blocks) !== null && c.blocks > 0);
  if (!rows.length) return '';
  const n = (x) => x.toLocaleString('en-US');
  if (rows.length === 1) return `${n(rows[0].blocks)}${cropWord(rows[0].crop) ? ` ${cropWord(rows[0].crop)}` : ''} blocks`;
  return `${n(rows.reduce((s, c) => s + c.blocks, 0))} blocks: ${rows.map((c) => `${n(c.blocks)} ${cropWord(c.crop) || 'blocks'}`).join(', ')}`;
}

// Everything the Room card shows besides the picture.
export function roomCard({ draw = null, control = null, filter = null, now = Date.now() } = {}) {
  return {
    note: controlNote(control),
    tiles: readingTiles(draw, control),
    fresh: freshAirLine(control, now),
    machines: machineTiles(draw, control, filter),
    bottom: bottomLine(draw, filter),
  };
}
