// The Run page's pure parts (spec 2026-11-05-runs-design.md 6 and 7): the Runs tab's rows and filter, a run's head and tiles,
// and the rows of its Blocks, Sales and Costs cards. Every figure goes through its module's one formatter (the One Format
// Rule): kg, kg per block, BE and a run's days by Harvest's, RM and a loss by Costs', blocks and a day by Batches', a sale by
// Sales'. A missing figure is a dash; a number keeps its unit at a wrap and a '·' joins with DOT.

import { CROP_KEYS, cropShortName } from './crops.js';
import { DOT } from './text-math.js';
import { kgText, perBlockText, beText, dayRange, whenMs } from './harvest-math.js';
import { moneyText, perKgText, monthNotes, runParts, runRow } from './costs-math.js';
import { dateText, countBlocks, rmText } from './batches-math.js';
import { deliveryRow, priceText } from './sales-math.js';
import { mainCrop } from './room-card-math.js';
import { farmDate } from './tasks-math.js';
import { roomHash, runHash, batchHash } from './route.js';

const NB = '\u00a0';
const DASH = '—';
const MINUS = '−';
const WORKING = 'working out';
const NOTHING_SOLD = 'Nothing sold';
const isLoss = (text) => text.startsWith(MINUS); // from the shown figure, as Costs': a loss under half a sen is none
const grouped = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const andList = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);
const cropsOf = (run) => (Array.isArray(run?.crops) ? run.crops : []);

// ---- the Runs tab ----

export const LIST_COLUMNS = ['Run', 'Crops', 'kg', 'kg per block', 'Income', 'Costs', 'Profit', 'Profit per kg'];

// The crop filter's choices: every crop, then each crop by its name.
export const cropChoices = () => [{ value: '', label: 'All crops' }, ...CROP_KEYS.map((k) => ({ value: k, label: cropShortName(k) }))];

// "600 Grey oyster", "300 Grey oyster · 100 Lion's mane": a run's crops and blocks, short.
export const cropsText = (run) => cropsOf(run).map((c) => `${grouped(c.blocks)} ${cropShortName(c.crop)}`).join(DOT);

// A run's days: "since 4 Nov" while open ("since 4 Nov 2025" in another year), "4 Nov – 20 Dec" when ended (Harvest's
// dayRange); "recorded …" for a run under way at the harvest upgrade (its real start is not known). today: the farm's date.
export function runDates(run, today) {
  const days = run.endedAt === null || run.endedAt === undefined ? `since ${dateText(run.startedAt, today)}` : dayRange(run.startedAt, run.endedAt);
  return run.partial ? `recorded ${days}` : days;
}

// The container's words and its Harvest tab (none for a room that is gone).
const roomOf = (run) => (run.roomName
  ? { room: run.roomName, roomHref: roomHash(run.roomId, 'harvest') }
  : { room: 'A deleted room', roomHref: null });

// A run's row on the Runs tab: { href (the run page), name (the row's name and link: "Container 1 · 24 Sep – now", Costs' run
// days), crops, crop (the main crop, for its picture), cells (kg, kg per block, then Costs' Income, Costs, Profit, Profit per
// kg), costsLine (under Costs: "working out" or "Some costs have no price"), loss and perKgLoss (the figure in the loss tone,
// "Loss" under Profit) }. A run without Costs' view (its room gone) shows a dash, never "working out".
export function listRow(run) {
  const c = runRow({ ...run, crops: cropsOf(run) }); // Costs' own row: its run days and money cells
  return {
    href: runHash(run.id), name: `${roomOf(run).room}${DOT}${run.partial ? 'recorded ' : ''}${c.dates}`, crops: cropsText(run),
    crop: mainCrop(run.crops), cells: [kgText(run.kg), perBlockText(run.perBlock, { cell: true }), ...c.cells],
    costsLine: run.pending ? WORKING : run.incomplete ? 'Some costs have no price' : null,
    loss: c.loss, perKgLoss: c.perKgLoss,
  };
}

// A "Run page" link's name (Harvest's This run and past runs, Costs' runs): "Run page, Container 1, since 24 Sep"; the room
// left out when not known. today: the farm's date (now by default).
export const runPageLabel = (run, today = farmDate(Date.now())) => ['Run page', run.roomName, runDates(run, today)].filter(Boolean).join(', ');

// The list's words when it is empty.
export const emptyText = (crop) => (crop ? `No runs of ${cropShortName(crop)}.` : 'No runs yet. A run starts when a container gets its blocks on its Crop tab.');

// ---- a run's page ----

// The page's title: "600 Grey oyster blocks", "300 Grey oyster and 100 Lion's mane blocks".
export function runTitle(run) {
  const parts = cropsOf(run).map((c) => `${grouped(c.blocks)} ${cropShortName(c.crop)}`);
  return parts.length ? `${andList(parts)} ${parts.length === 1 && cropsOf(run)[0].blocks === 1 ? 'block' : 'blocks'}` : 'A run';
}

// The line under the title: { room, roomHref, dates } ("Container 1 · since 4 Nov"; the room a link to its Harvest tab).
export const runSub = (run, today) => ({ ...roomOf(run), dates: runDates(run, today) });

