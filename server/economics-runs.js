// Your runs on the Economics page (spec 2026-11-06-economics-design.md 4.4 and 4.5; Money truth, 2026-11-12-money-truth-
// design.md 8): the yield, the loss, selling price, block price and electricity per block of a room's finished runs of a
// crop (a partial run once the owner gives its block-in day), and the room's blocks, read from Harvest, Sales (through
// Costs' sale steps), Batches and the usage days on each request (never stored); Your sales, the crop's realised price of
// the last 90 days. A part that cannot be read is logged and named in errors; its figures are left to the next source.
//   yourRuns({ db, harvests, batches, days, room, crop, today, zone, log }) → { figures, errors }
//   yourSales({ db, crop, today, zone }) → { value, runs } or null (runs.first: the first sale's day, stage 2)
//   countedRuns(harvests, roomId, crop) · eachRun({ db, harvests, batches, days, room, crop, today, zone, log }) (Economics
//   stage 2, spec 2026-11-12-economics-stage-2-design.md 7.3: each counted run's own figures, against its plan)

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
  const counted = read('harvest', () => countedRuns(harvests, room.id, crop));
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
    // ---- Data integrity ---- the shrink: Not sold over picked, once every counted run's kg is sold or recorded (spec 6.3)
    const shrink = read('sales', () => shrinkOf(db, { crop, counted, ids, span, today, zone, room }));
    if (shrink) figures.shrink = shrink;
  }
  const blockPrice = own ? batchPrice(own, { count: span.count }) : null;
  if (blockPrice) figures.blockPrice = blockPrice;
  if (roomRuns) {
    const kwh = read('energy', () => energy({ days, room, counted, roomRuns, today, zone }));
    if (kwh) figures['yours.kwhBlock'] = kwh;
  }
  return { figures, errors };
}

// The counted runs of a room and crop: ended, with kg of the crop picked, and not partial unless the owner gave the day its
// blocks went in (Money truth 8.2: its start is then that day); oldest first. → [run view + { from, own }] (own: its byCrop
// entry of the crop).
// view: the room's view when the caller has read it (eachRun: read once).
export function countedRuns(harvests, roomId, crop, view = harvests.roomView(roomId)) {
  return view.past
    .filter((r) => (!r.partial || r.blocksInAt != null) && r.endedAt !== null && r.byCrop.some((c) => c.crop === crop && c.kg > 0))
    .map((r) => ({ ...r, from: r.partial ? r.blocksInAt : r.startedAt, own: r.byCrop.find((c) => c.crop === crop) }))
    .sort((a, b) => a.from - b.from || a.id - b.id);
}

