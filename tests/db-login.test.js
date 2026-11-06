// The login tables (spec 2026-11-06-login-design.md 2): the step to version 25, a worker's sign-in state, the sessions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

mkdirSync('/tmp/login', { recursive: true });
const fileOf = () => join(mkdtempSync('/tmp/login/db-'), 'farm.db');
const T = Date.UTC(2026, 10, 6, 2); // 10:00 on the farm
const pick = ({ name, active, role, secretHash }) => ({ name, active, role, secretHash });

test('a new database is at version 25 with the sign-in columns on workers and a STRICT sessions table', () => {
  const file = fileOf();
  openDb(file).close();
  const raw = new DatabaseSync(file);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 25);
  const cols = raw.prepare('PRAGMA table_info(workers)').all().map((c) => c.name);
  assert.deepEqual(cols, ['id', 'name', 'active', 'role', 'secret_hash', 'failed_tries', 'locked_until']);
  assert.match(raw.prepare("SELECT sql FROM sqlite_master WHERE name = 'sessions'").get().sql, /STRICT/);
  assert.throws(() => raw.exec("INSERT INTO workers (name, role) VALUES ('X', 'boss')"), /CHECK/);
  raw.close();
});

test('a version 24 database is upgraded to 25: its workers keep their names and become workers who cannot sign in yet', () => {
  const file = fileOf();
  const db = openDb(file);
  db.setWorkers([{ name: 'Ali', active: true }, { name: 'Siti', active: false }]);
  db.close();
  const raw = new DatabaseSync(file);
  raw.exec(`DROP TABLE sessions;
    CREATE TABLE workers_24 (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))) STRICT;
    INSERT INTO workers_24 SELECT id, name, active FROM workers;
    DROP TABLE workers;
    ALTER TABLE workers_24 RENAME TO workers;
    PRAGMA user_version = 24;`);
  raw.close();
  const again = openDb(file);
  assert.deepEqual(again.listWorkers().map((w) => [w.name, w.active]), [['Ali', true], ['Siti', false]]);
  const ali = again.account(again.listWorkers()[0].id);
  assert.deepEqual([ali.role, ali.secretHash, ali.failedTries, ali.lockedUntil], ['worker', null, 0, null]);
  assert.deepEqual(again.loginNames(), []);
  again.close();
});

test('loginNames: the active workers with a secret, by name, with the kind of secret', () => {
  const db = openDb(':memory:');
  db.setWorkers([{ name: 'Siti', active: true }, { name: 'Ali', active: true }, { name: 'Ah Kow', active: false }, { name: 'New', active: true }]);
  const id = (n) => db.listWorkers().find((w) => w.name === n).id;
  db.setSecret(id('Siti'), 'h1');
  db.setSecret(id('Ali'), 'h2');
  db.setSecret(id('Ah Kow'), 'h3');
  db.setRole(id('Siti'), 'owner');
  assert.deepEqual(db.loginNames(), [{ id: id('Ali'), name: 'Ali', kind: 'pin' }, { id: id('Siti'), name: 'Siti', kind: 'password' }]);
  assert.equal(db.ownerCount(), 1);
});

test('a session: added, found by its token hash with its worker, touched, ended; expired ones pruned', () => {
  const db = openDb(':memory:');
  db.setWorkers([{ name: 'Ali', active: true }]);
  const [ali] = db.listWorkers();
  const id = db.addSession({ tokenHash: 'aa', workerId: ali.id, at: T, expiresAt: T + 1000, userAgent: 'Phone' });
  assert.deepEqual(db.session('aa'), { id, workerId: ali.id, name: 'Ali', role: 'worker', active: true, lastSeen: T, expiresAt: T + 1000 });
  db.touchSession(id, T + 10, T + 2000);
  assert.deepEqual([db.session('aa').lastSeen, db.session('aa').expiresAt], [T + 10, T + 2000]);
  assert.equal(db.session('bb'), null);
  db.addSession({ tokenHash: 'cc', workerId: ali.id, at: T, expiresAt: T + 5, userAgent: null });
  assert.equal(db.pruneSessions(T + 100), 1);
  db.endSession(id);
  assert.equal(db.session('aa'), null);
});

test("a new secret, a role change, Sign out everywhere, made inactive or removed: the worker's sessions end", () => {
  const db = openDb(':memory:');
  db.setWorkers([{ name: 'Ali', active: true }, { name: 'Siti', active: true }]);
  const [ali, siti] = db.listWorkers();
  const add = (w, h) => db.addSession({ tokenHash: h, workerId: w.id, at: T, expiresAt: T + 1e9, userAgent: null });
  add(ali, 'a1');
  db.setSecret(ali.id, 'x');
  assert.equal(db.session('a1'), null);
  add(ali, 'a2');
  db.setRole(ali.id, 'owner');
  assert.equal(db.session('a2'), null);
  add(ali, 'a3');
  add(ali, 'a4');
  assert.equal(db.signOutEverywhere(ali.id), 2);
  add(ali, 'a5');
  add(siti, 's1');
  db.setWorkers([{ id: ali.id, name: 'Ali', active: false }, { id: siti.id, name: 'Siti', active: true }]);
  assert.equal(db.session('a5'), null);
  assert.notEqual(db.session('s1'), null);
  db.setWorkers([]);
  assert.equal(db.session('s1'), null);
  assert.equal(db.pruneSessions(Infinity), 0); // the row is gone, not only hidden by the join
});

test('setTries and accounts: the lock and the signed-in count for Settings → Workers', () => {
  const db = openDb(':memory:');
  db.setWorkers([{ name: 'Ali', active: true }]);
  const [ali] = db.listWorkers();
  db.setSecret(ali.id, 'x');
  db.setTries(ali.id, 3, T + 60_000);
  assert.deepEqual([db.account(ali.id).failedTries, db.account(ali.id).lockedUntil], [3, T + 60_000]);
  db.addSession({ tokenHash: 'a', workerId: ali.id, at: T, expiresAt: T + 1e6, userAgent: null });
  db.addSession({ tokenHash: 'b', workerId: ali.id, at: T, expiresAt: T - 1, userAgent: null });
  assert.deepEqual(db.accounts(T), [{ id: ali.id, name: 'Ali', active: true, role: 'worker', hasSecret: true, lockedUntil: T + 60_000, sessions: 1 }]);
});

test('setOwner: finds the named worker (any case) or adds them, an active owner with the hash; their sessions end', () => {
  const db = openDb(':memory:');
  db.setWorkers([{ name: 'Ray', active: false }]);
  const [ray] = db.listWorkers();
  db.addSession({ tokenHash: 'r', workerId: ray.id, at: T, expiresAt: T + 1e6, userAgent: null });
  assert.equal(db.setOwner('ray', 'hash1'), ray.id);
  assert.deepEqual(pick(db.account(ray.id)), { name: 'Ray', active: true, role: 'owner', secretHash: 'hash1' });
  assert.equal(db.session('r'), null);
  const kelvin = db.setOwner('Kelvin', 'hash2');
  assert.deepEqual(pick(db.account(kelvin)), { name: 'Kelvin', active: true, role: 'owner', secretHash: 'hash2' });
  assert.equal(db.ownerCount(), 2);
});
