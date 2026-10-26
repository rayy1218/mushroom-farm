// Phone-alarm settings over HTTP (write-only token, validation) and POST /api/settings/telegram/test with a fake sender.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { validateSettings, readTelegram, TELEGRAM_VIEW_DEFAULT } from '../server/settings.js';

const TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

async function setup(t, telegram = null) {
  const db = openDb(':memory:');
  const app = createApp(db, { telegram });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => app.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { db, call };
}

test('validation: each field, with its field name', () => {
  const bad = [
    ['telegramToken', 'nope'], ['telegramToken', 5], ['telegramChatId', 'abc'], ['telegramChatId', '12-3'], ['telegramChatId', '@'], ['telegramChatId', '1'.repeat(65)],
    ['telegramLevels', 'critical'], ['telegramLevels', ['loud']], ['telegramLevels', ['critical', 'critical']],
    ['telegramCleared', 'yes'], ['telegramRepeatMin', -1], ['telegramRepeatMin', 1441], ['telegramRepeatMin', 1.5], ['telegramRepeatMin', '5'],
  ];
  for (const [field, value] of bad) {
    const r = validateSettings({ [field]: value });
    assert.equal(r.field, field, `${field} ${JSON.stringify(value)}`);
    assert.ok(r.error);
    assert.ok(!JSON.stringify(r).includes('nope') || field !== 'telegramToken');
  }
  const good = { telegramToken: TOKEN, telegramChatId: '-1001234', telegramLevels: [], telegramCleared: false, telegramRepeatMin: 1440 };
  assert.deepEqual(validateSettings(good), { settings: good });
  for (const id of ['123', '-100123', '@farm_alerts', '']) assert.equal(validateSettings({ telegramChatId: id }).field, undefined);
  assert.deepEqual(validateSettings({ telegramToken: '' }), { settings: { telegramToken: '' } });
});

test('GET shows the defaults and never the token; PUT stores, keeps and clears', async (t) => {
  const { db, call } = await setup(t);
  assert.deepEqual((await call('GET', '/api/settings')).body, { pollSeconds: 5, outdoorAddress: null, electricityPrice: 0.55, waterPrice: null, ...TELEGRAM_VIEW_DEFAULT });
  const put = await call('PUT', '/api/settings', { telegramToken: TOKEN, telegramChatId: '-100', telegramLevels: ['critical'], telegramCleared: false, telegramRepeatMin: 10 });
  assert.equal(put.status, 200);
  assert.equal(put.body.telegramTokenSet, true);
  assert.equal(put.body.telegramTokenEnd, TOKEN.slice(-4));
  assert.equal(put.body.telegramChatId, '-100');
  assert.deepEqual(put.body.telegramLevels, ['critical']);
  assert.equal(put.body.telegramCleared, false);
  assert.equal(put.body.telegramRepeatMin, 10);
  assert.ok(!JSON.stringify(put.body).includes(TOKEN) && !('telegramToken' in put.body));
  assert.ok(!JSON.stringify((await call('GET', '/api/settings')).body).includes(TOKEN));
  assert.equal(readTelegram(db).telegramToken, TOKEN);
  // a PUT without the field keeps it
  await call('PUT', '/api/settings', { pollSeconds: 7 });
  assert.equal(readTelegram(db).telegramToken, TOKEN);
  // an empty string clears it
  const cleared = await call('PUT', '/api/settings', { telegramToken: '' });
  assert.equal(cleared.body.telegramTokenSet, false);
  assert.equal(cleared.body.telegramTokenEnd, null);
  assert.equal(readTelegram(db).telegramToken, '');
});

test('a bad value is 400 with the field and does not echo the token', async (t) => {
  const { call } = await setup(t);
  const r = await call('PUT', '/api/settings', { telegramToken: 'secret-not-a-token' });
  assert.equal(r.status, 400);
  assert.equal(r.body.field, 'telegramToken');
  assert.ok(!JSON.stringify(r.body).includes('secret-not-a-token'));
  const r2 = await call('PUT', '/api/settings', { telegramRepeatMin: 2000 });
  assert.equal(r2.body.field, 'telegramRepeatMin');
});

test('GET carries the sender status', async (t) => {
  const fake = { status: () => ({ lastSentAt: 123, lastError: 'Telegram said: x' }), test: async () => ({ ok: true }) };
  const { call } = await setup(t, fake);
  const { body } = await call('GET', '/api/settings');
  assert.equal(body.telegramLastSentAt, 123);
  assert.equal(body.telegramLastError, 'Telegram said: x');
});

test('POST /api/settings/telegram/test: ok, Telegram error, missing -> 400, typed values are used', async (t) => {
  const seen = [];
  let next = { ok: true };
  const fake = { status: () => ({}), test: async (o) => { seen.push(o); return next; } };
  const { call } = await setup(t, fake);
  assert.deepEqual(await call('POST', '/api/settings/telegram/test', {}), { status: 200, body: { ok: true } });
  next = { error: 'Telegram said: chat not found' };
  assert.deepEqual(await call('POST', '/api/settings/telegram/test'), { status: 502, body: { error: 'Telegram said: chat not found' } });
  next = { error: 'Enter the chat id first', field: 'telegramChatId' };
  assert.deepEqual(await call('POST', '/api/settings/telegram/test', {}), { status: 400, body: { error: 'Enter the chat id first', field: 'telegramChatId' } });
  next = { ok: true };
  await call('POST', '/api/settings/telegram/test', { telegramToken: '', telegramChatId: '@farm' });
  assert.deepEqual(seen.at(-1), { telegramChatId: '@farm' });
  const bad = await call('POST', '/api/settings/telegram/test', { telegramChatId: 'zzz' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.field, 'telegramChatId');
  assert.equal((await call('GET', '/api/settings/telegram/test')).status, 404);
});

test('the test route with the real sender and a fake transport: network error text has no token', async (t) => {
  const { createTelegram } = await import('../server/telegram.js');
  const db = openDb(':memory:');
  db.setSetting('telegramToken', TOKEN);
  db.setSetting('telegramChatId', '-100');
  const tg = createTelegram({ db, transport: async () => { throw new Error(`fetch failed for bot${TOKEN}`); }, log: () => {} });
  const app = createApp(db, { telegram: tg });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { tg.close(); await new Promise((resolve) => app.close(resolve)); db.close(); });
  const res = await fetch(`http://127.0.0.1:${app.address().port}/api/settings/telegram/test`, { method: 'POST' });
  const text = await res.text();
  assert.equal(res.status, 502);
  assert.match(text, /No answer from Telegram/);
  assert.ok(!text.includes(TOKEN));
});
