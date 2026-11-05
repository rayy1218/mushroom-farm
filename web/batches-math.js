// The Batches pages' pure parts (spec 2026-11-05-batches-design.md 7): the one formatter (RM, blocks, kg, water, dates),
// the page's groups and rows, a batch's facts and lines, batchLineFor (the Harvest tab's line, wired by the integrator), the
// myGAP 4-2 sheet's rows, and the dialogs' bodies. A missing figure is a dash; a number keeps its unit at a wrap (a
// no-break space, as the Units Rule has it) and a '·' joins with DOT. Making blocks (spec 4 and 5): a recipe's amounts, the steps, their bodies.

import { cropShortName } from './crops.js';
import { DOT } from './text-math.js';
import { farmDate, farmTime, dayMonth, daysFrom } from './tasks-math.js';
import { whenMs, whenBoxes, rmText, kgText, perBlockText, beText, costKgText } from './harvest-math.js';
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
export const placedLine = (b, today) => [b.supplier, b.spawnBatch ? `spawn batch ${b.spawnBatch}` : null,
  b.kind === 'made' ? `made ${wholeDate(b.mixedAt ?? b.receivedAt, today)}` : `received ${wholeDate(b.receivedAt, today)}`].filter(Boolean).join(DOT);

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

// { making, waiting, rooms: [{ runId, roomId, roomName, runStartedAt, batches, over }] by room name, past } of the list reply
// (making: made batches not yet ready, listed above the waiting ones).
export function pageGroups(batches) {
  const runs = new Map();
  for (const b of batches.filter((x) => x.status === 'placed')) {
    if (!runs.has(b.runId)) runs.set(b.runId, { runId: b.runId, roomId: b.roomId, roomName: b.roomName, runStartedAt: b.runStartedAt, batches: [] });
    runs.get(b.runId).batches.push(b);
  }
  const rooms = [...runs.values()].sort((a, b) => String(a.roomName).localeCompare(String(b.roomName))).map((r) => ({ ...r, over: overNotes(r.batches) }));
  return {
    making: batches.filter((x) => x.status === 'making'), waiting: batches.filter((x) => x.status === 'waiting'), rooms,
    past: batches.filter((x) => x.status === 'past'),
  };
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
  const made = b.kind === 'made'; // its spawn's supplier; no delivery note; its blocks made at the materials' cost
  return [
    ['Spawn supplier', made ? b.supplier : null], ['Spawn batch', b.spawnBatch], ['Strain', b.strain], ['Delivery note', made ? null : b.deliveryRef],
    ['Inoculated', finite(b.inoculatedAt) ? fullDate(b.inoculatedAt) : null], ['Block weight', weightText(b)],
    ['Price per block', finite(b.pricePerBlock) ? rmText(b.pricePerBlock) : null],
    [made ? 'Blocks made' : 'Whole delivery', finite(b.pricePerBlock) ? `${blocksText(total)}${DOT}${rmText(total * b.pricePerBlock)}` : blocksText(total)],
    ['Note', b.note],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
}
export const overNote = (b) => (b.status === 'placed' && finite(b.runBlocks) && finite(b.batchBlocks) && b.batchBlocks > b.runBlocks
  ? `Batches hold ${countBlocks(b.batchBlocks, b.crop)}; the run has ${grouped(b.runBlocks, 0)}.` : null);
// "In Container 1" kept whole at a wrap (the Units Rule's no-break spaces); a made batch's row still being made "Making".
export const statusLine = (b) => (b.status === 'waiting' ? 'Waiting' : b.status === 'making' ? 'Making' : b.status === 'placed' ? `In ${b.roomName ?? 'a deleted room'}`.replace(/ /g, NB)
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
// "400 Grey oyster blocks waiting 40 days". A made batch waits from the day it was ready to fruit, not from its mix.
const waitsFrom = (b) => (b.kind === 'made' && finite(b.incubatedTo) ? b.incubatedTo : b.receivedAt);
export function waitingLong(batches, nowMs) {
  const today = farmDate(nowMs);
  return (Array.isArray(batches) ? batches : [])
    .filter((b) => b.status === 'waiting' && b.good > 0 && finite(waitsFrom(b)) && daysFrom(farmDate(waitsFrom(b)), today) >= BATCH_WAIT_DAYS)
    .sort((a, b) => waitsFrom(a) - waitsFrom(b) || a.id - b.id)
    .map((b) => {
      const n = daysFrom(farmDate(waitsFrom(b)), today);
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
export const spawnText = (b) => [`${cropShortName(b.crop)} spawn`, b.strain, b.spawnBatch ? `batch ${b.spawnBatch}` : null].filter(Boolean).join(DOT);
export const materialText = (b) => [cropBlocks(b.crop), b.strain, b.spawnBatch ? `batch ${b.spawnBatch}` : null].filter(Boolean).join(DOT);

// The sheet's rows from every batch (GET /api/batches): a receipt row per delivery received in [from, to] (its blocks, the
// first row's and its parts') and a use row per row put into a room in [from, to], by date (a receipt before its uses).
// A made batch's receipt is its spawn, on the day inoculated (the amount, its price per unit when known, the spawn supplier),
// with a use row the same day: the spawn "made into" the blocks (none before the inoculation).
export function sheetRows(batches, { from, to, today = farmDate(Date.now()) }) {
  const families = new Map();
  for (const b of batches) families.set(b.parentId ?? b.id, [...(families.get(b.parentId ?? b.id) ?? []), b]);
  const rows = [];
  const inRange = (d) => d >= from && d <= to;
  for (const [firstId, family] of families) {
    const first = family.find((b) => b.id === firstId) ?? family[0];
    const received = farmDate(first.receivedAt);
    const total = family.reduce((s, b) => s + b.blocks, 0);
    if (first.kind === 'made') {
      const day = finite(first.inoculatedAt) ? farmDate(first.inoculatedAt) : null;
      if (day && inRange(day)) {
        const amount = first.spawn ? qtyText(first.spawn.qty, first.spawn.unit) : '';
        const price = finite(first.spawn?.unitCost) ? rmText(first.spawn.unitCost) : '';
        rows.push({ date: day, order: 0, id: firstId, cells: [fullDate(first.inoculatedAt), spawnText(first), amount, price, '', '', '', '', '', first.supplier ?? ''] });
        rows.push({ date: day, order: 1, id: firstId, cells: [fullDate(first.inoculatedAt), spawnText(first), '', '', amount, `made into ${blocksText(total)}`, '', '', '', ''] });
      }
    } else if (inRange(received)) {
      rows.push({ date: received, order: 0, id: firstId,
        cells: [fullDate(first.receivedAt), materialText(first), blocksText(total), finite(first.pricePerBlock) ? rmText(first.pricePerBlock) : '', '', '', '', '', '', first.supplier ?? ''] });
    }
    for (const b of family) {
      if (!finite(b.placedAt) || !inRange(farmDate(b.placedAt))) continue;
      rows.push({ date: farmDate(b.placedAt), order: 2, id: b.id,
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

// ---- making blocks (spec 4 and 5) ----

export const MIX_ITEMS = ['sawdust', 'bran', 'lime', 'gypsum', 'other', 'bags'];
export const RECIPE_PARTS = ['sawdustPct', 'branPct', 'limePct', 'gypsumPct', 'otherPct'];
const PART_ITEMS = { sawdustPct: 'sawdust', branPct: 'bran', limePct: 'lime', gypsumPct: 'gypsum', otherPct: 'other' };
export const MATERIAL_NAMES = { sawdust: 'Sawdust', bran: 'Bran', lime: 'Lime', gypsum: 'Gypsum', other: 'Other', bags: 'Plastic bags', spawn: 'Spawn' };
export const METHOD_NAMES = { steam: 'Atmospheric steam', pressure: 'Pressure', pasteurise: 'Pasteurise' };
const round1 = (v) => Math.round(v * 10) / 10;
const boxText = (v) => (v === null || v === undefined ? '' : String(v));

export const bagsText = (n) => (finite(n) ? `${grouped(n, 0, 2)}${NB}${n === 1 ? 'bag' : 'bags'}` : DASH);
export const pctText = (v) => (finite(v) ? `${grouped(v, 0, 1)}${NB}%` : DASH);
// A material's amount in its unit: kg to 2 decimals at most, bags, pieces.
export function qtyText(qty, unit) {
  if (!finite(qty)) return DASH;
  if (unit === 'pcs') return `${grouped(qty, 0)}${NB}pcs`;
  if (unit === 'bags') return bagsText(qty);
  return `${grouped(qty, 0, 2)}${NB}kg`;
}

// A recipe's amounts for `bags` bags (spec 4): the dry kg a bag, each ingredient's kg to 0.1 kg (the parts at 0 % left out),
// the plastic bags, and the water guide in L. → { dryKgPerBag, lines: [{ item, name, qty, unit }], waterL }.
export function recipeAmounts(recipe, bags) {
  const dryKgPerBag = recipe.bagKg * (1 - recipe.waterPct / 100);
  const lines = RECIPE_PARTS.filter((k) => recipe[k] > 0).map((k) => ({
    item: PART_ITEMS[k], name: k === 'otherPct' ? recipe.otherName : null, qty: round1((bags * dryKgPerBag * recipe[k]) / 100), unit: 'kg',
  }));
  lines.push({ item: 'bags', name: null, qty: bags, unit: 'pcs' });
  return { dryKgPerBag: Math.round(dryKgPerBag * 1000) / 1000, lines, waterL: round1((bags * recipe.bagKg * recipe.waterPct) / 100) };
}
export const waterGuide = (recipe, bags) => `Water: about ${grouped(recipeAmounts(recipe, bags).waterL, 0)}${NB}L for ${bagsText(bags)}, less the water the dry ingredients already hold.`;

// "Grey oyster · Sawdust 78 % · Bran 20 % · Lime 1 % · Gypsum 1 % · 60 % water · 2.30 kg a bag".
export function recipeLine(r) {
  const parts = RECIPE_PARTS.filter((k) => r[k] > 0).map((k) => `${k === 'otherPct' ? r.otherName : MATERIAL_NAMES[PART_ITEMS[k]]} ${pctText(r[k])}`);
  return [r.crop ? cropShortName(r.crop) : 'Any crop', ...parts, `${pctText(r.waterPct)} water`, `${blockKgText(r.bagKg)} a bag`].join(DOT);
}

// The five parts typed (an empty box is 0) → their sum to 0.1, or NaN when one is not a number.
export function recipeSum(v) {
  let sum = 0;
  for (const k of RECIPE_PARTS) {
    const n = numberOf(v[k]);
    if (Number.isNaN(n)) return NaN;
    sum += n ?? 0;
  }
  return round1(sum);
}
// The Recipe dialog's live sum under the parts (no warning before a part is typed).
export function sumText(v) {
  const sum = recipeSum(v);
  if (Number.isNaN(sum)) return `Sum ${DASH}`;
  return Math.round(sum * 10) === 1000 || sum === 0 ? `Sum ${pctText(sum)}` : `Sum ${pctText(sum)}: the parts must add up to 100${NB}%`;
}

// A recipe's boxes for Edit; null: Add's (water 60 %).
export function recipeValues(r = null) {
  if (!r) return { name: '', crop: '', sawdustPct: '', branPct: '', limePct: '', gypsumPct: '', otherPct: '', otherName: '', waterPct: '60', bagKg: '' };
  return {
    name: r.name, crop: r.crop ?? '', ...Object.fromEntries(RECIPE_PARTS.map((k) => [k, k === 'otherPct' && !r[k] ? '' : boxText(r[k])])),
    otherName: boxText(r.otherName), waterPct: boxText(r.waterPct), bagKg: boxText(r.bagKg),
  };
}

// The Recipe dialog's boxes → { body } or { field, message }; an empty part is 0.
export function recipeBody(v) {
  const body = { name: v.name ?? '', crop: v.crop || null };
  for (const k of RECIPE_PARTS) {
    const n = numberOf(v[k]);
    if (Number.isNaN(n)) return { field: k, message: 'Give the part as a number, like 78, or leave it empty' };
    body[k] = n ?? 0;
  }
  body.otherName = body.otherPct > 0 ? v.otherName ?? '' : null;
  body.waterPct = numberOf(v.waterPct);
  if (!finite(body.waterPct)) return { field: 'waterPct', message: 'Give the water as a number, like 60' };
  body.bagKg = numberOf(v.bagKg);
  if (!finite(body.bagKg)) return { field: 'bagKg', message: "Give a bag's weight as a number, like 2.3" };
  return { body };
}

// The Mix dialog's boxes: a new mix's (b null: mixed today) or a made batch's (its detail: its mix lines, not the spawn).
// A material's boxes are qty-<item> and item-<item> (its Inventory item).
export function mixValues(b = null, today = farmDate(Date.now())) {
  const v = { mixedDate: today, recipeId: '', crop: '', blocks: '', otherName: '', blockKg: '', waterPct: '', note: '' };
  for (const item of MIX_ITEMS) {
    v[`qty-${item}`] = '';
    v[`item-${item}`] = '';
  }
  if (!b) return v;
  Object.assign(v, {
    mixedDate: farmDate(b.mixedAt ?? b.receivedAt), recipeId: boxText(b.recipeId), crop: b.crop, blocks: String(b.blocks),
    blockKg: boxText(b.blockKg), waterPct: boxText(b.waterPct), note: boxText(b.note),
  });
  for (const m of b.materials ?? []) {
    if (!MIX_ITEMS.includes(m.item)) continue;
    v[`qty-${m.item}`] = String(m.qty);
    v[`item-${m.item}`] = boxText(m.stockItemId);
    if (m.item === 'other') v.otherName = boxText(m.name);
  }
  return v;
}

// The boxes a recipe fills for `bags` bags: the weight and water, the other ingredient's name and, with a whole number of
// bags, every material's amount (empty for a part at 0 %).
export function recipeFill(recipe, bags) {
  const out = { blockKg: String(recipe.bagKg), waterPct: String(recipe.waterPct), otherName: recipe.otherPct > 0 ? boxText(recipe.otherName) : '' };
  if (!(Number.isInteger(bags) && bags > 0)) return out;
  for (const item of MIX_ITEMS) out[`qty-${item}`] = '';
  for (const m of recipeAmounts(recipe, bags).lines) out[`qty-${m.item}`] = String(m.qty);
  return out;
}

// The Mix dialog's boxes → { body } or { field, message }: an empty amount leaves its material out; the water % counts only
// with a weight. edit: { cropEditable, blocksEditable } (those boxes not shown otherwise, and not sent); an empty crop is left
// to the recipe's.
export function mixBody(v, { edit = null } = {}) {
  const body = { mixedAt: dayMs(v.mixedDate) };
  if (!finite(body.mixedAt)) return { field: 'mixedDate', message: 'Pick the day mixed' };
  body.recipeId = v.recipeId ? Number(v.recipeId) : null;
  if ((!edit || edit.cropEditable) && v.crop) body.crop = v.crop;
  if (!edit || edit.blocksEditable) {
    const n = numberOf(v.blocks);
    if (!Number.isInteger(n)) return { field: 'blocks', message: 'Give the bags as a whole number' };
    body.blocks = n;
  }
  body.materials = [];
  for (const item of MIX_ITEMS) {
    const qty = numberOf(v[`qty-${item}`]);
    if (Number.isNaN(qty)) return { field: `qty-${item}`, message: 'Give the amount as a number, or leave it empty' };
    if (qty === null) continue;
    const stock = v[`item-${item}`] ? Number(v[`item-${item}`]) : null;
    body.materials.push({ item, name: item === 'other' ? v.otherName ?? '' : null, qty, unit: item === 'bags' ? 'pcs' : 'kg', stockItemId: stock });
  }
  const kg = numberOf(v.blockKg);
  if (Number.isNaN(kg)) return { field: 'blockKg', message: 'Give the weight as a number, like 2.3, or leave it empty' };
  const water = kg === null ? null : numberOf(v.waterPct);
  if (Number.isNaN(water)) return { field: 'waterPct', message: 'Give the water as a number, like 60' };
  body.blockKg = kg;
  body.waterPct = water;
  body.note = v.note ?? '';
  return { body };
}

// The Inoculate dialog's boxes (b: the detail; today the day by default) and back → { body } or { field, message }: an empty
// spawn amount clears the spawn line.
export function inoculateValues(b, today) {
  const spawn = (b.materials ?? []).find((m) => m.item === 'spawn');
  return {
    inoculatedDate: finite(b.inoculatedAt) ? farmDate(b.inoculatedAt) : today, supplier: boxText(b.supplier), strain: boxText(b.strain),
    spawnBatch: boxText(b.spawnBatch), spawnQty: spawn ? String(spawn.qty) : '', spawnUnit: spawn?.unit ?? 'kg', spawnItem: boxText(spawn?.stockItemId),
  };
}
export function inoculateBody(v) {
  const inoculatedAt = dayMs(v.inoculatedDate);
  if (!finite(inoculatedAt)) return { field: 'inoculatedDate', message: 'Pick the day inoculated' };
  const qty = numberOf(v.spawnQty);
  if (Number.isNaN(qty)) return { field: 'spawnQty', message: 'Give the spawn as a number, or leave it empty' };
  const spawn = qty === null ? null : { qty, unit: v.spawnUnit === 'bags' ? 'bags' : 'kg', stockItemId: v.spawnItem ? Number(v.spawnItem) : null };
  return { body: { inoculatedAt, supplier: v.supplier ?? '', strain: v.strain ?? '', spawnBatch: v.spawnBatch ?? '', spawn } };
}

// The blocks made: the delivery's (the first row's and its parts').
const madeBlocks = (b) => (b.delivery ?? [b]).reduce((s, x) => s + x.blocks, 0);

// A sterilising load's boxes: load's for Edit; a new one's the bags not yet sterilised (all of them again once every bag
// was) and now. nowMs: the time shown.
export function loadValues(load, b, nowMs) {
  const shown = whenBoxes(load?.hotAt ?? nowMs);
  if (load) return { method: load.method, bags: String(load.bags), hotDate: shown.date, hotTime: shown.time, holdH: String(load.holdH), tempC: String(load.tempC) };
  const rest = madeBlocks(b) - (b.loads ?? []).reduce((s, l) => s + l.bags, 0);
  return { method: 'steam', bags: String(rest > 0 ? rest : madeBlocks(b)), hotDate: shown.date, hotTime: shown.time, holdH: '', tempC: '' };
}
// → { body } or { field, message }; an Edit with no name picked keeps the stored one.
export function loadBody(v, { edit = false } = {}) {
  const hotAt = whenMs(v.hotDate, v.hotTime);
  if (!finite(hotAt)) return /^\d{4}-\d{2}-\d{2}$/.test(String(v.hotDate ?? '')) ? { field: 'hotTime', message: 'Give the time as 24 h, like 08:12' } : { field: 'hotDate', message: 'Pick the day' };
  const bags = numberOf(v.bags);
  if (!Number.isInteger(bags)) return { field: 'bags', message: 'Give the bags as a whole number' };
  const holdH = numberOf(v.holdH);
  if (!finite(holdH)) return { field: 'holdH', message: 'Give the hold in hours, like 6' };
  const tempC = numberOf(v.tempC);
  if (!finite(tempC)) return { field: 'tempC', message: 'Give the temperature as a number, like 98' };
  const body = { method: v.method, bags, hotAt, holdH, tempC };
  if (v.worker || !edit) body.worker = v.worker ?? '';
  return { body };
}

// The Incubate dialog's boxes (the area's From is the inoculation day by default) and back → { body } or { field, message }:
// '' (not yet) clears the incubation; a grow room has no dates.
export function incubateValues(b) {
  const from = finite(b.incubatedFrom) ? b.incubatedFrom : b.inoculatedAt;
  return { incubation: b.incubation ?? '', fromDate: finite(from) ? farmDate(from) : '', toDate: finite(b.incubatedTo) ? farmDate(b.incubatedTo) : '' };
}
export function incubateBody(v) {
  if (v.incubation !== 'area') return { body: { incubation: v.incubation === 'room' ? 'room' : null, incubatedFrom: null, incubatedTo: null } };
  const from = dayMs(v.fromDate);
  if (!finite(from)) return { field: 'fromDate', message: 'Pick the day the incubation began' };
  const to = v.toDate ? dayMs(v.toDate) : null;
  if (Number.isNaN(to)) return { field: 'toDate', message: 'Pick the day they were ready, or leave it empty' };
  return { body: { incubation: 'area', incubatedFrom: from, incubatedTo: to } };
}
// Ready to fruit's day → { body } or { field, message }.
export function readyBody(v) {
  const at = dayMs(v.readyDate);
  return finite(at) ? { body: { incubatedTo: at } } : { field: 'readyDate', message: 'Pick the day they were ready' };
}

// A batch's status in words (spec 4): a made batch's step while it is being made ("Mixed 3 Nov", "Sterilised 3 Nov",
// "Inoculated 4 Nov", "Incubating since 4 Nov · day 12", the first day day 1), "Ready to fruit" once ready and waiting; else
// as a bought batch's (statusLine).
export function statusText(b, today) {
  if (b.kind !== 'made') return statusLine(b);
  if (b.status === 'waiting' && b.incubation === 'area' && finite(b.incubatedTo)) return 'Ready to fruit';
  if (b.status !== 'making') return statusLine(b);
  if (b.incubation === 'area' && finite(b.incubatedFrom)) {
    return `Incubating since ${wholeDate(b.incubatedFrom, today)}${DOT}day ${daysFrom(farmDate(b.incubatedFrom), today) + 1}`;
  }
  if (finite(b.inoculatedAt)) return `Inoculated ${wholeDate(b.inoculatedAt, today)}`;
  if (finite(b.sterilisedAt)) return `Sterilised ${wholeDate(b.sterilisedAt, today)}`;
  return `Mixed ${wholeDate(b.mixedAt ?? b.receivedAt, today)}`;
}

// Put into a room is offered (spec 5): a waiting batch; a made one still making once inoculated, unless it incubates in an
// area (then once ready to fruit, when it waits).
export const placeable = (b) => b.status === 'waiting' || (b.status === 'making' && finite(b.inoculatedAt) && b.incubation !== 'area');

// "Sawdust · 287 kg · from Sawdust (Kilang Jaya)": a material line, with its Inventory item's name when it has one.
export const materialLine = (m) => [m.item === 'other' ? m.name ?? MATERIAL_NAMES.other : MATERIAL_NAMES[m.item] ?? m.item, qtyText(m.qty, m.unit),
  m.itemName ? `from ${m.itemName}` : null].filter(Boolean).join(DOT);
// "4 Nov 08:12 · Atmospheric steam · 400 bags · 98 °C for 6 h · Ali": a sterilising load (hot_at: it reached the temperature).
export const loadLine = (l, today) => [`${wholeDate(l.hotAt, today)}${NB}${farmTime(l.hotAt)}`, METHOD_NAMES[l.method] ?? l.method, bagsText(l.bags),
  `${grouped(l.tempC, 0, 1)}${NB}°C for ${grouped(l.holdH, 0, 1)}${NB}h`, l.worker].filter(Boolean).join(DOT);
// The amber note when the loads hold fewer bags than were made: "300 of 400 bags sterilised"; null with no load or all done.
export function sterilisedNote(b) {
  const done = (b.loads ?? []).reduce((s, l) => s + l.bags, 0);
  const total = madeBlocks(b);
  return done > 0 && done < total ? `${grouped(done, 0)} of ${grouped(total, 0)} bags sterilised` : null;
}
// The amber note when the materials at Inventory's purchase prices come to over RM 1,000 a block (the server's priceOver; the
// price is then null), else null.
export const priceOverNote = (b) => (b.priceOver === true ? "The materials' price comes to over RM 1,000 a block: check Inventory's purchase prices." : null);
// How a made block's price comes about (decision 6 of part 2), or why there is none; the farm without Inventory (the detail's
// `inventory` false) is told what the price waits for.
export const madePriceNote = (b) => (finite(b.pricePerBlock)
  ? "The price per block is the materials at Inventory's latest purchase prices when the batch was last saved: a later purchase counts at its next change."
  : b.inventory === false
    ? 'The price per block is worked out once Inventory has the materials and their purchase prices.'
    : 'No price per block yet: every material needs an Inventory item with a purchase price.');

function incubationLines(b, today) {
  if (b.incubation === 'room') return [finite(b.placedAt) && b.roomName ? `In a grow room${DOT}${b.roomName}` : 'In a grow room: put the blocks into a room'];
  if (b.incubation !== 'area') return [];
  const since = `In an area since ${wholeDate(b.incubatedFrom, today)}`;
  return [finite(b.incubatedTo) ? `${since}${DOT}ready to fruit ${wholeDate(b.incubatedTo, today)}` : `${since}${DOT}day ${daysFrom(farmDate(b.incubatedFrom), today) + 1}`];
}

// The Making card's steps in order (spec 5; their dates kept whole at a wrap, as the status line's), from a made batch's detail: [{ key, title, lines, done, can, why }]. Each step can
// be recorded or edited at any time (can), except the incubation before the inoculation, or while blocks are in a room (where
// they incubate is fixed then); why: the reason, for the button's title. The loads are the detail's, listed by the card.
export function makingSteps(b, today) {
  const inoculated = finite(b.inoculatedAt);
  const placed = (b.delivery ?? [b]).some((x) => finite(x.placedAt));
  const spawn = (b.materials ?? []).find((m) => m.item === 'spawn');
  const mixed = [`Mixed ${wholeDate(b.mixedAt ?? b.receivedAt, today)}`, b.recipe ? `recipe ${b.recipe.name}` : 'no recipe', bagsText(madeBlocks(b))].join(DOT);
  const inoculation = [`Inoculated ${wholeDate(b.inoculatedAt, today)}`, b.supplier, b.strain, b.spawnBatch ? `batch${NB}${b.spawnBatch}` : null,
    spawn ? `${qtyText(spawn.qty, spawn.unit)} spawn` : null].filter(Boolean).join(DOT);
  return [
    { key: 'mix', title: 'Mix', done: true, can: true, why: null, lines: [mixed, ...(b.materials ?? []).filter((m) => m.item !== 'spawn').map(materialLine)] },
    { key: 'sterilise', title: 'Sterilise', done: (b.loads ?? []).length > 0, can: true, why: null, lines: [] },
    { key: 'inoculate', title: 'Inoculate', done: inoculated, can: true, why: null, lines: inoculated ? [inoculation] : [] },
    {
      key: 'incubate', title: 'Incubate', done: b.incubation != null, can: inoculated && !placed,
      why: !inoculated ? 'Record the inoculation first' : placed ? 'Some blocks are in a room' : null, lines: incubationLines(b, today),
    },
  ];
}
