// The results page of one simulation run, #/rooms/:id/simulations/:runId (spec 2026-10-20-crops-and-simulation-design.md 4.5):
// the progress while it runs, then the time in band, the charts with the band as it moved, the machine timeline, energy and water.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { roomHash } from './route.js';
import { drawLineChart, M } from './chart.js';
import { drawTimeline } from './timeline.js';
import { drawBarChart } from './usage.js';
import { live } from './live.js';
import { fallbackMs, withProgress, isStale } from './live-math.js';
import { tickCountFor } from './history-math.js';
import { progressLine } from './simulate-math.js';
import {
  CHARTS, tileList, stageRows, dayTicks, runEnd, chartPoints, thinPoints, outdoorLine, bandSteps, timelineRows, energyView, perDayBars,
  inputLine, headLine, formatDateTime, formatRunTime, isActive, filterView,
} from './simulation-math.js';

const POLL_MS = 2000;
const RESULT_TIMEOUT = 120_000; // a run of 58 days has about 3 MB of results
const MAX_POINTS = 700; // per chart line (a run of 90 days has 26 000 samples)

const TEMPLATE = `
  <a class="back" href="#/rooms" data-back>← Room</a>
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1" data-title>Simulation</h1>
      <p class="page-sub" data-sub>Loading…</p>
    </div>
    <div class="page-actions" data-actions hidden><button type="button" class="danger-text" data-delete>Delete run</button></div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry hidden>Retry</button>
  </div>
  <div class="missing" data-missing hidden>
    <p>That simulation no longer exists</p>
    <a data-missing-back href="#/rooms">Back to the room</a>
  </div>
  <section class="card sim-run" data-run hidden>
    <h2>Simulation</h2>
    <progress max="1" value="0" aria-label="Progress of the simulation"></progress>
    <p class="sim-progress" role="status" data-progress></p>
    <p class="sim-warn" data-failed hidden></p>
  </section>
  <div data-results hidden></div>`;

let mountSeq = 0; // every mount gets a token; a reply that finds the token changed is dropped

