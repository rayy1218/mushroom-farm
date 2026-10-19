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

export const AUTO_NOTE = 'Automatic control is on';

function pad2(n) {
  return String(n).padStart(2, '0');
}

// "10:42" in local time.
export function formatHm(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// "Air exchange on since 10:42 (12 min)" or "Air exchange off"; now is injectable.
export function exchangeLine(c, now = Date.now()) {
  if (!c.exchange) return 'Air exchange off';
  if (c.exchangeSince == null) return 'Air exchange on';
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

// The six values the card sends with Save.
export function bandsBody(values) {
  const body = {};
  for (const band of BANDS) {
    body[band.low] = values[band.low];
    body[band.high] = values[band.high];
  }
  return body;
}
