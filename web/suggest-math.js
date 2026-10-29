// Pure helpers for the Suggest machines page (no DOM, so they can be tested in Node). Owner 2026-10-28: Suggest machines is
// the buying decision ("numbers decide the business"), so its page ranks the setups by the money they cost a month, shows five
// columns (the rest in each row's details) and says in words whether each reaches the goal.

import { acSize, keepUnits } from './simulation-math.js';
import { estimateLines } from './simulate-math.js';
import { formatKWh, formatRM, formatLitres } from './usage-math.js';

const DASH = '—';
const MONTH_DAYS = 30;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (v) => (finite(v) ? `${v.toFixed(1)} %` : DASH);
const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

// The heads of the table's columns (the last is Use this).
export const COLUMNS = ['Setup', 'In band (all three)', 'RM per month', 'Cools down in', ''];

// The prices of GET /api/settings: { electricity, water } (RM per kWh, RM per m³), null for a price not known.
export function pricesOf(settings) {
  return {
    electricity: finite(settings?.electricityPrice) ? settings.electricityPrice : null,
    water: finite(settings?.waterPrice) ? settings.waterPrice : null,
  };
}

// A setup's use over a month: the search's `runDays` scaled to 30. → { kWh, litres, energyRM, waterRM, rm } (the money null
// without its price; rm is electricity and, with a water price, water).
export function monthly(c, runDays, prices) {
  const scale = MONTH_DAYS / runDays;
  const kWh = (finite(c?.kWh) ? c.kWh : 0) * scale;
  const litres = (finite(c?.litres) ? c.litres : 0) * scale;
  const energyRM = finite(prices?.electricity) ? kWh * prices.electricity : null;
  const waterRM = finite(prices?.water) ? (litres / 1000) * prices.water : null;
  return { kWh, litres, energyRM, waterRM, rm: energyRM === null ? null : energyRM + (waterRM ?? 0) };
}

export const moneyHead = (prices) => (finite(prices?.electricity) ? 'RM per month' : 'Energy per month');

const QUANTITIES = [['t', 'temperature', 'Temperature'], ['rh', 'humidity', 'Humidity'], ['co2', 'CO₂', 'CO₂']];
const listed = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

// Whether a setup reaches the goal: temperature, humidity and CO₂ each in band for the target's share of the time, and a
// cool-down within the longest allowed (a result from before the cool-down check: the target alone). → { reached, tone, text }
// in words (State-Only Colour: the tone colours the words, never a tick alone).
export function verdictOf(c, result) {
  const target = result?.target;
  const maxH = finite(result?.coolDownMaxH) ? result.coolDownMaxH : null;
  const under = QUANTITIES.filter(([k]) => !(finite(c?.inBand?.[k]) && c.inBand[k] >= target));
  const cools = maxH === null || (finite(c?.coolDownH) && c.coolDownH <= maxH);
  if (under.length === 0 && cools) {
    return { reached: true, tone: 'good', text: `Reaches ${target} %${maxH === null ? '' : ` and cools down in ${c.coolDownH.toFixed(1)} h`}` };
  }
  const misses = [];
  if (under.length) misses.push(`${listed(under.map(([k, name]) => `${name} ${pct(c?.inBand?.[k])}`))} in band, under ${target} %`);
  if (!cools) misses.push(finite(c?.coolDownH) ? `cools down in ${c.coolDownH.toFixed(1)} h, over ${maxH} h` : 'does not cool down in a day');
  return { reached: false, tone: 'amber', text: `Misses: ${misses.join('; ')}` };
}

// A setup's machines in words: ['Fan 150 m³/h', 'aircon 2.6 kW (9,000 BTU/h class)', 'humidifier 0.5 L/h', 'no dehumidifier'].
export const machineParts = (m) => [`Fan ${m.fanFlow} m³/h`, `aircon ${acSize(Number(m.acBTU))}`, `humidifier ${m.humidifierLH} L/h`,
  Number(m.dehumidifierLday) > 0 ? `dehumidifier ${m.dehumidifierLday} L/day` : 'no dehumidifier'];

