// The Sales dialogs (spec 2026-11-05-sales-design.md 3 and 6): Record / Edit sale (its own <dialog>: lines are added and
// removed, and "New buyer…" opens a name and a phone in place), Mark paid, the Delete confirm and Buyers (openForm's).
// Each takes { onChanged(), onError(text) } from the page; when its dialog closes the cursor goes back to the button that
// opened it (or, that one gone, the page's title).

import { request } from './api.js';
import { openForm, errorText } from './task-dialogs.js';
import { CROP_KEYS, cropShortName } from './crops.js';
import { farmDate, dayTitle } from './tasks-math.js';
import { rmText } from './harvest-math.js';
import { lineTotal, footText, prefill, unlikely, saleBody, deleteTitle, deleteLead, priceText, paidMark } from './sales-math.js';

const TIMEOUT = 15000;
const MAX_LINES = 9;
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
  if (!opener?.isConnected) { focusKeyed(keys); return; }
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

// A labelled box with its error line: { wrap, input, error }. kind: 'text' | 'date' | 'select'; suffix/prefix: a unit.
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
  return { wrap, input, error };
}

let saleDialog = null;
let lineSeq = 0; // a line's boxes' ids
function ensureSaleDialog() {
  if (saleDialog) return saleDialog;
  saleDialog = el('dialog', 'tk-dialog sl-dialog');
  saleDialog.setAttribute('aria-labelledby', 'sl-dialog-title');
  document.body.append(saleDialog);
  return saleDialog;
}

