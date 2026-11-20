// Data integrity on the Harvest tab (spec 2026-11-12-data-integrity-design.md 6.1 and 11), pure: a harvest's void and edited
// marks, a run's Not sold records as its card lists them, and the line said for a record just made (its Undo's minute). Apart
// from web/harvest-math.js, which web/changes-math.js reads while it loads.

import { cropShortName } from './crops.js';
import { DOT } from './text-math.js';
import { farmDate, farmTime, dayMonth } from './tasks-math.js';
import { kgText } from './harvest-math.js';
import { voidLine, REASON_WORDS } from './changes-math.js';

const NB = '\u00a0';
const when = (ms) => `${dayMonth(farmDate(ms)).replace(' ', NB)} ${farmTime(ms)}`; // "10 Nov 16:20", as a harvest's row
const reasonOf = (r) => (REASON_WORDS[r.reason] ?? r.reason).toLowerCase();

// A harvest's marks: { voided: "Voided 10 Nov by Lim: Weighed with the crate" or '', edited }.
export const harvestMarks = (h) => ({ voided: voidLine(h.voided), edited: (h.edits ?? 0) > 0 });

// A run's Not sold record: { kg: "12.00 kg", text: "spoiled · Aminah · 10 Nov 16:20" (a mixed room: "Lion's mane, rejected by
// the buyer · …"), voided, edited }.
export function notSoldLine(r, { mixed = false } = {}) {
  const why = mixed ? `${cropShortName(r.crop)}, ${reasonOf(r)}` : reasonOf(r);
  return { kg: kgText(r.kg, { exact: true }), text: [why, r.worker, when(r.at)].filter(Boolean).join(DOT), voided: voidLine(r.voided), edited: (r.edits ?? 0) > 0 };
}

// The line for its minute after a record: "12.00 kg of Grey oyster recorded not sold (spoiled)".
export const notSoldSaid = (r) => `${kgText(r.kg, { exact: true })} of ${cropShortName(r.crop)} recorded not sold (${reasonOf(r)})`;
