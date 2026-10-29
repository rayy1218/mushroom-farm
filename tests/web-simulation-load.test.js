// The farm serves the whole import graph of the page, so the new modules (stepper, results, cards) load in a browser; and they
// import in Node without a DOM (nothing touches the document at load time).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

test('every module the page imports is served, from app.js to the end', async (t) => {
  const server = createApp(openDb(':memory:'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const seen = new Set();
  const todo = ['/app.js'];
  while (todo.length) {
    const path = todo.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await fetch(base + path);
    assert.equal(res.status, 200, `${path} is served`);
    assert.match(res.headers.get('content-type'), /javascript/, path);
    for (const [, name] of (await res.text()).matchAll(/from\s+['"]\.\/([a-z0-9-]+\.js)['"]/g)) todo.push(`/${name}`);
  }
  for (const name of ['simulate-dialog.js', 'simulate-math.js', 'simulation-page.js', 'simulation-math.js', 'crop-card.js', 'crop-math.js', 'sim-card.js', 'crops.js', 'suggest-page.js', 'suggest-math.js']) {
    assert.ok(seen.has(`/${name}`), `${name} is part of the page`);
  }
});

test('the new modules import in Node', async () => {
  for (const name of ['simulate-dialog', 'simulation-page', 'crop-card', 'sim-card', 'suggest-page']) {
    const mod = await import(`../web/${name}.js`);
    assert.ok(Object.keys(mod).length > 0, name);
  }
});
