// Harvests (spec 2026-11-04-harvest-design.md 3, 4 and 6): recorded from a harvest check's Done or by hand, edited and
// deleted with their task's total kept, and the room and farm views with their figures. No HTTP.

import { localDate, dayStart, addDays, daysBetween } from './task-rules.js';
import { CROP_KEYS } from '../web/crops.js';
import { readSettings, readCropYield } from './settings.js';
import { roomDays, warmRoom, totals, localZone, USAGE_DAYS_KEPT } from './usage.js';
import { runFigures, buckets, recordRows, csvRows, valueOf, unpricedOf, round, costPerKgOf } from './harvest-math.js';
import { checkWorker, TaskError } from './tasks.js';
import { askOrThrow, confirmedOf } from './asks.js'; // ---- Data integrity ----
import { record as logChange, reasonOf, voidedOf, APP } from './changes.js';
import { roomPickAsks, harvestSnapshot } from './harvest-asks.js';
import { tariffOf } from './tariffs.js';
import { closedAsks, askClosed } from './closes.js';

export const MAX_KG = 10_000;
export const RANGES = [7, 30, 90, 365];

// A refused request: status 400, 404 or 409, field the input it is about (the routes reply { error, field }).
export class HarvestError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'HarvestError';
    this.status = status;
    this.field = field;
  }
}

// The days query of the farm view and the CSV: one of RANGES.
function daysOf(days) {
  if (!RANGES.includes(days)) throw new HarvestError(400, 'days must be 7, 30, 90 or 365', 'days');
  return days;
}

const bodyOf = (body) => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HarvestError(400, 'Body must be a JSON object');
  return body;
};

// kg: a number over 0 up to MAX_KG once rounded to 3 places (0.0004 is 0, refused).
function kgOf(v, field = 'kg') {
  const kg = typeof v === 'number' && Number.isFinite(v) ? round(v, 3) : NaN;
  if (!(kg > 0 && kg <= MAX_KG)) throw new HarvestError(400, 'kg must be a number over 0 up to 10,000', field);
  return kg;
}

// A harvest's cost from the usage days: { cost (electricity and water when a water price is set), days, water, none? }; none:
// 'no-energy' when the days used no kWh and no water (nothing recorded), so there is no cost per kg to show; 'pending' (cost
// null) while a day is still being worked out in the background (roomDays' cachedOnly).
const costOf = (days, prices) => {
  if (days.some((d) => d.pending)) return { cost: null, days: days.length, water: prices.water !== null, none: 'pending' };
  const t = totals(days, prices);
  const none = t.kWh === 0 && t.waterL === 0 ? { none: 'no-energy' } : {};
  // Data integrity (7.2): what of it is estimated (RM), and the time the room was not seen, when any
  const unseenMs = days.reduce((sum, d) => sum + (d.unseenMs ?? 0), 0);
  const parts = { ...(t.estimated > 0 ? { estimated: t.estimated } : {}), ...(unseenMs > 0 ? { unseenMs } : {}) };
  return { cost: round(t.cost + (t.waterCost ?? 0), 2), days: days.length, water: prices.water !== null, ...none, ...parts };
};

const ordered = (crops) => CROP_KEYS.filter((k) => crops.has(k));

