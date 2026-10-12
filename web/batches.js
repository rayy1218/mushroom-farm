// web/batches.js: the Batches pages (docs/contracts/harvest.md 12.3).
(function (global) {
'use strict';

let current = null;                         // the token of the mounted page; a late reply of an older mount sees it changed

const OFFSET = 8 * 3600;
const TEXT = ['strain', 'source', 'notes'];
const NUM = ['block_count', 'block_wet_kg', 'moisture_pct', 'flush_gap_days'];
const DATE = ['spawn_date', 'received_at'];

// Farm dates (UTC+8) whatever the browser's time zone (lead decision 67).
function dateToSeconds(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof text === 'string' ? text : '');
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return Date.UTC(y, mo - 1, d) / 1000 - OFFSET;
}
function secondsToDate(t) {
  const d = new Date((t + OFFSET) * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
const ageDays = (from, now) => Math.floor((now - from) / 86400);

// form: { edit, fields }. An empty value is left out on create and sent as null on edit.
function batchBody({ edit, fields }) {
  const body = {};
  for (const k of Object.keys(fields)) {
    if (k === 'crop') { body.crop = fields.crop; continue; }
    const text = String(fields[k]).trim();
    if (text === '') { if (edit) body[k] = null; continue; }
    if (TEXT.includes(k)) body[k] = text;
    else if (NUM.includes(k)) body[k] = Number.isFinite(Number(text)) ? Number(text) : text;
    else if (DATE.includes(k)) body[k] = dateToSeconds(text) ?? text;
  }
  return body;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const daysText = n => plural(n, 'day', 'days');
const titleOf = b => (b.strain ? `${cropName(b.crop)} · ${b.strain}` : cropName(b.crop));
function stateWords(b) {
  if (b.state === 'received') return 'New, not in a room yet';
  if (b.state === 'placed') return `Growing in ${b.room_name}`;
  return 'Finished';
}
// The batch page's sub line: the state, then the wait between arriving and being placed.
function subText(b) {
  const words = stateWords(b);
  return b.placed_at == null ? words : `${words} · Arrived to placed: ${daysText(ageDays(b.received_at, b.placed_at))}`;
}
const filterByState = (list, state) => list.filter(b => b.state === state);
const nowSec = () => Math.floor(Date.now() / 1000);
const cropKeys = () => Object.keys(global.ClimateController.CROPS).filter(k => global.ClimateController.CROPS[k].range);
const cropName = k => (global.ClimateController.CROPS[k] ? global.ClimateController.CROPS[k].name : k);
const errText = err => global.FarmUi.errorText(err);

// C11 6: field labels by API key, for plainError.
const LABELS = { crop: 'Mushroom', strain: 'Strain (seed type)', source: 'Bought from', block_count: 'Blocks', block_wet_kg: 'Wet weight per block',
  moisture_pct: 'Moisture', received_at: 'Arrived on', spawn_date: 'Spawn date', flush_gap_days: 'Days between flushes', notes: 'Notes' };
const CONFIRM_FINISH = 'Finish this batch? Its blocks are thrown out and it takes no more crates.';

function addCropOptions(select) {
  for (const k of cropKeys()) {
    const o = document.createElement('option');
    o.value = k; o.textContent = cropName(k);
    select.appendChild(o);
  }
}

function td(text) {
  const c = document.createElement('td');
  c.textContent = text;
  return c;
}

function row(cells) {
  const tr = document.createElement('tr');
  for (const c of cells) tr.appendChild(typeof c === 'string' || typeof c === 'number' ? td(String(c)) : c);
  return tr;
}


// ---- charts (C13 5): hand-made SVG, tokens from styles.css ----

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(t) {
  const [, m, d] = secondsToDate(t).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}
// The end of an axis with four equal, round steps that holds v.
function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v / 4));
  for (const m of [1, 2, 2.5, 5, 10]) if (4 * m * p >= v * (1 - 1e-9)) return 4 * m * p;
  return 40 * p;
}
const trim = n => String(Number(n.toFixed(2)));
const one = n => (Math.round(n * 10) / 10).toFixed(1);

// Bars of the flush chart: kg and g per block per flush, and the BE % added up flush by flush.
function flushBars(detail) {
  const flushes = detail && Array.isArray(detail.flushes) ? detail.flushes : [];
  let cum = 0;
  return flushes.map(f => {
    cum += f.be_pct;
    return { n: f.n, kg: f.kg, gPerBlock: f.g_per_block, beCum: Math.round(cum * 10) / 10 };
  });
}
// The drop from the best flush to the latest one, in words. '' with no flush.
function dropText(flushes) {
  const list = Array.isArray(flushes) ? flushes : [];
  if (list.length === 0) return '';
  if (list.length === 1) return 'One flush so far.';
  let best = list[0];
  for (const f of list) if (f.kg > best.kg) best = f;
  const last = list[list.length - 1];
  if (best.kg <= 0) return '';
  if (last === best) return `Flush ${last.n} is the best so far.`;
  const pct = Math.round((1 - last.kg / best.kg) * 100);
  if (pct === 0) return `Flush ${last.n} gave the same as flush ${best.n}.`;
  return `Flush ${last.n} gave ${pct} % less than flush ${best.n}.`;
}

// Rows of the room timeline. state 'placed' = growing now (bar ends today), 'cleared' = finished (placed to cleared).
// A room's overlapping bars go on separate lanes. Rooms with nothing growing keep an empty row; on Finished only rooms with bars show.
function timelineRows(rooms, batches, nowS, state) {
  const finished = state === 'cleared';
  const names = new Map();
  for (const r of rooms || []) if (!r.archived_at || batches.some(b => b.room_id === r.id)) names.set(r.id, r.name);
  const rows = new Map();
  const rowOf = id => { if (!rows.has(id)) rows.set(id, { room_id: id, name: names.get(id) || `Room ${id}`, bars: [], lanes: 1 }); return rows.get(id); };
  for (const [id] of names) rowOf(id);
  const list = (batches || []).filter(b => b.state === (finished ? 'cleared' : 'placed') && b.placed_at != null && b.room_id != null);
  for (const b of list) {
    if (!names.has(b.room_id) && b.room_name) names.set(b.room_id, b.room_name);
    const row = rowOf(b.room_id);
    row.name = names.get(b.room_id) || row.name;
    const flushes = b.totals ? b.totals.flushes : 0;
    row.bars.push({ id: b.id, from: b.placed_at, to: finished ? b.cleared_at : nowS, crop: b.crop,
      label: flushes > 0 ? `${cropName(b.crop)} · Flush ${flushes}` : cropName(b.crop) });
  }
  const out = [...rows.values()].filter(r => !finished || r.bars.length > 0);
  for (const r of out) {
    r.bars.sort((a, b) => a.from - b.from || a.id - b.id);
    const ends = [];
    for (const bar of r.bars) {
      let lane = ends.findIndex(e => e <= bar.from);
      if (lane < 0) { lane = ends.length; ends.push(0); }
      ends[lane] = bar.to;
      bar.lane = lane;
    }
    r.lanes = Math.max(1, ends.length);
  }
  out.sort((a, b) => a.name.localeCompare(b.name) || a.room_id - b.room_id);
  const all = out.flatMap(r => r.bars);
  const to = all.length ? Math.max(nowS, ...all.map(b => b.to)) : nowS;
  const from = all.length ? Math.min(...all.map(b => b.from)) : nowS - 14 * 86400;
  const span = Math.max(to - from, 14 * 86400);
  return { rows: out, from: to - span, to };
}

function timelineSummary(t, finished) {
  const bars = t.rows.reduce((n, r) => n + r.bars.length, 0);
  if (finished) return bars ? `${plural(bars, 'batch', 'batches')} finished, placed to cleared.` : 'No finished batches yet.';
  const rooms = t.rows.filter(r => r.bars.length).length;
  return bars ? `${plural(bars, 'batch', 'batches')} growing in ${plural(rooms, 'room', 'rooms')}; ${plural(t.rows.length - rooms, 'room is', 'rooms are')} empty.`
    : 'Nothing is growing right now.';
}

function svgRoot(w, h, label) {
  return global.FarmUi.svgEl('svg', { class: 'vz-svg', viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label, preserveAspectRatio: 'xMinYMin meet' });
}
function svgText(parent, x, y, text, cls, anchor) {
  const e = global.FarmUi.svgEl('text', { x, y, class: cls, 'text-anchor': anchor || 'start' }, parent);
  e.textContent = text;
  return e;
}

function drawFlushChart(host, detail) {
  const { svgEl } = global.FarmUi;
  const bars = flushBars(detail);
  if (bars.length === 0) { host.replaceChildren(); return false; }
  const sentence = dropText(detail.flushes);
  const W = Math.max(360, 100 + bars.length * 84), H = 290, L = 46, R = 50, T = 38, B = 52;
  const pw = W - L - R, ph = H - T - B;
  const kgMax = niceMax(Math.max(...bars.map(b => b.kg)));
  const beMax = niceMax(Math.max(...bars.map(b => b.beCum)));
  const last = bars[bars.length - 1];
  const label = `Harvest per flush: ${bars.map(b => `flush ${b.n} ${one(b.kg)} kg, ${b.gPerBlock} g per block`).join('; ')}. Together ${last.beCum} % BE. ${sentence}`.trim();
  const svg = svgRoot(W, H, label);
  svg.style.minWidth = `${W}px`;                 // text stays at its size; a long harvest scrolls inside the card
  const y = (v, max) => T + ph - (v / max) * ph;
  const g = svgEl('g', { class: 'vz-grid' }, svg);
  for (let i = 0; i <= 4; i++) {
    const yy = T + ph - (i / 4) * ph;
    svgEl('line', { x1: L, x2: L + pw, y1: yy, y2: yy, class: i === 0 ? 'vz-base' : 'vz-gridline' }, g);
    svgText(svg, L - 6, yy + 4, trim(kgMax * i / 4), 'vz-tick', 'end');
    svgText(svg, L + pw + 6, yy + 4, trim(beMax * i / 4), 'vz-tick');
  }
  svgText(svg, L - 6, T - 14, 'kg', 'vz-unit', 'end');
  svgText(svg, L + pw + 6, T - 14, 'BE %', 'vz-unit');
  svgEl('rect', { x: L, y: 8, width: 10, height: 10, class: 'vz-key-bar' }, svg);
  svgText(svg, L + 15, 17, 'Harvest (kg)', 'vz-legend');
  svgEl('line', { x1: L + 110, x2: L + 128, y1: 13, y2: 13, class: 'vz-line' }, svg);
  svgEl('circle', { cx: L + 119, cy: 13, r: 3, class: 'vz-dot' }, svg);
  svgText(svg, L + 134, 17, 'BE % so far (right axis)', 'vz-legend');
  const slot = pw / bars.length, bw = Math.min(56, slot * 0.6);
  const pts = [];
  bars.forEach((b, i) => {
    const cx = L + slot * (i + 0.5);
    const top = y(b.kg, kgMax);
    const bar = svgEl('rect', { x: cx - bw / 2, y: top, width: bw, height: Math.max(0, T + ph - top), class: 'vz-bar', rx: 2 }, svg);
    svgEl('title', {}, bar).textContent = `Flush ${b.n}: ${one(b.kg)} kg, ${b.gPerBlock} g per block, ${b.beCum} % BE so far`;
    svgText(svg, cx, Math.max(T - 2, top - 5), `${one(b.kg)} kg`, 'vz-val', 'middle');
    svgText(svg, cx, T + ph + 16, `Flush ${b.n}`, 'vz-cat', 'middle');
    svgText(svg, cx, T + ph + 31, `${b.gPerBlock} g per block`, 'vz-sub', 'middle');
    pts.push([cx, y(b.beCum, beMax)]);
  });
  if (pts.length > 1) svgEl('polyline', { points: pts.map(p => p.join(',')).join(' '), class: 'vz-line', fill: 'none' }, svg);
  pts.forEach(([cx, cy], i) => {
    svgEl('circle', { cx, cy, r: 3.5, class: 'vz-dot' }, svg).appendChild(svgEl('title', {}, null)).textContent = `${bars[i].beCum} % BE so far`;
  });
  host.replaceChildren(svg);
  return true;
}

function drawTimeline(host, t, nowS, finished) {
  const { svgEl } = global.FarmUi;
  host.replaceChildren();
  if (t.rows.length === 0) return false;
  const W = 760, L = 96, R = 14, T = 26, LANE = 26, GAP = 10;
  const pw = W - L - R;
  const heights = t.rows.map(r => r.lanes * LANE + GAP);
  const H = T + heights.reduce((a, b) => a + b, 0) + (finished ? 8 : 20);
  const x = s => L + ((s - t.from) / (t.to - t.from)) * pw;
  const label = `What is growing where: ${timelineSummary(t, finished)} ${t.rows.map(r => `${r.name}: ${r.bars.length ? r.bars.map(b => `${b.label}, from ${shortDate(b.from)}`).join('; ') : 'empty'}.`).join(' ')}`;
  const svg = svgRoot(W, H, label);
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const s = t.from + (t.to - t.from) * i / ticks, xx = x(s);
    svgEl('line', { x1: xx, x2: xx, y1: T - 4, y2: H - (finished ? 6 : 18), class: 'vz-gridline' }, svg);
    svgText(svg, xx, T - 10, shortDate(s), 'vz-tick', i === 0 ? 'start' : i === ticks ? 'end' : 'middle');
  }
  let yy = T;
  t.rows.forEach((r, i) => {
    svgText(svg, 0, yy + LANE / 2 + 4, r.name, 'vz-cat');
    if (r.bars.length === 0) svgText(svg, L + 8, yy + LANE / 2 + 4, 'Empty', 'vz-sub');
    for (const b of r.bars) {
      const x1 = x(b.from), w = Math.max(6, x(b.to) - x1), by = yy + b.lane * LANE;
      const a = svgEl('g', { class: 'vz-hit', tabindex: '0', role: 'link', 'aria-label': `Open ${b.label}`, 'data-id': String(b.id) }, svg);
      svgEl('rect', { x: x1, y: by, width: w, height: LANE - 4, rx: 3, class: 'vz-tbar' }, a);
      const clip = `vz-clip-${r.room_id}-${b.id}`;
      const cp = svgEl('clipPath', { id: clip }, a);
      svgEl('rect', { x: x1 + 4, y: by, width: Math.max(0, w - 8), height: LANE - 4 }, cp);
      const tx = svgText(a, x1 + 6, by + (LANE - 4) / 2 + 4, b.label, 'vz-tlabel');
      tx.setAttribute('clip-path', `url(#${clip})`);
      svgEl('title', {}, a).textContent = `${b.label}: ${shortDate(b.from)} to ${shortDate(b.to)}`;
    }
    yy += heights[i];
    if (i < t.rows.length - 1) svgEl('line', { x1: 0, x2: W, y1: yy - GAP / 2, y2: yy - GAP / 2, class: 'vz-gridline' }, svg);
  });
  if (!finished) {
    const tx = x(nowS);
    svgEl('line', { x1: tx, x2: tx, y1: T - 4, y2: H - 16, class: 'vz-today' }, svg);
    svgText(svg, tx, H - 2, 'Today', 'vz-sub', tx > W - 40 ? 'end' : 'middle');
  }
  host.appendChild(svg);
  if (!finished) host.scrollLeft = host.scrollWidth;      // narrow screens: today is the end that matters
  return true;
}

