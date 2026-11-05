// The Sales dialogs (spec 2026-11-05-sales-design.md 3 and 6): Record / Edit sale (its own <dialog>: lines are added and
// removed, and "New buyer…" opens a name and a phone in place), Mark paid, the Delete confirm and Buyers (openForm's).
// Each takes { onChanged(), onError(text) } from the page; when its dialog closes the cursor goes back to the button that
// opened it (or, that one gone, the page's title).

import { request } from './api.js';
import { openForm as openTaskForm, errorText } from './task-dialogs.js';
import { CROP_KEYS, cropShortName } from './crops.js';
import { farmDate, dayTitle } from './tasks-math.js';
import { rmText, whenMs } from './harvest-math.js';
import { lineTotal, footText, prefill, unlikely, saleBody, deleteTitle, deleteLead, priceText, paidMark, num, deliveryRow } from './sales-math.js';
import { DOT } from './text-math.js';

// The tasks' openForm with the Business dialogs' form class (bz-form: the footer sticks at the dialog's foot on a phone, a
// Delete on its own row; DESIGN.md "Business").
function openForm(options) {
  const handle = openTaskForm(options);
  document.querySelector('dialog.tk-dialog[open] > form')?.classList.add('bz-form');
  return handle;
}

const TIMEOUT = 15000;
const MAX_LINES = 9; // keep in step with server/sales-math.js
const NEW = 'new';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, className = '', type = 'button') {
  const b = el('button', className, label);
  b.type = type;
  return b;
}

// The first of these focus keys the page shows, else its title.
function focusKeyed(keys) {
  for (const key of keys) {
    const node = key ? document.querySelector(`[data-focus-key="${key}"]`) : null;
    if (node && !node.closest('[hidden]')) { node.focus(); return; }
  }
  document.querySelector('h1.page-title')?.focus();
}

// The cursor back where it was when a dialog opened, once no dialog is open (one replaced by the next keeps it): the
// opener, or the button the page drew in its place (the same focus key), then `also` (focus keys), else the page's title.
// The page draws its rows again after a write: when that drops the opener (a sale paid leaves Owed, a deleted sale its
// row) and the cursor with it, it goes on the same way.
function giveBack(opener, also = []) {
  if (document.querySelector('dialog[open]')) return;
  const keys = [opener?.dataset?.focusKey, ...also];
  if (!opener?.isConnected || opener === document.body) { focusKeyed(keys); return; } // body: a browser that does not focus a tapped button
  opener.focus();
  // until the person moves on (a tap, a key) or 10 s
  const stop = () => {
    watch.disconnect();
    clearTimeout(timer);
    document.removeEventListener('pointerdown', stop, true);
    document.removeEventListener('keydown', stop, true);
  };
  const watch = new MutationObserver(() => {
    if (opener.isConnected) return;
    stop();
    if (document.activeElement === document.body || document.activeElement === null) focusKeyed(keys);
  });
  watch.observe(document.body, { childList: true, subtree: true });
  const timer = setTimeout(stop, 10000);
  document.addEventListener('pointerdown', stop, true);
  document.addEventListener('keydown', stop, true);
}

// A box's words under it gone (an error or an amber question), and its marks.
function clearBox({ input, error }) {
  error.textContent = '';
  error.classList.remove('field-warn');
  input.removeAttribute('aria-invalid');
  delete input.dataset.warn;
}

