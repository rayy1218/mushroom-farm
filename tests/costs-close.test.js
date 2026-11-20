// Closed months (spec 2026-11-12-data-integrity-design.md 8.3): October closes after 14 Nov and keeps its figures; a rate
// added later asks first and marks it re-priced with what it was and what changed (G16); Keep the new figures; the asks of a
// back-dated cost and sale. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createCosts } from '../server/costs.js';
import { createSales } from '../server/sales.js';
import { createTariffs } from '../server/tariffs.js';
import { fixedZone } from '../server/usage.js';
import { AskError } from '../server/asks.js';
import { closeDayOf, isClosable } from '../server/closes.js';

const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8);
const zone = fixedZone(480);
const LIM = { name: 'Lim', role: 'owner' };
const kinds = (fn) => {
  try { fn(); } catch (e) { if (e instanceof AskError) return e.asks.map((a) => [a.kind, a.text]); throw e; }
  return [];
};

function farm(t) {
  const db = openDb(':memory:');
  let clock = at('2026-09-25', 6);
  const now = () => clock;
  const [first] = db.listTariffs();
  db.updateTariff(first.id, { from: first.from, rate: 0.515, afa: 0, note: '' });
  const costs = createCosts({ db, now, zone });
  const sales = createSales({ db, now });
  const tariffs = createTariffs({ db, now, beforeWrite: (days, body) => costs.closedAsk(days, body) });
  t.after(async () => { costs.stop(); await costs.warmed(); db.close(); });
  const room = db.createRoom({ name: 'Container 4', length: 12, width: 2.3, height: 2.5, intakeW: 1000 }, clock).id;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'oyster', blocks: 500 }] }, { change: 'start', at: clock });
  // the intake on 40 h a month (1,180 kWh over October is too much for a test: 40 kWh at RM 0.5150 = RM 20.60)
  for (let d = 1; d <= 10; d += 1) {
    const day = `2026-10-${String(d).padStart(2, '0')}`;
    db.logMachine(room, 'intake', { on: true }, 'auto', at(day, 8));
    db.logMachine(room, 'intake', { on: false }, 'auto', at(day, 12));
  }
  const view = async (month) => {
    costs.monthView({ month });
    await costs.warmed();
    return costs.monthView({ month });
  };
  return { db, costs, sales, tariffs, room, view, setClock: (ms) => { clock = ms; } };
}

test('the close day: the 14th of the next month; closable after it', () => {
  assert.equal(closeDayOf('2026-10'), '2026-11-14');
  assert.equal(closeDayOf('2026-12'), '2027-01-14');
  assert.equal(isClosable('2026-10', '2026-11-14'), false);
  assert.equal(isClosable('2026-10', '2026-11-15'), true);
});

test('G16: October closes; the October AFA added on 20 Nov asks, then re-prices it; Keep the new figures', async (t) => {
  const f = farm(t);
  f.setClock(at('2026-11-14', 18));
  assert.equal((await f.view('2026-11')).last12.find((x) => x.month === '2026-10').repriced, false);
  assert.equal(f.db.monthClose('2026-10'), null, 'not on the 14th');
  f.setClock(at('2026-11-15', 9));
  await f.view('2026-11');
  const kept = f.db.monthClose('2026-10');
  assert.deepEqual([kept.figures.costs, kept.figures.profit], [20.6, -20.6]);
  f.setClock(at('2026-11-20', 10));
  assert.deepEqual(kinds(() => f.tariffs.add({ from: '2026-10-01', rate: 0.515, afa: 0.0275 }, LIM)),
    [['closed-month', 'October 2026 is closed: this changes its figures, and the month will say re-priced.']]);
  f.tariffs.add({ from: '2026-10-01', rate: 0.515, afa: 0.0275, confirmed: ['closed-month'] }, LIM);
  const oct = await f.view('2026-10');
  assert.deepEqual(oct.repriced.was, { income: 0, costs: 20.6, profit: -20.6 });
  assert.deepEqual(oct.repriced.now, { income: 0, costs: 21.7, profit: -21.7 }, '40 kWh × RM 0.0275 = RM 1.10 more');
  assert.equal(oct.repriced.closedAt, at('2026-11-15', 9));
  assert.equal(oct.repriced.closedOn, '2026-11-14', 'the close day the page says (8.3: "Re-priced since 14 Nov")');
  assert.deepEqual(oct.repriced.changes.map((c) => [c.kind, c.action]), [['tariff', 'add']]);
  assert.equal((await f.view('2026-11')).last12.find((x) => x.month === '2026-10').repriced, true);
  assert.deepEqual(oct.runs[0].repriced, ['2026-10']);
  const after = f.costs.keepMonth('2026-10', { reason: 'The October bill came' }, LIM);
  assert.equal(after.repriced, null);
  assert.deepEqual(f.db.changesOf('month', 202610).map((c) => [c.action, c.before.profit, c.after.profit, c.reason]), [['keep', -20.6, -21.7, 'The October bill came']]);
});

