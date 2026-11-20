// The Economics page's words for the comparison (spec 2026-11-06-economics-design.md 8.2–8.4, 8.7): the headline, the rows
// of "A month, each way", the lines under it, the months and a figure with its unit. Pure: the results are the model's
// (web/economics-model.js compare), every RM through Costs' formatter and every kg through Harvest's (the One Format Rule).
//   monthsText · figureText · rangeText · wayName · headline · ROWS · rows · fillLine · sizedLine · neverLine · leftLine
//   · tilesOf · stickyText · barsOf · SHORT_LEFT · compareChoices · phoneCaption · arrowText (Economics stage 2)
//   · labourLine (Money truth)

import { moneyText, perKgText } from './costs-math.js';
import { kgText } from './harvest-math.js';
import { grouped } from './overview-math.js';
import { cropShortName } from './crops.js';
import { figureOf, WAY_NAMES, keepTogether, yoursName } from './economics-defaults.js';
import { HOUSE_BLOCKS } from './economics-model.js';

const NB = '\u00a0'; // a number keeps its unit at a wrap (the Units Rule)
const DASH = '—';
const RANGE_DASH = '\u2060–\u2060';
const BREAK_EVEN = 'break\u2011even'; // a non-breaking hyphen: a narrow phone never ends a line on "break-" (the audit, #19)
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const cents = (v) => Math.sign(v) * Math.round(Math.abs(v) * 100); // a figure as it shows, its sign decided as moneyText decides it
const beText = (v) => `${perKgText(v)} a${NB}kg`;
// up to so many places, one Intl.NumberFormat a shape kept (toLocaleString makes one a call: the review)
const FORMATS = new Map();
const numberText = (v, min, max) => {
  const key = `${min}/${max}`;
  let f = FORMATS.get(key);
  if (!f) FORMATS.set(key, (f = new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max })));
  return f.format(v);
};
const upTo = (v, places) => numberText(v, 0, places);

// A payback: "under 1 month", "1 month", one decimal under 9.95 ("6.2 months"), else whole ("13 months"), "never".
export function monthsText(v) {
  if (v === Infinity) return 'never';
  if (!finite(v)) return DASH;
  if (v < 1) return `under${NB}1${NB}month`;
  const text = v < 9.95 ? v.toFixed(1) : grouped(Math.round(v), 0);
  return text === '1.0' ? `1${NB}month` : `${text}${NB}months`;
}

// A figure's number and unit: [before, number, after] ("RM ", "55.00", " a kg"; "", "250", " g").
function parts(key, v) {
  const { unit } = figureOf(key);
  // RM through Costs' formatters (the One Format Rule): the "RM " (or "−RM ") before, the figure after it.
  const split = (text) => { const i = text.indexOf(NB) + 1; return [text.slice(0, i), text.slice(i)]; };
  const money = (after, format = moneyText) => [...split(format(v)), after];
  const plural = (one, many) => (v === 1 ? one : many);
  switch (unit) {
    case 'RM/kg': return money(`${NB}a${NB}kg`, perKgText);
    case 'RM a block': return money(`${NB}a${NB}block`);
    case 'RM a month': return money(`${NB}a${NB}month`);
    case 'RM an hour': return money(`${NB}an${NB}hour`);
    case 'RM': return money('');
    case 'RM/kWh': return [`RM${NB}`, numberText(v, 2, 4), `${NB}a${NB}kWh`];
    case 'g': return ['', grouped(Math.round(v), 0), `${NB}g`];
    case 'kWh': return ['', grouped(v, 2), `${NB}kWh`];
    case 'kWh a month': return ['', upTo(v, 1), `${NB}kWh a${NB}month`];
    case '%': return ['', upTo(v, 1), `${NB}%`];
    case 'days': return ['', grouped(v, 0), `${NB}${plural('day', 'days')}`];
    case 'min': return ['', grouped(v, 2), `${NB}min`];
    case 'hours a day': return ['', upTo(v, 1), `${NB}${plural('hour', 'hours')} a${NB}day`];
    case 'months': return ['', grouped(v, 0), `${NB}${plural('month', 'months')}`];
    case 'blocks': return ['', grouped(v, 0), `${NB}${plural('block', 'blocks')}`];
    case 'kg a week': return ['', grouped(v, 1), `${NB}kg a${NB}week`]; // Economics stage 2: what you can sell
    case 'workers': return ['', upTo(v, 1), `${NB}${plural('worker', 'workers')}`]; // Money truth: part-time is 0.5
    default: return ['', grouped(v, 0), `${NB}${plural('flush', 'flushes')}`]; // flushes per block
  }
}
// "250 g", "RM 55.00 a kg", "42 days", "2 flushes"; a dash without a number.
export function figureText(key, v) {
  if (!finite(v)) return DASH;
  return parts(key, v).join('');
}
// A research range: "150–400 g", "RM 8.00–13.00 a kg"; word joiners keep it whole at its dash.
export function rangeText(key, low, high) {
  if (!finite(low) || !finite(high)) return DASH;
  const [before, a] = parts(key, low);
  const [, b, after] = parts(key, high); // the unit as the high figure takes it: "1–3 flushes" (the UI check)
  return `${before}${a}${RANGE_DASH}${b}${after}`;
}