// Record a sale (delivery null) or Edit one: the buyers, the rooms and the expected prices are read first.
export async function openSale({ delivery, onChanged, onError, opener = document.activeElement }) {
  let buyers;
  let rooms;
  let cropYield;
  try {
    [{ buyers }, rooms, { cropYield }] = await Promise.all([request('GET', '/api/buyers'), request('GET', '/api/rooms'), request('GET', '/api/settings')]);
  } catch (err) {
    onError(errorText(err));
    return;
  }
  const roomList = (Array.isArray(rooms) ? rooms : rooms.rooms ?? []).toSorted((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const d = ensureSaleDialog();
  if (d.open) d.close();
  d.replaceChildren();
  const form = el('form');
  form.noValidate = true;
  const title = el('h2', '', delivery ? 'Edit sale' : 'Record a sale');
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
    toggle.addEventListener('click', async () => {
      if (busy) return;
      if (mark.unpaid) {
        d.close();
        openPaid({ delivery, onChanged, onError, opener });
        return;
      }
      busy = true;
      try {
        await request('PUT', `/api/sales/deliveries/${delivery.id}/paid`, { paidAt: null }, TIMEOUT);
        d.close();
        onChanged();
      } catch (err) {
        show({ message: errorText(err) });
      } finally {
        busy = false;
      }
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
    value: delivery ? String(delivery.buyerId) : active.length ? String(active[0].id) : NEW,
  });
  const newName = field({ id: 'sl-new-name', label: 'Name', maxLength: 60 });
  const newPhone = field({ id: 'sl-new-phone', label: 'Phone (optional)', maxLength: 30 });
  const newBox = el('div', 'sl-new-buyer');
  newBox.append(keep('newName', newName), keep('newPhone', newPhone));
  const showNew = () => { newBox.hidden = buyer.input.value !== NEW; };
  showNew();

  const ref = field({ id: 'sl-ref', label: "Buyer's reference (optional)", value: delivery?.invoiceNo ?? '', hint: 'Their invoice or receipt number', maxLength: 40 });
  form.append(keep('date', date), keep('buyerId', buyer), newBox, keep('invoiceNo', ref));

  // The lines.
  const linesBox = el('fieldset', 'sl-lines-box');
  linesBox.append(el('legend', '', 'Crops'));
  const lineList = el('div', 'sl-line-list');
  const add = button('Add a crop', 'sl-add');
  linesBox.append(lineList, add);
  const foot = el('p', 'sl-foot');
  const note = field({ id: 'sl-note', label: 'Note (optional)', value: delivery?.note ?? '', maxLength: 200 });
  form.append(linesBox, foot, keep('note', note));

  const lines = []; // { crop, kg, price, room, total, expected, row, remove, typed }
  const chosenBuyer = () => buyers.find((b) => String(b.id) === buyer.input.value) ?? null;
  const used = (except) => new Set(lines.filter((l) => l !== except).map((l) => l.crop.input.value));
  const roomOptions = [...roomList.map((r) => [String(r.id), r.name]), ['', 'Mixed']];

  // The lines' totals, Remove (two lines or more), the crops other lines have, Add a crop, the foot; the boxes by line number.
  function refresh() {
    for (const name of [...boxes.keys()]) if (name.startsWith('lines.')) boxes.delete(name);
    lines.forEach((l, i) => {
      l.total.textContent = lineTotal(l.kg.input.value, l.price.input.value);
      l.remove.hidden = lines.length < 2;
      for (const [suffix, f] of [['crop', l.crop], ['kg', l.kg], ['priceKg', l.price], ['roomId', l.room]]) boxes.set(`lines.${i}.${suffix}`, f);
      const taken = used(l);
      for (const o of l.crop.input.options) o.disabled = taken.has(o.value);
    });
    add.disabled = lines.length >= MAX_LINES || used(null).size >= CROP_KEYS.length;
    foot.textContent = footText(lines.map((l) => ({ kg: l.kg.input.value, priceKg: l.price.input.value })));
  }

  // The price from the buyer or Settings, unless one was typed.
  function fillPrice(l) {
    if (l.typed) return;
    const p = prefill(l.crop.input.value, chosenBuyer(), cropYield);
    l.price.input.value = p.value;
    l.expected.hidden = !p.expected;
  }

  function addLine(value = null) {
    const n = ++lineSeq;
    const free = CROP_KEYS.find((k) => !used(null).has(k)) ?? CROP_KEYS[0];
    const crop = field({ id: `sl-crop-${n}`, label: 'Crop', kind: 'select', options: CROP_KEYS.map((k) => [k, cropShortName(k)]), value: value?.crop ?? free });
    const kg = field({ id: `sl-kg-${n}`, label: 'kg', value: value ? String(value.kg) : '', suffix: 'kg' });
    const price = field({ id: `sl-price-${n}`, label: 'RM per kg', value: value ? value.priceKg.toFixed(2) : '', prefix: 'RM' });
    const room = field({ id: `sl-room-${n}`, label: 'Room', kind: 'select', options: roomOptions, value: value?.roomId ? String(value.roomId) : '' });
    const expected = el('span', 'muted sl-expected', 'expected');
    expected.hidden = true;
    price.error.before(expected);
    const total = el('span', 'num sl-line-total');
    const remove = button('Remove', 'tk-quiet sl-remove');
    const row = el('div', 'sl-line');
    row.append(crop.wrap, kg.wrap, price.wrap, room.wrap, total, remove);
    const l = { crop, kg, price, room, total, expected, row, remove, typed: Boolean(value) };
    crop.input.addEventListener('change', () => { fillPrice(l); refresh(); });
    price.input.addEventListener('input', () => { l.typed = true; l.expected.hidden = true; refresh(); });
    kg.input.addEventListener('input', refresh);
    remove.addEventListener('click', () => {
      lines.splice(lines.indexOf(l), 1);
      row.remove();
      refresh();
      (lines[0]?.kg.input ?? add).focus();
    });
    lines.push(l);
    lineList.append(row);
    if (!value) fillPrice(l);
    refresh();
    // its crop's name in Remove's (a screen reader hears which line goes)
    const name = () => remove.setAttribute('aria-label', `Remove ${cropShortName(crop.input.value)}`);
    name();
    crop.input.addEventListener('change', name);
    return l;
  }

  for (const line of delivery?.lines ?? []) addLine(line);
  if (!lines.length) addLine();
  add.addEventListener('click', () => addLine().crop.input.focus());
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
    del.addEventListener('click', () => { if (busy) return; d.close(); confirmDelete({ delivery, onChanged, onError, opener }); });
    actions.append(del);
  }
  actions.append(cancel, primary);
  form.append(actions);
  d.append(form);
  cancel.addEventListener('click', () => d.close());

  let asked = null; // the values the unlikely question was asked for
  let busy = false;
  function clearErrors() {
    formError.hidden = true;
    for (const { input, error } of boxes.values()) {
      error.textContent = '';
      error.classList.remove('field-warn');
      input.removeAttribute('aria-invalid');
      delete input.dataset.warn;
    }
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
      error.textContent = p.message;
      error.classList.toggle('field-warn', Boolean(p.warn));
      if (p.warn) input.dataset.warn = '';
      else input.setAttribute('aria-invalid', 'true');
    }
    boxes.get(boxed[0].field).input.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    clearErrors();
    const values = {
      date: date.input.value, buyerId: buyer.input.value === NEW ? '1' : buyer.input.value, invoiceNo: ref.input.value, note: note.input.value,
      lines: lines.map((l) => ({ crop: l.crop.input.value, kg: l.kg.input.value, priceKg: l.price.input.value, roomId: l.room.input.value })),
    };
    const body = saleBody(values, { now: Date.now(), soldAt: delivery?.soldAt ?? null }); // an edit keeps its time unless its date changes
    if (body.error) { show({ field: body.field, message: body.error }); return; }
    const key = JSON.stringify(body.lines);
    const warnings = unlikely(body.lines, cropYield);
    if (warnings.length && key !== asked) {
      asked = key;
      primary.textContent = `${label} anyway`;
      show(warnings.map((w) => ({ ...w, warn: true })));
      return;
    }
    busy = true;
    primary.disabled = true;
    try {
      if (buyer.input.value === NEW) {
        const made = await request('POST', '/api/buyers', { name: newName.input.value, phone: newPhone.input.value }, TIMEOUT);
        buyers.push(made);
        const o = el('option', '', made.name);
        o.value = String(made.id);
        buyer.input.insertBefore(o, buyer.input.lastElementChild);
        buyer.input.value = String(made.id);
        showNew();
        body.buyerId = made.id;
      }
      if (delivery) await request('PUT', `/api/sales/deliveries/${delivery.id}`, body, TIMEOUT);
      else await request('POST', '/api/sales', body, TIMEOUT);
      d.close();
      onChanged();
    } catch (err) {
      // the server's field names onto the boxes: a new buyer's name and phone, the sale's time on its date
      const where = buyer.input.value === NEW ? { name: 'newName', phone: 'newPhone' } : { soldAt: 'date' };
      const fieldName = err.status === 400 || err.status === 409 ? where[err.field] ?? err.field : null;
      show(fieldName ? { field: fieldName, message: err.message } : { message: errorText(err) });
    } finally {
      busy = false;
      primary.disabled = false;
      primary.textContent = asked === key ? `${label} anyway` : label;
    }
  });
  // a changed line is asked about again
  lineList.addEventListener('input', () => { asked = null; primary.textContent = label; });
  d.oncancel = (event) => { if (busy) event.preventDefault(); };
  d.onclose = () => giveBack(opener);
  d.showModal();
  (delivery ? title : buyer.input.value === NEW ? newName.input : lines[0].kg.input).focus();
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
    lead: [`${delivery.buyer} · ${rmText(delivery.total)}`],
    fields: [{ name: 'paidOn', label: 'Paid on', kind: 'date', value: today, min: farmDate(delivery.soldAt), max: today, hintOf: (v) => (DAY.test(v) ? dayTitle(v) : '') }],
    buttons: [{ value: 'paid', label: 'Mark paid', primary: true }],
    submit: async (v) => {
      if (!DAY.test(v.paidOn)) return { field: 'paidOn', message: 'Give the day it was paid' };
      const paidAt = v.paidOn === today ? Date.now() : Date.parse(`${v.paidOn}T12:00:00Z`) - 8 * 3_600_000; // 12:00 at the farm
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

// A usual price's box as a number: a decimal comma read ('4,5'), a grouped '1,234' refused; NaN when it is no number.
function priceNumber(text) {
  const s = String(text ?? '').trim();
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return NaN;
  const t = s.replace(',', '.');
  return /^(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
}

// Buyers: the list (active, then Archived), each with Edit (Restore when archived); Add a buyer.
export async function openBuyers({ onChanged, onError, opener = document.activeElement }) {
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
    const edit = button(b.archived ? 'Restore' : 'Edit', 'tk-quiet sl-buyer-edit');
    edit.setAttribute('aria-label', `${b.archived ? 'Restore' : 'Edit'} ${b.name}`);
    edit.addEventListener('click', () => (b.archived ? save(b, { archived: false }).then(said) : editBuyer(b)));
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
  const again = () => { onChanged(); openBuyers({ onChanged, onError, opener }); };

  async function save(b, body) {
    try {
      await request('PUT', `/api/buyers/${b.id}`, body, TIMEOUT);
      again();
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
      kind: 'group', legend: 'Usual price (RM per kg)', hint: 'Fills a sale\'s price. Leave a crop empty for the expected price.', className: 'sl-price-group',
      fields: CROP_KEYS.map((c) => ({ name: `prices-${c}`, label: cropShortName(c), kind: 'number', value: b?.prices?.[c] === undefined ? '' : b.prices[c].toFixed(2) })),
    },
  ];
  const bodyOf = (v) => {
    const prices = {};
    for (const c of CROP_KEYS) {
      const t = String(v[`prices-${c}`] ?? '').trim();
      if (t === '') continue;
      prices[c] = priceNumber(t);
      if (Number.isNaN(prices[c])) return { field: `prices-${c}`, message: 'Give RM per kg as a number' };
    }
    return { body: { name: v.name, phone: v.phone, note: v.note, prices } };
  };

  function editBuyer(b) {
    openForm({
      title: `Edit ${b.name}`,
      fields: fieldsOf(b),
      buttons: [
        b.sales > 0 ? { label: 'Archive', action: () => save(b, { archived: true }).then(said) } : { label: 'Delete buyer', action: () => removeBuyer(b) },
        { value: 'save', label: 'Save', primary: true },
      ],
      submit: async (v) => {
        const r = bodyOf(v);
        return r.body ? save(b, r.body) : r;
      },
      onLost: onError,
    }).closed.then(() => giveBack(opener));
  }

  async function removeBuyer(b) {
    try {
      await request('DELETE', `/api/buyers/${b.id}`, undefined, TIMEOUT);
      again();
    } catch (err) {
      onError(errorText(err));
    }
  }

  openForm({
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
            await request('POST', '/api/buyers', r.body, TIMEOUT);
            again();
            return true;
          } catch (err) {
            return err.status === 400 || err.status === 409 ? { field: err.field?.replace('.', '-'), message: err.message } : { message: errorText(err) };
          }
        },
        onLost: onError,
      }).closed.then(() => giveBack(opener));
      return true;
    },
    onLost: onError,
  }).closed.then(() => giveBack(opener));
}
