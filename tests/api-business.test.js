// The Business summary's route (spec 2026-11-06-business-summary-design.md 5): GET /api/business/summary, no other method,
// and the 'costs' event when the month's energy has been worked out.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createEvents } from '../server/events.js';

const DAY = 86_400_000;
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4, trhAddress: 1 };

async function app(t) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const roomId = db.createRoom(ROOM, Date.now() - 2 * DAY).id;
  db.setProgram(roomId, { ...db.getProgram(roomId), crops: [{ crop: 'oyster', blocks: 600 }] }, { change: 'start', at: Date.now() - DAY });
  const runId = db.openRun(roomId).id;
  const server = createApp(db, { events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path) => {
    const res = await fetch(base + path, { method });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { call, seen, runId, roomId };
}

test('GET /api/business/summary: the month, last month, the needs, the open runs; no other method', async (t) => {
  const { call, runId } = await app(t);
  const r = await call('GET', '/api/business/summary');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body), ['month', 'lastMonth', 'needs', 'runs', 'errors']);
  assert.deepEqual(Object.keys(r.body.month), ['month', 'today', 'pending', 'tiles', 'repeating']);
  assert.deepEqual(r.body.needs, []);
  assert.deepEqual(r.body.runs.map((x) => [x.id, x.roomName]), [[runId, 'Container 1']]);
  assert.deepEqual(r.body.errors, {});
  assert.equal((await call('POST', '/api/business/summary')).status, 404);
  assert.equal((await call('GET', '/api/business')).status, 404);
  assert.equal((await call('GET', '/api/business/summary/1')).status, 404);
});

test('a cold month reads pending; its energy worked out publishes costs, and the month reads whole', async (t) => {
  const { call, seen } = await app(t);
  const cold = await call('GET', '/api/business/summary');
  assert.deepEqual([cold.body.month.pending, cold.body.month.tiles.costs, cold.body.month.tiles.profit], [true, null, null]);
  for (let i = 0; i < 100 && !seen.some(([type]) => type === 'costs'); i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(seen.some(([type]) => type === 'costs'), 'the warm done: costs published');
  const warm = await call('GET', '/api/business/summary');
  assert.deepEqual([warm.body.month.pending, warm.body.month.tiles.costs, warm.body.month.tiles.profit], [false, 0, 0]);
});