// db: the farm database; now and zone are injectable. zone: the usage days are in the host's zone like the Usage tab; the
// containers run on the farm's time (TZ in compose.yaml), so they are the farm's days.
// batchDryKg(runId): { <crop>: dry kg per block } from the run's batches (spec 2026-11-05-batches-design.md 3.2), which
// replaces Settings → Yield's figure for that run and crop.
export function createHarvests({ db, now = Date.now, zone = localZone, log = console.error, batchDryKg = () => ({}) }) {
  const listeners = new Set();

  function tell(roomId) {
    for (const fn of [...listeners]) {
      try {
        fn(roomId);
      } catch (err) {
        log(err);
      }
    }
  }

  // The rooms whose usage days are being worked out (roomId → { count, more, done }): the views never work out a cold day in
  // the request (a year of one-second readings takes seconds); they start a warm, one at a time a room, that tells the room
  // when done. A view that wants more days than the warm under way works them out next (`more`), before the room is told.
  const warming = new Map();
  const stopping = new AbortController();
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
        if (!stopping.signal.aborted) tell(roomId);
      } catch (err) {
        warming.delete(roomId);
        log(err);
      }
    })();
  }
  // The room's usage days back `count` days, the ones not worked out yet pending (and a warm started for them).
  function usageDaysOf(room, count) {
    const days = roomDays(db, room, { now: now(), zone, count, cachedOnly: true });
    if (days.some((d) => d.pending)) warm(room.id, count);
    return days;
  }

  const prices = () => {
    const { electricityPrice, waterPrice } = readSettings(db);
    return { electricity: electricityPrice, water: waterPrice, tariff: tariffOf(db) }; // Data integrity: each day at its own price
  };

  // A run's yield figures: a crop whose batches in the run all have a weight takes their dry kg per block (spec
  // 2026-11-05-batches-design.md 3.2); its price, and every other crop, as Settings → Yield.
  function yieldOf(cropYield, runId) {
    const out = { ...cropYield };
    for (const [crop, dryKg] of Object.entries(batchDryKg(runId))) out[crop] = { priceKg: null, ...cropYield[crop], dryKg };
    return out;
  }

  // Who picked it: the tasks' rule (an active worker when the farm has a list).
  function workerOf(worker) {
    try {
      return checkWorker(db, worker);
    } catch (err) {
      if (err instanceof TaskError) throw new HarvestError(err.status, err.message, err.field);
      throw err;
    }
  }

  // A pick time: whole ms from the run's start to its end, or to now while it is open.
  function timeOf(v, run) {
    const to = Math.min(run.endedAt ?? Infinity, now());
    if (!Number.isInteger(v) || v < run.startedAt || v > to) {
      throw new HarvestError(400, run.endedAt === null ? "Pick a time from the run's start to now" : "Pick a time from the run's start to its end", 'pickedAt');
    }
    return v;
  }

  // The harvest `id` or a 404.
  function harvestOf(id) {
    const h = db.getHarvest(id);
    if (!h) throw new HarvestError(404, 'Harvest not found');
    return h;
  }

  // A run as the room view shows it, its cost from the room's usage days (null: the run started before the days kept).
  // Its figures count the harvests not voided; its list holds the voided ones too (struck: voided, edits; Data integrity).
  function runView(run, cropYield, usageDays, prices, edits = db.editCounts('harvest'), notSoldEdits = db.editCounts('not-sold')) {
    const today = zone.label(now());
    const [from, to] = [zone.label(run.startedAt), run.endedAt === null ? today : zone.label(run.endedAt)];
    const usage = daysBetween(from, today) + 1 > USAGE_DAYS_KEPT ? null : costOf(usageDays.filter((d) => d.date >= from && d.date <= to), prices);
    const harvests = db.runHarvests(run.id);
    return {
      id: run.id, startedAt: run.startedAt, endedAt: run.endedAt, partial: run.partial, blocksInAt: run.blocksInAt ?? null, crops: run.crops,
      ...runFigures(run, harvests, yieldOf(cropYield, run.id), usage),
      harvests: db.runHarvestsAll(run.id).toReversed().map((h) => ({ ...plainOf(h), voided: voidedOf(h), edits: edits.get(h.id) ?? 0 })),
      // Data integrity (10): the Not sold records tied to the run, voided ones too, newest first
      notSold: db.runNotSold(run.id).toReversed().map(({ createdAt, ...r }) => ({ ...r, edits: notSoldEdits.get(r.id) ?? 0 })),
    };
  }

  // ---- Data integrity (spec 2026-11-12-data-integrity-design.md 3 to 5) ----
  // A harvest as the API shows it (without the void's columns) and as its change entries keep it.
  const plainOf = ({ voidedAt, voidedBy, voidReason, ...h }) => h;
  const snapshotOf = (h) => harvestSnapshot(db, h);
  const picksAsks = (roomId, pick, opts) => roomPickAsks(db, roomId, pick, opts);

  // The farm's range of `days` (buckets()'s from and to, farm dates) and its harvests, with the last 30 days' for the
  // Overview card: { range, harvests (in the range), recent (the last 30 days), rooms, runs } (rooms and runs: Maps by id).
  function period(days) {
    const t = now();
    const range = buckets([], { days, to: t });
    const today = localDate(t);
    const since = addDays(today, -29) < range.from ? addDays(today, -29) : range.from;
    const all = db.harvestsBetween(dayStart(since), dayStart(addDays(today, 1)) - 1);
    const harvests = all.filter((h) => h.pickedAt >= dayStart(range.from));
    // Data integrity: the range's voided harvests, for the records table only (struck)
    const voided = db.harvestsBetweenAll(dayStart(range.from), dayStart(addDays(today, 1)) - 1).filter((h) => h.voidedAt !== null)
      .map((h) => ({ ...plainOf(h), voided: voidedOf(h) }));
    const runs = new Map();
    for (const h of [...harvests, ...voided]) if (!runs.has(h.runId)) runs.set(h.runId, db.getRunById(h.runId));
    const rooms = new Map(db.listRooms().map((r) => [r.id, r]));
    return {
      range: buckets(harvests, { days, to: t }), today, harvests, voided, recent: all.filter((h) => h.pickedAt >= dayStart(addDays(today, -29))), rooms, runs,
    };
  }

  return {
    // Record a harvest: { crop (one of the open run's), kg, worker, pickedAt? (default now), confirmed? }, by who (a worker:
    // themselves). A likely duplicate or a heavy pick asks first (Data integrity 5.2). → the harvest.
    record(roomId, body, who = APP) {
      if (!db.getRoom(roomId)) throw new HarvestError(404, 'Room not found');
      const run = db.openRun(roomId);
      const program = db.getProgram(roomId);
      if (!run || program.crops.length === 0) throw new HarvestError(409, 'No crops in this room');
      const { crop, kg, worker, pickedAt } = bodyOf(body);
      const own = run.crops.find((c) => c.crop === crop);
      if (!own) throw new HarvestError(400, "Pick one of the room's crops", 'crop');
      const fields = { kg: kgOf(kg), worker: workerOf(worker), pickedAt: pickedAt === undefined || pickedAt === null ? now() : timeOf(pickedAt, run) };
      askOrThrow([...picksAsks(roomId, { crop, kg: fields.kg, pickedAt: fields.pickedAt }, { blocks: own.blocks }),
        ...closedAsks(db, [localDate(fields.pickedAt)], 'pickedAt')], confirmedOf(body));
      // A back-dated pick takes the stage and flush as they are now: no stage history is kept.
      const h = db.transaction(() => {
        const made = db.insertHarvest({
          roomId, runId: run.id, crop, stage: program.stage, flush: program.flush, blocks: own.blocks, ...fields, taskId: null, at: now(),
        });
        logChange(db, who, now(), { kind: 'harvest', rowId: made.id, action: 'add', after: snapshotOf(made) });
        return made;
      });
      tell(roomId);
      return plainOf(h);
    },

    // A new kg or pick time: { kg?, pickedAt?, confirmed? }; a harvest from a check sets its task's amount to the new total.
    // A voided one is restored first; a new kg is asked about as a pick is. → the harvest.
    edit(id, body, who = APP) {
      const h = harvestOf(id);
      if (h.voidedAt !== null) throw new HarvestError(409, 'Restore it first');
      const { kg, pickedAt } = bodyOf(body);
      if (kg === undefined && pickedAt === undefined) throw new HarvestError(400, 'Give the kg or the time');
      const run = db.getRunById(h.runId);
      const fields = { kg: kg === undefined ? h.kg : kgOf(kg), pickedAt: pickedAt === undefined ? h.pickedAt : timeOf(pickedAt, run) };
      askOrThrow([
        ...(kg !== undefined && fields.kg !== h.kg ? picksAsks(h.roomId, { crop: h.crop, ...fields }, { blocks: h.blocks, self: id, dup: false }) : []),
        ...closedAsks(db, [localDate(fields.pickedAt), localDate(h.pickedAt)], 'pickedAt'),
      ], confirmedOf(body));
      const changed = db.transaction(() => {
        const out = db.updateHarvest(id, fields);
        if (out) logChange(db, who, now(), { kind: 'harvest', rowId: id, action: 'edit', before: snapshotOf(h), after: snapshotOf(out) });
        return out;
      });
      if (!changed) throw new HarvestError(404, 'Harvest not found');
      tell(h.roomId);
      return plainOf(changed);
    },

    // A harvest is never deleted: voided (Data integrity 4.3).
    remove(id) {
      harvestOf(id);
      throw new HarvestError(409, 'Void it instead: a money record is kept.');
    },

    // Void a harvest { reason } (the owner's): it stays in its run's list, struck, and leaves every figure; one from a check
    // sets its task's amount to the total left. → the harvest.
    voidHarvest(id, body, who = APP) {
      const h = harvestOf(id);
      if (h.voidedAt !== null) throw new HarvestError(409, 'This harvest is voided already');
      const reason = reasonOf(body, { words: 'Say why you void it', Err: HarvestError });
      askClosed(db, [localDate(h.pickedAt)], body, 'pickedAt');
      const out = db.transaction(() => {
        db.voidHarvest(id, { at: now(), by: who.name, reason });
        logChange(db, who, now(), { kind: 'harvest', rowId: id, action: 'void', before: snapshotOf(h), reason });
        return db.getHarvest(id);
      });
      tell(h.roomId);
      return { ...plainOf(out), voided: voidedOf(out) };
    },

    restoreHarvest(id, body, who = APP) {
      const h = harvestOf(id);
      if (h.voidedAt === null) throw new HarvestError(409, 'This harvest is not voided');
      const reason = reasonOf(body ?? {}, { required: false, Err: HarvestError });
      askClosed(db, [localDate(h.pickedAt)], body, 'pickedAt');
      const out = db.transaction(() => {
        db.restoreHarvest(id);
        const back = db.getHarvest(id);
        logChange(db, who, now(), { kind: 'harvest', rowId: id, action: 'restore', before: snapshotOf(back), reason });
        return back;
      });
      tell(h.roomId);
      return { ...plainOf(out), voided: null };
    },

    // The Harvest tab: { current: the open run's view or null, past: the ended runs newest first, stamp }; null for no such room.
    // A run's view: { id, startedAt, endedAt, partial, blocksInAt (Money truth: a partial run's real block-in day), crops,
    // ...runFigures, harvests (newest pick first) }.
    roomView(roomId) {
      const room = db.getRoom(roomId);
      if (!room) return null;
      const runs = db.cropRuns(roomId);
      const cropYield = readCropYield(db);
      const p = prices();
      const today = zone.label(now());
      // The days back to the oldest run within the kept days (an older run has no cost: its days are not all kept).
      const count = Math.max(0, ...runs.map((r) => daysBetween(zone.label(r.startedAt), today) + 1).filter((n) => n <= USAGE_DAYS_KEPT));
      const usageDays = count > 0 ? usageDaysOf(room, count) : [];
      const [edits, notSoldEdits] = [db.editCounts('harvest'), db.editCounts('not-sold')];
      const views = runs.map((run) => runView(run, cropYield, usageDays, p, edits, notSoldEdits));
      const current = views.find((v) => v.endedAt === null) ?? null;
      // stamp: the stage and flush a harvest recorded now takes (Record a harvest says it), null without a run
      const program = current ? db.getProgram(roomId) : null;
      return { current, past: views.filter((v) => v.endedAt !== null), stamp: program ? { stage: program.stage, flush: program.flush } : null };
    },

    // The Harvest page (spec 6): { from, to, days, bucket, buckets, totals: { kg, value, cost }, rooms, crops, today, last7,
    // last30, missing, records }. days: 7, 30, 90 or 365.
    farmView({ days = 30 } = {}) {
      const { range, today, harvests, voided, recent, rooms, runs } = period(daysOf(days));
      const cropYield = readCropYield(db);
      const kgSum = (list) => round(list.reduce((s, h) => s + h.kg, 0), 2);
      const sum = (list) => ({ kg: kgSum(list), value: valueOf(list, cropYield), unpriced: unpricedOf(list, cropYield) });

      const p = prices();
      const count = daysBetween(range.from, zone.label(now())) + 1;
      const usageDays = [];
      for (const room of rooms.values()) {
        usageDays.push(...usageDaysOf(room, count).filter((d) => d.date >= range.from && d.date <= range.to));
      }
      const cost = { ...costOf(usageDays, p), days: daysBetween(range.from, range.to) + 1 };
      const { none, ...spent } = cost;
      const kg = kgSum(harvests);

      const dryMissing = new Set();
      const roomRows = [...rooms.values()].map((room) => {
        const own = harvests.filter((h) => h.roomId === room.id);
        const run = db.openRun(room.id);
        let current = null;
        if (run) {
          const f = runFigures(run, db.runHarvests(run.id), yieldOf(cropYield, run.id), null);
          for (const c of f.missing.dryKg) dryMissing.add(c);
          current = { kg: f.kg, perBlock: f.perBlock, be: f.be };
        }
        return { id: room.id, name: room.name, crops: db.getProgram(room.id).crops, ...sum(own), current };
      });
      const crops = [...new Set(harvests.map((h) => h.crop))].map((crop) => {
        const own = harvests.filter((h) => h.crop === crop);
        return { crop, kg: kgSum(own), value: valueOf(own, cropYield) };
      })
        .sort((a, b) => b.kg - a.kg || CROP_KEYS.indexOf(a.crop) - CROP_KEYS.indexOf(b.crop));
      const priceMissing = new Set([...harvests, ...recent].filter((h) => h.kg > 0 && typeof cropYield[h.crop]?.priceKg !== 'number').map((h) => h.crop));
      const since = (date) => recent.filter((h) => localDate(h.pickedAt) >= date);

      return {
        from: range.from, to: range.to, days, bucket: range.bucket, buckets: range.buckets,
        totals: { ...sum(harvests), cost: { costPerKg: kg > 0 && !none ? costPerKgOf(cost.cost, kg) : null, ...spent, ...(none ? { none } : {}) } },
        rooms: roomRows,
        crops,
        today: sum(since(today)),
        last7: sum(since(addDays(today, -6))),
        last30: sum(recent),
        missing: { dryKg: ordered(dryMissing), price: ordered(priceMissing) },
        records: recordRows(harvests, rooms, runs, voided),
      };
    },

    // The range's harvests as CSV (oldest first): { name: 'harvests <from>–<to>.csv', text } (the route adds the BOM).
    csv(days = 30) {
      const { range, harvests, rooms, runs } = period(daysOf(days));
      return { name: `harvests ${range.from}–${range.to}.csv`, text: `${csvRows(harvests, rooms, runs).join('\r\n')}\r\n` };
    },

    // A promise for the usage warms under way (tests).
    warmed: () => Promise.all([...warming.values()].map((job) => job.done)),

    // Stops the usage warms at their next day and starts no more (the server closing: the database goes next).
    stop() {
      stopping.abort();
    },

    // fn(roomId) after any harvest of a room is recorded, edited or deleted here, or its usage days are worked out (its costs
    // are known now); → a function that stops it.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
