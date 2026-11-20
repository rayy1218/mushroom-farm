// Void and restore (spec 2026-11-12-data-integrity-design.md 4 and 11), for every money record: the void's confirm with its
// required reason, a voided record's own dialog (the void said, Restore, its History), each taking the server's asks (a
// closed month) the way every dialog does.

import { request } from './api.js';
import { openForm as openTaskForm, errorText } from './task-dialogs.js';
import { isAsk, anyway, createConfirm } from './asks.js';
import { addHistory } from './changes-fold.js';
import { isOwner } from './session.js';
import { voidLine } from './changes-math.js';

const TIMEOUT = 15000;
const STAYS = 'It stays in the list, struck through, and leaves every figure.';

// The tasks' openForm with the Business dialogs' form class.
function openForm(options) {
  const handle = openTaskForm(options);
  document.querySelector('dialog.tk-dialog[open] > form')?.classList.add('bz-form');
  return handle;
}

// A post with the asks: the same body sent again goes with them confirmed. → true, or the problem to show.
async function send(path, body, confirm, primary, label, field) {
  try {
    await request('POST', path, confirm.body(body), TIMEOUT);
    return true;
  } catch (err) {
    if (isAsk(err)) {
      confirm.asked(body, err.asks);
      primary.textContent = anyway(label);
      return { field, message: err.asks.map((a) => a.text).join(' '), warn: true };
    }
    if (err.status === 400 && err.field === 'reason') return { field: 'reason', message: err.message };
    return { message: errorText(err) };
  }
}

// The void's confirm: title "Void the sale of 3 Nov to Restoran Wong?", lead what it held; a reason (3–200 characters).
// → the form's handle (closed: a promise).
export function openVoid({ title, lead = [], label, path, onChanged, onError, hint = 'Entered twice' }) {
  const confirm = createConfirm();
  let handle = null;
  handle = openForm({
    title,
    lead: [...lead, STAYS],
    fields: [{ name: 'reason', label: 'Why void it?', kind: 'text', placeholder: hint, maxLength: 200 }],
    buttons: [{ value: 'void', label, primary: true, danger: true }],
    submit: async (v) => {
      const reason = String(v.reason ?? '').trim();
      if (reason.length < 3) return { field: 'reason', message: 'Say why, in a few words' };
      const r = await send(path, { reason }, confirm, handle.button('void'), label, 'reason');
      if (r === true) onChanged();
      return r;
    },
    onLost: onError,
  });
  return handle;
}

// A voided record's dialog: its words, "Voided 10 Nov by Lim: Entered twice", its History; Restore (the owner's).
export function openVoided({ title, lead = [], voided, path, onChanged, onError, kind, id }) {
  const confirm = createConfirm();
  let handle = null;
  const owner = isOwner();
  handle = openForm({
    title,
    lead: [...lead, voidLine(voided)],
    buttons: owner ? [{ value: 'restore', label: 'Restore', primary: true }] : [],
    closeLabel: 'Close',
    submit: async () => {
      const r = await send(path, {}, confirm, handle.button('restore'), 'Restore', null);
      if (r === true) onChanged();
      return r;
    },
    onLost: onError,
  });
  if (kind && id) addHistory({ kind, id });
  return handle;
}
