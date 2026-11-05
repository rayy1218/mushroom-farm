// The Tasks tab's grid, its pure parts (spec 2026-11-04-task-grid-design.md 2, 2.1, 4 and 5; no DOM, so they can be tested in
// Node): the week and the month shown, the columns (the room's daily rules), the boxes (days × columns) pivoted from GET
// /api/calendar's items and today's rows of GET /api/rooms/:id/tasks (they carry the ids), the workers' initials, the rules'
// short names, a box in words for a screen reader and the month sheet's rows. Days are the farm's ('YYYY-MM-DD').

import { farmTime, amountText, taskParts } from './tasks-math.js';
import { dayTitle } from './calendar-math.js';
import { taskPicture } from './pictures-data.js';
import { DOT } from './text-math.js';

const DAY_MS = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const SLOTS = ['morning', 'afternoon', 'any'];
const OWN = 'custom:';
const MAX_NAME = 24;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const utc = (date) => Date.parse(`${date}T00:00:00Z`);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date, n) => iso(utc(date) + n * DAY_MS);
const chars = (s) => Array.from(String(s ?? ''));

// The daily rules in the order the server makes a day's rows (task-rules.js effectiveRules: clear out, then DAILY_RULES), each
// with its short name (spec 2.1); the owner's own rules (custom:<id>) follow by id. A test keeps this order the server's.
export const SHORT_NAMES = {
  clearOut: 'Clear out',
  contamWalk: 'Contamination walk',
  colonisedCheck: 'Colonisation check',
  openBags: 'Open the bags',
  casingApply: 'Casing',
  reishiForm: 'Reishi form',
  humidifierCheck: 'Humidifier',
  harvestAm: 'Harvest AM',
  harvestPm: 'Harvest PM',
  harvestDaily: 'Harvest',
  reishiRim: 'Reishi rim',
  scrapeRecap: 'Scrape and recap',
  reopen: 'Reopen the bags',
  footbath: 'Footbath',
  floorClean: 'Floor',
};
export const RULE_ORDER = Object.keys(SHORT_NAMES);

export const LEGEND = ['✓ done (initials)', '✗ missed', '— skipped', 'shaded: not due'].join(DOT);

// A Done or Skip can be undone this long after it (the server's UNDO_WINDOW_MS; the server has the last word).
export const UNDO_MS = 60_000;

// ---- the week and the month ----

