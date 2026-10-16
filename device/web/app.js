// Device control page: sensor table (edit in place), add form, request log. Refreshes every 2 s.

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 2000;
const KIND_NAMES = { trh: 'T/RH probe', co2: 'CO₂ sensor' };

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

function buildRow(sensor) {
  const { address, kind } = sensor;
  const row = { inputs: {}, tr: el('tr'), error: el('p', { className: 'row-error', role: 'alert' }) };
  const values = el('div', { className: 'values' });
  if (kind === 'trh') {
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

async function save(row, address, field, input) {
  const value = field === 'answering' ? input.checked : input.valueAsNumber;
  row.error.textContent = '';
  try {
    await request('PUT', `/api/sensors/${address}`, { [field]: Number.isNaN(value) ? input.value : value });
    input.removeAttribute('aria-invalid');
    clearBanner();
  } catch (err) {
    if (err.status === 404) return refresh();
    if (field !== 'answering') input.setAttribute('aria-invalid', 'true');
    row.error.textContent = err.message;
    if (field === 'answering') refresh();
  }
}

function showRow(row, sensor) {
  for (const [field, input] of Object.entries(row.inputs)) {
    if (document.activeElement === input || input.getAttribute('aria-invalid') === 'true') continue;
    input.value = String(sensor[field]);
  }
  if (document.activeElement !== row.check) row.check.checked = sensor.answering;
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
