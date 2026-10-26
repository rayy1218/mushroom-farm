import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

// The room page and the drawing module must load: the farm serves every file the room page imports.
test('the farm serves the room page, the drawing and its stylesheet', async (t) => {
  const server = createApp(openDb(':memory:'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(`${base}/`)).text(), /href="\/mimic\.css"/);
  for (const name of ['room-detail.js', 'mimic.js', 'mimic-math.js', 'mimic.css']) {
    const res = await fetch(`${base}/${name}`);
    assert.equal(res.status, 200, name);
  }
  const room = readFileSync(new URL('../web/room-detail.js', import.meta.url), 'utf8');
  assert.match(room, /import \{ createMimic, startLoop \} from '\.\/mimic\.js'/);
  assert.match(room, /data-mimic-host/);
});

test('the modules import in Node (no DOM needed at load time)', async () => {
  const mimic = await import('../web/mimic.js');
  for (const name of ['createMimic', 'startLoop', 'fromRoom', 'fromSim', 'view', 'describe']) assert.equal(typeof mimic[name], 'function', name);
});
