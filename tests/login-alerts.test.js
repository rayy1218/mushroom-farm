// The owner's Telegram note of sign-in locks (server/auth.js notify): to the alarms' chat with telegram.js's transport;
// nothing without Telegram set up; a failure logged without the token, never thrown.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createLoginNotify } from '../server/login-alerts.js';

const TOKEN = '123456:ABCDEFGHIJKLMNOP';

function setup(t, { token = TOKEN, chatId = '42', fail = null } = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const sent = [];
  const logs = [];
  const transport = async (m) => {
    if (fail === 'throw') throw new Error(`fetch failed for bot${m.token}`);
    if (fail) return { ok: false, description: `Unauthorized for ${m.token}` };
    sent.push(m);
    return { ok: true };
  };
  const notify = createLoginNotify({ db, transport, telegram: () => ({ telegramToken: token, telegramChatId: chatId }), log: (x) => logs.push(String(x)) });
  return { notify, sent, logs };
}

test('a note goes to the alarms chat', async (t) => {
  const { notify, sent } = setup(t);
  assert.equal(await notify('🔒 Sign-in: hello'), true);
  assert.deepEqual(sent, [{ token: TOKEN, chatId: '42', text: '🔒 Sign-in: hello' }]);
});

test('Telegram not set up (no token or no chat): nothing is sent', async (t) => {
  for (const options of [{ token: '' }, { chatId: '' }]) {
    const { notify, sent } = setup(t, options);
    assert.equal(await notify('x'), false);
    assert.deepEqual(sent, []);
  }
});

test("a failure is logged without the token; it never throws", async (t) => {
  for (const fail of [true, 'throw']) {
    const { notify, logs } = setup(t, { fail });
    assert.equal(await notify('x'), false);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^Sign-in note not sent: /);
    assert.ok(!logs[0].includes(TOKEN), logs[0]);
  }
});

test('by default it reads the farm\'s Telegram settings', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const sent = [];
  const notify = createLoginNotify({ db, transport: async (m) => { sent.push(m); return { ok: true }; } });
  assert.equal(await notify('x'), false, 'none saved');
  db.setSetting('telegramToken', TOKEN);
  db.setSetting('telegramChatId', '42');
  assert.equal(await notify('x'), true);
  assert.equal(sent.length, 1);
});
