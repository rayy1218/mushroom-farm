// The Costs page's pure parts (spec 2026-11-05-costs-design.md 6): the one formatter for RM (a loss with a leading "−", the
// One Format Rule), the month words, the month tiles and notes, the rows of By category, Entries, Monthly items and Runs, a
// run's breakdown, the 12 months' profit bars, and the dialogs' parts (the body sent, the browser's checks, where a room cost
// lands, a bill's period, what a Stop or a Delete removes). Every formatter shows a dash for a missing figure. A number keeps
// its unit at a wrap (a no-break space, the Units Rule); kg and cost per kg come from Harvest's formatter.

import { kgText, costKgText, rmText } from './harvest-math.js';
import { farmDate, dayMonth } from './tasks-math.js';
import { shiftMonth, monthTitle } from './calendar-math.js';
import { grouped } from './overview-math.js';
import { cropShortName } from './crops.js';
import { mainCrop } from './room-card-math.js';
import { DOT } from './text-math.js';
import { niceScale } from './usage-math.js';
import { roomHash, batchesRunHash, BATCHES_HASH, INVENTORY_HASH, SALES_HASH } from './route.js';

const NB = ' ';
const DASH = '—';
const MINUS = '−';
const finite = (x) => typeof x === 'number' && Number.isFinite(x);

// "RM 1,240.50", "−RM 1,240.50"; the sign comes from the rounded value (a loss under half a sen reads "RM 0.00").
export function moneyText(v) {
  if (!finite(v)) return DASH;
  if (Math.round(Math.abs(v) * 100) === 0) return rmText(0);
  return v < 0 ? `${MINUS}${rmText(-v)}` : rmText(v);
}
// A cost or profit per kg: Harvest's rule (never a false RM 0.00), a loss with a "−"; a loss under RM 0.0001 is zero.
export function perKgText(v) {
  if (!finite(v)) return DASH;
  if (Math.abs(v) < 0.0001 && v <= 0) return rmText(0);
  return v < 0 ? `${MINUS}${costKgText(-v)}` : costKgText(v);
}
// A bare whole RM figure (the chart's ticks and bar values; its title says RM): "10,000", "−5,000", "0".
const bareRm = (v) => (Math.round(v) === 0 ? '0' : `${v < 0 ? MINUS : ''}${grouped(Math.abs(Math.round(v)), 0)}`);
const isLoss = (text) => text.startsWith(MINUS); // from the shown (rounded) figure: a loss under half a sen is none

export { monthTitle, shiftMonth as addMonths }; // "November 2026"; one month on or back, 'YYYY-MM'
const monthShort = (month) => `${monthTitle(month).slice(0, 3)} ${month.slice(0, 4)}`; // "Nov 2026"
const monthName = (month) => monthTitle(month).split(' ')[0]; // "November"
// "Jul–Nov 2026", "Dec 2025–Feb 2026", "Nov 2026".
export function monthSpan(a, b) {
  if (a === b) return monthShort(a);
  return a.slice(0, 4) === b.slice(0, 4) ? `${monthShort(a).slice(0, 3)}–${monthShort(b)}` : `${monthShort(a)}–${monthShort(b)}`;
}
// A month picked in a list of months, held to the list's ends.
export const clampMonth = (m, list) => (m < list[0] ? list[0] : m > list.at(-1) ? list.at(-1) : m);
export function monthsBetween(a, b) {
  const out = [];
  for (let m = a; m <= b; m = shiftMonth(m, 1)) out.push(m);
  return out;
}
const dayText = (ms) => dayMonth(farmDate(ms)); // "3 Nov" on the farm's clock

const PENDING = 'Working out the energy cost…';
const NOTHING_SOLD = 'Nothing sold';

