// The Harvest page's pure parts (spec 2026-11-04-harvest-design.md 7): the one formatter for kg, kg per block, BE and RM,
// the Crop tab's summary line, the flush table's columns, the myGAP sheet's rows and the room's Harvest tab (its run head,
// tiles, tables, harvest lines and the bodies of Record and Edit). Every formatter shows a dash for a
// missing figure (null, undefined, not a number) rather than throwing. A number keeps its unit at a wrap (a no-break
// space, as web/text-math.js and the Units Rule have it) and a '·' joins with DOT.

import { CROPS } from './crops.js';
import { DOT } from './text-math.js';
import { farmDate, farmTime, dayMonth } from './tasks-math.js';

const NB = ' ';
const DASH = '—';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FARM_OFFSET_MS = 8 * 3_600_000; // the farm's time is UTC+8 all year (Asia/Kuala_Lumpur keeps no summer time)
const MAX_KG = 10_000;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const cropName = (key) => CROPS[key]?.name ?? String(key ?? '');
const grouped = (n, min, max = min) => n.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });

// Totals to 1 decimal ("18.4 kg"); one harvest (exact) up to 2 ("2.35 kg", "2 kg").
export function kgText(v, { exact = false } = {}) {
  if (!finite(v)) return DASH;
  return `${exact ? grouped(v, 0, 2) : grouped(v, 1)}${NB}kg`;
}

// cell: in a table or tile whose head names the figure ("0.31 kg" under "kg per block", "34 %" under "BE").
export const perBlockText = (v, { cell = false } = {}) => (finite(v) ? `${grouped(v, 2)}${NB}kg${cell ? '' : ' per block'}` : DASH);
export const beText = (v, { cell = false } = {}) => (finite(v) ? `${cell ? '' : 'BE '}${grouped(v, 0)}${NB}%` : DASH);
export const rmText = (v) => (finite(v) ? `RM${NB}${grouped(v, 2)}` : DASH);

// What a cost per kg counts: "electricity and water over 46 days at today’s prices".
function costBasis({ days, water }) {
  const over = finite(days) ? ` over ${days}${NB}${days === 1 ? 'day' : 'days'}` : '';
  return `${water ? 'electricity and water' : 'electricity'}${over} at today’s prices`;
}

// "RM 3.10 per kg · electricity and water over 46 days at today’s prices".
export function costText({ costPerKg, days, water } = {}) {
  if (!finite(costPerKg)) return DASH;
  return `${rmText(costPerKg)} per${NB}kg${DOT}${costBasis({ days, water })}`;
}

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
    return [longDate(h.date), cropName(h.crop), `${h.roomName}${DOT}run of ${run}`, finite(h.kg) ? String(h.kg) : '', '', '', '', '', ''];
  });
}

// ---- the room's Harvest tab ----

const blocksText = (n) => `${grouped(n, 0)}${NB}${n === 1 ? 'block' : 'blocks'}`;
const dayOf = (ms) => dayMonth(farmDate(ms));
const whenText = (ms) => `${dayOf(ms)} ${farmTime(ms)}`;
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

// This run's tiles: [{ label, value, line? }] (line: what the cost per kg counts).
export function runTiles(run) {
  const cost = finite(run.cost?.costPerKg) ? run.cost : null;
  return [
    { label: 'Picked', value: kgText(run.kg) },
    { label: 'Per block', value: perBlockText(run.perBlock, { cell: true }) },
    { label: 'Biological efficiency', value: beText(run.be, { cell: true }) },
    { label: 'Value', value: rmText(run.value) },
    cost ? { label: 'Cost per kg', value: rmText(cost.costPerKg), line: costBasis(cost) } : { label: 'Cost per kg', value: DASH },
  ];
}

export const deleteQuestion = (h) => `Delete ${kgText(h.kg, { exact: true })} of ${cropName(h.crop)} picked ${whenText(h.pickedAt)}?`;

// The date and time box (datetime-local) in the farm's time, whatever the browser's: "2026-11-04T08:12" and back to ms.
export function whenValue(ms) {
  return `${farmDate(ms)}T${farmTime(ms)}`;
}
export function whenMs(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(text ?? ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - FARM_OFFSET_MS : NaN;
}

// kg over 0 up to 10,000, at most 3 decimals (as the Done dialog's amount).
function kgOf(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { error: 'Give the kg picked' };
  const n = /^[0-9]{1,5}(\.[0-9]{1,3})?$/.test(s) ? Number(s) : NaN;
  return n > 0 && n <= MAX_KG ? { value: n } : { error: 'kg must be a number over 0 up to 10,000' };
}

// The time picked: null when the box still shows what it showed (the server keeps the time, or takes now), else ms from the
// run's start (its first minute counts: the box has no seconds) to its end or now.
function pickedOf(text, { run, now, shown }) {
  if (text === shown) return { value: null };
  let ms = whenMs(text);
  if (Number.isNaN(ms)) return { error: 'Pick a date and time' };
  if (ms < run.startedAt && ms + 60_000 > run.startedAt) ms = run.startedAt;
  const to = Math.min(run.endedAt ?? Infinity, now);
  if (ms < run.startedAt || ms > to) return { error: run.endedAt === null || run.endedAt === undefined ? "Pick a time from the run's start to now" : "Pick a time from the run's start to its end" };
  return { value: ms };
}

// Record a harvest's body { crop, kg, worker, pickedAt? } (crop: the run's only crop when there is no picker), or { error, field }.
export function recordBody(values, { run, now, shown }) {
  const worker = String(values.worker ?? '').trim();
  if (!worker) return { error: 'Pick who picked it', field: 'worker' };
  const kg = kgOf(values.kg);
  if (kg.error) return { error: kg.error, field: 'kg' };
  const when = pickedOf(values.pickedAt, { run, now, shown });
  if (when.error) return { error: when.error, field: 'pickedAt' };
  const crop = values.crop ?? run.crops?.[0]?.crop;
  return { crop, kg: kg.value, worker, ...(when.value === null ? {} : { pickedAt: when.value }) };
}

// Edit's body: the kg and the time that changed ({} when neither did), or { error, field }.
export function editBody(values, h, { run, now, shown }) {
  const kg = kgOf(values.kg);
  if (kg.error) return { error: kg.error, field: 'kg' };
  const when = pickedOf(values.pickedAt, { run, now, shown });
  if (when.error) return { error: when.error, field: 'pickedAt' };
  return { ...(kg.value === h.kg ? {} : { kg: kg.value }), ...(when.value === null ? {} : { pickedAt: when.value }) };
}
