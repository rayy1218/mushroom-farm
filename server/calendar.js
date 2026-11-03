// The calendar's future days (spec 2026-11-03-calendar-design.md 3): what the farm will want on each day, worked out with the
// rules that make each day's rows (task-rules.js wantedDaily) over the stage plan (program.js nextStage and stageEndsAt, the
// Crop tab's dates) and the upkeep intervals. Pure: the stored rows are merged in tasks.js calendarView.

import { nextStage, stageEndsAt } from './program.js';
import { wantedDaily, localDate, addDays, daysBetween, dayStart } from './task-rules.js';

export const HORIZON_DAYS = 92;
export const MAX_SPAN_DAYS = 42;
const ROUTINE = new Set(['contamWalk', 'humidifierCheck', 'footbath', 'floorClean']);

// The everyday routine the day list folds: the walk, the humidifier, the footbath, the floor and an own daily rule.
export const isRoutine = (kind, ruleKey) => kind === 'daily' && (ROUTINE.has(ruleKey) || String(ruleKey ?? '').startsWith('custom:'));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s) => typeof s === 'string' && DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

// The query's dates checked: null, or { error, field }.
export function checkRange(from, to) {
  if (!isDate(from)) return { error: 'from must be a date like 2026-11-01', field: 'from' };
  if (!isDate(to)) return { error: 'to must be a date like 2026-11-30', field: 'to' };
  if (to < from) return { error: 'to must not be before from', field: 'to' };
  if (daysBetween(from, to) + 1 > MAX_SPAN_DAYS) return { error: `Ask for ${MAX_SPAN_DAYS} days or fewer`, field: 'to' };
  return null;
}

// The program from now to `until` (ms): [{ at, program, started }], the first the program as it is (at null), each next one
// started by itself at `at` (started: nextStage's { stage, flush, done }). Automatic change off: the first only.
export function programSteps(program, until) {
  const steps = [{ at: null, program, started: null }];
  let p = program;
  for (let at = stageEndsAt(p); at !== null && at < until; at = stageEndsAt(p)) {
    const next = nextStage(p);
    p = { ...p, stage: next.stage, flush: next.flush, done: next.done, stageSince: at };
    steps.push({ at, program: p, started: next });
  }
  return steps;
}

// The step in force on `date`: the last one started on or before that farm date (a stage counts from its start day).
export function stepOn(steps, date) {
  let s = steps[0];
  for (const step of steps) if (step.at === null || localDate(step.at) <= date) s = step;
  return s;
}
export const programOn = (steps, date) => stepOn(steps, date).program;

// A room's worked-out items from the day after `today` (and a stage starting later today) to min(to, today + HORIZON_DAYS):
// Map date → [item], stage starts first, then the daily rules' tasks in the rules' order, then upkeep due.
// rules: effectiveRules(...) ({ daily, upkeep }); openUpkeep: the room's open upkeep rows ({ ruleKey, dueAt, text, slot }).
export function projectRoom({ program, rules, openUpkeep = [], today, now, from, to }) {
  const last = [to, addDays(today, HORIZON_DAYS)].sort()[0];
  const out = new Map();
  if (last < from) return out;
  const steps = programSteps(program, dayStart(addDays(last, 1)));
  const push = (date, item) => { if (date >= from && date <= last) (out.get(date) ?? out.set(date, []).get(date)).push(item); };
  const base = { worker: null, amount: null, reason: null, closedAt: null, note: null, unit: null, overdueDays: 0 };
  for (const s of steps.slice(1)) {
    if (s.at <= now) continue;
    push(localDate(s.at), { ...base, kind: 'stage', status: 'planned', ruleKey: null, text: '', slot: 'any', routine: false, about: true, stage: s.started });
  }
  const start = [from, addDays(today, 1)].sort().at(-1);
  for (let date = start; date <= last; date = addDays(date, 1)) {
    const step = stepOn(steps, date);
    const about = step.at !== null;
    for (const t of wantedDaily({ program: step.program, crops: step.program.crops, date, rules: rules.daily })) {
      push(date, { ...base, kind: 'daily', status: 'planned', ruleKey: t.ruleKey, text: t.text, note: t.note, slot: t.slot, unit: t.unit,
        routine: isRoutine('daily', t.ruleKey), about, stage: null });
    }
  }
  const every = new Map(rules.upkeep.map((r) => [r.key, r.everyDays]));
  for (const row of openUpkeep) {
    const n = every.get(row.ruleKey);
    if (!n) continue;
    const due = localDate(row.dueAt);
    for (let date = due > today ? due : addDays(today, n); date <= last; date = addDays(date, n)) {
      push(date, { ...base, kind: 'upkeep', status: 'planned', ruleKey: row.ruleKey, text: row.text, slot: row.slot ?? 'any', routine: false, about: false, stage: null });
    }
  }
  return out;
}