// The tiles (harvest-card.js's tileNodes), Profit first (the page leads with it): "Profit so far" while the run is open,
// "Profit" once it ended; then Income, Costs, Profit per kg (Costs' month card's), Picked (with the kg not sold), kg per
// block, BE. While Costs works the energy out, its figures are a dash with "working out" (never a partial figure). tone
// 'loss' on a loss (Profit's word says it too).
export function pageTiles(v) {
  const waiting = (label) => ({ label, value: DASH, line: WORKING });
  const profitLabel = v.endedAt === null ? 'Profit so far' : 'Profit';
  const profit = moneyText(v.profit);
  const perKg = perKgText(v.profitPerKg);
  const unsold = Math.round((v.kg - (v.kgSold ?? 0)) * 10) / 10;
  return [
    v.pending ? waiting(profitLabel) : { label: profitLabel, value: profit, ...(isLoss(profit) ? { line: 'Loss', tone: 'loss' } : {}) },
    { label: 'Income', value: moneyText(v.income), line: v.kgSold > 0 ? `${kgText(v.kgSold)} sold` : NOTHING_SOLD },
    v.pending ? waiting('Costs') : { label: 'Costs', value: moneyText(v.costs), ...(v.incomplete ? { line: 'Some costs have no price' } : {}) },
    v.pending ? waiting('Profit per kg') : {
      label: 'Profit per kg', value: perKg, line: v.kgSold > 0 ? `on ${kgText(v.kgSold)} sold` : NOTHING_SOLD, ...(isLoss(perKg) ? { tone: 'loss' } : {}),
    },
    { label: 'Picked', value: kgText(v.kg), ...(unsold > 0 ? { line: `${kgText(unsold)} not sold` } : {}) },
    { label: 'kg per block', value: perBlockText(v.perBlock, { cell: true }) },
    { label: 'BE', title: 'Biological efficiency', value: beText(v.be, { cell: true }) },
  ];
}

// Electricity or water at 0, in words: "working out" while pending, "no price set" without a price in Settings, else "not
// recorded yet" (with a price, a 0 means the room recorded nothing to price).
const PARTS = [['blocks', 'Blocks'], ['energy', 'Electricity'], ['water', 'Water'], ['own', 'Own'], ['equipment', 'Equipment'], ['shared', 'Shared']];
const PRICE_OF = { energy: 'electricity', water: 'water' };
const unpricedWord = (v, key) => (v.pending ? WORKING : v.prices?.[PRICE_OF[key]] > 0 ? 'not recorded yet' : 'no price set');

// The money's make-up under the tiles, from Costs' parts: "Blocks RM 3,040.00 · Own RM 480.00 · Shared RM 14,359.23 (80 % of
// costs) · Electricity not recorded yet · No water price": the parts over 0, the biggest with its share of the costs when
// there are several, then electricity and water at 0. None while pending or without Costs' view.
export function costsMix(v) {
  const p = v.costsByKind?.parts;
  if (!p || v.pending || !(v.costs >= 0)) return null;
  const over = PARTS.filter(([k]) => p[k] > 0);
  const top = over.length > 1 && v.costs > 0 ? over.reduce((a, b) => (p[b[0]] > p[a[0]] ? b : a))[0] : null;
  const words = over.map(([k, label]) => `${label} ${moneyText(p[k])}${k === top ? ` (${Math.round((p[k] / v.costs) * 100)}${NB}% of costs)` : ''}`);
  const zero = ['energy', 'water'].filter((k) => !(p[k] > 0));
  const unrecorded = zero.filter((k) => unpricedWord(v, k) === 'not recorded yet').map((k) => (k === 'energy' ? 'electricity' : 'water'));
  if (unrecorded.length) words.push(`${unrecorded.join(' and ').replace(/^./, (c) => c.toUpperCase())} not recorded yet`);
  for (const k of zero.filter((x) => unpricedWord(v, x) === 'no price set')) words.push(`No ${PRICE_OF[k]} price`);
  return words.length ? words.join(DOT) : null;
}

// A made batch's note: its blocks' cost is its materials at what their lots cost (Money truth), charged when they went in.
export const MADE_NOTE = 'Its materials at what their lots cost, charged to the run as its blocks went in';
const wholeDate = (ms, today) => dateText(ms, today).replace(/ /g, NB); // "28 Sep" kept whole at a wrap (Batches' way)
// The Blocks card's rows: { href (the batch), title ("600 Grey oyster blocks"), line (a bought batch's supplier and day
// received, a made one's day made; the price a block), note (MADE_NOTE for a made batch, else null) }. No money total: the
// Costs card's Blocks is the run's one block cost.
export const batchRows = (batches, today) => (batches ?? []).map((b) => {
  const made = b.kind === 'made';
  const missing = made && b.priceMissing?.length ? `no price for ${b.priceMissing.join(', ')}` : null;
  const price = b.pricePerBlock === null || b.pricePerBlock === undefined ? 'no price' : [`${rmText(b.pricePerBlock)} a block`, missing].filter(Boolean).join(DOT);
  const from = made ? [`made ${wholeDate(b.mixedAt ?? b.receivedAt, today)}`] : [b.supplier, `received ${wholeDate(b.receivedAt, today)}`];
  return { href: batchHash(b.id), title: countBlocks(b.blocks, b.crop), line: [...from, price].filter(Boolean).join(DOT), note: made ? MADE_NOTE : null };
});

