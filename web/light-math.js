// Lights on a schedule per stage (spec 2026-10-26-lighting-design.md 3 and 4): the daily window of a stage, whether it is on now
// and its texts. Pure; shared by the server (the rule, the simulation) and the pages.
//
// A program here is the crop program's { crops, stage, lightHours: { spawn, pinning, fruiting, rest }, lightStart: 'HH:MM' }.

import { STAGES } from './crops.js';

export const LIGHT_HOURS = { spawn: 0, pinning: 12, fruiting: 12, rest: 0 };
export const LIGHT_START = '07:00';
const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// 'HH:MM', 00:00 to 23:59.
export const isClock = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const isLightHours = (h) => Number.isInteger(h) && h >= 0 && h <= 24;

const minutesOf = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
const pad = (n) => String(n).padStart(2, '0');
const clockOf = (min) => `${pad(Math.floor((((min % 1440) + 1440) % 1440) / 60))}:${pad(min % 60)}`;
const stageName = (stage) => (STAGES[stage] ?? stage).toLowerCase();

// The local midnight at or before a time (the farm's clock).
export function localStartOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// A day that starts at 0 (the simulation runs' clock: their second 0 is midnight).
export const runStartOfDay = (ms) => Math.floor(ms / DAY_MS) * DAY_MS;

// "07:00–19:00" for a start and hours (the end may be after midnight).
export const lightSpan = (hours, start) => `${start}–${clockOf(minutesOf(start) + hours * 60)}`;

const hoursOf = (p) => p.lightHours?.[p.stage] ?? LIGHT_HOURS[p.stage] ?? 0;
const startOf = (p) => (isClock(p.lightStart) ? p.lightStart : LIGHT_START);

// Whether the lights are on at `now` and why (the reason text of the automatic rule). startOfDay: the day's start of a time
// (default the local midnight). → { on, reason }
export function lightsNow(p, now, startOfDay = localStartOfDay) {
  if (!p || !Array.isArray(p.crops) || p.crops.length === 0) return { on: false, reason: 'Lights off: no crop set' };
  const hours = hoursOf(p);
  const name = stageName(p.stage);
  if (hours <= 0) return { on: false, reason: `Lights off: none in the ${name}` };
  if (hours >= 24) return { on: true, reason: `Lights on all day for ${name} (24 h)` };
  // Today's window, or yesterday's when it runs past midnight.
  const from = startOfDay(now) + minutesOf(startOf(p)) * MIN_MS;
  const on = [from, from - DAY_MS].some((f) => now >= f && now < f + hours * HOUR_MS);
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
  if (!p || !Array.isArray(p.crops) || p.crops.length === 0) return 'Off: no crop set';
  const hours = hoursOf(p);
  const name = stageName(p.stage);
  if (hours <= 0) return `Off all day in the ${name}`;
  if (hours >= 24) return `On all day (24 h) for ${name}`;
  return `On ${lightSpan(hours, startOf(p))} (${hours} h) for ${name}`;
}

// The Room card tile's line: "07:00–19:00", "All day", "Off in this stage" or "No crop set".
export function lightShort(p) {
  if (!p || !Array.isArray(p.crops) || p.crops.length === 0) return 'No crop set';
  const hours = hoursOf(p);
  if (hours <= 0) return 'Off in this stage';
  if (hours >= 24) return 'All day';
  return lightSpan(hours, startOf(p));
}
