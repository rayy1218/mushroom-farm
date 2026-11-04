// The implausible-pick question in Record, Edit and the harvest check's Done (spec 2026-11-04-harvest-design.md 3): the
// guard's behaviour over a fake form handle (its primary button and its boxes), with the real bodies and picks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickGuard } from '../web/task-dialogs.js';
import { recordBody, recordPicks, editBody, editPicks, whenBoxes, donePicks } from '../web/harvest-math.js';
import { doneBody } from '../web/tasks-math.js';

const nb = '\u00a0';

// A form handle as openForm's: button(value) and input(name), each box's input listeners fired by type(name).
function fakeForm(label) {
  const listeners = new Map();
  const button = { textContent: label };
  return {
    button: () => button,
    input: (name) => ({ addEventListener: (type, fn) => { if (type === 'input') listeners.set(name, [...(listeners.get(name) ?? []), fn]); } }),
    type: (name) => { for (const fn of listeners.get(name) ?? []) fn(); },
    label: () => button.textContent,
  };
}

const NOW = Date.UTC(2026, 10, 4, 1); // 4 Nov 09:00 at the farm
const run = { startedAt: Date.UTC(2026, 10, 2), endedAt: null, crops: [{ crop: 'lionsmane', blocks: 950 }, { crop: 'oyster', blocks: 2000 }] };

test('Record: the first submit asks, the same kg sends; a changed kg asks again; an edit puts the label back; a crop change re-checks', () => {
  const form = fakeForm('Record');
  const guard = pickGuard({ value: 'record', label: 'Record', fields: ['crop', 'kg'] });
  const shown = whenBoxes(NOW);
  const submit = (values) => guard(form, recordPicks(recordBody({ worker: 'Ali', pickedDate: shown.date, pickedTime: shown.time, ...values }, { run, now: NOW, shown }), run));

  const first = submit({ crop: 'lionsmane', kg: '526.32' });
  assert.deepEqual(first, [{ field: 'kg', message: `That's 0.55${nb}kg per block in one pick. Is 526.32${nb}kg right?`, warn: true }]);
  assert.equal(form.label(), 'Record anyway');
  assert.equal(submit({ crop: 'lionsmane', kg: '526.32' }), null, 'the same kg again: sent');
  assert.equal(form.label(), 'Record', 'plain again once sent: a failed send shows "Record"');

  form.type('kg');
  assert.ok(submit({ crop: 'lionsmane', kg: '600' }), 'a changed kg is asked about again');
  form.type('kg');
  assert.equal(form.label(), 'Record', 'typing puts the label back');
  assert.equal(submit({ crop: 'lionsmane', kg: '20' }), null, 'a plausible kg: sent at once');

  const g2 = pickGuard({ value: 'record', label: 'Record', fields: ['crop', 'kg'] });
  const f2 = fakeForm('Record');
  const submit2 = (values) => g2(f2, recordPicks(recordBody({ worker: 'Ali', pickedDate: shown.date, pickedTime: shown.time, ...values }, { run, now: NOW, shown }), run));
  assert.equal(submit2({ crop: 'oyster', kg: '526.32' }), null, '0.26 kg a block of 2,000 oyster blocks: not asked');
  assert.ok(submit2({ crop: 'lionsmane', kg: '526.32' }), 'the crop changed to lion\'s mane, 950 blocks: asked');
  f2.type('crop');
  assert.equal(f2.label(), 'Record', 'a crop change puts the label back');
  assert.ok(submit2({ crop: 'lionsmane', kg: '526.32' }), 'and asks again');
  assert.ok(g2(f2, [{ field: 'kg', kg: 526.32, blocks: 900 }]), 'the same kg over other blocks: asked again, even without an input event');
});

test('Edit: a changed kg asks; changed back to what it was sends without asking', () => {
  const h = { id: 9, crop: 'lionsmane', kg: 526.32, blocks: 950, pickedAt: NOW - 3_600_000 };
  const shown = whenBoxes(h.pickedAt);
  const form = fakeForm('Save');
  const guard = pickGuard({ value: 'save', label: 'Save', fields: ['kg'] });
  const submit = (kg) => guard(form, editPicks(editBody({ kg, pickedDate: shown.date, pickedTime: shown.time }, h, { run, now: NOW, shown }), h));
  assert.ok(submit('600'));
  assert.equal(form.label(), 'Save anyway');
  form.type('kg');
  assert.equal(submit('526.32'), null, 'the kg as it was: nothing to ask');
});

test('a mixed Done: each implausible crop box warned at once; "Done anyway" sends only that set of kg', () => {
  const row = { unit: 'kg', harvestCrops: [{ crop: 'oyster', name: 'Grey oyster', blocks: 500 }, { crop: 'lionsmane', name: "Lion's mane", blocks: 100 }] };
  const form = fakeForm('Done');
  const guard = pickGuard({ value: 'done', label: 'Done', fields: ['kg:oyster', 'kg:lionsmane'] });
  const submit = (values) => guard(form, donePicks(row, doneBody(row, 'Ali', values)));
  const both = submit({ 'kg:oyster': '200', 'kg:lionsmane': '40' });
  assert.deepEqual(both.map((p) => [p.field, p.warn]), [['kg:oyster', true], ['kg:lionsmane', true]]);
  assert.equal(form.label(), 'Done anyway');
  form.type('kg:oyster');
  assert.deepEqual(submit({ 'kg:oyster': '20', 'kg:lionsmane': '40' }).map((p) => p.field), ['kg:lionsmane'], 'one fixed: the other still asked');
  assert.equal(submit({ 'kg:oyster': '20', 'kg:lionsmane': '40' }), null, 'every warned box shown: sent');
});
