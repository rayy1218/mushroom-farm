// The Overview page, #/overview: "is the farm OK?" at a glance. One status line, the newest alarms, the outdoor air and the
// farm's energy, and a card per room with its state, its readings against their bands and their last 24 hours.
// Refreshes every reading interval while shown (like the room page).

import { request, OFFLINE } from './api.js';
import { refreshMs } from './settings-math.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { loadOverview } from './overview-data.js';
import { farmStatus, phoneAlarms, settleRooms, roomCard, roomReadings, alarmTimeText, grouped, SPARK_W, SPARK_H } from './overview-math.js';
import { nowText, isDimmed } from './alarms-math.js';
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
    <div class="page-actions ov-actions"><button type="button" data-add>Add room</button></div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry hidden>Retry</button>
  </div>
  <p class="muted" data-loading>Loading…</p>
  <div data-body hidden>
    <p class="ov-stale" data-stale-note hidden></p>
    <section class="card ov-status" data-status>
      <p class="ov-status-text" data-status-text aria-live="polite"><span class="ov-status-dot"></span><span data-status-words></span></p>
      <ul class="ov-facts" data-facts></ul>
      <p class="ov-phone" data-phone hidden></p>
    </section>
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

// A sparkline with the band shaded over `span` ('last 24 hours', 'since 17:08'); a note when there is too little data. A gap
// in the readings is a dashed join. Its strokes keep their width when the Outdoor card stretches it to the card's width, so the
// last point is a round cap on a zero-length line, not a circle that would stretch.
function sparkline(value, span = 'last 24 hours') {
  if (!value.spark) return node('span', 'ov-spark-none', 'no data');
  const s = value.spark;
  const el = svg('svg', { width: SPARK_W, height: SPARK_H, viewBox: `0 0 ${SPARK_W} ${SPARK_H}`, preserveAspectRatio: 'none', role: 'img', class: 'ov-spark' });
  const d = value.key === 'co2' ? 0 : 1; // ppm in whole numbers, as shown
  el.setAttribute('aria-label', `${value.label}, ${span}: ${grouped(s.min, d)} to ${grouped(s.max, d)}${s.joins.length ? ', with gaps in the readings' : ''}`);
  if (s.band) el.append(svg('rect', { x: 0, y: s.band.y, width: SPARK_W, height: s.band.h, style: 'fill:var(--band)' }));
  for (const j of s.joins) el.append(svg('line', { x1: j.x1, y1: j.y1, x2: j.x2, y2: j.y2, class: 'ov-spark-gap', 'vector-effect': 'non-scaling-stroke' }));
  el.append(svg('path', { d: s.d, fill: 'none', 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', style: `stroke:${value.color}` }));
  el.append(svg('path', { d: `M${s.last.x} ${s.last.y} h0`, 'stroke-width': 5, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', style: `stroke:${value.color}` }));
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
    statusDot: q('.ov-status-dot'),
    statusWords: q('[data-status-words]'),
    facts: q('[data-facts]'),
    phone: q('[data-phone]'),
    alarms: q('[data-alarms]'),
    alarmList: q('[data-alarm-list]'),
    empty: q('[data-empty]'),
    rooms: q('[data-rooms]'),
    staleNote: q('[data-stale-note]'),
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
  let okAt = null; // when the rooms last loaded
  let roomOrder = []; // the room cards' ids in order, for the energy table
  let phone = null; // the phone-alarm line (phoneAlarms), null when alarms reach a phone
  let readings = new Map(); // room id → its values now (roomReadings), for the "now" beside an alarm
  let held = new Map(); // room id → when each reading's state began and what is shown (settleRooms), so normal cycling does not flap
  let said = null; // the status line last written to its polite live region

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
    if (settings) phone = phoneAlarms(settings); // a failed read keeps the last line
    refresh = refreshMs(settings);
    const { overview, alarms, failed } = result;
    if (failed.overview || failed.alarms) showBanner(OFFLINE, true);
    else if (holdBanner) holdBanner = false;
    else els.banner.hidden = true;
    // Offline: the last readings stay, greyed, with their time; their OK and In band are not claimed as now (critique 2026-10-28).
    if (overview) okAt = Date.now();
    const stale = Boolean(failed.overview) && shown;
    for (const host of [els.status, els.rooms]) host.toggleAttribute('data-stale', stale);
    els.staleNote.hidden = !stale;
    if (stale) readings = new Map(); // no "now" beside the alarms from readings that are not now
    if (stale) els.staleNote.textContent = `These are the readings from ${alarmTimeText(okAt)}; the farm server can't be reached.`;
    // A part that failed keeps what is on screen.
    if (overview) {
      renderRooms(overview.rooms);
      shown = true;
    }
    renderFarm(); // after the rooms: its table follows their order
    if (overview || !failed.alarms) renderAlarms(alarms);
    els.loading.hidden = true;
    els.body.hidden = !shown && alarms.length === 0;
    timer = setTimeout(load, fallbackMs(refresh, live.connected()));
  }

  function renderRooms(list) {
    const now = Date.now();
    const settled = settleRooms(held, list, now);
    held = settled.memory;
    const rooms = settled.rooms; // the server's order (by name): a card never moves when its state changes (critique 2026-10-29)
    const st = farmStatus(rooms);
    els.status.hidden = !st;
    if (st) {
      els.statusDot.dataset.tone = st.tone;
      if (said !== st.text) { // the polite live region speaks only when the line's words change, not on every refresh
        said = st.text;
        els.statusWords.textContent = st.text;
      }
      els.facts.replaceChildren(...st.facts.map((f) => node('li', '', f)));
      els.phone.hidden = !phone;
      if (phone) { // alarms that reach nobody are a farm problem, so it is said where everyone looks first
        els.phone.dataset.tone = phone.tone;
        const link = node('a', '', phone.link);
        link.href = phone.href;
        els.phone.replaceChildren(node('span', '', `${phone.text}. `), link);
      }
    }
    els.empty.hidden = rooms.length > 0;
    roomOrder = rooms.map((r) => r.id);
    readings = new Map(rooms.map((r) => [r.id, roomReadings(r)]));
    els.rooms.replaceChildren(...rooms.map((room) => {
      const c = roomCard(room, now);
      const card = node('section', 'card ov-room');
      const head = node('div', 'ov-room-head');
      const name = node('h2');
      const link = node('a', 'ov-room-link', c.name); // stretched over the card: the whole card opens the room
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
        row.append(text, sparkline(v, c.traces));
        card.append(row);
      }
      // traces shorter than the section's 24 h say since when
      card.append(node('p', 'ov-room-foot', `${c.auto} · ${c.exchange}${c.traces === 'last 24 hours' ? '' : ` · Traces ${c.traces}`}`));
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
    const rank = (id) => { const i = roomOrder.indexOf(id); return i < 0 ? Infinity : i; };
    const lines = roomLines(u).map((l, i) => [l, i]).sort((a, b) => rank(a[0].id) - rank(b[0].id) || a[1] - b[1]).map(([l]) => l); // the cards' order
    if (lines.length) {
      const list = node('ul', 'us-rooms');
      const head = node('li', 'us-room us-room-head');
      head.append(node('span', '', 'Room'), node('span', '', 'Today'), node('span', '', '30 days'));
      list.append(head);
      for (const l of lines) {
        const li = node('li', 'us-room');
        const a = node('a', '', l.name);
        a.href = l.href;
        // on a phone the 30 days wrap under Today, so they carry their own label there
        const last30 = node('span', '');
        last30.append(node('span', 'us-short', '30 d '), l.last30);
        li.append(a, node('span', '', l.today), last30);
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
      if (isDimmed(a)) li.classList.add('acked'); // quieter, and the word says why (not the colour alone)
      const room = node('a', 'ov-alarm-room', a.roomName);
      room.href = `#/rooms/${a.roomId}`;
      const raised = alarmTimeText(a.raisedAt, now);
      const when = node('span', 'ov-alarm-time', a.clearedAt !== null ? `${raised} · Cleared ${alarmTimeText(a.clearedAt, now)}`
        : isDimmed(a) ? `${raised} · Acknowledged` : raised);
      // the text keeps the value that raised the alarm; the value now goes beside it
      const text = node('span', 'ov-alarm-text', a.text);
      const valueNow = nowText(a, readings.get(a.roomId));
      if (valueNow) text.append(node('span', 'ov-alarm-now', ` · ${valueNow}`));
      li.append(levelChip(a.level), room, text, when);
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
    held.clear();
    reload.cancel();
    for (const off of offLive) off();
    clearTimeout(timer);
    closeRoomDialog();
    container.replaceChildren();
  };
}