const LIST_HTML = `
<div class="bt-page">
  <div class="bt-head" id="btHead"><button class="btn btn-primary" id="btNewBtn" type="button">New batch</button></div>
  <div class="seg bt-tabs" role="group" aria-label="Batches">
    <button type="button" id="btTabReceived" aria-pressed="false">New</button>
    <button type="button" id="btTabPlaced" aria-pressed="true">Growing</button>
    <button type="button" id="btTabCleared" aria-pressed="false">Finished</button>
  </div>
  <figure class="card room-timeline vz-card" id="btTimeline" hidden>
    <h3>What is growing where</h3>
    <p class="vz-sum" id="btTimelineSum"></p>
    <div class="vz-scroll" id="btTimelineChart"></div>
  </figure>
  <p class="tag" id="btEmpty" hidden>No batches here.</p>
  <table class="bt-list" id="btList">
    <thead><tr><th>Mushroom</th><th>Strain</th><th>Room</th><th>Age (days)</th><th>kg</th><th>g per block</th><th>BE %</th></tr></thead>
    <tbody></tbody>
  </table>
  <p class="alert" id="btMsg" role="status" hidden></p>
  <details class="card bt-new" id="btNew">
  <summary><h3>New batch</h3></summary>
  <form class="bt-form" id="btForm">
    <div class="form-grid">
      <div class="field" data-field="crop">
        <label for="btCrop">Mushroom</label>
        <div class="field-ctl"><select id="btCrop"></select></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="strain">
        <label for="btStrain">Strain (seed type)</label>
        <div class="field-ctl"><input id="btStrain"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="source">
        <label for="btSource">Bought from</label>
        <div class="field-ctl"><input id="btSource"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="block_count">
        <label for="btCount">Blocks</label>
        <div class="field-ctl"><input id="btCount" type="number" min="1" step="1"><span class="unit">blocks</span></div>
        <p class="field-help">How many blocks arrived.</p>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="block_wet_kg">
        <label for="btKg">Wet weight per block</label>
        <div class="field-ctl"><input id="btKg" type="number" step="0.01"><span class="unit">kg</span></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="moisture_pct">
        <label for="btMoist">Moisture</label>
        <div class="field-ctl"><input id="btMoist" type="number" step="any"><span class="unit">%</span></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="received_at">
        <label for="btReceived">Arrived on</label>
        <div class="field-ctl"><input id="btReceived" type="date"></div>
        <p class="field-err" hidden></p>
      </div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" id="btSave" type="submit">Save</button></div>
  </form>
  </details>
</div>`;

