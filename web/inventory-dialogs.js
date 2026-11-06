// Inventory's dialogs (spec 2026-11-05-inventory-design.md 4 and 5): Add and Edit item, Purchase, Record use, Edit a purchase
// or a use, Delete a record, Throw out, Archive. On the tasks' openForm, laid out as the Harvest dialogs: the unit inside the
// qty box, the day in the farm's words under a date box, the worker picker, a quiet red Delete at an Edit's footer start.
// Each takes onDone(result) (the page reads again and, with a result, says what was saved: inventory-done.js; result null
// when the record was gone or changed) and onLost(text) (a failure that came back after the dialog closed).

import { request, routeMissing, OUTDATED } from './api.js';
import { openForm as openTaskForm, loadWorkers, workerField, errorText } from './task-dialogs.js';
import { whenBoxes, dateHint } from './harvest-math.js';
import { farmDate } from './tasks-math.js';
import {
  doneText, KIND_OPTIONS, UNIT_OPTIONS, UNIT_BY_KIND, UNIT_WORDS, WHOLE_UNITS, itemGroups, decimalComma, stockHint, qtyText, perUnitText, daysBefore, itemBody, purchaseBody, useBody, purchaseEditBody, useEditBody,
  overStock, deleteTitle, deleteLead, throwOutTitle, throwOutLead, useItems,
} from './inventory-math.js';

// The tasks' openForm with the Business dialogs' form class (bz-form: the footer sticks at the dialog's foot on a phone, a
// Delete on its own row; DESIGN.md "Business").
function openForm(options) {
  const handle = openTaskForm(options);
  document.querySelector('dialog.tk-dialog[open] > form')?.classList.add('bz-form');
  return handle;
}

const COMMAND_TIMEOUT = 15000;
const BACK_DAYS = 400;

// → { ok: true, reply }, or the problem for the dialog: { field, message } (the server's field; 'at' is the time box's) or
// { message } ({ message, stale } on a 404 or 409: the record is gone or changed, so the page reads again).
async function send(method, path, body) {
  try {
    const reply = await request(method, path, body, COMMAND_TIMEOUT);
    return { ok: true, reply };
  } catch (err) {
    if (err.status === 404 || err.status === 409) return { message: errorText(err), stale: true }; // gone or changed: the page reads again
    if (err.status === 400 && err.field === 'worker') window.dispatchEvent(new CustomEvent('farm:worker')); // renamed or removed
    if (err.status === 400 && err.field) return { field: err.field === 'at' ? 'time' : err.field, message: err.message };
    return { message: routeMissing(err) ? OUTDATED : errorText(err) };
  }
}
// A send's end for openForm: true (closes) after onDone(what was saved: done(reply) → { text, moves?, at }), or the problem
// (a stale one tells the page to read again).
function finish(sent, onDone, done = () => ({ text: doneText({ kind: 'saved' }) })) {
  if (sent.ok) {
    onDone?.({ at: Date.now(), ...done(sent.reply) });
    return true;
  }
  if (sent.stale) onDone?.(null);
  return sent;
}
// A new move's result: its words and its id for Undo.
const made = (text) => (reply) => ({ text, moves: Number.isInteger(reply?.id) ? [reply.id] : [] });

// Earlier texts offered under a box (a datalist; any other text may still be typed).
function suggest(form, name, list) {
  const input = form.input(name);
  if (!input || !list?.length) return;
  const options = document.createElement('datalist');
  options.id = `iv-list-${name}`;
  for (const text of list) {
    const o = document.createElement('option');
    o.value = text;
    options.append(o);
  }
  input.after(options);
  input.setAttribute('list', options.id);
}

