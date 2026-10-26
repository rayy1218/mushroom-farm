// The Automatic control card on the room page: the Auto switch, the three bands, the air exchange state and the reasons.
// createControl(host, { roomId, onOffline, onGone, onChange }) → { update(data, token) → painted, token(), destroy() }.
// Controls are updated in place, so a refresh never replaces an input the person is using or has edited.

import { request, OFFLINE } from './api.js';
import { BANDS, REASONS, reasonsShown, stateLine, inputLabel, reasonLine, checkBand, locateField, SAFETY_FIELDS, checkSafety, locateSafetyField, changedBody, checkLines, heldLine, HUMIDIFIER_LABEL, humidifierOn, OUTDOOR_LABEL, outdoorOn, outdoorNote, AC_FAN_LABEL, AC_FAN_OPTIONS, acFanOf, CONTROL_GROUPS } from './control-math.js';

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

// Writes only when the text changes, so a screen reader does not repeat an unchanged message.
function showError(node, text) {
  if (node.textContent !== text) node.textContent = text;
  node.hidden = text === '';
}

function errorNode(id) {
  const err = el('p', 'm-error');
  err.setAttribute('role', 'status');
  if (id) err.id = id;
  err.hidden = true;
  return err;
}

function errorText(err) {
  return err.status === 0 ? `${OFFLINE}. Try again.` : err.message;
}

