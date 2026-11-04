// The Calendar page's pure parts (spec 2026-11-03-calendar-design.md 5): the month grid, a day's marks in the grid, the day
// list's groups and lines, the address. The days come from GET /api/calendar (server/calendar.js works out future days).

import { STAGES } from './crops.js';
import { SLOT_LABELS, closedLine } from './tasks-math.js';
import { taskPicture } from './pictures-data.js';
import { DOT } from './text-math.js';

export { calendarHash, parseCalendarQuery } from './route.js';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEK_HEAD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const SLOTS = ['morning', 'afternoon', 'any'];
// The harvest checks: one basket in a day's marks, whichever of them it is.
const HARVEST = new Set(['harvestAm', 'harvestPm', 'harvestDaily', 'reishiRim']);
const MAX_MARKS = 3;

const utc = (date) => Date.parse(`${date}T00:00:00Z`);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export const monthOf = (date) => date.slice(0, 7);
export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const k = y * 12 + (m - 1) + n;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
}
export function monthTitle(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// Six weeks, Monday first, from the Monday on or before the 1st: [{ date, inMonth }] × 42.
export function monthGrid(month) {
  const first = utc(`${month}-01`);
  const start = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: 42 }, (_, i) => {
    const date = iso(start + i * DAY_MS);
    return { date, inMonth: monthOf(date) === month };
  });
}
export function monthRange(month) {
  const g = monthGrid(month);
  return { from: g[0].date, to: g.at(-1).date };
}

// A day's marks in the grid (finish review 2026-11-03: a basket per room made every fruiting day look alike): { marks: up to 3
// of { kind: 'bag', key: crop, stage } (a stage starting, 'done' for the last rest), then { kind: 'task', key } (upkeep and
// stage tasks, each once), then one harvest basket { kind: 'task', key: 'harvestAm', crop } (the crop when every harvesting
// room grows the same, else null); more: the marks left out; count: the tasks (not the routine, not a stage start); missed:
// a task missed that day; overdue: upkeep overdue (today) }. cropOf(roomId): the room's main crop.
export function dayMarks(items, cropOf) {
  const all = [];
  const seen = new Set();
  const add = (mark) => {
    const id = JSON.stringify(mark);
    if (!seen.has(id)) { seen.add(id); all.push(mark); }
  };
  for (const i of items) if (i.kind === 'stage') add({ kind: 'bag', key: cropOf(i.roomId), stage: i.stage.done ? 'done' : i.stage.stage });
  for (const i of items) {
    if (i.kind === 'stage' || i.routine || HARVEST.has(i.ruleKey)) continue;
    add({ kind: 'task', key: taskPicture(i) });
  }
  const harvestCrops = [...new Set(items.filter((i) => HARVEST.has(i.ruleKey)).map((i) => cropOf(i.roomId)))];
  if (harvestCrops.length) add({ kind: 'task', key: 'harvestAm', crop: harvestCrops.length === 1 ? harvestCrops[0] : null });
  return {
    marks: all.slice(0, MAX_MARKS), more: Math.max(0, all.length - MAX_MARKS),
    count: items.filter((i) => !i.routine && i.kind !== 'stage').length,
    missed: items.some((i) => i.status === 'missed'),
    overdue: items.some((i) => i.status === 'open' && i.overdueDays > 0),
  };
}

// The day list of `date`: each room with items that day, in the reply's order: { room, stages, slots: [{ slot, label, rows }],
// upkeep, longterm (closed that day), routine, about: its dates are estimated from the stage plan }.
export function dayGroups(view, date) {
  const items = view.days.find((d) => d.date === date)?.items ?? [];
  return view.rooms.map((room) => {
    const mine = items.filter((i) => i.roomId === room.id);
    const daily = mine.filter((i) => i.kind === 'daily' && !i.routine);
    return {
      room,
      count: mine.length,
      stages: mine.filter((i) => i.kind === 'stage'),
      slots: SLOTS.map((slot) => ({ slot, label: SLOT_LABELS[slot], rows: daily.filter((i) => (SLOTS.includes(i.slot) ? i.slot : 'any') === slot) }))
        .filter((s) => s.rows.length > 0),
      upkeep: mine.filter((i) => i.kind === 'upkeep'),
      longterm: mine.filter((i) => i.kind === 'longterm'),
      routine: mine.filter((i) => i.kind === 'daily' && i.routine),
      about: mine.some((i) => i.status === 'planned' && i.about), // said once under the room (finish review 2026-11-03)
    };
  }).filter((g) => g.count > 0);
}

// The line under an item: a closed row as the Log says it, an open upkeep's overdue days, or '' (an estimate is said once per
// room: dayGroups' about).
export function itemLine(i) {
  if (i.status === 'missed' || ['done', 'skipped', 'cancelled'].includes(i.status)) return closedLine(i);
  if (i.status === 'open' && i.overdueDays > 0) return `overdue ${i.overdueDays} ${i.overdueDays === 1 ? 'day' : 'days'}`;
  if (i.status === 'planned' && i.until) return `Until the stage changes, about ${i.until}`; // the change day's old stage
  if (i.status === 'planned' && i.from) return `From the stage change, about ${i.from}`;
  return '';
}

// A stage starting: "Rest between flushes starts · flush 1", the last rest "… · flush 4, the last", "Pinning starts".
export function stageText(s) {
  const flush = s.stage === 'fruiting' || s.stage === 'rest' ? `${DOT}flush ${s.flush}${s.done ? ', the last' : ''}` : '';
  return `${STAGES[s.stage] ?? s.stage} starts${flush}`;
}

export function dayTitle(date, today) {
  const d = new Date(utc(date));
  const words = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return date === today ? `Today, ${words}` : words;
}

// A day button's name: "Wednesday 4 November: 3 tasks, Container Alpha: Rest between flushes starts · flush 1", "…: 1 task, a
// task missed", "…: nothing". starts: the day's stage starts in words, room first.
export function dayLabel(date, today, { count, missed, overdue = false }, starts = []) {
  const n = count === 0 && starts.length === 0 ? 'nothing' : count === 0 ? '' : `${count} ${count === 1 ? 'task' : 'tasks'}`;
  return `${dayTitle(date, today)}: ${[n, ...starts, missed ? 'a task missed' : '', overdue ? 'a task overdue' : ''].filter(Boolean).join(', ')}`;
}
