// The Business summary's pure parts (spec 2026-11-06-business-summary-design.md 6 and 7): the money card's title, tiles and
// lines, a line per need, the open runs' rows, and the words of a part that could not be read. Every figure goes through
// its module's one formatter (the One Format Rule): RM and a loss by Costs', kg by Harvest's, a stock qty and a use-by by
// Inventory's, blocks by Batches', a sale's age by Sales', a run's days and crops by Runs'. A '·' joins with DOT.

import { DOT } from './text-math.js';
import { kgText } from './harvest-math.js';
import { moneyText, monthTiles, monthTitle } from './costs-math.js';
import { qtyText, useByLine } from './inventory-math.js';
import { countBlocks } from './batches-math.js';
import { ageText } from './sales-math.js';
import { cropsText, runDates, runPageLabel } from './runs-math.js';
import { mainCrop } from './room-card-math.js';
import { farmDate, daysFrom } from './tasks-math.js';
import { runHash } from './route.js';

const DASH = '—';
const MINUS = '−';
const isLoss = (text) => text.startsWith(MINUS); // from the shown figure, as Costs': a loss under half a sen is none
const grouped = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const andList = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);
// "Kedai Ah Seng and Pasar Tani", "Sawdust, Lime, Gypsum and 2 more": up to max names, then how many more.
const namesText = (names, max) => (names.length <= max ? andList(names) : `${names.slice(0, max).join(', ')} and ${names.length - max} more`);
const monthName = (month) => monthTitle(month).split(' ')[0]; // "November"

// ---- the money card ----

// The card's title: "November so far" (this month to today); "This month so far" when Costs could not be read.
export const moneyTitle = (month) => (month ? `${monthName(month.month)} so far` : 'This month so far');

// The tiles (harvest-card.js's tileNodes): Costs' month card's Profit, Income and Costs, as Costs words them (a loss, "working
// out" while the energy is worked out, "Some costs have no price").
export const moneyTiles = (month) => monthTiles(month).slice(0, 3);

// The kg picked and not sold: "140.6 kg not sold yet, about RM 4,921.35 at your expected prices" (Costs' unsold; without the
// RM when a picked crop has no expected price); null when everything picked is sold.
export function unsoldLine(month) {
  const u = month?.tiles?.unsold;
  if (!u) return null;
  return `${kgText(u.kg)} not sold yet${u.value === null || u.value === undefined ? '' : `, about ${moneyText(u.value)} at your expected prices`}`;
}

// Last month's whole result: "October: profit RM 1,200.00", "October: loss RM 13,412.23", "October: nothing recorded",
// "October: working out"; the year when it is another ("December 2025: …"). null without last month (not kept).
export function lastMonthLine(last, month) {
  if (!last) return null;
  const name = month && last.month.slice(0, 4) === month.month.slice(0, 4) ? monthName(last.month) : monthTitle(last.month);
  if (last.pending) return `${name}: working out`;
  if (last.income === 0 && last.costs === 0) return `${name}: nothing recorded`;
  const text = moneyText(last.profit);
  return isLoss(text) ? `${name}: loss ${text.slice(MINUS.length)}` : `${name}: profit ${text}`;
}

// ---- Needs you ----

export const NEEDS_NONE = 'Nothing needs you right now.';
// The modules the needs come from, in the card's order of their failure lines.
export const NEED_PARTS = ['sales', 'inventory', 'batches', 'costs'];
export const PART_NAMES = { costs: 'Costs', sales: 'Sales', inventory: 'Inventory', batches: 'Batches', runs: 'Runs' };

// A group of blocks: "400 Pink oyster blocks" of one crop, "1,200 blocks" of several.
const blocksText = ({ blocks, crops }) => (crops.length === 1 ? countBlocks(blocks, crops[0]) : `${grouped(blocks)} ${blocks === 1 ? 'block' : 'blocks'}`);

