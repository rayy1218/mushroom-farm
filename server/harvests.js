// Harvests (spec 2026-11-04-harvest-design.md 3, 4 and 6): recorded from a harvest check's Done or by hand, edited and
// deleted with their task's total kept, and the room and farm views with their figures. No HTTP.

import { DAILY_RULES, FAMILY_OF, HARVEST_RULES, localDate, dayStart, addDays, daysBetween } from './task-rules.js';
import { CROPS, CROP_KEYS } from '../web/crops.js';
import { readSettings, readCropYield } from './settings.js';
import { roomDays, totals, localZone } from './usage.js';
import { runFigures, buckets, recordRows, csvRows, valueOf, round } from './harvest-math.js';
import { checkWorker, TaskError } from './tasks.js';

const FAMILIES = Object.fromEntries(DAILY_RULES.filter((r) => HARVEST_RULES.includes(r.key)).map((r) => [r.key, r.families]));
export const MAX_KG = 10_000;
const USAGE_DAYS_KEPT = 400; // the usage days a room keeps (server/usage.js roomDays' cache)
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

// The room's crops a harvest rule is for, in the room's order: [{ crop, name }]; null for a row of another rule.
export function harvestCropsOf(ruleKey, crops) {
  if (!HARVEST_RULES.includes(ruleKey)) return null;
  const families = FAMILIES[ruleKey];
  return crops.filter((c) => families === null || families.includes(FAMILY_OF[c.crop])).map((c) => ({ crop: c.crop, name: CROPS[c.crop].name }));
}

// The harvest rows a Done makes (db.closeTask's harvests): amounts { crop: kg } (each over 0) stamped with the open run, the
// program's stage and flush and the run's blocks of the crop. → [] with no open run.
export function stampHarvests(db, { roomId, amounts, at, worker, taskId }) {
  const run = db.openRun(roomId);
  if (!run) return [];
  const program = db.getProgram(roomId);
  const blocksOf = (crop) => (run.crops.find((c) => c.crop === crop) ?? program.crops.find((c) => c.crop === crop))?.blocks ?? 0;
  return Object.entries(amounts).filter(([, kg]) => kg > 0).map(([crop, kg]) => ({
    roomId, runId: run.id, crop, stage: program.stage, flush: program.flush, blocks: blocksOf(crop), kg, pickedAt: at, worker, taskId, at,
  }));
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

// kg: a number over 0 up to MAX_KG, to 3 places.
function kgOf(v, field = 'kg') {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > MAX_KG) throw new HarvestError(400, 'kg must be a number over 0 up to 10,000', field);
  return round(v, 3);
}

// A harvest's cost from the usage days: { cost (electricity and water when a water price is set), days, water }.
const costOf = (days, prices) => {
  const t = totals(days, prices);
  return { cost: round(t.cost + (t.waterCost ?? 0), 2), days: days.length, water: prices.water !== null };
};

const ordered = (crops) => CROP_KEYS.filter((k) => crops.has(k));

