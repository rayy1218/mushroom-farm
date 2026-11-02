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

// ---- iteration 19: the Workers and Task rules cards (spec 2026-10-30-tasks-design.md 7.3; the texts are the server's) ----

export const WORKER_MAX = 40;
export const EVERY_MESSAGE = 'Interval must be a whole number from 1 to 365 days';
const RULE_TEXT_MAX = 120;
const RULE_SLOTS = ['morning', 'afternoon', 'any']; // must match SLOTS in tasks-math.js and server/task-rules.js
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

// A worker's name as typed → { value } or { error }. Taken: another active worker has it (in any case); a removed one's name
// may come back, by an add or a rename (workersAfter). selfId: the worker being renamed.
export function parseWorkerName(text, workers, selfId = null) {
  const s = String(text ?? '').trim();
  if (s === '') return { error: 'Type a name' };
  if (s.length > WORKER_MAX) return { error: `The name must be at most ${WORKER_MAX} characters` };
  if (/[\u0000-\u001f\u007f]/.test(s)) return { error: 'A name cannot hold control characters' };
  const taken = (workers ?? []).some((w) => w.active && w.id !== selfId && sameName(w.name, s));
  return taken ? { error: 'That name is taken' } : { value: s };
}

// The whole list for PUT /api/workers after one change: { add: name } (a removed worker of that name comes back),
// { rename: { id, name } } (a removed worker of the new name is left out: the server allows a name once, and the tasks it
// closed keep its name as text), { remove: id } (kept, inactive).
export function workersAfter(workers, change) {
  const list = workers ?? [];
  if (change.add !== undefined) {
    const old = list.find((w) => !w.active && sameName(w.name, change.add));
    return old ? list.map((w) => (w === old ? { ...w, name: change.add, active: true } : w)) : [...list, { name: change.add, active: true }];
  }
  if (change.rename) {
    const { id, name } = change.rename;
    return list.filter((w) => w.id === id || w.active || !sameName(w.name, name)).map((w) => (w.id === id ? { ...w, name } : w));
  }
  if (change.remove !== undefined) return list.map((w) => (w.id === change.remove ? { ...w, active: false } : w));
  return list;
}

// An upkeep rule's interval → { value } (whole days, 1 to 365) or { error }.
export function parseEveryDays(text) {
  const s = String(text ?? '').trim();
  if (!/^[0-9]{1,3}$/.test(s)) return { error: EVERY_MESSAGE };
  const n = Number(s);
  return n >= 1 && n <= 365 ? { value: n } : { error: EVERY_MESSAGE };
}

// The Add your own form → { value } for the custom list of PUT /api/task-rules, or { errors: { field: message } }. often:
// 'daily' (every day) or 'every' (every so many days from the last time done: an upkeep rule). rooms: null for every room,
// else a non-empty list, each room once.
export function parseCustomRule({ text, allRooms, rooms, often, everyDays, slot }) {
  const errors = {};
  const s = String(text ?? '').trim();
  if (s === '' || s.length > RULE_TEXT_MAX) errors.text = `Say what to do (1 to ${RULE_TEXT_MAX} characters)`;
  if (!allRooms && !(rooms?.length > 0)) errors.rooms = 'Pick at least one room';
  const every = often === 'every' ? parseEveryDays(everyDays) : { value: null };
  if (every.error) errors.everyDays = every.error;
  if (!RULE_SLOTS.includes(slot)) errors.slot = 'Pick a time of day';
  if (Object.keys(errors).length) return { errors };
  return { value: { text: s, rooms: allRooms ? null : [...new Set(rooms)], everyDays: every.value, slot, enabled: true } };
}

// The body of PUT /api/task-rules for the rules after one change (next) from the ones shown (shown): every built-in rule's
// on/off, an upkeep rule's interval only when this change set it (a rule left alone keeps what is stored, so one never
// changed follows its default), and the whole own list (a new rule without an id; none left out).
export function rulesBody(next, shown) {
  const was = new Map((shown?.builtin ?? []).map((b) => [b.key, b.everyDays]));
  return {
    builtin: next.builtin.map((b) => ({
      key: b.key, enabled: b.enabled, ...(b.kind === 'upkeep' && b.everyDays !== was.get(b.key) ? { everyDays: b.everyDays } : {}),
    })),
    custom: next.custom,
  };
}

// The own rules' list after one change: { add: rule } (no id yet), { edit: { id, rule } } (the same id; its On/Off kept),
// { remove: id } (the server cancels its open tasks).
export function customAfter(custom, change) {
  const list = custom ?? [];
  if (change.add) return [...list, change.add];
  if (change.edit) return list.map((c) => (c.id === change.edit.id ? { ...change.edit.rule, id: c.id, enabled: c.enabled } : c));
  if (change.remove !== undefined) return list.filter((c) => c.id !== change.remove);
  return list;
}

// The Add your own form's boxes for an own rule (Edit), or empty for a new one (null), as parseCustomRule reads them.
export function ruleForm(rule) {
  const rooms = Array.isArray(rule?.rooms) ? rule.rooms : null;
  const every = rule?.everyDays ?? null;
  return {
    text: rule?.text ?? '', allRooms: rooms === null, rooms: rooms ?? [], often: every === null ? 'daily' : 'every',
    everyDays: every === null ? '' : String(every), slot: rule?.slot ?? 'morning',
  };
}

// The id of the row after id in ids (where the cursor goes when that row goes), else null.
export function idAfter(ids, id) {
  const i = ids.indexOf(id);
  return i >= 0 && i + 1 < ids.length ? ids[i + 1] : null;
}
