// The task rules (spec 2026-10-30-tasks-design.md section 3): the built-in daily stage rules and upkeep rules, the crop
// notes, the farm's local day, and which tasks a room wants on a day. Pure: no database, no clock.
//
// A daily rule is { key, kind: 'daily', text, families: string[] | null, stages: string[] | null, when, slot, amount: { unit, label } | null };
// when is 'daily', 'first' (day 1 of the stage), 'last' (the stage's last day by days[stage]) or { every: N, lastDays: M | null }
// (every N days within the stage's last M days, counted from day 1 of that window; lastDays null: the whole stage).
// An upkeep rule is { key, kind: 'upkeep', text, everyDays, needs } (needs: what the room must have, null for nothing).

const DAY_MS = 86_400_000;
// The farm's day is Asia/Kuala_Lumpur's: UTC+8 all year (Malaysia has had no daylight saving since 1982), so a fixed offset
// gives the same dates as the time zone, without depending on the host's TZ or its ICU data.
const OFFSET_MS = 8 * 3_600_000;

const midnightUtc = (date) => Date.parse(`${date}T00:00:00Z`);

// 'YYYY-MM-DD' of `ms` on the farm's clock.
export const localDate = (ms) => new Date(ms + OFFSET_MS).toISOString().slice(0, 10);

// 'HH:MM' of `ms` on the farm's clock.
export const localTime = (ms) => new Date(ms + OFFSET_MS).toISOString().slice(11, 16);

// The ms when the farm's day `date` starts.
export const dayStart = (date) => midnightUtc(date) - OFFSET_MS;

export const addDays = (date, n) => new Date(midnightUtc(date) + n * DAY_MS).toISOString().slice(0, 10);

// b − a in whole days.
export const daysBetween = (a, b) => Math.round((midnightUtc(b) - midnightUtc(a)) / DAY_MS);

// The day of the program's stage on `date` (day 1 = the farm's date of stageSince; not capped at the length) and the stage's
// length (days[stage]). Null without a start.
export function stageDayOn(program, date) {
  if (!Number.isFinite(program?.stageSince)) return null;
  return { day: daysBetween(localDate(program.stageSince), date) + 1, length: program.days?.[program.stage] ?? null };
}
