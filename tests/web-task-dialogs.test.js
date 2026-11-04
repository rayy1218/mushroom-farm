// The task dialogs (spec 2026-10-30-tasks-design.md 7.1, 7.2, 7.4, 7.5). Source checks, like the other page tests; the
// numbers and words are tested in web-tasks-math.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dialogs = readFileSync(new URL('../web/task-dialogs.js', import.meta.url), 'utf8');
const has = (text, msg) => assert.ok(dialogs.includes(text), msg ?? text);

test('the worker is kept per browser under farm.worker; the pickers hear a change', () => {
  has("const WORKER_KEY = 'farm.worker';");
  has("window.dispatchEvent(new CustomEvent('farm:worker'));");
  has("window.addEventListener('farm:worker', onStore);");
  has("window.removeEventListener('farm:worker', onStore);");
  has("node.append(el('span', '', 'Doing the rounds as'), select);");
  has("const data = await request('GET', '/api/workers');");
});

test('Done is one tap with a kept worker and no amount; otherwise it asks', () => {
  has("if (row.kind !== 'longterm' && !recordsAmount(row) && worker && list.includes(worker)) {");
  has('const body = doneBody(row, w, v);');
  has('const r = await send(`/api/tasks/${row.id}/done`, body, form);');
  has("hint: 'Leave it empty if it was not weighed or counted.'");
  // a mixed room: the crops' boxes under one legend and one hint, each with its picture and "kg" in a narrow box (audit #15)
  has("kind: 'group', legend: 'kg picked', hint: 'Leave a box empty if that crop was not weighed.', className: 'tk-kg-group',");
  has("suffix: 'kg', pic: picture('crop', f.crop, { size: 24 })");
  has("const box = el(f.legend ? 'fieldset' : 'div',");
  has("x.addEventListener('click', () => { if (!busy) b.action(); });");
  has("r.field === 'amounts'");
  has("if (!w) return { field: 'worker', message: 'Pick who did it' };");
  has("No names yet: add the workers' names in ");
  has("a.href = '#/settings';");
});

test('Skip asks who and why; Cancel (long-term) asks why; Add posts a text and a note', () => {
  has('return send(`/api/tasks/${row.id}/skip`, { worker: w, reason: r.value }, form);');
  has('return send(`/api/tasks/${row.id}/cancel`, { reason: r.value });');
  has("request('POST', `/api/rooms/${roomId}/tasks`, { text: c.values.text, ...(c.values.note ? { note: c.values.note } : {}) }, COMMAND_TIMEOUT)");
});

test('a 409 or 404 asks for the list again (someone else closed it); the message stays in the dialog', () => {
  has('if (alive && (err.status === 409 || err.status === 404)) changed(null);');
});

test('a long-term machine task: Save and mark done saves Setup first and marks it done only when that worked', () => {
  const save = dialogs.indexOf("if (which === 'save' && !saved) {");
  const put = dialogs.indexOf("request('PUT', `/api/rooms/${row.roomId}`, built.body, COMMAND_TIMEOUT)", save);
  const mark = dialogs.indexOf('const r = await mark(v, form);', put);
  assert.ok(save > 0 && put > save && mark > put, 'Setup first, then Done');
  has("buttons: [{ value: 'just', label: 'Just mark done' }, { value: 'save', label: 'Save and mark done', primary: true }],");
  has('message: `Setup not saved: ${errorText(err)}`');
  has('const update = setupUpdate(row.source, room);');
  has('Setup keeps no fan flow, so Done only records the change.');
});

test('Plan this posts the suggestion and says when nothing changes', () => {
  has("request('POST', `/api/rooms/${roomId}/tasks`, plan.body, COMMAND_TIMEOUT)");
  // The dialog's own sentence (no Plan button then); the server's 400 for an empty plan has the same words with no full stop
  // and shows in the form's general line.
  has("'Nothing changes from what the room has now.'");
});

test("C10 review: Plan this from a search older than the room's machines offers no Plan; a 409 leaves only Cancel and links the Tasks tab", () => {
  has("const lead = plan.stale ? [`${roomName}'s machines changed since this search. Suggest again to plan from them.`]");
  has('buttons: plan.changes.length && !plan.stale ?');
  has("if (err.status === 409) {");
  has("link.href = roomHash(roomId, 'tasks');");
  has('return { message: text, content: [text.slice(0, at), link, text.slice(at + TASKS_TAB.length)], final: true };');
  // the form: content instead of the message's text (nodes, no innerHTML); final keeps the dialog's own buttons disabled
  has('if (one.content) formError.replaceChildren(...one.content);');
  has('if (outcome !== true && outcome.final) for (const b of sends) b.disabled = true;');
  assert.ok(!/innerHTML/.test(dialogs.slice(dialogs.indexOf('export function openPlanDialog'))));
});

