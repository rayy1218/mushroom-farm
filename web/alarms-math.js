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

// "Raised 10:42", "Raised 10:42 · Acknowledged" while acknowledged and active (a word, not the dimming alone) and, once
// cleared, "Raised 10:42 · Cleared 10:50".
export function timesLine(a, now = Date.now()) {
  const raised = `Raised ${alarmTime(a.raisedAt, now)}`;
  if (isDimmed(a)) return `${raised} · Acknowledged`;
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

// How many alarms of the list still need an acknowledgement.
export const unackedCount = (alarms) => alarms.filter((a) => a.ackedAt == null).length;

// The accessible name of an Acknowledge button.
export function ackLabel(a) {
  return `Acknowledge ${levelLabel(a.level).toLowerCase()} alarm: ${a.text}`;
}