// A qty box's unit (audit #21): the suffix openForm put inside it, the keypad (whole units numeric, kg and L decimal) and,
// for a screen reader (the suffix is aria-hidden), ", in litres" at the end of its label. unit null: none picked yet.
function setUnit(form, name, unit) {
  const input = form.input(name);
  if (!input) return;
  const s = input.parentElement?.querySelector('.tk-suffix');
  if (s) s.textContent = unit ?? NBSP;
  input.inputMode = unit && WHOLE_UNITS.includes(unit) ? 'numeric' : 'decimal';
  const label = input.closest('.field')?.querySelector(`label[for="${input.id}"]`);
  if (!label) return;
  let spoken = label.querySelector('.iv-unit-words');
  if (!spoken) {
    spoken = document.createElement('span');
    spoken.className = 'sr-only iv-unit-words';
    label.append(spoken);
  }
  spoken.textContent = unit ? `, in ${UNIT_WORDS[unit] ?? unit}` : '';
}
const NBSP = '\u00a0';

// The total box reads "RM 85.00" as the app writes money (audit #20): openForm puts a unit after the figure, so its
// suffix is moved before the input and styled as a prefix (.iv-prefix-box), and the label says it to a screen reader.
function rmPrefix(form, name) {
  const input = form.input(name);
  const box = input?.parentElement;
  const unit = box?.querySelector('.tk-suffix');
  if (!unit) return;
  box.classList.add('iv-prefix-box');
  box.prepend(unit);
  const label = input.closest('.field')?.querySelector(`label[for="${input.id}"]`);
  if (label) label.insertAdjacentHTML('beforeend', '<span class="sr-only">, in RM</span>');
}

// The item picked last in this browser, per dialog (audit #1): the next opening from the list starts on it while it is
// still on offer; else on "Pick an item", so a figure is never recorded against an item nobody chose.
const LAST_KEY = { use: 'farm.inventory.useItem', purchase: 'farm.inventory.purchaseItem' };
function lastItem(which) {
  try { return Number(localStorage.getItem(LAST_KEY[which])) || null; } catch { return null; }
}
function keepItem(which, id) {
  try { localStorage.setItem(LAST_KEY[which], String(id)); } catch { /* not kept: the next opening asks */ }
}
// The item the dialog opens on: the one asked for (an item page), else the last one kept, else none.
const startItem = (list, itemId, which) => list.find((i) => i.id === itemId) ?? list.find((i) => i.id === lastItem(which)) ?? null;

// The Item select rebuilt with an <optgroup> a kind (openForm's options are flat); "Pick an item" first while none is picked.
function groupOptions(select, list, picked) {
  const option = (value, text) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    return o;
  };
  const groups = itemGroups(list).map((g) => {
    const box = document.createElement('optgroup');
    box.label = g.label;
    box.append(...g.items.map((i) => option(String(i.id), i.name)));
    return box;
  });
  select.replaceChildren(...(picked ? [] : [option('', 'Pick an item')]), ...(list.length > 1 ? groups : groups.flatMap((g) => [...g.children])));
  select.value = picked ? String(picked.id) : '';
}
const itemField = (list, item) => ({
  name: 'itemId', label: 'Item', kind: 'select', value: item ? String(item.id) : '', options: [['', 'Pick an item'], ...list.map((i) => [String(i.id), i.name])],
  hintOf: (v) => stockHint(list.find((i) => String(i.id) === v) ?? null),
});

// No workers on the list yet: say where to add them (as Record a harvest does).
function namesLead(names) {
  if (names.length) return [];
  const p = document.createElement('p');
  p.className = 'tk-lead';
  const a = document.createElement('a');
  a.href = '#/settings';
  a.textContent = 'Settings';
  p.append("No names yet: add the workers' names in ", a, ' first.');
  return [p];
}

// The worker picker with a record's own name kept when it is no longer on the list.
function workerFieldWith(names, label, name) {
  const list = name && !names.includes(name) ? [...names, name] : names;
  return { ...workerField(list, label), ...(name ? { value: name } : {}) };
}

// More than in stock asks once (Harvest's pick guard): the first submit says so under the qty box, in amber, and the button
// reads "Record anyway"; the same item and qty again sends it; a changed qty or item asks again.
function createOverGuard(value = 'save', label = 'Record') {
  let asked = null;
  let watching = false;
  return (form, item, qty) => {
    const b = form.button(value);
    const words = overStock(qty, item);
    const key = `${item.id}=${qty}`;
    if (!words || key === asked) {
      b.textContent = label;
      return null;
    }
    asked = key;
    b.textContent = `${label} anyway`;
    if (!watching) {
      watching = true;
      for (const name of ['qty', 'itemId']) {
        form.input(name)?.addEventListener('input', () => { asked = null; b.textContent = label; });
        form.input(name)?.addEventListener('change', () => { asked = null; b.textContent = label; });
      }
    }
    return { field: 'qty', message: words, warn: true };
  };
}

