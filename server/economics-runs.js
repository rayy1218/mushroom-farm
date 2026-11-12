// Your runs on the Economics page (spec 2026-11-06-economics-design.md 4.4 and 4.5; Money truth, 2026-11-12-money-truth-
// design.md 8): the yield, the loss, selling price, block price and electricity per block of a room's finished runs of a
// crop (a partial run once the owner gives its block-in day), and the room's blocks, read from Harvest, Sales (through
// Costs' sale steps), Batches and the usage days on each request (never stored); Your sales, the crop's realised price of
// the last 90 days. A part that cannot be read is logged and named in errors; its figures are left to the next source.
//   yourRuns({ db, harvests, batches, days, room, crop, today, zone, log }) → { figures, errors }
//   yourSales({ db, crop, today, zone }) → { value, runs } or null

import { addDays, daysBetween } from './task-rules.js';
import { runOn, saleParts, SALE_DAYS as SALE_DAYS_TIED } from './costs-math.js';
import { USAGE_DAYS_KEPT } from './usage.js';
import { SALES_DAYS } from '../web/economics-defaults.js'; // Your sales' days, the page's words too

export const PART_FAILED = 'Something went wrong';
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
  // the counted runs: ended, with kg of the crop picked, and not partial unless the owner gave the day its blocks went in
  // (Money truth 8.2: its start is then that day); oldest first
  const counted = read('harvest', () => harvests.roomView(room.id).past
    .filter((r) => (!r.partial || r.blocksInAt != null) && r.endedAt !== null && r.byCrop.some((c) => c.crop === crop && c.kg > 0))
    .map((r) => ({ ...r, from: r.partial ? r.blocksInAt : r.startedAt, own: r.byCrop.find((c) => c.crop === crop) }))
    .sort((a, b) => a.from - b.from || a.id - b.id));
  if (!counted?.length) return { figures, errors };
  const span = { count: counted.length, from: counted[0].from, to: counted.at(-1).endedAt, ...partials(counted) };

  // the batches of the crop on each counted run (the block price and, Money truth 8.3, the loss from their checks)
  const own = read('batches', () => new Map(counted.map((r) => [r.id, batches.list({ run: r.id }).batches.filter((b) => b.crop === crop)])));
  const kg = total(counted, (r) => r.own.kg);
  const measured = own && counted.every((r) => own.get(r.id).length) ? lossOf(counted.flatMap((r) => own.get(r.id))) : null;
  if (measured && measured.put > measured.lost) {
    // every counted run has batches of the crop: the loss their checks give, the yield over the good blocks (counted once)
    const good = measured.put - measured.lost;
    figures['yours.yieldG'] = { value: round((kg / good) * 1000, 1), runs: { ...span, kg: round(kg, 2), blocks: measured.put, good, lost: measured.lost, measured: true } };
    figures['yours.loss'] = { value: round((measured.lost / measured.put) * 100, 1), runs: { ...span, put: measured.put, lost: measured.lost, measured: true } };
  } else {
    const put = total(counted, (r) => r.own.blocks);
    if (put > 0) {
      figures['yours.yieldG'] = { value: round((kg / put) * 1000, 1), runs: { ...span, kg: round(kg, 2), blocks: put } };
      figures['yours.loss'] = { value: 0, runs: span }; // counted in the yield (spec 4.4)
    }
  }

  // Costs' runs of the room (its runOn rule ties a day to the run open on it); without them the price and the electricity
  // cannot be tied to a run, and are left to the next source
  const roomRuns = read('harvest', () => db.cropRuns(room.id).map((r) => ({
    id: r.id, roomId: room.id, startDate: zone.label(r.startedAt), endDate: r.endedAt === null ? null : zone.label(r.endedAt),
    blocks: total(r.crops, (c) => c.blocks),
  })));
  const ids = new Set(counted.map((r) => r.id));
  if (roomRuns) {
    const price = read('sales', () => salesPrice(db, { crop, ids, span, today, zone }));
    if (price) figures.price = price;
  }
  const blockPrice = own ? batchPrice(own, { count: span.count }) : null;
  if (blockPrice) figures.blockPrice = blockPrice;
  if (roomRuns) {
    const kwh = read('energy', () => energy({ days, room, counted, roomRuns, today, zone }));
    if (kwh) figures['yours.kwhBlock'] = kwh;
  }
  return { figures, errors };
}

// The room's blocks now (its Crop tab); an empty room: its latest run's.
function roomBlocks(db, roomId) {
  const now = db.getProgram(roomId)?.crops ?? [];
  if (now.length) return { value: total(now, (c) => c.blocks), runs: { from: 'crop' } };
  const last = db.cropRuns(roomId)[0];
  return last ? { value: total(last.crops, (c) => c.blocks), runs: { from: 'run', at: last.startedAt } } : null;
}

// How many of the counted runs are partial ones counted from their block-in day (the note says so); none: nothing added.
const partials = (counted) => {
  const n = counted.filter((r) => r.partial).length;
  return n ? { partial: n } : {};
};

