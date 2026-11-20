// Sales and Data integrity (spec 2026-11-12-data-integrity-design.md 3 to 5): every write logged with who; the paid lock and
// Mark unpaid's reason; void and restore, a voided delivery out of every figure; the asks: a duplicate, an unlikely price or
// kg, more sold than picked, a sale before any pick. Made-up figures (the golden cases G1 to G4 and G7 to G9).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createSales } from '../server/sales.js';
import { SalesError } from '../server/sales-math.js';
import { AskError } from '../server/asks.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 2); // 10 Nov 2026 10:00 at the farm
const LIM = { name: 'Lim', role: 'owner' };
const farm = (date, hh = 10, mm = 0) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)), hh - 8, mm);
const refused = (fn, status, field) => assert.throws(fn, (e) => e instanceof SalesError && e.status === status && e.field === field);
const asked = (fn, kinds) => assert.throws(fn, (e) => e instanceof AskError && assert.deepEqual(e.asks.map((a) => a.kind), kinds) === undefined);
const plain = (s) => s.replace(/\u00a0/g, ' ');

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = NOW;
  const sales = createSales({ db, now: () => clock });
  const room = db.createRoom({ name: 'Container 4', length: 12, width: 2.3, height: 2.5 }, 1000).id;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'pink', blocks: 400 }, { crop: 'abalone', blocks: 300 }, { crop: 'oyster', blocks: 500 }, { crop: 'golden', blocks: 200 }] },
    { change: 'start', at: farm('2026-10-20') });
  const run = db.openRun(room).id;
  const pick = (crop, kg, at) => db.insertHarvest({ roomId: room, runId: run, crop, stage: 'fruiting', flush: 1, blocks: 400, kg, pickedAt: at, worker: null, taskId: null, at });
  const kedai = sales.addBuyer({ name: 'Kedai Ah Seng' });
  const wong = sales.addBuyer({ name: 'Restoran Wong' });
  return { db, sales, room, pick, kedai, wong, setClock: (ms) => { clock = ms; } };
}

test('G1, G2: a paid sale is locked; Mark unpaid needs a reason; then the edit; the history says each step', (t) => {
  const { db, sales, pick, wong } = setup(t);
  pick('pink', 30, farm('2026-11-02'));
  const d = sales.record({ soldAt: farm('2026-11-03'), buyerId: wong.id, lines: [{ crop: 'pink', kg: 3.2, priceKg: 18 }] }, LIM);
  assert.equal(d.total, 57.6);
  sales.setPaid(d.id, { paidAt: farm('2026-11-06') }, LIM);
  const edit = { soldAt: farm('2026-11-03'), buyerId: wong.id, lines: [{ crop: 'pink', kg: 3.2, priceKg: 0.1 }] };
  assert.throws(() => sales.edit(d.id, edit, LIM), (e) => e.status === 409 && e.field === 'paidAt' && e.message === 'This sale is paid. Mark it unpaid first, with a reason.');
  assert.equal(sales.view({ days: 30 }).deliveries[0].total, 57.6, 'nothing changed');
  refused(() => sales.setPaid(d.id, { paidAt: null }, LIM), 400, 'reason');
  sales.setPaid(d.id, { paidAt: null, reason: "The buyer's transfer bounced" }, LIM);
  assert.equal(sales.edit(d.id, edit, LIM).total, 0.32);
  const log = db.changesOf('sale', d.id);
  assert.deepEqual(log.map((c) => [c.action, c.by, c.reason]), [['add', 'Lim', null], ['paid', 'Lim', null],
    ['unpaid', 'Lim', "The buyer's transfer bounced"], ['edit', 'Lim', null]]);
  assert.deepEqual(log[2].before, { paidAt: farm('2026-11-06') });
  assert.deepEqual([log[3].before.lines[0].priceKg, log[3].before.lines[0].total, log[3].after.lines[0].priceKg, log[3].after.lines[0].total], [18, 57.6, 0.1, 0.32]);
  assert.equal(log[3].after.buyer, 'Restoran Wong');
  assert.equal(sales.view({ days: 30 }).deliveries[0].edits, 2, 'unpaid, edit (a Mark paid is no change)');
});

