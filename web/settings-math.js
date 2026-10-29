// Pure helpers for the Settings page and the room page refresh (no DOM, so they can be tested in Node).

export const POLL_MIN = 1;
export const POLL_MAX = 300;
export const DEFAULT_POLL = 5;
export const POLL_MESSAGE = 'Reading interval must be a whole number from 1 to 300 seconds';

// The text of the input → whole seconds, or null when it is not a whole number from 1 to 300.
export function parsePoll(text) {
  const s = String(text ?? '').trim();
  if (!/^[0-9]{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= POLL_MIN && n <= POLL_MAX ? n : null;
}

// How often the room page refreshes: the reading interval, clamped to 2–30 s; 5 s when unknown.
export function refreshMs(settings) {
  const n = settings?.pollSeconds;
  if (!Number.isFinite(n)) return DEFAULT_POLL * 1000;
  return Math.min(30, Math.max(2, n)) * 1000;
}

// The Settings hint under the interval, with how long the Live charts' readings span at it (critique 2026-10-29c: "the last 50
// readings" said nothing of the time): "…, about 4 min at 5 s." seconds null: not known, no span.
export const LIVE_READINGS = 50; // the server's getSensors limit
export function liveHint(seconds) {
  const s = LIVE_READINGS * seconds;
  const span = s < 90 ? `${s}\u00a0s` : s < 90 * 60 ? `${Math.round(s / 60)}\u00a0min` : `${Math.round(s / 3600)}\u00a0h`;
  const head = Number.isFinite(seconds) && seconds > 0 ? `Live charts show the last ${LIVE_READINGS} readings, about ${span} at ${seconds}\u00a0s.` : `Live charts show the last ${LIVE_READINGS} readings.`;
  return `${head} A sensor or machine shows as offline after 3 failed readings in a row.`;
}

// ---- iteration 7: the outdoor sensor address and the prices (spec 2026-10-20-energy-water-outdoor-design.md section 6) ----

export const OUTDOOR_MESSAGE = 'Outdoor sensor address must be a whole number from 1 to 247, or empty for none';
export const ELECTRICITY_MESSAGE = 'Electricity price must be a number from 0 to 10 RM per kWh';
export const WATER_MESSAGE = 'Water price must be a number from 0 to 100 RM per m³, or empty to leave water costs out';
export const DEFAULT_ELECTRICITY = 0.55;

const DECIMAL = /^[0-9]{1,3}(\.[0-9]{1,4})?$/; // digits with up to 4 decimals (a tariff like 0.5068)

// The text of the input → { value } (null for blank), or { error } with the message for the field.
export function parseOutdoorAddress(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { value: null };
  if (!/^[0-9]{1,3}$/.test(s)) return { error: OUTDOOR_MESSAGE };
  const n = Number(s);
  return n >= 1 && n <= 247 ? { value: n } : { error: OUTDOOR_MESSAGE };
}

export function parseElectricityPrice(text) {
  const s = String(text ?? '').trim();
  if (!DECIMAL.test(s)) return { error: ELECTRICITY_MESSAGE };
  const n = Number(s);
  return n >= 0 && n <= 10 ? { value: n } : { error: ELECTRICITY_MESSAGE };
}

// Blank means no water price: water costs are not shown.
export function parseWaterPrice(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { value: null };
  if (!DECIMAL.test(s)) return { error: WATER_MESSAGE };
  const n = Number(s);
  return n >= 0 && n <= 100 ? { value: n } : { error: WATER_MESSAGE };
}

// The three added fields: how to read the input's text, and the server's value → the input's text.
export const EXTRA_FIELDS = [
  { name: 'outdoorAddress', parse: parseOutdoorAddress, show: (v) => (v == null ? '' : String(v)) },
  { name: 'electricityPrice', parse: parseElectricityPrice, show: (v) => (Number.isFinite(v) ? String(v) : String(DEFAULT_ELECTRICITY)) },
  { name: 'waterPrice', parse: parseWaterPrice, show: (v) => (v == null || !Number.isFinite(v) ? '' : String(v)) },
];

// All three inputs ({ name: text }) → { body } for PUT /api/settings, or { errors: { name: message } }.
export function parseExtraSettings(texts) {
  const body = {};
  const errors = {};
  for (const f of EXTRA_FIELDS) {
    const r = f.parse(texts[f.name]);
    if ('error' in r) errors[f.name] = r.error;
    else body[f.name] = r.value;
  }
  return Object.keys(errors).length ? { errors } : { body };
}
