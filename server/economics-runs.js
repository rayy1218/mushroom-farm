// Your runs on the Economics page (spec 2026-11-06-economics-design.md 4.4 and 4.5): the yield, selling price, block price
// and electricity per block of a room's finished runs of a crop, and the room's blocks, read from Harvest, Sales, Batches
// and the usage days on each request (never stored). A part that cannot be read is logged and named in errors; its
// figures are left to the next source.
//   yourRuns({ db, harvests, batches, days, room, crop, today, zone, log }) → { figures, errors }

import { addDays, daysBetween } from './task-rules.js';
import { runOn } from './costs-math.js';
import { USAGE_DAYS_KEPT } from './usage.js';

export const PART_FAILED = 'Something went wrong';
export const SALES_AFTER_DAYS = 14; // a run's crop sold farm-wide up to this many days after its end
const DAY_MS = 86_400_000;
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;
const total = (list, f) => list.reduce((s, x) => s + f(x), 0);

// db: the farm database; harvests and batches: the modules' services; days(room, count): the room's usage days back count
// days (roomDays with cachedOnly: a day still being worked out is { pending: true }); room: the room row; crop: a crop key;
// today: the farm's date (YYYY-MM-DD, zone's); zone: the usage days' zone.
// → { figures: { [key]: { value, runs } or { value: null, pending: true, runs } }, errors: { [part]: PART_FAILED } }
export function yourRuns({ db, harvests, batches, days, room, crop, today, zone, log = console.error }) {
  const errors = {};
  const read = (part, fn) => {
    try {
      return fn();
    } catch (err) {
      log(`Economics: couldn't read ${part}:`, err);
      errors[part] = PART_FAILED;
      return null;
    }
  };
  const figures = {};
  const blocks = read('harvest', () => roomBlocks(db, room.id));
  if (blocks) figures['yours.blocks'] = blocks;
  // the counted runs: ended, not partial, with kg of the crop picked (oldest first)
  const counted = read('harvest', () => harvests.roomView(room.id).past
    .filter((r) => !r.partial && r.endedAt !== null && r.byCrop.some((c) => c.crop === crop && c.kg > 0))
    .map((r) => ({ ...r, own: r.byCrop.find((c) => c.crop === crop) }))
    .toReversed());
  if (!counted?.length) return { figures, errors };
  const span = { count: counted.length, from: counted[0].startedAt, to: counted.at(-1).endedAt };

  const kg = total(counted, (r) => r.own.kg);
  const put = total(counted, (r) => r.own.blocks);
  if (put > 0) {
    figures['yours.yieldG'] = { value: round((kg / put) * 1000, 1), runs: { ...span, kg: round(kg, 2), blocks: put } };
    figures['yours.loss'] = { value: 0, runs: span }; // counted in the yield (spec 4.4)
  }

  // Costs' runs of the room (its runOn rule ties a day to the run open on it)
  const roomRuns = db.cropRuns(room.id).map((r) => ({
    id: r.id, roomId: room.id, startDate: zone.label(r.startedAt), endDate: r.endedAt === null ? null : zone.label(r.endedAt),
    blocks: total(r.crops, (c) => c.blocks),
  }));
  const ids = new Set(counted.map((r) => r.id));
  const price = read('sales', () => salesPrice(db, { room, crop, roomRuns, ids, span, today, zone }));
  if (price) figures.price = price;
  const blockPrice = read('batches', () => batchPrice(batches, { crop, ids, count: span.count }));
  if (blockPrice) figures.blockPrice = blockPrice;
  const kwh = read('energy', () => energy({ days, room, counted, roomRuns, today, zone }));
  if (kwh) figures['yours.kwhBlock'] = kwh;
  return { figures, errors };
}

// The room's blocks now (its Crop tab); an empty room: its latest run's.
function roomBlocks(db, roomId) {
  const now = db.getProgram(roomId)?.crops ?? [];
  if (now.length) return { value: total(now, (c) => c.blocks), runs: { from: 'crop' } };
  const last = db.cropRuns(roomId)[0];
  return last ? { value: total(last.crops, (c) => c.blocks), runs: { from: 'run', at: last.startedAt } } : null;
}

// Σ total ÷ Σ kg of the crop's sale lines tied to a counted run (its run, or its room on a day of the run); none tied: the
// crop's sales farm-wide from the first counted run's start to 14 days after the last one's end.
function salesPrice(db, { room, crop, roomRuns, ids, span, today, zone }) {
  const lines = db.salesBetween(0, Number.MAX_SAFE_INTEGER).filter((s) => s.crop === crop);
  const runOf = (s) => s.runId ?? (s.roomId === room.id ? runOn(roomRuns, room.id, zone.label(s.soldAt), today)?.id ?? null : null);
  const tied = lines.filter((s) => ids.has(runOf(s)));
  const until = span.to + SALES_AFTER_DAYS * DAY_MS;
  const used = tied.length ? tied : lines.filter((s) => s.soldAt >= span.from && s.soldAt <= until);
  const kg = total(used, (s) => s.kg);
  if (!(kg > 0)) return null;
  const sum = total(used, (s) => s.total);
  return {
    value: round(sum / kg, 2),
    runs: { ...span, kg: round(kg, 2), total: round(sum, 2), farmWide: !tied.length, ...(tied.length ? {} : { until }) },
  };
}

// Σ (blocks × price) ÷ Σ blocks of the crop's batches on a counted run with a price; the ones without left out (counted).
function batchPrice(batches, { crop, ids, count }) {
  const own = batches.list().batches.filter((b) => b.crop === crop && ids.has(b.runId));
  const priced = own.filter((b) => b.pricePerBlock !== null && b.pricePerBlock !== undefined);
  const blocks = total(priced, (b) => b.blocks);
  if (!(blocks > 0)) return null;
  return {
    value: round(total(priced, (b) => b.blocks * b.pricePerBlock) / blocks, 2),
    runs: { count, blocks, batches: priced.length, batchesLeftOut: own.length - priced.length },
  };
}

// Σ kWh of the counted runs' days ÷ Σ blocks of those runs (every crop: the room's electricity serves every block). A run
// starting before the kept days, or with no kWh at all, is left out; a day still being worked out makes it pending.
function energy({ days, room, counted, roomRuns, today, zone }) {
  const kept = counted.filter((r) => daysBetween(zone.label(r.startedAt), today) + 1 <= USAGE_DAYS_KEPT);
  if (!kept.length) return null;
  const count = daysBetween(zone.label(kept[0].startedAt), today) + 1;
  const byDate = new Map(days(room, count).map((d) => [d.date, d]));
  let kWh = 0;
  let blocks = 0;
  let dayCount = 0;
  let runs = 0;
  for (const r of kept) {
    const own = [];
    const [from, to] = [zone.label(r.startedAt), zone.label(r.endedAt)];
    for (let d = from; d <= to; d = addDays(d, 1)) if (runOn(roomRuns, room.id, d, today)?.id === r.id && byDate.has(d)) own.push(byDate.get(d));
    if (own.some((d) => d.pending)) return { value: null, pending: true, runs: { count: kept.length } };
    const sum = total(own, (d) => d.kWh);
    if (!(sum > 0)) continue;
    kWh += sum;
    blocks += total(r.crops, (c) => c.blocks);
    dayCount += own.length;
    runs += 1;
  }
  if (!(blocks > 0)) return null;
  return { value: round(kWh / blocks, 3), runs: { count: runs, kWh: round(kWh, 1), days: dayCount, blocks } };
}
