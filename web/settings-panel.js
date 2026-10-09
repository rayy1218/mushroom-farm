// web/settings-panel.js: the settings editor (docs/contracts/web.md section 7, C6).
(function (global) {
'use strict';

// C5 1.3 lists ClimateController as needed "at call time", not at load: this proxy reads global.ClimateController
// on each access, so it works even if this file is required before controller.js.
const CC = new Proxy({}, { get(_, k) { return global.ClimateController[k]; } });

function optMap(pairs) { return Object.fromEntries(pairs); }
const cropOptions = () => optMap(Object.keys(CC.CROPS).filter(k => CC.CROPS[k].range).map(k => [k, CC.CROPS[k].name]));
const farmTypeOptions = () => optMap(Object.keys(CC.FARM_TYPES).map(k => [k, CC.FARM_TYPES[k].name]));

// The 51 field rows of C6 7.7 as changed by C9 7.1, in table order.
const FIELDS = [
  { path: 'farmType', label: 'Farm type', get options() { return farmTypeOptions(); } },
  { path: 'crop', label: 'Mushroom', get options() { return cropOptions(); } },
  { path: 'stage', label: 'Stage', get options() { return CC.STAGES; } },
  { path: 'program.harvest.on', label: 'Harvest times on' },
  { path: 'program.harvest.times', label: 'Harvest times' },
  { path: 'spT', label: 'Temperature target', unit: '°C' },
  { path: 'spRH', label: 'Humidity target', unit: '%' },
  { path: 'co2Lim', label: 'CO₂ limit (alarm)', unit: 'ppm' },
  { path: 'program.auto', label: 'Change the stage automatically' },
  { path: 'program.days.spawn', label: 'Spawn run', unit: 'days' },
  { path: 'program.days.pinning', label: 'Pinning', unit: 'days' },
  { path: 'program.days.fruiting', label: 'Fruiting', unit: 'days' },
  { path: 'program.days.rest', label: 'Rest', unit: 'days' },
  { path: 'program.flushes', label: 'Flushes per block' },
  { path: 'program.rampH', label: 'Target change time', unit: 'h' },
  { path: 'program.harvest.dryMin', label: 'Fog off before harvest', unit: 'min' },
  { path: 'program.harvest.pickMin', label: 'Picking time', unit: 'min' },
  { path: 'program.harvest.floorDrop', label: 'Lowest RH at harvest (target −)', unit: '%' },
  { path: 'program.lights.on', label: 'Lights on' },
  { path: 'program.lights.off', label: 'Lights off' },
  { path: 'program.lights.stages.spawn', label: 'Lights in spawn run' },
  { path: 'program.lights.stages.pinning', label: 'Lights in pinning' },
  { path: 'program.lights.stages.fruiting', label: 'Lights in fruiting' },
  { path: 'program.lights.stages.rest', label: 'Lights in rest' },
  { path: 'sensorMode', label: 'Two sensor sets', options: { average: 'Use the average', worst: 'Use the worst value', main: 'Use the main set' } },
  { path: 'roomM3', label: 'Room volume', unit: 'm³' },
  { path: 'airM3h', label: 'Air exchange size', unit: 'm³/h' },
  { path: 'offsets.T', label: 'Sensor correction T', unit: '°C' },
  { path: 'offsets.RH', label: 'Sensor correction RH', unit: '%' },
  { path: 'offsets.CO2', label: 'Sensor correction CO₂', unit: 'ppm' },
  { path: 'rules.co2Safety', label: 'CO₂ safety level on' },
  { path: 'rules.co2SafetyAt', label: 'CO₂ safety level', unit: 'ppm' },
  { path: 'rules.rhLock', label: 'Humidity first on' },
  { path: 'rules.rhStop', label: 'Humidity first: at target −', unit: '%' },
  { path: 'rules.rhResume', label: 'Humidity first: until target −', unit: '%' },
  { path: 'rules.fanOn', label: 'Purge starts at', unit: 'ppm' },
  { path: 'rules.fanOff', label: 'Purge stops at', unit: 'ppm' },
  { path: 'rules.purgeMaxS', label: 'Longest purge', unit: 's' },
  { path: 'rules.minOffS', label: 'Minimum off time', unit: 's' },
  { path: 'manual.ac.auto', label: 'Air conditioner' },
  { path: 'manual.ac.power', label: 'Air conditioner, manual: power' },
  { path: 'manual.ac.mode', label: 'Air conditioner, manual: mode', options: { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' } },
  { path: 'manual.ac.setpoint', label: 'Air conditioner, manual: setpoint', unit: '°C' },
  { path: 'manual.hu.auto', label: 'Fogger' },
  { path: 'manual.hu.level', label: 'Fogger, manual: level', options: { 0: 'Off', 1: '1 (1 kg/h)', 2: '2 (2 kg/h)', 3: '3 (3 kg/h)' } },
  { path: 'manual.air.auto', label: 'Air exchange' },
  { path: 'manual.air.on', label: 'Air exchange: manual output' },
  { path: 'manual.lights.auto', label: 'Lights' },
  { path: 'manual.lights.on', label: 'Lights, manual: on' },
  { path: 'manual.circ.auto', label: 'Circulation fan' },
  { path: 'manual.circ.on', label: 'Circulation fan, manual: on' },
];
const FIELDS_ORDER = new Map(FIELDS.map((f, i) => [f.path, i]));
const FIELDS_BY_PATH = new Map(FIELDS.map(f => [f.path, f]));

// ---------------- Leaf walk ----------------
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isPlainObj = v => v && typeof v === 'object' && !Array.isArray(v);
function collectLeafPaths(base, next, prefix, out) {
  const bKeys = isPlainObj(base) ? Object.keys(base) : [];
  const nKeys = isPlainObj(next) ? Object.keys(next) : [];
  const keys = new Set([...bKeys, ...nKeys]);
  for (const k of keys) {
    if (UNSAFE_KEYS.has(k)) continue; // an own '__proto__' key (JSON.parse) must never become a path
    const path = prefix ? `${prefix}.${k}` : k;
    const bv = isPlainObj(base) && Object.hasOwn(base, k) ? base[k] : undefined;
    const nv = isPlainObj(next) && Object.hasOwn(next, k) ? next[k] : undefined;
    if (isPlainObj(bv) || isPlainObj(nv)) collectLeafPaths(bv, nv, path, out);
    else out.push(path);
  }
}
function getPath(obj, path) {
  const parts = path.split('.');
  let v = obj;
  for (const p of parts) { if (v == null || !Object.hasOwn(Object(v), p)) return undefined; v = v[p]; }
  return v;
}
function setPath(obj, path, value) {
  const parts = path.split('.');
  if (parts.some(p => UNSAFE_KEYS.has(p))) throw new Error(`Setting "${path}" is not allowed.`);
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!Object.hasOwn(o, p) || !isPlainObj(o[p])) o[p] = {};
    o = o[p];
  }
  o[parts[parts.length - 1]] = value;
}
function leafEqual(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

// ---------------- formatValue (7.5) ----------------
function formatValue(path, value) {
  if (value === undefined) return '—';
  if (typeof value === 'boolean') return (path.startsWith('manual.') && path.endsWith('.auto')) ? (value ? 'Auto' : 'Manual') : (value ? 'On' : 'Off');
  if (path === 'program.lights.on' || path === 'program.lights.off') return CC.hhmm(value);
  if (path === 'program.harvest.times') return Array.isArray(value) && value.length ? value.map(CC.hhmm).join(', ') : 'none';
  const field = FIELDS_BY_PATH.get(path);
  if (field && field.options && Object.prototype.hasOwnProperty.call(field.options, value)) return field.options[value];
  if (typeof value === 'number') {
    const n = String(+value.toFixed(6));
    return field && field.unit ? `${n} ${field.unit}` : n;
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

// ---------------- diffSettings, applyChanges (7.5, 7.6) ----------------
function diffSettings(base, next) {
  const paths = [];
  collectLeafPaths(base, next, '', paths);
  const seen = new Set();
  const changed = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    const oldV = getPath(base, path), newV = getPath(next, path);
    if (leafEqual(oldV, newV)) continue;
    const field = FIELDS_BY_PATH.get(path);
    changed.push({ path, label: field ? field.label : path, old: oldV, new: newV, oldText: formatValue(path, oldV), newText: formatValue(path, newV) });
  }
  const known = changed.filter(c => FIELDS_ORDER.has(c.path)).sort((a, b) => FIELDS_ORDER.get(a.path) - FIELDS_ORDER.get(b.path));
  const unknown = changed.filter(c => !FIELDS_ORDER.has(c.path)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return [...known, ...unknown];
}
function applyChanges(settings, changes) {
  const out = structuredClone(settings);
  for (const change of changes) setPath(out, change.path, change.new);
  return out;
}

// ---------------- safeSettings (lead decision 6) ----------------
function cleanSettings(input, prefix, warnings) {
  if (Array.isArray(input)) return input.map((v, i) => cleanSettings(v, prefix ? `${prefix}.${i}` : String(i), warnings));
  if (input && typeof input === 'object') {
    const out = {};
    for (const k of Object.keys(input)) {
      if (UNSAFE_KEYS.has(k)) { warnings.push(`Setting "${prefix ? `${prefix}.${k}` : k}" is not allowed: ignored.`); continue; }
      out[k] = cleanSettings(input[k], prefix ? `${prefix}.${k}` : k, warnings);
    }
    return out;
  }
  return input;
}
function safeSettings(settings) {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('This is not a settings file of this controller.');
  const warnings = [];
  const cleaned = cleanSettings(settings, '', warnings);
  const { settings: out, warnings: w2 } = CC.importSettings({ format: 'mushroom-climate-settings', version: CC.SETTINGS_VERSION, settings: cleaned });
  return { settings: out, warnings: [...warnings, ...w2] };
}

// ---------------- Markup (7.3): today's targets card, rules card, and the new Machines card ----------------
const TARGETS_HTML = `
<section class="card targets" aria-labelledby="hTargets">
  <section>
    <h2 class="eyebrow" id="hTargets">Crop and stage</h2>
    <div class="crop-row">
      <label for="inFarm">Farm type</label>
      <select id="inFarm">
        <option value="full">Full cycle (own spawn run and pinning)</option>
        <option value="ready">Ready-to-fruit blocks (bought in)</option>
      </select>
    </div>
    <div class="crop-row">
      <label for="inCrop">Mushroom</label>
      <select id="inCrop">
        <option value="oyster">Grey oyster (Pleurotus pulmonarius)</option>
        <option value="black">Black oyster (dark Pleurotus strain)</option>
        <option value="pink">Pink oyster (Pleurotus djamor)</option>
        <option value="abalone">Abalone oyster (Pleurotus cystidiosus)</option>
        <option value="golden">Golden oyster (Pleurotus citrinopileatus)</option>
        <option value="woodear">Black jelly / wood ear (Auricularia)</option>
        <option value="reishi">Reishi / lingzhi (Ganoderma lucidum)</option>
        <option value="milky">Milky (Calocybe indica)</option>
        <option value="lionsmane">Lion's mane (Hericium erinaceus)</option>
      </select>
    </div>
    <div class="crop-row">
      <span>Stage</span>
      <div class="seg" role="group" aria-label="Stage" id="stageSeg"></div>
    </div>
    <div data-slot="program-status"></div>
    <div class="crop-row">
      <label class="chk" style="margin:0"><input type="checkbox" id="pgHarvest"> Harvest times</label>
      <input type="text" id="pgTimes" placeholder="08:00, 16:00" class="txt-in" aria-label="Harvest times">
    </div>
    <p class="hint">The fog stops before each harvest, so the caps are drier for picking.</p>
    <div data-slot="crop-check"></div>
  </section>
  <section>
    <h2 class="eyebrow">Targets</h2>
    <p class="hint farmer-only">The crop and the stage set these targets. Use the installer view to change them.</p>
    <div class="field">
      <label for="inSpT">Temperature target</label><output id="outSpT" for="inSpT"></output>
      <input type="range" id="inSpT" min="12" max="32" step="0.5" value="25" class="lockable">
      <span class="hint">Band ±1 °C. Alarm at ±2 °C, and outside the crop range.</span>
    </div>
    <div class="field">
      <label for="inSpRH">Humidity target</label><output id="outSpRH" for="inSpRH"></output>
      <input type="range" id="inSpRH" min="50" max="98" step="1" value="88" class="lockable">
      <span class="hint">Band ±3 %. Alarm at ±8 %.</span>
    </div>
    <div data-slot="targets-status"></div>
    <div class="field">
      <label for="inCo2Lim">CO₂ limit (alarm)</label><output id="outCo2Lim" for="inCo2Lim"></output>
      <input type="range" id="inCo2Lim" min="400" max="10000" step="100" value="1000" class="lockable">
    </div>
  </section>
  <section class="inst">
    <h2 class="eyebrow">Installer: program and room</h2>
    <details class="prog">
      <summary>Stage program</summary>
      <label class="chk"><input type="checkbox" id="pgAuto"> Change the stage automatically after the set days</label>
      <div class="prog-grid">
        <label id="pgDaysSpawnL">Spawn run <input type="number" id="pgDaysSpawn" min="1" max="90" step="1"> days</label>
        <label id="pgDaysPinL">Pinning <input type="number" id="pgDaysPin" min="1" max="30" step="1"> days</label>
        <label>Fruiting <input type="number" id="pgDaysFruit" min="1" max="60" step="1"> days</label>
        <label>Rest <input type="number" id="pgDaysRest" min="1" max="60" step="1"> days</label>
        <label>Flushes per block <input type="number" id="pgFlushes" min="1" max="10" step="1"></label>
        <label>Target change time <input type="number" id="pgRampH" min="0" max="48" step="0.5"> h</label>
        <label>Fog off before harvest <input type="number" id="pgDry" min="0" max="240" step="5"> min</label>
        <label>Picking time <input type="number" id="pgPick" min="0" max="240" step="5"> min</label>
        <label>Lowest RH at harvest: target − <input type="number" id="pgFloor" min="1" max="15" step="1"> %</label>
      </div>
    </details>
    <details class="prog">
      <summary>Lights</summary>
      <div class="prog-grid">
        <label>On <input type="text" id="pgLightOn" style="width:64px"></label>
        <label>Off <input type="text" id="pgLightOff" style="width:64px"></label>
      </div>
      <div class="prog-grid">
        <label><input type="checkbox" id="pgLSpawn"> Spawn run</label><label><input type="checkbox" id="pgLPin"> Pinning</label>
        <label><input type="checkbox" id="pgLFruit"> Fruiting</label><label><input type="checkbox" id="pgLRest"> Rest</label>
      </div>
    </details>
    <div class="crop-row"><label for="inSensMode">Two sensor sets</label>
      <select id="inSensMode"><option value="average">Use the average</option><option value="worst">Use the worst value</option><option value="main">Use the main set</option></select></div>
    <div class="rule-extra">
      <label class="num" for="inRoomM3">Room volume</label>
      <input type="number" id="inRoomM3" min="1" max="100000" step="1" value="60"> <span>m³</span>
    </div>
    <div class="rule-extra">
      <label class="num" for="inAirSize">Air exchange size</label>
      <input type="number" id="inAirSize" min="50" max="10000" step="50" value="1800"> <span>m³/h</span>
    </div>
    <div class="rule-extra">
      <span class="num">Sensor corrections</span>
      <label class="num">T <input type="number" id="oT" step="0.1"> °C</label>
      <label class="num">RH <input type="number" id="oRH" step="0.5"> %</label>
      <label class="num">CO₂ <input type="number" id="oCO2" step="10"> ppm</label>
    </div>
  </section>
</section>`;

const RULES_HTML = `
<section class="card rules" aria-labelledby="hRules">
  <div class="rules-head">
    <h2 id="hRules">Air exchange and CO₂</h2>
    <span class="tag inst">For machines in Auto. Priority 1 acts before priority 2, and so on.</span>
  </div>
  <div class="rules-grid">
    <div class="inst">
      <fieldset class="rule rule-first" style="--key:var(--critical)" id="ruleSafe">
        <legend>Priority 1 · CO₂ safety level</legend>
        <label class="chk"><input type="checkbox" id="rCo2Safety"> Run the air exchange when CO₂ is ≥ <input type="number" id="rCo2SafeAt" min="500" max="20000" step="50"> ppm</label>
        <p class="hint">Above the humidity rule and the time cap. A critical alarm comes on.</p>
      </fieldset>
      <fieldset class="rule rule-first" style="--key:var(--ink)" id="ruleRh">
        <legend>Priority 2 · Humidity first</legend>
        <label class="chk"><input type="checkbox" id="rRhLock"> Delay purges that dry the room when humidity is low</label>
        <div class="row">
          <label class="num">At ≤ target − <input type="number" id="rRhStop" min="1" max="20" step="1"> % <span class="tag" id="rRhStopAbs"></span></label>
          <label class="num">Until ≥ target − <input type="number" id="rRhResume" min="0" max="19" step="1"> % <span class="tag" id="rRhResumeAbs"></span></label>
        </div>
        <p class="hint">A purge is never delayed past the CO₂ limit.</p>
      </fieldset>
      <fieldset class="rule" style="--key:var(--s-air)">
        <legend>Priority 3 · CO₂ purge</legend>
        <div class="row">
          <label class="num">Start at ≥ <input type="number" id="rFanOn" min="450" max="20000" step="50"> ppm</label>
          <label class="num">Stop at ≤ <input type="number" id="rFanOff" min="400" max="19950" step="50"> ppm</label>
        </div>
        <div class="row">
          <label class="num">Longest purge <input type="number" id="rPurgeMax" min="1" max="15" step="0.5"> min</label>
          <label class="num">Minimum off time <input type="number" id="rMinOff" min="30" max="600" step="10"> s</label>
        </div>
        <p class="hint">The intake fan and the exhaust fan run together. A purge stops at the stop level or at the longest purge. The AC and the fogger keep their targets and bring the room back after it.</p>
      </fieldset>
      <details class="measure">
        <summary>Fixed values (not settings)</summary>
        <p>Each air run lasts at least 30 s. After it, the fans stay off for the minimum off time. The CO₂ safety level ignores both. After 3 purges in a row that stop at the time cap, a warning gives the air exchange size the room needs. Humidity first acts only after the fogger is at its maximum for 5 min. Alarms need their condition for 5 min (critical alarms 60 s). Fogger: 1 min. AC: 2 min between commands. Fog cools first when the room is warm. The AC fan speed follows humidity. The circulation fan runs with the fog and 10 min of each 30 min. In spawn run, the AC also cools for the block core. Humidity control uses VPD. A failed sensor: the machines copy the same hour of an earlier day. A failed CO₂ sensor gives timed purges.</p>
      </details>
    </div>
    <div data-slot="rules-side"></div>
  </div>
</section>`;

function deviceHtml(dev, name, body) {
  return `<div class="device">
    <div class="device-head">
      <h3>${name}</h3>
      <div class="seg" role="group" aria-label="${name} control mode" data-dev="${dev}">
        <button data-auto="1" aria-pressed="true">Auto</button><button data-auto="0" aria-pressed="false">Manual</button>
      </div>
    </div>
    ${body}
  </div>`;
}
const MACHINES_HTML = `
<section class="card machines" aria-labelledby="hMachines">
  <h2 class="eyebrow" id="hMachines">Machines</h2>
  ${deviceHtml('ac', 'Air conditioner', `
    <fieldset class="manual" id="acManual" disabled>
      <legend>Manual output</legend>
      <div class="field">
        <label for="acModeSel">Mode</label>
        <select id="acModeSel"><option value="off">Off</option><option value="cool">Cool</option><option value="heat">Heat</option><option value="dry">Dry</option><option value="fan">Fan only</option></select>
      </div>
      <div class="field">
        <label for="acSetIn">Setpoint</label><output id="acSetOut" for="acSetIn"></output>
        <input type="range" id="acSetIn" min="16" max="30" step="0.5" value="25">
      </div>
    </fieldset>`)}
  ${deviceHtml('hu', 'Fogger', `
    <fieldset class="manual" id="huManual" disabled>
      <legend>Manual output</legend>
      <div class="field">
        <label for="huLevelSel">Level</label>
        <select id="huLevelSel"><option value="0">Off</option><option value="1">1 (1 kg/h)</option><option value="2">2 (2 kg/h)</option><option value="3">3 (3 kg/h)</option></select>
      </div>
    </fieldset>`)}
  ${deviceHtml('air', 'Air exchange', `
    <fieldset class="manual" id="airManual" disabled><legend>Manual output</legend><label class="chk"><input type="checkbox" id="airOnChk"> On (both fans)</label></fieldset>`)}
  ${deviceHtml('lights', 'Lights', `
    <fieldset class="manual" id="lightsManual" disabled><legend>Manual output</legend><label class="chk"><input type="checkbox" id="liOn"> On</label></fieldset>`)}
  ${deviceHtml('circ', 'Circulation fan', `
    <fieldset class="manual" id="circManual" disabled><legend>Manual output</legend><label class="chk"><input type="checkbox" id="ciOn"> On</label></fieldset>`)}
</section>`;

// ---------------- createSettingsPanel (7.2-7.4, 7.8, 7.9) ----------------
const DEV_NAME = { ac: 'Air conditioner', hu: 'Fogger', air: 'Air exchange', lights: 'Lights', circ: 'Circulation fan' };

function createSettingsPanel(el, options) {
  let settings = structuredClone(options.settings);
  const readOnly = !!options.readOnly;
  const onChangeCb = typeof options.onChange === 'function' ? options.onChange : null;
  const getCommand = typeof options.getCommand === 'function' ? options.getCommand : null;

  el.classList.add('contents');
  el.innerHTML = TARGETS_HTML + RULES_HTML + MACHINES_HTML;
  const $ = sel => el.querySelector(sel);
  const $$ = sel => Array.from(el.querySelectorAll(sel));

  function levelHandler() { repaint(); }
  document.addEventListener('farm-level', levelHandler);

  // ---- derived corrections applied after every raw write (7.4 "Corrections") ----
  // The paired fields (purge start and stop, humidity first stop and resume) are corrected in the direction of the field the user just touched (below,
  // in each field's own handler): correcting both directions here unconditionally would undo the user's edit
  // when it pushes a paired field past its partner (for example rFanOff set above rFanOn).
  function applyDerived() {
    if (!CC.FARM_TYPES[settings.farmType].stages.includes(settings.stage)) settings.stage = CC.FARM_TYPES[settings.farmType].stages[0];
  }

  // forceWriteEl: the control that triggered the in-progress commit, so repaint() can write the stored
  // (clamped/parsed) value into it even though it still has focus (C6 7.4 "Field rewrite"). set() (7.2)
  // never sets this, so it keeps skipping the focused control.
  let forceWriteEl = null;
  function commit(mutate, sourceEl) {
    if (readOnly) return;
    const before = structuredClone(settings);
    mutate();
    applyDerived();
    const changes = diffSettings(before, settings);
    forceWriteEl = sourceEl || null;
    repaint();
    forceWriteEl = null;
    if (changes.length && onChangeCb) onChangeCb(changes, structuredClone(settings));
  }

  const clamp = global.FarmUi.clamp;
  const numIn = (elIn, fallback, lo, hi) => clamp(Number.isFinite(parseFloat(elIn.value)) ? parseFloat(elIn.value) : fallback, lo, hi);
  const parseHM = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim()); return m ? clamp(+m[1], 0, 23) * 60 + clamp(+m[2], 0, 59) : null; };

  // ---- Crop and stage ----
  $('#inFarm').addEventListener('change', e => commit(() => { settings.farmType = e.target.value; }, e.target));
  $('#inCrop').addEventListener('change', e => commit(() => { settings.crop = e.target.value; }, e.target));
  $('#stageSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    commit(() => { settings.stage = b.dataset.stage; }, b);
  });
  $('#pgHarvest').addEventListener('change', e => commit(() => { settings.program.harvest.on = e.target.checked; }, e.target));
  $('#pgTimes').addEventListener('change', e => commit(() => {
    const times = e.target.value.split(/[,\s]+/).map(x => /^(\d{1,2}):(\d{2})$/.exec(x)).filter(Boolean)
      .map(m => clamp(+m[1], 0, 23) * 60 + clamp(+m[2], 0, 59)).sort((a, b) => a - b);
    settings.program.harvest.times = times;
  }, e.target));

  // ---- Targets (range: input event, continuous) ----
  $('#inSpT').addEventListener('input', e => commit(() => { settings.spT = +e.target.value; }, e.target));
  $('#inSpRH').addEventListener('input', e => commit(() => { settings.spRH = +e.target.value; }, e.target));
  $('#inCo2Lim').addEventListener('input', e => commit(() => { settings.co2Lim = +e.target.value; }, e.target));

  // ---- Installer: program and room ----
  $('#pgAuto').addEventListener('change', e => commit(() => { settings.program.auto = e.target.checked; }, e.target));
  // [id, path, lo, hi, fallback, zeroAlsoFallsBack, round]
  const PROGRAM_NUM_FIELDS = [
    ['pgDaysSpawn', 'program.days.spawn', 1, 90, 1, true, false],
    ['pgDaysPin', 'program.days.pinning', 1, 30, 1, true, false],
    ['pgDaysFruit', 'program.days.fruiting', 1, 60, 1, true, false],
    ['pgDaysRest', 'program.days.rest', 1, 60, 1, true, false],
    ['pgFlushes', 'program.flushes', 1, 10, 1, true, true],
    ['pgRampH', 'program.rampH', 0, 48, 0, false, false],
    ['pgDry', 'program.harvest.dryMin', 0, 240, 0, false, false],
    ['pgPick', 'program.harvest.pickMin', 0, 240, 0, false, false],
    ['pgFloor', 'program.harvest.floorDrop', 1, 15, 1, true, false],
  ];
  for (const [id, path, lo, hi, fallback, zeroFallsBack, round] of PROGRAM_NUM_FIELDS) {
    $('#' + id).addEventListener('change', e => commit(() => {
      const raw = parseFloat(e.target.value);
      let v = (!Number.isFinite(raw) || (zeroFallsBack && raw === 0)) ? fallback : raw;
      v = clamp(v, lo, hi);
      if (round) v = Math.round(v);
      setPath(settings, path, v);
    }, e.target));
  }
  $('#pgLightOn').addEventListener('change', e => commit(() => { const v = parseHM(e.target.value); if (v !== null) settings.program.lights.on = v; }, e.target));
  $('#pgLightOff').addEventListener('change', e => commit(() => { const v = parseHM(e.target.value); if (v !== null) settings.program.lights.off = v; }, e.target));
  for (const [id, st] of [['pgLSpawn', 'spawn'], ['pgLPin', 'pinning'], ['pgLFruit', 'fruiting'], ['pgLRest', 'rest']]) {
    $('#' + id).addEventListener('change', e => commit(() => { settings.program.lights.stages[st] = e.target.checked; }, e.target));
  }
  $('#inSensMode').addEventListener('change', e => commit(() => { settings.sensorMode = e.target.value; }, e.target));
  $('#inRoomM3').addEventListener('change', e => commit(() => {
    const v = parseFloat(e.target.value);
    settings.roomM3 = clamp(Number.isFinite(v) && v !== 0 ? v : settings.roomM3, 1, 100000);
  }, e.target));
  $('#inAirSize').addEventListener('change', e => commit(() => {
    settings.airM3h = Math.round(numIn($('#inAirSize'), settings.airM3h, 50, 10000));
  }, e.target));
  for (const [id, k, lo, hi] of [['oT', 'T', -5, 5], ['oRH', 'RH', -15, 15], ['oCO2', 'CO2', -500, 500]]) {
    $('#' + id).addEventListener('change', e => commit(() => {
      const v = parseFloat(e.target.value);
      settings.offsets[k] = clamp(Number.isFinite(v) ? v : 0, lo, hi);
    }, e.target));
  }

  // ---- Air exchange and CO2 rules ----
  $('#rCo2Safety').addEventListener('change', e => commit(() => { settings.rules.co2Safety = e.target.checked; }, e.target));
  $('#rCo2SafeAt').addEventListener('change', e => commit(() => { settings.rules.co2SafetyAt = numIn($('#rCo2SafeAt'), settings.rules.co2SafetyAt, 500, 20000); }, e.target));
  $('#rRhLock').addEventListener('change', e => commit(() => { settings.rules.rhLock = e.target.checked; }, e.target));
  $('#rRhStop').addEventListener('change', e => commit(() => {
    const R = settings.rules;
    R.rhStop = Math.round(numIn($('#rRhStop'), R.rhStop, 1, 20));
    if (R.rhResume > R.rhStop - 1) R.rhResume = R.rhStop - 1;
  }, e.target));
  $('#rRhResume').addEventListener('change', e => commit(() => {
    const R = settings.rules;
    R.rhResume = Math.round(numIn($('#rRhResume'), R.rhResume, 0, 19));
    if (R.rhStop < R.rhResume + 1) R.rhStop = R.rhResume + 1;
  }, e.target));
  // Keep at least 50 ppm between the "act" level and the "end" level (the field just edited wins).
  $('#rFanOn').addEventListener('change', e => commit(() => {
    const R = settings.rules;
    R.fanOn = Math.round(numIn($('#rFanOn'), R.fanOn, 450, 20000));
    if (R.fanOff > R.fanOn - 50) R.fanOff = R.fanOn - 50;
  }, e.target));
  $('#rFanOff').addEventListener('change', e => commit(() => {
    const R = settings.rules;
    R.fanOff = Math.round(numIn($('#rFanOff'), R.fanOff, 400, 19950));
    if (R.fanOn < R.fanOff + 50) R.fanOn = R.fanOff + 50;
  }, e.target));
  // Purge times: minutes on screen, seconds in the settings (C9 7).
  $('#rPurgeMax').addEventListener('change', e => commit(() => {
    const R = settings.rules;
    R.purgeMaxS = Math.round(numIn($('#rPurgeMax'), R.purgeMaxS / 60, 1, 15) * 60);
  }, e.target));
  $('#rMinOff').addEventListener('change', e => commit(() => {
    const R = settings.rules;
    R.minOffS = Math.round(numIn($('#rMinOff'), R.minOffS, 30, 600));
  }, e.target));

  // ---- Machines: Auto/Manual with bumpless transfer (7.4), manual outputs ----
  function bumpless(dev) {
    if (!getCommand) return;
    const cmd = getCommand();
    if (!cmd) return;
    const m = settings.manual[dev];
    if (dev === 'ac') {
      m.power = cmd.ac.power;
      if (['cool', 'heat', 'dry', 'fan'].includes(cmd.ac.mode)) m.mode = cmd.ac.mode;
      if (Number.isFinite(cmd.ac.setpoint)) m.setpoint = clamp(cmd.ac.setpoint, 16, 30);
    } else if (dev === 'hu') {
      m.level = cmd.hu.level;
    } else {
      m.on = cmd[dev].on;
    }
  }
  $$('.seg[data-dev]').forEach(seg => {
    const dev = seg.dataset.dev;
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const auto = b.dataset.auto === '1';
      if (readOnly) return;
      if (auto === settings.manual[dev].auto) return;
      commit(() => {
        if (!auto) bumpless(dev);
        settings.manual[dev].auto = auto;
      }, b);
    });
  });
  $('#acModeSel').addEventListener('change', e => commit(() => {
    const m = settings.manual.ac, v = e.target.value;
    m.power = v !== 'off';
    if (m.power) m.mode = v;
  }, e.target));
  $('#acSetIn').addEventListener('input', e => commit(() => { settings.manual.ac.setpoint = +e.target.value; }, e.target));
  $('#huLevelSel').addEventListener('change', e => commit(() => { settings.manual.hu.level = +e.target.value; }, e.target));
  $('#airOnChk').addEventListener('change', e => commit(() => { settings.manual.air.on = e.target.checked; }, e.target));
  $('#liOn').addEventListener('change', e => commit(() => { settings.manual.lights.on = e.target.checked; }, e.target));
  $('#ciOn').addEventListener('change', e => commit(() => { settings.manual.circ.on = e.target.checked; }, e.target));

  // ---------------- repaint ----------------
  function setVal(elIn, value) {
    if (document.activeElement === elIn && elIn !== forceWriteEl) return;
    if (elIn.type === 'checkbox') elIn.checked = value;
    else elIn.value = String(value);
  }
  // Rebuild the stage buttons only when farmType or readOnly changed (finding: a ramp's 150 ms repaints
  // rebuilt every button each time, so mousedown and mouseup could land on different elements and lose
  // the click). Otherwise just update aria-pressed and disabled on the existing buttons.
  let stageSegKey = null;
  function renderStageSeg() {
    const seg = $('#stageSeg');
    const key = `${settings.farmType}|${readOnly}`;
    if (key === stageSegKey) {
      seg.querySelectorAll('button').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.stage === settings.stage));
        b.disabled = readOnly;
      });
      return;
    }
    stageSegKey = key;
    const STAGE_SHORT = { spawn: 'Spawn run', pinning: 'Pinning', fruiting: 'Fruiting', rest: 'Rest' };
    seg.replaceChildren(...CC.FARM_TYPES[settings.farmType].stages.map(st => {
      const b = document.createElement('button'); b.dataset.stage = st; b.textContent = STAGE_SHORT[st];
      b.setAttribute('aria-pressed', String(st === settings.stage));
      b.disabled = readOnly;
      return b;
    }));
  }
  function repaint() {
    const s = settings, R = s.rules;
    setVal($('#inFarm'), s.farmType); setVal($('#inCrop'), s.crop);
    renderStageSeg();
    setVal($('#pgHarvest'), s.program.harvest.on);
    { const elIn = $('#pgTimes'); if (document.activeElement !== elIn || elIn === forceWriteEl) elIn.value = s.program.harvest.times.map(CC.hhmm).join(', '); }
    setVal($('#inSpT'), s.spT); global.FarmUi.set($('#outSpT').id, `${s.spT.toFixed(1)} °C`);
    setVal($('#inSpRH'), s.spRH); global.FarmUi.set($('#outSpRH').id, `${s.spRH} %`);
    setVal($('#inCo2Lim'), s.co2Lim); global.FarmUi.set($('#outCo2Lim').id, `${s.co2Lim} ppm`);
    $('#pgDaysSpawnL').hidden = s.farmType !== 'full'; $('#pgDaysPinL').hidden = s.farmType !== 'full';
    setVal($('#pgAuto'), s.program.auto);
    setVal($('#pgDaysSpawn'), s.program.days.spawn); setVal($('#pgDaysPin'), s.program.days.pinning);
    setVal($('#pgDaysFruit'), s.program.days.fruiting); setVal($('#pgDaysRest'), s.program.days.rest);
    setVal($('#pgFlushes'), s.program.flushes); setVal($('#pgRampH'), s.program.rampH);
    setVal($('#pgDry'), s.program.harvest.dryMin); setVal($('#pgPick'), s.program.harvest.pickMin);
    setVal($('#pgFloor'), s.program.harvest.floorDrop);
    { const elIn = $('#pgLightOn'); if (document.activeElement !== elIn || elIn === forceWriteEl) elIn.value = CC.hhmm(s.program.lights.on); }
    { const elIn = $('#pgLightOff'); if (document.activeElement !== elIn || elIn === forceWriteEl) elIn.value = CC.hhmm(s.program.lights.off); }
    setVal($('#pgLSpawn'), s.program.lights.stages.spawn); setVal($('#pgLPin'), s.program.lights.stages.pinning);
    setVal($('#pgLFruit'), s.program.lights.stages.fruiting); setVal($('#pgLRest'), s.program.lights.stages.rest);
    setVal($('#inSensMode'), s.sensorMode);
    setVal($('#inRoomM3'), s.roomM3);
    setVal($('#inAirSize'), s.airM3h);
    setVal($('#oT'), s.offsets.T); setVal($('#oRH'), s.offsets.RH); setVal($('#oCO2'), s.offsets.CO2);
    setVal($('#rCo2Safety'), R.co2Safety); setVal($('#rCo2SafeAt'), R.co2SafetyAt);
    setVal($('#rRhLock'), R.rhLock); setVal($('#rRhStop'), R.rhStop); setVal($('#rRhResume'), R.rhResume);
    global.FarmUi.set($('#rRhStopAbs').id, `(${s.spRH - R.rhStop} %)`);
    global.FarmUi.set($('#rRhResumeAbs').id, `(${s.spRH - R.rhResume} %)`);
    setVal($('#rFanOn'), R.fanOn); setVal($('#rFanOff'), R.fanOff);
    // Purge times: minutes on screen, seconds in the settings (C9 7).
    setVal($('#rPurgeMax'), +(R.purgeMaxS / 60).toFixed(2)); setVal($('#rMinOff'), R.minOffS);
    $('#ruleRh').classList.toggle('off', !R.rhLock);
    $('#ruleSafe').classList.toggle('off', !R.co2Safety);
    for (const dev of ['ac', 'hu', 'air', 'lights', 'circ']) {
      const m = s.manual[dev], seg = $(`.seg[data-dev="${dev}"]`);
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.auto === '1') === m.auto)));
      $('#' + dev + 'Manual').disabled = m.auto;
    }
    setVal($('#acModeSel'), s.manual.ac.power ? s.manual.ac.mode : 'off');
    setVal($('#acSetIn'), s.manual.ac.setpoint); global.FarmUi.set($('#acSetOut').id, `${s.manual.ac.setpoint.toFixed(1)} °C`);
    setVal($('#huLevelSel'), s.manual.hu.level);
    setVal($('#airOnChk'), s.manual.air.on);
    setVal($('#liOn'), s.manual.lights.on);
    setVal($('#ciOn'), s.manual.circ.on);
    // Settings level (7.4): spT, spRH, co2Lim unlock for the installer only.
    const installer = document.body.dataset.level === 'installer';
    $$('input.lockable').forEach(inp => { inp.disabled = readOnly || !installer; });
  }

  function applyReadOnly() {
    if (!readOnly) return;
    $$('input, select, button').forEach(elIn => { elIn.disabled = true; });
  }

  repaint();
  applyReadOnly();

  return {
    get() { return structuredClone(settings); },
    set(next) {
      settings = structuredClone(next);
      repaint();
    },
    diff(base) { return diffSettings(base, structuredClone(settings)); },
    destroy() {
      document.removeEventListener('farm-level', levelHandler);
      el.replaceChildren();
    },
  };
}

