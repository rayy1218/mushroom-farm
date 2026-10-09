// web/room-equipment.js: the Your machines card (docs/contracts/web.md C5 3.12, docs/contracts/equipment.md C8).
// Mounted by the Simulate tab in its equipment slot. Reads ClimateEquipment, ClimateController, ClimateCapacity,
// FarmApi and FarmUi when it runs, never at load.
(function (global) {
'use strict';

const int = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const acText = (hp, units) => (units === 1 ? `${hp} hp` : `${units} × ${hp} hp`);
// Whole percent, but never a rounded 95 for a value under the pass line (C8 8.1 pct).
function pct(x) {
  const line = global.ClimateCapacity.PASS.inT;
  return x < line && Math.round(x) >= line ? (Math.floor(x * 10) / 10).toFixed(1) : String(Math.round(x));
}
const stageName = s => global.ClimateController.STAGES[s].toLowerCase();

const FIELDS = ['eqAcHp', 'eqAcUnits', 'eqFog', 'eqAir', 'eqWalls', 'eqRoof', 'eqHeight'];
const VERDICT_WORD = { enough: 'Enough', 'too-small': 'Too small', 'too-big': 'Too big', oversized: 'Bigger than needed', 'not-the-fix': 'Not the fix',
  poor: 'Poor', fair: 'Fair', good: 'Good' };

// ---------- helpers (pure, tested in Node) ----------
// The 7 Equipment fields, in the order of C8 4.2, from the form.
function formValues(form) {
  const v = id => form.querySelector(`#${id}`).value;
  const text = id => (v(id) === '' ? null : v(id));
  return { ac_hp: Number(v('eqAcHp')), ac_units: Number(v('eqAcUnits')), fog_lph: Number(v('eqFog')), air_m3h: Number(v('eqAir')),
    walls: text('eqWalls'), roof: text('eqRoof'), height: Number(v('eqHeight')) };
}

function fillForm(form, eq) {
  const e = { ...global.ClimateEquipment.DEFAULTS, ...eq };
  const set = (id, x) => { form.querySelector(`#${id}`).value = x === null ? '' : String(x); };
  set('eqAcHp', e.ac_hp); set('eqAcUnits', e.ac_units); set('eqFog', e.fog_lph); set('eqAir', e.air_m3h);
  set('eqWalls', e.walls); set('eqRoof', e.roof); set('eqHeight', e.height);
}

function progressText(p) {
  const tail = `day ${p.day} of ${p.days}`;
  if (p.kind === 'fogger') return `Run ${p.run} · ${p.fog_lph} L/h fogger · ${tail}`;
  if (p.kind === 'air') return `Run ${p.run} · ${int(p.air_m3h)} m³/h air exchange · ${tail}`;
  return `Run ${p.run} · ${acText(p.ac_hp, p.ac_units)} aircond · ${tail}`;
}

// Aircond sizes tried: one row per AC run, in size order.
function runRows(report) {
  const U = report.ac.units;
  return report.runs.filter(r => r.kind === 'ac').map(r => ({
    hp: r.ac_hp,
    aircond: acText(r.ac_hp, U),
    fruiting: `${pct(r.fruitingInT)} %`,
    worst: `${stageName(r.worst.stage)} ${r.worst.flush}: ${pct(r.worst.inT)} %`,
    kwh: r.kwhPerBlock.toFixed(2),
    rm: r.rmPerBlock.toFixed(2),
    result: r.tooBig ? 'too big' : r.acPass ? 'holds it' : 'too small',
    tags: [...(r.ac_hp === report.ac.min ? ['smallest that works'] : []), ...(r.ac_hp === report.ac.recommended ? ['buy this'] : [])],
  }));
}

// Your machines: aircond, fogger, air exchange, walls and roof.
function machineRows(report) {
  const EQ = global.ClimateEquipment, U = report.ac.units, e = report.inputs.equipment;
  const buy = (x, f) => (x === null || x === undefined ? '' : f(x));
  const shell = e.walls !== null && e.roof !== null
    ? `Walls ${EQ.CONSTRUCTIONS[e.walls].label}, roof ${EQ.CONSTRUCTIONS[e.roof].label}` : 'Typical';
  return [
    { machine: 'Aircond', yours: acText(report.ac.own, U), verdict: VERDICT_WORD[report.ac.verdict], buy: buy(report.ac.recommended, x => acText(x, U)) },
    { machine: 'Fogger', yours: `${report.fogger.own} L/h`, verdict: VERDICT_WORD[report.fogger.verdict], buy: buy(report.fogger.recommended, x => `${x} L/h`) },
    { machine: 'Air exchange', yours: `${int(report.air.own)} m³/h`, verdict: VERDICT_WORD[report.air.verdict], buy: buy(report.air.recommended, x => `${int(x)} m³/h`) },
    { machine: 'Walls and roof', yours: shell, verdict: VERDICT_WORD[report.insulation.verdict], buy: '' },
  ];
}

function heatRows(report) {
  return report.breakdown.items.map(i => ({ key: i.key, label: i.label, kwh: Math.round(i.kwh), share: Math.round(i.share) }));
}

// a = the saved Equipment's air_m3h or null (the room has none), b = the settings' airM3h.
function airNote(a, b) {
  if (a === null || a === undefined || a === b) return '';
  return `The room's settings use ${int(b)} m³/h for the air exchange; save your machines to use ${int(a)} m³/h there too.`;
}

// ---------- the report ----------
function node(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function table(cls, head, rows) {
  const t = node('table', undefined, cls), tr = node('tr');
  for (const h of head) tr.append(node('th', h));
  const thead = node('thead'); thead.append(tr); t.append(thead);
  const tb = node('tbody');
  for (const r of rows) { const row = node('tr'); for (const c of r) row.append(c instanceof Object ? c : node('td', c)); tb.append(row); }
  t.append(tb);
  return t;
}

function alsoTried(report) {
  return report.runs.filter(r => r.kind !== 'ac').map(r => {
    const what = r.kind === 'fogger' ? `${r.fog_lph} L/h fogger` : `${int(r.air_m3h)} m³/h air exchange`;
    return `${what} with ${acText(r.ac_hp, r.ac_units)} aircond: ${r.pass ? 'the whole cycle passes' : 'the cycle still has problems'}`;
  });
}

function renderReport(el, report) {
  const parts = [];
  if (report.verdict === 'impossible') {
    parts.push(node('p', report.why));
  } else {
    report.summary.forEach((line, i) => { const p = node('p'); p.append(i === 0 ? node('strong', line) : line); parts.push(p); });
    const spT = report.targets.spT;
    parts.push(node('h4', 'Aircond sizes tried'));
    parts.push(table('run-list', ['Aircond', `Fruiting hours at ${spT} °C`, 'Worst stage', 'kWh per block', 'RM per block', 'Result'],
      runRows(report).map(r => {
        const result = node('td', r.result);
        for (const t of r.tags) result.append(' ', node('span', t, 'chip'));
        return [r.aircond, r.fruiting, r.worst, r.kwh, r.rm, result];
      })));
    parts.push(node('h4', 'Your machines'));
    parts.push(table('run-list', ['Machine', 'Yours', 'Verdict', 'Buy'], machineRows(report).map(r => [r.machine, r.yours, r.verdict, r.buy])));
    parts.push(node('h4', `Where the heat comes from (fruiting hours, with ${acText(report.breakdown.ac_hp, report.ac.units)})`));
    parts.push(table('run-list', ['Source', 'kWh (heat)', 'Share'], heatRows(report).map(r => {
      const bar = node('td'), span = node('span', undefined, 'equip-bar');
      span.style.width = `${r.share}%`;
      bar.append(span, ` ${r.share} %`);
      return [r.label, int(r.kwh), bar];
    })));
    const also = alsoTried(report);
    if (also.length) {
      parts.push(node('h4', 'Also tried'));
      const ul = node('ul');
      for (const t of also) ul.append(node('li', t));
      parts.push(ul);
    }
  }
  el.replaceChildren(...parts);
}

// ---------- the card ----------
function markup() {
  const EQ = global.ClimateEquipment;
  const opt = (v, t) => `<option value="${v}">${t}</option>`;
  const keys = Object.keys(EQ.CONSTRUCTIONS);
  const list = ks => opt('', 'Not set') + ks.map(k => opt(k, EQ.CONSTRUCTIONS[k].label)).join('');
  return `<h3>Your machines</h3>
<p class="explain">Tell the app which machines this room has. Check my machines runs a full cycle of this crop mix with them, then tries other aircond sizes, and says what is too small and what to buy.</p>
<form class="equip-form">
  <label>Aircond size <select id="eqAcHp">${EQ.AC_SIZES.map(s => opt(s.hp, `${s.hp} hp`)).join('')}</select></label>
  <label>Number of airconds <input id="eqAcUnits" type="number" min="1" max="4" step="1"></label>
  <label>Fogger (L/h) <input id="eqFog" type="number" min="0.5" max="50" step="0.5"></label>
  <label>Air exchange (m³/h) <input id="eqAir" type="number" min="50" max="10000" step="50"></label>
  <label>Walls <select id="eqWalls">${list(keys)}</select></label>
  <label>Roof <select id="eqRoof">${list(keys.filter(k => EQ.CONSTRUCTIONS[k].roof))}</select></label>
  <label>Inside height (m) <input id="eqHeight" type="number" min="2" max="6" step="0.1"></label>
  <button type="button" class="btn" id="eqSave">Save machines</button>
  <button type="button" class="btn primary" id="eqCheck">Check my machines</button>
</form>
<p class="tag" id="eqAirNote"></p>
<div class="run-progress" id="eqProgress" hidden><span id="eqProgressText"></span><div class="bar"><i id="eqProgressBar"></i></div></div>
<p class="tag" id="eqMsg"></p>
<div id="eqResult"></div>`;
}

function mount(el, opts) {
  const EQ = global.ClimateEquipment, API = global.FarmApi, UI = global.FarmUi;
  const section = document.createElement('section');
  section.className = 'card result-card';
  section.innerHTML = markup();
  el.append(section);
  const $ = id => section.querySelector(`#${id}`);
  const form = section.querySelector('form.equip-form');
  let dead = false, running = false, savedAir = opts.equipment ? opts.equipment.air_m3h : null;
  fillForm(form, opts.equipment);

  const say = text => { $('eqMsg').textContent = text; };
  const paintNote = () => {
    const b = opts.runInputs().settings.airM3h;
    $('eqAirNote').textContent = airNote(savedAir, b === undefined ? savedAir : b);
  };
  const paintButtons = () => {
    $('eqSave').disabled = running;
    $('eqCheck').disabled = running;
    for (const id of FIELDS) $(id).disabled = running;
  };
  paintNote();
  paintButtons();
  // The tab does not tell the card when its settings change: repaint the note when the person comes back to the card.
  const repaint = () => { if (!dead) paintNote(); };
  section.addEventListener('focusin', repaint);
  section.addEventListener('pointerdown', repaint);

  async function save() {
    const eq = formValues(form);
    const problems = EQ.checkEquipment(eq);
    if (problems.length) { say(problems[0]); return null; }
    try {
      const saved = await API.saveEquipment(opts.id, eq);
      if (dead) return null;
      savedAir = saved.air_m3h;
      say('Saved. Simulate uses these machines now; the live room uses them after its next restart.');
      paintNote();
      opts.onEquipment(saved);
      return saved;
    } catch (err) {
      if (!dead) say(UI.errorText(err));
      return null;
    }
  }

  async function check() {
    const inp = opts.runInputs();
    const eq = formValues(form);
    const problems = EQ.checkEquipment(eq);
    if (problems.length) { say(problems[0]); return; }
    if (global.ClimateCapacity.commonTargets(inp.mix).impossible) { say('This crop mix cannot share one room.'); return; }
    running = true; paintButtons(); say(''); $('eqResult').replaceChildren();
    const prog = $('eqProgress');
    let report;
    try {
      const gen = EQ.runCheckSteps({ ...inp.room, equipment: eq }, inp.mix, { settings: inp.settings, region: inp.region, tariff: inp.tariff });
      prog.hidden = false;
      for (;;) {
        const s = gen.next();
        if (dead) return;
        if (s.done) { report = s.value; break; }
        $('eqProgressText').textContent = progressText(s.value);
        $('eqProgressBar').style.width = `${Math.round(100 * s.value.day / s.value.days)}%`;
        await new Promise(r => setTimeout(r, 0));
        if (dead) return;
      }
    } catch (err) {
      if (dead) return;
      running = false; paintButtons(); prog.hidden = true;
      say(`The run stopped: ${err.message}`);
      return;
    }
    running = false; paintButtons(); prog.hidden = true;
    renderReport($('eqResult'), report);
    try {
      const info = await API.createSimulation(opts.id, { kind: 'equipment', inputs: { ...inp.inputs, empty_below: null, equipment: eq }, result: report });
      if (dead) return;
      say(`Saved as run ${info.id}.`);
      opts.onSaved(info);
    } catch (err) {
      if (!dead) say(`The result was not saved: ${UI.errorText(err)}`);
    }
  }

  $('eqSave').addEventListener('click', () => { save(); });
  $('eqCheck').addEventListener('click', () => { check(); });

  return {
    unmount() {
      dead = true;
      section.removeEventListener('focusin', repaint);
      section.removeEventListener('pointerdown', repaint);
      section.remove();
    },
  };
}

global.FarmEquipmentCard = { mount, renderReport, helpers: { formValues, fillForm, progressText, runRows, machineRows, heatRows, airNote } };
})(typeof window !== 'undefined' ? window : globalThis);
