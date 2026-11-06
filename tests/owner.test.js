// npm run owner -- "<name>" (spec 2026-11-06-login-design.md 5): the first owner and a lost owner password.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { checkSecret } from '../server/auth.js';
import { applyKey, setOwnerPassword } from '../server/owner.js';

mkdirSync('/tmp/login', { recursive: true });
const SCRIPT = fileURLToPath(new URL('../server/owner.js', import.meta.url));

test('setOwnerPassword: checks the name and the password, then sets the owner', async () => {
  const db = openDb(':memory:');
  assert.deepEqual(await setOwnerPassword(db, '  ', 'long enough password'), { error: 'Give a name of 1 to 40 characters' });
  assert.deepEqual(await setOwnerPassword(db, 'Ray', 'short'), { error: 'The password must be at least 12 characters' });
  const { id } = await setOwnerPassword(db, ' Ray ', 'long enough password');
  assert.equal(db.account(id).name, 'Ray');
  assert.equal(await checkSecret('long enough password', db.account(id).secretHash), true);
  db.close();
});

test('the script: the password twice from a pipe; two that differ change nothing', () => {
  const file = join(mkdtempSync('/tmp/login/owner-'), 'farm.db');
  const run = (input) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, 'Ray'], {
    input, env: { ...process.env, FARM_DB: file }, encoding: 'utf8',
  });
  const differ = run('long enough password\nanother long password\n');
  assert.equal(differ.status, 1);
  assert.match(differ.stderr, /The two passwords differ/);
  const ok = run('long enough password\nlong enough password\n');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Ray is an owner and can sign in with that password\./);
  const db = openDb(file);
  assert.deepEqual(db.loginNames().map((n) => [n.name, n.kind]), [['Ray', 'password']]);
  db.close();
});

const runScript = (args, input, file) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, ...args], {
  input, env: { ...process.env, FARM_DB: file }, encoding: 'utf8',
});
const tmpDb = () => join(mkdtempSync('/tmp/login/owner-'), 'farm.db');
const PW = 'long enough password';

test('the script: no name, a bad name or a short password stop before anything is written', () => {
  const file = tmpDb();
  const none = runScript([], PW + '\n' + PW + '\n', file);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /Usage: npm run owner/);
  const long = runScript(['x'.repeat(41)], PW + '\n' + PW + '\n', file);
  assert.equal(long.status, 1);
  assert.match(long.stderr, /Give a name of 1 to 40 characters/);
  const short = runScript(['Ray'], 'short\nshort\n', file);
  assert.equal(short.status, 1);
  assert.match(short.stderr, /The password must be at least 12 characters/);
  assert.equal(existsSync(file), false);
});

test('the script: a database that cannot be opened ends in one line, not a stack', () => {
  const run = runScript(['Ray'], PW + '\n' + PW + '\n', '/nonexistent/dir/x.db');
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^Could not set the owner:/);
  assert.doesNotMatch(run.stderr, / {4}at /);
});

test('the script: passwords that differ leave the database without an owner', () => {
  const file = tmpDb();
  assert.equal(runScript(['Ray'], PW + '\nanother long password\n', file).status, 1);
  if (existsSync(file)) {
    const db = openDb(file);
    assert.deepEqual(db.loginNames(), []);
    db.close();
  }
  assert.equal(runScript(['Ray'], PW + '\n' + PW + '\n', file).status, 0);
});

test('the script: an existing worker keeps their spelling in the message', async () => {
  const file = tmpDb();
  const db = openDb(file);
  db.setWorkers([{ name: 'ray' }]);
  db.close();
  const run = runScript(['Ray'], PW + '\n' + PW + '\n', file);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^ray is an owner/);
  const db2 = openDb(file);
  assert.deepEqual(db2.loginNames().map((n) => n.name), ['ray']);
  db2.close();
});

test('applyKey: typing, Enter, backspace, Ctrl+C, Ctrl+D, arrow keys and \\r\\n', () => {
  const type = (keys, state = { text: '', esc: '', cr: false }) => {
    let last = state;
    for (const ch of keys) { last = { ...last, ...applyKey(last, ch) }; if (last.done || last.stop) break; }
    return last;
  };
  assert.equal(type('abc').text, 'abc');
  assert.equal(type('abc\r').done, true);
  assert.equal(type('abc\n').done, true);
  assert.equal(type('café\u007f').text, 'caf');
  assert.equal(type('\u007f').text, '');
  assert.equal(type('ab\u0003').stop, true);
  assert.equal(type('\u0004').stop, true);
  assert.equal(type('ab\u0004').stop, undefined);
  assert.equal(type('ab\u0004').text, 'ab');
  assert.equal(type('a\u001b[Ab\u001b[1;5Cc').text, 'abc');
  assert.equal(type('a\u001bOAb').text, 'ab');
  assert.equal(type('a\tb').text, 'ab');
  const afterCr = { text: '', esc: '', cr: true };
  assert.equal(applyKey(afterCr, '\n').done, undefined);
  assert.equal(type('\nx', afterCr).text, 'x');
});
