// Inventory's one formatter and the pages' pure parts (spec 2026-11-05-inventory-design.md 5): a qty with its unit, RM, the
// price per unit, a farm day; the pills, the words and the dialogs' bodies (below). A number keeps its unit at a wrap (a
// no-break space, as the Units Rule has it). server/inventory-alerts.js uses the formatter for its messages.

const NB = ' ';
const DASH = '—';
const MINUS = '−';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const grouped = (n, min, max = min) => n.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });

// The units counted in whole numbers (kg and L take 2 decimals): as server/inventory-math.js WHOLE_UNITS.
export const WHOLE_UNITS = ['pcs', 'g', 'mL', 'blocks'];
// "per piece", "per block"; the others by their symbol.
const ONE = { pcs: 'piece', blocks: 'block' };

// "3.50 L", "120 pcs", "−2.00 L"; signed: "+5.00 L" for an in-move. A figure that shows as 0 has no sign.
export function qtyText(qty, unit, { signed = false } = {}) {
  if (!finite(qty)) return DASH;
  const places = WHOLE_UNITS.includes(unit) ? 0 : 2;
  const shown = grouped(Math.abs(qty), places);
  const zero = Number(shown.replace(/,/g, '')) === 0;
  const sign = zero ? '' : qty < 0 ? MINUS : signed ? '+' : '';
  return `${sign}${shown}${NB}${unit}`;
}

// "RM 1,240.50".
export const rmText = (v) => (finite(v) ? `RM${NB}${grouped(v, 2)}` : DASH);

// What one unit cost: "RM 8.33 per L"; under RM 0.10 its first two significant digits up to 4 decimals ("RM 0.0035 per
// mL"), under RM 0.0001 "under RM 0.0001 per g", as Harvest's cost per kg. '' without a qty.
export function perUnitText(total, qty, unit) {
  if (!finite(total) || !finite(qty) || qty <= 0 || total < 0) return '';
  const p = total / qty;
  const per = `per${NB}${ONE[unit] ?? unit}`;
  if (p > 0 && p < 0.0001) return `under${NB}RM${NB}0.0001 ${per}`;
  const text = p === 0 || p >= 0.1 ? grouped(p, 2) : grouped(p, 2, Math.min(4, 1 - Math.floor(Math.log10(p))));
  return `RM${NB}${text} ${per}`;
}

const dateParts = (date) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
// "12 Nov" and "12 Nov 2026" from 'YYYY-MM-DD'.
export function dayText(date) {
  const m = dateParts(date);
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : DASH;
}
export function longDayText(date) {
  const m = dateParts(date);
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : DASH;
}
