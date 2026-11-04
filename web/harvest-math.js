// The Harvest page's pure parts (spec 2026-11-04-harvest-design.md 7): the one formatter for kg, kg per block, BE and RM,
// the Crop tab's summary line, the flush table's columns, the myGAP sheet's rows, the room's Harvest tab (its run head,
// tiles, tables, harvest lines and the bodies of Record and Edit), and the farm's Harvest page and Overview card. Every formatter shows a dash for a
// missing figure (null, undefined, not a number) rather than throwing. A number keeps its unit at a wrap (a no-break
// space, as web/text-math.js and the Units Rule have it) and a '·' joins with DOT.

import { cropShortName } from './crops.js';
import { DOT } from './text-math.js';
import { farmDate, farmTime, dayMonth } from './tasks-math.js';
import { isClock, normaliseClock } from './light-math.js';
import { tickCountFor } from './history-math.js';

const NB = ' ';
const DASH = '—';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FARM_OFFSET_MS = 8 * 3_600_000; // the farm's time is UTC+8 all year (Asia/Kuala_Lumpur keeps no summer time)
const MAX_KG = 10_000;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const cropName = cropShortName; // a record's crop: no "(draft)"
const grouped = (n, min, max = min) => n.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });

// Totals to 1 decimal ("18.4 kg"); one harvest (exact) to 2 ("2.35 kg", "2.00 kg"), so a list's figures line up.
export function kgText(v, { exact = false } = {}) {
  if (!finite(v)) return DASH;
  return `${grouped(v, exact ? 2 : 1)}${NB}kg`;
}

// cell: in a table or tile whose head names the figure ("0.31 kg" under "kg per block", "34 %" under "BE").
export const perBlockText = (v, { cell = false } = {}) => (finite(v) ? `${grouped(v, 2)}${NB}kg${cell ? '' : ' per block'}` : DASH);
export const beText = (v, { cell = false } = {}) => (finite(v) ? `${cell ? '' : 'BE '}${grouped(v, 0)}${NB}%` : DASH);
export const rmText = (v) => (finite(v) ? `RM${NB}${grouped(v, 2)}` : DASH);

const daysText = (days) => `${days}${NB}${days === 1 ? 'day' : 'days'}`;

// What a cost per kg counts, short enough for a tile: "electricity and water · 46 days" (at today's prices: pricesNote).
function costBasis({ days, water }) {
  return `${water ? 'electricity and water' : 'electricity'}${finite(days) ? `${DOT}${daysText(days)}` : ''}`;
}

// "RM 3.10 per kg · electricity and water over 46 days at today’s prices".
export function costText({ costPerKg, days, water } = {}) {
  if (!finite(costPerKg)) return DASH;
  const over = finite(days) ? ` over ${daysText(days)}` : '';
  return `${rmText(costPerKg)} per${NB}kg${DOT}${water ? 'electricity and water' : 'electricity'}${over} at today’s prices`;
}

// The cost per kg tile: its figure and what it counts; a dash that says why when no energy was recorded (never RM 0.00).
function costTile(cost) {
  const label = 'Cost per kg';
  if (cost?.none === 'no-energy') return { label, value: DASH, line: 'No energy recorded yet' };
  return finite(cost?.costPerKg) ? { label, value: rmText(cost.costPerKg), line: costBasis(cost) } : { label, value: DASH };
}

// The note under the tiles when a cost per kg shows: its prices are today's.
export const pricesNote = (cost) => (finite(cost?.costPerKg) ? 'The cost per kg is at today’s prices.' : null);

const names = (crops) => crops.map(cropName).join(', ');

// The RM value tile: the priced crops' value, and the crops left out with their kg ("without Lion's mane (34.4 kg, no
// price)"), or why there is none ("Lion's mane has no price"). kgOf(crop): the crop's kg in the same group.
function valueTile(value, unpriced, kgOf) {
  const label = 'RM value';
  const out = Array.isArray(unpriced) ? unpriced : [];
  if (!out.length) return { label, value: rmText(value) };
  if (!finite(value)) return { label, value: DASH, line: `${names(out)} ${out.length === 1 ? 'has' : 'have'} no price` };
  const kg = out.reduce((s, c) => s + (finite(kgOf(c)) ? kgOf(c) : 0), 0);
  return { label, value: rmText(value), line: `without ${names(out)} (${kgText(kg)}, no price)` };
}
const kgIn = (list) => (crop) => (Array.isArray(list) ? list : []).find((c) => c.crop === crop)?.kg;

