// The Settings page's Workers and Task rules cards (spec 2026-10-30-tasks-design.md 7.3). Workers: everyone who signs in
// (add, rename, remove; a removed name stays on the tasks it closed), with each one's sign-in state and controls (spec
// 2026-11-06-login-design.md 5: Set PIN or password, Make owner or worker, Unlock, Sign out everywhere; which show:
// settings-math.js accountActions). Task rules: every built-in rule with what it applies to and an On/Off switch, the
// upkeep rules' intervals, and the owner's own rules (Add your own, Edit, Remove). Each change is saved at once (PUT
// /api/workers with the whole list; PUT /api/task-rules with every switch, an interval only where it changed and the whole
// own list). mountTaskSettings(container) → unmount().

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { ruleLine, customLine, taskParts, SLOT_LABELS } from './tasks-math.js';
import {
  parseWorkerName, workersAfter, parseEveryDays, parseCustomRule, rulesBody, customAfter, ruleForm, idAfter, WORKER_MAX,
  accountLine, secretAction, accountActions, otherOwnerCanSignIn, roleConfirm, signOutConfirm, removeConfirm, accountDone, isNameField,
} from './settings-math.js';
import { el, keepFocus } from './task-list.js';
import { openForm as openDialog, closeTaskDialog } from './task-dialogs.js';
import { me, setMe } from './session.js';
import { picture } from './pictures.js';
import { taskPicture } from './pictures-data.js';

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
    <p class="muted s-hint">Everyone signs in: a worker with their name and a 6-digit PIN, an owner with a password. Workers do the rounds and see no money.</p>
    <ul class="tk-workers-list" data-workers></ul>
    <form class="tk-add" data-add-worker novalidate>
      <div class="field">
        <label for="f-worker-new">Add a name</label>
        <input id="f-worker-new" name="worker" type="text" autocomplete="off" maxlength="${WORKER_MAX}" aria-describedby="e-worker-new">
        <p class="field-error" id="e-worker-new" role="status"></p>
      </div>
      <button type="submit">Add</button>
    </form>
    <p class="s-saved" data-workers-saved role="status" hidden></p>
    <p class="field-error" data-workers-error role="status"></p>
    <dialog class="confirm" data-account-dialog aria-labelledby="tk-account-title">
      <form method="dialog">
        <h2 id="tk-account-title" data-account-title></h2>
        <p data-account-text></p>
        <div class="actions">
          <button value="cancel">Cancel</button>
          <button value="go" class="primary" data-account-go></button>
        </div>
      </form>
    </dialog>
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
  let accounts = new Map(); // GET /api/workers/accounts by id: role, secret set, lock, sessions (null when it failed)
  let accountsSeq = 0; // each read of the accounts; an older reply that comes last is dropped
  let secretForm = null; // the Set PIN or password dialog's handle (openForm's), closed with the page
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
    error: q('[data-workers-error]'), saved: q('[data-workers-saved]'),
    dialog: q('[data-account-dialog]'), dialogTitle: q('[data-account-title]'), dialogText: q('[data-account-text]'), dialogGo: q('[data-account-go]'),
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
    w.saved.hidden = true;
    try {
      const data = await request('PUT', '/api/workers', { workers: list }, COMMAND_TIMEOUT);
      if (!alive) return false;
      workers = Array.isArray(data?.workers) ? data.workers : list;
      await loadAccounts(); // a new name has no PIN yet; a removed one is signed out
      return true;
    } catch (err) {
      if (!alive) return false;
      if (err.status === 400 && onField && isNameField(err.field)) onField(err.message);
      else w.error.textContent = errorText(err); // the list's own refusal too (the farm needs an owner)
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
    const self = x.id === me()?.id;
    const account = accounts?.get(x.id) ?? (accounts ? NO_ACCOUNT : null); // a name just added has no account row yet
    const acts = account && accountActions(account, { self, otherOwner: otherOwnerCanSignIn([...accounts.values()], x.id), now: Date.now() });
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
      const ask = removeConfirm(x.name, account); // an owner: their sessions go with them
      if (ask && !(await confirmFirst(ask, `remove-${x.id}`))) return;
      if (await putWorkers(workersAfter(workers, { remove: x.id }))) {
        paintWorkers();
        focusTo(next === null ? null : `rename-${next}`, w.input);
      }
    });
    const who = el('div', 'tk-worker-who');
    who.append(el('span', 'tk-worker-name', x.name));
    if (account) who.append(el('span', 'tk-worker-account muted', accountLine(account, Date.now())));
    const actions = el('div', 'tk-worker-actions');
    actions.append(...(acts ? accountButtons(x, account, acts) : []), rename);
    if (!self) actions.append(remove); // you: another owner removes you (it would sign you out everywhere)
    li.append(who, actions);
    return li;
  }

  // ---- Workers: signing in ----

  const NO_ACCOUNT = { role: 'worker', hasSecret: false, lockedUntil: null, sessions: 0 };

  // The sign-in state of everyone, read again after each change. A failure leaves the rows without it (null), said once.
  async function loadAccounts() {
    const mine = ++accountsSeq;
    try {
      const data = await request('GET', '/api/workers/accounts');
      if (alive && mine === accountsSeq) accounts = new Map((Array.isArray(data?.accounts) ? data.accounts : []).map((a) => [a.id, a]));
    } catch (err) {
      if (!alive || mine !== accountsSeq) return;
      accounts = null;
      w.error.textContent = `Couldn't load who can sign in: ${errorText(err)}`;
    }
  }

  // The names and the accounts as the server has them now (a name removed in another window), painted.
  async function reloadWorkers() {
    try {
      const data = await request('GET', '/api/workers');
      if (alive && Array.isArray(data?.workers)) workers = data.workers;
    } catch { /* the rows stay as they were */ }
    await loadAccounts();
    if (alive) paintWorkers();
  }

  // The card's line once a change is saved (the error line stays for failures).
  function said(text) {
    w.saved.textContent = text;
    w.saved.hidden = false;
  }

  // A quiet button of a worker's row: label, its focus key, the words a screen reader says.
  function quiet(label, key, aria, onClick) {
    const b = button(label, 'tk-quiet');
    b.setAttribute('aria-label', aria);
    b.dataset.focusKey = key;
    b.addEventListener('click', onClick);
    return b;
  }

  // The buttons accountActions shows: the secret, the role, Unlock, Sign out everywhere.
  function accountButtons(x, a, acts) {
    const out = [];
    if (acts.secret) out.push(quiet(acts.secret.label, `secret-${x.id}`, `${acts.secret.label} for ${x.name}`, () => openSecret(x, a)));
    if (acts.role) out.push(quiet(acts.role.label, `role-${x.id}`, `${acts.role.label}: ${x.name}`, () => changeRole(x, acts.role.to)));
    if (acts.unlock) out.push(quiet('Unlock', `unlock-${x.id}`, `Unlock ${x.name}`, () => accountChange(x, 'POST', 'unlock')));
    if (acts.signOut) out.push(quiet('Sign out everywhere', `sign-out-${x.id}`, `Sign out everywhere: ${x.name}`, () => signOut(x)));
    return out;
  }

  // One change of a worker's sign-in (what: unlock, sign-out or role → { account }), the accounts read again, the row
  // painted and the card's line saying it; the cursor stays on the button, else (Unlock and Sign out go once done) on the
  // row's first. → true once done.
  async function accountChange(x, method, what, body) {
    if (workersBusy) { w.error.textContent = STILL_SAVING; return false; }
    workersBusy = true;
    w.error.textContent = '';
    w.saved.hidden = true;
    try {
      await request(method, `/api/workers/${x.id}/${what}`, body, COMMAND_TIMEOUT);
      if (!alive) return false;
      await loadAccounts(); // your own sign-out or demotion: a 401 here, and the page goes to the sign-in view
      if (!alive) return false;
      paintWorkers();
      said(accountDone(x.name, what, body?.role));
      focusTo(`${what}-${x.id}`, q(`[data-focus-key="secret-${x.id}"], [data-focus-key="role-${x.id}"], [data-focus-key="rename-${x.id}"]`));
      return true;
    } catch (err) {
      if (!alive) return false;
      w.error.textContent = errorText(err); // the last owner made a worker: "The farm needs an owner"
      return false;
    } finally {
      workersBusy = false;
      if (w.error.textContent === STILL_SAVING) w.error.textContent = '';
    }
  }

  // The card's confirm on ask ({ title, text, go }: settings-math.js) → true when go was chosen; false on Cancel, Esc or the
  // page left, the cursor back on the button of focus key `key`. None opens while a change is on its way.
  async function confirmFirst(ask, key) {
    if (workersBusy) { w.error.textContent = STILL_SAVING; return false; }
    w.dialogTitle.textContent = ask.title;
    w.dialogText.textContent = ask.text;
    w.dialogGo.textContent = ask.go;
    w.dialog.returnValue = '';
    w.dialog.showModal();
    await new Promise((resolve) => w.dialog.addEventListener('close', resolve, { once: true }));
    if (!alive) return false;
    if (w.dialog.returnValue === 'go') return true;
    focusTo(key);
    return false;
  }

  // Make owner or Make worker, after a confirm: a new role needs a new PIN or password (the server clears the old one).
  async function changeRole(x, role) {
    if (!(await confirmFirst(roleConfirm(x.name, role, x.id === me()?.id), `role-${x.id}`))) return;
    if (!(await accountChange(x, 'PUT', 'role', { role })) && alive) focusTo(`role-${x.id}`);
  }

  // Sign out everywhere; your own row asks first (this page signs out too).
  async function signOut(x) {
    const ask = signOutConfirm(x.name, x.id === me()?.id);
    if (ask && !(await confirmFirst(ask, `sign-out-${x.id}`))) return;
    await accountChange(x, 'POST', 'sign-out');
  }

  // Set or change a worker's PIN, or another owner's password: the task dialog with one box; a new one signs them out
  // everywhere (the server's setSecret). None opens while a change is on its way.
  function openSecret(x, a) {
    if (workersBusy) { w.error.textContent = STILL_SAVING; return; }
    const action = secretAction(a);
    const key = `secret-${x.id}`;
    w.saved.hidden = true;
    const form = openDialog({
      title: `${action.label}: ${x.name}`,
      lead: [`${x.name} signs in with ${action.kind === 'pin' ? 'their name and this PIN' : 'this password'}. Saving it signs them out on every device.`],
      fields: [{ name: 'secret', label: action.field, kind: 'text', ...(action.kind === 'pin' ? { inputMode: 'numeric' } : {}) }],
      buttons: [{ value: 'save', label: 'Save', primary: true }],
      submit: async ({ secret }) => {
        try {
          await request('POST', `/api/workers/${x.id}/secret`, { secret }, COMMAND_TIMEOUT);
        } catch (err) {
          if (err.status === 400) return { field: 'secret', message: err.message };
          if (err.status === 409) { // made an owner or a worker meanwhile: the box was for the other kind; close, open again
            await loadAccounts();
            if (alive) paintWorkers();
            return { message: err.message, final: true };
          }
          if (err.status === 404 && !routeMissing(err)) { // removed in another window: the row goes
            await reloadWorkers();
            return { message: err.message, final: true };
          }
          return { message: errorText(err) };
        }
        await loadAccounts();
        if (alive) {
          paintWorkers();
          said(accountDone(x.name, 'secret', a.role));
        }
        return true;
      },
      onLost: (message) => { if (alive) w.error.textContent = message; },
    });
    secretForm = form;
    const box = form.input('secret');
    box.type = 'password';
    box.autocomplete = action.kind === 'pin' ? 'off' : 'new-password'; // a PIN box: no "suggest strong password"
    form.closed.then(() => { if (alive) focusTo(key, q(`[data-focus-key="rename-${x.id}"]`) || w.input); });
  }

  // Renaming yourself: the session's name and the top bar's follow (app.js wrote them at start).
  function renamedMe(name) {
    setMe({ ...me(), name });
    for (const node of document.querySelectorAll('[data-me-name]')) node.textContent = name;
    for (const b of document.querySelectorAll('[data-signout]')) b.setAttribute('aria-label', `${name}: Sign out`);
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
        if (x.id === me()?.id) renamedMe(p.value);
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
    // a crop's rule shows its first crop family (crop keys share the families' names), not the default oyster
    const pic = picture('task', rule.key ? taskPicture({ ruleKey: rule.key }) : 'own', { size: 24, crop: rule.families?.[0] ?? null }); // an own rule has an id, no key
    li.append(pic, text, ...extra, toggle(rule.enabled, rule.text, key, onToggle));
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
    const [wk, rl, rm] = await Promise.allSettled([
      request('GET', '/api/workers'), request('GET', '/api/task-rules'), request('GET', '/api/rooms'), loadAccounts(),
    ]);
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
    if (w.dialog.open) w.dialog.close();
    if (secretForm?.alive()) closeTaskDialog();
    container.replaceChildren();
  };
}
