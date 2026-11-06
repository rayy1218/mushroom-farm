// A worker's routes and replies (spec 2026-11-06-login-design.md 4): the allow-list, the money left out, the reply filter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerMay, workerReply, filterWorkerReplies, MONEY_KEYS } from '../server/roles.js';

test('the allow-list: floor work yes; Business, Settings, Setup, usage, CSV, edits no', () => {
  const yes = [
    ['GET', '/api/overview'], ['GET', '/api/rooms'], ['GET', '/api/rooms/12'], ['GET', '/api/rooms/12/sensors'],
    ['GET', '/api/rooms/12/history'], ['GET', '/api/rooms/12/crop'], ['GET', '/api/rooms/12/machines'], ['GET', '/api/alarms'],
    ['GET', '/api/outdoor'], ['GET', '/api/outdoor/history'], ['GET', '/api/settings'], ['GET', '/api/events'],
    ['GET', '/api/tasks/today'], ['GET', '/api/calendar'], ['GET', '/api/rooms/12/tasks'], ['GET', '/api/rooms/12/tasks/log'],
    ['GET', '/api/workers'], ['POST', '/api/tasks/7/done'], ['POST', '/api/tasks/7/skip'], ['POST', '/api/tasks/7/undo'],
    ['GET', '/api/rooms/12/harvests'], ['GET', '/api/harvest'], ['POST', '/api/rooms/12/harvests'], ['GET', '/api/inventory'],
    ['GET', '/api/inventory/items/3'], ['POST', '/api/inventory/uses'], ['POST', '/api/inventory/counts'],
  ];
  const no = [
    ['PUT', '/api/settings'], ['GET', '/api/usage'], ['GET', '/api/rooms/12/usage'], ['GET', '/api/rooms/12/control'],
    ['PUT', '/api/rooms/12/crop'], ['PUT', '/api/rooms/12/machines/ac'], ['POST', '/api/rooms'], ['DELETE', '/api/rooms/12'],
    ['GET', '/api/rooms/12/tasks/log.csv'], ['POST', '/api/rooms/12/tasks'], ['POST', '/api/tasks/7/cancel'], ['PUT', '/api/workers'],
    ['GET', '/api/task-rules'], ['PUT', '/api/harvests/4'], ['GET', '/api/harvest.csv'], ['GET', '/api/batches'],
    ['PUT', '/api/inventory/items/3'], ['GET', '/api/inventory/purchases'], ['POST', '/api/inventory/purchases'],
    ['PUT', '/api/inventory/moves/9'], ['POST', '/api/inventory/lots/9/throw-out'], ['GET', '/api/inventory/sheet'], ['GET', '/api/sales'],
    ['GET', '/api/costs'], ['GET', '/api/runs'], ['GET', '/api/business/summary'], ['GET', '/api/workers/accounts'],
    ['POST', '/api/workers/1/secret'], ['GET', '/api/rooms/012'], ['GET', '/api/rooms/12/'], ['HEAD', '/api/rooms'], ['GET', '/api'],
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