// db: the farm database; now and zone (usage.js's day labels) are injectable.
export function createHarvests({ db, now = Date.now, zone = localZone, log = console.error }) {
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

  const prices = () => {
    const { electricityPrice, waterPrice } = readSettings(db);
    return { electricity: electricityPrice, water: waterPrice };
  };

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
  function runView(run, cropYield, usageDays, prices) {
    const today = zone.label(now());
    const [from, to] = [zone.label(run.startedAt), run.endedAt === null ? today : zone.label(run.endedAt)];
    const usage = daysBetween(from, today) + 1 > USAGE_DAYS_KEPT ? null : costOf(usageDays.filter((d) => d.date >= from && d.date <= to), prices);
    const harvests = db.runHarvests(run.id);
    return {
      id: run.id, startedAt: run.startedAt, endedAt: run.endedAt, partial: run.partial, crops: run.crops,
      ...runFigures(run, harvests, cropYield, usage),
      harvests: harvests.reverse(),
    };
  }

  // The farm's range of `days` (buckets()'s from and to, farm dates) and its harvests, with the last 30 days' for the
  // Overview card: { range, harvests (in the range), recent (the last 30 days), rooms, runs } (rooms and runs: Maps by id).
  function period(days) {
    const t = now();
    const range = buckets([], { days, to: t });
    const today = localDate(t);
    const since = addDays(today, -29) < range.from ? addDays(today, -29) : range.from;
    const all = db.harvestsBetween(dayStart(since), dayStart(addDays(today, 1)) - 1);
    const harvests = all.filter((h) => h.pickedAt >= dayStart(range.from));
    const runs = new Map();
    for (const h of harvests) if (!runs.has(h.runId)) runs.set(h.runId, db.getRunById(h.runId));
    const rooms = new Map(db.listRooms().map((r) => [r.id, r]));
    return { range: buckets(harvests, { days, to: t }), today, harvests, recent: all.filter((h) => h.pickedAt >= dayStart(addDays(today, -29))), rooms, runs };
  }

  return {
    // Record a harvest: { crop (one of the open run's), kg, worker, pickedAt? (default now) }. → the harvest.
    record(roomId, body) {
      if (!db.getRoom(roomId)) throw new HarvestError(404, 'Room not found');
      const run = db.openRun(roomId);
      const program = db.getProgram(roomId);
      if (!run || program.crops.length === 0) throw new HarvestError(409, 'No crops in this room');
      const { crop, kg, worker, pickedAt } = bodyOf(body);
      const own = run.crops.find((c) => c.crop === crop);
      if (!own) throw new HarvestError(400, "Pick one of the room's crops", 'crop');
      const fields = { kg: kgOf(kg), worker: workerOf(worker), pickedAt: pickedAt === undefined || pickedAt === null ? now() : timeOf(pickedAt, run) };
      const h = db.insertHarvest({
        roomId, runId: run.id, crop, stage: program.stage, flush: program.flush, blocks: own.blocks, ...fields, taskId: null, at: now(),
      });
      tell(roomId);
      return h;
    },

    // A new kg or pick time: { kg?, pickedAt? }; a harvest from a check sets its task's amount to the new total. → the harvest.
    edit(id, body) {
      const h = harvestOf(id);
      const { kg, pickedAt } = bodyOf(body);
      if (kg === undefined && pickedAt === undefined) throw new HarvestError(400, 'Give the kg or the time');
      const run = db.getRunById(h.runId);
      const changed = db.updateHarvest(id, {
        kg: kg === undefined ? h.kg : kgOf(kg),
        pickedAt: pickedAt === undefined ? h.pickedAt : timeOf(pickedAt, run),
      });
      if (!changed) throw new HarvestError(404, 'Harvest not found');
      tell(h.roomId);
      return changed;
    },

    // Deletes a harvest; one from a check sets its task's amount to the total left (null when none is).
    remove(id) {
      const h = harvestOf(id);
      if (!db.deleteHarvest(id)) throw new HarvestError(404, 'Harvest not found');
      tell(h.roomId);
    },

    // The Harvest tab: { current: the open run's view or null, past: the ended runs newest first }; null for no such room.
    // A run's view: { id, startedAt, endedAt, partial, crops, ...runFigures, harvests (newest pick first) }.
    roomView(roomId) {
      const room = db.getRoom(roomId);
      if (!room) return null;
      const runs = db.cropRuns(roomId);
      const cropYield = readCropYield(db);
      const p = prices();
      const today = zone.label(now());
      const count = Math.min(USAGE_DAYS_KEPT, Math.max(0, ...runs.map((r) => daysBetween(zone.label(r.startedAt), today) + 1)));
      const usageDays = count > 0 ? roomDays(db, room, { now: now(), zone, count }) : [];
      const views = runs.map((run) => runView(run, cropYield, usageDays, p));
      return { current: views.find((v) => v.endedAt === null) ?? null, past: views.filter((v) => v.endedAt !== null) };
    },

    // The Harvest page (spec 6): { from, to, days, bucket, buckets, totals: { kg, value, cost }, rooms, crops, today, last7,
    // last30, missing, records }. days: 7, 30, 90 or 365.
    farmView({ days = 30 } = {}) {
      const { range, today, harvests, recent, rooms, runs } = period(daysOf(days));
      const cropYield = readCropYield(db);
      const kgSum = (list) => round(list.reduce((s, h) => s + h.kg, 0), 2);
      const sum = (list) => ({ kg: kgSum(list), value: valueOf(list, cropYield) });

      const p = prices();
      const count = daysBetween(range.from, zone.label(now())) + 1;
      const usageDays = [];
      for (const room of rooms.values()) {
        usageDays.push(...roomDays(db, room, { now: now(), zone, count }).filter((d) => d.date >= range.from && d.date <= range.to));
      }
      const cost = { ...costOf(usageDays, p), days: daysBetween(range.from, range.to) + 1 };
      const kg = kgSum(harvests);

      const dryMissing = new Set();
      const roomRows = [...rooms.values()].map((room) => {
        const own = harvests.filter((h) => h.roomId === room.id);
        const run = db.openRun(room.id);
        let current = null;
        if (run) {
          const f = runFigures(run, db.runHarvests(run.id), cropYield, null);
          for (const c of f.missing.dryKg) dryMissing.add(c);
          current = { kg: f.kg, perBlock: f.perBlock, be: f.be };
        }
        return { id: room.id, name: room.name, crops: db.getProgram(room.id).crops, ...sum(own), current };
      });
      const crops = [...new Set(harvests.map((h) => h.crop))].map((crop) => ({ crop, ...sum(harvests.filter((h) => h.crop === crop)) }))
        .sort((a, b) => b.kg - a.kg || CROP_KEYS.indexOf(a.crop) - CROP_KEYS.indexOf(b.crop));
      const priceMissing = new Set([...harvests, ...recent].filter((h) => h.kg > 0 && typeof cropYield[h.crop]?.priceKg !== 'number').map((h) => h.crop));
      const since = (date) => recent.filter((h) => localDate(h.pickedAt) >= date);

      return {
        from: range.from, to: range.to, days, bucket: range.bucket, buckets: range.buckets,
        totals: { kg, value: valueOf(harvests, cropYield), cost: { costPerKg: kg > 0 ? round(cost.cost / kg, 2) : null, ...cost } },
        rooms: roomRows,
        crops,
        today: sum(since(today)),
        last7: sum(since(addDays(today, -6))),
        last30: sum(recent),
        missing: { dryKg: ordered(dryMissing), price: ordered(priceMissing) },
        records: recordRows(harvests, rooms, runs),
      };
    },

    // The range's harvests as CSV (oldest first): { name: 'harvests <from>–<to>.csv', text } (the route adds the BOM).
    csv(days = 30) {
      const { range, harvests, rooms, runs } = period(daysOf(days));
      return { name: `harvests ${range.from}–${range.to}.csv`, text: `${csvRows(harvests, rooms, runs).join('\r\n')}\r\n` };
    },

    // fn(roomId) after any harvest of a room is recorded, edited or deleted here; → a function that stops it.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
