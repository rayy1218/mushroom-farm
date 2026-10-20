// Device control page: table of sensors, relay modules and aircon gateways (edit in place), add form, simulated rooms, request log. Refreshes every 2 s.

import { createSimDrawing } from './sim-drawing.js';

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 2000;
const KIND_NAMES = { trh: 'T/RH probe', co2: 'CO₂ sensor', relay: 'Relay module', ac: 'Aircon gateway' };
const MACHINES = ['Intake fan', 'Exhaust fan', 'Circulation fan', 'Humidifier'];
const MODES = ['cool', 'heat', 'dry', 'fan'];
const FANS = ['auto', 'low', 'high'];

async function request(method, path, body) {
  const init = { method, signal: AbortSignal.timeout(5000) };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error ?? `Request failed (${res.status})`), { status: res.status, field: data?.field });
  return data;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// ---- Sensors table ----

const rows = new Map(); // address -> { tr, inputs: { field: input }, check, error }
const tbody = $('sensors').tBodies[0];

function valueInput(row, address, field, label, props) {
  const input = el('input', { type: 'number', id: `v-${address}-${field}`, autocomplete: 'off', ...props });
  input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
  input.addEventListener('change', () => save(row, address, field, input));
  row.inputs[field] = input;
  return [el('label', { htmlFor: input.id }, label), input];
}

// A switch drawn from a checkbox, with a fixed word beside it.
function flagSwitch(id, word, label) {
  const input = el('input', { type: 'checkbox', id });
  if (label) input.setAttribute('aria-label', label);
  return { input, label: el('label', { className: 'switch' }, input, el('span', { className: 'track' }), el('span', { textContent: word })) };
}

// Relay module: one line per output. The coil is the farm's doing; stuck and dead are the faults to play with.
function relayValues(row, address) {
  const list = el('div', { className: 'machines' });
  row.machines = MACHINES.map((name, i) => {
    const stuck = flagSwitch(`stuck-${address}-${i}`, 'Stuck', `${name} stuck`);
    const dead = flagSwitch(`dead-${address}-${i}`, 'Dead', `${name} dead`);
    stuck.input.addEventListener('change', () => save(row, address, 'stuck', stuck.input, row.machines.map((m) => m.stuck.input.checked)));
    dead.input.addEventListener('change', () => save(row, address, 'dead', dead.input, row.machines.map((m) => m.dead.input.checked)));
    const m = { stuck, dead, coil: el('span', { className: 'coil' }), dot: el('span', { className: 'dot' }), run: el('span', { className: 'muted' }) };
    list.append(el('div', { className: 'machine' }, el('span', { className: 'mname', textContent: name }), m.coil, el('span', { className: 'run' }, m.dot, m.run), stuck.label, dead.label));
    return m;
  });
  row.extra = (sensor) => {
    sensor.coils.forEach((on, i) => {
      const m = row.machines[i];
      m.coil.textContent = on ? 'Coil on' : 'Coil off';
      m.dot.classList.toggle('on', sensor.running[i]);
      m.run.textContent = sensor.running[i] ? 'running' : 'stopped';
      for (const field of ['stuck', 'dead']) m[field].input.checked = sensor[field][i];
    });
  };
  return [list];
}

// Aircon gateway: what the farm set (read-only), then the room temperature, error code and the refuse switch.
function acValues(row, address) {
  row.setting = el('p', { className: 'ac-setting' });
  const values = el('div', { className: 'values' },
    ...valueInput(row, address, 'roomT', 'Room T °C', { min: -40, max: 80, step: 0.1 }),
    ...valueInput(row, address, 'error', 'Error code', { min: 0, max: 255, step: 1 }));
  const refuse = flagSwitch(`refuse-${address}`, 'Refuse commands');
  refuse.input.addEventListener('change', () => save(row, address, 'refuse', refuse.input));
  row.extra = (sensor) => {
    row.setting.textContent = `Set by the farm: ${sensor.power ? 'on' : 'off'} · ${MODES[sensor.mode]} · ${sensor.setpoint.toFixed(1)} °C · fan ${FANS[sensor.fan]}`;
    refuse.input.checked = sensor.refuse;
  };
  return [row.setting, values, refuse.label];
}

