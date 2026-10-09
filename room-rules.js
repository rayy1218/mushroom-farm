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

  // ---- simulation runs (C3 7.6) ----

  const isNumOrNull = v => v === null || Number.isFinite(v);
  const checkNote = (note, field) => (
    note === null || (typeof note === 'string' && note.trim().length <= 200) ? [] : [`${field}: must be null or a string of at most 200 characters after trimming`]);

  function checkImpossible(result, field) {
    const problems = [];
    for (const k of Object.keys(result)) if (k !== 'verdict' && k !== 'why') problems.push(`${field}.${k}: unknown field`);
    if (typeof result.why !== 'string') problems.push(`${field}.why: must be a string`);
    return problems;
  }

  function checkCycleResult(result) {
    if (result.verdict === 'impossible') return checkImpossible(result, 'result');
    if (result.verdict !== 'ok') return ['result.verdict: must be ok or impossible'];
    const problems = [];
    const t = result.totals;
    let days = null;
    if (!isPlainObject(t)) problems.push('result.totals: must be an object');
    else {
      if (Number.isInteger(t.days) && t.days >= 1 && t.days <= 1300) days = t.days;
      else problems.push('result.totals.days: must be an integer from 1 to 1300');
      if (typeof t.pass !== 'boolean') problems.push('result.totals.pass: must be true or false');
      for (const k of ['kwh', 'rm', 'rmPerBlock']) if (!isNumOrNull(t[k])) problems.push(`result.totals.${k}: must be a number or null`);
    }
    if (!(Array.isArray(result.stages) && result.stages.length > 0 && result.stages.every(isPlainObject))) {
      problems.push('result.stages: must be a non-empty array of objects');
    }
    if (!Array.isArray(result.series)) problems.push('result.series: must be an array');
    else if (days !== null) {
      if (result.series.length !== days * 24) problems.push(`result.series: must have ${days * 24} elements`);
      else if (!result.series.every((e, i) => isPlainObject(e) && e.h === i)) problems.push('result.series: element i must be an object with h equal to i');
    }
    return problems;
  }

  function checkEquipmentResult(result) {
    if (result.verdict === 'impossible') return checkImpossible(result, 'result');
    if (result.verdict !== 'ok') return ['result.verdict: must be ok or impossible'];
    const problems = [];
    if (!(isPlainObject(result.ac) && ['enough', 'too-small', 'too-big', 'oversized'].includes(result.ac.verdict))) {
      problems.push('result.ac.verdict: must be enough, too-small, too-big or oversized');
    }
    const a = result.air;
    if (!isPlainObject(a)) problems.push('result.air: must be an object');
    else {
      if (!['enough', 'too-small', 'not-the-fix', 'oversized'].includes(a.verdict)) {
        problems.push('result.air.verdict: must be enough, too-small, not-the-fix or oversized');
      }
      for (const k of ['own', 'capS']) if (!Number.isFinite(a[k])) problems.push(`result.air.${k}: must be a number`);
      if (!isNumOrNull(a.needM3h)) problems.push('result.air.needM3h: must be a number or null');
      for (const k of ['recommended', 'margin', 'purgeS']) if (!isNumOrNull(a[k])) problems.push(`result.air.${k}: must be a number or null`);
      if (!(typeof a.stage === 'string' && Object.hasOwn(CC.STAGES, a.stage))) problems.push('result.air.stage: must be a stage');
      if (!(typeof a.text === 'string' && a.text !== '')) problems.push('result.air.text: must be a non-empty string');
    }
    if (!(Array.isArray(result.runs) && result.runs.length > 0 && result.runs.every(isPlainObject))) {
      problems.push('result.runs: must be a non-empty array of objects');
    }
    if (!(Array.isArray(result.summary) && result.summary.length > 0 && result.summary.every(x => typeof x === 'string'))) {
      problems.push('result.summary: must be a non-empty array of strings');
    }
    return problems;
  }

  function checkRunInputs(inp, kind, now) {
    if (!isPlainObject(inp)) return ['inputs: must be an object'];
    const problems = [];
    const keys = ['mix', 'settings', 'region', 'tariff', 'volume', 'calibration', 'empty_below', 'equipment'];
    for (const k of Object.keys(inp)) if (!keys.includes(k)) problems.push(`inputs.${k}: unknown field`);
    for (const k of keys) if (!Object.hasOwn(inp, k)) problems.push(`inputs.${k}: missing`);
    if (Object.hasOwn(inp, 'mix')) for (const p of checkMix(inp.mix)) problems.push(`inputs.${p}`);
    if (Object.hasOwn(inp, 'settings') && !isPlainObject(inp.settings)) problems.push('inputs.settings: must be an object');
    if (Object.hasOwn(inp, 'region') && !(typeof inp.region === 'string' && Object.hasOwn(DESIGN_DAYS, inp.region))) {
      problems.push('inputs.region: must be a known region');
    }
    if (Object.hasOwn(inp, 'tariff') && !inRange(inp.tariff, 0, 10)) problems.push('inputs.tariff: must be a number from 0 to 10');
    if (Object.hasOwn(inp, 'volume') && !inRange(inp.volume, ...LIM.volume)) {
      problems.push(`inputs.volume: must be a number from ${LIM.volume[0]} to ${LIM.volume[1]}`);
    }
    if (Object.hasOwn(inp, 'calibration') && inp.calibration !== null) {
      const c = inp.calibration;
      if (!isPlainObject(c)) problems.push('inputs.calibration: must be null or an object');
      else {
        const ck = ['id', 'ua', 'inf_ach', 'moist_buffer', 'co2_per_block'];
        for (const k of Object.keys(c)) if (!ck.includes(k)) problems.push(`inputs.calibration.${k}: unknown field`);
        if (!(Number.isInteger(c.id) && c.id >= 1)) problems.push('inputs.calibration.id: must be a positive integer');
        for (const [f, pk] of [['ua', 'ua'], ['inf_ach', 'infAch'], ['moist_buffer', 'moistBuffer'], ['co2_per_block', 'co2PerBlock']]) {
          const P = CAL.PARAMS[pk];
          if (!inRange(c[f], P.min, P.max)) problems.push(`inputs.calibration.${f}: must be a number from ${P.min} to ${P.max}`);
        }
      }
    }
    if (Object.hasOwn(inp, 'empty_below')) {
      if (kind === 'capacity') {
        if (!inRange(inp.empty_below, 0, 100)) problems.push('inputs.empty_below: must be a number from 0 to 100 for a capacity run');
      } else if (kind === 'cycle' || kind === 'equipment') {
        if (inp.empty_below !== null) problems.push('inputs.empty_below: must be null unless the run is a capacity run');
      }
    }
    if (Object.hasOwn(inp, 'equipment')) {
      if (inp.equipment === null) {
        if (kind === 'equipment') problems.push('inputs.equipment: must not be null for an equipment run');
      } else {
        for (const p of checkEquipmentBody(inp.equipment)) problems.push(p === 'equipment: must be an object' ? 'inputs.equipment: must be an object' : `inputs.equipment.${p}`);
      }
    }
    return problems;
  }

  function checkSimulationRun(body, now) {
    if (!isPlainObject(body)) return ['body: must be an object'];
    const problems = [];
    for (const k of Object.keys(body)) if (!['kind', 'inputs', 'result', 'note'].includes(k)) problems.push(`${k}: unknown field`);
    const kind = body.kind;
    if (!['cycle', 'capacity', 'equipment'].includes(kind)) problems.push('kind: must be cycle, capacity or equipment');
    if (!Object.hasOwn(body, 'inputs')) problems.push('inputs: missing');
    else problems.push(...checkRunInputs(body.inputs, kind, now));
    if (!Object.hasOwn(body, 'result')) problems.push('result: missing');
    else if (!isPlainObject(body.result)) problems.push('result: must be an object');
    else if (kind === 'cycle') problems.push(...checkCycleResult(body.result));
    else if (kind === 'capacity') problems.push(...checkReport(body.result).map(p => `result.${p}`));
    else if (kind === 'equipment') problems.push(...checkEquipmentResult(body.result));
    if (Object.hasOwn(body, 'note') && body.note !== undefined) problems.push(...checkNote(body.note, 'note'));
    return problems;
  }

  function checkRunPatch(body, now) {
    if (!isPlainObject(body)) return ['body: must be an object'];
    const problems = [];
    for (const k of Object.keys(body)) if (k !== 'note' && k !== 'real_start') problems.push(`${k}: unknown field`);
    if (!Object.hasOwn(body, 'note') && !Object.hasOwn(body, 'real_start')) problems.push('body: at least one of note and real_start is required');
    if (Object.hasOwn(body, 'note')) problems.push(...checkNote(body.note, 'note'));
    if (Object.hasOwn(body, 'real_start') && body.real_start !== null) {
      if (!(Number.isInteger(body.real_start) && body.real_start >= 1 && body.real_start <= now + 366 * 86400)) {
        problems.push(`real_start: must be null or an integer from 1 to ${now + 366 * 86400}`);
      }
    }
    return problems;
  }

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
