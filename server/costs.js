// Costs (spec 2026-11-05-costs-design.md): the costs entered by hand (one-offs and monthly items: add, edit, change from a
// month, stop, delete) and the views that work out the figures on each read (part 2) from them, the runs, the harvests, the
// measured energy and water, and the other modules' rows (server/costs-sources.js). No HTTP.

import { addDays, daysBetween } from './task-rules.js';
import { readSettings, readCropYield } from './settings.js';
import { roomDays, warmRoom, localZone, USAGE_DAYS_KEPT } from './usage.js';
import { checkWorker, TaskError } from './tasks.js';
import { checkEquipment, equipmentView } from './costs-equipment.js'; // ---- Money truth ----
import { askOrThrow, confirmedOf } from './asks.js'; // ---- Data integrity ----
import { record, reasonOf, voidedOf, APP } from './changes.js';
import { costDuplicateAsks, cropBalance, oversold, dayWords } from './integrity-math.js';
import { CROP_KEYS, cropShortName } from '../web/crops.js';
import { kgText } from '../web/harvest-math.js';
import { tariffOf } from './tariffs.js';
import { isClosable, closeDayOf, keptFigures, differs, changesReaching, askClosed, closedAsks } from './closes.js';
import { localDate } from './task-rules.js';
import {
  CATEGORIES, BILLS, monthOf, firstDayOf, lastDayOf, addMonths, monthName, chargeDate, chargesOf, runOn, runEnd, figuresOf,
  runTotals, summaryOf, CATEGORY_LABELS, billTopUp, runFirstMonth, csvRows, saleParts, SALE_DAYS,
} from './costs-math.js';

