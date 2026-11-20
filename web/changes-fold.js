// The History fold of a money record (spec 2026-11-12-data-integrity-design.md 11): at a dialog's foot over its buttons, the
// record's change log entries newest first, read when it is opened; "All changes" opens the Changes page. The owner's only:
// a worker's dialogs have none (the log holds money).

import { request } from './api.js';
import { isOwner } from './session.js';
import { entryLine, BEFORE_LOG } from './changes-math.js';
import { changesHash } from './route.js';

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

let seq = 0;
// A fold for the record (kind, id), closed: { node }. Its title says the count once read.
export function historyFold({ kind, id }) {
  const n = ++seq;
  const wrap = el('div', 'dx-history');
  const toggle = el('button', 'dx-history-toggle', 'History');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  const panel = el('div', 'dx-history-panel');
  panel.id = `dx-history-${n}`;
  panel.hidden = true;
  toggle.setAttribute('aria-controls', panel.id);
  wrap.append(toggle, panel);
  let read = false;
  toggle.addEventListener('click', async () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (!open || read) return;
    read = true;
    panel.replaceChildren(el('p', 'muted dx-history-wait', 'Reading the history…'));
    try {
      const { entries, before, since } = await request('GET', `/api/changes?kind=${encodeURIComponent(kind)}&id=${id}`);
      const list = el('ol', 'dx-history-list');
      for (const e of entries.toReversed()) {
        const li = el('li', '', entryLine(e));
        list.append(li);
      }
      if (before) list.append(el('li', 'muted', BEFORE_LOG(since)));
      const all = el('a', 'dx-history-all', 'All changes');
      all.href = changesHash({ kind, id });
      panel.replaceChildren(list, all);
      toggle.textContent = `History (${entries.length})`;
    } catch (err) {
      read = false;
      panel.replaceChildren(el('p', 'field-error', err.message));
    }
  });
  return { node: wrap };
}

// The fold put at the open dialog's foot, over its buttons (the owner's only). → the fold, or null.
export function addHistory({ kind, id }) {
  if (!isOwner()) return null;
  const form = document.querySelector('dialog[open] > form');
  if (!form) return null;
  const fold = historyFold({ kind, id });
  form.insertBefore(fold.node, form.querySelector(':scope > .actions'));
  return fold;
}
