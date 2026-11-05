// Costs (spec 2026-11-05-costs-design.md): the costs entered by hand (one-offs and monthly items: add, edit, change from a
// month, stop, delete) and the views that work out the figures on each read (part 2) from them, the runs, the harvests, the
// measured energy and water, and the other modules' rows (server/costs-sources.js). No HTTP.

import { addDays, daysBetween } from './task-rules.js';
import { readSettings, readCropYield } from './settings.js';
import { roomDays, warmRoom, localZone, USAGE_DAYS_KEPT } from './usage.js';
import { checkWorker, TaskError } from './tasks.js';
import {
  CATEGORIES, BILLS, monthOf, firstDayOf, lastDayOf, addMonths, monthName, chargeDate, chargesOf, runOn, runEnd, figuresOf,
  runTotals, summaryOf, CATEGORY_LABELS,
} from './costs-math.js';

export const MAX_AMOUNT = 1_000_000;
export const MAX_NOTE = 200;
export const MAX_BILL_DAYS = 62;
const UTILITIES = ['electricity', 'water', 'other'];
const DAY = 86_400_000;

// A refused request: status 400 or 404, field the input it is about (the routes reply { error, field }).
export class CostError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'CostError';
    this.status = status;
    this.field = field;
  }
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isMonth = (s) => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s) && isDate(`${s}-01`);
const bodyOf = (body) => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new CostError(400, 'Body must be a JSON object');
  return body;
};