// ---- Economics stage 2 ---- (5.4) a swing's low → high: "RM 40.00 → 60.00 a kg", "12 → 20 days"; unit: false leaves it out.
export function arrowText(key, low, high, { unit = true } = {}) {
  if (!finite(low) || !finite(high)) return DASH;
  const [before, a, after] = parts(key, high);
  return `${before}${parts(key, low)[1]}${NB}→ ${a}${unit ? after : ''}`;
}

// A way's name: as a column head, or in a sentence ("A highland grower", lower-cased after a comma).
const IN_A_SENTENCE = { shed: 'A lowland shed', highland: 'A highland grower', import: 'Importing and reselling', warm: 'A warm strain in a lowland shed' };
// type (Money truth): the room's, naming Your way (Your container, Your room, Your shed).
export const wayName = (way, { sentence = false, lower = false, type = 'container' } = {}) => {
  const name = sentence ? IN_A_SENTENCE[way] : way === 'yours' ? yoursName(type) : WAY_NAMES[way];
  return lower ? name[0].toLowerCase() + name.slice(1) : name;
};

const FRACTIONS = [[0.1, 'a tenth'], [0.2, 'a fifth'], [0.25, 'a quarter'], [1 / 3, 'a third'], [0.5, 'half'], [2 / 3, 'two thirds'], [0.75, 'three quarters']];
// The other way's equipment against yours: "on a quarter of the equipment", "with no equipment", "on twice the equipment".
function equipmentWords(other, yours) {
  if (other.kind === 'trade' || other.equipment === 0) return 'with no equipment';
  if (yours.equipment === 0) return `on ${moneyText(other.equipment)} of equipment`;
  const ratio = other.equipment / yours.equipment;
  if (ratio < 0.875) return `on ${FRACTIONS.reduce((a, b) => (Math.abs(b[0] - ratio) < Math.abs(a[0] - ratio) ? b : a))[1]} of the equipment`;
  if (ratio <= 1.15) return 'on about the same equipment';
  if (ratio >= 1.95 && ratio <= 2.05) return 'on twice the equipment';
  return `on ${upTo(ratio, 1)} times the equipment`;
}

const within = (life) => `within the ${life}${NB}months the equipment is written off over`;

// The headline (spec 8.2): { first: [text or { text, tone: 'loss' }], second: text or null }. results: compare's, Your
// container first; room: its name; crop: its key; life: the months the equipment is written off over.
export function headline(results, { room, crop, life }) {
  const [yours, ...others] = results;
  const name = `${cropShortName(crop)} in ${room}`;
  const loss = (v) => ({ text: moneyText(v), tone: 'loss' });
  let first;
  if (!(yours.kgSold >= 0.05)) { // shows as 0.0 kg
    first = cents(yours.profit) < 0
      ? [`${name} sells nothing at these figures: `, loss(yours.profit), ` a${NB}month loss.`]
      : [`${name} sells nothing at these figures: ${moneyText(yours.profit)} a${NB}month.`];
  } else if (cents(yours.profit) < 0) {
    first = [`${name}: `, loss(yours.profit), ` a${NB}month loss, ${BREAK_EVEN} ${beText(yours.be)}, never pays back.`];
  } else {
    const pays = yours.paybackAll === Infinity
      ? `but it doesn't pay back ${within(life)}.`
      : `pays back in ${monthsText(yours.paybackAll)}.`;
    first = [`${name}: ${moneyText(yours.profit)} a${NB}month, ${BREAK_EVEN} ${beText(yours.be)}, ${pays}`];
  }
  if (!others.length) return { first, second: null };
  const best = others.reduce((a, b) => (cents(b.profit) > cents(a.profit) ? b : a));
  // A profit that shows as RM 0.00 is not a loss: the other way "breaks even", and yours at zero is not beaten by a loss.
  const did = (o) => (o > 0 ? `makes ${moneyText(best.profit)}` : 'breaks even');
  const nextWay = wayName(best.way, { sentence: true, lower: true });
  const sentence = wayName(best.way, { sentence: true });
  const [y, o] = [cents(yours.profit), cents(best.profit)];
  let second;
  if (o > y) second = o < 0 ? `${sentence} loses less, ${moneyText(best.profit)}, ${equipmentWords(best, yours)}.` : `${sentence} ${did(o)} ${equipmentWords(best, yours)}.`;
  else if (y < 0) second = 'Every other way loses more.';
  else if (o < 0) second = 'Every other way loses money at these figures.';
  else second = `That is the most of the ${results.length} ways; next, ${nextWay} ${did(o)}.`;
  return { first, second };
}

