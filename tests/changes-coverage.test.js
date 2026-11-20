// The change log is complete (spec 2026-11-12-data-integrity-design.md 3.2 and 10): every money write the API takes, driven
// over HTTP as the owner or a worker, leaves exactly its entries with the signed-in name; the log's routes read them back.
// A write route added without its entry fails here. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signedInFarm } from './integrity-fixture.js';

const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

test('every money write leaves its entry, with who; GET /api/changes reads them by record and by period', async (t) => {
  const { db, call, room } = await signedInFarm(t);
  const log = () => db.changesBetween(0, Date.now() + 60_000, { limit: 10_000 });
  // step(label, request, [kind, action, by] for each entry it must add)
  const step = async (label, req, expected) => {
    const n = log().length;
    const res = await req();
    assert.ok(res.status < 300, `${label}: ${res.status} ${JSON.stringify(res.body)}`);
    const added = log().slice(0, log().length - n).reverse().map((e) => [e.kind, e.action, e.by]);
    assert.deepEqual(added, expected, label);
    return res.body;
  };
  const owner = (kind, action) => [kind, action, 'Lim'];
  const worker = (kind, action) => [kind, action, 'Aminah'];

  // Sales
  const buyer = (await call('POST', '/api/buyers', { name: 'Restoran Wong' })).body;
  const sale = await step('record a sale', () => call('POST', '/api/sales', { soldAt: Date.now() - 60_000, buyerId: buyer.id, lines: [{ crop: 'pink', kg: 3.2, priceKg: 18 }] }), [owner('sale', 'add')]);
  await step('edit it', () => call('PUT', `/api/sales/deliveries/${sale.id}`, { soldAt: sale.soldAt, buyerId: buyer.id, lines: [{ crop: 'pink', kg: 3, priceKg: 18 }] }), [owner('sale', 'edit')]);
  await step('paid', () => call('PUT', `/api/sales/deliveries/${sale.id}/paid`, { paidAt: Date.now() }), [owner('sale', 'paid')]);
  await step('unpaid', () => call('PUT', `/api/sales/deliveries/${sale.id}/paid`, { paidAt: null, reason: "The buyer's transfer bounced" }), [owner('sale', 'unpaid')]);
  await step('void', () => call('POST', `/api/sales/deliveries/${sale.id}/void`, { reason: 'Entered twice' }), [owner('sale', 'void')]);
  await step('restore', () => call('POST', `/api/sales/deliveries/${sale.id}/restore`, {}), [owner('sale', 'restore')]);

  // Costs and equipment
  const cost = await step('add a cost', () => call('POST', '/api/costs', { date: today(), category: 'packaging', amount: 45 }), [owner('cost', 'add')]);
  await step('edit it', () => call('PUT', `/api/costs/${cost.id}`, { amount: 50 }), [owner('cost', 'edit')]);
  await step('void', () => call('POST', `/api/costs/${cost.id}/void`, { reason: 'Entered twice' }), [owner('cost', 'void')]);
  await step('restore', () => call('POST', `/api/costs/${cost.id}/restore`, {}), [owner('cost', 'restore')]);
  const month = today().slice(0, 7);
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1)).toISOString().slice(0, 7);
  const rent = (await call('POST', '/api/costs', { date: `${prev}-01`, category: 'rent', amount: 1500, repeat: 'monthly' })).body;
  await step('change from a month', () => call('POST', `/api/costs/${rent.id}/change`, { from: month, amount: 1600 }), [owner('cost', 'change'), owner('cost', 'add')]);
  const started = db.listCosts().find((c) => c.repeat === 'monthly' && c.amount === 1600);
  await step('stop', () => call('POST', `/api/costs/${started.id}/stop`, { after: month }), [owner('cost', 'stop')]);
  const item = await step('add equipment', () => call('POST', '/api/equipment', { name: 'Steel rack', part: 'racks', boughtOn: today(), amount: 600, lifeMonths: 12 }), [owner('equipment', 'add')]);
  await step('edit it', () => call('PUT', `/api/equipment/${item.id}`, { note: 'Five tiers' }), [owner('equipment', 'edit')]);
  await step('void', () => call('POST', `/api/equipment/${item.id}/void`, { reason: 'Never delivered' }), [owner('equipment', 'void')]);
  await step('restore', () => call('POST', `/api/equipment/${item.id}/restore`, {}), [owner('equipment', 'restore')]);

  // Harvests: a worker records and does a check's Done (as themselves, whatever the body names); the owner edits and voids
  const pick = await step('a worker records a harvest', () => call('POST', `/api/rooms/${room}/harvests`, { crop: 'oyster', kg: 12.5, worker: 'Lim' }, 'worker'), [worker('harvest', 'add')]);
  assert.equal(pick.worker, 'Aminah', 'recorded as themselves');
  await step('the owner edits it', () => call('PUT', `/api/harvests/${pick.id}`, { kg: 12 }), [owner('harvest', 'edit')]);
  await step('void', () => call('POST', `/api/harvests/${pick.id}/void`, { reason: 'Weighed with the crate' }), [owner('harvest', 'void')]);
  await step('restore', () => call('POST', `/api/harvests/${pick.id}/restore`, {}), [owner('harvest', 'restore')]);
  const check = (await call('GET', `/api/rooms/${room}/tasks`, undefined, 'worker')).body.today.find((r) => r.ruleKey === 'harvestPm' || r.ruleKey === 'harvestAm');
  await step("a check's Done", () => call('POST', `/api/tasks/${check.id}/done`, { worker: 'Aminah', amount: 9.75 }, 'worker'), [worker('harvest', 'add')]);
  await step('its Undo', () => call('POST', `/api/tasks/${check.id}/undo`, undefined, 'worker'), [worker('harvest', 'undo')]);

  // Inventory
  const bleach = (await call('POST', '/api/inventory/items', { name: 'Bleach', kind: 'chemical', unit: 'L' })).body;
  const bought = await step('a purchase', () => call('POST', '/api/inventory/purchases', { itemId: bleach.id, qty: 10, total: 42 }), [owner('move', 'add')]);
  const used = await step('a worker\'s use', () => call('POST', '/api/inventory/uses', { itemId: bleach.id, qty: 1, worker: 'Aminah' }, 'worker'), [worker('move', 'add')]);
  await step('its Undo by them', () => call('DELETE', `/api/inventory/moves/${used.id}`, undefined, 'worker'), [worker('move', 'undo')]);
  await step('a worker\'s count', () => call('POST', '/api/inventory/counts', { worker: 'Aminah', counts: [{ itemId: bleach.id, qty: 9.5 }] }, 'worker'), [worker('move', 'add')]);
  await step('edit the purchase', () => call('PUT', `/api/inventory/moves/${bought.id}`, { total: 44 }), [owner('move', 'edit')]);
  await step('void it', () => call('POST', `/api/inventory/moves/${bought.id}/void`, { reason: 'Bought for the other farm' }), [owner('move', 'void')]);
  await step('restore it', () => call('POST', `/api/inventory/moves/${bought.id}/restore`, {}), [owner('move', 'restore')]);
  const near = await step('a purchase near its use-by', () => call('POST', '/api/inventory/purchases', { itemId: bleach.id, qty: 2, total: 9, useBy: today() }), [owner('move', 'add')]);
  await step('its throw-out', () => call('POST', `/api/inventory/lots/${near.id}/throw-out`, { worker: 'Lim' }), [owner('move', 'add')]);

  // Not sold: a worker records and undoes their own; the owner edits, voids and restores
  const ns = await step("a worker's Not sold", () => call('POST', '/api/not-sold', { crop: 'oyster', kg: 2, reason: 'spoiled', worker: 'Aminah' }, 'worker'), [worker('not-sold', 'add')]);
  await step('the owner edits it', () => call('PUT', `/api/not-sold/${ns.id}`, { kg: 1.5 }), [owner('not-sold', 'edit')]);
  await step('void', () => call('POST', `/api/not-sold/${ns.id}/void`, { reason: 'They sold after all' }), [owner('not-sold', 'void')]);
  await step('restore', () => call('POST', `/api/not-sold/${ns.id}/restore`, {}), [owner('not-sold', 'restore')]);
  const slip = await step('another', () => call('POST', '/api/not-sold', { crop: 'oyster', kg: 0.5, reason: 'staff', worker: 'Aminah' }, 'worker'), [worker('not-sold', 'add')]);
  await step('its Undo by them', () => call('DELETE', `/api/not-sold/${slip.id}`, undefined, 'worker'), [worker('not-sold', 'undo')]);

  // The tariff, and Settings' price (a rate from today)
  const rate = await step('add a rate', () => call('POST', '/api/tariffs', { from: '2026-10-01', rate: 0.515, afa: 0.0275 }), [owner('tariff', 'add')]);
  await step('edit it', () => call('PUT', `/api/tariffs/${rate.id}`, { afa: 0.03 }), [owner('tariff', 'edit')]);
  await step('void', () => call('POST', `/api/tariffs/${rate.id}/void`, { reason: 'AFA on the wrong month' }), [owner('tariff', 'void')]);
  await step('restore', () => call('POST', `/api/tariffs/${rate.id}/restore`, {}), [owner('tariff', 'restore')]);
  await step("Settings' price", () => call('PUT', '/api/settings', { electricityPrice: 0.6 }), [owner('tariff', 'add')]);

  // A closed month's new figures kept
  db.putMonthClose('2026-01', Date.now(), { income: 1, costs: 0, profit: 1, writeOff: 0, kWh: { measured: 0, estimated: 0 }, runs: {} });
  for (let i = 0; i < 100 && (await call('GET', '/api/costs/month?month=2026-01')).body.pending; i++) await new Promise((r) => setTimeout(r, 50));
  await step('keep a month', () => call('POST', '/api/costs/months/202601/keep', { reason: 'The January bill came' }), [owner('month', 'keep')]);

  // A room deleted
  const spare = db.createRoom({ name: 'Spare shed', length: 4, width: 3, height: 2.5, trhAddress: 9 }, Date.now()).id;
  await step('delete a room', () => call('DELETE', `/api/rooms/${spare}`), [owner('room', 'delete')]);

  // A void, a restore and an Undo keep the record in before (3.1), never in after
  for (const e of log().filter((x) => ['void', 'restore', 'undo'].includes(x.action))) {
    assert.ok(e.before !== null && e.after === null, `${e.kind} ${e.action}: before the record, no after`);
  }

  // The log's routes
  const one = await call('GET', `/api/changes?kind=sale&id=${sale.id}`);
  assert.deepEqual(one.body.entries.map((e) => e.action), ['add', 'edit', 'paid', 'unpaid', 'void', 'restore']);
  assert.equal(one.body.before, false);
  const period = await call('GET', '/api/changes?days=7&by=Aminah');
  assert.ok(period.body.entries.length >= 6 && period.body.entries.every((e) => e.by === 'Aminah'));
  assert.deepEqual(period.body.people, ['Aminah', 'Lim']);
  assert.equal(typeof period.body.entries[0].title, 'string');
  assert.equal((await call('GET', '/api/changes?kind=crate')).status, 400);
  assert.equal((await call('GET', '/api/changes?days=8')).status, 400);
  assert.equal((await call('GET', '/api/changes?id=1')).status, 400);
  const csv = await call('GET', '/api/changes.csv?days=7');
  assert.equal(csv.body.split('\r\n')[0].replace('﻿', ''), 'when,who,what,record,action,change,reason');
  assert.equal((await call('GET', '/api/changes', undefined, 'worker')).status, 403, 'the log holds money: the owner\'s');
});