function buildRow(sensor) {
  const { address, kind } = sensor;
  const row = { inputs: {}, tr: el('tr'), error: el('p', { className: 'row-error', role: 'alert' }) };
  const values = el('div', { className: 'values' });
  if (kind === 'relay') {
    values.className = '';
    values.append(...relayValues(row, address));
  } else if (kind === 'ac') {
    values.className = 'ac';
    values.append(...acValues(row, address));
  } else if (kind === 'trh') {
    values.append(
      ...valueInput(row, address, 't', 'T °C', { min: -40, max: 80, step: 0.1 }),
      ...valueInput(row, address, 'rh', 'RH %', { min: 0, max: 100, step: 0.1 }),
    );
  } else {
    values.append(...valueInput(row, address, 'co2', 'CO₂ ppm', { min: 0, max: 10000, step: 1 }));
  }
  row.check = el('input', { type: 'checkbox', id: `ans-${address}` });
  row.check.addEventListener('change', () => save(row, address, 'answering', row.check));
  row.word = el('span');
  const answering = el('label', { className: 'switch' }, row.check, el('span', { className: 'track' }), row.word);
  const remove = el('button', { type: 'button', className: 'danger-text', textContent: 'Remove' });
  remove.setAttribute('aria-label', `Remove sensor ${address}`);
  remove.addEventListener('click', async () => {
    try {
      await request('DELETE', `/api/sensors/${address}`);
    } catch (err) {
      if (err.status !== 404) return showBanner(err.message);
    }
    refresh();
  });
  row.simNote = el('p', { className: 'sim-note muted' });
  row.tr.append(
    el('td', { className: 'num', textContent: String(address) }),
    el('td', { textContent: KIND_NAMES[kind] }),
    el('td', {}, values, row.simNote, row.error),
    el('td', {}, answering),
    el('td', {}, remove),
  );
  return row;
}

async function save(row, address, field, input, list) {
  const value = list ?? (input.type === 'checkbox' ? input.checked : input.valueAsNumber);
  row.error.textContent = '';
  try {
    await request('PUT', `/api/sensors/${address}`, { [field]: Number.isNaN(value) ? input.value : value });
    input.removeAttribute('aria-invalid');
    clearBanner();
  } catch (err) {
    if (err.status === 404) return refresh();
    if (input.type !== 'checkbox') input.setAttribute('aria-invalid', 'true');
    row.error.textContent = err.message;
    if (input.type === 'checkbox') refresh();
  }
}

// The fields a simulation drives, per kind (the server refuses edits of just these).
const SIMULATED_FIELDS = { trh: ['t', 'rh'], co2: ['co2'], ac: ['roomT'] };

function showRow(row, sensor) {
  const simulatedBy = sensor.simulatedBy;
  // A simulated sensor's values come from its room: read-only, with a note.
  row.simNote.textContent = simulatedBy ? `simulated by ${simulatedBy}` : '';
  // Only number inputs keep what is being typed; checkboxes always show the device's state.
  for (const [field, input] of Object.entries(row.inputs)) {
    const locked = Boolean(simulatedBy) && SIMULATED_FIELDS[sensor.kind]?.includes(field);
    input.readOnly = locked;
    if (locked) input.removeAttribute('aria-invalid');
    if (document.activeElement === input || input.getAttribute('aria-invalid') === 'true') continue;
    input.value = String(sensor[field]);
  }
  row.check.checked = sensor.answering; // a checkbox is always repainted, so a failed save flips it back
  row.extra?.(sensor);
  row.word.textContent = sensor.answering ? 'Answering' : 'Silent';
}

