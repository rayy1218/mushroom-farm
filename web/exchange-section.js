// The "Air exchange" section of the Charts tab (spec 2026-10-26-usage-charts-design.md section 4): how many exchanges started
// and how many minutes the fans ran, per hour over the last 24 h (Hourly, the default) or per day over the last 30 days
// (Daily), with its own switch apart from the tab's range buttons. Its data is the intake's machine log of the history reply
// of 24 h or 30 d, asked here and again every minute. Shown only when the room has a relay module.

import { request, OFFLINE } from './api.js';
import { drawTimeBars } from './bar-chart.js';
import { timeTicks, tickCountFor } from './history-math.js';
import { HISTORY_REFRESH_MS } from './history.js';
import { ACTIVITY_MODES, activityRange, exchangeActivity, activityTotals, activityTotalsText, activityTip } from './exchange-math.js';

const COLOR = 'var(--ink-2)'; // the machine timeline's

function text(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// host: the section element. Returns { update(room), destroy() }.
export function createExchangeSection(host, { roomId }) {
  let mode = ACTIVITY_MODES[0];
  let reply = null; // the history reply of the mode
  let failed = false;
  let shown = false;
  let timer = null;
  let seq = 0;

  host.replaceChildren();
  host.hidden = true;
  const head = text('div', 'exchange-head');
  head.append(text('h2', '', 'Air exchange'));
  const bar = text('div', 'range-bar');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Air exchange period');
  const buttons = ACTIVITY_MODES.map((m) => {
    const b = text('button', '', m.label);
    b.type = 'button';
    b.dataset.mode = m.key;
    b.setAttribute('aria-pressed', String(m === mode));
    b.addEventListener('click', () => pick(m));
    bar.append(b);
    return b;
  });
  head.append(bar);
  const totals = text('p', 'usage-totals');
  const none = text('p', 'none', 'Loading…');
  host.append(head, totals, none);
  const part = (title) => {
    const box = text('div', 'usage-chart');
    const chartHost = text('div', 'chart-host');
    box.append(text('h3', '', title), chartHost);
    host.append(box);
    return { box, host: chartHost, chart: null };
  };
  const startsPart = part('Exchanges started');
  const minutesPart = part('Minutes the fans ran');

  function paint() {
    const rows = reply?.machines?.intake;
    const ok = reply && Array.isArray(rows);
    none.hidden = ok;
    none.textContent = failed ? OFFLINE : 'Loading…';
    totals.hidden = !ok;
    startsPart.box.hidden = !ok;
    minutesPart.box.hidden = !ok;
    if (!ok) return;
    const range = activityRange(reply.to, mode.key);
    const buckets = exchangeActivity(rows, range.from, range.to, range.step);
    totals.textContent = activityTotalsText(activityTotals(rows, range.from, range.to), mode.key);
    const per = mode.key === 'daily' ? 'per day, last 30 days' : 'per hour, last 24 h';
    const ticksFor = (w) => timeTicks(range.from, range.to, tickCountFor(w));
    for (const [p, field, title] of [[startsPart, 'starts', 'Exchanges started'], [minutesPart, 'minutes', 'Minutes the fans ran']]) {
      const bars = buckets.map((b) => ({ from: b.at, to: b.end, v: b[field] }));
      const total = field === 'starts' ? `${bars.reduce((s, b) => s + b.v, 0)} in all` : `${Math.round(bars.reduce((s, b) => s + b.v, 0))} min in all`;
      const opts = {
        bars, range, ticksFor, color: COLOR, hatch: false, share: 0.6, whole: field === 'starts', label: `${title} ${per}: ${total}`,
        tip: (b) => activityTip(buckets[bars.indexOf(b)], mode.key, field, reply.to),
      };
      if (p.chart) p.chart.update(opts);
      else p.chart = drawTimeBars(p.host, opts);
    }
  }

  async function load() {
    clearTimeout(timer);
    if (!shown) return;
    const mine = ++seq;
    const asked = mode;
    try {
      const data = await request('GET', `/api/rooms/${roomId}/history?hours=${mode.hours}`);
      if (mine !== seq || asked !== mode) return;
      reply = data;
      failed = false;
    } catch {
      if (mine !== seq) return;
      failed = true; // the last data stays on screen
    }
    paint();
    timer = setTimeout(load, HISTORY_REFRESH_MS);
  }

  function pick(m) {
    if (m === mode) return;
    mode = m;
    reply = null;
    failed = false;
    seq++;
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.mode === m.key));
    paint();
    load();
  }

  return {
    // The room as the page has it: the section shows and loads while it has a relay module.
    update(room) {
      const wired = room?.relayAddress != null;
      host.hidden = !wired;
      if (wired === shown) return;
      shown = wired;
      if (shown) load();
      else {
        seq++;
        clearTimeout(timer);
      }
    },
    destroy() {
      seq++;
      clearTimeout(timer);
      startsPart.chart?.destroy();
      minutesPart.chart?.destroy();
      host.replaceChildren();
    },
  };
}
