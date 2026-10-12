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

// C11 6: field labels by API key, for plainError.
const LABELS = { ac_hp: 'Aircond size', ac_units: 'Number of airconds', fog_lph: 'Fogger', air_m3h: 'Air exchange', walls: 'Walls', roof: 'Roof', height: 'Inside height' };
const problemsError = problems => ({ name: 'ApiError', error: 'Check your machines', details: problems });

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
const acIsEnough = report => report.ac.verdict === 'enough' || report.ac.verdict === 'oversized';
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
    tags: [...(r.ac_hp === report.ac.min ? ['smallest that works'] : []), ...(r.ac_hp === report.ac.own ? ['your aircond'] : []),
      ...(r.ac_hp === report.ac.recommended && !acIsEnough(report) ? ['buy this'] : [])],
  }));
}

// Your machines: aircond, fogger, air exchange, walls and roof.
function machineRows(report) {
  const EQ = global.ClimateEquipment, U = report.ac.units, e = report.inputs.equipment;
  const buy = (x, f) => (x === null || x === undefined ? '' : f(x));
  const shell = e.walls !== null && e.roof !== null
    ? `Walls ${EQ.CONSTRUCTIONS[e.walls].label}, roof ${EQ.CONSTRUCTIONS[e.roof].label}` : 'Typical';
  return [
    { machine: 'Aircond', yours: acText(report.ac.own, U), verdict: VERDICT_WORD[report.ac.verdict], buy: acIsEnough(report) || report.ac.recommended === report.ac.own ? '' : buy(report.ac.recommended, x => acText(x, U)) },
    { machine: 'Fogger', yours: `${report.fogger.own} L/h`, verdict: VERDICT_WORD[report.fogger.verdict], buy: buy(report.fogger.recommended, x => `${x} L/h`) },
    { machine: 'Air exchange', yours: `${int(report.air.own)} m³/h`, verdict: VERDICT_WORD[report.air.verdict], buy: buy(report.air.recommended, x => `${int(x)} m³/h`) },
    { machine: 'Walls and roof', yours: shell, verdict: VERDICT_WORD[report.insulation.verdict], buy: '' },
  ];
}

// C11 6: when the room's own aircond is big enough, say so (never "Buy this" on the size it already has); otherwise the report's own text.
function acVerdictText(report) {
  const ac = report.ac, U = ac.units;
  if (!acIsEnough(report)) return ac.text;
  let t = `Your ${acText(ac.own, U)} aircond is big enough.`;
  if (ac.recommended !== null && ac.recommended < ac.own) t += ` A ${acText(ac.recommended, U)} would also be enough.`;
  const tail = /hours\.( .*)$/.exec(ac.text || '');   // the engine's "no reserve" sentence, when it has one
  return tail ? t + tail[1] : t;
}

const EMPTY_MIX = 'Add a mushroom and the number of blocks first.';
const emptyMixReason = mix => (Array.isArray(mix) && mix.some(r => r.blocks > 0) ? '' : EMPTY_MIX);

