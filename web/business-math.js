// The Business summary's pure parts (spec 2026-11-06-business-summary-design.md 6 and 7): the money card's title, tiles and
// lines, a line per need (its state tone, the worst first), the open runs' rows, and the words of a part that could not be
// read. Every figure goes through its module's one formatter (the One Format Rule): RM, a loss and a month's name by
// Costs', kg by Harvest's, a stock qty and a use-by by Inventory's, blocks by Batches', a sale's age by Sales', a run's days
// and crops by Runs'. A '·' joins with DOT.

import { DOT } from './text-math.js';
import { kgText } from './harvest-math.js';
import { moneyText, monthTiles, monthTitle, monthName, toComeNote } from './costs-math.js';
import { qtyText, useByLine } from './inventory-math.js';
import { countBlocks, blocksText as allBlocksText } from './batches-math.js';
import { ageText } from './sales-math.js';
import { cropsText, runDates, runPageLabel } from './runs-math.js';
import { mainCrop } from './room-card-math.js';
import { farmDate, daysFrom } from './tasks-math.js';
import { runHash } from './route.js';

const DASH = '—';
const MINUS = '−';
const isLoss = (text) => text.startsWith(MINUS); // from the shown figure, as Costs': a loss under half a sen is none
const andList = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);
// "Kedai Ah Seng and Pasar Tani", "Sawdust, Lime, Gypsum and 2 more": up to max names, then how many more.
const namesText = (names, max) => (names.length <= max ? andList(names) : `${names.slice(0, max).join(', ')} and ${names.length - max} more`);

// ---- the money card ----

// The card's title: "November so far" (this month to today); "This month so far" when Costs could not be read.
export const moneyTitle = (month) => (month ? `${monthName(month.month)} so far` : 'This month so far');

// The tiles (harvest-card.js's tileNodes): Costs' month card's Profit, Income and Costs, as Costs words them (a loss, "working
// out" while the energy is worked out, "Some costs have no price").
export const moneyTiles = (month) => monthTiles(month).slice(0, 3);

// Costs' line of the monthly items still to charge this month, in its words: "Still to come this month: RM 1,500.00 (rent)";
// null when none is left or without Costs.
export const toComeLine = (month) => (month ? toComeNote(month)?.text ?? null : null);

// The kg picked and not sold: "140.6 kg not sold yet, about RM 4,921.35 at your expected prices" (Costs' unsold; without the
// RM when a picked crop has no expected price); null when everything picked is sold.
export function unsoldLine(month) {
  const u = month?.tiles?.unsold;
  if (!u) return null;
  return `${kgText(u.kg)} not sold yet${u.value === null || u.value === undefined ? '' : `, about ${moneyText(u.value)} at your expected prices`}`;
}
// The same as a tile (a desk's fourth): "Not sold" "140.6 kg" "about RM 4,921.35 at your expected prices".
export function unsoldTile(month) {
  const u = month?.tiles?.unsold;
  if (!u) return null;
  return { label: 'Not sold', value: kgText(u.kg), ...(u.value === null || u.value === undefined ? {} : { line: `about ${moneyText(u.value)} at your expected prices` }) };
}

// Last month's name: "October"; "December 2025" when its year is not this month's.
const lastName = (last, month) => (month && last.month.slice(0, 4) === month.month.slice(0, 4) ? monthName(last.month) : monthTitle(last.month));

// Last month's whole result as a tile (a desk's fifth), Costs' Profit tile's way: "October" "RM 1,200.00" "Profit"; a loss
// "−RM 340.00" "Loss" in the loss tone; "RM 0.00" "Nothing recorded"; "—" "working out". null without last month (not kept).
export function lastMonthTile(last, month) {
  if (!last) return null;
  const label = lastName(last, month);
  if (last.pending) return { label, value: DASH, line: 'working out' };
  const value = moneyText(last.profit);
  if (last.income === 0 && last.costs === 0) return { label, value, line: 'Nothing recorded' };
  return isLoss(value) ? { label, value, line: 'Loss', tone: 'loss' } : { label, value, line: 'Profit' };
}

