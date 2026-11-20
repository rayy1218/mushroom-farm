// Settings' Electricity tariff card (spec 2026-11-12-data-integrity-design.md 8.1), pure: the rates as rows (From · To ·
// Rate · AFA · RM per kWh · Note, newest first, as GET /api/tariffs gives them), a rate's body from its dialog's boxes, and
// the void confirm's words. web/tariff-card.js draws them.

import { longDayText } from './inventory-math.js';
import { voidLine } from './changes-math.js';

const NB = ' ';
const MINUS = '−';
const DASH = '—';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^-?[0-9]{1,2}(\.[0-9]{1,4})?$/; // up to 4 decimals (the bill's sen to two places of a sen)
export const MAX_RATE = 10; // server/tariffs.js
export const MAX_AFA = 1;
export const MAX_NOTE = 200;

const day = (d) => longDayText(d).replace(/ /g, NB); // "1 Oct 2026", never broken inside
const four = (n) => (Number.isFinite(n) ? n.toFixed(4) : DASH);
const signed = (n) => (!Number.isFinite(n) ? DASH : n > 0 ? `+${four(n)}` : n < 0 ? `${MINUS}${four(-n)}` : four(0));

// The card's rows: { id, from, to, rate, afa, price, note, voided (its words, or ''), edited, mayVoid, first }. To: "to 30 Sep
// 2026", the last "and on"; a voided rate holds no days ("—").
export const tariffRows = (list) => list.map((r) => ({
  id: r.id, from: day(r.from), to: r.voided ? DASH : r.to ? `to ${day(r.to)}` : 'and on',
  rate: four(r.rate), afa: signed(r.afa), price: four(r.price), note: r.note ?? '',
  voided: voidLine(r.voided), edited: (r.edits ?? 0) > 0, mayVoid: !r.voided && !r.first, first: r.first === true,
}));

// A dialog's boxes { from, rate, afa, note } → { body: { from, rate, afa, note } }, or { field, message } for the first wrong
// box. A decimal comma reads as a point; an empty AFA is 0.
export function rateBody(v) {
  const from = String(v.from ?? '').trim();
  if (!DAY.test(from)) return { field: 'from', message: 'Pick the first day of the rate' };
  const read = (text) => {
    const s = String(text ?? '').trim().replace(/^([^,.]*),([^,.]*)$/, '$1.$2');
    return DECIMAL.test(s) ? Number(s) : NaN;
  };
  const rate = read(v.rate);
  if (!(rate >= 0 && rate <= MAX_RATE)) return { field: 'rate', message: `Type the rate in RM per kWh, 0 to ${MAX_RATE}, up to 4 decimals` };
  const afaText = String(v.afa ?? '').trim();
  const afa = afaText === '' ? 0 : read(afaText);
  if (!(afa >= -MAX_AFA && afa <= MAX_AFA)) return { field: 'afa', message: `Type the AFA in RM per kWh, ${MINUS}${MAX_AFA} to ${MAX_AFA} (a rebate below 0), or leave it empty` };
  const note = String(v.note ?? '').trim();
  if (note.length > MAX_NOTE) return { field: 'note', message: `A note is at most ${MAX_NOTE} characters` };
  return { body: { from, rate, afa, note } };
}

// The void confirm: "Void the rate from 1 Oct 2026?"; its lead.
export const rateVoidTitle = (r) => `Void the rate from ${day(r.from)}?`;
export const RATE_VOID_LEAD = 'Its days take the rate before it.';
