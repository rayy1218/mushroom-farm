// Room detail page: the room, its two sensors (status, latest values), its machines and three charts of the last 50 polls.
// Refreshes every reading interval (2–30 s; 5 s when the settings cannot be read) while shown.

import { request, OFFLINE } from './api.js';
import { openRoomDialog, closeRoomDialog } from './room-dialog.js';
import { createMachines } from './machines.js';
import { createControl } from './control.js';
import { drawLineChart } from './chart.js';
import { refreshMs } from './settings-math.js';
import { formatClock, formatAgo, chartPoints } from './chart-math.js';

const metres = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const cubic = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const KINDS = {
  trh: { title: 'T/RH probe' },
  co2: { title: 'CO₂ sensor' },
};
const STATUS_WORDS = {
  'not-wired': 'Not wired',
  'no-data': 'No data yet',
  online: 'Online',
  timeout: 'Timeout',
  offline: 'Offline',
};
// Three charts: which sensor, which reading field, how to show it.
const CHARTS = [
  { id: 'chart-t', band: ['tLow', 'tHigh'], kind: 'trh', field: 't', label: 'Temperature', unit: '°C', color: 'var(--s-t)', digits: 1, minSpan: 1 },
  { id: 'chart-rh', band: ['rhLow', 'rhHigh'], kind: 'trh', field: 'rh', label: 'Humidity', unit: '%RH', color: 'var(--s-rh)', digits: 1, minSpan: 5, bounds: [0, 100] },
  { id: 'chart-co2', band: ['co2Low', 'co2High'], kind: 'co2', field: 'co2', label: 'CO₂', unit: 'ppm', color: 'var(--s-co2)', digits: 0, minSpan: 100 },
];

const TEMPLATE = `
  <a class="back" href="#/rooms">← Rooms</a>
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1" data-title>Room</h1>
      <p class="page-sub" data-sub>Loading…</p>
    </div>
    <div class="page-actions" data-actions hidden><button type="button" data-edit>Edit</button></div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry hidden>Retry</button>
  </div>
  <div class="missing" data-missing hidden>
    <p>That room no longer exists</p>
    <a href="#/rooms">Back to the rooms</a>
  </div>
  <div data-body hidden>
    <div class="sensors" data-sensors></div>
    <section data-control hidden></section>
    <section data-machines></section>
    <div class="charts" data-charts></div>
  </div>`;

let mountSeq = 0; // every mount gets a token; a reply that finds the token changed is dropped

