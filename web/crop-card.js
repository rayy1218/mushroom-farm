// The Crop tab as a stage plan (spec 2026-10-26-crop-stage-plan-design.md; replaces the layout of the Crop and stage card of
// spec 2026-10-20-crops-and-simulation-design.md 3.5): the crops and the farm type with Edit crops, one section per stage of
// the farm type (its length, a Current or Next mark, the warnings, Start this stage, a pencil for its days, the Targets
// table), a Stages list down the right with the dates, and the Ramp, Lights from and Automatic change row. GET and PUT
// /api/rooms/:id/crop. The light schedule (spec 2026-10-26-lighting-design.md 8): a Light row in each Targets table, the
// stage's light hours in its pencil, and the time the lights come on in the program row.
// createCropCard(host, { roomId, onChange, onData, onOffline, onGone }) → { refresh(), destroy() }. onChange(): the crops or the
// stage were saved (the bands may have changed); onData(crop): every reply shown (the Room card writes the blocks from it). An
// open editor or pencil is never replaced by a refresh.

import { request, OFFLINE } from './api.js';
import { CROPS, CROP_KEYS, STAGES, FARM_TYPES, MAX_CROPS } from './crops.js';
import { removeLabel } from './simulate-math.js';
import {
  hasCrops, rampLine, doneLine, formFromData, checkCropForm, saveBody, newBlocksBody, startBody,
  stagePlan, stageTargets, stageWarnings, cropHeadline, stageLength, stageMark, lightOf,
} from './crop-math.js';

const REFRESH_MS = 30_000; // the marks count days: asked now and then
const COMMAND_TIMEOUT = 30000;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Small stroke icons (24 × 24) of the Targets rows and the pencil.
const ICONS = {
  t: '<path d="M10 14V5a2 2 0 014 0v9a4 4 0 11-4 0z"/><path d="M12 14v-4"/>',
  rh: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  co2: '<path d="M3 8h10a3 3 0 10-3-3"/><path d="M3 12h15a3 3 0 11-3 3"/><path d="M3 16h7"/>',
  safety: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 8v4"/><path d="M12 15.5v.5"/>',
  light: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 00-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0012 3z"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
};

let uid = 0;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, className) {
  const b = el('button', className ?? '', label);
  b.type = 'button';
  return b;
}

function icon(name, className = 'cp-ico') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  svg.innerHTML = ICONS[name];
  return svg;
}

function textInput(whole) {
  const i = el('input');
  i.type = 'text';
  i.inputMode = whole ? 'numeric' : 'decimal';
  i.autocomplete = 'off';
  return i;
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
  node.hidden = text === '';
}

const errorText = (err) => (err.status === 0 ? `${OFFLINE}. Try again.` : err.message);