test('G3: a sale is voided, not deleted: paid ones locked, a reason, struck in the list, out of every figure; restored', (t) => {
  const { db, sales, pick, kedai } = setup(t);
  pick('oyster', 50, farm('2026-11-08'));
  const keep = sales.record({ soldAt: farm('2026-11-09', 9), buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5 }] }, LIM);
  const d = sales.record({ soldAt: farm('2026-11-09', 15), buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5 }], confirmed: ['duplicate'] }, LIM);
  sales.setPaid(d.id, { paidAt: farm('2026-11-09', 16) }, LIM);
  refused(() => sales.remove(d.id), 409, undefined);
  refused(() => sales.voidSale(d.id, { reason: 'Entered twice' }, LIM), 409, 'paidAt');
  sales.setPaid(d.id, { paidAt: null, reason: 'Entered twice' }, LIM);
  refused(() => sales.voidSale(d.id, {}, LIM), 400, 'reason');
  const v = sales.voidSale(d.id, { reason: 'Entered twice' }, LIM);
  assert.deepEqual(v.voided, { at: NOW, by: 'Lim', reason: 'Entered twice' });
  const view = sales.view({ days: 30 });
  assert.deepEqual(view.deliveries.map((x) => [x.id, x.voided?.reason ?? null]), [[d.id, 'Entered twice'], [keep.id, null]], 'listed, struck');
  assert.deepEqual([view.totals.kg, view.totals.total, view.totals.count, view.owed.total], [4, 54, 1, 54], 'out of the totals and owed');
  assert.equal(view.byBuyer[0].total, 54);
  assert.equal(sales.summary({}).total, 54);
  assert.equal(sales.range({ from: '2026-11-01', to: '2026-11-10' }).lines.length, 1, 'out of the 4-6 sheet');
  assert.equal(sales.csv(30).text.trim().split('\r\n').length, 2, 'out of the CSV');
  refused(() => sales.edit(d.id, { soldAt: farm('2026-11-09'), buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 1, priceKg: 1 }] }, LIM), 409, undefined);
  refused(() => sales.setPaid(d.id, { paidAt: NOW }, LIM), 409, undefined);
  asked(() => sales.restoreSale(d.id, {}, LIM) && sales.record({ soldAt: farm('2026-11-09', 15), buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5 }] }, LIM), ['duplicate']);
  assert.equal(sales.view({ days: 30 }).totals.total, 108, 'restored: counted again');
  assert.deepEqual(db.changesOf('sale', d.id).map((c) => c.action), ['add', 'paid', 'unpaid', 'void', 'restore']);
});

test('G4: the same buyer, crop and kg within 10 minutes asks once; a back-dated one recorded minutes apart too; other kg not', (t) => {
  const { sales, pick, kedai, wong, setClock } = setup(t);
  pick('oyster', 80, farm('2026-11-09'));
  const at = farm('2026-11-10', 9, 41);
  setClock(farm('2026-11-10', 9, 42));
  sales.record({ soldAt: at, buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5 }] }, LIM);
  setClock(farm('2026-11-10', 9, 43));
  try {
    sales.record({ soldAt: at, buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5 }] }, LIM);
    assert.fail('no ask');
  } catch (e) {
    assert.ok(e instanceof AskError, e.message);
    assert.deepEqual(e.asks.map((a) => [a.kind, a.field]), [['duplicate', 'lines.0.kg']]);
    assert.equal(plain(e.asks[0].text), 'Kedai Ah Seng already has 4.00 kg of Grey oyster at 09:41 (RM 54.00), recorded 1 minute ago. Is this another sale?');
  }
  assert.equal(sales.record({ soldAt: at, buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5 }], confirmed: ['duplicate'] }, LIM).total, 54);
  sales.record({ soldAt: at, buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4.1, priceKg: 13.5 }] }, LIM);
  sales.record({ soldAt: at, buyerId: wong.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5 }] }, LIM);
  // a back-dated sale is 12:00: the same day, recorded within 10 minutes of the other
  sales.record({ soldAt: farm('2026-11-09', 12), buyerId: wong.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 13 }] }, LIM);
  setClock(farm('2026-11-10', 9, 50));
  asked(() => sales.record({ soldAt: farm('2026-11-09', 12), buyerId: wong.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 13 }] }, LIM), ['duplicate']);
  setClock(farm('2026-11-10', 10, 5)); // both 12:00: still sold within 10 minutes of each other
  asked(() => sales.record({ soldAt: farm('2026-11-09', 12), buyerId: wong.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 13 }] }, LIM), ['duplicate']);
  // a sale of the same day at another time, recorded long after: not asked
  sales.record({ soldAt: farm('2026-11-09', 16), buyerId: wong.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 13 }] }, LIM);
});

test('an edit is not asked about itself', (t) => {
  const { sales, pick, kedai } = setup(t);
  pick('oyster', 80, farm('2026-11-09'));
  const d = sales.record({ soldAt: farm('2026-11-10', 9), buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5 }] }, LIM);
  assert.equal(sales.edit(d.id, { soldAt: farm('2026-11-10', 9), buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 14 }] }, LIM).total, 56);
});

