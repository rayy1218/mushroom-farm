// The Telegram sender: message texts, levels, repeats, the queue with retries, and the token kept out of errors and logs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createTelegram, raiseText, clearedText, repeatText, formatWhen, RETRY_DELAYS, MAX_WAITING } from '../server/telegram.js';

const TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
const MIN = 60_000;
const T0 = new Date(2026, 9, 26, 16, 20).getTime();

// A telegram on a fake clock, fake timers and a fake transport (never the network). script: results by call number.
function setup(t, { settings = {}, script = [], before = null } = {}) {
  const db = openDb(':memory:');
  t.after(() => { try { db.close(); } catch { /* closed by the test */ } });
  const roomId = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 }).id;
  if (before) before(db, roomId);
  const state = { time: T0, calls: [], timers: [], logs: [] };
  const cfg = { telegramToken: TOKEN, telegramChatId: '-100', telegramLevels: ['critical', 'serious'], telegramCleared: true, telegramRepeatMin: 30, ...settings };
  const transport = async (m) => {
    state.calls.push(m);
    const r = script[state.calls.length - 1] ?? { ok: true };
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r() : r;
  };
  const tg = createTelegram({
    db, settings: () => cfg, transport, now: () => state.time, log: (m) => state.logs.push(String(m)),
    setTimer: (fn, ms) => { const timer = { fn, ms, live: true }; state.timers.push(timer); return timer; },
    clearTimer: (timer) => { timer.live = false; },
  });
  t.after(() => tg.close());
  const live = () => state.timers.filter((x) => x.live);
  const fire = async (timer) => { timer.live = false; timer.fn(); await flush(); };
  return { db, roomId, state, tg, cfg, live, fire };
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

const alarm = { id: 1, roomId: 1, roomName: 'Room 1', key: 'co2Safety', level: 'critical', text: 'CO₂ 1,400 ppm: at or above the safety level (1,250 ppm)', raisedAt: T0, clearedAt: null, ackedAt: null };

test('texts: raise per level, cleared and repeat; local date', () => {
  assert.equal(formatWhen(T0), '26 Oct 16:20');
  assert.equal(raiseText(alarm), '🔴 Critical · Room 1 · CO₂ 1,400 ppm: at or above the safety level (1,250 ppm) · 26 Oct 16:20');
  assert.match(raiseText({ ...alarm, level: 'serious' }), /^🟠 Serious · Room 1 /);
  assert.match(raiseText({ ...alarm, level: 'warning' }), /^🟡 Warning · Room 1 /);
  assert.equal(clearedText({ ...alarm, clearedAt: T0 + 12 * MIN }), '✅ Cleared after 12 min · Room 1 · CO₂ 1,400 ppm: at or above the safety level (1,250 ppm) · 26 Oct 16:32');
  assert.equal(repeatText(alarm, T0 + 35 * MIN), '🔁 Still on for 35 min, not acknowledged · Room 1 · CO₂ 1,400 ppm: at or above the safety level (1,250 ppm) · 26 Oct 16:55');
});

test('a raised alarm of a chosen level is sent to the chat; a level not chosen is not', async (t) => {
  const { db, roomId, state } = setup(t);
  db.raiseAlarm(roomId, 'tHigh', 'warning', 'Temperature 30 °C', T0);
  db.raiseAlarm(roomId, 'sensorTrh', 'serious', 'T/RH probe fault: x', T0);
  await flush();
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].token, TOKEN);
  assert.equal(state.calls[0].chatId, '-100');
  assert.match(state.calls[0].text, /^🟠 Serious · Room 1 · T\/RH probe fault: x · 26 Oct 16:20$/);
});

test('nothing is sent without a token or a chat id', async (t) => {
  const a = setup(t, { settings: { telegramToken: '' } });
  a.db.raiseAlarm(a.roomId, 'co2Safety', 'critical', 'x', T0);
  const b = setup(t, { settings: { telegramChatId: '' } });
  b.db.raiseAlarm(b.roomId, 'co2Safety', 'critical', 'x', T0);
  await flush();
  assert.equal(a.state.calls.length + b.state.calls.length, 0);
});

