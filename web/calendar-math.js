// The Calendar page's pure parts (spec 2026-11-03-calendar-design.md 5): the month grid, a day's marks in the grid, the day
// list's groups and lines, the address. The days come from GET /api/calendar (server/calendar.js works out future days).

import { STAGES } from './crops.js';
import { SLOT_LABELS, closedLine } from './tasks-math.js';
import { taskPicture } from './pictures-data.js';
import { DOT } from './text-math.js';

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
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && iso(utc(s)) === s;

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

// A day's marks in the grid: { marks: up to 3 of { kind: 'bag', key: crop, stage } (a stage starting, 'done' for the last
// rest) and { kind: 'task', key, crop } (a harvest's basket, then upkeep and stage tasks, each once), more: the marks left
// out, count: the items but the routine, missed: a task missed that day }. cropOf(roomId): the room's main crop.
export function dayMarks(items, cropOf) {
  const all = [];
  const seen = new Set();
  const add = (mark) => {
    const id = JSON.stringify(mark);
    if (!seen.has(id)) { seen.add(id); all.push(mark); }
  };
  for (const i of items) if (i.kind === 'stage') add({ kind: 'bag', key: cropOf(i.roomId), stage: i.stage.done ? 'done' : i.stage.stage });
  for (const i of items) if (HARVEST.has(i.ruleKey)) add({ kind: 'task', key: 'harvestAm', crop: cropOf(i.roomId) });
  for (const i of items) {
    if (i.kind === 'stage' || i.routine || HARVEST.has(i.ruleKey)) continue;
    add({ kind: 'task', key: taskPicture(i) });
  }
  return {
    marks: all.slice(0, MAX_MARKS), more: Math.max(0, all.length - MAX_MARKS),
    count: items.filter((i) => !i.routine).length, missed: items.some((i) => i.status === 'missed'),
  };
}

// The day list of `date`: each room with items that day, in the reply's order: { room, stages, slots: [{ slot, label, rows }],
// upkeep (upkeep and long-term rows), routine }.
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
      upkeep: mine.filter((i) => i.kind === 'upkeep' || i.kind === 'longterm'),
      routine: mine.filter((i) => i.kind === 'daily' && i.routine),
    };
  }).filter((g) => g.count > 0);
}

// The line under an item: a closed row as the Log says it, an open upkeep's overdue days, an estimate's words, or ''.
export function itemLine(i) {
  if (i.status === 'missed' || ['done', 'skipped', 'cancelled'].includes(i.status)) return closedLine(i);
  if (i.status === 'open' && i.overdueDays > 0) return `overdue ${i.overdueDays} ${i.overdueDays === 1 ? 'day' : 'days'}`;
  if (i.status === 'planned' && i.about) return 'Estimated from the stage plan';
  return '';
}

// A stage starting: "Rest between flushes starts · flush 1", the last rest "… · flush 4, the last", "Pinning starts".
export function stageText(s) {
  const flush = s.stage === 'fruiting' || s.stage === 'rest' ? `${DOT}flush ${s.flush}${s.done ? ', the last' : ''}` : '';
  return `${STAGES[s.stage] ?? s.stage} starts${flush}`;
}

export function calendarHash({ room = null, day = null } = {}) {
  const q = [room ? `room=${room}` : '', day ? `day=${day}` : ''].filter(Boolean).join('&');
  return q ? `#/calendar?${q}` : '#/calendar';
}
export function parseCalendarQuery(query) {
  const p = new URLSearchParams(query ?? '');
  const room = /^[1-9][0-9]{0,14}$/.test(p.get('room') ?? '') ? Number(p.get('room')) : null;
  const day = isDate(p.get('day')) ? p.get('day') : null;
  return { room, day };
}

export function dayTitle(date, today) {
  const d = new Date(utc(date));
  const words = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return date === today ? `Today, ${words}` : words;
}

// A day button's name: "Wednesday 4 November: 3 tasks", "…: 1 task, a task missed", "…: nothing".
export function dayLabel(date, today, { count, missed }) {
  const n = count === 0 ? 'nothing' : `${count} ${count === 1 ? 'task' : 'tasks'}`;
  return `${dayTitle(date, today)}: ${n}${missed ? ', a task missed' : ''}`;
}
