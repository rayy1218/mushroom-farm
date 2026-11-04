// The harvest figures (spec 2026-11-04-harvest-design.md section 4). Pure: no database, no clock. Farm time is UTC+8.
import { localDate, localTime, addDays } from './task-rules.js';
import { cell } from './tasks.js';
import { CROPS, STAGES } from '../web/crops.js';

export const round = (n, places = 0) => Math.round(n * 10 ** places) / 10 ** places;

const kgSum = (list) => round(list.reduce((s, h) => s + h.kg, 0), 3);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const dryOf = (crop, cropYield) => {
  const d = cropYield?.[crop]?.dryKg;
  return num(d) && d > 0 ? d : null;
};

// The run's crops plus any harvested crop no longer in it (first-harvest order), its blocks those of its latest harvest.
function cropsOf(run, harvests) {
  const crops = run.crops.map((c) => ({ ...c }));
  for (const h of [...harvests].sort((a, b) => a.pickedAt - b.pickedAt)) {
    const known = crops.find((c) => c.crop === h.crop);
    if (!known) crops.push({ crop: h.crop, blocks: h.blocks, extra: true });
    else if (known.extra) known.blocks = h.blocks;
  }
  return crops.map(({ crop, blocks }) => ({ crop, blocks }));
}

// kg, kg per block and BE for a group of harvests over the given run crops ({ crop, blocks }).
function groupFigures(crops, harvests, cropYield) {
  const kg = kgSum(harvests);
  const blocks = crops.reduce((s, c) => s + c.blocks, 0);
  const dry = crops.map((c) => dryOf(c.crop, cropYield));
  const be = crops.length && dry.every((d) => d !== null)
    ? round((kg / crops.reduce((s, c, i) => s + c.blocks * dry[i], 0)) * 100)
    : null;
  return { kg: round(kg, 2), perBlock: blocks > 0 ? round(kg / blocks, 2) : null, be: Number.isFinite(be) ? be : null };
}

// The RM value of harvests: Σ kg × the crop's price; null when a crop with kg has no price.
export function valueOf(harvests, cropYield) {
  let total = 0;
  for (const h of harvests) {
    if (h.kg <= 0) continue;
    const price = cropYield?.[h.crop]?.priceKg;
    if (!num(price)) return null;
    total += h.kg * price;
  }
  return round(total, 2);
}

export function runFigures(run, harvests, cropYield, usage) {
  const crops = cropsOf(run, harvests);
  const total = groupFigures(crops, harvests, cropYield);
  const cost = usage
    ? { costPerKg: total.kg > 0 ? round(usage.cost / total.kg, 2) : null, cost: usage.cost, days: usage.days, water: usage.water }
    : null;
  const byCrop = crops.map((c) => {
    const own = harvests.filter((h) => h.crop === c.crop);
    return { crop: c.crop, blocks: c.blocks, ...groupFigures([c], own, cropYield), value: valueOf(own, cropYield) };
  });
  const numbers = [...new Set(harvests.map((h) => h.flush))].sort((a, b) => (b === null) - (a === null) || a - b);
  const flushes = numbers.map((flush) => {
    const own = harvests.filter((h) => h.flush === flush);
    const times = own.map((h) => h.pickedAt);
    const split = {};
    for (const c of crops) {
      if (own.some((h) => h.crop === c.crop)) split[c.crop] = round(kgSum(own.filter((h) => h.crop === c.crop)), 2);
    }
    const f = groupFigures(crops, own, cropYield);
    return { flush, from: Math.min(...times), to: Math.max(...times), kg: f.kg, byCrop: split, perBlock: f.perBlock, be: f.be };
  });
  const withKg = crops.filter((c) => harvests.some((h) => h.crop === c.crop && h.kg > 0));
  return {
    ...total,
    value: valueOf(harvests, cropYield),
    cost,
    byCrop,
    flushes,
    missing: {
      dryKg: crops.filter((c) => dryOf(c.crop, cropYield) === null).map((c) => c.crop),
      price: withKg.filter((c) => !num(cropYield?.[c.crop]?.priceKg)).map((c) => c.crop),
    },
  };
}

const dayOfWeek = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

// Farm-time buckets ending with the one holding `to`: 7/30 days, 90 = 13 Monday weeks, 365 = 12 calendar months.
export function buckets(harvests, { days, to }) {
  const last = localDate(to);
  let bucket;
  let ranges;
  if (days >= 365) {
    bucket = 'month';
    const [y, m] = last.split('-').map(Number);
    ranges = Array.from({ length: 12 }, (_, i) => {
      const first = new Date(Date.UTC(y, m - 1 - (11 - i), 1));
      const next = new Date(Date.UTC(y, m - 1 - (11 - i) + 1, 1));
      return { from: first.toISOString().slice(0, 10), to: addDays(next.toISOString().slice(0, 10), -1) };
    });
  } else if (days >= 90) {
    bucket = 'week';
    const monday = addDays(last, -((dayOfWeek(last) + 6) % 7));
    ranges = Array.from({ length: 13 }, (_, i) => {
      const from = addDays(monday, (i - 12) * 7);
      return { from, to: addDays(from, 6) };
    });
  } else {
    bucket = 'day';
    ranges = Array.from({ length: days }, (_, i) => {
      const d = addDays(last, i - (days - 1));
      return { from: d, to: d };
    });
  }
  ranges[ranges.length - 1].to = last; // no future dates
  const out = ranges.map((r) => ({ ...r, kg: 0 }));
  for (const h of harvests) {
    const d = localDate(h.pickedAt);
    const b = out.find((r) => d >= r.from && d <= r.to);
    if (b) b.kg = round(b.kg + h.kg, 3);
  }
  return { bucket, from: out[0].from, to: last, buckets: out };
}

// One record per farm date, room, crop and run, in date, room name, crop order.
export function recordRows(harvests, rooms, runs) {
  const groups = new Map();
  for (const h of harvests) {
    const date = localDate(h.pickedAt);
    const key = `${date}|${h.roomId}|${h.crop}|${h.runId}`;
    let g = groups.get(key);
    if (!g) {
      g = { date, roomId: h.roomId, roomName: rooms.get(h.roomId)?.name ?? '', crop: h.crop, runStartedAt: runs.get(h.runId)?.startedAt ?? null, kg: 0 };
      groups.set(key, g);
    }
    g.kg = round(g.kg + h.kg, 3);
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...groups.values()].sort((a, b) => cmp(a.date, b.date) || cmp(a.roomName, b.roomName) || cmp(a.crop, b.crop) || a.runStartedAt - b.runStartedAt);
}

export const CSV_HEADER = 'date,time,room,crop,run started,stage,flush,blocks,kg,worker,from';

export function csvRows(harvests, rooms, runs) {
  const rows = [...harvests].sort((a, b) => a.pickedAt - b.pickedAt).map((h) => {
    const started = runs.get(h.runId)?.startedAt;
    return [
      localDate(h.pickedAt), localTime(h.pickedAt), rooms.get(h.roomId)?.name ?? '', CROPS[h.crop]?.name ?? h.crop,
      started === undefined || started === null ? '' : localDate(started), STAGES[h.stage] ?? h.stage, h.flush, h.blocks, h.kg, h.worker,
      h.taskId ? 'harvest check' : 'recorded',
    ].map(cell).join(',');
  });
  return [CSV_HEADER, ...rows];
}