// A labelled box with its error line, cleared as the box is changed: { wrap, input, error }. kind: 'text' | 'date' | 'select'; suffix/prefix: a unit.
function field({ id, label, kind = 'text', value = '', hint = null, suffix = null, prefix = null, options = null, maxLength = null }) {
  const wrap = el('div', 'field');
  const lab = el('label', '', label);
  lab.htmlFor = id;
  let input;
  if (kind === 'select') {
    input = el('select');
    for (const [v, text] of options) {
      const o = el('option', '', text);
      o.value = v;
      input.append(o);
    }
    input.value = value;
  } else {
    input = el('input');
    input.type = kind;
    input.autocomplete = 'off';
    if (kind === 'text' && (suffix || prefix)) input.inputMode = 'decimal';
    if (maxLength) input.maxLength = maxLength;
    input.value = value;
  }
  input.id = id;
  const error = el('p', 'field-error');
  error.id = `${id}-error`;
  error.setAttribute('aria-live', 'polite');
  const described = [error.id];
  let box = input;
  if (suffix || prefix) {
    box = el('span', `tk-suffix-box${prefix ? ' sl-prefixed' : ''}`);
    if (prefix) box.append(el('span', 'tk-suffix sl-prefix', prefix));
    box.append(input);
    if (suffix) box.append(el('span', 'tk-suffix', suffix));
    for (const s of box.querySelectorAll('.tk-suffix')) s.setAttribute('aria-hidden', 'true');
  }
  wrap.append(lab, box);
  if (hint !== null) {
    const h = el('p', 'c-hint', hint);
    h.id = `${id}-hint`;
    described.unshift(h.id);
    wrap.append(h);
  }
  wrap.append(error);
  input.setAttribute('aria-describedby', described.join(' '));
  input.addEventListener('input', () => clearBox({ input, error }));
  return { wrap, input, error };
}

let saleDialog = null;
let lineSeq = 0; // a line's boxes' ids
let saleSeq = 0; // every opening of the sale dialog gets a token: an answer that finds it changed goes to the page
function ensureSaleDialog() {
  if (saleDialog) return saleDialog;
  saleDialog = el('dialog', 'tk-dialog sl-dialog');
  saleDialog.setAttribute('aria-labelledby', 'sl-dialog-title');
  document.body.append(saleDialog);
  return saleDialog;
}