const DETAIL_HTML = `
<div class="bd-page">
  <div class="bd-head" id="bdHead">
    <select id="bdRoom" aria-label="Room to place it in" hidden></select>
    <button class="btn" id="bdPlace" type="button" hidden>Place in room</button>
    <button class="btn btn-danger" id="bdClear" type="button" hidden>Finish batch</button>
    <button class="btn btn-danger" id="bdDelete" type="button" hidden>Delete</button>
  </div>
  <form class="bd-form" id="bdForm">
    <h3>Blocks</h3>
    <div class="form-grid">
      <div class="field" data-field="crop">
        <label for="bdCrop">Mushroom</label>
        <div class="field-ctl"><select id="bdCrop"></select></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="strain">
        <label for="bdStrain">Strain (seed type)</label>
        <div class="field-ctl"><input id="bdStrain"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="source">
        <label for="bdSource">Bought from</label>
        <div class="field-ctl"><input id="bdSource"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="block_count">
        <label for="bdCount">Blocks</label>
        <div class="field-ctl"><input id="bdCount" type="number" min="1" step="1"><span class="unit">blocks</span></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="block_wet_kg">
        <label for="bdKg">Wet weight per block</label>
        <div class="field-ctl"><input id="bdKg" type="number" step="any"><span class="unit">kg</span></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="moisture_pct">
        <label for="bdMoist">Moisture</label>
        <div class="field-ctl"><input id="bdMoist" type="number" step="any"><span class="unit">%</span></div>
        <p class="field-err" hidden></p>
      </div>
    </div>
    <h3>Dates</h3>
    <div class="form-grid">
      <div class="field" data-field="spawn_date">
        <label for="bdSpawn">Spawn date</label>
        <div class="field-ctl"><input id="bdSpawn" type="date"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="received_at">
        <label for="bdReceived">Arrived on</label>
        <div class="field-ctl"><input id="bdReceived" type="date"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="flush_gap_days">
        <label for="bdGap">Days between flushes</label>
        <div class="field-ctl"><input id="bdGap" type="number" min="1" step="1"><span class="unit">days</span></div>
        <p class="field-err" hidden></p>
      </div>
    </div>
    <h3>Notes</h3>
    <div class="form-grid">
      <div class="field span-all" data-field="notes">
        <label for="bdNotes">Notes</label>
        <div class="field-ctl"><textarea id="bdNotes" rows="3"></textarea></div>
        <p class="field-err" hidden></p>
      </div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" id="bdSave" type="submit">Save changes</button></div>
  </form>
  <figure class="card flush-chart vz-card" id="bdChart" hidden>
    <h3>Harvest per flush</h3>
    <p class="vz-sum" id="bdChartSum"></p>
    <div class="vz-scroll" id="bdChartSvg"></div>
  </figure>
  <h3>Flushes</h3>
  <table class="bd-flushes" id="bdFlushes">
    <thead><tr><th>Flush</th><th>First</th><th>Last</th><th>kg</th><th>g per block</th><th>BE %</th></tr></thead>
    <tbody></tbody>
  </table>
  <h3>Crates</h3>
  <table class="bd-crates" id="bdCrates">
    <thead><tr><th>Time</th><th>kg</th><th>Picker</th><th>–</th></tr></thead>
    <tbody></tbody>
  </table>
  <p class="alert" id="bdMsg" role="status" hidden></p>
</div>`;

