// The Settings page's Workers and Task rules cards (spec 2026-10-30-tasks-design.md 7.3). Workers: the names picked on Done
// and Skip (add, rename, remove; a removed name stays on the tasks it closed). Task rules: every built-in rule with what it
// applies to and an On/Off switch, the upkeep rules' intervals, and the owner's own rules (Add your own, Edit, Remove). Each
// change is saved at once (PUT /api/workers with the whole list; PUT /api/task-rules with every switch, an interval only
// where it changed and the whole own list). mountTaskSettings(container) → unmount().

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { ruleLine, customLine, taskParts, SLOT_LABELS } from './tasks-math.js';
import {
  parseWorkerName, workersAfter, parseEveryDays, parseCustomRule, rulesBody, customAfter, ruleForm, idAfter, WORKER_MAX,
} from './settings-math.js';
import { el, keepFocus } from './task-list.js';

const COMMAND_TIMEOUT = 15000;
// The server refused an own rule's rooms: a room was removed since the page asked (deleteRoom takes it off the rules).
const ROOMS_CHANGED = 'A room was removed since this page loaded: the rules and rooms are loaded again. Check them and try again.';
// The server doesn't know an own rule's id: it was removed in another window since the page asked.
const RULES_CHANGED = 'The rules were changed elsewhere: loaded again. Check them and try again.';
// A click while the card's last change is still on its way: one change at a time, and none dropped without a word.
const STILL_SAVING = 'Still saving the last change. Try again in a moment.';
// The own rule being edited is gone (removed in another window, or with its last room).
const RULE_GONE = 'That rule was removed';
const SLOT_OPTIONS = Object.entries(SLOT_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');

const TEMPLATE = `
  <section class="card settings tk-workers" data-workers-card hidden>
    <h2>Workers</h2>
    <p class="muted s-hint">The names to pick from on Done and Skip, on a room's Tasks tab and the Today page. A removed name stays on the tasks it closed.</p>
    <ul class="tk-workers-list" data-workers></ul>
    <form class="tk-add" data-add-worker novalidate>
      <div class="field">
        <label for="f-worker-new">Add a name</label>
        <input id="f-worker-new" name="worker" type="text" autocomplete="off" maxlength="${WORKER_MAX}" aria-describedby="e-worker-new">
        <p class="field-error" id="e-worker-new" role="status"></p>
      </div>
      <button type="submit">Add</button>
    </form>
    <p class="field-error" data-workers-error role="status"></p>
  </section>
  <section class="card settings tk-rules" data-rules-card hidden>
    <h2>Task rules</h2>
    <p class="muted s-hint">Stage tasks come each day from a room's crops and stage; upkeep is counted from the last time it was done. A rule turned off makes no new tasks; its open ones stay until done or the day ends.</p>
    <h3>Stage tasks</h3>
    <ul class="tk-rule-list" data-daily></ul>
    <h3>Upkeep</h3>
    <ul class="tk-rule-list" data-upkeep></ul>
    <h3>Your own</h3>
    <ul class="tk-rule-list" data-custom></ul>
    <p class="muted" data-custom-none>None yet.</p>
    <button type="button" data-add-rule>Add your own</button>
    <form class="tk-rule-form" data-rule-form novalidate hidden aria-labelledby="tk-rule-form-title">
      <p class="tk-form-title" id="tk-rule-form-title" data-rule-form-title>Add your own rule</p>
      <div class="field">
        <label for="f-rule-text">Task</label>
        <input id="f-rule-text" name="text" type="text" autocomplete="off" maxlength="120" aria-describedby="e-rule-text">
        <p class="field-error" id="e-rule-text" role="status"></p>
      </div>
      <fieldset class="tk-rooms" aria-describedby="e-rule-rooms">
        <legend>Rooms</legend>
        <label class="tg-check"><input type="checkbox" name="allRooms" checked> All rooms</label>
        <div data-room-boxes></div>
        <p class="field-error" id="e-rule-rooms" role="status"></p>
      </fieldset>
      <div class="field">
        <label for="f-rule-often">How often</label>
        <select id="f-rule-often" name="often"><option value="daily">Every day</option><option value="every">Every so many days, from the last time done</option></select>
      </div>
      <div class="field" data-every-field hidden>
        <label for="f-rule-every">Every (days)</label>
        <input id="f-rule-every" name="everyDays" type="text" inputmode="numeric" autocomplete="off" aria-describedby="e-rule-every">
        <p class="field-error" id="e-rule-every" role="status"></p>
      </div>
      <div class="field">
        <label for="f-rule-slot">When in the day</label>
        <select id="f-rule-slot" name="slot" aria-describedby="e-rule-slot">${SLOT_OPTIONS}</select>
        <p class="field-error" id="e-rule-slot" role="status"></p>
      </div>
      <div class="ac-send">
        <button type="submit" class="primary" data-rule-submit>Add the rule</button>
        <button type="button" data-rule-cancel>Cancel</button>
      </div>
    </form>
    <p class="s-saved" data-rules-saved role="status" hidden></p>
    <p class="field-error" data-rules-error role="status"></p>
    <dialog class="confirm" data-remove-dialog aria-labelledby="tk-remove-title">
      <form method="dialog">
        <h2 id="tk-remove-title">Remove the rule</h2>
        <p data-remove-text></p>
        <div class="actions">
          <button value="cancel">Cancel</button>
          <button value="remove" class="danger">Remove</button>
        </div>
      </form>
    </dialog>
  </section>`;

function button(label, className, type = 'button') {
  const b = el('button', className ?? '', label);
  b.type = type;
  return b;
}

const errorText = (err) => (err.status === 0 ? `${OFFLINE}. Try again.` : routeMissing(err) ? OUTDATED : err.message);

export function mountTaskSettings(container) {
  let alive = true;
  let workersBusy = false; // the Workers card's change on its way
  let rulesBusy = false; // the Task rules card's
  let workers = []; // GET /api/workers' list, the removed ones too
  let renaming = null; // the name being renamed: { id, value, error }, kept through a repaint
  let rules = null; // GET /api/task-rules
  let rooms = []; // GET /api/rooms, for the own rules' room names
  let editing = null; // the own rule the form edits (its id); null: a new one
  let removing = null; // the own rule the Remove dialog asks about
  const everyDrafts = new Map(); // an upkeep interval typed wrong: key → { value, error }, kept through a repaint
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const w = {
    card: q('[data-workers-card]'), list: q('[data-workers]'), form: q('[data-add-worker]'), input: q('#f-worker-new'), err: q('#e-worker-new'),
    error: q('[data-workers-error]'),
  };
  const r = {
    card: q('[data-rules-card]'), daily: q('[data-daily]'), upkeep: q('[data-upkeep]'), custom: q('[data-custom]'), none: q('[data-custom-none]'),
    add: q('[data-add-rule]'), form: q('[data-rule-form]'), formTitle: q('[data-rule-form-title]'), submit: q('[data-rule-submit]'),
    boxes: q('[data-room-boxes]'), everyField: q('[data-every-field]'), saved: q('[data-rules-saved]'), error: q('[data-rules-error]'),
    removeDialog: q('[data-remove-dialog]'), removeText: q('[data-remove-text]'),
  };
  const f = {
    text: q('#f-rule-text'), all: q('input[name="allRooms"]'), often: q('#f-rule-often'), every: q('#f-rule-every'), slot: q('#f-rule-slot'),
    errors: { text: q('#e-rule-text'), rooms: q('#e-rule-rooms'), everyDays: q('#e-rule-every'), slot: q('#e-rule-slot') },
  };
  // The cursor to the control of that focus key, else to fallback.
  const focusTo = (key, fallback = null) => ((key && q(`[data-focus-key="${key}"]`)) || fallback)?.focus();

  // ---- Workers ----

  function paintWorkers() {
    const active = workers.filter((x) => x.active);
    if (renaming && !active.some((x) => x.id === renaming.id)) renaming = null;
    keepFocus(w.card, () => {
      w.list.replaceChildren(...(active.length
        ? active.map((x) => (renaming?.id === x.id ? renameItem(x) : workerItem(x)))
        : [el('li', 'muted', 'No names yet. Add the people who do the rounds.')]));
    });
  }

  // One change: the whole list. → true once saved (the caller paints and places the cursor).
  async function putWorkers(list, onField) {
    if (workersBusy) { w.error.textContent = STILL_SAVING; return false; }
    workersBusy = true;
    w.error.textContent = '';
    try {
      const data = await request('PUT', '/api/workers', { workers: list }, COMMAND_TIMEOUT);
      if (!alive) return false;
      workers = Array.isArray(data?.workers) ? data.workers : list;
      return true;
    } catch (err) {
      if (!alive) return false;
      if (err.status === 400 && onField) onField(err.message);
      else w.error.textContent = errorText(err);
      return false;
    } finally {
      workersBusy = false;
      if (w.error.textContent === STILL_SAVING) w.error.textContent = '';
    }
  }

  function workerItem(x) {
    const li = el('li');
    const rename = button('Rename');
    rename.setAttribute('aria-label', `Rename ${x.name}`);
    rename.dataset.focusKey = `rename-${x.id}`;
    const remove = button('Remove', 'danger-text');
    remove.setAttribute('aria-label', `Remove ${x.name}`);
    remove.dataset.focusKey = `remove-${x.id}`;
    rename.addEventListener('click', () => {
      renaming = { id: x.id, value: x.name, error: '' };
      paintWorkers();
      focusTo(`rename-input-${x.id}`);
    });
    remove.addEventListener('click', async () => {
      const next = idAfter(workers.filter((y) => y.active).map((y) => y.id), x.id);
      if (await putWorkers(workersAfter(workers, { remove: x.id }))) {
        paintWorkers();
        focusTo(next === null ? null : `rename-${next}`, w.input);
      }
    });
    li.append(el('span', 'tk-worker-name', x.name), rename, remove);
    return li;
  }

  function cancelRename(x) {
    renaming = null;
    paintWorkers();
    focusTo(`rename-${x.id}`);
  }

  function renameItem(x) {
    const li = el('li');
    const form = el('form', 'tk-rename');
    form.noValidate = true;
    const id = `f-worker-${x.id}`;
    const field = el('div', 'field');
    const label = el('label', '', `New name for ${x.name}`);
    label.htmlFor = id;
    const input = el('input');
    input.id = id;
    input.type = 'text';
    input.autocomplete = 'off';
    input.maxLength = WORKER_MAX;
    input.value = renaming.value;
    input.dataset.focusKey = `rename-input-${x.id}`;
    const err = el('p', 'field-error', renaming.error);
    err.id = `${id}-error`;
    err.setAttribute('role', 'status');
    input.setAttribute('aria-describedby', err.id);
    if (renaming.error) input.setAttribute('aria-invalid', 'true');
    input.addEventListener('input', () => { renaming.value = input.value; });
    field.append(label, input, err);
    const cancel = button('Cancel');
    cancel.addEventListener('click', () => cancelRename(x));
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); cancelRename(x); }
    });
    const onField = (text) => {
      if (renaming?.id === x.id) renaming.error = text;
      err.textContent = text;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    };
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const p = parseWorkerName(input.value, workers, x.id);
      if (p.error) return onField(p.error);
      if (await putWorkers(workersAfter(workers, { rename: { id: x.id, name: p.value } }), onField)) {
        renaming = null;
        paintWorkers();
        focusTo(`rename-${x.id}`);
      }
    });
    form.append(field, button('Save', 'primary', 'submit'), cancel);
    li.append(form);
    return li;
  }

  w.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    w.err.textContent = '';
    w.input.removeAttribute('aria-invalid');
    const onField = (text) => { w.err.textContent = text; w.input.setAttribute('aria-invalid', 'true'); w.input.focus(); };
    const p = parseWorkerName(w.input.value, workers);
    if (p.error) return onField(p.error);
    if (await putWorkers(workersAfter(workers, { add: p.value }), onField)) {
      paintWorkers();
      w.input.value = '';
      w.input.focus();
    }
  });

  // ---- Task rules ----

  const withBuiltin = (key, change) => ({ ...rules, builtin: rules.builtin.map((b) => (b.key === key ? { ...b, ...change } : b)) });
  const withCustom = (id, change) => ({ ...rules, custom: rules.custom.map((c) => (c.id === id ? { ...c, ...change } : c)) });

  // On/Off, as the machines' switches (DESIGN.md: On tinted, never filled).
  function toggle(on, name, key, onClick) {
    const b = button('', 'toggle');
    b.dataset.on = String(on);
    b.dataset.focusKey = key;
    b.setAttribute('aria-pressed', String(on));
    b.append(el('span', 'sr-only', `${name}: `), el('span', '', on ? 'On' : 'Off'));
    b.addEventListener('click', onClick);
    return b;
  }

  function ruleItem(rule, line, key, onToggle, extra = []) {
    const li = el('li');
    const text = el('div', 'tk-rule-text');
    const { name, detail } = taskParts(rule.text);
    text.append(el('p', 'tk-rule-name', name));
    if (detail) text.append(el('p', 'tk-rule-detail', detail));
    if (line) text.append(el('p', 'tk-rule-line', line));
    li.append(text, ...extra, toggle(rule.enabled, rule.text, key, onToggle));
    return li;
  }

  // An upkeep rule's interval, saved when it reads right and differs; a wrong one is said under its own box.
  function everyBox(rule) {
    const draft = everyDrafts.get(rule.key);
    const box = el('div', 'tk-every-field');
    const label = el('label', 'tk-every');
    const input = el('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.value = draft?.value ?? String(rule.everyDays);
    input.dataset.focusKey = `every-${rule.key}`;
    input.setAttribute('aria-label', `${rule.text}: every how many days`);
    const err = el('p', 'field-error', draft?.error ?? '');
    err.id = `e-every-${rule.key}`;
    err.setAttribute('role', 'status');
    input.setAttribute('aria-describedby', err.id);
    if (draft) input.setAttribute('aria-invalid', 'true');
    label.append(el('span', '', 'Every'), input, el('span', '', 'days'));
    input.addEventListener('change', () => {
      const p = parseEveryDays(input.value);
      if (p.error) {
        everyDrafts.set(rule.key, { value: input.value, error: p.error });
        err.textContent = p.error;
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      everyDrafts.delete(rule.key);
      err.textContent = '';
      input.removeAttribute('aria-invalid');
      if (p.value !== rule.everyDays) putRules(withBuiltin(rule.key, { everyDays: p.value }));
    });
    box.append(label, err);
    return box;
  }

  function customItem(c) {
    const edit = button('Edit');
    edit.setAttribute('aria-label', `Edit ${c.text}`);
    edit.dataset.focusKey = `edit-${c.id}`;
    edit.addEventListener('click', () => openForm(c));
    const remove = button('Remove', 'danger-text');
    remove.setAttribute('aria-label', `Remove ${c.text}`);
    remove.dataset.focusKey = `remove-rule-${c.id}`;
    remove.addEventListener('click', () => {
      removing = c.id;
      r.removeText.textContent = `Remove '${c.text}'? Its open tasks are cancelled.`;
      r.removeDialog.returnValue = '';
      r.removeDialog.showModal();
    });
    return ruleItem(c, customLine(c, rooms), `custom-${c.id}`, () => putRules(withCustom(c.id, { enabled: !c.enabled })), [edit, remove]);
  }

  function paintRules() {
    keepFocus(r.card, () => {
      r.daily.replaceChildren(...rules.builtin.filter((b) => b.kind === 'daily')
        .map((b) => ruleItem(b, ruleLine(b), `rule-${b.key}`, () => putRules(withBuiltin(b.key, { enabled: !b.enabled })))));
      r.upkeep.replaceChildren(...rules.builtin.filter((b) => b.kind === 'upkeep')
        .map((b) => ruleItem(b, '', `rule-${b.key}`, () => putRules(withBuiltin(b.key, { enabled: !b.enabled })), [everyBox(b)])));
      r.custom.replaceChildren(...rules.custom.map(customItem));
      r.none.hidden = rules.custom.length > 0;
    });
  }

  // Every change of the rules goes through here (switches, intervals, Add, Edit, Remove). → true once saved.
  async function putRules(next) {
    if (rulesBusy) { r.error.textContent = STILL_SAVING; return false; }
    rulesBusy = true;
    r.error.textContent = '';
    r.saved.hidden = true;
    try {
      const data = await request('PUT', '/api/task-rules', rulesBody(next, rules), COMMAND_TIMEOUT);
      if (!alive) return false;
      rules = data;
      r.saved.textContent = 'Saved';
      r.saved.hidden = false;
      return true;
    } catch (err) {
      if (!alive) return false;
      if (err.status === 400 && /^custom\.\d+\.rooms$/.test(err.field ?? '')) {
        r.error.textContent = ROOMS_CHANGED;
        await reloadRules();
      } else if (err.status === 400 && /^custom\.\d+\.id$/.test(err.field ?? '')) {
        r.error.textContent = RULES_CHANGED;
        await reloadRules();
      } else {
        r.error.textContent = errorText(err);
      }
      return false;
    } finally {
      rulesBusy = false;
      if (r.error.textContent === STILL_SAVING) r.error.textContent = '';
      if (alive && rules) paintRules(); // the saved rules, or (after a failure) the ones before
    }
  }

  // The rules and rooms as the server has them now (an own rule may have lost a room); the form's ticks stay on the rooms
  // that are left.
  async function reloadRules() {
    const [rl, rm] = await Promise.allSettled([request('GET', '/api/task-rules'), request('GET', '/api/rooms')]);
    if (!alive) return;
    if (rl.status === 'fulfilled' && rl.value) rules = rl.value;
    if (rm.status === 'fulfilled' && Array.isArray(rm.value)) {
      rooms = rm.value;
      paintBoxes(new Set(checkedRooms()));
    }
    if (editing !== null && !rules.custom.some((c) => c.id === editing)) { closeForm(null); r.error.textContent = RULE_GONE; }
  }

  const roomBoxes = () => [...r.boxes.querySelectorAll('input[name="rooms"]')];
  const checkedRooms = () => roomBoxes().filter((b) => b.checked).map((b) => Number(b.value));

  function paintBoxes(checked = new Set()) {
    r.boxes.replaceChildren(...rooms.map((room) => {
      const label = el('label', 'tg-check');
      const box = el('input');
      box.type = 'checkbox';
      box.name = 'rooms';
      box.value = String(room.id);
      box.checked = checked.has(room.id);
      label.append(box, ` ${room.name}`);
      return label;
    }));
  }

  function paintForm() {
    r.everyField.hidden = f.often.value !== 'every';
    r.boxes.hidden = f.all.checked;
  }
  // The boxes of one of parseCustomRule's error names.
  const boxesOf = (name) => ({ text: [f.text], rooms: [f.all, ...roomBoxes()], everyDays: [f.every], slot: [f.slot] }[name] ?? []);
  function clearFormErrors() {
    for (const node of Object.values(f.errors)) node.textContent = '';
    for (const input of [f.text, f.every, f.slot, f.all, ...roomBoxes()]) input.removeAttribute('aria-invalid');
  }
  f.often.addEventListener('change', paintForm);
  f.all.addEventListener('change', paintForm);

  // Add your own (rule null) or Edit (an own rule): the one form, filled in.
  function openForm(rule = null) {
    editing = rule?.id ?? null;
    const v = ruleForm(rule);
    f.text.value = v.text;
    f.all.checked = v.allRooms;
    f.often.value = v.often;
    f.every.value = v.everyDays;
    f.slot.value = v.slot;
    clearFormErrors();
    paintBoxes(new Set(v.rooms));
    paintForm();
    r.formTitle.textContent = rule ? `Edit: ${rule.text}` : 'Add your own rule';
    r.submit.textContent = rule ? 'Save the rule' : 'Add the rule';
    r.form.hidden = false;
    r.add.hidden = true;
    f.text.focus();
  }

  // focusKey: where the cursor goes (else Add your own).
  function closeForm(focusKey = editing === null ? null : `edit-${editing}`) {
    editing = null;
    r.form.hidden = true;
    r.add.hidden = false;
    focusTo(focusKey, r.add);
  }

  r.add.addEventListener('click', () => openForm());
  q('[data-rule-cancel]').addEventListener('click', () => closeForm());
  r.form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeForm(); }
  });

  r.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors();
    if (!rules) return;
    const p = parseCustomRule({
      text: f.text.value, allRooms: f.all.checked, rooms: checkedRooms(), often: f.often.value, everyDays: f.every.value, slot: f.slot.value,
    });
    if (p.errors) {
      const names = Object.keys(p.errors);
      for (const name of names) {
        if (f.errors[name]) f.errors[name].textContent = p.errors[name];
        else r.error.textContent = p.errors[name];
        for (const input of boxesOf(name)) input.setAttribute('aria-invalid', 'true');
      }
      boxesOf(names[0])[0]?.focus();
      return;
    }
    if (editing !== null && !rules.custom.some((c) => c.id === editing)) { closeForm(null); r.error.textContent = RULE_GONE; return; }
    const id = editing;
    if (await putRules({ ...rules, custom: customAfter(rules.custom, editing === null ? { add: p.value } : { edit: { id: editing, rule: p.value } }) })) {
      closeForm(id === null ? null : `edit-${id}`);
    }
  });

  r.removeDialog.addEventListener('close', async () => {
    const id = removing;
    removing = null;
    if (id === null) return;
    if (r.removeDialog.returnValue !== 'remove') { focusTo(`remove-rule-${id}`); return; }
    const next = idAfter(rules.custom.map((c) => c.id), id);
    if (await putRules({ ...rules, custom: customAfter(rules.custom, { remove: id }) })) {
      if (editing === id) closeForm(null);
      focusTo(next === null ? null : `edit-${next}`, r.add.hidden ? f.text : r.add);
    } else {
      focusTo(`remove-rule-${id}`);
    }
  });

  // ---- loading ----

  async function load() {
    const [wk, rl, rm] = await Promise.allSettled([request('GET', '/api/workers'), request('GET', '/api/task-rules'), request('GET', '/api/rooms')]);
    if (!alive) return;
    if (rm.status === 'fulfilled' && Array.isArray(rm.value)) rooms = rm.value;
    // A farm app from before the tasks has neither route: the two cards stay hidden.
    if (wk.status === 'fulfilled') {
      workers = Array.isArray(wk.value?.workers) ? wk.value.workers : [];
      paintWorkers();
      w.card.hidden = false;
    } else if (!routeMissing(wk.reason)) {
      w.error.textContent = `Couldn't load the names: ${errorText(wk.reason)}`;
      w.card.hidden = false;
    }
    if (rl.status === 'fulfilled' && rl.value) {
      rules = rl.value;
      paintRules();
      r.card.hidden = false;
    } else if (rl.status === 'rejected' && !routeMissing(rl.reason)) {
      r.error.textContent = `Couldn't load the rules: ${errorText(rl.reason)}`;
      r.add.hidden = true;
      r.card.hidden = false;
    }
  }

  load();
  return function unmount() {
    alive = false;
    removing = null;
    if (r.removeDialog.open) r.removeDialog.close();
    container.replaceChildren();
  };
}