// The date and 24 h time boxes side by side (Record a harvest's).
const whenFields = (shown) => [{
  kind: 'group', className: 'tk-when',
  fields: [
    { name: 'date', label: 'Date', kind: 'date', value: shown.date, min: daysBefore(farmDate(Date.now()), BACK_DAYS), max: farmDate(Date.now()), hintOf: dateHint },
    { name: 'time', label: 'Time', kind: 'text', value: shown.time, placeholder: '08:12', inputMode: 'decimal', maxLength: 5, hint: '24 h, like 08:12' },
  ],
}];

// ---- items ----

// Add (item null) or Edit an item. hasMoves: the unit is shown but cannot change. A block item: its level only.
export function openItemDialog({ item = null, hasMoves = false, onDone, onLost }) {
  const blocks = item?.kind === 'blocks';
  const unit = item?.unit ?? UNIT_BY_KIND.chemical; // Add opens on Chemical: L (audit #22)
  const fields = blocks ? [] : [
    { name: 'name', label: 'Name', kind: 'text', value: item?.name ?? '', maxLength: 60, placeholder: 'Bleach' },
    { name: 'kind', label: 'Kind', kind: 'select', value: item?.kind ?? 'chemical', options: KIND_OPTIONS },
    {
      name: 'unit', label: 'Unit', kind: 'select', value: unit, options: UNIT_OPTIONS,
      hint: hasMoves ? 'The unit cannot change once the item has records.' : 'What it is counted in. It cannot change once the item has records.',
    },
  ];
  fields.push({ name: 'reorderAt', label: 'Reorder at', kind: 'number', value: item?.reorderAt ?? '', suffix: unit, hint: 'Low at or under this. Leave it empty for no level.' });
  if (!blocks) {
    fields.push(
      { name: 'ingredient', label: 'Active ingredient', kind: 'text', value: item?.ingredient ?? '', maxLength: 60, hint: 'For the myGAP 4-5 sheet.' },
      { name: 'lrmpNo', label: 'LRMP No.', kind: 'text', value: item?.lrmpNo ?? '', maxLength: 60, hint: "A registered pesticide's number, on its label." },
    );
  }
  const form = openForm({
    title: item ? `Edit ${item.name}` : 'Add an item',
    lead: blocks ? ['Its name and unit come from Batches.'] : [],
    fields,
    // An item with no records can still be deleted (one made by mistake); else Archive (audit #22).
    buttons: [
      ...(item && !blocks && !hasMoves ? [{ label: 'Delete this item', action: () => openDeleteItemDialog({ item, onDone, onLost }) }] : []),
      { value: 'save', label: item ? 'Save' : 'Add', primary: true },
    ],
    onLost,
    submit: async (v) => {
      const body = itemBody(v, item);
      if (body.error) return { field: body.field, message: body.error };
      return finish(await send(item ? 'PUT' : 'POST', item ? `/api/inventory/items/${item.id}` : '/api/inventory/items', body), onDone,
        (reply) => ({ text: doneText({ kind: item ? 'saved' : 'added', name: reply?.name ?? body.name }) }));
    },
  });
  setUnit(form, 'reorderAt', unit);
  if (!blocks) {
    const kind = form.input('kind');
    const unitBox = form.input('unit');
    const chemical = () => {
      for (const name of ['ingredient', 'lrmpNo']) form.input(name).closest('.field').hidden = kind.value !== 'chemical';
    };
    let unitPicked = Boolean(item); // Add: the unit follows the kind until one is picked
    kind.addEventListener('change', () => {
      chemical();
      if (unitPicked || hasMoves || !UNIT_BY_KIND[kind.value]) return;
      unitBox.value = UNIT_BY_KIND[kind.value];
      setUnit(form, 'reorderAt', unitBox.value);
    });
    unitBox.addEventListener('change', () => {
      unitPicked = true;
      setUnit(form, 'reorderAt', unitBox.value);
    });
    unitBox.disabled = hasMoves;
    chemical();
  }
  return form;
}

