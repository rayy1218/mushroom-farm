// The price × yield map (spec 2026-11-12-economics-stage-2-design.md 6): Your container's profit a month over 7 selling prices
// and 7 yields per good block around the figures now (−60 % to +60 % in 20 % steps, now in the centre), the rest held; a
// break-even price a row; what you can sell a week capping the kg sold (income and the per-kg costs on what sells, every other
// cost kept). Pure: no DOM, no fetch, no clock.
//   STEPS · capOf · cellOf · mapOf · cellText · cellLabel · lineWords · priceHead · yieldHead

import { grow, inputsOf, DAYS_A_MONTH } from './economics-model.js';
import { figureOf } from './economics-defaults.js';
import { figureText } from './economics-math.js';
import { moneyText, perKgText } from './costs-math.js';
import { kgText } from './harvest-math.js';
import { grouped } from './overview-math.js';

const NB = '\u00a0';
const MINUS = '\u2212';
const BREAK_EVEN = 'break\u2011even'; // never broken at its hyphen
const cents = (v) => Math.sign(v) * Math.round(Math.abs(v) * 100);
export const STEPS = [0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6];

// What you can sell a week as kg a month; null for no limit.
export const capOf = (kgWeek) => (typeof kgWeek === 'number' && Number.isFinite(kgWeek) ? (kgWeek * DAYS_A_MONTH) / 7 : null);

// One cell: Your container's month at that price and yield (the view's context too). → { profit, kgSold, grown, be, capped,
// tone }: be null with nothing sold; tone 'profit', 'loss' or 'even' as the figure shows.
export function cellOf(values, ctx, { price, yieldG, cap }) {
  // the model's own cap (the owner, 2026-11-12: one rule for the map and the month above it)
  const capCtx = cap === null || cap === undefined ? ctx : { ...ctx, sellCap: cap };
  const g = grow(inputsOf({ ...values, price, 'yours.yieldG': yieldG }, 'yours', capCtx));
  const c = cents(g.profit);
  return { profit: g.profit, kgSold: g.kgSold, grown: g.kgGrown, be: g.be, capped: g.capped, tone: c > 0 ? 'profit' : c < 0 ? 'loss' : 'even' };
}

// values: the page's figures now; ctx: the view's context; kgWeek: what you can sell a week (null: no limit).
// → { prices, yields (high first), rows: [[cell × 7] × 7], now: { row, col } or null, here, price, yieldG, line: [{ yieldG,
// be, off }], cap } or { none }. now: the cell at the figures now, null when the centre is clamped and they fall between the
// cells (a near cell would differ from the tiles: the review); here: the month at the figures now, always the tiles'.
export function mapOf(values, ctx, { kgWeek = null } = {}) {
  const price = values.price;
  const yieldG = values['yours.yieldG'];
  if (!(price > 0)) return { none: 'price' };
  if (!(yieldG > 0)) return { none: 'yield' };
  // the centre held at the limit ÷ 1.6, so the steps stay even (no column repeated); now a cell only when one is exactly it
  const top = STEPS.at(-1);
  const pc = Math.min(price, figureOf('price').max / top);
  const yc = Math.min(yieldG, figureOf('yours.yieldG').max / top);
  const prices = STEPS.map((s) => pc * s);
  const yields = STEPS.map((s) => yc * s).reverse();
  const nearest = (list, v) => list.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(list[best] - v) ? i : best), 0);
  const cap = capOf(kgWeek);
  const rows = yields.map((y) => prices.map((p) => cellOf(values, ctx, { price: p, yieldG: y, cap })));
  // a row's break-even does not hang on the price (profit is a straight line in it): its first cell's
  const line = yields.map((y, r) => {
    const { be } = rows[r][0];
    const off = be === null ? null : be < prices[0] ? 'left' : be > prices.at(-1) ? 'right' : null;
    return { yieldG: y, be, off };
  });
  const [row, col] = [nearest(yields, yieldG), nearest(prices, price)];
  const on = Math.abs(yields[row] - yieldG) < 0.005 && Math.abs(prices[col] - price) < 0.005;
  const here = on ? rows[row][col] : cellOf(values, ctx, { price, yieldG, cap });
  return { prices, yields, rows, now: on ? { row, col } : null, here, price, yieldG, line, cap };
}