// ---- Economics stage 2 ---- (spec 2026-11-12-economics-stage-2-design.md 7.3) Each counted run of the room and crop on its
// own, newest first, with Your runs' rules one run at a time; the open run when it has the crop; the ended runs left out as
// partial without a block-in day. A part not read: named in errors, its figures null.
// → { past: [{ runId, from, to, days, partial, mixed, blocks, roomBlocks (every crop's), lost, measured, kg, sold, price,
//      blockPrice, batchesLeftOut, kwhBlock, kwhPending }], current: { runId, from, partial, blocksInAt, day, kg, blocks } or
//      null, leftOut: { partial }, errors }
export function eachRun({ db, harvests, batches, days, room, crop, today, zone, log = console.error }) {
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
  const view = read('harvest', () => harvests.roomView(room.id));
  if (!view) return { past: [], current: null, leftOut: { partial: 0 }, errors };
  const has = (r) => r.byCrop?.some((c) => c.crop === crop);
  const open = view.current && has(view.current) ? view.current : null;
  const current = open && {
    runId: open.id, from: open.partial ? open.blocksInAt ?? open.startedAt : open.startedAt, partial: open.partial, blocksInAt: open.blocksInAt ?? null,
    day: open.partial && open.blocksInAt == null ? null : daysBetween(zone.label(open.partial ? open.blocksInAt : open.startedAt), today),
    kg: round(open.byCrop.find((c) => c.crop === crop).kg, 2), blocks: open.byCrop.find((c) => c.crop === crop).blocks,
  };
  const counted = read('harvest', () => countedRuns(harvests, room.id, crop, view)) ?? [];
  const leftOut = { partial: view.past.filter((r) => r.partial && r.blocksInAt == null && r.byCrop.some((c) => c.crop === crop && c.kg > 0)).length };
  const roomRuns = read('harvest', () => db.cropRuns(room.id).map((r) => ({
    id: r.id, roomId: room.id, startDate: zone.label(r.startedAt), endDate: r.endedAt === null ? null : zone.label(r.endedAt),
    blocks: total(r.crops, (c) => c.blocks),
  })));
  // the sale lines, picks and the farm's runs every counted run's price reads, once (the review: not once a run)
  const sold = roomRuns && counted.length
    ? read('sales', () => saleData(db, { crop, span: { from: Math.min(...counted.map((r) => r.from)), to: Math.max(...counted.map((r) => r.endedAt)) }, today, zone }))
    : null;
  const past = counted.toReversed().map((r) => {
    const own = read('batches', () => new Map([[r.id, batches.list({ run: r.id }).batches.filter((b) => b.crop === crop)]]));
    const rows = own?.get(r.id) ?? [];
    const loss = rows.length ? lossOf(rows) : null;
    const span = { from: r.from, to: r.endedAt };
    const sales = sold ? read('sales', () => priceOf(sold, { crop, ids: new Set([r.id]), span })) : null;
    const price = own ? batchPrice(own, { count: 1 }) : null;
    const kwh = roomRuns ? read('energy', () => energy({ days, room, counted: [r], roomRuns, today, zone })) : null;
    return {
      runId: r.id, from: r.from, to: r.endedAt, days: daysBetween(zone.label(r.from), zone.label(r.endedAt)), partial: r.partial,
      mixed: r.byCrop.map((c) => c.crop).filter((c) => c !== crop),
      blocks: loss ? loss.put : r.own.blocks, roomBlocks: total(r.crops ?? [], (c) => c.blocks) || r.own.blocks, lost: loss ? loss.lost : null, measured: Boolean(loss), kg: round(r.own.kg, 2),
      sold: sales ? { kg: sales.runs.kg, total: sales.runs.total } : null, price: sales?.value ?? null,
      blockPrice: price?.value ?? null, batchesLeftOut: price ? price.runs.batchesLeftOut : rows.length,
      kwhBlock: kwh?.value ?? null, kwhPending: kwh?.pending === true,
    };
  });
  return { past, current, leftOut, errors };
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
const salesPrice = (db, { crop, ids, span, today, zone }) => priceOf(saleData(db, { crop, span, today, zone }), { crop, ids, span });

// What the sale steps read for the counted runs in span: the farm's runs, the crop's picks the lines' windows look back on
// (from the first one's start to SALE_DAYS, Costs', after the last one's end) and the crop's lines sold in that window (a line
// of a counted run, its own run, is sold within its span). → { data, sales } (sales: dated by the farm's day).
function saleData(db, { crop, span, today, zone }) {
  const [from, to] = [span.from - (SALE_DAYS_TIED + 1) * DAY_MS, span.to + (SALE_DAYS_TIED + 1) * DAY_MS];
  const data = {
    today,
    runs: db.listRooms().flatMap((room) => db.cropRuns(room.id).map((r) => ({
      id: r.id, roomId: room.id, startDate: zone.label(r.startedAt), endDate: r.endedAt === null ? null : zone.label(r.endedAt), crops: r.crops,
      blocks: total(r.crops, (c) => c.blocks),
    }))),
    harvests: db.cropHarvestsBetween(crop, from, to).map((h) => ({ roomId: h.roomId, runId: h.runId, date: zone.label(h.pickedAt), kg: h.kg, crop: h.crop })),
  };
  const sales = db.salesBetween(span.from - DAY_MS, to).filter((s) => s.crop === crop).map((s) => ({ ...s, date: zone.label(s.soldAt) }));
  return { data, sales };
}

// The price of the lines in { data, sales } reaching the runs ids, from span's start to SALE_DAYS after its end. → { value,
// runs: { from, to, kg, total } } or null.
function priceOf({ data, sales }, { crop, ids, span }) {
  const [from, to] = [span.from - DAY_MS, span.to + (SALE_DAYS_TIED + 1) * DAY_MS];
  let kg = 0;
  let sum = 0;
  for (const s of sales) {
    if (s.crop !== crop || s.soldAt < from || s.soldAt > to) continue;
    for (const p of saleParts(s, data)) {
      if (!ids.has(p.runId)) continue;
      kg += p.kg;
      sum += p.total;
    }
  }
  if (!(kg > 0)) return null;
  return { value: round(sum / kg, 2), runs: { ...span, kg: round(kg, 2), total: round(sum, 2) } };
}

// ---- Data integrity ---- (spec 2026-11-12-data-integrity-design.md 6.3) The shrink of the counted runs: Σ Not sold kg
// reaching them by Costs' sale steps ÷ Σ kg of the crop they picked × 100, to 0.1, when every one is closed (what it picked
// less what was sold and not sold of it is at most CLOSED_SHARE of its picked). One not closed: { value: null, runs: { open:
// { kg, room, startedAt } } } (the first such run: the page asks for its record). None with a Not sold record: null.
export const CLOSED_SHARE = 0.05;
function shrinkOf(db, { crop, counted, ids, span, today, zone, room }) {
  const [from, to] = [span.from - (SALE_DAYS_TIED + 1) * DAY_MS, span.to + (SALE_DAYS_TIED + 1) * DAY_MS];
  const data = {
    today,
    runs: db.listRooms().flatMap((rm) => db.cropRuns(rm.id).map((r) => ({
      id: r.id, roomId: rm.id, startDate: zone.label(r.startedAt), endDate: r.endedAt === null ? null : zone.label(r.endedAt), crops: r.crops,
      blocks: total(r.crops, (c) => c.blocks),
    }))),
    harvests: db.cropHarvestsBetween(crop, from, to).map((h) => ({ roomId: h.roomId, runId: h.runId, date: zone.label(h.pickedAt), kg: h.kg, crop: h.crop })),
  };
  const took = (list, at) => {
    const by = new Map();
    for (const x of list) {
      if (x.crop !== crop || x[at] < span.from - DAY_MS || x[at] > to) continue;
      for (const p of saleParts({ ...x, total: 0, date: zone.label(x[at]) }, data)) {
        if (ids.has(p.runId)) by.set(p.runId, (by.get(p.runId) ?? 0) + p.kg);
      }
    }
    return by;
  };
  const sold = took(db.salesBetween(span.from - DAY_MS, to), 'soldAt');
  const notSold = took(db.liveNotSold(), 'at');
  let picked = 0;
  let lost = 0;
  for (const r of counted) {
    const left = r.own.kg - (sold.get(r.id) ?? 0) - (notSold.get(r.id) ?? 0);
    if (left > r.own.kg * CLOSED_SHARE + 0.005) return { value: null, runs: { open: { kg: round(left, 1), room: room.name, startedAt: r.from } } };
    picked += r.own.kg;
    lost += notSold.get(r.id) ?? 0;
  }
  if (!(picked > 0)) return null;
  return { value: round((lost / picked) * 100, 1), runs: { count: counted.length, notSold: round(lost, 1), picked: round(picked, 1), ...partials(counted) } };
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
  // first: the window's first sale's day (Economics stage 2: what you can sell a week counts from it)
  const first = lines.map((s) => zone.label(s.soldAt)).sort()[0];
  return { value: round(sum / kg, 2), runs: { kg: round(kg, 2), total: round(sum, 2), count: lines.length, from, to: today, first } };
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
  let estimated = 0; // ---- Data integrity ---- (7.2) the kWh estimated from machine run time, the days not seen
  let unseenDays = 0;
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
    estimated += total(own, (d) => d.kWhEstimated ?? 0);
    unseenDays += own.filter((d) => (d.unseenMs ?? 0) > 0).length;
    blocks += total(r.crops, (c) => c.blocks);
    dayCount += own.length;
    runs += 1;
  }
  if (!(blocks > 0)) return null;
  const pct = Math.round((estimated / kWh) * 100);
  return {
    value: round(kWh / blocks, 3),
    runs: { count: runs, kWh: round(kWh, 1), days: dayCount, blocks, ...(pct > 0 ? { estimatedPct: pct } : {}), ...(unseenDays ? { unseenDays } : {}) },
  };
}