// Record a sale (delivery null) or Edit one: the buyers, the rooms and the expected prices are read first.
export async function openSale({ delivery, onChanged, onError, opener = document.activeElement }) {
  const me = ++saleSeq;
  let buyers;
  let rooms;
  let cropYield;
  try {
    [{ buyers }, rooms, { cropYield }] = await Promise.all([
      request('GET', '/api/buyers'), request('GET', '/api/rooms'), request('GET', '/api/settings'),
    ]);
  } catch (err) {
    if (me === saleSeq) onError(errorText(err));
    return;
  }
  if (me !== saleSeq) return; // opened again meanwhile
  const roomList = (Array.isArray(rooms) ? rooms : rooms.rooms ?? []).toSorted((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const d = ensureSaleDialog();
  if (d.open) d.close();
  d.replaceChildren();
  // Closed (a second Esc while sending) or opened again since a send began: its end is said on the page instead.
  const gone = () => me !== saleSeq || !d.open;
  const lost = (ok, text) => { if (ok) onChanged(); else onError(text); };
  let busy = false;
  let asked = null; // the values the unlikely question was asked for
  const held = []; // the buttons off while sending: the paid toggle, Delete this sale, Cancel, the primary
  const hold = (on) => {
    busy = on;
    for (const b of held) b.disabled = on;
  };
  const form = el('form', 'sl-form bz-form'); // bz-form: the footer sticks at the dialog's foot on a phone (DESIGN.md "Business")
  form.noValidate = true;
  const title = el('h2', 'sl-dialog-title', delivery ? 'Edit sale' : 'Record a sale');
  title.id = 'sl-dialog-title';
  title.tabIndex = -1;
  const formError = el('p', 'form-error');
  formError.setAttribute('role', 'alert');
  formError.tabIndex = -1;
  formError.hidden = true;
  form.append(title, formError);
  // An Edit's paid state: "Unpaid" with Mark paid (its own dialog), or "Paid 9 Nov" with a quiet Mark unpaid.
  if (delivery) {
    const mark = paidMark(delivery);
    const line = el('p', 'sl-paid-line');
    const toggle = button(mark.unpaid ? 'Mark paid' : 'Mark unpaid', mark.unpaid ? '' : 'tk-quiet');
    held.push(toggle);
    toggle.addEventListener('click', async () => {
      if (busy) return;
      if (mark.unpaid) {
        d.close();
        openPaid({ delivery, onChanged, onError, opener });
        return;
      }
      hold(true);
      let ok = false;
      let text = '';
      try {
        await request('PUT', `/api/sales/deliveries/${delivery.id}/paid`, { paidAt: null }, TIMEOUT);
        ok = true;
      } catch (err) {
        text = errorText(err);
      }
      if (gone()) { lost(ok, text); return; }
      hold(false);
      if (ok) {
        d.close();
        onChanged();
      } else show({ message: text });
    });
    line.append(el('span', mark.unpaid ? 'sl-unpaid' : '', mark.text), toggle);
    form.append(line);
  }

  const now = Date.now();
  const boxes = new Map(); // field name → { input, error }
  const keep = (name, f) => { boxes.set(name, f); return f.wrap; };

  // The day, its words under it.
  const date = field({ id: 'sl-date', label: 'Date', kind: 'date', value: farmDate(delivery?.soldAt ?? now), hint: '' });
  date.input.max = farmDate(now);
  const dateHint = date.wrap.querySelector('.c-hint');
  const showDay = () => { dateHint.textContent = DAY.test(date.input.value) ? dayTitle(date.input.value) : ''; };
  showDay();
  date.input.addEventListener('input', showDay);

  // The buyer: the active ones A–Z (the sale's own archived buyer kept, marked), then New buyer….
  const active = buyers.filter((b) => !b.archived || b.id === delivery?.buyerId);
  const buyerOptions = active.map((b) => [String(b.id), b.archived ? `${b.name} (archived)` : b.name]);
  const buyer = field({
    id: 'sl-buyer', label: 'Buyer', kind: 'select', options: [...buyerOptions, [NEW, 'New buyer…']],
    value: delivery ? String(delivery.buyerId) : NEW,
  });
  // Record with buyers: "Pick a buyer" first (chosen, not choosable), the prices filled once one is picked; with none, New buyer….
  if (!delivery && active.length) {
    const pick = el('option', '', 'Pick a buyer');
    pick.value = '';
    pick.disabled = true;
    buyer.input.prepend(pick);
    buyer.input.value = '';
  }
  const newName = field({ id: 'sl-new-name', label: 'Name', maxLength: 60 });
  const newPhone = field({ id: 'sl-new-phone', label: 'Phone (optional)', maxLength: 30 });
  const newBox = el('div', 'sl-new-buyer');
  newBox.append(keep('newName', newName), keep('newPhone', newPhone));
  const showNew = () => { newBox.hidden = buyer.input.value !== NEW; };
  showNew();

  const ref = field({
    id: 'sl-ref', label: "Buyer's reference (optional)", value: delivery?.invoiceNo ?? '', hint: 'Their invoice or receipt number', maxLength: 40,
  });
  const note = field({ id: 'sl-note', label: 'Note (optional)', value: delivery?.note ?? '', maxLength: 200 });
  // from 900 px two columns: Date | Buyer, Reference | Note (the note next to the reference, so the order is the same read or tabbed)
  date.wrap.classList.add('sl-f-date');
  buyer.wrap.classList.add('sl-f-buyer');
  ref.wrap.classList.add('sl-f-ref');
  note.wrap.classList.add('sl-f-note');
  form.append(keep('date', date), keep('buyerId', buyer), newBox, keep('invoiceNo', ref), keep('note', note));

  // The lines.
  const linesBox = el('fieldset', 'sl-lines-box');
  linesBox.append(el('legend', '', 'Crops'));
  const lineList = el('div', 'sl-line-list');
  const add = button('Add a crop', 'sl-add');
  linesBox.append(lineList, add);
  const foot = el('p', 'sl-foot');
  form.append(linesBox, foot);

  const lines = []; // { crop, kg, price, room, total, expected, row, remove, typed }
  const chosenBuyer = () => buyers.find((b) => String(b.id) === buyer.input.value) ?? null;
  const used = (except) => new Set(lines.filter((l) => l !== except).map((l) => l.crop.input.value));
  const roomOptions = [...roomList.map((r) => [String(r.id), r.name]), ['', 'Mixed']];

  // The lines' names (for a screen reader), totals, Remove (two lines or more), the crops other lines have, Add a crop, the
  // foot; the boxes by line number.
  function refresh() {
    for (const name of [...boxes.keys()]) if (name.startsWith('lines.')) boxes.delete(name);
    lines.forEach((l, i) => {
      const crop = cropShortName(l.crop.input.value);
      l.row.setAttribute('aria-label', `Line ${i + 1}, ${cropShortName(l.crop.input.value)}`);
      l.remove.setAttribute('aria-label', `Remove ${crop}`);
      l.total.textContent = lineTotal(l.kg.input.value, l.price.input.value);
      l.remove.hidden = lines.length < 2;
      for (const [suffix, f] of [['crop', l.crop], ['kg', l.kg], ['priceKg', l.price], ['roomId', l.room]]) boxes.set(`lines.${i}.${suffix}`, f);
      const taken = used(l);
      for (const o of l.crop.input.options) o.disabled = taken.has(o.value);
    });
    add.disabled = lines.length >= MAX_LINES || used(null).size >= CROP_KEYS.length;
    foot.textContent = footText(lines.map((l) => ({ kg: l.kg.input.value, priceKg: l.price.input.value })));
  }

  // The muted "expected" beside a pre-filled expected price, read with the box while it shows (and the line's question).
  function showExpected(l, on) {
    l.expected.hidden = !on;
    l.price.input.setAttribute('aria-describedby', [on ? l.expected.id : null, l.price.error.id, l.check.id].filter(Boolean).join(' '));
  }

  // The line's question about a box (kg, priceKg) gone.
  function clearCheck(l, which) {
    for (const s of l.check.querySelectorAll(`[data-for="${which}"]`)) s.remove();
  }

  // The price from the buyer or Settings, unless one was typed; none before a buyer is picked.
  function fillPrice(l) {
    if (l.typed) return;
    if (buyer.input.value === '') { l.price.input.value = ''; showExpected(l, false); return; }
    const p = prefill(l.crop.input.value, chosenBuyer(), cropYield);
    l.price.input.value = p.value;
    showExpected(l, p.expected);
  }

  // A line added, removed or changed: the unlikely question is asked again, the primary plain.
  function linesChanged() {
    asked = null;
    primary.textContent = label;
  }

  function addLine(value = null) {
    const n = ++lineSeq;
    const free = CROP_KEYS.find((k) => !used(null).has(k)) ?? CROP_KEYS[0];
    const options = CROP_KEYS.map((k) => [k, cropShortName(k)]);
    const crop = field({ id: `sl-crop-${n}`, label: 'Crop', kind: 'select', options, value: value?.crop ?? free });
    const kg = field({ id: `sl-kg-${n}`, label: 'kg', value: value ? String(value.kg) : '', suffix: 'kg' });
    const price = field({ id: `sl-price-${n}`, label: 'RM per kg', value: value ? value.priceKg.toFixed(2) : '', prefix: 'RM' });
    const room = field({ id: `sl-room-${n}`, label: 'Room', kind: 'select', options: roomOptions, value: value?.roomId ? String(value.roomId) : '' });
    // "expected" inside the RM box at its right end, as kg's unit (read with the box while shown)
    const expected = el('span', 'tk-suffix sl-expected', 'expected');
    expected.id = `${price.input.id}-expected`;
    expected.hidden = true;
    price.input.after(expected);
    const total = el('span', 'num sl-line-total');
    const remove = button('Remove', 'tk-quiet bz-quiet sl-remove');
    // the total and Remove: one cell beside Room on a phone, the line's own columns wider (display: contents)
    const end = el('span', 'sl-line-end');
    end.append(total, remove);
    // the amber question (an unlikely kg or price): a note the width of the line, under it, read with its box
    const check = el('p', 'sl-line-check');
    check.id = `sl-check-${n}`;
    check.setAttribute('aria-live', 'polite');
    kg.input.setAttribute('aria-describedby', `${kg.input.getAttribute('aria-describedby')} ${check.id}`);
    const row = el('div', 'sl-line');
    row.setAttribute('role', 'group');
    row.append(crop.wrap, kg.wrap, price.wrap, room.wrap, end, check);
    const l = { crop, kg, price, room, total, expected, check, row, remove, typed: Boolean(value) };
    showExpected(l, false);
    crop.input.addEventListener('change', () => { fillPrice(l); refresh(); });
    price.input.addEventListener('input', () => { l.typed = true; showExpected(l, false); clearCheck(l, 'priceKg'); refresh(); });
    kg.input.addEventListener('input', () => { clearCheck(l, 'kg'); refresh(); });
    remove.addEventListener('click', () => {
      lines.splice(lines.indexOf(l), 1);
      row.remove();
      linesChanged();
      refresh();
      (lines[0]?.kg.input ?? add).focus();
    });
    lines.push(l);
    lineList.append(row);
    if (!value) fillPrice(l);
    refresh();
    return l;
  }

  for (const line of delivery?.lines ?? []) addLine(line);
  if (!lines.length) addLine();
  add.addEventListener('click', () => { linesChanged(); addLine().crop.input.focus(); });
  buyer.input.addEventListener('change', () => {
    showNew();
    for (const l of lines) fillPrice(l);
    refresh();
  });

  // The footer: Delete (an Edit's) at its start, Cancel, the primary.
  const actions = el('div', 'actions');
  const cancel = button('Cancel');
  const label = delivery ? 'Save' : 'Record';
  const primary = button(label, 'primary', 'submit');
  if (delivery) {
    const del = button('Delete this sale', 'danger-text tk-aside');
    held.push(del);
    del.addEventListener('click', () => { if (busy) return; d.close(); confirmDelete({ delivery, onChanged, onError, opener }); });
    actions.append(del);
  }
  actions.append(cancel, primary);
  held.push(cancel, primary);
  form.append(actions);
  d.append(form);
  cancel.addEventListener('click', () => d.close());

  function clearErrors() {
    formError.hidden = true;
    for (const box of boxes.values()) clearBox(box);
    for (const l of lines) l.check.replaceChildren();
  }
  // A problem, or a list of them on their boxes (the unlikely questions: amber, warn), the cursor to the first.
  function show(problems) {
    const list = Array.isArray(problems) ? problems : [problems];
    const boxed = list.filter((p) => p.field && boxes.has(p.field));
    if (!boxed.length) {
      formError.textContent = list[0].message;
      formError.hidden = false;
      formError.focus();
      return;
    }
    for (const p of boxed) {
      const { input, error } = boxes.get(p.field);
      const lineOf = p.warn ? /^lines\.(\d+)\.(kg|priceKg)$/.exec(p.field) : null;
      if (lineOf) { // a line's question: under the whole line, the box marked amber
        const said = el('span', '', p.message);
        said.dataset.for = lineOf[2];
        lines[Number(lineOf[1])].check.append(said);
      } else {
        error.textContent = p.message;
        error.classList.toggle('field-warn', Boolean(p.warn));
      }
      if (p.warn) input.dataset.warn = '';
      else input.setAttribute('aria-invalid', 'true');
    }
    boxes.get(boxed[0].field).input.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    clearErrors();
    const now = Date.now(); // today as at this submit (a dialog left open over midnight)
    date.input.max = farmDate(now);
    const values = {
      // "New buyer…" has no id until it is added (after these checks pass): a stand-in id gets it past saleBody's buyer check
      date: date.input.value, buyerId: buyer.input.value === NEW ? '1' : buyer.input.value, invoiceNo: ref.input.value, note: note.input.value,
      lines: lines.map((l) => ({ crop: l.crop.input.value, kg: l.kg.input.value, priceKg: l.price.input.value, roomId: l.room.input.value })),
    };
    const body = saleBody(values, { now, soldAt: delivery?.soldAt ?? null }); // an edit keeps its time unless its date changes
    if (body.error) { show({ field: body.field, message: body.error }); return; }
    const key = JSON.stringify(body.lines);
    const warnings = unlikely(body.lines, cropYield);
    if (warnings.length && key !== asked) {
      asked = key;
      primary.textContent = `${label} anyway`;
      show(warnings.map((w) => ({ ...w, warn: true })));
      return;
    }
    hold(true);
    primary.textContent = label; // plain while sending: a failed send does not still say "anyway" (the same values still go)
    try {
      if (buyer.input.value === NEW) {
        const made = await request('POST', '/api/buyers', { name: newName.input.value, phone: newPhone.input.value }, TIMEOUT);
        if (gone()) { lost(true); return; } // the buyer is added; the sale, closed before it went, is not sent
        buyers.push(made);
        const o = el('option', '', made.name);
        o.value = String(made.id);
        // in A–Z order among the others, before "New buyer…"
        const after = (x) => x.textContent.localeCompare(made.name, undefined, { sensitivity: 'base' }) > 0;
        const next = [...buyer.input.options].find((x) => x.value !== NEW && after(x));
        buyer.input.insertBefore(o, next ?? buyer.input.lastElementChild);
        buyer.input.value = String(made.id);
        showNew();
        body.buyerId = made.id;
      }
      if (delivery) await request('PUT', `/api/sales/deliveries/${delivery.id}`, body, TIMEOUT);
      else await request('POST', '/api/sales', body, TIMEOUT);
      if (gone()) { lost(true); return; }
      d.close();
      onChanged();
    } catch (err) {
      if (gone()) { lost(false, errorText(err)); return; }
      // the server's field names onto the boxes: a new buyer's name and phone, the sale's time on its date
      const where = buyer.input.value === NEW ? { name: 'newName', phone: 'newPhone' } : { soldAt: 'date' };
      const fieldName = err.status === 400 || err.status === 409 ? where[err.field] ?? err.field : null;
      show(fieldName ? { field: fieldName, message: err.message } : { message: errorText(err) });
    } finally {
      if (!gone()) hold(false);
    }
  });
  // a changed line is asked about again
  lineList.addEventListener('input', linesChanged);
  d.oncancel = (event) => { if (busy) event.preventDefault(); };
  d.onclose = () => giveBack(opener);
  d.showModal();
  (delivery ? title : buyer.input.value === '' ? buyer.input : buyer.input.value === NEW ? newName.input : lines[0].kg.input).focus();
}

// The Delete confirm: "Delete the sale of 5 Nov to Kedai Ah Seng?" and what it held.
function confirmDelete({ delivery, onChanged, onError, opener }) {
  openForm({
    title: deleteTitle(delivery),
    lead: [deleteLead(delivery)],
    buttons: [{ value: 'delete', label: 'Delete sale', primary: true, danger: true }],
    submit: async () => {
      try {
        await request('DELETE', `/api/sales/deliveries/${delivery.id}`, undefined, TIMEOUT);
        onChanged();
        return true;
      } catch (err) {
        if (err.status === 404) onChanged();
        return { message: errorText(err) };
      }
    },
    onLost: onError,
  }).closed.then(() => giveBack(opener));
}

// Mark paid (an unpaid delivery): Paid on, today by default.
export function openPaid({ delivery, onChanged, onError, opener = document.activeElement }) {
  const today = farmDate(Date.now());
  openForm({
    title: 'Mark paid',
    lead: [`${deliveryRow(delivery).day}${DOT}${delivery.buyer}${DOT}${rmText(delivery.total)}`],
    fields: [{
      name: 'paidOn', label: 'Paid on', kind: 'date', value: today, min: farmDate(delivery.soldAt), max: today,
      hintOf: (v) => (DAY.test(v) ? dayTitle(v) : ''),
    }],
    buttons: [{ value: 'paid', label: 'Mark paid', primary: true }],
    submit: async (v, _which, form) => {
      const now = Date.now(); // today as at this submit (a dialog left open over midnight)
      form.input('paidOn').max = farmDate(now);
      if (!DAY.test(v.paidOn)) return { field: 'paidOn', message: 'Give the day it was paid' };
      const paidAt = v.paidOn === farmDate(now) ? now : whenMs(v.paidOn, '12:00'); // another day: 12:00 at the farm
      try {
        await request('PUT', `/api/sales/deliveries/${delivery.id}/paid`, { paidAt }, TIMEOUT);
        onChanged();
        return true;
      } catch (err) {
        return err.status === 400 ? { field: 'paidOn', message: err.message } : { message: errorText(err) };
      }
    },
    onLost: onError,
  }).closed.then(() => giveBack(opener, [`owed-${delivery.buyerId}`]));
}

// Buyers: the list (active, then Archived), each with Edit (Restore when archived); Add a buyer. Opened again after a
// write (or a Cancel in Edit / Add) with the cursor on that buyer's Edit (Restore) and, after a Restore or an Archive,
// a polite line that says so.
export async function openBuyers({ onChanged, onError, opener = document.activeElement, focus = null, status = '' }) {
  let buyers;
  try {
    ({ buyers } = await request('GET', '/api/buyers'));
  } catch (err) {
    onError(errorText(err));
    return;
  }
  const said = (r) => { if (r !== true) onError(r.message); }; // a Restore or an Archive that failed (no box to show it on)
  const pricesShort = (b) => Object.entries(b.prices ?? {}).map(([c, p]) => `${cropShortName(c)} ${priceText(p)}`).join(' · ');
  const item = (b) => {
    const li = el('li', `sl-buyer-item${b.archived ? ' muted' : ''}`);
    const text = el('div', 'sl-buyer-text');
    const more = [b.phone, pricesShort(b), b.owed > 0 ? `owes ${rmText(b.owed)}` : ''].filter(Boolean).join(' · ');
    text.append(el('strong', '', b.name));
    if (more) text.append(el('span', 'sl-buyer-more', more));
    const edit = button(b.archived ? 'Restore' : 'Edit', 'tk-quiet bz-quiet sl-buyer-edit');
    edit.setAttribute('aria-label', `${b.archived ? 'Restore' : 'Edit'} ${b.name}`);
    edit.dataset.focusKey = `buyer-${b.id}`;
    edit.addEventListener('click', () => {
      if (!b.archived) { editBuyer(b); return; }
      edit.disabled = true; // one Restore at a time
      save(b, { archived: false }, `${b.name} restored.`).then((r) => { if (r !== true) { edit.disabled = false; said(r); } });
    });
    li.append(text, edit);
    return li;
  };
  const list = el('ul', 'sl-buyer-list');
  list.append(...buyers.filter((b) => !b.archived).map(item));
  const archived = buyers.filter((b) => b.archived);
  const lead = [list];
  if (archived.length) {
    const old = el('ul', 'sl-buyer-list');
    old.append(...archived.map(item));
    lead.push(el('h3', 'sl-archived-title', 'Archived'), old);
  }
  if (!buyers.length) lead.unshift(el('p', 'none', 'No buyers yet.'));
  // the line that says what was done (said once the dialog is open, so it is read out)
  const statusLine = el('p', 'sl-status');
  statusLine.setAttribute('role', 'status');
  lead.unshift(statusLine);
  let reopened = false; // a write opens the list again: a form's close then does not
  const again = (id = null, said = '') => { reopened = true; onChanged(); openBuyers({ onChanged, onError, opener, focus: id, status: said }); };
  // Cancel (or Esc) in Edit / Add a buyer: back to the list, the cursor on that buyer
  const backToList = (id = null) => {
    if (reopened || document.querySelector('dialog[open]')) { giveBack(opener); return; }
    openBuyers({ onChanged, onError, opener, focus: id });
  };

  async function save(b, body, said = '') {
    try {
      await request('PUT', `/api/buyers/${b.id}`, body, TIMEOUT);
      again(b.id, said);
      return true;
    } catch (err) {
      return err.status === 400 || err.status === 409 ? { field: err.field?.replace('.', '-'), message: err.message } : { message: errorText(err) };
    }
  }

  // The fields of a buyer's form: name, phone, note, a usual price per crop.
  const fieldsOf = (b) => [
    { name: 'name', label: 'Name', kind: 'text', value: b?.name ?? '', maxLength: 60 },
    { name: 'phone', label: 'Phone (optional)', kind: 'text', value: b?.phone ?? '', maxLength: 30 },
    { name: 'note', label: 'Note (optional)', kind: 'text', value: b?.note ?? '', maxLength: 200 },
    {
      kind: 'group', legend: 'Usual price (RM per kg)', hint: 'Fills a sale\'s price. Leave a crop empty for the expected price.',
      className: 'sl-price-group',
      fields: CROP_KEYS.map((c) => ({
        name: `prices-${c}`, label: cropShortName(c), kind: 'number', value: b?.prices?.[c] === undefined ? '' : b.prices[c].toFixed(2),
      })),
    },
  ];
  const bodyOf = (v) => {
    const prices = {};
    for (const c of CROP_KEYS) {
      const t = String(v[`prices-${c}`] ?? '').trim();
      if (t === '') continue;
      prices[c] = num(t); // a decimal comma read, a grouped '1,000' refused
      if (Number.isNaN(prices[c])) return { field: `prices-${c}`, message: 'Give RM per kg as a number' };
    }
    return { body: { name: v.name, phone: v.phone, note: v.note, prices } };
  };

  // Edit a buyer; at its foot Archive (it has sales) or Delete buyer (its confirm).
  function editBuyer(b) {
    let form = null;
    const archive = () => {
      const aside = form.input('name').form.querySelector('.tk-aside');
      if (aside.disabled) return;
      aside.disabled = true; // one Archive at a time
      save(b, { archived: true }, `${b.name} archived.`).then((r) => { if (r !== true) { aside.disabled = false; said(r); } });
    };
    form = openForm({
      title: `Edit ${b.name}`,
      fields: fieldsOf(b),
      buttons: [
        b.sales > 0 ? { label: 'Archive', action: archive } : { label: 'Delete buyer', action: () => confirmRemove(b) },
        { value: 'save', label: 'Save', primary: true },
      ],
      submit: async (v) => {
        const r = bodyOf(v);
        return r.body ? save(b, r.body) : r;
      },
      onLost: onError,
    });
    form.closed.then(() => backToList(b.id));
  }

  // Delete a buyer with no sales, asked first.
  function confirmRemove(b) {
    openForm({
      title: `Delete ${b.name}?`,
      lead: ['They have no sales. Their phone and usual prices go too.'],
      buttons: [{ value: 'delete', label: 'Delete buyer', primary: true, danger: true }],
      submit: async () => {
        try {
          await request('DELETE', `/api/buyers/${b.id}`, undefined, TIMEOUT);
          again();
          return true;
        } catch (err) {
          return { message: errorText(err) };
        }
      },
      onLost: onError,
    }).closed.then(() => giveBack(opener));
  }

  const listForm = openForm({
    title: 'Buyers',
    lead,
    buttons: [{ value: 'add', label: 'Add a buyer', primary: true }],
    closeLabel: 'Close',
    // Add a buyer opens its form in the same dialog (this one replaced, so not closed by the true)
    submit: async () => {
      openForm({
        title: 'Add a buyer',
        fields: fieldsOf(null),
        buttons: [{ value: 'add', label: 'Add', primary: true }],
        submit: async (v) => {
          const r = bodyOf(v);
          if (!r.body) return r;
          try {
            const made = await request('POST', '/api/buyers', r.body, TIMEOUT);
            again(made?.id ?? null);
            return true;
          } catch (err) {
            return err.status === 400 || err.status === 409
              ? { field: err.field?.replace('.', '-'), message: err.message }
              : { message: errorText(err) };
          }
        },
        onLost: onError,
      }).closed.then(() => backToList());
      return true;
    },
    onLost: onError,
  });
  listForm.closed.then(() => giveBack(opener));
  // the cursor on the buyer just changed (else the title, as openForm leaves it), then the line said
  if (focus !== null) document.querySelector(`dialog[open] [data-focus-key="buyer-${focus}"]`)?.focus();
  if (status) setTimeout(() => { statusLine.textContent = status; }, 100);
}
