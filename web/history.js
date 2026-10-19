// The range choice over a room's charts (Live, 1 h … 30 d) and the loading of /api/rooms/:id/history.
// Live is the last 50 polls the page already has; the other ranges are fetched here and refreshed every 60 s.

import { request } from './api.js';
import { RANGES, rangeOf } from './history-math.js';

export const HISTORY_REFRESH_MS = 60_000;

// host: the element for the buttons. onChange() is called when the range changes or new data arrived.
// Returns { current() → { range, data, failed } | null (null while Live), destroy() }.
export function createHistory(host, { roomId, onChange }) {
  let range = RANGES[0];
  let data = null;
  let failed = false;
  let timer = null;
  let seq = 0;

  host.className = 'range-bar';
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Chart range');
  const buttons = new Map();
  for (const r of RANGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r.label;
    b.dataset.range = r.key;
    b.setAttribute('aria-pressed', String(r === range));
    b.addEventListener('click', () => pick(r.key));
    buttons.set(r.key, b);
    host.append(b);
  }

  async function load() {
    clearTimeout(timer);
    if (range.hours === null) return;
    const mine = ++seq;
    const asked = range;
    try {
      const reply = await request('GET', `/api/rooms/${roomId}/history?hours=${asked.hours}`);
      if (mine !== seq) return;
      data = reply;
      failed = false;
    } catch {
      if (mine !== seq) return;
      failed = true; // the last data stays on screen
    }
    onChange();
    timer = setTimeout(load, HISTORY_REFRESH_MS);
  }

  function pick(key) {
    const next = rangeOf(key);
    if (next === range) return;
    range = next;
    data = null;
    failed = false;
    seq++;
    for (const [k, b] of buttons) b.setAttribute('aria-pressed', String(k === next.key));
    onChange();
    load();
  }

  return {
    current: () => (range.hours === null ? null : { range, data, failed }),
    destroy() {
      seq++;
      clearTimeout(timer);
      host.replaceChildren();
    },
  };
}
