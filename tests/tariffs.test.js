// The dated electricity tariff (server/tariffs.js, spec 2026-11-12-data-integrity-design.md 8.1): each rate holds to the next,
// a day's price is rate + AFA (G14); add, edit, void, restore, logged; the first rate stays; Settings' price a rate from
// today; the routes. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createTariffs, liveRates, priceOn, tariffOf, TariffError } from '../server/tariffs.js';
import { readSettings, writeSettings } from '../server/settings.js';
import { signedInFarm } from './integrity-fixture.js';

const NOW = Date.UTC(2026, 10, 10, 4);
const LIM = { name: 'Lim', role: 'owner' };
const refused = (fn, status, field) => assert.throws(fn, (e) => e instanceof TariffError && e.status === status && e.field === field);

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const [first] = db.listTariffs();
  db.updateTariff(first.id, { from: first.from, rate: 0.515, afa: 0, note: '' });
  return { db, first, tariffs: createTariffs({ db, now: () => NOW }) };
}

test('G14: 0.5150 from 2020, AFA +0.0275 from 1 Oct 2026: 30 Sep priced at 0.5150, 1 Oct at 0.5425', (t) => {
  const { db, tariffs } = setup(t);
  tariffs.add({ from: '2026-10-01', rate: 0.515, afa: 0.0275, note: 'TNB bill Oct 2026, AFA +2.75 sen' }, LIM);
  const rates = tariffOf(db);
  assert.deepEqual(rates.map((r) => [r.from, r.to, r.price]), [['2020-01-01', '2026-09-30', 0.515], ['2026-10-01', null, 0.5425]]);
  assert.equal(priceOn(rates, '2026-09-30'), 0.515);
  assert.equal(priceOn(rates, '2026-10-01'), 0.5425);
  assert.equal(priceOn(rates, '2019-12-31'), 0.515, 'before the first: the first');
  assert.equal(tariffs.list().price, 0.5425, "today's");
});

test('the checks; the first rate holds from 2020 and is not voided; a day taken is 409', (t) => {
  const { tariffs, first } = setup(t);
  refused(() => tariffs.add({ from: '2026-02-30', rate: 0.5 }, LIM), 400, 'from');
  refused(() => tariffs.add({ from: '2027-03-01', rate: 0.5 }, LIM), 400, 'from');
  refused(() => tariffs.add({ from: '2026-10-01', rate: 11 }, LIM), 400, 'rate');
  refused(() => tariffs.add({ from: '2026-10-01', rate: 0.5, afa: 2 }, LIM), 400, 'afa');
  refused(() => tariffs.edit(first.id, { from: '2021-01-01' }, LIM), 400, 'from');
  refused(() => tariffs.voidRate(first.id, { reason: 'Wrong rate' }, LIM), 409, undefined);
  tariffs.add({ from: '2026-10-01', rate: 0.515, afa: 0.0275 }, LIM);
  refused(() => tariffs.add({ from: '2026-10-01', rate: 0.6 }, LIM), 409, 'from');
  assert.equal(tariffs.add({ from: '2026-12-01', rate: 0.515, afa: -0.01 }, LIM).price, 0.505, 'next month, once TNB says it');
});

test('edit, void and restore are logged; a voided rate\'s days take the rate before', (t) => {
  const { db, tariffs } = setup(t);
  const oct = tariffs.add({ from: '2026-10-01', rate: 0.515, afa: 0.0275 }, LIM);
  tariffs.edit(oct.id, { afa: 0.03 }, LIM);
  tariffs.voidRate(oct.id, { reason: 'AFA entered on the wrong month' }, LIM);
  assert.equal(priceOn(tariffOf(db), '2026-10-15'), 0.515);
  assert.equal(tariffs.list().tariffs.find((r) => r.id === oct.id).voided.reason, 'AFA entered on the wrong month');
  tariffs.restoreRate(oct.id, {}, LIM);
  assert.equal(priceOn(tariffOf(db), '2026-10-15'), 0.545);
  assert.deepEqual(db.changesOf('tariff', oct.id).map((c) => c.action), ['add', 'edit', 'void', 'restore']);
  refused(() => tariffs.remove(oct.id), 409, undefined);
});

test("Settings' price is a rate from today: the days before keep theirs; readSettings gives today's", (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  writeSettings(db, { electricityPrice: 0.6 }, { who: LIM });
  const rates = liveRates(db.listTariffs());
  assert.deepEqual(rates.map((r) => [r.from, r.price]), [['2020-01-01', 0.55], [today, 0.6]]);
  assert.equal(readSettings(db).electricityPrice, 0.6);
  writeSettings(db, { electricityPrice: 0.62 }, { who: LIM });
  assert.equal(liveRates(db.listTariffs()).length, 2, "today's rate edited, not another");
  assert.equal(readSettings(db).electricityPrice, 0.62);
});

test('the routes: the owner\'s; DELETE refused; an event for Costs and Harvest', async (t) => {
  const { call, seen } = await signedInFarm(t);
  const made = await call('POST', '/api/tariffs', { from: '2026-10-01', rate: 0.515, afa: 0.0275 });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal((await call('GET', '/api/tariffs')).body.tariffs.length, 2);
  assert.equal((await call('DELETE', `/api/tariffs/${made.body.id}`)).status, 409);
  assert.equal((await call('PUT', `/api/tariffs/${made.body.id}`, { afa: 0.03 })).body.price, 0.545);
  assert.equal((await call('GET', '/api/tariffs', undefined, 'worker')).status, 403);
  assert.ok(seen.some(([type]) => type === 'costs') && seen.some(([type, d]) => type === 'harvest' && d.roomId === null));
});

test("Settings' price on a day with a rate keeps its AFA (the day's price is what was typed); the same price writes nothing", (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  db.insertTariff({ from: today, rate: 0.515, afa: 0.0275, note: 'TNB bill' }, Date.now());
  writeSettings(db, { electricityPrice: 0.6 }, { who: LIM });
  const r = liveRates(db.listTariffs()).find((x) => x.from === today);
  assert.deepEqual([r.rate, r.afa, r.price, r.note], [0.5725, 0.0275, 0.6, 'TNB bill']);
  const n = db.changesBetween(0, Date.now() + 60_000, { limit: 1000 }).length;
  writeSettings(db, { electricityPrice: 0.6 }, { who: LIM });
  assert.equal(db.changesBetween(0, Date.now() + 60_000, { limit: 1000 }).length, n, 'the same price: no entry');
});

test("Settings' price saved over the API tells Costs and keeps the day's AFA", async (t) => {
  const { db, call, seen } = await signedInFarm(t);
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  db.insertTariff({ from: today, rate: 0.515, afa: 0.0275, note: 'TNB bill' }, Date.now());
  seen.length = 0;
  assert.equal((await call('PUT', '/api/settings', { electricityPrice: 0.6 })).status, 200);
  assert.ok(seen.some(([type]) => type === 'costs'), JSON.stringify(seen));
  const r = liveRates(db.listTariffs()).find((x) => x.from === today);
  assert.deepEqual([r.rate, r.afa, r.price], [0.5725, 0.0275, 0.6], 'the AFA kept, not reset to 0');
});
