// Pure helpers for the Automatic control card (no DOM, so they can be tested in Node).

// Rows of the card: server field names, label, unit and limits (spec section 2).
export const BANDS = [
  { key: 'co2', label: 'CO₂', unit: 'ppm', name: 'CO₂ band', low: 'co2Low', high: 'co2High', min: 300, max: 5000, step: '1' },
  { key: 't', label: 'Temperature', unit: '°C', name: 'Temperature band', low: 'tLow', high: 'tHigh', min: 16, max: 35, step: '0.5' },
  { key: 'rh', label: 'Humidity', unit: '%', name: 'Humidity band', low: 'rhLow', high: 'rhHigh', min: 40, max: 100, step: '0.5' },
];

export const REASONS = [
  { key: 'exchange', label: 'Air exchange' },
  { key: 'humidifier', label: 'Humidifier' },
  { key: 'ac', label: 'Aircon' },
  { key: 'circulation', label: 'Circulation' },
];

export const HUMIDIFIER_LABEL = 'Humidifier on during air exchange';

// The setting as shown on its switch; a reply without it counts as on (the default).
export function humidifierOn(c) {
  return c?.humidifierDuringExchange !== false;
}

export const AC_FAN_LABEL = 'Aircon fan';
export const AC_FAN_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
];

// The aircon fan setting as shown in its choice; a reply without it (or with an unknown value) counts as auto.
export function acFanOf(c) {
  return AC_FAN_OPTIONS.some((o) => o.value === c?.acFan) ? c.acFan : 'auto';
}

export const AUTO_NOTE = 'Automatic control is on';

function pad2(n) {
  return String(n).padStart(2, '0');
}

// "10:42" in local time.
export function formatHm(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// "Air exchange on since 10:42 (stops by 10:52)" with the room's time limit, "(12 min)" without; or "Air exchange off".
// now is injectable.
export function exchangeLine(c, now = Date.now()) {
  if (!c.exchange) return 'Air exchange off';
  if (c.exchangeSince == null) return 'Air exchange on';
  if (Number.isFinite(c.exchangeMaxMin)) {
    return `Air exchange on since ${formatHm(c.exchangeSince)} (stops by ${formatHm(c.exchangeSince + c.exchangeMaxMin * 60000)})`;
  }
  const min = Math.max(0, Math.floor((now - c.exchangeSince) / 60000));
  const length = min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
  return `Air exchange on since ${formatHm(c.exchangeSince)} (${length})`;
}

// The state line under the card: the exchange while auto is on, otherwise that auto is off.
export function stateLine(c, now = Date.now()) {
  return c.auto ? exchangeLine(c, now) : 'Automatic control off';
}

// The accessible name of a band input, e.g. "CO₂ band low limit, ppm".
export function inputLabel(band, side) {
  return `${band.name} ${side} limit, ${band.unit}`;
}

// One reason as a line; the server's text already starts with the machine name, a missing text becomes a dash.
export function reasonLine(label, text) {
  if (!text) return `${label}: —`;
  return text.startsWith(label) ? text : `${label}: ${text}`;
}

// Checks one band's two typed values (numbers, NaN when empty). → { field: 'low'|'high', message } or null.
export function checkBand(band, low, high) {
  const range = `${band.min} to ${band.max} ${band.unit}`;
  if (!Number.isFinite(low) || low < band.min || low > band.max) return { field: 'low', message: `${band.name} lower limit must be ${range}` };
  if (!Number.isFinite(high) || high < band.min || high > band.max) return { field: 'high', message: `${band.name} upper limit must be ${range}` };
  if (!(low < high)) return { field: 'low', message: `${band.name} lower limit must be below the upper limit` };
  return null;
}

// Which band row a server field belongs to: 'co2Low' → { band, side }, unknown → null.
export function locateField(field) {
  for (const band of BANDS) {
    if (field === band.low) return { band, side: 'low' };
    if (field === band.high) return { band, side: 'high' };
  }
  return null;
}

// The values the card sends with Save: the six band values, and the safety values when they are given.
export function bandsBody(values) {
  const body = {};
  for (const band of BANDS) {
    body[band.low] = values[band.low];
    body[band.high] = values[band.high];
  }
  for (const f of SAFETY_FIELDS) if (values[f.key] !== undefined) body[f.key] = values[f.key];
  return body;
}

// ---- safety settings (spec 2026-10-19-safety-and-history-design.md 2.5, 6) ----

// The two inputs next to the bands, saved with Save.
export const SAFETY_FIELDS = [
  { key: 'co2Safety', label: 'CO₂ safety level (ppm)', min: 300, max: 10000, step: '1' },
  { key: 'exchangeMaxMin', label: 'Air exchange time limit (min)', min: 1, max: 120, step: '1' },
];

// Which safety input a server field belongs to, or null.
export function locateSafetyField(field) {
  return SAFETY_FIELDS.find((f) => f.key === field) ?? null;
}

// Checks the typed safety values like the server. → { field, message } or null.
export function checkSafety(co2High, co2Safety, exchangeMaxMin) {
  if (!Number.isFinite(co2Safety) || co2Safety > 10000) return { field: 'co2Safety', message: 'CO₂ safety level must be a number up to 10000 ppm' };
  if (co2Safety <= co2High) return { field: 'co2Safety', message: 'CO₂ safety level must be above the CO₂ band upper limit' };
  if (!Number.isInteger(exchangeMaxMin) || exchangeMaxMin < 1 || exchangeMaxMin > 120) {
    return { field: 'exchangeMaxMin', message: 'Air exchange time limit must be a whole number from 1 to 120 min' };
  }
  return null;
}

// "CO₂ sensor: fault (value does not change)": one line for each sensor whose last check was not ok.
// checks is { trh, co2 } of the control view, null for a sensor not checked yet.
export function checkLines(checks) {
  const lines = [];
  for (const [key, name] of [['trh', 'T/RH probe'], ['co2', 'CO₂ sensor']]) {
    const r = checks?.[key];
    if (!r || r.ok) continue;
    const why = String(r.why ?? '').replace(/ \(frozen\)$/, '');
    lines.push(`${name}: ${r.fault ? 'fault' : 'reading not used'} (${why})`);
  }
  return lines;
}

// The wait text under a machine's reason ("Humidifier waits: minimum on time, 40 s to go"), or ''.
export function heldLine(c, key) {
  return c?.reasons?.held?.[key] ?? '';
}
