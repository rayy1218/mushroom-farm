// The Suggest machines page of a room, #/rooms/:id/suggest (spec 2026-10-22-suggest-machines-design.md; its own page since
// the owner's 2026-10-28 critique: it is the buying decision, and a 13-column table did not fit the Simulate dialog). It asks
// the walls and weather, the crops, the target and the longest cool-down (prefilled like Simulate), runs the search (POST
// /api/rooms/:id/sizing, GET and DELETE /api/sizing/:id) and lists the setups ranked by the money they cost a month. Use this
// opens Simulate with the setup, for a full run. The job's id is kept in this browser tab, so leaving the page and coming
// back shows it again (the search goes on meanwhile).

import { request, OFFLINE, GONE, OUTDATED, routeMissing } from './api.js';
import { roomHash } from './route.js';
import { live } from './live.js';
import { fallbackMs, isStale, withProgress } from './live-math.js';
import { CROPS, CROP_KEYS, STAGES, FARM_TYPES, MAX_CROPS } from './crops.js';
import { openSimulateDialog, closeSimulateDialog } from './simulate-dialog.js';
import {
  SIZING_FIELDS, PHYSICS_GROUPS, fieldLabel, initialState, stagesOf, fixStage, removeLabel, mixSummary, roomLine, firstField, applySizingInput,
  TARGET_DEFAULT, COOL_DOWN_DEFAULT, checkSuggest, sizingBody, sizingProgress, estimateLines, coolDownLine,
} from './simulate-math.js';
import { pricesOf, suggestRows, moneyHead, priceLine, noneReachedLine, COLUMNS } from './suggest-math.js';

const POLL_MS = 1000;
const FIELD_ORDER = [...SIZING_FIELDS.map((f) => `physics.${f.key}`), 'crops', 'farmType', 'stage', 'target', 'coolDownMaxH'];
const storeKey = (id) => `farm.suggest.${id}`;

const TEMPLATE = `
  <a class="back sim-back" href="#/overview" data-back>Room</a>
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1" data-title>Suggest machines</h1>
      <p class="page-sub sg-sub">The search tries fan, aircon, humidifier and dehumidifier sizes for these crops, walls and weather, and lists the five best setups: those that reach the goal first, the cheapest a month first.</p>
    </div>
  </div>
  <div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry hidden>Retry</button></div>
  <div class="missing" data-missing hidden><p>That room no longer exists</p><a href="#/overview">Back to the Overview</a></div>
  <p class="none" data-loading>Loading…</p>
  <form class="card sg-form" data-form novalidate hidden></form>
  <section class="card sg-out" data-out hidden>
    <h2>Suggestions</h2>
    <div data-out-body aria-live="polite"></div>
  </section>`;

let mountSeq = 0;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, className, type = 'button') {
  const b = el('button', className ?? '', label);
  b.type = type;
  return b;
}

function readStored(id) {
  try { return JSON.parse(sessionStorage.getItem(storeKey(id)) ?? 'null'); } catch { return null; }
}
function writeStored(id, value) {
  try {
    if (value) sessionStorage.setItem(storeKey(id), JSON.stringify(value));
    else sessionStorage.removeItem(storeKey(id));
  } catch { /* not kept: the page still works, without coming back to the job */ }
}

