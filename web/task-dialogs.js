// The dialogs of the Tasks tab, the Today page and Plan this (spec 2026-10-30-tasks-design.md 7.1, 7.2, 7.4 and 7.5): who
// did it (a name from Settings' workers, kept in this browser), Done with an amount, Skip and Cancel with a reason, Add a
// long-term task, Done on a long-term machine task with the Setup update, and Plan this. One dialog, made on first use and
// shared, like the Simulate stepper.
//   createTaskActions({ onChanged(row | null), onError(text) }) → { done(row), skip(row), cancel(row), add(roomId), destroy() }
//   (done, skip and cancel end, after their dialog closes, with true when something changed: the list will be asked again)
//   createWorkerPicker() → { node, destroy() } · openPlanDialog({ roomId, roomName, rank, plan, onPlanned(rows, replaced) })
//   closeTaskDialog() · openForm(options) (below; the Harvest tab's Record and Edit use it too) · loadWorkers() · getWorker()
//   · setWorker(name) · workerField(names, label) · errorText(err)

import { request, OFFLINE } from './api.js';
import { live } from './live.js';
import { roomHash } from './route.js';
import { keepLines } from './text-math.js';
import { picture } from './pictures.js';
import { recordsAmount, amountFields, doneBody, checkReason, checkLongterm, setupUpdate, beforeText, setupBody, taskParts } from './tasks-math.js';
import { pickWarning, donePicks } from './harvest-math.js';

const WORKER_KEY = 'farm.worker';
const COMMAND_TIMEOUT = 15000;

let dialog = null;
let openSeq = 0; // every opening gets a token; an answer that finds it changed is dropped

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// A select's options ([value, label]), value picked.
function fillOptions(select, options, value) {
  select.replaceChildren(...options.map(([v, label]) => {
    const o = el('option', '', label);
    o.value = v;
    o.selected = v === value;
    return o;
  }));
}

function button(label, className) {
  const b = el('button', className ?? '', label);
  b.type = 'button';
  return b;
}

export const errorText = (err) => (err.status === 0 ? `${OFFLINE}. Try again.` : err.message);
// A Setup field as it is now: "aircon rated input 1,070 W", "dehumidifier not fitted" (a box's label says fitted itself).
const nowText = (f) => `${(f.kind === 'check' ? f.label.replace(/ fitted$/, '') : f.label).toLowerCase()} ${beforeText(f)}`;

// ---- who is doing the rounds ----

export function getWorker() {
  try { return localStorage.getItem(WORKER_KEY) || null; } catch { return null; }
}

export function setWorker(name) {
  try {
    if (name) localStorage.setItem(WORKER_KEY, name);
    else localStorage.removeItem(WORKER_KEY);
  } catch { /* not kept: the next Done asks again */ }
  window.dispatchEvent(new CustomEvent('farm:worker'));
}

// The active workers' names (GET /api/workers).
export async function loadWorkers() {
  const data = await request('GET', '/api/workers');
  return (Array.isArray(data?.workers) ? data.workers : []).filter((w) => w.active).map((w) => w.name);
}

// "Doing the rounds as: Ali ▾" (spec 7.2): the name kept in this browser; another picker or a dialog changing it repaints it.
export function createWorkerPicker() {
  let alive = true;
  let names = [];
  let loaded = false;
  let failed = false; // the names could not be read: say so, not "No names yet"
  const node = el('label', 'tk-as');
  const select = el('select');
  select.name = 'worker';
  node.append(el('span', '', 'Doing the rounds as'), select);
  function paint() {
    const now = getWorker();
    const first = failed ? OFFLINE : names.length || !loaded ? 'Pick a name' : 'No names yet (Settings)';
    fillOptions(select, [['', first], ...names.map((n) => [n, n])], names.includes(now) ? now : '');
  }
  select.addEventListener('change', () => setWorker(select.value || null));
  let seq = 0; // every read gets a token: an older answer that comes last is dropped
  function load() {
    const mine = ++seq;
    loadWorkers().then((list) => { if (mine === seq) { names = list; loaded = true; failed = false; } }, () => { if (mine === seq) failed = true; })
      .then(() => { if (alive && mine === seq) paint(); });
  }
  // The names are read again when the worker changes (here, in another picker, or a name the server refused) and when the
  // stream comes back (the server is there again, and Settings may have renamed or removed someone meanwhile).
  const onStore = () => { if (alive) { paint(); load(); } };
  window.addEventListener('farm:worker', onStore);
  const offStatus = live.onStatus((up) => { if (up && alive) load(); });
  load();
  paint();
  return {
    node,
    destroy() {
      alive = false;
      window.removeEventListener('farm:worker', onStore);
      offStatus();
    },
  };
}

