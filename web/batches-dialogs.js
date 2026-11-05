// The Batches dialogs (spec 2026-11-05-batches-design.md 7): Receive blocks and Edit, Put into a room, Take out, Delete, and
// Record or Edit a contamination check (with its Delete). They use the tasks' dialog (openForm) and worker picker; after a
// change, or a 404 or 409 (gone, or changed meanwhile), the page reads again.

import { request } from './api.js';
import { CROP_KEYS, cropShortName } from './crops.js';
import { openForm, loadWorkers, workerField, errorText, setWorker } from './task-dialogs.js';
import { dateHint, whenBoxes } from './harvest-math.js';
import { farmDate } from './tasks-math.js';
import {
  receiveBody, receiveValues, placeBody, roomChoices, checkBody, CAUSE_NAMES, blocksText, countBlocks, fullDate,
} from './batches-math.js';

const COMMAND_TIMEOUT = 15000;
// The server's field → the dialog's box (a time is typed in date and time boxes).
const BOXES = { receivedAt: 'receivedDate', inoculatedAt: 'inoculatedDate', at: 'checkDate' };

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// onChanged(): read the page again. onError(text): a failure the page shows (a dialog closed before its answer came).
export function createBatchDialogs({ onChanged, onError }) {
  // A command. → true, or the problem for the dialog to show (on its box when the server named one it has).
  async function send(method, path, body) {
    try {
      await request(method, path, body, COMMAND_TIMEOUT);
      onChanged();
      return true;
    } catch (err) {
      if (err.status === 404 || err.status === 409) onChanged();
      if (err.status === 400 && err.field === 'worker') window.dispatchEvent(new CustomEvent('farm:worker')); // renamed or removed
      return err.status === 400 && err.field ? { field: BOXES[err.field] ?? err.field, message: err.message } : { message: errorText(err) };
    }
  }
  const ask = (options) => openForm({ ...options, onLost: onError });
  const today = () => farmDate(Date.now());

  // Receive's and Edit's boxes, in four groups.
  function receiveFields(v, { cropEditable = true, blocksEditable = true } = {}) {
    return [
      {
        kind: 'group', legend: 'The blocks', className: 'bt-group', fields: [
          ...(cropEditable ? [{ name: 'crop', label: 'Crop', kind: 'select', value: v.crop, options: [['', 'Pick a crop'], ...CROP_KEYS.map((k) => [k, cropShortName(k)])] }] : []),
          { name: 'supplier', label: 'Supplier', kind: 'text', value: v.supplier, maxLength: 80 },
          { name: 'receivedDate', label: 'Received', kind: 'date', value: v.receivedDate, max: today(), hintOf: dateHint },
          ...(blocksEditable ? [{ name: 'blocks', label: 'Blocks', kind: 'number', value: v.blocks, inputMode: 'numeric', suffix: 'blocks' }] : []),
          { name: 'pricePerBlock', label: 'Price per block (RM)', kind: 'number', value: v.pricePerBlock, hint: 'Leave it empty if the bill has not come.' },
        ],
      },
      {
        kind: 'group', legend: 'Spawn', className: 'bt-group', fields: [
          { name: 'spawnBatch', label: 'Spawn batch No.', kind: 'text', value: v.spawnBatch, maxLength: 80 },
          { name: 'strain', label: 'Strain', kind: 'text', value: v.strain, maxLength: 80 },
          { name: 'inoculatedDate', label: 'Inoculated', kind: 'date', value: v.inoculatedDate, max: today(), hintOf: dateHint },
        ],
      },
      {
        kind: 'group', legend: 'Weight', className: 'bt-group', hint: "With a weight, the Harvest tab's BE uses this batch's dry substrate.", fields: [
          { name: 'blockKg', label: 'Block weight', kind: 'number', value: v.blockKg, suffix: 'kg' },
          { name: 'waterPct', label: 'Water', kind: 'number', value: v.waterPct, suffix: '%' },
        ],
      },
      {
        kind: 'group', legend: 'Paperwork', className: 'bt-group', fields: [
          { name: 'deliveryRef', label: 'Delivery note No.', kind: 'text', value: v.deliveryRef, maxLength: 80 },
          { name: 'note', label: 'Note', kind: 'area', value: v.note },
        ],
      },
    ];
  }

  function receive() {
    ask({
      title: 'Receive blocks',
      lead: ['Blocks bought ready to fruit. Put them into a room once they are in it.'],
      fields: receiveFields(receiveValues(null)),
      buttons: [{ value: 'save', label: 'Receive', primary: true }],
      submit: async (v) => {
        const r = receiveBody(v);
        return r.body ? send('POST', '/api/batches', r.body) : r;
      },
    });
  }

  // b: the batch's detail (GET /api/batches/:id).
  function edit(b) {
    const can = {
      cropEditable: b.delivery.every((x) => x.placedAt === null),
      blocksEditable: b.parentId === null && b.delivery.length === 1 && b.placedAt === null,
    };
    const lead = [];
    if (b.delivery.length > 1) lead.push('The supplier, spawn, price and weight change on every part of this delivery.');
    ask({
      title: `Edit ${countBlocks(b.blocks, b.crop)}`,
      lead,
      fields: receiveFields(receiveValues(b), can),
      buttons: [{ value: 'save', label: 'Save', primary: true }],
      submit: async (v) => {
        const r = receiveBody(v, { edit: can });
        return r.body ? send('PUT', `/api/batches/${b.id}`, r.body) : r;
      },
    });
  }

  // b: a waiting batch (a list row or the detail).
  async function place(b) {
    let rooms;
    try {
      rooms = (await request('GET', '/api/overview'))?.rooms; // each with its crop summary (/api/rooms has no crops)
    } catch (err) {
      onError(errorText(err));
      return;
    }
    const { ok, off } = roomChoices(Array.isArray(rooms) ? rooms : [], b.crop);
    const lead = [`${countBlocks(b.good, b.crop)} to put in${b.supplier ? `, from ${b.supplier}` : ''}.`];
    if (!ok.length) lead.push(`No room has ${cropShortName(b.crop)} in its run: give a room its crops on the Crop tab first.`);
    ask({
      title: 'Put into a room',
      lead,
      fields: ok.length ? [
        {
          name: 'roomId', label: 'Room', kind: 'select', value: ok.length === 1 ? String(ok[0][0]) : '',
          options: [['', 'Pick a room'], ...ok.map(([id, name]) => [String(id), name])], hint: off.length ? `Not offered: ${off.join(', ')}.` : undefined,
        },
        { name: 'blocks', label: 'Blocks', kind: 'number', value: String(b.good), inputMode: 'numeric', suffix: 'blocks', hint: `Fewer than ${blocksText(b.good)} splits the batch: the rest waits.` },
      ] : [],
      buttons: ok.length ? [{ value: 'place', label: 'Put in', primary: true }] : [],
      submit: async (v) => {
        const r = placeBody(v, b.good);
        return r.body ? send('POST', `/api/batches/${b.id}/place`, r.body) : r;
      },
    });
  }

  // b: a placed batch's detail.
  function takeOut(b) {
    const first = b.delivery.find((x) => x.parentId === null);
    const folds = b.parentId !== null && first?.placedAt === null;
    ask({
      title: `Take ${countBlocks(b.blocks, b.crop)} out of ${b.roomName}?`,
      lead: [folds ? "They go back to the delivery's waiting blocks." : 'The batch waits again, to be put into a room.'],
      buttons: [{ value: 'out', label: 'Take out', primary: true }],
      submit: () => send('POST', `/api/batches/${b.id}/unplace`),
    });
  }

  // onGone(): after the delete (the page goes back to the list).
  function remove(b, onGone) {
    ask({
      title: `Delete ${countBlocks(b.blocks, b.crop)}${b.supplier ? ` from ${b.supplier}` : ''}?`,
      lead: [`Received ${fullDate(b.receivedAt)}. Its contamination checks go with it.`],
      buttons: [{ value: 'delete', label: 'Delete', danger: true }],
      submit: async () => {
        try {
          await request('DELETE', `/api/batches/${b.id}`, undefined, COMMAND_TIMEOUT);
          onGone();
          return true;
        } catch (err) {
          if (err.status === 404) { onGone(); return true; }
          return { message: errorText(err) };
        }
      },
    });
  }

  // Record a check on b (c null) or edit c.
  async function check(b, c = null) {
    let names;
    try {
      names = await loadWorkers();
    } catch (err) {
      onError(errorText(err));
      return;
    }
    const shown = whenBoxes(c?.at ?? Date.now());
    const max = b.good + (c?.lost ?? 0);
    const lead = [`${countBlocks(b.blocks, b.crop)}${b.roomName ? ` in ${b.roomName}` : ''}: ${blocksText(b.good)} good now.`];
    if (!names.length) {
      const p = el('p', 'tk-lead');
      const a = el('a', '', 'Settings');
      a.href = '#/settings';
      p.append("No names yet: add the workers' names in ", a, ' first.');
      lead.push(p);
    }
    const who = workerField(names, 'Who checked');
    if (c) who.value = names.includes(c.worker) ? c.worker : '';
    ask({
      title: c ? 'Edit the check' : 'Record a check',
      lead,
      fields: [
        {
          kind: 'group', className: 'tk-when', fields: [
            { name: 'checkDate', label: 'Date', kind: 'date', value: shown.date, min: farmDate(b.receivedAt), max: today(), hintOf: dateHint },
            { name: 'checkTime', label: 'Time', kind: 'text', value: shown.time, placeholder: '08:12', inputMode: 'decimal', maxLength: 5, hint: '24 h, like 08:12' },
          ],
        },
        { name: 'lost', label: 'Blocks lost', kind: 'number', value: c ? String(c.lost) : '', inputMode: 'numeric', suffix: 'blocks', hint: `Up to ${blocksText(max)}` },
        { name: 'cause', label: 'Cause', kind: 'select', value: c?.cause ?? '', options: [['', 'Pick a cause'], ...Object.entries(CAUSE_NAMES)] },
        who,
        { name: 'note', label: 'Note', kind: 'area', value: c?.note ?? '' },
      ],
      buttons: [
        ...(c ? [{ label: 'Delete this check', action: () => removeCheck(c) }] : []),
        { value: 'save', label: c ? 'Save' : 'Record', primary: true },
      ],
      submit: async (v) => {
        const r = checkBody(v, { edit: Boolean(c) });
        if (!r.body) return r;
        if (r.body.worker) setWorker(r.body.worker); // the next dialog picks the same name
        return c ? send('PUT', `/api/batch-checks/${c.id}`, r.body) : send('POST', `/api/batches/${b.id}/checks`, r.body);
      },
    });
  }

  function removeCheck(c) {
    ask({
      title: `Delete the check of ${fullDate(c.at)}?`,
      lead: [`${blocksText(c.lost)} lost to ${(CAUSE_NAMES[c.cause] ?? c.cause).toLowerCase()}. They count as good again.`],
      buttons: [{ value: 'delete', label: 'Delete', danger: true }],
      submit: () => send('DELETE', `/api/batch-checks/${c.id}`),
    });
  }

  return { receive, edit, place, takeOut, remove, check };
}