// One evaluated setup (a row of result.best, or result.baseline) as the texts of a row: { index, verdict, setupParts, inBand,
// money, cost, coolDown, details }.
function rowOf(c, index, result, prices) {
  const runDays = finite(result?.days) && result.days > 0 ? result.days : 1;
  const m = monthly(c, runDays, prices);
  const ac = c.machines ?? {};
  const details = [
    ...QUANTITIES.map(([k, , label]) => ({ label: `${label} in band`, value: pct(c.inBand?.[k]) })),
    { label: 'Energy', value: `${formatKWh(c.kWh)} in ${days(runDays)} · ${formatKWh(m.kWh)} a month` },
    { label: 'Water (humidifier)', value: `${formatLitres(c.litres ?? 0)} in ${days(runDays)} · ${formatLitres(m.litres)} a month` },
    ...(finite(c.removedLitres) && c.removedLitres > 0 ? [{ label: 'Water taken out (dehumidifier)', value: `${formatLitres(c.removedLitres)} in ${days(runDays)}` }] : []),
    ...(m.energyRM === null ? [] : [{ label: 'Money a month', value: `${formatRM(m.energyRM)} electricity${m.waterRM === null ? ' (no water price set)' : ` + ${formatRM(m.waterRM)} water`}` }]),
    ...(finite(c.exchangeMaxMin) ? [{ label: 'Air exchange time limit', value: `${c.exchangeMaxMin} min` }] : []),
    ...(finite(c.control?.acDrop) ? [{ label: 'Aircon during air exchange', value: c.control.acDrop > 0 ? `${c.control.acDrop} °C lower` : 'not lowered' }] : []),
    ...(typeof c.control?.humidifierDuringExchange === 'boolean' ? [{ label: 'Humidifier during air exchange', value: c.control.humidifierDuringExchange ? 'on' : 'off' }] : []),
  ];
  return {
    index,
    verdict: verdictOf(c, result),
    setupParts: machineParts(ac),
    inBand: pct(c.inBand?.all),
    money: m.rm === null ? formatKWh(m.kWh) : formatRM(m.rm),
    cost: m.rm ?? m.kWh,
    coolDown: !finite(result?.coolDownMaxH) ? DASH : finite(c.coolDownH) ? `${c.coolDownH.toFixed(1)} h` : 'not in a day',
    details,
  };
}

// result.best as the page's rows, ranked by money: the setups that reach the goal cheapest a month first (by energy without
// prices), then the others in the search's order (those that only miss the cool-down, quickest first; then the closest).
// index: the row's place in result.best (for Use this); rank: its place on the page.
export function suggestRows(result, prices) {
  const best = Array.isArray(result?.best) ? result.best : [];
  const rows = best.map((c, index) => rowOf(c, index, result, prices));
  const reached = rows.filter((r) => r.verdict.reached).sort((a, b) => a.cost - b.cost || a.index - b.index);
  return [...reached, ...rows.filter((r) => !r.verdict.reached)].map((r, i) => ({ ...r, rank: i + 1 }));
}

// result.baseline (the room's machines as they are, owner 2026-10-29) as a row like the suggestions' (no rank), or null.
export const baselineRow = (result, prices) => (result?.baseline ? rowOf(result.baseline, null, result, prices) : null);

// The line over the rows.
export function captionOf(result, count) {
  const best = `the best ${count === 1 ? 'setup' : `${count} setups`} over ${days(result.days)}${count === 1 ? '' : ', in order'}`;
  return result?.baseline ? `What the room has now, then ${best}` : best.charAt(0).toUpperCase() + best.slice(1);
}

// The machines the room has now, for the baseline: as Simulate's step 1 starts from them (simulate-math.js).
export { roomMachines } from './simulate-math.js';

// What the page says the search does (its head; on a desk, the side column's first part).
export const SEARCH_LINE = 'The search tries fan, aircon, humidifier and dehumidifier sizes for these crops, walls and weather, and lists the five best setups: those that reach the goal first, the cheapest a month first.';

// The side column of the page on a desk (critique 2026-10-29b: the right half of 1440 px was empty beside the form): how the
// search works, what the room has now (with how it did in the last search) and where that search started.
// now: roomMachines'; result: the last search's, or null. → [{ title, lines, verdict ({ tone, text, money }) or null, list (the
// lines are a list) }]
export function asideSections({ now, result = null, prices = null }) {
  const base = result ? baselineRow(result, prices) : null;
  const sections = [
    { title: 'How the search works', lines: [SEARCH_LINE, "It starts from sizes worked out for the room's volume, walls, weather and crops, and simulates those around them; the room's own machines are tried first, as the baseline."], verdict: null },
    { title: 'What the room has now', lines: [machineParts(now.machines).join(' · '), now.from],
      verdict: base ? { tone: base.verdict.tone, text: base.verdict.text, money: `${base.money} a month` } : null },
  ];
  const start = estimateLines(result?.estimate);
  if (start.length) sections.push({ title: 'Where the search started', lines: start, verdict: null, list: true });
  return sections.map((x) => ({ ...x, lines: x.lines.map(keepUnits), verdict: x.verdict && { ...x.verdict, text: keepUnits(x.verdict.text) } }));
}

// What the money column is made of, under the table.
export function priceLine(prices, runDays) {
  const scaled = `the ${days(runDays)} of the search scaled to ${MONTH_DAYS}.`;
  if (!finite(prices?.electricity)) return `The prices could not be read: the setups are ranked by energy, ${scaled}`;
  return finite(prices.water)
    ? `RM per month: electricity at ${formatRM(prices.electricity)} per kWh and water at ${formatRM(prices.water)} per m³ (Settings), ${scaled}`
    : `RM per month: electricity at ${formatRM(prices.electricity)} per kWh (Settings; no water price set), ${scaled}`;
}

// When no setup reaches the goal: a line that says so (null when one does, or there are none).
export function noneReachedLine(result, rows) {
  if (rows.length === 0 || rows.some((r) => r.verdict.reached)) return null;
  return `No setup reached ${result.target} %${finite(result.coolDownMaxH) ? ` and cooled down within ${result.coolDownMaxH} h` : ''}.`;
}
