// A worker's routes and replies (spec 2026-11-06-login-design.md 4): the allow-list, the money left out, the reply filter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { workerMay, workerReply, filterWorkerReplies, MONEY_KEYS } from '../server/roles.js';

test('the allow-list: floor work, a room\'s alarms, bands and filter changes, and acks yes; Business, Settings, Setup, usage, CSV, edits no', () => {
  const yes = [
    ['GET', '/api/overview'], ['GET', '/api/rooms'], ['GET', '/api/rooms/12'], ['GET', '/api/rooms/12/sensors'],
    ['GET', '/api/rooms/12/history'], ['GET', '/api/rooms/12/crop'], ['GET', '/api/rooms/12/machines'], ['GET', '/api/alarms'],
    ['GET', '/api/outdoor'], ['GET', '/api/outdoor/history'], ['GET', '/api/settings'], ['GET', '/api/events'],
    ['GET', '/api/tasks/today'], ['GET', '/api/calendar'], ['GET', '/api/rooms/12/tasks'], ['GET', '/api/rooms/12/tasks/log'],
    ['GET', '/api/workers'], ['POST', '/api/tasks/7/done'], ['POST', '/api/tasks/7/skip'], ['POST', '/api/tasks/7/undo'],
    ['GET', '/api/rooms/12/harvests'], ['GET', '/api/harvest'], ['POST', '/api/rooms/12/harvests'], ['GET', '/api/inventory'],
    ['GET', '/api/inventory/items/3'], ['POST', '/api/inventory/uses'], ['POST', '/api/inventory/counts'],
    ['GET', '/api/rooms/12/alarms'], ['GET', '/api/rooms/12/filter/changes'],
    // spec 2026-11-12-alarms-triage-design.md 7
    ['GET', '/api/rooms/12/control'], ['POST', '/api/alarms/5/ack'], ['POST', '/api/rooms/12/alarms/ack'], ['POST', '/api/alarms/ack'],
  ];
  const no = [
    ['PUT', '/api/settings'], ['GET', '/api/usage'], ['GET', '/api/rooms/12/usage'], ['PUT', '/api/rooms/12/control'],
    ['PUT', '/api/rooms/12/crop'], ['PUT', '/api/rooms/12/machines/ac'], ['POST', '/api/rooms'], ['DELETE', '/api/rooms/12'],
    ['GET', '/api/rooms/12/tasks/log.csv'], ['POST', '/api/rooms/12/tasks'], ['POST', '/api/tasks/7/cancel'], ['PUT', '/api/workers'],
    ['GET', '/api/task-rules'], ['PUT', '/api/harvests/4'], ['GET', '/api/harvest.csv'], ['GET', '/api/batches'],
    ['PUT', '/api/inventory/items/3'], ['GET', '/api/inventory/purchases'], ['POST', '/api/inventory/purchases'],
    ['PUT', '/api/inventory/moves/9'], ['POST', '/api/inventory/lots/9/throw-out'], ['GET', '/api/inventory/sheet'], ['GET', '/api/sales'],
    ['GET', '/api/costs'], ['GET', '/api/runs'], ['GET', '/api/business/summary'], ['GET', '/api/workers/accounts'],
    ['POST', '/api/workers/1/secret'], ['GET', '/api/alarms/5/ack'], ['POST', '/api/alarms/05/ack'],
    ['POST', '/api/rooms/12/filter/changed'], ['GET', '/api/rooms/12/filter/changed'], ['POST', '/api/rooms/12/filter/changes'],
    ['GET', '/api/rooms/012'], ['GET', '/api/rooms/12/'], ['HEAD', '/api/rooms'], ['GET', '/api'],
  ];
  for (const [m, p] of yes) assert.equal(workerMay(m, p), true, `${m} ${p}`);
  for (const [m, p] of no) assert.equal(workerMay(m, p), false, `${m} ${p}`);
});

