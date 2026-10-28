// The Overview page, #/overview: "is the farm OK?" at a glance. One status line, the newest alarms, the outdoor air and the
// farm's energy, and a card per room with its state, its readings against their bands and their last 24 hours.
// Refreshes every reading interval while shown (like the room page).

import { request, OFFLINE } from './api.js';
import { refreshMs } from './settings-math.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { loadOverview } from './overview-data.js';
import { farmStatus, phoneAlarms, sortRooms, roomCard, alarmTimeText, SPARK_W, SPARK_H } from './overview-math.js';
import { outdoorCard } from './outdoor-math.js';
import { roomLines, USAGE_DAYS, USAGE_REFRESH_MS } from './usage-math.js';
import { usageTileNodes } from './usage.js';
import { openRoomDialog, closeRoomDialog } from './room-dialog.js';
import { roomHash } from './route.js';

export const ALARMS_CHANGED = 'farm:alarms-changed';
const NS = 'http://www.w3.org/2000/svg';
const LEVEL_WORDS = { critical: 'Critical', serious: 'Serious', warning: 'Warning' };

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Overview</h1>
      <p class="page-sub">Is the farm OK? All rooms at a glance.</p>
    </div>
    <div class="page-actions"><button type="button" data-add>Add room</button></div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry hidden>Retry</button>
  </div>
  <p class="muted" data-loading>Loading…</p>
  <div data-body hidden>
    <section class="card ov-status" data-status aria-live="polite"></section>
    <section class="card ov-alarms" data-alarms hidden>
      <h2>Alarms</h2>
      <ul class="ov-alarm-list" data-alarm-list></ul>
    </section>
    <div class="empty" data-empty hidden>
      <p>No rooms yet. Add room above to make the first one.</p>
    </div>
    <div class="ov-section-head">
      <h2>Rooms</h2>
      <span class="card-note">Traces: the last 24 hours</span>
    </div>
    <div class="ov-rooms" data-rooms></div>
    <div class="ov-farm" data-farm></div>
  </div>`;

let mountSeq = 0; // every mount gets a token; a reply that finds the token changed is dropped

function node(tag, className, content) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (content !== undefined) n.textContent = content;
  return n;
}

function svg(name, attrs = {}) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// One level chip: the word as well as the colour.
function levelChip(level, text = LEVEL_WORDS[level] ?? level) {
  const chip = node('span', 'ov-chip', text);
  chip.dataset.level = level;
  return chip;
}

// A state pill (the room page's): the word, its tone as colour.
function pill(text, tone) {
  const p = node('span', 'pill', text);
  p.dataset.tone = tone === 'critical' || tone === 'serious' ? 'warn' : tone === 'warning' ? 'amber' : tone;
  return p;
}

// A 24 h sparkline with the band shaded; null when there is too little data.
function sparkline(value) {
  if (!value.spark) return node('span', 'ov-spark-none', 'no data');
  const s = value.spark;
  const el = svg('svg', { width: SPARK_W, height: SPARK_H, viewBox: `0 0 ${SPARK_W} ${SPARK_H}`, role: 'img', class: 'ov-spark' });
  const d = value.key === 'co2' ? 0 : 1; // ppm in whole numbers, as shown
  el.setAttribute('aria-label', `${value.label}, last 24 hours: ${s.min.toFixed(d)} to ${s.max.toFixed(d)}`);
  if (s.band) el.append(svg('rect', { x: 0, y: s.band.y, width: SPARK_W, height: s.band.h, style: 'fill:var(--band)' }));
  el.append(svg('path', { d: s.d, fill: 'none', 'stroke-width': 1.5, 'stroke-linejoin': 'round', style: `stroke:${value.color}` }));
  el.append(svg('circle', { cx: s.last.x, cy: s.last.y, r: 2.5, style: `fill:${value.color}` }));
  return el;
}

export function mount(container) {
  const me = ++mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    banner: q('.banner'),
    bannerText: q('[data-banner-text]'),
    retry: q('[data-retry]'),
    loading: q('[data-loading]'),
    body: q('[data-body]'),
    status: q('[data-status]'),
    alarms: q('[data-alarms]'),
    alarmList: q('[data-alarm-list]'),
    empty: q('[data-empty]'),
    rooms: q('[data-rooms]'),
    farm: q('[data-farm]'),
  };
  const alive = () => me === mountSeq;

  let timer = null;
  let loadSeq = 0;
  let refresh = refreshMs(null);
  let shown = false;
  let holdBanner = false; // the next load keeps the banner (it shows why an Acknowledge failed)
  let usageAt = 0; // when the farm usage was last read: it is asked at most once a minute
  let outdoor = null; // the last good GET /api/outdoor (null: none yet, or an older server)
  let usage = null; // the last good GET /api/usage
  let phone = null; // the phone-alarm line (phoneAlarms), null when alarms reach a phone

  function showBanner(text, retry = false) {
    if (!els.banner.hidden && els.bannerText.textContent === text) return; // do not re-announce the same alert
    els.bannerText.textContent = text;
    els.retry.hidden = !retry;
    els.banner.hidden = false;
  }

  async function load() {
    clearTimeout(timer);
    const seq = ++loadSeq;
    const wantUsage = Date.now() - usageAt >= USAGE_REFRESH_MS;
    const [result, settings, outdoorData, usageData] = await Promise.all([
      loadOverview(),
      request('GET', '/api/settings').catch(() => null),
      request('GET', '/api/outdoor').catch(() => null), // optional: an older server has no outdoor sensor
      wantUsage ? request('GET', `/api/usage?days=${USAGE_DAYS}`).catch(() => null) : null,
    ]);
    if (!alive() || seq !== loadSeq) return;
    if (outdoorData) outdoor = outdoorData; // a failed read keeps the last card
    if (wantUsage) usageAt = Date.now(); // a failed read is tried again in a minute
    if (usageData) usage = usageData;
    renderFarm();
    if (settings) phone = phoneAlarms(settings); // a failed read keeps the last line
    refresh = refreshMs(settings);
    const { overview, alarms, failed } = result;
    if (failed.overview || failed.alarms) showBanner(OFFLINE, true);
    else if (holdBanner) holdBanner = false;
    else els.banner.hidden = true;
    // A part that failed keeps what is on screen.
    if (overview) {
      renderRooms(overview.rooms);
      shown = true;
    }
    if (overview || !failed.alarms) renderAlarms(alarms);
    els.loading.hidden = true;
    els.body.hidden = !shown && alarms.length === 0;
    timer = setTimeout(load, fallbackMs(refresh, live.connected()));
  }

  function renderRooms(rooms) {
    const st = farmStatus(rooms);
    els.status.hidden = !st;
    if (st) {
      const head = node('p', 'ov-status-text');
      const dot = node('span', 'ov-status-dot');
      dot.dataset.tone = st.tone;
      head.append(dot, node('span', '', st.text));
      const facts = node('ul', 'ov-facts');
      facts.append(...st.facts.map((f) => node('li', '', f)));
      els.status.replaceChildren(head, facts);
      if (phone) { // alarms that reach nobody are a farm problem, so it is said where everyone looks first
        const p = node('p', 'ov-phone');
        p.dataset.tone = phone.tone;
        const link = node('a', '', phone.link);
        link.href = phone.href;
        p.append(node('span', '', `${phone.text}. `), link);
        els.status.append(p);
      }
    }
    els.empty.hidden = rooms.length > 0;
    const now = Date.now();
    els.rooms.replaceChildren(...sortRooms(rooms).map((room) => {
      const c = roomCard(room, now);
      const card = node('section', 'card ov-room');
      const head = node('div', 'ov-room-head');
      const name = node('h2');
      const link = node('a', '', c.name);
      link.href = c.href;
      name.append(link);
      head.append(name, pill(c.state.text, c.state.tone));
      card.append(head);
      if (c.unwired) { // nothing wired yet: one line and the way to wire it
        card.classList.add('ov-room-bare');
        const line = node('p', 'ov-bare', 'No sensors or machines wired yet. ');
        const setup = node('a', '', 'Set up the room');
        setup.href = c.setupHref;
        line.append(setup);
        card.append(line);
        return card;
      }
      for (const v of c.values) {
        const row = node('div', 'ov-value');
        const text = node('div', 'ov-value-text');
        const label = node('span', 'ov-value-label', v.label);
        if (v.chip) { const chip = node('span', 'ov-band', v.chip.text); chip.dataset.tone = v.chip.tone; label.append(chip); }
        text.append(label, node('span', 'ov-value-now', v.text));
        row.append(text, sparkline(v));
        card.append(row);
      }
      card.append(node('p', 'ov-room-foot', `${c.auto} · ${c.exchange}`));
      return card;
    }));
  }

  // The farm cards: Outdoor first, then Energy and water. A card shows once its data has come.
  function renderFarm() {
    const cards = [];
    const o = outdoorCard(outdoor);
    if (o) cards.push(outdoorNode(o));
    if (usage) cards.push(energyNode(usage));
    els.farm.replaceChildren(...cards);
    els.farm.hidden = cards.length === 0;
  }

  function outdoorNode(o) {
    const card = node('section', 'card ov-outdoor');
    const head = node('div', 'ov-room-head');
    head.append(node('h2', '', 'Outdoor'));
    card.append(head);
    if (!o.set) {
      const p = node('p', 'muted', 'No outdoor sensor: ');
      const link = node('a', '', 'set one on Settings');
      link.href = '#/settings';
      p.append(link);
      card.append(p);
      return card;
    }
    const status = node('span', 'status', o.statusText);
    status.dataset.status = o.status;
    head.append(status);
    if (o.fault) card.append(levelChip(o.fault.level, o.fault.text));
    for (const v of o.values) {
      const row = node('div', 'ov-value');
      const text = node('div', 'ov-value-text');
      text.append(node('span', 'ov-value-label', v.label), node('span', 'ov-value-now', v.text));
      row.append(text);
      if (v.key !== 'dew') row.append(sparkline({ ...v, label: `Outdoor ${v.label.toLowerCase()}` }));
      card.append(row);
    }
    return card;
  }

  function energyNode(u) {
    const card = node('section', 'card ov-energy');
    card.append(node('h2', '', 'Energy and water'));
    const tilesRow = node('div', 'us-tiles');
    tilesRow.append(...usageTileNodes(u, false));
    card.append(tilesRow);
    const lines = roomLines(u);
    if (lines.length) {
      const list = node('ul', 'us-rooms');
      const head = node('li', 'us-room us-room-head');
      head.append(node('span', '', 'Room'), node('span', '', 'Today'), node('span', '', '30 days'));
      list.append(head);
      for (const l of lines) {
        const li = node('li', 'us-room');
        const a = node('a', '', l.name);
        a.href = l.href;
        li.append(a, node('span', '', l.today), node('span', '', l.last30));
        list.append(li);
      }
      card.append(list);
    }
    return card;
  }

  function renderAlarms(alarms) {
    els.alarms.hidden = alarms.length === 0;
    const now = Date.now();
    els.alarmList.replaceChildren(...alarms.map((a) => {
      const li = node('li', 'ov-alarm');
      if (a.ackedAt !== null) li.classList.add('acked');
      const room = node('a', 'ov-alarm-room', a.roomName);
      room.href = `#/rooms/${a.roomId}`;
      const when = node('span', 'ov-alarm-time', a.clearedAt === null ? alarmTimeText(a.raisedAt, now) : `${alarmTimeText(a.raisedAt, now)} · Cleared ${alarmTimeText(a.clearedAt, now)}`);
      li.append(levelChip(a.level), room, node('span', 'ov-alarm-text', a.text), when);
      if (a.ackedAt === null) {
        const ack = node('button', '', 'Acknowledge');
        ack.type = 'button';
        ack.dataset.ack = a.id;
        li.append(ack);
      }
      return li;
    }));
  }

  els.alarmList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-ack]');
    if (!button) return;
    button.disabled = true;
    try {
      await request('POST', `/api/alarms/${button.dataset.ack}/ack`);
      window.dispatchEvent(new Event(ALARMS_CHANGED)); // the nav badge counts again at once
    } catch (err) {
      if (!alive()) return;
      button.disabled = false;
      showBanner(err.status === 404 ? 'That alarm no longer exists' : OFFLINE, true);
      holdBanner = true;
    }
    if (alive()) load();
  });
  els.retry.addEventListener('click', load);
  // Add room: its name and size, then the new room opens on its Setup tab to wire its sensors and machines.
  q('[data-add]').addEventListener('click', () => {
    openRoomDialog({ onSaved: (room) => { location.hash = roomHash(room.id, 'setup'); } });
  });

  // Live updates: a room, an alarm or the outdoor probe changing asks again (a minute's timer is the fallback while the stream is up).
  const reload = createThrottle(() => { if (alive()) load(); }); // at most one load in 2 s
  const offLive = [
    ...['room', 'alarms', 'outdoor'].map((type) => live.on(type, () => reload.call())),
    live.onStatus((up) => { if (up) reload.call(); else { clearTimeout(timer); timer = setTimeout(load, refresh); } }),
  ];

  document.title = 'Overview · Mushroom farm';
  load();

  return function unmount() {
    mountSeq++;
    reload.cancel();
    for (const off of offLive) off();
    clearTimeout(timer);
    closeRoomDialog();
    container.replaceChildren();
  };
}