// The Crop tab's line for the run: { kg, perBlock, be } of the run so far and the number of the flush it is in.
export function summaryLine({ kg, perBlock, be } = {}, flush) {
  if (!finite(kg) || kg <= 0) return 'No harvests recorded in this run yet.';
  const parts = [`Flush ${flush}`, `${kgText(kg)} this run`, perBlockText(perBlock)];
  if (finite(be)) parts.push(beText(be));
  return parts.join(DOT);
}

// The flush table's head: one kg column per crop when the room grows more than one.
export function flushColumns(crops) {
  const keys = [...new Set((Array.isArray(crops) ? crops : []).map((c) => c.crop))];
  const perCrop = keys.length > 1 ? keys.map((k) => `${cropName(k)} kg`) : [];
  return ['Flush', 'Days', ...perCrop, 'kg', 'kg per block', 'BE'];
}

// "2026-11-03" → "3 Nov 2026".
function longDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : DASH;
}

// The myGAP sheet: one row per record of the farm's reply (a day, room, crop and run), the sales cells left blank for the
// farmer. records: [{ date, roomName, crop, runStartedAt (ms), kg }]; the run's day is the farm's (UTC+8).
export function sheetRows(records) {
  return (Array.isArray(records) ? records : []).map((h) => {
    const run = finite(h.runStartedAt) ? dayMonth(farmDate(h.runStartedAt)) : DASH;
    return [longDate(h.date), cropName(h.crop), `${h.roomName}${DOT}run of ${run}`, finite(h.kg) ? grouped(h.kg, 2) : '', '', '', '', '', ''];
  });
}

// The sheet's Total row: the period's kg to 2 decimals (the column's head has the unit), '' when unknown.
export const sheetTotal = (farm) => (finite(farm?.totals?.kg) ? grouped(farm.totals.kg, 2) : '');

// ---- the room's Harvest tab ----

const blocksText = (n) => `${grouped(n, 0)}${NB}${n === 1 ? 'block' : 'blocks'}`;
const dayOf = (ms) => dayMonth(farmDate(ms));
const whenText = (ms) => `${dayOf(ms).replace(' ', NB)} ${farmTime(ms)}`; // "4 Nov" never parts at a wrap
const andList = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

