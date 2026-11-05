// The line under the attention line (the list) or the head (an item's page) after a record (audit 2026-11-05 #2): what was
// saved, "Used 1.00 L of Bleach in Container 1 by Sara · Undo", a polite live region. Undo (a new purchase, use, throw-out
// or count, for UNDO_MS) deletes the new move(s) (DELETE /api/inventory/moves/:id; a count: each of its moves) and says
// "Undone"; an edit or a delete says "Saved" or "Deleted" alone. Count stock hands its result over to the list through
// sessionStorage (FLASH_KEY), as it leaves the page.
//   createDoneLine(node, { onUndone(), onError(text) }) → { show(result), hide(), destroy() }
//   result: { text, moves: [ids] (Undo; none: no Undo), at (ms, when it was saved) }

import { request } from './api.js';
import { errorText } from './task-dialogs.js';
import { DOT } from './text-math.js';
import { undoLeft } from './inventory-math.js';

export const FLASH_KEY = 'farm.inventory.flash';

// Count stock's result for the list, shown once on its next mount.
export function keepFlash(result) {
  try { sessionStorage.setItem(FLASH_KEY, JSON.stringify(result)); } catch { /* the list then says nothing */ }
}
export function takeFlash() {
  try {
    const text = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
    return text ? JSON.parse(text) : null;
  } catch { return null; }
}

export function createDoneLine(node, { onUndone, onError } = {}) {
  let timer = null;
  let alive = true;
  node.tabIndex = -1; // the focus comes here when Undo, the button it was on, goes
  const hide = () => {
    clearTimeout(timer);
    timer = null;
    node.hidden = true;
    node.replaceChildren();
  };
  const later = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(hide, ms);
  };
  function say(text, ms) {
    node.replaceChildren(text);
    node.hidden = false;
    later(ms);
  }

  async function undo(result, button) {
    button.disabled = true;
    const hadFocus = document.activeElement === button;
    try {
      for (const id of result.moves) {
        try {
          await request('DELETE', `/api/inventory/moves/${id}`);
        } catch (err) {
          if (err.status !== 404) throw err; // gone already (deleted elsewhere): nothing left to undo of it
        }
      }
      if (!alive) return;
      say('Undone', 10_000);
      onUndone?.();
    } catch (err) {
      if (!alive) return;
      button.disabled = false;
      onError?.(errorText(err));
    }
    if (hadFocus && alive) node.focus();
  }

  function show(result) {
    if (!result?.text) return;
    const left = result.moves?.length ? undoLeft(result.at ?? Date.now(), Date.now()) : 0;
    if (!left) {
      if (result.moves?.length) return; // a flash whose minute is over: nothing to say any more
      say(result.text, 10_000);
      return;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'iv-link iv-undo';
    b.textContent = 'Undo';
    b.addEventListener('click', () => undo(result, b));
    node.replaceChildren(result.text, DOT, b);
    node.hidden = false;
    later(left);
  }

  return {
    show,
    hide,
    destroy() {
      alive = false;
      clearTimeout(timer);
    },
  };
}
