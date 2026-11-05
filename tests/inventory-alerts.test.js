// Low-stock and use-by messages (spec 2026-11-05-inventory-design.md 6): sent once, again only after the item was back over
// its level or the use-by changed; nothing when off or without Telegram; a failure tried at the next check, the token never
// in the log.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createInventory } from '../server/inventory.js';
import { createInventoryAlerts, lowText, useByText } from '../server/inventory-alerts.js';

const NOW = Date.parse('2026-11-05T09:00:00+08:00');
const TOKEN = '123456:ABCDEFGHIJKLMNOP';
const plain = (s) => s.replace(/\u00a0/g, ' ');

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let now = NOW;
  const state = { on: true, token: TOKEN, fail: false };
  const sent = [];
  const logs = [];
  const transport = async ({ token, chatId, text }) => {
    if (state.fail) return { ok: false, description: `Unauthorized for ${token}` };
    sent.push({ chatId, text: plain(text) });
    return { ok: true };
  };
  const alerts = createInventoryAlerts({
    db, now: () => now, transport, telegram: () => ({ telegramToken: state.token, telegramChatId: '42' }), enabled: () => state.on,
    log: (x) => logs.push(String(x)), setTimer: () => 1, clearTimer: () => {},
  });
  const inv = createInventory({ db, now: () => now });
  return { db, inv, alerts, sent, logs, state, setNow: (ms) => { now = ms; } };
}

test('the texts', () => {
  assert.equal(plain(lowText({ name: 'Bleach', qty: 1.5, unit: 'L', reorderAt: 2 })), '📦 Low stock · Bleach · 1.50 L left (reorder at 2.00 L)');
  const lot = { useBy: '2026-11-12', left: 3, at: Date.parse('2026-11-01T12:00:00+08:00'), state: 'soon' };
  assert.equal(plain(useByText({ name: 'Grey oyster spawn', unit: 'kg' }, lot)), '📦 Use by 12 Nov · Grey oyster spawn · 3.00 kg left from the purchase of 1 Nov');
  assert.equal(plain(useByText({ name: 'Spawn', unit: 'kg' }, { ...lot, state: 'expired' })), '📦 Expired 12 Nov · Spawn · 3.00 kg left from the purchase of 1 Nov');
});

test('Low: sent once; back over the level clears it; falling again sends again', async (t) => {
  const { db, inv, alerts, sent } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  inv.purchase({ itemId: bleach.id, qty: 1.5, total: 10 });
  await alerts.check();
  await alerts.check();
  assert.deepEqual(sent, [{ chatId: '42', text: '📦 Low stock · Bleach · 1.50 L left (reorder at 2.00 L)' }]);
  assert.equal(db.stockItem(bleach.id).lowSentAt, NOW);
  inv.purchase({ itemId: bleach.id, qty: 5, total: 25 });
  await alerts.check();
  assert.equal(db.stockItem(bleach.id).lowSentAt, null);
  inv.use({ itemId: bleach.id, qty: 5, worker: 'Ali' });
  await alerts.check();
  assert.equal(sent.length, 2);
});

test('use-by: once per lot, soon or already expired; a changed use-by is told again', async (t) => {
  const { inv, alerts, sent } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const soon = inv.purchase({ itemId: spawn.id, qty: 3, total: 30, useBy: '2026-11-12', day: '2026-11-01' });
  inv.purchase({ itemId: spawn.id, qty: 1, total: 10, useBy: '2026-11-04', day: '2026-11-01' });
  inv.purchase({ itemId: spawn.id, qty: 1, total: 10, useBy: '2026-12-30' });
  await alerts.check();
  await alerts.check();
  assert.deepEqual(sent.map((s) => s.text), [
    '📦 Use by 12 Nov · Spawn · 3.00 kg left from the purchase of 1 Nov',
    '📦 Expired 4 Nov · Spawn · 1.00 kg left from the purchase of 1 Nov',
  ]);
  inv.editMove(soon.id, { useBy: '2026-11-11' });
  await alerts.check();
  assert.equal(sent.length, 3);
});