// The month card's tiles (harvest-card.js's tileNodes), Profit first (the page leads with it): [{ label, value, line?,
// tone? }]; tone 'loss' on a loss (its word says it too). While the energy is worked out the four figures it feeds are a
// dash with a short "working out" (the one long note is under the tiles).
export function monthTiles({ pending, tiles: t }) {
  const waiting = (label) => ({ label, value: DASH, line: 'working out' });
  const profit = moneyText(t.profit);
  const perKg = perKgText(t.profitPerKg);
  return [
    pending ? waiting('Profit') : { label: 'Profit', value: profit, ...(isLoss(profit) ? { line: 'Loss', tone: 'loss' } : {}) },
    { label: 'Income', value: moneyText(t.income), line: t.kgSold > 0 ? `${kgText(t.kgSold)} sold` : NOTHING_SOLD },
    pending ? waiting('Costs') : { label: 'Costs', value: moneyText(t.costs), ...(t.incomplete ? { line: 'Some costs have no price' } : {}) },
    pending ? waiting('Cost per kg') : { label: 'Cost per kg', value: perKgText(t.costPerKg), line: t.kgHarvested > 0 ? `${kgText(t.kgHarvested)} picked` : 'Nothing picked' },
    pending ? waiting('Profit per kg') : { label: 'Profit per kg', value: perKg, line: t.kgSold > 0 ? `on ${kgText(t.kgSold)} sold` : NOTHING_SOLD, ...(isLoss(perKg) ? { tone: 'loss' } : {}) },
  ];
}

// The notes under the tiles: the one pending note first; an input left out of the costs (a batch or a purchase with no
// price) in the warning tone. [{ kind, text, warn }].
// This month's view ends them with the monthly items still to charge (toComeNote).
const WARN_KINDS = ['unpriced-batch', 'no-unit-cost'];
export function monthNotes(view) {
  const toCome = view.repeating ? toComeNote(view) : null;
  return [...(view.pending ? [{ kind: 'pending', text: PENDING }] : []), ...view.notes, ...(toCome ? [toCome] : [])]
    .map((n) => ({ kind: n.kind, text: n.text, warn: WARN_KINDS.includes(n.kind) }));
}

// Where a line comes from, in a muted line under its name (nothing for one entered here).
// A line entered here says "entered" when the same name also comes from another source (Packaging from Inventory too).
// A source in another module links to its page (2026-11-05, the Business audit).
export const SOURCE_WORDS = { manual: null, batches: 'from Batches', inventory: 'from Inventory', measured: 'measured', bill: `bill${NB}−${NB}measured` };
const SOURCE_HASH = { batches: BATCHES_HASH, inventory: INVENTORY_HASH, sales: SALES_HASH };
export const categoryRows = (list) => list.map((c) => {
  const twin = c.source === 'manual' && list.some((o) => o !== c && o.label === c.label && o.source !== 'manual');
  return {
    label: c.label, source: twin ? 'entered' : SOURCE_WORDS[c.source] ?? null, href: SOURCE_HASH[c.source] ?? null, amount: moneyText(c.amount),
    share: finite(c.share) ? `${c.share}${NB}%` : DASH,
  };
});
// By category's Total: the Costs tile's figure.
export const categoryTotal = ({ pending, tiles }) => (pending ? DASH : moneyText(tiles.costs));

const LABELS = {
  blocks: 'Blocks', spawn: 'Spawn', labour: 'Labour', rent: 'Rent', repairs: 'Repairs', transport: 'Transport',
  packaging: 'Packaging', utilities: 'Utilities', other: 'Other',
};
const UTILITY_WORDS = { electricity: 'Electricity bill', water: 'Water bill', other: null };
const nameOf = (c) => c.label ?? LABELS[c.category]; // the server's label, else ours
const whatOf = (c) => [c.utility ? UTILITY_WORDS[c.utility] ?? nameOf(c) : nameOf(c), c.worker, c.note].filter(Boolean).join(DOT);

export const isBill = (v) => v.category === 'utilities' && (v.utility === 'electricity' || v.utility === 'water');
// What a bill adds to the costs (the server's topUp { amount: the unmeasured part, 0 when the measured cost covers it, null
// while the energy is worked out; month: where it lands, its period's end }), naming that month when not the entry's own:
// "adds RM 580.00 unmeasured to October".
function topUpText({ amount, month }, date) {
  const there = month === date.slice(0, 7) ? '' : ` to ${month.slice(0, 4) === date.slice(0, 4) ? monthName(month) : monthTitle(month)}`;
  if (amount === null) return 'working out';
  return amount > 0 ? `adds ${moneyText(amount)} unmeasured${there}` : `adds nothing${there}: measured is higher`;
}

// An entry of the month: { date, what, whom, amount, monthly, bill, topUp (a bill's words, else null) }.
export const entryLine = (e) => ({
  date: dayMonth(e.date), what: whatOf(e), whom: e.roomName ?? 'The farm', amount: moneyText(e.amount), monthly: e.repeat === 'monthly',
  bill: isBill(e), topUp: isBill(e) && e.topUp ? topUpText(e.topUp, e.date) : null,
});