test('one dialog, made on first use; a page that goes away closes it', () => {
  has("dialog = el('dialog', 'tk-dialog');");
  has('export function closeTaskDialog() {');
  has('destroy() {\n      alive = false;\n      window.removeEventListener(\'farm:worker\', forget);\n      offStatus();\n      closeTaskDialog();');
});

// ---- C5 review: run with a stand-in fetch, localStorage and window (no DOM: these paths open no dialog) ----

function stubs(t, answer) {
  const saved = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window };
  const store = new Map([['farm.worker', 'Ali']]);
  const calls = [];
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  globalThis.window = new EventTarget();
  globalThis.fetch = async (path, init) => {
    calls.push(`${init.method} ${path}`);
    return answer(path, init);
  };
  t.after(() => Object.assign(globalThis, saved));
  return calls;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ROW = { id: 7, kind: 'daily', status: 'open', text: 'Mist the walls', unit: null, amountLabel: null };

test('one-tap Done tapped twice sends one POST (the second tap is not a 409 of the worker\'s own tap)', async (t) => {
  const calls = stubs(t, async (path) => {
    if (path === '/api/workers') return json({ workers: [{ id: 1, name: 'Ali', active: true }] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    return json({ ...ROW, status: 'done', worker: 'Ali' });
  });
  const { createTaskActions } = await import('../web/task-dialogs.js');
  const changed = [];
  const errors = [];
  const actions = createTaskActions({ onChanged: (row) => changed.push(row?.status ?? null), onError: (text) => errors.push(text) });
  await Promise.all([actions.done(ROW), actions.done(ROW)]);
  assert.deepEqual(calls, ['GET /api/workers', 'POST /api/tasks/7/done']);
  assert.deepEqual([changed, errors], [['done'], []]);
  await actions.done(ROW); // once it has been answered, a tap sends again
  assert.equal(calls.filter((c) => c.startsWith('POST')).length, 2);
});

test('the workers could not be read: the page says so, no dialog says "No names yet", and the next tap reads them again', async (t) => {
  const calls = stubs(t, async () => { throw new TypeError('fetch failed'); });
  const { createTaskActions } = await import('../web/task-dialogs.js');
  const errors = [];
  const actions = createTaskActions({ onChanged: () => {}, onError: (text) => errors.push(text) });
  await actions.done(ROW);
  await actions.skip(ROW);
  assert.deepEqual(errors, ["Couldn't reach the farm server. Try again.", "Couldn't reach the farm server. Try again."]);
  assert.deepEqual(calls, ['GET /api/workers', 'GET /api/workers'], 'a failed read is not kept; nothing was posted');
});

test('the picker says the server could not be reached rather than "No names yet"', () => {
  has("const first = failed ? OFFLINE : names.length || !loaded ? 'Pick a name' : 'No names yet (Settings)';");
});

test('Esc does not close the dialog while it is sending (a failure would be lost)', () => {
  has('d.oncancel = (event) => { if (busy) event.preventDefault(); };');
});

test('Setup saved but the mark failed: the Setup boxes lock and the one button left reads Mark done', () => {
  has('for (const f of update) form.input(f.name).disabled = true;');
  has("form.button('save').textContent = 'Mark done';");
  has("form.button('just').hidden = true;");
});

test('Plan this: a dialog closed or a page gone before the answer tells no one', () => {
  has('if (form.alive()) onPlanned?.(rowsOf(data?.rows), rowsOf(data?.replaced));');
});

// ---- C5 re-review ----

test('a dialog closed while sending (Chrome lets a second Esc close it): a failure goes to the page, not to the closed form', () => {
  has("if (!alive() || !d.open) { // closed meanwhile (Chrome lets a second Esc close it): a failure is said on the page");
  has('if (outcome !== true) onLost?.((Array.isArray(outcome) ? outcome[0] : outcome).message);');
  has('openForm({ ...options, onLost: (text) => { if (alive) onError?.(text); } })');
});

test('the picker that could not read the names reads them again when the live stream comes back', () => {
  has("import { live } from './live.js';");
  has('const offStatus = live.onStatus((up) => { if (up && alive) load(); });');
  has('offStatus();');
});

test("Done, Skip and Cancel end with whether anything changed, so the row's held buttons let go when nothing did", async (t) => {
  let fail = false;
  stubs(t, async (path) => {
    if (path === '/api/workers') return json({ workers: [{ id: 1, name: 'Ali', active: true }] });
    if (fail) throw new TypeError('fetch failed');
    return json({ ...ROW, status: 'done', worker: 'Ali' });
  });
  const { createTaskActions } = await import('../web/task-dialogs.js');
  const actions = createTaskActions({ onChanged: () => {}, onError: () => {} });
  assert.equal(await actions.done(ROW), true, 'sent: the list repaints');
  fail = true;
  assert.equal(await actions.done(ROW), false, 'not sent: the buttons let go');
  has('return changes !== before;');
  has("const form = ask({\n      title: 'Mark done',");
  has('await form.closed;');
});

test('a row stays held until its request is answered, even when a second Esc closed the dialog first', () => {
  has('sending = answer.catch(() => {});');
  has('}).then(() => sending);');
});

// ---- C13 live check ----

test('the Skip dialog asks "Who is skipping it"; Done keeps "Who did it"', () => {
  has("const workerField = (list, label = 'Who did it') => ({");
  has("fields: [workerField(list, 'Who is skipping it'), { name: 'reason', label: 'Why', kind: 'text', value: '' }],");
  assert.equal(dialogs.split("workerField(list, 'Who is skipping it')").length, 2, 'Skip alone');
});

// ---- final review ----

// live.onStatus stood in for: → the listeners it was given (the module's own stream never connects under node).
async function liveStub(t) {
  const { live } = await import('../web/live.js');
  const fns = new Set();
  const saved = live.onStatus;
  live.onStatus = (fn) => { fns.add(fn); return () => fns.delete(fn); };
  t.after(() => { live.onStatus = saved; });
  return (up) => { for (const fn of [...fns]) fn(up); };
}

test('the kept workers are read again after the worker changes and when the live stream comes back, not when it goes', async (t) => {
  const status = await liveStub(t);
  const calls = stubs(t, async (path) => (path === '/api/workers'
    ? json({ workers: [{ id: 1, name: 'Ali', active: true }] })
    : json({ ...ROW, status: 'done', worker: 'Ali' })));
  const { createTaskActions } = await import('../web/task-dialogs.js');
  const actions = createTaskActions({ onChanged: () => {}, onError: () => {} });
  const reads = () => calls.filter((c) => c === 'GET /api/workers').length;
  await actions.done(ROW);
  await actions.done(ROW);
  assert.equal(reads(), 1, 'kept between taps');
  window.dispatchEvent(new CustomEvent('farm:worker'));
  await actions.done(ROW);
  assert.equal(reads(), 2, 'read again after a farm:worker change');
  status(false);
  await actions.done(ROW);
  assert.equal(reads(), 2, 'the stream going down keeps them');
  status(true);
  await actions.done(ROW);
  assert.equal(reads(), 3, 'read again when the stream is back (Settings may have changed them meanwhile)');
  actions.destroy();
  window.dispatchEvent(new CustomEvent('farm:worker'));
  status(true);
  assert.equal(reads(), 3);
});

test('a name the server refuses as not on the workers list: the page says so and the list is read again, here and in the pickers', async (t) => {
  await liveStub(t);
  const calls = stubs(t, async (path) => (path === '/api/workers'
    ? json({ workers: [{ id: 1, name: 'Ali', active: true }] })
    : json({ error: 'That name is not on the workers list', field: 'worker' }, 400)));
  const { createTaskActions } = await import('../web/task-dialogs.js');
  let heard = 0;
  window.addEventListener('farm:worker', () => { heard++; });
  const errors = [];
  const changed = [];
  const actions = createTaskActions({ onChanged: (row) => changed.push(row), onError: (text) => errors.push(text) });
  await actions.done(ROW);
  assert.deepEqual([errors, changed, heard], [['That name is not on the workers list'], [], 1]);
  await actions.done(ROW);
  assert.deepEqual(calls.filter((c) => c === 'GET /api/workers').length, 2, 'the next tap reads the list again');
});

test('a 409 (someone else closed it): the list is asked again and the server\'s words are shown', async (t) => {
  await liveStub(t);
  stubs(t, async (path) => (path === '/api/workers'
    ? json({ workers: [{ id: 1, name: 'Ali', active: true }] })
    : json({ error: 'Already done by Siti at 09:12' }, 409)));
  const { createTaskActions } = await import('../web/task-dialogs.js');
  const errors = [];
  const changed = [];
  const actions = createTaskActions({ onChanged: (row) => changed.push(row), onError: (text) => errors.push(text) });
  assert.equal(await actions.done(ROW), true, 'something changed: the row stays held until the list repaints');
  assert.deepEqual([changed, errors], [[null], ['Already done by Siti at 09:12']]);
});

test('an empty workers list is not kept (the first name added in Settings is seen); the picker reads the list again on a change and when the stream is back', () => {
  has('names = list.length ? list : null;');
  has("const onStore = () => { if (alive) { paint(); load(); } };");
  has('const offStatus = live.onStatus((up) => { if (up && alive) load(); });');
});
