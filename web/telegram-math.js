// Pure helpers for the "Phone alarms (Telegram)" card on the Settings page (no DOM, so they can be tested in Node).

export const LEVELS = [
  { key: 'critical', label: 'Critical' },
  { key: 'serious', label: 'Serious' },
  { key: 'warning', label: 'Warning' },
];
export const TOKEN_MESSAGE = 'Bot token must look like 123456:ABC-def, as BotFather gave it';
export const CHAT_MESSAGE = 'Chat id must be a number (a group id starts with -) or @name, up to 64 characters';
export const REPEAT_MESSAGE = 'Repeat must be a whole number of minutes from 0 (off) to 1440';
export const DEFAULT_REPEAT = 30;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The token field's hint: what the server holds.
export function tokenHint(settings) {
  return settings?.telegramTokenSet ? `Token set, ends in ${settings.telegramTokenEnd ?? '…'}. Leave empty to keep it.` : 'No token set.';
}

// The text of the token input → { value } ('' keeps the stored one), or { error }.
export function parseToken(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { value: '' };
  return /^[0-9]{3,20}:[A-Za-z0-9_-]{10,100}$/.test(s) ? { value: s } : { error: TOKEN_MESSAGE };
}

// Empty is allowed (not set yet).
export function parseChatId(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { value: '' };
  return s.length <= 64 && /^(-?[0-9]{1,20}|@[A-Za-z0-9_]{1,63})$/.test(s) ? { value: s } : { error: CHAT_MESSAGE };
}

export function parseRepeat(text) {
  const s = String(text ?? '').trim();
  if (!/^[0-9]{1,4}$/.test(s)) return { error: REPEAT_MESSAGE };
  const n = Number(s);
  return n <= 1440 ? { value: n } : { error: REPEAT_MESSAGE };
}

// Everything on the card → { body } for PUT /api/settings, or { errors: { field: message } }.
// clearToken: the Clear token button was pressed (sends ''); otherwise an empty token input leaves the token as it is.
export function buildTelegramBody({ token, chatId, levels, cleared, repeat, clearToken = false }) {
  const errors = {};
  const body = { telegramLevels: LEVELS.map((l) => l.key).filter((k) => levels?.includes(k)), telegramCleared: Boolean(cleared) };
  const t = parseToken(token);
  if (t.error) errors.telegramToken = t.error;
  else if (t.value !== '') body.telegramToken = t.value;
  else if (clearToken) body.telegramToken = '';
  const c = parseChatId(chatId);
  if (c.error) errors.telegramChatId = c.error;
  else body.telegramChatId = c.value;
  const r = parseRepeat(repeat);
  if (r.error) errors.telegramRepeatMin = r.error;
  else body.telegramRepeatMin = r.value;
  return Object.keys(errors).length ? { errors } : { body };
}

// The token and chat id as typed, for the test message: what is empty is left out (the server uses the saved one).
export function testBody({ token, chatId }) {
  const body = {};
  const t = parseToken(token);
  if (t.error) return { errors: { telegramToken: t.error } };
  if (t.value) body.telegramToken = t.value;
  const c = parseChatId(chatId);
  if (c.error) return { errors: { telegramChatId: c.error } };
  if (c.value) body.telegramChatId = c.value;
  return { body };
}

// "26 Oct 16:20" in the browser's local time.
export function whenText(ms) {
  const d = new Date(ms);
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

// The last sent / last error lines under the card.
export function statusLines(settings) {
  const sent = Number.isFinite(settings?.telegramLastSentAt) ? `Last message sent ${whenText(settings.telegramLastSentAt)}.` : 'No message sent since the farm app started.';
  const error = settings?.telegramLastError ? `Last error: ${settings.telegramLastError}` : '';
  return { sent, error };
}

// The settings from the server → what the card's inputs show.
export function cardValues(settings) {
  return {
    chatId: settings?.telegramChatId ?? '',
    levels: Array.isArray(settings?.telegramLevels) ? settings.telegramLevels : ['critical', 'serious'],
    cleared: settings?.telegramCleared !== false,
    repeat: String(Number.isInteger(settings?.telegramRepeatMin) ? settings.telegramRepeatMin : DEFAULT_REPEAT),
  };
}
