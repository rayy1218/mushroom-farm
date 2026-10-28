// Room detail page (redesign 2026-10-28, brief .impeccable/surfaces/web-room-detail-js.md): the room's name with a switch to
// the other rooms, five tabs under it (the address names the tab: #/rooms/7, #/rooms/7/history, ...) and the tab's panel:
// Now (the readings first, the alarms, Auto | Manual, the crop, the room picture, the machines in air-path order and the
// switches), History (the charts, electricity and water, the machine timeline, the energy and water card), Crop,
// Simulations and Setup (the bands and automatic control, the sensors and the intake filter, the equipment cards, the room's
// name and size and Delete room). The alarms sit in the Now tab's side column, above the panel on the other tabs. Every tab
// is loaded and kept up to date; a tab change only shows and hides panels.
// Refreshes every reading interval (2–30 s; 5 s when the settings cannot be read) while shown.

import { request, OFFLINE } from './api.js';
import { ROOM_TABS, roomHash } from './route.js';
import { createRoomEdit, createDeleteCard, createSaveQueue } from './room-edit.js';
import { createEquipment } from './equipment.js';
import { createMachines } from './machines.js';
import { createControl } from './control.js';
import { createAlarmsCard } from './alarms.js';
import { createCropCard } from './crop-card.js';
import { createSimulationsCard } from './sim-card.js';
import { createFilterCard } from './filter-card.js';
import { intakeRunning } from './filter-math.js';
import { closeSimulateDialog } from './simulate-dialog.js';
import { startLoop } from './mimic.js';
import { fromRoom } from './mimic-math.js';
import { createRoomCard } from './room-card.js';
import { roomCard, filterFrom, freshAirLine, blocksLine, cropFacts, traceOf } from './room-card-math.js';
import { drawLineChart } from './chart.js';
import { refreshMs } from './settings-math.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { chartPoints } from './chart-math.js';
import { createUsageCard } from './usage.js';
import { outdoorLine, pushOutdoorTail, liveOutdoor } from './outdoor-math.js';
// Stream B: long-range charts and the machine timeline
import { createHistory } from './history.js';
import { createUsageSection } from './usage-section.js';
import { createExchangeSection } from './exchange-section.js';
import { drawTimeline } from './timeline.js';
import { timeTicks, tickCountFor, chartDrawKey, historyPoints, timelineSpans, acMarks, formatStamp, wiredTimelineRows } from './history-math.js';

const BAND_KEYS = ['tLow', 'tHigh', 'rhLow', 'rhHigh', 'co2Low', 'co2High', 'co2Safety'];
const metres = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const cubic = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Three charts: which sensor, which reading field, how to show it.
const CHARTS = [
  { id: 'chart-t', outdoor: true, band: ['tLow', 'tHigh'], kind: 'trh', field: 't', label: 'Temperature', unit: '°C', color: 'var(--s-t)', digits: 1, minSpan: 1 },
  { id: 'chart-rh', outdoor: true, band: ['rhLow', 'rhHigh'], kind: 'trh', field: 'rh', label: 'Humidity', unit: '%RH', color: 'var(--s-rh)', digits: 1, minSpan: 5, bounds: [0, 100] },
  { id: 'chart-co2', band: ['co2Low', 'co2High'], kind: 'co2', field: 'co2', label: 'CO₂', unit: 'ppm', color: 'var(--s-co2)', digits: 0, minSpan: 100 },
];

