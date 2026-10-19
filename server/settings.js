// Farm-wide settings: validation and the stored values. No HTTP.

export const DEFAULT_SETTINGS = { pollSeconds: 5 };

const POLL_ERROR = 'Reading interval must be a whole number from 1 to 300 seconds';

// Returns { settings: { pollSeconds } } when the input is valid, otherwise { error, field }
// (field is missing when the body itself is wrong).
export function validateSettings(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const { pollSeconds } = body;
  if (!Number.isInteger(pollSeconds) || pollSeconds < 1 || pollSeconds > 300) {
    return { error: POLL_ERROR, field: 'pollSeconds' };
  }
  return { settings: { pollSeconds } };
}

// The stored settings; a missing or unusable value is the default.
export function readSettings(db) {
  const stored = Number(db.getSetting('pollSeconds'));
  const valid = validateSettings({ pollSeconds: stored }).settings;
  return valid ?? { ...DEFAULT_SETTINGS };
}

// Stores valid settings (see validateSettings).
export function writeSettings(db, { pollSeconds }) {
  db.setSetting('pollSeconds', String(pollSeconds));
}