export function mount(container, { id }) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    back: q('[data-back]'), title: q('[data-title]'), banner: q('.banner'), bannerText: q('[data-banner-text]'), retry: q('[data-retry]'),
    missing: q('[data-missing]'), loading: q('[data-loading]'), form: q('[data-form]'), out: q('[data-out]'), outBody: q('[data-out-body]'),
  };
  els.back.href = roomHash(id, 'simulations');

  let room = null;
  let state = null; // the texts of the form (initialState's, as in Simulate)
  let targetText = TARGET_DEFAULT;
  let coolText = COOL_DOWN_DEFAULT;
  let prices = pricesOf(null);
  let job = null; // the suggestion as last read
  let body = null; // what it was asked (for Use this)
  let jobText = ''; // an error of the suggestion that belongs to no field (409, offline)
  let sending = false;
  let timer = null;
  let painted = ''; // the result drawn: a poll with nothing new leaves it (and its open details and focus) alone

  const active = () => job?.status === 'queued' || job?.status === 'running';

  // ---- the form ----

  // A labelled input with its error line and, when given, a hint; registered under the server's field name.
  function field(name, label, input, hint) {
    const wrap = el('div', 'field');
    const fid = `sg-${name.replace('.', '-')}`;
    input.id = fid;
    input.dataset.field = name;
    const err = el('p', 'field-error');
    err.id = `${fid}-error`;
    err.dataset.error = name;
    err.setAttribute('aria-live', 'polite');
    const described = [err.id];
    const lab = el('label', '', label);
    lab.htmlFor = fid;
    wrap.append(lab, input);
    if (hint) {
      const h = el('p', 'c-hint', hint);
      h.id = `${fid}-hint`;
      described.unshift(h.id);
      wrap.append(h);
    }
    wrap.append(err);
    input.setAttribute('aria-describedby', described.join(' '));
    return wrap;
  }

  function textInput(value, onInput, whole) {
    const input = el('input');
    input.type = 'text';
    input.inputMode = whole ? 'numeric' : 'decimal';
    input.autocomplete = 'off';
    input.value = value;
    input.addEventListener('input', () => { onInput(input.value); clearError(input.dataset.field); });
    return input;
  }

  function selectInput(options, value, onChange) {
    const select = el('select');
    for (const [v, text] of options) {
      const o = el('option', '', text);
      o.value = v;
      select.append(o);
    }
    select.value = value;
    select.addEventListener('change', () => { onChange(select.value); clearError(select.dataset.field); });
    return select;
  }

  function clearError(name) {
    if (!name) return;
    for (const node of els.form.querySelectorAll(`[data-error="${name}"]`)) node.textContent = '';
    for (const node of els.form.querySelectorAll(`[data-field="${name}"]`)) node.removeAttribute('aria-invalid');
  }

  function showErrors(errors) {
    for (const [name, text] of Object.entries(errors)) {
      for (const node of els.form.querySelectorAll(`[data-error="${name}"]`)) node.textContent = text;
      for (const node of els.form.querySelectorAll(`[data-field="${name}"]`)) node.setAttribute('aria-invalid', 'true');
    }
    const first = FIELD_ORDER.find((f) => errors[f]) ?? firstField(errors);
    els.form.querySelector(`[data-field="${first}"]`)?.focus();
  }

  function paintForm() {
    // Walls and sun, then Weather (critique 2026-10-29: one grid of the five zigzagged), as in Simulate's step 1
    const physics = [];
    for (const g of PHYSICS_GROUPS) {
      const set = el('fieldset', 'addresses');
      set.append(el('legend', '', g.legend));
      const grid = el('div', g.key === 'weather' ? 'sizes sim-physics' : 'sizes two sim-physics');
      for (const f of SIZING_FIELDS.filter((x) => x.group === g.key)) {
        grid.append(field(`physics.${f.key}`, fieldLabel(f), textInput(state.physics[f.key], (v) => { state.physics[f.key] = v; }, f.whole), f.hint));
      }
      set.append(grid);
      physics.push(set);
    }

    const crops = el('fieldset', 'addresses');
    crops.append(el('legend', '', 'Crops in the room'));
    const list = el('div', 'sim-crops');
    const listError = el('p', 'field-error');
    listError.dataset.error = 'crops';
    listError.id = 'sg-crops-error';
    listError.setAttribute('aria-live', 'polite');
    const add = button('Add crop');
    const mix = el('div', 'sim-mix sg-mix'); // a block under its heading, not a box in the form's card
    const paintMix = () => {
      const m = mixSummary(state);
      mix.replaceChildren();
      if (!m) return;
      mix.append(el('h3', 'sim-mix-title', "The search holds the room in the crops' bands for each stage"));
      const ul = el('ul', 'sim-mix-lines');
      ul.append(...m.lines.map((t) => el('li', '', t)));
      mix.append(ul, ...m.warnings.map((w) => el('p', 'sim-warn', w)));
    };
    const rows = () => {
      const head = el('div', 'sim-crop-row sim-crop-head');
      head.setAttribute('aria-hidden', 'true'); // the column names for the eye; each field has its own name
      head.append(el('span', '', 'Crop'), el('span', '', 'Blocks'));
      list.replaceChildren(head, ...state.crops.map((row, i) => {
        const wrap = el('div', 'sim-crop-row');
        const remove = button('Remove', 'danger-text');
        const select = selectInput(CROP_KEYS.map((k) => [k, CROPS[k].name]), row.crop, (v) => { row.crop = v; remove.setAttribute('aria-label', removeLabel(v)); paintMix(); });
        select.setAttribute('aria-label', `Crop ${i + 1}`);
        select.name = `crop-${i + 1}`;
        select.setAttribute('aria-describedby', listError.id);
        select.dataset.field = i === 0 ? 'crops' : '';
        const blocks = textInput(row.blocks, (v) => { row.blocks = v; paintMix(); }, true);
        blocks.setAttribute('aria-label', `Blocks of crop ${i + 1}`);
        blocks.name = `blocks-${i + 1}`;
        blocks.setAttribute('aria-describedby', listError.id);
        blocks.dataset.field = '';
        remove.setAttribute('aria-label', removeLabel(row.crop));
        remove.disabled = state.crops.length === 1;
        remove.addEventListener('click', () => { state.crops.splice(i, 1); clearError('crops'); rows(); paintMix(); add.focus(); });
        wrap.append(select, blocks, el('span', 'sim-unit', 'blocks'), remove);
        return wrap;
      }));
      add.disabled = state.crops.length >= MAX_CROPS;
    };
    add.addEventListener('click', () => {
      const unused = CROP_KEYS.find((k) => !state.crops.some((c) => c.crop === k)) ?? CROP_KEYS[0];
      state.crops.push({ crop: unused, blocks: '100' });
      clearError('crops');
      rows();
      paintMix();
      list.querySelector('.sim-crop-row:last-child input')?.focus();
    });
    const stageOptions = () => stagesOf(state.farmType).map((s) => { const o = el('option', '', STAGES[s]); o.value = s; return o; });
    const stage = el('select');
    stage.append(...stageOptions());
    stage.value = state.stage;
    stage.addEventListener('change', () => { state.stage = stage.value; clearError('stage'); paintMix(); });
    const farm = field('farmType', 'Farm type', selectInput(Object.entries(FARM_TYPES).map(([k, f]) => [k, f.name]), state.farmType, (v) => {
      state.farmType = v;
      state.stage = fixStage(v, state.stage);
      stage.replaceChildren(...stageOptions());
      stage.value = state.stage;
      paintMix();
    }));
    const farmBox = el('div', 'sim-farm sg-farm');
    farmBox.append(farm, field('stage', 'Start stage', stage, 'The search runs this stage and the next.'));
    rows();
    paintMix();
    crops.append(list, listError, add, farmBox, mix);

    const goal = el('fieldset', 'addresses');
    goal.append(el('legend', '', 'Goal'));
    const goalGrid = el('div', 'sizes two sg-goal');
    goalGrid.append(
      field('target', 'Target (%)', textInput(targetText, (v) => { targetText = v; }, true), 'The time with temperature, humidity and CO₂ each in band.'),
      field('coolDownMaxH', 'Longest cool-down (h)', textInput(coolText, (v) => { coolText = v; }, false), 'From outdoor air at 14:00 (just loaded) until temperature and humidity are in band and hold it for an hour.'),
    );
    goal.append(goalGrid);

    const go = button('Suggest', 'primary', 'submit');
    go.dataset.go = '';
    const foot = el('div', 'sg-go');
    foot.append(go);
    els.form.replaceChildren(el('h2', '', 'What to size for'), el('p', 'sim-room', roomLine(room)), ...physics, crops, goal, foot);
    paintGo();
  }

  // The Suggest button and the fields wait while a search runs.
  function paintGo() {
    const go = els.form.querySelector('[data-go]');
    if (go) go.disabled = sending || active();
  }

  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state || sending || active()) return;
    const errors = checkSuggest(state, targetText, coolText);
    if (Object.keys(errors).length) { showErrors(errors); return; }
    await start();
  });

  // ---- the search ----

  async function start() {
    sending = true;
    jobText = '';
    job = null;
    paintGo();
    paintOut();
    const asked = sizingBody(state, targetText, coolText);
    try {
      const created = await request('POST', `/api/rooms/${id}/sizing`, asked);
      if (!alive()) return;
      job = created;
      body = asked;
      writeStored(id, { id: created.id, body: asked, target: targetText, coolDown: coolText });
      poll();
    } catch (err) {
      if (!alive()) return;
      if (err.status === 400 && err.field) showErrors({ [err.field]: err.message });
      else if (routeMissing(err)) jobText = OUTDATED;
      else if (err.status === 404) jobText = GONE;
      else jobText = err.status === 0 ? `${OFFLINE}. Try again.` : err.message;
    } finally {
      if (alive()) {
        sending = false;
        paintGo();
        paintOut();
      }
    }
  }

  function poll() {
    clearTimeout(timer);
    const mine = job;
    paintOut();
    paintGo();
    if (!active()) return;
    timer = setTimeout(() => check(mine), fallbackMs(POLL_MS, live.connected()));
  }

  // One look at the suggestion: on the timer, or at once when the stream says it moved.
  async function check(mine) {
    clearTimeout(timer);
    if (!alive() || job !== mine) return;
    try {
      const latest = await request('GET', `/api/sizing/${mine.id}`);
      if (!alive() || job !== mine) return;
      // ids start again after a restart of the farm app: another room's job with the same id is not this one
      if (latest.roomId !== id) return void gone();
      if (isStale(job, latest)) return void poll(); // an event told more since it was asked
      job = latest;
    } catch (err) {
      if (!alive() || job !== mine) return;
      if (err.status === 404) return void gone();
    }
    poll();
  }

  function gone() {
    job = null;
    writeStored(id, null);
    jobText = 'This suggestion is gone (the farm app was restarted, or it was cancelled elsewhere). Suggest again.';
    paintOut();
    paintGo();
  }

  async function cancel() {
    const mine = job;
    clearTimeout(timer);
    job = null;
    jobText = '';
    writeStored(id, null);
    paintOut();
    paintGo();
    els.form.querySelector('[data-go]')?.focus();
    try { await request('DELETE', `/api/sizing/${mine.id}`); } catch { /* it ended or is gone already */ }
  }

  // ---- the result ----

  function paintOut() {
    const key = JSON.stringify([job?.id, job?.status, job?.tried, job?.progress, jobText, prices, !!job?.result]);
    if (key === painted) return;
    painted = key;
    const nodes = [];
    if (jobText) nodes.push(el('p', 'sim-warn', jobText));
    if (job && active()) {
      const bar = el('progress');
      bar.max = 1;
      bar.value = Number.isFinite(job.progress) ? job.progress : 0;
      bar.setAttribute('aria-label', 'Progress of the suggestion');
      const status = el('p', 'sim-progress', sizingProgress(job));
      status.setAttribute('role', 'status');
      const stop = button('Cancel');
      stop.setAttribute('aria-label', 'Cancel the suggestion');
      stop.addEventListener('click', cancel);
      nodes.push(bar, status, el('p', 'muted', 'The search goes on if you leave this page; come back to see it.'), stop);
    } else if (job?.status === 'failed') {
      nodes.push(el('p', 'sim-warn', sizingProgress(job)));
    } else if (job?.status === 'done' && job.result) {
      nodes.push(...resultView(job.result));
    }
    els.out.hidden = nodes.length === 0;
    els.outBody.replaceChildren(...nodes);
  }

  function resultView(result) {
    const nodes = [];
    const rows = suggestRows(result, prices);
    if (rows.length === 0) return [el('p', 'sim-warn', 'No setup was found.')];
    nodes.push(el('p', 'sg-caption', `The best ${rows.length === 1 ? 'setup' : `${rows.length} setups`} over ${result.days} ${result.days === 1 ? 'day' : 'days'}, in order`));
    const none = noneReachedLine(result, rows);
    if (none) nodes.push(el('p', 'sim-warn', none));
    const list = el('ol', 'sg-list');
    const head = el('li', 'sg-row sg-head');
    head.setAttribute('aria-hidden', 'true'); // the columns' names for the eye; each cell says what it is to a screen reader
    const heads = COLUMNS.map((c, i) => (i === 2 ? moneyHead(prices) : c));
    head.append(...heads.map((c) => el('span', '', c)));
    list.append(head);
    for (const r of rows) {
      const li = el('li', 'sg-row');
      const setup = el('div', 'sg-setup');
      const machines = el('p', 'sg-machines');
      const rank = el('span', 'sg-rank', `${r.rank}.`);
      rank.setAttribute('aria-hidden', 'true'); // the list numbers it for a screen reader
      machines.append(rank, ...r.setupParts.flatMap((p, i) => [...(i ? [document.createTextNode(' · ')] : []), el('span', 'sg-part', p)]));
      const verdict = el('p', 'sg-verdict', r.verdict.text);
      verdict.dataset.tone = r.verdict.tone;
      setup.append(machines, verdict);
      const cell = (label, value, cls) => {
        const c = el('div', `sg-cell ${cls}`);
        c.append(el('span', 'sg-label', label), el('span', 'sg-value', value));
        return c;
      };
      const use = button('Use this');
      use.setAttribute('aria-label', `Use setup ${r.rank} in Simulate`);
      use.addEventListener('click', () => {
        if (room && body) openSimulateDialog(room, { suggestion: { input: body, candidate: result.best[r.index] } });
      });
      const useBox = el('div', 'sg-use');
      useBox.append(use);
      const more = el('details', 'sg-more');
      const summary = el('summary', '', 'Details');
      summary.append(el('span', 'sr-only', ` of setup ${r.rank}`));
      const dl = el('dl', 'sg-dl');
      dl.append(...r.details.map((d) => { const div = el('div'); div.append(el('dt', '', d.label), el('dd', '', d.value)); return div; }));
      more.append(summary, dl);
      li.append(setup, cell(heads[1], r.inBand, 'sg-band'), cell(heads[2], r.money, 'sg-money'), cell(heads[3], r.coolDown, 'sg-cool'), useBox, more);
      list.append(li);
    }
    nodes.push(list, el('p', 'muted sg-note', priceLine(prices, result.days)));
    const cool = coolDownLine(result);
    if (cool) nodes.push(el('p', 'muted sg-note', cool));
    nodes.push(el('p', 'muted sg-note', 'Use this opens Simulate with the setup, its air exchange time limit and its settings during air exchange, for a full run of the room.'));
    const lines = estimateLines(result.estimate);
    if (lines.length) {
      nodes.push(el('h3', 'sim-sub', 'Where the search started'));
      const ul = el('ul', 'sim-mix-lines sg-estimates');
      ul.append(...lines.map((t) => el('li', '', t)));
      nodes.push(ul);
    }
    for (const n of result.notes ?? []) nodes.push(el('p', 'us-note', n));
    return nodes;
  }

  // ---- loading ----

  async function load() {
    els.banner.hidden = true;
    try {
      const [r, runs, crop, settings] = await Promise.all([
        request('GET', `/api/rooms/${id}`),
        request('GET', `/api/rooms/${id}/simulations`).catch(() => null), // newest first; optional: the prefill
        request('GET', `/api/rooms/${id}/crop`).catch(() => null),
        request('GET', '/api/settings').catch(() => null), // the prices; without them the setups are ranked by energy
      ]);
      if (!alive()) return;
      room = r;
      prices = pricesOf(settings);
      state = initialState({ room, lastRun: Array.isArray(runs) ? runs[0] ?? null : null, cropData: crop });
      const stored = readStored(id);
      if (stored?.body) { // the search of an earlier visit: the form shows what it was asked
        applySizingInput(state, stored.body);
        targetText = stored.target ?? targetText;
        coolText = stored.coolDown ?? coolText;
      }
      els.title.textContent = `Suggest machines for ${room.name}`;
      els.back.textContent = room.name;
      document.title = `Suggest machines for ${room.name} · Mushroom farm`;
      els.loading.hidden = true;
      els.form.hidden = false;
      paintForm();
      if (stored?.id) {
        job = { id: stored.id, status: 'queued', progress: 0 };
        body = stored.body;
        check(job);
      }
    } catch (err) {
      if (!alive()) return;
      if (err.status === 404 && !routeMissing(err)) {
        els.loading.hidden = true;
        els.title.textContent = 'Room not found';
        els.missing.hidden = false;
        return;
      }
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : OFFLINE;
      els.retry.hidden = false;
      els.banner.hidden = false;
    }
  }

  els.retry.addEventListener('click', load);
  load();

  // The stream says the job moved: look at once instead of waiting for the timer.
  const offLive = [
    live.on('sizing', (data) => {
      if (!alive() || !job || data.id !== job.id || data.roomId !== id || !active()) return;
      if (data.status === 'done' || data.status === 'failed') return void check(job); // the result, once
      const next = withProgress(job, data);
      if (next) { job = next; poll(); }
    }),
    live.onStatus(() => { if (alive() && job && active()) check(job); }), // up: once, in case events were missed
  ];

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    for (const off of offLive) off();
    closeSimulateDialog();
    document.title = 'Rooms · Mushroom farm';
    container.replaceChildren();
  };
}