// The rows of "A month, each way" (spec 8.3): [{ key, label, cell(result) → { text, tone?, sub? } }].
const money = (v) => ({ text: moneyText(v) });
const cellMonths = (v) => (v === Infinity ? 'Never' : monthsText(v)); // a cell starts with a capital, as "No equipment" (the audit, #23)
const growOr = (grow, trade) => (r) => (r.kind === 'trade' ? trade(r) : grow(r));
export const ROWS = [
  { key: 'blocks', label: 'Blocks a month', cell: growOr((r) => ({ text: grouped(Math.round(r.blocksM), 0) }), (r) => ({ text: `${kgText(r.kgBought)} bought` })) },
  { key: 'kg', label: 'kg sold a month', cell: (r) => ({ text: kgText(r.kgSold), ...(r.capped ? { sub: `of ${kgText(r.kgGrown)} grown` } : {}) }) }, // stage 2: capped
  { key: 'income', label: 'Income', cell: (r) => money(r.income) },
  { key: 'bought', label: 'Blocks, or mushrooms bought', cell: (r) => money(r.cost.blocks) },
  { key: 'electricity', label: 'Electricity', cell: (r) => money(r.cost.electricity) },
  { key: 'labour', label: 'Labour', cell: (r) => money(r.cost.labour) },
  { key: 'packing', label: 'Packing and delivery', cell: (r) => money(r.cost.packing) },
  { key: 'transport', label: 'Transport', cell: (r) => money(r.cost.transport) },
  { key: 'rent', label: 'Rent', cell: (r) => money(r.cost.rent) },
  { key: 'writeOff', label: 'Equipment written off', cell: (r) => money(r.cost.writeOff) },
  { key: 'costs', label: 'Costs', cell: (r) => money(r.costs) },
  { key: 'profit', label: 'Profit a month', cell: (r) => (cents(r.profit) < 0 ? { text: moneyText(r.profit), tone: 'loss', sub: 'Loss' } : money(r.profit)) },
  { key: 'be', label: 'Break-even', cell: (r) => ({ text: !finite(r.be) ? DASH : beText(r.be) }) },
  { key: 'equipment', label: 'Equipment', cell: growOr((r) => money(r.equipment), () => ({ text: 'None' })) },
  { key: 'payback', label: 'Payback (equipment)', cell: growOr((r) => ({ text: cellMonths(r.payback) }), () => ({ text: 'No equipment' })) },
  { key: 'paybackAll', label: 'Payback (incl. first batch)', cell: growOr((r) => ({ text: cellMonths(r.paybackAll) }), () => ({ text: 'No equipment' })) },
];
// Every row with its cells, a column per result: [{ key, label, cells }].
export const rows = (results) => ROWS.map(({ key, label, cell }) => ({ key, label, cells: results.map(cell) }));

// The lines under the table.
export const fillLine = (yours, { room, blocks, first }) => `First batch: ${room}'s equipment, its first ${grouped(blocks, 0)}${NB}blocks `
  + `(${moneyText(yours.fill)}) and the costs until the first harvest, ${first}${NB}${first === 1 ? 'day' : 'days'} in (${moneyText(yours.rampCost)}).`;
export const sizedLine = (room, blocks) => `Every way is sized to ${room}'s ${grouped(blocks, 0)}${NB}blocks; a shed or a highland house holds up to ${grouped(HOUSE_BLOCKS, 0)}.`;
// When any growing way never pays back.
export const neverLine = (results, life) => (results.some((r) => r.kind === 'grow' && (r.payback === Infinity || r.paybackAll === Infinity))
  ? `Never: not ${within(life)}.` : null);
