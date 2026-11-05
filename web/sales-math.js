// The Sales page's pure parts (spec 2026-11-05-sales-design.md 3 and 6): the one formatter (RM and kg through Harvest's),
// the tiles, a delivery's row and the tables, the Record dialog's line totals, price pre-fill, unlikely-value check and
// body, the Delete confirm's words, and the myGAP 4-6 sheet's sale rows.

import { cropShortName } from './crops.js';
import { DOT } from './text-math.js';
import { farmDate, dayMonth } from './tasks-math.js';
import { kgText, rmText, sheetRows, periodWords } from './harvest-math.js';

const NB = ' ';
const DASH = '—';
const DAY_MS = 86_400_000;
const FARM_OFFSET_MS = 8 * 3_600_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const UNLIKELY_TIMES = 3;
export const UNLIKELY_KG = 500;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const two = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }); // a box's value
const sheet2 = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // the sheet's figures, grouped as Harvest's
const num = (text) => {
  const t = String(text ?? '').trim().replace(',', '.');
  return t === '' || !/^\d*\.?\d+$/.test(t) ? NaN : Number(t);
};

export const priceText = (v) => rmText(v);

// Whole farm days from a sale to now: "today", "1 day", "12 days".
export function ageText(ms, now) {
  const days = Math.round((Date.parse(farmDate(now)) - Date.parse(farmDate(ms))) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
}

const shortDay = (ms) => {
  const date = farmDate(ms);
  return `${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${dayMonth(date)}`;
};

// "Grey oyster 12.00 kg · Pink oyster 4.50 kg"
export const linesShort = (lines) => lines.map((l) => `${cropShortName(l.crop)} ${kgText(l.kg, { exact: true })}`).join(DOT);

export const paidMark = (d) => (d.paidAt === null || d.paidAt === undefined
  ? { text: 'Unpaid', unpaid: true }
  : { text: `Paid ${dayMonth(farmDate(d.paidAt)).replace(' ', NB)}`, unpaid: false });

export const deliveryRow = (d) => ({
  day: shortDay(d.soldAt), buyer: d.buyer, lines: linesShort(d.lines), total: rmText(d.total), paid: paidMark(d), reference: d.invoiceNo ?? '',
});

// Sold (of harvested), Income, Owed (all time: said when the oldest unpaid sale is before the period).
export function pageTiles(sales, now) {
  const { totals, owed } = sales;
  const before = owed.oldestAt !== null && ageText(owed.oldestAt, now) !== 'today'
    && Math.round((Date.parse(farmDate(now)) - Date.parse(farmDate(owed.oldestAt))) / DAY_MS) >= sales.days;
  const owedLine = owed.count === 0 ? 'All paid'
    : `${before ? `all time${DOT}` : ''}${owed.count} ${owed.count === 1 ? 'sale' : 'sales'}${DOT}oldest ${ageText(owed.oldestAt, now)}`;
  return [
    { label: 'Sold', value: kgText(totals.kg), line: `of ${kgText(totals.harvestedKg)} harvested` },
    { label: 'Income', value: rmText(totals.total) },
    { label: 'Owed', value: rmText(owed.total), line: owedLine },
  ];
}

export const CROP_COLUMNS = ['Crop', 'Sold', 'Harvested', 'Income', 'Average RM per kg', 'Expected RM per kg'];
export const BUYER_COLUMNS = ['Buyer', 'kg', 'Income', 'Owed'];

// The average price against the expected one, in words (no colour verdict); null when either is missing.
function diffText(avg, expected) {
  if (!finite(avg) || !finite(expected)) return null;
  const d = Math.round((avg - expected) * 100) / 100;
  if (Math.abs(d) < 0.005) return 'as expected';
  return `${rmText(Math.abs(d))} ${d < 0 ? 'under' : 'over'} expected`;
}

export const cropRows = (sales) => (sales.byCrop ?? []).map((c) => ({
  crop: c.crop, name: cropShortName(c.crop),
  cells: [kgText(c.kg), kgText(c.harvestedKg), rmText(c.total), rmText(c.avgPriceKg), rmText(c.expectedPriceKg)],
  diff: diffText(c.avgPriceKg, c.expectedPriceKg),
}));

export const buyerRows = (sales) => (sales.byBuyer ?? []).map((b) => ({ name: b.buyer, cells: [kgText(b.kg), rmText(b.total), rmText(b.owed)] }));

export const emptyText = (days) => `No sales in the last ${periodWords(days)}.`;

// A line's total as typed ('' until both boxes read as numbers).
export function lineTotal(kg, priceKg) {
  const [k, p] = [num(kg), num(priceKg)];
  return Number.isNaN(k) || Number.isNaN(p) ? '' : rmText(Math.round(k * p * 100) / 100);
}

// The dialog's foot: the lines' kg and total ("16.50 kg · RM 214.50"), the lines that read as numbers.
export function footText(lines) {
  const ok = lines.map((l) => [num(l.kg), num(l.priceKg)]).filter(([k, p]) => !Number.isNaN(k) && !Number.isNaN(p));
  const kg = ok.reduce((s, [k]) => s + k, 0);
  const total = ok.reduce((s, [k, p]) => s + Math.round(k * p * 100) / 100, 0);
  return `${kgText(kg, { exact: true })}${DOT}${rmText(total)}`;
}

// RM per kg for a crop's line: the buyer's usual price, else the expected price (marked), else empty.
export function prefill(crop, buyer, cropYield) {
  const own = buyer?.prices?.[crop];
  if (finite(own)) return { value: two(own), expected: false };
  const expected = cropYield?.[crop]?.priceKg;
  if (finite(expected)) return { value: two(expected), expected: true };
  return { value: '', expected: false };
}

// The questions asked once (not refusals): RM per kg over 3 times the crop's expected price, kg over 500.
export function unlikely(lines, cropYield) {
  return lines.flatMap((l, i) => {
    const out = [];
    const expected = cropYield?.[l.crop]?.priceKg;
    if (finite(expected) && expected > 0 && l.priceKg > UNLIKELY_TIMES * expected) {
      const times = (Math.round((l.priceKg / expected) * 10) / 10).toFixed(1);
      out.push({ field: `lines.${i}.priceKg`, message: `That's ${times} times the expected ${rmText(expected)} per kg. Is ${rmText(l.priceKg)} right?` });
    }
    if (l.kg > UNLIKELY_KG) out.push({ field: `lines.${i}.kg`, message: `Is ${kgText(l.kg, { exact: true })} right?` });
    return out;
  });
}

// The POST/PUT body from the dialog's boxes: { date, buyerId, invoiceNo, note, lines: [{ crop, kg, priceKg, roomId }] } (all
// text). Today's date is now; another day is 12:00 at the farm. → the body, or { error, field }.
export function saleBody(v, { now }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date ?? '')) return { error: 'Give the date', field: 'date' };
  if (!/^[1-9]\d*$/.test(String(v.buyerId ?? ''))) return { error: 'Pick a buyer', field: 'buyerId' };
  const soldAt = v.date === farmDate(now) ? now : Date.parse(`${v.date}T12:00:00Z`) - FARM_OFFSET_MS;
  const lines = [];
  for (const [i, l] of (v.lines ?? []).entries()) {
    const kg = num(l.kg);
    if (Number.isNaN(kg)) return { error: 'Give the kg as a number', field: `lines.${i}.kg` };
    const priceKg = num(l.priceKg);
    if (Number.isNaN(priceKg)) return { error: 'Give RM per kg as a number', field: `lines.${i}.priceKg` };
    lines.push({ crop: l.crop, kg, priceKg, roomId: l.roomId ? Number(l.roomId) : null });
  }
  const text = (s) => (String(s ?? '').trim() || null);
  return { soldAt, buyerId: Number(v.buyerId), invoiceNo: text(v.invoiceNo), note: text(v.note), lines };
}