const TEMPLATE = `
  <div class="page-head room-head">
    <div class="page-titles">
      <a class="back" href="#/rooms">Rooms</a>
      <h1 class="page-title" tabindex="-1" data-title>Room</h1>
      <p class="page-sub" data-sub>Loading…</p>
    </div>
    <label class="room-switch" data-switch-box hidden><span>Room</span><select data-switch></select></label>
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
    <nav class="room-tabs" data-tabs aria-label="Room sections"></nav>
    <div class="room-main">
      <section data-alarms hidden></section>
      <div class="now" data-panel="now">
        <div class="now-main">
          <div data-readings></div>
          <section data-picture></section>
          <section data-machines></section>
        </div>
        <div class="now-side" data-now-side>
          <section data-mode hidden></section>
          <section data-machine-list></section>
          <a data-crop-sum></a>
        </div>
      </div>
      <div data-panel="history" hidden>
        <div data-range></div>
        <div class="charts" data-charts></div>
        <section class="card chart-card usage-charts" data-usage-charts></section>
        <section class="card chart-card usage-charts" data-exchange hidden></section>
        <section class="card timeline-card" data-timeline hidden>
          <h2>Machine timeline</h2>
          <div class="chart-host" data-timeline-host></div>
          <p class="legend"><span class="swatch swatch-auto" aria-hidden="true"></span>Automatic <span class="swatch swatch-manual" aria-hidden="true"></span>Manual</p>
        </section>
        <section data-usage></section>
      </div>
      <div data-panel="crop" hidden>
        <section data-crop></section>
      </div>
      <div data-panel="simulations" hidden>
        <section data-simulations></section>
      </div>
      <div class="setup" data-panel="setup" hidden>
        <nav class="setup-nav" aria-label="Setup sections">
          <a href="#setup-control" data-jump>Bands and control</a><a href="#setup-equipment" data-jump>Equipment</a><a href="#setup-filter" data-jump>Intake filter</a><a href="#setup-room" data-jump>Room</a>
        </nav>
        <div class="setup-part" id="setup-control" tabindex="-1">
          <section data-control hidden></section>
        </div>
        <div class="setup-part" id="setup-equipment" tabindex="-1">
          <h2 class="part-title">Equipment</h2>
          <div class="equipment" data-equipment></div>
        </div>
        <div class="setup-part" id="setup-filter" tabindex="-1">
          <h2 class="part-title">Intake filter</h2>
          <section data-filter hidden></section>
        </div>
        <div class="setup-part" id="setup-room" tabindex="-1">
          <h2 class="part-title">Room</h2>
          <form class="room-form" data-profile novalidate></form>
          <section class="card room-delete" data-delete></section>
        </div>
      </div>
    </div>
  </div>`;

let mountSeq = 0; // every mount gets a token; a reply that finds the token changed is dropped

function text(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}


