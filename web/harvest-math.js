// The Harvest page's pure parts (spec 2026-11-04-harvest-design.md 7): the one formatter for kg, kg per block, BE and RM,
// the Crop tab's summary line, the flush table's columns, the myGAP sheet's rows, the room's Harvest tab (its run head,
// tiles, tables, harvest lines and the bodies of Record and Edit), and the farm's Harvest page and Overview card. Every formatter shows a dash for a
// missing figure (null, undefined, not a number) rather than throwing. A number keeps its unit at a wrap (a no-break
// space, as web/text-math.js and the Units Rule have it) and a '·' joins with DOT.

import { cropShortName, STAGES } from './crops.js';
import { DOT } from './text-math.js';
import { farmDate, farmTime, dayMonth, dayTitle } from './tasks-math.js';
import { isClock, normaliseClock } from './light-math.js';
import { tickCountFor } from './history-math.js';
import { roomHash } from './route.js';

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

// Cost per kg: 2 decimals from RM 0.10 ("RM 3.10"); below, its first two significant digits up to 4 decimals ("RM 0.04",
// "RM 0.004", "RM 0.0035"), so a big pick on a cheap day never shows a false "RM 0.00" (a true 0 does).
export function costKgText(v) {
  if (!finite(v) || v <= 0 || v >= 0.1) return rmText(v);
  if (v < 0.0001) return `under${NB}RM${NB}0.0001`;
  return `RM${NB}${grouped(v, 2, Math.min(4, 1 - Math.floor(Math.log10(v))))}`;
}

const daysText = (days) => `${days}${NB}${days === 1 ? 'day' : 'days'}`;

// What a cost per kg counts, short enough for a tile: "electricity and water · 46 days" (at today's prices: pricesNote).
function costBasis({ days, water }) {
  return `${water ? 'electricity and water' : 'electricity'}${finite(days) ? `${DOT}${daysText(days)}` : ''}`;
}

// "RM 3.10 per kg · electricity and water over 46 days at today’s prices".
export function costText({ costPerKg, days, water } = {}) {
  if (!finite(costPerKg)) return DASH;
  const over = finite(days) ? ` over ${daysText(days)}` : '';
  return `${costKgText(costPerKg)} per${NB}kg${DOT}${water ? 'electricity and water' : 'electricity'}${over} at today’s prices`;
}

// The energy per kg tile (2026-11-05, the Business audit: "Energy per kg", as it counts only the electricity and water; the
// whole cost per kg is Costs'): its figure and what it counts; a dash that says why when no energy was recorded (never RM 0.00) or
// while the server still works the room's energy out (its harvest event then reloads the page).
const NONE_LINES = { 'no-energy': 'No energy recorded yet', pending: 'Working out the energy cost…' };
function costTile(cost) {
  const label = 'Energy per kg';
  if (NONE_LINES[cost?.none]) return { label, value: DASH, line: NONE_LINES[cost.none] };
  return finite(cost?.costPerKg) ? { label, value: costKgText(cost.costPerKg), line: costBasis(cost) } : { label, value: DASH };
}

// The note under the tiles when an energy per kg shows: its prices are today's.
export const pricesNote = (cost) => (finite(cost?.costPerKg) ? 'Energy per kg is at today’s prices.' : null);

const names = (crops) => crops.map(cropName).join(', ');

