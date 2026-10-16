import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAIN = new URL('../server/main.js', import.meta.url).pathname;

// Starts server/main.js with the given env and resolves with the first line it prints.
function start(t, env) {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN], {
    env: { ...process.env, ...env },
  });
  const exited = once(child, 'exit');
  t.after(() => child.kill('SIGKILL'));
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const firstLine = new Promise((resolve) => {
    const onData = (chunk) => {
      out += chunk;
      if (out.includes('\n')) resolve(out.split('\n')[0]);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
  return { child, firstLine, exited };
}

test('starts on FARM_PORT with FARM_DB and stops cleanly on SIGINT', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-main-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'nested', 'farm.db');
  const { child, firstLine, exited } = start(t, { FARM_PORT: '0', FARM_DB: dbPath });
  const line = await firstLine;
  const match = /^Farm app on http:\/\/localhost:(\d+) \(database (.+)\)$/.exec(line);
  assert.ok(match, line);
  assert.equal(match[2], dbPath);
  assert.ok(existsSync(dbPath), 'creates the database folder and file');

  const res = await fetch(`http://localhost:${match[1]}/api/rooms`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);

  child.kill('SIGINT');
  const [code] = await exited;
  assert.equal(code, 0);
});

test('a bad FARM_PORT stops with a message', async (t) => {
  const { firstLine, exited } = start(t, { FARM_PORT: 'abc', FARM_DB: ':memory:' });
  assert.equal(await firstLine, 'FARM_PORT must be a whole number from 0 to 65535, got "abc"');
  const [code] = await exited;
  assert.equal(code, 1);
});