export const MAX_AMOUNT = 1_000_000;
export const MAX_NOTE = 200;
export const MAX_BILL_DAYS = 62;
// A bill's period near its date: from up to 92 days before it, to up to 31 days after it.
export const BILL_DAYS_BEFORE = 92;
export const BILL_DAYS_AFTER = 31;
const AMOUNT_MESSAGE = 'Enter an amount over RM 0, up to RM 1,000,000'; // web/costs-math.js says the same
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
const dayName = (d) => `${Number(d.slice(8))} ${monthName(d.slice(0, 7))}`;
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
  function dataFor(from, runs = runsOf()) {
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
      today: t, keptFrom: kept, prices: { electricity: electricityPrice, water: waterPrice }, rooms, runs,
      tariff: tariffOf(db), // ---- Data integrity ---- each day at its own price (energy-cost.js)
      costs: db.listCosts(), costsAll: db.listCostsAll(), usage,
      // ---- Data integrity ---- Not sold records, as the sales are dated (spec 6.1)
      notSold: db.liveNotSold().map((n) => ({ ...n, date: zone.label(n.at), total: 0 })), purchases: dated(src.purchases), sales: dated(src.sales), uses: dated(src.uses),
      equipment: db.listEquipment(), // ---- Money truth ---- the register, written off a month at a time
      // ---- Money truth ---- a batch row's cost lands on its placing day (date; null while it waits) or its losses' days
      batches: src.batches.map((b) => ({
        ...b, date: b.placedAt == null ? null : zone.label(b.placedAt), receivedDate: zone.label(b.receivedAt),
        lost: b.lost.map((l) => ({ ...l, date: zone.label(l.at) })),
      })),
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

  // A run as the page shows it, with its whole figures; repriced (Data integrity 8.3): the closed months it has a part in whose
  // figures moved since they closed.
  const runView = (r, figs, t) => ({
    id: r.id, roomId: r.roomId, roomName: r.roomName, startedAt: r.startedAt, endedAt: r.endedAt, crops: r.crops,
    ...runTotals(r, figs, t),
    repriced: db.monthCloses().map((c) => c.month).filter((m) => m >= runFirstMonth(r) && m <= monthOf(t) && figs(m).runs.has(r.id) && repriced(m, figs(m))),
  });

  // The month's charges of the costs entered by hand, newest first; an electricity or water bill with its topUp { amount,
  // month }: what it adds and the month it lands in (section 4), worked out from its own period.
  // Data integrity: a voided cost's charges are listed too, struck (voided), with no top-up; edits: how often it was changed.
  function entriesOf(month, data) {
    const edits = db.editCounts('cost');
    return data.costsAll.flatMap((c) => chargesOf(c, firstDayOf(month), lastDayOf(month), data.today).map(({ date }) => ({
      costId: c.id, date, category: c.category, label: CATEGORY_LABELS[c.category], worker: c.worker, note: c.note,
      roomId: c.roomId, roomName: c.roomId === null ? null : data.rooms.get(c.roomId) ?? null, amount: c.amount,
      repeat: c.repeat, utility: c.utility, periodFrom: c.periodFrom, periodTo: c.periodTo,
      ...(c.category === 'utilities' && BILLS.includes(c.utility) && c.voidedAt === null ? { topUp: billTopUp(c, data) } : {}),
      voided: voidedOf(c), edits: edits.get(c.id) ?? 0,
    }))).sort((a, b) => (a.date === b.date ? b.costId - a.costId : a.date < b.date ? 1 : -1));
  }

  // Who was paid: the tasks' rule (an active worker when the farm has a list); no name is "Pick who was paid" here.
  function workerOf(worker) {
    try {
      return checkWorker(db, worker);
    } catch (err) {
      if (err instanceof TaskError) throw new CostError(err.status, err.message === 'Pick who did it' ? 'Pick who was paid' : err.message, 'worker');
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
    if (!isDate(date)) throw new CostError(400, 'Pick a date up to today', 'date');
    // The date's bounds apply to a date the body gives that differs from the stored one: a Change from this month can store a
    // day later this month (31 → 30 Nov on 15 Nov), and an old cost stays editable whatever its date.
    if (!old || date !== old.date) {
      const lowest = firstDayOf(monthOf(keptFrom()));
      if (date > t) throw new CostError(400, 'Pick a date up to today', 'date');
      if (date < lowest) throw new CostError(400, `Pick a date from ${dayName(lowest)} to today`, 'date');
    }
    const category = pick('category');
    if (!CATEGORIES.includes(category)) throw new CostError(400, 'Pick a category', 'category');
    const given = pick('amount');
    const amount = typeof given === 'number' && Number.isFinite(given) ? Math.round(given * 100) / 100 : NaN;
    if (!(amount > 0 && amount <= MAX_AMOUNT)) throw new CostError(400, AMOUNT_MESSAGE, 'amount');
    const roomId = pick('roomId') ?? null;
    if (roomId !== null && !(Number.isInteger(roomId) && db.getRoom(roomId))) throw new CostError(400, 'That container no longer exists', 'roomId');
    const text = pick('note') ?? '';
    if (typeof text !== 'string') throw new CostError(400, 'The note must be text', 'note');
    const note = text.trim();
    if (note.length > MAX_NOTE) throw new CostError(400, `The note must be at most ${MAX_NOTE} characters`, 'note');
    if (old && b.repeat !== undefined && (b.repeat ?? null) !== old.repeat) {
      throw new CostError(400, 'Repeat changes through Change or Stop', 'repeat');
    }
    const repeat = old ? old.repeat : (b.repeat ?? null);
    if (repeat !== null && repeat !== 'monthly') throw new CostError(400, 'Repeat must be monthly or none', 'repeat');
    const repeatUntil = old?.repeatUntil ?? null;
    if (repeatUntil !== null && repeatUntil < monthOf(date)) throw new CostError(400, `Pick a date up to ${monthName(repeatUntil)}, its last month`, 'date');
    const utility = category === 'utilities' ? pick('utility') : null;
    if (category === 'utilities' && !UTILITIES.includes(utility)) throw new CostError(400, 'Pick electricity, water or other', 'utility');
    const bill = category === 'utilities' && BILLS.includes(utility);
    if (bill && repeat) throw new CostError(400, 'An electricity or water bill is entered each month', 'repeat');
    if (bill && roomId !== null) throw new CostError(400, 'A bill is the whole farm’s', 'roomId');
    // the worker is checked when the body gives another or the cost becomes labour (a worker made inactive since keeps their old costs)
    const w = pick('worker');
    const worker = category !== 'labour' ? null : old && old.category === 'labour' && w === old.worker ? old.worker : workerOf(w);
    let periodFrom = null;
    let periodTo = null;
    if (bill) {
      periodFrom = pick('periodFrom') ?? firstDayOf(monthOf(date));
      periodTo = pick('periodTo') ?? lastDayOf(monthOf(date));
      if (!isDate(periodFrom)) throw new CostError(400, 'Pick the first day the bill covers', 'periodFrom');
      if (periodFrom < addDays(date, -BILL_DAYS_BEFORE)) {
        throw new CostError(400, `Pick a first day up to ${BILL_DAYS_BEFORE} days before the bill’s date`, 'periodFrom');
      }
      if (!isDate(periodTo) || periodTo < periodFrom || daysBetween(periodFrom, periodTo) + 1 > MAX_BILL_DAYS) {
        throw new CostError(400, `Pick the last day the bill covers, up to ${MAX_BILL_DAYS} days after the first`, 'periodTo');
      }
      if (periodTo > addDays(date, BILL_DAYS_AFTER)) {
        throw new CostError(400, `Pick a last day up to ${BILL_DAYS_AFTER} days after the bill’s date`, 'periodTo');
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
    if (c.voidedAt !== null) throw new CostError(409, 'Restore it first');
    if (c.repeat !== 'monthly') throw new CostError(400, 'This cost is not a monthly item');
    return c;
  }

  // ---- Data integrity (spec 2026-11-12-data-integrity-design.md 3 to 5) ----
  // The crops sold and not sold above their picks (+5 %) by the month's last day (today in this month): a note each (5.3).
  function oversoldNotes(m) {
    const t = today();
    const end = lastDayOf(m) < t ? lastDayOf(m) : t;
    const notSold = db.liveNotSold();
    const out = [];
    for (const crop of CROP_KEYS) {
      const sales = db.cropSales(crop);
      if (!sales.length && !notSold.some((n) => n.crop === crop)) continue; // over through Not sold alone counts too
      const b = cropBalance({ picks: db.cropHarvestsBetween(crop, -8.64e15, 8.64e15), sales: sales.map((s) => ({ kg: s.kg, soldAt: s.soldAt })),
        notSold: notSold.filter((n) => n.crop === crop) }, end);
      if (b.firstAt === null || !oversold(b)) continue;
      const exact = (kg) => kgText(kg, { exact: true });
      out.push({ kind: 'oversold', crop, text: `${cropShortName(crop)}: ${exact(Math.round((b.sold + b.notSold) * 100) / 100)} sold or not sold to ${dayWords(end)} against ${exact(b.picked)} picked. Check the sales.` });
    }
    return out;
  }
  // Closed months (8.3): each of `months` past its close day with no kept figures, and not pending, keeps them now.
  function closeMonths(months, figs) {
    const t = today();
    for (const m of months) {
      if (!isClosable(m, t) || db.monthClose(m)) continue;
      const f = figs(m);
      if (!f.pending) db.putMonthClose(m, now(), keptFigures(f));
    }
  }
  // A closed month whose figures moved since: { closedAt, was: { income, costs, profit }, now: { … }, changes: [entries] }; null
  // otherwise (or while pending).
  function repriced(m, f) {
    const kept = db.monthClose(m);
    if (!kept || f.pending) return null;
    const live = keptFigures(f);
    if (!differs(kept.figures, live)) return null;
    const pick = (x) => ({ income: x.income, costs: x.costs, profit: x.profit });
    return { closedAt: kept.closedAt, closedOn: closeDayOf(m), was: pick(kept.figures), now: pick(live), changes: changesReaching(db, m, kept.closedAt, { localDate, today: today() }) };
  }
  function equipmentOf(id) {
    const e = db.getEquipment(id);
    if (!e) throw new CostError(404, 'Equipment not found');
    return e;
  }
  const equipmentSnapshot = (e) => {
    const { createdAt, voidedAt, voidedBy, voidReason, ...rest } = e;
    return { ...rest, roomName: e.roomId === null ? null : db.getRoom(e.roomId)?.name ?? null };
  };
  // The days a cost charges (8.3's ask): a one-off its date; a monthly item its first to its last month (today while it runs);
  // a bill its period too (its top-up lands in the period's months).
  const daysOfCost = (c) => {
    const d = c.repeat ? { from: c.date, to: c.repeatUntil ? lastDayOf(c.repeatUntil) : today() } : { from: c.date, to: c.date };
    return c.periodFrom && c.periodTo ? { from: [d.from, c.periodFrom].sort()[0], to: [d.to, c.periodTo].sort()[1] } : d;
  };
  // A cost as its change entries keep it.
  const snapshotOf = (c) => {
    const { createdAt, voidedAt, voidedBy, voidReason, sourceKind, sourceId, ...rest } = c;
    return { ...rest, roomName: c.roomId === null ? null : db.getRoom(c.roomId)?.name ?? null };
  };
  // A one-off's duplicate (5.2): another cost not voided of the same date, category, amount and place. self: an edit's own.
  function costAsks(fields, self = null) {
    const others = db.listCosts().filter((o) => o.id !== self).map((o) => ({ ...o, by: db.addOf('cost', o.id)?.by ?? null }));
    return costDuplicateAsks(fields, others, { label: CATEGORY_LABELS[fields.category] });
  }
  const writeLogged = (who, entry, write) => db.transaction(() => {
    const out = write();
    record(db, who, now(), entry(out));
    return out;
  });
  // `from` (change): its first month (edited in place) to this month; `after` (stop): its first month to this month; both
  // only to its last month when stopped earlier (a Stop only shortens).
  function monthIn(value, c, field) {
    const lowest = monthOf(c.date);
    const current = monthOf(today());
    const last = c.repeatUntil && c.repeatUntil < current ? c.repeatUntil : current;
    if (!isMonth(value) || value < lowest || value > last) throw new CostError(400, `Pick a month from ${monthName(lowest)} to ${monthName(last)}`, field);
    return value;
  }

  // A month asked for ('YYYY-MM', default this month) among the months kept, else a 400 on 'month'.
  function monthAsked(month) {
    const current = monthOf(today());
    const first = monthOf(keptFrom());
    const m = month ?? current;
    if (!isMonth(m) || m > current || m < first) throw new CostError(400, `Pick a month from ${monthName(first)} to ${monthName(current)}`, 'month');
    return m;
  }

  const service = {
    // Every cost, voided ones too (the edit dialogs), each with its void.
    list() {
      return db.listCostsAll().map((c) => ({ ...c, voided: voidedOf(c) }));
    },

    // { ...fields, confirmed? } by who (the signed-in person). A one-off like another asks first (Data integrity 5.2).
    add(body, who = APP) {
      const fields = fieldsOf(body);
      askOrThrow([...costAsks(fields), ...closedAsks(db, [daysOfCost(fields)], 'date')], confirmedOf(body));
      const made = writeLogged(who, (c) => ({ kind: 'cost', rowId: c.id, action: 'add', after: snapshotOf(c) }), () => db.insertCost(fields, now()));
      tell();
      return made;
    },

    edit(id, body, who = APP) {
      const old = costOf(id);
      if (old.voidedAt !== null) throw new CostError(409, 'Restore it first');
      const fields = fieldsOf(body, old);
      const moves = ['date', 'category', 'amount', 'roomId', 'periodFrom', 'periodTo'].some((k) => fields[k] !== old[k]); // a note alone moves no figure
      askOrThrow([...costAsks(fields, id), ...(moves ? closedAsks(db, [daysOfCost(fields), daysOfCost(old)], 'date') : [])], confirmedOf(body));
      const row = writeLogged(who, (c) => ({ kind: 'cost', rowId: id, action: 'edit', before: snapshotOf(old), after: snapshotOf(c) }),
        () => db.updateCost(id, fields));
      tell();
      return row;
    },

    // A cost is never deleted: voided (Data integrity 4.3).
    remove(id) {
      costOf(id);
      throw new CostError(409, 'Void it instead: a money record is kept.');
    },

    // Void a cost { reason }: it stays listed, struck, and leaves every figure (a monthly item: every month). → the cost.
    voidCost(id, body, who = APP) {
      const old = costOf(id);
      if (old.voidedAt !== null) throw new CostError(409, 'This cost is voided already');
      const reason = reasonOf(body, { words: 'Say why you void it', Err: CostError });
      askClosed(db, [daysOfCost(old)], body, 'date');
      const row = writeLogged(who, () => ({ kind: 'cost', rowId: id, action: 'void', before: snapshotOf(old), reason }), () => {
        db.voidRow('costs', id, { at: now(), by: who.name, reason });
        return db.getCost(id);
      });
      tell();
      return { ...row, voided: voidedOf(row) };
    },

    restoreCost(id, body, who = APP) {
      const old = costOf(id);
      if (old.voidedAt === null) throw new CostError(409, 'This cost is not voided');
      const reason = reasonOf(body ?? {}, { required: false, Err: CostError });
      askClosed(db, [daysOfCost(old)], body, 'date');
      const row = writeLogged(who, (c) => ({ kind: 'cost', rowId: id, action: 'restore', before: snapshotOf(c), reason }), () => {
        db.restoreRow('costs', id);
        return db.getCost(id);
      });
      tell();
      return { ...row, voided: null };
    },

    // A monthly item's new amount (and note) from a month (section 2.1): from its first month, edited in place ({ ended:
    // null, started: the item }); later, it ends the month before and a new one starts. → { ended, started }.
    change(id, body, who = APP) {
      const c = monthlyOf(id);
      const b = bodyOf(body);
      const from = monthIn(b.from, c, 'from');
      askClosed(db, [{ from: firstDayOf(from), to: today() }], body, 'from');
      if (b.amount === undefined) throw new CostError(400, AMOUNT_MESSAGE, 'amount');
      const fields = fieldsOf({ amount: b.amount, note: b.note ?? c.note }, c);
      if (from === monthOf(c.date)) {
        const started = writeLogged(who, (x) => ({ kind: 'cost', rowId: id, action: 'edit', before: snapshotOf(c), after: snapshotOf(x) }),
          () => db.updateCost(id, fields));
        tell();
        return { ended: null, started };
      }
      const changed = db.transaction(() => {
        const out = db.changeCost(id, addMonths(from, -1), { ...fields, date: chargeDate(c.date, from) }, now());
        record(db, who, now(), { kind: 'cost', rowId: id, action: 'change', before: snapshotOf(c), after: { ...snapshotOf(out.ended), from, amount: out.started.amount } });
        record(db, who, now(), { kind: 'cost', rowId: out.started.id, action: 'add', after: snapshotOf(out.started) });
        return out;
      });
      tell();
      return changed;
    },

    // A monthly item's last month (section 2.1). → the item.
    stopItem(id, body, who = APP) {
      const c = monthlyOf(id);
      const after = monthIn(bodyOf(body).after, c, 'after');
      askClosed(db, [{ from: firstDayOf(addMonths(after, 1)), to: today() }], body, 'after');
      const row = writeLogged(who, (x) => ({ kind: 'cost', rowId: id, action: 'stop', before: snapshotOf(c), after: snapshotOf(x) }), // the item whole: its date reaches the months it charged (What changed)
        () => db.stopCost(id, after));
      tell();
      return row;
    },

    // GET /api/costs/month (section 5): the month's tiles, notes, lines by category, entries, monthly items, runs (their whole
    // figures) and the last 12 months' profit (none before the usage days kept). month: 'YYYY-MM', default this month.
    monthView({ month = null } = {}) {
      const t = today();
      const first = monthOf(keptFrom());
      const m = monthAsked(month);
      const all = runsOf();
      const inMonth = (r) => r.startDate <= lastDayOf(m) && runEnd(r, t) >= firstDayOf(m);
      const shown = all.filter(inMonth);
      // Not capped at the kept months: a run's totals sum its sales, batches and harvests from before its start (its blocks
      // come first: runFirstMonth), so the window reaches the oldest shown run's first month (the work is linear in that run's
      // age; only the usage days are capped, in dataFor). The bills' periods reach MAX_BILL_DAYS before a month.
      const earliest = [addMonths(m, -11), ...shown.map(runFirstMonth)].sort()[0];
      const data = dataFor(addDays(firstDayOf(earliest), -MAX_BILL_DAYS), all);
      const runs = data.runs.filter(inMonth);
      const figs = monthsOf(data);
      const f = figs(m);
      const months = Array.from({ length: 12 }, (_, i) => addMonths(m, i - 11)).filter((x) => x >= first);
      // ---- Data integrity ---- (8.3) the months shown that have closed keep their figures; one moved since is re-priced
      closeMonths(months, figs);
      const repricedOf = (x) => repriced(x, figs(x));
      return {
        month: m, today: t, first,
        tiles: {
          income: f.income, costs: f.costs, profit: f.profit, costPerKg: f.costPerKg, profitPerKg: f.profitPerKg,
          kgHarvested: f.kgHarvested, kgSold: f.kgSold, unsold: f.unsold, incomplete: f.incomplete,
          writeOff: f.writeOff, profitBeforeWriteOff: f.profitBeforeWriteOff, // ---- Money truth ---- the register's
        },
        notes: [...f.notes, ...oversoldNotes(m)], byCategory: f.byCategory, pending: f.pending,
        kWh: f.kWh, repriced: repricedOf(m), // ---- Data integrity ---- the month's kWh (measured, estimated, unseen); re-priced
        bought: f.bought, // ---- Money truth ---- what was bought for stock: a cash line, not a cost
        entries: entriesOf(m, data),
        repeating: data.costs.filter((c) => c.repeat === 'monthly' && monthOf(c.date) <= m && (c.repeatUntil === null || c.repeatUntil >= m))
          .map((c) => ({ ...c, roomName: c.roomId === null ? null : data.rooms.get(c.roomId) ?? null })),
        runs: runs.map((r) => runView(r, figs, t)),
        last12: months.map((x) => {
          const g = figs(x);
          return { month: x, income: g.income, costs: g.costs, profit: g.profit, pending: g.pending, repriced: repricedOf(x) !== null };
        }),
      };
    },

    // GET /api/costs/summary (the contract's shape): over [from, to] (default this month to today), or a run's whole figures.
    summary({ from = null, to = null, run = null } = {}) {
      const t = today();
      if (run !== null) {
        const r = runsOf().find((x) => x.id === run);
        if (!r) throw new CostError(404, 'Run not found');
        const data = dataFor(addDays(firstDayOf(runFirstMonth(r)), -MAX_BILL_DAYS));
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
      if (!isDate(b) || b < a || b > t) throw new CostError(400, 'to must be a date from the start date to today', 'to');
      return summaryOf(figuresOf(a, b, dataFor(addDays(a, -MAX_BILL_DAYS))));
    },

    // GET /api/costs.csv (2026-11-05, the Business audit): the month's costs and income to today, as monthView counts them.
    // A day not worked out yet is waited for once (the warm it starts), so the measured lines come whole when they can.
    // → { name: 'costs YYYY-MM.csv', text } (the route adds the BOM).
    async csv({ month = null } = {}) {
      const m = monthAsked(month);
      const figures = () => {
        const t = today();
        const data = dataFor(addDays(firstDayOf(m), -MAX_BILL_DAYS));
        return { data, f: figuresOf(firstDayOf(m), lastDayOf(m) < t ? lastDayOf(m) : t, data) };
      };
      let { data, f } = figures();
      if (f.pending) {
        await Promise.all([...warming.values()].map((job) => job.done));
        ({ data, f } = figures());
      }
      return { name: `costs ${m}.csv`, text: `${csvRows(f, data).join('\r\n')}\r\n` };
    },

    // ---- Runs ---- (spec 2026-11-05-runs-design.md 3): every run's whole figures from one read, as monthView's runs give
    // them (the months worked out once for all the runs); run: that run's alone, [] when there is no such run.
    runViews({ run = null } = {}) {
      const t = today();
      const all = runsOf();
      const runs = run === null ? all : all.filter((r) => r.id === run);
      if (!runs.length) return [];
      const earliest = runs.map(runFirstMonth).sort()[0];
      const figs = monthsOf(dataFor(addDays(firstDayOf(earliest), -MAX_BILL_DAYS), all));
      return runs.map((r) => runView(r, figs, t));
    },
    // ---- end Runs ----

    // ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 7) Every sale line's runs (Costs' sale steps), all time:
    // { parts: Map sale id → [{ runId, share, how, total, kg }], untied: { total, kg, count } } (crop: that crop's lines only).
    // run: only the lines that can reach that run (its own, or its crops' sold from its start to SALE_DAYS after its end).
    saleTies({ crop = null, run = null } = {}) {
      const ALL = [-8.64e15, 8.64e15];
      const runs = runsOf();
      const one = run === null ? null : runs.find((r) => r.id === run) ?? null;
      const until = one ? addDays(runEnd(one, today()), SALE_DAYS) : null;
      const reaches = (s, date) => !one || s.runId === one.id
        || (one.crops.some((c) => c.crop === s.crop) && date >= one.startDate && date <= until);
      // the picks the lines' 14-day windows can see: one run's span (a margin each side), else all
      const span = one ? [Date.parse(`${addDays(one.startDate, -SALE_DAYS)}T00:00:00Z`) - DAY, Date.parse(`${until}T00:00:00Z`) + 2 * DAY] : ALL;
      const data = {
        today: today(), runs,
        harvests: (crop === null ? db.harvestsBetween(...span) : db.cropHarvestsBetween(crop, ...span)).map((h) => ({ roomId: h.roomId, runId: h.runId, date: zone.label(h.pickedAt), kg: h.kg, crop: h.crop })),
      };
      const parts = new Map();
      const untied = { total: 0, kg: 0, count: 0 };
      for (const s of db.salesBetween(...ALL)) {
        if (crop !== null && s.crop !== crop) continue;
        const date = zone.label(s.soldAt);
        if (!reaches(s, date)) continue;
        const p = saleParts({ ...s, date }, data);
        if (p.length) parts.set(s.id, p);
        else Object.assign(untied, { total: Math.round((untied.total + s.total) * 100) / 100, kg: Math.round((untied.kg + s.kg) * 100) / 100, count: untied.count + 1 });
      }
      return { parts, untied };
    },
    // ---- end Money truth ----

    // ---- Data integrity ---- (spec 8.3) the closed-month ask of a write that reprices days { from, to } (the tariff's)
    closedAsk(days, body) {
      askClosed(db, [days], body, 'from');
    },

    // Keep a re-priced month's new figures (8.3): { reason? } by who. → the month's view.
    keepMonth(month, body, who = APP) {
      const kept = isMonth(month) ? db.monthClose(month) : null;
      if (!kept) throw new CostError(404, 'That month is not closed');
      const view = service.monthView({ month });
      if (view.pending) throw new CostError(409, 'Its figures are still being worked out');
      const reason = reasonOf(body ?? {}, { required: false, Err: CostError });
      const data = dataFor(addDays(firstDayOf(addMonths(month, -11)), -MAX_BILL_DAYS));
      const figs = monthsOf(data);
      const now2 = keptFigures(figs(month));
      db.transaction(() => {
        db.putMonthClose(month, now(), now2);
        record(db, who, now(), {
          kind: 'month', rowId: Number(month.replace('-', '')), action: 'keep',
          before: { income: kept.figures.income, costs: kept.figures.costs, profit: kept.figures.profit },
          after: { income: now2.income, costs: now2.costs, profit: now2.profit }, reason,
        });
      });
      tell();
      return service.monthView({ month });
    },

    // ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 6) The equipment register: { items: [equipmentView] },
    // newest bought first; add, edit and remove tell (the figures change).
    // Data integrity: voided items too, struck (voided), with how often each was changed.
    equipment() {
      const t = today();
      const rooms = new Map(db.listRooms().map((r) => [r.id, r.name]));
      const edits = db.editCounts('equipment');
      return {
        items: db.listEquipmentAll().toReversed().map((e) => ({
          ...equipmentView(e, t, e.roomId === null ? null : rooms.get(e.roomId) ?? null), voided: voidedOf(e), edits: edits.get(e.id) ?? 0,
        })),
      };
    },
    addEquipment(body, who = APP) {
      const fields = checkEquipment(body, { today: today(), roomOf: (id) => db.getRoom(id), fail: (...a) => { throw new CostError(...a); } });
      askClosed(db, [{ from: fields.boughtOn, to: today() }], body, 'boughtOn');
      const made = writeLogged(who, (e) => ({ kind: 'equipment', rowId: e.id, action: 'add', after: equipmentSnapshot(e) }),
        () => db.insertEquipment(fields, now()));
      tell();
      return made;
    },
    editEquipment(id, body, who = APP) {
      const old = equipmentOf(id);
      if (old.voidedAt !== null) throw new CostError(409, 'Restore it first');
      const fields = checkEquipment(body, { old, today: today(), roomOf: (x) => db.getRoom(x), fail: (...a) => { throw new CostError(...a); } });
      if (['boughtOn', 'amount', 'resale', 'lifeMonths', 'roomId'].some((k) => fields[k] !== old[k])) { // a name or note alone moves no figure
        askClosed(db, [{ from: fields.boughtOn < old.boughtOn ? fields.boughtOn : old.boughtOn, to: today() }], body, 'boughtOn');
      }
      const row = writeLogged(who, (e) => ({ kind: 'equipment', rowId: id, action: 'edit', before: equipmentSnapshot(old), after: equipmentSnapshot(e) }),
        () => db.updateEquipment(id, fields));
      tell();
      return row;
    },
    // An item is never deleted: voided (Data integrity 4.3).
    removeEquipment(id) {
      equipmentOf(id);
      throw new CostError(409, 'Void it instead: a money record is kept.');
    },
    voidEquipment(id, body, who = APP) {
      const old = equipmentOf(id);
      if (old.voidedAt !== null) throw new CostError(409, 'This item is voided already');
      const reason = reasonOf(body, { words: 'Say why you void it', Err: CostError });
      askClosed(db, [{ from: old.boughtOn, to: today() }], body, 'boughtOn');
      const row = writeLogged(who, () => ({ kind: 'equipment', rowId: id, action: 'void', before: equipmentSnapshot(old), reason }), () => {
        db.voidRow('equipment', id, { at: now(), by: who.name, reason });
        return db.getEquipment(id);
      });
      tell();
      return { ...row, voided: voidedOf(row) };
    },
    restoreEquipment(id, body, who = APP) {
      const old = equipmentOf(id);
      if (old.voidedAt === null) throw new CostError(409, 'This item is not voided');
      const reason = reasonOf(body ?? {}, { required: false, Err: CostError });
      askClosed(db, [{ from: old.boughtOn, to: today() }], body, 'boughtOn');
      const row = writeLogged(who, (e) => ({ kind: 'equipment', rowId: id, action: 'restore', before: equipmentSnapshot(e), reason }), () => {
        db.restoreRow('equipment', id);
        return db.getEquipment(id);
      });
      tell();
      return { ...row, voided: null };
    },
    // ---- end Money truth ----

    // ---- Data integrity ---- (8.3) the daily tick: last month's figures kept once it is closable, though nobody opened Costs
    // (its view keeps the closable months it shows). While its usage is still being worked out, the next tick or read keeps it.
    closeDue() {
      const t = today();
      const prev = addMonths(monthOf(t), -1);
      if (isClosable(prev, t) && !db.monthClose(prev)) service.monthView({ month: prev });
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
  return service;
}