// ---------------- showChanges (7.6) ----------------
function showChanges(changes, opts) {
  const title = opts.title, confirmText = opts.confirmText, note = !!opts.note;
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.className = 'changes';
    const h2 = document.createElement('h2'); h2.textContent = title;
    const ul = document.createElement('ul');
    for (const c of changes) {
      const li = document.createElement('li');
      li.textContent = `${c.label}: ${c.oldText} → ${c.newText}`;
      ul.append(li);
    }
    dialog.append(h2, ul);
    let noteInput = null;
    if (note) {
      const field = document.createElement('div'); field.className = 'field';
      const label = document.createElement('label'); label.textContent = 'Note (optional)'; label.setAttribute('for', 'changesNote');
      noteInput = document.createElement('input'); noteInput.type = 'text'; noteInput.id = 'changesNote'; noteInput.maxLength = 200;
      field.append(label, noteInput);
      dialog.append(field);
    }
    const actions = document.createElement('div'); actions.className = 'actions';
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn'; cancelBtn.textContent = 'Cancel';
    const confirmBtn = document.createElement('button'); confirmBtn.className = 'btn'; confirmBtn.textContent = confirmText;
    actions.append(cancelBtn, confirmBtn);
    dialog.append(actions);
    document.body.append(dialog);

    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      global.removeEventListener('hashchange', onLeave);
      dialog.close();
      dialog.remove();
      resolve(value);
    }
    // Leaving the page closes the dialog and resolves null, so an unmounted module never receives a confirm.
    const onLeave = () => finish(null);
    global.addEventListener('hashchange', onLeave);
    confirmBtn.addEventListener('click', () => finish(noteInput ? noteInput.value.trim() : ''));
    cancelBtn.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    dialog.showModal();
  });
}

const FarmSettingsPanel = { createSettingsPanel, diffSettings, applyChanges, formatValue, safeSettings, FIELDS, showChanges };
global.FarmSettingsPanel = FarmSettingsPanel;
})(typeof window !== 'undefined' ? window : globalThis);