function heatRows(report) {
  return report.breakdown.items.map(i => ({ key: i.key, label: i.label, kwh: Math.round(i.kwh), share: Math.floor(i.share) }));
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

// ---------- the charts (C13 4, decision 106): drawn 1:1 at the width of their box ----------
const S = (tag, attrs, parent) => global.FarmUi.svgEl(tag, attrs, parent);
function label(parent, x, y, s, cls, extra) {
  const e = S('text', { x, y, class: cls, ...(extra || {}) }, parent);
  e.textContent = s;
  return e;
}
const observers = new Set();
function disposeCharts() { for (const o of observers) o.disconnect(); observers.clear(); }
function chartInto(host, o) {
  let last = 0, ro = null;
  const paint = () => {
    const avail = host.clientWidth || 0;
    const w = Math.round(Math.min(o.max || Infinity, Math.max(o.min, avail || o.min)));
    if (w === last) return;
    last = w;
    const svg = S('svg', { class: 'plan-svg', role: 'img', 'aria-label': o.aria, width: w });
    const h = o.draw(svg, w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    host.replaceChildren(svg);
  };
  paint();
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => {
      if (host.isConnected === false) { ro.disconnect(); observers.delete(ro); return; }
      paint();
    });
    ro.observe(host);
    observers.add(ro);
  }
}
function figure(cls, question) {
  const fig = node('figure', undefined, `plan-fig ${cls}`);
  fig.append(node('h4', question, 'plan-q'));
  const host = node('div', undefined, 'plan-scroll');
  fig.append(host);
  return { fig, host };
}
function more(summary, ...kids) {
  const d = node('details', undefined, 'plan-more');
  d.append(node('summary', summary), ...kids);
  return d;
}
const kwh1 = x => x.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// One group per aircond size tried (C13 4): the share of time in band and the cost per block, and which size is yours and which is recommended.
function sizeGroups(report) {
  const U = report.ac.units, line = global.ClimateCapacity.PASS.inT;
  return report.runs.filter(r => r.kind === 'ac').map(r => ({
    hp: r.ac_hp, label: acText(r.ac_hp, U), inT: r.fruitingInT, rmPerBlock: r.rmPerBlock, kwhPerBlock: r.kwhPerBlock,
    yours: r.ac_hp === report.ac.own, recommended: report.ac.recommended !== null && r.ac_hp === report.ac.recommended,
    state: r.tooBig ? 'big' : r.acPass ? 'holds' : 'small',
    word: r.tooBig ? 'too big' : r.acPass ? 'holds it' : 'too small', pass: r.fruitingInT >= line,
  }));
}
const SIZE_LVL = { holds: 'plan-b-good', big: 'plan-b-warn', small: 'plan-b-bad' };
function sizesAria(report, groups) {
  const own = groups.find(g => g.yours), rec = groups.find(g => g.recommended);
  const bits = [];
  if (own && rec) bits.push(own === rec ? `Your ${own.label} aircond is the recommended size.` : `Recommended: ${rec.label}. Yours is ${own.label}.`);
  else if (rec) bits.push(`Recommended: ${rec.label}.`);
  else if (own) bits.push(`Yours is ${own.label}.`);
  bits.push(`Aircond sizes tried: ${groups.map(g => `${g.label} ${pct(g.inT)} % of the time in band, RM ${g.rmPerBlock.toFixed(2)} per block, ${g.word}`).join('; ')}.`);
  return bits.join(' ');
}
function sizesFigure(report) {
  const G = sizeGroups(report);
  if (!G.length) return null;
  const { fig, host } = figure('ac-sizes', 'Which aircond size works?');
  fig.insertBefore(node('p', `The dashed line is the pass line: ${global.ClimateCapacity.PASS.inT} % of the time in band.`, 'plan-sub'), host);
  const maxRm = Math.max(...G.map(g => g.rmPerBlock), 0.01);
  chartInto(host, { min: 480, max: 900, aria: sizesAria(report, G), draw(svg, W) {
    const LW = 150, RH = 50, TOP = 30, rest = W - LW - 12, col1 = Math.round(rest * 0.58), C1 = LW, C2 = LW + col1;
    const B1 = Math.max(50, col1 - 124), B2 = Math.max(50, rest - col1 - 64), H = TOP + G.length * RH + 6;
    label(svg, C1, 16, 'Time in band (fruiting)', 'pt pt-muted');
    label(svg, C2, 16, 'RM per block', 'pt pt-muted');
    const passX = C1 + global.ClimateCapacity.PASS.inT / 100 * B1;
    S('line', { class: 'plan-pass', x1: passX, x2: passX, y1: TOP - 4, y2: H - 6 }, svg);
    G.forEach((g, i) => {
      const y = TOP + i * RH;
      if (g.yours) S('rect', { class: 'plan-yours', x: 3, y: y + 2, width: W - 6, height: RH - 6, rx: 6 }, svg);
      label(svg, 14, y + 22, g.label, 'pt pt-strong');
      const tags = [g.yours ? 'yours' : null, g.recommended ? 'recommended' : null].filter(Boolean).join(' · ');
      if (tags) label(svg, 14, y + 38, tags, 'pt pt-tag');
      S('rect', { class: 'plan-track', x: C1, y: y + 12, width: B1, height: 16, rx: 3 }, svg);
      S('rect', { class: SIZE_LVL[g.state], x: C1, y: y + 12, width: Math.max(2, g.inT / 100 * B1), height: 16, rx: 3 }, svg);
      label(svg, C1 + B1 + 8, y + 25, `${pct(g.inT)} % · ${g.word}`, 'pt');
      const bw = Math.max(2, g.rmPerBlock / maxRm * B2);
      S('rect', { class: 'plan-bar', x: C2, y: y + 12, width: bw, height: 16, rx: 3 }, svg);
      label(svg, C2 + bw + 8, y + 25, `RM ${g.rmPerBlock.toFixed(2)}`, 'pt');
    });
    return H;
  } });
  return fig;
}

