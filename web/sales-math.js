// The Sales page's pure parts (spec 2026-11-05-sales-design.md 3 and 6): the one formatter (RM and kg through Harvest's),
// the tiles, a delivery's row and the tables, the Record dialog's line totals, price pre-fill, unlikely-value check and
// body, the Delete confirm's words, and the myGAP 4-6 sheet's sale rows.

import { cropShortName } from './crops.js';
import { DOT } from './text-math.js';
import { farmDate, dayMonth, daysFrom } from './tasks-math.js';
import { kgText, rmText, sheetRows, periodWords, whenMs } from './harvest-math.js';

const NB = ' ';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// A price over this many times the crop's expected price is asked about once (a slipped decimal point).
export const UNLIKELY_TIMES = 3;
// A line over this many kg is asked about once (a slipped decimal point).
export const UNLIKELY_KG = 500;
// The server's bounds (server/sales-math.js): a line's kg over 0 up to this, RM per kg 0 up to MAX_PRICE.
const MAX_KG = 10_000;
const MAX_PRICE = 1_000;
// A real number, not NaN or a string.
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
// A box's value: 2 places, no thousands comma.
const two = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }); // a box's value
// The sheet's figure: 2 places, grouped.
const sheet2 = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // the sheet's figures, grouped as Harvest's
// A box's text as a number: a decimal comma is read ('4,5'), a grouped '1,234' is refused as ambiguous, NaN when it is no number.
export const num = (text) => {
  const s = String(text ?? '').trim();
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return NaN;
  const t = s.replace(',', '.');
  return /^(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
};

// RM per kg (or any RM figure) as Harvest writes it; a dash when missing.
export const priceText = (v) => rmText(v);

// Whole farm days from a sale to now: "today", "1 day", "12 days".
export function ageText(ms, now) {
  const days = daysFrom(farmDate(ms), farmDate(now));
  return days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
}

const shortDay = (ms) => {
  const date = farmDate(ms);
  return `${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${dayMonth(date)}`;
};

// One line in words: "Grey oyster 12.00 kg".
const lineWords = (l) => `${cropShortName(l.crop)} ${kgText(l.kg, { exact: true })}`;

// A line each in words, the parts the page keeps whole (no break inside a crop's name): ["Grey oyster 12.00 kg", …].
export const lineParts = (lines) => lines.map(lineWords);

// "Grey oyster 12.00 kg · Pink oyster 4.50 kg"
export const linesShort = (lines) => lineParts(lines).join(DOT);

// The paid mark as text ("Unpaid" or "Paid 9 Nov"), with a flag so the unpaid one is styled by more than colour.
export const paidMark = (d) => (d.paidAt === null || d.paidAt === undefined
  ? { text: 'Unpaid', unpaid: true }
  : { text: `Paid ${dayMonth(farmDate(d.paidAt)).replace(' ', NB)}`, unpaid: false });

// A delivery's row on the page: day, buyer, lines in short, total, paid mark, reference.
export const deliveryRow = (d) => ({
  day: shortDay(d.soldAt), buyer: d.buyer, lines: linesShort(d.lines), total: rmText(d.total), paid: paidMark(d), reference: d.invoiceNo ?? '',
});

// Sold (of harvested), Income, Owed (all time: said when the oldest unpaid sale is before the period).
export function pageTiles(sales, now) {
  const { totals, owed } = sales;
  const before = owed.oldestAt !== null && farmDate(owed.oldestAt) < sales.from;
  // nothing owed: "Nothing owed" when the period has no sales either, else "All paid"
  const owedLine = owed.count === 0 ? (totals.count === 0 ? 'Nothing owed' : 'All paid')
    : `${before ? `all time${DOT}` : ''}${owed.count} ${owed.count === 1 ? 'sale' : 'sales'}${DOT}oldest ${ageText(owed.oldestAt, now)}`;
  return [
    // no "of 0.0 kg harvested" when nothing was harvested in the period
    totals.harvestedKg > 0 ? { label: 'Sold', value: kgText(totals.kg), line: `of ${kgText(totals.harvestedKg)} harvested` } : { label: 'Sold', value: kgText(totals.kg) },
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

// The by-crop table's rows: the cells, the average price against the expected one in words, and the sold kg as the
// name's sub-line (a phone, where the Sold column is left out).
export const cropRows = (sales) => (sales.byCrop ?? []).map((c) => ({
  crop: c.crop, name: cropShortName(c.crop),
  cells: [kgText(c.kg), kgText(c.harvestedKg), rmText(c.total), rmText(c.avgPriceKg), rmText(c.expectedPriceKg)],
  diff: diffText(c.avgPriceKg, c.expectedPriceKg),
  sub: `${kgText(c.kg)} sold`,
}));

// The by-buyer table's rows: name, the cells, and the kg as the name's sub-line (a phone, where the kg column is left out).
export const buyerRows = (sales) => (sales.byBuyer ?? []).map((b) => ({ name: b.buyer, cells: [kgText(b.kg), rmText(b.total), rmText(b.owed)], sub: kgText(b.kg) }));

// The empty page's words for the period.
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
      out.push({ field: `lines.${i}.priceKg`, message: `That's ${times === '3.0' ? 'over 3' : times} times the expected ${rmText(expected)} per kg. Is ${rmText(l.priceKg)} right?` });
    }
    if (l.kg > UNLIKELY_KG) out.push({ field: `lines.${i}.kg`, message: `Is ${kgText(l.kg, { exact: true })} right?` });
    return out;
  });
}

