// The sign-in view's words and the page's entry (spec 2026-11-06-login-design.md 6).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECRET, secretProblem, landing, failText } from '../web/login-math.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');

test('a PIN is 6 digits on a number pad; a password is typed as one', () => {
  assert.deepEqual([SECRET.pin.label, SECRET.pin.inputmode, SECRET.pin.maxlength], ['PIN', 'numeric', 6]);
  assert.deepEqual([SECRET.password.label, SECRET.password.autocomplete], ['Password', 'current-password']);
  assert.equal(secretProblem('pin', '482913'), null);
  assert.equal(secretProblem('pin', '48291'), 'Type your 6-digit PIN');
  assert.equal(secretProblem('password', ''), 'Type your password');
  assert.equal(secretProblem('password', 'x'), null, 'the server says when it is wrong');
});

test('after signing in: the address asked for, else Today for a worker and the Overview for an owner', () => {
  assert.equal(landing('#/calendar', 'worker'), '#/calendar');
  assert.equal(landing('', 'worker'), '#/today');
  assert.equal(landing('#/', 'owner'), '#/overview');
});

test('the words for a failed try', () => {
  assert.equal(failText(0, ''), "Couldn't reach the farm app. Try again.");
  assert.equal(failText(401, 'That PIN is not right'), 'That PIN is not right');
  assert.equal(failText(500, ''), 'Something went wrong. Try again.');
});

test('the page starts at boot.js; the app (and its live stream) only once someone is signed in; a later 401 starts again', () => {
  assert.ok(src('index.html').includes('<script type="module" src="/boot.js"></script>'));
  assert.ok(!src('index.html').includes('src="/app.js"'));
  assert.ok(src('boot.js').includes("await import('./app.js')"));
  assert.ok(src('api.js').includes('res.status === 401'));
});