// Where the heat comes from: five shares of one 100 % bar.
function heatFigure(report) {
  const items = report.breakdown.items.filter(i => i.share > 0);
  if (!items.length) return null;
  const top = items.reduce((a, b) => (b.share > a.share ? b : a));
  const aria = `The biggest part of the heat is ${top.label.toLowerCase()}. Where the heat comes from: ${items.map(i => `${i.label} ${Math.floor(i.share)} %`).join(', ')}.`;
  const { fig, host } = figure('heat-split', 'Where the heat comes from');
  fig.insertBefore(node('p', `Fruiting hours, with ${acText(report.breakdown.ac_hp, report.ac.units)} aircond.`, 'plan-sub'), host);
  chartInto(host, { min: 360, max: 900, aria, draw(svg, W) {
    const PAD = 4, PW = W - 2 * PAD, BH = 32;
    let x = PAD;
    items.forEach((it, i) => {
      const w = it.share / 100 * PW;
      S('rect', { class: `plan-heat plan-heat-${i + 1}`, x, y: 4, width: Math.max(0, w - 1), height: BH, rx: 3 }, svg);
      if (w > 40) label(svg, x + w / 2, 4 + BH / 2 + 5, `${Math.floor(it.share)} %`, 'pt pt-onheat', { 'text-anchor': 'middle' });
      x += w;
    });
    return BH + 8;
  } });
  const legend = node('ul', undefined, 'plan-legend');
  items.forEach((it, i) => {
    const li = node('li');
    li.append(node('span', undefined, `plan-sw plan-heat-${i + 1}`), ` ${it.label}: ${Math.floor(it.share)} % (${kwh1(it.kwh)} kWh)`);
    legend.append(li);
  });
  fig.append(legend);
  return fig;
}

function alsoTried(report) {
  return report.runs.filter(r => r.kind !== 'ac').map(r => {
    const what = r.kind === 'fogger' ? `${r.fog_lph} L/h fogger` : `${int(r.air_m3h)} m³/h air exchange`;
    return `${what} with ${acText(r.ac_hp, r.ac_units)} aircond: ${r.pass ? 'the whole cycle passes' : 'the cycle still has problems'}`;
  });
}

