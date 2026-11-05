// The Costs page's dialogs (spec 2026-11-05-costs-design.md 6), through the tasks' openForm: Add a cost, Edit a one-off (with
// a quiet Delete), Change a monthly item from a month (with its Delete), Stop it, and the Delete confirm. Each sends one
// request and calls onDone() when it went through; the page reloads on the costs event too.
//   openAddDialog({ rooms, today, first, runsIn, onDone, onLost }) · openEditDialog({ cost, rooms, today, first, runsIn, onDone, onLost })
//   openChangeDialog({ cost, month, today, onDone, onLost }) · openStopDialog({ cost, month, today, onDone, onLost })
//   openDeleteDialog({ cost, onDone, onLost })
// rooms: [{ id, name }]; today: 'YYYY-MM-DD'; first: the oldest month kept ('YYYY-MM', the dates' least); month: the month on show (the From or Last month picked first); runsIn(month)
// → a promise of the month's runs (GET /api/costs/month's runs), for the line saying where a one-off room cost lands.

import { request } from './api.js';
import { openForm, loadWorkers, workerField, errorText } from './task-dialogs.js';
import { moneyText, monthTitle, monthsBetween, entryLine, repeatingLine } from './costs-math.js';
import { DOT } from './text-math.js';

const CATEGORY_OPTIONS = [
  ['labour', 'Labour'], ['rent', 'Rent'], ['utilities', 'Utilities'], ['repairs', 'Repairs'], ['transport', 'Transport'],
  ['packaging', 'Packaging'], ['blocks', 'Blocks'], ['spawn', 'Spawn'], ['other', 'Other'],
];
const UTILITY_OPTIONS = [['electricity', 'Electricity bill'], ['water', 'Water bill'], ['other', 'Other (internet, fixed charges)']];
const MAX_NOTE = 200; // server/costs.js
const MAX_NAME = 40; // a worker's name (server/tasks.js)
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FARM_OFFSET_MS = 8 * 3_600_000; // the farm's time is UTC+8 all year (as web/costs-math.js)
const isBill = (v) => v.category === 'utilities' && (v.utility === 'electricity' || v.utility === 'water');

// A refused send's words on its box, or the dialog's line.
const problem = (err) => (err.field ? { field: err.field, message: err.message } : { message: errorText(err) });
const amountOf = (text) => Number(String(text).replace(/,/g, '').trim() || NaN);
const clampMonth = (m, list) => (m < list[0] ? list[0] : m > list.at(-1) ? list.at(-1) : m);

// The body of Add and Edit from the dialog's values. A bill's empty period is sent as null: the server takes the bill
// date's month (an Edit too, rather than keeping the old period).
function bodyOf(v) {
  const body = { date: v.date, category: v.category, amount: amountOf(v.amount), note: v.note };
  body.roomId = v.roomId ? Number(v.roomId) : null;
  if (v.category === 'labour') body.worker = v.worker;
  if (v.category === 'utilities') body.utility = v.utility;
  if (isBill(v)) {
    body.roomId = null;
    body.periodFrom = v.periodFrom || null;
    body.periodTo = v.periodTo || null;
  }
  return body;
}

// ---- where a one-off room cost lands (spec 6: "On Container 1's run of 3 Oct" or "No run then: on the farm month") ----