test("a worker's reply: every money key gone at any depth, kg and amounts kept", () => {
  const run = {
    id: 1, kg: 120.5, perBlock: 0.24, be: 0.6, value: 1205, unpriced: ['lionsmane'], cost: { costPerKg: 0.8, cost: 96, days: 30, water: true },
    byCrop: [{ crop: 'oyster', kg: 100, value: 1000 }], missing: { dryKg: [], price: ['lionsmane'] }, harvests: [{ id: 3, kg: 2, worker: 'Ali' }],
  };
  assert.deepEqual(workerReply('/api/rooms/1/harvests', { current: run, past: [run] }), {
    current: { id: 1, kg: 120.5, perBlock: 0.24, be: 0.6, byCrop: [{ crop: 'oyster', kg: 100 }], harvests: [{ id: 3, kg: 2, worker: 'Ali' }] },
    past: [{ id: 1, kg: 120.5, perBlock: 0.24, be: 0.6, byCrop: [{ crop: 'oyster', kg: 100 }], harvests: [{ id: 3, kg: 2, worker: 'Ali' }] }],
  });
  assert.deepEqual(workerReply('/api/inventory/items/3', { id: 3, moves: [{ refKind: 'purchase', qty: 5, total: 50, unitCost: 10, supplier: 'Ah Seng' }] }),
    { id: 3, moves: [{ refKind: 'purchase', qty: 5, supplier: 'Ah Seng' }] });
  // ---- Money truth ---- the stock's worth is the owner's: the list's, each item's and each lot's
  assert.deepEqual(workerReply('/api/inventory', { items: [{ id: 3, qty: 839.5, value: 1175.3, unpriced: false }], value: { total: 1175.3, unpriced: [] } }),
    { items: [{ id: 3, qty: 839.5 }] });
  assert.deepEqual(workerReply('/api/inventory/items/3', { id: 3, value: 1175.3, unpriced: true, lots: [{ left: 839.5, unitCost: 1.4, value: 1175.3 }] }),
    { id: 3, lots: [{ left: 839.5 }] });
  assert.deepEqual(workerReply('/api/rooms/1/tasks', { longterm: [{ id: 9, text: 'Aircon 9,000 → 12,000 BTU/h', source: { kind: 'plan', rmMonth: 3 } }], today: [{ amount: 2.5, unit: 'kg' }] }),
    { longterm: [{ id: 9, text: 'Aircon 9,000 → 12,000 BTU/h', source: { kind: 'plan' } }], today: [{ amount: 2.5, unit: 'kg' }] });
  assert.ok(MONEY_KEYS.has('value') && MONEY_KEYS.has('total') && !MONEY_KEYS.has('amount') && !MONEY_KEYS.has('totals'));
});

test("a worker's settings: only how often the pages read", () => {
  assert.deepEqual(workerReply('/api/settings', {
    pollSeconds: 10, outdoorAddress: 9, electricityPrice: 0.55, waterPrice: 2, cropYield: { oyster: { dryKg: 1, priceKg: 10 } },
    telegramTokenSet: true, telegramTokenEnd: 'x9Zq', telegramChatId: '12345', telegramLastError: null, farmGateway: '10.0.0.5:502',
  }), { pollSeconds: 10 });
});

test('the reply filter: a JSON reply is filtered; a CSV, a stream, an error and a 204 are not', () => {
  const fake = () => {
    const res = { out: undefined, statusCode: 200, writeHead(status, headers) { this.statusCode = status; this.headers = headers; return this; }, end(chunk) { this.out = chunk; }, getHeader() {} };
    filterWorkerReplies(res, '/api/rooms/1/harvests');
    return res;
  };
  const json = fake();
  json.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  json.end(JSON.stringify({ current: { kg: 1, value: 10 } }));
  assert.deepEqual(JSON.parse(json.out), { current: { kg: 1 } });
  const csv = fake();
  csv.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' });
  csv.end('value\n10');
  assert.equal(csv.out, 'value\n10');
  const bad = fake();
  bad.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
  bad.end(JSON.stringify({ error: 'The total must be over 0', field: 'total' }));
  assert.deepEqual(JSON.parse(bad.out), { error: 'The total must be over 0', field: 'total' });
  const none = fake();
  none.writeHead(204);
  none.end();
  assert.equal(none.out, undefined);
});