// A need's line in words.
const WORDS = {
  owed: (n, now) => `${moneyText(n.total)} owed by ${namesText(n.buyers, 2)}${DOT}oldest ${ageText(n.oldestAt, now)}`,
  'below-zero': (n) => (n.items.length === 1
    ? `Below zero: ${n.items[0].name} ${qtyText(n.items[0].qty, n.items[0].unit)}${DOT}a purchase is missing`
    : `Below zero: ${namesText(n.items.map((i) => i.name), 3)}${DOT}purchases are missing`),
  low: (n) => (n.items.length === 1
    ? `Low stock: ${n.items[0].name} ${qtyText(n.items[0].qty, n.items[0].unit)}, reorder at ${qtyText(n.items[0].reorderAt, n.items[0].unit)}`
    : `Low stock: ${namesText(n.items.map((i) => i.name), 3)}`),
  'use-by': (n) => `${n.name}${DOT}${useByLine(n).text}`,
  blocks: (n) => [
    ...(n.waiting.blocks > 0 ? [`${blocksText(n.waiting)} ready for a room`] : []),
    ...(n.making.blocks > 0 ? [`${blocksText(n.making)} being made`] : []),
  ].join(DOT),
  unpriced: (n) => `${n.notes.length === 1 ? n.notes[0].text : `Blocks of ${n.notes.length} deliveries have no price`}${DOT}this month's costs leave them out`,
};

// The card's lines, in the reply's order: [{ kind, text, href }] (a kind this page does not know is left out). now: ms.
export const needLines = (needs, now = Date.now()) => (needs ?? []).filter((n) => WORDS[n.kind])
  .map((n) => ({ kind: n.kind, text: WORDS[n.kind](n, now), href: n.href }));

// A need's module that could not be read: "Couldn't check Sales just now.", one per part, in NEED_PARTS' order.
export const needFailLines = (errors) => NEED_PARTS.filter((p) => errors?.[p]).map((p) => `Couldn't check ${PART_NAMES[p]} just now.`);

// The card's empty words: only when every module was read (a part not read may hold a need).
export const needsEmpty = (errors) => (NEED_PARTS.some((p) => errors?.[p]) ? null : NEEDS_NONE);

// A part that could not be read, in its own card: "Couldn't read Costs just now."
export const readFailText = (part) => `Couldn't read ${PART_NAMES[part]} just now.`;

// ---- Runs in progress ----

export const RUNS_NONE = 'No runs in progress. A run starts when a container gets its blocks on its Crop tab.';

// A run's days: "since 4 Nov · day 12" (the first day day 1, as a batch's incubation); "recorded since 4 Nov" for a run under
// way at the harvest upgrade (its real start, so its day, is not known). today: the farm's date.
const daysText = (run, today) => (run.partial ? runDates(run, today) : `${runDates(run, today)}${DOT}day ${daysFrom(farmDate(run.startedAt), today) + 1}`);

// The money so far: "Profit so far" with Costs' figure, "Loss so far" with the loss without its minus (the word says it, the
// figure in the loss tone, as Harvest's profit line); a dash with "working out" while pending, a dash without Costs' view;
// "Some costs have no price" under it when so.
function moneyOf(run) {
  if (run.pending) return { label: 'Profit so far', value: DASH, line: 'working out' };
  if (run.profit === null || run.profit === undefined) return { label: 'Profit so far', value: DASH };
  const text = moneyText(run.profit);
  const line = run.incomplete ? { line: 'Some costs have no price' } : {};
  return isLoss(text) ? { label: 'Loss so far', value: text.slice(MINUS.length), tone: 'loss', ...line } : { label: 'Profit so far', value: text, ...line };
}

// The open runs' rows, as Runs lists them (newest started first): { id, href (the run page), label (its link's name, Runs'
// runPageLabel), room, crop (the main crop, for its picture), crops ("600 Grey oyster"), days, kg ("20.0 kg picked"), money }.
export const runRows = (runs, today) => (runs ?? []).map((run) => ({
  id: run.id, href: runHash(run.id), label: runPageLabel(run, today), room: run.roomName ?? 'A deleted room', crop: mainCrop(run.crops),
  crops: cropsText(run), days: daysText(run, today), kg: `${kgText(run.kg)} picked`, money: moneyOf(run),
}));
