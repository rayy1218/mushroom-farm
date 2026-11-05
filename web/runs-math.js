// The Run page's pure parts (spec 2026-11-05-runs-design.md 6 and 7): the Runs tab's rows and filter, a run's head and tiles,
// and the rows of its Blocks, Sales and Costs cards. Every figure goes through its module's one formatter (the One Format
// Rule): kg, kg per block, BE and a run's days by Harvest's, RM and a loss by Costs', blocks and a day by Batches', a sale by
// Sales'. A missing figure is a dash; a number keeps its unit at a wrap and a '·' joins with DOT.

import { CROP_KEYS, cropShortName } from './crops.js';
import { DOT } from './text-math.js';
import { kgText, perBlockText, beText, dayRange } from './harvest-math.js';
import { moneyText, monthNotes, runParts } from './costs-math.js';
import { dateText, countBlocks, rmText, MADE_HERE } from './batches-math.js';
import { deliveryRow, priceText } from './sales-math.js';
import { mainCrop } from './room-card-math.js';
import { roomHash, runHash, batchHash } from './route.js';

const DASH = '—';
const MINUS = '−';
const WORKING = 'working out';
const isLoss = (text) => text.startsWith(MINUS); // from the shown figure, as Costs': a loss under half a sen is none
const grouped = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const andList = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);
const cropsOf = (run) => (Array.isArray(run?.crops) ? run.crops : []);

// ---- the Runs tab ----

export const LIST_COLUMNS = ['Container', 'Crops', 'Dates', 'kg', 'kg per block', 'Income', 'Costs', 'Profit'];

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

// A run's row on the Runs tab: { href (the run page), label (the link's name), room, roomHref, crops, crop (the main crop, for
// its picture), dates, cells (kg, kg per block, Income, Costs, Profit), costsLine (under Costs: "working out" or "Some costs
// have no price"), loss (Profit: its figure in the loss tone and "Loss" under it) }.
export function listRow(run, today) {
  const { room, roomHref } = roomOf(run);
  const dates = runDates(run, today);
  const profit = moneyText(run.profit);
  return {
    href: runHash(run.id), label: `${room}, ${dates}`, room, roomHref, crops: cropsText(run), crop: mainCrop(run.crops), dates,
    cells: [kgText(run.kg), perBlockText(run.perBlock, { cell: true }), moneyText(run.income), moneyText(run.costs), profit],
    costsLine: run.pending ? WORKING : run.incomplete ? 'Some costs have no price' : null,
    loss: isLoss(profit),
  };
}

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
// "Profit" once it ended; then Income, Costs, Picked, kg per block, BE. While Costs works the energy out, Profit and Costs
// are a dash with "working out" (never a partial figure). tone 'loss' on a loss (its word says it too).
export function pageTiles(v) {
  const waiting = (label) => ({ label, value: DASH, line: WORKING });
  const profitLabel = v.endedAt === null ? 'Profit so far' : 'Profit';
  const profit = moneyText(v.profit);
  return [
    v.pending ? waiting(profitLabel) : { label: profitLabel, value: profit, ...(isLoss(profit) ? { line: 'Loss', tone: 'loss' } : {}) },
    { label: 'Income', value: moneyText(v.income), line: v.kgSold > 0 ? `${kgText(v.kgSold)} sold` : 'Nothing sold' },
    v.pending ? waiting('Costs') : { label: 'Costs', value: moneyText(v.costs), ...(v.incomplete ? { line: 'Some costs have no price' } : {}) },
    { label: 'Picked', value: kgText(v.kg) },
    { label: 'kg per block', value: perBlockText(v.perBlock, { cell: true }) },
    { label: 'BE', title: 'Biological efficiency', value: beText(v.be, { cell: true }) },
  ];
}

// The Blocks card's rows: { href (the batch), title ("600 Grey oyster blocks"), line (supplier, the day received, the price a
// block) }.
export const batchRows = (batches, today) => (batches ?? []).map((b) => ({
  href: batchHash(b.id), title: countBlocks(b.blocks, b.crop),
  line: [b.supplier ?? (b.kind === 'made' ? MADE_HERE : null), `received ${dateText(b.receivedAt, today)}`,
    b.pricePerBlock === null || b.pricePerBlock === undefined ? 'no price' : `${rmText(b.pricePerBlock)} a block`].filter(Boolean).join(DOT),
}));

// Under the Blocks card's rows: "Block cost RM 1,500.00"; a batch without a price leaves the sum unknown; none without batches.
export function blockCostText(v) {
  if (!(v.batches ?? []).length) return null;
  return v.blockCost === null || v.blockCost === undefined ? 'Some batches have no price' : `Block cost ${rmText(v.blockCost)}`;
}

export const SALE_COLUMNS = ['Day', 'Buyer', 'Sold', 'RM per kg', 'Total', 'Paid'];
// The Sales card's rows, newest first: a sale line as Sales' page shows a delivery ({ day, buyer, reference, sold, price,
// total, paid: { text, unpaid } }).
export const saleRows = (lines) => (lines ?? []).map((l) => {
  const r = deliveryRow({ ...l, lines: [l] });
  return { day: r.day, buyer: r.buyer, reference: r.reference, sold: r.lines, price: priceText(l.priceKg), total: r.total, paid: r.paid };
});
// The Sales card's foot: "48.0 kg · RM 576.00".
export const salesTotal = (sales) => `${kgText(sales.kg)}${DOT}${rmText(sales.total)}`;

const NOT_COSTS = new Set(['Income', 'Picked', 'Sold']); // runParts' last rows: the tiles say them
// The Costs card's rows: Costs' run breakdown (its runParts: Blocks a link to the run's batches, Electricity, Water, Own costs,
// Share of shared costs; the parts that are not 0), [[label, value, href?]]; none before Costs answers.
export function costRows(v) {
  if (!v.costsByKind) return [];
  const run = { id: v.id, parts: v.costsByKind.parts, notes: v.costsByKind.notes, income: v.income, kgHarvested: v.kg, kgSold: v.kgSold };
  return runParts(run).filter(([label]) => !NOT_COSTS.has(label));
}
// The Costs card's Total: the Costs tile's figure.
export const costsTotal = (v) => (v.pending ? DASH : moneyText(v.costs));
// The Costs card's notes: "Working out the energy cost…" first while pending, then Costs' notes for the run ([{ kind, text, warn }]).
export const costNotes = (v) => monthNotes({ pending: v.pending, notes: v.costsByKind?.notes ?? [] });