// A monthly item: { what, whom, amount, since, when } (since: "since Aug 2026", "since Aug 2026, until Oct 2026", "Aug 2026
// only"; when: chargeDayText's).
export function repeatingLine(c, today = null) {
  const first = c.date.slice(0, 7);
  const until = c.repeatUntil ?? null;
  const since = !until ? `since ${monthShort(first)}` : until === first ? `${monthShort(first)} only` : `since ${monthShort(first)}, until ${monthShort(until)}`;
  return { what: whatOf(c), whom: c.roomName ?? 'The farm', amount: `${moneyText(c.amount)} a${NB}month`, since, when: chargeDayText(c, today) };
}

// ---- a monthly item's charge day (2026-11-05, the Business audit: mid-month, the month's costs are only those charged so
// far) ----
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
// Its charge in `month` (server/costs-math.js chargeDate): its day, the month's last when shorter; its first month, its date.
const chargeIn = (c, month) => (month === c.date.slice(0, 7) ? c.date
  : `${month}-${String(Math.min(Number(c.date.slice(8, 10)), daysIn(month))).padStart(2, '0')}`);
// "on the 25th · next 25 Nov": its day, and its next charge after today (none when it stops before).
export function chargeDayText(c, today) {
  const day = `on the ${ordinal(Number(c.date.slice(8, 10)))}`;
  if (!today) return day;
  const month = today.slice(0, 7);
  const next = [month, shiftMonth(month, 1)].map((m) => chargeIn(c, m)).find((d) => d > today && d >= c.date);
  return next && !(c.repeatUntil && next.slice(0, 7) > c.repeatUntil) ? `${day}${DOT}next ${dayMonth(next)}` : day;
}
// A monthly item's short name in the note: a wage, the note of an "other" cost ("internet"), else its category.
const itemName = (c) => {
  const name = c.category === 'labour' ? 'wage' : (c.category === 'other' || c.category === 'utilities') && c.note ? c.note : nameOf(c);
  return name.charAt(0).toLowerCase() + name.slice(1);
};
// This month's monthly items still to charge after today: { kind: 'to-come', text: "Still to come this month: RM 3,529.00
// (2 wages, internet)", warn: false }, the biggest first; null in a month gone by or with none.
export function toComeNote({ month, today, repeating = [] }) {
  if (!today || month !== today.slice(0, 7)) return null;
  const due = repeating.filter((c) => !(c.repeatUntil && c.repeatUntil < month) && chargeIn(c, month) > today);
  if (!due.length) return null;
  const groups = new Map();
  for (const c of due) {
    const name = itemName(c);
    const g = groups.get(name) ?? { name, n: 0, amount: 0 };
    g.n += 1;
    g.amount += c.amount;
    groups.set(name, g);
  }
  const names = [...groups.values()].sort((a, b) => b.amount - a.amount).map((g) => (g.n > 1 ? `${g.n} ${g.name}s` : g.name));
  const sum = Math.round(due.reduce((s, c) => s + c.amount, 0) * 100) / 100;
  return { kind: 'to-come', text: `Still to come this month: ${moneyText(sum)} (${names.join(', ')})`, warn: false };
}
// The muted line under Runs.
export const SHARED_NOTE = 'Shared costs (rent, wages, …) are split over the runs by block-days.';

export const RUN_COLUMNS = ['Dates', 'Container', 'Crops', 'Income', 'Costs', 'Profit', 'Profit per kg'];

// A run's row: { dates, room, roomHref (its Harvest tab), crops, crop (the main crop, for its picture; null without), cells
// (Income, Costs, Profit, Profit per kg), loss (Profit), perKgLoss, incomplete (some of its costs have no price) }.
export function runRow(run) {
  const to = run.endedAt === null ? 'now' : dayText(run.endedAt);
  const cells = [moneyText(run.income), moneyText(run.costs), moneyText(run.profit), perKgText(run.profitPerKg)];
  return {
    dates: `${dayText(run.startedAt)}${NB}–${NB}${to}`, room: run.roomName, roomHref: roomHash(run.roomId, 'harvest'),
    crops: run.crops.map((c) => cropShortName(c.crop)).join(', '), crop: mainCrop(run.crops),
    cells, loss: isLoss(cells[2]), perKgLoss: isLoss(cells[3]), incomplete: run.incomplete === true,
  };
}

