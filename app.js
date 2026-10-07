/*
 * app.js: connects the SIMULATION to the CONTROLLER and draws the dashboard.
 *
 * Every simulated second:   sim.step(1, commands)
 * Every new sensor reading: commands = ctl.update(reading)
 *
 * The controller panels show only what the controller sees (sensor readings, meter readings,
 * its own state). The simulation panels show the plant itself.
 */
(() => {
'use strict';
const SIM = window.ClimateSim, CC = window.ClimateController, RT = window.ClimateRuntime, PL = SIM.PLANT;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const NS = 'http://www.w3.org/2000/svg';
const MAX_SAMPLES = 40000;

const env = structuredClone(SIM.DEFAULT_ENV);
const cfg = CC.defaultSettings();
const input = { tariff: 0.57 };
let sim, ctl, io, rt, reading, cmd, samples = [], events = [];
let logDirty = true, chartsDirty = true, hoverT = null, hoverChart = null, lastView = null;

// ---------------- Run loop ----------------
function onEvent(ev) { events.unshift(ev); if (events.length > 300) events.pop(); logDirty = true; }

function reset() {
  sim = SIM.create(env);
  sim.setRoom({ T: cfg.spT, RH: cfg.spRH, CO2: 750 });   // start at the targets: no start-up alarms
  events = []; samples = []; hoverT = null;
  ctl = CC.create(cfg, null, onEvent);
  // The simulation is the I/O adapter here. A hardware adapter replaces it on the farm (runtime.js).
  io = RT.simIO(sim);
  rt = RT.createRuntime({ io, ctl, onReading: (r, c) => { reading = r; cmd = c; sample(r); } });
  onEvent({ t: 0, lvl: 'info', text: 'Simulation started' });
  poll();
  chartsDirty = true;
}
// The controller acts only when the sensors deliver a new reading (runtime.js).
const poll = () => rt.poll();
function tick() { if (blockFollow) env.blockStage = cfg.stage; io.advance(1); rt.poll(); }
let blockFollow = true;

// Chart samples keep the raw sensor values. A missing or impossible value becomes a gap.
const plausible = (k, x) => (x != null && Number.isFinite(x) && x >= CC.SENSORS[k].min && x <= CC.SENSORS[k].max ? x : NaN);
function sample(r) {
  const R = cfg.rules;
  samples.push({ t: r.t, T: plausible('T', r.T), RH: plausible('RH', r.RH), C: plausible('CO2', r.CO2),
    tOut: plausible('tOut', r.tOut), rhOut: plausible('rhOut', r.rhOut),
    ac: r.power.ac, hu: r.power.hu, fan: r.power.fan, li: r.power.lights || 0, ci: r.power.circ || 0,
    acSet: ctl.state.cmd.ac.power ? ctl.state.cmd.ac.setpoint : NaN,
    core: r.core != null ? r.core : NaN, vpd: ctl.state.vpd ?? NaN,
    cmd: { fan: ctl.state.cmd.fan.level, fog: ctl.state.cmd.hu.level, acPower: ctl.state.cmd.ac.power ? 1 : 0, acMode: ctl.state.cmd.ac.mode,
      acSet: ctl.state.cmd.ac.setpoint, acFan: ctl.state.cmd.ac.fan, lights: ctl.state.cmd.lights.on ? 1 : 0, circ: ctl.state.cmd.circ.on ? 1 : 0 },
    spT: cfg.spT, spRH: cfg.spRH, co2Lim: cfg.co2Lim, fanOn: R.fanOn, fanOff: R.fanOff });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  chartsDirty = true;
}

// ---------------- Formatting ----------------
const pad2 = n => String(n).padStart(2, '0');
const absS = t => env.startHour * 3600 + t;
function clockParts(t) { const a = Math.floor(absS(t)); return { day: Math.floor(a / 86400) + 1, h: Math.floor(a % 86400 / 3600), m: Math.floor(a % 3600 / 60), s: a % 60 }; }
const fmtClock = t => { const c = clockParts(t); return `Day ${c.day} · ${pad2(c.h)}:${pad2(c.m)}`; };
const fmtHM = t => { const c = clockParts(t); return `${pad2(c.h)}:${pad2(c.m)}`; };
const fmtStamp = t => { const c = clockParts(t); return `D${c.day} ${pad2(c.h)}:${pad2(c.m)}:${pad2(c.s)}`; };
const fmtDur = s => (s < 3600 ? `${Math.floor(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const fmtMinSec = s => `${Math.floor(s / 60)}:${pad2(Math.round(s % 60))}`;
const fmtNum = (x, d) => (x != null && Number.isFinite(x) ? x.toFixed(d) : '—');
const watts = w => (w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`);
const pct = f => `${Math.round(f * 100)} %`;
const isNight = h => h >= 19 || h < 7;
const set = (id, txt) => { const e = document.getElementById(id); if (e && e.textContent !== txt) e.textContent = txt; };
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function paintChip(el, st) {
  el.dataset.lvl = st.lvl;
  if (el.dataset.txt === st.text && el.dataset.ico === st.icon) return;
  el.dataset.txt = st.text; el.dataset.ico = st.icon;
  const i = document.createElement('span'); i.className = 'ico'; i.textContent = st.icon; i.setAttribute('aria-hidden', 'true');
  const t = document.createElement('span'); t.textContent = st.text;
  el.replaceChildren(i, t);
}
const cell = (tag, txt) => { const e = document.createElement(tag); e.textContent = txt; return e; };

// ---------------- UI update ----------------
const AC_WORD = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' };
const LVL_RANK = { critical: 3, serious: 2, warning: 1 };
const ICON = { critical: '◆', serious: '▲', warning: '▲', good: '✓', info: '•' };
let alarmKey = '', exhKey = '';

function updateUi() {
  const v = sim.view(), r = reading, st = ctl.state, R = cfg.rules;
  const night = isNight(v.weather.hour);

  // Header: room clock (simulation) and alarm summary (controller)
  set('clock', fmtClock(v.t));
  paintChip($('#sky'), { lvl: 'info', icon: night ? '☾' : '☀', text: night ? 'Night' : 'Day' });
  const list = ctl.alarmList(), active = list.filter(a => a.active), unacked = list.filter(a => !a.acked);
  const worst = active.reduce((w, a) => (LVL_RANK[a.lvl] > (LVL_RANK[w] || 0) ? a.lvl : w), 'good');
  paintChip($('#alarmSummary'), active.length || unacked.length
    ? { lvl: active.length ? worst : 'info', icon: active.length ? ICON[worst] : '•', text: `${active.length} active · ${unacked.length} not acknowledged` }
    : { lvl: 'good', icon: '✓', text: 'No active alarms' });
  $('#ackBtn').hidden = unacked.length === 0;
  renderAlarms(list);

  // ----- Simulation view (the plant) -----
  set('mOutT', `${v.weather.T.toFixed(1)} °C`);
  set('mOutRH', `${v.weather.RH.toFixed(0)} % RH`);
  $('#mSun').style.display = night ? 'none' : '';
  $('#mMoon').style.display = night ? '' : 'none';
  set('mSkyTxt', night ? 'Night' : 'Day');
  $('#lamp').classList.toggle('on', v.lights);
  set('mLamp', v.lights ? 'Lights on' : 'Lights off');
  const readout = (id, txt, s) => {
    const g = document.getElementById(id); g.dataset.lvl = s.lvl;
    const val = g.querySelector('.val'), ic = g.querySelector('.ico');
    if (val.textContent !== txt) val.textContent = txt;
    if (ic.textContent !== s.icon) ic.textContent = s.icon;
  };
  readout('mT', `${fmtNum(r.T, 1)} °C`, ctl.status('T'));
  readout('mRH', `${fmtNum(r.RH, 0)} % RH`, ctl.status('RH'));
  readout('mC', `${fmtNum(r.CO2, 0)} ppm`, ctl.status('CO2'));
  const a = v.act;
  set('mAcState', !a.power ? 'Off' : `${AC_WORD[a.mode]} ${a.setpoint.toFixed(1)}° · ${a.comp ? `comp ${pct(a.acFrac)}` : 'comp idle'}`);
  set('mHuState', a.huLevel > 0 ? `Level ${a.huLevel}` : 'Off');
  set('mFanState', `${env.vent === 'supply' ? 'Supply ' : ''}${PL.fan.levels[a.fanLevel].name}`);
  set('mFanTag', env.vent === 'supply' ? 'SF-203' : 'EF-203');
  set('mOutflow', `${Math.round(v.airM3h)} m³/h`);
  set('mInflow', `${Math.round(v.airM3h)} m³/h`);
  set('mCo2Src', `${env.blocks.toLocaleString('en')} blocks`);
  $('#acUnit').classList.toggle('on', a.comp);
  $('#condenser').classList.toggle('on', a.comp);
  $('#huUnit').classList.toggle('on', a.huLevel > 0);
  $('#fanUnit').classList.toggle('on', a.fanLevel > 0);
  set('mimicStage', `${CC.CROPS[cfg.crop].name} · ${CC.STAGES[cfg.stage]} · live`);
  const Z = v.zones, dist = [v.door && 'door open', v.workers && `${v.workers} workers`, v.watering && 'floor wet', v.weather.rain && 'rain', v.weather.cloudy && 'cloudy', v.wetSensor && 'RH sensor wet'].filter(Boolean);
  set('mimicNote', `Low air ${Z.lo.T.toFixed(1)} °C ${Z.lo.RH.toFixed(0)} % ${Z.lo.C.toFixed(0)} ppm · High air ${Z.hi.T.toFixed(1)} °C ${Z.hi.RH.toFixed(0)} % ${Z.hi.C.toFixed(0)} ppm · core ${v.core.toFixed(1)} °C${dist.length ? ' · ' + dist.join(', ') : ''}`);

  // ----- Controller panels (controller state + meters) -----
  const c = st.cmd, hold = (why, h) => (h ? `${why} ${h}` : why);
  set('acState', !c.ac.power ? 'Off' : `${AC_WORD[c.ac.mode]} · set ${c.ac.setpoint.toFixed(1)} °C${st.setbackOn ? ` (setback +${R.acSetbackC})` : ''}`);
  set('acPower', watts(v.power.ac));   // power meters report every second
  $('#acMeter').style.width = `${clamp(v.power.ac / 1400, 0, 1) * 100}%`;
  set('acWhy', hold(st.why.ac, st.hold.ac));
  set('huState', c.hu.level > 0 ? `Level ${c.hu.level} of 3` : 'Standby');
  set('huPower', watts(v.power.hu));
  $('#huMeter').style.width = `${c.hu.level / 3 * 100}%`;
  set('huWhy', hold(st.why.hu, st.hold.hu));
  set('fanState', c.fan.level > 0 ? `${CC.MACHINES.fanLevels[c.fan.level]} · level ${c.fan.level} of 3` : 'Off');
  set('fanPower', watts(v.power.fan));
  $('#fanMeter').style.width = `${c.fan.level / 3 * 100}%`;
  set('fanWhy', hold(st.why.fan, st.hold.fan));
  set('liState', c.lights.on ? 'On' : 'Off'); set('liPower', watts(v.power.lights)); set('liWhy', st.why.lights);
  set('ciState', c.circ.on ? 'On' : 'Off'); set('ciPower', watts(v.power.circ)); set('ciWhy', st.why.circ);
  const dd = Math.max(r.t, 3600) / 86400;
  set('wFog', (r.water.fogKg / dd).toFixed(1)); set('wAc', (r.water.acKg / dd).toFixed(1)); set('wAir', Math.round(r.unfilteredM3 / dd).toLocaleString('en'));
  set('wVpd', st.vpd != null ? `${st.vpd.toFixed(2)} / ${st.vpdT.toFixed(2)}` : '–');
  set('wNote', r.water.acKg > r.water.fogKg * 1.5 && r.water.fogKg > 0.5
    ? 'The AC coil removes much more water than the fogger adds: the AC and the fogger work against each other. A high AC fan speed and fog-first cooling decrease this.'
    : env.vent === 'exhaust' ? 'All incoming air is unfiltered: the exhaust fan puts the room under suction.' : 'Incoming air goes through the filter: the room has a slight over-pressure.');
  set('vpdLine', cfg.humMode === 'vpd' && st.vpdT != null ? `VPD target ${st.vpdT.toFixed(2)} kPa: the RH target is now ${st.rhT.toFixed(1)} % at ${fmtNum(st.v.T, 1)} °C.` : '');

  // Energy (power meter readings)
  const tot = r.kwh.ac + r.kwh.hu + r.kwh.fan + (r.kwh.lights || 0) + (r.kwh.circ || 0), days = r.t / 86400;
  set('eKwh', tot.toFixed(3));
  set('eDay', r.t >= 3600 ? (tot / days).toFixed(1) : '–');
  set('eCost', (tot * input.tariff).toFixed(2));
  for (const [k, id] of [['ac', 'Ac'], ['hu', 'Hu'], ['fan', 'Fan'], ['lights', 'Li'], ['circ', 'Ci']]) {
    const kwh = r.kwh[k] || 0, share = tot > 0 ? kwh / tot : 0;
    set('e' + id, `${kwh.toFixed(3)} kWh · ${Math.round(share * 100)} %`);
    document.getElementById('e' + id + 'Bar').style.width = `${share * 100}%`;
  }
  // Duty (controller counters)
  const S = st.stats, perDay = n => (r.t >= 3600 ? ` (${Math.round(n / days)}/day)` : '');
  set('dFanOn', fmtDur(S.fanOnS));
  set('dFanOnL', r.t > 0 ? `fan run time (${Math.round(S.fanOnS / r.t * 100)} %)` : 'fan run time');
  set('dFanStarts', String(S.fanStarts)); set('dFanStartsL', `fan starts${perDay(S.fanStarts)}`);
  set('dSetback', fmtDur(S.setbackS));
  set('dAcCmds', String(S.acCmds)); set('dAcCmdsL', `AC commands${perDay(S.acCmds)}`);
  set('dFanBlocked', fmtDur(S.fanBlockedS));
  set('dFogStarts', String(S.fogStarts)); set('dFogStartsL', `fogger starts${perDay(S.fogStarts)}`);
  updateLadderLive();
  paintRhAbs();
  renderExhaust();
  paintProgram();

  if (logDirty) renderLog();
}

function renderAlarms(list) {
  const key = list.map(a => `${a.id}${a.active}${a.acked}`).join('|');
  if (key === alarmKey) return;
  alarmKey = key;
  if (!list.length) { const p = document.createElement('p'); p.className = 'est-note'; p.textContent = 'No alarms.'; $('#alarmList').replaceChildren(p); return; }
  $('#alarmList').replaceChildren(...list.map(a => {
    const li = document.createElement('li'); li.dataset.lvl = a.lvl;
    const ic = document.createElement('span'); ic.className = 'ico'; ic.textContent = ICON[a.lvl] || '•';
    const tx = document.createElement('span'); tx.textContent = `${a.label} · since ${fmtStamp(a.since)}`;
    const stx = document.createElement('span'); stx.className = 'al-state';
    stx.textContent = `${a.active ? 'Active' : 'Cleared'} · ${a.acked ? 'acknowledged' : 'not acknowledged'}`;
    li.append(ic, tx, stx);
    if (!a.acked) {
      const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Acknowledge';
      b.addEventListener('click', () => { ctl.ack(a.id); updateUi(); });
      li.append(b);
    }
    return li;
  }));
}

function renderLog() {
  logDirty = false;
  const items = events.slice(0, 80).map(e => {
    const li = document.createElement('li'); li.dataset.lvl = e.lvl;
    const tm = document.createElement('time'); tm.textContent = fmtStamp(e.t);
    const ic = document.createElement('span'); ic.className = 'ico'; ic.textContent = ICON[e.lvl] || '•'; ic.setAttribute('aria-hidden', 'true');
    const tx = document.createElement('span'); tx.textContent = e.text;
    li.append(tm, ic, tx);
    return li;
  });
  $('#log').replaceChildren(...items);
}

// ---------------- Exhaust per hour (controller record) ----------------
function renderExhaust() {
  const X = ctl.exhaust(), nowH = Math.floor(reading.t / 3600);
  const hours = [];
  for (let h = nowH - 23; h <= nowH; h++) hours.push(X.hours.find(b => b.h === h) || { h, runS: 0, starts: 0, m3: 0 });
  const key = `${nowH}|${hours.map(b => Math.round(b.runS / 30)).join(',')}|${X.events.length}|${cfg.roomM3}`;
  if (key === exhKey) return;
  exhKey = key;
  const vol = cfg.roomM3 || 1, mine = hours.filter(b => b.h >= 0);
  const done = mine.filter(b => b.h < nowH);
  const sum = (arr, k) => arr.reduce((s, b) => s + b[k], 0);
  // headline: averages over the full hours
  set('xAvgStarts', done.length ? (sum(done, 'starts') / done.length).toFixed(1) : '–');
  set('xAvgRun', done.length ? `${Math.round(sum(done, 'runS') / done.length / 60)} min` : '–');
  set('xAvgAch', done.length ? (sum(done, 'm3') / done.length / vol).toFixed(1) : '–');
  set('xTotM3', Math.round(sum(mine, 'm3')).toLocaleString('en'));

  // bar chart: fan run minutes per hour, last 24 h
  const host = $('#exhChart'), w = Math.max(240, host.clientWidth), h = 150, m = { l: 34, r: 8, t: 14, b: 22 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b, bw = pw / 24, gap = 2;
  const Y = min => m.t + (1 - min / 60) * ph;
  const svg = svgEl('svg', { class: 'chart', width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Exhaust fan run minutes per hour, last 24 hours. The table below has the values.' });
  for (const tk of [0, 15, 30, 45, 60]) {
    svgEl('line', { x1: m.l, x2: w - m.r, y1: Y(tk), y2: Y(tk), class: tk === 0 ? 'base' : 'gridl' }, svg);
    const t = svgEl('text', { x: m.l - 6, y: Y(tk) + 4, 'text-anchor': 'end' }, svg); t.textContent = tk;
  }
  const maxB = hours.reduce((b, x) => (x.runS > b.runS ? x : b), hours[0]);
  hours.forEach((b, i) => {
    const x = m.l + i * bw + gap / 2, mins = b.runS / 60;
    if (b.h >= 0 && mins > 0) {
      const top = Y(Math.min(60, mins)), bh = Y(0) - top;
      const g = svgEl('g', { class: 'xbar' + (b.h === nowH ? ' now' : '') }, svg);
      svgEl('path', { d: barPath(x, top, bw - gap, bh, 4) }, g);
      const title = svgEl('title', {}, g);
      title.textContent = `${fmtHM(b.h * 3600)}–${fmtHM((b.h + 1) * 3600)}: ${Math.round(mins)} min, ${b.starts} purges, ${Math.round(b.m3)} m³ (${(b.m3 / vol).toFixed(1)} air changes)${b.h === nowH ? ', hour not finished' : ''}`;
      if (b === maxB) { const t = svgEl('text', { x: x + (bw - gap) / 2, y: top - 4, 'text-anchor': 'middle', class: 'xlab' }, svg); t.textContent = `${Math.round(mins)}`; }
    }
    if ((b.h + env.startHour) % 3 === 0) { const t = svgEl('text', { x: x + (bw - gap) / 2, y: h - 5, 'text-anchor': 'middle' }, svg); t.textContent = fmtHM(b.h * 3600); }
  });
  host.replaceChildren(svg);

  // hour table, newest first
  $('#exhRows').replaceChildren(...mine.slice(-12).reverse().map(b => {
    const tr = document.createElement('tr');
    tr.append(cell('td', `${fmtHM(b.h * 3600)}–${fmtHM((b.h + 1) * 3600)}${b.h === nowH ? ' (now)' : ''}`),
      cell('td', String(b.starts)), cell('td', fmtMinSec(b.runS)), cell('td', Math.round(b.m3).toLocaleString('en')), cell('td', (b.m3 / vol).toFixed(1)));
    return tr;
  }));
  // every exhaust, newest first (the running one at the top)
  const evs = (X.cur ? [{ ...X.cur, running: true }] : []).concat(X.events.slice().reverse()).slice(0, 40);
  $('#exhEvents').replaceChildren(...evs.map(e => {
    const tr = document.createElement('tr');
    const dur = (e.running ? reading.t : e.end) - e.start;
    tr.append(cell('td', fmtStamp(e.start)), cell('td', e.running ? 'running' : fmtStamp(e.end)), cell('td', fmtMinSec(dur)),
      cell('td', CC.MACHINES.fanLevels[e.maxLevel]), cell('td', e.reason || '–'),
      cell('td', `${fmtNum(e.co2Start, 0)} → ${e.running ? '…' : fmtNum(e.co2End, 0)}`), cell('td', Math.round(e.m3).toLocaleString('en')));
    return tr;
  }));
}
// Bar with rounded top ends only (anchored to the baseline).
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// ---------------- CO2 rules ladder ----------------
const LADDER = [
  { key: 'fan', name: 'Fan purge', color: 'var(--s-fan)', hi: () => cfg.rules.fanOn, lo: () => cfg.rules.fanOff, on: () => true },
  { key: 'ac', name: 'AC setback', color: 'var(--s-ac)', hi: () => cfg.rules.acOff, lo: () => cfg.rules.acOn, on: () => cfg.rules.acPurge },
];
let ladScale = { lo: 400, hi: 1500 };
function buildLadder() {
  const L = $('#ladder'); L.replaceChildren();
  LADDER.forEach((row, i) => {
    const name = document.createElement('span'); name.className = 'lad-name'; name.textContent = row.name;
    name.style.gridArea = `${i + 1} / 1`;
    const track = document.createElement('div'); track.className = 'lad-track'; track.style.setProperty('--key', row.color);
    track.style.gridArea = `${i + 1} / 2`;
    row.hys = document.createElement('span'); row.hys.className = 'lad-hys';
    row.onEl = document.createElement('span'); row.onEl.className = 'lad-on';
    track.append(row.hys, row.onEl); row.track = track;
    row.chip = document.createElement('span'); row.chip.className = 'chip'; row.chip.style.gridArea = `${i + 1} / 3`;
    L.append(name, track, row.chip);
  });
  const over = document.createElement('div'); over.className = 'lad-over'; over.style.gridArea = `1 / 2 / ${LADDER.length + 1} / 3`;
  const mk = (id, cls) => { const d = document.createElement('div'); d.className = cls; d.id = id; d.append(document.createElement('b')); return d; };
  over.append(mk('ladNow', 'lad-mark'), mk('ladLim', 'lad-mark lim'), mk('ladSafe', 'lad-mark safe'));
  const scale = document.createElement('div'); scale.className = 'lad-scale'; scale.id = 'ladScale'; scale.style.gridArea = `${LADDER.length + 1} / 2`;
  L.append(over, scale);
}
const ladPos = v => `${clamp((v - ladScale.lo) / (ladScale.hi - ladScale.lo) * 100, 0, 100)}%`;
function layoutLadder() {
  const R = cfg.rules, now = reading && Number.isFinite(reading.CO2) ? reading.CO2 : 0;
  const top = Math.max(R.fanOn, R.acOff, cfg.co2Lim, R.co2Safety ? R.co2SafetyAt : 0, now);
  ladScale = { lo: 400, hi: Math.ceil((top + 250) / 250) * 250 };
  for (const row of LADDER) {
    const lo = row.lo(), hi = row.hi();
    row.hys.style.left = ladPos(lo); row.hys.style.width = `calc(${ladPos(hi)} - ${ladPos(lo)})`;
    row.onEl.style.left = ladPos(hi); row.onEl.style.right = '0';
    row.track.classList.toggle('lad-row-off', !row.on());
  }
  const sc = $('#ladScale'); sc.replaceChildren();
  const step = Math.ceil((ladScale.hi - ladScale.lo) / 5 / 100) * 100;
  for (let x = Math.ceil(ladScale.lo / step) * step; x <= ladScale.hi; x += step) {
    const s = document.createElement('span'); s.style.left = ladPos(x); s.textContent = x; sc.append(s);
  }
  $('#ladLim').style.left = ladPos(cfg.co2Lim);
  const safe = $('#ladSafe'); safe.style.left = ladPos(R.co2SafetyAt); safe.hidden = !R.co2Safety;
}
function updateLadderLive() {
  const st = ctl.state, c = st.cmd, co2 = reading.CO2;
  const ok = Number.isFinite(co2) && !st.f.CO2;
  if (ok && co2 > ladScale.hi - 100) layoutLadder();
  const now = $('#ladNow'); now.hidden = !ok;
  if (ok) { now.style.left = ladPos(co2); now.firstChild.textContent = `${Math.round(co2)} ppm`; }
  const chips = {
    fan: st.fanBlocked ? { lvl: 'info', icon: '❚❚', text: 'Held (RH)' }
      : c.fan.level > 0 ? { lvl: 'info', icon: '●', text: st.co2Timed ? 'Timed purge' : st.fanReason === 'CO₂ purge' ? 'Purging' : 'Running' }
      : { lvl: 'none', icon: '○', text: 'Off' },
    ac: !cfg.rules.acPurge ? { lvl: 'none', icon: '–', text: 'No rule' }
      : st.setbackOn ? { lvl: 'info', icon: '▲', text: cfg.rules.acAction === 'off' ? 'AC off' : `+${cfg.rules.acSetbackC} °C` }
      : st.setbackReq && (st.setbackAlarmStop || st.setbackTimeStop) ? { lvl: 'info', icon: '!', text: 'Cancelled' }
      : { lvl: 'none', icon: '○', text: 'Normal' },
  };
  for (const row of LADDER) paintChip(row.chip, chips[row.key]);
}

// ---------------- Rules and protection forms ----------------
const RULE_NUM = [['rFanOn', 'fanOn'], ['rFanOff', 'fanOff'], ['rAcOff', 'acOff'], ['rAcOn', 'acOn']];
const HI_TO_LO = { fanOn: 'fanOff', acOff: 'acOn' };
const LO_TO_HI = { fanOff: 'fanOn', acOn: 'acOff' };
// Installer settings only. The other rules are fixed values (see "Fixed values" on the page).
const RULE_CHK = [['rAcPurge', 'acPurge'], ['rRhLock', 'rhLock'], ['rCo2Safety', 'co2Safety']];
const RULE_SEL = [['rFanLevel', 'fanLevel', Number], ['rRhAction', 'rhAction', String], ['rAcAction', 'acAction', String], ['rAirMode', 'airMode', String]];
// [input id, key, min, max] for single numbers without pairing
const RULE_ONE = [['rSetbackC', 'acSetbackC', 0.5, 6], ['rCo2SafeAt', 'co2SafetyAt', 500, 20000]];
function fillRules() {
  const R = cfg.rules;
  for (const [id, k] of RULE_NUM) document.getElementById(id).value = R[k];
  for (const [id, k] of RULE_CHK) document.getElementById(id).checked = R[k];
  for (const [id, k] of RULE_SEL) document.getElementById(id).value = String(R[k]);
  for (const [id, k] of RULE_ONE) document.getElementById(id).value = R[k];
  $('#rRhStop').value = R.rhStop; $('#rRhResume').value = R.rhResume;
  $('#ruleRh').classList.toggle('off', !R.rhLock);
  $('#ruleAc').classList.toggle('off', !R.acPurge);
  $('#ruleSafe').classList.toggle('off', !R.co2Safety);
  $('#rSetbackRow').hidden = R.acAction !== 'setback';
  paintRhAbs();
  if (reading) layoutLadder();
}
function fillRulesQuiet() {
  for (const [id, k] of [...RULE_NUM, ['rCo2SafeAt', 'co2SafetyAt']]) { const el = document.getElementById(id); if (document.activeElement !== el) el.value = cfg.rules[k]; }
  layoutLadder();
}
function paintRhAbs() {
  set('rRhStopAbs', `(${cfg.spRH - cfg.rules.rhStop} %)`);
  set('rRhResumeAbs', `(${cfg.spRH - cfg.rules.rhResume} %)`);
}
const numIn = (el, fallback, lo, hi) => clamp(Number.isFinite(parseFloat(el.value)) ? parseFloat(el.value) : fallback, lo, hi);
for (const [id, k] of RULE_NUM) {
  document.getElementById(id).addEventListener('change', e => {
    const R = cfg.rules, v = Math.round(numIn(e.target, R[k], 400, 20000));
    R[k] = v; ctl.cancelRamp();
    // Keep at least 50 ppm between the "act" level and the "end" level.
    if (HI_TO_LO[k] && R[HI_TO_LO[k]] > v - 50) R[HI_TO_LO[k]] = v - 50;
    if (LO_TO_HI[k] && R[LO_TO_HI[k]] < v + 50) R[LO_TO_HI[k]] = v + 50;
    fillRules(); chartsDirty = true;
  });
}
for (const [id, k] of RULE_CHK) document.getElementById(id).addEventListener('change', e => { cfg.rules[k] = e.target.checked; fillRules(); });
for (const [id, k, conv] of RULE_SEL) document.getElementById(id).addEventListener('change', e => { cfg.rules[k] = conv(e.target.value); fillRules(); });
for (const [id, k, lo, hi] of RULE_ONE) document.getElementById(id).addEventListener('change', e => { cfg.rules[k] = numIn(e.target, cfg.rules[k], lo, hi); if (k === 'co2SafetyAt') ctl.cancelRamp(); fillRules(); });
// Humidity-first levels: "allow" must be closer to the target than "stop".
$('#rRhStop').addEventListener('change', e => {
  const R = cfg.rules; R.rhStop = Math.round(numIn(e.target, R.rhStop, 1, 20));
  if (R.rhResume > R.rhStop - 1) R.rhResume = R.rhStop - 1;
  fillRules();
});
$('#rRhResume').addEventListener('change', e => {
  const R = cfg.rules; R.rhResume = Math.round(numIn(e.target, R.rhResume, 0, 19));
  if (R.rhStop < R.rhResume + 1) R.rhStop = R.rhResume + 1;
  fillRules();
});

// ---------------- Charts ----------------
let windowS = 21600;
function lowerBound(arr, t) { let a = 0, b = arr.length; while (a < b) { const m = (a + b) >> 1; if (arr[m].t < t) a = m + 1; else b = m; } return a; }
function nearest(pts, t) {
  if (!pts.length) return null;
  const i = lowerBound(pts, t);
  if (i <= 0) return pts[0];
  if (i >= pts.length) return pts[pts.length - 1];
  return t - pts[i - 1].t < pts[i].t - t ? pts[i - 1] : pts[i];
}
// Average readings into buckets so a 24 h window draws fast. Gaps (NaN) are left out of the average.
const AVG_KEYS = ['T', 'RH', 'C', 'tOut', 'rhOut', 'ac', 'hu', 'fan', 'li', 'ci', 'acSet', 'core', 'vpd'];
function aggregate(pts, maxN) {
  if (pts.length <= maxN) return pts;
  const k = Math.ceil(pts.length / maxN), out = [];
  for (let i = 0; i < pts.length; i += k) {
    const chunk = pts.slice(i, i + k), o = { ...chunk[chunk.length - 1] };
    for (const key of AVG_KEYS) {
      let s = 0, n = 0;
      for (const p of chunk) if (Number.isFinite(p[key])) { s += p[key]; n++; }
      o[key] = n ? s / n : NaN;
    }
    o.t = (chunk[0].t + chunk[chunk.length - 1].t) / 2;
    out.push(o);
  }
  return out;
}
function niceTicks(lo, hi, n) {
  if (hi - lo < 1e-9) hi = lo + 1;
  const raw = (hi - lo) / (n - 1), mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  const st = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.floor(lo / st) * st; v <= Math.ceil(hi / st) * st + st * 1e-6; v += st) out.push(+v.toFixed(6));
  return out;
}

function makeChart(hostId, height, m, label) {
  const host = document.getElementById(hostId);
  const svg = svgEl('svg', { class: 'chart', height, tabindex: 0, role: 'img', 'aria-label': `${label}. Use the left and right arrow keys to read values.` }, host);
  const c = { host, svg, height, m, w: host.clientWidth || 400 };
  c.nightG = svgEl('g', {}, svg);
  c.grid = svgEl('g', { class: 'grid' }, svg);
  c.xaxis = svgEl('g', {}, svg);
  c.body = svgEl('g', {}, svg);
  c.cross = svgEl('line', { class: 'cross', visibility: 'hidden' }, svg);
  c.over = svgEl('g', {}, svg);
  const size = () => { c.w = Math.max(200, host.clientWidth); svg.setAttribute('width', c.w); svg.setAttribute('viewBox', `0 0 ${c.w} ${height}`); chartsDirty = true; };
  new ResizeObserver(size).observe(host); size();
  svg.addEventListener('pointermove', ev => {
    if (!lastView) return;
    const r = svg.getBoundingClientRect(), pw = c.w - m.l - m.r;
    const t = lastView.t0 + (ev.clientX - r.left - m.l) / pw * (lastView.t1 - lastView.t0);
    const p = nearest(lastView.pts, t);
    if (p && p.t !== hoverT) { hoverT = p.t; hoverChart = c; chartsDirty = true; }
  });
  svg.addEventListener('pointerleave', () => { hoverT = null; chartsDirty = true; });
  svg.addEventListener('blur', () => { hoverT = null; chartsDirty = true; });
  svg.addEventListener('keydown', ev => {
    if (!lastView || !lastView.pts.length) return;
    const pts = lastView.pts;
    let i = hoverT == null ? pts.length - 1 : lowerBound(pts, hoverT);
    if (ev.key === 'ArrowLeft') i = Math.max(0, i - (ev.shiftKey ? 12 : 1));
    else if (ev.key === 'ArrowRight') i = Math.min(pts.length - 1, i + (ev.shiftKey ? 12 : 1));
    else if (ev.key === 'Escape') { hoverT = null; chartsDirty = true; return; }
    else return;
    ev.preventDefault(); hoverT = pts[i].t; hoverChart = c; chartsDirty = true;
  });
  return c;
}

const TRENDS = [
  { key: 'T', out: 'tOut', host: 'chT', unit: '°C', dec: 1, minSpan: 3, label: 'Temperature',
    band: p => [p.spT - CC.BANDS.T, p.spT + CC.BANDS.T], ref: p => p.spT, sub: p => `Target ${p.spT.toFixed(1)} °C ± ${CC.BANDS.T}` },
  { key: 'RH', out: 'rhOut', host: 'chRH', unit: '%', dec: 0, minSpan: 12, label: 'Relative humidity',
    band: p => [p.spRH - CC.BANDS.RH, p.spRH + CC.BANDS.RH], ref: p => p.spRH, sub: p => `Target ${p.spRH} % ± ${CC.BANDS.RH}` },
  { key: 'C', host: 'chC', unit: 'ppm', dec: 0, minSpan: 300, label: 'CO₂ concentration',
    band: p => [p.fanOff, p.fanOn], ref: p => p.co2Lim, sub: p => `Fan ${p.fanOff}–${p.fanOn} ppm · limit ${p.co2Lim}` },
];
for (const d of TRENDS) {
  d.c = makeChart(d.host, 160, { l: 46, r: d.out ? 58 : 12, t: 10, b: 22 }, `${d.label} trend`);
  d.c.band = svgEl('path', { class: 'band' }, d.c.body);
  d.c.ref = svgEl('path', { class: 'ref' }, d.c.body);
  if (d.out) d.c.outLine = svgEl('path', { class: 'out' }, d.c.body);
  if (d.key === 'T') d.c.coreLine = svgEl('path', { class: 'core' }, d.c.body);
  d.c.line = svgEl('path', { class: 'line' }, d.c.body);
  d.c.labels = svgEl('g', {}, d.c.body);
  d.c.dot = svgEl('circle', { class: 'dot', r: 4, visibility: 'hidden' }, d.c.over);
}
const P = makeChart('chP', 220, { l: 56, r: 84, t: 10, b: 22 }, 'Power consumption by machine, stacked');
P.areas = Object.fromEntries(['ac', 'hu', 'fan', 'li', 'ci'].map(k => [k, svgEl('path', { class: `area ${k}` }, P.body)]));
P.gap = svgEl('path', { class: 'gap' }, P.body);
P.base = svgEl('line', { class: 'base' }, P.body);
P.labels = svgEl('g', {}, P.body);

function nightShade(c, v, X) {
  const { m, height: h } = c;
  let s = '';
  const off = env.startHour * 3600, A0 = absS(v.t0), A1 = absS(v.t1);
  for (let d = Math.floor(A0 / 86400) - 1; d <= Math.floor(A1 / 86400); d++) {
    const a = Math.max(A0, d * 86400 + 19 * 3600), b = Math.min(A1, (d + 1) * 86400 + 7 * 3600);
    if (b > a) s += `<rect class="night" x="${X(a - off).toFixed(1)}" y="${m.t}" width="${(X(b - off) - X(a - off)).toFixed(1)}" height="${h - m.t - m.b}"/>`;
  }
  c.nightG.innerHTML = s;
}
function xAxis(c, v, X) {
  const { m, height: h } = c, span = v.t1 - v.t0;
  const step = [600, 1800, 3600, 7200, 10800, 14400, 21600].find(s => s >= span / 6) || 21600;
  const off = env.startHour * 3600;
  let s = '';
  for (let A = Math.ceil(absS(v.t0) / step) * step; A <= absS(v.t1) + 1e-6; A += step) s += `<text x="${X(A - off).toFixed(1)}" y="${h - 5}" text-anchor="middle">${fmtHM(A - off)}</text>`;
  s += `<line class="base" x1="${m.l}" x2="${c.w - m.r}" y1="${h - m.b}" y2="${h - m.b}"/>`;
  c.xaxis.innerHTML = s;
}
// A line with gaps where the value is NaN.
function linePath(pts, X, Y, f) {
  let d = '', pen = false;
  for (const p of pts) {
    const y = f(p);
    if (!Number.isFinite(y)) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + X(p.t).toFixed(1) + ',' + Y(y).toFixed(1); pen = true;
  }
  return d;
}
function areaPath(pts, X, Y, lo, hi) {
  if (pts.length < 2) return '';
  let d = linePath(pts, X, Y, hi);
  for (let i = pts.length - 1; i >= 0; i--) d += 'L' + X(pts[i].t).toFixed(1) + ',' + Y(lo(pts[i])).toFixed(1);
  return d + 'Z';
}
function crosshair(c, X, show) {
  if (!show) { c.cross.setAttribute('visibility', 'hidden'); return; }
  const x = X(hoverT).toFixed(1);
  for (const [k, val] of [['x1', x], ['x2', x], ['y1', c.m.t], ['y2', c.height - c.m.b]]) c.cross.setAttribute(k, val);
  c.cross.setAttribute('visibility', 'visible');
}
const lastFinite = (pts, key) => { for (let i = pts.length - 1; i >= 0; i--) if (Number.isFinite(pts[i][key])) return pts[i]; return null; };

function drawTrend(d, v, hp) {
  const c = d.c, { m, w, height: h } = c, pts = v.pts;
  if (!pts.length) return;
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  let lo = Infinity, hi = -Infinity;
  const take = x => { if (Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } };
  for (const p of pts) { const [b0, b1] = d.band(p); take(p[d.key]); take(b0); take(b1); take(d.ref(p)); if (d.out) take(p[d.out]); if (d.key === 'T') take(p.core); }
  if (!Number.isFinite(lo)) return;
  const mid = (lo + hi) / 2, half = Math.max(hi - lo, d.minSpan) / 2;
  lo = Math.min(lo, mid - half); hi = Math.max(hi, mid + half);
  const pad = (hi - lo) * 0.05, ticks = niceTicks(lo - pad, hi + pad, 4), y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = t => m.l + (t - v.t0) / (v.t1 - v.t0) * pw, Y = val => m.t + (1 - (val - y0) / (y1 - y0)) * ph;
  nightShade(c, v, X);
  c.grid.innerHTML = ticks.map(tk => `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(tk).toFixed(1)}" y2="${Y(tk).toFixed(1)}"/><text x="${m.l - 6}" y="${(Y(tk) + 4).toFixed(1)}" text-anchor="end">${Number.isInteger(tk) ? tk : tk.toFixed(1)}</text>`).join('');
  xAxis(c, v, X);
  c.band.setAttribute('d', areaPath(pts, X, Y, p => d.band(p)[0], p => d.band(p)[1]));
  c.ref.setAttribute('d', linePath(pts, X, Y, d.ref));
  c.line.setAttribute('d', linePath(pts, X, Y, p => p[d.key]));
  c.labels.replaceChildren();
  if (d.out) {
    c.outLine.setAttribute('d', linePath(pts, X, Y, p => p[d.out]));
    if (c.coreLine) c.coreLine.setAttribute('d', linePath(pts, X, Y, p => p.core));
    // direct labels at the live edge, pushed apart if they collide
    const pIn = lastFinite(pts, d.key), pOut = lastFinite(pts, d.out), xEnd = X(pts[pts.length - 1].t) + 6;
    if (pIn && pOut) {
      let yIn = Y(pIn[d.key]), yOut = Y(pOut[d.out]);
      if (Math.abs(yIn - yOut) < 13) { const mid2 = (yIn + yOut) / 2, s = yIn <= yOut ? -1 : 1; yIn = mid2 + s * 6.5; yOut = mid2 - s * 6.5; }
      for (const [txt, y] of [['Room', yIn], ['Outdoor', yOut]]) { const t = svgEl('text', { class: 'slabel', x: xEnd, y: (y + 4).toFixed(1) }, c.labels); t.textContent = txt; }
    }
  }
  crosshair(c, X, !!hp);
  if (hp && Number.isFinite(hp[d.key])) { c.dot.setAttribute('cx', X(hp.t).toFixed(1)); c.dot.setAttribute('cy', Y(hp[d.key]).toFixed(1)); c.dot.setAttribute('visibility', 'visible'); }
  else c.dot.setAttribute('visibility', 'hidden');
  const p = hp || pts[pts.length - 1];
  const rv = document.getElementById('rv' + d.key);
  const sm = document.createElement('small'); sm.textContent = d.unit;
  rv.replaceChildren(document.createTextNode(fmtNum(p[d.key], d.dec)), sm);
  const outTxt = d.out ? ` · outdoor ${fmtNum(p[d.out], d.dec)} ${d.unit}` : '';
  set('sub' + d.key, hp ? `${fmtStamp(hp.t)}${outTxt}` : d.sub(p) + outTxt);
  paintChip(document.getElementById('chip' + d.key), ctl.status(d.key === 'C' ? 'CO2' : d.key));
}

const DEV = [['ac', 'AC'], ['hu', 'Fogger'], ['fan', 'Fan'], ['li', 'Lights'], ['ci', 'Circ.']];
const sumTo = (p, n) => DEV.slice(0, n).reduce((a, [k]) => a + (p[k] || 0), 0);
function drawPower(v, hp) {
  const c = P, { m, w, height: h } = c, pts = v.pts;
  if (!pts.length) return;
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  let max = 100; for (const p of pts) max = Math.max(max, sumTo(p, 5));
  const ticks = niceTicks(0, max * 1.05, 4), y1 = ticks[ticks.length - 1];
  const X = t => m.l + (t - v.t0) / (v.t1 - v.t0) * pw, Y = val => m.t + (1 - val / y1) * ph;
  nightShade(c, v, X);
  c.grid.innerHTML = ticks.map(tk => `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(tk).toFixed(1)}" y2="${Y(tk).toFixed(1)}"/><text x="${m.l - 6}" y="${(Y(tk) + 4).toFixed(1)}" text-anchor="end">${tk >= 1000 ? (tk / 1000) + ' kW' : tk + ' W'}</text>`).join('');
  xAxis(c, v, X);
  const lo = {}, hi = {};
  DEV.forEach(([k], i) => { lo[k] = p => sumTo(p, i); hi[k] = p => sumTo(p, i + 1); });
  for (const [k] of DEV) c.areas[k].setAttribute('d', areaPath(pts, X, Y, lo[k], hi[k]));
  c.gap.setAttribute('d', pts.length > 1 ? DEV.slice(0, 4).map(([k]) => linePath(pts, X, Y, hi[k])).join('') : '');
  for (const [k, val] of [['x1', m.l], ['x2', w - m.r], ['y1', Y(0)], ['y2', Y(0)]]) c.base.setAttribute(k, val);
  c.labels.replaceChildren();
  const last = pts[pts.length - 1];
  for (const [k, name] of DEV) {
    const yT = Y(hi[k](last)), yB = Y(lo[k](last));
    if (yB - yT >= 14) { const t = svgEl('text', { class: 'dlabel', x: X(last.t) + 6, y: ((yT + yB) / 2 + 4).toFixed(1) }, c.labels); t.textContent = name; }
  }
  crosshair(c, X, !!hp);
  const p = hp || last, total = sumTo(p, 5);
  const sm = document.createElement('small'); sm.textContent = total >= 1000 ? 'kW' : 'W';
  $('#rvP').replaceChildren(document.createTextNode(watts(total).replace(/ k?W$/, '')), sm);
  set('lgAc', watts(p.ac)); set('lgHu', watts(p.hu)); set('lgFan', watts(p.fan)); set('lgLi', watts(p.li || 0)); set('lgCi', watts(p.ci || 0));
  const tt = $('#ttP');
  if (hp && hoverChart === P) {
    const rows = [document.createElement('div')];
    rows[0].className = 'tt-time'; rows[0].textContent = fmtStamp(hp.t);
    const row = (key, val, name, cls) => {
      const r = document.createElement('div'); r.className = 'row' + (cls ? ' ' + cls : '');
      const i = document.createElement('i'); if (key) i.style.setProperty('--key', `var(--s-${key})`); else i.style.visibility = 'hidden';
      const b = document.createElement('b'); b.textContent = watts(val);
      const s = document.createElement('span'); s.textContent = name;
      r.append(i, b, s); rows.push(r);
    };
    row('ci', hp.ci || 0, 'Circulation'); row('li', hp.li || 0, 'Lights'); row('fan', hp.fan, 'Exhaust fan'); row('hu', hp.hu, 'Fogger'); row('ac', hp.ac, 'Air conditioner'); row(null, total, 'Total', 'total');
    tt.replaceChildren(...rows);
    tt.style.display = 'block';
    const x = X(hp.t) + P.host.offsetLeft;
    tt.style.left = `${x + 14 + tt.offsetWidth > P.host.offsetLeft + w ? x - 14 - tt.offsetWidth : x + 14}px`;
    tt.style.top = `${P.host.offsetTop + 8}px`;
  } else tt.style.display = 'none';
}

function renderTable(raw) {
  const rows = raw.slice(-15).reverse().map(p => {
    const tr = document.createElement('tr');
    for (const val of [fmtStamp(p.t), fmtNum(p.T, 1), fmtNum(p.RH, 0), fmtNum(p.C, 0), fmtNum(p.tOut, 1), fmtNum(p.rhOut, 0), fmtNum(p.core, 1), fmtNum(p.vpd, 2), fmtNum(p.acSet, 1), Math.round(p.ac), Math.round(p.hu), Math.round(p.fan)]) tr.append(cell('td', String(val)));
    return tr;
  });
  $('#tbody').replaceChildren(...rows);
}

function drawCharts() {
  chartsDirty = false;
  const now = reading.t, t0 = Math.max(0, now - windowS), t1 = t0 + windowS;
  const raw = samples.slice(lowerBound(samples, t0));
  const v = lastView = { t0, t1, pts: aggregate(raw, 700) };
  if (hoverT != null && hoverT < t0) hoverT = null;
  const hp = hoverT == null ? null : nearest(v.pts, hoverT);
  for (const d of TRENDS) drawTrend(d, v, hp);
  drawPower(v, hp);
  if (!$('#tableCard').hidden) renderTable(raw);
}

// ---------------- Mimic animation (simulation view) ----------------
const mist = [], bubbles = [], caps = [];
for (let i = 0; i < 16; i++) mist.push({ ph: i / 16, dx: (Math.random() - 0.5) * 14, el: svgEl('circle', { class: 'mist', r: 3 }, $('#mist')) });
for (let i = 0; i < 14; i++) bubbles.push({ ph: i / 14, dx: Math.random() * 136, el: svgEl('circle', { class: 'bubble', r: 2.5 }, $('#bubbles')) });
(() => {
  const g = $('#bags');
  for (const y0 of [264, 314]) for (let i = 0; i < 5; i++) {
    const x = 186 + i * 29;
    svgEl('rect', { class: 'bag', x, y: y0, width: 24, height: 36, rx: 7 }, g);
    for (const [cx, cy, side] of [[x + 2, y0 + 12, -1], [x + 22, y0 + 24, 1]]) {
      const outer = svgEl('g', { transform: `translate(${cx} ${cy})` }, g);
      const c = svgEl('g', { class: 'cap' }, outer);
      svgEl('ellipse', { cx: 3 * side, cy: 0, rx: 7, ry: 3.6 }, c);
      svgEl('ellipse', { cx: 2 * side, cy: 5, rx: 5, ry: 2.8 }, c);
      caps.push(c);
    }
  }
})();
const paintCaps = () => { const sc = { spawn: 0, pinning: 0.35, fruiting: 1, rest: 0.12 }[cfg.stage]; for (const c of caps) c.style.transform = `scale(${sc})`; };
const anim = { fan: 0, cond: 0, acFlow: 0, fanFlow: 0 };
const acFlows = [...document.querySelectorAll('[data-flow="ac"]')];
const fanFlows = [...document.querySelectorAll('[data-flow="fan"]')];

function animateMimic(dtReal) {
  const a = sim.view().act, move = !reduceMotion.matches && !paused;
  const fanF = a.fanLevel / 3, fogF = a.huLevel / 3;
  if (move) {
    anim.fan = (anim.fan + 1080 * fanF * dtReal) % 360;
    anim.cond = (anim.cond + 720 * (a.comp ? 0.3 + a.acFrac : 0) * dtReal) % 360;
    anim.acFlow -= dtReal * 40 * (0.5 + a.acFrac);
    anim.fanFlow -= dtReal * 60 * (0.3 + fanF);
  }
  $('#fanBlades').setAttribute('transform', `rotate(${anim.fan.toFixed(1)})`);
  $('#condBlades').setAttribute('transform', `rotate(${anim.cond.toFixed(1)})`);
  // Indoor fan blows when the AC has power; the arrows are strong when the compressor runs.
  for (const f of acFlows) { f.style.opacity = !a.power ? 0 : a.comp ? 0.35 + 0.65 * a.acFrac : 0.2; f.style.strokeDashoffset = anim.acFlow; }
  for (const f of fanFlows) { f.style.opacity = fanF > 0 ? 0.35 + 0.65 * fanF : 0; f.style.strokeDashoffset = anim.fanFlow; }
  for (const p of mist) {
    if (move) { p.ph += dtReal * (0.25 + 0.5 * fogF); if (p.ph > 1) { p.ph -= 1; p.dx = (Math.random() - 0.5) * 14; } }
    p.el.setAttribute('cx', (572 + p.dx + Math.sin(p.ph * 7 + p.dx) * 4).toFixed(1));
    p.el.setAttribute('cy', (262 - p.ph * 80).toFixed(1));
    p.el.setAttribute('r', (2.5 + p.ph * 6).toFixed(1));
    p.el.style.opacity = (fogF * (1 - p.ph) * 0.7).toFixed(2);
  }
  const lpm = SIM.co2Lpm(env), co2Vis = clamp(lpm / 3, 0, 1);
  for (const b of bubbles) {
    if (move) { b.ph += dtReal * (0.3 + 0.1 * lpm); if (b.ph > 1) { b.ph -= 1; b.dx = Math.random() * 136; } }
    b.el.setAttribute('cx', (189 + b.dx + Math.sin(b.ph * 9 + b.dx) * 3).toFixed(1));
    b.el.setAttribute('cy', (258 - b.ph * 46).toFixed(1));
    b.el.style.opacity = (co2Vis * (1 - b.ph)).toFixed(2);
  }
}

// ---------------- 24 h test (copies of both parts) ----------------
function runTest(rulesOverride) {
  const cfg2 = structuredClone(cfg); Object.assign(cfg2.rules, rulesOverride);
  const sim2 = SIM.create(structuredClone(env), sim.snapshot());
  const ctl2 = CC.create(cfg2, ctl.snapshot(), null);
  const io2 = RT.simIO(sim2);
  io2.write(ctl2.state.cmd);
  let cb = null;
  const rt2 = RT.createRuntime({ io: io2, ctl: ctl2, onReading: r => { if (cb) cb(r); }, skipCurrent: true });
  const run = (secs, f) => { cb = f; for (let i = 0; i < secs; i++) { io2.advance(1); rt2.poll(); } };
  run(3600);
  const r0 = sim2.read(), s0 = { ...ctl2.state.stats }, a0 = sim2.view().acStarts;
  let n = 0, inT = 0, inRH = 0, overC = 0, rhLow = 0;
  run(86400, () => {
    const room = sim2.view();   // score the real room, not the sensors (a sensor can be faulty)
    n++;
    if (Math.abs(room.T - cfg2.spT) <= CC.BANDS.T) inT++;
    if (Math.abs(room.RH - cfg2.spRH) <= CC.BANDS.RH) inRH++;
    if (room.CO2 > cfg2.co2Lim) overC++;
    if (room.RH < cfg2.spRH - CC.BANDS.RHAlarm) rhLow++;
  });
  const r1 = sim2.read(), s1 = ctl2.state.stats, k = key => r1.kwh[key] - r0.kwh[key];
  return { ac: k('ac'), hu: k('hu'), fan: k('fan'), total: k('ac') + k('hu') + k('fan'),
    fanH: (s1.fanOnS - s0.fanOnS) / 3600, starts: s1.fanStarts - s0.fanStarts, blockedH: (s1.fanBlockedS - s0.fanBlockedS) / 3600,
    acStarts: sim2.view().acStarts - a0, acCmds: s1.acCmds - s0.acCmds,
    inT: inT / n * 100, inRH: inRH / n * 100, overMin: overC / n * 1440, rhLowMin: rhLow / n * 1440 };
}
function renderTest() {
  const tariff = input.tariff;
  const variants = [
    ['Your rules', runTest({})],
    ['AC off during purge', runTest({ acPurge: true, acAction: 'off' })],
    ['No AC rule during purge', runTest({ acPurge: false })],
    ['No humidity priority', runTest({ rhLock: false })],
  ];
  const mine = variants[0][1];
  const head = ['Rules', 'Total kWh/day', 'RM/day', 'AC kWh', 'Fogger kWh', 'Fan kWh', 'AC compressor starts', 'AC commands', 'Fan run (h)', 'Fan starts', 'Fan stopped by RH (h)', 'Temp in band', 'RH in band', 'RH low alarm', 'CO₂ over limit'];
  const sgn = v => (v > 0 ? '+' : '') + v;
  const row = (name, x) => [name,
    x === mine ? x.total.toFixed(2) : `${x.total.toFixed(2)} (${sgn((x.total - mine.total).toFixed(2))})`,
    (x.total * tariff).toFixed(2), x.ac.toFixed(2), x.hu.toFixed(2), x.fan.toFixed(2),
    String(x.acStarts), String(x.acCmds), x.fanH.toFixed(1), String(x.starts), x.blockedH.toFixed(1),
    `${x.inT.toFixed(0)} %`, `${x.inRH.toFixed(0)} %`, `${Math.round(x.rhLowMin)} min`, `${Math.round(x.overMin)} min`];
  const table = document.createElement('table');
  const thead = document.createElement('thead'), htr = document.createElement('tr');
  for (const h of head) htr.append(cell('th', h));
  thead.append(htr);
  const tbody = document.createElement('tbody');
  for (const [name, x] of variants) {
    const tr = document.createElement('tr');
    for (const c of row(name, x)) tr.append(cell('td', c));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  const note = document.createElement('p'); note.className = 'est-note';
  note.textContent = `Start: ${fmtClock(reading.t)}. The value in brackets is the difference from your rules. "In band" uses the real room values at each reading. "RH low alarm" is the time below target − ${CC.BANDS.RHAlarm} %. The AC restart energy comes from the simulation setting "Full speed after each AC start".`;
  $('#estOut').replaceChildren(table, note);
}

// ---------------- Controls: simulation ----------------
function bindRange(id, outId, fmt, apply) {
  const el = document.getElementById(id), out = document.getElementById(outId);
  const upd = () => { const v = parseFloat(el.value); apply(v); out.textContent = fmt(v); };
  el.addEventListener('input', upd); upd();
  return el;
}
const setRange = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); };
$('#inCycle').addEventListener('change', e => {
  env.dailyCycle = e.target.checked;
  $('#cycleFields').hidden = !env.dailyCycle; $('#fixedField').hidden = env.dailyCycle;
});
bindRange('inHigh', 'outHigh', v => `${v.toFixed(1)} °C`, v => { env.tHigh = v; if (env.tLow > v - 1) setRange('inLow', v - 1); });
bindRange('inLow', 'outLow', v => `${v.toFixed(1)} °C`, v => { env.tLow = v; if (env.tHigh < v + 1) setRange('inHigh', v + 1); });
bindRange('inFixed', 'outFixed', v => `${v.toFixed(1)} °C`, v => { env.tFixed = v; });
bindRange('inNightRH', 'outNightRH', v => `${v} %`, v => { env.nightRH = v; });
function paintBlocks() {
  const lpm = SIM.co2Lpm(env);
  set('hintBlocks', env.blocks === 0 ? 'The room is empty: no CO₂, heat, or water from blocks.'
    : `Together they make ${lpm.toFixed(2)} L/min of CO₂, ${Math.round(lpm * PL.resp.wPerLpm)} W of heat, and ${Math.round(lpm * PL.resp.gpsPerLpm * 3600)} g/h of water.`);
}
bindRange('inBlocks', 'outBlocks', v => v.toLocaleString('en'), v => { env.blocks = v; paintBlocks(); });
$('#inPerBlock').addEventListener('change', e => {
  env.co2PerBlock = clamp(parseFloat(e.target.value) || env.co2PerBlock, 1, 1000);
  e.target.value = env.co2PerBlock; paintBlocks();
});
$('#inPeriod').addEventListener('change', e => { env.sensorPeriod = +e.target.value; });
$('#inNoise').addEventListener('change', e => { env.noise = e.target.checked; });
for (const [id, k] of [['fT', 'T'], ['fRH', 'RH'], ['fCO2', 'CO2'], ['fOut', 'out']]) {
  document.getElementById(id).addEventListener('change', e => {
    env.faults[k] = e.target.value;
    onEvent({ t: reading.t, lvl: 'info', text: `Simulation: ${e.target.dataset.name} sensor set to "${e.target.selectedOptions[0].text}"` });
  });
}
$('#inBoost').addEventListener('change', e => { env.acStartBoostMin = clamp(parseFloat(e.target.value) || 0, 0, 30); e.target.value = env.acStartBoostMin; });

// ---------------- Controls: controller ----------------
bindRange('inSpT', 'outSpT', v => `${v.toFixed(1)} °C`, v => { cfg.spT = v; ctl && ctl.cancelRamp(); });
bindRange('inSpRH', 'outSpRH', v => `${v} %`, v => { cfg.spRH = v; ctl && ctl.cancelRamp(); paintRhAbs(); });
bindRange('inCo2Lim', 'outCo2Lim', v => `${v} ppm`, v => { cfg.co2Lim = v; ctl && ctl.cancelRamp(); if (reading) layoutLadder(); });
$('#inRoomM3').addEventListener('change', e => { cfg.roomM3 = clamp(parseFloat(e.target.value) || cfg.roomM3, 1, 100000); e.target.value = cfg.roomM3; });
bindRange('acSetIn', 'acSetOut', v => `${v.toFixed(1)} °C`, v => { cfg.manual.ac.setpoint = v; });
$('#acModeSel').addEventListener('change', e => {
  const m = cfg.manual.ac;
  m.power = e.target.value !== 'off';
  if (m.power) m.mode = e.target.value;
});
$('#huLevelSel').addEventListener('change', e => { cfg.manual.hu.level = +e.target.value; });
$('#fanLevelSel').addEventListener('change', e => { cfg.manual.fan.level = +e.target.value; });
$('#inTariff').addEventListener('input', e => { const v = parseFloat(e.target.value); input.tariff = isFinite(v) && v >= 0 ? v : 0; });
$('#ackBtn').addEventListener('click', () => { ctl.ack(); onEvent({ t: reading.t, lvl: 'info', text: 'All alarms acknowledged' }); updateUi(); });

// ---------------- Stage program (2.1) ----------------
const STAGE_SHORT = { spawn: 'Spawn run', pinning: 'Pinning', fruiting: 'Fruiting', rest: 'Rest' };
function renderStageSeg() {
  const seg = $('#stageSeg');
  seg.replaceChildren(...CC.FARM_TYPES[cfg.farmType].stages.map(st => {
    const b = document.createElement('button'); b.dataset.stage = st; b.textContent = STAGE_SHORT[st];
    b.setAttribute('aria-pressed', String(st === cfg.stage)); return b;
  }));
  const full = cfg.farmType === 'full';
  $('#pgDaysSpawnL').hidden = !full; $('#pgDaysPinL').hidden = !full;
}
// Show the controller's present targets in the sliders (they move during a ramp). No input event: no ramp stop.
function syncTargets() {
  for (const [id, out, v, fmt] of [['inSpT', 'outSpT', cfg.spT, x => `${x.toFixed(1)} °C`], ['inSpRH', 'outSpRH', cfg.spRH, x => `${x} %`], ['inCo2Lim', 'outCo2Lim', cfg.co2Lim, x => `${x} ppm`]]) {
    const el = document.getElementById(id);
    if (document.activeElement !== el && +el.value !== v) el.value = v;
    set(out, fmt(v));
  }
}
let lastStage = '';
function paintProgram() {
  const P = ctl.programStatus(reading.t), H = cfg.program.harvest;
  const key = `${cfg.farmType}|${cfg.stage}`;
  if (key !== lastStage) { lastStage = key; renderStageSeg(); paintCaps(); $('#inFarm').value = cfg.farmType; $('#inCrop').value = cfg.crop; }
  const days = P.days ? ` · day ${P.day} of ${P.days}` : '';
  const flush = cfg.stage === 'fruiting' || cfg.stage === 'rest' ? ` · flush ${P.flush} of ${P.flushes}` : '';
  set('progStatus', `${CC.STAGES[cfg.stage]}${days}${flush}${P.auto ? ' · automatic' : ''}${P.done ? ' · last flush done: replace the blocks' : ''}`);
  set('progRamp', P.ramp ? `Targets moving to ${P.ramp.to.spT} °C, ${P.ramp.to.spRH} %, ${P.ramp.to.co2Lim} ppm: ${(P.ramp.leftS / 3600).toFixed(1)} h left.` : '');
  let hv = '';
  if (cfg.stage === 'fruiting' && H.on) {
    if (P.harvestOn) hv = `Harvest window now: fog off until ${CC.hhmm(P.harvestWin.to)}.`;
    else if (H.times.length) {
      const m = reading.hour * 60, next = H.times.map(at => ({ at, wait: ((at - H.dryMin - m) % 1440 + 1440) % 1440 })).sort((x, y) => x.wait - y.wait)[0];
      hv = `Next harvest ${CC.hhmm(next.at)}: fog off from ${CC.hhmm(next.at - H.dryMin)}.`;
    }
  }
  set('progHarvest', hv);
  if (P.ramp) { syncTargets(); fillRulesQuiet(); }
}
function fillProgram() {
  const P = cfg.program, H = P.harvest;
  $('#pgAuto').checked = P.auto; $('#pgHarvest').checked = H.on;
  for (const [id, v] of [['pgDaysSpawn', P.days.spawn], ['pgDaysPin', P.days.pinning], ['pgDaysFruit', P.days.fruiting], ['pgDaysRest', P.days.rest],
    ['pgFlushes', P.flushes], ['pgRampH', P.rampH], ['pgDry', H.dryMin], ['pgPick', H.pickMin], ['pgFloor', H.floorDrop]]) document.getElementById(id).value = v;
  $('#pgTimes').value = H.times.map(CC.hhmm).join(', ');
}
$('#pgAuto').addEventListener('change', e => { cfg.program.auto = e.target.checked; });
$('#pgHarvest').addEventListener('change', e => { cfg.program.harvest.on = e.target.checked; });
for (const [id, setter, lo, hi] of [
  ['pgDaysSpawn', v => { cfg.program.days.spawn = v; }, 1, 90], ['pgDaysPin', v => { cfg.program.days.pinning = v; }, 1, 30],
  ['pgDaysFruit', v => { cfg.program.days.fruiting = v; }, 1, 60], ['pgDaysRest', v => { cfg.program.days.rest = v; }, 1, 60],
  ['pgFlushes', v => { cfg.program.flushes = Math.round(v); }, 1, 10], ['pgRampH', v => { cfg.program.rampH = v; }, 0, 48],
  ['pgDry', v => { cfg.program.harvest.dryMin = v; }, 0, 240], ['pgPick', v => { cfg.program.harvest.pickMin = v; }, 0, 240],
  ['pgFloor', v => { cfg.program.harvest.floorDrop = v; }, 1, 15]]) {
  document.getElementById(id).addEventListener('change', e => { const v = clamp(parseFloat(e.target.value) || lo, lo, hi); e.target.value = v; setter(v); });
}
$('#pgTimes').addEventListener('change', e => {
  const times = e.target.value.split(/[,\s]+/).map(x => /^(\d{1,2}):(\d{2})$/.exec(x)).filter(Boolean)
    .map(m => clamp(+m[1], 0, 23) * 60 + clamp(+m[2], 0, 59)).sort((a, b) => a - b);
  cfg.program.harvest.times = times;
  e.target.value = times.map(CC.hhmm).join(', ');
});
$('#inFarm').addEventListener('change', e => { ctl.setFarmType(e.target.value, reading.t); updateUi(); });
$('#inCrop').addEventListener('change', e => { ctl.setCrop(e.target.value, reading.t); updateUi(); scheduleCropCheck(); });
$('#stageSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ctl.setStage(b.dataset.stage, reading.t);
  updateUi(); scheduleCropCheck();
});

// Auto / manual with bumpless transfer: manual starts from the present command.
document.querySelectorAll('.faceplate .seg').forEach(seg => {
  const dev = seg.dataset.dev;
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const auto = b.dataset.auto === '1', m = cfg.manual[dev];
    if (auto === m.auto) return;
    seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (!auto) {
      const c = ctl.state.cmd;
      if (dev === 'ac') {
        m.power = c.ac.power; m.mode = c.ac.mode; m.setpoint = c.ac.setpoint;
        $('#acModeSel').value = m.power ? m.mode : 'off'; setRange('acSetIn', m.setpoint);
      } else if (dev === 'lights' || dev === 'circ') { m.on = c[dev].on; document.getElementById(dev === 'lights' ? 'liOn' : 'ciOn').checked = m.on; }
      else { m.level = c[dev].level; document.getElementById(dev + 'LevelSel').value = String(m.level); }
    }
    m.auto = auto;
    document.getElementById(dev + 'Manual').disabled = auto;
    onEvent({ t: reading.t, lvl: 'info', text: `${{ ac: 'Air conditioner', hu: 'Fogger', fan: 'Exhaust fan', lights: 'Lights', circ: 'Circulation fan' }[dev]} set to ${auto ? 'auto' : 'manual'}` });
  });
});

