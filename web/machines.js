// The Machines card on the room page: relay module rows and the aircon panel.
// createMachines(host, { roomId, onEdit, onOffline, onGone }) → { update(data, token), token(), destroy() }.
// Controls are updated in place, so a refresh never replaces a button or input the person is using.

import { request, OFFLINE } from './api.js';
import {
  MACHINE_NAMES, MODES, FANS, SETPOINT_MIN, SETPOINT_MAX,
  statusWord, onOff, validSetpoint, describeAc, acBody,
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

function select(options, label) {
  const s = el('select', 'ctl');
  s.setAttribute('aria-label', label);
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

function showError(node, text) {
  node.textContent = text;
  node.hidden = text === '';
}

function errorText(err) {
  return err.status === 0 ? `${OFFLINE}. Try again.` : err.message;
}

function lastWriteText(w) {
  return w && !w.ok ? `Last write failed: ${w.error}` : '';
}

function notWired(text, onEdit) {
  const wrap = el('div', 'not-wired');
  wrap.append(el('p', 'addr', text));
  const edit = button('Edit room');
  edit.dataset.action = 'edit';
  edit.addEventListener('click', onEdit);
  wrap.append(edit);
  return wrap;
}

export function createMachines(host, { roomId, onEdit, onOffline, onGone }) {
  let alive = true;
  let version = 0; // bumped by every command, so a refresh that began earlier is dropped
  let inflight = 0;

  host.className = 'card machines';
  host.append(el('h2', '', 'Machines'));
  const relayHost = el('div', 'm-section');
  const acHost = el('div', 'm-section');
  host.append(relayHost, acHost);

  // A command failed: not-found means the room is gone, anything else is shown next to the control.
  function failed(err, setError) {
    if (err.status === 404) { onGone?.(); return; }
    setError(errorText(err));
    if (err.status === 0) onOffline?.();
  }

  // ---- relay module ----

  let relay = null; // { wired, sig, rows: Map key → row, moduleError }

  function buildRelay(r) {
    relayHost.replaceChildren();
    relayHost.append(el('h3', '', 'Relay module'));
    relay = { wired: r.address != null, sig: null, rows: new Map(), moduleError: null };
    if (!relay.wired) {
      relayHost.append(notWired('No relay module address set', onEdit));
      return;
    }
    relayHost.append(el('p', 'addr', `address ${r.address}`));
    relay.sig = r.machines.map((m) => m.key).join();
    const list = el('div', 'm-rows');
    for (const m of r.machines) {
      const row = el('div', 'm-row');
      row.dataset.key = m.key;
      const name = el('span', 'm-name', MACHINE_NAMES[m.key] ?? m.key);
      const toggle = button('', 'toggle');
      const state = el('span', 'toggle-state');
      toggle.append(el('span', 'sr-only', `${name.textContent}: `), state);
      const reported = el('span', 'm-info');
      const run = el('span', 'run');
      const runText = el('span');
      run.append(el('span', 'run-dot'), runText);
      const status = el('span', 'status');
      const err = el('p', 'm-error');
      err.hidden = true;
      row.append(name, toggle, reported, run, status, err);
      list.append(row);
      const entry = { toggle, state, reported, run, runText, status, err, busy: false, localError: '', commanded: false };
      toggle.addEventListener('click', () => sendRelay(m.key, entry));
      relay.rows.set(m.key, entry);
    }
    relay.moduleError = el('p', 'm-error');
    relay.moduleError.hidden = true;
    relayHost.append(list, relay.moduleError);
  }

  function paintRelay(r) {
    const sig = r.machines?.map((m) => m.key).join() ?? null;
    if (!relay || relay.wired !== (r.address != null) || (relay.wired && relay.sig !== sig)) {
      const hadFocus = relayHost.contains(document.activeElement) ? document.activeElement.closest('.m-row')?.dataset.key : null;
      buildRelay(r);
      if (hadFocus) relay.rows.get(hadFocus)?.toggle.focus();
    }
    if (!relay.wired) return;
    for (const m of r.machines) {
      const row = relay.rows.get(m.key);
      row.commanded = m.commanded;
      row.state.textContent = m.commanded ? 'On' : 'Off';
      row.toggle.dataset.on = String(m.commanded);
      row.toggle.disabled = row.busy;
      row.reported.textContent = `Reported ${onOff(m.reported)}`;
      row.run.dataset.run = String(m.running);
      row.runText.textContent = m.running == null ? 'Running —' : m.running ? 'Running' : 'Stopped';
      setStatus(row.status, m.status);
      showError(row.err, row.localError);
    }
    showError(relay.moduleError, lastWriteText(r.lastWrite));
  }

  async function sendRelay(key, row) {
    if (row.busy) return;
    const hadFocus = document.activeElement === row.toggle;
    row.busy = true;
    row.localError = '';
    row.toggle.disabled = true;
    showError(row.err, '');
    version++;
    inflight++;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/machines/${key}`, { on: !row.commanded });
      if (!alive) return;
      row.busy = false;
      paintAll(data);
    } catch (err) {
      if (!alive) return;
      failed(err, (t) => { row.localError = t; });
      showError(row.err, row.localError);
    } finally {
      inflight--;
      row.busy = false;
      if (alive) {
        row.toggle.disabled = false;
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
    ac = { wired: a.address != null, dirty: false, sending: false, localError: '', draftPower: false };
    if (!ac.wired) {
      acHost.append(notWired('No aircon gateway address set', onEdit));
      return;
    }
    acHost.append(el('p', 'addr', `address ${a.address}`));
    const power = button('', 'toggle');
    const powerState = el('span', 'toggle-state');
    power.append(el('span', 'sr-only', 'Aircon power: '), powerState);
    const mode = select(MODES, 'Aircon mode');
    const setpoint = el('input', 'ctl');
    setpoint.type = 'number';
    setpoint.min = String(SETPOINT_MIN);
    setpoint.max = String(SETPOINT_MAX);
    setpoint.step = '0.5';
    setpoint.inputMode = 'decimal';
    setpoint.setAttribute('aria-label', 'Setpoint (°C)');
    const fan = select(FANS, 'Aircon fan');
    const send = button('Send', 'primary');
    const reset = button('Reset');
    reset.hidden = true;
    const unsent = el('span', 'unsent', 'Unsent changes');
    unsent.hidden = true;

    const field = (label, control) => {
      const f = el('div', 'ac-field');
      f.append(el('span', 'ac-label', label), control);
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
    const err = el('p', 'm-error');
    err.hidden = true;
    acHost.append(status, form, sendRow, info, roomT, code, err);
    Object.assign(ac, { power, powerState, mode, setpoint, fan, send, reset, unsent, info, roomT, status, code, err, form });

    const markDirty = () => {
      ac.dirty = true;
      ac.localError = '';
      showError(err, lastWriteText(lastAc?.lastWrite));
      paintDirty();
    };
    power.addEventListener('click', () => { ac.draftPower = !ac.draftPower; paintPower(); markDirty(); });
    for (const c of [mode, setpoint, fan]) c.addEventListener('input', markDirty);
    reset.addEventListener('click', () => {
      ac.dirty = false;
      setControls(lastAc?.commanded);
      paintDirty();
      ac.send.focus();
    });
    send.addEventListener('click', sendAc);
  }

  function paintPower() {
    ac.powerState.textContent = ac.draftPower ? 'On' : 'Off';
    ac.power.dataset.on = String(ac.draftPower);
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
    for (const c of [ac.power, ac.mode, ac.setpoint, ac.fan, ac.send, ac.reset]) c.disabled = disabled;
  }

  function paintAc(a) {
    lastAc = a;
    if (!ac || ac.wired !== (a.address != null)) buildAc(a);
    if (!ac.wired) return;
    // A refresh leaves alone what the person is editing, or has edited and not sent.
    const holding = ac.dirty || ac.sending || ac.form.contains(document.activeElement);
    if (!holding) setControls(a.commanded);
    paintDirty();
    ac.info.textContent = `Reported: ${describeAc(a.reported)}`;
    ac.roomT.textContent = `Room temperature: ${a.roomT == null ? '—' : `${a.roomT.toFixed(1)} °C`}`;
    setStatus(ac.status, a.status);
    ac.code.hidden = !(a.status === 'fault' && a.errorCode != null);
    ac.code.textContent = `Error code ${a.errorCode}`;
    showError(ac.err, ac.localError || lastWriteText(a.lastWrite));
  }

  async function sendAc() {
    const mine = ac;
    if (mine.sending) return;
    const body = acBody({ power: mine.draftPower, mode: mine.mode.value, setpoint: mine.setpoint.valueAsNumber, fan: mine.fan.value });
    if (!validSetpoint(body.setpoint)) {
      mine.localError = `Setpoint must be ${SETPOINT_MIN} to ${SETPOINT_MAX} °C in steps of 0.5`;
      showError(mine.err, mine.localError);
      mine.setpoint.focus();
      return;
    }
    mine.sending = true;
    mine.localError = '';
    showError(mine.err, '');
    const hadFocus = mine.form.contains(document.activeElement) || document.activeElement === mine.send || document.activeElement === mine.reset;
    setAcDisabled(true);
    version++;
    inflight++;
    try {
      const data = await request('PUT', `/api/rooms/${roomId}/machines/ac`, body);
      if (!alive) return;
      mine.sending = false;
      mine.dirty = false;
      paintAll(data);
    } catch (err) {
      if (!alive) return;
      failed(err, (t) => { mine.localError = t; });
      showError(mine.err, mine.localError);
    } finally {
      inflight--;
      mine.sending = false;
      if (alive && ac === mine) {
        setAcDisabled(false);
        if (hadFocus) mine.send.focus();
      }
    }
  }

  function paintAll(data) {
    paintRelay(data.relay);
    paintAc(data.ac);
  }

  return {
    // Read before starting a fetch; pass it to update() with the reply.
    token() { return version; },
    // Paint a fetched object, unless a command began (or is running) since the fetch started.
    update(data, token) {
      if (!alive || token !== version || inflight > 0) return;
      paintAll(data);
    },
    destroy() { alive = false; host.replaceChildren(); },
  };
}
