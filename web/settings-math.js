// Pure helpers for the Settings page and the room page refresh (no DOM, so they can be tested in Node).

import { CROPS } from './crops.js';

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
const EVERY_MESSAGE = 'Interval must be a whole number from 1 to 365 days';
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

// ---- Harvest: the Yield card (spec 2026-11-04-harvest-design.md section 5) ----

export const YIELD_DRY = [0.05, 20];
export const YIELD_PRICE = [0, 1000];
export const YIELD_NOTE = "Biological efficiency is fresh kg over the dry substrate's kg. A 2.27 kg block at 60 % water holds about 0.9 kg dry. A change here changes the figures of past runs too. The prices you get are recorded in Sales.";

const YIELD_NUMBER = /^[0-9]+(\.[0-9]+)?$/;

// The rows of the card ([{ crop, dryKg: text, priceKg: text }]) → { cropYield } (empty text is null, a crop with both empty is left
// out), or { error, field } for the first bad input; field is 'dryKg:<crop>' or 'priceKg:<crop>'.
export function yieldBody(rows) {
  const cropYield = {};
  for (const { crop, dryKg, priceKg } of rows) {
    const one = (text, [min, max], field, what, unit) => {
      const s = String(text ?? '').trim();
      if (s === '') return { value: null };
      const n = YIELD_NUMBER.test(s) ? Number(s) : NaN;
      if (n >= min && n <= max) return { value: n };
      return { field: `${field}:${crop}`, error: `${CROPS[crop]?.name ?? crop}: ${what} must be ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')} ${unit}, or empty` };
    };
    const dry = one(dryKg, YIELD_DRY, 'dryKg', 'dry substrate', 'kg');
    if (dry.error) return dry;
    const price = one(priceKg, YIELD_PRICE, 'priceKg', 'price', 'RM per kg');
    if (price.error) return price;
    if (dry.value !== null || price.value !== null) cropYield[crop] = { dryKg: dry.value, priceKg: price.value };
  }
  return { cropYield };
}

// ---- Login ---- Settings → Workers' sign-in state (spec 2026-11-06-login-design.md 5)
const farmClock = (ms) => new Date(ms + 8 * 3_600_000).toISOString().slice(11, 16); // the farm's UTC+8, no summer time
// The daily cap's lock lasts until the owner's Unlock: stored as server/auth.js LOCKED_UNTIL_UNLOCKED (far in the future).
// The stored lock is that one only (the 15-minute locks are per address, in the server's memory: lockedHereUntil); a lock
// more than a year ahead is never repainted for.
const UNTIL_UNLOCKED_FROM_MS = 366 * 86_400_000;
const live = (until, now) => until != null && until > now;

// "Worker · signed in on 2 devices", "Owner · no password yet: cannot sign in", "Worker · locked: unlock to let them sign
// in" (the daily cap), "Worker · locked on one device until 12:18" (an address's wrong tries; the latest such lock).
export function accountLine(a, now) {
  const role = a.role === 'owner' ? 'Owner' : 'Worker';
  if (!a.hasSecret) return `${role} · no ${a.role === 'owner' ? 'password' : 'PIN'} yet: cannot sign in`;
  if (live(a.lockedUntil, now)) return `${role} · locked: unlock to let them sign in`;
  if (live(a.lockedHereUntil, now)) return `${role} · locked on one device until ${farmClock(a.lockedHereUntil)}`;
  if (a.sessions > 0) return `${role} · signed in on ${a.sessions} ${a.sessions === 1 ? 'device' : 'devices'}`;
  return role;
}

// When the Workers card repaints: the earliest end of a lock it shows (not the daily cap's), or null. list: the accounts.
export function nextLockEnd(list, now) {
  const ends = (list ?? []).flatMap((a) => [a.lockedUntil, a.lockedHereUntil]).filter((t) => live(t, now) && t - now <= UNTIL_UNLOCKED_FROM_MS);
  return ends.length ? Math.min(...ends) : null;
}