export const deleteTitle = (d) => `Delete the sale of ${dayMonth(farmDate(d.soldAt))} to ${d.buyer}?`;
export const deleteLead = (d) => `${rmText(d.total)}${DOT}${d.lines.map((l) => `${cropShortName(l.crop)} ${kgText(l.kg, { exact: true })}`).join(', ')}.`;

// The myGAP 4-6 sheet's rows: Harvest's rows (sheetRows) and the sale lines together by date, a day's harvest rows first
// then its sale lines by time. A sale row: Date, Crop, Block / location (the room and run as Harvest's, or "Mixed"),
// Harvested blank, Sold, Price / kg, Total, Invoice No., Buyer.
export function sheetWithSales(records, lines) {
  const list = Array.isArray(records) ? records : [];
  const harvest = sheetRows(list).map((cells, i) => ({ date: list[i].date, kind: 0, at: i, cells }));
  const sales = (Array.isArray(lines) ? lines : []).map((l, i) => {
    const [base] = sheetRows([{ date: l.date, roomName: l.roomName ?? '', crop: l.crop, runStartedAt: l.runStartedAt, kg: null }]);
    const where = l.roomName ? base[2] : 'Mixed';
    return { date: l.date, kind: 1, at: l.soldAt * 1000 + i, cells: [base[0], base[1], where, '', sheet2(l.kg), sheet2(l.priceKg), sheet2(l.total), l.invoiceNo ?? '', l.buyer] };
  });
  return [...harvest, ...sales].sort((a, b) => a.date.localeCompare(b.date) || a.kind - b.kind || a.at - b.at).map((r) => r.cells);
}

// The sheet's Total row: harvested kg, sold kg and the RM total ('' when the sales could not be read: lines null).
export function sheetTotals(farm, lines) {
  const harvested = finite(farm?.totals?.kg) ? sheet2(farm.totals.kg) : '';
  if (!Array.isArray(lines)) return { harvested, sold: '', total: '' };
  const sold = lines.reduce((s, l) => s + l.kg, 0);
  const total = lines.reduce((s, l) => s + l.total, 0);
  return { harvested, sold: sheet2(Math.round(sold * 100) / 100), total: sheet2(Math.round(total * 100) / 100) };
}