// The POST/PUT body from the dialog's boxes (an edit passes the sale's soldAt: its time stays while its date does): { date, buyerId, invoiceNo, note, lines: [{ crop, kg, priceKg, roomId }] } (all
// text). Today's date is now; another day is 12:00 at the farm. The server's bounds are checked here too (kg, RM per kg) so
// the unlikely-value question is never asked about a value that would be refused. → the body, or { error, field }.
export function saleBody(v, { now, soldAt: was = null }) {
  const noon = whenMs(v.date, '12:00');
  if (Number.isNaN(noon) || farmDate(noon) !== v.date) return { error: 'Give the date', field: 'date' };
  if (!/^[1-9]\d*$/.test(String(v.buyerId ?? ''))) return { error: 'Pick a buyer', field: 'buyerId' };
  const soldAt = was !== null && v.date === farmDate(was) ? was : v.date === farmDate(now) ? now : noon;
  const lines = [];
  for (const [i, l] of (v.lines ?? []).entries()) {
    const kg = num(l.kg);
    if (Number.isNaN(kg)) return { error: 'Give the kg as a number', field: `lines.${i}.kg` };
    if (!(kg > 0 && kg <= MAX_KG)) return { error: 'kg must be over 0 up to 10,000', field: `lines.${i}.kg` };
    const priceKg = num(l.priceKg);
    if (Number.isNaN(priceKg)) return { error: 'Give RM per kg as a number', field: `lines.${i}.priceKg` };
    if (priceKg > MAX_PRICE) return { error: 'RM per kg must be 0 to 1,000', field: `lines.${i}.priceKg` };
    lines.push({ crop: l.crop, kg, priceKg, roomId: l.roomId ? Number(l.roomId) : null });
  }
  const text = (s) => (String(s ?? '').trim() || null);
  return { soldAt, buyerId: Number(v.buyerId), invoiceNo: text(v.invoiceNo), note: text(v.note), lines };
}

// The Delete confirm's title.
export const deleteTitle = (d) => `Delete the sale of ${dayMonth(farmDate(d.soldAt))} to ${d.buyer}?`;
// The Delete confirm's lead: the total and the lines.
export const deleteLead = (d) => `${rmText(d.total)}${DOT}${d.lines.map(lineWords).join(', ')}.`;

// The myGAP 4-6 sheet's rows: Harvest's rows (sheetRows) and the sale lines together by date, a day's harvest rows first
// then its sale lines by time. A sale row: Date, Crop, Block / location (the room and run as Harvest's, or "Mixed"),
// Harvested blank, Sold, Price / kg, Total, Invoice No., Buyer.
export function sheetWithSales(records, lines) {
  const list = Array.isArray(records) ? records : [];
  const harvest = sheetRows(list).map((cells, i) => ({ date: list[i].date, kind: 0, at: 0, index: i, cells }));
  const sales = (Array.isArray(lines) ? lines : []).map((l, i) => {
    const [base] = sheetRows([{ date: l.date, roomName: l.roomName ?? '', crop: l.crop, runStartedAt: l.runStartedAt, kg: null }]);
    const where = !l.roomName ? 'Mixed' : l.runStartedAt === null || l.runStartedAt === undefined ? l.roomName : base[2];
    return { date: l.date, kind: 1, at: l.soldAt, index: i, cells: [base[0], base[1], where, '', sheet2(l.kg), sheet2(l.priceKg), sheet2(l.total), l.invoiceNo ?? '', l.buyer] };
  });
  return [...harvest, ...sales].sort((a, b) => a.date.localeCompare(b.date) || a.kind - b.kind || a.at - b.at || a.index - b.index).map((r) => r.cells);
}

// The sheet's Total row: harvested kg, sold kg and the RM total ('' when the sales could not be read: lines null).
export function sheetTotals(farm, lines) {
  const harvested = finite(farm?.totals?.kg) ? sheet2(farm.totals.kg) : '';
  if (!Array.isArray(lines)) return { harvested, sold: '', total: '' };
  const sold = lines.reduce((s, l) => s + l.kg, 0);
  const total = lines.reduce((s, l) => s + l.total, 0);
  return { harvested, sold: sheet2(Math.round(sold * 100) / 100), total: sheet2(Math.round(total * 100) / 100) };
}