// The row's button for the secret and its dialog's box.
export function secretAction(a) {
  return a.role === 'owner'
    ? { label: a.hasSecret ? 'Change password' : 'Set password', field: 'Password (14 characters or more)', kind: 'password' }
    : { label: a.hasSecret ? 'Change PIN' : 'Set PIN', field: 'PIN (6 digits)', kind: 'pin' };
}

// Another owner who can sign in (active, a password set): only then may the one signed in make themselves a worker (the
// server refuses the last one: "The farm needs an owner"). list: GET /api/workers/accounts' accounts.
export const otherOwnerCanSignIn = (list, id) => list.some((a) => a.id !== id && a.role === 'owner' && a.active && a.hasSecret);

// Which of a row's sign-in buttons show. self: the row is the one signed in (their password is the Your password card, and
// another owner removes them); otherOwner: otherOwnerCanSignIn. → { secret: secretAction or null, role: { to, label } or null,
// unlock: while locked, signOut: while signed in somewhere, remove }.
export function accountActions(a, { self, otherOwner, now }) {
  return {
    secret: self ? null : secretAction(a),
    role: a.role === 'worker' ? { to: 'owner', label: 'Make owner' } : !self || otherOwner ? { to: 'worker', label: 'Make worker' } : null,
    unlock: live(a.lockedUntil, now) || live(a.lockedHereUntil, now),
    signOut: a.sessions > 0,
    remove: !self,
  };
}

// The confirms' words → { title, text, go }. Your own role or sign-out ends this page's session: it goes to the sign-in view.
export function roleConfirm(name, role, self) {
  if (role === 'owner') {
    return { title: `Make ${name} an owner`, text: `${name} becomes an owner: they see the money and Settings, and need a password to sign in.`, go: 'Make owner' };
  }
  return self
    ? { title: 'Make yourself a worker', text: 'You become a worker and are signed out: another owner sets your PIN. This page goes to the sign-in view.', go: 'Make worker' }
    : { title: `Make ${name} a worker`, text: `${name} becomes a worker: they need a PIN to sign in.`, go: 'Make worker' };
}

// Only your own row asks (another's is signed out at once). → the words, or null.
export const signOutConfirm = (name, self) => (self
  ? { title: 'Sign out everywhere', text: 'You are signed out on every device, this one too. This page goes to the sign-in view.', go: 'Sign out' }
  : null);

// Removing an owner, or a worker with a PIN or signed in somewhere, asks first (the server clears a removed one's secret);
// a worker who cannot sign in goes at once. → the words (danger: the go button is the red one), or null.
export function removeConfirm(name, a) {
  if (a?.role === 'owner') return { title: `Remove ${name}`, text: `${name} is an owner: removing them signs them out everywhere.`, go: 'Remove', danger: true };
  if (a?.hasSecret || a?.sessions > 0) {
    return { title: `Remove ${name}?`, text: 'They can no longer sign in, and bringing them back needs a new PIN.', go: 'Remove', danger: true };
  }
  return null;
}

// The Workers card's line once a sign-in change is saved. what: unlock, sign-out, remove, role (role: the new one) or secret
// (role: the account's).
export function accountDone(name, what, role) {
  if (what === 'unlock') return `${name} is unlocked`;
  if (what === 'remove') return `${name} removed`;
  if (what === 'sign-out') return `${name} is signed out everywhere`;
  if (what === 'role') return role === 'owner' ? `${name} is an owner now: set their password` : `${name} is a worker now: set their PIN`;
  return `${name} signs in with ${role === 'owner' ? 'a password' : 'a PIN'} now`;
}

// PUT /api/workers' field of a refused name ("workers.2.name"); the list's own refusals ("workers": the farm needs an owner)
// are not a name's.
export const isNameField = (field) => /^workers\.\d+\.name$/.test(field ?? '');