export function createControl(host, { roomId, onOffline, onGone, onChange, getRoom }) {
  let alive = true;
  let version = 0; // bumped by every command, so a refresh that began earlier is dropped
  let inflight = 0;
  let last = null; // the last control object painted
  let loaded = null; // the object the inputs were last filled from (Save sends only what differs from it)
  let dirty = false;
  let saving = false;
  let switching = false;
  let switchingHum = false;
  let switchingFan = false;
  const n = ++uid;

  host.className = 'card control';
  host.append(el('h2', '', 'Automatic control'));

  // ---- Auto switch ----
  const autoRow = el('div', 'c-auto');
  const autoName = el('span', 'm-name', 'Auto');
  const autoBtn = button('', 'toggle');
  const autoState = el('span', 'toggle-state');
  autoState.setAttribute('aria-hidden', 'true');
  autoBtn.append(el('span', 'sr-only', 'Auto (automatic control)'), autoState);
  autoRow.append(autoName, autoBtn);
  const autoErr = errorNode();

  // ---- bands ----
  const form = el('div', 'c-bands');
  const rows = new Map(); // band key → { low, high, err, rowError }
  for (const band of BANDS) {
    const row = el('div', 'c-band');
    row.dataset.key = band.key;
    row.append(el('span', 'm-name', `${band.label} (${band.unit})`));
    const inputs = {};
    for (const side of ['low', 'high']) {
      const input = el('input', 'ctl');
      input.type = 'number';
      input.id = `ctl-${n}-${band.key}-${side}`;
      input.min = String(band.min);
      input.max = String(band.max);
      input.step = band.step;
      input.inputMode = 'decimal';
      input.setAttribute('aria-label', inputLabel(band, side));
      const field = el('div', 'ac-field');
      const caption = el('label', 'ac-label', side === 'low' ? 'Low' : 'High');
      caption.htmlFor = input.id;
      field.append(caption, input);
      row.append(field);
      inputs[side] = input;
      input.addEventListener('input', () => markDirty(band));
    }
    const err = errorNode(`ctl-${n}-${band.key}-error`);
    row.append(err);
    if (band.hint) row.append(el('p', 'c-hint', band.hint));
    rows.set(band.key, { ...inputs, err, text: '' });
    form.append(row);
  }

  // ---- safety settings (saved with the bands) ----
  const safetyRows = new Map(); // setting key → { input, err, text }
  for (const f of SAFETY_FIELDS) {
    const row = el('div', 'c-band c-safety');
    row.dataset.key = f.key;
    row.append(el('span', 'm-name', f.label));
    const input = el('input', 'ctl');
    input.type = 'number';
    input.id = `ctl-${n}-${f.key}`;
    input.min = String(f.min);
    input.max = String(f.max);
    input.step = f.step;
    input.inputMode = f.step === '1' ? 'numeric' : 'decimal';
    input.setAttribute('aria-label', f.label);
    const field = el('div', 'ac-field');
    field.append(input);
    row.append(field);
    const err = errorNode(`ctl-${n}-${f.key}-error`);
    row.append(err);
    if (f.hint) row.append(el('p', 'c-hint', f.hint));
    safetyRows.set(f.key, { input, err, text: '' });
    input.addEventListener('input', () => markSafetyDirty(f.key));
    form.append(row);
  }

  // ---- use outdoor air (saved with the bands) ----
  const outdoorRow = el('div', 'c-band c-outdoor');
  const outdoorBox = el('input');
  outdoorBox.type = 'checkbox';
  outdoorBox.id = `ctl-${n}-outdoorAir`;
  const outdoorName = el('label', 'm-name', OUTDOOR_LABEL);
  outdoorName.htmlFor = outdoorBox.id;
  const outdoorHint = el('p', 'c-hint');
  outdoorHint.id = `ctl-${n}-outdoorAir-note`;
  outdoorHint.hidden = true;
  outdoorBox.setAttribute('aria-describedby', outdoorHint.id);
  outdoorRow.append(outdoorBox, outdoorName, outdoorHint);
  // Use outdoor air stays under the groups: it serves all of them (free cooling, drying, waiting out wet air).
  outdoorBox.addEventListener('change', () => {
    dirty = true;
    showError(saveErr, '');
    paintDirty();
  });
  form.append(outdoorRow);

  const save = button('Save', 'primary');
  const reset = button('Reset');
  reset.hidden = true;
  const unsent = el('span', 'unsent', 'Unsent changes');
  unsent.hidden = true;
  const sendRow = el('div', 'ac-send');
  sendRow.append(save, reset, unsent);
  const saveErr = errorNode();

  const stateNode = el('p', 'c-state');
  const checkList = el('ul', 'c-checks'); // a sensor whose last check was not ok
  const reasonItems = new Map(); // machine key → { li, line, held }
  for (const r of REASONS) {
    const li = el('li', 'meta');
    const line = el('span', 'c-reason');
    const held = el('span', 'c-held'); // the wait of the machine protection, under the reason
    held.hidden = true;
    li.append(line, held);
    reasonItems.set(r.key, { li, line, held });
  }

  // ---- humidifier during air exchange (a setting of its own: sent at once, not part of Save) ----
  const humRow = el('div', 'c-humidifier');
  const humName = el('span', 'm-name', HUMIDIFIER_LABEL);
  const humBtn = button('', 'toggle');
  const humState = el('span', 'toggle-state');
  humState.setAttribute('aria-hidden', 'true');
  humBtn.append(el('span', 'sr-only', HUMIDIFIER_LABEL), humState);
  humRow.append(humName, humBtn);
  const humErr = errorNode();

  // ---- aircon fan (a setting of its own: sent at once, not part of Save) ----
  const fanRow = el('div', 'c-acfan');
  const fanLabel = el('label', 'm-name', AC_FAN_LABEL);
  const fanSelect = el('select', 'ctl');
  fanSelect.id = `ctl-${n}-acfan`;
  fanLabel.htmlFor = fanSelect.id;
  for (const o of AC_FAN_OPTIONS) {
    const opt = el('option', '', o.label);
    opt.value = o.value;
    fanSelect.append(opt);
  }
  const fanState = el('span', 'unsent');
  fanState.hidden = true;
  fanRow.append(fanLabel, fanSelect, fanState);
  const fanErr = errorNode();

  // ---- the groups: CO₂, Temperature, Humidity, Air circulation, each with its rows, its own settings and its reasons ----
  const rowOf = (key) => form.querySelector(`[data-key="${key}"]`);
  const own = { acFan: [fanRow, fanErr], humidifier: [humRow, humErr] };
  const reasonLists = [];
  const groups = [];
  for (const g of CONTROL_GROUPS) {
    const box = el('section', 'c-group');
    box.dataset.group = g.key;
    box.append(el('h3', 'c-group-title', g.title));
    for (const key of g.fields) box.append(rowOf(key));
    for (const key of g.own) box.append(...own[key]);
    const list = el('ul', 'c-reasons');
    for (const key of g.reasons) list.append(reasonItems.get(key).li);
    reasonLists.push(list);
    box.append(list);
    groups.push(box);
  }
  // What is left in the form, Use outdoor air, serves all of them: a box of its own after the groups.
  form.classList.add('c-group');
  form.dataset.group = 'outdoor';
  form.prepend(el('h3', 'c-group-title', 'Outdoor air'));

  host.append(autoRow, autoErr, ...groups, form, sendRow, saveErr, stateNode, checkList);

  // ---- drawing ----

  function clearInvalid(row) {
    for (const side of ['low', 'high']) {
      row[side].removeAttribute('aria-invalid');
      row[side].removeAttribute('aria-describedby');
    }
  }

  function markInvalid(row, side, text) {
    clearInvalid(row);
    row.text = text;
    showError(row.err, text);
    row[side].setAttribute('aria-invalid', 'true');
    row[side].setAttribute('aria-describedby', row.err.id);
  }

  function clearSafetyInvalid(row) {
    row.input.removeAttribute('aria-invalid');
    row.input.removeAttribute('aria-describedby');
  }

  function markSafetyInvalid(key, text) {
    const row = safetyRows.get(key);
    clearSafetyInvalid(row);
    row.text = text;
    showError(row.err, text);
    row.input.setAttribute('aria-invalid', 'true');
    row.input.setAttribute('aria-describedby', row.err.id);
  }

  function clearErrors() {
    for (const row of rows.values()) {
      clearInvalid(row);
      row.text = '';
      showError(row.err, '');
    }
    for (const row of safetyRows.values()) {
      clearSafetyInvalid(row);
      row.text = '';
      showError(row.err, '');
    }
    showError(saveErr, '');
  }

  function paintDirty() {
    unsent.hidden = !dirty;
    reset.hidden = !dirty;
  }

  function markDirty(band) {
    dirty = true;
    const row = rows.get(band.key);
    clearInvalid(row);
    row.text = '';
    showError(row.err, '');
    showError(saveErr, '');
    paintDirty();
  }

  function markSafetyDirty(key) {
    dirty = true;
    const row = safetyRows.get(key);
    clearSafetyInvalid(row);
    row.text = '';
    showError(row.err, '');
    showError(saveErr, '');
    paintDirty();
  }

  function setInputs(c) {
    loaded = c;
    for (const f of SAFETY_FIELDS) if (c[f.key] !== undefined) safetyRows.get(f.key).input.value = String(c[f.key]);
    outdoorBox.checked = outdoorOn(c);
    for (const band of BANDS) {
      const row = rows.get(band.key);
      row.low.value = String(c[band.low]);
      row.high.value = String(c[band.high]);
    }
  }

  function paintAuto() {
    const on = Boolean(last?.auto);
    autoState.textContent = switching ? 'Sending…' : on ? 'On' : 'Off';
    autoBtn.dataset.on = String(on);
    autoBtn.setAttribute('aria-pressed', String(on));
    autoBtn.disabled = switching;
  }

  function paintHumidifier() {
    const on = humidifierOn(last);
    humState.textContent = switchingHum ? 'Sending…' : on ? 'On' : 'Off';
    humBtn.dataset.on = String(on);
    humBtn.setAttribute('aria-pressed', String(on));
    humBtn.disabled = switchingHum;
  }

  function paintFan() {
    fanSelect.value = acFanOf(last);
    fanSelect.disabled = switchingFan;
    fanState.textContent = switchingFan ? 'Sending…' : '';
    fanState.hidden = !switchingFan;
  }

  function paint(c) {
    last = c;
    paintAuto();
    paintHumidifier();
    paintFan();
    // A refresh leaves alone what the person is editing, or has edited and not saved.
    const holding = dirty || saving || form.contains(document.activeElement);
    if (!holding) setInputs(c);
    paintDirty();
    stateNode.textContent = stateLine(c);
    const note = outdoorNote(c);
    outdoorHint.textContent = note;
    outdoorHint.hidden = note === '';
    const lines = checkLines(c.checks);
    checkList.replaceChildren(...lines.map((text) => el('li', 'warn', text)));
    checkList.hidden = lines.length === 0;
    for (const list of reasonLists) list.hidden = !c.auto; // the reasons are of the last decision: not shown once auto is off
    const shown = reasonsShown(getRoom?.()?.dehumidifier === true);
    for (const r of REASONS) {
      const item = reasonItems.get(r.key);
      item.li.hidden = !shown.includes(r);
      item.line.textContent = reasonLine(r.label, c.reasons?.[r.key]);
      const held = heldLine(c, r.key);
      if (item.held.textContent !== held) item.held.textContent = held;
      item.held.hidden = held === '';
    }
  }

  // A command failed: not-found means the room is gone, anything else is shown next to the control.
  function failed(err, show) {
    if (err.status === 404) { onGone?.(); return; } // the room page re-reads the room to decide
    show(err);
    if (err.status === 0) onOffline?.();
  }

  // ---- commands ----

  async function toggleAuto() {
    if (switching || !last) return;
    const hadFocus = document.activeElement === autoBtn;
    switching = true;
    paintAuto();
    showError(autoErr, '');
    version++;
    inflight++;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/control`, { auto: !last.auto }, COMMAND_TIMEOUT);
      if (!alive) return;
      paint(data);
      onChange?.(data);
    } catch (err) {
      if (!alive) return;
      failed(err, (e) => showError(autoErr, errorText(e)));
    } finally {
      inflight--;
      switching = false;
      if (alive) {
        paintAuto();
        if (hadFocus && !document.activeElement?.closest?.('dialog')) autoBtn.focus();
      }
    }
  }

  async function toggleHumidifier() {
    if (switchingHum || !last) return;
    const hadFocus = document.activeElement === humBtn;
    switchingHum = true;
    paintHumidifier();
    showError(humErr, '');
    version++;
    inflight++;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/control`, { humidifierDuringExchange: !humidifierOn(last) }, COMMAND_TIMEOUT);
      if (!alive) return;
      paint(data);
      onChange?.(data);
    } catch (err) {
      if (!alive) return;
      failed(err, (e) => showError(humErr, errorText(e)));
    } finally {
      inflight--;
      switchingHum = false;
      if (alive) {
        paintHumidifier();
        if (hadFocus && !document.activeElement?.closest?.('dialog')) humBtn.focus();
      }
    }
  }

  async function changeFan() {
    if (switchingFan || !last) return;
    const wanted = fanSelect.value;
    if (wanted === acFanOf(last)) return;
    const hadFocus = document.activeElement === fanSelect;
    switchingFan = true;
    fanSelect.value = wanted;
    fanSelect.disabled = true;
    fanState.textContent = 'Sending…';
    fanState.hidden = false;
    showError(fanErr, '');
    version++;
    inflight++;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/control`, { acFan: wanted }, COMMAND_TIMEOUT);
      if (!alive) return;
      switchingFan = false;
      paint(data);
      onChange?.(data);
    } catch (err) {
      if (!alive) return;
      failed(err, (e) => showError(fanErr, errorText(e)));
    } finally {
      inflight--;
      switchingFan = false;
      if (alive) {
        paintFan();
        if (hadFocus && !document.activeElement?.closest?.('dialog')) fanSelect.focus();
      }
    }
  }

  async function saveBands() {
    if (saving || !last) return;
    clearErrors();
    const values = {};
    let firstBad = null;
    for (const band of BANDS) {
      const row = rows.get(band.key);
      values[band.low] = row.low.valueAsNumber;
      values[band.high] = row.high.valueAsNumber;
      const bad = checkBand(band, values[band.low], values[band.high]);
      if (bad) {
        markInvalid(row, bad.field, bad.message);
        firstBad ??= row[bad.field];
      }
    }
    for (const f of SAFETY_FIELDS) values[f.key] = safetyRows.get(f.key).input.valueAsNumber;
    values.outdoorAir = outdoorBox.checked;
    if (!firstBad) {
      const bad = checkSafety(values.co2High, values.co2Safety, values.exchangeMaxMin, values.acDrop, values.exchangeEveryMin);
      if (bad) {
        markSafetyInvalid(bad.field, bad.message);
        firstBad = safetyRows.get(bad.field).input;
      }
    }
    if (firstBad) { firstBad.focus(); return; }
    const body = changedBody(values, loaded);
    if (Object.keys(body).length === 0) { // nothing differs from what was loaded: nothing to send
      dirty = false;
      if (last) setInputs(last);
      paintDirty();
      return;
    }
    saving = true;
    const hadFocus = form.contains(document.activeElement) || document.activeElement === save || document.activeElement === reset;
    save.disabled = true;
    reset.disabled = true;
    version++;
    inflight++;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/control`, body, COMMAND_TIMEOUT);
      if (!alive) return;
      saving = false;
      dirty = false;
      setInputs(data);
      paint(data);
      onChange?.(data);
    } catch (err) {
      if (!alive) return;
      failed(err, (e) => {
        const at = locateField(e.field);
        const safety = locateSafetyField(e.field);
        if (safety && e.status === 400) {
          markSafetyInvalid(safety.key, e.message);
          safetyRows.get(safety.key).input.focus();
        } else if (at && e.status === 400) {
          const row = rows.get(at.band.key);
          markInvalid(row, at.side, e.message);
          row[at.side].focus();
        } else {
          showError(saveErr, errorText(e));
        }
      });
    } finally {
      inflight--;
      saving = false;
      if (alive) {
        save.disabled = false;
        reset.disabled = false;
        if (hadFocus && !document.activeElement?.closest?.('dialog') && !form.contains(document.activeElement)) save.focus();
      }
    }
  }

  autoBtn.addEventListener('click', toggleAuto);
  humBtn.addEventListener('click', toggleHumidifier);
  fanSelect.addEventListener('change', changeFan);
  save.addEventListener('click', saveBands);
  reset.addEventListener('click', () => {
    dirty = false;
    clearErrors();
    if (last) setInputs(last);
    paintDirty();
    save.focus();
  });

  return {
    // Read before starting a fetch; pass it to update() with the reply.
    token() { return version; },
    // Paint a fetched object, unless a command began (or is running) since the fetch started. Returns whether it painted.
    update(data, token) {
      if (!alive || token !== version || inflight > 0) return false;
      paint(data);
      return true;
    },
    destroy() { alive = false; host.replaceChildren(); },
  };
}