// Delete an item with no records (the API refuses one with records: 409 "Archive it instead"). onDone({ gone: true }): the
// page leaves for the list, which says it.
export function openDeleteItemDialog({ item, onDone, onLost }) {
  return openForm({
    title: `Delete ${item.name}?`,
    lead: ['It has no records yet. It goes for good.'],
    buttons: [{ value: 'delete', label: 'Delete', primary: true, danger: true }],
    closeLabel: 'Keep it',
    onLost,
    submit: async () => finish(await send('DELETE', `/api/inventory/items/${item.id}`), onDone,
      () => ({ text: doneText({ kind: 'deleted', name: item.name }), gone: true })),
  });
}

// Archive with a confirm; Bring back has none.
export function openArchiveDialog({ item, onDone, onLost }) {
  return openForm({
    title: `Archive ${item.name}?`,
    lead: ['It leaves the list, the attention line and the messages. Its records stay, and Show archived brings it back.'],
    buttons: [{ value: 'archive', label: 'Archive', primary: true }],
    closeLabel: 'Keep it',
    onLost,
    submit: async () => finish(await send('PUT', `/api/inventory/items/${item.id}`, { archived: true }), onDone, () => ({ text: 'Archived' })),
  });
}
export const bringBack = (item) => send('PUT', `/api/inventory/items/${item.id}`, { archived: false });

// ---- Purchase and Record use ----

// items: the list's items (block and archived ones are left out); itemId: the one picked first.
export function openPurchaseDialog({ items, itemId = null, suppliers = [], onDone, onLost }) {
  const list = items.filter((i) => i.kind !== 'blocks' && !i.archived);
  if (!list.length) return null;
  const today = farmDate(Date.now());
  let item = startItem(list, itemId, 'purchase');
  let form = null;
  const priceHint = () => (form && item ? perUnitText(Number(decimalComma(form.input('total').value)), Number(decimalComma(form.input('qty').value)), item.unit) : '');
  form = openForm({
    title: 'Purchase',
    fields: [
      itemField(list, item),
      { name: 'qty', label: 'Qty bought', kind: 'number', value: '', suffix: item?.unit ?? NBSP },
      { name: 'total', label: 'Total paid', kind: 'number', value: '', suffix: 'RM', hintOf: priceHint },
      { name: 'supplier', label: 'Supplier', kind: 'text', value: '', maxLength: 60, hint: 'Optional.' },
      {
        kind: 'group', className: 'tk-when iv-when',
        fields: [
          { name: 'day', label: 'Day bought', kind: 'date', value: today, min: daysBefore(today, BACK_DAYS), max: today, hintOf: dateHint },
          { name: 'useBy', label: 'Use by', kind: 'date', value: '', hintOf: (d) => (d ? dateHint(d) : 'Optional.') },
        ],
      },
    ],
    buttons: [{ value: 'save', label: 'Record', primary: true }],
    onLost,
    submit: async (v) => {
      const body = purchaseBody(v, item, farmDate(Date.now()));
      if (body.error) return { field: body.field, message: body.error };
      const sent = await send('POST', '/api/inventory/purchases', body);
      if (sent.ok) keepItem('purchase', body.itemId);
      return finish(sent, onDone, made(doneText({ kind: 'purchase', qty: body.qty, unit: item.unit, name: item.name })));
    },
  });
  const hint = () => {
    const h = document.getElementById('tk-f-total-hint');
    if (h) h.textContent = priceHint();
  };
  form.input('qty').addEventListener('input', hint);
  rmPrefix(form, 'total');
  groupOptions(form.input('itemId'), list, item);
  setUnit(form, 'qty', item?.unit ?? null);
  form.input('itemId').addEventListener('change', () => {
    item = list.find((i) => String(i.id) === form.input('itemId').value) ?? null;
    setUnit(form, 'qty', item?.unit ?? null);
    hint();
  });
  suggest(form, 'supplier', suppliers);
  return form;
}