// The reply filter against a real server: it fails closed however the handler writes its reply.
const serve = async (path, handler) => {
  const server = http.createServer((req, res) => { filterWorkerReplies(res, path); handler(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const get = () => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: '/' }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString() }));
    }).on('error', reject);
  });
  const out = await get();
  server.close();
  return out;
};
const BODY = JSON.stringify({ current: { kg: 1, value: 10 } });
const FILTERED = { current: { kg: 1 } };
const H = '/api/rooms/1/harvests';

test('the filter fails closed: setHeader then end, capitalised name, raw array, write then end', async () => {
  let r = await serve(H, (q, res) => { res.setHeader('content-type', 'application/json'); res.end(BODY); });
  assert.deepEqual(JSON.parse(r.body), FILTERED);
  r = await serve(H, (q, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(BODY); });
  assert.deepEqual(JSON.parse(r.body), FILTERED);
  r = await serve(H, (q, res) => { res.writeHead(200, ['Content-Type', 'application/json']); res.end(BODY); });
  assert.deepEqual(JSON.parse(r.body), FILTERED);
  r = await serve(H, (q, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write(BODY.slice(0, 10)); res.write(Buffer.from(BODY.slice(10))); res.end(); });
  assert.deepEqual(JSON.parse(r.body), FILTERED);
});

test('the filter: a stale content-length goes; end(cb) calls cb; a bad body becomes the error JSON; second end passes', async () => {
  let r = await serve(H, (q, res) => { res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(BODY) }); res.end(BODY); });
  assert.deepEqual(JSON.parse(r.body), FILTERED);
  let called = false;
  r = await serve(H, (q, res) => { res.setHeader('content-type', 'application/json'); res.end(BODY, () => { called = true; }); });
  assert.deepEqual(JSON.parse(r.body), FILTERED);
  assert.equal(called, true);
  r = await serve(H, (q, res) => { res.setHeader('content-type', 'application/json'); res.end(() => {}); });
  assert.equal(r.status, 200);
  const err = console.error;
  console.error = () => {};
  try {
    r = await serve(H, (q, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('<html>value 10</html>'); });
  } finally { console.error = err; }
  assert.deepEqual(JSON.parse(r.body), { error: 'Something went wrong' });
});

test('the filter leaves a CSV, a 4xx JSON and an event stream as they are; a null settings reply does not throw', async () => {
  let r = await serve(H, (q, res) => { res.writeHead(200, { 'content-type': 'text/csv' }); res.end('value\n10'); });
  assert.equal(r.body, 'value\n10');
  r = await serve(H, (q, res) => { res.writeHead(400, { 'content-type': 'application/json' }); res.end(BODY); });
  assert.equal(r.body, BODY);
  r = await serve(H, (q, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: {"value":1}\n\n'); setTimeout(() => res.end('data: 2\n\n'), 5); });
  assert.equal(r.body, 'data: {"value":1}\n\ndata: 2\n\n');
  r = await serve(H, (q, res) => { res.writeHead(200); res.end(BODY); });
  assert.deepEqual(JSON.parse(r.body), FILTERED);
  const err = console.error;
  console.error = () => {};
  try { r = await serve(H, (q, res) => { res.end('value 10'); }); } finally { console.error = err; }
  assert.equal(r.status, 500);
  assert.deepEqual(JSON.parse(r.body), { error: 'Something went wrong' });
  r = await serve('/api/settings', (q, res) => { res.setHeader('content-type', 'application/json'); res.end('null'); });
  assert.equal(r.body, 'null');
});