// ---------------- Phase 2 controls ----------------
const selBind = (id, get, setv) => { const el = document.getElementById(id); el.value = String(get()); el.addEventListener('change', e => setv(e.target.value)); };
// simulation
selBind('inBlockStage', () => (blockFollow ? 'follow' : env.blockStage), v => { blockFollow = v === 'follow'; if (!blockFollow) env.blockStage = v; });
$('#inProbe').addEventListener('change', e => { env.probe = e.target.checked; });
selBind('inSensQ', () => env.sensorQuality, v => { env.sensorQuality = v; });
selBind('inSensAt', () => env.sensorAt, v => { env.sensorAt = v; });
selBind('inSens2', () => env.sensor2At, v => { env.sensor2At = v; });
selBind('inVent', () => env.vent, v => { env.vent = v; });
selBind('inInlet', () => env.inletAt, v => { env.inletAt = v; });
selBind('inOutlet', () => env.exhaustAt, v => { env.exhaustAt = v; });
$('#inDoors').addEventListener('change', e => { env.harvestDoors = e.target.checked; });
$('#inRandWx').addEventListener('change', e => { env.randomWeather = e.target.checked; });
document.querySelectorAll('[data-dist]').forEach(b => b.addEventListener('click', () => {
  sim.trigger(b.dataset.dist);
  onEvent({ t: reading.t, lvl: 'info', text: `Simulation: ${b.textContent.toLowerCase()}` });
}));
// controller
selBind('inSensMode', () => cfg.sensorMode, v => { cfg.sensorMode = v; });
const LP = cfg.program.lights;
$('#pgLightOn').value = CC.hhmm(LP.on); $('#pgLightOff').value = CC.hhmm(LP.off);
for (const [id, key] of [['pgLightOn', 'on'], ['pgLightOff', 'off']]) {
  document.getElementById(id).addEventListener('change', e => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(e.target.value.trim());
    if (m) LP[key] = clamp(+m[1], 0, 23) * 60 + clamp(+m[2], 0, 59);
    e.target.value = CC.hhmm(LP[key]);
  });
}
for (const [id, st] of [['pgLSpawn', 'spawn'], ['pgLPin', 'pinning'], ['pgLFruit', 'fruiting'], ['pgLRest', 'rest']]) {
  const el = document.getElementById(id); el.checked = LP.stages[st]; el.addEventListener('change', e => { LP.stages[st] = e.target.checked; });
}
for (const [id, k] of [['oT', 'T'], ['oRH', 'RH'], ['oCO2', 'CO2']]) {
  const el = document.getElementById(id); el.value = cfg.offsets[k];
  el.addEventListener('change', e => { cfg.offsets[k] = parseFloat(e.target.value) || 0; e.target.value = cfg.offsets[k]; onEvent({ t: reading.t, lvl: 'info', text: `Sensor correction ${k}: ${cfg.offsets[k] >= 0 ? '+' : ''}${cfg.offsets[k]}` }); });
}
$('#liOn').addEventListener('change', e => { cfg.manual.lights.on = e.target.checked; });
$('#ciOn').addEventListener('change', e => { cfg.manual.circ.on = e.target.checked; });