// The dialog's "Who did it" box: the active workers, the one this browser does the rounds as picked.
export const workerField = (list, label = 'Who did it') => ({
  name: 'worker', label, kind: 'select', value: list.includes(getWorker()) ? getWorker() : '',
  options: [['', 'Pick a name'], ...list.map((n) => [n, n])],
});

// ---- the dialog ----

function ensureDialog() {
  if (dialog) return dialog;
  dialog = el('dialog', 'tk-dialog');
  dialog.setAttribute('aria-labelledby', 'tk-dialog-title');
  document.body.append(dialog);
  return dialog;
}

export function closeTaskDialog() {
  openSeq++;
  if (dialog?.open) dialog.close();
}

// The task a dialog is about: its name, with what to do under it (as on its row).
function taskLead(row) {
  const { name, detail } = taskParts(row.text);
  const box = el('div', 'tk-lead tk-lead-task');
  box.append(el('p', 'tk-lead-name', keepLines(name)));
  if (detail) box.append(el('p', 'tk-lead-detail', keepLines(detail)));
  return box;
}

// Opens the dialog on a form. lead: lines (text or nodes) under the title; fields: [{ name, label, kind: 'text' | 'number'
// | 'area' | 'select' | 'check' | 'date', value, options ([value, label]), hint, hintOf(value) (a hint that follows the box),
// suffix (a unit inside the box), pic (a node before the label's words), min, max (a date's), placeholder, inputMode,
// maxLength (a text's) }], or a group { kind: 'group', legend? (a fieldset), hint?, className?, fields }; buttons: [{ value,
// label, primary, danger (filled red) }] after the close button (closeLabel; Close when there are no buttons), or { label,
// action } (a quiet red button at the footer's start that calls action()). submit(values, which, form) → true (closes), or { field, message }
// or { message, content?, final? } to show while it stays open (content: nodes for the line in place of the message's text;
// final: nothing more to send, the buttons stay disabled and only the close button is left); onLost(message): a failure that came back after the dialog was closed or
// replaced. → { input(name), button(value), alive(), closed } (alive: this opening still shows; closed: a promise kept when
// it is closed or replaced and nothing it sent is still waiting for an answer).
export function openForm({ title, lead = [], fields = [], buttons = [], closeLabel = buttons.length ? 'Cancel' : 'Close', submit, onLost }) {
  const d = ensureDialog();
  if (d.open) d.close();
  const me = ++openSeq;
  const alive = () => me === openSeq;
  d.replaceChildren();
  const form = el('form');
  form.noValidate = true;
  const heading = el('h2', '', title);
  heading.id = 'tk-dialog-title';
  heading.tabIndex = -1;
  const formError = el('p', 'form-error');
  formError.setAttribute('role', 'alert');
  formError.tabIndex = -1;
  formError.hidden = true;
  form.append(heading, ...lead.map((x) => (typeof x === 'string' ? el('p', 'tk-lead', keepLines(x)) : x)), formError);
  const inputs = new Map();
  const errors = new Map();
  // A field (or a group of them) into `parent`.
  function addField(f, parent) {
    if (f.kind === 'group') {
      const box = el(f.legend ? 'fieldset' : 'div', `tk-group${f.className ? ` ${f.className}` : ''}`);
      if (f.legend) box.append(el('legend', '', f.legend));
      if (f.hint) box.append(el('p', 'c-hint tk-group-hint', keepLines(f.hint)));
      const row = el('div', 'tk-group-fields');
      for (const g of f.fields) addField(g, row);
      box.append(row);
      parent.append(box);
      return;
    }
    const id = `tk-f-${f.name}`;
    const wrap = el('div', f.kind === 'check' ? 'field tk-check' : 'field');
    let input;
    if (f.kind === 'select') {
      input = el('select');
      fillOptions(input, f.options, f.value);
    } else if (f.kind === 'area') {
      input = el('textarea');
      input.rows = 3;
      input.value = f.value ?? '';
    } else if (f.kind === 'check') {
      input = el('input');
      input.type = 'checkbox';
      input.checked = f.value === true;
    } else if (f.kind === 'date') {
      input = el('input');
      input.type = 'date';
      if (f.min) input.min = f.min;
      if (f.max) input.max = f.max;
      input.value = f.value ?? '';
    } else {
      input = el('input');
      input.type = 'text';
      input.autocomplete = 'off';
      if (f.kind === 'number') input.inputMode = 'decimal';
      if (f.inputMode) input.inputMode = f.inputMode;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.maxLength) input.maxLength = f.maxLength;
      input.value = f.value ?? '';
    }
    input.id = id;
    input.name = f.name;
    const label = el('label', f.pic ? 'tk-pic-label' : '');
    if (f.pic) label.append(f.pic);
    label.append(f.label);
    label.htmlFor = id;
    const err = el('p', 'field-error');
    err.id = `${id}-error`;
    err.setAttribute('aria-live', 'polite');
    const described = [err.id];
    let box = input;
    if (f.suffix) { // the unit inside the box, at its right end
      box = el('span', 'tk-suffix-box');
      box.append(input, el('span', 'tk-suffix', f.suffix));
      box.lastChild.setAttribute('aria-hidden', 'true');
    }
    wrap.append(...(f.kind === 'check' ? [input, label] : [label, box]));
    const hintText = f.hintOf ? f.hintOf(input.value) : f.hint;
    if (hintText || f.hintOf) {
      const hint = el('p', 'c-hint', keepLines(hintText ?? ''));
      hint.id = `${id}-hint`;
      described.unshift(hint.id);
      wrap.append(hint);
      if (f.hintOf) input.addEventListener('input', () => { hint.textContent = keepLines(f.hintOf(input.value)); });
    }
    wrap.append(err);
    input.setAttribute('aria-describedby', described.join(' '));
    input.addEventListener('input', () => { err.textContent = ''; input.removeAttribute('aria-invalid'); });
    inputs.set(f.name, input);
    errors.set(f.name, err);
    parent.append(wrap);
  }
  for (const f of fields) addField(f, form);
  const actions = el('div', 'actions');
  const close = button(closeLabel);
  const sends = buttons.filter((b) => !b.action).map((b) => {
    const x = button(b.label, b.danger ? 'danger' : b.primary ? 'primary' : '');
    if (b.primary) x.type = 'submit';
    x.value = b.value;
    return x;
  });
  // a quiet destructive button at the footer's start (Delete in an Edit dialog): it opens its own confirm
  const asides = buttons.filter((b) => b.action).map((b) => {
    const x = button(b.label, 'danger-text tk-aside');
    x.addEventListener('click', () => { if (!busy) b.action(); });
    return x;
  });
  actions.append(...asides, close, ...sends);
  form.append(actions);
  d.append(form);

  let busy = false;
  let sending = null; // the answer being waited for: closed waits for it too
  const values = () => Object.fromEntries([...inputs].map(([name, input]) => [name, input.type === 'checkbox' ? input.checked : input.value]));
  function show(problem) {
    const input = problem.field ? inputs.get(problem.field) : null;
    if (input) {
      errors.get(problem.field).textContent = problem.message;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    if (problem.content) formError.replaceChildren(...problem.content);
    else formError.textContent = problem.message;
    formError.hidden = false;
    formError.focus();
  }
  async function run(which) {
    if (busy) return;
    busy = true;
    formError.hidden = true;
    for (const [name, err] of errors) { err.textContent = ''; inputs.get(name).removeAttribute('aria-invalid'); }
    for (const b of [close, ...sends]) b.disabled = true;
    let outcome;
    const answer = (async () => submit(values(), which, handle))();
    sending = answer.catch(() => {});
    try {
      outcome = await answer;
    } catch (err) {
      outcome = { message: errorText(err) };
    }
    if (!alive() || !d.open) { // closed meanwhile (Chrome lets a second Esc close it): a failure is said on the page
      if (outcome !== true) onLost?.(outcome.message);
      return;
    }
    busy = false;
    for (const b of [close, ...sends]) b.disabled = false;
    if (outcome !== true && outcome.final) for (const b of sends) b.disabled = true;
    if (outcome === true) d.close();
    else show(outcome);
  }
  for (const b of sends) if (b.type !== 'submit') b.addEventListener('click', () => run(b.value));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const main = buttons.find((b) => b.primary) ?? buttons[0];
    if (main) run(main.value);
  });
  close.addEventListener('click', () => d.close());
  d.oncancel = (event) => { if (busy) event.preventDefault(); }; // Esc while sending: the answer would have nowhere to show
  // The close event comes a moment later: the one of the opening this replaced finds this one open, and is not ours. A
  // dialog closed while sending (a second Esc) is over only once the answer came: its row stays held until then.
  const closed = new Promise((resolve) => {
    const onClose = () => {
      if (d.open && alive()) return;
      d.removeEventListener('close', onClose);
      resolve();
    };
    d.addEventListener('close', onClose);
  }).then(() => sending);
  d.showModal();
  (inputs.size ? inputs.values().next().value : heading).focus();
  const handle = { input: (name) => inputs.get(name), button: (value) => sends.find((b) => b.value === value), alive: () => alive() && d.open, closed };
  return handle;
}