test('a write dated in a closed month asks: a cost, a sale; another month does not', async (t) => {
  const f = farm(t);
  f.setClock(at('2026-11-16', 9));
  await f.view('2026-11');
  assert.deepEqual(kinds(() => f.costs.add({ date: '2026-10-20', category: 'packaging', amount: 45 }, LIM)).map((a) => a[0]), ['closed-month']);
  assert.deepEqual(kinds(() => f.costs.add({ date: '2026-11-02', category: 'packaging', amount: 45 }, LIM)), []);
  const buyer = f.sales.addBuyer({ name: 'Restoran Wong' });
  assert.deepEqual(kinds(() => f.sales.record({ soldAt: at('2026-10-20'), buyerId: buyer.id, lines: [{ crop: 'pink', kg: 3, priceKg: 18 }] }, LIM)).map((a) => a[0]),
    ['closed-month']);
});

// UI check (2026-11-13): a TNB bill dated in November whose period is October moves October's electricity: it asks first, and
// once added it is among What changed.
test('a bill dated after a closed month whose period is in it asks, and is among what changed', async (t) => {
  const f = farm(t);
  f.setClock(at('2026-11-16', 9));
  await f.view('2026-11');
  const bill = { date: '2026-11-03', category: 'utilities', utility: 'electricity', amount: 15, periodFrom: '2026-10-01', periodTo: '2026-10-31' };
  assert.deepEqual(kinds(() => f.costs.add(bill, LIM)).map((a) => a[0]), ['closed-month']);
  f.setClock(at('2026-11-16', 10));
  f.costs.add({ ...bill, confirmed: ['closed-month'] }, LIM);
  const oct = await f.view('2026-10');
  assert.ok(oct.repriced, 'the bill below the counted lowers October');
  assert.deepEqual(oct.repriced.changes.map((c) => [c.kind, c.action]), [['cost', 'add']]);
});

test('the daily tick closes a month nobody opened on Costs; the time to the next 06:00 at the farm', async (t) => {
  const f = farm(t);
  f.setClock(at('2026-11-15', 6));
  await f.costs.closeDue();
  assert.equal(f.db.monthClose('2026-10'), null, 'the usage was still being worked out: not kept');
  await f.costs.warmed();
  await f.costs.closeDue();
  assert.deepEqual([f.db.monthClose('2026-10').figures.costs, f.db.monthClose('2026-10').closedAt], [20.6, at('2026-11-15', 6)]);
  const { msToNextHour } = await import('../server/costs-api.js');
  assert.equal(msToNextHour(6, at('2026-11-15', 5), zone), 3_600_000);
  assert.equal(msToNextHour(6, at('2026-11-15', 6), zone), 24 * 3_600_000, 'at 06:00 itself: the next day');
  assert.equal(msToNextHour(6, at('2026-11-15', 23), zone), 7 * 3_600_000);
});

test('a monthly item stopped before a closed month: What changed names the stop', async (t) => {
  const f = farm(t);
  const rent = f.costs.add({ date: '2026-09-01', category: 'rent', amount: 1500, repeat: 'monthly' }, LIM);
  f.setClock(at('2026-11-15', 9));
  await f.view('2026-11');
  f.setClock(at('2026-11-20', 10));
  f.costs.stopItem(rent.id, { after: '2026-09', confirmed: ['closed-month'] }, LIM);
  const oct = await f.view('2026-10');
  assert.deepEqual(oct.repriced.changes.map((c) => [c.kind, c.action]), [['cost', 'stop']]);
  const [stop] = oct.repriced.changes;
  assert.deepEqual([stop.before.category, stop.before.repeatUntil, stop.after.repeatUntil], ['rent', null, '2026-09'], 'the item kept whole, its last month');
});
