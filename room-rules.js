/*
 * room-rules.js: shared room validation and normalisation rules (C3 section 7).
 *
 * `normRoom` and `validCalib` CORRECT bad input (today's app.js behaviour, unchanged): keep only valid fields,
 * drop bad mix rows, default bad values. Used by the Capacity module's browser-storage import.
 *
 * The `check*` functions REJECT bad input: they return a list of problems, store nothing. Used by server/api.js.
 *
 * Load order (section 7.1): sim.js, air.js, controller.js, runtime.js, calib.js, capacity.js, cycle.js, equipment.js, then this file.
 * ClimateEquipment is read only when a check function that needs it is called, so this file loads without cycle.js and equipment.js.
 */
(function (global) {
  'use strict';
  const SIM = global.ClimateSim, CC = global.ClimateController, CAL = global.ClimateCalib;
  const DESIGN_DAYS = global.ClimateCapacity.DESIGN_DAYS;

  const LIM = { blocks: 200000, volume: [5, 5000], co2: [1, 1000], name: 60 };
  const VERDICTS = ['impossible', 'too-dense', 'tight', 'good', 'too-empty'];
  const ALARM_KEYS = ['tHi', 'tLo', 'tCrop', 'coreHi', 'rhHi', 'rhLo', 'co2Hi', 'co2Safe', 'disagree', 'acTooSmall', 'blocksDone', 'shockLimit', 'airTooSmall'];

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }
  const inRange = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
  const hasCrop = k => Object.hasOwn(CC.CROPS, k) && !!CC.CROPS[k].range;

  // A calibration must have all four values inside the calibration search limits, else the room is uncalibrated.
  function validCalib(c) {
    if (!c || typeof c !== 'object') return null;
    const ok = Object.entries(CAL.PARAMS).every(([k, P]) => inRange(c[k], P.min, P.max));
    return ok
      ? { ua: c.ua, infAch: c.infAch, moistBuffer: c.moistBuffer, co2PerBlock: c.co2PerBlock, rmse: c.rmse || {}, date: String(c.date || '') }
      : null;
  }

  // Saved and imported rooms are not trusted: only valid fields are kept, so one bad room cannot stop the page.
  function normRoom(r, i) {
    if (!r || typeof r !== 'object') return null;
    const mix = (Array.isArray(r.mix) ? r.mix : [])
      .filter(m => m && hasCrop(m.crop) && inRange(m.blocks, 0, LIM.blocks))
      .map(m => ({ crop: m.crop, blocks: Math.round(m.blocks), ...(inRange(m.co2PerBlock, ...LIM.co2) ? { co2PerBlock: m.co2PerBlock } : {}) }));
    const rep = r.report;
    const report = rep && typeof rep === 'object' && VERDICTS.includes(rep.verdict) && Array.isArray(rep.runs) ? rep : null;
    return {
      id: String(r.id || `${Date.now().toString(36)}${i}`),
      name: String(r.name || 'Room').slice(0, LIM.name),
      volume: inRange(r.volume, ...LIM.volume) ? r.volume : SIM.PLANT.room.volume,
      calib: validCalib(r.calib),
      mix, report, rev: 0,
    };
  }

  // ---- check*: reject bad input, return a list of problems ("[]" when valid) ----

  function checkRoom(body, partial) {
    const problems = [];
    if (!isPlainObject(body)) { problems.push('body: must be an object'); return problems; }
    const allowed = partial ? ['name', 'volume', 'archived'] : ['name', 'volume', 'settings'];
    for (const k of Object.keys(body)) {
      if (!allowed.includes(k)) problems.push(`${k}: unknown field`);
    }
    const present = k => Object.hasOwn(body, k);
    const checkName = () => {
      if (typeof body.name !== 'string') { problems.push('name: must be a string'); return; }
      const t = body.name.trim();
      if (t.length < 1 || t.length > LIM.name) problems.push(`name: must be 1 to ${LIM.name} characters after trimming`);
    };
    const checkVolume = () => {
      if (!inRange(body.volume, ...LIM.volume)) problems.push(`volume: must be a number from ${LIM.volume[0]} to ${LIM.volume[1]}`);
    };
    if (partial) {
      if (present('name')) checkName();
      if (present('volume')) checkVolume();
      if (present('archived') && body.archived !== true) problems.push('archived: must be true');
      if (!present('name') && !present('volume') && !present('archived')) {
        problems.push('body: at least one field is required');
      }
    } else {
      checkName();
      checkVolume();
    }
    return problems;
  }

  function checkMix(rows) {
    const problems = [];
    if (!Array.isArray(rows)) { problems.push('mix: must be an array'); return problems; }
    rows.forEach((row, i) => {
      if (!isPlainObject(row)) { problems.push(`mix[${i}]: must be an object`); return; }
      for (const k of Object.keys(row)) {
        if (!['crop', 'blocks', 'co2_per_block'].includes(k)) problems.push(`mix[${i}].${k}: unknown field`);
      }
      if (!hasCrop(row.crop)) problems.push(`mix[${i}].crop: unknown crop ${JSON.stringify(row.crop)}`);
      if (!(Number.isInteger(row.blocks) && row.blocks >= 0 && row.blocks <= LIM.blocks)) {
        problems.push(`mix[${i}].blocks: must be an integer from 0 to ${LIM.blocks}`);
      }
      if (Object.hasOwn(row, 'co2_per_block') && row.co2_per_block !== null && !inRange(row.co2_per_block, ...LIM.co2)) {
        problems.push(`mix[${i}].co2_per_block: must be left out, null, or a number from ${LIM.co2[0]} to ${LIM.co2[1]}`);
      }
    });
    return problems;
  }

  // C3 7.7. ClimateEquipment is read here, at call time, never at load.
  const EQUIPMENT_FIELDS = ['ac_hp', 'ac_units', 'fog_lph', 'air_m3h', 'walls', 'roof', 'height'];
  function checkEquipmentBody(body) {
    if (!isPlainObject(body)) return ['equipment: must be an object'];
    const problems = [];
    for (const k of EQUIPMENT_FIELDS) if (!Object.hasOwn(body, k)) problems.push(`${k}: missing`);
    return problems.concat(global.ClimateEquipment.checkEquipment(body));
  }

  // C3 7.6: filled in by the next task.
  function checkSimulationRun() { return ['not implemented']; }
  function checkRunPatch() { return ['not implemented']; }

  function checkCalibration(body, now) {
    const problems = [];
    if (!isPlainObject(body)) { problems.push('body: must be an object'); return problems; }
    const allowed = ['ua', 'inf_ach', 'moist_buffer', 'co2_per_block', 'rmse_t', 'rmse_rh', 'rmse_co2', 'log_rows', 'run_at', 'source', 'log_from', 'log_to', 'equipment'];
    for (const k of Object.keys(body)) {
      if (!allowed.includes(k)) problems.push(`${k}: unknown field`);
    }
    const P = CAL.PARAMS;
    const checkNum = (field, paramKey) => {
      const p = P[paramKey];
      if (!inRange(body[field], p.min, p.max)) problems.push(`${field}: must be a number from ${p.min} to ${p.max}`);
    };
    checkNum('ua', 'ua');
    checkNum('inf_ach', 'infAch');
    checkNum('moist_buffer', 'moistBuffer');
    checkNum('co2_per_block', 'co2PerBlock');
    for (const f of ['rmse_t', 'rmse_rh', 'rmse_co2']) {
      if (!Object.hasOwn(body, f)) problems.push(`${f}: is required`);
      else if (body[f] !== null && !(typeof body[f] === 'number' && Number.isFinite(body[f]) && body[f] >= 0)) {
        problems.push(`${f}: must be null or a number of at least 0`);
      }
    }
    if (!Object.hasOwn(body, 'log_rows')) problems.push('log_rows: is required');
    else if (body.log_rows !== null && !(Number.isInteger(body.log_rows) && body.log_rows >= 2)) {
      problems.push('log_rows: must be null or an integer of at least 2');
    }
    if (Object.hasOwn(body, 'run_at')) {
      if (!(Number.isInteger(body.run_at) && body.run_at >= 1 && body.run_at <= now + 60)) {
        problems.push(`run_at: must be an integer from 1 to ${now + 60}`);
      }
    }
    const given = k => Object.hasOwn(body, k) && body[k] !== null;
    if (Object.hasOwn(body, 'source') && body.source !== null && !['csv', 'history', 'import'].includes(body.source)) {
      problems.push('source: must be left out, null, csv, history or import');
    }
    const timeOk = v => Number.isInteger(v) && v >= 1 && v <= now + 60;
    if (given('log_from') !== given('log_to')) {
      problems.push(`${given('log_from') ? 'log_to' : 'log_from'}: is required together with ${given('log_from') ? 'log_from' : 'log_to'}`);
    } else if (given('log_from')) {
      if (!timeOk(body.log_from)) problems.push(`log_from: must be an integer from 1 to ${now + 60}`);
      if (!timeOk(body.log_to)) problems.push(`log_to: must be an integer from 1 to ${now + 60}`);
      if (timeOk(body.log_from) && timeOk(body.log_to) && body.log_from > body.log_to) problems.push('log_from: must be at most log_to');
    } else if (body.source === 'history') {
      problems.push('log_from: is required when source is history');
    }
    if (given('equipment')) {
      for (const p of checkEquipmentBody(body.equipment)) problems.push(p === 'equipment: must be an object' ? p : `equipment.${p}`);
    }
    return problems;
  }

  function checkReport(report) {
    const problems = [];
    if (!isPlainObject(report)) { problems.push('body: must be an object'); return problems; }
    if (!VERDICTS.includes(report.verdict)) problems.push('verdict: must be a known verdict');
    if (!Array.isArray(report.runs)) problems.push('runs: must be an array');
    if (Object.hasOwn(report, 'utilisation') && report.utilisation !== null) {
      if (!(Number.isInteger(report.utilisation) && report.utilisation >= 0)) {
        problems.push('utilisation: must be left out, null, or an integer of at least 0');
      }
    }
    return problems;
  }

  global.ClimateRoomRules = {
    LIM, VERDICTS, ALARM_KEYS,
    hasCrop, validCalib, normRoom,
    checkRoom, checkMix, checkCalibration, checkReport, checkEquipmentBody, checkSimulationRun, checkRunPatch,
  };
})(typeof window !== 'undefined' ? window : globalThis);