// db: the farm database; now and zone are injectable. zone: the usage days' zone (the host's, the farm's in the containers).
export function createCosts({ db, now = Date.now, zone = localZone, log = console.error }) {
  const listeners = new Set();
  function tell() {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (err) {
        log(err);
      }
    }
  }

  const stopping = new AbortController();
  const today = () => zone.label(now());
  const keptFrom = () => addDays(today(), -(USAGE_DAYS_KEPT - 1));

  // Every room's runs as costs-math wants them (dates in the usage days' zone), with what the page shows.
  function runsOf() {
    return db.listRooms().flatMap((room) => db.cropRuns(room.id).map((r) => ({
      id: r.id, roomId: r.roomId, roomName: room.name, startedAt: r.startedAt, endedAt: r.endedAt, crops: r.crops,
      startDate: zone.label(r.startedAt), endDate: r.endedAt === null ? null : zone.label(r.endedAt),
      blocks: r.crops.reduce((s, c) => s + c.blocks, 0),
    })));
  }

  // Who was paid: the tasks' rule (an active worker when the farm has a list).
  function workerOf(worker) {
    try {
      return checkWorker(db, worker);
    } catch (err) {
      if (err instanceof TaskError) throw new CostError(err.status, err.message, 'worker');
      throw err;
    }
  }

  // A cost's fields from a body (section 2); old: the cost an edit changes (a field left out keeps its value; repeat and
  // repeatUntil are changed only by change and stop).
  function fieldsOf(body, old = null) {
    const b = bodyOf(body);
    const pick = (k) => (b[k] !== undefined ? b[k] : old?.[k]);
    const t = today();
    const date = pick('date');
    if (!isDate(date) || date > t) throw new CostError(400, 'Pick a date up to today', 'date');
    const category = pick('category');
    if (!CATEGORIES.includes(category)) throw new CostError(400, 'Pick a category', 'category');
    const given = pick('amount');
    const amount = typeof given === 'number' && Number.isFinite(given) ? Math.round(given * 100) / 100 : NaN;
    if (!(amount > 0 && amount <= MAX_AMOUNT)) throw new CostError(400, 'RM must be a number over 0 up to 1,000,000', 'amount');
    const roomId = pick('roomId') ?? null;
    if (roomId !== null && !(Number.isInteger(roomId) && db.getRoom(roomId))) throw new CostError(400, 'That container no longer exists', 'roomId');
    const text = pick('note') ?? '';
    if (typeof text !== 'string') throw new CostError(400, 'The note must be text', 'note');
    const note = text.trim();
    if (note.length > MAX_NOTE) throw new CostError(400, `The note must be at most ${MAX_NOTE} characters`, 'note');
    const repeat = old ? old.repeat : (b.repeat ?? null);
    if (repeat !== null && repeat !== 'monthly') throw new CostError(400, 'Repeat must be monthly or none', 'repeat');
    const repeatUntil = old?.repeatUntil ?? null;
    if (repeatUntil !== null && repeatUntil < monthOf(date)) throw new CostError(400, `Pick a date up to ${monthName(repeatUntil)}, its last month`, 'date');
    const utility = category === 'utilities' ? pick('utility') : null;
    if (category === 'utilities' && !UTILITIES.includes(utility)) throw new CostError(400, 'Pick electricity, water or other', 'utility');
    const bill = category === 'utilities' && BILLS.includes(utility);
    if (bill && repeat) throw new CostError(400, 'An electricity or water bill is entered each month', 'repeat');
    if (bill && roomId !== null) throw new CostError(400, 'A bill is the whole farm’s', 'roomId');
    const worker = category === 'labour' ? workerOf(pick('worker')) : null;
    let periodFrom = null;
    let periodTo = null;
    if (bill) {
      periodFrom = pick('periodFrom') ?? firstDayOf(monthOf(date));
      periodTo = pick('periodTo') ?? lastDayOf(monthOf(date));
      if (!isDate(periodFrom)) throw new CostError(400, 'Pick the first day the bill covers', 'periodFrom');
      if (!isDate(periodTo) || periodTo < periodFrom || daysBetween(periodFrom, periodTo) + 1 > MAX_BILL_DAYS) {
        throw new CostError(400, `Pick the last day the bill covers, up to ${MAX_BILL_DAYS} days after the first`, 'periodTo');
      }
    }
    // A one-off room cost: the run open in the room on its date. A monthly item finds each charge's run on read.
    const runId = roomId === null || repeat ? null : (runOn(runsOf(), roomId, date, t)?.id ?? null);
    return { date, category, amount, roomId, runId, note, repeat, repeatUntil, worker, utility, periodFrom, periodTo };
  }

  function costOf(id) {
    const c = db.getCost(id);
    if (!c) throw new CostError(404, 'Cost not found');
    return c;
  }
  function monthlyOf(id) {
    const c = costOf(id);
    if (c.repeat !== 'monthly') throw new CostError(400, 'This cost is not a monthly item');
    return c;
  }
  // `from` (change): its first month (edited in place) to this month, or to its last month when stopped earlier. `after`
  // (stop): its first month to this month.
  function monthIn(value, c, field) {
    const lowest = monthOf(c.date);
    const current = monthOf(today());
    const last = field === 'from' && c.repeatUntil && c.repeatUntil < current ? c.repeatUntil : current;
    if (!isMonth(value) || value < lowest || value > last) throw new CostError(400, `Pick a month from ${monthName(lowest)} to ${monthName(last)}`, field);
    return value;
  }

  return {
    // Every cost (the edit dialogs).
    list() {
      return db.listCosts();
    },

    add(body) {
      const made = db.insertCost(fieldsOf(body), now());
      tell();
      return made;
    },

    edit(id, body) {
      const row = db.updateCost(id, fieldsOf(body, costOf(id)));
      tell();
      return row;
    },

    remove(id) {
      if (!db.deleteCost(id)) throw new CostError(404, 'Cost not found');
      tell();
    },

    // A monthly item's new amount (and note) from a month (section 2.1): from its first month, edited in place ({ ended:
    // null, started: the item }); later, it ends the month before and a new one starts. → { ended, started }.
    change(id, body) {
      const c = monthlyOf(id);
      const b = bodyOf(body);
      const from = monthIn(b.from, c, 'from');
      const fields = fieldsOf({ amount: b.amount, note: b.note ?? c.note }, c);
      if (from === monthOf(c.date)) {
        const started = db.updateCost(id, fields);
        tell();
        return { ended: null, started };
      }
      const changed = db.changeCost(id, addMonths(from, -1), { ...fields, date: chargeDate(c.date, from) }, now());
      tell();
      return changed;
    },

    // A monthly item's last month (section 2.1). → the item.
    // Called with no arguments it instead stops the usage warms (the server closing; the plan's two `stop`s share the name).
    stop(id, body) {
      if (id === undefined) {
        stopping.abort();
        return undefined;
      }
      const c = monthlyOf(id);
      const after = monthIn(bodyOf(body).after, c, 'after');
      const row = db.stopCost(id, after);
      tell();
      return row;
    },

    warmed: () => Promise.resolve(),

    // fn() after any write here or a usage warm done (the figures can be worked out now); → a function that stops it.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
