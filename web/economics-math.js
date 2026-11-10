// The Economics page's words for the comparison (spec 2026-11-06-economics-design.md 8.2–8.4, 8.7): the headline, the rows
// of "A month, each way", the lines under it, the months and a figure with its unit. Pure: the results are the model's
// (web/economics-model.js compare), every RM through Costs' formatter and every kg through Harvest's (the One Format Rule).
//   monthsText · figureText · rangeText · wayName · headline · ROWS · rows · fillLine · sizedLine · neverLine · leftLine

import { moneyText, perKgText } from './costs-math.js';
import { kgText } from './harvest-math.js';
import { grouped } from './overview-math.js';
import { cropShortName } from './crops.js';
import { figureOf, WAY_NAMES } from './economics-defaults.js';
import { HOUSE_BLOCKS } from './economics-model.js';

const NB = '\u00a0'; // a number keeps its unit at a wrap (the Units Rule)
const DASH = '—';
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const cents = (v) => Math.sign(v) * Math.round(Math.abs(v) * 100); // a figure as it shows, its sign decided as moneyText decides it
const beText = (v) => `${perKgText(v)} a${NB}kg`;
const upTo = (v, places) => v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: places });

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
    case 'RM/kWh': return [`RM${NB}`, v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }), `${NB}a${NB}kWh`];
    case 'g': return ['', grouped(Math.round(v), 0), `${NB}g`];
    case 'kWh': return ['', grouped(v, 2), `${NB}kWh`];
    case 'kWh a month': return ['', upTo(v, 1), `${NB}kWh a${NB}month`];
    case '%': return ['', upTo(v, 1), `${NB}%`];
    case 'days': return ['', grouped(v, 0), `${NB}${plural('day', 'days')}`];
    case 'min': return ['', grouped(v, 2), `${NB}min`];
    case 'hours a day': return ['', upTo(v, 1), `${NB}${plural('hour', 'hours')} a${NB}day`];
    case 'months': return ['', grouped(v, 0), `${NB}${plural('month', 'months')}`];
    case 'blocks': return ['', grouped(v, 0), `${NB}${plural('block', 'blocks')}`];
    default: return ['', grouped(v, 0), `${NB}${plural('flush', 'flushes')}`]; // flushes per block
  }
}
// "250 g", "RM 55.00 a kg", "42 days", "2 flushes"; a dash without a number.
export function figureText(key, v) {
  if (!finite(v)) return DASH;
  return parts(key, v).join('');
}
// A research range: "150–400 g", "RM 8.00–13.00 a kg".
export function rangeText(key, low, high) {
  if (!finite(low) || !finite(high)) return DASH;
  const [before, a, after] = parts(key, low);
  return `${before}${a}–${parts(key, high)[1]}${after}`;
}

// A way's name: as a column head, or in a sentence ("A highland grower", lower-cased after a comma).
const IN_A_SENTENCE = { shed: 'A lowland shed', highland: 'A highland grower', import: 'Importing and reselling', warm: 'A warm strain in a lowland shed' };
export const wayName = (way, { sentence = false, lower = false } = {}) => {
  const name = sentence ? IN_A_SENTENCE[way] : WAY_NAMES[way];
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
    first = [`${name}: `, loss(yours.profit), ` a${NB}month loss, break-even ${beText(yours.be)}, never pays back.`];
  } else {
    const pays = yours.paybackAll === Infinity
      ? `but it doesn't pay back ${within(life)}.`
      : `pays back in ${monthsText(yours.paybackAll)}.`;
    first = [`${name}: ${moneyText(yours.profit)} a${NB}month, break-even ${beText(yours.be)}, ${pays}`];
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
const growOr = (grow, trade) => (r) => (r.kind === 'trade' ? trade(r) : grow(r));
export const ROWS = [
  { key: 'blocks', label: 'Blocks started a month', cell: growOr((r) => ({ text: grouped(Math.round(r.blocksM), 0) }), (r) => ({ text: `${kgText(r.kgBought)} bought` })) },
  { key: 'kg', label: 'kg sold a month', cell: (r) => ({ text: kgText(r.kgSold) }) },
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
  { key: 'payback', label: 'Pays back, equipment only', cell: growOr((r) => ({ text: monthsText(r.payback) }), () => ({ text: 'No equipment' })) },
  { key: 'paybackAll', label: 'Pays back, with the first fill', cell: growOr((r) => ({ text: monthsText(r.paybackAll) }), () => ({ text: 'No equipment' })) },
];
// Every row with its cells, a column per result: [{ key, label, cells }].
export const rows = (results) => ROWS.map(({ key, label, cell }) => ({ key, label, cells: results.map(cell) }));

// The lines under the table.
export const fillLine = (yours, { room, blocks, first }) => `With the first fill: ${room}'s equipment, its first ${grouped(blocks, 0)}${NB}blocks `
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
export const leftLine = (crop) => LEFT_WORDS[crop] ?? null;
