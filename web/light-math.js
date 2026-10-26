// Lights on a schedule per stage (spec 2026-10-26-lighting-design.md 3 and 4): the daily window of a stage, whether it is on now
// and its texts. Pure; shared by the server (the rule, the simulation) and the pages.
//
// A program here is the crop program's { crops, stage, lightHours: { spawn, pinning, fruiting, rest }, lightStart: 'HH:MM' }.

import { STAGES } from './crops.js';

export const LIGHT_HOURS = { spawn: 0, pinning: 12, fruiting: 12, rest: 0 };
export const LIGHT_START = '07:00';
const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

// 'HH:MM', 00:00 to 23:59.
export const isClock = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const isLightHours = (h) => Number.isInteger(h) && h >= 0 && h <= 24;

// A typed time as 'HH:MM': "7:00" and "0700" become "07:00"; anything else is returned trimmed (for the check to refuse).
export function normaliseClock(text) {
  const s = String(text ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s) ?? /^(\d{2})(\d{2})$/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s;
}

const minutesOf = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
const pad = (n) => String(n).padStart(2, '0');
const clockOf = (min) => `${pad(Math.floor((((min % 1440) + 1440) % 1440) / 60))}:${pad(min % 60)}`;
const stageName = (stage) => (STAGES[stage] ?? stage).toLowerCase();

// The time h:m (h may pass 24) on the day of `ms`, `days` days on, by the farm's local clock: Date#setHours on that day's
// date, so a day with a clock change still starts the lights at the wall-clock time. The farm device's OS time zone must be
// the farm's (README).
export function localAt(ms, h, m, days = 0) {
  const d = new Date(ms);
  if (days) d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// The same on a simulation run's clock: its second 0 is midnight and every day has 24 h.
export const runAt = (ms, h, m, days = 0) => (Math.floor(ms / DAY_MS) + days) * DAY_MS + (h * 60 + m) * MIN_MS;

// "07:00–19:00" for a start and hours (the end may be after midnight).
export const lightSpan = (hours, start) => `${start}–${clockOf(minutesOf(start) + hours * 60)}`;

const hoursOf = (p) => p.lightHours?.[p.stage] ?? LIGHT_HOURS[p.stage] ?? 0;
const startOf = (p) => (isClock(p.lightStart) ? p.lightStart : LIGHT_START);

const noCrop = (p) => !p || !Array.isArray(p.crops) || p.crops.length === 0;

// Whether the lights are on at `now` and why (the reason text of the automatic rule). clockAt(ms, h, m, days): the time h:m on
// the day of ms (default the farm's local clock, localAt). → { on, reason }
export function lightsNow(p, now, clockAt = localAt) {
  if (noCrop(p)) return { on: false, reason: 'Lights off: no crop set' };
  if (p.done) return { on: false, reason: 'Lights off: crop finished' };
  const hours = hoursOf(p);
  const name = stageName(p.stage);
  if (hours <= 0) return { on: false, reason: `Lights off: none in the ${name}` };
  if (hours >= 24) return { on: true, reason: `Lights on all day for ${name} (24 h)` };
  // Today's window, or yesterday's when it runs past midnight; each end on the wall clock.
  const h = Number(startOf(p).slice(0, 2)), m = Number(startOf(p).slice(3));
  const on = [0, -1].some((days) => now >= clockAt(now, h, m, days) && now < clockAt(now, h + hours, m, days));
  const span = lightSpan(hours, startOf(p));
  return on ? { on, reason: `Lights on: ${span} for ${name} (${hours} h)` } : { on, reason: `Lights off: on ${span} for ${name}` };
}

// The Targets table's Light row of a stage: "12 h a day from 07:00", "All day" or "Off".
export function lightRow(hours, start) {
  if (!(hours > 0)) return 'Off';
  if (hours >= 24) return 'All day';
  return `${hours} h a day from ${start}`;
}

// The Climate tab's line for today: "On 07:00–19:00 (12 h) for fruiting", "Off all day in the spawn run", "Off: no crop set".
export function lightSummary(p) {
  if (noCrop(p)) return 'Off: no crop set';
  if (p.done) return 'Off: crop finished';
  const hours = hoursOf(p);
  const name = stageName(p.stage);
  if (hours <= 0) return `Off all day in the ${name}`;
  if (hours >= 24) return `On all day (24 h) for ${name}`;
  return `On ${lightSpan(hours, startOf(p))} (${hours} h) for ${name}`;
}

// The Room card tile's line: "07:00–19:00", "All day", "Off in this stage" or "No crop set".
export function lightShort(p) {
  if (noCrop(p)) return 'No crop set';
  if (p.done) return 'Crop finished';
  const hours = hoursOf(p);
  if (hours <= 0) return 'Off in this stage';
  if (hours >= 24) return 'All day';
  return lightSpan(hours, startOf(p));
}