test('cleared: only for an alarm that was sent, only when telegramCleared', async (t) => {
  const { db, roomId, state, cfg } = setup(t);
  db.raiseAlarm(roomId, 'tHigh', 'warning', 'w', T0); // not sent (level)
  db.raiseAlarm(roomId, 'co2Safety', 'critical', 'c', T0);
  db.clearAlarm(roomId, 'tHigh', T0 + MIN);
  db.clearAlarm(roomId, 'co2Safety', T0 + 12 * MIN);
  await flush();
  assert.equal(state.calls.length, 2);
  assert.match(state.calls[1].text, /^✅ Cleared after 12 min · Room 1 · c · /);
  cfg.telegramCleared = false;
  db.raiseAlarm(roomId, 'sensorCo2', 'serious', 's', T0);
  db.clearAlarm(roomId, 'sensorCo2', T0 + MIN);
  await flush();
  assert.equal(state.calls.length, 3);
});

test('repeat: a critical alarm repeats every telegramRepeatMin until acknowledged', async (t) => {
  const { db, roomId, state, live, fire } = setup(t);
  db.raiseAlarm(roomId, 'co2Safety', 'critical', 'c', T0);
  await flush();
  assert.deepEqual(live().map((x) => x.ms), [30 * MIN]);
  state.time = T0 + 30 * MIN;
  await fire(live()[0]);
  assert.match(state.calls[1].text, /^🔁 Still on for 30 min, not acknowledged · Room 1 · c/);
  assert.equal(live().length, 1);
  state.time = T0 + 60 * MIN;
  await fire(live()[0]);
  assert.equal(state.calls.length, 3);
  const [alarm] = db.activeAlarms(roomId);
  db.ackAlarm(alarm.id, state.time);
  assert.equal(live().length, 0);
});

test('repeat stops when the room is acknowledged, when it clears, and is off at 0; serious does not repeat', async (t) => {
  const a = setup(t);
  a.db.raiseAlarm(a.roomId, 'co2Safety', 'critical', 'c', T0);
  assert.equal(a.live().length, 1);
  a.db.ackRoomAlarms(a.roomId, T0);
  assert.equal(a.live().length, 0);
  const b = setup(t);
  b.db.raiseAlarm(b.roomId, 'co2Safety', 'critical', 'c', T0);
  b.db.clearAlarm(b.roomId, 'co2Safety', T0 + MIN);
  assert.equal(b.live().length, 0);
  const c = setup(t, { settings: { telegramRepeatMin: 0 } });
  c.db.raiseAlarm(c.roomId, 'co2Safety', 'critical', 'c', T0);
  const d = setup(t);
  d.db.raiseAlarm(d.roomId, 'sensorCo2', 'serious', 's', T0);
  assert.equal(c.live().length + d.live().length, 0);
});

test('queue: one at a time, in order', async (t) => {
  let release;
  const gate = () => new Promise((r) => { release = () => r({ ok: true }); });
  const { db, roomId, state } = setup(t, { script: [gate] });
  db.raiseAlarm(roomId, 'sensorTrh', 'serious', 'one', T0);
  db.raiseAlarm(roomId, 'sensorCo2', 'serious', 'two', T0);
  await flush();
  assert.equal(state.calls.length, 1);
  release();
  await flush();
  assert.deepEqual(state.calls.map((c) => c.text.split(' · ')[2]), ['one', 'two']);
});

test('a failed message is retried after 1, 5 and 15 min, then dropped; the next one goes on', async (t) => {
  const fail = { ok: false, description: 'chat not found' };
  const { db, roomId, state, tg, live, fire } = setup(t, { script: [fail, fail, fail, fail, { ok: true }] });
  db.raiseAlarm(roomId, 'sensorTrh', 'serious', 'one', T0);
  db.raiseAlarm(roomId, 'sensorCo2', 'serious', 'two', T0);
  await flush();
  assert.equal(state.calls.length, 1);
  assert.deepEqual(RETRY_DELAYS, [MIN, 5 * MIN, 15 * MIN]);
  for (const [n, ms] of [[2, MIN], [3, 5 * MIN], [4, 15 * MIN]]) {
    assert.deepEqual(live().map((x) => x.ms), [ms]);
    await fire(live()[0]);
    assert.equal(state.calls.length, n === 4 ? 5 : n); // the third retry fails: dropped, "two" goes at once
  }
  assert.equal(live().length, 0);
  assert.equal(tg.waiting(), 0);
  assert.equal(state.calls[4].text.includes('two'), true);
  assert.equal(tg.status().lastError, null);
  assert.equal(tg.status().lastSentAt, T0);
});

test('a message that failed keeps the order: nothing else goes before its retry', async (t) => {
  const { db, roomId, state } = setup(t, { script: [{ ok: false, description: 'x' }] });
  db.raiseAlarm(roomId, 'sensorTrh', 'serious', 'one', T0);
  db.raiseAlarm(roomId, 'sensorCo2', 'serious', 'two', T0);
  await flush();
  assert.equal(state.calls.length, 1);
});