// The week of any day: Monday to Sunday. → { from, to, days: [7 dates] }
export function weekOf(date) {
  const from = addDays(date, -((new Date(utc(date)).getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return { from, to: days[6], days };
}

// The Monday n weeks from the week of `date` (‹ and ›).
export const shiftWeek = (date, n) => addDays(weekOf(date).from, 7 * n);

// The grid's head: "2–8 November 2026", "30 November – 6 December 2026", "28 December 2026 – 3 January 2027".
export function weekTitle({ from, to }) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const end = `${td} ${MONTHS[tm - 1]} ${ty}`;
  if (fy !== ty) return `${fd} ${MONTHS[fm - 1]} ${fy} – ${end}`;
  if (fm !== tm) return `${fd} ${MONTHS[fm - 1]} – ${end}`;
  return `${fd}–${end}`;
}

// The days of a month ('YYYY-MM', or a date: its month): the 1st to the last. → { from, to, days }
export function monthDays(month) {
  const m = String(month).slice(0, 7);
  const from = `${m}-01`;
  const days = [];
  for (let d = from; d.startsWith(m); d = addDays(d, 1)) days.push(d);
  return { from, to: days.at(-1), days };
}

// ---- names ----

// A column's name (spec 2.1): a built-in rule's short name; an own rule's text cut to 24 characters with "…"; a rule this page
// does not know yet, the name part of its text (tasks-math taskParts), cut the same way.
export function shortName(ruleKey, text = '') {
  if (Object.hasOwn(SHORT_NAMES, ruleKey ?? '')) return SHORT_NAMES[ruleKey];
  const words = String(ruleKey ?? '').startsWith(OWN) ? String(text ?? '').trim() : taskParts(text).name;
  const c = chars(words);
  return c.length <= MAX_NAME ? words : `${c.slice(0, MAX_NAME - 1).join('').trimEnd()}…`;
}

// The workers' initials (spec 2): two words or more, the first letters of the first two ("Ali Lee" → "AL"); one word, its first
// two letters ("Sara" → "SA"); upper case. Names that would share initials each show the first name cut to 4 letters as
// written ("Aliy", "Ali"). names: the week's workers and the workers' list (blanks and repeats, case aside, are one).
// → Map name → what its boxes show
export function initialsFor(names) {
  const given = (names ?? []).map((n) => (typeof n === 'string' ? n.trim() : '')).filter(Boolean);
  const people = new Map(); // lower case → the name as first written
  for (const name of given) if (!people.has(name.toLowerCase())) people.set(name.toLowerCase(), name);
  const first = (name) => name.split(/\s+/);
  const initials = (name) => {
    const w = first(name);
    return (w.length >= 2 ? chars(w[0])[0] + chars(w[1])[0] : chars(w[0]).slice(0, 2).join('')).toUpperCase();
  };
  const count = new Map();
  for (const name of people.values()) count.set(initials(name), (count.get(initials(name)) ?? 0) + 1);
  const label = (name) => (count.get(initials(name)) > 1 ? chars(first(name)[0]).slice(0, 4).join('') : initials(name));
  // every spelling given finds its person's label
  return new Map(given.map((name) => [name, label(people.get(name.toLowerCase()))]));
}

// ---- columns ----

const isDaily = (i) => i?.kind === 'daily' && typeof i.ruleKey === 'string';
const slotOf = (i) => (SLOTS.includes(i.slot) ? i.slot : 'any');
const keyOf = (i) => `${i.ruleKey}|${slotOf(i)}`;
const ownId = (key) => Number(key.slice(OWN.length));
// Built-in rules in RULE_ORDER, then a rule this page does not know (by key), then own rules by id; a rule's slots in order.
function rank(ruleKey) {
  if (ruleKey.startsWith(OWN)) return [2, Number.isFinite(ownId(ruleKey)) ? ownId(ruleKey) : Infinity, ruleKey];
  const i = RULE_ORDER.indexOf(ruleKey);
  return i >= 0 ? [0, i, ''] : [1, 0, ruleKey];
}
function byRule(a, b) {
  const [ga, na, ka] = rank(a.ruleKey);
  const [gb, nb, kb] = rank(b.ruleKey);
  return ga - gb || na - nb || ka.localeCompare(kb) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);
}

// The grid's columns (spec 2): every daily rule with a row or a planned item on one of the days (a rule in two slots, two
// columns), in the rules' order. days: the calendar reply's [{ date, items }]; todayRows: today's rows of the room tasks reply.
// Stage starts, upkeep and long-term items are not the grid's. → [{ key, ruleKey, slot, shortName, text, unit, picture }]
// (text and unit: the latest day's, as an own rule's words may have changed)
export function gridColumns(days, todayRows = []) {
  const cols = new Map();
  const add = (i) => {
    if (!isDaily(i)) return;
    const key = keyOf(i);
    const prev = cols.get(key);
    cols.set(key, { key, ruleKey: i.ruleKey, slot: slotOf(i), text: i.text ?? prev?.text ?? '', unit: i.unit ?? prev?.unit ?? null });
  };
  for (const r of todayRows ?? []) add(r); // made at midnight: a planned day's words (the rule's now) come after them
  for (const d of [...(days ?? [])].sort((a, b) => a.date.localeCompare(b.date))) for (const i of d.items ?? []) add(i);
  return [...cols.values()].sort(byRule).map((c) => ({
    key: c.key, ruleKey: c.ruleKey, slot: c.slot, shortName: shortName(c.ruleKey, c.text), text: c.text, unit: c.unit,
    picture: taskPicture({ kind: 'daily', ruleKey: c.ruleKey }),
  }));
}

// ---- boxes ----

const KINDS = ['done', 'missed', 'skipped', 'cancelled', 'open', 'planned'];
// When a day has two items of a column (a row and a planned item), the box shows the first of these.
const PRIORITY = ['open', 'done', 'skipped', 'missed', 'planned', 'cancelled'];

// A done box's figure alone (its column says the unit): "2.4" (kg, 2 decimals at most), "3" (bags); '' without an amount.
export function boxAmount(row) {
  return finite(row?.amount) ? row.amount.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
}

const byAt = (row) => `${row?.worker ? ` by ${row.worker}` : ''}${finite(row?.closedAt) ? ` at ${farmTime(row.closedAt)}` : ''}`;

// A box in words, the name a screen reader says (spec 5): "Footbath, Wednesday 4 November: done by Sara at 08:12, 2.4 kg",
// "…: missed", "…: skipped by Sara at 09:00: No water", "…: cancelled: Stage changed", "…: not due", "…: open", "…: planned"
// (an estimate over a stage change: "planned, dates estimated from the stage plan"). today: "Today, " before today's date.
export function boxWords(column, date, cell, today = null) {
  const r = cell?.row ?? null;
  let what;
  switch (cell?.kind) {
    case 'done': what = ['done' + byAt(r), amountText(r)].filter(Boolean).join(', '); break;
    case 'skipped': what = ['skipped' + byAt(r), r?.reason ?? ''].filter(Boolean).join(': '); break;
    case 'cancelled': what = ['cancelled', r?.reason ?? ''].filter(Boolean).join(': '); break;
    case 'planned': what = cell.about ? 'planned, dates estimated from the stage plan' : 'planned'; break;
    case 'missed': case 'open': what = cell.kind; break;
    default: what = 'not due';
  }
  return `${column.shortName}, ${dayTitle(date, today)}: ${what}`;
}

// Whether a box's Done or Skip can still be undone at `now` (ms): today's closed row (it has an id) closed UNDO_MS ago or less.
export function canUndo(cell, now) {
  return (cell?.kind === 'done' || cell?.kind === 'skipped') && cell.taskId != null && finite(cell.row?.closedAt) && now - cell.row.closedAt <= UNDO_MS;
}

// A box's long-press menu (spec 3): Skip… on today's open row, Undo on a Done or Skip it can still undo, Details on any box
// that holds a row; none on a box not due or planned. → ['skip' | 'undo' | 'details']
export function menuItems(cell, now) {
  if (!cell || cell.kind === 'none' || cell.kind === 'planned') return [];
  return [cell.kind === 'open' && cell.taskId != null ? 'skip' : '', canUndo(cell, now) ? 'undo' : '', 'details'].filter(Boolean);
}

// The boxes (spec 2), a row per day (the desk's layout; the phone turns it): [{ date, today, cells: [a box per column] }].
// A box: { kind: 'done' | 'missed' | 'skipped' | 'cancelled' | 'open' | 'planned' | 'none' (not due), row (the item or the
// row it shows, for Details and the dialogs; null for none), taskId (today's rows only: the room tasks reply's id), initials,
// amountText, about (a planned item over an automatic stage change), words }. Today's rows come from todayRows when given
// (they carry ids, harvestCrops and amountLabel), else from the calendar's items; the calendar's planned items always count.
// workers: the workers' names (GET /api/workers), with the week's for the initials' clashes.
export function gridCells({ days, columns, today, todayRows = null, workers = [] }) {
  const list = [...(days ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const itemsOn = (d) => {
    const items = (d.items ?? []).filter(isDaily);
    if (d.date !== today || !todayRows) return items;
    return [...todayRows.filter(isDaily), ...items.filter((i) => i.status === 'planned')];
  };
  const names = [...workers];
  for (const d of list) for (const i of itemsOn(d)) if (i.worker) names.push(i.worker);
  const initials = initialsFor(names);
  return list.map((d) => {
    const items = itemsOn(d);
    const isToday = d.date === today;
    return {
      date: d.date,
      today: isToday,
      cells: columns.map((col) => {
        const here = items.filter((i) => keyOf(i) === col.key && KINDS.includes(i.status));
        const row = here.sort((a, b) => PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status))[0] ?? null;
        const kind = row ? row.status : 'none';
        const cell = {
          kind, row,
          taskId: isToday && todayRows && row && finite(row.id) ? row.id : null,
          initials: kind === 'done' && row.worker ? initials.get(row.worker.trim()) ?? '' : '',
          amountText: kind === 'done' ? boxAmount(row) : '',
          about: kind === 'planned' && row.about === true,
        };
        return { ...cell, words: boxWords(col, d.date, cell, today) };
      }),
    };
  });
}

// ---- the month sheet (spec 4) ----

const MARKS = { done: '✓', missed: '✗', skipped: '—' };

// The month sheet's table: { columns (gridColumns over the month), rows: [{ date, day, weekday (a letter), ahead (a day still
// to come: the pen's), cells: [{ kind, text ('✓ 2.4 AL', '✓ AL', '✗', '—', or '' for the pen), outlined (a planned box, or
// today's open one), shaded (not due or cancelled, on a day gone or today) }] }] }. days: the calendar reply's for the month.
export function sheetRows({ month, days, today, todayRows = null, workers = [] }) {
  const { days: dates } = monthDays(month);
  const byDate = new Map((days ?? []).map((d) => [d.date, d]));
  const all = dates.map((date) => byDate.get(date) ?? { date, items: [] });
  const columns = gridColumns(all, todayRows);
  const grid = gridCells({ days: all, columns, today, todayRows, workers });
  return {
    columns,
    rows: grid.map(({ date, cells }) => ({
      date,
      day: Number(date.slice(8)),
      weekday: WEEKDAY_LETTERS[new Date(utc(date)).getUTCDay()],
      ahead: date > today,
      cells: cells.map((c) => ({
        kind: c.kind,
        text: MARKS[c.kind] ? [MARKS[c.kind], c.amountText, c.initials].filter(Boolean).join(' ') : '',
        outlined: c.kind === 'planned' || c.kind === 'open',
        shaded: (c.kind === 'none' || c.kind === 'cancelled') && date <= today,
      })),
    })),
  };
}

// The month's title on the sheet: "November 2026" (a 'YYYY-MM' or a date of it).
export function monthTitle(month) {
  const [y, m] = String(month).split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// The printed page of a sheet with n columns (spec 4): A4 portrait for 8 or fewer, landscape above; the heads written sideways
// when a column gets less than 22 mm (the page less 12 mm margins, the day's 12 mm and Initials' 18 mm, over the columns).
const PAGE_MM = { portrait: 210 - 24, landscape: 297 - 24 };
const FIXED_MM = 12 + 18;
const NARROW_MM = 22;
export function sheetLayout(n) {
  const landscape = n > 8;
  const width = (landscape ? PAGE_MM.landscape : PAGE_MM.portrait) - FIXED_MM;
  return { landscape, sideways: n > 0 && width / n < NARROW_MM };
}

// ---- the grid's state: pressing, moving, the boxes held, the paint held (no DOM, so their behaviour can be tested) ----

// A press on a box (spec 3): held `ms` without moving more than `movePx`, it is a long press, onHold(target) (the menu). The
// pointer's click that ends a long press must not also act; a keyboard's click (detail 0: Enter, Space) always acts, so a
// long press that no click followed does not eat the next Enter. timers: { set(fn, ms), clear(id) } (a test's clock).
// → { down(target | null, x, y), move(x, y), stop(), click(detail) → whether it acts }
export function createPress({ onHold, ms = 500, movePx = 10, timers = { set: (fn, t) => setTimeout(fn, t), clear: (id) => clearTimeout(id) } }) {
  let timer = null;
  let at = null;
  let swallow = false;
  const stop = () => { if (timer !== null) timers.clear(timer); timer = null; };
  return {
    // every press starts clean; target null: a press that holds nothing (not a row's box, not the main button)
    down(target, x, y) {
      swallow = false;
      stop();
      if (target == null) return;
      at = [x, y];
      timer = timers.set(() => { timer = null; swallow = true; onHold(target); }, ms);
    },
    move(x, y) { if (timer !== null && Math.hypot(x - at[0], y - at[1]) > movePx) stop(); }, // a scroll
    stop,
    click(detail) {
      const eat = swallow && detail !== 0;
      swallow = false;
      return !eat;
    },
  };
}

// The keys that move in the grid (spec 5); the page does not scroll on them, even at an edge.
export const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

// Where a key moves from [y, x] (spec 5): the arrows one box, Home and End to the row's ends (with Ctrl, the grid's); a cell
// that holds nothing (null: the corner) is passed over. grid: the rows of the grid's focusable nodes. → [y, x], or null (an
// edge, or not a moving key)
export function gridMove(grid, [y, x], key, ctrl = false) {
  const last = (row) => row.length - 1;
  const to = {
    ArrowLeft: [y, x - 1, 0, -1], ArrowRight: [y, x + 1, 0, 1], ArrowUp: [y - 1, x, -1, 0], ArrowDown: [y + 1, x, 1, 0],
    Home: ctrl ? [0, 0, 0, 1] : [y, 0, 0, 1], End: ctrl ? [grid.length - 1, last(grid.at(-1)), 0, -1] : [y, last(grid[y]), 0, -1],
  }[key];
  if (!to) return null;
  let [ny, nx] = to;
  while (grid[ny]?.[nx] === null) [ny, nx] = [ny + to[2], nx + to[3]];
  return grid[ny]?.[nx] ? [ny, nx] : null;
}

// Today's rows tapped (Done, Skip): each box waits, disabled, until the room tasks reply shows its row changed, as a second
// tap would send again (a 409 for the worker's own tap); a week read again (the calendar) does not let it go.
// → { has(id), hold(id, rows), letGo(id) → whether it was held, changed(rows) → whether any let go, ids() }
export function createHeld() {
  const held = new Map(); // id → its row as the reply read when it was tapped
  const rowOf = (rows, id) => JSON.stringify((rows ?? []).find((r) => r?.id === id) ?? null);
  return {
    has: (id) => held.has(id),
    hold(id, rows) { held.set(id, rowOf(rows, id)); },
    letGo: (id) => held.delete(id),
    changed(rows) {
      let any = false;
      for (const [id, was] of held) if (rowOf(rows, id) !== was) any = held.delete(id) || any;
      return any;
    },
    ids: () => [...held.keys()],
  };
}

// The paint, held while the box's menu is open: a refresh never closes the menu under the finger or the keys (and drops the
// focus); it paints once the menu closes. → { paint(), opened(), closed() }
export function createPaintGate(paint) {
  let open = false;
  let waiting = false;
  return {
    paint() { if (open) waiting = true; else paint(); },
    opened() { open = true; },
    closed() {
      open = false;
      if (waiting) { waiting = false; paint(); }
    },
  };
}

// The month Print month opens: today's when the week holds it, else the week's first day's ('YYYY-MM').
export const sheetMonth = ({ from, to }, today) => (from <= today && today <= to ? today : from).slice(0, 7);