test('G7: sold and not sold above picked by more than 5 % asks; 222.60 kg of 212.00 kg does not, 222.61 kg does', (t) => {
  const { db, sales, pick, kedai } = setup(t);
  pick('abalone', 112, farm('2026-11-01'));
  pick('abalone', 100, farm('2026-11-04'));
  sales.record({ soldAt: farm('2026-11-02'), buyerId: kedai.id, lines: [{ crop: 'abalone', kg: 18, priceKg: 16 }] }, LIM);
  try {
    sales.record({ soldAt: farm('2026-11-10'), buyerId: kedai.id, lines: [{ crop: 'abalone', kg: 2400, priceKg: 16 }] }, LIM);
    assert.fail('no ask');
  } catch (e) {
    assert.deepEqual(e.asks.map((a) => a.kind), ['kg', 'oversell']);
    assert.equal(plain(e.asks[1].text), 'That makes 2,418.00 kg of Abalone oyster sold or not sold, but 212.00 kg was picked. Is 2,400.00 kg right?');
  }
  sales.record({ soldAt: farm('2026-11-10'), buyerId: kedai.id, lines: [{ crop: 'abalone', kg: 204.6, priceKg: 16 }] }, LIM);
  db.insertNotSold({ at: farm('2026-11-10'), crop: 'abalone', kg: 0.01, reason: 'sample', roomId: null, runId: null, buyerId: null, note: null, worker: 'Lim' }, NOW);
  asked(() => sales.record({ soldAt: farm('2026-11-10', 9), buyerId: kedai.id, lines: [{ crop: 'abalone', kg: 0.01, priceKg: 16 }] }, LIM), ['oversell']);
});

test('G8: a crop sold before any pick of it asks; such a sale is left out of the balance; a farm with no harvests is not asked', (t) => {
  const { sales, pick, kedai } = setup(t);
  sales.record({ soldAt: farm('2026-11-02'), buyerId: kedai.id, lines: [{ crop: 'golden', kg: 6, priceKg: 20 }] }, LIM); // no harvests at all
  pick('golden', 10, farm('2026-11-03'));
  try {
    sales.record({ soldAt: farm('2026-11-02', 15), buyerId: kedai.id, lines: [{ crop: 'golden', kg: 2, priceKg: 20 }] }, LIM);
    assert.fail('no ask');
  } catch (e) {
    assert.deepEqual(e.asks.map((a) => [a.kind, a.field]), [['before-picked', 'lines.0.crop']]);
    assert.equal(e.asks[0].text, 'No Golden oyster pick is recorded on or before 2 Nov. Is the crop or the date right?');
  }
  // the 6 kg of 2 Nov is before the first pick: 10 kg sold of 10 kg picked asks nothing
  sales.record({ soldAt: farm('2026-11-04'), buyerId: kedai.id, lines: [{ crop: 'golden', kg: 10, priceKg: 20 }] }, LIM);
});

test('G9: the server asks about a price over 3 times the expected and a line over 500 kg, whatever sends it', (t) => {
  const { db, sales, pick, kedai } = setup(t);
  db.setSetting('cropYield', JSON.stringify({ pink: { dryKg: null, priceKg: 12 } }));
  pick('pink', 900, farm('2026-11-09'));
  try {
    sales.record({ soldAt: farm('2026-11-10'), buyerId: kedai.id, lines: [{ crop: 'pink', kg: 650, priceKg: 41 }] }, LIM);
    assert.fail('no ask');
  } catch (e) {
    assert.deepEqual(e.asks.map((a) => [a.kind, a.field]), [['price', 'lines.0.priceKg'], ['kg', 'lines.0.kg']]);
    assert.deepEqual(e.asks.map((a) => plain(a.text)), ["That's 3.4 times the expected RM 12.00 per kg. Is RM 41.00 right?", 'Is 650.00 kg right?']);
  }
  assert.equal(sales.record({ soldAt: farm('2026-11-10'), buyerId: kedai.id, lines: [{ crop: 'pink', kg: 650, priceKg: 41 }], confirmed: ['price', 'kg'] }, LIM).total, 26650);
});

test('an edit keeps the delivery\'s recorded time: a later duplicate ask says when it was first recorded', (t) => {
  const { sales, pick, kedai, setClock } = setup(t);
  pick('oyster', 80, farm('2026-11-09'));
  const at = farm('2026-11-10', 9, 41);
  setClock(farm('2026-11-10', 9, 42));
  const d = sales.record({ soldAt: at, buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4.2, priceKg: 13.5 }] }, LIM);
  setClock(farm('2026-11-10', 9, 46));
  sales.edit(d.id, { soldAt: at, buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5 }] }, LIM);
  setClock(farm('2026-11-10', 9, 47));
  try {
    sales.record({ soldAt: at, buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5 }] }, LIM);
    assert.fail('asks');
  } catch (e) {
    assert.ok(e instanceof AskError);
    assert.match(plain(e.asks[0].text), /recorded 5 minutes ago/);
  }
});
