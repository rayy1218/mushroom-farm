// The Batches pages' pure parts (spec 2026-11-05-batches-design.md 7): the one formatter (RM, blocks, kg, water, dates),
// the page's groups and rows, a batch's facts and lines, batchLineFor (the Harvest tab's line, wired by the integrator), the
// myGAP 4-2 sheet's rows, and the dialogs' bodies. A missing figure is a dash; a number keeps its unit at a wrap (a
// no-break space, as the Units Rule has it) and a '·' joins with DOT.

import { cropShortName } from './crops.js';
import { DOT } from './text-math.js';
import { farmDate, farmTime, dayMonth, daysFrom } from './tasks-math.js';
import { whenMs, rmText, kgText, perBlockText, beText, costKgText } from './harvest-math.js';
import { batchHash, batchesRunHash } from './route.js';

const NB = '\u00a0';
const DASH = '—';
const DAY_MS = 86_400_000;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const grouped = (n, min, max = min) => n.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });

// ---- the formatter ----

export { rmText }; // the one Format Rule (harvest-math's)
export const blocksText = (n) => (finite(n) ? `${grouped(n, 0)}${NB}${n === 1 ? 'block' : 'blocks'}` : DASH);
// A block's weight, to 2 decimals.
export const blockKgText = (v) => (finite(v) ? `${grouped(v, 2)}${NB}kg` : DASH);
export const waterText = (v) => (finite(v) ? `${grouped(v, 0)}${NB}%` : DASH);
// "3 Nov", with the year when it is not this one (today: the farm's date).
export function dateText(ms, today) {
  if (!finite(ms)) return DASH;
  const d = farmDate(ms);
  return d.slice(0, 4) === String(today).slice(0, 4) ? dayMonth(d) : `${dayMonth(d)} ${d.slice(0, 4)}`;
}
export const fullDate = (ms) => (finite(ms) ? `${dayMonth(farmDate(ms))} ${farmDate(ms).slice(0, 4)}` : DASH);
export function agoText(ms, nowMs) {
  const n = daysFrom(farmDate(ms), farmDate(nowMs));
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n}${NB}days${NB}ago`; // whole at a wrap
}
export const goodText = (b) => (b.lost > 0 ? `${grouped(b.good, 0)} of ${grouped(b.blocks, 0)} good` : blocksText(b.blocks));
export const cropBlocks = (crop) => `${cropShortName(crop)} blocks`;
// "1,200 Grey oyster blocks", "1 Pink oyster block".
export const countBlocks = (n, crop) => `${grouped(n, 0)} ${cropShortName(crop)} ${n === 1 ? 'block' : 'blocks'}`;
export function weightText(b) {
  if (!finite(b.blockKg)) return null;
  return [blockKgText(b.blockKg), `${waterText(b.waterPct)} water`, `${blockKgText(b.dryKg)} dry`].join(DOT);
}
export const CAUSE_NAMES = { green: 'Green mould', black: 'Black mould', bacterial: 'Bacterial / wet spot', pests: 'Pests', other: 'Other' };
export const roomRunText = (b, today) => (b.roomName && finite(b.runStartedAt) ? `${b.roomName}${DOT}run of ${dateText(b.runStartedAt, today)}`
  : finite(b.placedAt) ? 'a deleted room' : DASH);

// ---- the Batches page ----

// The words under a waiting batch's name and a placed one's.
// A date kept whole at a wrap ("26 Sep", not "26 / Sep").
const wholeDate = (ms, today) => dateText(ms, today).replace(/ /g, NB);
export const waitingLine = (b, nowMs) => [b.supplier, `Received ${wholeDate(b.receivedAt, farmDate(nowMs))}${DOT}${agoText(b.receivedAt, nowMs)}`].filter(Boolean).join(DOT);
export const placedLine = (b, today) => [b.supplier, b.spawnBatch ? `spawn batch ${b.spawnBatch}` : null, `received ${wholeDate(b.receivedAt, today)}`].filter(Boolean).join(DOT);

// The notes of a run whose batches of a crop hold more blocks than the run has (spec 3: allowed, said in amber).
export function overNotes(list) {
  const byCrop = new Map();
  for (const b of list) {
    const x = byCrop.get(b.crop) ?? { blocks: 0, runBlocks: b.runBlocks };
    x.blocks += b.blocks;
    byCrop.set(b.crop, x);
  }
  return [...byCrop].filter(([, x]) => finite(x.runBlocks) && x.blocks > x.runBlocks)
    .map(([crop, x]) => `Batches hold ${countBlocks(x.blocks, crop)}; the run has ${grouped(x.runBlocks, 0)}.`);
}

// { waiting, rooms: [{ runId, roomId, roomName, runStartedAt, batches, over }] by room name, past } of the list reply.
export function pageGroups(batches) {
  const runs = new Map();
  for (const b of batches.filter((x) => x.status === 'placed')) {
    if (!runs.has(b.runId)) runs.set(b.runId, { runId: b.runId, roomId: b.roomId, roomName: b.roomName, runStartedAt: b.runStartedAt, batches: [] });
    runs.get(b.runId).batches.push(b);
  }
  const rooms = [...runs.values()].sort((a, b) => String(a.roomName).localeCompare(String(b.roomName))).map((r) => ({ ...r, over: overNotes(r.batches) }));
  return { waiting: batches.filter((x) => x.status === 'waiting'), rooms, past: batches.filter((x) => x.status === 'past') };
}

export const PAST_RANGES = [[90, '90 days'], [365, '12 months'], [null, 'All']];
// The past batches received in the last `days` days (null: all).
export function pastIn(past, days, nowMs) {
  if (days === null) return past;
  const from = farmDate(nowMs - (days - 1) * DAY_MS);
  return past.filter((b) => farmDate(b.receivedAt) >= from);
}
export const PAST_COLUMNS = ['Received', 'Crop', 'Supplier', 'Spawn batch', 'Blocks', 'Lost', 'RM per block', `Room${DOT}run`];
export const pastCells = (b, today) => [dateText(b.receivedAt, today), cropShortName(b.crop), b.supplier ?? DASH, b.spawnBatch ?? DASH,
  grouped(b.blocks, 0), b.lost > 0 ? grouped(b.lost, 0) : DASH, rmText(b.pricePerBlock), roomRunText(b, today)];

// ---- a batch ----

// The Details card's rows [label, value], the empty ones left out (detail: GET /api/batches/:id).
export function detailFacts(b) {
  const total = (b.delivery ?? [b]).reduce((s, x) => s + x.blocks, 0);
  return [
    ['Spawn batch', b.spawnBatch], ['Strain', b.strain], ['Delivery note', b.deliveryRef],
    ['Inoculated', finite(b.inoculatedAt) ? fullDate(b.inoculatedAt) : null], ['Block weight', weightText(b)],
    ['Price per block', finite(b.pricePerBlock) ? rmText(b.pricePerBlock) : null],
    ['Whole delivery', finite(b.pricePerBlock) ? `${blocksText(total)}${DOT}${rmText(total * b.pricePerBlock)}` : blocksText(total)],
    ['Note', b.note],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
}
export const overNote = (b) => (b.status === 'placed' && finite(b.runBlocks) && finite(b.batchBlocks) && b.batchBlocks > b.runBlocks
  ? `Batches hold ${countBlocks(b.batchBlocks, b.crop)}; the run has ${grouped(b.runBlocks, 0)}.` : null);
// "In Container 1" kept whole at a wrap (the Units Rule's no-break spaces).
export const statusLine = (b) => (b.status === 'waiting' ? 'Waiting' : b.status === 'placed' ? `In ${b.roomName ?? 'a deleted room'}`.replace(/ /g, NB)
  : `Past${DOT}${b.roomName ?? 'a deleted room'}`);
// The head's figures: "788 good · 12 lost" (the lost part only after a loss).
export const figureLine = (b) => [`${grouped(b.good, 0)} good`, b.lost > 0 ? `${grouped(b.lost, 0)} lost` : null].filter(Boolean).join(DOT);
export const checkLine = (c, today) => [`${dateText(c.at, today)} ${farmTime(c.at)}`, `${blocksText(c.lost)} lost`, CAUSE_NAMES[c.cause] ?? c.cause, c.worker]
  .filter(Boolean).join(DOT);
export const deliveryLine = (x) => `${blocksText(x.blocks)}${DOT}${statusLine(x)}`;

// ---- the Today page's "Blocks waiting" (contract 2026-11-05) ----

// Waiting this many days or more, a batch shows on the Today page: bought blocks should go into a room soon.
export const BATCH_WAIT_DAYS = 3;
// The waiting batches (with a good block) received BATCH_WAIT_DAYS or more days ago, oldest first. → [{ id, text, href }]:
// "400 Grey oyster blocks waiting 40 days".
export function waitingLong(batches, nowMs) {
  const today = farmDate(nowMs);
  return (Array.isArray(batches) ? batches : [])
    .filter((b) => b.status === 'waiting' && b.good > 0 && finite(b.receivedAt) && daysFrom(farmDate(b.receivedAt), today) >= BATCH_WAIT_DAYS)
    .sort((a, b) => a.receivedAt - b.receivedAt || a.id - b.id)
    .map((b) => {
      const n = daysFrom(farmDate(b.receivedAt), today);
      return { id: b.id, text: `${countBlocks(b.good, b.crop)} waiting ${n}${NB}${n === 1 ? 'day' : 'days'}`, href: batchHash(b.id) };
    });
}

// ---- a batch's run: its yield (GET /api/rooms/:id/harvests, read only; contract 2026-11-05) ----

// The run of id runId in the room's harvests reply (its current run or a past one), or null.
export function runOf(reply, runId) {
  if (!reply || !Number.isInteger(runId)) return null;
  if (reply.current?.id === runId) return reply.current;
  return (Array.isArray(reply.past) ? reply.past : []).find((r) => r.id === runId) ?? null;
}

// The "This run" card of a placed or past batch: { title, tiles [{ label, title?, value }], cost, empty }, or null without a run
// (a deleted room). A mixed run gives the batch's crop's own figures. cost: "Blocks cost RM 11.50 per kg picked" (the price per
// block over the kg per block), only when both are known.
export function runYieldFacts(run, batch) {
  if (!run) return null;
  const mixed = (run.crops?.length ?? 0) > 1;
  const own = mixed ? (run.byCrop ?? []).find((c) => c.crop === batch.crop) : null;
  const src = own ?? run;
  const title = own ? `This run's ${cropShortName(batch.crop)}` : 'This run';
  const ended = finite(run.endedAt);
  if (!(src.kg > 0)) return { title, empty: ended ? 'No harvests in this run.' : 'No harvests in this run yet.', tiles: [], cost: null };
  return {
    title, empty: null,
    tiles: [
      { label: ended ? 'kg' : 'kg so far', value: kgText(src.kg) },
      { label: 'kg per block', value: perBlockText(src.perBlock, { cell: true }) },
      { label: 'BE', title: 'Biological efficiency', value: beText(src.be, { cell: true }) },
    ],
    cost: finite(batch.pricePerBlock) && src.perBlock > 0 ? `Blocks cost ${costKgText(batch.pricePerBlock / src.perBlock)} per${NB}kg picked` : null,
  };
}