test('a harvest id given back by a Done\'s Undo: the new harvest\'s History is its own', async (t) => {
  const { db, call, room } = await signedInFarm(t);
  const check = (await call('GET', `/api/rooms/${room}/tasks`, undefined, 'worker')).body.today.find((r) => r.ruleKey === 'harvestPm' || r.ruleKey === 'harvestAm');
  assert.equal((await call('POST', `/api/tasks/${check.id}/done`, { worker: 'Aminah', amount: 9.75 }, 'worker')).status, 200);
  const [first] = db.taskHarvests(check.id);
  assert.equal((await call('POST', `/api/tasks/${check.id}/undo`, undefined, 'worker')).status, 200);
  assert.equal((await call('POST', `/api/tasks/${check.id}/done`, { worker: 'Aminah', amount: 8.5 }, 'worker')).status, 200);
  const [again] = db.taskHarvests(check.id);
  assert.equal(again.id, first.id, 'the id was given back (harvests have no AUTOINCREMENT)');
  const one = (await call('GET', `/api/changes?kind=harvest&id=${again.id}`)).body;
  assert.deepEqual(one.entries.map((e) => e.action), ['add']);
  assert.equal(one.entries[0].after.kg, 8.5);
  assert.equal(one.before, false);
});

test('a period of more than 500 entries: the page says so; the CSV holds every one', async (t) => {
  const { db, call } = await signedInFarm(t);
  const at = Date.now() - 60_000;
  for (let i = 0; i < 520; i++) db.logChange({ at: at + i, by: 'Lim', role: 'owner', kind: 'cost', rowId: 9000 + i, action: 'add', after: { date: '2026-11-10', category: 'packaging', amount: 1 } });
  const page = (await call('GET', '/api/changes?days=7')).body;
  assert.equal(page.entries.length, 500);
  assert.equal(page.more, true);
  const csv = (await call('GET', '/api/changes.csv?days=7')).body;
  assert.ok(csv.trim().split('\r\n').length - 1 >= 520, 'every entry in the CSV');
});

test('a Done\'s Undo logs every harvest it deletes, a voided one too', async (t) => {
  const { db, call, room } = await signedInFarm(t);
  const check = (await call('GET', `/api/rooms/${room}/tasks`, undefined, 'worker')).body.today.find((r) => r.ruleKey === 'harvestPm' || r.ruleKey === 'harvestAm');
  assert.equal((await call('POST', `/api/tasks/${check.id}/done`, { worker: 'Aminah', amount: 9.75 }, 'worker')).status, 200);
  const [made] = db.taskHarvests(check.id);
  assert.equal((await call('POST', `/api/harvests/${made.id}/void`, { reason: 'Weighed with the crate' })).status, 200);
  assert.equal((await call('POST', `/api/tasks/${check.id}/undo`, undefined, 'worker')).status, 200);
  assert.deepEqual(db.changesOf('harvest', made.id).map((e) => e.action), ['add', 'void', 'undo']);
});
