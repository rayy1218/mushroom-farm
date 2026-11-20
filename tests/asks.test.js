// Asks and who (spec 2026-11-12-data-integrity-design.md 3 and 5): askOrThrow's 409, confirmed kinds, the API's reply shape;
// who made a request; a reason's check; the Undo window.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askOrThrow, confirmedOf, AskError } from '../server/asks.js';
import { HttpError } from '../server/api.js';
import { whoOf, APP, reasonOf, record, undoAllowed } from '../server/changes.js';
import { openDb } from '../server/db.js';

const ASK = { kind: 'duplicate', field: 'kg', text: 'Is this another pick?' };

test('askOrThrow: none or all confirmed returns; an open ask throws a 409 AskError (an HttpError) with the open asks only', () => {
  askOrThrow([], []);
  askOrThrow([ASK], ['duplicate']);
  const pick = { kind: 'pick', field: 'kg', text: 'Is 85.10 kg right?' };
  try {
    askOrThrow([ASK, pick], ['duplicate']);
    assert.fail('no throw');
  } catch (err) {
    assert.ok(err instanceof AskError && err instanceof HttpError);
    assert.equal(err.status, 409);
    assert.equal(err.message, 'Check before saving');
    assert.deepEqual(err.asks, [pick]);
  }
});

test('confirmedOf: the known kinds of an array; anything else is none', () => {
  assert.deepEqual(confirmedOf({ confirmed: ['duplicate', 'nonsense', 'oversell'] }), ['duplicate', 'oversell']);
  assert.deepEqual(confirmedOf({ confirmed: 'duplicate' }), []);
  assert.deepEqual(confirmedOf(null), []);
});

test('whoOf: the session\'s name and role, else the app', () => {
  assert.deepEqual(whoOf({ who: { name: 'Aminah', role: 'worker', id: 3 } }), { name: 'Aminah', role: 'worker' });
  assert.equal(whoOf({}), APP);
});

test('reasonOf: required 3–200 characters, trimmed; optional gives null', () => {
  assert.equal(reasonOf({ reason: '  Entered twice ' }), 'Entered twice');
  assert.throws(() => reasonOf({}), (e) => e.status === 400 && e.field === 'reason' && e.message === 'Say why, in a few words');
  assert.throws(() => reasonOf({ reason: 'no' }), (e) => e.field === 'reason');
  assert.throws(() => reasonOf({ reason: 'x'.repeat(201) }), (e) => e.field === 'reason');
  assert.equal(reasonOf({ reason: '' }, { required: false }), null);
});

test('the Undo window: 60 s from the add entry, the same person', () => {
  const db = openDb(':memory:');
  record(db, { name: 'Sara', role: 'worker' }, 1_000, { kind: 'move', rowId: 4, action: 'add' });
  assert.equal(undoAllowed(db, 'move', 4, { name: 'Sara', role: 'worker' }, 41_000), true);
  assert.equal(undoAllowed(db, 'move', 4, { name: 'Sara', role: 'worker' }, 71_000), false);
  assert.equal(undoAllowed(db, 'move', 4, { name: 'Lim', role: 'owner' }, 2_000), false);
  assert.equal(undoAllowed(db, 'move', 5, { name: 'Sara', role: 'worker' }, 2_000), false, 'no add entry');
  db.close();
});
