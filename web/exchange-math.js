// Pure helpers for the "Air exchange" section of the Charts tab (no DOM, so they can be tested in Node).
// Spec 2026-10-26-usage-charts-design.md section 4. An exchange is a run of the intake fan as the machine log has it
// (commanded on → off; the exchange switches the intake and the exhaust together). Hours and days are local.

import { formatStamp } from './history-math.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN = 60_000;

// The section's switch; hours is the history range its data comes from.
export const ACTIVITY_MODES = [
  { key: 'hourly', label: 'Hourly', hours: 24 },
  { key: 'daily', label: 'Daily', hours: 720 },
];

// The local hour or day holding `ms`, and the one after a start.
const startOf = (ms, step) => {
  const d = new Date(ms);
  if (step === 'day') d.setHours(0, 0, 0, 0);
  else d.setMinutes(0, 0, 0);
  return d.getTime();
};
const next = (start, step) => {
  const d = new Date(start);
  if (step === 'day') d.setDate(d.getDate() + 1);
  else d.setHours(d.getHours() + 1);
  return d.getTime();
};

// { from, to, step } of a mode: the last 24 local hours or 30 local days up to now, the running one included.
export function activityRange(now, mode) {
  const step = mode === 'daily' ? 'day' : 'hour';
  const d = new Date(startOf(now, step));
  if (step === 'day') d.setDate(d.getDate() - 29);
  else d.setHours(d.getHours() - 23);
  return { from: d.getTime(), to: now, step };
}

// The runs of the intake from its log rows [{ at, on }] (oldest first): [{ start, end }]; one still on runs to `to`.
export function exchangeRuns(rows, to) {
  const runs = [];
  let start = null;
  for (const r of rows ?? []) {
    if (r.on && start === null) start = r.at;
    else if (!r.on && start !== null) {
      runs.push({ start, end: r.at });
      start = null;
    }
  }
  if (start !== null) runs.push({ start, end: Math.max(start, to) });
  return runs;
}

// The local hours or days (step 'hour' | 'day') from the one holding `from` to `to`: [{ at, end, starts, minutes }]. A run's
// start counts in the bucket it started in (none for a run on before `from`); its minutes in every bucket it covers.
export function exchangeActivity(rows, from, to, step) {
  const buckets = [];
  for (let s = startOf(from, step); s < to; s = next(s, step)) buckets.push({ at: s, end: Math.min(next(s, step), to), starts: 0, minutes: 0 });
  for (const run of exchangeRuns(rows, to)) {
    for (const b of buckets) {
      if (run.start >= b.at && run.start < b.end && run.start >= from) b.starts++;
      const ms = Math.min(run.end, b.end) - Math.max(run.start, b.at, from);
      if (ms > 0) b.minutes += ms / MIN;
    }
  }
  return buckets;
}

// { exchanges, minutes, longest } over [from, to]: the runs started inside, the minutes run inside, the longest run inside.
export function activityTotals(rows, from, to) {
  let exchanges = 0, minutes = 0, longest = 0;
  for (const run of exchangeRuns(rows, to)) {
    const ms = Math.min(run.end, to) - Math.max(run.start, from);
    if (ms <= 0 && run.start < from) continue;
    if (run.start >= from && run.start <= to) exchanges++;
    minutes += Math.max(0, ms) / MIN;
    longest = Math.max(longest, Math.max(0, ms) / MIN);
  }
  return { exchanges, minutes, longest };
}

// "35 min", "2 h 35 min", "2 h" (whole minutes).
export function formatMinutes(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

const exchangesWord = (n) => `${n} ${n === 1 ? 'exchange' : 'exchanges'}`;

// "24 h: 41 exchanges, 2 h 35 min in all · longest 10 min" (Daily: "30 days: …").
export function activityTotalsText(t, mode) {
  const head = mode === 'daily' ? '30 days' : '24 h';
  if (t.exchanges === 0 && t.minutes === 0) return `${head}: no exchanges`;
  return `${head}: ${exchangesWord(t.exchanges)}, ${formatMinutes(t.minutes)} in all · longest ${formatMinutes(t.longest)}`;
}

// The tooltip of a bar: "14:00  3 exchanges" (another day: "19 Oct 14:00 …"), "12 Oct  1 h 15 min". field: 'starts' | 'minutes'.
export function activityTip(bucket, mode, field, now = Date.now()) {
  const d = new Date(bucket.at);
  const when = mode === 'daily' ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : formatStamp(bucket.at, now);
  return `${when}  ${field === 'starts' ? exchangesWord(bucket.starts) : formatMinutes(bucket.minutes)}`;
}
