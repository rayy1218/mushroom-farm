// web/settings-panel.js: the settings editor (docs/contracts/web.md section 7, C6).
(function (global) {
'use strict';

const CC = global.ClimateController;

function optMap(pairs) { return Object.fromEntries(pairs); }
const cropOptions = () => optMap(Object.keys(CC.CROPS).filter(k => CC.CROPS[k].range).map(k => [k, CC.CROPS[k].name]));
const farmTypeOptions = () => optMap(Object.keys(CC.FARM_TYPES).map(k => [k, CC.FARM_TYPES[k].name]));

// The 56 field rows of C6 7.7, in table order.
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
  { path: 'offsets.T', label: 'Sensor correction T', unit: '°C' },
  { path: 'offsets.RH', label: 'Sensor correction RH', unit: '%' },
  { path: 'offsets.CO2', label: 'Sensor correction CO₂', unit: 'ppm' },
  { path: 'rules.co2Safety', label: 'CO₂ safety level on' },
  { path: 'rules.co2SafetyAt', label: 'CO₂ safety level', unit: 'ppm' },
  { path: 'rules.rhLock', label: 'Humidity first on' },
  { path: 'rules.rhStop', label: 'Humidity first: at target −', unit: '%' },
  { path: 'rules.rhResume', label: 'Humidity first: until target −', unit: '%' },
  { path: 'rules.rhAction', label: 'Humidity first: action', options: { stop: 'Stop the fan', low: 'Reduce the fan to Low' } },
  { path: 'rules.fanOn', label: 'CO₂ purge: start at', unit: 'ppm' },
  { path: 'rules.fanOff', label: 'CO₂ purge: stop at', unit: 'ppm' },
  { path: 'rules.airMode', label: 'Fresh air', options: { steady: 'Steady (base level + steps)', purge: 'Purge (on and off)' } },
  { path: 'rules.fanLevel', label: 'Purge level', options: { 1: 'Low', 2: 'Medium', 3: 'High' } },
  { path: 'rules.acPurge', label: 'Change the AC during a purge' },
  { path: 'rules.acAction', label: 'AC during a purge: action', options: { setback: 'Raise the setpoint (setback)', off: 'Turn the AC off' } },
  { path: 'rules.acSetbackC', label: 'AC setback', unit: '°C' },
  { path: 'rules.acOff', label: 'AC during a purge: from', unit: 'ppm' },
  { path: 'rules.acOn', label: 'AC during a purge: until', unit: 'ppm' },
  { path: 'manual.ac.auto', label: 'Air conditioner' },
  { path: 'manual.ac.power', label: 'Air conditioner, manual: power' },
  { path: 'manual.ac.mode', label: 'Air conditioner, manual: mode', options: { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' } },
  { path: 'manual.ac.setpoint', label: 'Air conditioner, manual: setpoint', unit: '°C' },
  { path: 'manual.hu.auto', label: 'Fogger' },
  { path: 'manual.hu.level', label: 'Fogger, manual: level', options: { 0: 'Off', 1: '1 (1 kg/h)', 2: '2 (2 kg/h)', 3: '3 (3 kg/h)' } },
  { path: 'manual.fan.auto', label: 'Exhaust fan' },
  { path: 'manual.fan.level', label: 'Exhaust fan, manual: level', options: { 0: 'Off', 1: 'Low', 2: 'Medium', 3: 'High' } },
  { path: 'manual.lights.auto', label: 'Lights' },
  { path: 'manual.lights.on', label: 'Lights, manual: on' },
  { path: 'manual.circ.auto', label: 'Circulation fan' },
  { path: 'manual.circ.on', label: 'Circulation fan, manual: on' },
];
const FIELDS_ORDER = new Map(FIELDS.map((f, i) => [f.path, i]));
const FIELDS_BY_PATH = new Map(FIELDS.map(f => [f.path, f]));

// ---------------- Leaf walk ----------------
const isPlainObj = v => v && typeof v === 'object' && !Array.isArray(v);
function collectLeafPaths(base, next, prefix, out) {
  const bKeys = isPlainObj(base) ? Object.keys(base) : [];
  const nKeys = isPlainObj(next) ? Object.keys(next) : [];
  const keys = new Set([...bKeys, ...nKeys]);
  for (const k of keys) {
    const path = prefix ? `${prefix}.${k}` : k;
    const bv = isPlainObj(base) ? base[k] : undefined;
    const nv = isPlainObj(next) ? next[k] : undefined;
    if (isPlainObj(bv) || isPlainObj(nv)) collectLeafPaths(bv, nv, path, out);
    else out.push(path);
  }
}
function getPath(obj, path) {
  const parts = path.split('.');
  let v = obj;
  for (const p of parts) { if (v == null) return undefined; v = v[p]; }
  return v;
}
function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!isPlainObj(o[p])) o[p] = {};
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
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function cleanSettings(input, prefix, warnings) {
  if (Array.isArray(input)) return input.map(v => cleanSettings(v, prefix, warnings));
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
  const warnings = [];
  const cleaned = cleanSettings(settings, '', warnings);
  const { settings: out, warnings: w2 } = CC.importSettings({ format: 'mushroom-climate-settings', version: CC.SETTINGS_VERSION, settings: cleaned });
  return { settings: out, warnings: [...warnings, ...w2] };
}

const FarmSettingsPanel = { diffSettings, applyChanges, formatValue, safeSettings, FIELDS };
global.FarmSettingsPanel = FarmSettingsPanel;
})(typeof window !== 'undefined' ? window : globalThis);
