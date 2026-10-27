// The room page's Room profile tab (spec 2026-10-26-room-profile-equipment-design.md section 2), instead of the Edit dialog, and
// the form behind each Equipment card (web/equipment.js, spec 2026-10-27-equipment-cards-design.md section 3).
// createRoomEdit(host, { roomId, groups, idPrefix, onSaved, onGone }) → { update(room), focus(name), destroy() }: a form of the
// room fields of those groups (web/room-fields.js), a card per group, one Save and Reset. update(room): the room the page loaded;
// a refresh never replaces what the person is editing or has edited and not saved. Save sends the whole room (PUT replaces a
// field left out): the form's values over the room last loaded. onSaved(room): saved; onGone(): the room no longer exists.
// createEditForm(form, options): the form behind it, also used by each Equipment card (below).
// createDeleteCard(host, { roomId, getRoom, onGone }) → { destroy() }: the Delete room card, with the Rooms list's confirm.

import { request, OFFLINE } from './api.js';
import { ROOM_GROUPS, fieldsOf, fieldTexts, parseRoomFields, roomBody } from './room-fields.js';
import { createRoomForm } from './room-form.js';

const SAVE_TIMEOUT = 30000; // a lights or dehumidifier taken out is switched off before the reply

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, className, type = 'button') {
  const b = el('button', className ?? '', label);
  b.type = type;
  return b;
}

// Writes only when the text changes, so a screen reader does not repeat an unchanged message.
function showError(node, text) {
  if (node.textContent !== text) node.textContent = text;
  node.hidden = text === '';
}

export function createRoomEdit(host, { roomId, groups, idPrefix, queue, onSaved, onGone }) {
  const names = groups.flatMap((key) => fieldsOf(key).map((f) => f.name));
  const shown = ROOM_GROUPS.filter((g) => groups.includes(g.key));
  const edit = createEditForm(host, { roomId, groups: shown, idPrefix, queue, check: (texts) => parseRoomFields(texts, names), onSaved, onGone });

  // A card per group; one group (the profile): Save in its card, else under the cards.
  const cards = shown.map((g) => {
    const card = el('section', 'card');
    card.dataset.group = g.key;
    card.append(el('h2', '', g.title), ...edit.fields.parts[g.key]);
    return card;
  });
  const end = groups.length === 1 ? cards[0] : el('div', 'room-send');
  end.append(...edit.end);
  host.append(...cards);
  if (end !== cards[0]) host.append(end);
  return { update: edit.update, focus: edit.focus, destroy: edit.destroy };
}

// createSaveQueue() → queue(run): the room page's saves one at a time (run: an async function; queue returns its result). A PUT
// replaces the whole room, so a form must not build its body until an earlier save has answered and every form has its room.
export function createSaveQueue() {
  let last = Promise.resolve();
  return (run) => {
    const next = last.then(run);
    last = next.catch(() => {});
    return next;
  };
}

