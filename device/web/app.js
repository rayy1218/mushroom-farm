// Device control page: table of sensors, relay modules and aircon gateways (edit in place), add form, request log. Refreshes every 2 s.

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
      for (const field of ['stuck', 'dead']) {
        if (document.activeElement !== m[field].input) m[field].input.checked = sensor[field][i];
      }
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
    if (document.activeElement !== refuse.input) refuse.input.checked = sensor.refuse;
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
  row.tr.append(
    el('td', { className: 'num', textContent: String(address) }),
    el('td', { textContent: KIND_NAMES[kind] }),
    el('td', {}, values, row.error),
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

function showRow(row, sensor) {
  for (const [field, input] of Object.entries(row.inputs)) {
    if (document.activeElement === input || input.getAttribute('aria-invalid') === 'true') continue;
    input.value = String(sensor[field]);
  }
  if (document.activeElement !== row.check) row.check.checked = sensor.answering;
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
    const [sensors, log] = await Promise.all([request('GET', '/api/sensors'), request('GET', '/api/log')]);
    showSensors(sensors);
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