function text(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function mount(container, { id }) {
  const me = ++mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    title: q('[data-title]'),
    sub: q('[data-sub]'),
    edit: q('[data-edit]'),
    actions: q('[data-actions]'),
    banner: q('.banner'),
    bannerText: q('[data-banner-text]'),
    retry: q('[data-retry]'),
    missing: q('[data-missing]'),
    body: q('[data-body]'),
    sensors: q('[data-sensors]'),
    controlHost: q('[data-control]'),
    machinesHost: q('[data-machines]'),
    charts: q('[data-charts]'),
  };
  const alive = () => me === mountSeq;

  let room = null;
  let sensors = null; // { trh, co2 }
  let loadSeq = 0;
  let editedFromCard = false; // the dialog was opened from a sensor card button, which re-rendering replaces
  let timer = null;
  let refresh = refreshMs(null);
  let machines = null; // the Machines card, made on the first render
  let control = null; // the Automatic control card, made on the first render
  let ticker = null;
  const chartCards = new Map(); // chart id → { card, host, none, chart }

  // ---- loading ----

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(load, refresh);
  }

  async function load() {
    clearTimeout(timer);
    const seq = ++loadSeq;
    const token = machines?.token();
    const controlToken = control?.token();
    let fetched;
    try {
      fetched = await Promise.all([
        request('GET', `/api/rooms/${id}`),
        request('GET', `/api/rooms/${id}/sensors`),
        // The machines are optional: a failing or missing route must not take the sensors down.
        request('GET', `/api/rooms/${id}/machines`).catch(() => null),
        request('GET', `/api/rooms/${id}/control`).catch(() => null), // optional in the same way
        request('GET', '/api/settings').catch(() => null), // a failure keeps the 5 s refresh
      ]);
    } catch (err) {
      if (!alive() || seq !== loadSeq) return;
      if (err.status === 404) {
        showMissing();
        return; // nothing left to refresh
      }
      // Fill the alert only when it is hidden, so a screen reader does not re-announce it every refresh.
      if (els.banner.hidden) {
        els.bannerText.textContent = OFFLINE;
        els.retry.hidden = false;
        els.banner.hidden = false; // the page keeps the last data
      }
      if (!room) els.sub.textContent = '';
      schedule();
      return;
    }
    if (!alive() || seq !== loadSeq) return;
    const [r, list, machineData, controlData, settingsData] = fetched;
    refresh = refreshMs(settingsData);
    room = r;
    sensors = { trh: list.find((s) => s.kind === 'trh'), co2: list.find((s) => s.kind === 'co2') };
    els.banner.hidden = true;
    els.missing.hidden = true;
    render(machineData, token, controlData, controlToken);
    schedule();
  }

  function showMissing() {
    clearTimeout(timer);
    room = null;
    sensors = null;
    els.title.textContent = 'Room not found';
    els.sub.textContent = '';
    els.edit.hidden = true;
    els.actions.hidden = true;
    els.body.hidden = true;
    els.banner.hidden = true;
    els.missing.hidden = false;
    document.title = 'Rooms · Mushroom farm';
  }

  // ---- drawing ----

  function renderHead() {
    els.title.textContent = room.name;
    els.sub.textContent = `${metres.format(room.length)} × ${metres.format(room.width)} × ${metres.format(room.height)} m · ${cubic.format(room.volume)} m³`;
    els.edit.hidden = false;
    els.actions.hidden = false;
    document.title = `${room.name} · Mushroom farm`;
  }

  function valueLine(kind, last) {
    const line = text('p', 'reading');
    const part = (value, unit, digits) => {
      const span = text('span');
      span.append(text('span', 'val', value == null ? '—' : value.toFixed(digits)), text('span', 'unit', unit));
      return span;
    };
    if (kind === 'trh') line.append(part(last?.t, '°C', 1), part(last?.rh, '%RH', 1));
    else line.append(part(last?.co2, 'ppm', 0));
    return line;
  }

  function sensorCard(kind, s) {
    const card = text('section', 'card');
    card.dataset.kind = kind;
    card.append(text('h2', '', KINDS[kind].title));
    if (s.status === 'not-wired') {
      card.append(text('p', 'addr', 'No sensor address set'));
      const actions = text('div', 'card-actions');
      const edit = text('button', '', 'Edit room');
      edit.type = 'button';
      edit.dataset.action = 'edit';
      actions.append(edit);
      card.append(actions);
      return card;
    }
    card.append(text('p', 'addr', `address ${s.address}`));
    const status = text('span', 'status', STATUS_WORDS[s.status] ?? s.status);
    status.dataset.status = s.status;
    card.append(status);
    if (s.status === 'no-data') {
      card.append(text('p', 'meta', 'Waiting for the first poll'));
      return card;
    }
    card.append(valueLine(kind, s.lastOk));
    if (s.lastOk) {
      const ago = text('p', 'meta');
      ago.dataset.agoAt = s.lastOk.at;
      ago.textContent = formatAgo(Date.now() - s.lastOk.at);
      card.append(ago);
    }
    if (s.status !== 'online') {
      card.append(text('p', 'meta', `Last answer: ${s.lastOk ? formatClock(s.lastOk.at) : 'never'}`));
      card.append(text('p', 'meta warn', `${plural(s.failuresInRow, 'failed poll', 'failed polls')} in a row`));
    }
    return card;
  }

  function renderSensors() {
    // Re-rendering replaces the cards; keep focus on the same button.
    const hadFocus = els.sensors.contains(document.activeElement) ? document.activeElement.closest('[data-kind]')?.dataset.kind : null;
    els.sensors.replaceChildren(sensorCard('trh', sensors.trh), sensorCard('co2', sensors.co2));
    if (hadFocus) els.sensors.querySelector(`[data-kind="${hadFocus}"] button`)?.focus();
    // The focused "Edit room" button may be gone (its sensor is wired now) or the dialog just closed.
    else if (editedFromCard && document.activeElement === document.body && !document.querySelector('dialog[open]')) {
      editedFromCard = false;
      els.edit.focus();
    }
  }

  function buildCharts() {
    for (const def of CHARTS) {
      const card = text('section', 'card chart-card');
      card.append(text('h2', '', `${def.label} (${def.unit})`));
      const none = text('p', 'none', 'No readings yet');
      const host = text('div', 'chart-host');
      card.append(none, host);
      chartCards.set(def.id, { card, host, none, chart: null });
      els.charts.append(card);
    }
  }

  function renderCharts() {
    for (const def of CHARTS) {
      const entry = chartCards.get(def.id);
      const s = sensors[def.kind];
      const points = chartPoints(s, def.field);
      const wired = s.status !== 'not-wired';
      entry.card.hidden = !wired;
      const hasValue = points.some((p) => p.value !== null); // only failed polls: nothing to draw yet
      entry.none.hidden = hasValue;
      entry.host.hidden = !hasValue;
      if (!wired) continue;
      // The band from the room's control settings (shown whether Auto is on or off), once they have loaded.
      const band = bands ? { low: bands[def.band[0]], high: bands[def.band[1]] } : null;
      const opts = { points, unit: def.unit, label: def.label, color: def.color, digits: def.digits, minSpan: def.minSpan, bounds: def.bounds, band };
      if (!entry.chart) entry.chart = drawLineChart(entry.host, opts);
      else entry.chart.update(opts);
    }
  }

  let built = false;
  let bands = null; // the latest control settings, for the band lines on the charts
  function render(machineData, token, controlData, controlToken) {
    renderHead();
    els.body.hidden = false;
    if (!built) {
      makeMachines();
      makeControl();
      buildCharts();
      built = true;
    }
    // The card shows only once a good reply came; later failures keep the last good data.
    // It is updated before the sensor cards so focus handling there sees the final page.
    if (machineData) {
      machines.update(machineData, token ?? machines.token());
      els.machinesHost.hidden = false;
    }
    if (controlData) {
      bands = controlData;
      const painted = control.update(controlData, controlToken ?? control.token());
      els.controlHost.hidden = false;
      if (painted) machines.setAuto(controlData.auto); // a stale refresh must not relock the card
    }
    renderSensors();
    renderCharts();
  }

  function makeMachines() {
    machines = createMachines(els.machinesHost, {
      roomId: id,
      onEdit: () => { editedFromCard = true; edit(); },
      onOffline: () => {
        if (!els.banner.hidden) return; // do not re-announce an alert that is already showing
        els.bannerText.textContent = OFFLINE;
        els.retry.hidden = false;
        els.banner.hidden = false;
      },
      // Not-found on a command may be the room or just the machines route: the room GET decides.
      onGone: () => { if (alive()) load(); },
    });
    els.machinesHost.hidden = true;
  }

  function makeControl() {
    control = createControl(els.controlHost, {
      roomId: id,
      onChange: (data) => machines?.setAuto(data.auto),
      onOffline: () => {
        if (!els.banner.hidden) return;
        els.bannerText.textContent = OFFLINE;
        els.retry.hidden = false;
        els.banner.hidden = false;
      },
      onGone: () => { if (alive()) load(); },
    });
  }

  // "n s ago" counts on between refreshes.
  ticker = setInterval(() => {
    for (const node of els.sensors.querySelectorAll('[data-ago-at]')) {
      node.textContent = formatAgo(Date.now() - Number(node.dataset.agoAt));
    }
  }, 1000);

  // ---- wiring ----

  function edit() {
    if (!room) return;
    els.banner.hidden = true;
    openRoomDialog(room, {
      onSaved: () => { if (alive()) load(); },
      onGone: () => { if (alive()) showMissing(); },
    });
  }

  els.edit.addEventListener('click', edit);
  els.sensors.addEventListener('click', (event) => {
    if (event.target.closest('button[data-action="edit"]')) {
      editedFromCard = true;
      edit();
    }
  });
  els.retry.addEventListener('click', load);

  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    clearInterval(ticker);
    machines?.destroy();
    control?.destroy();
    for (const { chart } of chartCards.values()) chart?.destroy();
    closeRoomDialog();
    document.title = 'Rooms · Mushroom farm';
    container.replaceChildren();
  };
}
