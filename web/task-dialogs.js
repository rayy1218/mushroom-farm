// The dialogs of the Tasks tab, the Today page and Plan this (spec 2026-10-30-tasks-design.md 7.1, 7.2, 7.4 and 7.5): who
// did it (a name from Settings' workers, kept in this browser), Done with an amount, Skip and Cancel with a reason, Add a
// long-term task, Done on a long-term machine task with the Setup update, and Plan this. One dialog, made on first use and
// shared, like the Simulate stepper.
//   createTaskActions({ onChanged(row | null), onError(text) }) → { done(row), skip(row), cancel(row), add(roomId), destroy() }
//   (done, skip and cancel end, after their dialog closes, with true when something changed: the list will be asked again)
//   createWorkerPicker() → { node, destroy() } · openPlanDialog({ roomId, roomName, rank, plan, onPlanned(rows, replaced) })
//   closeTaskDialog()

import { request, OFFLINE } from './api.js';
import { live } from './live.js';
import { roomHash } from './route.js';
import { keepLines } from './text-math.js';
import { recordsAmount, amountField, parseAmount, checkReason, checkLongterm, setupUpdate, beforeText, setupBody } from './tasks-math.js';

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

const errorText = (err) => (err.status === 0 ? `${OFFLINE}. Try again.` : err.message);
// A Setup field as it is now: "aircon rated input 1,070 W", "dehumidifier not fitted" (a box's label says fitted itself).
const nowText = (f) => `${(f.kind === 'check' ? f.label.replace(/ fitted$/, '') : f.label).toLowerCase()} ${beforeText(f)}`;

// ---- who is doing the rounds ----

function getWorker() {
  try { return localStorage.getItem(WORKER_KEY) || null; } catch { return null; }
}

function setWorker(name) {
  try {
    if (name) localStorage.setItem(WORKER_KEY, name);
    else localStorage.removeItem(WORKER_KEY);
  } catch { /* not kept: the next Done asks again */ }
  window.dispatchEvent(new CustomEvent('farm:worker'));
}

// The active workers' names (GET /api/workers).
async function loadWorkers() {
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

// Opens the dialog on a form. lead: lines (text or nodes) under the title; fields: [{ name, label, kind: 'text' | 'number'
// | 'area' | 'select' | 'check', value, options ([value, label]), hint }]; buttons: [{ value, label, primary }] after the
// close button (closeLabel; Close when there are no buttons). submit(values, which, form) → true (closes), or { field, message }
// or { message, content?, final? } to show while it stays open (content: nodes for the line in place of the message's text;
// final: nothing more to send, the buttons stay disabled and only the close button is left); onLost(message): a failure that came back after the dialog was closed or
// replaced. → { input(name), button(value), alive(), closed } (alive: this opening still shows; closed: a promise kept when
// it is closed or replaced and nothing it sent is still waiting for an answer).
function openForm({ title, lead = [], fields = [], buttons = [], closeLabel = buttons.length ? 'Cancel' : 'Close', submit, onLost }) {
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
  for (const f of fields) {
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
    } else {
      input = el('input');
      input.type = 'text';
      input.autocomplete = 'off';
      if (f.kind === 'number') input.inputMode = 'decimal';
      input.value = f.value ?? '';
    }
    input.id = id;
    input.name = f.name;
    const label = el('label', '', f.label);
    label.htmlFor = id;
    const err = el('p', 'field-error');
    err.id = `${id}-error`;
    err.setAttribute('aria-live', 'polite');
    const described = [err.id];
    wrap.append(...(f.kind === 'check' ? [input, label] : [label, input]));
    if (f.hint) {
      const hint = el('p', 'c-hint', keepLines(f.hint));
      hint.id = `${id}-hint`;
      described.unshift(hint.id);
      wrap.append(hint);
    }
    wrap.append(err);
    input.setAttribute('aria-describedby', described.join(' '));
    input.addEventListener('input', () => { err.textContent = ''; input.removeAttribute('aria-invalid'); });
    inputs.set(f.name, input);
    errors.set(f.name, err);
    form.append(wrap);
  }
  const actions = el('div', 'actions');
  const close = button(closeLabel);
  const sends = buttons.map((b) => {
    const x = button(b.label, b.primary ? 'primary' : '');
    if (b.primary) x.type = 'submit';
    x.value = b.value;
    return x;
  });
  actions.append(close, ...sends);
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
  (fields.length ? inputs.get(fields[0].name) : heading).focus();
  const handle = { input: (name) => inputs.get(name), button: (value) => sends.find((b) => b.value === value), alive: () => alive() && d.open, closed };
  return handle;
}

// ---- Done, Skip, Cancel, Add ----

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
  const workerField = (list, label = 'Who did it') => ({
    name: 'worker', label, kind: 'select', value: list.includes(getWorker()) ? getWorker() : '',
    options: [['', 'Pick a name'], ...list.map((n) => [n, n])],
  });
  function settingsLine() {
    const p = el('p', 'tk-lead');
    const a = el('a', '', 'Settings');
    a.href = '#/settings';
    p.append("No names yet: add the workers' names in ", a, ' first.');
    return p;
  }
  const leadOf = (row, list, more = []) => [row.text, ...more, ...(list.length ? [] : [settingsLine()])];

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
    const amount = recordsAmount(row) ? amountField(row) : null;
    const form = ask({
      title: 'Mark done',
      lead: leadOf(row, list),
      fields: [workerField(list), ...(amount ? [{ name: 'amount', label: amount.label, kind: 'number', value: '', hint: 'Leave it empty if it was not weighed or counted.' }] : [])],
      buttons: [{ value: 'done', label: 'Done', primary: true }],
      submit: async (v, _which, form) => {
        const w = picked(v);
        if (!w) return { field: 'worker', message: 'Pick who did it' };
        let a = null;
        if (amount) {
          const p = parseAmount(v.amount);
          if (p.error) return { field: 'amount', message: p.error };
          a = p.value;
        }
        return send(`/api/tasks/${row.id}/done`, { worker: w, ...(a === null ? {} : { amount: a }) }, form);
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
      lead: [row.text, 'It stays in the log as cancelled, with the reason.'],
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