test('at most 50 wait: the oldest are dropped', async (t) => {
  const { db, roomId, state, tg } = setup(t, { script: Array(100).fill({ ok: false, description: 'down' }) });
  for (let i = 0; i < 60; i++) db.raiseAlarm(roomId, `k${i}`, 'serious', `n${i}`, T0);
  await flush();
  assert.equal(tg.waiting(), MAX_WAITING);
  assert.equal(state.calls.length, 1);
  assert.match(state.calls[0].text, /n0 /); // the one being sent stays
});

test('status: last error is Telegram\'s description, last sent is the time of the last success', async (t) => {
  const { db, roomId, state, tg } = setup(t, { script: [{ ok: false, description: 'Forbidden: bot was blocked' }] });
  db.raiseAlarm(roomId, 'sensorTrh', 'serious', 'one', T0);
  await flush();
  assert.deepEqual(tg.status(), { lastSentAt: null, lastError: 'Telegram said: Forbidden: bot was blocked' });
  void state;
});

test('the token never reaches a log line or a stored error', async (t) => {
  const leak = new Error(`request to https://api.telegram.org/bot${TOKEN}/sendMessage failed`);
  const { db, roomId, state, tg } = setup(t, { script: [leak] });
  db.raiseAlarm(roomId, 'sensorTrh', 'serious', 'one', T0);
  await flush();
  const all = JSON.stringify([state.logs, tg.status()]);
  assert.ok(!all.includes(TOKEN) && !all.includes('ABC-DEF'));
  assert.match(tg.status().lastError, /^No answer from Telegram: /);
  assert.ok(state.logs.length > 0);
});

test('test(): ok, Telegram\'s description, a network error, and a missing token or chat id', async (t) => {
  const net = new Error(`connect ECONNREFUSED ${TOKEN}`);
  const { tg, state } = setup(t, { script: [{ ok: true }, { ok: false, description: 'chat not found' }, net] });
  assert.deepEqual(await tg.test(), { ok: true });
  assert.equal(tg.status().lastSentAt, T0);
  assert.deepEqual(await tg.test(), { error: 'Telegram said: chat not found' });
  const r = await tg.test({ telegramChatId: '@farm' });
  assert.equal(state.calls[2].chatId, '@farm');
  assert.ok(!r.error.includes(TOKEN));
  assert.deepEqual(await tg.test({ telegramToken: '' }), { error: 'Enter the bot token first', field: 'telegramToken' });
  assert.deepEqual(await tg.test({ telegramChatId: '' }), { error: 'Enter the chat id first', field: 'telegramChatId' });
});

test('close stops listening and clears the timers', async (t) => {
  const { db, roomId, state, tg, live } = setup(t);
  db.raiseAlarm(roomId, 'co2Safety', 'critical', 'c', T0);
  await flush();
  tg.close();
  assert.equal(live().length, 0);
  db.raiseAlarm(roomId, 'sensorTrh', 'serious', 's', T0);
  await flush();
  assert.equal(state.calls.length, 1);
});

test('a repeat stops when its alarm is gone (room deleted), cleared or acknowledged without an event', async (t) => {
  const a = setup(t);
  a.db.raiseAlarm(a.roomId, 'co2Safety', 'critical', 'c', T0);
  a.db.deleteRoom(a.roomId);
  a.state.time = T0 + 30 * MIN;
  await a.fire(a.live()[0]);
  assert.equal(a.state.calls.length, 1);
  assert.equal(a.live().length, 0);
});

test('restart: active alarms of the chosen levels repeat from their raised time, no raised message again', async (t) => {
  const { state, live, fire } = setup(t, {
    before: (db, roomId) => {
      db.raiseAlarm(roomId, 'co2Safety', 'critical', 'old', T0 - 100 * MIN);
      db.raiseAlarm(roomId, 'sensorCo2', 'serious', 'ser', T0 - 100 * MIN);
      db.raiseAlarm(roomId, 'tHigh', 'warning', 'war', T0 - 100 * MIN);
    },
  });
  await flush();
  assert.equal(state.calls.length, 0);
  assert.deepEqual(live().map((x) => x.ms), [0]); // overdue: at once
  await fire(live()[0]);
  assert.match(state.calls[0].text, /^🔁 Still on for 100 min, not acknowledged · Room 1 · old/);
  assert.deepEqual(live().map((x) => x.ms), [30 * MIN]);
});

