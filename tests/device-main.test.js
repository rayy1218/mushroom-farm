import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAIN = new URL('../device/main.js', import.meta.url).pathname;

// Starts device/main.js with the given env and resolves with the first line it prints.
function start(t, env) {
  const dir = mkdtempSync(join(tmpdir(), 'device-main-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN], {
    env: { ...process.env, DEVICE_MODBUS_PORT: '0', DEVICE_HTTP_PORT: '0', DEVICE_STATE: join(dir, 'state.json'), ...env },
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

const LINE = /^Device app: Modbus on (.+):(\d+), control page http:\/\/localhost:(\d+)$/;

test('listens on 127.0.0.1 by default and stops cleanly on SIGINT', async (t) => {
  const { child, firstLine, exited } = start(t, { DEVICE_HOST: '' });
  const match = LINE.exec(await firstLine);
  assert.ok(match);
  assert.equal(match[1], '127.0.0.1');
  const res = await fetch(`http://127.0.0.1:${match[3]}/`);
  assert.equal(res.status, 200);
  child.kill('SIGINT');
  const [code] = await exited;
  assert.equal(code, 0);
});

test('DEVICE_HOST sets the address both ports listen on (0.0.0.0 in a container)', async (t) => {
  const { firstLine } = start(t, { DEVICE_HOST: '0.0.0.0' });
  const match = LINE.exec(await firstLine);
  assert.ok(match);
  assert.equal(match[1], '0.0.0.0');
  const res = await fetch(`http://127.0.0.1:${match[3]}/`);
  assert.equal(res.status, 200);
});
