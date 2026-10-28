// The Simulate stepper (spec 2026-10-20-crops-and-simulation-design.md section 4.1): step 1 room and machines, step 2 crops,
// step 3 run; then the progress of the run. Shared by the Rooms list and the room page; the dialog is made on first use.
// openSimulateDialog(room, { onStarted(run), onFinished() }); closeSimulateDialog() for a page that goes away.

import { request, OFFLINE, GONE, OUTDATED, routeMissing } from './api.js';
import { live } from './live.js';
import { fallbackMs, isStale, withProgress } from './live-math.js';
import { CROPS, CROP_KEYS, STAGES, FARM_TYPES, MAX_CROPS } from './crops.js';
import { AC_CLASSES, acClassOf, kwOfBtu, btuOfKw } from './simulation-math.js';
import {
  PHYSICS_FIELDS, FILTER_KEYS, initialState, checkStep, firstField, stepOf, buildBody, mixSummary, wholeProgram, stagesOf, fixStage, roomLine,
  summaryLines, progressLine, removeLabel,
  TARGET_DEFAULT, checkTarget, sizingBody, sizingProgress, sizingRows, estimateLines, useSetup,
} from './simulate-math.js';

const STEPS = ['Room and machines', 'Crops', 'Run'];
const POLL_MS = 2000;
const SIZING_POLL_MS = 1000;

let dialog = null;
let openSeq = 0; // every opening gets a token; a reply that finds it changed is dropped (it belongs to an earlier opening)

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

function ensureDialog() {
  if (dialog) return dialog;
  dialog = el('dialog', 'sim-dialog');
  dialog.setAttribute('aria-labelledby', 'sim-title');
  document.body.append(dialog);
  return dialog;
}

export function closeSimulateDialog() {
  openSeq++;
  if (dialog?.open) dialog.close();
}

