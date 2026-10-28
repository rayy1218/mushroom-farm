// The filter over HTTP (spec 2026-10-22-filter-design.md sections 3 to 5): the room's filter fields, the filter pressure
// sensor in /sensors, Filter changed and the list of changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

async function app(t, { controller = null } = {}) {
  const db = openDb(':memory:');
  const server = createApp(db, { controller });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, call };
}

test('a room is made and changed with its filter settings and sensor address; an older page keeps them', async (t) => {
  const { call } = await app(t);
  const made = await call('POST', '/api/rooms', { ...ROOM, fanMaxPa: 250, filterCleanPa: 30, filterFinalPa: 120, filterChangeDays: 21, dpAddress: 9 });
  assert.equal(made.status, 201);
  assert.deepEqual([made.body.fanMaxPa, made.body.filterCleanPa, made.body.filterFinalPa, made.body.filterChangeDays, made.body.dpAddress], [250, 30, 120, 21, 9]);
  assert.equal(typeof made.body.filterChangedAt, 'number');
  const older = await call('PUT', `/api/rooms/${made.body.id}`, { ...ROOM, dpAddress: 9 }); // a page without the filter fields
  assert.deepEqual([older.body.fanMaxPa, older.body.filterChangeDays], [250, 21]);
  const bad = await call('PUT', `/api/rooms/${made.body.id}`, { ...ROOM, fanMaxPa: 20, filterCleanPa: 30 });
  assert.deepEqual(bad, { status: 400, body: { error: "Fan maximum pressure must be above the clean filter's pressure drop", field: 'fanMaxPa' } });
});

test('the filter sensor address must not be the outdoor sensor\'s, nor the outdoor sensor a room\'s filter sensor', async (t) => {
  const { db, call } = await app(t);
  db.setSetting('outdoorAddress', '20');
  assert.deepEqual(await call('POST', '/api/rooms', { ...ROOM, dpAddress: 20 }), {
    status: 400, body: { error: 'Address 20 is used by the outdoor sensor', field: 'dpAddress' },
  });
  await call('POST', '/api/rooms', { ...ROOM, dpAddress: 21 });
  const r = await call('PUT', '/api/settings', { outdoorAddress: 21 });
  assert.deepEqual(r, { status: 400, body: { error: 'Address 21 is used by Room 1', field: 'outdoorAddress' } });
});

test('/sensors gives the filter pressure sensor fourth, after the energy meter', async (t) => {
  const { db, call } = await app(t);
  const id = db.createRoom({ ...ROOM, dpAddress: 7 }).id;
  db.addFilterReading({ roomId: id, address: 7, at: 100, ok: true, pa: 61.5 });
  const { body } = await call('GET', `/api/rooms/${id}/sensors`);
  assert.deepEqual(body.map((s) => s.kind), ['trh', 'co2', 'meter', 'dp']);
  assert.deepEqual(body[3], { kind: 'dp', address: 7, status: 'online', failuresInRow: 0, lastOk: { at: 100, pa: 61.5 }, readings: [{ at: 100, ok: true, pa: 61.5 }], lastRunning: null });
});

test('/sensors: the filter sensor carries the last reading taken with the intake running', async (t) => {
  const { db, call } = await app(t);
  const now = Date.now();
  const id = db.createRoom({ ...ROOM, dpAddress: 7 }, now - 3_600_000).id; // its filter counts as changed then
  db.logMachine(id, 'intake', { on: true }, 'auto', now - 600_000);
  db.addFilterReading({ roomId: id, address: 7, at: now - 400_000, ok: true, pa: 52.5 });
  db.logMachine(id, 'intake', { on: false }, 'auto', now - 300_000);
  db.addFilterReading({ roomId: id, address: 7, at: now - 1000, ok: true, pa: 0.1 });
  const { body } = await call('GET', `/api/rooms/${id}/sensors`);
  assert.deepEqual(body[3].lastOk, { at: now - 1000, pa: 0.1 });
  assert.deepEqual(body[3].lastRunning, { at: now - 400_000, pa: 52.5 });
});

test('Filter changed: the change time, a change row, the filter alarms cleared, the controller told; the list of changes', async (t) => {
  const told = [];
  const controller = { filterChanged: (id) => told.push(id), forget() {}, get: () => null };
  const { db, call } = await app(t, { controller });
  const id = db.createRoom(ROOM, 0).id;
  db.raiseAlarm(id, 'filterDue', 'warning', 'Filter in use 31 days: change every 30 days', 1000);
  const before = Date.now();
  const r = await call('POST', `/api/rooms/${id}/filter/changed`);
  assert.equal(r.status, 200);
  assert.ok(r.body.filterChangedAt >= before);
  assert.deepEqual(db.activeAlarms(id), []);
  assert.deepEqual(told, [id]);
  const list = await call('GET', `/api/rooms/${id}/filter/changes`);
  assert.deepEqual(list, { status: 200, body: [{ at: r.body.filterChangedAt, paBefore: null }] });
});

test('the filter routes: 404 for no room, other methods not found', async (t) => {
  const { db, call } = await app(t);
  assert.deepEqual(await call('POST', '/api/rooms/99/filter/changed'), { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(await call('GET', '/api/rooms/99/filter/changes'), { status: 404, body: { error: 'Room not found' } });
  const id = db.createRoom(ROOM).id;
  assert.equal((await call('GET', `/api/rooms/${id}/filter/changed`)).status, 404);
  assert.equal((await call('POST', `/api/rooms/${id}/filter/changes`)).status, 404);
  assert.equal((await call('POST', `/api/rooms/${id}/filter/changed`)).status, 200, 'works without a controller');
});
