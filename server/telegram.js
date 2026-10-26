// Phone alarms through a Telegram bot (spec 2026-10-26-live-alarms-outdoor-design.md section 5): listens to the alarm
// changes of the database and sends a message for the chosen levels, when an alarm clears, and as a repeat while a
// critical alarm is on and not acknowledged. Messages go one at a time; a failed one is retried and then dropped.
// Nothing here may break the control loop, and the bot token never reaches a log line or the page.

import { readTelegram } from './settings.js';

const MIN_MS = 60_000;
export const RETRY_DELAYS = [1 * MIN_MS, 5 * MIN_MS, 15 * MIN_MS];
export const MAX_WAITING = 50;
const TIMEOUT_MS = 15_000;
const ICONS = { critical: '🔴', serious: '🟠', warning: '🟡' };
const LEVEL_NAMES = { critical: 'Critical', serious: 'Serious', warning: 'Warning' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "26 Oct 16:20" in the server's local time.
export function formatWhen(ms) {
  const d = new Date(ms);
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

const minutes = (ms) => Math.max(0, Math.round(ms / MIN_MS));
const base = (a, now) => `${a.roomName} · ${a.text} · ${formatWhen(now)}`;

export const raiseText = (a) => `${ICONS[a.level]} ${LEVEL_NAMES[a.level]} · ${a.roomName} · ${a.text} · ${formatWhen(a.raisedAt)}`;
export const clearedText = (a) => `✅ Cleared after ${minutes(a.clearedAt - a.raisedAt)} min · ${base(a, a.clearedAt)}`;
export const repeatText = (a, now) => `🔁 Still on for ${minutes(now - a.raisedAt)} min, not acknowledged · ${base(a, now)}`;

// The real transport: POST sendMessage. Resolves { ok: true } or { ok: false, description } (Telegram answered with an
// error); rejects when there was no answer.
export async function fetchTransport({ token, chatId, text }) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (res.ok && body?.ok !== false) return { ok: true };
  return { ok: false, description: body?.description ?? `HTTP ${res.status}` };
}

export function createTelegram({
  db, settings = () => readTelegram(db), transport = fetchTransport, now = Date.now,
  setTimer = (fn, ms) => setTimeout(fn, ms).unref(), clearTimer = clearTimeout, log = console.error,
}) {
  const status = { lastSentAt: null, lastError: null };
  const queue = []; // { text, attempt, timer }; the first one is the one being sent or waiting for its retry
  let sending = false;
  let closed = false;
  const sent = new Map(); // alarm id → { alarm, timer } for alarms a message went out for (timer: the next repeat)

  // Anything that may carry the token is passed through here before it is stored or logged.
  const mask = (text) => {
    const { telegramToken: token } = settings();
    let out = String(text);
    if (token) out = out.split(token).join('***');
    return out.replace(/bot[0-9]{3,20}:[A-Za-z0-9_-]{10,}/g, 'bot***');
  };
  const safeLog = (message) => { try { log(mask(message)); } catch { /* logging must not throw */ } };

  // One try: { ok: true } or { error } with a text that is safe to show.
  async function attempt(text, s) {
    try {
      const r = await transport({ token: s.telegramToken, chatId: s.telegramChatId, text });
      if (r?.ok) return { ok: true };
      return { error: mask(`Telegram said: ${r?.description ?? 'no reason given'}`) };
    } catch (err) {
      return { error: mask(`No answer from Telegram: ${err?.message ?? err}`) };
    }
  }

  const configured = (s) => Boolean(s.telegramToken && s.telegramChatId);

  async function pump() {
    if (sending || closed) return;
    const item = queue[0];
    if (!item || item.timer) return;
    sending = true;
    const r = await attempt(item.text, settings());
    sending = false;
    if (closed || queue[0] !== item) { // dropped while in flight
      pump();
      return;
    }
    if (r.ok) {
      status.lastSentAt = now();
      status.lastError = null;
      queue.shift();
    } else {
      status.lastError = r.error;
      safeLog(`Telegram message failed: ${r.error}`);
      if (item.attempt >= RETRY_DELAYS.length) {
        queue.shift(); // the third retry failed too: dropped
        safeLog('Telegram message dropped after 3 retries');
      } else {
        item.timer = setTimer(() => { item.timer = null; item.attempt += 1; pump(); }, RETRY_DELAYS[item.attempt]);
        return;
      }
    }
    pump();
  }

  function enqueue(text) {
    if (closed || !configured(settings())) return;
    queue.push({ text, attempt: 0, timer: null });
    while (queue.length > MAX_WAITING) {
      const i = sending ? 1 : 0; // the one in flight stays
      const [dropped] = queue.splice(i, 1);
      if (dropped.timer) clearTimer(dropped.timer);
    }
    pump();
  }

  function stopRepeat(id) {
    const entry = sent.get(id);
    if (entry?.timer) clearTimer(entry.timer);
    sent.delete(id);
  }

  function scheduleRepeat(entry) {
    const min = settings().telegramRepeatMin;
    if (!(min > 0)) { entry.timer = null; return; }
    entry.timer = setTimer(() => {
      entry.timer = null;
      if (closed || !sent.has(entry.alarm.id)) return;
      const s = settings();
      if (s.telegramLevels.includes('critical')) enqueue(repeatText(entry.alarm, now()));
      scheduleRepeat(entry);
    }, min * MIN_MS);
  }

  function onChange(event) {
    if (closed) return;
    const s = settings();
    const { change, alarm } = event;
    if (change === 'raised') {
      if (!s.telegramLevels.includes(alarm.level)) return;
      enqueue(raiseText(alarm));
      const entry = { alarm, timer: null };
      sent.set(alarm.id, entry);
      if (alarm.level === 'critical') scheduleRepeat(entry);
    } else if (change === 'cleared') {
      if (!sent.has(alarm.id)) return;
      stopRepeat(alarm.id);
      if (s.telegramCleared) enqueue(clearedText(alarm));
    } else if (change === 'acked') {
      const entry = sent.get(alarm.id);
      if (entry?.timer) { clearTimer(entry.timer); entry.timer = null; }
    } else if (change === 'acked-room') {
      for (const entry of sent.values()) {
        if (entry.alarm.roomId === event.roomId && entry.timer) { clearTimer(entry.timer); entry.timer = null; }
      }
    }
  }

  const off = db.onAlarmChange((event) => {
    try { onChange(event); } catch (err) { safeLog(`Telegram: ${err?.message ?? err}`); }
  });

  return {
    // Sends a test message now. override: { telegramToken, telegramChatId } to try values that are not saved yet.
    // Returns { ok: true } or { error, field? } (field when the token or the chat id is missing).
    async test(override = {}) {
      const s = { ...settings(), ...override };
      if (!s.telegramToken) return { error: 'Enter the bot token first', field: 'telegramToken' };
      if (!s.telegramChatId) return { error: 'Enter the chat id first', field: 'telegramChatId' };
      const r = await attempt('✅ Test message from the mushroom farm app: phone alarms work', s);
      if (r.ok) {
        status.lastSentAt = now();
        status.lastError = null;
      } else status.lastError = r.error;
      return r;
    },
    status: () => ({ ...status }),
    waiting: () => queue.length,
    close() {
      closed = true;
      off();
      for (const item of queue) if (item.timer) clearTimer(item.timer);
      queue.length = 0;
      for (const entry of sent.values()) if (entry.timer) clearTimer(entry.timer);
      sent.clear();
    },
  };
}