// A pick over PICK_MAX_PER_BLOCK kg a block (harvest-math.js) asks once rather than being refused: the first submit says so
// under its kg box and the primary button (value, label) reads "Record anyway"; a submit with the same kg then sends it, and
// a kg box changed is checked again. → check(form, picks [{ field, kg, blocks }]): the problem to show, or null to send.
export function pickGuard({ value, label, fields }) {
  let asked = null; // the kg the question was asked for
  let watching = false;
  return (form, picks) => {
    const warning = pickWarning(picks);
    const kg = picks.map((p) => `${p.field}=${p.kg}`).join();
    if (!warning || kg === asked) return null;
    asked = kg;
    const b = form.button(value);
    b.textContent = `${label} anyway`;
    if (!watching) {
      watching = true;
      for (const name of fields) form.input(name)?.addEventListener('input', () => { asked = null; b.textContent = label; });
    }
    return warning;
  };
}

// ---- Done, Skip, Cancel, Add ----

// The Done form's amount boxes: a mixed room's kg one per crop (its picture and name, "kg" in a narrow box, two a row) under
// one legend and one hint; else the single box with its hint.
function amountBoxes(amounts) {
  if (!amounts.some((f) => f.crop)) {
    return amounts.map((f) => ({ name: f.name, label: f.label, kind: 'number', value: '', hint: 'Leave it empty if it was not weighed or counted.' }));
  }
  return [{
    kind: 'group', legend: 'kg picked', hint: 'Leave a box empty if that crop was not weighed.', className: 'tk-kg-group',
    fields: amounts.map((f) => ({ name: f.name, label: f.label, kind: 'number', value: '', suffix: 'kg', pic: picture('crop', f.crop, { size: 24 }) })),
  }];
}

