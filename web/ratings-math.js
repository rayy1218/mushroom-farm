// Pure helpers for the room dialog's "Power and water" section and its meter address (no DOM, so they can be tested in Node).
// Spec 2026-10-20-energy-water-outdoor-design.md section 4.

// name, label, unit, default, max, step. All from 0.
export const RATINGS = [
  { name: 'intakeW', label: 'Intake fan', unit: 'W', def: 60, max: 5000, step: 1 },
  { name: 'exhaustW', label: 'Exhaust fan', unit: 'W', def: 60, max: 5000, step: 1 },
  { name: 'circulationW', label: 'Circulation fan', unit: 'W', def: 60, max: 5000, step: 1 },
  { name: 'humidifierW', label: 'Humidifier power', unit: 'W', def: 80, max: 5000, step: 1 },
  { name: 'humidifierLH', label: 'Humidifier water', unit: 'L/h', def: 2.0, max: 100, step: 0.1 },
  { name: 'acInputW', label: 'Aircon rated input', unit: 'W', def: 1050, max: 20000, step: 1 },
];

export const RATING_NAMES = RATINGS.map((r) => r.name);

export const ratingMessage = (r) => `${r.label} must be a number from 0 to ${r.max} ${r.unit}`;

// A room (or null, for a new room) → the text of each rating input; a missing number falls back to the default.
export function ratingTexts(room) {
  return Object.fromEntries(RATINGS.map((r) => [r.name, String(Number.isFinite(room?.[r.name]) ? room[r.name] : r.def)]));
}

// The inputs' texts → { values } or { errors: { name: message } }. A rating is a number from 0 to its maximum
// (at most two decimals); anything else is an error on that input.
export function parseRatings(texts) {
  const values = {};
  const errors = {};
  for (const r of RATINGS) {
    const s = String(texts?.[r.name] ?? '').trim();
    const n = /^[0-9]{1,5}(\.[0-9]{1,2})?$/.test(s) ? Number(s) : NaN;
    if (n >= 0 && n <= r.max) values[r.name] = n;
    else errors[r.name] = ratingMessage(r);
  }
  return Object.keys(errors).length ? { errors } : { values };
}

// The energy meter address: blank = none, else a whole number 1 to 247 (same as the other addresses); NaN if wrong.
export function meterAddressOf(text) {
  const s = String(text ?? '').trim();
  if (s === '') return null;
  return /^[0-9]{1,3}$/.test(s) && Number(s) >= 1 && Number(s) <= 247 ? Number(s) : NaN;
}

// The "Energy meter" sensor card of the room page, from the meter in the sensors reply. null: no meter set.
// { address, status, power, energy, at }: values are null until the first good answer.
export function meterCard(meter) {
  if (!meter || meter.address == null || meter.status === 'not-wired') return null;
  const ok = meter.lastOk ?? null;
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return { address: meter.address, status: meter.status, power: num(ok?.power), energy: num(ok?.energy), at: num(ok?.at), failures: num(meter.failuresInRow) ?? 0 };
}
