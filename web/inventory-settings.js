// The "Inventory" card of the Settings page (spec 2026-11-05-inventory-design.md 5): one switch, the low-stock and use-by
// messages to the Telegram chat set above, saved as soon as it changes. While Telegram is not set up the note says nothing is
// sent yet (the switch still saves: it takes effect once Telegram is set up, read when Settings opens).

import { request, OFFLINE } from './api.js';

const NOTE = 'Uses the Telegram chat set above. One message when an item first falls to its reorder level, and one per purchase 7 days before its use-by.';

export function mountInventorySettings(container) {
  let alive = true;
  let sending = null; // the value on its way to the server, or null
  container.innerHTML = `
  <div class="banner" role="alert" data-ivs-banner hidden>
    <span data-ivs-banner-text></span>
    <button type="button" data-ivs-retry>Retry</button>
  </div>
  <section class="card settings iv-settings" id="inventory" aria-labelledby="iv-settings-title" data-ivs-card hidden>
    <h2 id="iv-settings-title">Inventory</h2>
    <label class="tg-check"><input type="checkbox" name="inventoryTelegram" data-ivs-telegram> Send low-stock and use-by messages to Telegram</label>
    <p class="muted s-hint" data-ivs-note></p>
    <p class="s-saved" data-ivs-saved role="status" hidden></p>
  </section>`;
  const q = (sel) => container.querySelector(sel);
  const card = q('[data-ivs-card]');
  const box = q('[data-ivs-telegram]');
  const note = q('[data-ivs-note]');
  const saved = q('[data-ivs-saved]');
  const banner = q('[data-ivs-banner]');
  const bannerText = q('[data-ivs-banner-text]');

  function paint(s) {
    const ready = Boolean(s.telegramTokenSet && s.telegramChatId);
    box.checked = s.inventoryTelegram !== false;
    note.textContent = ready ? NOTE : `${NOTE} Nothing is sent until Telegram is set up above.`;
    card.hidden = false;
  }

  async function load() {
    banner.hidden = true;
    try {
      const s = await request('GET', '/api/settings');
      if (alive) paint(s);
    } catch (err) {
      if (!alive) return;
      bannerText.textContent = `Inventory: ${err.status === 0 ? OFFLINE : err.message}`;
      banner.hidden = false;
    }
  }

  box.addEventListener('change', async () => {
    if (sending !== null) {
      box.checked = sending; // a change while one is on its way is ignored
      return;
    }
    saved.hidden = true;
    const want = box.checked;
    sending = want;
    try {
      const s = await request('PUT', '/api/settings', { inventoryTelegram: want });
      if (!alive) return;
      paint(s);
      saved.textContent = want ? 'Stock messages on.' : 'Stock messages off.';
      saved.hidden = false;
    } catch (err) {
      if (!alive) return;
      box.checked = !want;
      bannerText.textContent = `Inventory: ${err.status === 0 ? OFFLINE : err.message}`;
      banner.hidden = false;
    } finally {
      sending = null;
    }
  });
  q('[data-ivs-retry]').addEventListener('click', () => load());
  load();

  return () => {
    alive = false;
  };
}
