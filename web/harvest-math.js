// The Harvest page's pure parts (spec 2026-11-04-harvest-design.md 7): the one formatter for kg, kg per block, BE and RM,
// the Crop tab's summary line, the flush table's columns and the myGAP sheet's rows. Every formatter shows a dash for a
// missing figure (null, undefined, not a number) rather than throwing. A number keeps its unit at a wrap (a no-break
// space, as web/text-math.js and the Units Rule have it) and a '·' joins with DOT.

import { CROPS } from './crops.js';
import { DOT } from './text-math.js';
import { farmDate } from './tasks-math.js';

const NB = ' ';
const DASH = '—';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const grouped = (n, min, max = min) => n.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });

// Totals to 1 decimal ("18.4 kg"); one harvest (exact) up to 2 ("2.35 kg", "2 kg").
export function kgText(v, { exact = false } = {}) {
  if (!finite(v)) return DASH;
  return `${exact ? grouped(v, 0, 2) : grouped(v, 1)}${NB}kg`;
}

export const perBlockText = (v) => (finite(v) ? `${grouped(v, 2)}${NB}kg per block` : DASH);
export const beText = (v) => (finite(v) ? `BE ${grouped(v, 0)}${NB}%` : DASH);
export const rmText = (v) => (finite(v) ? `RM${NB}${grouped(v, 2)}` : DASH);

// "RM 3.10 per kg · electricity and water over 46 days at today’s prices".
export function costText({ costPerKg, days, water } = {}) {
  if (!finite(costPerKg)) return DASH;
  const over = finite(days) ? ` over ${days}${NB}${days === 1 ? 'day' : 'days'}` : '';
  return `${rmText(costPerKg)} per${NB}kg${DOT}${water ? 'electricity and water' : 'electricity'}${over} at today’s prices`;
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
  const perCrop = keys.length > 1 ? keys.map((k) => `${CROPS[k]?.name ?? k} kg`) : [];
  return ['Flush', 'Days', ...perCrop, 'kg', 'kg per block', 'BE'];
}

// "2026-11-03" → "3 Nov 2026".
function longDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : DASH;
}

// The myGAP sheet: one row per harvest, the sales cells left blank for the farmer.
// harvests: [{ date, roomName, crop, runStartedAt (ms), kg }]; the run's day is the farm's (UTC+8).
export function sheetRows(harvests) {
  return (Array.isArray(harvests) ? harvests : []).map((h) => {
    const run = finite(h.runStartedAt) ? longDate(farmDate(h.runStartedAt)).split(' ').slice(0, 2).join(' ') : DASH;
    return [longDate(h.date), CROPS[h.crop]?.name ?? String(h.crop ?? ''), `${h.roomName} · run of ${run}`, finite(h.kg) ? String(h.kg) : '', '', '', '', '', ''];
  });
}
