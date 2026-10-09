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
function runInputs(kind, d) {
  const row = d.calibrations.find(x => x.applied === true) || null;
  const calib = appliedCalib(d.calibrations);
  const room = { name: d.room.name, volume: d.room.volume, airM3h: d.settings.airM3h, calib };
  if (d.equipment) room.plant = global.ClimateEquipment.plantOf(d.equipment, { volume: d.room.volume, calib });
  const mix = toCapacityMix(d.draft);
  const inputs = { mix: toMixRows(mix), settings: d.settings, region: d.region, tariff: d.tariff, volume: d.room.volume,
    calibration: row ? { id: row.id, ua: row.ua, inf_ach: row.inf_ach, moist_buffer: row.moist_buffer, co2_per_block: row.co2_per_block } : null,
    empty_below: kind === 'capacity' ? d.emptyBelow : null,
    equipment: d.equipment ? Object.fromEntries(FIELDS7.map(k => [k, d.equipment[k]])) : null };
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
const stub = () => { throw new Error('not built yet'); };
const helpers = { toCapacityMix, toMixRows, sameMix, appliedCalib, runInputs, cycleSummary, stageRows,
  seriesPoints, runRowTexts: stub, progressText: stub, machinesText: stub, clampBlocks: stub, clampCo2: stub, regionText: stub };

function mount() {}
function unmount() {}

global.FarmRoomTabs.register('simulate', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