// ---- list ----

function mountList(el, live) {
  let gen = 0;                              // bumped by every load: an older reply is dropped
  const $ = s => el.querySelector(s);
  el.innerHTML = LIST_HTML;
  const LIM = global.FarmHarvestRules.LIM;
  addCropOptions($('#btCrop'));
  $('#btStrain').maxLength = LIM.text;
  $('#btSource').maxLength = LIM.text;
  $('#btMoist').value = global.FarmHarvestRules.DEFAULTS.moisture_pct;
  $('#btReceived').value = secondsToDate(nowSec());

  const say = (lvl, text) => global.FarmUi.say($('#btMsg'), lvl, text);
  const tabs = { received: $('#btTabReceived'), placed: $('#btTabPlaced'), cleared: $('#btTabCleared') };
  let state = 'placed';
  let all = [];
  let rooms = [];
  let loaded = false;
  const newCard = $('#btNew');
  $('#btHead').replaceChildren(global.FarmUi.pageHead({
    title: 'Batches', sub: 'The blocks you bought, from arrival to the last flush.', actions: [$('#btNewBtn')] }));
  $('#btNewBtn').addEventListener('click', () => {
    newCard.open = true;
    if (newCard.scrollIntoView) newCard.scrollIntoView({ block: 'start' });
    $('#btCrop').focus();
  });

  function paintTimeline(now) {
    const fig = $('#btTimeline');
    fig.hidden = !loaded || state === 'received';
    if (fig.hidden) return;
    const finished = state === 'cleared';
    const t = timelineRows(rooms, all, now, finished ? 'cleared' : 'placed');
    $('#btTimelineSum').textContent = timelineSummary(t, finished);
    if (!drawTimeline($('#btTimelineChart'), t, now, finished)) fig.hidden = true;
  }

  function paint() {
    const now = nowSec();
    const list = filterByState(all, state);
    const body = $('#btList').querySelector('tbody');
    $('#btEmpty').hidden = !loaded || list.length !== 0;
    $('#btList').hidden = !loaded || list.length === 0;
    paintTimeline(now);
    body.replaceChildren(...list.map(b => {
      const from = b.state === 'received' ? b.received_at : b.placed_at;
      const to = b.state === 'cleared' ? b.cleared_at : now;
      const tr = row([cropName(b.crop), b.strain || '–', b.room_name || '–', ageDays(from, to), b.totals.kg, b.totals.g_per_block, b.totals.be_pct]);
      tr.dataset.id = String(b.id);
      return tr;
    }));
  }

  async function load() {
    const mine = ++gen;
    let list, roomList;
    try {
      [list, roomList] = await Promise.all([global.FarmApi.listBatches({}), global.FarmApi.listRooms().catch(() => [])]);
    } catch (err) { if (live() && mine === gen) say('error', errText(err)); return; }
    if (!live() || mine !== gen) return;
    say('info', '');
    all = list;
    rooms = roomList;
    loaded = true;
    newCard.open = list.length === 0;
    paint();
  }

  function pick(next) {
    state = next;
    for (const k of Object.keys(tabs)) tabs[k].setAttribute('aria-pressed', String(k === next));
    if (loaded) paint(); else load();
  }
  for (const k of Object.keys(tabs)) tabs[k].addEventListener('click', () => pick(k));

  $('#btTimelineChart').addEventListener('click', e => {
    const hit = e.target && e.target.closest ? e.target.closest('[data-id]') : null;
    if (hit) global.location.hash = `#/batches/${hit.getAttribute('data-id')}`;
  });
  $('#btTimelineChart').addEventListener('keydown', e => {
    const hit = e.target && e.target.closest ? e.target.closest('[data-id]') : null;
    if (hit && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); global.location.hash = `#/batches/${hit.getAttribute('data-id')}`; }
  });

  $('#btList').addEventListener('click', e => {
    const tr = e.target && e.target.closest ? e.target.closest('tr[data-id]') : null;
    if (tr) global.location.hash = `#/batches/${tr.dataset.id}`;
  });

  $('#btForm').addEventListener('submit', async e => {
    e.preventDefault();
    const save = $('#btSave');
    save.disabled = true;
    global.FarmUi.markFields($('#btForm'), {});
    try {
      const fields = {
        crop: $('#btCrop').value, strain: $('#btStrain').value, source: $('#btSource').value, block_count: $('#btCount').value,
        block_wet_kg: $('#btKg').value, moisture_pct: $('#btMoist').value, received_at: $('#btReceived').value,
      };
      const made = await global.FarmApi.createBatch(batchBody({ edit: false, fields }));
      if (!live()) return;
      say('good', 'Saved.');
      global.location.hash = `#/batches/${made.id}`;
    } catch (err) {
      if (live()) {
        const p = global.FarmUi.plainError(err, LABELS);
        say('error', p.text);
        global.FarmUi.markFields($('#btForm'), p.fields);
      }
    } finally {
      if (live()) save.disabled = false;
    }
  });

  return load();
}

