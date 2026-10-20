// Farm-wide settings: validation and the stored values. No HTTP.

export const DEFAULT_SETTINGS = { pollSeconds: 5, outdoorAddress: null, electricityPrice: 0.55, waterPrice: null };

const POLL_ERROR = 'Reading interval must be a whole number from 1 to 300 seconds';
const OUTDOOR_ERROR = 'Outdoor sensor address must be a whole number from 1 to 247, or empty';
const ELECTRICITY_ERROR = 'Electricity price must be a number from 0 to 10 per kWh';
const WATER_ERROR = 'Water price must be a number from 0 to 100 per m³, or empty';

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// Each setting: its check, and the error when it fails.
const FIELDS = {
  pollSeconds: { ok: (v) => Number.isInteger(v) && v >= 1 && v <= 300, error: POLL_ERROR },
  outdoorAddress: { ok: (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 247), error: OUTDOOR_ERROR },
  electricityPrice: { ok: (v) => isNumber(v) && v >= 0 && v <= 10, error: ELECTRICITY_ERROR },
  waterPrice: { ok: (v) => v === null || (isNumber(v) && v >= 0 && v <= 100), error: WATER_ERROR },
};

// Any subset of the settings may be given; unknown fields are ignored. Returns { settings } with the given ones when
// they are all valid, otherwise { error, field } (field is missing when the body itself is wrong or has no setting).
export function validateSettings(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const settings = {};
  for (const [field, { ok, error }] of Object.entries(FIELDS)) {
    if (!Object.hasOwn(body, field)) continue;
    if (!ok(body[field])) return { error, field };
    settings[field] = body[field];
  }
  if (Object.keys(settings).length === 0) return { error: 'Body has no settings' };
  return { settings };
}

// The stored settings, all of them; a missing or unusable value is the default.
export function readSettings(db) {
  const settings = { ...DEFAULT_SETTINGS };
  for (const field of Object.keys(FIELDS)) {
    const text = db.getSetting(field);
    if (text === null || text === '') continue; // never set, or set to none
    const value = Number(text);
    if (FIELDS[field].ok(value)) settings[field] = value;
  }
  return settings;
}

// Stores valid settings (see validateSettings); a setting not given is kept. None is stored as an empty text.
export function writeSettings(db, settings) {
  for (const field of Object.keys(FIELDS)) {
    if (Object.hasOwn(settings, field)) db.setSetting(field, settings[field] === null ? '' : String(settings[field]));
  }
}
