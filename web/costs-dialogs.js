// The Costs page's dialogs (spec 2026-11-05-costs-design.md 6), through the tasks' openForm: Add a cost, Edit a one-off (with
// a quiet Delete), Change a monthly item from a month (with its Stop and Delete), Stop it, and the Delete confirm. Each sends
// one request and calls onDone() when it went through; the page reloads on the costs event too. The pure parts (the body,
// the checks, where a cost lands, a bill's period, what a Stop or a Delete removes) are in web/costs-math.js.
//   openAddDialog({ rooms, today, first, runsIn, onDone, onLost, alive }) · openEditDialog({ cost, …the same })
//   openChangeDialog({ cost, month, today, onDone, onLost }) · openStopDialog({ cost, today, onDone, onLost })
//   openDeleteDialog({ cost, today, onDone, onLost })
// rooms: [{ id, name }]; today: 'YYYY-MM-DD'; first: the oldest month kept ('YYYY-MM', the dates' least); month: the month on
// show (Change's From picked first); runsIn(month) → a promise of the month's runs (GET /api/costs/month's runs), for the line
// saying where a one-off room cost lands; alive() → false once the page is gone (Add and Edit read the workers first).

import { request } from './api.js';
import { openForm, loadWorkers, workerField, errorText } from './task-dialogs.js';
import {
  moneyText, monthTitle, monthsBetween, entryLine, repeatingLine, isBill, bodyOf, clampMonth, landingText, billPeriod, checkCost,
  stopWords, deleteWords, amountBox,
} from './costs-math.js';
import { DOT } from './text-math.js';

const CATEGORY_OPTIONS = [
  ['labour', 'Labour'], ['rent', 'Rent'], ['utilities', 'Utilities'], ['repairs', 'Repairs'], ['transport', 'Transport'],
  ['packaging', 'Packaging'], ['blocks', 'Blocks'], ['spawn', 'Spawn'], ['other', 'Other'],
];
const UTILITY_OPTIONS = [['electricity', 'Electricity bill'], ['water', 'Water bill'], ['other', 'Other (internet, fixed charges)']];
const MAX_NOTE = 200; // server/costs.js
const MAX_NAME = 40; // a worker's name (server/tasks.js)
const NO_NAMES = 'The workers could not be read. Try again.';
const BILL_HINT = 'The measured electricity already counts; only the part not measured (bill − measured) is added.';
const WATER_HINT = 'The measured water already counts; only the part not measured (bill − measured) is added.';

// A refused send's words on its box, or the dialog's line.
const problem = (err) => (err.field ? { field: err.field, message: err.message } : { message: errorText(err) });

// A muted line under a box (before its error line), named by the box for a screen reader. → the line.
function lineUnder(form, name, id, className = 'c-hint') {
  const input = form.input(name);
  const p = document.createElement('p');
  p.className = className;
  p.id = id;
  p.setAttribute('aria-live', 'polite');
  p.hidden = true;
  input.closest('.field').querySelector('.field-error').before(p);
  input.setAttribute('aria-describedby', `${id} ${input.getAttribute('aria-describedby') ?? ''}`.trim());
  return p;
}
const say = (p, text) => {
  p.textContent = text ?? '';
  p.hidden = !text;
};