const farmDay = (ms) => new Date(ms + FARM_OFFSET_MS).toISOString().slice(0, 10);
const dayWords = (date, today) => `${Number(date.slice(8))} ${MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}${date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${date.slice(0, 4)}`}`;

// The room's run open on `date` (server/costs-math.js runOn: of those whose days hold it, the one started last).
function runOn(runs, roomId, date, today) {
  let found = null;
  for (const r of runs) {
    const from = farmDay(r.startedAt);
    const to = r.endedAt === null ? today : farmDay(r.endedAt);
    if (r.roomId !== roomId || from > date || date > to) continue;
    if (!found || r.startedAt > found.startedAt || (r.startedAt === found.startedAt && r.id > found.id)) found = r;
  }
  return found;
}

// The line under For: kept current as the date, the room, the category and Every month change.
function followLanding(form, { rooms, today, runsIn }) {
  const select = form.input('roomId');
  const hint = document.createElement('p');
  hint.className = 'c-hint co-lands';
  hint.id = 'tk-f-roomId-lands';
  hint.setAttribute('aria-live', 'polite');
  hint.hidden = true;
  select.closest('.field').querySelector('.field-error').before(hint);
  select.setAttribute('aria-describedby', `${hint.id} ${select.getAttribute('aria-describedby') ?? ''}`.trim());
  let seq = 0;
  const say = (text) => {
    hint.textContent = text;
    hint.hidden = !text;
  };
  async function sync() {
    const mine = ++seq;
    const date = form.input('date').value;
    const roomId = Number(select.value) || null;
    const monthly = form.input('repeat')?.checked === true;
    const v = { category: form.input('category').value, utility: form.input('utility').value };
    if (!roomId || monthly || isBill(v) || !runsIn || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return say('');
    const runs = await runsIn(date.slice(0, 7)).catch(() => null);
    if (mine !== seq || !form.alive()) return;
    if (!runs) return say('');
    const room = rooms.find((r) => r.id === roomId)?.name ?? 'This container';
    const run = runOn(runs, roomId, date, today);
    say(run ? `On ${room}’s run of ${dayWords(farmDay(run.startedAt), today)}.` : `No run in ${room} then: on the farm’s month.`);
  }
  for (const name of ['date', 'roomId', 'category', 'utility', 'repeat']) form.input(name)?.addEventListener('change', sync);
  form.input('date').addEventListener('input', sync);
  sync();
}

// Shows only the boxes the category needs: the worker for labour, the kind for utilities, the period for a bill (whose
// "For" is the farm's and which is entered each month, never Every month).
function followCategory(form) {
  const show = (name, on) => { form.input(name).closest('.field').hidden = !on; };
  const sync = () => {
    const category = form.input('category').value;
    const bill = isBill({ category, utility: form.input('utility').value });
    show('worker', category === 'labour');
    show('utility', category === 'utilities');
    show('periodFrom', bill);
    show('periodTo', bill);
    show('roomId', !bill);
    if (form.input('repeat')) show('repeat', !bill);
  };
  form.input('category').addEventListener('change', sync);
  form.input('utility').addEventListener('change', sync);
  sync();
}

// Who was paid: the active workers' names (the cost's own kept even when no longer on the list), or a box to type a name
// in when the farm has no list (the server takes any name then).
function workerBox(workers, c) {
  if (!workers.length) {
    return { name: 'worker', label: 'Worker', kind: 'text', value: c?.worker ?? '', maxLength: MAX_NAME, placeholder: 'Who was paid' };
  }
  const f = workerField(workers, 'Worker');
  if (c?.worker && !workers.includes(c.worker)) f.options.push([c.worker, c.worker]);
  return { ...f, value: c?.worker ?? f.value };
}

// The shared boxes of Add and Edit. c: the cost (Edit) or null.
function costFields(c, { rooms, workers, today, first }) {
  return [
    { name: 'date', label: 'Date', kind: 'date', value: c?.date ?? today, max: today, ...(first ? { min: `${first}-01` } : {}) },
    { name: 'category', label: 'Category', kind: 'select', value: c?.category ?? 'labour', options: CATEGORY_OPTIONS },
    { name: 'amount', label: 'Amount', kind: 'number', value: c ? String(c.amount) : '', suffix: 'RM' },
    { name: 'roomId', label: 'For', kind: 'select', value: c?.roomId ? String(c.roomId) : '', options: [['', 'The farm (shared)'], ...rooms.map((r) => [String(r.id), r.name])] },
    workerBox(workers, c),
    { name: 'utility', label: 'Kind', kind: 'select', value: c?.utility ?? 'electricity', options: UTILITY_OPTIONS },
    { name: 'periodFrom', label: 'Bill from', kind: 'date', value: c?.periodFrom ?? '', hint: 'Empty: the first of the bill date’s month' },
    { name: 'periodTo', label: 'Bill to', kind: 'date', value: c?.periodTo ?? '', hint: 'Empty: the last of the bill date’s month' },
    { name: 'note', label: 'Note', kind: 'text', value: c?.note ?? '', maxLength: MAX_NOTE, placeholder: 'What it was for' },
  ];
}

// One send: true when it went through (onDone called), else the problem to show.
const sender = (send, onDone) => async (...args) => {
  try {
    await send(...args);
    onDone();
    return true;
  } catch (err) {
    return problem(err);
  }
};

// Add a cost.
export async function openAddDialog({ rooms, today, first, runsIn, onDone, onLost }) {
  const workers = await loadWorkers().catch(() => []);
  const form = openForm({
    title: 'Add a cost',
    fields: [
      ...costFields(null, { rooms, workers, today, first }),
      { name: 'repeat', label: 'Every month (rent, a base wage)', kind: 'check', value: false, hint: 'Charged on the same day each month from the date’s month until you stop it.' },
    ],
    buttons: [{ value: 'add', label: 'Add', primary: true }],
    onLost,
    submit: sender((v) => request('POST', '/api/costs', { ...bodyOf(v), repeat: v.repeat && !isBill(v) ? 'monthly' : null }), onDone),
  });
  followCategory(form);
  followLanding(form, { rooms, today, runsIn });
}

// Edit a one-off, with a quiet Delete at the footer's start.
export async function openEditDialog({ cost, rooms, today, first, runsIn, onDone, onLost }) {
  const workers = await loadWorkers().catch(() => []);
  const form = openForm({
    title: 'Edit a cost',
    fields: costFields(cost, { rooms, workers, today, first }),
    buttons: [
      { label: 'Delete this cost', action: () => openDeleteDialog({ cost, onDone, onLost }) },
      { value: 'save', label: 'Save', primary: true },
    ],
    onLost,
    submit: sender((v) => request('PUT', `/api/costs/${cost.id}`, bodyOf(v)), onDone),
  });
  followCategory(form);
  followLanding(form, { rooms, today, runsIn });
}

// A monthly item's new amount from a month (earlier months keep the old one), with its Delete. The months: its first to
// this month, or to its last month when it was stopped earlier (the server's range).
export function openChangeDialog({ cost, month, today, onDone, onLost }) {
  const current = today.slice(0, 7);
  const months = monthsBetween(cost.date.slice(0, 7), cost.repeatUntil && cost.repeatUntil < current ? cost.repeatUntil : current);
  const { what } = entryLine(cost);
  openForm({
    title: `Change ${what}`,
    lead: [`${repeatingLine(cost).amount} since ${monthTitle(cost.date.slice(0, 7))}. The months before the one you pick keep what they were.`],
    fields: [
      { name: 'from', label: 'From', kind: 'select', value: clampMonth(month, months), options: months.map((m) => [m, monthTitle(m)]) },
      { name: 'amount', label: 'Amount a month', kind: 'number', value: String(cost.amount), suffix: 'RM' },
      { name: 'note', label: 'Note', kind: 'text', value: cost.note, maxLength: MAX_NOTE },
    ],
    buttons: [
      { label: 'Delete this item', action: () => openDeleteDialog({ cost, onDone, onLost }) },
      { value: 'save', label: 'Save', primary: true },
    ],
    onLost,
    submit: sender((v) => request('POST', `/api/costs/${cost.id}/change`, { from: v.from, amount: amountOf(v.amount), note: v.note }), onDone),
  });
}

// A monthly item's last month: its first to this month, or to its last month when stopped already (a Stop only shortens).
export function openStopDialog({ cost, month, today, onDone, onLost }) {
  const current = today.slice(0, 7);
  const months = monthsBetween(cost.date.slice(0, 7), cost.repeatUntil && cost.repeatUntil < current ? cost.repeatUntil : current);
  openForm({
    title: `Stop ${entryLine(cost).what}`,
    lead: ['It charges up to and including the month you pick; the months before keep their charges.'],
    fields: [{ name: 'after', label: 'Last month', kind: 'select', value: clampMonth(month, months), options: months.map((m) => [m, monthTitle(m)]) }],
    buttons: [{ value: 'stop', label: 'Stop', primary: true }],
    onLost,
    submit: sender((v) => request('POST', `/api/costs/${cost.id}/stop`, { after: v.after }), onDone),
  });
}

// The Delete confirm: a monthly item goes with every month it charged. A danger button that is also the submit (openForm
// gives it the red fill).
export function openDeleteDialog({ cost, onDone, onLost }) {
  const monthly = cost.repeat === 'monthly';
  const { what } = entryLine(cost);
  const amount = monthly ? repeatingLine(cost).amount : moneyText(cost.amount);
  openForm({
    title: monthly ? 'Delete this monthly item?' : 'Delete this cost?',
    lead: [
      `${what}${DOT}${amount}`,
      monthly ? `Every month it charged since ${monthTitle(cost.date.slice(0, 7))} goes too. To end it from a month, use Stop.` : 'This cannot be undone.',
    ],
    buttons: [{ value: 'delete', label: 'Delete', danger: true, primary: true }],
    onLost,
    submit: sender(() => request('DELETE', `/api/costs/${cost.id}`), onDone),
  });
}
