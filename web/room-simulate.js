// web/room-simulate.js: the Simulate tab of the room page (docs/contracts/web.md 3.10).
(function (global) {
'use strict';

const FIELDS7 = ['ac_hp', 'ac_units', 'fog_lph', 'air_m3h', 'walls', 'roof', 'height'];

// ---------------- pure helpers (no DOM, no network) ----------------
const toCapacityMix = rows => rows.map(r => ({ crop: r.crop, blocks: r.blocks, ...(r.co2_per_block !== null ? { co2PerBlock: r.co2_per_block } : {}) }));
const toMixRows = mix => mix.map(m => ({ crop: m.crop, blocks: m.blocks, co2_per_block: m.co2PerBlock ?? null }));
function sameMix(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((m, i) => m.crop === b[i].crop && m.blocks === b[i].blocks && m.co2PerBlock === b[i].co2PerBlock);
}
function appliedCalib(runs) {
  const c = runs.find(x => x.applied === true);
  if (!c) return null;
  return { ua: c.ua, infAch: c.inf_ach, moistBuffer: c.moist_buffer, co2PerBlock: c.co2_per_block,
    rmse: { T: c.rmse_t, RH: c.rmse_rh, CO2: c.rmse_co2 }, date: new Date(c.run_at * 1000).toISOString() };
}
const pick7 = eq => Object.fromEntries(FIELDS7.map(k => [k, eq[k]]));
function runInputs(kind, d) {
  const row = d.calibrations.find(x => x.applied === true) || null;
  const calib = appliedCalib(d.calibrations);
  const room = { name: d.room.name, volume: d.room.volume, airM3h: d.settings.airM3h, calib };
  if (d.equipment) room.plant = global.ClimateEquipment.plantOf(d.equipment, { volume: d.room.volume, calib });
  const mix = toCapacityMix(d.draft);
  const inputs = { mix: toMixRows(mix), settings: d.settings, region: d.region, tariff: d.tariff, volume: d.room.volume,
    calibration: row ? { id: row.id, ua: row.ua, inf_ach: row.inf_ach, moist_buffer: row.moist_buffer, co2_per_block: row.co2_per_block } : null,
    empty_below: kind === 'capacity' ? d.emptyBelow : null,
    equipment: d.equipment ? pick7(d.equipment) : null };
  return { room, mix, settings: d.settings, region: d.region, tariff: d.tariff, emptyBelow: d.emptyBelow, inputs };
}

function cycleSummary(res) {
  if (res.verdict === 'impossible') return { chip: { lvl: 'warning', icon: '✕', text: 'impossible' }, line: res.why };
  const n = res.stages.filter(g => g.pass === false).length;
  const chip = n === 0 ? { lvl: 'good', icon: '✓', text: 'all stages pass' } : { lvl: 'warning', icon: '✕', text: `${n} stage(s) fail` };
  const t = res.totals;
  return { chip, line: `${t.days} days · ${res.inputs.flushes} flushes · ${Math.round(t.kwh)} kWh · RM ${t.rm.toFixed(2)} · RM ${t.rmPerBlock.toFixed(2)} per block` };
}
function stageRows(res) {
  return res.stages.map(g => {
    const judged = g.stage !== 'spawn';
    const alarms = Object.entries(g.alarms).map(([id, count]) => `${id} ×${count}`).join(', ');
    return [global.ClimateController.STAGES[g.stage], String(g.flush), String(g.days), g.inT.toFixed(1),
      judged ? g.rhOk.toFixed(1) : 'not judged', judged ? g.co2Below.toFixed(1) : 'not judged', g.maxCore.toFixed(1),
      alarms || '–', String(Math.round(g.kwh)), g.rm.toFixed(2), g.pass ? 'Pass' : g.fails.join(', ')];
  });
}
function seriesPoints(res) {
  return res.series.map(p => {
    const g = res.stages.find(x => x.stage === p.stage && x.flush === p.flush);
    const t = g ? g.targets : null;
    return { t: p.h * 3600, T: p.T, RH: p.RH, C: p.CO2, core: p.core, spT: t ? t.spT : NaN, spRH: t ? t.spRH : NaN, co2Lim: t ? t.co2Lim : NaN };
  });
}

const CHIPS = {
  cycle: { pass: ['good', '✓', 'Passes'], fail: ['warning', '✕', 'Fails'] },
  capacity: { good: ['good', '✓', 'Good'], tight: ['info', '●', 'Tight'], 'too-dense': ['warning', '✕', 'Too many blocks'], 'too-empty': ['info', '●', 'Too few blocks'] },
  equipment: { enough: ['good', '✓', 'Enough'], 'too-small': ['warning', '✕', 'Too small'], 'too-big': ['warning', '✕', 'Too big'],
    oversized: ['info', '●', 'Bigger than needed'] },
};
function runChip(kind, verdict) {
  const own = Object.hasOwn(CHIPS, kind) ? CHIPS[kind] : {};
  const c = verdict === 'impossible' ? ['warning', '✕', 'Impossible'] : Object.hasOwn(own, verdict) ? own[verdict] : ['info', '●', verdict];
  return { lvl: c[0], icon: c[1], text: c[2] };
}
const KIND_NAME = { cycle: 'Cycle', capacity: 'Capacity', equipment: 'Equipment' };
function runRowTexts(info) {
  const CROPS = global.ClimateController.CROPS;
  const parts = info.inputs.mix.filter(m => m.blocks > 0).map(m => `${m.blocks} ${Object.hasOwn(CROPS, m.crop) ? CROPS[m.crop].name : m.crop}`);
  let energy = '–';
  if (info.kind === 'cycle' && info.rm !== null && info.blocks > 0) energy = `RM ${(info.rm / info.blocks).toFixed(2)} per block`;
  else if (info.kind === 'capacity' && info.utilisation !== null) energy = `${info.utilisation} %`;
  return { run: `${KIND_NAME[info.kind] || info.kind} · ${global.FarmUi.farmClock().stamp(info.created_at)}`, mix: parts.length ? parts.join(' + ') : '–',
    chip: runChip(info.kind, info.verdict), energy, note: info.note ?? '' };
}
const int = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function progressText(p) {
  if (p.day === undefined) return `Simulation run ${p.runs}: ${global.FarmUi.nf(p.blocks)} blocks, ${p.pass ? 'pass' : 'fail'}…`;
  const flush = p.stage === 'fruiting' || p.stage === 'rest' ? ` · flush ${p.flush}` : '';
  return `Day ${p.day} of ${p.days} · ${global.ClimateController.STAGES[p.stage]}${flush}`;
}
function machinesText(eq) {
  if (!eq) return 'Typical machines';
  const label = k => global.ClimateEquipment.CONSTRUCTIONS[k].label;
  const ac = eq.ac_units > 1 ? `${eq.ac_units} × ${eq.ac_hp} hp` : `${eq.ac_hp} hp`;
  const walls = eq.walls === null && eq.roof === null ? 'Typical walls' : eq.walls === eq.roof ? `${label(eq.walls)} walls and roof`
    : `${label(eq.walls)} walls, ${label(eq.roof)} roof`;
  return `${ac} aircond · ${eq.fog_lph} L/h fogger · ${int(eq.air_m3h)} m³/h air exchange · ${walls}`;
}
function clampBlocks(text) {
  const n = Math.round(+text);
  return text === '' || !Number.isFinite(n) ? 0 : Math.min(200000, Math.max(0, n));
}
function clampCo2(text) {
  const n = Math.round(+text);
  return text === '' || !Number.isFinite(n) ? null : Math.min(1000, Math.max(1, n));
}
const regionText = key => (key === 'my-lowland' ? 'Lowland Peninsular Malaysia' : key);
const helpers = { toCapacityMix, toMixRows, sameMix, appliedCalib, runInputs, cycleSummary, stageRows,
  seriesPoints, runRowTexts, progressText, machinesText, clampBlocks, clampCo2, regionText };

// ---------------- the capacity report (moved from web/capacity.js, wave 1) ----------------
const VERDICT_CHIP = {
  impossible: { lvl: 'critical', icon: '◆', text: 'Impossible' },
  'too-dense': { lvl: 'serious', icon: '▲', text: 'Too dense' },
  tight: { lvl: 'warning', icon: '▲', text: 'Tight' },
  good: { lvl: 'good', icon: '✓', text: 'Good' },
  'too-empty': { lvl: 'warning', icon: '▼', text: 'Too empty' },
};
const LIMIT_WORD = { air: 'the air exchange (CO₂ purges)', ac: 'the AC (heat)', fog: 'the fogger (water)' };
const FAIL_MACHINE = { 'temperature too high': 'the AC cannot cool enough', 'temperature too low': 'the AC cannot heat enough',
  'humidity too low': 'the fogger cannot keep up', 'humidity at the low alarm': 'the fogger cannot keep up',
  'humidity near saturation': 'the AC cannot dry enough', 'CO₂ above the limit': 'the air exchange is too small for short purges' };

const cropName = k => { const C = global.ClimateController.CROPS; return Object.hasOwn(C, k) ? C[k].name : k; };
function verdictText(rep) {
  const UI = global.FarmUi;
  const cap = rep.capacity, pct = rep.utilisation == null ? '' : ` (${Math.round(rep.utilisation)} %)`;
  const holds = !cap ? '' : cap.settled ? `Holds ${UI.nf(cap.max)} blocks` : cap.hi ? `Holds between ${UI.nf(cap.max)} and ${UI.nf(cap.hi)} blocks` : `Holds at least ${UI.nf(cap.max)} blocks`;
  switch (rep.verdict) {
    case 'impossible': return rep.why || 'No size of this mix passes on all design days, even with almost no blocks.';
    case 'too-dense': return `${holds}; you plan ${UI.nf(rep.planned)}${pct}.`;
    case 'tight': return `${holds}; you plan ${UI.nf(rep.planned)}${pct}. It works, but there is no margin for a hotter week than the design days.`;
    case 'good': return `${holds}; you plan ${UI.nf(rep.planned)}${pct}.`;
    case 'too-empty': return rep.why === 'wet'
      ? `Below about ${UI.nf(cap.min)} blocks the room is too wet (near saturation); you plan ${UI.nf(rep.planned)}. ${holds}.`
      : `You use ${Math.round(rep.utilisation)} % of the room. ${holds}; you plan ${UI.nf(rep.planned)}.`;
    default: return '';
  }
}
function renderReport(host, rep) {
  const UI = global.FarmUi;
  host.replaceChildren();
  const p = (txt, cls) => { const e = document.createElement('p'); e.textContent = txt; if (cls) e.className = cls; host.append(e); return e; };
  const chip = document.createElement('span'); chip.className = 'chip'; UI.paintChip(chip, VERDICT_CHIP[rep.verdict]);
  const head = document.createElement('p'); head.append(chip, ` ${verdictText(rep)}`); host.append(head);
  for (const w of rep.warnings || []) p(w, 'warn');
  if (!rep.capacity) return;
  if (rep.utilisation != null) {
    const bar = document.createElement('div'); bar.className = 'cap-util'; bar.dataset.lvl = VERDICT_CHIP[rep.verdict].lvl; bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span'); fill.style.width = `${UI.clamp(rep.utilisation, 0, 100)}%`; bar.append(fill); host.append(bar);
  }
  const t = rep.targets;
  p(`Targets: ${t.spT} °C, ${t.spRH} % RH, CO₂ limit ${UI.nf(t.co2Lim)} ppm (${cropName(t.crop)} sets the CO₂ limit).`);
  const split = (rep.perCrop || []).filter(c => c.max > 0);
  if (split.length > 1) p(`Capacity in the same mix: ${split.map(c => `${UI.nf(c.max)} ${cropName(c.crop)}`).join(' + ')}.`);
  if (rep.capacity.min && rep.why !== 'wet') p(`Needs at least about ${UI.nf(rep.capacity.min)} blocks: below that the room gets too wet (near saturation).`);
  if (rep.limit.length) p(`${rep.why === 'wet' ? 'Upper limit' : 'Limit'}: ${rep.limit.map(l => `${l.fails.map(f => `${f}${FAIL_MACHINE[f] ? ` (${FAIL_MACHINE[f]})` : ''}`).join(', ')} on the ${l.day.toLowerCase()} day`).join('; ')}.`);
  if (rep.energy && rep.energy.rmPerBlockCycle != null) p(`Energy: ${rep.energy.kwhDay.toFixed(1)} kWh per day, RM ${rep.energy.rmPerBlockCycle.toFixed(2)} per block per cycle (${rep.energy.cycleDays} days at RM ${rep.energy.tariff.toFixed(2)}/kWh)${rep.energy.planPass === false ? ', at the planned size, which fails' : ''}.`);
  const b = rep.balance;
  p(`Simple balance: ${Number.isFinite(b.estimate) ? UI.nf(b.estimate) : 'no limit'} blocks, limit ${LIMIT_WORD[b.limit]}.${rep.disagree ? ' The simple balance and the simulation disagree; the simulation decides.' : ''}`, 'note');
  const plan = rep.runs[0];
  if (!plan) return;
  const tbl = document.createElement('table'), thead = document.createElement('thead'), tb = document.createElement('tbody'), hr = document.createElement('tr');
  for (const h of ['Design day', 'Temp in band', 'RH ≥ target − 3', 'RH > 95 %', 'CO₂ ≤ limit', `Result, ${UI.nf(plan.blocks)} blocks`]) hr.append(UI.cell('th', h));
  thead.append(hr);
  for (const d of plan.days) {
    const tr = document.createElement('tr');
    tr.append(UI.cell('td', d.name), UI.cell('td', `${d.inT.toFixed(0)} %`), UI.cell('td', `${d.rhOk.toFixed(0)} %`), UI.cell('td', `${d.wet.toFixed(0)} %`), UI.cell('td', `${d.co2Below.toFixed(0)} %`), UI.cell('td', d.pass ? 'Pass' : d.fails.join(', ')));
    tb.append(tr);
  }
  tbl.append(thead, tb); host.append(tbl);
}

// ---------------- the tab ----------------
const EXPLAIN = 'Simulate = try a plan before you do it. Enter the crop mix, then Check capacity (fast: will the climate hold on a hot-dry, a hot-humid and a rainy day, and how many blocks fit?) or Run a full cycle (spawn run, pinning, fruiting and rest for every flush, with the energy cost). Every result is saved and can later be compared with what really happens.';
const NOT_INSTALLED = 'The machines check is not installed.';
const MAX_DAYS = 180;
const STAGE_HEAD = ['Stage', 'Flush', 'Days', 'Temp in band %', 'RH ok %', 'CO₂ ok %', 'Max core °C', 'Alarms', 'kWh', 'RM', 'Result'];

function mk(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'cls') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
}
const btn = (text, props) => mk('button', { type: 'button', cls: 'btn', text, ...props });

// State of the mounted tab (closure; reset at each mount).
let el = null, ctx = null, id = 0, room = null, saved = null, draft = [], calibrations = null, settings = null, version = null;
let equipment, runs = [], running = false, saving = false, alive = false, card = null, charts = null, streamed = false, olderDone = false;
let gen = 0; // never reset: a run of an earlier mount can never match it again

const q = sel => el.querySelector(sel);
const msg = text => { if (el) q('#smMsg').textContent = text; };
const ready = () => saved !== null && calibrations !== null && settings !== null && equipment !== undefined;

function currentData(over) {
  const r = q('#smRegion'), tariff = Number(q('#smTariff').value), empty = Number(q('#smEmpty').value);
  const CAPY = global.ClimateCapacity, UI = global.FarmUi;
  return { room, settings, draft, calibrations, equipment, region: r.value,
    tariff: q('#smTariff').value !== '' && Number.isFinite(tariff) ? UI.clamp(tariff, 0, 10) : 0.57,
    emptyBelow: q('#smEmpty').value !== '' && Number.isFinite(empty) ? UI.clamp(empty, 0, 100) : CAPY.VERDICT.emptyBelow, ...over };
}
// What the machines card runs a check with: the cycle inputs without `plant` (web.md 3.12).
function cardInputs() {
  const d = currentData();
  const r = runInputs('cycle', { ...d, equipment: null });
  r.inputs.equipment = d.equipment ? pick7(d.equipment) : null;
  return { room: r.room, mix: r.mix, settings: r.settings, region: r.region, tariff: r.tariff, inputs: r.inputs };
}

function cycleDaysText() {
  try { return `Run a full cycle (${global.ClimateCycle.cycleDays(settings.farmType, settings.program)} days)`; } catch { return 'Run a full cycle'; }
}
function paintValues() {
  const UI = global.FarmUi, clock = UI.farmClock();
  const row = calibrations && calibrations.find(c => c.applied === true);
  UI.paintChip(q('#smCalib'), row ? { lvl: 'good', icon: '✓', text: `calibrated ${clock.stamp(row.run_at).slice(0, 10)}` }
    : { lvl: 'info', icon: '●', text: 'not calibrated — typical values' });
  q('#smSettings').textContent = version ? `Settings: version ${version.id} saved ${clock.stamp(version.saved_at)}` : '';
  q('#smMachines').textContent = equipment === undefined ? '' : `Machines: ${machinesText(equipment)}`;
  if (settings) q('#smCycle').textContent = cycleDaysText();
}
function syncControls() {
  const ok = ready() && !running;
  q('#smCap').disabled = q('#smCycle').disabled = !ok;
  q('#smAddCrop').disabled = running;
  for (const c of q('#smMix').querySelectorAll('input, select, button')) c.disabled = running;
  q('#smSaveMix').disabled = running || saving || saved === null || sameMix(toCapacityMix(draft), toCapacityMix(saved));
}

function paintMix() {
  const CC = global.ClimateController;
  const keys = Object.keys(CC.CROPS).filter(global.ClimateRoomRules.hasCrop);
  const body = q('#smMix tbody');
  body.replaceChildren(...draft.map((row, i) => {
    const sel = mk('select', { name: 'mixCrop' });
    for (const k of keys) sel.append(mk('option', { value: k, text: CC.CROPS[k].name }));
    sel.value = row.crop;
    const blocks = mk('input', { type: 'number', min: '0', max: '200000', step: '1', name: 'mixBlocks' }); blocks.value = String(row.blocks);
    const co2 = mk('input', { type: 'number', min: '1', max: '1000', step: '1', name: 'mixCo2' }); co2.value = row.co2_per_block === null ? '' : String(row.co2_per_block);
    const del = btn('Remove');
    const labels = () => {
      const n = cropName(row.crop);
      sel.setAttribute('aria-label', 'Mushroom'); del.setAttribute('aria-label', `Remove ${n}`);
      blocks.setAttribute('aria-label', `Blocks of ${n}`); co2.setAttribute('aria-label', `CO₂ per block of ${n}, mL/h`);
    };
    labels();
    sel.addEventListener('change', () => { row.crop = sel.value; labels(); syncControls(); });
    blocks.addEventListener('input', () => { row.blocks = clampBlocks(blocks.value); syncControls(); });
    blocks.addEventListener('change', () => { row.blocks = clampBlocks(blocks.value); blocks.value = String(row.blocks); syncControls(); });
    co2.addEventListener('input', () => { row.co2_per_block = clampCo2(co2.value); syncControls(); });
    co2.addEventListener('change', () => { row.co2_per_block = clampCo2(co2.value); co2.value = row.co2_per_block === null ? '' : String(row.co2_per_block); syncControls(); });
    del.addEventListener('click', () => { draft.splice(i, 1); paintMix(); syncControls(); });
    return mk('tr', {}, ...[sel, blocks, co2, del].map(c => mk('td', {}, c)));
  }));
  syncControls();
}

// ---- results ----
function clearResult() {
  if (charts) { try { charts.destroy(); } catch { /* the charts are gone with the page */ } charts = null; }
  const host = q('#smResult');
  host.replaceChildren();
  q('#smCharts').replaceChildren();
  return host;
}
function showResult(kind, result) {
  const UI = global.FarmUi;
  const host = clearResult();
  host.hidden = false;
  if (kind === 'capacity') { const box = mk('div', { cls: 'cap-report' }); host.append(box); renderReport(box, result); return; }
  if (kind === 'equipment') {
    if (global.FarmEquipmentCard) global.FarmEquipmentCard.renderReport(host, result);
    else host.append(mk('p', { cls: 'est-note', text: NOT_INSTALLED }));
    return;
  }
  const sum = cycleSummary(result);
  const chip = mk('span', { cls: 'chip' }); UI.paintChip(chip, sum.chip);
  host.append(mk('p', {}, chip, ` ${sum.line}`));
  if (result.verdict === 'impossible') return;
  const head = mk('tr', {}, ...STAGE_HEAD.map(h => UI.cell('th', h)));
  const rows = stageRows(result).map(r => mk('tr', {}, ...r.map(c => UI.cell('td', c))));
  host.append(mk('table', { cls: 'run-list' }, mk('thead', {}, head), mk('tbody', {}, ...rows)),
    mk('p', { cls: 'est-note', text: 'Spawn run judges temperature and block core only (the bags are sealed).' }));
  if (global.FarmCharts) {
    charts = global.FarmCharts.createTrendCharts(q('#smCharts'), { keys: ['T', 'RH', 'C'], clock: UI.simClock(0) });
    charts.draw({ t0: 0, t1: result.totals.days * 86400, pts: seriesPoints(result) });
  }
}

// ---- saved runs ----
function paintRuns() {
  const UI = global.FarmUi;
  const body = q('#smRuns tbody');
  body.replaceChildren(...runs.map(info => {
    const t = runRowTexts(info);
    const chip = mk('span', { cls: 'chip' }); UI.paintChip(chip, t.chip);
    const noteCell = UI.cell('td', t.note);
    const open = btn('Open'), note = btn('Note'), del = btn('Delete');
    const actions = [open];
    if (info.kind === 'cycle' && (info.verdict === 'pass' || info.verdict === 'fail')) {
      actions.push(mk('a', { cls: 'btn', href: `#/rooms/${id}/calibrate/${info.id}`, text: 'Compare with real' }));
    }
    actions.push(note, del);
    open.addEventListener('click', () => guarded(open, async () => {
      const run = await global.FarmApi.getSimulation(id, info.id);
      if (!alive) return;
      try { showResult(run.kind, run.result); } catch (err) { msg(`The saved result could not be read: ${err.message}`); }
    }));
    note.addEventListener('click', () => guarded(note, async () => {
      const text = prompt(`Note for run ${info.id}`, info.note ?? '');
      if (text === null) return;
      const updated = await global.FarmApi.updateSimulation(id, info.id, { note: text });
      if (!alive) return;
      const at = runs.findIndex(r => r.id === info.id);
      if (at >= 0) { runs[at] = updated; paintRuns(); }
    }));
    del.addEventListener('click', () => guarded(del, async () => {
      if (!confirm('Delete this run? It cannot be undone.')) return;
      await global.FarmApi.deleteSimulation(id, info.id);
      if (!alive) return;
      runs = runs.filter(r => r.id !== info.id); paintRuns();
    }));
    return mk('tr', { 'data-run-id': String(info.id) }, UI.cell('td', t.run), UI.cell('td', t.mix), mk('td', {}, chip), UI.cell('td', t.energy), noteCell,
      mk('td', {}, ...actions));
  }));
  q('#smOlder').hidden = olderDone || !runs.length;
}
// One request at a time per button; every ApiError becomes a message.
async function guarded(button, fn) {
  if (button.disabled) return;
  button.disabled = true;
  try { await fn(); } catch (err) { if (alive) msg(global.FarmUi.errorText(err)); } finally { if (alive && button.isConnected) button.disabled = false; }
}

// ---- runs ----
async function startRun(kind) {
  const UI = global.FarmUi;
  if (running || !alive || !ready()) return;
  let r, it;
  try {
    if (kind === 'cycle') {
      const days = global.ClimateCycle.cycleDays(settings.farmType, settings.program);
      if (days > MAX_DAYS && !confirm(`This program is ${days} days long and may take several minutes in the browser. Run it?`)) return;
    }
    r = runInputs(kind, currentData());
    it = kind === 'cycle'
      ? global.ClimateCycle.runCycleSteps(r.room, r.mix, { settings: r.settings, region: r.region, tariff: r.tariff })
      : global.ClimateCapacity.checkSteps(r.room, r.mix, { region: r.region, tariff: r.tariff, emptyBelow: r.emptyBelow });
  } catch (err) { msg(`The run stopped: ${err.message}`); return; }

  running = true;
  const myGen = ++gen;
  const bar = q('#smProgress'), fill = bar.firstElementChild, label = bar.lastElementChild;
  bar.hidden = false; fill.style.width = '0%'; label.textContent = ''; msg('');
  syncControls();
  let result, finished = false;
  try {
    for (;;) {
      const s = it.next();
      if (s.done) { result = s.value; finished = true; break; }
      label.textContent = progressText(s.value);
      fill.style.width = s.value.day === undefined ? '0%' : `${UI.clamp(s.value.day / s.value.days * 100, 0, 100)}%`;
      await new Promise(done => setTimeout(done, 0));
      if (!alive || myGen !== gen) return;
    }
  } catch (err) {
    if (alive && myGen === gen) msg(`The run stopped: ${err.message}`);
  } finally {
    if (alive && myGen === gen) { running = false; bar.hidden = true; syncControls(); }
  }
  if (!finished || !alive || myGen !== gen) return;

  try { showResult(kind, result); } catch (err) { msg(`The result could not be drawn: ${err.message}`); }
  try {
    const info = await global.FarmApi.createSimulation(id, { kind, inputs: r.inputs, result });
    if (!alive) return;
    runs.unshift(info); paintRuns(); msg(`Saved as run ${info.id}.`);
  } catch (err) {
    if (alive) msg(`The result was not saved: ${UI.errorText(err)}`);
  }
}

async function saveMix() {
  const UI = global.FarmUi;
  if (saving || running) return;
  saving = true; syncControls();
  try {
    const rows = await global.FarmApi.saveMix(id, draft);
    if (!alive) return;
    saved = rows; draft = rows.map(x => ({ ...x }));
    paintMix();
    msg(`Saved. The simulated live room uses ${rows.reduce((n, x) => n + x.blocks, 0)} blocks after its next restart.`);
  } catch (err) {
    if (alive) msg(UI.errorText(err));
  } finally {
    if (alive) { saving = false; syncControls(); }
  }
}

async function loadOlder() {
  const button = q('#smOlder');
  await guarded(button, async () => {
    const page = await global.FarmApi.listSimulations(id, { limit: 50, before: Math.min(...runs.map(r => r.id)) });
    if (!alive) return;
    if (!page.length) olderDone = true;
    runs = runs.concat(page); paintRuns();
  });
}

function build() {
  const CAPY = global.ClimateCapacity;
  const calibChip = mk('span', { cls: 'chip', id: 'smCalib' });
  const region = mk('select', { id: 'smRegion' });
  for (const k of Object.keys(CAPY.DESIGN_DAYS)) region.append(mk('option', { value: k, text: regionText(k) }));
  const tariff = mk('input', { id: 'smTariff', type: 'number', min: '0', max: '10', step: '0.01' }); tariff.value = '0.57';
  const empty = mk('input', { id: 'smEmpty', type: 'number', min: '0', max: '100' }); empty.value = String(CAPY.VERDICT.emptyBelow);
  const mixHead = mk('tr', {}, ...['Crop', 'Blocks', 'CO₂ per block (mL/h)', '–'].map(h => global.FarmUi.cell('th', h)));
  const runHead = mk('tr', {}, ...['Run', 'Mix', 'Result', 'Energy', 'Note', '–'].map(h => global.FarmUi.cell('th', h)));
  el.replaceChildren(
    mk('p', { cls: 'explain', text: EXPLAIN }),
    mk('section', { cls: 'card' }, mk('h3', { text: 'Crop mix' }),
      mk('table', { cls: 'mix-table', id: 'smMix' }, mk('thead', {}, mixHead), mk('tbody')),
      btn('Add a crop', { id: 'smAddCrop' }), btn("Save as this room's crop mix", { id: 'smSaveMix' })),
    mk('p', { cls: 'tag', id: 'smValues' }, calibChip, mk('span', { cls: 'tag', id: 'smSettings' }), mk('span', { cls: 'tag', id: 'smMachines' })),
    mk('div', { cls: 'section-head' },
      mk('label', { for: 'smRegion', text: 'Region' }), region,
      mk('label', { for: 'smTariff', text: 'Tariff (RM per kWh)' }), tariff,
      mk('label', { for: 'smEmpty', text: 'Too empty below (%)' }), empty,
      btn('Check capacity (≈ 2 s)', { id: 'smCap' }), btn('Run a full cycle', { id: 'smCycle' }),
      mk('a', { cls: 'btn', id: 'smBench', href: `#/simulator/${id}`, text: 'Open test bench' })),
    mk('div', { cls: 'run-progress', id: 'smProgress', hidden: '' }, mk('span'), mk('span')),
    mk('p', { cls: 'tag room-msg', id: 'smMsg', role: 'status' }),
    mk('section', { cls: 'card result-card', id: 'smResult', hidden: '' }),
    mk('div', { cls: 'contents', id: 'smCharts' }),
    mk('div', { cls: 'contents', 'data-slot': 'equipment-check' }),
    mk('section', { cls: 'card' }, mk('h3', { text: 'Saved runs' }),
      mk('table', { cls: 'run-list', id: 'smRuns' }, mk('thead', {}, runHead), mk('tbody')), btn('Older', { id: 'smOlder' })));
  q('#smAddCrop').addEventListener('click', () => { draft.push({ crop: 'oyster', blocks: 500, co2_per_block: null }); paintMix(); });
  q('#smSaveMix').addEventListener('click', saveMix);
  q('#smCap').addEventListener('click', () => startRun('capacity'));
  q('#smCycle').addEventListener('click', () => startRun('cycle'));
  q('#smOlder').addEventListener('click', loadOlder);
}

function mountCard() {
  const slot = q('[data-slot="equipment-check"]');
  if (!global.FarmEquipmentCard) { slot.append(mk('p', { cls: 'est-note', text: NOT_INSTALLED })); return; }
  card = global.FarmEquipmentCard.mount(slot, { id, equipment, runInputs: cardInputs,
    onEquipment: eq => { equipment = eq; paintValues(); },
    onSaved: info => { runs.unshift(info); paintRuns(); } });
}

function mount(host, context) {
  const API = global.FarmApi, UI = global.FarmUi;
  unmount();
  el = host; ctx = context; id = context.id; room = context.room();
  saved = null; draft = []; calibrations = null; settings = null; version = null; equipment = undefined;
  runs = []; running = false; saving = false; streamed = false; olderDone = false; card = null; charts = null;
  alive = true; gen++;
  build();
  paintMix(); paintRuns(); paintValues();
  ctx.on('settings', data => {
    if (!alive) return;
    streamed = true; settings = data.settings; version = { id: data.id, saved_at: data.saved_at };
    paintValues(); syncControls();
  });
  ctx.on('room', r => { room = r; });

  const load = (promise, apply) => promise.then(v => { if (alive) apply(v); }).catch(err => { if (alive) msg(UI.errorText(err)); });
  return Promise.all([
    load(API.getMix(id), rows => { saved = rows; draft = rows.map(x => ({ ...x })); paintMix(); }),
    load(API.listCalibrations(id), rows => { calibrations = rows; paintValues(); }),
    load(API.getSettings(id), s => { if (!streamed) settings = s; }),
    load(API.listSettingsHistory(id), rows => { if (!streamed && rows.length) version = { id: rows[0].id, saved_at: rows[0].saved_at }; }),
    load(API.getEquipment(id), eq => { equipment = eq; }),
    load(API.listSimulations(id, { limit: 50 }), rows => { runs = rows; paintRuns(); }),
  ]).then(() => {
    if (!alive) return;
    paintValues(); syncControls();
    if (settings !== null && equipment !== undefined) mountCard();
  });
}

function unmount() {
  try { alive = false; } catch { /* nothing to stop */ }
  try { gen++; } catch { /* nothing to stop */ }
  try { if (card) card.unmount(); } catch { /* the card is gone with the page */ }
  card = null;
  try { if (charts) charts.destroy(); } catch { /* the charts are gone with the page */ }
  charts = null; running = false;
}

global.FarmRoomTabs.register('simulate', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