test('off, or no token: nothing sent and nothing marked, so turning it on sends what is due', async (t) => {
  const { db, inv, alerts, sent, state } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  state.on = false;
  await alerts.check();
  state.on = true;
  state.token = '';
  await alerts.check();
  assert.deepEqual(sent, []);
  assert.equal(db.stockItem(bleach.id).lowSentAt, null);
  state.token = TOKEN;
  await alerts.check();
  assert.equal(sent.length, 1);
});

test('a failure is logged without the token and tried again at the next check', async (t) => {
  const { db, inv, alerts, sent, logs, state } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  state.fail = true;
  await alerts.check();
  assert.equal(sent.length, 0);
  assert.equal(db.stockItem(bleach.id).lowSentAt, null);
  assert.ok(logs.length > 0);
  assert.ok(logs.every((l) => !l.includes(TOKEN)), logs.join('\n'));
  state.fail = false;
  await alerts.check();
  assert.equal(sent.length, 1);
});

test('an archived item is never told; two checks at once send once', async (t) => {
  const { inv, alerts, sent } = setup(t);
  const old = inv.addItem({ name: 'Old', kind: 'other', unit: 'pcs', reorderAt: 5 });
  inv.editItem(old.id, { archived: true });
  inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  await Promise.all([alerts.check(), alerts.check()]);
  assert.deepEqual(sent.map((s) => s.text), ['📦 Low stock · Bleach · 0.00 L left (reorder at 2.00 L)']);
});

test('start checks at once and then on its timer; stop ends both', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const timers = [];
  let cleared = 0;
  const alerts = createInventoryAlerts({
    db, transport: async () => ({ ok: true }), telegram: () => ({ telegramToken: '', telegramChatId: '' }), enabled: () => true,
    setTimer: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, clearTimer: () => { cleared += 1; },
  });
  alerts.start();
  assert.equal(timers.length, 1);
  assert.equal(timers[0][1], 3_600_000);
  alerts.stop();
  assert.equal(cleared, 1);
  await alerts.check(); // after stop: nothing, no throw
});

test('a check asked for in the gap after the last loop test still sees a later write', async (t) => {
  const { inv, alerts, sent } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  inv.purchase({ itemId: bleach.id, qty: 5, total: 25 });
  const first = alerts.check();
  await Promise.resolve();
  inv.use({ itemId: bleach.id, qty: 4, worker: 'Ali' });
  await alerts.check();
  await first;
  assert.deepEqual(sent.map((s) => s.text), ['📦 Low stock · Bleach · 1.00 L left (reorder at 2.00 L)']);
});

test('a check asked for at every microtask step after a quiet one never loses the write', async (t) => {
  for (let gap = 0; gap < 12; gap += 1) {
    const { inv, alerts, sent } = setup(t);
    const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
    inv.purchase({ itemId: bleach.id, qty: 5, total: 25 });
    const first = alerts.check();
    for (let i = 0; i < gap; i += 1) await Promise.resolve();
    inv.use({ itemId: bleach.id, qty: 4, worker: 'Ali' });
    await alerts.check();
    assert.equal(sent.length, 1, `gap ${gap}`);
    await first;
  }
});

test('stop ends the sends in the middle of a pass', async (t) => {
  const { inv, alerts, sent } = setup(t);
  inv.addItem({ name: 'A', kind: 'other', unit: 'pcs', reorderAt: 5 });
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  inv.purchase({ itemId: spawn.id, qty: 1, total: 1, useBy: '2026-11-06', day: '2026-11-01' });
  inv.purchase({ itemId: spawn.id, qty: 1, total: 1, useBy: '2026-11-07', day: '2026-11-01' });
  const p = alerts.check();
  alerts.stop();
  await p;
  assert.ok(sent.length <= 1, `sent ${sent.length}`);
});
