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
  // The rooms whose usage days are being worked out (roomId → { count, more, done }): a view never works out a cold day in
  // the request (a year of one-second readings takes seconds); it starts a warm, one at a time a room, that tells when done.
  const warming = new Map();
  function warm(roomId, count) {
    if (stopping.signal.aborted) return;
    const running = warming.get(roomId);
    if (running) {
      running.more = Math.max(running.more, count);
      return;
    }
    const job = { count, more: 0 };
    warming.set(roomId, job);
    job.done = (async () => {
      try {
        while (job.count > 0) {
          await warmRoom(db, roomId, { now: now(), zone, count: job.count, signal: stopping.signal });
          job.count = job.more > job.count ? job.more : 0;
        }
        warming.delete(roomId);
        if (!stopping.signal.aborted) tell();
      } catch (err) {
        warming.delete(roomId);
        log(err);
      }
    })();
  }

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

  // Everything the figures read from `from` (a date) to today (costs-math's data, section 4 of the plan's Task 4).
  function dataFor(from) {
    const t = today();
    const kept = keptFrom();
    const count = daysBetween(from < kept ? kept : from, t) + 1;
    const rooms = new Map();
    const usage = new Map();
    for (const room of db.listRooms()) {
      rooms.set(room.id, room.name);
      const days = roomDays(db, room, { now: now(), zone, count, cachedOnly: true });
      if (days.some((d) => d.pending)) warm(room.id, count);
      usage.set(room.id, new Map(days.map((d) => [d.date, d])));
    }
    // a day's margin each side: the zone's dates are worked out from the times below
    const [fromMs, toMs] = [Date.parse(`${from}T00:00:00Z`) - DAY, now() + DAY];
    const src = db.costSources(fromMs, toMs);
    const dated = (list) => list.map((x) => ({ ...x, date: zone.label(x.at) }));
    const { electricityPrice, waterPrice } = readSettings(db);
    return {
      today: t, keptFrom: kept, prices: { electricity: electricityPrice, water: waterPrice }, rooms, runs: runsOf(),
      costs: db.listCosts(), usage, batches: dated(src.batches), purchases: dated(src.purchases), sales: dated(src.sales),
      harvests: db.harvestsBetween(fromMs, toMs).map((h) => ({ roomId: h.roomId, runId: h.runId, date: zone.label(h.pickedAt), kg: h.kg, crop: h.crop })),
      cropYield: readCropYield(db),
    };
  }

  // The figures of a month (to today in this month), worked out once per view.
  function monthsOf(data) {
    const memo = new Map();
    return (m) => {
      if (!memo.has(m)) memo.set(m, figuresOf(firstDayOf(m), lastDayOf(m) < data.today ? lastDayOf(m) : data.today, data));
      return memo.get(m);
    };
  }

  // A run as the page shows it, with its whole figures.
  const runView = (r, figs, t) => ({
    id: r.id, roomId: r.roomId, roomName: r.roomName, startedAt: r.startedAt, endedAt: r.endedAt, crops: r.crops,
    ...runTotals(r, figs, t),
  });

  // The month's charges of the costs entered by hand, newest first.
  function entriesOf(month, data) {
    return data.costs.flatMap((c) => chargesOf(c, firstDayOf(month), lastDayOf(month), data.today).map(({ date }) => ({
      costId: c.id, date, category: c.category, label: CATEGORY_LABELS[c.category], worker: c.worker, note: c.note,
      roomId: c.roomId, roomName: c.roomId === null ? null : data.rooms.get(c.roomId) ?? null, amount: c.amount,
      repeat: c.repeat, utility: c.utility, periodFrom: c.periodFrom, periodTo: c.periodTo,
    }))).sort((a, b) => (a.date === b.date ? b.costId - a.costId : a.date < b.date ? 1 : -1));
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
    stopItem(id, body) {
      const c = monthlyOf(id);
      const after = monthIn(bodyOf(body).after, c, 'after');
      const row = db.stopCost(id, after);
      tell();
      return row;
    },

    // GET /api/costs/month (section 5): the month's tiles, notes, lines by category, entries, monthly items, runs (their whole
    // figures) and the last 12 months' profit (none before the usage days kept). month: 'YYYY-MM', default this month.
    monthView({ month = null } = {}) {
      const t = today();
      const current = monthOf(t);
      const first = monthOf(keptFrom());
      const m = month ?? current;
      if (!isMonth(m) || m > current || m < first) throw new CostError(400, `Pick a month from ${monthName(first)} to ${monthName(current)}`, 'month');
      const runs = runsOf().filter((r) => r.startDate <= lastDayOf(m) && runEnd(r, t) >= firstDayOf(m));
      const earliest = [addMonths(m, -11), ...runs.map((r) => monthOf(r.startDate))].sort()[0];
      const data = dataFor(addDays(firstDayOf(earliest), -MAX_BILL_DAYS));
      const figs = monthsOf(data);
      const f = figs(m);
      const months = Array.from({ length: 12 }, (_, i) => addMonths(m, i - 11)).filter((x) => x >= first);
      return {
        month: m, today: t, first,
        tiles: {
          income: f.income, costs: f.costs, profit: f.profit, costPerKg: f.costPerKg, profitPerKg: f.profitPerKg,
          kgHarvested: f.kgHarvested, kgSold: f.kgSold, unsold: f.unsold,
        },
        notes: f.notes, byCategory: f.byCategory, pending: f.pending,
        entries: entriesOf(m, data),
        repeating: data.costs.filter((c) => c.repeat === 'monthly' && monthOf(c.date) <= m && (c.repeatUntil === null || c.repeatUntil >= m))
          .map((c) => ({ ...c, roomName: c.roomId === null ? null : data.rooms.get(c.roomId) ?? null })),
        runs: runs.map((r) => runView(r, figs, t)),
        last12: months.map((x) => {
          const g = figs(x);
          return { month: x, income: g.income, costs: g.costs, profit: g.profit, pending: g.pending };
        }),
      };
    },

    // GET /api/costs/summary (the contract's shape): over [from, to] (default this month to today), or a run's whole figures.
    summary({ from = null, to = null, run = null } = {}) {
      const t = today();
      if (run !== null) {
        const r = runsOf().find((x) => x.id === run);
        if (!r) throw new CostError(404, 'Run not found');
        const data = dataFor(addDays(r.startDate, -MAX_BILL_DAYS));
        const v = runTotals(r, monthsOf(data), t);
        // the contract's keys; byCategory adds 'shared' (the run's share of the farm's costs); energy and water null while
        // pending, water null with no water price (never a partial or a false 0)
        return {
          total: v.costs, byCategory: v.byCategory,
          energy: v.pending ? null : v.parts.energy,
          water: v.pending || data.prices.water === null ? null : v.parts.water,
          income: v.income, profit: v.profit, profitPerKg: v.profitPerKg,
        };
      }
      const a = from ?? firstDayOf(monthOf(t));
      const b = to ?? t;
      if (!isDate(a) || a > t) throw new CostError(400, 'from must be a date up to today', 'from');
      if (!isDate(b) || b < a || b > t) throw new CostError(400, 'to must be a date from `from` to today', 'to');
      return summaryOf(figuresOf(a, b, dataFor(addDays(a, -MAX_BILL_DAYS))));
    },

    // A promise for the usage warms under way (tests).
    warmed: () => Promise.all([...warming.values()].map((job) => job.done)),


    // Stops the usage warms at their next day and starts no more (the server closing: the database goes next).
    stop() {
      stopping.abort();
    },

    // fn() after any write here or a usage warm done (the figures can be worked out now); → a function that stops it.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