// ---------------- Calibration (2.13) ----------------
const CAL = window.ClimateCalib;
let calRows = null, calFit = null, calBase = null;
let calApplied = null;          // the last applied calibration, for the room capacity check
const calParamsNow = () => CAL.paramsOf(env);
function calLogFromSamples() {
  const t1 = reading.t, t0 = Math.max(0, t1 - 86400);
  let last = -Infinity;
  const rows = [];
  for (const p of samples) {
    if (p.t < t0 || p.t - last < 60) continue;      // 1 row per minute
    last = p.t;
    rows.push({ t: p.t - t0, T: p.T, RH: p.RH, CO2: p.C, tOut: p.tOut, rhOut: p.rhOut, ...p.cmd });
  }
  return rows;
}
function calRender() {
  const now = calParamsNow(), fitP = calFit && calFit.params;
  $('#calParams').replaceChildren(...Object.entries(CAL.PARAMS).map(([k, P]) => {
    const tr = document.createElement('tr');
    tr.append(cell('td', P.label), cell('td', now[k].toFixed(k === 'infAch' ? 2 : 1)), cell('td', fitP ? fitP[k].toFixed(k === 'infAch' ? 2 : 1) : '–'));
    return tr;
  }));
  const fe = x => `${x.rmse.T.toFixed(2)} °C / ${x.rmse.RH.toFixed(1)} % / ${x.rmse.CO2.toFixed(0)} ppm`;
  set('calErr0', calBase ? fe(calBase) : '–');
  set('calErr1', calFit ? fe(calFit.result) : '–');
  const host = $('#calCharts'); host.replaceChildren();
  if (!calRows || !calBase) return;
  for (const [k, name, dec] of [['T', 'Temperature °C', 1], ['RH', 'Humidity %', 0], ['CO2', 'CO₂ ppm', 0]]) {
    const box = document.createElement('div'); box.append(cell('h4', name));
    const w = Math.max(200, (host.clientWidth || 900) / 3 - 12), h = 120, m = { l: 36, r: 6, t: 6, b: 16 };
    const series = [['meas', calRows.map(r => [r.t, r[k]])], ['simb', calBase.series.map(r => [r.t, r[k]])]];
    if (calFit) series.push(['sima', calFit.result.series.map(r => [r.t, r[k]])]);
    let lo = Infinity, hi = -Infinity, tMax = calRows[calRows.length - 1].t || 1;
    for (const [, pts] of series) for (const [, y] of pts) if (Number.isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const ticks = niceTicks(lo, hi, 3), y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const X = t => m.l + t / tMax * (w - m.l - m.r), Y = y => m.t + (1 - (y - y0) / (y1 - y0 || 1)) * (h - m.t - m.b);
    const svg = svgEl('svg', { class: 'chart', width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': `${name}: measured and simulated` });
    for (const tk of ticks) { svgEl('line', { x1: m.l, x2: w - m.r, y1: Y(tk), y2: Y(tk), class: 'gridl' }, svg); const tx = svgEl('text', { x: m.l - 4, y: Y(tk) + 4, 'text-anchor': 'end' }, svg); tx.textContent = Number.isInteger(tk) ? tk : tk.toFixed(1); }
    for (const [cls, pts] of series) {
      let dd = '', pen = false;
      for (const [t, y] of pts) { if (!Number.isFinite(y)) { pen = false; continue; } dd += (pen ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(y).toFixed(1); pen = true; }
      svgEl('path', { d: dd, class: cls }, svg);
    }
    box.append(svg); host.append(box);
  }
  const key = document.createElement('div'); key.className = 'cal-key';
  key.innerHTML = '<span><i></i>Measured</span><span><i class="b"></i>Simulation now</span>' + (calFit ? '<span><i class="a"></i>Simulation, fitted</span>' : '');
  host.append(key);
}
function calLoad(rows, label) {
  calRows = rows; calFit = null;
  try { calBase = CAL.replay(calRows, env, calParamsNow()); }
  catch (err) { set('calMsg', err.message); return; }
  $('#calFit').disabled = false; $('#calApply').disabled = true;
  set('calMsg', `${label}: ${rows.length} rows, ${(rows[rows.length - 1].t / 3600).toFixed(1)} h.`);
  calRender();
}
$('#calFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(txt => { try { calLoad(CAL.parseCsv(txt), f.name); } catch (err) { set('calMsg', `The file cannot be used: ${err.message}`); } });
});
$('#calSample').addEventListener('click', () => {
  const rows = calLogFromSamples();
  if (rows.length < 60) { set('calMsg', 'Run the simulation for 1 h or more first.'); return; }
  const blob = new Blob([CAL.toCsv(rows)], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sample-room-log.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  calLoad(rows, 'Sample log from the simulation');
});
$('#calFit').addEventListener('click', e => {
  const btn = e.target; btn.disabled = true; set('calMsg', 'Fitting… (this takes a few seconds)');
  CAL.fitAsync(calRows, env, calParamsNow(), p => set('calMsg', `Fitting: run ${p.evals} of up to ${p.maxEval}, error score ${p.score.toFixed(2)}…`)).then(res => {
    calFit = res;
    btn.disabled = false; $('#calApply').disabled = false;
    set('calMsg', `Fit done after ${calFit.evals} simulation runs. The air leakage is the least certain value.`);
    calRender();
  });
});
$('#calApply').addEventListener('click', () => {
  if (!calFit) return;
  const P = calFit.params;
  env.room = { ...(env.room || {}), ua: P.ua, infAch: P.infAch, moistBuffer: P.moistBuffer };
  env.co2PerBlock = Math.round(P.co2PerBlock); $('#inPerBlock').value = env.co2PerBlock; paintBlocks();
  calApplied = { ua: P.ua, infAch: P.infAch, moistBuffer: P.moistBuffer, co2PerBlock: env.co2PerBlock, rmse: calFit.result.rmse, date: new Date().toISOString() };
  onEvent({ t: reading.t, lvl: 'info', text: `Simulation calibrated: heat loss ${P.ua.toFixed(0)} W/K, leakage ${P.infAch.toFixed(2)}/h, moisture buffer ${P.moistBuffer.toFixed(1)}, CO₂ ${env.co2PerBlock} mL/h per block` });
  calBase = CAL.replay(calRows, env, calParamsNow()); calFit = null; $('#calApply').disabled = true;
  set('calMsg', 'The simulation now uses the fitted values.'); calRender();
});

// ---------------- Crop check: can this room hold the crop in the present weather? ----------------
// A 24 h copy of the simulation with the stage targets. It warns before the grower starts the crop.
let cropCheckTimer = null;
function scheduleCropCheck() { clearTimeout(cropCheckTimer); set('cropCheck', 'Checking the room for this crop…'); cropCheckTimer = setTimeout(checkCrop, 60); }
function checkCrop() {
  const cfg2 = structuredClone(cfg); CC.applyProfile(cfg2);
  const sim2 = SIM.create(structuredClone(env), sim.snapshot()), ctl2 = CC.create(cfg2, ctl.snapshot(), null);
  ctl2.state.stage.ramp = null;
  const io2 = RT.simIO(sim2); io2.write(ctl2.state.cmd);
  let hi = -Infinity, lo = Infinity, n = 0, inT = 0, above = 0, below = 0;
  const rt2 = RT.createRuntime({ io: io2, ctl: ctl2, skipCurrent: true, onReading: r => {
    if (r.t - sim.view().t < 6 * 3600) return;           // 6 h to settle
    const T = sim2.view().T; hi = Math.max(hi, T); lo = Math.min(lo, T); n++;
    if (Math.abs(T - cfg2.spT) <= CC.BANDS.T) inT++; else if (T > cfg2.spT) above++; else below++;
  } });
  for (let i = 0; i < 30 * 3600; i++) { io2.advance(1); rt2.poll(); }
  const el = $('#cropCheck'), name = `${CC.CROPS[cfg2.crop].name}, ${CC.STAGES[cfg2.stage].toLowerCase()}`;
  // Warn only when more than 10 % of the day is out of band (a short dip is no reason).
  if (above / n > 0.1) { el.dataset.lvl = 'warning'; set('cropCheck', `Check: in the present weather, the room is too warm for ${Math.round(above / n * 24)} h a day (up to ${hi.toFixed(1)} °C, target ${cfg2.spT} °C). The AC is too small for ${name} in this weather.`); }
  else if (below / n > 0.1) { el.dataset.lvl = 'warning'; set('cropCheck', `Check: in the present weather, the room is too cold for ${Math.round(below / n * 24)} h a day (down to ${lo.toFixed(1)} °C, target ${cfg2.spT} °C). The AC cannot heat enough for ${name}.`); }
  else { el.dataset.lvl = 'good'; set('cropCheck', `Check: the room holds ${name} at ${cfg2.spT} °C in the present weather (${Math.round(inT / n * 100)} % of a simulated day in band).`); }
}

// ---------------- Room capacity ----------------
// Rooms are kept in this browser (localStorage). Settings storage (work item 3.1) should use the same
// "mushroom-farm." key prefix. Spec: docs/superpowers/specs/2026-10-07-room-capacity-design.md
const CAPY = window.ClimateCapacity;
const ROOMS_KEY = 'mushroom-farm.rooms.v1';
let rooms = loadRooms(), roomIdx = 0, capBusy = false;
function loadRooms() {
  try { const x = JSON.parse(localStorage.getItem(ROOMS_KEY)); return Array.isArray(x && x.rooms) ? x.rooms : []; } catch { return []; }
}
function saveRooms() {
  try { localStorage.setItem(ROOMS_KEY, JSON.stringify({ version: 1, rooms })); }
  catch { set('capMsg', 'The browser did not save the rooms (storage full or blocked).'); }
}
const curRoom = () => rooms[roomIdx] || null;
const nf = n => Math.round(n).toLocaleString('en');
const cropName = k => (CC.CROPS[k] ? CC.CROPS[k].name : k);
const roomChanged = r => { r.report = null; saveRooms(); renderReport(); renderFarm(); };
function renderRooms() {
  const sel = $('#capRoom');
  sel.replaceChildren(...rooms.map((r, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = r.name; return o; }));
  if (!rooms.length) { const o = document.createElement('option'); o.textContent = 'No rooms yet'; o.disabled = true; sel.append(o); }
  roomIdx = clamp(roomIdx, 0, Math.max(0, rooms.length - 1));
  if (rooms.length) sel.value = String(roomIdx);
  const r = curRoom();
  set('capRoomInfo', !r ? '' : r.calib ? `${r.volume} m³ · calibrated ${r.calib.date ? r.calib.date.slice(0, 10) : '(no date)'}` : `${r.volume} m³ · not calibrated (typical values)`);
  $('#capDelete').disabled = $('#capRun').disabled = $('#capAdd').disabled = !r;
  renderMix(); renderReport(); renderFarm();
}
function renderMix() {
  const r = curRoom(), body = $('#capMix');
  if (!r) { body.replaceChildren(); return; }
  const td = x => { const c = document.createElement('td'); c.append(x); return c; };
  const num = (val, label, apply) => {
    const el = document.createElement('input'); el.type = 'number'; el.min = '0'; el.step = '1'; el.value = val ?? ''; el.setAttribute('aria-label', label);
    el.addEventListener('change', () => { apply(el.value === '' ? null : Math.max(0, Math.round(+el.value))); roomChanged(r); });
    return el;
  };
  body.replaceChildren(...r.mix.map((m, i) => {
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Mushroom');
    for (const [k, c] of Object.entries(CC.CROPS)) { if (!c.range) continue; const o = document.createElement('option'); o.value = k; o.textContent = c.name; sel.append(o); }
    sel.value = m.crop;
    sel.addEventListener('change', () => { m.crop = sel.value; roomChanged(r); });
    const del = document.createElement('button'); del.className = 'btn'; del.textContent = 'Remove'; del.setAttribute('aria-label', `Remove ${cropName(m.crop)}`);
    del.addEventListener('click', () => { r.mix.splice(i, 1); renderMix(); roomChanged(r); });
    const tr = document.createElement('tr');
    tr.append(td(sel), td(num(m.blocks, 'Blocks', v => { m.blocks = v || 0; })), td(num(m.co2PerBlock, 'CO₂ per block, mL/h', v => { m.co2PerBlock = v || undefined; })), td(del));
    return tr;
  }));
}
const VERDICT_CHIP = {
  impossible: { lvl: 'critical', icon: '◆', text: 'Impossible' },
  'too-dense': { lvl: 'serious', icon: '▲', text: 'Too dense' },
  tight: { lvl: 'warning', icon: '▲', text: 'Tight' },
  good: { lvl: 'good', icon: '✓', text: 'Good' },
  'too-empty': { lvl: 'warning', icon: '▼', text: 'Too empty' },
};
const LIMIT_WORD = { fan: 'the fan (fresh air for CO₂)', ac: 'the AC (heat)', fog: 'the fogger (water)' };
function verdictText(rep) {
  const cap = rep.capacity, pct = rep.utilisation == null ? '' : ` (${Math.round(rep.utilisation)} %)`;
  const holds = cap ? `Holds ${cap.settled ? '' : 'at least '}${nf(cap.max)} blocks` : '';
  switch (rep.verdict) {
    case 'impossible': return rep.why || 'No size of this mix passes on all design days, even with almost no blocks.';
    case 'too-dense': return `${holds}; you plan ${nf(rep.planned)}${pct}.`;
    case 'tight': return `${holds}; you plan ${nf(rep.planned)}${pct}. It works, but there is no margin for a hotter week than the design days.`;
    case 'good': return `${holds}; you plan ${nf(rep.planned)}${pct}.`;
    case 'too-empty': return rep.why === 'wet'
      ? `Below about ${nf(cap.min)} blocks the room is too wet (near saturation); you plan ${nf(rep.planned)}. ${holds}.`
      : `You use ${Math.round(rep.utilisation)} % of the room. ${holds}; you plan ${nf(rep.planned)}.`;
    default: return '';
  }
}
function renderReport() {
  const host = $('#capReport'), r = curRoom(), rep = r && r.report;
  host.replaceChildren();
  if (!rep) return;
  const p = (txt, cls) => { const e = document.createElement('p'); e.textContent = txt; if (cls) e.className = cls; host.append(e); return e; };
  const chip = document.createElement('span'); chip.className = 'chip'; paintChip(chip, VERDICT_CHIP[rep.verdict]);
  const head = document.createElement('p'); head.append(chip, ` ${verdictText(rep)}`); host.append(head);
  for (const w of rep.warnings || []) p(w, 'warn');
  if (!rep.capacity) return;                                   // no common targets: nothing was simulated
  if (rep.utilisation != null) {
    const bar = document.createElement('div'); bar.className = 'cap-util'; bar.dataset.lvl = VERDICT_CHIP[rep.verdict].lvl;
    const fill = document.createElement('span'); fill.style.width = `${clamp(rep.utilisation, 0, 100)}%`; bar.append(fill); host.append(bar);
  }
  const t = rep.targets;
  p(`Targets: ${t.spT} °C, ${t.spRH} % RH, CO₂ limit ${nf(t.co2Lim)} ppm (${cropName(t.crop)} sets the CO₂ limit).`);
  if (rep.perCrop.length > 1 && rep.capacity.max) p(`Capacity in the same mix: ${rep.perCrop.map(c => `${nf(c.max)} ${cropName(c.crop)}`).join(' + ')}.`);
  if (rep.capacity.min && rep.why !== 'wet') p(`Needs at least about ${nf(rep.capacity.min)} blocks: below that the room gets too wet (near saturation).`);
  if (rep.limit.length) p(`Limit: ${rep.limit.map(l => `${l.fails.join(', ')} on the ${l.day.toLowerCase()} day`).join('; ')}.`);
  if (rep.energy && rep.energy.rmPerBlockCycle != null) p(`Energy: ${rep.energy.kwhDay.toFixed(1)} kWh per day, RM ${rep.energy.rmPerBlockCycle.toFixed(2)} per block per cycle (${rep.energy.cycleDays} days at RM ${rep.energy.tariff.toFixed(2)}/kWh)${rep.energy.planPass === false ? ', at the planned size, which fails' : ''}.`);
  const b = rep.balance;
  p(`Simple balance: ${Number.isFinite(b.estimate) ? nf(b.estimate) : 'no limit'} blocks, limit ${LIMIT_WORD[b.limit]}.${rep.disagree ? ' The simple balance and the simulation disagree; the simulation decides.' : ''}`, 'note');
  const plan = rep.runs[0];
  if (!plan) return;
  const tbl = document.createElement('table'), thead = document.createElement('thead'), tb = document.createElement('tbody'), hr = document.createElement('tr');
  for (const h of ['Design day', 'Temp in band', 'RH ≥ target − 3', 'RH > 95 %', 'CO₂ ≤ limit', `Result, ${nf(plan.blocks)} blocks`]) hr.append(cell('th', h));
  thead.append(hr);
  for (const d of plan.days) {
    const tr = document.createElement('tr');
    tr.append(cell('td', d.name), cell('td', `${d.inT.toFixed(0)} %`), cell('td', `${d.rhOk.toFixed(0)} %`), cell('td', `${d.wet.toFixed(0)} %`), cell('td', `${d.co2Below.toFixed(0)} %`), cell('td', d.pass ? 'Pass' : d.fails.join(', ')));
    tb.append(tr);
  }
  tbl.append(thead, tb); host.append(tbl);
}
function renderFarm() {
  if (!rooms.length) { set('capFarm', ''); return; }
  const done = rooms.filter(r => r.report && r.report.capacity && r.report.capacity.max > 0);
  const planned = rooms.reduce((s, r) => s + r.mix.reduce((a, m) => a + (m.blocks || 0), 0), 0);
  const cap = done.reduce((s, r) => s + r.report.capacity.max, 0), used = done.reduce((s, r) => s + r.report.planned, 0);
  const missing = rooms.length - done.length, pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  set('capFarm', `Farm: ${pl(rooms.length, 'room')}, ${nf(planned)} blocks planned`
    + (done.length ? `; capacity ${nf(cap)} blocks in ${pl(done.length, 'checked room')} (${Math.round(used / cap * 100)} % used)` : '')
    + (missing ? `. ${pl(missing, 'room')} without a capacity yet.` : '.'));
}
// A calibration from a file is not trusted: all four values must be numbers, else the room is uncalibrated.
function validCalib(c) {
  if (!c || typeof c !== 'object') return null;
  const ok = ['ua', 'infAch', 'moistBuffer', 'co2PerBlock'].every(k => Number.isFinite(c[k]) && c[k] > 0);
  return ok ? { ua: c.ua, infAch: c.infAch, moistBuffer: c.moistBuffer, co2PerBlock: c.co2PerBlock, rmse: c.rmse || {}, date: String(c.date || '') } : null;
}
$('#capRoom').addEventListener('change', e => { roomIdx = +e.target.value; renderRooms(); });
$('#capSave').addEventListener('click', () => {
  const name = $('#capName').value.trim() || `Room ${rooms.length + 1}`;
  rooms.push({ id: Date.now().toString(36), name, volume: (env.room && env.room.volume) || PL.room.volume, vent: env.vent,
    calib: calApplied ? { ...calApplied } : null, mix: [{ crop: cfg.crop, blocks: env.blocks }], report: null });
  roomIdx = rooms.length - 1; $('#capName').value = '';
  saveRooms(); renderRooms();
  set('capMsg', calApplied ? `Saved "${name}" with the calibration of ${calApplied.date.slice(0, 10)}.` : `Saved "${name}" without a calibration: the check uses typical room values.`);
});
$('#capDelete').addEventListener('click', () => {
  const r = curRoom();
  if (!r || !confirm(`Delete the room "${r.name}"?`)) return;
  rooms.splice(roomIdx, 1); roomIdx = 0; saveRooms(); renderRooms();
});
$('#capAdd').addEventListener('click', () => { const r = curRoom(); if (!r) return; r.mix.push({ crop: 'oyster', blocks: 500 }); renderMix(); roomChanged(r); });
$('#capRun').addEventListener('click', () => {
  const r = curRoom();
  if (!r || capBusy) return;
  capBusy = true; $('#capRun').disabled = true;
  const prog = $('#capProg'); prog.hidden = false; prog.value = 0;
  set('capMsg', 'Checking… (a few seconds)');
  const emptyBelow = clamp(+$('#capEmpty').value || 50, 10, 90);
  CAPY.checkAsync(r, r.mix, { emptyBelow, tariff: input.tariff, onProgress: s => {
    prog.value = s.runs / s.maxRuns;
    set('capMsg', `Simulation run ${s.runs}: ${nf(s.blocks)} blocks, ${s.pass ? 'pass' : 'fail'}…`);
  } })
    .then(rep => { r.report = rep; saveRooms(); set('capMsg', `Done after ${rep.runs.length} simulation runs.`); })
    .catch(err => set('capMsg', `The check stopped: ${err.message}`))
    .finally(() => { capBusy = false; $('#capRun').disabled = false; prog.hidden = true; renderReport(); renderFarm(); });
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
    const ok = x.rooms.filter(r => r && typeof r.name === 'string' && Array.isArray(r.mix)
      && r.mix.every(m => m && CC.CROPS[m.crop] && CC.CROPS[m.crop].range && Number.isFinite(m.blocks) && m.blocks >= 0));
    if (!confirm(`Replace the ${rooms.length} saved room(s) with ${ok.length} room(s) from the file?`)) return;
    rooms = ok.map((r, i) => ({ id: String(r.id || `${Date.now().toString(36)}${i}`), name: r.name.slice(0, 60), volume: Number(r.volume) > 0 ? Number(r.volume) : PL.room.volume,
      vent: r.vent === 'exhaust' ? 'exhaust' : 'supply', calib: validCalib(r.calib),
      mix: r.mix.map(m => ({ crop: m.crop, blocks: Math.round(m.blocks), ...(Number.isFinite(m.co2PerBlock) && m.co2PerBlock > 0 ? { co2PerBlock: m.co2PerBlock } : {}) })), report: null }));
    roomIdx = 0; saveRooms(); renderRooms();
    set('capMsg', `Imported ${rooms.length} room(s)${ok.length < x.rooms.length ? `; ${x.rooms.length - ok.length} invalid room(s) skipped` : ''}. Run the check again for each room.`);
  }).catch(err => set('capMsg', `The file cannot be used: ${err.message}.`)).finally(() => { e.target.value = ''; });
});
renderRooms();

// ---------------- Settings level and test bench ----------------
// Farmer: crop, stage, harvest times, auto/manual, alarms. Installer: the rules, the program, corrections; the targets unlock.
function setLevel(level) {
  document.body.dataset.level = level;
  $('#levelSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === level)));
  document.querySelectorAll('input.lockable').forEach(el => { el.disabled = level !== 'installer'; });
  if (reading) layoutLadder();
}
$('#levelSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setLevel(b.dataset.level); });
$('#benchBtn').addEventListener('click', e => {
  const on = document.body.dataset.bench !== 'on';
  document.body.dataset.bench = on ? 'on' : 'off';
  e.target.setAttribute('aria-expanded', String(on));
  e.target.textContent = on ? 'Hide test bench settings' : 'Show test bench settings';
});
setLevel('farmer');

// ---------------- Controls: page ----------------
let speed = 600, paused = false;
$('#speedSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  speed = +b.dataset.speed;
  $('#speedSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
});
$('#winSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  windowS = +b.dataset.win;
  $('#winSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  chartsDirty = true;
});
$('#pauseBtn').addEventListener('click', e => { paused = !paused; e.target.textContent = paused ? 'Resume' : 'Pause'; });
$('#resetBtn').addEventListener('click', () => { reset(); alarmKey = ''; exhKey = ''; layoutLadder(); updateUi(); });
$('#tableBtn').addEventListener('click', e => {
  const card = $('#tableCard'); card.hidden = !card.hidden;
  e.target.setAttribute('aria-expanded', String(!card.hidden));
  e.target.textContent = card.hidden ? 'Show data table' : 'Hide data table';
  chartsDirty = true;
});
$('#estBtn').addEventListener('click', e => {
  const btn = e.target; btn.disabled = true; btn.textContent = 'Running…';
  setTimeout(() => { renderTest(); btn.disabled = false; btn.textContent = 'Run 24 h test again'; }, 30);
});
const themeBtn = $('#themeBtn');
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
const syncThemeBtn = () => { themeBtn.textContent = isDark() ? 'Light theme' : 'Dark theme'; };
themeBtn.addEventListener('click', () => { document.documentElement.dataset.theme = isDark() ? 'light' : 'dark'; syncThemeBtn(); });
syncThemeBtn();
new ResizeObserver(() => { exhKey = ''; }).observe($('#exhChart'));

// ---------------- Start ----------------
reset();
buildLadder();
fillRules();
fillProgram();
renderStageSeg();
paintCaps();
scheduleCropCheck();
let last = performance.now(), acc = 0, lastUi = 0, lastChart = 0;
function frame(now) {
  const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) {
    acc += dtReal * speed;
    let n = 0;
    while (acc >= 1 && n < 4000) { tick(); acc -= 1; n++; }
  }
  animateMimic(dtReal);
  if (now - lastUi > 150) { updateUi(); lastUi = now; }
  if (chartsDirty && now - lastChart > 200) { drawCharts(); lastChart = now; }
  requestAnimationFrame(frame);
}
updateUi();
requestAnimationFrame(frame);

// Test hook for headless checks.
window.__climate = { get sim() { return sim; }, get ctl() { return ctl; }, cfg, env, tick, runTest, get reading() { return reading; } };
})();
