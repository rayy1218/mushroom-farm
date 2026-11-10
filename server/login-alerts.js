// The owner's Telegram note of a sign-in lock (server/auth.js notify): to the alarms' chat with telegram.js's transport, as
// inventory-alerts.js sends (that file is not changed); nothing when Telegram is not set up (no token or no chat id). The
// token never reaches a log line. Never throws.

import { fetchTransport } from './telegram.js';
import { readTelegram } from './settings.js';

// The token out of a text (Telegram's errors may echo the URL).
const mask = (text, token) => (token ? String(text).split(token).join('***') : String(text)).replace(/bot[0-9]{3,20}:[A-Za-z0-9_-]{10,}/g, 'bot***');

// telegram() → { telegramToken, telegramChatId }. → async (text) → true when Telegram took the message.
export function createLoginNotify({ db, transport = fetchTransport, telegram = () => readTelegram(db), log = console.error }) {
  const safeLog = (text, token) => { try { log(mask(text, token)); } catch { /* logging must not throw */ } };
  return async function notify(text) {
    let s;
    try {
      s = telegram();
    } catch (err) {
      safeLog(`Sign-in note not sent: ${err?.message ?? err}`);
      return false;
    }
    if (!(s?.telegramToken && s.telegramChatId)) return false;
    try {
      const r = await transport({ token: s.telegramToken, chatId: s.telegramChatId, text });
      if (r?.ok) return true;
      safeLog(`Sign-in note not sent: ${r?.description ?? 'no reason given'}`, s.telegramToken);
    } catch (err) {
      safeLog(`Sign-in note not sent: ${err?.message ?? err}`, s.telegramToken);
    }
    return false;
  };
}
