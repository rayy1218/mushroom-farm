// Pure helpers for the long-range charts and the machine timeline (no DOM, so they can be tested in Node).
// Spec 2026-10-19-safety-and-history-design.md section 6 (Charts, Machine timeline).

const pad2 = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// The range choice over the charts; hours is what /history takes (null: the live polls).
export const RANGES = [
  { key: 'live', label: 'Live', hours: null },
  { key: '1h', label: '1 h', hours: 1 },
  { key: '6h', label: '6 h', hours: 6 },
  { key: '24h', label: '24 h', hours: 24 },
  { key: '7d', label: '7 d', hours: 168 },
  { key: '30d', label: '30 d', hours: 720 },
];

export const rangeOf = (key) => RANGES.find((r) => r.key === key) ?? RANGES[0];

// The timeline rows, in the order of the Machines card.
export const TIMELINE_ROWS = [
  { key: 'intake', label: 'Intake' },
  { key: 'exhaust', label: 'Exhaust' },
  { key: 'circulation', label: 'Circulation' },
  { key: 'humidifier', label: 'Humidifier' },
  { key: 'dehumidifier', label: 'Dehumidifier', fitted: true },
  { key: 'lights', label: 'Lights', fitted: true },
  { key: 'ac', label: 'Aircon' },
];

// The timeline rows of a room: what is wired (relay machines need the relay address, the aircon its gateway) and, for
// the dehumidifier and the lights, fitted (the room field of the same name).
export function wiredTimelineRows(room) {
  return TIMELINE_ROWS.filter((r) => (r.key === 'ac' ? room?.acAddress != null : room?.relayAddress != null && (!r.fitted || room[r.key] === true)));
}

const TICK_STEPS = [MIN, 2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, 3 * DAY, 7 * DAY];

// "10:42" for a time today, "12 Oct 10:42" for another day (local time).
export function formatStamp(ms, now = Date.now()) {
  const d = new Date(ms);
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return d.toDateString() === new Date(now).toDateString() ? clock : `${d.getDate()} ${MONTHS[d.getMonth()]} ${clock}`;
}

// What a long-range chart was drawn from besides the data: when this key and the data object are unchanged,
// the 5 s refresh need not redraw (a redraw drops the hover). room carries the wired addresses of the timeline rows.
export const chartDrawKey = (bands, sensors, room) =>
  `${bands ? JSON.stringify(bands) : ''}/${sensors.trh.status}/${sensors.co2.status}/${room?.relayAddress ?? null}/${room?.acAddress ?? null}/${room?.dehumidifier === true}/${room?.lights === true}`;

// How many axis labels fit a chart of this pixel width: about one per 90 px.
export const tickCountFor = (width) => Math.max(2, Math.floor(width / 90));

// Axis ticks across [from, to] on round local times: the smallest step that gives at most maxTicks.
// Steps of a day or more are labelled with the date ("13 Oct"), the others with the time of day ("09:30").
export function timeTicks(from, to, maxTicks) {
  if (!(to > from)) return [];
  const step = TICK_STEPS.find((s) => (to - from) / s <= maxTicks) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const offset = new Date(from).getTimezoneOffset() * MIN; // round to local midnight, not UTC
  const ticks = [];
  for (let t = Math.ceil((from - offset) / step) * step + offset; t <= to; t += step) {
    const d = new Date(t);
    ticks.push({ at: t, label: step >= DAY ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : `${pad2(d.getHours())}:${pad2(d.getMinutes())}` });
  }
  return ticks;
}

// Chart points from /history rows ({ at, ...fields }): a gap of more than 3 buckets gets a null point in its middle
// so the line breaks there. bucketS is the reply's bucket size in seconds; pollSeconds the reading interval (up to 300 s),
// because buckets cannot be denser than the readings: the limit is 3 x the larger of the two.
export function historyPoints(rows, field, bucketS, pollSeconds = 0) {
  const limit = Math.max(bucketS, pollSeconds) * 3000;
  const points = [];
  let prev = null;
  for (const r of rows ?? []) {
    if (!Number.isFinite(r[field])) continue;
    if (prev !== null && r.at - prev > limit) points.push({ at: (prev + r.at) / 2, value: null });
    points.push({ at: r.at, value: r[field] });
    prev = r.at;
  }
  return points;
}

// The stretches with no readings ([{ from, to }]): the same rule as historyPoints' line breaks (more than three buckets, or
// three polls, between two rows). Every chart of the History tab leaves them empty, so a gap reads as one gap.
export function readingGaps(rows, bucketS, pollSeconds = 0) {
  const limit = Math.max(bucketS, pollSeconds) * 3000;
  const gaps = [];
  let prev = null;
  for (const r of rows ?? []) {
    if (prev !== null && r.at - prev > limit) gaps.push({ from: prev, to: r.at });
    prev = r.at;
  }
  return gaps;
}