// A run's breakdown under its row: [[label, value, href?]], the parts that are not 0 (Blocks also when a batch of the run has
// no price: "no price"; Blocks only come from Batches, so it links to the run's batches), then income and the kg picked and sold.
export function runParts(run) {
  const p = run.parts;
  const unpriced = (run.notes ?? []).some((n) => n.kind === 'unpriced-batch');
  const blocks = unpriced ? (p.blocks > 0 ? `${moneyText(p.blocks)}, some with no price` : 'no price') : p.blocks > 0 ? moneyText(p.blocks) : null;
  return [
    ...(blocks ? [['Blocks', blocks, batchesRunHash(run.id)]] : []),
    ...[['Electricity', p.energy], ['Water', p.water], ['Own costs', p.own], ['Share of shared costs', p.shared]]
      .filter(([, v]) => v > 0).map(([label, v]) => [label, moneyText(v)]),
    ['Income', moneyText(run.income)], ['Picked', kgText(run.kgHarvested)], ['Sold', kgText(run.kgSold)],
  ];
}

const MAX_BAR_W = 48;
export const BARS_M = { left: 44, right: 8, top: 20, bottom: 40 }; // top and bottom: room for a bar's value at its end
const TICK_GAP = 28; // the least px between two ticks
const VALUE_SLOT = 60; // a month's slot this wide or wider shows every bar's value (else only the shown month's)
const SLOT_MIN = 24; // narrower slots for 12 months (a phone): the last 6 instead

// A month in words for a screen reader: "October 2026: profit RM 3,764.00", "…: loss RM 4,805.00", "…: nothing recorded".
const emptyMonth = (x) => !x.pending && x.income === 0 && x.costs === 0;
function barWords(x) {
  const what = x.pending || x.profit === null ? 'working out' : emptyMonth(x) ? 'nothing recorded'
    : x.profit < 0 && isLoss(moneyText(x.profit)) ? `loss ${moneyText(-x.profit)}` : `profit ${moneyText(x.profit)}`;
  return `${monthTitle(x.month)}: ${what}`;
}

// The chart's words for a screen reader (its aria-label): the title, the months counted by kind, the highest and the lowest.
export function chartWords(months, title) {
  const kinds = [['with a profit', 0], ['with a loss', 0], ['with nothing recorded', 0], ['being worked out', 0]];
  const valued = [];
  for (const x of months) {
    const at = x.pending || x.profit === null ? 3 : emptyMonth(x) ? 2 : isLoss(moneyText(x.profit)) ? 1 : 0;
    kinds[at][1] += 1;
    if (at < 2) valued.push(x);
  }
  const counted = kinds.filter(([, n]) => n > 0).map(([words, n], i) => (i === 0 ? `${n} ${n === 1 ? 'month' : 'months'} ${words}` : `${n} ${words}`));
  const say = (x) => barWords(x).replace(': ', ', ');
  const sorted = [...valued].sort((a, b) => b.profit - a.profit);
  const ends = sorted.length ? [`Highest ${say(sorted[0])}.`, ...(sorted.length > 1 ? [`Lowest ${say(sorted.at(-1))}.`] : [])] : [];
  return [`${title}: ${counted.join(', ')}.`, ...ends].join(' ');
}

// The months the chart draws: the last 12, or the last 6 when 12 would make a slot under 24 px.
export const chartMonths = (last12, width, m = BARS_M) => ((width - m.left - m.right) / Math.max(1, last12.length) < SLOT_MIN ? last12.slice(-6) : last12);
export const chartTitle = (n) => (n === 1 ? 'Profit, 1 month (RM)' : `Profit, last ${n} months (RM)`);
// Nothing at all to draw: every month with no income and no costs.
export const noFigures = (months) => months.every(emptyMonth);