// The ways not compared for the crop (spec 8.4).
const LEFT_WORDS = {
  oyster: `Not compared: a highland grower (grey oyster isn't grown commercially there; it fruits best at 25${NB}°C and Cameron Highlands averages 17.9${NB}°C) and importing (fresh grey oyster keeps 3–4${NB}days and Malaysia grows its own).`,
  pink: `Not compared: a highland grower (too cool to pin: it needs 18–20${NB}°C) and importing (it keeps 1–4${NB}days; none is imported).`,
  woodear: `Not compared: a highland grower (growth slows sharply below 18${NB}°C).`,
  lionsmane: `Not compared: a lowland shed with the usual strain (it fruits at 18–24${NB}°C); the warm strain is the lowland shed for lion's mane.`,
};
export const leftLine = (crop) => (LEFT_WORDS[crop] ? keepTogether(LEFT_WORDS[crop]) : null);

// ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 9) The line under the table on Your container's labour: its
// share of the workers and what its blocks' handling takes of that share's hours; { text, tone } (warn when they take more),
// or null when its labour is the minutes a block (no workers figure).
export function labourLine(yours, room) {
  const h = yours.labourHours;
  if (!h) return null;
  const share = `${Math.round(h.share * 100)}${NB}%`;
  const workers = `${upTo(h.workers, 1)}${NB}${h.workers === 1 ? 'worker' : 'workers'}`;
  const lead = `Labour: ${room}’s share (${share}, by blocks) of ${workers} at ${moneyText(h.each)} a${NB}month.`;
  const needed = `${grouped(h.needed, 1)}${NB}h`;
  const there = `${grouped(h.there, 1)}${NB}h`;
  return h.needed > h.there
    ? { text: `${lead} Handling its blocks takes ${needed} a${NB}month, more than the ${there} that share gives.`, tone: 'warn' }
    : { text: `${lead} Handling its blocks takes ${needed} a${NB}month of the ${there} that share gives.` };
}

// ---- Economics stage 2 ---- (spec 2026-11-12-economics-stage-2-design.md 4.1) The month's tiles and the sticky line.
const capital = (t) => t[0].toUpperCase() + t.slice(1);
const sells = (r) => r.kgSold >= 0.05; // shows as more than 0.0 kg
const lossTone = (v) => (cents(v) < 0 ? 'loss' : null);

// The month's sentence for a reader (4.1): the headline and, when the month is capped by what you can sell, what it would make
// if all it grows sold (the review: the tiles are hidden from a reader, so the cap is said here, in words). uncapped: Your
// container's month with no cap; kgWeek: the limit in use.
export function readerSentence(h, results, { uncapped = null, kgWeek = null } = {}) {
  const head = [h.first.map((x) => (typeof x === 'string' ? x : x.text)).join(''), h.second];
  const yours = results[0];
  const cap = yours?.capped && uncapped
    ? keepTogether(`At what you can sell (${figureText('market.kgWeek', kgWeek)}); ${moneyText(uncapped.profit)} a${NB}month if all ${kgText(yours.kgGrown)} sold.`)
    : null;
  return [...head, cap].filter(Boolean).join(' ');
}

// results: compare's, Your container first; room: its name; crop: its key; type: the room's (its way's name); price: the
// selling price used; life: the months the equipment is written off over. → four tiles: [{ key, label, figure, tone,
// caption, captionTone, way?, wayKey? }] (tone 'loss': the critical text; the words always say it).
// uncapped: Your container's month with no sales cap (the owner, 2026-11-12: a capped month leads, the uncapped one its caption).
export function tilesOf(results, { room, crop, type = 'container', price, life, uncapped = null }) {
  const [yours, ...others] = results;
  const tile = (key, label, figure, caption, more = {}) => ({ key, label, figure, tone: null, caption, captionTone: null, ...more });
  const word = cents(yours.profit) < 0 ? 'Loss' : 'Profit';
  const profit = tile('profit', 'Profit a month', moneyText(yours.profit), yours.capped && uncapped
    ? `${word} at what you can sell · ${moneyText(uncapped.profit)} if all ${kgText(yours.kgGrown)} sold`
    : `${word} · ${room}, ${cropShortName(crop)}`, { tone: lossTone(yours.profit) });
  let be;
  if (!sells(yours) || !finite(yours.be)) be = tile('be', 'Break-even', DASH, 'Nothing sells at these figures.');
  else {
    const gap = cents(price - yours.be);
    const at = `You sell at ${perKgText(price)}`;
    be = tile('be', 'Break-even', beText(yours.be), gap === 0 ? `${at}, just at it.`
      : gap > 0 ? `${at}, ${perKgText(price - yours.be)} over it.` : `${at}, ${perKgText(yours.be - price)} short.`, { captionTone: gap < 0 ? 'loss' : null });
  }
  const never = yours.paybackAll === Infinity || !finite(yours.paybackAll);
  const payback = never
    ? tile('payback', 'Payback', 'Never', `Not within the ${life}${NB}months it is written off over`, { tone: 'loss' })
    : tile('payback', 'Payback', capital(monthsText(yours.paybackAll)), `With the first batch · equipment ${moneyText(yours.equipment)}`);
  const tiles = [profit, be, payback];
  if (others.length) {
    const best = others.reduce((a, b) => (cents(b.profit) > cents(a.profit) ? b : a));
    const diff = cents(best.profit) - cents(yours.profit);
    const caption = diff === 0 ? 'The same as yours'
      : `${moneyText(Math.abs(best.profit - yours.profit))} a${NB}month ${diff > 0 ? 'more' : 'less'} than yours`;
    tiles.push(tile('best', 'Best other way', moneyText(best.profit), caption, { tone: lossTone(best.profit), way: wayName(best.way, { type }), wayKey: best.way }));
  }
  return tiles;
}