const inGap = (from, to, gaps) => gaps.some((g) => from >= g.from && to <= g.to);

// The usage bars outside the gaps: a bar wholly inside a gap is dropped (the app was off: it is not a measured amount).
export const barsOutsideGaps = (bars, gaps) => (gaps.length ? bars.filter((b) => !inGap(b.from, b.to, gaps)) : bars);

// The timeline's spans cut where a gap is (a machine left "on" while the app was off is not known to have run).
export function spansOutsideGaps(spans, gaps) {
  if (!gaps.length) return spans;
  const out = [];
  for (const sp of spans) {
    let pieces = [{ from: sp.from, to: sp.to }];
    for (const g of gaps) {
      pieces = pieces.flatMap((p) => (p.to <= g.from || p.from >= g.to ? [p]
        : [...(p.from < g.from ? [{ from: p.from, to: g.from }] : []), ...(p.to > g.to ? [{ from: g.to, to: p.to }] : [])]));
    }
    out.push(...pieces.map((p) => ({ ...p, source: sp.source })));
  }
  return out;
}

// The bars of a timeline row from a machine's log lines (the first is at the window start): [{ from, to, source }]
// for the times it was commanded on. The last state runs to `to`; a change of source while on starts a new bar.
export function timelineSpans(rows, from, to) {
  const spans = [];
  let open = null;
  for (const r of rows ?? []) {
    if (open && (!r.on || r.source !== open.source)) {
      spans.push({ from: open.from, to: Math.max(open.from, r.at), source: open.source });
      open = null;
    }
    if (r.on && !open) open = { from: Math.max(from, r.at), source: r.source };
  }
  if (open) spans.push({ from: open.from, to: Math.max(open.from, to), source: open.source });
  return spans;
}

// The labels of the aircon row: where it turns on or its setpoint changes, [{ at, text }].
export function acMarks(rows) {
  const marks = [];
  let setpoint = null; // the setpoint while it is on
  for (const r of rows ?? []) {
    if (!r.on) { setpoint = null; continue; }
    if (r.setpoint !== setpoint) marks.push({ at: r.at, text: `${r.setpoint} °C`, value: r.setpoint });
    setpoint = r.setpoint;
  }
  return marks;
}

// Where a mark's label goes: 3 px right of the mark at x, or 3 px left of it (ending there) when it would run past
// right. The width is estimated (0.6 em per character), so a phone's narrow chart keeps the last label whole.
export function markLabel(x, text, right, fontPx = 11) {
  const width = String(text).length * fontPx * 0.6;
  return x + 3 + width > right ? { x: x - 3, anchor: 'end' } : { x: x + 3, anchor: 'start' };
}

// The timeline's labels for a row's marks ([{ at, text, value }], value in °C): marks closer than minPx to the one before
// make a run, labelled once at its start: one mark its text, two "20 → 16 °C", more "16–20 °C, switching" (a setpoint that
// alternates faster than labels fit must not print a tidy pattern that did not happen). A single mark that says the setpoint
// the last label ended at, or a label that would run over the last one, is left out. → [{ at, x, anchor, text }] (markLabel's placement, `right` the edge).
export function markRuns(marks, xOf, right, { minPx = 52, fontPx = 12 } = {}) {
  const runs = [];
  let prev = -Infinity;
  for (const m of marks ?? []) {
    const x = xOf(m.at);
    if (runs.length && x - prev < minPx) runs.at(-1).push(m);
    else runs.push([m]);
    prev = x;
  }
  const out = [];
  let end = -Infinity;
  let lastText = null; // the words the last label ended at: a run's last mark
  for (const run of runs) {
    const values = run.map((m) => m.value);
    const differ = new Set(run.map((m) => m.text)).size > 1;
    const text = !differ ? run[0].text
      : run.length === 2 ? `${values[0]} → ${values[1]} °C`
        : `${Math.min(...values)}–${Math.max(...values)} °C, switching`;
    if (!differ && run[0].text === lastText) continue;
    const at = run[0].at;
    const place = markLabel(xOf(at), text, right, fontPx);
    const width = text.length * fontPx * 0.6;
    const start = place.anchor === 'start' ? place.x : place.x - width;
    if (start < end + 6) continue;
    out.push({ at, ...place, text });
    end = start + width;
    lastText = run.at(-1).text;
  }
  return out;
}