function showSensors(list) {
  const seen = new Set();
  let previous = null;
  for (const sensor of list) {
    seen.add(sensor.address);
    let row = rows.get(sensor.address);
    if (row && row.kind !== sensor.kind) {
      row.tr.remove();
      rows.delete(sensor.address);
      row = null;
    }
    if (!row) {
      row = buildRow(sensor);
      row.kind = sensor.kind;
      rows.set(sensor.address, row);
    }
    // Keep rows in address order without rebuilding the ones that already sit right.
    const want = previous ? previous.nextSibling : tbody.firstChild;
    if (want !== row.tr) tbody.insertBefore(row.tr, want);
    showRow(row, sensor);
    previous = row.tr;
  }
  for (const [address, row] of rows) {
    if (seen.has(address)) continue;
    row.tr.remove();
    rows.delete(address);
  }
  $('no-sensors').hidden = list.length > 0;
  $('sensors').hidden = list.length === 0;
}

// ---- Simulation ----

// Number inputs of a simulated room: key, label, unit, min, max, step.
const SIM_PARAMS = [
  ['volume', 'Volume', 'm³', 1, 10000, 1],
  ['blocks', 'Blocks', '', 0, 100000, 1],
  ['co2PerBlock', 'CO₂ per block', 'mL/h', 0, 1000, 1],
  ['wallUA', 'Wall heat transfer', 'W/K', 0, 100000, 1],
  ['outdoorHigh', 'Outdoor high', '°C', -40, 60, 0.5],
  ['outdoorLow', 'Outdoor low', '°C', -40, 60, 0.5],
  ['outdoorDew', 'Outdoor dew point', '°C', -40, 60, 0.5],
  ['fanFlow', 'Fan flow', 'm³/h, intake + exhaust', 0, 100000, 10],
  ['acBTU', 'Aircon', 'BTU/h', 0, 200000, 500],
  ['humidifierLH', 'Humidifier', 'L/h', 0, 100, 0.1],
];
const SIM_LINKS = [['trh', 'T/RH probe'], ['co2', 'CO₂ sensor'], ['relay', 'Relay module'], ['ac', 'Aircon gateway']];

const simCards = new Map(); // id -> card
const simBox = $('sims');

