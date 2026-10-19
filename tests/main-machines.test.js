// server/main.js with machines: a command reaches the gateway, and polls show up in the status.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const MAIN = new URL('../server/main.js', import.meta.url).pathname;

test('a relay command is written to the gateway and the polled state comes back in the status', async (t) => {
  const coils = [false, false, false, false];
  const gateway = net.createServer((socket) => {
    socket.on('error', () => {});
    socket.on('data', (f) => {
      const fn = f[7];
      if (fn === 5) {
        coils[f.readUInt16BE(8)] = f.readUInt16BE(10) === 0xff00;
        socket.write(Buffer.from([f[0], f[1], 0, 0, 0, 6, f[6], 5, ...f.subarray(8, 12)]));
      } else if (fn === 1 || fn === 2) {
        const bits = coils.reduce((n, on, i) => n | (on ? 1 << i : 0), 0);
        socket.write(Buffer.from([f[0], f[1], 0, 0, 0, 4, f[6], fn, 1, bits]));
      }
    });
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  t.after(() => gateway.close());
  const dir = mkdtempSync(join(tmpdir(), 'farm-main-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN], {
    env: { ...process.env, FARM_PORT: '0', FARM_DB: join(dir, 'farm.db'), FARM_GATEWAY: `127.0.0.1:${gateway.address().port}` },
  });
  t.after(() => child.kill('SIGKILL'));
  let err = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { err += d; });
  child.stdout.setEncoding('utf8');
  // The first stdout line, or the child's exit if it fails at startup (the fake gateway would keep a hang alive).
  const line = await Promise.race([
    new Promise((resolve) => child.stdout.once('data', (d) => resolve(d.split('\n')[0]))),
    once(child, 'exit').then(([code]) => { throw new Error(`server/main.js exited with ${code} before it printed: ${err}`); }),
  ]);
  const base = `http://localhost:${/localhost:(\d+)/.exec(line)[1]}`;
  const json = { 'content-type': 'application/json' };

  const post = await fetch(`${base}/api/rooms`, {
    method: 'POST', headers: json, body: JSON.stringify({ name: 'R', length: 2, width: 2, height: 2, relayAddress: 3 }),
  });
  const { id } = await post.json();
  const put = await fetch(`${base}/api/rooms/${id}/machines/circulation`, { method: 'PUT', headers: json, body: '{"on":true}' });
  assert.equal(put.status, 200);
  const sent = await put.json();
  assert.equal(sent.relay.lastWrite.ok, true);
  assert.equal(sent.relay.machines[2].commanded, true);
  assert.deepEqual(coils, [false, false, true, false]);

  // The next poll (the first cycle may have run before the room existed: up to 5 s) reports it.
  const deadline = Date.now() + 9000;
  let view;
  while (Date.now() < deadline) {
    view = await (await fetch(`${base}/api/rooms/${id}/machines`)).json();
    if (view.relay.machines[2].reported === true) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(view.relay.machines[2].reported, true);
  assert.equal(view.relay.machines[2].running, true);
  assert.equal(view.relay.machines[2].status, 'on');
  assert.equal(view.relay.machines[0].status, 'off');
  child.kill('SIGTERM');
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
});
