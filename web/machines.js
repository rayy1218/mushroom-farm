// The Machines card on the room page: relay module rows and the aircon panel.
// createMachines(host, { roomId, onEdit, onOffline, onGone, onCommand }) → { update(data, token) → painted, token(), setAuto(on),
// destroy() }. onCommand(data) gets the reply of each command the card sent. onEdit(field): "Set address" on a module without
// one ('relayAddress' or 'acAddress').
// Controls are updated in place, so a refresh never replaces a button or input the person is using.

import { request, OFFLINE } from './api.js';
import { formatAgo } from './chart-math.js';
import { AUTO_NOTE } from './control-math.js';
import {
  MACHINE_NAMES, MODES, FANS, SETPOINT_MIN, SETPOINT_MAX,
  shownMachines, statusWord, onOff, validSetpoint, describeAc, acBody, acMatches, lastWriteText as lastWriteMessage,
} from './machines-math.js';

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

const COMMAND_TIMEOUT = 30000; // commands wait in the server's Modbus queue behind other devices

let uid = 0;

function select(options, id) {
  const s = el('select', 'ctl');
  s.id = id;
  for (const [value, text] of Object.entries(options)) {
    const o = el('option', '', text);
    o.value = value;
    s.append(o);
  }
  return s;
}

function setStatus(node, status) {
  node.dataset.status = status;
  node.textContent = statusWord(status);
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

function lastWriteText(w, inSync) {
  return lastWriteMessage(w, Date.now(), inSync, formatAgo);
}

function notWired(text, onEdit) {
  const wrap = el('div', 'not-wired');
  wrap.append(el('p', 'addr', text));
  const edit = button('Set address');
  edit.dataset.action = 'edit';
  edit.addEventListener('click', onEdit);
  wrap.append(edit);
  return wrap;
}

export function createMachines(host, { roomId, onEdit, onOffline, onGone, onCommand }) {
  let alive = true;
  let version = 0; // bumped by every command, so a refresh that began earlier is dropped
  let inflight = 0;
  let autoOn = false; // automatic control is on: the controls are disabled

  host.className = 'card machines';
  host.append(el('h2', '', 'Machines'));
  const autoNote = el('p', 'meta auto-note', AUTO_NOTE);
  autoNote.setAttribute('role', 'status');
  autoNote.hidden = true;
  host.append(autoNote);
  const relayHost = el('div', 'm-section');
  const acHost = el('div', 'm-section');
  host.append(relayHost, acHost);

  // A command failed: not-found means the room is gone, anything else is shown next to the control.
  function failed(err, setError) {
    if (err.status === 404) { onGone?.(); return; } // the room page re-reads the room to decide
    if (err.status === 409) { setAuto(true); return; } // automatic control took over: the note says so
    setError(errorText(err));
    if (err.status === 0) onOffline?.();
  }

  // ---- relay module ----

  let relay = null; // { wired, sig, rows: Map key → row, moduleError }

  function buildRelay(r) {
    relayHost.replaceChildren();
    relayHost.append(el('h3', '', 'Relay module'));
    relay = { wired: r.address != null, sig: null, rows: new Map(), moduleError: null, addr: null };
    if (!relay.wired) {
      relayHost.append(notWired('No relay module address set', () => onEdit('relayAddress')));
      return;
    }
    relay.addr = el('p', 'addr');
    relayHost.append(relay.addr);
    relay.sig = shownMachines(r.machines).map((m) => m.key).join();
    const list = el('div', 'm-rows');
    for (const m of shownMachines(r.machines)) {
      const row = el('div', 'm-row');
      row.dataset.key = m.key;
      const name = el('span', 'm-name', MACHINE_NAMES[m.key] ?? m.key);
      const toggle = button('', 'toggle');
      const state = el('span', 'toggle-state');
      state.setAttribute('aria-hidden', 'true');
      toggle.append(el('span', 'sr-only', name.textContent), state);
      const reported = el('span', 'm-info');
      const run = el('span', 'run');
      const runText = el('span');
      run.append(el('span', 'run-dot'), runText);
      const status = el('span', 'status');
      const err = errorNode();
      row.append(name, toggle, reported, run, status, err);
      list.append(row);
      const entry = { toggle, state, reported, run, runText, status, err, busy: false, localError: '', commanded: false };
      toggle.addEventListener('click', () => sendRelay(m.key, entry));
      relay.rows.set(m.key, entry);
    }
    relay.moduleError = errorNode();
    relayHost.append(list, relay.moduleError);
  }

  function paintRelay(r) {
    const sig = r.machines ? shownMachines(r.machines).map((m) => m.key).join() : null;
    if (!relay || relay.wired !== (r.address != null) || (relay.wired && relay.sig !== sig)) {
      const hadFocus = relayHost.contains(document.activeElement) ? document.activeElement.closest('.m-row')?.dataset.key : null;
      buildRelay(r);
      if (hadFocus) relay.rows.get(hadFocus)?.toggle.focus();
    }
    if (!relay.wired) return;
    relay.addr.textContent = `address ${r.address}`;
    const shown = shownMachines(r.machines);
    for (const m of shown) {
      const row = relay.rows.get(m.key);
      row.commanded = m.commanded;
      paintToggle(row);
      row.reported.textContent = `Reported ${onOff(m.reported)}`;
      row.run.dataset.run = String(m.running);
      row.runText.textContent = m.running == null ? 'Running —' : m.running ? 'Running' : 'Stopped';
      setStatus(row.status, m.status);
      showError(row.err, row.localError);
    }
    // The failure no longer matters once every output reports what was commanded.
    const inSync = shown.every((m) => m.reported === m.commanded);
    showError(relay.moduleError, lastWriteText(r.lastWrite, inSync));
  }

  function paintToggle(row) {
    row.state.textContent = row.busy ? 'Sending…' : row.commanded ? 'On' : 'Off';
    row.toggle.dataset.on = String(row.commanded);
    row.toggle.setAttribute('aria-pressed', String(row.commanded));
    row.toggle.disabled = row.busy || autoOn;
  }

  async function sendRelay(key, row) {
    if (row.busy) return;
    const hadFocus = document.activeElement === row.toggle;
    row.busy = true;
    row.localError = '';
    paintToggle(row);
    showError(row.err, '');
    version++;
    inflight++;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/machines/${key}`, { on: !row.commanded }, COMMAND_TIMEOUT);
      if (!alive) return;
      row.busy = false;
      paintAll(data);
      onCommand?.(data);
    } catch (err) {
      if (!alive) return;
      failed(err, (t) => { row.localError = t; });
      showError(row.err, row.localError);
    } finally {
      inflight--;
      row.busy = false;
      if (alive) {
        paintToggle(row);
        if (hadFocus && !document.activeElement?.closest?.('dialog')) row.toggle.focus();
      }
    }
  }

  // ---- aircon gateway ----

  let ac = null;
  let lastAc = null;

  function buildAc(a) {
    acHost.replaceChildren();
    acHost.append(el('h3', '', 'Aircon'));
    const n = ++uid;
    ac = { wired: a.address != null, dirty: false, sending: false, localError: '', draftPower: false, addr: null };
    if (!ac.wired) {
      acHost.append(notWired('No aircon gateway address set', () => onEdit('acAddress')));
      return;
    }
    ac.addr = el('p', 'addr');
    acHost.append(ac.addr);
    const power = button('', 'toggle');
    const powerState = el('span', 'toggle-state');
    powerState.setAttribute('aria-hidden', 'true');
    power.append(el('span', 'sr-only', 'Aircon power'), powerState);
    const mode = select(MODES, `ac-mode-${n}`);
    const setpoint = el('input', 'ctl');
    setpoint.type = 'number';
    setpoint.min = String(SETPOINT_MIN);
    setpoint.max = String(SETPOINT_MAX);
    setpoint.step = '0.5';
    setpoint.inputMode = 'decimal';
    setpoint.id = `ac-setpoint-${n}`;
    const fan = select(FANS, `ac-fan-${n}`);
    const send = button('Send', 'primary');
    const reset = button('Reset');
    reset.hidden = true;
    const unsent = el('span', 'unsent', 'Unsent changes');
    unsent.hidden = true;

    const field = (label, control) => {
      const f = el('div', 'ac-field');
      let caption;
      if (control.id) {
        caption = el('label', 'ac-label', label);
        caption.htmlFor = control.id;
      } else {
        caption = el('span', 'ac-label', label); // the power button is named by its own text
      }
      f.append(caption, control);
      return f;
    };
    const form = el('div', 'ac-form');
    form.append(field('Power', power), field('Mode', mode), field('Setpoint (°C)', setpoint), field('Fan', fan));
    const sendRow = el('div', 'ac-send');
    sendRow.append(send, reset, unsent);
    const status = el('span', 'status');
    const info = el('p', 'meta ac-reported');
    const roomT = el('p', 'meta ac-roomt');
    const code = el('p', 'meta warn ac-code');
    code.hidden = true;
    const err = errorNode(`ac-error-${n}`);
    acHost.append(status, form, sendRow, info, roomT, code, err);
    Object.assign(ac, { power, powerState, mode, setpoint, fan, send, reset, unsent, info, roomT, status, code, err, form });

    const clearInvalid = () => {
      setpoint.removeAttribute('aria-invalid');
      setpoint.removeAttribute('aria-describedby');
    };
    const markDirty = () => {
      ac.dirty = true;
      ac.localError = '';
      clearInvalid();
      showError(err, lastAcWriteText());
      paintDirty();
    };
    power.addEventListener('click', () => { ac.draftPower = !ac.draftPower; paintPower(); markDirty(); });
    for (const c of [mode, setpoint, fan]) c.addEventListener('input', markDirty);
    reset.addEventListener('click', () => {
      ac.dirty = false;
      ac.localError = '';
      clearInvalid();
      showError(err, lastAcWriteText());
      setControls(lastAc?.commanded);
      paintDirty();
      ac.send.focus();
    });
    send.addEventListener('click', sendAc);
  }

  // The failure no longer matters once the gateway reports what was commanded.
  function lastAcWriteText() {
    return lastWriteText(lastAc?.lastWrite, lastAc ? acMatches(lastAc.commanded, lastAc.reported) : false);
  }

  function paintPower() {
    ac.powerState.textContent = ac.sending ? 'Sending…' : ac.draftPower ? 'On' : 'Off';
    ac.power.dataset.on = String(ac.draftPower);
    ac.power.setAttribute('aria-pressed', String(ac.draftPower));
  }

  function paintDirty() {
    ac.unsent.hidden = !ac.dirty;
    ac.reset.hidden = !ac.dirty;
  }

  function setControls(c) {
    if (!c) return;
    ac.draftPower = c.power;
    paintPower();
    ac.mode.value = c.mode;
    ac.setpoint.value = String(c.setpoint);
    ac.fan.value = c.fan;
  }

  function setAcDisabled(disabled) {
    for (const c of [ac.power, ac.mode, ac.setpoint, ac.fan, ac.send, ac.reset]) c.disabled = disabled || autoOn;
  }

  // Automatic control on or off: shows the note and (un)locks every control.
  function setAuto(on) {
    on = Boolean(on);
    if (on === autoOn) return;
    autoOn = on;
    autoNote.hidden = !on;
    if (relay?.wired) for (const row of relay.rows.values()) paintToggle(row);
    if (ac?.wired) setAcDisabled(ac.sending);
  }

  function paintAc(a) {
    lastAc = a;
    if (!ac || ac.wired !== (a.address != null)) buildAc(a);
    if (!ac.wired) return;
    ac.addr.textContent = `address ${a.address}`;
    // A refresh leaves alone what the person is editing, or has edited and not sent.
    const holding = ac.dirty || ac.sending || ac.form.contains(document.activeElement);
    if (!holding) setControls(a.commanded);
    paintDirty();
    ac.info.textContent = `Reported: ${describeAc(a.reported)}`;
    ac.roomT.textContent = `Room temperature: ${a.roomT == null ? '—' : `${a.roomT.toFixed(1)} °C`}`;
    setStatus(ac.status, a.status);
    ac.code.hidden = !(a.status === 'fault' && a.errorCode != null);
    ac.code.textContent = `Error code ${a.errorCode}`;
    showError(ac.err, ac.localError || lastAcWriteText());
    setAcDisabled(ac.sending);
  }

  async function sendAc() {
    const mine = ac;
    if (mine.sending) return;
    const body = acBody({ power: mine.draftPower, mode: mine.mode.value, setpoint: mine.setpoint.valueAsNumber, fan: mine.fan.value });
    if (!validSetpoint(body.setpoint)) {
      mine.localError = `Setpoint must be ${SETPOINT_MIN} to ${SETPOINT_MAX} °C in steps of 0.5`;
      showError(mine.err, mine.localError);
      mine.setpoint.setAttribute('aria-invalid', 'true');
      mine.setpoint.setAttribute('aria-describedby', mine.err.id);
      mine.setpoint.focus();
      return;
    }
    mine.sending = true;
    mine.localError = '';
    showError(mine.err, '');
    const hadFocus = mine.form.contains(document.activeElement) || document.activeElement === mine.send || document.activeElement === mine.reset;
    setAcDisabled(true);
    paintPower();
    version++;
    inflight++;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/machines/ac`, body, COMMAND_TIMEOUT);
      if (!alive) return;
      mine.sending = false;
      mine.dirty = false;
      paintAll(data);
      onCommand?.(data);
    } catch (err) {
      if (!alive) return;
      failed(err, (t) => { mine.localError = t; });
      showError(mine.err, mine.localError);
    } finally {
      inflight--;
      mine.sending = false;
      if (alive && ac === mine) {
        setAcDisabled(false);
        paintPower();
        if (hadFocus) mine.send.focus();
      }
    }
  }

  function paintAll(data) {
    if (typeof data.auto === 'boolean') setAuto(data.auto);
    paintRelay(data.relay);
    paintAc(data.ac);
  }

  return {
    // Read before starting a fetch; pass it to update() with the reply.
    token() { return version; },
    // Paint a fetched object, unless a command began (or is running) since the fetch started.
    update(data, token) {
      if (!alive || token !== version || inflight > 0) return false;
      paintAll(data);
      return true;
    },
    // The Automatic control card knows better than the machines reply (it is fresher after a switch).
    setAuto,
    destroy() { alive = false; host.replaceChildren(); },
  };
}
