// GET and PUT /api/settings and the running poller.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { DEFAULT_SETTINGS } from '../server/settings.js';

let db;
let server;
let base;
const intervals = [];

before(async () => {
  db = openDb(':memory:');
  server = createApp(db, { poller: { setIntervalMs: (ms) => intervals.push(ms) } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

beforeEach(() => {
  db.setSetting('pollSeconds', '5');
  intervals.length = 0;
});

const put = (body, headers = { 'content-type': 'application/json' }) =>
  fetch(`${base}/api/settings`, { method: 'PUT', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

// An app on a fresh database, without a poller.
async function bareApp(t) {
  const fresh = openDb(':memory:');
  const app = createApp(fresh);
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => app.close(resolve));
    fresh.close();
  });
  return { fresh, url: `http://127.0.0.1:${app.address().port}/api/settings` };
}

test('GET returns the default when nothing is stored', async (t) => {
  const { url } = await bareApp(t);
  const res = await fetch(url);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), DEFAULT_SETTINGS);
});

test('PUT stores the interval, answers with the settings, and applies it to the poller at once', async () => {
  const res = await put({ pollSeconds: 12 });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ...DEFAULT_SETTINGS, pollSeconds: 12 });
  assert.deepEqual(intervals, [12000]);
  assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), { ...DEFAULT_SETTINGS, pollSeconds: 12 });
  assert.equal(db.getSetting('pollSeconds'), '12');
});

test('a bad interval is 400 with the field and changes nothing', async () => {
  for (const pollSeconds of [0, 301, 2.5, '5', null]) {
    const res = await put({ pollSeconds });
    assert.equal(res.status, 400, String(pollSeconds));
    assert.deepEqual(await res.json(), {
      error: 'Reading interval must be a whole number from 1 to 300 seconds', field: 'pollSeconds',
    });
  }
  assert.deepEqual(intervals, []);
  assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), DEFAULT_SETTINGS);
});

test('a body that is not an object is 400 without a field', async () => {
  const res = await put('[1]');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Body must be a JSON object' });
});

test('a body that is not JSON is 400, and a non-JSON content type is 415', async () => {
  assert.equal((await put('{nope')).status, 400);
  const res = await put('{"pollSeconds":6}', { 'content-type': 'text/plain' });
  assert.equal(res.status, 415);
  assert.deepEqual(await res.json(), { error: 'Content-Type must be application/json' });
  assert.deepEqual(intervals, []);
});

test('other methods and paths are 404', async () => {
  assert.equal((await fetch(`${base}/api/settings`, { method: 'DELETE' })).status, 404);
  assert.equal((await fetch(`${base}/api/settings`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${base}/api/settings/x`)).status, 404);
});

test('PUT works without a poller', async (t) => {
  const { fresh, url } = await bareApp(t);
  const res = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"pollSeconds":9}' });
  assert.equal(res.status, 200);
  assert.equal(fresh.getSetting('pollSeconds'), '9');
});
