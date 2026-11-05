// Low-stock and use-by messages (spec 2026-11-05-inventory-design.md 6): one Telegram message when an item first falls to
// its reorder level (again only after it was back over it), one per purchase when its use-by comes within 7 days or has
// passed. To the alarms' chat with telegram.js's transport (that file is not changed); the token never reaches a log line.
// Checked after every write, on Batches' events, at start and hourly (server/inventory-api.js). Never throws.

import { fetchTransport } from './telegram.js';
import { readTelegram, readInventoryTelegram } from './settings.js';
import { itemView } from './inventory-math.js';
import { localDate } from './task-rules.js';
import { qtyText, dayText } from '../web/inventory-math.js';

export const CHECK_MS = 3_600_000;
const DOT = ' · ';

export const lowText = (v) => `📦 Low stock${DOT}${v.name}${DOT}${qtyText(v.qty, v.unit)} left (reorder at ${qtyText(v.reorderAt, v.unit)})`;
export const useByText = (v, lot) => `📦 ${lot.state === 'expired' ? 'Expired' : 'Use by'} ${dayText(lot.useBy)}${DOT}${v.name}${DOT}`
  + `${qtyText(lot.left, v.unit)} left from the purchase of ${dayText(localDate(lot.at))}`;

// The token out of a text (Telegram's errors may echo the URL).
const mask = (text, token) => (token ? String(text).split(token).join('***') : String(text)).replace(/bot[0-9]{3,20}:[A-Za-z0-9_-]{10,}/g, 'bot***');

// telegram() → { telegramToken, telegramChatId }; enabled() → the inventoryTelegram setting. setTimer/clearTimer: an
// interval (unref'd: it never keeps the process alive).
export function createInventoryAlerts({
  db, now = Date.now, transport = fetchTransport, telegram = () => readTelegram(db), enabled = () => readInventoryTelegram(db),
  setTimer = (fn, ms) => { const t = setInterval(fn, ms); t.unref?.(); return t; }, clearTimer = clearInterval, log = console.error,
}) {
  let stopped = false;
  let running = null;
  let again = false;
  let timer = null;
  const safeLog = (text, token) => { try { log(mask(text, token)); } catch { /* logging must not throw */ } };

  async function send(text, s) {
    try {
      const r = await transport({ token: s.telegramToken, chatId: s.telegramChatId, text });
      if (r?.ok) return true;
      safeLog(`Inventory message not sent: ${r?.description ?? 'no reason given'}`, s.telegramToken);
    } catch (err) {
      safeLog(`Inventory message not sent: ${err?.message ?? err}`, s.telegramToken);
    }
    return false;
  }

  async function once() {
    const s = telegram();
    const on = enabled() && Boolean(s.telegramToken && s.telegramChatId);
    const by = new Map();
    for (const m of db.stockMoves()) {
      if (!by.has(m.itemId)) by.set(m.itemId, []);
      by.get(m.itemId).push(m);
    }
    for (const item of db.stockItems()) {
      if (stopped) return;
      if (item.archived) continue;
      const moves = by.get(item.id) ?? [];
      const v = itemView(item, moves, now());
      if (!v.low) {
        if (item.lowSentAt !== null) db.setStockLowSent(item.id, null);
      } else if (item.lowSentAt === null && on && await send(lowText(v), s)) {
        if (stopped) return;
        db.setStockLowSent(item.id, now());
      }
      for (const lot of v.lots) {
        if (!on || !lot.state || lot.refKind !== 'purchase') continue;
        if (moves.find((m) => m.id === lot.moveId)?.useBySentAt !== null) continue;
        if (await send(useByText(v, lot), s)) {
          if (stopped) return;
          db.setStockUseBySent(lot.moveId, now());
        }
      }
    }
  }

  // One check at a time; a check asked for while one runs makes it run once more. → a promise kept when done.
  function check() {
    if (stopped) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await once();
      } while (again && !stopped);
    })().catch((err) => safeLog(`Inventory messages: ${err?.message ?? err}`)).finally(() => { running = null; });
    return running;
  }

  return {
    check,
    start() {
      if (stopped || timer !== null) return;
      timer = setTimer(() => { check(); }, CHECK_MS);
      check();
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