// ---- detail ----

async function mountDetail(el, id, live) {
  let gen = 0;
  const $ = s => el.querySelector(s);
  el.innerHTML = DETAIL_HTML;
  const HR = global.FarmHarvestRules;
  addCropOptions($('#bdCrop'));
  $('#bdStrain').maxLength = HR.LIM.text;
  $('#bdSource').maxLength = HR.LIM.text;
  $('#bdNotes').maxLength = HR.LIM.notes;
  let batch = null;

  const headSlot = $('#bdHead');
  const headActions = ['#bdRoom', '#bdPlace', '#bdClear', '#bdDelete'].map($);
  const roomSel = $('#bdRoom'), msgEl = $('#bdMsg');   // held: notFound() detaches them, writes to them are harmless
  const msg = (text, lvl) => global.FarmUi.say(msgEl, lvl || (text ? 'good' : 'info'), text);
  const fail = err => msg(errText(err), 'error');

  function notFound() {
    const page = document.createElement('div'); page.className = 'bd-page';
    const p = document.createElement('p'); p.className = 'est-note'; p.textContent = 'This batch does not exist.';
    const a = document.createElement('a'); a.href = '#/batches'; a.textContent = 'Batches';
    page.append(p, a);
    el.replaceChildren(page);
  }

  function paint(b) {
    batch = b;
    const clock = global.FarmUi.farmClock();
    $('#bdCrop').value = b.crop;
    $('#bdStrain').value = b.strain ?? '';
    $('#bdSource').value = b.source ?? '';
    $('#bdCount').value = String(b.block_count);
    $('#bdKg').value = String(b.block_wet_kg);
    $('#bdMoist').value = String(b.moisture_pct);
    $('#bdSpawn').value = b.spawn_date == null ? '' : secondsToDate(b.spawn_date);
    $('#bdReceived').value = secondsToDate(b.received_at);
    $('#bdGap').value = String(b.flush_gap_days);
    $('#bdNotes').value = b.notes ?? '';
    const received = b.state === 'received';
    $('#bdRoom').hidden = !received;
    $('#bdPlace').hidden = !received;
    $('#bdClear').hidden = b.state !== 'placed';
    $('#bdDelete').hidden = b.totals.crates !== 0;
    headSlot.replaceChildren(global.FarmUi.pageHead({ title: titleOf(b), sub: subText(b), actions: headActions }));   // the buttons move into the head's action row
    const chart = $('#bdChart');
    chart.hidden = !drawFlushChart($('#bdChartSvg'), b);
    $('#bdChartSum').textContent = chart.hidden ? '' : dropText(b.flushes);
    $('#bdFlushes').querySelector('tbody').replaceChildren(...b.flushes.map(f =>
      row([f.n, secondsToDate(f.from), secondsToDate(f.to), f.kg, f.g_per_block, f.be_pct])));
    $('#bdCrates').querySelector('tbody').replaceChildren(...b.crates.map(c => {
      const undo = document.createElement('button');
      undo.className = 'btn'; undo.type = 'button'; undo.textContent = 'Undo'; undo.dataset.undo = String(c.id);
      const cell = document.createElement('td'); cell.appendChild(undo);
      return row([`${secondsToDate(c.t)} ${clock.hm(c.t)}`, c.kg, c.picker || '–', cell]);
    }));
  }

  // Returns false when the batch is gone or the page was left.
  async function load() {
    const mine = ++gen;
    let b;
    try { b = await global.FarmApi.getBatch(id); }
    catch (err) {
      if (!live() || mine !== gen) return false;
      if (err && err.name === 'ApiError' && err.status === 404) notFound(); else fail(err);
      return false;
    }
    if (!live() || mine !== gen) return false;
    paint(b);
    return true;
  }

  // Runs one action on a button: disabled while it runs; the reload follows a success.
  async function act(button, fn, okText, reloadOnError) {
    button.disabled = true;
    global.FarmUi.markFields($('#bdForm'), {});
    try {
      await fn();
      if (!live()) return;
      if (await load()) msg(okText || '');
    } catch (err) {
      if (live()) {
        const p = global.FarmUi.plainError(err, LABELS);
        msg(p.text, 'error');
        global.FarmUi.markFields($('#bdForm'), p.fields);
        if (reloadOnError) await load();
      }
    } finally {
      if (live()) button.disabled = false;
    }
  }

  $('#bdForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!batch) return;
    const names = { crop: '#bdCrop', strain: '#bdStrain', source: '#bdSource', block_count: '#bdCount', block_wet_kg: '#bdKg',
      moisture_pct: '#bdMoist', spawn_date: '#bdSpawn', received_at: '#bdReceived', flush_gap_days: '#bdGap', notes: '#bdNotes' };
    const fields = {};
    for (const k of Object.keys(names)) fields[k] = $(names[k]).value;
    const all = batchBody({ edit: true, fields });
    const body = {};
    for (const k of Object.keys(all)) {
      // A date is unchanged when it is still the same farm day (the stored time may carry an hour).
      const current = DATE.includes(k) && batch[k] != null ? dateToSeconds(secondsToDate(batch[k])) : batch[k];
      if (all[k] !== (current === undefined ? null : current)) body[k] = all[k];
    }
    global.FarmUi.markFields($('#bdForm'), {});
    if (Object.keys(body).length === 0) { msg('Nothing to change.', 'info'); return; }
    act($('#bdSave'), () => global.FarmApi.updateBatch(id, body), 'Saved.');
  });

  $('#bdPlace').addEventListener('click', () =>
    act($('#bdPlace'), () => global.FarmApi.placeBatch(id, { room_id: Number($('#bdRoom').value) })));

  $('#bdClear').addEventListener('click', () => {
    if (!global.confirm(CONFIRM_FINISH)) return;
    act($('#bdClear'), () => global.FarmApi.clearBatch(id));
  });

  $('#bdDelete').addEventListener('click', async () => {
    if (!global.confirm('Delete this batch? It cannot be undone.')) return;
    const button = $('#bdDelete');
    button.disabled = true;
    try {
      await global.FarmApi.deleteBatch(id);
      if (live()) global.location.hash = '#/batches';
    } catch (err) {
      if (live()) { fail(err); button.disabled = false; }
    }
  });

  $('#bdCrates').addEventListener('click', e => {
    const button = e.target && e.target.closest ? e.target.closest('button[data-undo]') : null;
    if (!button) return;
    const crate = batch.crates.find(c => String(c.id) === button.dataset.undo);
    if (!global.confirm(`Undo the crate of ${crate ? crate.kg : ''} kg?`)) return;
    act(button, () => global.FarmApi.undoCrate(Number(button.dataset.undo)), '', true);
  });

  const [rooms] = await Promise.all([
    global.FarmApi.listRooms().catch(err => { if (live()) fail(err); return []; }),
    load(),
  ]);
  if (!live()) return;
  roomSel.replaceChildren(...rooms.map(r => {
    const o = document.createElement('option');
    o.value = String(r.id); o.textContent = r.name;
    return o;
  }));
}

function mount(el, params) {
  const me = current = {};
  const live = () => current === me;
  if (params && params.id != null) return mountDetail(el, params.id, live);
  return mountList(el, live);
}
function unmount() { current = null; }

global.FarmShell.register('batches', { mount, unmount });

if (typeof module === 'object' && module && module.exports) module.exports = { dateToSeconds, secondsToDate, ageDays, batchBody, plural, daysText, titleOf, stateWords, subText, filterByState, flushBars, dropText, timelineRows, niceMax };
})(typeof window !== 'undefined' ? window : globalThis);
