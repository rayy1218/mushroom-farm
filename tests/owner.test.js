// npm run owner -- "<name>" (spec 2026-11-06-login-design.md 5): the first owner and a lost owner password.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { checkSecret } from '../server/auth.js';
import { setOwnerPassword } from '../server/owner.js';

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