// The line under For: kept current as the date, the room, the category and Every month change.
function followLanding(form, { rooms, today, runsIn }) {
  const select = form.input('roomId');
  const hint = lineUnder(form, 'roomId', 'tk-f-roomId-lands', 'c-hint co-lands');
  let seq = 0;
  async function sync() {
    const mine = ++seq;
    const date = form.input('date').value;
    const roomId = Number(select.value) || null;
    const monthly = form.input('repeat')?.checked === true;
    const v = { category: form.input('category').value, utility: form.input('utility').value };
    if (!roomId || monthly || isBill(v) || !runsIn || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return say(hint, '');
    const runs = await runsIn(date.slice(0, 7)).catch(() => null);
    if (mine !== seq || !form.alive()) return;
    if (!runs) return say(hint, '');
    say(hint, landingText(runs, roomId, rooms.find((r) => r.id === roomId)?.name ?? 'This container', date, today));
  }
  for (const name of ['date', 'roomId', 'category', 'utility', 'repeat']) form.input(name)?.addEventListener('change', sync);
  form.input('date').addEventListener('input', sync);
  sync();
}

// Shows only the boxes the category needs: the worker for labour, the kind for utilities, the period for a bill (whose
// "For" is the farm's and which is entered each month, never Every month), and under Amount what a bill adds.
function followCategory(form) {
  const show = (name, on) => { form.input(name).closest('.field').hidden = !on; };
  const billHint = lineUnder(form, 'amount', 'tk-f-amount-bill');
  const sync = () => {
    const category = form.input('category').value;
    const utility = form.input('utility').value;
    const bill = isBill({ category, utility });
    show('worker', category === 'labour');
    show('utility', category === 'utilities');
    show('periodFrom', bill);
    show('periodTo', bill);
    show('roomId', !bill);
    if (form.input('repeat')) show('repeat', !bill);
    say(billHint, bill ? (utility === 'water' ? WATER_HINT : BILL_HINT) : '');
  };
  form.input('category').addEventListener('change', sync);
  form.input('utility').addEventListener('change', sync);
  sync();
}

// The bill's period follows its date's month until a period box is changed by hand. kept: the boxes already differ from the
// date's month (an Edit of a bill whose period was set).
function followPeriod(form, kept = false) {
  let touched = kept;
  const date = form.input('date');
  const sync = () => {
    const p = billPeriod(date.value);
    if (touched || !p) return;
    form.input('periodFrom').value = p.from;
    form.input('periodTo').value = p.to;
  };
  for (const name of ['periodFrom', 'periodTo']) form.input(name).addEventListener('input', () => { touched = true; });
  date.addEventListener('input', sync);
  date.addEventListener('change', sync);
}

// Who was paid: the active workers' names, none picked (the cost's own kept even when no longer on the list); a box to type a
// name in when the farm has no list (the server takes any name then); the names unread (null): no box to guess in.
function workerBox(workers, c) {
  if (workers === null) {
    return { name: 'worker', label: 'Worker', kind: 'select', value: c?.worker ?? '', options: [['', 'Names not read'], ...(c?.worker ? [[c.worker, c.worker]] : [])] };
  }
  if (!workers.length) {
    return { name: 'worker', label: 'Worker', kind: 'text', value: c?.worker ?? '', maxLength: MAX_NAME, placeholder: 'Who was paid' };
  }
  const f = workerField(workers, 'Worker');
  if (c?.worker && !workers.includes(c.worker)) f.options.push([c.worker, c.worker]);
  return { ...f, value: c?.worker ?? '' };
}

// The shared boxes of Add and Edit. c: the cost (Edit) or null. Utilities: what kind and the bill's period come before its
// amount (the line under Amount says what a bill adds).
function costFields(c, { rooms, workers, today, first }) {
  const period = billPeriod(c?.date ?? today);
  return [
    { name: 'date', label: 'Date', kind: 'date', value: c?.date ?? today, max: today, ...(first ? { min: `${first}-01` } : {}) },
    { name: 'category', label: 'Category', kind: 'select', value: c?.category ?? 'labour', options: CATEGORY_OPTIONS },
    { name: 'utility', label: 'Kind', kind: 'select', value: c?.utility ?? 'electricity', options: UTILITY_OPTIONS },
    { name: 'periodFrom', label: 'Bill from', kind: 'date', value: c?.periodFrom ?? period.from, hint: 'Up to 92 days before the date' },
    { name: 'periodTo', label: 'Bill to', kind: 'date', value: c?.periodTo ?? period.to, hint: 'Up to 62 days after Bill from' },
    { name: 'amount', label: 'Amount', kind: 'number', value: c ? amountBox(c.amount) : '', suffix: 'RM' },
    { name: 'roomId', label: 'For', kind: 'select', value: c?.roomId ? String(c.roomId) : '', options: [['', 'The farm (shared)'], ...rooms.map((r) => [String(r.id), r.name])] },
    workerBox(workers, c),
    { name: 'note', label: 'Note', kind: 'text', value: c?.note ?? '', maxLength: MAX_NOTE, placeholder: 'What it was for' },
  ];
}

// One send: the browser's check first (check(values) → a problem or null), then the request; true when it went through
// (onDone called), else the problem to show.
const sender = (send, onDone, check = () => null) => async (v, ...rest) => {
  const p = check(v);
  if (p) return p;
  try {
    await send(v, ...rest);
    onDone();
    return true;
  } catch (err) {
    return problem(err);
  }
};

// Add and Edit's common end: the boxes following each other, and the workers' problem said on their box when unread.
function follow(form, { rooms, today, runsIn, workers, kept }) {
  followCategory(form);
  followPeriod(form, kept);
  followLanding(form, { rooms, today, runsIn });
  if (workers === null) {
    const err = form.input('worker').closest('.field').querySelector('.field-error');
    err.textContent = NO_NAMES;
  }
}

// Add a cost.
export async function openAddDialog({ rooms, today, first, runsIn, onDone, onLost, alive = () => true }) {
  const workers = await loadWorkers().catch(() => null);
  if (!alive()) return; // the page went while the names were read
  const form = openForm({
    title: 'Add a cost',
    fields: [
      ...costFields(null, { rooms, workers, today, first }),
      { name: 'repeat', label: 'Every month (rent, a base wage)', kind: 'check', value: false, hint: 'Charged on the same day each month from the date’s month until you stop it.' },
    ],
    buttons: [{ value: 'add', label: 'Add', primary: true }],
    onLost,
    submit: sender(
      (v) => request('POST', '/api/costs', { ...bodyOf(v), repeat: v.repeat && !isBill(v) ? 'monthly' : null }), onDone,
      (v) => checkCost(v, { workersFailed: workers === null }),
    ),
  });
  follow(form, { rooms, today, runsIn, workers, kept: false });
}

// Edit a one-off, with a quiet Delete at the footer's start.
export async function openEditDialog({ cost, rooms, today, first, runsIn, onDone, onLost, alive = () => true }) {
  const workers = await loadWorkers().catch(() => null);
  if (!alive()) return;
  const p = billPeriod(cost.date);
  const kept = Boolean(cost.periodFrom || cost.periodTo) && !(cost.periodFrom === p?.from && cost.periodTo === p?.to);
  const form = openForm({
    title: 'Edit a cost',
    fields: costFields(cost, { rooms, workers, today, first }),
    buttons: [
      { label: 'Delete this cost', action: () => openDeleteDialog({ cost, today, onDone, onLost }) },
      { value: 'save', label: 'Save', primary: true },
    ],
    onLost,
    submit: sender((v) => request('PUT', `/api/costs/${cost.id}`, bodyOf(v)), onDone, (v) => checkCost(v, { workersFailed: workers === null })),
  });
  follow(form, { rooms, today, runsIn, workers, kept });
}

// The months a Change or a Stop may pick: its first to this month, or to its last month when stopped earlier (the server's
// range: a Stop only shortens).
function monthsOf(cost, today) {
  const current = today.slice(0, 7);
  return monthsBetween(cost.date.slice(0, 7), cost.repeatUntil && cost.repeatUntil < current ? cost.repeatUntil : current);
}

// A monthly item's new amount from a month (earlier months keep the old one), with its Stop and Delete.
export function openChangeDialog({ cost, month, today, onDone, onLost }) {
  const months = monthsOf(cost, today);
  const { what } = entryLine(cost);
  const form = openForm({
    title: `Change ${what}`,
    lead: [`${repeatingLine(cost).amount} since ${monthTitle(cost.date.slice(0, 7))}. The months before the one you pick keep what they were.`],
    fields: [
      { name: 'from', label: 'From', kind: 'select', value: clampMonth(month, months), options: months.map((m) => [m, monthTitle(m)]) },
      { name: 'amount', label: 'Amount a month', kind: 'number', value: amountBox(cost.amount), suffix: 'RM' },
      { name: 'note', label: 'Note', kind: 'text', value: cost.note, maxLength: MAX_NOTE },
    ],
    buttons: [
      { label: 'Stop', action: () => openStopDialog({ cost, today, onDone, onLost }) },
      { label: 'Delete this item', action: () => openDeleteDialog({ cost, today, onDone, onLost }) },
      { value: 'save', label: 'Save', primary: true },
    ],
    onLost,
    submit: sender(
      (v) => request('POST', `/api/costs/${cost.id}/change`, { from: v.from, amount: bodyOf(v).amount, note: v.note }), onDone,
      (v) => checkCost({ amount: v.amount }),
    ),
  });
  // Stop is no harm by itself (its own dialog says what it removes): a quiet button; only Delete is red
  const stop = [...form.input('from').form.querySelectorAll('.actions .tk-aside')].find((b) => b.textContent === 'Stop');
  stop?.classList.replace('danger-text', 'tk-quiet');
  stop?.classList.add('co-aside-quiet');
}

// A monthly item's last month, this month first. A month gone by removes the charges after it: a warning names them and
// the button says how many.
export function openStopDialog({ cost, today, onDone, onLost }) {
  const months = monthsOf(cost, today);
  const form = openForm({
    title: `Stop ${entryLine(cost).what}`,
    lead: ['It charges up to and including the month you pick; the months before keep their charges.'],
    fields: [{ name: 'after', label: 'Last month', kind: 'select', value: clampMonth(today.slice(0, 7), months), options: months.map((m) => [m, monthTitle(m)]) }],
    buttons: [{ value: 'stop', label: 'Stop', primary: true }],
    onLost,
    submit: sender((v) => request('POST', `/api/costs/${cost.id}/stop`, { after: v.after }), onDone),
  });
  const warning = lineUnder(form, 'after', 'tk-f-after-gone', 'c-hint co-warn');
  const sync = () => {
    const w = stopWords(cost, form.input('after').value, today);
    say(warning, w.warning);
    const b = form.button('stop');
    b.textContent = w.button;
    b.classList.toggle('danger', w.danger); // removing charges: red, as Delete; blue again when nothing goes
    b.classList.toggle('primary', !w.danger);
  };
  form.input('after').addEventListener('change', sync);
  sync();
}

// The Delete confirm: a monthly item goes with every month it charged (named: how many, their sum, which months). A danger
// button that is also the submit (openForm gives it the red fill).
export function openDeleteDialog({ cost, today, onDone, onLost }) {
  const monthly = cost.repeat === 'monthly';
  const { what } = entryLine(cost);
  const amount = monthly ? repeatingLine(cost).amount : moneyText(cost.amount);
  const gone = monthly ? deleteWords(cost, today) : null;
  openForm({
    title: monthly ? 'Delete this monthly item?' : 'Delete this cost?',
    lead: [
      `${what}${DOT}${amount}`,
      monthly ? `${gone ? `Every month it charged goes too: ${gone}.` : 'It has not charged yet.'} To end it from a month, use Stop.` : 'This cannot be undone.',
    ],
    buttons: [{ value: 'delete', label: 'Delete', danger: true, primary: true }],
    onLost,
    submit: sender(() => request('DELETE', `/api/costs/${cost.id}`), onDone),
  });
}
