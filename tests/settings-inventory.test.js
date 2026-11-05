// The Inventory setting (spec 2026-11-05-inventory-design.md 5 and 7): low-stock and use-by messages to Telegram, on unless
// turned off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { validateSettings, writeSettings, settingsView, readInventoryTelegram } from '../server/settings.js';

test('on by default; saved off and on again; shown with the settings', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  assert.equal(readInventoryTelegram(db), true);
  assert.equal(settingsView(db).inventoryTelegram, true);
  const off = validateSettings({ inventoryTelegram: false });
  assert.deepEqual(off, { settings: { inventoryTelegram: false } });
  writeSettings(db, off.settings);
  assert.equal(readInventoryTelegram(db), false);
  assert.equal(settingsView(db).inventoryTelegram, false);
  writeSettings(db, { inventoryTelegram: true });
  assert.equal(readInventoryTelegram(db), true);
});

test('only true or false', () => {
  assert.deepEqual(validateSettings({ inventoryTelegram: 'yes' }), { error: 'Stock messages must be on or off', field: 'inventoryTelegram' });
});