test('restart: not before the next due time, nothing without a token, acknowledged ones stay quiet', async (t) => {
  const a = setup(t, { before: (db, id) => db.raiseAlarm(id, 'co2Safety', 'critical', 'c', T0 - 10 * MIN) });
  assert.deepEqual(a.live().map((x) => x.ms), [20 * MIN]);
  const b = setup(t, { settings: { telegramToken: '' }, before: (db, id) => db.raiseAlarm(id, 'co2Safety', 'critical', 'c', T0 - 10 * MIN) });
  assert.equal(b.live().length, 0);
  const c = setup(t, { before: (db, id) => { const x = db.raiseAlarm(id, 'co2Safety', 'critical', 'c', T0 - 10 * MIN); db.ackAlarm(x, T0); } });
  assert.equal(c.live().length, 0);
});

test('no message and no repeat entry without a token', async (t) => {
  const { db, roomId, state, live, cfg } = setup(t, { settings: { telegramToken: '' } });
  db.raiseAlarm(roomId, 'co2Safety', 'critical', 'c', T0);
  cfg.telegramToken = TOKEN;
  cfg.telegramRepeatMin = 5;
  await flush();
  assert.equal(live().length, 0);
  assert.equal(state.calls.length, 0);
});

test('settingsChanged: 0 cancels, a new value counts from the last send, 0 to on starts, critical off stops', async (t) => {
  const { db, roomId, state, tg, cfg, live } = setup(t);
  db.raiseAlarm(roomId, 'co2Safety', 'critical', 'c', T0);
  state.time = T0 + 10 * MIN;
  cfg.telegramRepeatMin = 45;
  tg.settingsChanged();
  assert.deepEqual(live().map((x) => x.ms), [35 * MIN]);
  cfg.telegramRepeatMin = 0;
  tg.settingsChanged();
  assert.equal(live().length, 0);
  cfg.telegramRepeatMin = 20;
  tg.settingsChanged();
  assert.deepEqual(live().map((x) => x.ms), [10 * MIN]);
  cfg.telegramLevels = ['serious'];
  tg.settingsChanged();
  assert.equal(live().length, 0);
});

test('a repeat with 0 minutes at fire time is not sent', async (t) => {
  const { db, roomId, state, cfg, live, fire } = setup(t);
  db.raiseAlarm(roomId, 'co2Safety', 'critical', 'c', T0);
  await flush();
  cfg.telegramRepeatMin = 0;
  await fire(live()[0]);
  assert.equal(state.calls.length, 1);
  assert.equal(live().length, 0);
});

test('429: the retry waits at least retry_after seconds', async (t) => {
  const { db, roomId, state, live } = setup(t, { script: [{ ok: false, description: 'Too Many Requests', retryAfter: 120 }] });
  db.raiseAlarm(roomId, 'sensorTrh', 'serious', 'one', T0);
  await flush();
  assert.equal(state.calls.length, 1);
  assert.deepEqual(live().map((x) => x.ms), [120_000]);
});

test('the typed token of a test is masked in its error; a closed database does not leave an unhandled rejection', async (t) => {
  const typed = '999999:ZZZ-typed-token-0123456789abc';
  const { tg } = setup(t, { script: [new Error(`boom ${typed}`)] });
  const r = await tg.test({ telegramToken: typed });
  assert.ok(!r.error.includes(typed));
  const x = setup(t, { settings: {} });
  x.db.raiseAlarm(x.roomId, 'sensorTrh', 'serious', 'one', T0);
  x.db.close();
  await flush();
});

test('the farm app gives each address 2 s to connect (Telegram took longer than Node\'s 250 ms and alarms failed now and then)', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../server/main.js', import.meta.url), 'utf8');
  assert.match(main, /setDefaultAutoSelectFamilyAttemptTimeout\(2000\);/);
});

// Critique 2026-10-29: step 3 showed a raw getUpdates URL and its JSON key as the way to the chat id.
test('Settings › Telegram step 3 is a plain step, the getUpdates way a smaller fallback after it', async () => {
  const { readFileSync } = await import('node:fs');
  const card = readFileSync(new URL('../web/telegram-card.js', import.meta.url), 'utf8');
  assert.match(card, /<li>Message <strong>@userinfobot<\/strong>; it replies with your number id, the chat id below\.\n\s*<span class="tg-fallback">If @userinfobot doesn't work: open <code>https:\/\/api\.telegram\.org\/bot&lt;token&gt;\/getUpdates<\/code>/);
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.tg-fallback \{ display: block; margin-top: 2px; font-size: var\(--fs-xs\); color: var\(--muted\);/);
});