// The sticky line (4.1): [text or { text, tone: 'loss' }], as headline's first.
export function stickyText(yours) {
  const figure = (v) => (cents(v) < 0 ? { text: moneyText(v), tone: 'loss' } : moneyText(v));
  if (!sells(yours)) return ['Nothing sells · ', figure(yours.profit), ` a${NB}month`];
  const be = ` a${NB}month · ${capital(BREAK_EVEN)} ${beText(yours.be)}`;
  return cents(yours.profit) < 0 ? ['Loss ', figure(yours.profit), be] : [`Profit ${moneyText(yours.profit)}${be}`];
}

// ---- Economics stage 2 ---- (4.2) Profit per way as diverging bars, in a fixed order; a way not compared keeps its row.
export const BAR_ORDER = ['yours', 'shed', 'highland', 'import', 'warm'];
export const SHORT_LEFT = {
  oyster: { highland: `it fruits best at 25${NB}°C`, import: `fresh grey oyster keeps 3${RANGE_DASH}4${NB}days` },
  pink: { highland: 'too cool to pin there', import: `it keeps 1${RANGE_DASH}4${NB}days; none is imported` },
  woodear: { highland: `growth slows below 18${NB}°C` },
  lionsmane: { shed: 'the warm strain is its lowland shed' },
};
// results: compare's; left: the view's ways not compared; crop: its key; type: the room's. → { zero, rows: [{ way, name,
// yours, compared, profit, text, tone, kind ('profit' | 'loss' | 'even'; null not compared), start, length, words, reason }] }:
// start and length as shares of the track, zero the share where zero sits.
export function barsOf(results, left, crop, type = 'container') {
  const shown = new Map(results.map((r) => [r.way, r]));
  const notCompared = new Set(left.map((l) => l.way));
  const loss = Math.max(0, ...results.map((r) => -r.profit));
  const gain = Math.max(0, ...results.map((r) => r.profit));
  const span = loss + gain;
  const zero = span > 0 ? loss / span : 0;
  const rows = BAR_ORDER.filter((w) => shown.has(w) || notCompared.has(w)).map((way) => {
    const name = wayName(way, { type });
    const base = { way, name, yours: way === 'yours' };
    if (!shown.has(way)) {
      const why = SHORT_LEFT[crop]?.[way] ?? 'not grown this way';
      return { ...base, compared: false, kind: null, reason: `Not compared: ${why}`, words: `${name}: not compared, ${why}` };
    }
    const { profit } = shown.get(way);
    const c = cents(profit);
    const kind = c > 0 ? 'profit' : c < 0 ? 'loss' : 'even';
    const length = kind === 'even' || span === 0 ? 0 : Math.abs(profit) / span;
    return {
      ...base, compared: true, profit, text: moneyText(profit), tone: kind === 'loss' ? 'loss' : null, kind,
      start: kind === 'loss' ? zero - length : zero, length,
      words: kind === 'even' ? `${name} breaks even` : `${name}, ${moneyText(profit)} a${NB}month ${kind}`,
    };
  });
  return { zero, rows };
}

// ---- Economics stage 2 ---- (4.4) On a phone: Your container beside one other way, picked with Compare with.
// → [{ way, name }]: the other shown ways, the best (as tile 4 says) first, then in their order.
export function compareChoices(results, type = 'container') {
  const others = results.slice(1);
  if (!others.length) return [];
  const best = others.reduce((a, b) => (cents(b.profit) > cents(a.profit) ? b : a));
  return [best, ...others.filter((r) => r !== best)].map((r) => ({ way: r.way, name: wayName(r.way, { type }) }));
}
export const phoneCaption = (a, b, type = 'container') => `A month: ${wayName(a, { type })} and ${wayName(b, { type })}`;