// "14:05" from seconds since midnight.
function clockText(s) {
  const m = Math.floor(s / 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function actingText(a) {
  if (!a) return 'Nothing acting yet';
  const parts = [`Air exchange ${Math.round(a.exchangeM3h)} m³/h`];
  if (a.acCoolKW > 0.005) parts.push(`AC cooling ${a.acCoolKW.toFixed(1)} kW`);
  if (a.acHeatKW > 0.005) parts.push(`AC heating ${a.acHeatKW.toFixed(1)} kW`);
  if (a.humidifierGH > 0) parts.push(`Humidifier +${(a.humidifierGH / 1000).toFixed(1)} L/h`);
  parts.push(`Blocks ${a.blocksKW < 0 ? "−" : "+"}${Math.abs(Math.round(a.blocksKW * 1000))} W`);
  return parts.join(' · ');
}

async function saveSim(card, field, input, value) {
  card.error.textContent = '';
  try {
    await request('PUT', `/api/sims/${card.id}`, { [field]: value });
    input.removeAttribute('aria-invalid');
    clearBanner();
    refresh();
  } catch (err) {
    if (err.status === 404) return refresh();
    if (input.type !== 'checkbox' && input.tagName !== 'SELECT') input.setAttribute('aria-invalid', 'true');
    card.error.textContent = err.message;
    refresh(); // a switch or select flips back to the device's state
  }
}

function buildSimCard(room) {
  const id = room.id;
  const card = { id, params: {}, links: {}, linkKeys: {}, error: el('p', { className: 'row-error', role: 'alert' }) };
  const enabled = flagSwitch(`sim-${id}-enabled`, 'Simulate');
  enabled.input.addEventListener('change', () => saveSim(card, 'enabled', enabled.input, enabled.input.checked));
  card.enabled = enabled.input;
  card.name = el('input', { type: 'text', id: `sim-${id}-name`, maxLength: 40, autocomplete: 'off' });
  card.name.setAttribute('aria-label', 'Room name');
  card.name.addEventListener('input', () => card.name.removeAttribute('aria-invalid'));
  card.name.addEventListener('change', () => saveSim(card, 'name', card.name, card.name.value));
  const reset = el('button', { type: 'button', textContent: 'Reset' });
  reset.setAttribute('aria-label', 'Reset the air to its starting state');
  reset.addEventListener('click', async () => {
    try {
      await request('POST', `/api/sims/${id}/reset`);
    } catch (err) {
      if (err.status !== 404) return showBanner(err.message);
    }
    refresh();
  });
  const remove = el('button', { type: 'button', className: 'danger-text', textContent: 'Remove' });
  card.remove = remove;
  remove.addEventListener('click', async () => {
    try {
      await request('DELETE', `/api/sims/${id}`);
    } catch (err) {
      if (err.status !== 404) return showBanner(err.message);
    }
    refresh();
  });

  const links = el('div', { className: 'sim-grid' });
  for (const [kind, label] of SIM_LINKS) {
    const select = el('select', { id: `sim-${id}-${kind}` });
    select.addEventListener('change', () => saveSim(card, kind, select, select.value === '' ? null : Number(select.value)));
    card.links[kind] = select;
    links.append(el('div', { className: 'field' }, el('label', { htmlFor: select.id, textContent: label }), select));
  }
  const params = el('div', { className: 'sim-grid' });
  for (const [key, label, unit, min, max, step] of SIM_PARAMS) {
    const input = el('input', { type: 'number', id: `sim-${id}-${key}`, min, max, step, autocomplete: 'off' });
    input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
    input.addEventListener('change', () => saveSim(card, key, input, Number.isNaN(input.valueAsNumber) ? input.value : input.valueAsNumber));
    card.params[key] = input;
    params.append(el('div', { className: 'field' }, el('label', { htmlFor: input.id, textContent: unit ? `${label} (${unit})` : label }), input));
  }

  card.drawing = createSimDrawing(id); // the room drawing (sim-drawing.js)
  card.t = el('strong');
  card.rh = el('strong');
  card.co2 = el('strong');
  card.acting = el('p', { className: 'sim-acting' });
  card.outdoor = el('p', { className: 'muted sim-outdoor' });
  const live = el('p', { className: 'sim-live' },
    el('span', {}, 'T ', card.t, ' °C'), el('span', {}, 'RH ', card.rh, ' %'), el('span', {}, 'CO₂ ', card.co2, ' ppm'));

  card.el = el('article', { className: 'sim-card' },
    el('div', { className: 'sim-head' }, enabled.label, card.name, el('span', { className: 'sim-actions' }, reset, remove)),
    card.drawing.el, links, params, live, card.outdoor, card.acting,
    el('p', { className: 'muted sim-note' }, 'Circulation fan: no effect in this one-zone model'),
    card.error);
  return card;
}

// Selects list only devices of their kind; a link to a device that is gone stays visible as "(missing)".
function showLinks(card, room, sensors) {
  for (const [kind] of SIM_LINKS) {
    const select = card.links[kind];
    const addresses = sensors.filter((s) => s.kind === kind).map((s) => s.address);
    const missing = room[kind] !== null && !addresses.includes(room[kind]);
    const key = JSON.stringify([addresses, missing ? room[kind] : null]);
    if (card.linkKeys[kind] !== key) {
      select.replaceChildren(
        el('option', { value: '', textContent: 'None' }),
        ...addresses.map((a) => el('option', { value: String(a), textContent: `Address ${a}` })),
        ...(missing ? [el('option', { value: String(room[kind]), textContent: `Address ${room[kind]} (missing)` })] : []),
      );
      card.linkKeys[kind] = key;
    }
    if (document.activeElement !== select) select.value = room[kind] === null ? '' : String(room[kind]);
  }
}

function showSimCard(card, room, sensors) {
  card.enabled.checked = room.enabled;
  card.remove.setAttribute('aria-label', `Remove ${room.name}`);
  if (document.activeElement !== card.name && card.name.getAttribute('aria-invalid') !== 'true') card.name.value = room.name;
  for (const [key, input] of Object.entries(card.params)) {
    if (document.activeElement === input || input.getAttribute('aria-invalid') === 'true') continue;
    input.value = String(room[key]);
  }
  showLinks(card, room, sensors);
  card.drawing.paint(room, sensors);
  card.t.textContent = room.state.T.toFixed(1);
  card.rh.textContent = room.rh.toFixed(1);
  card.co2.textContent = String(Math.round(room.state.CO2));
  card.outdoor.textContent = `Outdoor now ${room.outdoor.T.toFixed(1)} °C / ${Math.round(room.outdoor.RH)} % · simulated time ${clockText(room.clock)} (low at 03:00, high at 15:00, same dew point all day)`;
  card.acting.textContent = room.enabled ? actingText(room.acting) : 'Switched off';
  card.el.classList.toggle('off', !room.enabled);
}

function showSims(rooms, speed, sensors) {
  const seen = new Set();
  let previous = null;
  for (const room of rooms) {
    seen.add(room.id);
    let card = simCards.get(room.id);
    if (!card) {
      card = buildSimCard(room);
      simCards.set(room.id, card);
    }
    const want = previous ? previous.nextSibling : simBox.firstChild;
    if (want !== card.el) simBox.insertBefore(card.el, want);
    showSimCard(card, room, sensors);
    previous = card.el;
  }
  for (const [id, card] of simCards) {
    if (seen.has(id)) continue;
    card.drawing.destroy();
    card.el.remove();
    simCards.delete(id);
  }
  if (document.activeElement !== $('sim-speed')) $('sim-speed').value = String(speed);
  $('no-sims').hidden = rooms.length > 0;
}

$('sim-speed').addEventListener('change', async () => {
  try {
    await request('PUT', '/api/sim-speed', { speed: Number($('sim-speed').value) });
    clearBanner();
  } catch (err) {
    showBanner(err.message);
  }
  refresh();
});

$('sim-add').addEventListener('click', async () => {
  $('sim-add-error').textContent = '';
  try {
    await request('POST', '/api/sims', {});
    refresh();
  } catch (err) {
    $('sim-add-error').textContent = err.message;
  }
});

// ---- Log ----

const pad = (n) => String(n).padStart(2, '0');
const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

function showLog(entries) {
  const body = $('log').tBodies[0];
  body.replaceChildren(...entries.map((e) => el('tr', {},
    el('td', { textContent: clock(e.at) }),
    el('td', { className: 'num', textContent: String(e.address) }),
    el('td', { className: 'num', textContent: String(e.fn).padStart(2, '0') }),
    el('td', { textContent: e.result }),
  )));
  $('no-log').hidden = entries.length > 0;
  $('log').hidden = entries.length === 0;
}

// ---- Add form ----

$('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = $('add-error');
  error.textContent = '';
  const address = $('a-address').valueAsNumber;
  try {
    await request('POST', '/api/sensors', { address, kind: $('a-kind').value });
    $('a-address').value = '';
    refresh();
  } catch (err) {
    error.textContent = err.message;
    if (err.field === 'address') $('a-address').focus();
  }
});

// ---- Refresh ----

function showBanner(text) {
  const banner = $('banner');
  banner.textContent = text;
  banner.hidden = false;
}
function clearBanner() { $('banner').hidden = true; }

let busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  try {
    const [sensors, log, sims, speed] = await Promise.all([request('GET', '/api/sensors'), request('GET', '/api/log'), request('GET', '/api/sims'), request('GET', '/api/sim-speed')]);
    showSensors(sensors);
    showSims(sims, speed.speed, sensors);
    showLog(log);
    clearBanner();
  } catch {
    showBanner('Cannot reach the device app. Retrying.');
  } finally {
    busy = false;
  }
}

// ---- Theme (same key and behaviour as the farm app) ----

const THEME_COLOURS = { dark: '#1c1f22', light: '#f4f5f6' };
const themeButton = $('theme');
const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function showTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const next = theme === 'dark' ? 'light' : 'dark';
  themeButton.textContent = next === 'light' ? 'Light mode' : 'Dark mode';
  themeButton.setAttribute('aria-label', `Switch to ${next} mode`);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', THEME_COLOURS[theme]);
}
themeButton.addEventListener('click', () => {
  const theme = currentTheme() === 'dark' ? 'light' : 'dark';
  showTheme(theme);
  try { localStorage.setItem('farm.theme', theme); } catch { /* not kept */ }
});
showTheme(currentTheme());

refresh();
setInterval(refresh, REFRESH_MS);
