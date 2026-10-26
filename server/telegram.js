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
  return { ok: false, description: body?.description ?? `HTTP ${res.status}`, retryAfter: Number(body?.parameters?.retry_after) || 0 };
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
  const mask = (text, token) => {
    if (token === undefined) { try { token = settings().telegramToken; } catch { token = ''; } }
    let out = String(text);
    if (token) out = out.split(token).join('***');
    return out.replace(/bot[0-9]{3,20}:[A-Za-z0-9_-]{10,}/g, 'bot***');
  };
  const safeLog = (message, token) => { try { log(mask(message, token)); } catch { /* logging must not throw */ } };

  // One try: { ok: true } or { error } with a text that is safe to show.
  async function attempt(text, s) {
    const token = s.telegramToken; // read once: the same token is sent and masked
    try {
      const r = await transport({ token, chatId: s.telegramChatId, text });
      if (r?.ok) return { ok: true };
      return { error: mask(`Telegram said: ${r?.description ?? 'no reason given'}`, token), retryAfter: Number(r?.retryAfter) || 0 };
    } catch (err) {
      return { error: mask(`No answer from Telegram: ${err?.message ?? err}`, token), retryAfter: 0 };
    }
  }

  const configured = (s) => Boolean(s.telegramToken && s.telegramChatId);

  // Never rejects: after a close (a closed database) a failure here must not become an unhandled rejection.
  function pump() {
    run().catch((err) => { sending = false; safeLog(`Telegram: ${err?.message ?? err}`); });
  }

  async function run() {
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
        item.timer = setTimer(() => { item.timer = null; item.attempt += 1; pump(); }, Math.max(RETRY_DELAYS[item.attempt], r.retryAfter * 1000));
        return;
      }
    }
    pump();
  }

  // Returns true when the message was queued (a token and a chat id are set).
  function enqueue(text) {
    if (closed || !configured(settings())) return false;
    queue.push({ text, attempt: 0, timer: null });
    while (queue.length > MAX_WAITING) {
      const i = sending ? 1 : 0; // the one in flight stays
      const [dropped] = queue.splice(i, 1);
      if (dropped.timer) clearTimer(dropped.timer);
    }
    pump();
    return true;
  }

  function stopRepeat(id) {
    const entry = sent.get(id);
    if (entry?.timer) clearTimer(entry.timer);
    sent.delete(id);
  }

  // The next repeat of a critical alarm is due telegramRepeatMin after the last message about it (entry.lastAt), at once
  // when that is already past. Turned off (0), no timer.
  function scheduleRepeat(entry) {
    if (entry.timer) clearTimer(entry.timer);
    entry.timer = null;
    const s = settings();
    const min = s.telegramRepeatMin;
    if (closed || !(min > 0) || !s.telegramLevels.includes('critical') || !configured(s)) return;
    entry.timer = setTimer(() => {
      entry.timer = null;
      try {
        if (closed) return;
        const fresh = db.getAlarm(entry.alarm.id); // gone (a deleted room), cleared or acknowledged: stop
        if (!fresh || fresh.clearedAt !== null || fresh.ackedAt !== null) { sent.delete(entry.alarm.id); return; }
        entry.alarm = fresh;
        const now_ = settings();
        if (now_.telegramRepeatMin > 0 && now_.telegramLevels.includes('critical') && enqueue(repeatText(fresh, now()))) entry.lastAt = now();
        scheduleRepeat(entry);
      } catch (err) { safeLog(`Telegram: ${err?.message ?? err}`); }
    }, Math.max(0, entry.lastAt + min * MIN_MS - now()));
  }

  function onChange(event) {
    if (closed) return;
    const s = settings();
    const { change, alarm } = event;
    if (change === 'raised') {
      if (!s.telegramLevels.includes(alarm.level)) return;
      if (!enqueue(raiseText(alarm))) return;
      const entry = { alarm, timer: null, lastAt: now() };
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

  // After a restart: the active alarms of the chosen levels count as sent (no raised message again; their cleared message
  // still goes), and the unacknowledged critical ones repeat, counted from when they were raised.
  try {
    const s = settings();
    if (configured(s)) {
      for (const room of db.listRooms()) {
        for (const alarm of db.activeAlarms(room.id)) {
          if (!s.telegramLevels.includes(alarm.level)) continue;
          const entry = { alarm, timer: null, lastAt: alarm.raisedAt };
          sent.set(alarm.id, entry);
          if (alarm.level === 'critical' && alarm.ackedAt === null) scheduleRepeat(entry);
        }
      }
    }
  } catch (err) { safeLog(`Telegram: ${err?.message ?? err}`); }

  return {
    // The phone-alarm settings were saved: the repeats start, stop or move to the new interval.
    settingsChanged() {
      try {
        for (const entry of [...sent.values()]) {
          if (entry.alarm.level !== 'critical') continue;
          const fresh = db.getAlarm(entry.alarm.id);
          if (!fresh || fresh.clearedAt !== null) { stopRepeat(entry.alarm.id); continue; }
          entry.alarm = fresh;
          if (fresh.ackedAt !== null) continue;
          scheduleRepeat(entry);
        }
      } catch (err) { safeLog(`Telegram: ${err?.message ?? err}`); }
    },
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
      return r.ok ? { ok: true } : { error: r.error };
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
