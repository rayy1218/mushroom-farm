// Pure helpers for the alarms (no DOM, so they can be tested in Node): the Alarms card of the room page and the
// alarm chip of the Rooms list (spec 2026-10-19-safety-and-history-design.md section 6).

export const LEVELS = {
  critical: { rank: 3, label: 'Critical' },
  serious: { rank: 2, label: 'Serious' },
  warning: { rank: 1, label: 'Warning' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function levelLabel(level) {
  return LEVELS[level]?.label ?? String(level);
}

// The alarm is raised and has not cleared.
export const isActive = (a) => a.clearedAt == null;

// An active alarm that was acknowledged stays shown, dimmed, until it clears.
export const isDimmed = (a) => isActive(a) && a.ackedAt != null;

// The highest level among the alarms, or null for none.
export function highestLevel(alarms) {
  let best = null;
  for (const a of alarms) {
    if (LEVELS[a.level] && (best === null || LEVELS[a.level].rank > LEVELS[best].rank)) best = a.level;
  }
  return best;
}

// Active alarms per room from the list of GET /api/alarms: Map roomId → { count, level }.
export function activeCounts(alarms) {
  const byRoom = new Map();
  for (const a of alarms ?? []) {
    if (!isActive(a)) continue;
    const entry = byRoom.get(a.roomId) ?? { count: 0, level: null };
    entry.count++;
    entry.level = highestLevel([{ level: entry.level }, a]);
    byRoom.set(a.roomId, entry);
  }
  return byRoom;
}

// "1 alarm", "3 alarms".
export function chipText(count) {
  return `${count} ${count === 1 ? 'alarm' : 'alarms'}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// "10:42" today, "12 Oct 10:42" on another day (local time); now is injectable.
export function alarmTime(ms, now = Date.now()) {
  const d = new Date(ms);
  const n = new Date(now);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const today = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return today ? hm : `${d.getDate()} ${MONTHS[d.getMonth()]} ${hm}`;
}

// "Acknowledged by Ray" (database 27 keeps the name), or "Acknowledged" for one from before.
export const ackedWords = (a) => (a.ackedBy ? `Acknowledged by ${a.ackedBy}` : 'Acknowledged');

// "Raised 10:42", "Raised 10:42 · Acknowledged by Ray" while acknowledged and active (a word, not the dimming alone) and, once
// cleared, "Raised 10:42 · Cleared 10:50" ("· Acknowledged by Ray" after it when the name is known).
export function timesLine(a, now = Date.now()) {
  const raised = `Raised ${alarmTime(a.raisedAt, now)}`;
  if (isDimmed(a)) return `${raised} · ${ackedWords(a)}`;
  // History: who acknowledged a cleared one, when the database kept the name (27)
  if (a.clearedAt != null && a.ackedBy) return `${raised} · Cleared ${alarmTime(a.clearedAt, now)} · ${ackedWords(a)}`;
  return a.clearedAt == null ? raised : `${raised} · Cleared ${alarmTime(a.clearedAt, now)}`;
}

// The reading each alarm is about, and how it is written (the room page's formats).
const READING_OF = {
  tHigh: 't', tLow: 't', rhLow: 'rh', rhHigh: 'rh', humidifierTooSmall: 'rh', co2High: 'co2', co2Safety: 'co2', filterDirty: 'pa', filterMissing: 'pa',
};
const FORMAT = {
  t: (v) => `${v.toFixed(1)} °C`,
  rh: (v) => `${v.toFixed(1)} % RH`,
  co2: (v) => `${Math.round(v).toLocaleString('en-US')} ppm`,
  pa: (v) => `${v.toFixed(1)} Pa`,
};

// The value now beside an active alarm's text (the text keeps the value that raised it): "now 84.0 % RH", or '' for a
// cleared alarm, one not about a reading, or no reading now. readings: { t, rh, co2, pa }, null where not known.
export function nowText(a, readings) {
  const key = READING_OF[a.key];
  const v = readings?.[key];
  if (!key || !isActive(a) || typeof v !== 'number' || !Number.isFinite(v)) return '';
  return `now ${FORMAT[key](v)}`;
}

// The Alarms card's tone from its worst active alarm: 'warning' (amber), 'critical' (red, for serious and critical) or 'none'.
export function cardTone(alarms) {
  const level = highestLevel((alarms ?? []).filter(isActive));
  return level === null ? 'none' : level === 'warning' ? 'warning' : 'critical';
}

// The live line for a screen reader: the active alarms not among the ids of the last paint ("New alarm: Warning, …"), or ''.
// seen: the ids painted before (null on the first paint, which announces nothing).
export function newAlarmText(seen, alarms) {
  if (!seen) return '';
  const fresh = (alarms ?? []).filter((a) => isActive(a) && !seen.has(a.id));
  if (!fresh.length) return '';
  return `${fresh.length === 1 ? 'New alarm' : 'New alarms'}: ${fresh.map((a) => `${levelLabel(a.level)}, ${a.text}`).join('; ')}`;
}

// The live line for an alarm that went up a tier since the last paint (the same id: newAlarmText does not see it), or ''.
// levels: id → the level painted last.
export function tierText(levels, alarms) {
  const up = (alarms ?? []).filter((a) => isActive(a) && levels?.has(a.id) && (LEVELS[a.level]?.rank ?? 0) > (LEVELS[levels.get(a.id)]?.rank ?? 0));
  return up.length ? `Now ${up.map((a) => `${levelLabel(a.level)}, ${a.text}`).join('; ')}` : '';
}

// How many alarms of the list still need an acknowledgement.
export const unackedCount = (alarms) => alarms.filter((a) => a.ackedAt == null).length;

// The accessible name of an Acknowledge button.
export function ackLabel(a) {
  return `Acknowledge ${levelLabel(a.level).toLowerCase()} alarm: ${a.text}`;
}

// ---- Alarms triage (spec 2026-11-12-alarms-triage-design.md 5, 6) ----

// The current alarms as { active, cleared } (each in the order given: the server's, active first).
export function splitAlarms(alarms) {
  const list = alarms ?? [];
  return { active: list.filter(isActive), cleared: list.filter((a) => !isActive(a)) };
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const after = (text) => { const i = text.indexOf(': '); return i < 0 ? text : text.slice(i + 2); };
const SENSOR_KEYS = ['sensorTrh', 'sensorCo2'];
// A device that did not answer (a relay module, an aircon gateway, a sensor with no reading, a gateway): one cause per room, as
// one outage (UI check 2026-11-12: a room's outage had been three rows, relay, aircon and sensors).
const silent = (a) => a.key === 'gateway' || a.key === 'relayNoAnswer'
  || (a.key.startsWith('machine.') && after(a.text).startsWith('no answer'))
  || (SENSOR_KEYS.includes(a.key) && after(a.text) === 'no reading');
// The cause of an alarm, for grouping: { family, detail }. Devices that did not answer group as one; other machine and sensor
// faults by what went wrong; the rest by key.
function causeOf(a) {
  if (silent(a)) return { family: 'silent', detail: '' };
  if (a.key.startsWith('machine.')) return { family: 'machine', detail: after(a.text) };
  if (SENSOR_KEYS.includes(a.key)) return { family: 'sensor', detail: after(a.text) };
  return { family: a.key, detail: '' };
}
const nOf = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// "No answer (6 machines, 2 sensors)": what a group of silent devices held.
function silentText(alarms) {
  const machines = alarms.filter((a) => a.key.startsWith('machine.')).length;
  const sensors = alarms.filter((a) => SENSOR_KEYS.includes(a.key)).length;
  const parts = [machines ? nOf(machines, 'machine', 'machines') : null, sensors ? nOf(sensors, 'sensor', 'sensors') : null].filter(Boolean);
  const gateway = alarms.some((a) => a.key === 'gateway');
  return `${gateway ? 'Gateway not answering' : 'No answer'}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

// The cleared alarms of one room and one cause as one row each, newest clear first: [{ key, roomId, roomName, ids, unacked,
// text, lastCleared }]. text: "No answer (6 machines, 2 sensors)" for devices that did not answer, "Not running (switch on, no
// current) (2 machines)", "Sensor fault: jump (2 sensors)", the newest text with "(2 times)", or the alarm's own text alone.
export function causeGroups(cleared) {
  const groups = new Map();
  for (const a of cleared ?? []) {
    const { family, detail } = causeOf(a);
    const key = `${a.roomId}|${family}|${detail}`;
    if (!groups.has(key)) groups.set(key, { key, roomId: a.roomId, roomName: a.roomName, family, detail, alarms: [] });
    groups.get(key).alarms.push(a);
  }
  return [...groups.values()].map((g) => {
    const newest = g.alarms.reduce((x, y) => (y.clearedAt > x.clearedAt ? y : x));
    const n = g.alarms.length;
    const text = n === 1 ? newest.text
      : g.family === 'silent' ? silentText(g.alarms)
      : g.family === 'machine' ? `${capital(g.detail)} (${n} machines)`
        : g.family === 'sensor' ? `Sensor fault: ${g.detail} (${n} sensors)`
          : `${newest.text} (${n} times)`;
    return { key: g.key, roomId: g.roomId, roomName: g.roomName, ids: g.alarms.map((a) => a.id), unacked: unackedCount(g.alarms), text, lastCleared: newest.clearedAt };
  }).sort((x, y) => y.lastCleared - x.lastCleared);
}

// "8 cleared to review": the fold's line.
export const foldText = (n) => `${n} cleared to review`;

// The room page's line off the Now tab: "1 active alarm · 7 cleared to review · Open on Now" (the parts that are not 0; with no
// active one "7 cleared alarms to review", so the line says what it is about), or null.
export function stripText({ active, cleared }) {
  if (!active && !cleared) return null;
  const parts = active ? [`${active} active ${active === 1 ? 'alarm' : 'alarms'}`, cleared ? foldText(cleared) : null]
    : [`${cleared} cleared ${cleared === 1 ? 'alarm' : 'alarms'} to review`];
  return [...parts.filter(Boolean), 'Open on Now'].join(' · ');
}

const roomHeld = (h) => [...h.machines, ...h.sensors].join(', ');

// What a gateway or relay module alarm holds (its `held`), by name in one line (the alarm's text has the counts); '' for none.
// Several rooms: each room's, by its name.
export function heldText(held) {
  if (!held?.length) return '';
  if (held.length === 1) return `Waiting on it: ${roomHeld(held[0])}`;
  return `Waiting on it: ${held.map((h) => `${h.roomName}: ${roomHeld(h)}`).join(' · ')}`;
}