// The days from one farm time to another: "20 Oct", "21–27 Oct", "30 Oct – 4 Nov", "28 Dec 2025 – 30 Jan 2026".
function dayRange(from, to) {
  const [a, b] = [farmDate(from), farmDate(to)];
  if (a === b) return dayMonth(a);
  if (a.slice(0, 4) !== b.slice(0, 4)) return `${longDate(a)} – ${longDate(b)}`;
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8))}–${dayMonth(b)}`;
  return `${dayMonth(a)} – ${dayMonth(b)}`;
}

// "Grey oyster 500 blocks" for each of the run's crops.
const cropBlocks = (crops) => (Array.isArray(crops) ? crops : []).map((c) => `${cropName(c.crop)} ${blocksText(c.blocks)}`);

// This run's line: "Blocks in 3 Oct · Grey oyster 500 blocks"; a run under way at the upgrade "Recorded from 4 Nov · …".
export function runHead(run) {
  return [`${run.partial ? 'Recorded from' : 'Blocks in'} ${dayOf(run.startedAt)}`, ...cropBlocks(run.crops)].join(DOT);
}

// A harvest's row: { when: '4 Nov 08:12', what: 'Flush 2' (a mixed room: 'Grey oyster · flush 2'), kg, who, from }.
export function harvestLine(h, { mixed = false } = {}) {
  const flush = h.flush === null || h.flush === undefined ? 'before records' : `flush ${h.flush}`;
  const what = mixed ? `${cropName(h.crop)}${DOT}${flush}` : flush[0].toUpperCase() + flush.slice(1);
  return { when: whenText(h.pickedAt), what, kg: kgText(h.kg, { exact: true }), who: h.worker ?? '', from: h.taskId ? 'from the harvest check' : 'recorded' };
}

// A past run: { title: its dates, cells: the crops and blocks, kg, kg per block, BE, RM, cost per kg (a dash when unknown) }.
export function pastRow(run) {
  const dates = dayRange(run.startedAt, run.endedAt ?? run.startedAt);
  return {
    title: run.partial ? `Recorded ${dates}` : dates,
    cells: [cropBlocks(run.crops).join(', '), kgText(run.kg), perBlockText(run.perBlock), beText(run.be), rmText(run.value),
      finite(run.cost?.costPerKg) ? `${rmText(run.cost.costPerKg)} per${NB}kg` : DASH],
  };
}

// The note under the figures when Settings → Yield lacks one: the crops named, or null.
export function missingNote(missing) {
  const dry = (missing?.dryKg ?? []).map(cropName);
  const price = (missing?.price ?? []).map(cropName);
  if (dry.length && dry.join() === price.join()) return `Set the dry substrate per block and the price of ${andList(dry)} in Settings → Yield.`;
  const parts = [dry.length && `the dry substrate per block of ${andList(dry)}`, price.length && `the price of ${andList(price)}`].filter(Boolean);
  return parts.length ? `Set ${parts.join(' and ')} in Settings → Yield.` : null;
}

// The flushes table's rows, in flushColumns' order: "Before records" (copied without a flush) first, then each flush.
export function flushRows(run) {
  const keys = [...new Set((run.crops ?? []).map((c) => c.crop))];
  return (run.flushes ?? []).map((f) => [
    f.flush === null ? 'Before records' : `Flush ${f.flush}`,
    dayRange(f.from, f.to),
    ...(keys.length > 1 ? keys.map((k) => kgText(f.byCrop?.[k])) : []),
    kgText(f.kg), perBlockText(f.perBlock, { cell: true }), beText(f.be, { cell: true }),
  ]);
}
export const BY_CROP_COLUMNS = ['Crop', 'Blocks', 'kg', 'kg per block', 'BE', 'RM value'];

// The By crop table of a mixed room, in BY_CROP_COLUMNS' order.
export const byCropRows = (run) => (run.byCrop ?? []).map((c) => [
  cropName(c.crop), blocksText(c.blocks), kgText(c.kg), perBlockText(c.perBlock, { cell: true }), beText(c.be, { cell: true }), rmText(c.value),
]);

// This run's tiles: [{ label, title? (the label in full: BE), value, line? }], named as the tables' heads name them.
export function runTiles(run) {
  return [
    { label: 'kg', value: kgText(run.kg) },
    { label: 'kg per block', value: perBlockText(run.perBlock, { cell: true }) },
    { label: 'BE', title: 'Biological efficiency', value: beText(run.be, { cell: true }) },
    valueTile(run.value, run.unpriced, kgIn(run.byCrop)),
    costTile(run.cost),
  ];
}

// Delete's title names the harvest; its lead when and who ("Picked 4 Nov 14:36 by Kumar.").
export const deleteTitle = (h) => `Delete ${kgText(h.kg, { exact: true })} of ${cropName(h.crop)}?`;
export const deleteLead = (h) => `Picked ${whenText(h.pickedAt)}${h.worker ? ` by ${h.worker}` : ''}.`;

// The date box and the 24 h time box (a text box: a browser's own time input follows its locale) in the farm's time,
// whatever the browser's: { date: '2026-11-04', time: '08:12' }, and back to ms ("8:12" and "0812" are 08:12 too).
export function whenBoxes(ms) {
  return { date: farmDate(ms), time: farmTime(ms) };
}
export function whenMs(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  const t = normaliseClock(time);
  if (!d || !isClock(t)) return NaN;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t.slice(0, 2)), Number(t.slice(3))) - FARM_OFFSET_MS;
}

// kg over 0 up to 10,000, at most 3 decimals (as the Done dialog's amount).
function kgOf(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { error: 'Give the kg picked' };
  const n = /^[0-9]{1,5}(\.[0-9]{1,3})?$/.test(s) ? Number(s) : NaN;
  return n > 0 && n <= MAX_KG ? { value: n } : { error: 'kg must be a number over 0 up to 10,000' };
}

// The time picked: null when both boxes still show what they showed (the server keeps the time, or takes now), else ms from
// the run's start (its first minute counts: the box has no seconds) to its end or now. A day outside the run is the date
// box's fault; a time outside it on a day of the run, the time box's.
function pickedOf(values, { run, now, shown }) {
  const date = String(values.pickedDate ?? '');
  const time = normaliseClock(values.pickedTime);
  if (date === shown.date && time === shown.time) return { value: null };
  if (Number.isNaN(whenMs(date, '00:00'))) return { error: 'Pick a date', field: 'pickedDate' };
  let ms = whenMs(date, time);
  if (Number.isNaN(ms)) return { error: 'Give the time as 24 h, like 08:12', field: 'pickedTime' };
  if (ms < run.startedAt && ms + 60_000 > run.startedAt) ms = run.startedAt;
  const to = Math.min(run.endedAt ?? Infinity, now);
  if (ms >= run.startedAt && ms <= to) return { value: ms };
  const error = run.endedAt === null || run.endedAt === undefined ? "Pick a time from the run's start to now" : "Pick a time from the run's start to its end";
  return { error, field: date < farmDate(run.startedAt) || date > farmDate(to) ? 'pickedDate' : 'pickedTime' };
}

// Record a harvest's body { crop, kg, worker, pickedAt? } (crop: the run's only crop when there is no picker), or { error, field }.
export function recordBody(values, { run, now, shown }) {
  const worker = String(values.worker ?? '').trim();
  if (!worker) return { error: 'Pick who picked it', field: 'worker' };
  const kg = kgOf(values.kg);
  if (kg.error) return { error: kg.error, field: 'kg' };
  const when = pickedOf(values, { run, now, shown });
  if (when.error) return { error: when.error, field: when.field };
  const crop = values.crop ?? run.crops?.[0]?.crop;
  return { crop, kg: kg.value, worker, ...(when.value === null ? {} : { pickedAt: when.value }) };
}

// Edit's body: the kg and the time that changed ({} when neither did), or { error, field }.
export function editBody(values, h, { run, now, shown }) {
  const kg = kgOf(values.kg);
  if (kg.error) return { error: kg.error, field: 'kg' };
  const when = pickedOf(values, { run, now, shown });
  if (when.error) return { error: when.error, field: when.field };
  return { ...(kg.value === h.kg ? {} : { kg: kg.value }), ...(when.value === null ? {} : { pickedAt: when.value }) };
}

// ---- the farm: the Harvest page, the myGAP sheet and the Overview card (GET /api/harvest) ----

// The Overview card beside Energy and water: { tiles: [{ label, value, line, note }], empty } (line: the 30 days' RM value;
// note: the crops it leaves out; empty: the words when nothing was picked in 30 days).
export function overviewTiles(farm) {
  if (!(farm?.last30?.kg > 0)) return { tiles: [], empty: 'No harvests in the last 30 days.' };
  const out = Array.isArray(farm.last30.unpriced) ? farm.last30.unpriced : [];
  return {
    tiles: [
      { label: 'Today', value: kgText(farm.today?.kg), line: null, note: null },
      { label: '7 days', value: kgText(farm.last7?.kg), line: null, note: null },
      {
        label: '30 days', value: kgText(farm.last30.kg), line: finite(farm.last30.value) ? rmText(farm.last30.value) : null,
        note: out.length ? `${names(out)} not priced` : null,
      },
    ],
    empty: null,
  };
}

// The page's tiles over its range, as the room tab's: kg, RM value, cost per kg.
export function pageTiles(farm) {
  return [
    { label: 'kg', value: kgText(farm.totals?.kg) },
    valueTile(farm.totals?.value, farm.totals?.unpriced, kgIn(farm.crops)),
    costTile(farm.totals?.cost),
  ];
}

const farmMidnight = (date) => whenMs(date, '00:00');
// A bucket's whole slot (the week or month under way too, so every bar is as wide as its kind): its first day to the next's
// (the farm's time keeps no summer time: a day is always 24 h).
function slotEnd(bucket, from) {
  if (bucket === 'month') {
    const [y, m] = from.split('-').map(Number);
    return farmMidnight(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10));
  }
  return farmMidnight(from) + (bucket === 'week' ? 7 : 1) * 86_400_000;
}

// drawTimeBars' bars ({ from, to (ms, the farm's midnights), v: kg, b: the reply's bucket }) and range (null without buckets).
export function harvestBars(farm) {
  const bars = (farm.buckets ?? []).map((b) => ({ from: farmMidnight(b.from), to: slotEnd(farm.bucket, b.from), v: b.kg, b }));
  return { bars, range: bars.length ? { from: bars[0].from, to: bars[bars.length - 1].to } : null };
}

// The bucket's name: "3 Nov", "Week of 2 Nov", "Nov 2026"; on the axis a month is "Nov", January with its year.
const monthOf = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
const bucketName = (bucket, date) => (bucket === 'week' ? `Week of ${dayMonth(date)}` : bucket === 'month' ? monthOf(date) : dayMonth(date));
const tickName = (bucket, date) => (bucket !== 'month' ? dayMonth(date) : date.slice(5, 7) === '01' ? monthOf(date) : MONTHS[Number(date.slice(5, 7)) - 1]);

// A bar's tip: "3 Nov · 2.4 kg", "Week of 2 Nov · 12.0 kg", "Nov 2026 · 64.5 kg".
export const barTip = (bucket, b) => `${bucketName(bucket, b.from)}${DOT}${kgText(b.kg)}`;

// The axis under the bars at a chart's width: [{ at (a bar's middle), label }], every k-th bar counted back from the last (today's)
// so the ticks fit as many as the line charts' do.
export function harvestTicks(farm, width) {
  const { bars } = harvestBars(farm);
  if (!bars.length) return [];
  const step = Math.ceil(bars.length / tickCountFor(width));
  const ticks = [];
  for (let i = bars.length - 1; i >= 0; i -= step) ticks.unshift({ at: (bars[i].from + bars[i].to) / 2, label: tickName(farm.bucket, bars[i].b.from) });
  return ticks;
}

// The page's dates: "1–4 Nov 2026", "6 Oct – 4 Nov 2026", "1 Dec 2025 – 4 Nov 2026" (an en dash, the Units Rule).
export function rangeText({ from, to }) {
  if (from === to) return longDate(to);
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${longDate(from)} – ${longDate(to)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${longDate(to)}`;
  return `${dayMonth(from)} – ${longDate(to)}`;
}

