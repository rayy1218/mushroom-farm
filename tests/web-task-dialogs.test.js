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
  has('return send(`/api/tasks/${row.id}/done`, { worker: w, ...(a === null ? {} : { amount: a }) });');
  has("if (!w) return { field: 'worker', message: 'Pick who did it' };");
  has("No names yet: add the workers' names in ");
  has("a.href = '#/settings';");
});

test('Skip asks who and why; Cancel (long-term) asks why; Add posts a text and a note', () => {
  has('return send(`/api/tasks/${row.id}/skip`, { worker: w, reason: r.value });');
  has('return send(`/api/tasks/${row.id}/cancel`, { reason: r.value });');
  has("request('POST', `/api/rooms/${roomId}/tasks`, { text: c.values.text, ...(c.values.note ? { note: c.values.note } : {}) }, COMMAND_TIMEOUT)");
});

test('a 409 or 404 asks for the list again (someone else closed it); the message stays in the dialog', () => {
  has('if (alive && (err.status === 409 || err.status === 404)) onChanged?.(null);');
});

test('a long-term machine task: Save and mark done saves Setup first and marks it done only when that worked', () => {
  const save = dialogs.indexOf("if (which === 'save' && !saved) {");
  const put = dialogs.indexOf("request('PUT', `/api/rooms/${row.roomId}`, built.body, COMMAND_TIMEOUT)", save);
  const mark = dialogs.indexOf('const r = await mark(v);', put);
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

test('one dialog, made on first use; a page that goes away closes it', () => {
  has("dialog = el('dialog', 'tk-dialog');");
  has('export function closeTaskDialog() {');
  has('destroy() {\n      alive = false;\n      closeTaskDialog();');
});
