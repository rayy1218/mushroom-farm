// Not sold (spec 2026-11-12-data-integrity-design.md 6 and 11): the dialog that records kg picked and never sold (day, crop,
// kg, why, room, the buyer who rejected it, note, who), from the Sales page's Unsold card (the owner) and a room's Harvest tab
// (owner and worker); the owner's Edit with Void and its History; a voided record's own dialog. The server's asks (a
// duplicate, more than unsold, the balance) under the kg box.

import { request } from './api.js';
import { openForm as openTaskForm, errorText, loadWorkers, workerField } from './task-dialogs.js';
import { CROP_KEYS, cropShortName } from './crops.js';
import { farmDate, dayTitle } from './tasks-math.js';
import { whenMs, kgText } from './harvest-math.js';
import { askingSend } from './asks.js';
import { openVoid, openVoided } from './void-dialog.js';
import { addHistory } from './changes-fold.js';
import { isOwner } from './session.js';
import { REASON_WORDS } from './changes-math.js';
import { num } from './sales-math.js';

const TIMEOUT = 15000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const REASONS = Object.entries(REASON_WORDS); // [key, words] in the server's order

function openForm(options) {
  const handle = openTaskForm(options);
  document.querySelector('dialog.tk-dialog[open] > form')?.classList.add('bz-form');
  return handle;
}

// A record in words: "12.00 kg of Grey oyster, spoiled" (the Undo line, the void's lead).
export const notSoldWords = (r) => `${kgText(r.kg, { exact: true })} of ${cropShortName(r.crop)}, ${(REASON_WORDS[r.reason] ?? r.reason).toLowerCase()}`;

// The body from the boxes (null and the problem when one is not right): { at, crop, kg, reason, roomId, buyerId, note, worker }.
export function notSoldBody(v, { now, at = null }) {
  if (!DAY.test(v.day ?? '')) return { problem: { field: 'day', message: 'Pick the day' } };
  if (v.day > farmDate(now)) return { problem: { field: 'day', message: 'Pick a day up to today' } };
  const kg = num(v.kg);
  if (!(kg > 0 && kg <= 10_000)) return { problem: { field: 'kg', message: 'Type the kg as a number over 0 up to 10,000' } };
  if (!v.reason) return { problem: { field: 'reason', message: 'Pick why it was not sold' } };
  const when = at !== null && farmDate(at) === v.day ? at : v.day === farmDate(now) ? now : whenMs(v.day, '12:00');
  return {
    body: {
      at: when, crop: v.crop, kg: Math.round(kg * 100) / 100, reason: v.reason, roomId: v.roomId ? Number(v.roomId) : null,
      buyerId: v.reason === 'rejected' && v.buyerId ? Number(v.buyerId) : null, note: String(v.note ?? '').trim() || null, worker: v.worker,
    },
  };
}

// Record (record null) or Edit (the owner's) Not sold. crops: the crop keys offered (a room's run's; else every crop);
// prefill: { crop, kg, roomId }; rooms [{ id, name }]; buyers [{ id, name }] (the owner's: a worker's dialog has no buyer).
export async function openNotSold({ record = null, crops = CROP_KEYS, prefill = {}, rooms = [], onChanged, onError, onRecorded = () => {} }) {
  if (record?.voided) {
    return openVoided({
      title: `Not sold: ${cropShortName(record.crop)}`, lead: [notSoldWords(record)], voided: record.voided, path: `/api/not-sold/${record.id}/restore`,
      onChanged, onError, kind: 'not-sold', id: record.id,
    });
  }
  let names;
  let buyers = [];
  try {
    names = await loadWorkers();
    if (isOwner()) ({ buyers } = await request('GET', '/api/buyers'));
  } catch (err) {
    onError(errorText(err));
    return null;
  }
  const now = Date.now();
  const v = record ?? { at: now, crop: prefill.crop ?? crops[0], kg: prefill.kg ?? null, reason: '', roomId: prefill.roomId ?? null, buyerId: null, note: '' };
  const label = record ? 'Save' : 'Record';
  const send = askingSend({ value: 'save', label, fields: ['kg', 'crop', 'reason', 'day'] });
  const buttons = [{ value: 'save', label, primary: true }];
  if (record) {
    buttons.unshift({
      label: 'Void this record',
      action: () => openVoid({
        title: `Void the record of ${notSoldWords(record)}?`, label: 'Void record', path: `/api/not-sold/${record.id}/void`, onChanged, onError,
        hint: 'They sold after all',
      }),
    });
  }
  const form = openForm({
    title: record ? 'Edit not sold' : 'Record not sold',
    lead: record ? [] : ['Picked and not sold: it closes what is left unsold. No money moves; the cost of growing it is already counted.'],
    fields: [
      { name: 'day', label: 'Day', kind: 'date', value: farmDate(v.at), max: farmDate(now), hintOf: (x) => (DAY.test(x) ? dayTitle(x) : '') },
      { name: 'crop', label: 'Crop', kind: 'select', value: v.crop, options: [...new Set([...crops, v.crop])].map((c) => [c, cropShortName(c)]) },
      { name: 'kg', label: 'kg', kind: 'number', suffix: 'kg', value: v.kg === null ? '' : v.kg.toFixed(2) },
      { name: 'reason', label: 'Why', kind: 'select', value: v.reason, options: [['', 'Pick why'], ...REASONS] },
      ...(isOwner() ? [{ name: 'buyerId', label: 'Rejected by (optional)', kind: 'select', value: v.buyerId ? String(v.buyerId) : '', options: [['', 'Not said'], ...buyers.filter((b) => !b.archived || b.id === v.buyerId).map((b) => [String(b.id), b.name])] }] : []),
      { name: 'roomId', label: 'Room (optional)', kind: 'select', value: v.roomId ? String(v.roomId) : '', options: [['', 'Not said'], ...rooms.map((r) => [String(r.id), r.name])] },
      { name: 'note', label: 'Note (optional)', kind: 'text', value: v.note ?? '', maxLength: 200 },
      workerField(names, 'Who recorded it'),
    ],
    buttons,
    submit: async (values, _which, f) => {
      const r = notSoldBody(values, { now: Date.now(), at: record?.at ?? null });
      if (r.problem) return r.problem;
      let made = null;
      try {
        const out = await send(f, r.body, async (body) => {
          made = record ? await request('PUT', `/api/not-sold/${record.id}`, body, TIMEOUT) : await request('POST', '/api/not-sold', body, TIMEOUT);
        }, (field) => (field === 'at' ? 'day' : field));
        if (out !== true) return out;
      } catch (err) {
        return err.status === 400 && err.field ? { field: err.field === 'at' ? 'day' : err.field, message: err.message } : { message: errorText(err) };
      }
      onChanged();
      if (!record && made) onRecorded(made);
      return true;
    },
    onLost: onError,
  });
  // the buyer only for a rejection
  const buyer = form.input('buyerId');
  if (buyer) {
    const wrap = buyer.closest('.field');
    const show = () => { wrap.hidden = form.input('reason').value !== 'rejected'; };
    form.input('reason').addEventListener('change', show);
    show();
  }
  if (record) addHistory({ kind: 'not-sold', id: record.id });
  return form;
}

// The Undo of a record just made (within its minute, by its person): DELETE. → true, or the words of why not.
export async function undoNotSold(id) {
  try {
    await request('DELETE', `/api/not-sold/${id}`, undefined, TIMEOUT);
    return true;
  } catch (err) {
    return errorText(err);
  }
}
