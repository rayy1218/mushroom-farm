// web/room-calibrate.js: the room page's Calibrate tab (docs/contracts/web.md C5 3.6, 3.11).
(function (global) {
'use strict';

const FIELDS7 = ['ac_hp', 'ac_units', 'fog_lph', 'air_m3h', 'walls', 'roof', 'height'];
const FARM_OFFSET = 28800;

function farmMidnight(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], ms = Date.UTC(y, mo - 1, d), c = new Date(ms);
  if (c.getUTCFullYear() !== y || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d) return null;
  return ms / 1000 - FARM_OFFSET;
}
function farmDate(t) {
  const d = new Date((t + FARM_OFFSET) * 1000), p2 = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
function defaultRange(now) { return { from: farmDate(now - 86400), to: farmDate(now) }; }
function rangeQuery(fromText, toText, now) {
  const a = farmMidnight(fromText), b = farmMidnight(toText);
  if (a === null || b === null) return { error: 'Pick the first and the last day.' };
  if (a > b) return { error: 'The first day is after the last day.' };
  const days = (b - a) / 86400 + 1;
  if (days > 7) return { error: 'Pick at most 7 days.' };
  const to = Math.min(now, b + 86400 - 1);
  if (to < a) return { error: 'The first day is in the future.' };
  return { from: a, to, days };
}

function logFromReadings(readings) {
  const SENS = global.ClimateController.SENSORS;
  const ok = (v, k) => (Number.isFinite(v) && v >= SENS[k].min && v <= SENS[k].max ? v : null);
  const sorted = [...readings].sort((x, y) => x.t - y.t);
  const t0 = sorted.length ? sorted[0].t : 0;
  return sorted.map(r => ({
    t: r.t - t0, hour: ((r.t + FARM_OFFSET) % 86400) / 3600,
    T: ok(r.T, 'T'), RH: ok(r.RH, 'RH'), CO2: ok(r.CO2, 'CO2'), tOut: ok(r.t_out, 'tOut'), rhOut: ok(r.rh_out, 'rhOut'),
    air: r.air, fog: r.fog, lights: r.lights, circ: r.circ,
    acPower: r.ac_mode === 'off' ? 0 : 1, acMode: r.ac_mode === 'off' ? null : r.ac_mode,
    acSet: r.ac_setpoint, acFan: r.ac_fan, stage: r.stage,
  }));
}
function historyGaps(readings) {
  const ts = readings.map(r => r.t).sort((x, y) => x - y);
  let n = 0;
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > 600) n++;
  return n;
}

function envBaseFor(room, blocks, rows, equipment, airM3h) {
  const SIM = global.ClimateSim;
  const e = structuredClone(SIM.DEFAULT_ENV);
  e.airM3h = airM3h;
  e.room = { volume: room.volume };
  e.blocks = blocks;
  const withStage = rows.find(r => r.stage);
  e.blockStage = withStage ? withStage.stage : (room.live && room.live.stage) || SIM.DEFAULT_ENV.blockStage;
  if (equipment) e.plant = global.ClimateEquipment.plantOf(equipment, { volume: room.volume, calib: {} });
  return e;
}
function paramsOfRun(run) { return { ua: run.ua, infAch: run.inf_ach, moistBuffer: run.moist_buffer, co2PerBlock: run.co2_per_block }; }
function startParams(runs, envBase) {
  const applied = runs.find(r => r.applied === true);
  return applied ? paramsOfRun(applied) : global.ClimateCalib.paramsOf(envBase);
}
function defaultBlocks(rows, live) {
  const sum = rows.reduce((a, r) => a + (r.blocks || 0), 0);
  if (sum >= 1) return sum;
  return live && live.blocks >= 1 ? live.blocks : null;
}
function parseBlocks(text) {
  const t = String(text).trim();
  if (!/^\d+$/.test(t)) return null;
  const n = +t;
  return n >= 1 && n <= global.ClimateRoomRules.LIM.blocks ? n : null;
}

function pick7(eq) { return eq ? Object.fromEntries(FIELDS7.map(k => [k, eq[k]])) : null; }
function calibBody(fit, rows, source, range, equipment) {
  const fin = v => (Number.isFinite(v) ? v : null), p = fit.params, r = fit.result.rmse;
  const body = { ua: p.ua, inf_ach: p.infAch, moist_buffer: p.moistBuffer, co2_per_block: p.co2PerBlock,
    rmse_t: fin(r.T), rmse_rh: fin(r.RH), rmse_co2: fin(r.CO2), log_rows: rows.length, source };
  if (source === 'history') { body.log_from = range.from; body.log_to = range.to; }
  body.equipment = pick7(equipment);
  return body;
}
function sameMachines(a, b) {
  if (!a || !b) return !a && !b;
  return FIELDS7.every(k => a[k] === b[k]);
}
function staleText(applied) {
  return `The applied calibration (${farmDate(applied.run_at)}) was fitted with other machines than this room has now. Fit again so Simulate uses room values that match the machines.`;
}

function pairSeries(series, buckets, start) {
  const byT = new Map(buckets.map(b => [b.t, b])), out = [];
  for (const s of [...series].sort((x, y) => x.h - y.h)) {
    const b = byT.get(start + s.h * 3600);
    if (b) out.push({ h: s.h, sim: { T: s.T, RH: s.RH, CO2: s.CO2, stage: s.stage }, real: { T: b.T, RH: b.RH, CO2: b.CO2, stage: b.stage } });
  }
  return out;
}
function differences(pairs) {
  const mean = k => {
    const d = pairs.filter(p => Number.isFinite(p.sim[k]) && Number.isFinite(p.real[k])).map(p => Math.abs(p.sim[k] - p.real[k]));
    return d.length ? d.reduce((a, x) => a + x, 0) / d.length : NaN;
  };
  const staged = pairs.filter(p => p.real.stage);
  return { T: mean('T'), RH: mean('RH'), CO2: mean('CO2'), hours: pairs.length,
    stageShare: staged.length ? staged.filter(p => p.real.stage === p.sim.stage).length / staged.length * 100 : null };
}
function differenceLines(d) {
  if (d.hours === 0) return ['No real readings for this run yet.'];
  const lines = [`Average difference: ${d.T.toFixed(1)} °C, RH ${d.RH.toFixed(1)} %, CO₂ ${Math.round(d.CO2)} ppm over ${d.hours} hours.`];
  if (d.stageShare !== null) lines.push(`Stage agreement: ${Math.round(d.stageShare)} % of hours`);
  lines.push('A big gap means: calibrate again.');
  return lines;
}
function predictedRows(series) { return series.map(s => ({ t: s.h * 3600, T: s.T, RH: s.RH, CO2: s.CO2 })); }
function realRows(buckets, start) { return buckets.map(b => ({ t: b.t - start, T: b.T, RH: b.RH, CO2: b.CO2 })); }

const helpers = { farmMidnight, farmDate, defaultRange, rangeQuery, logFromReadings, historyGaps, envBaseFor, paramsOfRun, startParams,
  defaultBlocks, parseBlocks, calibBody, sameMachines, staleText, pairSeries, differences, differenceLines, predictedRows, realRows };
const EXPLAIN = "Calibrate = make the virtual room behave like this real room. The room's recorded history is already on the farm server: pick a few days and press Fit. The app replays those days in its virtual room and adjusts four room values until it matches what really happened. Then Simulate gives answers for this room, not an average one.";

const MARKUP = `
<p class="explain"></p>
<p class="tag" id="cbStale" hidden></p>
<section class="card" aria-labelledby="hCbFit">
  <h3 id="hCbFit">Fit the room values</h3>
  <div class="seg" id="cbSource" role="group" aria-label="Source of the log">
    <button type="button" data-src="history" aria-pressed="true">This room's history</button>
    <button type="button" data-src="csv" aria-pressed="false">Log file (CSV)</button>
  </div>
  <div class="cal-row" id="cbHistory">
    <label for="cbFrom">From</label><input type="date" id="cbFrom">
    <label for="cbTo">To</label><input type="date" id="cbTo">
    <button type="button" class="btn" id="cbLoad">Load</button>
  </div>
  <div class="cal-row" id="cbCsv" hidden>
    <label class="btn" for="calFile">Load a CSV log</label><input type="file" id="calFile" accept=".csv,text/csv" class="vh">
    <details class="measure">
      <summary>CSV columns</summary>
      <p>Header row, then one row per minute (or less). Columns in any order: <b>time</b> (date and time, or minutes from the start), <b>T</b>, <b>RH</b>, <b>CO2</b>, tOut, rhOut, air (0 or 1, the air exchange; an old fan column 0–3 counts as on when above 0), fog (0–3), acPower (0/1), acMode (cool/heat/dry/fan), acSet (°C), acFan (low/auto/high), lights (0/1), circ (0/1, circulation fan). Columns in bold are necessary.</p>
    </details>
  </div>
  <div class="cal-row">
    <label for="calBlocks">Blocks in the room during the log</label>
    <input type="number" id="calBlocks" min="1" max="200000" step="1">
    <button type="button" class="btn" id="calFit" disabled>Fit</button>
    <button type="button" class="btn" id="calApply" disabled>Save and apply</button>
  </div>
  <p class="tag" id="calMsg" role="status"></p>
  <table class="fit-table" id="cbTable"></table>
  <div class="cal-charts" id="cbCharts"></div>
</section>
<section class="card pvr-card" aria-labelledby="hCbPvr">
  <h3 id="hCbPvr">Predicted vs real</h3>
  <div class="cal-row">
    <label for="pvRun">Cycle run</label><select id="pvRun"></select>
    <label for="pvStart">Real start</label><input type="date" id="pvStart">
    <button type="button" class="btn" id="pvUse">Use this start</button>
  </div>
  <div class="cal-charts" id="pvCharts"></div>
  <div id="pvDiff"></div>
  <p class="tag" id="pvMsg" role="status"></p>
</section>`;

let gen = 0, alive = false;

function mount(el, ctx) {
  const FA = global.FarmApi, UI = global.FarmUi, CAL = global.ClimateCalib;
  const myGen = ++gen; alive = true;
  const live = () => alive && myGen === gen;
  const id = ctx.id, now = () => Math.floor(Date.now() / 1000);
  let room = ctx.room(), mixRows = [], runs = [], equipment = null, settings = null;
  let source = 'history', rows = null, range = null, envBase = null, params = null, base = null, fit = null;
  let busy = false, pendingRebuild = false, loaded = false, cycles = [], seq = 0, cmpSeq = 0;

  el.innerHTML = MARKUP;
  const $ = sel => el.querySelector(sel);
  $('.explain').textContent = EXPLAIN;
  const msg = text => { $('#calMsg').textContent = text; };
  const pvMsg = text => { $('#pvMsg').textContent = text; };
  const fmtRange = defaultRange(now());
  $('#cbFrom').value = fmtRange.from; $('#cbTo').value = fmtRange.to;

  const blocksNow = () => parseBlocks($('#calBlocks').value);
  function syncButtons() {
    const ctrl = ['#cbLoad', '#calFile', '#calBlocks'];
    for (const sel of ctrl) $(sel).disabled = busy;
    for (const b of el.querySelectorAll('#cbSource button')) b.disabled = busy;
    $('#calFit').disabled = busy || !loaded || blocksNow() === null || !rows || !envBase;
    $('#calApply').disabled = busy || !fit;
  }
  function paintWarning() {
    const applied = runs.find(r => r.applied === true), box = $('#cbStale');
    const stale = !!applied && !sameMachines(applied.equipment || null, equipment);
    box.hidden = !stale; box.textContent = stale ? staleText(applied) : '';
  }
  function renderTable() {
    const table = $('#cbTable'), fitP = fit && fit.params;
    const head = document.createElement('thead'), hr = document.createElement('tr');
    for (const t of ['Room value', 'Now', 'Fitted']) hr.append(UI.cell('th', t));
    head.append(hr);
    const body = document.createElement('tbody');
    for (const [k, P] of Object.entries(CAL.PARAMS)) {
      const tr = document.createElement('tr'), d = k === 'infAch' ? 2 : 1;
      tr.append(UI.cell('td', P.label), UI.cell('td', params ? params[k].toFixed(d) : '–'), UI.cell('td', fitP ? fitP[k].toFixed(d) : '–'));
      body.append(tr);
    }
    const fe = x => (x ? `${x.rmse.T.toFixed(2)} °C / ${x.rmse.RH.toFixed(1)} % / ${x.rmse.CO2.toFixed(0)} ppm` : '–');
    const foot = document.createElement('tfoot');
    const tr = document.createElement('tr'); tr.append(UI.cell('td', 'T / RH / CO₂'), UI.cell('td', fe(base)), UI.cell('td', fe(fit && fit.result))); foot.append(tr);
    table.replaceChildren(head, body, foot);
    const old = $('#cbNote'); if (old) old.remove();
    const n = CAL.PARAMS.ua && CAL.PARAMS.ua.note;
    if (typeof n === 'string') { const p = document.createElement('p'); p.className = 'tag'; p.id = 'cbNote'; p.textContent = n; table.after(p); }
    const host = $('#cbCharts');
    if (rows && base) global.FarmCharts.drawCalibCharts(host, { rows, base, fit });
    else host.replaceChildren();
  }
  function rebuild() {
    if (!live()) return;
    fit = null; base = null;
    const blocks = blocksNow();
    if (blocks === null) {
      msg('Enter the number of blocks in the room during the log.');
      params = null; renderTable(); syncButtons(); return;
    }
    if (loaded) {
      try {
        envBase = envBaseFor(room, blocks, rows || [], equipment, settings.airM3h);
        params = startParams(runs, envBase);
        if (rows) base = CAL.replay(rows, envBase, params);
      } catch (err) { msg(err.message); envBase = null; params = null; base = null; }
    }
    renderTable(); syncButtons();
  }

  // Source, history and CSV
  $('#cbSource').addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button[data-src]');
    if (!b || busy) return;
    source = b.dataset.src; rows = null; range = null; fit = null; seq++;
    for (const x of el.querySelectorAll('#cbSource button')) x.setAttribute('aria-pressed', String(x === b));
    $('#cbHistory').hidden = source !== 'history'; $('#cbCsv').hidden = source !== 'csv';
    msg(''); rebuild();
  });
  $('#cbLoad').addEventListener('click', async () => {
    const q = rangeQuery($('#cbFrom').value, $('#cbTo').value, now());
    if (q.error) { msg(q.error); return; }
    const mySeq = ++seq;
    let readings;
    try { readings = await FA.getReadings(id, { from: q.from, to: q.to }); }
    catch (err) { if (live() && mySeq === seq) msg(UI.errorText(err)); return; }
    if (!live() || mySeq !== seq) return;
    if (readings.length < 120) { rows = null; range = null; rebuild(); msg('Not enough readings in these days (at least 1 h).'); return; }
    rows = logFromReadings(readings);
    const ts = readings.map(r => r.t);
    range = { from: Math.min(...ts), to: Math.max(...ts) };
    const g = historyGaps(readings);
    const text = `${q.days} days · ${readings.length} readings` + (g > 0 ? ` The range has ${g} gap(s) (the server was stopped); the fit keeps the machines unchanged through them.` : '');
    msg(text); rebuild();
  });
  $('#calFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => {
      if (!live()) return;
      let parsed;
      try { parsed = CAL.parseCsv(txt); } catch (err) { msg(`The file cannot be used: ${err.message}`); return; }
      rows = parsed; range = null;
      msg(`${f.name}: ${rows.length} rows, ${(rows[rows.length - 1].t / 3600).toFixed(1)} h.`); rebuild();
    }).catch(err => { if (live()) msg(`The file cannot be read: ${err && err.message}`); });
  });
  $('#calBlocks').addEventListener('input', () => { if (!busy) rebuild(); });

  $('#calFit').addEventListener('click', async () => {
    if (busy || !rows || !envBase) return;
    busy = true; syncButtons(); msg('Fitting… (this takes a few seconds)');
    try {
      const res = await CAL.fitAsync(rows, envBase, params, p => {
        if (!live()) throw new Error('unmounted');
        msg(`Fitting: run ${p.evals} of up to ${p.maxEval}, error score ${p.score.toFixed(2)}…`);
      });
      if (!live()) return;
      fit = res; msg(`Fit done after ${fit.evals} simulation runs. The air leakage is the least certain value.`);
    } catch (err) {
      if (!live()) return;
      msg(`The fit stopped: ${err && err.message}`);
    } finally { if (live()) { busy = false; if (pendingRebuild) { pendingRebuild = false; rebuild(); } else renderTable(); syncButtons(); } }
  });
  $('#calApply').addEventListener('click', async () => {
    if (busy || !fit || !rows) return;
    busy = true; syncButtons();
    try {
      const run = await FA.saveCalibration(id, calibBody(fit, rows, source, range, equipment));
      const applied = await FA.applyCalibration(id, run.id);
      if (!live()) return;
      runs = [applied, ...runs.filter(r => r.id !== applied.id).map(r => ({ ...r, applied: false }))];
      params = paramsOfRun(applied);
      base = CAL.replay(rows, envBase, params); fit = null;
      msg('Applied. Simulate now uses these values.');
      paintWarning(); renderTable();
    } catch (err) { if (live()) msg(UI.errorText(err)); }
    finally { if (live()) { busy = false; if (pendingRebuild) { pendingRebuild = false; rebuild(); } syncButtons(); } }
  });

  // Predicted vs real
  const pvRunId = () => +$('#pvRun').value;
  const pvInfo = () => cycles.find(c => c.id === pvRunId());
  function fillStart() {
    const info = pvInfo();
    $('#pvStart').value = info && info.real_start ? farmDate(info.real_start) : '';
    $('#pvCharts').replaceChildren(); $('#pvDiff').replaceChildren();
  }
  function paintList() {
    const sel = $('#pvRun');
    if (!cycles.length) {
      const o = document.createElement('option'); o.textContent = 'No cycle runs yet';
      sel.replaceChildren(o); sel.disabled = true; $('#pvUse').disabled = true; pvMsg('Run a full cycle on the Simulate tab first.'); return;
    }
    sel.disabled = false; $('#pvUse').disabled = false; pvMsg('');
    sel.replaceChildren(...cycles.map(c => {
      const o = document.createElement('option'); o.value = String(c.id);
      o.textContent = `Run ${c.id} · ${farmDate(c.created_at)} · ${c.days} days`; return o;
    }));
    const want = ctx.params && +ctx.params.runId;
    sel.value = String(cycles.some(c => c.id === want) ? want : cycles[0].id);
    fillStart();
    const info = pvInfo(); if (info && info.real_start) compare();
  }
  async function compare() {
    const info = pvInfo(); if (!info) return;
    const runId = info.id, start = farmMidnight($('#pvStart').value), mySeq = ++cmpSeq;
    const charts = $('#pvCharts'), diff = $('#pvDiff');
    const none = () => { charts.replaceChildren(); const p = document.createElement('p'); p.textContent = 'No real readings for this run yet.'; diff.replaceChildren(p); };
    if (start === null) { charts.replaceChildren(); diff.replaceChildren(); return; }
    if (start > now()) { none(); return; }
    try {
      const run = await FA.getSimulation(id, runId);
      const buckets = await FA.getReadings(id, { from: start, to: Math.min(now(), start + info.days * 86400 - 1), step: 3600 });
      if (!live() || mySeq !== cmpSeq) return;
      if (!buckets.length) { none(); return; }
      const series = run.result.series;
      const real = realRows(buckets, start), last = real[real.length - 1].t;
      global.FarmCharts.drawCalibCharts(charts, { rows: real, base: { series: predictedRows(series).filter(p => p.t <= last) }, fit: null,
        labels: { rows: 'Real (sensors)', base: `Predicted (run ${runId})` }, dashed: 'base' });
      diff.replaceChildren(...differenceLines(differences(pairSeries(series, buckets, start))).map(t => { const p = document.createElement('p'); p.textContent = t; return p; }));
    } catch (err) { if (live() && mySeq === cmpSeq) pvMsg(UI.errorText(err)); }
  }
  $('#pvRun').addEventListener('change', () => { cmpSeq++; pvMsg(''); fillStart(); const info = pvInfo(); if (info && info.real_start) compare(); });
  $('#pvUse').addEventListener('click', async () => {
    const info = pvInfo(); if (!info) return;
    const start = farmMidnight($('#pvStart').value);
    if (start === null) { pvMsg('Pick the day this cycle really started.'); return; }
    try {
      const upd = await FA.updateSimulation(id, info.id, { real_start: start });
      if (!live()) return;
      const i = cycles.findIndex(c => c.id === info.id); if (i >= 0) cycles[i] = upd;
      pvMsg(''); compare();
    } catch (err) { if (live()) pvMsg(UI.errorText(err)); }
  });

  ctx.on('settings', d => { settings = d.settings; if (busy) { pendingRebuild = true; return; } rebuild(); });
  ctx.on('room', r => { room = r; });

  return (async () => {
    syncButtons();
    const [mix, cals, eq, st, sims] = await Promise.allSettled([FA.getMix(id), FA.listCalibrations(id), FA.getEquipment(id), FA.getSettings(id), FA.listSimulations(id, { limit: 200 })]);
    if (!live()) return;
    const failed = [mix, cals, eq, st].find(x => x.status === 'rejected');
    if (failed) { msg(UI.errorText(failed.reason)); }
    else {
      mixRows = mix.value; runs = cals.value; equipment = eq.value || null; settings = st.value;
      loaded = true;
      const b = defaultBlocks(mixRows, room.live);
      $('#calBlocks').value = b === null ? '' : String(b);
      paintWarning(); rebuild();
    }
    if (sims.status === 'fulfilled') {
      cycles = sims.value.filter(r => r.kind === 'cycle' && r.days !== null).sort((a, b) => b.created_at - a.created_at || b.id - a.id);
      paintList();
    } else { cycles = []; paintList(); pvMsg(UI.errorText(sims.reason)); }
  })();
}
function unmount() {
  try { alive = false; gen++; } catch { /* never throws */ }
}

global.FarmRoomTabs.register('calibrate', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
