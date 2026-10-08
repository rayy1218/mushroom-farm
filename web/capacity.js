// web/capacity.js: today's capacity card, moved from the old dashboard script (docs/contracts/web.md C5 3.2, 3.3).
// Wave 1: localStorage, FarmBench for the room being saved, and today's normRoom/validCalib local copies, as the
// brief for this wave requires. Wave 2 (C5 3.7) reads and writes through FarmApi and ClimateRoomRules instead.
(function (global) {
'use strict';

const CAPY = global.ClimateCapacity;
const CC = global.ClimateController;
const SIM = global.ClimateSim;
const CAL = global.ClimateCalib;
const UI = global.FarmUi;
const PL = SIM.PLANT;

const ROOMS_KEY = 'mushroom-farm.rooms.v1';
const LIM = { blocks: 200000, volume: [5, 5000], co2: [1, 1000] };
const hasCrop = k => Object.hasOwn(CC.CROPS, k) && !!CC.CROPS[k].range;
const inRange = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
const VERDICT_CHIP = {
  impossible: { lvl: 'critical', icon: '◆', text: 'Impossible' },
  'too-dense': { lvl: 'serious', icon: '▲', text: 'Too dense' },
  tight: { lvl: 'warning', icon: '▲', text: 'Tight' },
  good: { lvl: 'good', icon: '✓', text: 'Good' },
  'too-empty': { lvl: 'warning', icon: '▼', text: 'Too empty' },
};
const LIMIT_WORD = { fan: 'the fan (fresh air for CO₂)', ac: 'the AC (heat)', fog: 'the fogger (water)' };
const FAIL_MACHINE = { 'temperature too high': 'the AC cannot cool enough', 'temperature too low': 'the AC cannot heat enough',
  'humidity too low': 'the fogger cannot keep up', 'humidity at the low alarm': 'the fogger cannot keep up',
  'humidity near saturation': 'the AC cannot dry enough', 'CO₂ above the limit': 'the fan cannot bring enough fresh air' };

// Saved and imported rooms are not trusted: only valid fields are kept, so one bad room cannot stop the page.
function normRoom(r, i) {
  if (!r || typeof r !== 'object') return null;
  const mix = (Array.isArray(r.mix) ? r.mix : []).filter(m => m && hasCrop(m.crop) && inRange(m.blocks, 0, LIM.blocks))
    .map(m => ({ crop: m.crop, blocks: Math.round(m.blocks), ...(inRange(m.co2PerBlock, ...LIM.co2) ? { co2PerBlock: m.co2PerBlock } : {}) }));
  const rep = r.report;
  const report = rep && typeof rep === 'object' && VERDICT_CHIP[rep.verdict] && Array.isArray(rep.runs) ? rep : null;
  return { id: String(r.id || `${Date.now().toString(36)}${i}`), name: String(r.name || 'Room').slice(0, 60),
    volume: inRange(r.volume, ...LIM.volume) ? r.volume : PL.room.volume, vent: r.vent === 'exhaust' ? 'exhaust' : 'supply',
    calib: validCalib(r.calib), mix, report, rev: 0 };
}
// A calibration must have all four values inside the calibration search limits, else the room is uncalibrated.
function validCalib(c) {
  if (!c || typeof c !== 'object') return null;
  const ok = Object.entries(CAL.PARAMS).every(([k, P]) => inRange(c[k], P.min, P.max));
  return ok ? { ua: c.ua, infAch: c.infAch, moistBuffer: c.moistBuffer, co2PerBlock: c.co2PerBlock, rmse: c.rmse || {}, date: String(c.date || '') } : null;
}
function loadRooms() {
  try { const x = JSON.parse(localStorage.getItem(ROOMS_KEY)); return Array.isArray(x && x.rooms) ? x.rooms.map(normRoom).filter(Boolean) : []; } catch { return []; }
}

let rooms = [], roomIdx = 0, capBusy = false;
let mounted = false, el = null, mountGen = 0;

function saveRooms() {
  try { localStorage.setItem(ROOMS_KEY, JSON.stringify({ version: 1, rooms })); }
  catch { UI.set('capMsg', 'The browser did not save the rooms (storage full or blocked).'); }
}
const curRoom = () => rooms[roomIdx] || null;
const cropName = k => (hasCrop(k) ? CC.CROPS[k].name : k);
function roomChanged(r) { r.rev = (r.rev || 0) + 1; r.report = null; saveRooms(); renderReport(); renderFarm(); }

function renderRooms() {
  const sel = el.querySelector('#capRoom');
  sel.replaceChildren(...rooms.map((r, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `${r.name} · ${r.calib ? `calibrated ${r.calib.date ? r.calib.date.slice(0, 10) : '(no date)'}` : 'not calibrated'}`; return o; }));
  if (!rooms.length) { const o = document.createElement('option'); o.textContent = 'No rooms yet'; o.disabled = true; o.selected = true; sel.append(o); }
  roomIdx = UI.clamp(roomIdx, 0, Math.max(0, rooms.length - 1));
  if (rooms.length) sel.value = String(roomIdx);
  const r = curRoom();
  UI.set('capRoomInfo', !r ? '' : r.calib ? `${r.volume} m³ · calibrated ${r.calib.date ? r.calib.date.slice(0, 10) : '(no date)'}` : `${r.volume} m³ · not calibrated (typical values)`);
  el.querySelector('#capDelete').disabled = el.querySelector('#capAdd').disabled = !r;
  el.querySelector('#capRun').disabled = !r || capBusy;
  renderMix(); renderReport(); renderFarm();
}
function renderMix() {
  const r = curRoom(), body = el.querySelector('#capMix');
  if (!r) { body.replaceChildren(); return; }
  const td = x => { const c = document.createElement('td'); c.append(x); return c; };
  const num = (val, max, apply) => {
    const inp = document.createElement('input'); inp.type = 'number'; inp.min = '0'; inp.max = String(max); inp.step = '1'; inp.value = val ?? '';
    inp.addEventListener('change', () => { apply(inp.value === '' ? null : Math.min(max, Math.max(0, Math.round(+inp.value)))); roomChanged(r); });
    return inp;
  };
  body.replaceChildren(...r.mix.map((m, i) => {
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Mushroom');
    for (const k of Object.keys(CC.CROPS)) { if (!hasCrop(k)) continue; const o = document.createElement('option'); o.value = k; o.textContent = CC.CROPS[k].name; sel.append(o); }
    sel.value = m.crop;
    const blocksIn = num(m.blocks, LIM.blocks, v => { m.blocks = v || 0; });
    const co2In = num(m.co2PerBlock, LIM.co2[1], v => { m.co2PerBlock = v || undefined; });
    const del = document.createElement('button'); del.className = 'btn'; del.textContent = 'Remove';
    const label = () => { const n = cropName(m.crop); del.setAttribute('aria-label', `Remove ${n}`); blocksIn.setAttribute('aria-label', `Blocks of ${n}`); co2In.setAttribute('aria-label', `CO₂ per block of ${n}, mL/h`); };
    label();
    sel.addEventListener('change', () => { m.crop = sel.value; label(); roomChanged(r); });
    del.addEventListener('click', () => { r.mix.splice(i, 1); renderMix(); roomChanged(r); });
    const tr = document.createElement('tr');
    tr.append(td(sel), td(blocksIn), td(co2In), td(del));
    return tr;
  }));
}
function verdictText(rep) {
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
function renderReport() {
  const host = el.querySelector('#capReport'), r = curRoom(), rep = r && r.report;
  host.replaceChildren();
  if (!rep) return;
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
function renderFarm() {
  if (!rooms.length) { UI.set('capFarm', ''); return; }
  const done = rooms.filter(r => r.report && r.report.capacity && r.report.capacity.max > 0);
  const none = rooms.filter(r => r.report && r.report.runs.length && !(r.report.capacity && r.report.capacity.max > 0)).length;
  const planned = rooms.reduce((s, r) => s + r.mix.reduce((a, m) => a + (m.blocks || 0), 0), 0);
  const cap = done.reduce((s, r) => s + r.report.capacity.max, 0), used = done.reduce((s, r) => s + r.report.planned, 0);
  const missing = rooms.length - done.length - none, pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const parts = [`Farm: ${pl(rooms.length, 'room')}, ${UI.nf(planned)} blocks planned`
    + (done.length ? `; capacity ${UI.nf(cap)} blocks in ${pl(done.length, 'checked room')} (${Math.round(used / cap * 100)} % used)` : '')];
  if (none) parts.push(`${pl(none, 'room')} with no passing size`);
  if (missing) parts.push(`${pl(missing, 'room')} not checked yet`);
  UI.set('capFarm', `${parts.join('. ')}.`);
}

const MARKUP = `
<section class="card capacity" aria-labelledby="hCap">
  <div class="rules-head">
    <h2 id="hCap">Room capacity</h2>
    <span class="tag">How many blocks can a room carry in fruiting, on a hot-dry, a hot-humid and a rainy day? It uses the room values saved with the room: calibrate first (in Calibration) for a real verdict. The design days are estimates for lowland Peninsular Malaysia.</span>
  </div>
  <div class="cal-row">
    <label for="capRoom">Room</label><select id="capRoom"></select>
    <input type="text" id="capName" maxlength="60" placeholder="Name for a new room" aria-label="Name for a new room">
    <button class="btn" id="capSave">Save the present room</button>
    <button class="btn" id="capDelete">Delete room</button>
    <span class="tag" id="capRoomInfo"></span>
  </div>
  <table class="cap-mix">
    <thead><tr><th>Mushroom</th><th>Blocks</th><th>CO₂ per block, mL/h (optional)</th><th><span class="vh">Remove</span></th></tr></thead>
    <tbody id="capMix"></tbody>
  </table>
  <div class="cal-row">
    <button class="btn" id="capAdd">Add a crop</button>
    <label class="num" for="capEmpty">Too empty below <input type="number" id="capEmpty" min="10" max="90" step="5" value="50"> %</label>
    <button class="btn" id="capRun">Run check</button>
    <progress id="capProg" max="1" value="0" aria-label="Check progress" hidden></progress>
    <span class="tag" id="capMsg" role="status">Save a room, enter the crops, then run the check.</span>
  </div>
  <div id="capReport" class="cap-report"></div>
  <p id="capFarm" class="cap-farm"></p>
  <div class="cal-row">
    <button class="btn" id="capExport">Export rooms</button>
    <label class="btn" for="capImport">Import rooms</label><input type="file" id="capImport" accept=".json,application/json" class="vh">
  </div>
</section>`;

function wire(myGen) {
  const $ = sel => el.querySelector(sel);
  const stale = () => !mounted || myGen !== mountGen;

  $('#capRoom').addEventListener('change', e => { roomIdx = +e.target.value; renderRooms(); });
  $('#capSave').addEventListener('click', () => {
    const FB = global.FarmBench;
    const name = $('#capName').value.trim().slice(0, 60) || `Room ${rooms.length + 1}`;
    rooms.push({ id: Date.now().toString(36), name, volume: (FB.env.room && FB.env.room.volume) || PL.room.volume, vent: FB.env.vent,
      calib: FB.calApplied ? { ...FB.calApplied } : null, mix: [{ crop: FB.cfg.crop, blocks: UI.clamp(Math.round(FB.env.blocks), 0, LIM.blocks) }], report: null, rev: 0 });
    roomIdx = rooms.length - 1; $('#capName').value = '';
    saveRooms(); renderRooms();
    UI.set('capMsg', FB.calApplied ? `Saved "${name}" with the calibration of ${FB.calApplied.date.slice(0, 10)}.` : `Saved "${name}" without a calibration: the check uses typical room values.`);
  });
  $('#capDelete').addEventListener('click', () => {
    const r = curRoom();
    if (!r || !confirm(`Delete the room "${r.name}"?`)) return;
    rooms.splice(roomIdx, 1); roomIdx = Math.min(roomIdx, rooms.length - 1); saveRooms(); renderRooms();
  });
  $('#capAdd').addEventListener('click', () => { const r = curRoom(); if (!r) return; r.mix.push({ crop: 'oyster', blocks: 500 }); renderMix(); roomChanged(r); });
  $('#capRun').addEventListener('click', () => {
    const r = curRoom();
    if (!r || capBusy) return;
    if (!r.mix.some(m => m.blocks > 0)) { UI.set('capMsg', 'Add at least one crop with blocks.'); return; }
    capBusy = true; $('#capRun').disabled = true;
    const prog = $('#capProg'); prog.hidden = false; prog.value = 0;
    UI.set('capMsg', 'Checking… (a few seconds)');
    const emptyBelow = UI.clamp(+$('#capEmpty').value || 50, 10, 90);
    const rev = r.rev || 0, snap = structuredClone({ name: r.name, volume: r.volume, vent: r.vent, calib: r.calib, mix: r.mix });
    CAPY.checkAsync(snap, snap.mix, { emptyBelow, tariff: global.FarmBench.tariff, onProgress: s => {
      if (stale()) return;
      prog.value = s.runs / s.maxRuns;
      UI.set('capMsg', `Simulation run ${s.runs}: ${UI.nf(s.blocks)} blocks, ${s.pass ? 'pass' : 'fail'}…`);
    } })
      .then(rep => {
        if (stale()) return;
        if (!rooms.includes(r) || (r.rev || 0) !== rev) { UI.set('capMsg', 'The room changed during the check: run it again.'); return; }
        r.report = rep; saveRooms();
        UI.set('capMsg', `Done (${r.name}) after ${rep.runs.length} simulation runs: ${VERDICT_CHIP[rep.verdict].text}. ${verdictText(rep)}`);
      })
      .catch(err => { if (!stale()) UI.set('capMsg', `The check stopped: ${err.message}`); })
      .finally(() => {
        capBusy = false;
        if (stale()) return;
        $('#capRun').disabled = !curRoom(); prog.value = 1; prog.hidden = true; renderReport(); renderFarm();
      });
  });
  $('#capExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ format: 'mushroom-farm-rooms', version: 1, saved: new Date().toISOString(), rooms }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rooms.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#capImport').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => {
      const x = JSON.parse(txt);
      if (!x || x.format !== 'mushroom-farm-rooms' || !Array.isArray(x.rooms)) throw new Error('this is not a rooms file of this page');
      const ok = x.rooms.map(normRoom).filter(Boolean);
      if (!ok.length) throw new Error('it has no valid rooms');
      if (!confirm(`Replace the ${rooms.length} saved room(s) with ${ok.length} room(s) from the file?`)) return;
      rooms = ok.map(r => ({ ...r, report: null }));
      roomIdx = 0; saveRooms(); renderRooms();
      UI.set('capMsg', `Imported ${rooms.length} room(s)${ok.length < x.rooms.length ? `; ${x.rooms.length - ok.length} invalid room(s) skipped` : ''}. Run the check again for each room.`);
    }).catch(err => UI.set('capMsg', `The file cannot be used: ${err.message}.`)).finally(() => { e.target.value = ''; });
  });
}

function mount(viewEl) {
  mounted = true; el = viewEl; mountGen++;
  const myGen = mountGen;
  el.innerHTML = MARKUP;
  wire(myGen);
  capBusy = false;
  try { rooms = loadRooms(); renderRooms(); }
  catch (err) { rooms = []; renderRooms(); UI.set('capMsg', 'Some saved results could not be read and were dropped: run the check again.'); }
}
function unmount() { mounted = false; el = null; }

global.FarmShell.register('capacity', { mount, unmount });
})(typeof window !== 'undefined' ? window : globalThis);
