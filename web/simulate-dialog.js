// The Simulate stepper (spec 2026-10-20-crops-and-simulation-design.md section 4.1): step 1 room and machines, step 2 crops,
// step 3 run; then the progress of the run. Shared by the Rooms list and the room page; the dialog is made on first use.
// openSimulateDialog(room, { onStarted(run), onFinished(), from (a run to simulate again), change (with from: a change to try
// for one run, runTries' control), suggestion ({ input, candidate }: Use this on the Suggest machines page) });
// closeSimulateDialog() for a page that goes away.

import { request, OFFLINE, GONE, OUTDATED, routeMissing } from './api.js';
import { live } from './live.js';
import { fallbackMs, isStale, withProgress } from './live-math.js';
import { suggestHash } from './route.js';
import { CROPS, CROP_KEYS, STAGES, FARM_TYPES, MAX_CROPS } from './crops.js';
import { AC_CLASSES, acClassOf, kwOfBtu, btuOfKw } from './simulation-math.js';
import {
  PHYSICS_FIELDS, PHYSICS_GROUPS, fieldLabel, FILTER_KEYS, initialState, checkStep, firstField, stepOf, buildBody, mixSummary, wholeProgram, stagesOf, fixStage, roomLine,
  summaryLines, progressLine, removeLabel, filterFromRoom, MACHINE_KEYS, machinesLine, useMachines,
  RUN_CONTROL, runControl, setRunControl, resetRunControl, controlText, fixedControlLine, applySuggestion, applyChange, startChoices,
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
  d.dataset.stepper = ''; // one height while the steps show (critique 2026-10-29: Back and Next moved under the pointer)
  const form = el('form');
  form.noValidate = true;
  const title = el('h2', '', `Simulate ${room.name}`);
  title.id = 'sim-title';
  title.tabIndex = -1; // the focus on opening and on each step: a field's focus would pop up a phone's keyboard
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

  // A labelled input with its error line and, when given, a hint; the input is registered under the server's field name.
  function field(name, label, input, hint) {
    const wrap = el('div', 'field');
    const id = `sim-${name.replace('.', '-')}`;
    input.id = id;
    input.dataset.field = name;
    const err = el('p', 'field-error');
    err.id = `${id}-error`;
    err.dataset.error = name;
    err.setAttribute('aria-live', 'polite');
    const lab = el('label', '', label);
    lab.htmlFor = id;
    wrap.append(lab, input);
    if (hint) {
      const h = el('p', 'c-hint', hint);
      h.id = `${id}-hint`;
      wrap.append(h);
    }
    wrap.append(err);
    input.setAttribute('aria-describedby', hint ? `${id}-hint ${err.id}` : err.id);
    return wrap;
  }

  // The aircon: typed in kW (kept in BTU/h, the device app's unit), with the BTU/h class shops sell it by as a picker.
  // onChange: after a change of either.
  function acField(f, onChange) {
    const btu = Number(state.physics[f.key]);
    const shown = /^[0-9]+$/.test(String(state.physics[f.key]).trim()) ? kwOfBtu(btu).toFixed(1) : state.physics[f.key];
    const sold = el('select');
    sold.setAttribute('aria-label', 'Aircon sold as');
    sold.name = 'acClass';
    sold.id = `sim-physics-${f.key}-class`;
    const none = el('option', '', 'Other size');
    none.value = '';
    sold.append(none, ...AC_CLASSES.map((c) => { const o = el('option', '', `${c.toLocaleString('en-US')} BTU/h`); o.value = String(c); return o; }));
    sold.value = String(acClassOf(btu) ?? '');
    const input = numberInput(shown, (v) => {
      const kw = /^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(v.trim()) ? Number(v) : NaN;
      state.physics[f.key] = Number.isFinite(kw) ? String(btuOfKw(kw)) : v; // a text that is not a size stays as typed: the check says so
      sold.value = String(Number.isFinite(kw) ? acClassOf(btuOfKw(kw)) ?? '' : '');
      onChange();
    }, false);
    sold.addEventListener('change', () => {
      if (!sold.value) return;
      state.physics[f.key] = sold.value;
      input.value = kwOfBtu(Number(sold.value)).toFixed(1);
      clearError(`physics.${f.key}`);
      onChange();
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
      for (const node of body.querySelectorAll(`[data-field="${name}"]`)) {
        node.setAttribute('aria-invalid', 'true');
        const fold = node.closest('details');
        if (fold) fold.open = true; // an error in the folded filter shows
      }
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
    // Walls and sun, then Weather (critique 2026-10-29: one grid of the five zigzagged), then the machines
    const groups = {};
    for (const g of PHYSICS_GROUPS) {
      const set = el('fieldset', 'addresses');
      set.append(el('legend', '', g.legend));
      groups[g.key] = el('div', g.key === 'weather' ? 'sizes sim-physics' : 'sizes two sim-physics');
      set.append(groups[g.key]);
      box.append(set);
    }
    const machines = el('fieldset', 'addresses');
    machines.append(el('legend', '', 'Machines'));
    // Where the machines come from (critique 2026-10-29b, owner: the room as it is, the last run's one tap away)
    const from = el('div', 'sim-machines-from');
    const paintFrom = () => {
      const line = machinesLine(state);
      from.replaceChildren(el('p', 'sim-machines-from-text', line.text));
      if (line.action) {
        const use = button(line.action.label);
        use.dataset.machines = line.action.which;
        use.addEventListener('click', () => {
          useMachines(state, line.action.which);
          render();
          body.querySelector('.sim-machines-from button')?.focus(); // the other set's button, where this one was
        });
        from.append(use);
      }
      if (line.note) from.append(el('p', 'c-hint', line.note));
    };
    paintFrom();
    // The intake filter (spec 2026-10-22-filter-design.md 8): the room's settings and its filter's age; with the room's
    // pressure sensor the run changes the filter at the change pressure too. Folded while it holds the room's own values, so
    // the step shows fewer fields at once (critique 2026-10-28); an error in it opens it (showErrors).
    const filter = el('details', 'sim-fold');
    filter.open = !filterFromRoom(state, room);
    const filterTitle = el('summary', '', 'Intake filter');
    if (!filter.open) filterTitle.append(el('span', 'sim-fold-note', "the room's own settings"));
    filter.append(filterTitle);
    const machineGrid = el('div', 'sizes two');
    const filterGrid = el('div', 'sizes two');
    for (const f of PHYSICS_FIELDS) {
      const wrap = f.kw ? acField(f, paintFrom) : field(`physics.${f.key}`, fieldLabel(f), numberInput(state.physics[f.key], (v) => {
        state.physics[f.key] = v;
        if (MACHINE_KEYS.includes(f.key)) paintFrom();
      }, f.whole), f.hint);
      if (FILTER_KEYS.includes(f.key)) filterGrid.append(wrap);
      else (groups[f.group] ?? machineGrid).append(wrap);
    }
    machines.append(from, machineGrid);
    filter.append(filterGrid, el('p', 'c-hint', "Filter change pressure: the pressure sensor's reading at which to change the filter (with the intake running)."),
      el('p', 'c-hint', state.filterSensor
        ? 'The room has a filter pressure sensor: the run also changes the filter at the change pressure.'
        : 'The room has no filter pressure sensor: the run changes the filter only every so many days (0: never).'));
    box.append(machines, filter);
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
        select.name = `crop-${i + 1}`;
        select.setAttribute('aria-describedby', 'sim-crops-error');
        select.dataset.field = i === 0 ? 'crops' : '';
        const blocks = numberInput(row.blocks, (v) => { row.blocks = v; paintMix(); }, true);
        blocks.setAttribute('aria-label', `Blocks of crop ${i + 1}`);
        blocks.name = `blocks-${i + 1}`;
        blocks.setAttribute('aria-describedby', 'sim-crops-error');
        blocks.dataset.field = '';
        const remove = button('Remove', 'danger-text');
        remove.setAttribute('aria-label', removeLabel(row.crop));
        remove.hidden = state.crops.length === 1; // the only crop stays (a disabled Remove wrapped to a row of its own on a phone)
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

    const farmBox = el('div', 'sim-farm'); // one under the other: the farm types' names need the width
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
    daysInput.name = 'days';
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
    // Start from: a room that is running, or one just loaded at the heat of the day (its cool-down)
    const starts = el('fieldset', 'sim-days');
    starts.append(el('legend', '', 'Start from'));
    for (const c of startChoices) {
      const label = el('label', 'sim-choice');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'sim-start';
      radio.checked = state.start === c.value;
      radio.addEventListener('change', () => { state.start = c.value; paintSummary(); });
      label.append(radio, el('span', '', c.label));
      starts.append(label);
    }
    paintSummary();
    const control = controlBox(paintSummary);
    box.append(radios, starts, el('h3', 'sim-sub', 'Your choices'), list, control.node, suggestLink());
    return box;
  }

  // Suggest machines has a page of its own (owner 2026-10-28): the search and its table did not fit this dialog.
  function suggestLink() {
    const p = el('p', 'sim-suggest');
    const link = el('a', 'sim-suggest-link', 'Suggest machines instead →');
    link.href = suggestHash(room.id);
    link.addEventListener('click', () => d.close());
    p.append(el('span', 'muted', 'Not sure which machines? '), link);
    return p;
  }

  // Change for this run (critique 2026-10-28): the control settings the server takes for one run, prefilled with the room's;
  // the fresh air interval only as the room has it. Open while the run has settings of its own (or an error in them).
  function controlBox(paintSummary) {
    const fold = el('details', 'sim-fold sim-run-control');
    const head = el('summary', '', 'Change for this run');
    const note = el('span', 'sim-fold-note');
    head.append(note);
    const inner = el('div');
    fold.append(head, inner);
    const paintNote = () => {
      const n = Object.keys(runControl(state).own).length;
      note.textContent = n ? `${n} ${n === 1 ? 'setting' : 'settings'} for this run` : "the room's own settings";
      reset.hidden = n === 0;
    };
    const reset = button("Use the room's settings");
    reset.addEventListener('click', () => {
      resetRunControl(state);
      paintSummary();
      paint();
      head.focus(); // the button hides with nothing of the run's own left
    });
    function paint() {
      const numbers = el('div', 'sizes two');
      const switches = el('div', 'sim-switches');
      for (const f of RUN_CONTROL) {
        if (!f.switch) {
          numbers.append(field(`control.${f.key}`, f.label, numberInput(controlText(state, f.key), (v) => {
            setRunControl(state, f.key, v);
            paintSummary();
            paintNote();
          }, f.whole)));
          continue;
        }
        const id = `sim-control-${f.key}`;
        const box = el('input');
        box.type = 'checkbox';
        box.id = id;
        box.name = f.key;
        box.dataset.field = `control.${f.key}`;
        box.checked = runControl(state).values[f.key] !== false;
        box.addEventListener('change', () => { setRunControl(state, f.key, box.checked); clearError(box.dataset.field); paintSummary(); paintNote(); });
        const label = el('label', 'sim-check');
        label.htmlFor = id;
        label.append(box, el('span', '', f.label));
        const err = el('p', 'field-error');
        err.id = `${id}-error`;
        err.dataset.error = `control.${f.key}`;
        err.setAttribute('aria-live', 'polite');
        box.setAttribute('aria-describedby', err.id);
        switches.append(label, err);
      }
      const fixed = fixedControlLine(state);
      inner.replaceChildren(numbers, switches, ...(fixed ? [el('p', 'c-hint', fixed)] : []), reset);
      paintNote();
    }
    paint();
    fold.open = Object.keys(runControl(state).own).length > 0 || hooks.change !== undefined;
    return { node: fold, paint };
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
    back.addEventListener('click', () => { step--; render(); title.focus(); });
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
      title.focus();
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
    delete d.dataset.stepper;
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
    live.on('simulation', (data) => {
      if (!alive() || !run || data.id !== run.id || run.status === 'done' || run.status === 'failed') return;
      if (data.status === 'done' || data.status === 'failed') return void checkRun();
      const next = withProgress(run, data);
      if (next) { run = next; paintRun(); poll(); }
    }),
    live.onStatus(() => { // up: look once, in case events were missed; down: the short timer again
      if (!alive()) return;
      if (run && run.status !== 'done' && run.status !== 'failed') checkRun();
    }),
  ];
  d.addEventListener('close', () => offLive.forEach((off) => off()), { once: true });
  d.showModal();

  Promise.all([
    request('GET', `/api/rooms/${room.id}/simulations`).catch(() => null), // newest first; optional: the prefill
    request('GET', `/api/rooms/${room.id}/crop`).catch(() => null),
    request('GET', `/api/rooms/${room.id}/control`).catch(() => null), // the room's control settings: step 3's Control row
  ]).then(([runs, crop, control]) => {
    if (!alive()) return;
    cropData = crop;
    // hooks.from: a run to start from (Simulate again on a result page), else the room's newest
    state = initialState({ room, lastRun: hooks.from ?? (Array.isArray(runs) ? runs[0] ?? null : null), cropData, roomControl: control, again: hooks.from ?? null });
    step = 1;
    if (hooks.change) { // Simulate with this change on a result page: the change is filled in, the run is next
      applyChange(state, hooks.change);
      step = 3;
    }
    if (hooks.suggestion) { // Use this on the Suggest machines page: the setup is chosen, the run is next
      applySuggestion(state, hooks.suggestion.input, hooks.suggestion.candidate);
      step = 3;
    }
    render();
    title.focus();
  });
}
