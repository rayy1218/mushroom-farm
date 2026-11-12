// The Costs page's equipment dialogs (spec 2026-11-12-money-truth-design.md 6.2), through the tasks' openForm as the cost
// dialogs: Add equipment, Edit an item (with a quiet red Delete) and the Delete confirm. Each sends one request and calls
// onDone() when it went through; the page reloads on the costs event too. The pure parts are in web/costs-math.js.
//   openEquipmentDialog({ item?, rooms, today, onDone, onLost }) · openEquipmentDelete({ item, onDone, onLost })

import { request } from './api.js';
import { openForm, errorText } from './task-dialogs.js';
import { PART_OPTIONS, writeOffWords, equipmentBody, equipmentLine, amountBox } from './costs-math.js';
import { DOT } from './text-math.js';

const MAX_NAME = 60; // server/costs-equipment.js
const MAX_NOTE = 200;

function ask(options) {
  const form = openForm(options);
  document.querySelector('dialog.tk-dialog[open] > form')?.classList.add('bz-form'); // the Business pages' form (costs-dialogs.js)
  return form;
}
const problem = (err) => (err.field ? { field: err.field, message: err.message } : { message: errorText(err) });
const sender = (send, onDone, check = () => null) => async (v) => {
  const p = check(v);
  if (p) return p;
  try {
    await send(v);
    onDone();
    return true;
  } catch (err) {
    return problem(err);
  }
};

// Add equipment, or edit an item (item given).
export function openEquipmentDialog({ item = null, rooms, today, onDone, onLost }) {
  const form = ask({
    title: item ? `Edit ${item.name}` : 'Add equipment',
    lead: item ? [] : ['What you bought for a room or the farm. It is written off a month at a time from the month bought, as Economics counts it.'],
    fields: [
      { name: 'name', label: 'Name', kind: 'text', value: item?.name ?? '', maxLength: MAX_NAME, placeholder: 'Daikin FTKF 2.5 hp' },
      { name: 'roomId', label: 'For', kind: 'select', value: item?.roomId ? String(item.roomId) : '', options: [['', 'The farm (shared)'], ...rooms.map((r) => [String(r.id), r.name])] },
      { name: 'part', label: 'Part', kind: 'select', value: item?.part ?? 'other', options: PART_OPTIONS },
      { name: 'boughtOn', label: 'Bought', kind: 'date', value: item?.boughtOn ?? today, max: today },
      { name: 'amount', label: 'What it cost', kind: 'number', value: item ? amountBox(item.amount) : '', suffix: 'RM' },
      { name: 'lifeMonths', label: 'Written off over', kind: 'number', value: item ? String(item.lifeMonths) : '60', suffix: 'months', hint: 'Whole months, 1 to 240' },
      { name: 'resale', label: 'Resale value', kind: 'number', value: item ? amountBox(item.resale) : '0.00', suffix: 'RM', hint: 'What you could sell it for at the end; 0 if nothing' },
      { name: 'note', label: 'Note', kind: 'text', value: item?.note ?? '', maxLength: MAX_NOTE, placeholder: 'Where it is, its serial number' },
    ],
    buttons: [
      ...(item ? [{ label: 'Delete this item', action: () => openEquipmentDelete({ item, onDone, onLost }) }] : []),
      { value: 'save', label: item ? 'Save' : 'Add', primary: true },
    ],
    onLost,
    submit: sender((v) => {
      const { body } = equipmentBody(v, today);
      return item ? request('PUT', `/api/equipment/${item.id}`, body) : request('POST', '/api/equipment', body);
    }, onDone, (v) => {
      const r = equipmentBody(v, today);
      return r.body ? null : r;
    }),
  });
  // what it writes off a month, said as the figures are typed
  const p = document.createElement('p');
  p.className = 'c-hint co-writeoff';
  p.id = 'tk-f-writeoff';
  p.setAttribute('aria-live', 'polite');
  const resale = form.input('resale');
  resale.closest('.field').after(p);
  const sync = () => {
    const words = writeOffWords({ amount: form.input('amount').value, resale: resale.value, lifeMonths: form.input('lifeMonths').value });
    p.textContent = words ?? '';
    p.hidden = !words;
  };
  for (const name of ['amount', 'resale', 'lifeMonths']) form.input(name).addEventListener('input', sync);
  sync();
}

// The Delete confirm: its write-off goes from every month.
export function openEquipmentDelete({ item, onDone, onLost }) {
  const x = equipmentLine(item);
  ask({
    title: `Delete ${item.name}?`,
    lead: [`${x.sub}${DOT}${x.amount}`, 'Its write-off goes from every month. This cannot be undone.'],
    buttons: [{ value: 'delete', label: 'Delete', danger: true, primary: true }],
    onLost,
    submit: sender(() => request('DELETE', `/api/equipment/${item.id}`), onDone),
  });
}