// A cell's words: the profit in whole RM on a desk (the heads say RM a month), a sign on a phone.
export function cellText(cell, { phone = false } = {}) {
  const c = cents(cell.profit);
  if (phone) return c > 0 ? '+' : c < 0 ? MINUS : '0';
  const whole = Math.round(Math.abs(cell.profit));
  return `${whole !== 0 && cell.profit < 0 ? MINUS : ''}${grouped(whole, 0)}`;
}

const blockYield = (y) => `${figureText('yours.yieldG', y)} a${NB}block`;
// A cell's label (a reader's, and the picked cell's line).
export function cellLabel(cell, price, yieldG) {
  const at = `${perKgText(price)} a${NB}kg and ${blockYield(yieldG)}`;
  if (!(cell.kgSold >= 0.05)) return `${at}: ${moneyText(cell.profit)} a${NB}month, nothing sold.`;
  const sold = cell.capped ? `${kgText(cell.kgSold)} sold of ${kgText(cell.grown)} grown (what you can sell)` : `${kgText(cell.kgSold)} sold`;
  return `${at}: ${moneyText(cell.profit)} a${NB}month, ${sold}, ${BREAK_EVEN} ${perKgText(cell.be)} a${NB}kg.`;
}

// The column and row heads: "RM 20" ("RM 20.50"), a phone's "20"; "250 g".
export function priceHead(p, { phone = false } = {}) {
  const whole = Number.isInteger(Math.round(p * 100) / 100);
  if (phone) { // at most one place: seven heads fit 360 px (the UI check)
    const one = Math.round(p * 10) / 10;
    return Number.isInteger(one) ? grouped(one, 0) : grouped(one, 1);
  }
  return `RM${NB}${whole ? grouped(Math.round(p), 0) : grouped(p, 2)}`;
}
export const yieldHead = (y) => figureText('yours.yieldG', y);

// The lines under the grid: the break-even at your yield, and where the line leaves the grid.
export function lineWords(map) {
  const out = [];
  out.push(map.here.be === null ? 'At your yield nothing sells.'
    : `${BREAK_EVEN[0].toUpperCase()}${BREAK_EVEN.slice(1)} at your yield (${yieldHead(map.yieldG)}): ${perKgText(map.here.be)} a${NB}kg.`);
  // no cell is now (the centre clamped): now's month in words, as the tiles have it
  if (!map.now) out.push(`Now, at ${perKgText(map.price)} a${NB}kg and ${blockYield(map.yieldG)}, falls between the cells: ${moneyText(map.here.profit)} a${NB}month.`);
  const last = map.line.length - 1;
  const right = map.line.map((l, i) => [l, i]).filter(([l]) => l.off === 'right');
  if (right.length) {
    const [l, i] = right[0]; // the highest yield off to the right
    out.push(`At ${blockYield(l.yieldG)}${i === last ? ' it' : ' and under it'} breaks even only above ${perKgText(map.prices.at(-1))} a${NB}kg.`);
  }
  const left = map.line.map((l, i) => [l, i]).filter(([l]) => l.off === 'left');
  if (left.length) {
    const [l, i] = left.at(-1); // the lowest yield off to the left
    out.push(`At ${blockYield(l.yieldG)}${i === 0 ? ' it' : ' and over it'} breaks even below ${perKgText(map.prices[0])} a${NB}kg.`);
  }
  // the rows that grow more than you can sell: they all earn the same (the UI check)
  const capped = map.rows.map((row, i) => [row[0].capped, i]).filter(([c]) => c);
  if (capped.length) {
    const [, i] = capped.at(-1); // the lowest yield capped
    out.push(`From ${blockYield(map.yields[i])} you grow more than you can sell (${figureText('market.kgWeek', (map.cap * 7) / DAYS_A_MONTH)}): those rows earn the same.`);
  }
  return out;
}