// items: the list's items (archived and block items left out: blocks go into a room from Batches, joint audit B1);
// reasons: the item's earlier ones.
export async function openUseDialog({ items, itemId = null, reasons = [], onDone, onLost, alive = () => true }) {
  const list = useItems(items);
  if (!list.length) return null;
  let names;
  let rooms;
  try {
    [names, rooms] = await Promise.all([loadWorkers(), request('GET', '/api/rooms')]);
  } catch (err) {
    if (alive()) onLost?.(errorText(err));
    return null;
  }
  if (!alive()) return null;
  let item = startItem(list, itemId, 'use');
  const shown = whenBoxes(Date.now());
  const guard = createOverGuard();
  let form = null;
  form = openForm({
    title: 'Record use',
    lead: namesLead(names),
    fields: [
      itemField(list, item),
      { name: 'qty', label: 'Qty used', kind: 'number', value: '', suffix: item?.unit ?? NBSP },
      { name: 'roomId', label: 'Room', kind: 'select', value: '', options: [['', 'Not in a room'], ...rooms.map((r) => [String(r.id), r.name])] },
      { name: 'reason', label: 'Reason', kind: 'text', value: '', maxLength: 60, placeholder: 'Footbath', hint: 'Optional.' },
      workerField(names, 'Who used it'),
      ...whenFields(shown),
    ],
    buttons: [{ value: 'save', label: 'Record', primary: true }],
    onLost,
    submit: async (v) => {
      const body = useBody(v, item, { now: Date.now(), shown });
      if (body.error) return { field: body.field, message: body.error };
      const asked = guard(form, item, body.qty);
      if (asked) return asked;
      const sent = await send('POST', '/api/inventory/uses', body);
      if (sent.ok) keepItem('use', body.itemId);
      const room = body.roomId === null ? null : rooms.find((r) => r.id === body.roomId)?.name ?? null;
      return finish(sent, onDone, made(doneText({ kind: 'use', qty: body.qty, unit: item.unit, name: item.name, room, worker: body.worker })));
    },
  });
  groupOptions(form.input('itemId'), list, item);
  setUnit(form, 'qty', item?.unit ?? null);
  form.input('itemId').addEventListener('change', () => {
    item = list.find((i) => String(i.id) === form.input('itemId').value) ?? null;
    setUnit(form, 'qty', item?.unit ?? null);
  });
  suggest(form, 'reason', reasons);
  return form;
}

// ---- a record: Edit, Delete, Throw out ----