// The expected value tile: the priced crops' value, and the crops left out with their kg ("without Lion's mane (34.4 kg, no
// price)"), or why there is none ("Lion's mane has no price"). kgOf(crop): the crop's kg in the same group.
function valueTile(value, unpriced, kgOf) {
  const label = 'Expected value';
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
  return ['Flush', 'Dates', ...perCrop, 'kg', 'kg per block', 'BE'];
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

// ---- the room's Harvest tab ----

const blocksText = (n) => `${grouped(n, 0)}${NB}${n === 1 ? 'block' : 'blocks'}`;
const dayOf = (ms) => dayMonth(farmDate(ms));
const whenText = (ms) => `${dayOf(ms).replace(' ', NB)} ${farmTime(ms)}`; // "4 Nov" never parts at a wrap
const andList = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

// The days from one farm time to another: "20 Oct", "21–27 Oct", "30 Oct – 4 Nov", "28 Dec 2025 – 30 Jan 2026". (Exported
// for the Run page's dates, spec 2026-11-05-runs-design.md 7: one formatter for a run's days.)
export function dayRange(from, to) {
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

// A harvest's row: { when: '4 Nov 08:12', what: 'Flush 2' (a mixed room: 'Grey oyster · flush 2'), kg, who, from ('' for one
// recorded by hand, the usual case)}.
export function harvestLine(h, { mixed = false } = {}) {
  const flush = h.flush === null || h.flush === undefined ? 'before records' : `flush ${h.flush}`;
  const what = mixed ? `${cropName(h.crop)}${DOT}${flush}` : flush[0].toUpperCase() + flush.slice(1);
  return { when: whenText(h.pickedAt), what, kg: kgText(h.kg, { exact: true }), who: h.worker ?? '', from: h.taskId ? 'from the harvest check' : '' };
}

// ---- Login ---- whether a reply carries the money: a worker's leaves value out (spec 2026-11-06-login-design.md 4)
export const hasMoney = (figures) => figures !== null && typeof figures === 'object' && 'value' in figures;
const MONEY_COLUMNS = new Set(['Expected value', 'Energy per kg']);
const columnsFor = (columns, money) => (money ? columns : columns.filter((c) => !MONEY_COLUMNS.has(c)));

// The Past runs table: a row per run, its dates first (the row's name, opening the run), then pastColumns(money)' figures.
export const PAST_COLUMNS = ['Dates', 'Crops', 'kg', 'kg per block', 'BE', 'Expected value', 'Energy per kg'];
export const pastColumns = (money = true) => columnsFor(PAST_COLUMNS, money);

// A past run: { title: its dates, cells: the crops and blocks, kg, kg per block, BE, and with money the RM and cost per kg (a dash when unknown) }.
export function pastRow(run, money = true) {
  const dates = dayRange(run.startedAt, run.endedAt ?? run.startedAt);
  return {
    title: run.partial ? `Recorded ${dates}` : dates,
    cells: [cropBlocks(run.crops).join(', '), kgText(run.kg), perBlockText(run.perBlock, { cell: true }), beText(run.be, { cell: true }),
      ...(money ? [rmText(run.value), costKgText(run.cost?.costPerKg)] : [])],
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

// The per-crop kg columns of the flushes table: [from, to) in flushColumns' order (none, [2, 2], with one crop).
export function flushPerCrop(crops) {
  const n = new Set((Array.isArray(crops) ? crops : []).map((c) => c.crop)).size;
  return [2, n > 1 ? 2 + n : 2];
}

// A mixed room's split of each flush in flushRows' order, the line under "Flush N" on a phone where the per-crop columns
// give way: "Grey oyster 55.6 · Lion's mane 25.2" (the crops picked that flush); null with one crop.
export function flushSplits(run) {
  const keys = [...new Set((run.crops ?? []).map((c) => c.crop))];
  return (run.flushes ?? []).map((f) => (keys.length > 1
    ? keys.filter((k) => finite(f.byCrop?.[k])).map((k) => `${cropName(k)} ${grouped(f.byCrop[k], 1)}`).join(DOT)
    : null));
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
export const BY_CROP_COLUMNS = ['Crop', 'Blocks', 'kg', 'kg per block', 'BE', 'Expected value'];
export const byCropColumns = (money = true) => columnsFor(BY_CROP_COLUMNS, money);

// The By crop table of a mixed room, in byCropColumns(money)'s order.
export const byCropRows = (run, money = true) => (run.byCrop ?? []).map((c) => [
  cropName(c.crop), blocksText(c.blocks), kgText(c.kg), perBlockText(c.perBlock, { cell: true }), beText(c.be, { cell: true }),
  ...(money ? [rmText(c.value)] : []),
]);

// This run's tiles: [{ label, title? (the label in full: BE), value, line? }], named as the tables' heads name them;
// the expected value and energy tiles only when the reply has money.
export function runTiles(run) {
  return [
    { label: 'kg', value: kgText(run.kg) },
    { label: 'kg per block', value: perBlockText(run.perBlock, { cell: true }) },
    { label: 'BE', title: 'Biological efficiency', value: beText(run.be, { cell: true }) },
    ...(hasMoney(run) ? [valueTile(run.value, run.unpriced, kgIn(run.byCrop)), costTile(run.cost)] : []),
  ];
}

// Delete's title names the harvest; its lead when and who ("Picked 4 Nov 14:36 by Kumar.").
export const deleteTitle = (h) => `Delete ${kgText(h.kg, { exact: true })} of ${cropName(h.crop)}?`;
export const deleteLead = (h) => `Picked ${whenText(h.pickedAt)}${h.worker ? ` by ${h.worker}` : ''}.`;

// Record a harvest's title with the room ("Record a harvest · Room 1") and its lead, the stamp the harvest will take
// ("Flush 3 · Fruiting"; null when unknown).
export const recordTitle = (roomName) => (roomName ? `Record a harvest${DOT}${roomName}` : 'Record a harvest');
export const recordLead = (stamp) => (stamp && finite(stamp.flush) ? `Flush ${stamp.flush}${DOT}${STAGES[stamp.stage] ?? stamp.stage}` : null);

// The date box's day in the farm's words under it ("Wednesday 4 Nov", the Calendar's words): a browser shows the date in its own locale (11/04/2026).
export const dateHint = (date) => (/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? '')) ? dayTitle(date) : '');

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

// One pick over this many kg a block asks again before it is kept (Record, Edit, the harvest check's Done): a whole good
// flush is about 0.2 to 0.3 kg a block, so more in one pick is likelier a slipped decimal point or the wrong blocks than a
// real pick. Asked, not refused: the farmer may know better.
export const PICK_MAX_PER_BLOCK = 0.3;

// A pick of kg from the crop's blocks in the run: null when plausible (or the blocks unknown), else { perBlock, message }.
export function pickCheck(kg, blocks) {
  if (!finite(kg) || !finite(blocks) || blocks <= 0 || kg / blocks <= PICK_MAX_PER_BLOCK) return null;
  const perBlock = kg / blocks;
  return { perBlock, message: `That's ${perBlockText(perBlock)} in one pick. Is ${kgText(kg, { exact: true })} right?` };
}

// A dialog's picks [{ field, kg, blocks }] → each implausible one, [{ field, message }] for its box ([] when none).
export const pickWarnings = (picks) => picks.flatMap((p) => {
  const c = pickCheck(p.kg, p.blocks);
  return c ? [{ field: p.field, message: c.message }] : [];
});

// Record's pick (recordBody's body): the kg over the run's blocks of the crop picked.
export const recordPicks = (body, run) => [{ field: 'kg', kg: body.kg, blocks: (run?.crops ?? []).find((c) => c.crop === body.crop)?.blocks }];

// Edit's pick (editBody's body): a changed kg over the harvest's own blocks; a kg left as it was is not asked about.
export const editPicks = (body, h) => ('kg' in body ? [{ field: 'kg', kg: body.kg, blocks: h.blocks }] : []);

// The picks of a Done body (tasks-math.js doneBody) on a harvest check: its kg boxes with the run's blocks of each crop
// (the row's harvestCrops); [] for another row or nothing weighed.
export function donePicks(row, body) {
  const crops = Array.isArray(row?.harvestCrops) ? row.harvestCrops : [];
  if (body?.amounts) return crops.filter((c) => finite(body.amounts[c.crop])).map((c) => ({ field: `kg:${c.crop}`, kg: body.amounts[c.crop], blocks: c.blocks }));
  return crops.length === 1 && finite(body?.amount) ? [{ field: 'amount', kg: body.amount, blocks: crops[0].blocks }] : [];
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

// The Overview card beside Energy and water: { tiles: [{ label, value, line, note }], empty } (line: the 30 days' expected value;
// note: the crops it leaves out; empty: the words when nothing was picked in 30 days).
export function overviewTiles(farm) {
  if (!(farm?.last30?.kg > 0)) return { tiles: [], empty: 'No harvests in the last 30 days.' };
  const out = Array.isArray(farm.last30.unpriced) ? farm.last30.unpriced : [];
  return {
    tiles: [
      { label: 'Today', value: kgText(farm.today?.kg), line: null, note: null },
      { label: '7 days', value: kgText(farm.last7?.kg), line: null, note: null },
      {
        label: '30 days', value: kgText(farm.last30.kg), line: finite(farm.last30.value) ? `${rmText(farm.last30.value)} expected` : null,
        note: out.length ? `${names(out)} not priced` : null,
      },
    ],
    empty: null,
  };
}

// The page's tiles over its range, as the room tab's: kg, expected value, energy per kg.
export function pageTiles(farm) {
  return [
    { label: 'kg', value: kgText(farm.totals?.kg) },
    ...(hasMoney(farm.totals) ? [valueTile(farm.totals.value, farm.totals.unpriced, kgIn(farm.crops)), costTile(farm.totals.cost)] : []),
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
export const ROOM_COLUMNS = ['Room', 'kg', 'Expected value', 'kg per block', 'BE'];
export const roomColumns = (money = true) => columnsFor(ROOM_COLUMNS, money);
// without: under a room's expected value that leaves out a crop with no price ("without Lion's mane"), else null. run: the run's
// figures in words for a phone, where the two run columns give way to a line under the room's name, or null without a run.
function runWords(current) {
  if (!current) return null;
  const parts = [perBlockText(current.perBlock), ...(finite(current.be) ? [beText(current.be)] : [])];
  return `This run ${parts.join(DOT)}`;
}
export const roomRows = (farm, money = true) => (farm.rooms ?? []).filter((r) => r.kg > 0 || r.current).map((r) => ({
  id: r.id, name: r.name, crops: r.crops,
  cells: [kgText(r.kg), ...(money ? [rmText(r.value)] : []), perBlockText(r.current?.perBlock, { cell: true }), beText(r.current?.be, { cell: true })],
  without: money && finite(r.value) && r.unpriced?.length ? `without ${names(r.unpriced)}` : null,
  run: runWords(r.current),
}));

// By crop, most picked first (the server's order).
export const CROP_COLUMNS = ['Crop', 'kg', 'Expected value'];
export const cropColumns = (money = true) => columnsFor(CROP_COLUMNS, money);
export const cropRows = (farm, money = true) => (farm.crops ?? []).map((c) => ({
  crop: c.crop, name: cropName(c.crop), cells: [kgText(c.kg), ...(money ? [rmText(c.value)] : [])],
}));

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

// The Overview card's strip of the 30 days: a bar per day with kg in a width × height box (no axis; the tallest the box's
// height, a hair between bars), each with its tip ("3 Nov · 2.4 kg").
export function stripBars(farm, width, height) {
  const buckets = Array.isArray(farm?.buckets) ? farm.buckets : [];
  const top = Math.max(0, ...buckets.map((b) => (finite(b.kg) ? b.kg : 0)));
  if (!buckets.length || top <= 0) return [];
  const slot = width / buckets.length;
  return buckets.flatMap((b, i) => {
    if (!(b.kg > 0)) return [];
    const h = (b.kg / top) * height;
    return [{ x: i * slot, y: height - h, w: Math.max(1, slot - 1), h, title: barTip(farm.bucket ?? 'day', b) }];
  });
}

// The Overview card's rooms: those that picked in the reply's range, with their kg and a link to their Harvest tab.
export const overviewRooms = (farm) => (farm?.rooms ?? []).filter((r) => r.kg > 0)
  .map((r) => ({ id: r.id, name: r.name, href: roomHash(r.id, 'harvest'), kg: kgText(r.kg) }));