// The months' profit bars in a width × height box: { bars: [{ month, label, x, y, w, h, loss, pending, empty, shown, words,
// value, showValue }], zeroY, ticks: [{ y, label }] }. Profits rise from the zero line, losses hang from it, on one scale:
// one step from niceScale of the larger side, its multiples both ways; a tick closer than 28 px to the one before is left out.
export function profitBars(months, shown, width, height, m = BARS_M) {
  const values = months.map((x) => (finite(x.profit) ? x.profit : 0));
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const scale = niceScale(Math.max(hi, -lo), 4, { whole: true });
  const step = scale.ticks[1];
  const up = Math.max(hi > 0 || lo === 0 || months.some((x) => x.pending) ? 1 : 0, Math.ceil(hi / step - 1e-9)); // a pending stub stands above zero
  const down = Math.ceil(-lo / step - 1e-9);
  const top = up * step;
  const bottom = down * step;
  const plotH = height - m.top - m.bottom;
  const y = (v) => m.top + ((top - v) / (top + bottom)) * plotH;
  const slot = (width - m.left - m.right) / Math.max(1, months.length);
  const w = Math.min(MAX_BAR_W, Math.max(2, slot * 0.64)); // one month never fills the chart
  const bars = months.map((x, i) => {
    const v = values[i];
    const [y0, y1] = [y(0), y(v)];
    const pending = x.profit === null || x.pending === true;
    const empty = emptyMonth(x);
    return {
      month: x.month, label: monthTitle(x.month).slice(0, 3), x: m.left + i * slot + (slot - w) / 2,
      y: Math.min(y0, y1), w, h: Math.max(1, Math.abs(y1 - y0)), loss: isLoss(moneyText(v)), pending, empty, shown: x.month === shown,
      words: barWords(x), value: bareRm(v), showValue: !pending && !empty && (x.month === shown || slot >= VALUE_SLOT),
    };
  });
  // each side from zero outwards, so zero is always kept
  const side = (n, sign) => {
    const kept = [];
    let last = y(0);
    for (let k = 1; k <= n; k++) {
      const at = y(sign * k * step);
      if (Math.abs(at - last) < TICK_GAP) continue;
      kept.push(sign * k * step);
      last = at;
    }
    return kept;
  };
  const tickValues = [...side(up, 1).reverse(), 0, ...side(down, -1)];
  return { bars, zeroY: y(0), ticks: tickValues.map((v) => ({ y: y(v), label: bareRm(v) })) };
}

// ---- the Harvest tab's line (2026-11-05, the Business audit) ----
// The run's profit from GET /api/costs/summary?run=: "Profit so far RM 260.00 · Costs" ("Loss so far RM 340.00" for a loss,
// in words); null while it is worked out or when Costs has nothing for the run.
export function runProfitLine(s) {
  if (!s || !finite(s.profit) || !finite(s.total) || (s.total === 0 && !(s.income > 0))) return null;
  const text = moneyText(s.profit);
  return isLoss(text) ? `Loss so far ${text.slice(MINUS.length)}${DOT}Costs` : `Profit so far ${text}${DOT}Costs`;
}

// ---- the dialogs (web/costs-dialogs.js) ----

export const AMOUNT_MESSAGE = 'Enter an amount over RM 0, up to RM 1,000,000'; // server/costs.js says the same
export const WORKER_MESSAGE = 'Pick who was paid';
const MAX_AMOUNT = 1_000_000;

// An amount in its box, grouped as the page shows it: "1,800.00" (amountOf reads it back).
export const amountBox = (v) => grouped(v, 2);

// A typed amount as a number: grouping commas and spaces dropped; NaN for none or not a number.
export function amountOf(text) {
  const t = String(text ?? '').replace(/[,\s]/g, '');
  return t === '' ? NaN : Number(t);
}

// The body of Add and Edit from the dialog's values. A bill is the whole farm's; its empty period is sent as null (the server
// takes the bill date's month).
export function bodyOf(v) {
  const body = { date: v.date, category: v.category, amount: amountOf(v.amount), note: v.note };
  body.roomId = v.roomId ? Number(v.roomId) : null;
  if (v.category === 'labour') body.worker = v.worker;
  if (v.category === 'utilities') body.utility = v.utility;
  if (isBill(v)) {
    body.roomId = null;
    body.periodFrom = v.periodFrom || null;
    body.periodTo = v.periodTo || null;
  }
  return body;
}

// The browser's checks before a send (the server checks again): → { field, message } or null. workersFailed: the names could
// not be read.
export function checkCost(v, { workersFailed = false } = {}) {
  const amount = amountOf(v.amount);
  if (!(amount > 0 && amount <= MAX_AMOUNT)) return { field: 'amount', message: AMOUNT_MESSAGE };
  const period = isBill(v) ? checkPeriod(v) : null;
  if (period) return period;
  if (v.category === 'labour' && !String(v.worker ?? '').trim()) {
    return { field: 'worker', message: workersFailed ? 'The workers could not be read. Try again.' : WORKER_MESSAGE };
  }
  return null;
}