// ---- the Harvest tab's line (contract section 4; the integrator wires it into harvest-card.js) ----

// run: the Harvest tab's run ({ id }); reply: GET /api/batches?run=<run.id>. → { text, href } or null without batches.
export function batchLineFor(run, reply) {
  const list = Array.isArray(reply?.batches) ? reply.batches : [];
  if (!run || !list.length) return null;
  const cost = finite(reply.blockCost) ? rmText(reply.blockCost) : null;
  if (list.length === 1) {
    const [b] = list;
    return { text: ['Blocks', b.supplier, b.spawnBatch ? `spawn batch ${b.spawnBatch}` : null, blocksText(b.blocks), cost].filter(Boolean).join(DOT), href: batchHash(b.id) };
  }
  const blocks = list.reduce((s, b) => s + b.blocks, 0);
  return { text: ['Blocks', `${list.length} batches`, blocksText(blocks), cost].filter(Boolean).join(DOT), href: batchesRunHash(run.id) };
}

// ---- the myGAP 4-2 sheet ----

export const SHEET_TITLE = `myGAP 4-2${DOT}Purchase, use and treatment of planting material (Pembelian, penggunaan dan rawatan bahan tanaman)`;
export const SHEET_COLUMNS = ['Date', 'Variety / material (+ batch No.)', 'Qty bought', 'Price / unit', 'Qty used', 'Block / area',
  'Treatment: why', 'Treatment: material', 'Treatment: rate', 'Supplier / operator'];
