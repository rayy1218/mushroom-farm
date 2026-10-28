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

// ---- Phone alarms (spec 2026-10-26-live-alarms-outdoor-design.md section 5) ----
export const TELEGRAM_LEVELS = ['critical', 'serious', 'warning'];
export const TELEGRAM_DEFAULTS = { telegramToken: '', telegramChatId: '', telegramLevels: ['critical', 'serious'], telegramCleared: true, telegramRepeatMin: 30 };
// What GET /api/settings adds for a farm that never set them up (the token is never shown).
export const TELEGRAM_VIEW_DEFAULT = {
  telegramTokenSet: false, telegramTokenEnd: null, telegramChatId: '', telegramLevels: ['critical', 'serious'],
  telegramCleared: true, telegramRepeatMin: 30, telegramLastSentAt: null, telegramLastError: null,
};

const TOKEN_ERROR = 'Bot token must look like 123456:ABC-def, as BotFather gave it, or be empty to clear it';
const CHAT_ERROR = 'Chat id must be a number (a group id starts with -) or @name, up to 64 characters, or empty';
const BOT_NAME_ERROR = "Chat id is a bot's name (it ends in bot), not a chat: messages to it go nowhere. Enter the chat's number id, a group's negative id or a channel's @name";
const LEVELS_ERROR = 'Levels must be any of critical, serious and warning';
const CLEARED_ERROR = 'Cleared messages must be on or off';
const REPEAT_ERROR = 'Repeat must be a whole number of minutes from 0 (off) to 1440';

const TELEGRAM_FIELDS = {
  telegramToken: { ok: (v) => typeof v === 'string' && (v === '' || (v.length <= 200 && /^[0-9]{3,20}:[A-Za-z0-9_-]{10,100}$/.test(v))), error: TOKEN_ERROR },
  telegramChatId: { ok: (v) => typeof v === 'string' && (v === '' || (v.length <= 64 && /^(-?[0-9]{1,20}|@[A-Za-z0-9_]{1,63})$/.test(v))), error: CHAT_ERROR },
  telegramLevels: { ok: (v) => Array.isArray(v) && new Set(v).size === v.length && v.every((l) => TELEGRAM_LEVELS.includes(l)), error: LEVELS_ERROR },
  telegramCleared: { ok: (v) => typeof v === 'boolean', error: CLEARED_ERROR },
  telegramRepeatMin: { ok: (v) => Number.isInteger(v) && v >= 0 && v <= 1440, error: REPEAT_ERROR },
};

// The stored phone-alarm settings including the token (for the sender only, never for the page).
export function readTelegram(db) {
  const out = { ...TELEGRAM_DEFAULTS };
  for (const [field, { ok }] of Object.entries(TELEGRAM_FIELDS)) {
    const text = db.getSetting(field);
    if (text === null || text === undefined) continue;
    let value = text;
    if (field === 'telegramLevels') { try { value = JSON.parse(text); } catch { continue; } }
    else if (field === 'telegramCleared') value = text === '1';
    else if (field === 'telegramRepeatMin') value = Number(text);
    if (ok(value)) out[field] = value;
  }
  return out;
}

// readSettings plus the phone-alarm view: the token only as set / its last 4 characters; status = { lastSentAt, lastError }.
export function settingsView(db, status = {}) {
  const t = readTelegram(db);
  const { telegramToken, ...rest } = t;
  return {
    ...readSettings(db), telegramTokenSet: telegramToken !== '', telegramTokenEnd: telegramToken === '' ? null : telegramToken.slice(-4),
    ...rest, telegramLastSentAt: status.lastSentAt ?? null, telegramLastError: status.lastError ?? null,
  };
}

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
  for (const [field, { ok, error }] of Object.entries(TELEGRAM_FIELDS)) {
    if (!Object.hasOwn(body, field)) continue;
    if (!ok(body[field])) return { error, field };
    settings[field] = body[field];
  }
  // Refused when saved, still read back when stored before this check (Settings and the Overview then say it is wrong).
  if (/^@\w*bot$/i.test(settings.telegramChatId ?? '')) return { error: BOT_NAME_ERROR, field: 'telegramChatId' };
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
  for (const field of Object.keys(TELEGRAM_FIELDS)) {
    if (!Object.hasOwn(settings, field)) continue;
    const v = settings[field];
    db.setSetting(field, field === 'telegramLevels' ? JSON.stringify(v) : field === 'telegramCleared' ? (v ? '1' : '0') : String(v));
  }
}
