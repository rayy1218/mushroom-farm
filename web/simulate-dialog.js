// The Simulate stepper (spec 2026-10-20-crops-and-simulation-design.md section 4.1): step 1 room and machines, step 2 crops,
// step 3 run; then the progress of the run. Shared by the Rooms list and the room page; the dialog is made on first use.
// openSimulateDialog(room, { onStarted(run), onFinished() }); closeSimulateDialog() for a page that goes away.

import { request, OFFLINE } from './api.js';
import { CROPS, CROP_KEYS, STAGES, FARM_TYPES, MAX_CROPS } from './crops.js';
import {
  PHYSICS_FIELDS, initialState, checkStep, firstField, stepOf, buildBody, mixSummary, wholeProgram, stagesOf, fixStage, roomLine,
  summaryLines, progressLine,
} from './simulate-math.js';

const STEPS = ['Room and machines', 'Crops', 'Run'];
const POLL_MS = 2000;

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
    const weatherGrid = el('div', 'sizes two');
    const machineGrid = el('div', 'sizes two');
    for (const f of PHYSICS_FIELDS) {
      const input = numberInput(state.physics[f.key], (v) => { state.physics[f.key] = v; }, f.whole);
      const wrap = field(`physics.${f.key}`, `${f.label} (${f.unit})`, input);
      (['fanFlow', 'acBTU', 'humidifierLH'].includes(f.key) ? machineGrid : weatherGrid).append(wrap);
    }
    weather.append(weatherGrid);
    machines.append(machineGrid);
    box.append(weather, machines);
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
        const select = selectInput(CROP_KEYS.map((k) => [k, CROPS[k].name]), row.crop, (v) => { row.crop = v; paintMix(); });
        select.setAttribute('aria-label', `Crop ${i + 1}`);
        select.dataset.field = i === 0 ? 'crops' : '';
        const blocks = numberInput(row.blocks, (v) => { row.blocks = v; paintMix(); }, true);
        blocks.setAttribute('aria-label', `Blocks of crop ${i + 1}`);
        blocks.dataset.field = '';
        const remove = button('Remove', 'danger-text');
        remove.setAttribute('aria-label', `Remove ${CROPS[row.crop].name}`);
        remove.disabled = state.crops.length === 1;
        remove.addEventListener('click', () => { state.crops.splice(i, 1); clearError('crops'); rows(); paintMix(); add.focus(); });
        wrap.append(select, blocks, el('span', 'sim-unit', 'blocks'), remove);
        return wrap;
      }));
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
      mix.append(el('p', 'sim-mix-title', 'The room is held in these bands'));
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
    box.append(radios, el('h3', 'sim-sub', 'Your choices'), list);
    return box;
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
    sending = true;
    const submit = actions.querySelector('.primary');
    submit.disabled = true;
    try {
      const created = await request('POST', `/api/rooms/${room.id}/simulations`, buildBody(state, cropData));
      if (!alive()) return;
      run = created;
      hooks.onStarted?.(created);
      paintRun();
      poll();
    } catch (err) {
      if (!alive()) return;
      submit.disabled = false;
      if (err.status === 400 && stepOf(err.field)) {
        step = stepOf(err.field);
        render();
        showErrors({ [err.field]: err.message });
      } else if (err.status === 404) {
        showFormError('That room no longer exists');
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
    timer = setTimeout(async () => {
      if (!alive()) return;
      try {
        const latest = await request('GET', `/api/simulations/${run.id}`);
        if (!alive()) return;
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
    }, POLL_MS);
  }

  // ---- open ----

  body.append(el('p', 'muted', 'Loading…'));
  actions.append(button('Cancel'));
  actions.firstChild.addEventListener('click', () => d.close());
  d.showModal();

  Promise.all([
    request('GET', `/api/rooms/${room.id}/simulations`).catch(() => null), // newest first; optional: the prefill
    request('GET', `/api/rooms/${room.id}/crop`).catch(() => null),
  ]).then(([runs, crop]) => {
    if (!alive()) return;
    cropData = crop;
    state = initialState({ room, lastRun: Array.isArray(runs) ? runs[0] ?? null : null, cropData });
    step = 1;
    render();
    body.querySelector('input')?.focus();
  });
}
