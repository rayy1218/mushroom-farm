// Leaving a page must never freeze the app (critique 2026-10-28, P0): the simulation result's unmount called reload.cancel()
// after the throttle was removed (9c1c5c8), so the router threw before mounting the next page and the run stayed on screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');

test('the simulation result page cancels only what it made', () => {
  const page = src('simulation-page.js');
  const unmount = page.slice(page.indexOf('return function unmount()'));
  for (const m of unmount.matchAll(/\b([a-zA-Z_]\w*)\.cancel\(\)/g)) {
    assert.match(page, new RegExp(`(const|let) ${m[1]}\\b`), `${m[1]} is defined in the page`);
  }
});

test('the router mounts the next page even when the old page fails to unmount', () => {
  const app = src('app.js');
  assert.match(app, /try \{\n\s*unmount\?\.\(\);\n\s*\} catch \(err\) \{/);
});