export const SALE_COLUMNS = ['Day', 'Buyer', 'Sold', 'RM per kg', 'Total', 'Paid'];
// The Sales card's rows, newest first: a sale line as Sales' page shows a delivery ({ day, buyer, reference, sold, price,
// total, paid: { text, unpaid } }).
export const saleRows = (lines) => (lines ?? []).map((l) => {
  const r = deliveryRow({ ...l, lines: [l] });
  return { day: r.day, buyer: r.buyer, reference: r.reference, sold: r.lines, price: priceText(l.priceKg), total: r.total, paid: r.paid };
});
// ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 7) How a sale line reached the run, under its Sold: the only
// run growing its crop that day, or shared by the kg picked here; nothing for its own run or its container's.
export function tieText(line) {
  const tie = line?.tie;
  if (!tie) return null;
  if (tie.how === 'only') return `Tied here: the only run growing ${cropShortName(line.crop)} that day`;
  if (tie.how === 'picked') return `Shared: ${kgText(line.kg)} of a ${kgText(tie.kg)} sale, by the kg picked here`;
  return null;
}
// A partial run's line on its page (spec 8.2): Economics counts it only once the owner gives the day its blocks went in.
// → null for a whole run, else { text, action (the button), stop (a second, quiet button, once counted) }.
export function countLine(run, today) {
  if (!run?.partial) return null;
  const start = wholeDate(run.startedAt, today);
  if (run.blocksInAt === null || run.blocksInAt === undefined) {
    return { text: `Recorded from ${start}, when the app began keeping runs; its blocks went in earlier, so Economics leaves it out.`, action: 'Count it in Economics' };
  }
  return { text: `Counted in Economics from ${wholeDate(run.blocksInAt, today)}, the day its blocks went in.`, action: 'Change the day', stop: 'Stop counting it' };
}
export const COUNT_TITLE = 'Count this run in Economics';
export const countLead = (run, today) => `Economics counts a finished run's yield, sales, blocks and electricity. This run was recorded from ${wholeDate(run.startedAt, today)}: give the day its blocks went in. Count it only if every pick since then is recorded.`;
// The dialog's day → { body: { blocksInAt } } (noon on the farm's day) or { field, message }, as the server checks it.
export function countBody(day, run) {
  const start = farmDate(run.startedAt);
  const earliest = new Date(Date.parse(`${start}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') && day <= start && day >= earliest;
  if (!ok) return { field: 'day', message: `Pick a day up to ${wholeDate(run.startedAt, start)}, at most 365 days before it` };
  return { body: { blocksInAt: whenMs(day, '12:00') } };
}
export const countRange = (run) => {
  const start = farmDate(run.startedAt);
  return { max: start, min: new Date(Date.parse(`${start}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10) };
};

// The Runs tab's line when some sales reach no run: "RM 384.00 of sales not tied to a run"; null when none.
export const untiedText = (untied) => (untied?.total > 0 ? `${rmText(untied.total)} of sales not tied to a run` : null);
// ---- end Money truth ----

// The Sales card's foot: "48.0 kg · RM 576.00".
export const salesTotal = (sales) => `${kgText(sales.kg)}${DOT}${rmText(sales.total)}`;

const NOT_COSTS = new Set(['Income', 'Picked', 'Sold']); // runParts' last rows: the tiles say them
// The Costs card's rows: Costs' run breakdown (its runParts: Blocks a link to the run's batches, Electricity, Water, Own costs,
// Equipment written off (Money truth), Share of shared costs; the parts that are not 0), Electricity and Water kept at 0 in words (unpricedWord), [[label, value,
// href?, quiet?]] (quiet: words, not a figure); none before Costs answers.
export function costRows(v) {
  if (!v.costsByKind) return [];
  const run = { id: v.id, parts: v.costsByKind.parts, notes: v.costsByKind.notes, income: v.income, kgHarvested: v.kg, kgSold: v.kgSold };
  const rows = new Map(runParts(run).filter(([label]) => !NOT_COSTS.has(label)).map((r) => [r[0], r]));
  for (const [key, label] of [['energy', 'Electricity'], ['water', 'Water']]) if (!rows.has(label)) rows.set(label, [label, unpricedWord(v, key), null, true]);
  return ['Blocks', 'Electricity', 'Water', 'Own costs', 'Equipment written off', 'Share of shared costs'].map((l) => rows.get(l)).filter(Boolean);
}
// The Costs card's Total: the Costs tile's figure.
export const costsTotal = (v) => (v.pending ? DASH : moneyText(v.costs));
// The Costs card's notes: "Working out the energy cost…" first while pending, then Costs' notes for the run ([{ kind, text, warn }]).
export const costNotes = (v) => monthNotes({ pending: v.pending, notes: v.costsByKind?.notes ?? [] });