// A bill's period near its date (server/costs.js): from up to 92 days before it, at most 62 days long, to up to 31 days after
// it. Empty boxes are the server's to fill (the date's month).
const BILL_DAYS = 62;
const BILL_DAYS_BEFORE = 92;
const BILL_DAYS_AFTER = 31;
const DAY_MS = 86_400_000;
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '');
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
const shiftDay = (d, n) => new Date(dayMs(d) + n * DAY_MS).toISOString().slice(0, 10);
function checkPeriod({ date, periodFrom: from, periodTo: to }) {
  if (!isDay(date) || !isDay(from) || !isDay(to)) return null;
  if (from < shiftDay(date, -BILL_DAYS_BEFORE)) return { field: 'periodFrom', message: `Pick a first day up to ${BILL_DAYS_BEFORE} days before the bill’s date` };
  if (to < from || (dayMs(to) - dayMs(from)) / DAY_MS + 1 > BILL_DAYS) {
    return { field: 'periodTo', message: `Pick the last day the bill covers, up to ${BILL_DAYS} days after the first` };
  }
  if (to > shiftDay(date, BILL_DAYS_AFTER)) return { field: 'periodTo', message: `Pick a last day up to ${BILL_DAYS_AFTER} days after the bill’s date` };
  return null;
}

// A day in a dialog's words: "3 Oct", with its year when not this year's ("1 Dec 2025").
const dayWords = (date, today) => `${dayMonth(date)}${date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${date.slice(0, 4)}`}`;

// The room's run open on `date` (server/costs-math.js runOn: of those whose farm days hold it, the one started last).
export function runOn(runs, roomId, date, today) {
  let found = null;
  for (const r of runs) {
    const from = farmDate(r.startedAt);
    const to = r.endedAt === null ? today : farmDate(r.endedAt);
    if (r.roomId !== roomId || from > date || date > to) continue;
    if (!found || r.startedAt > found.startedAt || (r.startedAt === found.startedAt && r.id > found.id)) found = r;
  }
  return found;
}
// Where a one-off room cost lands (the line under For).
export function landingText(runs, roomId, roomName, date, today) {
  const run = runOn(runs, roomId, date, today);
  return run ? `On ${roomName}’s run of ${dayWords(farmDate(run.startedAt), today)}.` : `No run in ${roomName} then: on the farm’s month.`;
}

const daysIn = (month) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
// A bill's period by default: its date's calendar month. null for a date not whole.
export function billPeriod(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null;
  const month = date.slice(0, 7);
  return { from: `${month}-01`, to: `${month}-${String(daysIn(month)).padStart(2, '0')}` };
}

// A monthly item's charges after the month `after` up to its last month (or this month), those come by today: [{ month,
// date }] (server/costs-math.js chargesOf: the item's day, the month's last when shorter).
export function stopCharges(cost, after, today) {
  const current = today.slice(0, 7);
  const last = cost.repeatUntil && cost.repeatUntil < current ? cost.repeatUntil : current;
  const day = Number(cost.date.slice(8, 10));
  const out = [];
  for (let m = shiftMonth(after, 1); m <= last; m = shiftMonth(m, 1)) {
    const date = `${m}-${String(Math.min(day, daysIn(m))).padStart(2, '0')}`;
    if (date <= today) out.push({ month: m, date });
  }
  return out;
}
const total = (cost, n) => moneyText(Math.round(cost.amount * n * 100) / 100);
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

// Stop from the month `after`: the warning naming the charges it removes (none: null), the button's words, and danger (it
// removes charges: the button red).
export function stopWords(cost, after, today) {
  const gone = stopCharges(cost, after, today);
  const n = gone.length;
  if (n === 0) return { warning: null, button: 'Stop', danger: false };
  const name = (m) => (m.slice(0, 4) === today.slice(0, 4) ? monthName(m) : monthTitle(m));
  const warning = n === 1 ? `${name(gone[0].month)}’s charge of ${moneyText(cost.amount)} goes too.`
    : n === 2 ? `${name(gone[0].month)}’s and ${name(gone[1].month)}’s charges, ${total(cost, 2)}, go too.`
      : `${n} charges, ${total(cost, n)}, ${monthSpan(gone[0].month, gone.at(-1).month)}, go too.`;
  return { warning, button: `Stop and remove ${plural(n, 'charge')}`, danger: true };
}

// What a monthly item's Delete removes: "5 charges, RM 7,500.00, Jul–Nov 2026"; null when it has not charged yet.
export function deleteWords(cost, today) {
  const all = stopCharges(cost, shiftMonth(cost.date.slice(0, 7), -1), today);
  if (!all.length) return null;
  return `${plural(all.length, 'charge')}, ${total(cost, all.length)}, ${monthSpan(all[0].month, all.at(-1).month)}`;
}
