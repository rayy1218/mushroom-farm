// The room page's Room profile and Equipment tabs (spec 2026-10-26-room-profile-equipment-design.md sections 2 and 3), instead
// of the Edit dialog.
// createRoomEdit(host, { roomId, groups, idPrefix, onSaved, onGone }) → { update(room), focus(name), destroy() }: a form of the
// room fields of those groups (web/room-fields.js), a card per group, one Save and Reset. update(room): the room the page loaded;
// a refresh never replaces what the person is editing or has edited and not saved. Save sends the whole room (PUT replaces a
// field left out): the form's values over the room last loaded. onSaved(room): saved; onGone(): the room no longer exists.
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

export function createRoomEdit(host, { roomId, groups, idPrefix, onSaved, onGone }) {
  let alive = true;
  let loaded = null; // the room as the server last sent it
  let dirty = false;
  let saving = false;
  const form = host;
  const names = groups.flatMap((key) => fieldsOf(key).map((f) => f.name));
  const fields = createRoomForm(ROOM_GROUPS.filter((g) => groups.includes(g.key)), {
    idPrefix,
    onInput: () => {
      dirty = true;
      showError(formErr, '');
      saved.hidden = true;
      paintDirty();
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

  // A card per group; one group (the profile): Save in its card, else under the cards.
  const cards = ROOM_GROUPS.filter((g) => groups.includes(g.key)).map((g) => {
    const card = el('section', 'card');
    card.dataset.group = g.key;
    card.append(el('h2', '', g.title), ...fields.parts[g.key]);
    return card;
  });
  const end = groups.length === 1 ? cards[0] : el('div', 'room-send');
  end.append(formErr, sendRow, saved);
  form.append(...cards);
  if (end !== cards[0]) form.append(end);

  function paintDirty() {
    unsent.hidden = !dirty;
    reset.hidden = !dirty;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || !loaded) return;
    fields.clearErrors();
    showError(formErr, '');
    saved.hidden = true;
    const checked = parseRoomFields(fields.texts(), names);
    if (checked.errors) {
      fields.showErrors(checked.errors).focus();
      return;
    }
    saving = true;
    save.disabled = true;
    reset.disabled = true;
    try {
      const room = await request('PUT', `/api/rooms/${roomId}`, roomBody(loaded, checked.values), SAVE_TIMEOUT);
      if (!alive) return;
      loaded = room;
      dirty = false;
      fields.fill(fieldTexts(room));
      paintDirty();
      saved.hidden = false;
      onSaved?.(room);
    } catch (err) {
      if (!alive) return;
      if (err.status === 404) {
        onGone?.();
        return;
      }
      // A field of this tab: the server's words under it; any other (or no field): under the form.
      const input = (err.status === 400 || err.status === 409) && err.field ? fields.showErrors({ [err.field]: err.message }) : null;
      if (input) input.focus();
      else showError(formErr, err.status === 0 ? `${OFFLINE}. Try again.` : err.message);
    } finally {
      saving = false;
      if (alive) {
        save.disabled = false;
        reset.disabled = false;
      }
    }
  });

  reset.addEventListener('click', () => {
    dirty = false;
    fields.clearErrors();
    showError(formErr, '');
    if (loaded) fields.fill(fieldTexts(loaded));
    paintDirty();
    save.focus();
  });

  return {
    update(room) {
      if (!alive || !room) return;
      loaded = room;
      // A refresh leaves alone what the person is editing, or has edited and not saved.
      const holding = dirty || saving || form.contains(document.activeElement);
      if (!holding) fields.fill(fieldTexts(room));
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