// The blocks lost in the room and put in, from a run's batches (Money truth 8.3): a placed row's lost after it went in
// (its checks less those before: blocks − usedBlocks), over its blocks that went in (usedBlocks). → { put, lost }.
function lossOf(rows) {
  let put = 0;
  let lost = 0;
  for (const b of rows) {
    const used = b.usedBlocks ?? b.blocks;
    put += used;
    lost += Math.max(0, (b.lost ?? 0) - (b.blocks - used));
  }
  return { put, lost };
}

// Σ total ÷ Σ kg of the crop's sale lines reaching a counted run by Costs' sale steps (its run, its room's that day, the one
// run growing the crop, or shared by the kg picked), each at its share. None: the next source (Your sales).
function salesPrice(db, { crop, ids, span, today, zone }) {
  // only what can reach the counted runs: their crop's lines from the first one's start to SALE_DAYS (Costs') after the
  // last one's end, and the picks the lines' windows look back on
  const [from, to] = [span.from - (SALE_DAYS_TIED + 1) * DAY_MS, span.to + (SALE_DAYS_TIED + 1) * DAY_MS];
  const data = {
    today,
    runs: db.listRooms().flatMap((room) => db.cropRuns(room.id).map((r) => ({
      id: r.id, roomId: room.id, startDate: zone.label(r.startedAt), endDate: r.endedAt === null ? null : zone.label(r.endedAt), crops: r.crops,
      blocks: total(r.crops, (c) => c.blocks),
    }))),
    harvests: db.cropHarvestsBetween(crop, from, to).map((h) => ({ roomId: h.roomId, runId: h.runId, date: zone.label(h.pickedAt), kg: h.kg, crop: h.crop })),
  };
  let kg = 0;
  let sum = 0;
  // a line of a counted run (its own run) is sold within its span: the window holds every line that can reach them
  for (const s of db.salesBetween(span.from - DAY_MS, to)) {
    if (s.crop !== crop) continue;
    for (const p of saleParts({ ...s, date: zone.label(s.soldAt) }, data)) {
      if (!ids.has(p.runId)) continue;
      kg += p.kg;
      sum += p.total;
    }
  }
  if (!(kg > 0)) return null;
  return { value: round(sum / kg, 2), runs: { ...span, kg: round(kg, 2), total: round(sum, 2) } };
}

// Your sales (Money truth 8.1): Σ total ÷ Σ kg of the crop's sale lines of the last SALES_DAYS days (today included),
// farm-wide. → { value, runs: { kg, total, count, from, to } } or null with none.
export function yourSales({ db, crop, today, zone }) {
  const from = addDays(today, -(SALES_DAYS - 1));
  const lines = db.salesBetween(Date.parse(`${from}T00:00:00Z`) - DAY_MS, Number.MAX_SAFE_INTEGER)
    .filter((s) => s.crop === crop && zone.label(s.soldAt) >= from && zone.label(s.soldAt) <= today);
  const kg = total(lines, (s) => s.kg);
  if (!(kg > 0)) return null;
  const sum = total(lines, (s) => s.total);
  return { value: round(sum / kg, 2), runs: { kg: round(kg, 2), total: round(sum, 2), count: lines.length, from, to: today } };
}

// Σ (blocks × price) ÷ Σ blocks of the crop's batches on the counted runs with a whole price; the ones without (a made
// one with a material unpriced too) left out (counted).
function batchPrice(own, { count }) {
  const rows = [...own.values()].flat();
  const priced = rows.filter((b) => b.pricePerBlock !== null && b.pricePerBlock !== undefined && !(b.priceMissing?.length));
  const blocks = total(priced, (b) => b.blocks);
  if (!(blocks > 0)) return null;
  return {
    value: round(total(priced, (b) => b.blocks * b.pricePerBlock) / blocks, 2),
    runs: { count, blocks, batches: priced.length, batchesLeftOut: rows.length - priced.length },
  };
}

// Σ kWh of the counted runs' days ÷ Σ blocks of those runs (every crop: the room's electricity serves every block). A run
// starting before the kept days (a partial run: from its block-in day), or with no kWh at all, is left out; a day still
// being worked out makes it pending.
function energy({ days, room, counted, roomRuns, today, zone }) {
  const kept = counted.filter((r) => daysBetween(zone.label(r.from), today) + 1 <= USAGE_DAYS_KEPT);
  if (!kept.length) return null;
  const count = daysBetween(zone.label(kept[0].from), today) + 1;
  const byDate = new Map(days(room, count).map((d) => [d.date, d]));
  let kWh = 0;
  let blocks = 0;
  let dayCount = 0;
  let runs = 0;
  for (const r of kept) {
    const own = [];
    const [from, to] = [zone.label(r.from), zone.label(r.endedAt)];
    // a day of the run open on it; a partial run's days before its recorded start too, when no run was open then
    const recorded = zone.label(r.startedAt);
    const mine = (d) => {
      const on = runOn(roomRuns, room.id, d, today);
      return on?.id === r.id || (d < recorded && on === null);
    };
    for (let d = from; d <= to; d = addDays(d, 1)) if (mine(d) && byDate.has(d)) own.push(byDate.get(d));
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