export const materialText = (b) => [cropBlocks(b.crop), b.strain, b.spawnBatch ? `batch ${b.spawnBatch}` : null].filter(Boolean).join(DOT);

// The sheet's rows from every batch (GET /api/batches): a receipt row per delivery received in [from, to] (its blocks, the
// first row's and its parts') and a use row per row put into a room in [from, to], by date (a receipt before its uses).
export function sheetRows(batches, { from, to, today = farmDate(Date.now()) }) {
  const families = new Map();
  for (const b of batches) families.set(b.parentId ?? b.id, [...(families.get(b.parentId ?? b.id) ?? []), b]);
  const rows = [];
  const inRange = (d) => d >= from && d <= to;
  for (const [firstId, family] of families) {
    const first = family.find((b) => b.id === firstId) ?? family[0];
    const received = farmDate(first.receivedAt);
    if (inRange(received)) {
      const total = family.reduce((s, b) => s + b.blocks, 0);
      rows.push({ date: received, order: 0, id: firstId,
        cells: [fullDate(first.receivedAt), materialText(first), blocksText(total), finite(first.pricePerBlock) ? rmText(first.pricePerBlock) : '', '', '', '', '', '', first.supplier ?? ''] });
    }
    for (const b of family) {
      if (!finite(b.placedAt) || !inRange(farmDate(b.placedAt))) continue;
      rows.push({ date: farmDate(b.placedAt), order: 1, id: b.id,
        cells: [fullDate(b.placedAt), materialText(first), '', '', blocksText(finite(b.usedBlocks) ? b.usedBlocks : b.blocks), roomRunText(b, today), '', '', '', ''] });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.id - b.id).map((r) => r.cells);
}

// ---- the dialogs' bodies (the boxes' own checks; the server checks again) ----

// A typed number: '' is null, a plain decimal its value (commas only as thousands groups), anything else NaN.
export function numberOf(text) {
  const s = String(text ?? '').trim();
  if (s === '') return null;
  // commas only as thousands groups ("1,200"); "2,30" is not a number
  return /^\d{1,3}(,\d{3})+(\.\d+)?$|^\d+(\.\d+)?$|^\.\d+$/.test(s) ? Number(s.replace(/,/g, '')) : NaN;
}
const dayMs = (date) => whenMs(date, '00:00'); // the farm's midnight of a date box's day

// A batch's boxes for Edit; null: Receive's (the water box filled with 60 %).
export function receiveValues(b) {
  const day = (ms) => (finite(ms) ? farmDate(ms) : '');
  const text = (v) => (v === null || v === undefined ? '' : String(v));
  if (!b) {
    return { crop: '', supplier: '', receivedDate: farmDate(Date.now()), blocks: '', pricePerBlock: '', spawnBatch: '', strain: '',
      inoculatedDate: '', blockKg: '', waterPct: '60', deliveryRef: '', note: '' };
  }
  return { crop: b.crop, supplier: text(b.supplier), receivedDate: day(b.receivedAt), blocks: String(b.blocks), pricePerBlock: text(b.pricePerBlock),
    spawnBatch: text(b.spawnBatch), strain: text(b.strain), inoculatedDate: day(b.inoculatedAt), blockKg: text(b.blockKg),
    waterPct: finite(b.waterPct) ? String(b.waterPct) : '60', deliveryRef: text(b.deliveryRef), note: text(b.note) };
}

// Receive's and Edit's boxes → { body } or { field, message }. edit: { cropEditable, blocksEditable } (those boxes are not
// shown otherwise, and not sent). The water % counts only with a block weight.
export function receiveBody(v, { edit = null } = {}) {
  const body = {};
  if (!edit || edit.cropEditable) body.crop = v.crop;
  body.supplier = v.supplier ?? '';
  body.receivedAt = dayMs(v.receivedDate);
  if (!finite(body.receivedAt)) return { field: 'receivedDate', message: 'Pick the day received' };
  if (!edit || edit.blocksEditable) {
    const n = numberOf(v.blocks);
    if (!Number.isInteger(n)) return { field: 'blocks', message: 'Give the blocks as a whole number' };
    body.blocks = n;
  }
  const price = numberOf(v.pricePerBlock);
  if (Number.isNaN(price)) return { field: 'pricePerBlock', message: 'Give the price as a number, like 2.30, or leave it empty' };
  body.pricePerBlock = price;
  for (const k of ['spawnBatch', 'strain', 'deliveryRef', 'note']) body[k] = v[k] ?? '';
  body.inoculatedAt = v.inoculatedDate ? dayMs(v.inoculatedDate) : null;
  if (Number.isNaN(body.inoculatedAt)) return { field: 'inoculatedDate', message: 'Pick the day inoculated, or leave it empty' };
  const kg = numberOf(v.blockKg);
  if (Number.isNaN(kg)) return { field: 'blockKg', message: 'Give the weight as a number, like 2.3, or leave it empty' };
  const water = kg === null ? null : numberOf(v.waterPct);
  if (Number.isNaN(water)) return { field: 'waterPct', message: 'Give the water as a number, like 60' };
  body.blockKg = kg;
  body.waterPct = water;
  return { body };
}

// Put into a room's boxes → { body } or { field, message }; an empty blocks box is all the good blocks.
export function placeBody(v, good) {
  if (!v.roomId) return { field: 'roomId', message: 'Pick a room' };
  const n = numberOf(v.blocks);
  if (n !== null && !Number.isInteger(n)) return { field: 'blocks', message: 'Give the blocks as a whole number' };
  return { body: { roomId: Number(v.roomId), blocks: n ?? good } };
}

// The rooms (GET /api/overview's, with their crop summary) a batch of `crop` can go into (their run has the crop) and why the others cannot.
// placed: the batches in the rooms' current runs (GET /api/batches?status=placed): an offered room says its blocks of the
// crop in batches ("Container 1 · 800 blocks in batches").
export function roomChoices(rooms, crop, placed = []) {
  const ok = [];
  const off = [];
  const held = new Map();
  for (const b of Array.isArray(placed) ? placed : []) {
    if (b.status === 'placed' && b.crop === crop) held.set(b.roomId, (held.get(b.roomId) ?? 0) + b.blocks);
  }
  for (const r of rooms) {
    const crops = Array.isArray(r.crop?.crops) ? r.crop.crops : [];
    if (crops.some((c) => c.crop === crop)) ok.push([r.id, held.get(r.id) ? `${r.name}${DOT}${blocksText(held.get(r.id))} in batches` : r.name]);
    else off.push(`${r.name} (${crops.length ? `no ${cropShortName(crop)}` : 'no crops'})`);
  }
  return { ok, off };
}

// Record or Edit a check's boxes → { body } or { field, message }; an Edit with no name picked keeps the stored one.
export function checkBody(v, { edit = false } = {}) {
  const at = whenMs(v.checkDate, v.checkTime);
  if (!finite(at)) return /^\d{4}-\d{2}-\d{2}$/.test(String(v.checkDate ?? '')) ? { field: 'checkTime', message: 'Give the time as 24 h, like 08:12' } : { field: 'checkDate', message: 'Pick the day' };
  const lost = numberOf(v.lost);
  if (!Number.isInteger(lost)) return { field: 'lost', message: 'Give the blocks lost as a whole number' };
  const body = { at, lost, cause: v.cause, note: v.note ?? '' };
  if (v.worker || !edit) body.worker = v.worker ?? '';
  return { body };
}
