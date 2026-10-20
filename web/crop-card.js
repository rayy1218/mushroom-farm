// The Crop and stage card of the room page (spec 2026-10-20-crops-and-simulation-design.md 3.5): the room's crops and farm type,
// the stage and when the next one starts, the program numbers, Start stage and Save. GET and PUT /api/rooms/:id/crop.
// createCropCard(host, { roomId, onChange, onOffline, onGone }) → { refresh(), destroy() }. onChange(): the crops or the stage were
// saved (the bands may have changed). The form is updated in place: a refresh never replaces what the person is editing.

import { request, OFFLINE } from './api.js';
import { CROPS, CROP_KEYS, STAGES, FARM_TYPES, MAX_CROPS } from './crops.js';
import { bandLines, removeLabel } from './simulate-math.js';
import {
  hasCrops, stageLine, nextLine, rampLine, doneLine, cropWarnings, formFromData, checkCropForm, saveBody, newBlocksBody, startBody, FORM_FIELD_ORDER,
} from './crop-math.js';

const REFRESH_MS = 30_000; // the stage line counts days: asked now and then
const COMMAND_TIMEOUT = 30000;

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

const errorText = (err) => (err.status === 0 ? `${OFFLINE}. Try again.` : err.message);

export function createCropCard(host, { roomId, onChange, onOffline, onGone }) {
  let alive = true;
  let seq = 0; // every load or command takes a token; a reply that finds it changed is dropped
  let last = null; // the last reply painted
  let form = null; // the texts of the form
  let dirty = false;
  let busy = false;
  let adding = false; // a room without crops is being given its first
  let timer = null;
  const n = ++uid;

  host.className = 'card crop-card';
  host.append(el('h2', '', 'Crop and stage'));

  // ---- the summary ----
  const none = el('div', 'crop-none');
  const noneText = el('p', 'muted', 'No crop set: the bands are set by hand');
  const addFirst = button('Add crop');
  none.append(noneText, addFirst);
  const summary = el('div', 'crop-summary');
  const stageName = el('p', 'crop-stage');
  const stageMeta = el('p', 'meta');
  const nextMeta = el('p', 'meta');
  const rampMeta = el('p', 'meta');
  const doneMeta = el('p', 'meta warn');
  const newBlocks = button('New blocks');
  newBlocks.title = 'The blocks were replaced: start again at flush 1';
  const bandsMeta = el('p', 'meta');
  const warnings = el('div', 'crop-warnings');
  summary.append(stageName, stageMeta, nextMeta, rampMeta, doneMeta, newBlocks, bandsMeta, warnings);

  // ---- the form ----
  const formBox = el('div', 'crop-form');
  const cropList = el('div', 'sim-crops');
  const addCrop = button('Add crop');
  const errors = new Map(); // field → error node
  const inputs = new Map(); // field → the control to focus

  function errorNode(name, id) {
    const p = el('p', 'field-error');
    p.id = id ?? `crop-${n}-${name.replace('.', '-')}-error`;
    p.setAttribute('aria-live', 'polite');
    errors.set(name, p);
    return p;
  }

  function field(name, label, input) {
    const wrap = el('div', 'field');
    input.id = `crop-${n}-${name.replace('.', '-')}`;
    const lab = el('label', '', label);
    lab.htmlFor = input.id;
    const err = errorNode(name);
    input.setAttribute('aria-describedby', err.id);
    inputs.set(name, input);
    input.addEventListener('input', () => touched(name));
    input.addEventListener('change', () => touched(name));
    wrap.append(lab, input, err);
    return wrap;
  }

  function textInput(whole) {
    const i = el('input');
    i.type = 'text';
    i.inputMode = whole ? 'numeric' : 'decimal';
    i.autocomplete = 'off';
    return i;
  }

  const cropsErr = errorNode('crops');
  inputs.set('crops', cropList);
  const farmSelect = el('select');
  for (const [k, f] of Object.entries(FARM_TYPES)) {
    const o = el('option', '', f.name);
    o.value = k;
    farmSelect.append(o);
  }
  const farmField = field('farmType', 'Farm type', farmSelect);
  const stageSelect = el('select');
  const stageErr = errorNode('stage');
  stageSelect.setAttribute('aria-describedby', stageErr.id);
  stageSelect.id = `crop-${n}-stage`;
  const stageLabel = el('label', '', 'Stage');
  stageLabel.htmlFor = stageSelect.id;
  const atOnce = el('input');
  atOnce.type = 'checkbox';
  atOnce.id = `crop-${n}-atonce`;
  const atOnceLabel = el('label', 'crop-check', 'Bands at once');
  atOnceLabel.htmlFor = atOnce.id;
  atOnceLabel.prepend(atOnce);
  const startBtn = button('Start stage');
  const startRow = el('div', 'crop-start');
  const startField = el('div', 'field');
  startField.append(stageLabel, stageSelect, stageErr);
  startRow.append(startField, startBtn, atOnceLabel);

  const program = el('details', 'crop-program');
  program.append(el('summary', '', 'Program'));
  const flushes = textInput(true);
  const rampH = textInput(false);
  const days = Object.fromEntries(Object.keys(STAGES).map((s) => [s, textInput(true)]));
  const auto = el('input');
  auto.type = 'checkbox';
  auto.id = `crop-${n}-auto`;
  const autoLabel = el('label', 'crop-check', 'Change stages automatically');
  autoLabel.htmlFor = auto.id;
  autoLabel.prepend(auto);
  inputs.set('autoAdvance', auto);
  auto.addEventListener('change', () => touched('autoAdvance'));
  const grid = el('div', 'sizes two');
  const dayFields = Object.fromEntries(Object.entries(days).map(([s, i]) => [s, field(`days.${s}`, `${STAGES[s]} (days)`, i)]));
  grid.append(field('flushes', 'Flushes', flushes), field('rampH', 'Bands move over (hours, 0 = at once)', rampH), ...Object.values(dayFields));
  program.append(grid, autoLabel);

  const save = button('Save', 'primary');
  const reset = button('Reset');
  const unsent = el('span', 'unsent', 'Unsent changes');
  const sendRow = el('div', 'ac-send');
  sendRow.append(save, reset, unsent);
  const saveErr = el('p', 'm-error');
  saveErr.setAttribute('role', 'status');
  saveErr.hidden = true;
  formBox.append(el('p', 'sim-legend', 'Crops in the room'), cropList, cropsErr, addCrop, farmField, program, sendRow, saveErr);

  const loading = el('p', 'muted', 'Loading…');
  none.hidden = true;
  summary.hidden = true;
  startRow.hidden = true;
  formBox.hidden = true;
  host.append(loading, none, summary, startRow, formBox);

  // ---- drawing ----

  function showError(node, textContent) {
    if (node.textContent !== textContent) node.textContent = textContent;
    node.hidden = textContent === '';
  }

  function clearErrors() {
    for (const [name, node] of errors) {
      node.textContent = '';
      inputs.get(name)?.removeAttribute?.('aria-invalid');
    }
    showError(saveErr, '');
  }

  function touched(name) {
    dirty = true;
    syncFromInputs();
    if (name === 'farmType') paintDays();
    errors.get(name) && (errors.get(name).textContent = '');
    inputs.get(name)?.removeAttribute?.('aria-invalid');
    showError(saveErr, '');
    paintDirty();
  }

  function syncFromInputs() {
    form.farmType = farmSelect.value;
    form.flushes = flushes.value;
    form.rampH = rampH.value;
    form.autoAdvance = auto.checked;
    for (const s of Object.keys(days)) form.days[s] = days[s].value;
  }

  function paintDirty() {
    unsent.hidden = !dirty;
    reset.hidden = !dirty;
  }

  // The days of spawn and pinning only for a full-cycle farm.
  function paintDays() {
    const stages = FARM_TYPES[form.farmType].stages;
    for (const s of Object.keys(dayFields)) dayFields[s].hidden = !stages.includes(s);
    if (!hasCrops(last)) fillStageSelect(stages, stageSelect.value);
  }

  function fillStageSelect(stages, value) {
    stageSelect.replaceChildren(...stages.map((s) => { const o = el('option', '', STAGES[s]); o.value = s; return o; }));
    stageSelect.value = stages.includes(value) ? value : stages.includes('fruiting') ? 'fruiting' : stages[0];
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
      select.addEventListener('change', () => { row.crop = select.value; wrap.querySelector('button').setAttribute('aria-label', removeLabel(row.crop)); touched('crops'); });
      const blocks = textInput(true);
      blocks.value = row.blocks;
      blocks.setAttribute('aria-label', `Blocks of crop ${i + 1}`);
      blocks.setAttribute('aria-describedby', cropsErr.id);
      blocks.addEventListener('input', () => { row.blocks = blocks.value; touched('crops'); });
      const remove = button('Remove', 'danger-text');
      remove.setAttribute('aria-label', removeLabel(row.crop));
      remove.addEventListener('click', () => { form.crops.splice(i, 1); touched('crops'); cropRows(); addCrop.focus(); });
      wrap.append(select, blocks, el('span', 'sim-unit', 'blocks'), remove);
      return wrap;
    }));
    addCrop.disabled = form.crops.length >= MAX_CROPS;
  }

  function setInputs(c) {
    form = formFromData(c);
    farmSelect.value = form.farmType;
    flushes.value = form.flushes;
    rampH.value = form.rampH;
    auto.checked = form.autoAdvance;
    for (const s of Object.keys(days)) days[s].value = form.days[s];
    cropRows();
    paintDays();
  }

  function paint(c) {
    last = c;
    loading.hidden = true;
    const has = hasCrops(c);
    none.hidden = has || adding;
    summary.hidden = !has;
    startRow.hidden = !has && !adding; // while the first crops are added it holds the stage they start in
    startBtn.hidden = !has;
    atOnceLabel.hidden = !has;
    formBox.hidden = !has && !adding;
    const now = Date.now();
    if (has) {
      stageName.textContent = STAGES[c.stage] ?? c.stage;
      for (const [node, line] of [[stageMeta, stageLine(c, now)], [nextMeta, nextLine(c)], [rampMeta, rampLine(c, now)], [doneMeta, doneLine(c)]]) {
        node.textContent = line;
        node.hidden = line === '';
      }
      newBlocks.hidden = !c.done;
      bandsMeta.textContent = c.targets ? `Bands for this stage: ${bandLines(c.targets.bands).join(', ')}` : '';
      bandsMeta.hidden = !c.targets;
      warnings.replaceChildren(...cropWarnings(c).map((w) => el('p', 'sim-warn', w)));
      if (!busy) {
        const stages = FARM_TYPES[c.farmType]?.stages ?? FARM_TYPES.ready.stages;
        if (!startRow.contains(document.activeElement)) fillStageSelect(stages, c.stage);
      }
    }
    // A refresh leaves alone what the person is editing, or has edited and not saved.
    const holding = dirty || busy || formBox.contains(document.activeElement);
    if (!holding && (has || !adding)) setInputs(has ? c : { ...c, crops: [] });
    paintDirty();
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

  // A command failed: a 400 goes under its field, anything else next to Save.
  function failed(err, fallback) {
    if (err.status === 404) { onGone?.(); return; }
    const node = err.status === 400 ? errors.get(err.field) : null;
    if (node) {
      node.textContent = err.message;
      const input = inputs.get(err.field);
      input?.setAttribute?.('aria-invalid', 'true');
      if (err.field === 'days.spawn' || err.field.startsWith('days.') || err.field === 'flushes' || err.field === 'rampH') program.open = true;
      (input?.matches?.('input, select') ? input : input?.querySelector?.('select, input') ?? stageSelect).focus();
    } else {
      showError(fallback, errorText(err));
    }
    if (err.status === 0) onOffline?.();
  }

  async function send(body, { fallback = saveErr } = {}) {
    if (busy) return false;
    busy = true;
    seq++;
    save.disabled = true;
    startBtn.disabled = true;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/crop`, body, COMMAND_TIMEOUT);
      if (!alive) return false;
      busy = false;
      dirty = false;
      adding = false;
      last = data;
      paint(data);
      setInputs(data);
      paintDirty();
      onChange?.(data);
      schedule();
      return true;
    } catch (err) {
      if (!alive) return false;
      failed(err, fallback);
      return false;
    } finally {
      busy = false;
      if (alive) {
        save.disabled = false;
        startBtn.disabled = false;
        schedule(); // a failed command must not end the refresh (a reply it made stale was dropped)
      }
    }
  }

  async function onSave() {
    clearErrors();
    syncFromInputs();
    const checked = checkCropForm(form);
    const bad = FORM_FIELD_ORDER.find((f) => checked.errors[f]);
    if (bad) {
      for (const [name, message] of Object.entries(checked.errors)) {
        errors.get(name).textContent = message;
        inputs.get(name)?.setAttribute?.('aria-invalid', 'true');
      }
      if (bad.startsWith('days.') || bad === 'flushes' || bad === 'rampH') program.open = true;
      const first = inputs.get(bad);
      (first.matches('input, select') ? first : first.querySelector('select, input'))?.focus();
      return;
    }
    const body = saveBody(checked.values, last, stageSelect.value);
    if (Object.keys(body).length === 0) { // nothing differs from the room: nothing to send
      dirty = false;
      setInputs(hasCrops(last) ? last : { ...last, crops: [] });
      paintDirty();
      return;
    }
    await send(body);
  }

  addFirst.addEventListener('click', () => {
    adding = true;
    form = formFromData({ ...last, crops: [{ crop: 'oyster', blocks: 500 }] });
    dirty = true;
    setInputs({ ...last, crops: [{ crop: 'oyster', blocks: 500 }] });
    fillStageSelect(FARM_TYPES[form.farmType].stages, last.stage); // the view's stage; a full-cycle farm can pick spawn
    paint(last);
    paintDirty();
    cropList.querySelector('select')?.focus();
  });
  addCrop.addEventListener('click', () => {
    form.crops.push({ crop: CROP_KEYS.find((k) => !form.crops.some((c) => c.crop === k)) ?? CROP_KEYS[0], blocks: '100' });
    touched('crops');
    cropRows();
    cropList.querySelector('.sim-crop-row:last-child input')?.focus();
  });
  save.addEventListener('click', onSave);
  reset.addEventListener('click', () => {
    dirty = false;
    clearErrors();
    if (last) {
      if (!hasCrops(last)) adding = false;
      setInputs(hasCrops(last) ? last : { ...last, crops: [] });
      paint(last);
    }
    save.focus();
  });
  newBlocks.addEventListener('click', async () => {
    syncFromInputs();
    const checked = checkCropForm(form);
    if (checked.errors.crops || checked.values.crops.length === 0) { // the rows are checked like Save does
      showError(saveErr, checked.errors.crops ?? 'Add at least one crop');
      return;
    }
    await send(newBlocksBody(checked.values));
  });
  startBtn.addEventListener('click', async () => {
    showError(stageErr, '');
    const ok = await send(startBody(stageSelect.value, atOnce.checked), { fallback: stageErr });
    if (ok) atOnce.checked = false;
  });

  refresh();

  return {
    refresh,
    destroy() { alive = false; seq++; clearTimeout(timer); host.replaceChildren(); },
  };
}