// The same as a line (a phone's and a narrow desk's), in parts so only a loss's figure takes the loss tone: "October: RM
// 1,200.00 profit", "October: −RM 13,412.23 loss", "October: nothing recorded", "October: working out". [{ text, tone? }].
export function lastMonthLine(last, month) {
  const t = lastMonthTile(last, month);
  if (!t) return null;
  const lead = { text: `${t.label}: ` };
  if (t.value === DASH || t.line === 'Nothing recorded') return [lead, { text: t.line.toLowerCase() }];
  return [lead, { text: t.value, ...(t.tone ? { tone: t.tone } : {}) }, { text: ` ${t.line.toLowerCase()}` }];
}

// ---- Needs you ----

export const NEEDS_NONE = 'Nothing needs you right now.';
// The modules the needs come from.
export const NEED_PARTS = ['sales', 'inventory', 'batches', 'costs'];
export const PART_NAMES = { costs: 'Costs', sales: 'Sales', inventory: 'Inventory', batches: 'Batches', runs: 'Runs' };
export const RETRY_WORDS = 'Retry';
const AGAIN = 'trying again every minute'; // the page's timer (fallbackMs: a minute, the stream up or not)
const OWED_DAYS = 30; // money owed longer than this is a warning

// A group of blocks: "400 Pink oyster blocks" of one crop, "1,200 blocks" of several.
const blocksText = ({ blocks, crops }) => (crops.length === 1 ? countBlocks(blocks, crops[0]) : allBlocksText(blocks));
const owedDays = (n, now) => daysFrom(farmDate(n.oldestAt), farmDate(now));

// A need's line in words, its state tone (as Inventory's pills: 'critical' red, 'warning' amber, null none) and its place in
// the reply's order (a part not read takes its needs' place).
const KINDS = {
  owed: {
    place: 0,
    tone: (n, now) => (owedDays(n, now) > OWED_DAYS ? 'warning' : null),
    words: (n, now) => `${moneyText(n.total)} owed by ${namesText(n.buyers, 2)}${DOT}oldest ${ageText(n.oldestAt, now)}${n.buyers.length > 1 && n.oldestBuyer ? ` (${n.oldestBuyer})` : ''}`,
  },
  'below-zero': {
    place: 1,
    tone: () => 'critical',
    words: (n) => (n.items.length === 1
      ? `Below zero: ${n.items[0].name} ${qtyText(n.items[0].qty, n.items[0].unit)}${DOT}a purchase is missing`
      : `Below zero: ${namesText(n.items.map((i) => i.name), 3)}${DOT}purchases are missing`),
  },
  low: {
    place: 2,
    tone: () => 'warning',
    words: (n) => (n.items.length === 1
      ? `Low stock: ${n.items[0].name} ${qtyText(n.items[0].qty, n.items[0].unit)}, reorder at ${qtyText(n.items[0].reorderAt, n.items[0].unit)}`
      : `Low stock: ${namesText(n.items.map((i) => i.name), 3)}`),
  },
  'use-by': {
    place: 3,
    key: (n) => `use-by:${n.id}`,
    tone: (n) => (n.useBy.state === 'expired' ? 'critical' : 'warning'),
    words: (n) => `${n.name}${DOT}${useByLine(n).text}`,
  },
  blocks: { place: 4, tone: () => null, words: (n) => `${blocksText(n)} ready for a room` },
  // amber as Costs' own note of a delivery with no price (its costs are short)
  unpriced: {
    place: 5,
    tone: () => 'warning',
    words: (n) => `${n.notes.length === 1 ? n.notes[0].text : `Blocks of ${n.notes.length} deliveries have no price`}${DOT}this month's costs leave them out`,
  },
};
const PART_PLACE = { sales: 0, inventory: 1, batches: 4, costs: 5 };
const TONE_RANK = { critical: 0, warning: 1 };
const rank = (tone) => TONE_RANK[tone] ?? 2;