export function mount(container, { id, tab = 'now' }) {
  const me = ++mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);

  let pendingField = null; // a "Set address" button's field, to put the cursor in once the Equipment tab shows
  let equipmentTab = null; // the Equipment tab's cards, made on the first render

  // The tab bar: a link per tab (the router calls setTab when the address changes); the current one marked.
  const tabBar = q('[data-tabs]');
  for (const t of ROOM_TABS) {
    const a = document.createElement('a');
    a.href = roomHash(id, t.key);
    a.dataset.tab = t.key;
    a.append(text('span', '', t.label));
    tabBar.append(a);
  }
  // The alarms: in the Now tab's side column, above the panel on the other tabs.
  const alarmsNode = q('[data-alarms]');
  const nowSide = q('[data-now-side]');
  const main = q('.room-main');
  function setTab(next) {
    tab = next;
    for (const a of tabBar.children) {
      if (a.dataset.tab === tab) {
        a.setAttribute('aria-current', 'page');
        tabBar.scrollLeft = Math.max(0, a.offsetLeft - (tabBar.clientWidth - a.offsetWidth) / 2); // a phone's row: the tab in view
      } else a.removeAttribute('aria-current');
    }
    for (const panel of container.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab;
    if (tab === 'now') { if (alarmsNode.parentNode !== nowSide) nowSide.prepend(alarmsNode); }
    else if (alarmsNode.parentNode !== main) main.prepend(alarmsNode);
    if (tab === 'setup' && pendingField) {
      equipmentTab?.focus(pendingField);
      pendingField = null;
    }
  }
  setTab(tab);
  const els = {
    title: q('[data-title]'),
    sub: q('[data-sub]'),
    banner: q('.banner'),
    bannerText: q('[data-banner-text]'),
    retry: q('[data-retry]'),
    missing: q('[data-missing]'),
    body: q('[data-body]'),
    filterHost: q('[data-filter]'),
    alarmsHost: q('[data-alarms]'),
    readingsHost: q('[data-readings]'),
    pictureHost: q('[data-picture]'),
    machineListHost: q('[data-machine-list]'),
    cropSumHost: q('[data-crop-sum]'),
    modeHost: q('[data-mode]'),
    switchBox: q('[data-switch-box]'),
    switchSelect: q('[data-switch]'),
    cropHost: q('[data-crop]'),
    controlHost: q('[data-control]'),
    machinesHost: q('[data-machines]'),
    charts: q('[data-charts]'),
    rangeHost: q('[data-range]'),
    timeline: q('[data-timeline]'),
    timelineHost: q('[data-timeline-host]'),
    usageCharts: q('[data-usage-charts]'),
    exchange: q('[data-exchange]'),
    usageHost: q('[data-usage]'),
    simulationsHost: q('[data-simulations]'),
    profileHost: q('[data-profile]'),
    deleteHost: q('[data-delete]'),
    equipmentHost: q('[data-equipment]'),
  };
  const alive = () => me === mountSeq;

  let room = null;
  let sensors = null; // { trh, co2, meter, dp } (meter and dp only when the server sends them)
  let loadSeq = 0;
  let timer = null;
  let refresh = refreshMs(null);
  let machines = null; // the Machines card, made on the first render
  let control = null; // the Automatic control card, made on the first render
  let alarmsCard = null; // the Alarms card, made on the first render
  let roomCardUi = null; // the Room card with the room picture, made on the first render
  let stopLoop = null; // stops the picture's animation
  let filterLast = null; // the last filter reading with the intake on (shown while it is off, like the Filter card)
  let filterNow = null; // the Room card's filter (filterFrom), from the last load
  let cropData = null; // the Crop and stage card's latest reply: the blocks under the picture and the stage line on the Room card
  let lastMachines = null; // the last good replies, so a failed optional read keeps the drawing's machines
  let lastControl = null;
  let ticker = null;
  const chartCards = new Map(); // chart id → { card, host, none, chart }
  let history = null; // the range choice and the data of the other ranges (Stream B)
  let timelineChart = null;
  let usageSection = null; // Electricity and water under the charts (spec 2026-10-26-usage-charts-design.md)
  let exchangeSection = null; // Air exchange: its own hourly or daily switch
  let price = null; // the electricity price of the settings, for the cost in the usage totals
  let drawnData = null; // the history reply last drawn
  let drawnWith = null;
  let drawnOutdoor = null; // the outdoor history last drawn
  let outdoor = null; // GET /api/outdoor, or null (no answer: an older server)
  let outdoorLive = null; // the outdoor history of the last hour, for the Live charts
  let outdoorBase = null; // the last hour fetched, at most once a minute
  let outdoorTail = []; // the newest readings since, one per refresh
  let outdoorLiveAt = 0;
  let outdoorLiveSeq = 0;
  let usageCard = null; // the Energy and water card, made on the first render
  let cropCard = null; // the Crop and stage card
  let simulationsCard = null; // the Simulations card
  let filterCard = null; // the Intake filter card
  let profileTab = null; // the Room profile tab's form
  let deleteCard = null; // the Delete room card under it

  // ---- loading ----

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(refresh, live.connected()));
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
        request('GET', `/api/rooms/${id}/alarms`).catch(() => null), // optional: alarms
        request('GET', '/api/outdoor').catch(() => null), // optional: the outdoor sensor
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
    const [r, list, machineData, controlData, settingsData, alarmData, outdoorData] = fetched;
    refresh = refreshMs(settingsData);
    if (settingsData) price = settingsData.electricityPrice;
    room = r;
    sensors = {
      trh: list.find((s) => s.kind === 'trh'), co2: list.find((s) => s.kind === 'co2'), meter: list.find((s) => s.kind === 'meter') ?? null,
      dp: list.find((s) => s.kind === 'dp') ?? null,
    };
    outdoor = outdoorData;
    els.banner.hidden = true;
    els.missing.hidden = true;
    render(machineData, token, controlData, controlToken, alarmData);
    refreshOutdoorLive();
    schedule();
  }

  function showMissing() {
    clearTimeout(timer);
    stopLoop?.(); // the drawing is hidden with the body
    stopLoop = null;
    cropCard?.destroy(); // the two cards ask the server on their own: stop
    cropCard = null;
    simulationsCard?.destroy();
    simulationsCard = null;
    filterCard?.destroy();
    filterCard = null;
    room = null;
    sensors = null;
    els.title.textContent = 'Room not found';
    els.sub.textContent = '';
    els.body.hidden = true;
    els.banner.hidden = true;
    els.missing.hidden = false;
    document.title = 'Rooms · Mushroom farm';
  }

  // ---- drawing ----

  function renderHead() {
    els.title.textContent = room.name;
    els.sub.textContent = `${metres.format(room.length)} × ${metres.format(room.width)} × ${metres.format(room.height)} m · ${cubic.format(room.volume)} m³`;
    document.title = `${room.name} · Mushroom farm`;
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
    const hist = history?.current() ?? null; // null: Live (the last 50 polls)
    const data = hist?.data ?? null;
    // A long range changes once a minute: the 5 s refresh must not redraw it (that would drop the hover).
    const drawnKey = data ? chartDrawKey(bands, sensors, room) : null;
    if (data && data === drawnData && drawnKey === drawnWith && hist.outdoor === drawnOutdoor) return;
    drawnData = data;
    drawnWith = drawnKey;
    drawnOutdoor = hist?.outdoor ?? null;
    for (const def of CHARTS) {
      const entry = chartCards.get(def.id);
      const s = sensors[def.kind];
      const points = hist ? (data ? historyPoints(data[def.kind], def.field, data.bucketS, data.pollSeconds) : []) : chartPoints(s, def.field);
      const wired = s.status !== 'not-wired';
      entry.card.hidden = !wired;
      const hasValue = points.some((p) => p.value !== null); // only failed polls: nothing to draw yet
      entry.none.textContent = hist ? (data ? 'No readings in this range' : hist.failed ? OFFLINE : 'Loading…') : 'No readings yet';
      entry.none.hidden = hasValue;
      entry.host.hidden = !hasValue;
      if (!wired) continue;
      // The band from the room's control settings (shown whether Auto is on or off), once they have loaded.
      const band = bands ? { low: bands[def.band[0]], high: bands[def.band[1]] } : null;
      // The outdoor values as a second, dashed line: the history of the same range, or the last hour on Live.
      const second = def.outdoor ? outdoorLine(hist ? hist.outdoor : outdoorLive, def.field) : null;
      const opts = { points, unit: def.unit, label: def.label, color: def.color, digits: def.digits, minSpan: def.minSpan, bounds: def.bounds, band, second };
      if (data) { // a long range: the whole window on the axis, date ticks, a shared time line with the other charts
        const range = { from: data.from, to: data.to };
        Object.assign(opts, {
          range, ticksFor: (w) => timeTicks(range.from, range.to, tickCountFor(w)), failTicks: false,
          formatAt: (ms) => formatStamp(ms), onCursor: moveCursor,
        });
      }
      if (!entry.chart) entry.chart = drawLineChart(entry.host, opts);
      else entry.chart.update(opts);
    }
    usageSection.update({ hist, sensors, price });
    renderTimeline(data);
  }

  // The time line follows the pointer on every chart and the timeline.
  function moveCursor(at) {
    for (const { chart } of chartCards.values()) chart?.setCursor(at);
    usageSection?.setCursor(at);
    timelineChart?.setCursor(at);
  }

  // The machine timeline, only for a long range and only the machines the room has wired.
  function renderTimeline(data) {
    const wired = wiredTimelineRows(room);
    els.timeline.hidden = !data || wired.length === 0;
    if (els.timeline.hidden) {
      timelineChart?.destroy();
      timelineChart = null;
      return;
    }
    const range = { from: data.from, to: data.to };
    const opts = {
      range, ticksFor: (w) => timeTicks(range.from, range.to, tickCountFor(w)), formatAt: (ms) => formatStamp(ms), onCursor: moveCursor,
      rows: wired.map((r) => ({
        ...r,
        spans: timelineSpans(data.machines[r.key], range.from, range.to),
        marks: r.key === 'ac' ? acMarks(data.machines.ac) : [],
      })),
    };
    if (!timelineChart) timelineChart = drawTimeline(els.timelineHost, opts);
    else timelineChart.update(opts);
  }

  let built = false;
  let bands = null; // the latest control settings, for the band lines on the charts
  let shownBandKey = ''; // the bands the Crop tab's note was painted with
  function render(machineData, token, controlData, controlToken, alarmData) {
    renderHead();
    els.body.hidden = false;
    if (!built) {
      makeAlarms();
      makeMachines();
      makeControl();
      roomCardUi = createRoomCard({ readings: els.readingsHost, picture: els.pictureHost, machines: els.machineListHost, crop: els.cropSumHost },
        { idPrefix: 'room-', cropHref: roomHash(id, 'crop') });
      buildCharts();
      usageSection = createUsageSection(els.usageCharts, { onCursor: moveCursor });
      exchangeSection = createExchangeSection(els.exchange, { roomId: id });
      usageCard = createUsageCard(els.usageHost, { roomId: id, getRoom: () => room });
      history = createHistory(els.rangeHost, { roomId: id, outdoor: true, onChange: () => { if (alive() && sensors) renderCharts(); } });
      const saved = { // the head and the other tabs show the change; new ratings change the estimates
        queue: createSaveQueue(), // one save at a time on the page: each PUT sends the whole room
        onSaved: (r) => {
          if (!alive()) return;
          // The forms take the saved room at once (before the next queued save builds its body), the rest on the load.
          profileTab.update(r);
          equipmentTab.update(r, { sensors, machines: lastMachines });
          load();
          usageCard?.refresh(true);
        },
        onGone: () => { if (alive()) showMissing(); },
      };
      profileTab = createRoomEdit(els.profileHost, { roomId: id, groups: ['profile'], idPrefix: 'rp-', ...saved });
      equipmentTab = createEquipment(els.equipmentHost, { roomId: id, idPrefix: 're-', ...saved });
      deleteCard = createDeleteCard(els.deleteHost, { roomId: id, getRoom: () => room, onGone: () => { if (alive()) showMissing(); } });
      built = true;
    }
    profileTab.update(room);
    equipmentTab.update(room, { sensors, machines: machineData ?? lastMachines }); // the cards' status lines
    if (!cropCard) makeCrop(); // (again after a missing room came back)
    cropCard?.setLights(room?.lights === true); // lights fitted or taken out: the schedule shows or goes
    simulationsCard ??= createSimulationsCard(els.simulationsHost, { roomId: id, getRoom: () => room });
    filterCard ??= createFilterCard(els.filterHost, { roomId: id, onChanged: () => { if (alive()) load(); } }); // the alarms clear
    filterCard.update(room, sensors.dp, intakeRunning(machineData ?? lastMachines));
    // The Room card's filter from the replies of this load: a command later does not make the old pressure reading new.
    ({ last: filterLast, filter: filterNow } = filterFrom({ last: filterLast, room, sensor: sensors.dp, machines: machineData ?? lastMachines }));
    stopLoop ??= startLoop(() => (roomCardUi ? [roomCardUi.mimic] : [])); // (again after a missing room came back)
    alarmsCard.update(alarmData); // hides itself while there are no current alarms; a failed read keeps the last data
    // The card shows only once a good reply came; later failures keep the last good data.
    // It is updated before the sensor cards so focus handling there sees the final page.
    // The drawing keeps only replies a card painted: a stale one (a command began since its fetch) must not show.
    if (machineData) {
      if (machines.update(machineData, token ?? machines.token())) lastMachines = machineData;
      els.machinesHost.hidden = false;
    }
    if (controlData) {
      const bandKey = BAND_KEYS.map((k) => controlData[k]).join();
      bands = controlData;
      if (bandKey !== shownBandKey) { shownBandKey = bandKey; cropCard?.bandsChanged(); }
      const painted = control.update(controlData, controlToken ?? control.token());
      els.controlHost.hidden = false;
      els.modeHost.hidden = false;
      if (painted) {
        machines.setAuto(controlData.auto); // a stale refresh must not relock the card
        lastControl = controlData;
      }
    }
    exchangeSection.update(room);
    renderCharts();
    paintDrawing();
    usageCard.refresh(); // not more than once a minute
  }

  // The Room card from the latest painted replies (also right after a command, not only on the next refresh).
  function paintDrawing() {
    if (!roomCardUi || !room || !sensors) return;
    const now = Date.now();
    const filter = filterNow; // worked out with the page's replies (render), not again after a command
    const draw = {
      ...fromRoom({ room, sensors, machines: lastMachines, control: lastControl, outdoor, filterPa: filter ? filter.pa : null, now }),
      blocks: blocksLine(cropData?.crops, cropFacts(cropData)?.short),
    };
    const c = lastControl;
    const traces = { // the reading cards' traces: the recent polls against the band
      T: traceOf(chartPoints(sensors.trh, 't'), c?.tLow, c?.tHigh),
      RH: traceOf(chartPoints(sensors.trh, 'rh'), c?.rhLow, c?.rhHigh),
      CO2: traceOf(chartPoints(sensors.co2, 'co2'), c?.co2Low, c?.co2High),
    };
    roomCardUi.paint(roomCard({ draw, control: lastControl, filter, crop: cropData, now }), draw, traces);
  }

  // The outdoor line of the Live charts: the history of the last hour, asked at most once a minute and only when a sensor
  // is set, plus the newest reading of GET /api/outdoor on every refresh so the line reaches the right edge.
  async function refreshOutdoorLive() {
    if (!outdoor || outdoor.address == null) {
      outdoorLive = null;
      outdoorBase = null;
      outdoorTail = [];
      return;
    }
    const tail = pushOutdoorTail(outdoorTail, outdoor.last);
    if (tail !== outdoorTail) {
      outdoorTail = tail;
      outdoorLive = liveOutdoor(outdoorBase, outdoorTail);
      if (sensors && built) renderCharts();
    }
    if (Date.now() - outdoorLiveAt < 60_000) return;
    outdoorLiveAt = Date.now();
    const me = ++outdoorLiveSeq;
    const data = await request('GET', '/api/outdoor/history?range=1h').catch(() => null);
    if (!alive() || me !== outdoorLiveSeq || !data) return; // a failed read keeps the last good one
    outdoorBase = data;
    outdoorLive = liveOutdoor(outdoorBase, outdoorTail);
    if (sensors && built) renderCharts();
  }

  // ---- Alarms card (spec 2026-10-19-safety-and-history-design.md section 6) ----
  function makeAlarms() {
    alarmsCard = createAlarmsCard(els.alarmsHost, {
      roomId: id,
      onChange: () => { if (alive()) load(); },
      onOffline: () => {
        if (!els.banner.hidden) return;
        els.bannerText.textContent = OFFLINE;
        els.retry.hidden = false;
        els.banner.hidden = false;
      },
    });
  }

  function makeMachines() {
    machines = createMachines(els.machinesHost, {
      roomId: id,
      onEdit: (field) => editEquipment(field),
      onOffline: () => {
        if (!els.banner.hidden) return; // do not re-announce an alert that is already showing
        els.bannerText.textContent = OFFLINE;
        els.retry.hidden = false;
        els.banner.hidden = false;
      },
      // Not-found on a command may be the room or just the machines route: the room GET decides.
      onGone: () => { if (alive()) load(); },
      onCommand: (data) => { if (!alive()) return; lastMachines = data; paintDrawing(); },
    });
    els.machinesHost.hidden = true;
  }

  // The Crop and stage card; a saved crop or stage may change the bands, so the page reads the control settings again.
  function makeCrop() {
    cropCard = createCropCard(els.cropHost, {
      roomId: id,
      getRoom: () => room,
      getBands: () => bands, // the current stage says when the room runs bands changed by hand
      onChange: () => { if (alive()) load(); },
      onData: (data) => { // the blocks and the stage on the Room card, the lights' hours on the Climate tab
        if (!alive()) return;
        cropData = data ?? null;
        control?.setCrop(cropData);
        paintDrawing();
      },
      onOffline: () => {
        if (!els.banner.hidden) return;
        els.bannerText.textContent = OFFLINE;
        els.retry.hidden = false;
        els.banner.hidden = false;
      },
      onGone: () => { if (alive()) load(); },
    });
  }

  function makeControl() {
    control = createControl(els.controlHost, {
      roomId: id,
      modeHost: els.modeHost,
      getRoom: () => room,
      cropHref: roomHash(id, 'crop'),
      onChange: (data) => {
        machines?.setAuto(data.auto);
        if (!alive()) return;
        cropCard?.refresh(); // a band changed by hand ends the ramp of the stage
        lastControl = data;
        bands = data;
        paintDrawing();
      },
      onOffline: () => {
        if (!els.banner.hidden) return;
        els.bannerText.textContent = OFFLINE;
        els.retry.hidden = false;
        els.banner.hidden = false;
      },
      onGone: () => { if (alive()) load(); },
    });
  }

  // "n s ago" and the Room card's fresh-air minutes count on between refreshes.
  ticker = setInterval(() => {
    if (roomCardUi && room) roomCardUi.setFresh(freshAirLine(lastControl));
  }, 1000);

  // ---- wiring ----

  // "Set address" on a sensor or machine without one: the Equipment tab, the cursor in that field.
  function editEquipment(field) {
    pendingField = field;
    location.hash = roomHash(id, 'setup');
  }

  els.retry.addEventListener('click', load);

  // The Setup tab's section links: scroll there without changing the address (a hash would leave the room page).
  container.querySelector('.setup-nav').addEventListener('click', (event) => {
    const a = event.target.closest('a[data-jump]');
    if (!a) return;
    event.preventDefault();
    const part = container.querySelector(a.getAttribute('href'));
    part?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    part?.focus({ preventScroll: true });
  });

  // The switch to another room: the same tab of that room. The list is read once; a failure leaves the switch hidden.
  request('GET', '/api/rooms').then((list) => {
    if (!alive() || !Array.isArray(list) || list.length < 2) return;
    els.switchSelect.replaceChildren(...list.map((r) => {
      const o = text('option', '', r.name);
      o.value = String(r.id);
      o.selected = r.id === id;
      return o;
    }));
    els.switchBox.hidden = false;
  }).catch(() => {});
  els.switchSelect.addEventListener('change', () => { location.hash = roomHash(Number(els.switchSelect.value), tab); });

  // Live updates: the room's events ask for the data again (a minute's timer is the fallback while the stream is up).
  const reload = createThrottle(() => { if (alive()) load(); }); // at most one load in 2 s
  const offLive = [
    live.on('room', (data) => {
      if (data.id !== id) return;
      if (data.part === 'crop') cropCard?.refresh();
      reload.call();
    }),
    live.onStatus((up) => { if (up) reload.call(); else schedule(); }), // back: catch up; gone: the short timer again
  ];

  load();

  function unmount() {
    mountSeq++;
    reload.cancel();
    for (const off of offLive) off();
    clearTimeout(timer);
    clearInterval(ticker);
    machines?.destroy();
    control?.destroy();
    alarmsCard?.destroy();
    stopLoop?.();
    roomCardUi?.destroy();
    history?.destroy();
    usageCard?.destroy();
    cropCard?.destroy();
    simulationsCard?.destroy();
    filterCard?.destroy();
    profileTab?.destroy();
    equipmentTab?.destroy();
    deleteCard?.destroy();
    outdoorLiveSeq++;
    timelineChart?.destroy();
    usageSection?.destroy();
    exchangeSection?.destroy();
    for (const { chart } of chartCards.values()) chart?.destroy();
    closeSimulateDialog();
    document.title = 'Rooms · Mushroom farm';
    container.replaceChildren();
  }
  unmount.setTab = setTab; // a tab change: the router shows another panel instead of mounting the page again
  return unmount;
}
