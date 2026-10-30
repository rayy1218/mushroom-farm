// The rooms' tasks (spec 2026-10-30-tasks-design.md sections 2, 4 and 6): makes a day's rows when they are first needed
// (ensureDay: idempotent), closes rows (done, skip, cancel), adds long-term rows (the owner's, or Plan this on Suggest
// machines), and reads the views of the Tasks tab, the Today page and the log.

import {
  DAILY_RULES, localDate, localTime, dayStart, addDays, daysBetween, effectiveRules, wantedDaily, upkeepApplies,
} from './task-rules.js';

// A refused request: status 400, 404 or 409, field the input it is about (tasks-api.js replies { error, field }).
export class TaskError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'TaskError';
    this.status = status;
    this.field = field;
  }
}

const AMOUNT_LABEL = Object.fromEntries(DAILY_RULES.filter((r) => r.amount).map((r) => [r.key, r.amount.label]));

export function createTasks({ db, now = Date.now, log = console.error }) {
  const listeners = new Set();
  const today = () => localDate(now());

  function tell(roomId) {
    for (const fn of [...listeners]) {
      try {
        fn(roomId);
      } catch (err) {
        log(err);
      }
    }
  }

  const rulesFor = (roomId) => effectiveRules({ settings: db.taskRuleSettings(), custom: db.customTaskRules(), roomId });

  // A row as the API shows it: amountLabel for an open row whose rule records an amount.
  const view = (row) => ({ ...row, amountLabel: row.status === 'open' ? AMOUNT_LABEL[row.ruleKey] ?? null : null });

  // An open upkeep row with its due date and how many days it is overdue on `date` (0: due today or not yet due).
  const upkeepView = (row, date) => {
    const dueDate = localDate(row.dueAt);
    return { ...view(row), dueDate, overdueDays: Math.max(0, daysBetween(dueDate, date)) };
  };

  // Spec section 4: the day's wanted daily rows made, open daily rows of earlier days missed, today's open rows whose rule
  // is no longer wanted cancelled ('Stage changed'; a rule turned off keeps its row), and each applying upkeep rule's open row
  // made when it has none (due everyDays after its last done or skip, or today without one).
  function ensureDay(roomId, date = today()) {
    const room = db.getRoom(roomId);
    if (!room) return;
    const at = now();
    const rules = rulesFor(roomId);
    const program = db.getProgram(roomId);
    const wanted = wantedDaily({ program, crops: program.crops, date, rules: rules.daily });
    let changed = false;
    for (const row of db.openDailyBefore(roomId, date)) {
      changed = db.closeTask(row.id, { status: 'missed', at: Math.min(at, dayStart(addDays(row.date, 1))) }) || changed;
    }
    const want = new Set(wanted.map((w) => `${w.ruleKey}/${w.slot}`));
    const on = new Set(rules.daily.map((r) => r.key));
    for (const row of db.dailyTasks(roomId, date)) {
      if (row.status !== 'open' || want.has(`${row.ruleKey}/${row.slot}`) || !on.has(row.ruleKey)) continue;
      changed = db.closeTask(row.id, { status: 'cancelled', at, reason: 'Stage changed' }) || changed;
    }
    for (const w of wanted) changed = db.insertDailyTask({ roomId, date, ...w, at }) || changed;
    for (const rule of rules.upkeep) {
      if (!upkeepApplies(rule, room) || db.openUpkeep(roomId, rule.key)) continue;
      const last = db.lastClosedUpkeep(roomId, rule.key);
      const due = last ? addDays(localDate(last.closedAt), rule.everyDays) : date;
      changed = db.insertUpkeepTask({ roomId, ruleKey: rule.key, slot: rule.slot ?? 'any', text: rule.text, dueAt: dayStart(due), at }) || changed;
    }
    if (changed) tell(roomId);
  }

  // The views of one room on `date` (made already).
  function viewOf(roomId, date) {
    const todayRows = db.dailyTasks(roomId, date).map(view);
    const upkeep = db.openTasks(roomId, 'upkeep').map((r) => upkeepView(r, date));
    const longterm = db.openTasks(roomId, 'longterm').map(view);
    const due = todayRows.filter((r) => r.status === 'open').length + upkeep.filter((r) => r.dueDate <= date).length;
    return { date, today: todayRows, upkeep, longterm, counts: { due, overdue: upkeep.filter((r) => r.overdueDays > 0).length, longterm: longterm.length } };
  }

  return {
    ensureDay,

    // ensureDay for every room.
    ensureAll(date = today()) {
      for (const room of db.listRooms()) ensureDay(room.id, date);
    },

    // The Tasks tab: { date, today, upkeep, longterm, counts: { due, overdue, longterm } }, or null when there is no such room.
    roomView(roomId) {
      if (!db.getRoom(roomId)) return null;
      const date = today();
      ensureDay(roomId, date);
      return viewOf(roomId, date);
    },

    // fn(roomId) after any change of a room's rows; → a function that stops it.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
