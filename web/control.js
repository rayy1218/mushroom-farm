// The Automatic control card on the room page: the Auto switch, the three bands, the air exchange state and the reasons.
// createControl(host, { roomId, onOffline, onGone, onChange }) → { update(data, token) → painted, token(), destroy() }.
// Controls are updated in place, so a refresh never replaces an input the person is using or has edited.

import { request, OFFLINE } from './api.js';
import { BANDS, REASONS, stateLine, inputLabel, reasonLine, checkBand, locateField, bandsBody, HUMIDIFIER_LABEL, humidifierOn } from './control-math.js';

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

export function createControl(host, { roomId, onOffline, onGone, onChange }) {
  let alive = true;
  let version = 0; // bumped by every command, so a refresh that began earlier is dropped
  let inflight = 0;
  let last = null; // the last control object painted
  let dirty = false;
  let saving = false;
  let switching = false;
  let switchingHum = false;
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
    rows.set(band.key, { ...inputs, err, text: '' });
    form.append(row);
  }

  const save = button('Save', 'primary');
  const reset = button('Reset');
  reset.hidden = true;
  const unsent = el('span', 'unsent', 'Unsent changes');
  unsent.hidden = true;
  const sendRow = el('div', 'ac-send');
  sendRow.append(save, reset, unsent);
  const saveErr = errorNode();

  const stateNode = el('p', 'c-state');
  const reasonList = el('ul', 'c-reasons');
  const reasonItems = new Map();
  for (const r of REASONS) {
    const li = el('li', 'meta');
    reasonItems.set(r.key, li);
    reasonList.append(li);
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

  host.append(autoRow, autoErr, form, sendRow, saveErr, humRow, humErr, stateNode, reasonList);

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

  function clearErrors() {
    for (const row of rows.values()) {
      clearInvalid(row);
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

  function setInputs(c) {
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

  function paint(c) {
    last = c;
    paintAuto();
    paintHumidifier();
    // A refresh leaves alone what the person is editing, or has edited and not saved.
    const holding = dirty || saving || form.contains(document.activeElement);
    if (!holding) setInputs(c);
    paintDirty();
    stateNode.textContent = stateLine(c);
    reasonList.hidden = !c.auto; // the reasons are of the last decision: not shown once auto is off
    for (const r of REASONS) reasonItems.get(r.key).textContent = reasonLine(r.label, c.reasons?.[r.key]);
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
    if (firstBad) { firstBad.focus(); return; }
    saving = true;
    const hadFocus = form.contains(document.activeElement) || document.activeElement === save || document.activeElement === reset;
    save.disabled = true;
    reset.disabled = true;
    version++;
    inflight++;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/control`, bandsBody(values), COMMAND_TIMEOUT);
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
        if (at && e.status === 400) {
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