export function createTaskActions({ onChanged, onError }) {
  let alive = true;
  let names = null; // the workers' names, read on the first need
  // ...and again after the worker changes (a picker, or a name the server refused) and when the stream comes back (Settings
  // may have renamed or removed someone meanwhile).
  const forget = () => { names = null; };
  window.addEventListener('farm:worker', forget);
  const offStatus = live.onStatus((up) => { if (up) forget(); });
  const pending = new Set(); // the rows being sent or asked about: a second tap meanwhile does nothing
  let changes = 0; // onChanged calls so far: an action that saw one ends with true
  const changed = (row) => { changes++; onChanged?.(row); };
  // Its dialogs: a failure that comes back after one was closed is said where the page says the others.
  const ask = (options) => openForm({ ...options, onLost: (text) => { if (alive) onError?.(text); } });

  // The names, or null after saying why they could not be read (no dialog then: it would say "No names yet"). A failed read
  // is not kept, nor an empty list (the first names added in Settings are seen): the next tap reads them again.
  async function workers() {
    if (names) return names;
    let list;
    try {
      list = await loadWorkers();
    } catch (err) {
      if (alive) onError?.(errorText(err));
      return null;
    }
    names = list.length ? list : null;
    return list;
  }

  // A name the server refused as not on the workers list (renamed or removed in Settings meanwhile): the names are read
  // again here and in the pickers, and the open dialog's box gets the list as it is now.
  async function refusedName(form) {
    window.dispatchEvent(new CustomEvent('farm:worker'));
    if (!form) return;
    const list = await workers();
    if (list && form.alive()) fillOptions(form.input('worker'), workerField(list).options, '');
  }

  // done, skip and cancel once at a time per row: a double tap of one-tap Done would otherwise send twice, and the second's
  // 409 would show the worker their own tap as someone else's. → true when something changed meanwhile (the row's buttons
  // stay held until the list repaints), false when nothing did (they let go).
  const once = (action) => async (row) => {
    if (pending.has(row.id)) return false;
    pending.add(row.id);
    const before = changes;
    try {
      await action(row);
    } finally {
      pending.delete(row.id);
    }
    return changes !== before;
  };
  function settingsLine() {
    const p = el('p', 'tk-lead');
    const a = el('a', '', 'Settings');
    a.href = '#/settings';
    p.append("No names yet: add the workers' names in ", a, ' first.');
    return p;
  }
  const leadOf = (row, list, more = []) => [taskLead(row), ...more, ...(list.length ? [] : [settingsLine()])];

  // The worker picked in a dialog is kept for the next Done (spec 7.2).
  function picked(values) {
    const w = String(values.worker ?? '').trim();
    if (w) setWorker(w);
    return w || null;
  }

  // A command (form: its dialog, if any). After it the list is asked again, and after a 409 or 404 too (someone else closed
  // it, or it is gone).
  async function send(path, body, form = null) {
    try {
      const row = await request('POST', path, body, COMMAND_TIMEOUT);
      if (alive) changed(row);
      return true;
    } catch (err) {
      if (alive && (err.status === 409 || err.status === 404)) changed(null);
      if (alive && err.status === 400 && err.field === 'worker') await refusedName(form);
      return err.status === 400 && err.field ? { field: err.field, message: err.message } : { message: errorText(err) };
    }
  }

  async function done(row) {
    if (row.kind === 'longterm' && row.source) return machineDone(row);
    const list = await workers();
    if (!list || !alive) return;
    const worker = getWorker();
    // One tap: a stage or upkeep task with no amount, by the worker this browser does the rounds as.
    if (row.kind !== 'longterm' && !recordsAmount(row) && worker && list.includes(worker)) {
      const r = await send(`/api/tasks/${row.id}/done`, { worker });
      if (r !== true && alive) onError?.(r.message);
      return;
    }
    const amounts = amountFields(row);
    const implausible = pickGuard({ value: 'done', label: 'Done', fields: amounts.map((f) => f.name) });
    const form = ask({
      title: 'Mark done',
      lead: leadOf(row, list),
      fields: [workerField(list), ...amountBoxes(amounts)],
      buttons: [{ value: 'done', label: 'Done', primary: true }],
      submit: async (v, _which, form) => {
        const w = picked(v);
        if (!w) return { field: 'worker', message: 'Pick who did it' };
        const body = doneBody(row, w, v);
        if (body.error) return { field: body.field, message: body.error };
        const asked = implausible(form, donePicks(row, body));
        if (asked) return asked;
        const r = await send(`/api/tasks/${row.id}/done`, body, form);
        return r !== true && r.field === 'amounts' && amounts[0] ? { ...r, field: amounts[0].name } : r;
      },
    });
    await form.closed;
  }

  async function skip(row) {
    const list = await workers();
    if (!list || !alive) return;
    await ask({
      title: 'Skip this task',
      lead: leadOf(row, list),
      fields: [workerField(list, 'Who is skipping it'), { name: 'reason', label: 'Why', kind: 'text', value: '' }],
      buttons: [{ value: 'skip', label: 'Skip', primary: true }],
      submit: async (v, _which, form) => {
        const w = picked(v);
        if (!w) return { field: 'worker', message: 'Pick who did it' };
        const r = checkReason(v.reason);
        if (r.error) return { field: 'reason', message: r.error };
        return send(`/api/tasks/${row.id}/skip`, { worker: w, reason: r.value }, form);
      },
    }).closed;
  }

  async function cancel(row) {
    await ask({
      title: 'Cancel this task',
      lead: [taskLead(row), 'It stays in the log as cancelled, with the reason.'],
      fields: [{ name: 'reason', label: 'Why', kind: 'text', value: '' }],
      buttons: [{ value: 'cancel', label: 'Cancel the task', primary: true }],
      closeLabel: 'Keep the task',
      submit: async (v) => {
        const r = checkReason(v.reason);
        if (r.error) return { field: 'reason', message: r.error };
        return send(`/api/tasks/${row.id}/cancel`, { reason: r.value });
      },
    }).closed;
  }

  function add(roomId) {
    ask({
      title: 'Add a long-term task',
      lead: ['A job of weeks rather than of the day, such as fixing the door seal.'],
      fields: [{ name: 'text', label: 'Task', kind: 'text', value: '' }, { name: 'note', label: 'Note (optional)', kind: 'area', value: '' }],
      buttons: [{ value: 'add', label: 'Add', primary: true }],
      submit: async (v) => {
        const c = checkLongterm(v);
        if (c.errors) {
          const [field] = Object.keys(c.errors);
          return { field, message: c.errors[field] };
        }
        try {
          const data = await request('POST', `/api/rooms/${roomId}/tasks`, { text: c.values.text, ...(c.values.note ? { note: c.values.note } : {}) }, COMMAND_TIMEOUT);
          if (alive) changed(data?.rows?.[0] ?? null);
          return true;
        } catch (err) {
          return err.status === 400 && err.field ? { field: err.field, message: err.message } : { message: errorText(err) };
        }
      },
    });
  }

  // Done on a long-term machine task (spec 7.5): the Setup values before and after, editable; Save and mark done saves Setup
  // first (the room's PUT) and marks the task done only when that worked; Just mark done leaves Setup as it is.
  async function machineDone(row) {
    const list = await workers();
    if (!list) return;
    let room;
    try {
      room = await request('GET', `/api/rooms/${row.roomId}`);
    } catch (err) {
      if (alive) onError?.(errorText(err));
      return;
    }
    if (!alive) return;
    const update = setupUpdate(row.source, room);
    const mark = async (v, form) => {
      const w = picked(v);
      if (!w) return { field: 'worker', message: 'Pick who did it' };
      return send(`/api/tasks/${row.id}/done`, { worker: w }, form);
    };
    if (!update) {
      await ask({
        title: 'Mark done', lead: leadOf(row, list, ['Setup keeps no fan flow, so Done only records the change.']),
        fields: [workerField(list)], buttons: [{ value: 'done', label: 'Done', primary: true }], submit: (v, _which, form) => mark(v, form),
      }).closed;
      return;
    }
    let saved = false; // Setup was saved in this dialog: a second try only marks the task done
    const form = ask({
      title: 'Mark done and update Setup',
      lead: leadOf(row, list, [`Setup now: ${update.map(nowText).join(' · ')}`]),
      fields: [workerField(list), ...update.map((f) => (f.kind === 'check'
        ? { name: f.name, label: f.label, kind: 'check', value: f.after }
        : { name: f.name, label: `${f.label} (${f.unit})`, kind: 'number', value: String(f.after), hint: `Now ${beforeText(f)}` }))],
      buttons: [{ value: 'just', label: 'Just mark done' }, { value: 'save', label: 'Save and mark done', primary: true }],
      submit: async (v, which) => {
        if (!String(v.worker ?? '').trim()) return { field: 'worker', message: 'Pick who did it' };
        if (which === 'save' && !saved) {
          const built = setupBody(room, Object.fromEntries(update.map((f) => [f.name, v[f.name]])));
          if (built.errors) {
            const [field] = Object.keys(built.errors);
            return { field, message: built.errors[field] };
          }
          try {
            room = await request('PUT', `/api/rooms/${row.roomId}`, built.body, COMMAND_TIMEOUT);
            saved = true;
            // Saved: the boxes lock (a change now would not be saved) and the one button left marks the task done.
            for (const f of update) form.input(f.name).disabled = true;
            form.button('save').textContent = 'Mark done';
            form.button('just').hidden = true;
          } catch (err) {
            return { field: err.status === 400 ? err.field : undefined, message: `Setup not saved: ${errorText(err)}` };
          }
        }
        const r = await mark(v, form);
        return r !== true && saved ? { message: `Setup saved. Marking the task done failed: ${r.message}` } : r;
      },
    });
    await form.closed;
  }

  return {
    done: once(done), skip: once(skip), cancel: once(cancel), add,
    destroy() {
      alive = false;
      window.removeEventListener('farm:worker', forget);
      offStatus();
      closeTaskDialog();
    },
  };
}