export function openSimulateDialog(room, hooks = {}) {
  const d = ensureDialog();
  if (d.open) d.close();
  const me = ++openSeq;
  const alive = () => me === openSeq && d.open;

  let state = null; // the texts of the three steps
  let cropData = null; // GET /api/rooms/:id/crop, for the program numbers of "Whole program"
  let step = 1;
  let run = null;
  let timer = null;
  let sending = false;
  let roomControl = null; // the room's own time limit, aircon drop and humidifier setting, GET /api/rooms/:id/control
  let sizing = null; // the suggestion job as last read (GET /api/sizing/:id)
  let sizingTimer = null;
  let sizingText = ''; // an error of the suggestion that belongs to no field (409, offline)
  let targetText = TARGET_DEFAULT;
  let sizingSending = false;
  let paintSizing = () => {}; // set by step 3

  d.replaceChildren();
  const form = el('form');
  form.noValidate = true;
  const title = el('h2', '', `Simulate ${room.name}`);
  title.id = 'sim-title';
  const marks = el('ol', 'sim-steps');
  const formError = el('p', 'form-error');
  formError.setAttribute('role', 'alert');
  formError.tabIndex = -1;
  formError.hidden = true;
  const body = el('div', 'sim-body');
  const actions = el('div', 'actions');
  form.append(title, marks, formError, body, actions);
  d.append(form);

  // ---- fields ----

  // A labelled input with its error line; the input is registered under the server's field name.
  function field(name, label, input) {
    const wrap = el('div', 'field');
    const id = `sim-${name.replace('.', '-')}`;
    input.id = id;
    input.dataset.field = name;
    const err = el('p', 'field-error');
    err.id = `${id}-error`;
    err.dataset.error = name;
    err.setAttribute('aria-live', 'polite');
    input.setAttribute('aria-describedby', err.id);
    const lab = el('label', '', label);
    lab.htmlFor = id;
    wrap.append(lab, input, err);
    return wrap;
  }

  // The aircon: typed in kW (kept in BTU/h, the device app's unit), with the BTU/h class shops sell it by as a picker.
  function acField(f) {
    const btu = Number(state.physics[f.key]);
    const shown = /^[0-9]+$/.test(String(state.physics[f.key]).trim()) ? kwOfBtu(btu).toFixed(1) : state.physics[f.key];
    const sold = el('select');
    sold.setAttribute('aria-label', 'Aircon sold as');
    const none = el('option', '', 'Other size');
    none.value = '';
    sold.append(none, ...AC_CLASSES.map((c) => { const o = el('option', '', `${c.toLocaleString('en-US')} BTU/h class (${kwOfBtu(c).toFixed(1)} kW)`); o.value = String(c); return o; }));
    sold.value = String(acClassOf(btu) ?? '');
    const input = numberInput(shown, (v) => {
      const kw = /^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(v.trim()) ? Number(v) : NaN;
      state.physics[f.key] = Number.isFinite(kw) ? String(btuOfKw(kw)) : v; // a text that is not a size stays as typed: the check says so
      sold.value = String(Number.isFinite(kw) ? acClassOf(btuOfKw(kw)) ?? '' : '');
    }, false);
    sold.addEventListener('change', () => {
      if (!sold.value) return;
      state.physics[f.key] = sold.value;
      input.value = kwOfBtu(Number(sold.value)).toFixed(1);
      clearError(`physics.${f.key}`);
    });
    const wrap = field(`physics.${f.key}`, `${f.label} (kW)`, input);
    const row = el('div', 'sim-ac');
    input.replaceWith(row);
    row.append(input, sold);
    return wrap;
  }

  function numberInput(value, onInput, whole) {
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
    for (const node of body.querySelectorAll(`[data-error="${name}"]`)) node.textContent = '';
    for (const node of body.querySelectorAll(`[data-field="${name}"]`)) node.removeAttribute('aria-invalid');
    formError.hidden = true;
  }

  // Errors under their fields; the first one gets the focus.
  function showErrors(errors) {
    for (const [name, text] of Object.entries(errors)) {
      for (const node of body.querySelectorAll(`[data-error="${name}"]`)) node.textContent = text;
      for (const node of body.querySelectorAll(`[data-field="${name}"]`)) node.setAttribute('aria-invalid', 'true');
    }
    const first = firstField(errors);
    (body.querySelector(`[data-field="${first}"]`) ?? body.querySelector('[data-focus]'))?.focus();
  }

  function showFormError(text) {
    formError.textContent = text;
    formError.hidden = false;
    formError.focus();
  }

  // ---- the steps ----

  function stepOne() {
    const box = el('div');
    box.append(el('p', 'sim-room', roomLine(room)));
    const weather = el('fieldset', 'addresses');
    weather.append(el('legend', '', 'Walls and weather'));
    const machines = el('fieldset', 'addresses');
    machines.append(el('legend', '', 'Machines'));
    // The intake filter (spec 2026-10-22-filter-design.md 8): the room's settings and its filter's age; with the room's
    // pressure sensor the run changes the filter at the change pressure too.
    const filter = el('fieldset', 'addresses');
    filter.append(el('legend', '', 'Intake filter'));
    const weatherGrid = el('div', 'sizes two');
    const machineGrid = el('div', 'sizes two');
    const filterGrid = el('div', 'sizes two');
    for (const f of PHYSICS_FIELDS) {
      const wrap = f.kw ? acField(f) : field(`physics.${f.key}`, `${f.label} (${f.unit})`,
        numberInput(state.physics[f.key], (v) => { state.physics[f.key] = v; }, f.whole));
      if (FILTER_KEYS.includes(f.key)) filterGrid.append(wrap);
      else (['fanFlow', 'acBTU', 'humidifierLH', 'dehumidifierLday'].includes(f.key) ? machineGrid : weatherGrid).append(wrap);
    }
    weather.append(weatherGrid);
    machines.append(machineGrid);
    filter.append(filterGrid, el('p', 'c-hint', "Filter change pressure: the pressure sensor's reading at which to change the filter (with the intake running)."),
      el('p', 'c-hint', state.filterSensor
        ? 'The room has a filter pressure sensor: the run also changes the filter at the change pressure.'
        : 'The room has no filter pressure sensor: the run changes the filter only every so many days (0: never).'));
    box.append(weather, machines, filter);
    return box;
  }

  function stepTwo() {
    const box = el('div');
    const list = el('div', 'sim-crops');
    const listError = el('p', 'field-error');
    listError.dataset.error = 'crops';
    listError.id = 'sim-crops-error';
    listError.setAttribute('aria-live', 'polite');
    const add = button('Add crop');
    const mix = el('div', 'sim-mix');

    function rows() {
      list.replaceChildren(...state.crops.map((row, i) => {
        const wrap = el('div', 'sim-crop-row');
        const select = selectInput(CROP_KEYS.map((k) => [k, CROPS[k].name]), row.crop, (v) => { row.crop = v; wrap.querySelector('button').setAttribute('aria-label', removeLabel(v)); paintMix(); });
        select.setAttribute('aria-label', `Crop ${i + 1}`);
        select.setAttribute('aria-describedby', 'sim-crops-error');
        select.dataset.field = i === 0 ? 'crops' : '';
        const blocks = numberInput(row.blocks, (v) => { row.blocks = v; paintMix(); }, true);
        blocks.setAttribute('aria-label', `Blocks of crop ${i + 1}`);
        blocks.setAttribute('aria-describedby', 'sim-crops-error');
        blocks.dataset.field = '';
        const remove = button('Remove', 'danger-text');
        remove.setAttribute('aria-label', removeLabel(row.crop));
        remove.disabled = state.crops.length === 1;
        remove.addEventListener('click', () => { state.crops.splice(i, 1); clearError('crops'); rows(); paintMix(); add.focus(); });
        wrap.append(select, blocks, el('span', 'sim-unit', 'blocks'), remove);
        return wrap;
      }));
      const head = el('div', 'sim-crop-row sim-crop-head');
      head.setAttribute('aria-hidden', 'true'); // the column names for the eye; each field has its own name
      head.append(el('span', '', 'Crop'), el('span', '', 'Blocks'));
      list.prepend(head);
      add.disabled = state.crops.length >= MAX_CROPS;
    }

    add.addEventListener('click', () => {
      const unused = CROP_KEYS.find((k) => !state.crops.some((c) => c.crop === k)) ?? CROP_KEYS[0];
      state.crops.push({ crop: unused, blocks: '100' });
      clearError('crops');
      rows();
      paintMix();
      list.querySelector('.sim-crop-row:last-child input')?.focus();
    });

    function paintMix() {
      const m = mixSummary(state);
      mix.replaceChildren();
      if (!m) return;
      mix.append(el('p', 'sim-mix-title', "The run holds the room in the crops' bands for each stage (not changes made by hand on the Setup tab)"));
      const ul = el('ul', 'sim-mix-lines');
      ul.append(...m.lines.map((t) => el('li', '', t)));
      mix.append(ul);
      for (const w of m.warnings) mix.append(el('p', 'sim-warn', w));
    }

    const farm = field('farmType', 'Farm type', selectInput(Object.entries(FARM_TYPES).map(([k, f]) => [k, f.name]), state.farmType, (v) => {
      state.farmType = v;
      state.stage = fixStage(v, state.stage);
      stage.replaceChildren(...stageOptions());
      stage.value = state.stage;
      paintMix();
    }));
    const stageOptions = () => stagesOf(state.farmType).map((s) => { const o = el('option', '', STAGES[s]); o.value = s; return o; });
    const stage = el('select');
    stage.append(...stageOptions());
    stage.value = state.stage;
    stage.addEventListener('change', () => { state.stage = stage.value; clearError('stage'); paintMix(); });
    const stageField = field('stage', 'Start stage', stage);

    const farmBox = el('div', 'sizes two');
    farmBox.append(farm, stageField);
    rows();
    box.append(el('p', 'sim-legend', 'Crops in the room'), list, listError, add, farmBox, mix);
    paintMix();
    return box;
  }

  function stepThree() {
    const box = el('div');
    const radios = el('fieldset', 'sim-days');
    radios.append(el('legend', '', 'How long'));
    const whole = wholeProgram(state, cropData);
    const list = el('dl', 'sim-summary');
    const paintSummary = () => {
      list.replaceChildren(...summaryLines(state, room, cropData).flatMap((l) => [el('dt', '', l.label), el('dd', '', l.text)]));
    };
    const daysInput = numberInput(state.days, (v) => { state.days = v; paintSummary(); }, true);
    daysInput.setAttribute('aria-label', 'Days');
    daysInput.dataset.field = 'days';
    daysInput.disabled = state.daysMode !== 'days';
    const choice = (mode, content) => {
      const label = el('label', 'sim-choice');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'sim-days-mode';
      radio.checked = state.daysMode === mode;
      radio.addEventListener('change', () => {
        state.daysMode = mode;
        daysInput.disabled = mode !== 'days';
        clearError('days');
        paintSummary();
      });
      label.append(radio, ...content);
      return label;
    };
    const err = el('p', 'field-error');
    err.dataset.error = 'days';
    err.id = 'sim-days-error';
    err.setAttribute('aria-live', 'polite');
    daysInput.setAttribute('aria-describedby', err.id);
    const wholeText = whole.capped ? `First ${whole.days} days of the program (${whole.total} days in all)` : `Whole program (${whole.days} days)`;
    radios.append(choice('days', [el('span', '', 'Run for'), daysInput, el('span', '', 'days')]), err, choice('whole', [el('span', '', wholeText)]));
    paintSummary();
    box.append(radios, el('h3', 'sim-sub', 'Your choices'), list, suggestBox(paintSummary));
    return box;
  }

  // ---- suggest machines ----

  const sizingActive = () => sizing?.status === 'queued' || sizing?.status === 'running';

  function suggestBox(paintSummary) {
    const box = el('div', 'sim-suggest');
    box.append(el('h3', 'sim-sub', 'Suggest machines'), el('p', 'muted', 'The program tries fan, humidifier, dehumidifier and aircon sizes for the crops of step 2 and the walls and weather of step 1, and lists the setups that keep the room in band for the least energy.'));
    const input = numberInput(targetText, (v) => { targetText = v; }, true);
    const row = el('div', 'sim-target');
    const go = button('Suggest machines for these crops');
    row.append(field('target', 'Target (%): time with temperature, humidity and CO₂ all in band', input), go);
    // Enter in the target asks for a suggestion, not the form's Run simulation
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
    const out = el('div', 'sim-suggest-out');
    out.setAttribute('aria-live', 'polite');
    box.append(row, out);

    paintSizing = () => {
      if (!box.isConnected) return;
      const active = sizingActive();
      go.disabled = active || sizingSending;
      input.disabled = active;
      const nodes = [];
      if (sizingText) nodes.push(el('p', 'sim-warn', sizingText));
      if (sizing && active) {
        const progress = el('progress');
        progress.max = 1;
        progress.value = Number.isFinite(sizing.progress) ? sizing.progress : 0;
        progress.setAttribute('aria-label', 'Progress of the suggestion');
        const status = el('p', 'sim-progress', sizingProgress(sizing));
        status.setAttribute('role', 'status');
        const stop = button('Cancel suggestion');
        stop.addEventListener('click', cancelSizing);
        nodes.push(progress, status, stop);
      } else if (sizing?.status === 'failed') {
        nodes.push(el('p', 'sim-warn', sizingProgress(sizing)));
      } else if (sizing?.status === 'done' && sizing.result) {
        nodes.push(...resultView(sizing.result, paintSummary));
      }
      out.replaceChildren(...nodes);
    };

    go.addEventListener('click', async () => {
      const bad = checkTarget(targetText);
      if (bad) { showErrors({ target: bad }); return; }
      const errors = { ...checkStep(1, state), ...checkStep(2, state) };
      if (Object.keys(errors).length) { step = stepOf(firstField(errors)) ?? 1; render(); showErrors(errors); return; }
      await startSizing();
    });
    paintSizing();
    return box;
  }

  function resultView(result, paintSummary) {
    const nodes = [];
    const lines = estimateLines(result.estimate);
    if (lines.length) {
      nodes.push(el('p', 'sim-legend', 'Where the program started'));
      const ul = el('ul', 'sim-mix-lines');
      ul.append(...lines.map((t) => el('li', '', t)));
      nodes.push(ul);
    }
    const rows = sizingRows(result);
    if (rows.length === 0) {
      nodes.push(el('p', 'sim-warn', 'No setup was found.'));
    } else {
      const wrap = el('div', 'us-table-wrap');
      wrap.tabIndex = 0;
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Best setups (scrolls sideways on a narrow screen)');
      const table = el('table', 'us-table sim-setups');
      table.append(el('caption', '', `Best setups over ${result.days} days, in order`));
      const head = el('tr');
      const columns = ['Setup', 'Fan m³/h', 'Humidifier L/h', 'Dehumidifier L/day (0 = none)', 'Aircon', 'Time limit min', 'Temperature %', 'Humidity %', 'CO₂ %', 'All three %', `kWh in ${result.days} days`, ''];
      columns.forEach((c, i) => { const th = el('th', i > 0 && i < columns.length - 1 ? 'num' : '', c); th.scope = 'col'; head.append(th); });
      const thead = el('thead');
      thead.append(head);
      const tbody = el('tbody');
      for (const r of rows) {
        const tr = el('tr');
        const mark = el('th', '', `${r.reached ? '✓ ' : ''}${r.mark}`);
        mark.scope = 'row';
        tr.append(mark);
        for (const v of [r.fan, r.humidifier, r.dehumidifier, r.aircon, r.limit, r.t, r.rh, r.co2, r.all, r.kWh]) tr.append(el('td', 'num', v));
        const use = button('Use this');
        use.setAttribute('aria-label', `Use setup ${r.index + 1}`);
        use.addEventListener('click', () => {
          useSetup(state, result.best[r.index], roomControl);
          paintSummary();
          use.textContent = 'Used';
          formError.hidden = true;
        });
        const cell = el('td');
        cell.append(use);
        tr.append(cell);
        tbody.append(tr);
      }
      table.append(thead, tbody);
      wrap.append(table);
      nodes.push(wrap);
      if (!rows.some((r) => r.reached)) nodes.push(el('p', 'sim-warn', `No setup reached ${result.target} %.`));
    }
    for (const n of result.notes ?? []) nodes.push(el('p', 'us-note', n));
    return nodes;
  }

  async function startSizing() {
    sizingSending = true;
    sizingText = '';
    sizing = null;
    paintSizing();
    try {
      const created = await request('POST', `/api/rooms/${room.id}/sizing`, sizingBody(state, targetText));
      if (!alive()) { request('DELETE', `/api/sizing/${created.id}`).catch(() => {}); return; }
      sizing = created;
      pollSizing();
    } catch (err) {
      if (!alive()) return;
      if (err.status === 400 && err.field && err.field !== 'target' && stepOf(err.field) && stepOf(err.field) !== 3) {
        step = stepOf(err.field);
        render();
        showErrors({ [err.field]: err.message });
      } else if (err.status === 400 && err.field === 'target') {
        showErrors({ target: err.message });
      } else if (routeMissing(err)) {
        sizingText = OUTDATED;
      } else if (err.status === 404) {
        sizingText = GONE;
      } else {
        sizingText = err.status === 0 ? `${OFFLINE}. Try again.` : err.message;
      }
    } finally {
      sizingSending = false;
      paintSizing();
    }
  }

  function pollSizing() {
    clearTimeout(sizingTimer);
    const job = sizing;
    paintSizing();
    if (!sizingActive()) return;
    sizingTimer = setTimeout(() => checkSizing(job), fallbackMs(SIZING_POLL_MS, live.connected()));
  }

  // One look at the suggestion: on the timer, or at once when the stream says it moved.
  async function checkSizing(job) {
    clearTimeout(sizingTimer);
    if (!alive() || sizing !== job) return;
    try {
      const latest = await request('GET', `/api/sizing/${job.id}`);
      if (!alive() || sizing !== job) return;
      // ids start again after a restart of the farm app: another room's job with the same id is not this one
      if (latest.roomId !== room.id) { sizing = null; sizingText = 'This suggestion is gone'; paintSizing(); return; }
      if (isStale(sizing, latest)) return pollSizing(); // an event told more since it was asked
      sizing = latest;
    } catch (err) {
      if (!alive() || sizing !== job) return;
      if (err.status === 404) { sizing = null; sizingText = 'This suggestion is gone'; paintSizing(); return; }
    }
    pollSizing();
  }

  async function cancelSizing() {
    const job = sizing;
    clearTimeout(sizingTimer);
    sizing = null;
    sizingText = '';
    paintSizing();
    try { await request('DELETE', `/api/sizing/${job.id}`); } catch { /* it ended or is gone already */ }
  }

  const STEP_VIEWS = [stepOne, stepTwo, stepThree];

  function render() {
    marks.replaceChildren(...STEPS.map((name, i) => {
      const li = el('li', '', name);
      if (i + 1 === step) li.setAttribute('aria-current', 'step');
      return li;
    }));
    formError.hidden = true;
    body.replaceChildren(STEP_VIEWS[step - 1]());
    const back = button('Back');
    back.hidden = step === 1;
    back.addEventListener('click', () => { step--; render(); body.querySelector('input, select')?.focus(); });
    const cancel = button('Cancel');
    cancel.addEventListener('click', () => d.close());
    const next = button(step === 3 ? 'Run simulation' : 'Next', 'primary', 'submit');
    actions.replaceChildren(cancel, back, next);
  }

  // ---- moving on ----

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state || run || sending) return;
    const errors = checkStep(step, state);
    if (Object.keys(errors).length) { showErrors(errors); return; }
    if (step < 3) {
      step++;
      render();
      body.querySelector('input, select')?.focus();
      return;
    }
    await start();
  });

  async function start() {
    // A run waits behind a suggestion on the farm's one queue: stop the suggestion first (its table goes with the step).
    if (sizingActive()) await cancelSizing();
    sending = true;
    const submit = actions.querySelector('.primary');
    submit.disabled = true;
    try {
      const created = await request('POST', `/api/rooms/${room.id}/simulations`, buildBody(state, cropData));
      hooks.onStarted?.(created); // also when the dialog was closed meanwhile: the run exists
      if (!alive()) return;
      run = created;
      paintRun();
      poll();
    } catch (err) {
      if (!alive()) return;
      submit.disabled = false;
      if (err.status === 400 && stepOf(err.field)) {
        step = stepOf(err.field);
        render();
        showErrors({ [err.field]: err.message });
      } else if (routeMissing(err)) {
        showFormError(OUTDATED);
      } else if (err.status === 404) {
        showFormError(GONE);
      } else {
        showFormError(err.status === 0 ? `${OFFLINE}. Try again.` : err.message);
      }
    } finally {
      sending = false;
    }
  }

  // ---- the run ----

  function paintRun() {
    marks.hidden = true;
    const progress = el('progress');
    progress.max = 1;
    progress.value = run.status === 'done' ? 1 : Number.isFinite(run.progress) ? run.progress : 0;
    progress.setAttribute('aria-label', 'Progress of the simulation');
    const status = el('p', 'sim-progress', progressLine(run));
    status.setAttribute('role', 'status');
    const finished = run.status === 'done' || run.status === 'failed';
    const open = el('a', 'button primary', 'Open results');
    open.href = `#/rooms/${room.id}/simulations/${run.id}`;
    open.addEventListener('click', () => d.close());
    open.hidden = run.status === 'failed';
    const close = button('Close');
    close.addEventListener('click', () => d.close());
    body.replaceChildren(run.status === 'failed' ? el('p', 'sim-warn', progressLine(run)) : progress, ...(run.status === 'failed' ? [] : [status]),
      ...(finished ? [] : [el('p', 'muted', 'The simulation goes on if you close this window. Its page shows it when it is ready.')]));
    actions.replaceChildren(close, open);
    (finished && run.status === 'done' ? open : close).focus();
  }

  function poll() {
    clearTimeout(timer);
    timer = setTimeout(checkRun, fallbackMs(POLL_MS, live.connected()));
  }

  // One look at the run: on the timer, or at once when the stream says it moved.
  async function checkRun() {
    clearTimeout(timer);
    const over = () => run.status === 'done' || run.status === 'failed'; // an answer that came meanwhile (timer and stream) ended it
    if (!alive() || over()) return;
    try {
      const latest = await request('GET', `/api/simulations/${run.id}?result=0`); // never needs the result
      if (!alive() || over()) return;
      if (isStale(run, latest)) return poll(); // an event told more since it was asked
      run = latest;
      paintRun();
      if (run.status === 'done' || run.status === 'failed') { hooks.onFinished?.(run); return; }
    } catch (err) {
      if (!alive()) return;
      if (err.status === 404) { // deleted meanwhile
        body.replaceChildren(el('p', 'sim-warn', 'This simulation was deleted'));
        return;
      }
    }
    poll();
  }

  // ---- open ----

  body.append(el('p', 'muted', 'Loading…'));
  actions.append(button('Cancel'));
  actions.firstChild.addEventListener('click', () => d.close());
  // The stream says a job moved: look at once instead of waiting for the timer.
  const offLive = [
    live.on('sizing', (data) => {
      if (!alive() || !sizing || data.id !== sizing.id || data.roomId !== room.id || !sizingActive()) return;
      if (data.status === 'done' || data.status === 'failed') return void checkSizing(sizing); // the result, once
      const next = withProgress(sizing, data);
      if (next) { sizing = next; pollSizing(); }
    }),
    live.on('simulation', (data) => {
      if (!alive() || !run || data.id !== run.id || run.status === 'done' || run.status === 'failed') return;
      if (data.status === 'done' || data.status === 'failed') return void checkRun();
      const next = withProgress(run, data);
      if (next) { run = next; paintRun(); poll(); }
    }),
    live.onStatus(() => { // up: look once, in case events were missed; down: the short timers again
      if (!alive()) return;
      if (sizing && sizingActive()) checkSizing(sizing);
      if (run && run.status !== 'done' && run.status !== 'failed') checkRun();
    }),
  ];
  d.addEventListener('close', () => offLive.forEach((off) => off()), { once: true });
  d.addEventListener('close', () => { // a suggestion nobody waits for stops, so the room is free for the next one
    clearTimeout(sizingTimer);
    if (sizingActive()) request('DELETE', `/api/sizing/${sizing.id}`).catch(() => {});
  }, { once: true });
  d.showModal();

  Promise.all([
    request('GET', `/api/rooms/${room.id}/simulations`).catch(() => null), // newest first; optional: the prefill
    request('GET', `/api/rooms/${room.id}/crop`).catch(() => null),
    request('GET', `/api/rooms/${room.id}/control`).catch(() => null), // the room's air exchange time limit
  ]).then(([runs, crop, control]) => {
    if (!alive()) return;
    cropData = crop;
    roomControl = control ? { exchangeMaxMin: Number.isFinite(control.exchangeMaxMin) ? control.exchangeMaxMin : undefined, acDrop: control.acDrop, humidifierDuringExchange: control.humidifierDuringExchange } : null;
    // hooks.from: a run to start from (Simulate again on a result page), else the room's newest
    state = initialState({ room, lastRun: hooks.from ?? (Array.isArray(runs) ? runs[0] ?? null : null), cropData });
    step = 1;
    render();
    body.querySelector('input')?.focus();
  });
}