function text(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function table(caption, headers, rows) {
  const wrap = text('div', 'us-table-wrap');
  const t = text('table', 'us-table');
  t.append(text('caption', '', caption));
  const head = text('tr');
  headers.forEach((h, i) => {
    const th = text('th', i === 0 ? '' : 'num', h);
    th.scope = 'col';
    head.append(th);
  });
  const thead = text('thead');
  thead.append(head);
  const tbody = text('tbody');
  for (const cells of rows) {
    const tr = text('tr');
    cells.forEach((c, i) => {
      if (i === 0) {
        const th = text('th', '', c);
        th.scope = 'row';
        tr.append(th);
      } else tr.append(text('td', 'num', c));
    });
    tbody.append(tr);
  }
  t.append(thead, tbody);
  wrap.append(t);
  return wrap;
}

function tile(label, value, line, tone) {
  const node = text('div', 'us-tile');
  const v = text('p', 'us-kwh', value);
  if (tone) v.dataset.tone = tone; // the time in band: good, a warning or bad
  node.append(text('p', 'us-label', label), v);
  if (line) node.append(text('p', 'us-line', line));
  return node;
}

export function mount(container, { id, runId }) {
  const me = ++mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    back: q('[data-back]'), title: q('[data-title]'), sub: q('[data-sub]'), actions: q('[data-actions]'), del: q('[data-delete]'),
    banner: q('.banner'), bannerText: q('[data-banner-text]'), retry: q('[data-retry]'), missing: q('[data-missing]'), missingBack: q('[data-missing-back]'),
    run: q('[data-run]'), bar: q('progress'), progress: q('[data-progress]'), failed: q('[data-failed]'), results: q('[data-results]'),
  };
  const deleteDialog = document.getElementById('delete-dialog');
  const deleteTitle = document.getElementById('delete-title');
  const deleteText = document.getElementById('delete-text');
  const alive = () => me === mountSeq;
  const abort = new AbortController();

  els.back.href = roomHash(id, 'simulations');
  els.missingBack.href = `#/rooms/${id}`;

  let roomName = null;
  let run = null;
  let timer = null;
  let loadSeq = 0;
  let drawnFor = null; // the run the results were drawn for
  let retry = null; // what Retry does: read the run again, or the results again
  let resultSeq = 0;
  const charts = []; // everything to destroy on unmount or a redraw

  function moveCursor(at) {
    for (const c of charts) c.setCursor?.(at);
  }

  // ---- loading ----

  async function load() {
    clearTimeout(timer);
    const seq = ++loadSeq;
    try {
      const [data, room] = await Promise.all([
        request('GET', `/api/simulations/${runId}?result=0`), // the progress needs no result
        roomName === null ? request('GET', `/api/rooms/${id}`).catch(() => null) : Promise.resolve(null), // optional: the name
      ]);
      if (!alive() || seq !== loadSeq) return;
      if (room) roomName = room.name;
      if (data.roomId !== undefined && data.roomId !== id) { // a run of another room is not this room's
        showMissing();
        return;
      }
      if (run && isStale(run, data)) return void (timer = setTimeout(load, fallbackMs(POLL_MS, live.connected()))); // an event came after it was asked
      run = data;
      retry = load;
      els.banner.hidden = true;
      els.missing.hidden = true;
      render();
    } catch (err) {
      if (!alive() || seq !== loadSeq) return;
      if (routeMissing(err)) {
        els.bannerText.textContent = OUTDATED;
        els.retry.hidden = false;
        els.banner.hidden = false;
        return;
      }
      if (err.status === 404) {
        showMissing();
        return;
      }
      if (els.banner.hidden) {
        els.bannerText.textContent = OFFLINE;
        els.retry.hidden = false;
        els.banner.hidden = false;
      }
    }
    if (isActive(run) || !run) timer = setTimeout(load, fallbackMs(POLL_MS, live.connected()));
    else if (run.status === 'done' && !run.result) loadResult();
  }

  // The full result, once, when the run is done. A failure shows the error and Retry; it is not tried again by itself.
  async function loadResult() {
    const me2 = ++resultSeq;
    try {
      const data = await request('GET', `/api/simulations/${runId}`, undefined, RESULT_TIMEOUT);
      if (!alive() || me2 !== resultSeq) return;
      run = data;
      els.banner.hidden = true;
      render();
    } catch (err) {
      if (!alive() || me2 !== resultSeq) return;
      if (err.status === 404) {
        showMissing();
        return;
      }
      retry = loadResult;
      els.progress.textContent = 'The results could not be loaded';
      els.bannerText.textContent = err.status === 0 ? "Couldn't load the results. Try again." : err.message;
      els.retry.hidden = false;
      els.banner.hidden = false;
    }
  }

  function showMissing() {
    clearTimeout(timer);
    els.title.textContent = 'Simulation not found';
    els.sub.textContent = '';
    els.actions.hidden = true;
    els.run.hidden = true;
    els.results.hidden = true;
    els.banner.hidden = true;
    els.missing.hidden = false;
  }

  // ---- drawing ----

  function render() {
    const name = roomName ?? 'the room';
    els.title.textContent = headLine(name);
    els.sub.textContent = [formatDateTime(run.createdAt), inputLine(run.input)].filter(Boolean).join(' · ');
    els.actions.hidden = false;
    document.title = `${headLine(name)} · Mushroom farm`;
    const active = isActive(run);
    const loadingResult = run.status === 'done' && !run.result;
    els.run.hidden = run.status === 'done' && !loadingResult;
    els.bar.value = Number.isFinite(run.progress) ? run.progress : 0;
    els.bar.hidden = run.status === 'failed';
    els.progress.hidden = run.status === 'failed';
    els.progress.textContent = loadingResult ? 'Loading the results…' : progressLine(run);
    els.failed.hidden = run.status !== 'failed';
    els.failed.textContent = run.status === 'failed' ? `The simulation failed: ${run.error ?? 'it stopped'}` : '';
    if (run.status === 'done' && run.result && drawnFor !== run.id) {
      drawnFor = run.id;
      els.results.hidden = false;
      drawResults();
    }
  }

  function clearCharts() {
    for (const c of charts.splice(0)) c.destroy();
    els.results.replaceChildren();
  }

  function drawResults() {
    clearCharts();
    const result = run.result;
    if (!result?.summary) {
      els.results.append(text('p', 'none', 'This simulation has no results'));
      return;
    }
    const { summary } = result;
    const end = runEnd(result);
    const range = { from: 0, to: end };
    const common = { range, ticksFor: (w) => dayTicks(end, tickCountFor(w)), formatAt: formatRunTime, onCursor: moveCursor };

    // time in band
    const band = text('section', 'card sim-card');
    band.append(text('h2', '', 'Time in band'));
    const tiles = text('div', 'us-tiles');
    tiles.append(...tileList(summary).map((t) => tile(t.label, t.value, '', t.tone)));
    band.append(tiles);
    const stages = stageRows(summary.perStage);
    if (stages.length) {
      band.append(table('Time in band by stage', ['Stage', 'Days', 'Temperature', 'Humidity', 'CO₂', 'All three'],
        stages.map((r) => [r.name, r.days, r.t, r.rh, r.co2, r.all])));
    }
    els.results.append(band);

    // charts, the band as it moved, the outdoor line
    const chartsBox = text('div', 'charts');
    for (const def of CHARTS) {
      const card = text('section', 'card chart-card');
      card.append(text('h2', '', `${def.label} (${def.unit})`));
      const host = text('div', 'chart-host');
      card.append(host);
      chartsBox.append(card);
      const second = def.outdoor ? outdoorLine(result.series, def.outdoor) : null;
      charts.push(drawLineChart(host, {
        ...common, points: thinPoints(chartPoints(result.series, def.field), MAX_POINTS), unit: def.unit, label: def.label, color: def.color,
        digits: def.digits, minSpan: def.minSpan, bounds: def.bounds, noun: 'samples', failTicks: false,
        bandSteps: bandSteps(result.series, def.low, def.high, end),
        second: second ? { ...second, points: thinPoints(second.points, MAX_POINTS) } : null,
      }));
    }
    els.results.append(chartsBox);

    // machine timeline
    const tl = text('section', 'card timeline-card');
    tl.append(text('h2', '', 'Machine timeline'));
    const tlHost = text('div', 'chart-host');
    const filter = filterView(summary);
    const changes = summary.filter?.changes ?? [];
    tl.append(tlHost, text('p', 'legend', `A bar is a time the machine was on. The aircon row shows its setpoint${changes.length ? ', the intake row the filter changes' : ''}.`));
    els.results.append(tl);
    // spans closer than one pixel of time are drawn as one: a long run has tens of thousands
    charts.push(drawTimeline(tlHost, { ...common, rowsFor: (w) => timelineRows(result.machines, end / Math.max(1, w - M.left - M.right), run.input, changes) }));

    // the intake filter (a run without one shows nothing)
    if (filter) {
      const card = text('section', 'card sim-card');
      card.append(text('h2', '', 'Intake filter'));
      const tiles = text('div', 'us-tiles');
      tiles.append(...filter.tiles.map((t) => tile(t.label, t.value, t.line)));
      card.append(tiles);
      els.results.append(card);
    }

    // energy and water
    const use = energyView(summary, run.input);
    const card = text('section', 'card us-card');
    card.append(text('h2', '', 'Energy and water'));
    const usage = text('div', 'us-tiles');
    usage.append(tile('Energy', use.kWh, use.cost), tile('Water', use.litres, use.waterCost));
    if (use.removed) usage.append(tile('Water taken out', use.removed, 'by the dehumidifier'));
    card.append(usage);
    if (use.rows.length) card.append(table('Energy by machine', ['Machine', 'kWh', 'Share'], use.rows.map((r) => [r.label, r.kWh, r.share])));
    const perDay = summary.perDay ?? [];
    if (perDay.length) {
      const bars = text('div', 'us-charts');
      for (const [title, key, kind, color] of [['Energy per day (kWh)', 'kWh', 'run-energy', 'var(--s-co2)'], ['Water per day (L)', 'litres', 'run-water', 'var(--s-rh)']]) {
        const box = text('div', 'us-chart');
        const host = text('div', 'chart-host');
        box.append(text('h3', '', title), host);
        bars.append(box);
        charts.push(drawBarChart(host, { series: perDayBars(perDay, key), kind, color }));
      }
      card.append(bars);
    }
    els.results.append(card);
  }

  // ---- delete ----

  els.del.addEventListener('click', () => {
    deleteTitle.textContent = 'Delete simulation';
    deleteText.textContent = `Delete this simulation${isActive(run) ? ' and stop it' : ''}? This can't be undone.`;
    deleteDialog.returnValue = '';
    deleteDialog.showModal();
  });

  deleteDialog.addEventListener('close', async () => {
    deleteTitle.textContent = 'Delete room';
    if (!alive() || deleteDialog.returnValue !== 'delete') return;
    try {
      await request('DELETE', `/api/simulations/${runId}`);
    } catch (err) {
      if (!alive()) return;
      if (err.status !== 404) {
        els.bannerText.textContent = err.status === 0 ? OFFLINE : err.message;
        els.retry.hidden = true;
        els.banner.hidden = false;
        return;
      }
    }
    if (alive()) location.hash = `#/rooms/${id}`;
  }, { signal: abort.signal });

  els.retry.addEventListener('click', () => { els.banner.hidden = true; (retry ?? load)(); });
  load();

  // Live updates: this run's progress and end ask again instead of the 2 s timer (which is only the fallback while the stream is up).
  // Progress is painted from the event; the end asks once (the summary, then the results).
  const offLive = [
    live.on('simulation', (data) => {
      if (data.id !== Number(runId) || !alive()) return;
      if (data.status === 'done' || data.status === 'failed') return void load();
      const next = run && withProgress(run, data);
      if (next) {
        run = next;
        render();
      } else if (!run) load();
    }),
    live.onStatus((up) => {
      if (run && !isActive(run)) return; // nothing more to wait for
      load(); // up: once, in case events were missed; down: the short timer again
    }),
  ];

  return function unmount() {
    mountSeq++;
    resultSeq++;
    reload.cancel();
    for (const off of offLive) off();
    abort.abort();
    clearTimeout(timer);
    clearCharts();
    if (deleteDialog.open) deleteDialog.close();
    deleteTitle.textContent = 'Delete room';
    document.title = 'Rooms · Mushroom farm';
    container.replaceChildren();
  };
}
