// The task rows shared by the room's Tasks tab and the Today page (spec 2026-10-30-tasks-design.md 7.1 and 7.2): a row's
// text with the crop notes muted under it and its due words, Done and Skip (or Cancel) in place; a slot's closed rows
// folded under "6 done". actions: createTaskActions' { done, skip, cancel }.

import { closedLine } from './tasks-math.js';
import { keepLines } from './text-math.js';

export function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

export function button(label, className) {
  const b = el('button', className ?? '', label);
  b.type = 'button';
  return b;
}

// One task as a list item. due: dueWords' { text, tone } (upkeep); line: the first line (a long-term row's longtermLine);
// skip, cancel: the second button of an open row.
export function taskRow(row, actions, { due = null, line = row.text, skip = true, cancel = false } = {}) {
  const li = el('li', 'tk-row');
  li.dataset.status = row.status;
  li.dataset.kind = row.kind;
  const text = el('div', 'tk-text');
  text.append(el('p', 'tk-title', keepLines(line)));
  if (row.note) text.append(el('p', 'tk-note', keepLines(row.note)));
  if (due?.text) {
    const words = el('p', 'tk-due', due.text);
    if (due.tone) words.dataset.tone = due.tone;
    text.append(words);
  }
  li.append(text);
  if (row.status !== 'open') {
    text.append(el('p', 'tk-closed-line', keepLines(closedLine(row))));
    return li;
  }
  const box = el('div', 'tk-actions');
  // A tap holds the row's buttons until the list repaints: a second tap between the answer and the repaint would send
  // again and come back as a 409. They only look disabled (aria-disabled): a disabled button would lose the cursor to the
  // page. An action that changed nothing (its dialog closed, it failed) lets go of them.
  let busy = false;
  const tap = (b, action) => b.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    const plan = focusPlan(b); // where the cursor goes if this row is gone when the dialog closes
    const held = [...box.querySelectorAll('button')];
    for (const x of held) x.setAttribute('aria-disabled', 'true');
    const release = () => {
      busy = false;
      for (const x of held) x.removeAttribute('aria-disabled');
    };
    Promise.resolve(action()).then((changed) => {
      if (!changed) release();
      // A dialog that closed after the repaint gives the focus back to a button that is gone: the plan made at the tap is used.
      if (changed && !b.isConnected && document.activeElement === document.body) refocus(document, plan);
    }, release);
  });
  const done = button('Done');
  done.setAttribute('aria-label', `Done: ${row.text}`);
  done.dataset.focusKey = `done-${row.id}`;
  tap(done, () => actions.done(row));
  box.append(done);
  if (skip) {
    const b = button('Skip');
    b.setAttribute('aria-label', `Skip: ${row.text}`);
    b.dataset.focusKey = `skip-${row.id}`;
    tap(b, () => actions.skip(row));
    box.append(b);
  }
  if (cancel) {
    const b = button('Cancel');
    b.setAttribute('aria-label', `Cancel the task: ${row.text}`);
    b.dataset.focusKey = `cancel-${row.id}`;
    tap(b, () => actions.cancel(row));
    box.append(b);
  }
  li.append(box);
  return li;
}

// One slot of the day (slotGroups' group): its title, its open rows, and its closed rows folded under "6 done". openFolds:
// the folds a repaint keeps open (by foldKey).
export function slotPart(group, actions, { level = 'h3', openFolds = new Set(), foldKey = group.slot } = {}) {
  const part = el('div', 'tk-slot');
  part.dataset.foldKey = foldKey;
  part.append(el(level, 'tk-slot-title', group.label));
  if (group.open.length) {
    const list = el('ul', 'tk-list');
    list.append(...group.open.map((row) => taskRow(row, actions)));
    part.append(list);
  }
  if (group.closed.length) {
    const fold = el('details', 'tk-fold');
    fold.open = openFolds.has(foldKey);
    fold.addEventListener('toggle', () => { if (fold.open) openFolds.add(foldKey); else openFolds.delete(foldKey); });
    const list = el('ul', 'tk-list');
    list.append(...group.closed.map((row) => taskRow(row, actions)));
    const summary = el('summary', '', keepLines(group.fold));
    summary.dataset.focusKey = `fold-${foldKey}`;
    fold.append(summary, list);
    part.append(fold);
  }
  return part;
}

// Where the cursor goes when a repaint takes its button away (the row was closed): the same button, else the next row's,
// the previous row's, the slot's fold, the part's title. → { keys, heading }
const keyOf = (li) => li?.querySelector('[data-focus-key]')?.dataset.focusKey;
export function focusPlan(node) {
  const row = node.closest?.('.tk-row');
  let next = row?.nextElementSibling;
  while (next && !keyOf(next)) next = next.nextElementSibling; // a closed row has no button
  let prev = row?.previousElementSibling;
  while (prev && !keyOf(prev)) prev = prev.previousElementSibling;
  const slot = node.closest?.('.tk-slot');
  const fold = slot ? `fold-${slot.dataset.foldKey}` : null;
  const keys = [node.dataset?.focusKey, keyOf(next), keyOf(prev), fold].filter(Boolean);
  const part = node.closest?.('.tk-part, .card');
  return { keys, heading: part?.querySelector('h2') ?? null };
}

export function refocus(root, { keys, heading }) {
  for (const key of keys) {
    const node = root.querySelector(`[data-focus-key="${key}"]`);
    if (node) { node.focus(); return; }
  }
  if (heading?.isConnected) {
    heading.tabIndex = -1;
    heading.focus();
  }
}

// Keeps the focus across a repaint (a refresh must not throw it to the top of the page), on the same button or the nearest.
export function keepFocus(host, paint) {
  const plan = host.contains(document.activeElement) ? focusPlan(document.activeElement) : null;
  paint();
  if (plan && !host.contains(document.activeElement)) refocus(host, plan);
}