// Edit a purchase or a use (a count is deleted, not edited; a batch move is Batches'). throwOuts: the purchase has some.
export async function openMoveDialog({ move, item, suppliers = [], reasons = [], throwOuts = false, onDone, onLost, alive = () => true }) {
  const remove = { label: 'Delete this record', action: () => openDeleteDialog({ move, item, throwOuts, onDone, onLost }) };
  if (move.refKind === 'purchase') {
    const oldest = daysBefore(farmDate(Date.now()), BACK_DAYS); // a day stored older than this stays valid in the box
    const form = openForm({
      title: 'Edit a purchase',
      fields: [
        { name: 'qty', label: 'Qty bought', kind: 'number', value: String(move.qty), suffix: item.unit },
        { name: 'total', label: 'Total paid', kind: 'number', value: String(move.total ?? ''), suffix: 'RM' },
        { name: 'supplier', label: 'Supplier', kind: 'text', value: move.supplier ?? '', maxLength: 60, hint: 'Optional.' },
        {
          kind: 'group', className: 'tk-when iv-when',
          fields: [
            { name: 'day', label: 'Day bought', kind: 'date', value: farmDate(move.at), ...(farmDate(move.at) >= oldest ? { min: oldest } : {}), max: farmDate(Date.now()), hintOf: dateHint },
            { name: 'useBy', label: 'Use by', kind: 'date', value: move.useBy ?? '', hintOf: (d) => (d ? dateHint(d) : 'Optional.') },
          ],
        },
      ],
      buttons: [remove, { value: 'save', label: 'Save', primary: true }],
      onLost,
      submit: async (v) => {
        const body = purchaseEditBody(v, move, item, farmDate(Date.now()));
        if (body.error) return { field: body.field, message: body.error };
        if (Object.keys(body).length === 0) return true;
        return finish(await send('PUT', `/api/inventory/moves/${move.id}`, body), onDone);
      },
    });
    setUnit(form, 'qty', item.unit);
    rmPrefix(form, 'total');
    suggest(form, 'supplier', suppliers);
    return form;
  }
  let names;
  let rooms;
  try {
    [names, rooms] = await Promise.all([loadWorkers(), request('GET', '/api/rooms')]);
  } catch (err) {
    if (alive()) onLost?.(errorText(err));
    return null;
  }
  if (!alive()) return null;
  const throwOut = move.lotId !== null && move.lotId !== undefined; // a throw-out never has a room
  const shown = whenBoxes(move.at);
  const roomOptions = [['', 'Not in a room'], ...rooms.map((r) => [String(r.id), r.name])];
  if (move.roomId !== null && !rooms.some((r) => r.id === move.roomId)) roomOptions.push([String(move.roomId), 'A deleted room']);
  const form = openForm({
    title: throwOut ? 'Edit a throw-out' : 'Edit a use',
    fields: [
      { name: 'qty', label: throwOut ? 'Qty thrown out' : 'Qty used', kind: 'number', value: String(-move.qty), suffix: item.unit },
      ...(throwOut ? [] : [{ name: 'roomId', label: 'Room', kind: 'select', value: move.roomId === null ? '' : String(move.roomId), options: roomOptions }]),
      { name: 'reason', label: 'Reason', kind: 'text', value: move.reason ?? '', maxLength: 60, hint: 'Optional.' },
      workerFieldWith(names, throwOut ? 'Who threw it out' : 'Who used it', move.worker),
      ...whenFields(shown),
    ],
    buttons: [remove, { value: 'save', label: 'Save', primary: true }],
    onLost,
    submit: async (v) => {
      const body = useEditBody(v, move, item, { now: Date.now(), shown });
      if (body.error) return { field: body.field, message: body.error };
      if (Object.keys(body).length === 0) return true;
      return finish(await send('PUT', `/api/inventory/moves/${move.id}`, body), onDone);
    },
  });
  setUnit(form, 'qty', item.unit);
  suggest(form, 'reason', reasons);
  return form;
}

export function openDeleteDialog({ move, item, throwOuts = false, onDone, onLost }) {
  return openForm({
    title: deleteTitle(move, item),
    lead: [deleteLead(move, { throwOuts })].filter(Boolean),
    buttons: [{ value: 'delete', label: 'Delete', primary: true, danger: true }],
    closeLabel: 'Keep it',
    onLost,
    submit: async () => finish(await send('DELETE', `/api/inventory/moves/${move.id}`), onDone, () => ({ text: doneText({ kind: 'deleted' }) })),
  });
}

export async function openThrowOutDialog({ lot, item, onDone, onLost, alive = () => true }) {
  let names;
  try {
    names = await loadWorkers();
  } catch (err) {
    if (alive()) onLost?.(errorText(err));
    return null;
  }
  if (!alive()) return null;
  return openForm({
    title: throwOutTitle(lot, item),
    lead: [throwOutLead(lot), ...namesLead(names)],
    fields: [workerField(names, 'Who threw it out')],
    buttons: [{ value: 'throw', label: 'Throw out', primary: true, danger: true }],
    closeLabel: 'Keep it',
    onLost,
    submit: async (v) => {
      if (!v.worker) return { field: 'worker', message: 'Pick who threw it out' };
      return finish(await send('POST', `/api/inventory/lots/${lot.moveId}/throw-out`, { worker: v.worker }), onDone,
        made(doneText({ kind: 'throwOut', qty: lot.left, unit: item.unit, name: item.name, worker: v.worker })));
    },
  });
}
