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

export const AUTO_NOTE = 'Automatic control is on';

function pad2(n) {
  return String(n).padStart(2, '0');
}

// "10:42" in local time.
export function formatHm(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// "Air exchange on since 10:42" or "Air exchange off".
export function exchangeLine(c) {
  if (!c.exchange) return 'Air exchange off';
  return c.exchangeSince == null ? 'Air exchange on' : `Air exchange on since ${formatHm(c.exchangeSince)}`;
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
  if (!(low < high)) return { field: 'high', message: `${band.name} lower limit must be below the upper limit` };
  return null;
}

// Which band row a server field belongs to: 'co2Low' → { band, side }, unknown → null.
export function locateField(field) {
  for (const band of BANDS) {
    if (field === band.low) return { band, side: 'low' };
    if (field === band.high) return { band, side: 'high' };
    if (field === band.key) return { band, side: 'high' };
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
