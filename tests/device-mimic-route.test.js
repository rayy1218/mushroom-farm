import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors } from '../device/sensors.js';
import { createDeviceHttp, createRequestLog } from '../device/http.js';

let http, base, dir;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'device-shared-'));
  mkdirSync(join(dir, 'page'));
  writeFileSync(join(dir, 'page', 'index.html'), '<h1>device</h1>');
  writeFileSync(join(dir, 'page', 'mimic.js'), '// device copy, must NOT be served');
  writeFileSync(join(dir, 'mimic.js'), '// shared mimic');
  writeFileSync(join(dir, 'other.js'), '// not shared');
  http = createDeviceHttp(createSensors({}), createRequestLog(), { webDir: join(dir, 'page'), sharedDir: dir });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${http.address().port}`;
});

after(async () => {
  await new Promise((resolve) => http.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

test('the shared drawing files come from the shared folder, with their types', async () => {
  const js = await fetch(`${base}/mimic.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /text\/javascript/);
  assert.equal(await js.text(), '// shared mimic');
  assert.equal((await fetch(`${base}/other.js`)).status, 404); // only the listed shared files
  assert.equal((await fetch(`${base}/mimic-math.js`)).status, 404); // listed, but absent in this folder
});

test('the real device serves the farm app\'s own drawing files, byte for byte', async () => {
  const real = createDeviceHttp(createSensors({}), createRequestLog());
  await new Promise((resolve) => real.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${real.address().port}`;
    for (const [name, type] of [['mimic.js', 'text/javascript'], ['mimic-math.js', 'text/javascript'], ['machines-math.js', 'text/javascript'], ['mimic.css', 'text/css']]) {
      const res = await fetch(`${url}/${name}`);
      assert.equal(res.status, 200, name);
      assert.match(res.headers.get('content-type'), new RegExp(type));
      assert.equal(await res.text(), readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8'), name);
    }
    // the device page and its drawing module still load
    assert.match(await (await fetch(`${url}/`)).text(), /mimic\.css/);
    assert.equal((await fetch(`${url}/sim-drawing.js`)).status, 200);
    assert.equal((await fetch(`${url}/app.js`)).status, 200);
    assert.equal((await fetch(`${url}/..%2Fweb%2Fmimic.js`)).status, 404);
  } finally {
    await new Promise((resolve) => real.close(resolve));
  }
});