// createEditForm(form, { roomId, groups, idPrefix, queue, check, saveWhenDirty, rest, onPaint, onSaved, onGone }) → { fields,
// end, update(room), focus(name), destroy() }. groups: groups of web/room-form.js. queue: the page's save queue (none: saves
// at once). check(texts, room) → { values } or { errors, other } (other: words for under the Save, a rule that blames a field
// elsewhere). end: the error line, the Save row and "Saved", for the caller to place. saveWhenDirty: the Save row shows only with
// unsaved edits; when it hides, the cursor goes to rest. onPaint(texts): the inputs were filled or changed. onSaved(room) runs
// before the next queued save starts, so the other forms can take the room first.
export function createEditForm(form, { roomId, groups, idPrefix, queue = (run) => run(), check, saveWhenDirty = false, rest, onPaint, onSaved, onGone }) {
  let alive = true;
  let loaded = null; // the room as the server last sent it
  let dirty = false;
  let saving = false;
  const fields = createRoomForm(groups, {
    idPrefix,
    onInput: () => {
      dirty = true;
      showError(formErr, '');
      saved.hidden = true;
      paintDirty();
      onPaint?.(fields.texts());
    },
  });

  const save = button('Save', 'primary', 'submit');
  const reset = button('Reset');
  reset.hidden = true;
  const unsent = el('span', 'unsent', 'Unsent changes');
  unsent.hidden = true;
  const sendRow = el('div', 'ac-send');
  sendRow.append(save, reset, unsent);
  const formErr = el('p', 'm-error');
  formErr.setAttribute('role', 'status');
  formErr.hidden = true;
  const saved = el('p', 's-saved', 'Saved');
  saved.setAttribute('role', 'status');
  saved.hidden = true;

  function paintDirty() {
    unsent.hidden = !dirty;
    reset.hidden = !dirty;
    if (saveWhenDirty) sendRow.hidden = !dirty;
  }
  paintDirty();

  function fill(room) {
    fields.fill(fieldTexts(room));
    onPaint?.(fields.texts());
  }

  // The cursor was in the form and got lost (the Save button disabled while saving, or its row hidden after): back to the Save,
  // or to rest when the row is hidden, not to the top of the page.
  function keepCursor() {
    const at = document.activeElement;
    if (at && at !== document.body && !(sendRow.hidden && sendRow.contains(at))) return;
    (sendRow.hidden ? rest : save)?.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || !loaded) return;
    fields.clearErrors();
    showError(formErr, '');
    saved.hidden = true;
    // Nothing typed: the form may hold values older than the room (a refresh skipped while a field had focus).
    if (!dirty) {
      fill(loaded);
      return;
    }
    const showChecks = (checked) => {
      fields.showErrors(checked.errors)?.focus();
      showError(formErr, checked.other ?? '');
    };
    const checked = check(fields.texts(), loaded);
    if (checked.errors) {
      showChecks(checked);
      return;
    }
    const hadCursor = form.contains(document.activeElement);
    saving = true;
    save.disabled = true;
    reset.disabled = true;
    try {
      // After waiting for another form's save, the room may be newer: checked again and the body built over it.
      const late = await queue(async () => {
        if (!alive) return null;
        const now = check(fields.texts(), loaded);
        if (now.errors) return now;
        const room = await request('PUT', `/api/rooms/${roomId}`, roomBody(loaded, now.values), SAVE_TIMEOUT);
        if (!alive) return null;
        loaded = room;
        dirty = false;
        fill(room);
        paintDirty();
        saved.hidden = false;
        onSaved?.(room);
        return null;
      });
      if (late && alive) showChecks(late);
    } catch (err) {
      if (!alive) return;
      if (err.status === 404) {
        onGone?.();
        return;
      }
      // A field of this form: the server's words under it; any other (or no field): under the form.
      const input = (err.status === 400 || err.status === 409) && err.field ? fields.showErrors({ [err.field]: err.message }) : null;
      if (input) input.focus();
      else showError(formErr, err.status === 0 ? `${OFFLINE}. Try again.` : err.message);
    } finally {
      saving = false;
      if (alive) {
        save.disabled = false;
        reset.disabled = false;
        if (hadCursor) keepCursor();
      }
    }
  });

  reset.addEventListener('click', () => {
    dirty = false;
    fields.clearErrors();
    showError(formErr, '');
    if (loaded) fill(loaded);
    paintDirty();
    (saveWhenDirty ? rest : save)?.focus();
  });

  return {
    fields,
    end: [formErr, sendRow, saved],
    update(room) {
      if (!alive || !room) return;
      loaded = room;
      // A refresh leaves alone what the person is editing, or has edited and not saved.
      const holding = dirty || saving || form.contains(document.activeElement);
      if (!holding) fill(room);
    },
    // Put the cursor in a field (a "Set address" button of another tab).
    focus(name) {
      fields.inputs[name]?.focus();
    },
    destroy() {
      alive = false;
      form.replaceChildren();
    },
  };
}

export function createDeleteCard(host, { roomId, getRoom, onGone }) {
  let alive = true;
  let asked = false; // the shared confirm dialog was opened from here
  const deleteDialog = document.getElementById('delete-dialog');
  const deleteText = document.getElementById('delete-text');
  const abort = new AbortController();

  host.append(el('h2', '', 'Delete room'), el('p', 'muted', 'The room goes with its readings, history, crop and simulations.'));
  const del = button('Delete room', 'danger');
  const err = el('p', 'm-error');
  err.setAttribute('role', 'status');
  err.hidden = true;
  host.append(del, err);

  del.addEventListener('click', () => {
    const room = getRoom();
    if (!room) return;
    showError(err, '');
    asked = true;
    deleteText.textContent = `Delete ${room.name}? This can't be undone.`;
    deleteDialog.returnValue = '';
    deleteDialog.showModal();
  });

  deleteDialog.addEventListener('close', async () => {
    if (!asked) return;
    asked = false;
    if (deleteDialog.returnValue !== 'delete') {
      del.focus();
      return;
    }
    del.disabled = true;
    try {
      await request('DELETE', `/api/rooms/${roomId}`);
      if (alive) location.hash = '#/rooms';
    } catch (e) {
      if (!alive) return;
      del.disabled = false;
      if (e.status === 404) onGone?.();
      else showError(err, e.status === 0 ? `${OFFLINE}. Try again.` : e.message);
    }
  }, { signal: abort.signal });

  return {
    destroy() {
      alive = false;
      abort.abort();
      if (asked && deleteDialog.open) deleteDialog.close();
      host.replaceChildren();
    },
  };
}
