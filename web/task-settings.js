// The Settings page's Workers and Task rules cards (spec 2026-10-30-tasks-design.md 7.3). Workers: the names picked on Done
// and Skip (add, rename, remove; a removed name stays on the tasks it closed). Task rules: every built-in rule with what it
// applies to and an On/Off switch, the upkeep rules' intervals, and the owner's own rules (Add your own). Each change is
// saved at once (PUT /api/workers with the whole list; PUT /api/task-rules with every switch, an interval only where it
// changed and the whole own list). mountTaskSettings(container) → unmount().

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { ruleLine, customLine, SLOT_LABELS } from './tasks-math.js';
import { parseWorkerName, workersAfter, parseEveryDays, parseCustomRule, rulesBody, WORKER_MAX } from './settings-math.js';
import { el, keepFocus } from './task-list.js';

const COMMAND_TIMEOUT = 15000;
// The server refused an own rule's rooms: a room was removed since the page asked (deleteRoom takes it off the rules).
const ROOMS_CHANGED = 'A room was removed since this page loaded: the rules and rooms are loaded again. Check them and try again.';
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
    <form class="tk-rule-form" data-rule-form novalidate hidden>
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
        <button type="submit" class="primary">Add the rule</button>
        <button type="button" data-rule-cancel>Cancel</button>
      </div>
    </form>
    <p class="s-saved" data-rules-saved role="status" hidden></p>
    <p class="field-error" data-rules-error role="status"></p>
  </section>`;

function button(label, className, type = 'button') {
  const b = el('button', className ?? '', label);
  b.type = type;
  return b;
}

const errorText = (err) => (err.status === 0 ? `${OFFLINE}. Try again.` : routeMissing(err) ? OUTDATED : err.message);

export function mountTaskSettings(container) {
  let alive = true;
  let busy = false; // one save at a time
  let workers = []; // GET /api/workers' list, the removed ones too
  let rules = null; // GET /api/task-rules
  let rooms = []; // GET /api/rooms, for the own rules' room names
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const w = {
    card: q('[data-workers-card]'), list: q('[data-workers]'), form: q('[data-add-worker]'), input: q('#f-worker-new'), err: q('#e-worker-new'),
    error: q('[data-workers-error]'),
  };
  const r = {
    card: q('[data-rules-card]'), daily: q('[data-daily]'), upkeep: q('[data-upkeep]'), custom: q('[data-custom]'), none: q('[data-custom-none]'),
    add: q('[data-add-rule]'), form: q('[data-rule-form]'), boxes: q('[data-room-boxes]'), everyField: q('[data-every-field]'),
    saved: q('[data-rules-saved]'), error: q('[data-rules-error]'),
  };
  const f = {
    text: q('#f-rule-text'), all: q('input[name="allRooms"]'), often: q('#f-rule-often'), every: q('#f-rule-every'), slot: q('#f-rule-slot'),
    errors: { text: q('#e-rule-text'), rooms: q('#e-rule-rooms'), everyDays: q('#e-rule-every'), slot: q('#e-rule-slot') },
  };

  // ---- Workers ----

  function paintWorkers() {
    const active = workers.filter((x) => x.active);
    w.list.replaceChildren(...(active.length ? active.map(workerItem) : [el('li', 'muted', 'No names yet. Add the people who do the rounds.')]));
  }

  async function putWorkers(list, onField) {
    if (busy) return false;
    busy = true;
    w.error.textContent = '';
    try {
      const data = await request('PUT', '/api/workers', { workers: list }, COMMAND_TIMEOUT);
      if (!alive) return false;
      workers = Array.isArray(data?.workers) ? data.workers : list;
      paintWorkers();
      return true;
    } catch (err) {
      if (!alive) return false;
      if (err.status === 400 && onField) onField(err.message);
      else w.error.textContent = errorText(err);
      return false;
    } finally {
      busy = false;
    }
  }

  function workerItem(x) {
    const li = el('li');
    const rename = button('Rename');
    rename.setAttribute('aria-label', `Rename ${x.name}`);
    const remove = button('Remove', 'danger-text');
    remove.setAttribute('aria-label', `Remove ${x.name}`);
    rename.addEventListener('click', () => li.replaceWith(renameItem(x)));
    remove.addEventListener('click', () => putWorkers(workersAfter(workers, { remove: x.id })));
    li.append(el('span', 'tk-worker-name', x.name), rename, remove);
    return li;
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
    input.value = x.name;
    const err = el('p', 'field-error');
    err.id = `${id}-error`;
    err.setAttribute('role', 'status');
    input.setAttribute('aria-describedby', err.id);
    field.append(label, input, err);
    const cancel = button('Cancel');
    cancel.addEventListener('click', () => paintWorkers());
    const onField = (text) => { err.textContent = text; input.setAttribute('aria-invalid', 'true'); input.focus(); };
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const p = parseWorkerName(input.value, workers, x.id);
      if (p.error) return onField(p.error);
      await putWorkers(workersAfter(workers, { rename: { id: x.id, name: p.value } }), onField);
    });
    form.append(field, button('Save', 'primary', 'submit'), cancel);
    li.append(form);
    queueMicrotask(() => input.focus());
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
    text.append(el('p', '', rule.text));
    if (line) text.append(el('p', 'tk-rule-line', line));
    li.append(text, ...extra, toggle(rule.enabled, rule.text, key, onToggle));
    return li;
  }

  function everyBox(rule) {
    const label = el('label', 'tk-every');
    const input = el('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.value = String(rule.everyDays);
    input.dataset.focusKey = `every-${rule.key}`;
    input.setAttribute('aria-label', `${rule.text}: every how many days`);
    label.append(el('span', '', 'Every'), input, el('span', '', 'days'));
    input.addEventListener('change', () => {
      const p = parseEveryDays(input.value);
      if (p.error) {
        r.error.textContent = `${rule.text}: ${p.error}`;
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      input.removeAttribute('aria-invalid');
      if (p.value !== rule.everyDays) putRules(withBuiltin(rule.key, { everyDays: p.value }));
    });
    return label;
  }

  function paintRules() {
    keepFocus(r.card, () => {
      r.daily.replaceChildren(...rules.builtin.filter((b) => b.kind === 'daily')
        .map((b) => ruleItem(b, ruleLine(b), `rule-${b.key}`, () => putRules(withBuiltin(b.key, { enabled: !b.enabled })))));
      r.upkeep.replaceChildren(...rules.builtin.filter((b) => b.kind === 'upkeep')
        .map((b) => ruleItem(b, '', `rule-${b.key}`, () => putRules(withBuiltin(b.key, { enabled: !b.enabled })), [everyBox(b)])));
      r.custom.replaceChildren(...rules.custom
        .map((c) => ruleItem(c, customLine(c, rooms), `custom-${c.id}`, () => putRules(withCustom(c.id, { enabled: !c.enabled })))));
      r.none.hidden = rules.custom.length > 0;
    });
  }

  async function putRules(next) {
    if (busy) return false;
    busy = true;
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
      } else {
        r.error.textContent = errorText(err);
      }
      return false;
    } finally {
      busy = false;
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
      paintBoxes(new Set([...r.boxes.querySelectorAll('input[name="rooms"]:checked')].map((b) => Number(b.value))));
    }
  }

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
  function clearFormErrors() {
    for (const node of Object.values(f.errors)) node.textContent = '';
    for (const input of [f.text, f.every, f.all, f.slot]) input.removeAttribute('aria-invalid');
  }
  f.often.addEventListener('change', paintForm);
  f.all.addEventListener('change', paintForm);

  r.add.addEventListener('click', () => {
    f.text.value = '';
    f.all.checked = true;
    f.often.value = 'daily';
    f.every.value = '';
    f.slot.value = 'morning';
    clearFormErrors();
    paintBoxes();
    paintForm();
    r.form.hidden = false;
    r.add.hidden = true;
    f.text.focus();
  });

  q('[data-rule-cancel]').addEventListener('click', () => {
    r.form.hidden = true;
    r.add.hidden = false;
    r.add.focus();
  });

  r.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors();
    if (!rules) return;
    const p = parseCustomRule({
      text: f.text.value, allRooms: f.all.checked, rooms: [...r.boxes.querySelectorAll('input[name="rooms"]:checked')].map((b) => Number(b.value)),
      often: f.often.value, everyDays: f.every.value, slot: f.slot.value,
    });
    if (p.errors) {
      const names = Object.keys(p.errors);
      for (const name of names) {
        if (f.errors[name]) f.errors[name].textContent = p.errors[name];
        else r.error.textContent = p.errors[name];
      }
      const first = { text: f.text, rooms: f.all, everyDays: f.every, slot: f.slot }[names[0]];
      first?.setAttribute('aria-invalid', 'true');
      first?.focus();
      return;
    }
    if (await putRules({ ...rules, custom: [...rules.custom, p.value] })) {
      r.form.hidden = true;
      r.add.hidden = false;
      r.add.focus();
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
    container.replaceChildren();
  };
}
