// Tasks in the database (spec 2026-10-30-tasks-design.md section 5): upgrade 18 to 19, the task rows, workers and the owner's
// rule changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const TABLES = ['custom_task_rules', 'task_rule_settings', 'tasks', 'workers'];

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return { db, id: db.createRoom(ROOM, 1000).id };
}

const daily = (roomId, extra = {}) => ({ roomId, ruleKey: 'footbath', date: '2026-10-30', slot: 'morning', text: 'Change the footbath at the door', at: 5000, ...extra });

test('a version 18 file is upgraded to 19 with the task tables, keeping its rooms', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'v18.db');
  const first = openDb(path);
  const id = first.createRoom(ROOM, 1000).id;
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec(`DROP TABLE tasks; DROP TABLE workers; DROP TABLE task_rule_settings; DROP TABLE custom_task_rules;
            PRAGMA user_version = 18;`);
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.equal(db.getRoom(id).name, 'Room 1');
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 19);
  const names = check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const table of TABLES) assert.ok(names.includes(table), table);
});