// A period by what its buckets cover: 90 days are 13 weeks of bars, 365 days 12 months.
const PERIOD_WORDS = { 90: '13 weeks', 365: '12 months' };
export const periodWords = (days) => PERIOD_WORDS[days] ?? `${days} days`;
export const emptyText = (days) => `No harvests in the last ${periodWords(days)}.`;

// By room: the rooms that picked in the range or have a run under way; kg and RM over the range, kg per block and BE the run's.
export const ROOM_COLUMNS = ['Room', 'kg', 'RM value', 'kg per block', 'BE'];
// without: under a room's RM value that leaves out a crop with no price ("without Lion's mane"), else null.
export const roomRows = (farm) => (farm.rooms ?? []).filter((r) => r.kg > 0 || r.current).map((r) => ({
  id: r.id, name: r.name, crops: r.crops,
  cells: [kgText(r.kg), rmText(r.value), perBlockText(r.current?.perBlock, { cell: true }), beText(r.current?.be, { cell: true })],
  without: finite(r.value) && r.unpriced?.length ? `without ${names(r.unpriced)}` : null,
}));

// By crop, most picked first (the server's order).
export const CROP_COLUMNS = ['Crop', 'kg', 'RM value'];
export const cropRows = (farm) => (farm.crops ?? []).map((c) => ({ crop: c.crop, name: cropName(c.crop), cells: [kgText(c.kg), rmText(c.value)] }));

// The myGAP sheet (form 4-6): its title and columns; sheetRows above fills them.
export const SHEET_TITLE = `myGAP 4-6${DOT}Production and sales record (Rekod pengeluaran dan penjualan hasil)`;
export const SHEET_COLUMNS = ['Date', 'Crop', 'Block / location', 'Harvested (kg)', 'Sold (kg)', 'Price / kg (RM)', 'Total (RM)', 'Invoice No.', 'Buyer'];

// The chart: its title and its words for a screen reader ("…: 64.5 kg in all; the most 2.4 kg, 3 Nov").
export const chartTitle = (farm) => `kg picked per ${farm.bucket}`;
export function chartLabel(farm) {
  const top = (farm.buckets ?? []).reduce((best, b) => (b.kg > (best?.kg ?? 0) ? b : best), null);
  const most = top ? `; the most ${kgText(top.kg)}, ${bucketName(farm.bucket, top.from)}` : '';
  return `${chartTitle(farm)}, ${rangeText(farm)}: ${kgText(farm.totals?.kg)} in all${most}`;
}