// ---- Plan this (spec 7.4) ----

const TASKS_TAB = 'Tasks tab';
const rowsOf = (v) => (Array.isArray(v) ? v : []);

// Each machine that differs from what the room has now (from → to) and the RM a month against it; Plan posts them as the
// room's long-term tasks. plan: tasks-math planOf's (stale: the search's baseline is no longer the room's machines: no Plan,
// its "from" would be wrong). onPlanned(rows, replaced) after it worked (replaced: the open plans it cancelled). A 409 (every change planned already): only Cancel is left,
// and the message's "Tasks tab" is a link to it.
export function openPlanDialog({ roomId, roomName, rank, plan, onPlanned }) {
  const changes = el('ul', 'tk-changes');
  changes.append(...plan.changes.map((c) => el('li', '', keepLines(c.text))));
  const lead = plan.stale ? [`${roomName}'s machines changed since this search. Suggest again to plan from them.`]
    : plan.changes.length
      ? [`Against what ${roomName} has now${plan.rmText ? ` · ${plan.rmText}` : ''}:`, changes,
        "Each change becomes a long-term task on the room's Tasks tab; Done on one offers to update Setup."]
      : ['Nothing changes from what the room has now.'];
  const form = openForm({
    title: `Plan setup ${rank}`,
    lead,
    buttons: plan.changes.length && !plan.stale ? [{ value: 'plan', label: 'Plan', primary: true }] : [],
    submit: async () => {
      try {
        const data = await request('POST', `/api/rooms/${roomId}/tasks`, plan.body, COMMAND_TIMEOUT);
        if (form.alive()) onPlanned?.(rowsOf(data?.rows), rowsOf(data?.replaced));
        return true;
      } catch (err) {
        const text = errorText(err);
        if (err.status === 409) {
          const at = text.lastIndexOf(TASKS_TAB);
          if (at < 0) return { message: text, final: true };
          const link = el('a', '', TASKS_TAB);
          link.href = roomHash(roomId, 'tasks');
          link.addEventListener('click', () => closeTaskDialog());
          return { message: text, content: [text.slice(0, at), link, text.slice(at + TASKS_TAB.length)], final: true };
        }
        return { message: text };
      }
    },
  });
}