function renderReport(el, report) {
  disposeCharts();
  const parts = [];
  if (report.verdict === 'impossible') {
    parts.push(node('p', report.why));
  } else {
    const lines = report.summary.slice();
    if (report.ac.text && lines[0] === report.ac.text) lines[0] = acVerdictText(report);
    lines.forEach((line, i) => { const p = node('p'); p.append(i === 0 ? node('strong', line) : line); parts.push(p); });
    const spT = report.targets.spT;
    const sizes = sizesFigure(report);
    if (sizes) parts.push(sizes);
    parts.push(node('h4', 'Your machines'));
    parts.push(table('run-list', ['Machine', 'Yours', 'Verdict', 'Buy'], machineRows(report).map(r => [r.machine, r.yours, r.verdict, r.buy])));
    const heat = heatFigure(report);
    if (heat) parts.push(heat);
    if (report.breakdown.text && !report.summary.includes(report.breakdown.text)) parts.push(node('p', report.breakdown.text));
    parts.push(more('Show the aircond sizes table', table('run-list', ['Aircond', `Fruiting hours at ${spT} °C`, 'Worst stage', 'kWh per block', 'RM per block', 'Result'],
      runRows(report).map(r => {
        const result = node('td', r.result);
        for (const t of r.tags) result.append(' ', node('span', t, 'chip'));
        return [r.aircond, r.fruiting, r.worst, r.kwh, r.rm, result];
      }))));
    parts.push(more('Show the heat table', table('run-list', ['Source', 'kWh (heat)', 'Share'], heatRows(report).map(r => [r.label, int(r.kwh), `${r.share} %`]))));
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
  <div class="form-grid">
    <div class="field" data-field="ac_hp">
      <label for="eqAcHp">Aircond size</label>
      <div class="field-ctl"><select id="eqAcHp">${EQ.AC_SIZES.map(s => opt(s.hp, `${s.hp} hp`)).join('')}</select></div>
      <p class="field-err" hidden></p>
    </div>
    <div class="field" data-field="ac_units">
      <label for="eqAcUnits">Number of airconds</label>
      <div class="field-ctl"><input id="eqAcUnits" type="number" min="1" max="4" step="1"><span class="unit">airconds</span></div>
      <p class="field-err" hidden></p>
    </div>
    <div class="field" data-field="fog_lph">
      <label for="eqFog">Fogger</label>
      <div class="field-ctl"><input id="eqFog" type="number" min="0.5" max="50" step="0.5"><span class="unit">L/h</span></div>
      <p class="field-err" hidden></p>
    </div>
    <div class="field" data-field="air_m3h">
      <label for="eqAir">Air exchange</label>
      <div class="field-ctl"><input id="eqAir" type="number" min="50" max="10000" step="50"><span class="unit">m³/h</span></div>
      <p class="field-err" hidden></p>
    </div>
    <div class="field" data-field="walls">
      <label for="eqWalls">Walls</label>
      <div class="field-ctl"><select id="eqWalls">${list(keys)}</select></div>
      <p class="field-err" hidden></p>
    </div>
    <div class="field" data-field="roof">
      <label for="eqRoof">Roof</label>
      <div class="field-ctl"><select id="eqRoof">${list(keys.filter(k => EQ.CONSTRUCTIONS[k].roof))}</select></div>
      <p class="field-err" hidden></p>
    </div>
    <div class="field" data-field="height">
      <label for="eqHeight">Inside height</label>
      <div class="field-ctl"><input id="eqHeight" type="number" min="2" max="6" step="0.1"><span class="unit">m</span></div>
      <p class="field-err" hidden></p>
    </div>
  </div>
  <div class="btn-row">
    <button type="button" class="btn btn-primary" id="eqSave">Save machines</button>
    <button type="button" class="btn" id="eqCheck">Check my machines</button>
  </div>
</form>
<p class="tag" id="eqAirNote"></p>
<div class="run-progress" id="eqProgress" hidden><span id="eqProgressBar"></span><span id="eqProgressText"></span></div>
<p class="alert" id="eqMsg" role="status" hidden></p>
<div id="eqResult"></div>`;
}

const mounted = new WeakMap();   // element -> the unmount of the card mounted there

function mount(el, opts) {
  if (mounted.has(el)) mounted.get(el)();   // a second mount into the same element replaces the first
  const EQ = global.ClimateEquipment, API = global.FarmApi, UI = global.FarmUi;
  const section = document.createElement('section');
  section.className = 'card result-card';
  section.innerHTML = markup();
  el.replaceChildren(section);
  const $ = id => section.querySelector(`#${id}`);
  const form = section.querySelector('form.equip-form');
  let dead = false, running = false, savedAir = opts.equipment ? opts.equipment.air_m3h : null;
  fillForm(form, opts.equipment);

  const say = (text, lvl) => UI.say($('eqMsg'), lvl || 'info', text);
  const paintNote = () => {
    const st = opts.runInputs().settings, b = st ? st.airM3h : undefined;
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
  const repaint = () => { if (!dead) { paintNote(); paintButtons(); } };
  section.addEventListener('focusin', repaint);
  section.addEventListener('pointerdown', repaint);

  // Shows an error as a message plus marks on the fields it names.
  const fail = (err, prefix) => {
    const p = UI.plainError(err, LABELS);
    say(prefix ? `${prefix}${p.text}` : p.text, 'error');
    UI.markFields(form, p.fields);
  };
  // Leave guard: only while the form differs from the saved machines.
  const guardApi = () => (global.FarmShell && global.FarmShell.guardLeave ? global.FarmShell : null);
  let base = JSON.stringify(formValues(form)), guarded = false;
  const syncGuard = () => {
    const sh = guardApi();
    if (!sh || dead) return;
    const differs = JSON.stringify(formValues(form)) !== base;
    if (differs && !guarded) { sh.guardLeave(() => 'Your machines have unsaved changes.'); guarded = true; }
    else if (!differs && guarded) { sh.guardLeave(null); guarded = false; }
  };
  form.addEventListener('input', syncGuard);
  form.addEventListener('change', syncGuard);

  async function save() {
    const eq = formValues(form);
    UI.markFields(form, {});
    const problems = EQ.checkEquipment(eq);
    if (problems.length) { fail(problemsError(problems)); return null; }
    try {
      const saved = await API.saveEquipment(opts.id, eq);
      if (dead) return null;
      savedAir = saved.air_m3h;
      base = JSON.stringify(formValues(form)); syncGuard();
      say('Saved. Simulate uses these machines now; the live room uses them after its next restart.', 'good');
      // The server synced the settings (C3 6.26); their stream event has not reached the tab yet, so no note.
      $('eqAirNote').textContent = '';
      opts.onEquipment(saved);
      return saved;
    } catch (err) {
      if (!dead) fail(err);
      return null;
    }
  }

  async function check() {
    const inp = opts.runInputs();
    const eq = formValues(form);
    UI.markFields(form, {});
    const problems = EQ.checkEquipment(eq);
    if (problems.length) { fail(problemsError(problems)); return; }
    if (emptyMixReason(inp.mix)) { say(EMPTY_MIX, 'info'); return; }
    if (!Array.isArray(inp.mix) || global.ClimateCapacity.commonTargets(inp.mix).impossible) { say('This crop mix cannot share one room.', 'error'); return; }
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
      say(`The run stopped: ${err.message}`, 'error');
      return;
    }
    running = false; paintButtons(); prog.hidden = true;
    renderReport($('eqResult'), report);
    try {
      const info = await API.createSimulation(opts.id, { kind: 'equipment', inputs: { ...inp.inputs, empty_below: null, equipment: eq }, result: report });
      if (dead) return;
      say(`Saved as run ${info.id}.`, 'good');
      opts.onSaved(info);
    } catch (err) {
      if (!dead) say(`The result was not saved: ${UI.errorText(err)}`, 'error');
    }
  }

  $('eqSave').addEventListener('click', () => { save(); });
  $('eqCheck').addEventListener('click', () => { check(); });

  const unmount = () => {
    if (dead) return;
    if (guarded && guardApi()) guardApi().guardLeave(null);
    dead = true;
    if (mounted.get(el) === unmount) mounted.delete(el);
    section.removeEventListener('focusin', repaint);
    section.removeEventListener('pointerdown', repaint);
    section.remove();
    disposeCharts();
  };
  mounted.set(el, unmount);
  return { unmount };
}

global.FarmEquipmentCard = { mount, renderReport, helpers: { sizeGroups, sizesFigure, heatFigure, formValues, fillForm, progressText, runRows, machineRows, heatRows, airNote, acVerdictText, emptyMixReason } };
})(typeof window !== 'undefined' ? window : globalThis);