export function createCropCard(host, { roomId, onChange, onData, onOffline, onGone }) {
  let alive = true;
  let seq = 0; // every load or command takes a token; a reply that finds it changed is dropped
  let last = null; // the last reply painted
  let busy = false;
  let timer = null;
  let stageKeys = ''; // the stages the sections were built for
  let sections = new Map(); // stage → its section
  let starting = null; // the stage the confirm is for
  let listOpen = false; // a phone shows all of the Stages list
  const n = ++uid;
  const id = (part) => `crop-${n}-${part}`;
  const actionButtons = new Set(); // disabled while a command is out

  host.className = 'card crop-card';

  // ---- the head ----
  const head = el('div', 'cp-head');
  const headText = el('div', 'cp-head-text');
  const title = el('h2', 'cp-title', 'Crop');
  const farm = el('p', 'cp-farm');
  const doneMeta = el('p', 'meta warn');
  headText.append(title, farm, doneMeta);
  const editBtn = button('Edit crops');
  editBtn.setAttribute('aria-expanded', 'false');
  editBtn.setAttribute('aria-controls', id('editor'));
  head.append(headText, editBtn);

  // ---- the crop editor (Edit crops / Add crop) ----
  const editor = el('div', 'cp-editor');
  editor.id = id('editor');
  let form = null; // the texts of the editor
  let editing = false;
  const cropList = el('div', 'sim-crops');
  const cropsErr = el('p', 'field-error');
  cropsErr.id = id('crops-error');
  cropsErr.setAttribute('aria-live', 'polite');
  const addCrop = button('Add crop');
  const farmSelect = el('select');
  for (const [k, f] of Object.entries(FARM_TYPES)) {
    const o = el('option', '', f.name);
    o.value = k;
    farmSelect.append(o);
  }
  const farmField = el('div', 'field');
  farmSelect.id = id('farm');
  const farmLabel = el('label', '', 'Farm type');
  farmLabel.htmlFor = farmSelect.id;
  const farmErr = el('p', 'field-error');
  farmErr.id = id('farm-error');
  farmSelect.setAttribute('aria-describedby', farmErr.id);
  farmField.append(farmLabel, farmSelect, farmErr);
  const startInField = el('div', 'field'); // a room without crops: the stage its first crops start in
  const startIn = el('select');
  startIn.id = id('start-in');
  const startInLabel = el('label', '', 'Start in');
  startInLabel.htmlFor = startIn.id;
  const startInErr = el('p', 'field-error');
  startInErr.id = id('start-in-error');
  startIn.setAttribute('aria-describedby', startInErr.id);
  startInField.append(startInLabel, startIn, startInErr);
  const editorSave = button('Save', 'primary');
  const editorCancel = button('Cancel');
  const newBlocks = button('New blocks');
  newBlocks.title = 'The blocks were replaced: start again at flush 1';
  const editorRow = el('div', 'ac-send');
  editorRow.append(editorSave, editorCancel, newBlocks);
  const editorErr = el('p', 'm-error');
  editorErr.setAttribute('role', 'status');
  editorErr.hidden = true;
  editor.append(el('p', 'sim-legend', 'Crops in the room'), cropList, cropsErr, addCrop, farmField, startInField, editorRow, editorErr);
  editor.hidden = true;
  for (const b of [editorSave, newBlocks]) actionButtons.add(b);
  const editorFields = { errors: new Map([['crops', cropsErr], ['farmType', farmErr], ['stage', startInErr]]), inputs: new Map([['crops', cropList], ['farmType', farmSelect], ['stage', startIn]]), fallback: editorErr };

  // ---- the stages, the Stages list and the program row ----
  const layout = el('div', 'cp-layout');
  const stagesBox = el('div', 'cp-stages');
  const aside = el('nav', 'cp-list');
  aside.setAttribute('aria-labelledby', id('list-title'));
  const listTitle = el('h3', '', 'Stages');
  listTitle.id = id('list-title');
  const steps = el('ol', 'cp-steps');
  const moreBtn = button('', 'cp-more');
  moreBtn.setAttribute('aria-expanded', 'false');
  aside.append(listTitle, steps, moreBtn);

  const program = el('div', 'cp-program');
  const rampField = el('div', 'field cp-ramp');
  const rampInput = textInput(false);
  rampInput.id = id('ramp');
  const rampLabel = el('label', '', 'Ramp (h)');
  rampLabel.htmlFor = rampInput.id;
  const rampErr = el('p', 'field-error');
  rampErr.id = id('ramp-error');
  rampErr.setAttribute('aria-live', 'polite');
  const rampHint = el('p', 'cp-hint', 'The bands move over this many hours when a stage starts (0 = at once)');
  rampHint.id = id('ramp-hint');
  rampInput.setAttribute('aria-describedby', `${rampHint.id} ${rampErr.id}`);
  const rampSave = button('Save');
  const rampRow = el('div', 'cp-inline');
  rampRow.append(rampInput, rampSave);
  rampField.append(rampLabel, rampRow, rampHint, rampErr);
  actionButtons.add(rampSave);
  let rampDirty = false;
  const lightField = el('div', 'field cp-light-start');
  const lightInput = el('input');
  lightInput.type = 'time';
  lightInput.step = '60';
  lightInput.id = id('light-start');
  const lightLabel = el('label', '', 'Lights from');
  lightLabel.htmlFor = lightInput.id;
  const lightErr = el('p', 'field-error');
  lightErr.id = id('light-start-error');
  lightErr.setAttribute('aria-live', 'polite');
  const lightHint = el('p', 'cp-hint', 'The lights come on at this time for the hours of the stage');
  lightHint.id = id('light-start-hint');
  lightInput.setAttribute('aria-describedby', `${lightHint.id} ${lightErr.id}`);
  const lightSave = button('Save');
  const lightRowBox = el('div', 'cp-inline');
  lightRowBox.append(lightInput, lightSave);
  lightField.append(lightLabel, lightRowBox, lightHint, lightErr);
  actionButtons.add(lightSave);
  let lightDirty = false;
  const autoField = el('div', 'cp-auto');
  const auto = el('input');
  auto.type = 'checkbox';
  auto.id = id('auto');
  const autoLabel = el('label', 'crop-check', 'Automatic change');
  autoLabel.htmlFor = auto.id;
  autoLabel.prepend(auto);
  const autoHint = el('p', 'cp-hint', 'The next stage starts by itself when its days are over');
  const autoErr = el('p', 'field-error');
  autoErr.id = id('auto-error');
  autoErr.setAttribute('aria-live', 'polite');
  auto.setAttribute('aria-describedby', autoErr.id);
  autoField.append(autoLabel, autoHint, autoErr);
  const programErr = el('p', 'm-error');
  programErr.setAttribute('role', 'status');
  programErr.hidden = true;
  program.append(rampField, lightField, autoField, programErr);
  const programFields = {
    errors: new Map([['rampH', rampErr], ['lightStart', lightErr], ['autoAdvance', autoErr]]),
    inputs: new Map([['rampH', rampInput], ['lightStart', lightInput], ['autoAdvance', auto]]), fallback: programErr,
  };

  layout.append(stagesBox, aside, program);
  layout.hidden = true;

  // ---- the confirm of Start this stage ----
  const confirm = el('dialog', 'confirm');
  confirm.setAttribute('aria-labelledby', id('confirm-title'));
  const confirmForm = el('form');
  confirmForm.method = 'dialog';
  const confirmTitle = el('h2', '', 'Start this stage?');
  confirmTitle.id = id('confirm-title');
  const confirmText = el('p');
  const atOnce = el('input');
  atOnce.type = 'checkbox';
  atOnce.id = id('atonce');
  const atOnceLabel = el('label', 'crop-check', 'Bands at once');
  atOnceLabel.htmlFor = atOnce.id;
  const confirmActions = el('div', 'actions');
  const confirmCancel = el('button', '', 'Cancel');
  confirmCancel.value = 'cancel';
  const confirmOk = el('button', 'primary', 'Start');
  confirmOk.value = 'start';
  confirmActions.append(confirmCancel, confirmOk);
  confirmForm.append(confirmTitle, confirmText, atOnceLabel, confirmActions);
  confirm.append(confirmForm);

  const loading = el('p', 'muted', 'Loading…');
  head.hidden = true;
  host.append(head, editor, loading, layout, confirm);

  // ---- commands ----

  function clearFields(fields) {
    for (const [name, node] of fields.errors) {
      node.textContent = '';
      fields.inputs.get(name)?.removeAttribute?.('aria-invalid');
    }
    setText(fields.fallback, '');
  }

  // A command failed: a 400 goes under its field, anything else in the fallback line.
  function failed(err, fields) {
    if (err.status === 404) { onGone?.(); return; }
    const node = err.status === 400 ? fields.errors.get(err.field) : null;
    if (node && !node.closest('[hidden]')) { // (the Start in field is there only for a room without crops)
      node.textContent = err.message;
      const input = fields.inputs.get(err.field);
      input?.setAttribute?.('aria-invalid', 'true');
      (input?.matches?.('input, select') ? input : input?.querySelector?.('select, input'))?.focus();
    } else {
      setText(fields.fallback, errorText(err));
    }
    if (err.status === 0) onOffline?.();
  }

  // Shows the form's own errors (checkCropForm) of the given fields; true when there were any.
  function showChecks(errors, fields, names) {
    const bad = names.filter((f) => errors[f]);
    for (const f of bad) {
      fields.errors.get(f).textContent = errors[f];
      fields.inputs.get(f)?.setAttribute?.('aria-invalid', 'true');
    }
    if (bad.length) {
      const first = fields.inputs.get(bad[0]);
      (first.matches('input, select') ? first : first.querySelector('select, input'))?.focus();
    }
    return bad.length > 0;
  }

  async function send(body, fields, after) {
    if (busy) return false;
    busy = true;
    seq++;
    for (const b of actionButtons) b.disabled = true;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/crop`, body, COMMAND_TIMEOUT);
      if (!alive) return false;
      busy = false;
      after?.(data); // closes the editor that sent it before the paint
      paint(data);
      onChange?.(data);
      return true;
    } catch (err) {
      if (!alive) return false;
      failed(err, fields);
      return false;
    } finally {
      busy = false;
      if (alive) {
        for (const b of actionButtons) b.disabled = false;
        schedule(); // a failed command must not end the refresh (a reply it made stale was dropped)
      }
    }
  }

  // ---- the crop editor ----

  function fillStartIn(farmType, value) {
    const stages = FARM_TYPES[farmType].stages;
    startIn.replaceChildren(...stages.map((s) => { const o = el('option', '', STAGES[s]); o.value = s; return o; }));
    startIn.value = stages.includes(value) ? value : stages.includes('fruiting') ? 'fruiting' : stages[0];
  }

  function cropRows() {
    cropList.replaceChildren(...form.crops.map((row, i) => {
      const wrap = el('div', 'sim-crop-row');
      const select = el('select');
      for (const k of CROP_KEYS) {
        const o = el('option', '', CROPS[k].name);
        o.value = k;
        select.append(o);
      }
      select.value = row.crop;
      select.setAttribute('aria-label', `Crop ${i + 1}`);
      select.setAttribute('aria-describedby', cropsErr.id);
      const remove = button('Remove', 'danger-text');
      remove.setAttribute('aria-label', removeLabel(row.crop));
      select.addEventListener('change', () => { row.crop = select.value; remove.setAttribute('aria-label', removeLabel(row.crop)); touchedEditor('crops'); });
      const blocks = textInput(true);
      blocks.value = row.blocks;
      blocks.setAttribute('aria-label', `Blocks of crop ${i + 1}`);
      blocks.setAttribute('aria-describedby', cropsErr.id);
      blocks.addEventListener('input', () => { row.blocks = blocks.value; touchedEditor('crops'); });
      remove.addEventListener('click', () => { form.crops.splice(i, 1); touchedEditor('crops'); cropRows(); addCrop.focus(); });
      wrap.append(select, blocks, el('span', 'sim-unit', 'blocks'), remove);
      return wrap;
    }));
    addCrop.disabled = form.crops.length >= MAX_CROPS;
  }

  function touchedEditor(name) {
    const node = editorFields.errors.get(name);
    if (node) node.textContent = '';
    editorFields.inputs.get(name)?.removeAttribute?.('aria-invalid');
    setText(editorErr, '');
  }

  function openEditor() {
    const first = !hasCrops(last);
    form = formFromData(first ? { ...last, crops: [{ crop: 'oyster', blocks: 500 }] } : last);
    editing = true;
    clearFields(editorFields);
    farmSelect.value = form.farmType;
    fillStartIn(form.farmType, last.stage);
    cropRows();
    paint(last);
    cropList.querySelector('select')?.focus();
  }

  function closeEditor() {
    editing = false;
    form = null;
    editor.hidden = true;
  }

  // The editor's form checked like Save does: → values, or null after showing the errors.
  function checkedEditor() {
    clearFields(editorFields);
    form.farmType = farmSelect.value;
    const checked = checkCropForm(form);
    return showChecks(checked.errors, editorFields, ['crops', 'farmType']) ? null : checked.values;
  }

  editBtn.addEventListener('click', () => {
    if (editing) { closeEditor(); paint(last); editBtn.focus(); return; }
    openEditor();
  });
  addCrop.addEventListener('click', () => {
    form.crops.push({ crop: CROP_KEYS.find((k) => !form.crops.some((c) => c.crop === k)) ?? CROP_KEYS[0], blocks: '100' });
    touchedEditor('crops');
    cropRows();
    cropList.querySelector('.sim-crop-row:last-child input')?.focus();
  });
  farmSelect.addEventListener('change', () => {
    form.farmType = farmSelect.value;
    fillStartIn(form.farmType, startIn.value);
    touchedEditor('farmType');
  });
  startIn.addEventListener('change', () => touchedEditor('stage'));
  editorCancel.addEventListener('click', () => { closeEditor(); paint(last); editBtn.focus(); });
  editorSave.addEventListener('click', async () => {
    const values = checkedEditor();
    if (!values) return;
    const body = saveBody(values, last, startIn.value);
    if (Object.keys(body).length === 0) { closeEditor(); paint(last); editBtn.focus(); return; } // nothing differs: nothing to send
    if (await send(body, editorFields, closeEditor)) editBtn.focus();
  });
  newBlocks.addEventListener('click', async () => {
    const values = checkedEditor();
    if (!values) return;
    if (values.crops.length === 0) { // the rows are checked like Save does
      cropsErr.textContent = 'Add at least one crop';
      cropList.querySelector('select, input')?.focus() ?? addCrop.focus();
      return;
    }
    if (await send(newBlocksBody(values), editorFields, closeEditor)) editBtn.focus();
  });

  // ---- the stage sections ----

  function makeSection(stage) {
    const root = el('section', 'cp-stage');
    root.id = id(`stage-${stage}`);
    root.dataset.stage = stage;
    const top = el('div', 'cp-stage-head');
    const names = el('div', 'cp-stage-names');
    const name = el('h3', 'cp-stage-name', STAGES[stage]);
    name.id = id(`stage-${stage}-name`);
    name.tabIndex = -1;
    root.setAttribute('aria-labelledby', name.id);
    const length = el('span', 'cp-length');
    names.append(name, length);
    const actions = el('div', 'cp-stage-actions');
    const pencil = button('', 'cp-pencil');
    pencil.append(icon('pencil'));
    pencil.setAttribute('aria-label', stage === 'fruiting' ? 'Edit the days, flushes and light of Fruiting' : `Edit the days and light of ${STAGES[stage]}`);
    pencil.title = pencil.getAttribute('aria-label');
    pencil.setAttribute('aria-expanded', 'false');
    const start = button('Start this stage');
    actions.append(pencil, start);
    top.append(names, actions);
    const mark = el('p', 'cp-mark');
    const warnings = el('div', 'cp-warnings');
    const startErr = el('p', 'm-error');
    startErr.setAttribute('role', 'status');
    startErr.hidden = true;

    // the pencil's editor: its days, and on fruiting the flushes
    const edit = el('div', 'cp-edit');
    edit.hidden = true;
    const errors = new Map();
    const inputs = new Map();
    const grid = el('div', 'cp-edit-fields');
    const fieldOf = (key, label) => {
      const wrap = el('div', 'field');
      const input = textInput(true);
      input.id = id(`${stage}-${key.replace('.', '-')}`);
      const lab = el('label', '', label);
      lab.htmlFor = input.id;
      const err = el('p', 'field-error');
      err.id = `${input.id}-error`;
      err.setAttribute('aria-live', 'polite');
      input.setAttribute('aria-describedby', err.id);
      input.addEventListener('input', () => { err.textContent = ''; input.removeAttribute('aria-invalid'); setText(editErr, ''); });
      errors.set(key, err);
      inputs.set(key, input);
      wrap.append(lab, input, err);
      return wrap;
    };
    grid.append(fieldOf(`days.${stage}`, 'Days (1–90)'));
    if (stage === 'fruiting') grid.append(fieldOf('flushes', 'Flushes (1–10)'));
    grid.append(fieldOf(`lightHours.${stage}`, 'Light (h a day, 0–24)'));
    const editSave = button('Save', 'primary');
    const editCancel = button('Cancel');
    const editRow = el('div', 'ac-send');
    editRow.append(editSave, editCancel);
    const editErr = el('p', 'm-error');
    editErr.setAttribute('role', 'status');
    editErr.hidden = true;
    edit.append(grid, editRow, editErr);
    actionButtons.add(editSave);
    actionButtons.add(start);
    const fields = { errors, inputs, fallback: editErr };

    const targetsTitle = el('p', 'cp-targets-title', 'Targets');
    const table = el('table', 'cp-targets');
    table.setAttribute('aria-label', `Targets of ${STAGES[stage]}`);
    const body = el('tbody');
    table.append(body);
    const ramp = el('p', 'meta cp-ramp-line');

    root.append(top, mark, warnings, startErr, edit, targetsTitle, table, ramp);

    const sec = { stage, root, name, length, pencil, start, mark, warnings, startErr, edit, inputs, fields, body, ramp, open: false, rows: '' };

    const close = () => { sec.open = false; edit.hidden = true; pencil.setAttribute('aria-expanded', 'false'); };
    pencil.addEventListener('click', () => {
      if (sec.open) { close(); pencil.focus(); return; }
      sec.open = true;
      clearFields(fields);
      inputs.get(`days.${stage}`).value = String(last.days?.[stage] ?? '');
      inputs.get('flushes') && (inputs.get('flushes').value = String(last.flushes));
      const light = inputs.get(`lightHours.${stage}`);
      light.closest('.field').hidden = !last.lightHours; // an older server has no light schedule
      light.value = String(last.lightHours?.[stage] ?? '');
      edit.hidden = false;
      pencil.setAttribute('aria-expanded', 'true');
      inputs.get(`days.${stage}`).focus();
    });
    editCancel.addEventListener('click', () => { close(); pencil.focus(); });
    editSave.addEventListener('click', async () => {
      clearFields(fields);
      const f = formFromData(last);
      f.days[stage] = inputs.get(`days.${stage}`).value;
      if (inputs.get('flushes')) f.flushes = inputs.get('flushes').value;
      if (f.lightHours) f.lightHours[stage] = inputs.get(`lightHours.${stage}`).value;
      const checked = checkCropForm(f);
      if (showChecks(checked.errors, fields, [...inputs.keys()])) return;
      const body = saveBody(checked.values, last); // only what changed
      if (Object.keys(body).length === 0) { close(); pencil.focus(); return; }
      if (await send(body, fields, close)) pencil.focus();
    });
    start.addEventListener('click', () => {
      setText(startErr, '');
      starting = stage;
      const name = STAGES[stage];
      confirmTitle.textContent = `Start ${name} now?`;
      const ramped = last.rampH > 0;
      confirmText.textContent = (ramped ? `The bands move to the targets of ${name.toLowerCase()} over ${last.rampH} h.` : `The bands change to the targets of ${name.toLowerCase()} at once.`)
        + (last.done ? ' The blocks start again at flush 1.' : '');
      atOnceLabel.textContent = `Bands at once (skip the ${last.rampH} h ramp)`;
      atOnceLabel.prepend(atOnce);
      atOnce.checked = false;
      atOnceLabel.hidden = !ramped;
      confirm.returnValue = '';
      confirm.showModal();
    });
    return sec;
  }

  confirm.addEventListener('close', async () => {
    const stage = starting;
    starting = null;
    if (!alive || confirm.returnValue !== 'start' || !stage) return;
    const sec = sections.get(stage);
    await send(startBody(stage, atOnce.checked), { errors: new Map(), inputs: new Map(), fallback: sec.startErr });
    sec.start.isConnected && !sec.start.hidden ? sec.start.focus() : sec.name.focus();
  });

  function paintSection(sec, c, now) {
    sec.length.textContent = stageLength(c, sec.stage);
    const mark = stageMark(c, sec.stage, now);
    setText(sec.mark, mark.text);
    sec.mark.dataset.kind = mark.kind;
    sec.root.dataset.kind = mark.kind;
    sec.start.hidden = mark.kind === 'current';
    const warnings = stageWarnings(c.crops, sec.stage);
    sec.warnings.replaceChildren(...warnings.map((w) => el('p', 'sim-warn', w)));
    const rows = stageTargets(c.crops, sec.stage, lightOf(c, sec.stage));
    const key = JSON.stringify(rows);
    if (key !== sec.rows) {
      sec.rows = key;
      sec.body.replaceChildren(...rows.map((r) => {
        const tr = el('tr');
        tr.dataset.key = r.key;
        const th = el('th', '');
        th.scope = 'row';
        th.append(icon(r.key), el('span', '', r.name));
        tr.append(th, el('td', '', r.value));
        return tr;
      }));
    }
    setText(sec.ramp, mark.kind === 'current' ? rampLine(c, now) : '');
  }

  // ---- the Stages list ----

  function paintList(c, now) {
    const plan = stagePlan(c, now);
    const focused = steps.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    steps.replaceChildren(...plan.map((e) => {
      const li = el('li', 'cp-step');
      li.dataset.state = e.state;
      const b = button('', 'cp-step-btn');
      b.dataset.key = e.key;
      if (e.state === 'current') b.setAttribute('aria-current', 'step');
      const words = el('span', 'cp-step-words');
      words.append(el('span', 'cp-step-name', e.name));
      if (e.state === 'done') words.append(el('span', 'cp-step-dates', 'Done'));
      else if (e.dates) words.append(el('span', 'cp-step-dates', e.dates));
      b.append(el('span', 'cp-dot'), words);
      b.addEventListener('click', () => {
        if (e.stage === null) { if (!editing) openEditor(); return; } // Replace the blocks: the editor offers New blocks
        const sec = sections.get(e.stage);
        if (!sec) return;
        sec.root.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        sec.name.focus({ preventScroll: true });
      });
      li.append(b);
      return li;
    }));
    if (focused) steps.querySelector(`[data-key="${focused}"]`)?.focus();
    const hiddenCount = plan.filter((e) => e.state !== 'current' && e.state !== 'next').length;
    steps.classList.toggle('open', listOpen);
    moreBtn.textContent = listOpen ? 'Show fewer' : `Show all ${plan.length} stages`;
    moreBtn.setAttribute('aria-expanded', String(listOpen));
    moreBtn.hidden = hiddenCount === 0;
  }

  moreBtn.addEventListener('click', () => { listOpen = !listOpen; paintList(last, Date.now()); });

  // ---- the program row ----

  rampInput.addEventListener('input', () => { rampDirty = true; rampErr.textContent = ''; rampInput.removeAttribute('aria-invalid'); setText(programErr, ''); rampSave.hidden = false; });
  rampInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') rampSave.click(); });
  rampSave.addEventListener('click', async () => {
    clearFields(programFields);
    const f = formFromData(last);
    f.rampH = rampInput.value;
    const checked = checkCropForm(f);
    if (showChecks(checked.errors, programFields, ['rampH'])) return;
    const body = saveBody(checked.values, last);
    if (Object.keys(body).length === 0 || await send(body, programFields)) { // saved (or nothing to save): the room's value again
      rampDirty = false;
      rampInput.value = String(last.rampH);
      rampSave.hidden = true;
    }
  });
  lightInput.addEventListener('input', () => { lightDirty = true; lightErr.textContent = ''; lightInput.removeAttribute('aria-invalid'); setText(programErr, ''); lightSave.hidden = false; });
  lightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') lightSave.click(); });
  lightSave.addEventListener('click', async () => {
    clearFields(programFields);
    const f = formFromData(last);
    f.lightStart = lightInput.value;
    const checked = checkCropForm(f);
    if (showChecks(checked.errors, programFields, ['lightStart'])) return;
    const body = saveBody(checked.values, last);
    if (Object.keys(body).length === 0 || await send(body, programFields)) {
      lightDirty = false;
      lightInput.value = last.lightStart ?? '';
      lightSave.hidden = true;
    }
  });
  auto.addEventListener('change', async () => {
    clearFields(programFields);
    const f = formFromData(last);
    f.autoAdvance = auto.checked;
    const body = saveBody(checkCropForm(f).values, last);
    if (Object.keys(body).length === 0) return;
    if (!(await send(body, programFields))) auto.checked = last.autoAdvance;
  });

  // ---- drawing ----

  function paint(c) {
    last = c;
    onData?.(c);
    loading.hidden = true;
    head.hidden = false;
    const now = Date.now();
    const has = hasCrops(c);
    const line = cropHeadline(c);
    title.textContent = line.title;
    title.classList.toggle('muted', !has);
    setText(farm, line.farm);
    setText(doneMeta, doneLine(c));
    editBtn.textContent = has ? 'Edit crops' : 'Add crop';
    editBtn.hidden = editing;
    editBtn.setAttribute('aria-expanded', String(editing));
    editor.hidden = !editing;
    if (editing) {
      startInField.hidden = has;
      newBlocks.hidden = !c.done;
    }
    layout.hidden = !has;
    if (!has) return;

    // the sections: built again only when the farm type's stages change and no pencil is open
    const stages = (FARM_TYPES[c.farmType] ?? FARM_TYPES.ready).stages;
    if (stages.join() !== stageKeys && ![...sections.values()].some((s) => s.open)) {
      stageKeys = stages.join();
      sections = new Map(stages.map((s) => [s, makeSection(s)]));
      stagesBox.replaceChildren(...[...sections.values()].map((s) => s.root));
    }
    for (const sec of sections.values()) paintSection(sec, c, now);
    paintList(c, now);

    // the program row: a ramp being typed and a command out are left alone
    if (!rampDirty && document.activeElement !== rampInput) {
      rampInput.value = String(c.rampH);
      rampSave.hidden = true;
    }
    lightField.hidden = typeof c.lightStart !== 'string'; // an older server has no light schedule
    if (!lightDirty && document.activeElement !== lightInput) {
      lightInput.value = c.lightStart ?? '';
      lightSave.hidden = true;
    }
    if (!busy) auto.checked = c.autoAdvance !== false;
  }

  // ---- loading ----

  function schedule() {
    clearTimeout(timer);
    if (alive) timer = setTimeout(refresh, REFRESH_MS);
  }

  async function refresh() {
    clearTimeout(timer);
    const me = ++seq;
    try {
      const data = await request('GET', `/api/rooms/${roomId}/crop`);
      if (!alive || me !== seq) return;
      paint(data);
    } catch (err) {
      if (!alive || me !== seq) return;
      if (err.status === 404 && !last) { // an older server without crops: the card stays out of the way
        host.hidden = true;
        return;
      }
      if (err.status === 404) onGone?.();
    }
    schedule();
  }

  refresh();

  return {
    refresh,
    destroy() { alive = false; seq++; clearTimeout(timer); if (confirm.open) confirm.close(); host.replaceChildren(); },
  };
}
