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

  // The rule settings and the owner's rules, read once for a pass over several rooms.
  const ruleSources = () => ({ settings: db.taskRuleSettings(), custom: db.customTaskRules() });

  // A row as the API shows it: amountLabel for an open row whose rule records an amount.
  const view = (row) => ({ ...row, amountLabel: row.status === 'open' ? AMOUNT_LABEL[row.ruleKey] ?? null : null });

  // An open upkeep row with its due date and how many days it is overdue on `date` (0: due today or not yet due).
  const upkeepView = (row, date) => {
    const dueDate = localDate(row.dueAt);
    return { ...view(row), dueDate, overdueDays: Math.max(0, daysBetween(dueDate, date)) };
  };

  // Spec section 4: the day's wanted daily rows made, open daily rows of earlier days missed, today's open rows whose rule
  // is no longer wanted cancelled ('Stage changed', or 'Rule changed' when the rule now wants another time of day; a rule
  // turned off keeps its row), and such a cancelled row opened again when it is wanted again the same day (a stage changed
  // and changed back). Upkeep: an open row of a rule that no longer applies (its machine taken out) cancelled; each applying
  // rule's open row made when it has none, due everyDays after its last done or skip but not before `date` (a rule off for
  // months, or a machine fitted again, starts due today, not long overdue).
  function makeDay(room, date, sources) {
    const roomId = room.id;
    const at = now();
    const rules = effectiveRules({ ...sources, roomId });
    const program = db.getProgram(roomId);
    const wanted = wantedDaily({ program, crops: program.crops, date, rules: rules.daily });
    let changed = false;
    for (const row of db.openDailyBefore(roomId, date)) {
      changed = db.closeTask(row.id, { status: 'missed', at: Math.min(at, dayStart(addDays(row.date, 1))) }) || changed;
    }
    const slotKey = (r) => `${r.ruleKey}/${r.slot}`;
    const want = new Set(wanted.map(slotKey));
    const wantedKeys = new Set(wanted.map((w) => w.ruleKey));
    const on = new Set(rules.daily.map((r) => r.key));
    const have = new Set();
    for (const row of db.dailyTasks(roomId, date)) {
      have.add(slotKey(row));
      if (want.has(slotKey(row))) {
        if (row.status === 'cancelled') changed = db.reopenTask(row.id) || changed; // only the server's 'Stage changed' or 'Rule changed'
        continue;
      }
      if (row.status !== 'open' || !on.has(row.ruleKey)) continue;
      const reason = wantedKeys.has(row.ruleKey) ? 'Rule changed' : 'Stage changed';
      changed = db.closeTask(row.id, { status: 'cancelled', at, reason }) || changed;
    }
    for (const w of wanted) if (!have.has(slotKey(w))) changed = db.insertDailyTask({ roomId, date, ...w, at }) || changed;
    const open = new Map(db.openTasks(roomId, 'upkeep').map((r) => [r.ruleKey, r]));
    for (const rule of rules.upkeep) {
      const row = open.get(rule.key);
      if (!upkeepApplies(rule, room)) {
        if (row) changed = db.closeTask(row.id, { status: 'cancelled', at, reason: 'The room no longer has this machine' }) || changed;
        continue;
      }
      if (row) continue;
      const last = db.lastClosedUpkeep(roomId, rule.key);
      const after = last ? addDays(localDate(last.closedAt), rule.everyDays) : date;
      const due = after > date ? after : date;
      changed = db.insertUpkeepTask({ roomId, ruleKey: rule.key, slot: rule.slot ?? 'any', text: rule.text, dueAt: dayStart(due), at }) || changed;
    }
    if (changed) tell(roomId);
  }

  // makeDay for one room (nothing for a missing room).
  function ensureDay(roomId, date = today()) {
    const room = db.getRoom(roomId);
    if (room) makeDay(room, date, ruleSources());
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
      const sources = ruleSources();
      for (const room of db.listRooms()) makeDay(room, date, sources);
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
