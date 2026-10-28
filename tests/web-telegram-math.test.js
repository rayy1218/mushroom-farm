import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenHint, parseToken, parseChatId, parseRepeat, buildTelegramBody, testBody, statusLines, cardValues, whenText } from '../web/telegram-math.js';

const TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

test('the token hint says what the server holds, never the token', () => {
  assert.equal(tokenHint({ telegramTokenSet: false }), 'No token set.');
  assert.equal(tokenHint({ telegramTokenSet: true, telegramTokenEnd: 'ew11' }), 'Token set, ends in ew11. Leave empty to keep it.');
});

test('token, chat id and repeat are read like the server checks them', () => {
  assert.deepEqual(parseToken(''), { value: '' });
  assert.deepEqual(parseToken(` ${TOKEN} `), { value: TOKEN });
  assert.ok(parseToken('abc').error);
  for (const t of ['123', '-100123', '@farm_1', ' 42 ', '']) assert.ok(!('error' in parseChatId(t)), t);
  for (const t of ['abc', '1-2', '@', '@a b']) assert.ok(parseChatId(t).error, t);
  // a bot's own name (Telegram bot usernames end in "bot") is not a chat: the messages would never arrive
  assert.equal(parseChatId('@MushroomClimateAlertBot').error, "That is a bot's name (it ends in bot), not a chat: enter your chat's number id, a group's negative id or a channel's @name");
  assert.ok(!('error' in parseChatId('@robotics_farm_channel')), 'bot only at the end');
  assert.deepEqual(parseRepeat('0'), { value: 0 });
  assert.deepEqual(parseRepeat('1440'), { value: 1440 });
  for (const t of ['', '1441', '-1', '2.5', 'x']) assert.ok(parseRepeat(t).error, t);
});

test('the PUT body: an empty token is left out unless cleared; levels in order', () => {
  const base = { token: '', chatId: '-100', levels: ['warning', 'critical'], cleared: true, repeat: '30' };
  assert.deepEqual(buildTelegramBody(base), { body: { telegramLevels: ['critical', 'warning'], telegramCleared: true, telegramChatId: '-100', telegramRepeatMin: 30 } });
  assert.equal(buildTelegramBody({ ...base, token: TOKEN }).body.telegramToken, TOKEN);
  assert.equal(buildTelegramBody({ ...base, clearToken: true }).body.telegramToken, '');
  assert.equal(buildTelegramBody({ ...base, token: TOKEN, clearToken: true }).body.telegramToken, TOKEN);
  assert.deepEqual(buildTelegramBody({ ...base, token: 'x', chatId: 'bad', repeat: '' }).errors.telegramToken.length > 0, true);
  assert.deepEqual(Object.keys(buildTelegramBody({ ...base, token: 'x', chatId: 'bad', repeat: '' }).errors), ['telegramToken', 'telegramChatId', 'telegramRepeatMin']);
  assert.deepEqual(buildTelegramBody({ ...base, levels: [] }).body.telegramLevels, []);
});

test('the test message body uses the typed values and leaves out empty ones', () => {
  assert.deepEqual(testBody({ token: '', chatId: '' }), { body: {} });
  assert.deepEqual(testBody({ token: TOKEN, chatId: '@farm' }), { body: { telegramToken: TOKEN, telegramChatId: '@farm' } });
  assert.ok(testBody({ token: 'bad', chatId: '' }).errors.telegramToken);
  assert.ok(testBody({ token: '', chatId: 'bad' }).errors.telegramChatId);
});

test('status lines and the values shown', () => {
  assert.deepEqual(statusLines({}), { sent: 'No message sent since the farm app started.', error: '' });
  const at = new Date(2026, 9, 26, 16, 20).getTime();
  assert.equal(whenText(at), '26 Oct 16:20');
  assert.deepEqual(statusLines({ telegramLastSentAt: at, telegramLastError: 'Telegram said: chat not found' }),
    { sent: 'Last message sent 26 Oct 16:20.', error: 'Last error: Telegram said: chat not found' });
  assert.deepEqual(cardValues({}), { chatId: '', levels: ['critical', 'serious'], cleared: true, repeat: '30' });
  assert.deepEqual(cardValues({ telegramChatId: '-1', telegramLevels: [], telegramCleared: false, telegramRepeatMin: 0 }), { chatId: '-1', levels: [], cleared: false, repeat: '0' });
});
