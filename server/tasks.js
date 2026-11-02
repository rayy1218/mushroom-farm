// The rooms' tasks (spec 2026-10-30-tasks-design.md sections 2, 4 and 6): makes a day's rows when they are first needed
// (ensureDay: idempotent), closes rows (done, skip, cancel), adds long-term rows (the owner's, or Plan this on Suggest
// machines), and reads the views of the Tasks tab, the Today page and the log.

import {
  DAILY_RULES, UPKEEP_RULES, localDate, localTime, dayStart, addDays, daysBetween, effectiveRules, wantedDaily, upkeepApplies,
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

const MAX_AMOUNT = 10_000;
const MAX_REASON = 200;
// An upkeep rule's first row is due the day it appears up to this interval (days), one interval later above it.
const FIRST_DUE_DAYS = 14;
export const MAX_NAME = 40;

// '12,000', '0.5': thousands grouped with a comma, at most 3 decimals (0.1 + 0.2 is '0.3').
const grouped = (n) => {
  const [whole, frac] = String(Number(n.toFixed(3))).split('.');
  return `${whole.replace(/\B(?=(\d{3})+$)/g, ',')}${frac ? `.${frac}` : ''}`;
};

// The text of a refused close: 'Already done by Ali at 09:12' (the farm's clock).
function closedText(row) {
  if (row.status === 'missed') return 'Already missed: its day has ended';
  const by = row.worker ? ` by ${row.worker}` : '';
  return `Already ${row.status}${by} at ${localTime(row.closedAt)}`;
}

const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');

// An own task's text, and an own rule's (tasks-api.js).
export const MAX_TEXT = 120;
const MAX_NOTE = 500;
const MAX_MACHINE = 1_000_000;
const MAX_TIME = 8.64e15; // the latest time a Date can hold, in ms
// The machines of a suggestion (the sizing keys): the name and unit of the long-term text; zero: the word for 0.
const MACHINES = {
  fanFlow: { name: 'Fan', unit: 'm³/h' },
  acBTU: { name: 'Aircon', unit: 'BTU/h' },
  humidifierLH: { name: 'Humidifier', unit: 'L/h' },
  dehumidifierLday: { name: 'Dehumidifier', unit: 'L/day', zero: 'none' },
};

// 'Aircon 9,000 → 12,000 BTU/h', 'Dehumidifier none → 10 L/day', 'Dehumidifier 10 L/day → none'.
export function machineChangeText(key, from, to) {
  const m = MACHINES[key];
  const word = (n) => (n === 0 && m.zero ? m.zero : grouped(n));
  return word(to) === m.zero ? `${m.name} ${word(from)} ${m.unit} → ${m.zero}` : `${m.name} ${word(from)} → ${word(to)} ${m.unit}`;
}

const LOG_PAGE = 50;
const CSV_HEADER = 'date,time,room,task,status,worker,amount,unit,reason';

// One CSV cell: quoted when it holds a comma, quote or line break; a text starting like a formula gets a ' first.
function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

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
  // months, or a machine fitted again, starts due today, not long overdue); a rule's first row (no done or skip yet) due by
  // upkeepDue's first-row rule. → whether anything changed (the caller tells).
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
      const dueAt = upkeepDue(roomId, rule.key, rule.everyDays, date);
      changed = db.insertUpkeepTask({ roomId, ruleKey: rule.key, slot: rule.slot ?? 'any', text: rule.text, dueAt, at }) || changed;
    }
    return changed;
  }

  // When an upkeep rule's open row is due: everyDays after the farm day of its last done or skip, but not before `date`.
  // No done or skip yet (its first row): `date` for a rule of 14 days or less; a longer one is due everyDays after `since`,
  // the farm day its row first appears (a new room is not handed its 120- and 180-day aircon jobs on day one; Done early is
  // always allowed). → ms of that day's start.
  function upkeepDue(roomId, ruleKey, everyDays, date, since = date) {
    const last = db.lastClosedUpkeep(roomId, ruleKey);
    const after = last ? addDays(localDate(last.closedAt), everyDays) : everyDays <= FIRST_DUE_DAYS ? date : addDays(since, everyDays);
    return dayStart(after > date ? after : date);
  }

  // Each rule's interval by key: a built-in upkeep rule's (the owner's or its own), an own rule's (null: a daily rule).
  function intervals({ settings, custom }) {
    const byKey = new Map(settings.map((s) => [s.key, s]));
    const every = new Map(UPKEEP_RULES.map((r) => [r.key, byKey.get(r.key)?.everyDays ?? r.everyDays]));
    for (const c of custom) every.set(`custom:${c.id}`, c.everyDays ?? null);
    return every;
  }

  // makeDay for one room (nothing for a missing room).
  function ensureDay(roomId, date = today()) {
    const room = db.getRoom(roomId);
    if (room && makeDay(room, date, ruleSources())) tell(roomId);
  }

  // makeDay for every room. → the ids of the rooms that changed (the caller tells).
  function makeAll(date) {
    const sources = ruleSources();
    return db.listRooms().filter((room) => makeDay(room, date, sources)).map((room) => room.id);
  }

  // The views of one room on `date` (made already).
  function viewOf(roomId, date) {
    const todayRows = db.dailyTasks(roomId, date).map(view);
    const upkeep = db.openTasks(roomId, 'upkeep').map((r) => upkeepView(r, date));
    const longterm = db.openTasks(roomId, 'longterm').map(view);
    const due = todayRows.filter((r) => r.status === 'open').length + upkeep.filter((r) => r.dueDate <= date).length;
    return { date, today: todayRows, upkeep, longterm, counts: { due, overdue: upkeep.filter((r) => r.overdueDays > 0).length, longterm: longterm.length } };
  }

  // The next row of an upkeep rule after one is closed on `date`, or null when the rule no longer applies (turned off,
  // removed, or the room no longer has the machine).
  function nextUpkeep(row, date, at) {
    const rule = effectiveRules({ ...ruleSources(), roomId: row.roomId }).upkeep.find((r) => r.key === row.ruleKey);
    const room = db.getRoom(row.roomId);
    if (!rule || !room || !upkeepApplies(rule, room)) return null;
    return { roomId: row.roomId, ruleKey: rule.key, slot: rule.slot ?? 'any', text: rule.text, dueAt: dayStart(addDays(date, rule.everyDays)), at };
  }

  // The open row `id` or a TaskError (404, 409).
  function openRow(id) {
    const row = db.getTask(id);
    if (!row) throw new TaskError(404, 'Task not found');
    if (row.status !== 'open') throw new TaskError(409, closedText(row));
    return row;
  }

  // Who did it: 1 to 40 characters, no control characters (a parked worker name starts with U+0001).
  function workerOf(worker) {
    const name = trimmed(worker);
    if (!name || /[\u0000-\u001f\u007f]/.test(name)) throw new TaskError(400, 'Pick who did it', 'worker');
    if (name.length > MAX_NAME) throw new TaskError(400, `The name must be at most ${MAX_NAME} characters`, 'worker');
    return name;
  }

  function reasonOf(reason) {
    const text = trimmed(reason);
    if (!text) throw new TaskError(400, 'Say why', 'reason');
    if (text.length > MAX_REASON) throw new TaskError(400, `The reason must be at most ${MAX_REASON} characters`, 'reason');
    return text;
  }

  // Closes the open row; a row closed by someone else meanwhile is a 409 too, one deleted with its room a 404. An upkeep
  // row makes its next row with it.
  function close(row, fields) {
    const at = now();
    const next = row.kind === 'upkeep' ? nextUpkeep(row, localDate(at), at) : null;
    if (!db.closeTask(row.id, { ...fields, at }, next)) {
      const after = db.getTask(row.id);
      if (!after) throw new TaskError(404, 'Task not found');
      throw new TaskError(409, closedText(after));
    }
    tell(row.roomId);
    return view(db.getTask(row.id));
  }

  return {
    ensureDay,

    // ensureDay for every room.
    ensureAll(date = today()) {
      for (const id of makeAll(date)) tell(id);
    },

    // After the owner's rules are saved (before: { settings, custom } as they were): a rule whose interval changed has its
    // open upkeep rows due again by upkeepDue; an own rule changed from daily to every N days has today's open daily rows
    // cancelled 'Rule changed', and one changed back its open upkeep row; an own rule removed has its open upkeep row and
    // today's open daily rows cancelled 'Rule removed' (never opened again); an own rule's rooms narrowed cancels its open
    // upkeep row and today's open daily rows in each room taken off it 'Rule changed'; then makeAll makes what the rules now
    // want. Each room that changed is told once.
    rulesSaved(before, date = today()) {
      const after = ruleSources();
      const was = intervals(before);
      const is = intervals(after);
      // An own rule's rooms (null: every room) before and after: a room taken off it loses its open rows of it.
      const roomsOf = (custom) => new Map(custom.map((c) => [`custom:${c.id}`, c.rooms ?? null]));
      const [roomsWas, roomsIs] = [roomsOf(before.custom), roomsOf(after.custom)];
      const takenOff = (roomId, key) => {
        if (!roomsWas.has(key) || !roomsIs.has(key)) return false;
        const [from, to] = [roomsWas.get(key), roomsIs.get(key)];
        return (from === null || from.includes(roomId)) && to !== null && !to.includes(roomId);
      };
      const at = now();
      const changedRooms = new Set();
      for (const room of db.listRooms()) {
        let changed = false;
        const cancel = (row, reason) => db.closeTask(row.id, { status: 'cancelled', at, reason });
        for (const row of db.openTasks(room.id, 'upkeep')) {
          if (takenOff(room.id, row.ruleKey)) { changed = cancel(row, 'Rule changed') || changed; continue; }
          if (!was.has(row.ruleKey)) continue;
          const [from, to] = [was.get(row.ruleKey), is.get(row.ruleKey)];
          if (to === undefined) changed = cancel(row, 'Rule removed') || changed;
          else if (to === null) changed = cancel(row, 'Rule changed') || changed;
          else if (to !== from) changed = db.setTaskDue(row.id, upkeepDue(room.id, row.ruleKey, to, date, localDate(row.createdAt))) || changed;
        }
        for (const row of db.dailyTasks(room.id, date)) {
          if (row.status === 'open' && takenOff(room.id, row.ruleKey)) { changed = cancel(row, 'Rule changed') || changed; continue; }
          if (row.status !== 'open' || was.get(row.ruleKey) !== null) continue; // an own daily rule's open row
          if (!is.has(row.ruleKey)) changed = cancel(row, 'Rule removed') || changed;
          else if (is.get(row.ruleKey) !== null) changed = cancel(row, 'Rule changed') || changed;
        }
        if (changed) changedRooms.add(room.id);
      }
      for (const id of makeAll(date)) changedRooms.add(id);
      for (const id of changedRooms) tell(id);
    },

    // The Tasks tab: { date, today, upkeep, longterm, counts: { due, overdue, longterm } }, or null when there is no such room.
    roomView(roomId) {
      if (!db.getRoom(roomId)) return null;
      const date = today();
      ensureDay(roomId, date);
      return viewOf(roomId, date);
    },

    // { worker, amount }: an amount given (empty: none) is a number from 0 to 10,000, kept only on a row that records one.
    // A null body is an empty one.
    done(id, body) {
      const { worker, amount } = body ?? {};
      const row = openRow(id);
      const name = workerOf(worker);
      const given = amount !== undefined && amount !== null && amount !== '';
      if (given && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT)) {
        throw new TaskError(400, `The amount must be a number from 0 to ${grouped(MAX_AMOUNT)}`, 'amount');
      }
      return close(row, { status: 'done', worker: name, amount: given && row.unit !== null ? amount : null });
    },

    // { worker, reason }; not for a long-term row (that is done or cancelled).
    skip(id, body) {
      const { worker, reason } = body ?? {};
      const row = openRow(id);
      if (row.kind === 'longterm') throw new TaskError(400, 'A long-term task is done or cancelled, not skipped');
      return close(row, { status: 'skipped', worker: workerOf(worker), reason: reasonOf(reason) });
    },

    // { reason }; long-term rows only.
    cancel(id, body) {
      const { reason } = body ?? {};
      const row = openRow(id);
      if (row.kind !== 'longterm') throw new TaskError(400, 'Only a long-term task can be cancelled');
      return close(row, { status: 'cancelled', reason: reasonOf(reason) });
    },

    // The owner's long-term task: { text (1–120 characters), note? (up to 500) }. A null body is an empty one. → the row.
    addLongterm(roomId, body) {
      const { text, note } = body ?? {};
      if (!db.getRoom(roomId)) throw new TaskError(404, 'Room not found');
      const t = trimmed(text);
      if (!t || t.length > MAX_TEXT) throw new TaskError(400, `Say what to do (1 to ${MAX_TEXT} characters)`, 'text');
      if (note !== undefined && note !== null && typeof note !== 'string') throw new TaskError(400, 'The note must be text', 'note');
      const n = trimmed(note);
      if (n.length > MAX_NOTE) throw new TaskError(400, `The note must be at most ${MAX_NOTE} characters`, 'note');
      const row = db.insertLongtermTask({ roomId, text: t, note: n || null, at: now() });
      tell(roomId);
      return view(row);
    },

    // Plan this on Suggest machines: { machines: [{ key, from, to }], rmMonth, suggestedAt } → { rows, replaced }: one long-term
    // row per machine that changes and is not planned already (an open row to the same size; none left: 409), made together; an
    // open row of the machine to another size is cancelled 'Replaced by a newer plan' with them (replaced: those, as they are now). Each machine at most once, from and to 0 to 1,000,000; suggestedAt null or ms 0 to 8.64e15.
    addFromSuggestion(roomId, suggestion) {
      if (!db.getRoom(roomId)) throw new TaskError(404, 'Room not found');
      const { machines, rmMonth = null, suggestedAt = null } = suggestion ?? {};
      const number = (v) => typeof v === 'number' && Number.isFinite(v);
      const size = (v) => number(v) && v >= 0 && v <= MAX_MACHINE;
      // suggestedAt: a time in ms within the Date range.
      const time = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_TIME;
      if (!Array.isArray(machines) || new Set(machines.map((m) => m?.key)).size !== machines.length
        || machines.some((m) => !Object.hasOwn(MACHINES, m?.key) || !size(m.from) || !size(m.to))) {
        throw new TaskError(400, `The plan must list the fan, aircon, humidifier or dehumidifier, each from and to a number from 0 to ${grouped(MAX_MACHINE)}`, 'suggestion');
      }
      if ((rmMonth !== null && !number(rmMonth)) || (suggestedAt !== null && !time(suggestedAt))) {
        throw new TaskError(400, "The plan's RM a month must be a number and its time a time in ms", 'suggestion');
      }
      const changes = machines.filter((m) => m.from !== m.to);
      if (changes.length === 0) throw new TaskError(400, 'Nothing changes from what the room has now', 'suggestion');
      // Plan this twice: a machine whose open long-term task already goes to the same size is left out; one to another
      // size is replaced (cancelled 'Replaced by a newer plan', with the new rows: one open plan per machine).
      const open = db.openTasks(roomId, 'longterm').filter((r) => r.source);
      const planned = new Set(open.map((r) => `${r.source.machine}/${r.source.to}`));
      const fresh = changes.filter((m) => !planned.has(`${m.key}/${m.to}`));
      if (fresh.length === 0) throw new TaskError(409, 'Already planned: see the Tasks tab', 'suggestion');
      const at = now();
      const keys = new Set(fresh.map((m) => m.key));
      const replaced = open.filter((r) => keys.has(r.source.machine)).map((r) => ({ id: r.id, at, reason: 'Replaced by a newer plan' }));
      const rows = db.insertLongtermTasks(fresh.map((m) => ({
        roomId, text: machineChangeText(m.key, m.from, m.to),
        source: { machine: m.key, from: m.from, to: m.to, rmMonth, suggestedAt }, at,
      })), replaced);
      tell(roomId);
      return { rows: rows.map(view), replaced: replaced.map((r) => view(db.getTask(r.id))) };
    },

    // The Today page: every room in the Overview's order with its daily rows, its upkeep due today or overdue, how many
    // long-term rows are open, and its counts.
    todayView() {
      const date = today();
      for (const id of makeAll(date)) tell(id); // every room made before anyone is told, so a listener counts the whole farm
      const rooms = db.listRooms().map((room) => {
        const v = viewOf(room.id, date);
        return { id: room.id, name: room.name, today: v.today, upkeepDue: v.upkeep.filter((r) => r.dueDate <= date), longterm: v.counts.longterm, counts: v.counts };
      });
      return { date, rooms };
    },

    // The closed rows, newest first, LOG_PAGE at most, older than the row `before` when given.
    log(roomId, { before = null, limit = LOG_PAGE } = {}) {
      return db.taskLog(roomId, { before, limit }).map(view);
    },

    // Every closed row as CSV (oldest first): date and time it was closed on the farm's clock (a missed row: its own day and
    // no time), room, task, status, worker, amount, unit, reason. Null when there is no such room.
    logCsv(roomId) {
      const room = db.getRoom(roomId);
      if (!room) return null;
      const lines = db.taskLogAll(roomId).map((r) => [
        r.status === 'missed' ? r.date : localDate(r.closedAt), r.status === 'missed' ? '' : localTime(r.closedAt), room.name, r.text, r.status, r.worker,
        r.amount, r.amount === null ? null : r.unit, r.reason,
      ].map(cell).join(','));
      return `${[CSV_HEADER, ...lines].join('\r\n')}\r\n`;
    },

    // The sum of every room's counts.due today (the top bar's count), from the rows made so far: no ensureDay here, since it
    // runs inside onChange listeners and making rows would call them again.
    dueCount() {
      const date = today();
      return db.listRooms().reduce((sum, room) => sum + viewOf(room.id, date).counts.due, 0);
    },

    // fn(roomId) after any change of a room's rows; → a function that stops it.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