// The card's lines, the worst first (critical, warning, then the rest), the reply's order within: [{ kind, key (the line's
// focus key, kept over a repaint), tone, text, href }]; a module not read: { kind: 'failed', key, part, tone, text } in its
// needs' place. A kind this page does not know is left out. r: the reply; now: ms.
export function needLines(r, now = Date.now()) {
  const lines = (r?.needs ?? []).filter((n) => Object.hasOwn(KINDS, n.kind)).map((n, i) => {
    const k = KINDS[n.kind];
    return { kind: n.kind, key: k.key?.(n) ?? n.kind, tone: k.tone(n, now), text: k.words(n, now), href: n.href, place: k.place, i };
  });
  const failed = NEED_PARTS.filter((p) => r?.errors?.[p]).map((part, i) => ({
    kind: 'failed', key: `failed:${part}`, part, tone: 'warning', text: `Couldn't check ${PART_NAMES[part]} just now${DOT}${AGAIN}`, place: PART_PLACE[part], i,
  }));
  return [...lines, ...failed].sort((a, b) => rank(a.tone) - rank(b.tone) || a.place - b.place || (a.kind === 'failed') - (b.kind === 'failed') || a.i - b.i)
    .map(({ place, i, ...line }) => line);
}

// The card's title: "Needs you · 3"; "Needs you" when nothing does.
export const needsTitle = (count) => (count > 0 ? `Needs you${DOT}${count}` : 'Needs you');

// The card's empty words: only when every module was read (a part not read may hold a need).
export const needsEmpty = (errors) => (NEED_PARTS.some((p) => errors?.[p]) ? null : NEEDS_NONE);

// A part that could not be read, in its own card: "Couldn't read Costs just now · trying again every minute".
export const readFailText = (part) => `Couldn't read ${PART_NAMES[part]} just now${DOT}${AGAIN}`;

// ---- Runs in progress ----

export const RUNS_NONE = 'No runs in progress. A run starts when a container gets its blocks on its Crop tab.';
export const ROOMS_LINK = 'Rooms, to open a container';

// A run's days: "since 4 Nov · day 12" (the first day day 1, as a batch's incubation); "recorded since 4 Nov" for a run under
// way at the harvest upgrade (its real start, so its day, is not known). today: the farm's date.
const daysText = (run, today) => (run.partial ? runDates(run, today) : `${runDates(run, today)}${DOT}day ${daysFrom(farmDate(run.startedAt), today) + 1}`);

// The money so far as the run page's Profit tile has it: "Profit so far" with Costs' figure; a loss keeps its minus, the
// figure in the loss tone and "Loss" under it (as the Runs list and the run page); a dash with "working out" while pending, a
// dash without Costs' view; "Some costs have no price" under it when so.
function moneyOf(run) {
  const label = 'Profit so far';
  if (run.pending) return { label, value: DASH, line: 'working out' };
  if (run.profit === null || run.profit === undefined) return { label, value: DASH };
  const value = moneyText(run.profit);
  const lines = [...(isLoss(value) ? ['Loss'] : []), ...(run.incomplete ? ['Some costs have no price'] : [])];
  return { label, value, ...(lines.length ? { line: lines.join(DOT) } : {}), ...(isLoss(value) ? { tone: 'loss' } : {}) };
}

// The open runs' rows, as Runs lists them (newest started first): { id, href (the run page, the container's name its link),
// label (the link's name, Runs' runPageLabel), room, crop (the main crop, for its picture), line ("600 Grey oyster · since 4
// Nov · day 12 · 20.0 kg picked"; "nothing picked yet"), money }.
export const runRows = (runs, today) => (runs ?? []).map((run) => ({
  id: run.id, href: runHash(run.id), label: runPageLabel(run, today), room: run.roomName ?? 'A deleted room', crop: mainCrop(run.crops),
  line: [cropsText(run), daysText(run, today), run.kg > 0 ? `${kgText(run.kg)} picked` : 'nothing picked yet'].join(DOT),
  money: moneyOf(run),
}));
