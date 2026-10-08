// web/simulator.js: today's test bench, moved from the old dashboard script (docs/contracts/web.md C5 3.1-3.3, 3.5, 7.8).
(function (global) {
'use strict';

const SIM = global.ClimateSim, CC = global.ClimateController, RT = global.ClimateRuntime, CAL = global.ClimateCalib;
const PL = SIM.PLANT;

// ---------------- Simulator state (closure; created once, survives module switches: C5 3.1, 6.1) ----------------
let env = null, cfg = null, input = null;
let sim = null, ctl = null, io = null, rt = null, reading = null, cmd = null;
let samples = [], events = [];
let calApplied = null;
let blockFollow = true;
const MAX_SAMPLES = 40000;

function ensureState() {
  if (env) return;
  env = structuredClone(SIM.DEFAULT_ENV);
  cfg = CC.defaultSettings();
  input = { tariff: 0.57 };
  reset();
}

function onEvent(ev) { events.unshift(ev); if (events.length > 300) events.pop(); if (mounted) logDirty = true; }

function reset() {
  sim = SIM.create(env);
  sim.setRoom({ T: cfg.spT, RH: cfg.spRH, CO2: 750 });
  events = []; samples = []; hoverT = null;
  ctl = CC.create(cfg, null, onEvent);
  io = RT.simIO(sim);
  rt = RT.createRuntime({ io, ctl, onReading: (r, c) => { reading = r; cmd = c; sample(r); } });
  onEvent({ t: 0, lvl: 'info', text: 'Simulation started' });
  rt.poll();
  chartsDirty = true;
}
function tick() { if (blockFollow) env.blockStage = cfg.stage; io.advance(1); rt.poll(); }

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
function calLogFromSamples() {
  const t1 = reading.t, t0 = Math.max(0, t1 - 86400);
  let last = -Infinity;
  const rows = [];
  for (const p of samples) {
    if (p.t < t0 || p.t - last < 60) continue;
    last = p.t;
    rows.push({ t: p.t - t0, T: p.T, RH: p.RH, CO2: p.C, tOut: p.tOut, rhOut: p.rhOut, ...p.cmd });
  }
  return rows;
}

// A private setPath, as the lead decisions require (6.1: "Simulator onChange writes"): writes a change path
// straight into the live cfg, which FarmSettingsPanel.applyChanges (a pure copy) cannot do.
function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { const p = parts[i]; if (!o[p] || typeof o[p] !== 'object') o[p] = {}; o = o[p]; }
  o[parts[parts.length - 1]] = value;
}

const RAMP_PATHS = new Set(['spT', 'spRH', 'co2Lim', 'rules.fanOn', 'rules.fanOff', 'rules.acOff', 'rules.acOn', 'rules.co2SafetyAt']);
const DEV_NAME = { ac: 'Air conditioner', hu: 'Fogger', fan: 'Exhaust fan', lights: 'Lights', circ: 'Circulation fan' };

// ---------------- Per-mount state ----------------
let mounted = false, el = null, mountGen = 0;
let benchFlag = 'off'; // closure variable, survives a module switch (6.1 "Simulator bench flag")
let trendCharts = null, ladder = null, panel = null;
let hoverT = null, chartsDirty = true, logDirty = true, windowS = 21600, speed = 600, paused = false;
let lastStage = '', alarmKey = '', exhKey = '', cropCheckTimer = null;
let rafId = null, last = 0, acc = 0, lastUi = 0, lastChart = 0;

function calParamsNow() { return CAL.paramsOf(env); }

function paintBlocks() {
  const lpm = SIM.co2Lpm(env);
  UI.set('hintBlocks', env.blocks === 0 ? 'The room is empty: no CO₂, heat, or water from blocks.'
    : `Together they make ${lpm.toFixed(2)} L/min of CO₂, ${Math.round(lpm * PL.resp.wPerLpm)} W of heat, and ${Math.round(lpm * PL.resp.gpsPerLpm * 3600)} g/h of water.`);
}

// ---------------- Mimic animation ----------------
let mist = [], bubbles = [], caps = [];
let animAcFlows = [], animFanFlows = [];
const anim = { fan: 0, cond: 0, acFlow: 0, fanFlow: 0 };
const reduceMotion = () => (typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false);
function buildMimicExtras() {
  mist = []; bubbles = []; caps = [];
  for (let i = 0; i < 16; i++) mist.push({ ph: i / 16, dx: (Math.random() - 0.5) * 14, elm: UI.svgEl('circle', { class: 'mist', r: 3 }, el.querySelector('#mist')) });
  for (let i = 0; i < 14; i++) bubbles.push({ ph: i / 14, dx: Math.random() * 136, elm: UI.svgEl('circle', { class: 'bubble', r: 2.5 }, el.querySelector('#bubbles')) });
  const g = el.querySelector('#bags');
  for (const y0 of [264, 314]) for (let i = 0; i < 5; i++) {
    const x = 186 + i * 29;
    UI.svgEl('rect', { class: 'bag', x, y: y0, width: 24, height: 36, rx: 7 }, g);
    for (const [cx, cy, side] of [[x + 2, y0 + 12, -1], [x + 22, y0 + 24, 1]]) {
      const outer = UI.svgEl('g', { transform: `translate(${cx} ${cy})` }, g);
      const c = UI.svgEl('g', { class: 'cap' }, outer);
      UI.svgEl('ellipse', { cx: 3 * side, cy: 0, rx: 7, ry: 3.6 }, c);
      UI.svgEl('ellipse', { cx: 2 * side, cy: 5, rx: 5, ry: 2.8 }, c);
      caps.push(c);
    }
  }
  animAcFlows = [...el.querySelectorAll('[data-flow="ac"]')];
  animFanFlows = [...el.querySelectorAll('[data-flow="fan"]')];
}
const paintCaps = () => { const sc = { spawn: 0, pinning: 0.35, fruiting: 1, rest: 0.12 }[cfg.stage]; for (const c of caps) c.style.transform = `scale(${sc})`; };
function animateMimic(dtReal) {
  const a = sim.view().act, move = !reduceMotion() && !paused;
  const fanF = a.fanLevel / 3, fogF = a.huLevel / 3;
  if (move) {
    anim.fan = (anim.fan + 1080 * fanF * dtReal) % 360;
    anim.cond = (anim.cond + 720 * (a.comp ? 0.3 + a.acFrac : 0) * dtReal) % 360;
    anim.acFlow -= dtReal * 40 * (0.5 + a.acFrac);
    anim.fanFlow -= dtReal * 60 * (0.3 + fanF);
  }
  el.querySelector('#fanBlades').setAttribute('transform', `rotate(${anim.fan.toFixed(1)})`);
  el.querySelector('#condBlades').setAttribute('transform', `rotate(${anim.cond.toFixed(1)})`);
  for (const f of animAcFlows) { f.style.opacity = !a.power ? 0 : a.comp ? 0.35 + 0.65 * a.acFrac : 0.2; f.style.strokeDashoffset = anim.acFlow; }
  for (const f of animFanFlows) { f.style.opacity = fanF > 0 ? 0.35 + 0.65 * fanF : 0; f.style.strokeDashoffset = anim.fanFlow; }
  for (const p of mist) {
    if (move) { p.ph += dtReal * (0.25 + 0.5 * fogF); if (p.ph > 1) { p.ph -= 1; p.dx = (Math.random() - 0.5) * 14; } }
    p.elm.setAttribute('cx', (572 + p.dx + Math.sin(p.ph * 7 + p.dx) * 4).toFixed(1));
    p.elm.setAttribute('cy', (262 - p.ph * 80).toFixed(1));
    p.elm.setAttribute('r', (2.5 + p.ph * 6).toFixed(1));
    p.elm.style.opacity = (fogF * (1 - p.ph) * 0.7).toFixed(2);
  }
  const lpm = SIM.co2Lpm(env), co2Vis = UI.clamp(lpm / 3, 0, 1);
  for (const b of bubbles) {
    if (move) { b.ph += dtReal * (0.3 + 0.1 * lpm); if (b.ph > 1) { b.ph -= 1; b.dx = Math.random() * 136; } }
    b.elm.setAttribute('cx', (189 + b.dx + Math.sin(b.ph * 9 + b.dx) * 3).toFixed(1));
    b.elm.setAttribute('cy', (258 - b.ph * 46).toFixed(1));
    b.elm.style.opacity = (co2Vis * (1 - b.ph)).toFixed(2);
  }
}

// ---------------- UI update ----------------
const AC_WORD = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' };
const UI = global.FarmUi;
const clock = () => UI.simClock(env.startHour);

function updateUi() {
  const v = sim.view(), r = reading, st = ctl.state, R = cfg.rules;
  const night = clock().hm; // unused placeholder to keep clock() referenced lazily
  const hourLocal = Math.floor((env.startHour * 3600 + v.t) % 86400 / 3600);
  const isNight = hourLocal >= 19 || hourLocal < 7;

  UI.set('clock', clock().label(v.t));
  UI.paintChip(el.querySelector('#sky'), { lvl: 'info', icon: isNight ? '☾' : '☀', text: isNight ? 'Night' : 'Day' });
  const list = ctl.alarmList(), active = list.filter(a => a.active), unacked = list.filter(a => !a.acked);
  const worst = active.reduce((w, a) => (UI.LVL_RANK[a.lvl] > (UI.LVL_RANK[w] || 0) ? a.lvl : w), 'good');
  UI.paintChip(el.querySelector('#alarmSummary'), active.length || unacked.length
    ? { lvl: active.length ? worst : 'info', icon: active.length ? UI.ICON[worst] : '•', text: `${active.length} active · ${unacked.length} not acknowledged` }
    : { lvl: 'good', icon: '✓', text: 'No active alarms' });
  el.querySelector('#ackBtn').hidden = unacked.length === 0;
  renderAlarms(list);

  UI.set('mOutT', `${v.weather.T.toFixed(1)} °C`);
  UI.set('mOutRH', `${v.weather.RH.toFixed(0)} % RH`);
  el.querySelector('#mSun').style.display = isNight ? 'none' : '';
  el.querySelector('#mMoon').style.display = isNight ? '' : 'none';
  UI.set('mSkyTxt', isNight ? 'Night' : 'Day');
  el.querySelector('#lamp').classList.toggle('on', v.lights);
  UI.set('mLamp', v.lights ? 'Lights on' : 'Lights off');
  const readout = (id, txt, s) => {
    const g = el.querySelector('#' + id); g.dataset.lvl = s.lvl;
    const val = g.querySelector('.val'), ic = g.querySelector('.ico');
    if (val.textContent !== txt) val.textContent = txt;
    if (ic.textContent !== s.icon) ic.textContent = s.icon;
  };
  readout('mT', `${UI.fmtNum(r.T, 1)} °C`, ctl.status('T'));
  readout('mRH', `${UI.fmtNum(r.RH, 0)} % RH`, ctl.status('RH'));
  readout('mC', `${UI.fmtNum(r.CO2, 0)} ppm`, ctl.status('CO2'));
  const a = v.act;
  UI.set('mAcState', !a.power ? 'Off' : `${AC_WORD[a.mode]} ${a.setpoint.toFixed(1)}° · ${a.comp ? `comp ${UI.pct(a.acFrac)}` : 'comp idle'}`);
  UI.set('mHuState', a.huLevel > 0 ? `Level ${a.huLevel}` : 'Off');
  UI.set('mFanState', `${env.vent === 'supply' ? 'Supply ' : ''}${PL.fan.levels[a.fanLevel].name}`);
  UI.set('mFanTag', env.vent === 'supply' ? 'SF-203' : 'EF-203');
  UI.set('mOutflow', `${Math.round(v.airM3h)} m³/h`);
  UI.set('mInflow', `${Math.round(v.airM3h)} m³/h`);
  UI.set('mCo2Src', `${env.blocks.toLocaleString('en')} blocks`);
  el.querySelector('#acUnit').classList.toggle('on', a.comp);
  el.querySelector('#condenser').classList.toggle('on', a.comp);
  el.querySelector('#huUnit').classList.toggle('on', a.huLevel > 0);
  el.querySelector('#fanUnit').classList.toggle('on', a.fanLevel > 0);
  UI.set('mimicStage', `${CC.CROPS[cfg.crop].name} · ${CC.STAGES[cfg.stage]} · live`);
  const Z = v.zones, dist = [v.door && 'door open', v.workers && `${v.workers} workers`, v.watering && 'floor wet', v.weather.rain && 'rain', v.weather.cloudy && 'cloudy', v.wetSensor && 'RH sensor wet'].filter(Boolean);
  UI.set('mimicNote', `Low air ${Z.lo.T.toFixed(1)} °C ${Z.lo.RH.toFixed(0)} % ${Z.lo.C.toFixed(0)} ppm · High air ${Z.hi.T.toFixed(1)} °C ${Z.hi.RH.toFixed(0)} % ${Z.hi.C.toFixed(0)} ppm · core ${v.core.toFixed(1)} °C${dist.length ? ' · ' + dist.join(', ') : ''}`);

  const c = st.cmd, hold = (why, h) => (h ? `${why} ${h}` : why);
  UI.set('acState', !c.ac.power ? 'Off' : `${AC_WORD[c.ac.mode]} · set ${c.ac.setpoint.toFixed(1)} °C${st.setbackOn ? ` (setback +${R.acSetbackC})` : ''}`);
  UI.set('acPower', UI.watts(v.power.ac));
  el.querySelector('#acMeter').style.width = `${UI.clamp(v.power.ac / 1400, 0, 1) * 100}%`;
  UI.set('acWhy', hold(st.why.ac, st.hold.ac));
  UI.set('huState', c.hu.level > 0 ? `Level ${c.hu.level} of 3` : 'Standby');
  UI.set('huPower', UI.watts(v.power.hu));
  el.querySelector('#huMeter').style.width = `${c.hu.level / 3 * 100}%`;
  UI.set('huWhy', hold(st.why.hu, st.hold.hu));
  UI.set('fanState', c.fan.level > 0 ? `${CC.MACHINES.fanLevels[c.fan.level]} · level ${c.fan.level} of 3` : 'Off');
  UI.set('fanPower', UI.watts(v.power.fan));
  el.querySelector('#fanMeter').style.width = `${c.fan.level / 3 * 100}%`;
  UI.set('fanWhy', hold(st.why.fan, st.hold.fan));
  UI.set('liState', c.lights.on ? 'On' : 'Off'); UI.set('liPower', UI.watts(v.power.lights)); UI.set('liWhy', st.why.lights);
  UI.set('ciState', c.circ.on ? 'On' : 'Off'); UI.set('ciPower', UI.watts(v.power.circ)); UI.set('ciWhy', st.why.circ);
  const dd = Math.max(r.t, 3600) / 86400;
  UI.set('wFog', (r.water.fogKg / dd).toFixed(1)); UI.set('wAc', (r.water.acKg / dd).toFixed(1)); UI.set('wAir', Math.round(r.unfilteredM3 / dd).toLocaleString('en'));
  UI.set('wVpd', st.vpd != null ? `${st.vpd.toFixed(2)} / ${st.vpdT.toFixed(2)}` : '–');
  UI.set('wNote', r.water.acKg > r.water.fogKg * 1.5 && r.water.fogKg > 0.5
    ? 'The AC coil removes much more water than the fogger adds: the AC and the fogger work against each other. A high AC fan speed and fog-first cooling decrease this.'
    : env.vent === 'exhaust' ? 'All incoming air is unfiltered: the exhaust fan puts the room under suction.' : 'Incoming air goes through the filter: the room has a slight over-pressure.');

  const tot = r.kwh.ac + r.kwh.hu + r.kwh.fan + (r.kwh.lights || 0) + (r.kwh.circ || 0), days = r.t / 86400;
  UI.set('eKwh', tot.toFixed(3));
  UI.set('eDay', r.t >= 3600 ? (tot / days).toFixed(1) : '–');
  UI.set('eCost', (tot * input.tariff).toFixed(2));
  for (const [k, id] of [['ac', 'Ac'], ['hu', 'Hu'], ['fan', 'Fan'], ['lights', 'Li'], ['circ', 'Ci']]) {
    const kwh = r.kwh[k] || 0, share = tot > 0 ? kwh / tot : 0;
    UI.set('e' + id, `${kwh.toFixed(3)} kWh · ${Math.round(share * 100)} %`);
    el.querySelector('#e' + id + 'Bar').style.width = `${share * 100}%`;
  }
  const S = st.stats, perDay = n => (r.t >= 3600 ? ` (${Math.round(n / days)}/day)` : '');
  UI.set('dFanOn', UI.fmtDur(S.fanOnS));
  UI.set('dFanOnL', r.t > 0 ? `fan run time (${Math.round(S.fanOnS / r.t * 100)} %)` : 'fan run time');
  UI.set('dFanStarts', String(S.fanStarts)); UI.set('dFanStartsL', `fan starts${perDay(S.fanStarts)}`);
  UI.set('dSetback', UI.fmtDur(S.setbackS));
  UI.set('dAcCmds', String(S.acCmds)); UI.set('dAcCmdsL', `AC commands${perDay(S.acCmds)}`);
  UI.set('dFanBlocked', UI.fmtDur(S.fanBlockedS));
  UI.set('dFogStarts', String(S.fogStarts)); UI.set('dFogStartsL', `fogger starts${perDay(S.fogStarts)}`);
  updateLadderLive();
  renderExhaust();
  paintProgram();

  if (logDirty) renderLog();
}

function renderAlarms(list) {
  const key = list.map(a => `${a.id}${a.active}${a.acked}`).join('|');
  if (key === alarmKey) return;
  alarmKey = key;
  const host = el.querySelector('#alarmList');
  if (!list.length) { const p = document.createElement('p'); p.className = 'est-note'; p.textContent = 'No alarms.'; host.replaceChildren(p); return; }
  host.replaceChildren(...list.map(a => {
    const li = document.createElement('li'); li.dataset.lvl = a.lvl;
    const ic = document.createElement('span'); ic.className = 'ico'; ic.textContent = UI.ICON[a.lvl] || '•';
    const tx = document.createElement('span'); tx.textContent = `${a.label} · since ${clock().stamp(a.since)}`;
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
    const tm = document.createElement('time'); tm.textContent = clock().stamp(e.t);
    const ic = document.createElement('span'); ic.className = 'ico'; ic.textContent = UI.ICON[e.lvl] || '•'; ic.setAttribute('aria-hidden', 'true');
    const tx = document.createElement('span'); tx.textContent = e.text;
    li.append(tm, ic, tx);
    return li;
  });
  el.querySelector('#log').replaceChildren(...items);
}

// ---------------- Exhaust per hour ----------------
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
  UI.set('xAvgStarts', done.length ? (sum(done, 'starts') / done.length).toFixed(1) : '–');
  UI.set('xAvgRun', done.length ? `${Math.round(sum(done, 'runS') / done.length / 60)} min` : '–');
  UI.set('xAvgAch', done.length ? (sum(done, 'm3') / done.length / vol).toFixed(1) : '–');
  UI.set('xTotM3', Math.round(sum(mine, 'm3')).toLocaleString('en'));
  global.FarmCharts.drawExhaustBars(el.querySelector('#exhChart'), { hours, nowH, vol, clock: clock() });
  el.querySelector('#exhRows').replaceChildren(...mine.slice(-12).reverse().map(b => {
    const tr = document.createElement('tr');
    tr.append(UI.cell('td', `${clock().hm(b.h * 3600)}–${clock().hm((b.h + 1) * 3600)}${b.h === nowH ? ' (now)' : ''}`),
      UI.cell('td', String(b.starts)), UI.cell('td', UI.fmtMinSec(b.runS)), UI.cell('td', Math.round(b.m3).toLocaleString('en')), UI.cell('td', (b.m3 / vol).toFixed(1)));
    return tr;
  }));
  const evs = (X.cur ? [{ ...X.cur, running: true }] : []).concat(X.events.slice().reverse()).slice(0, 40);
  el.querySelector('#exhEvents').replaceChildren(...evs.map(e => {
    const tr = document.createElement('tr');
    const dur = (e.running ? reading.t : e.end) - e.start;
    tr.append(UI.cell('td', clock().stamp(e.start)), UI.cell('td', e.running ? 'running' : clock().stamp(e.end)), UI.cell('td', UI.fmtMinSec(dur)),
      UI.cell('td', CC.MACHINES.fanLevels[e.maxLevel]), UI.cell('td', e.reason || '–'),
      UI.cell('td', `${UI.fmtNum(e.co2Start, 0)} → ${e.running ? '…' : UI.fmtNum(e.co2End, 0)}`), UI.cell('td', Math.round(e.m3).toLocaleString('en')));
    return tr;
  }));
}

// ---------------- Ladder (rules-side panel slot) ----------------
function updateLadderLive() {
  if (!ladder) return;
  const st = ctl.state, c = st.cmd, co2 = reading.CO2;
  const ok = Number.isFinite(co2) && !st.f.CO2;
  const chips = {
    fan: st.fanBlocked ? { lvl: 'info', icon: '❚❚', text: 'Held (RH)' }
      : c.fan.level > 0 ? { lvl: 'info', icon: '●', text: st.co2Timed ? 'Timed purge' : st.fanReason === 'CO₂ purge' ? 'Purging' : 'Running' }
      : { lvl: 'none', icon: '○', text: 'Off' },
    ac: !cfg.rules.acPurge ? { lvl: 'none', icon: '–', text: 'No rule' }
      : st.setbackOn ? { lvl: 'info', icon: '▲', text: cfg.rules.acAction === 'off' ? 'AC off' : `+${cfg.rules.acSetbackC} °C` }
      : st.setbackReq && (st.setbackAlarmStop || st.setbackTimeStop) ? { lvl: 'info', icon: '!', text: 'Cancelled' }
      : { lvl: 'none', icon: '○', text: 'Normal' },
  };
  ladder.draw(cfg, ok ? co2 : NaN, chips);
}

// ---------------- Stage program / crop check ----------------
function scheduleCropCheck() {
  clearTimeout(cropCheckTimer);
  UI.set('cropCheck', 'Checking the room for this crop…');
  cropCheckTimer = setTimeout(checkCrop, 60);
}
function checkCrop() {
  if (!mounted) return;
  const cfg2 = structuredClone(cfg); CC.applyProfile(cfg2);
  const sim2 = SIM.create(structuredClone(env), sim.snapshot()), ctl2 = CC.create(cfg2, ctl.snapshot(), null);
  ctl2.state.stage.ramp = null;
  const io2 = RT.simIO(sim2); io2.write(ctl2.state.cmd);
  let hi = -Infinity, lo = Infinity, n = 0, inT = 0, above = 0, below = 0;
  const rt2 = RT.createRuntime({ io: io2, ctl: ctl2, skipCurrent: true, onReading: r => {
    if (r.t - sim.view().t < 6 * 3600) return;
    const T = sim2.view().T; hi = Math.max(hi, T); lo = Math.min(lo, T); n++;
    if (Math.abs(T - cfg2.spT) <= CC.BANDS.T) inT++; else if (T > cfg2.spT) above++; else below++;
  } });
  for (let i = 0; i < 30 * 3600; i++) { io2.advance(1); rt2.poll(); }
  if (!mounted) return;
  const elm = el.querySelector('#cropCheck'), name = `${CC.CROPS[cfg2.crop].name}, ${CC.STAGES[cfg2.stage].toLowerCase()}`;
  if (above / n > 0.1) { elm.dataset.lvl = 'warning'; UI.set('cropCheck', `Check: in the present weather, the room is too warm for ${Math.round(above / n * 24)} h a day (up to ${hi.toFixed(1)} °C, target ${cfg2.spT} °C). The AC is too small for ${name} in this weather.`); }
  else if (below / n > 0.1) { elm.dataset.lvl = 'warning'; UI.set('cropCheck', `Check: in the present weather, the room is too cold for ${Math.round(below / n * 24)} h a day (down to ${lo.toFixed(1)} °C, target ${cfg2.spT} °C). The AC cannot heat enough for ${name}.`); }
  else { elm.dataset.lvl = 'good'; UI.set('cropCheck', `Check: the room holds ${name} at ${cfg2.spT} °C in the present weather (${Math.round(inT / n * 100)} % of a simulated day in band).`); }
}
function paintProgram() {
  const P = ctl.programStatus(reading.t), H = cfg.program.harvest;
  const key = `${cfg.farmType}|${cfg.stage}`;
  if (key !== lastStage) { lastStage = key; paintCaps(); if (panel) panel.set(cfg); }
  const days = P.days ? ` · day ${P.day} of ${P.days}` : '';
  const flush = cfg.stage === 'fruiting' || cfg.stage === 'rest' ? ` · flush ${P.flush} of ${P.flushes}` : '';
  UI.set('progStatus', `${CC.STAGES[cfg.stage]}${days}${flush}${P.auto ? ' · automatic' : ''}${P.done ? ' · last flush done: replace the blocks' : ''}`);
  UI.set('progRamp', P.ramp ? `Targets moving to ${P.ramp.to.spT} °C, ${P.ramp.to.spRH} %, ${P.ramp.to.co2Lim} ppm: ${(P.ramp.leftS / 3600).toFixed(1)} h left.` : '');
  let hv = '';
  if (cfg.stage === 'fruiting' && H.on) {
    if (P.harvestOn) hv = `Harvest window now: fog off until ${CC.hhmm(P.harvestWin.to)}.`;
    else if (H.times.length) {
      const m = reading.hour * 60, next = H.times.map(at => ({ at, wait: ((at - H.dryMin - m) % 1440 + 1440) % 1440 })).sort((x, y) => x.wait - y.wait)[0];
      hv = `Next harvest ${CC.hhmm(next.at)}: fog off from ${CC.hhmm(next.at - H.dryMin)}.`;
    }
  }
  UI.set('progHarvest', hv);
  UI.set('vpdLine', cfg.humMode === 'vpd' && ctl.state.vpdT != null ? `VPD target ${ctl.state.vpdT.toFixed(2)} kPa: the RH target is now ${ctl.state.rhT.toFixed(1)} % at ${UI.fmtNum(ctl.state.v.T, 1)} °C.` : '');
  if (P.ramp && panel) panel.set(cfg);
}

// ---------------- 24 h test ----------------
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
    const room = sim2.view();
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
  for (const h of head) htr.append(UI.cell('th', h));
  thead.append(htr);
  const tbody = document.createElement('tbody');
  for (const [name, x] of variants) {
    const tr = document.createElement('tr');
    for (const c of row(name, x)) tr.append(UI.cell('td', c));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  const note = document.createElement('p'); note.className = 'est-note';
  note.textContent = `Start: ${clock().stamp(reading.t)}. The value in brackets is the difference from your rules. "In band" uses the real room values at each reading. "RH low alarm" is the time below target − ${CC.BANDS.RHAlarm} %. The AC restart energy comes from the simulation setting "Full speed after each AC start".`;
  el.querySelector('#estOut').replaceChildren(table, note);
}

// ---------------- Charts ----------------
function drawCharts() {
  chartsDirty = false;
  const now = reading.t, t0 = Math.max(0, now - windowS), t1 = t0 + windowS;
  const FC = global.FarmCharts;
  const raw = samples.slice(FC.lowerBound(samples, t0));
  const view = { t0, t1, pts: FC.aggregate(raw, 700) };
  if (trendCharts) trendCharts.draw(view);
  if (!el.querySelector('#tableCard').hidden) renderTable(raw);
}
function renderTable(raw) {
  const rows = raw.slice(-15).reverse().map(p => {
    const tr = document.createElement('tr');
    for (const val of [clock().stamp(p.t), UI.fmtNum(p.T, 1), UI.fmtNum(p.RH, 0), UI.fmtNum(p.C, 0), UI.fmtNum(p.tOut, 1), UI.fmtNum(p.rhOut, 0), UI.fmtNum(p.core, 1), UI.fmtNum(p.vpd, 2), UI.fmtNum(p.acSet, 1), Math.round(p.ac), Math.round(p.hu), Math.round(p.fan)]) tr.append(UI.cell('td', String(val)));
    return tr;
  });
  el.querySelector('#tbody').replaceChildren(...rows);
}

// ---------------- Markup ----------------
const MIMIC_SVG = `
    <svg class="mimic-svg" viewBox="0 0 800 380" role="img" aria-labelledby="mimicTitle mimicDesc">
      <title id="mimicTitle">Room schematic</title>
      <desc id="mimicDesc">Live view of the fruiting room, the growing rack, the three sensors, the air conditioner, the fogger, and the exhaust fan.</desc>
      <defs>
        <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect class="hatch-bg" width="7" height="7"/><line class="hatch-line" x1="0" y1="0" x2="0" y2="7"/>
        </pattern>
        <marker id="arAc" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="arrowhead ac" d="M0 0 L10 5 L0 10 z"/></marker>
        <marker id="arFan" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="arrowhead fan" d="M0 0 L10 5 L0 10 z"/></marker>
      </defs>
      <text x="16" y="30" class="m-eyebrow">OUTDOOR · OT-104</text>
      <text x="16" y="58" class="m-big" id="mOutT">32.0 °C</text>
      <text x="16" y="78" class="m-small" id="mOutRH">60 % RH</text>
      <g id="mSun" transform="translate(24 214)"><circle class="sun" r="5"/>
        <path class="sun" d="M0,-8.5V-7 M0,7V8.5 M-8.5,0H-7 M7,0H8.5 M-6,-6L-5,-5 M5,5L6,6 M-6,6L-5,5 M5,-5L6,-6"/></g>
      <g id="mMoon" transform="translate(24 214)"><circle class="moon" r="6.5"/><circle class="moon-cut" cx="3.6" cy="-2.4" r="5.4"/></g>
      <text x="38" y="219" class="m-small" id="mSkyTxt">Day</text>
      <line class="ground" x1="0" y1="352" x2="800" y2="352"/>
      <rect class="wall" x="134" y="14" width="532" height="338"/>
      <rect class="room" x="142" y="22" width="516" height="330"/>
      <g id="condenser">
        <rect class="unit" x="18" y="100" width="96" height="74" rx="4"/>
        <circle class="ring" cx="66" cy="137" r="27"/>
        <g transform="translate(66 137)"><g id="condBlades">
          <path class="blade" d="M0,-3 C8,-7 18,-5 22,0 C17,3 7,3 0,3 Z"/>
          <path class="blade" d="M0,-3 C8,-7 18,-5 22,0 C17,3 7,3 0,3 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-3 C8,-7 18,-5 22,0 C17,3 7,3 0,3 Z" transform="rotate(240)"/>
        </g><circle r="4" class="blade"/></g>
        <text x="66" y="192" text-anchor="middle" class="m-small">Condenser</text>
      </g>
      <path class="pipe" d="M114 120 H150 V56 H160"/>
      <path class="pipe" d="M114 130 H156 V66 H160"/>
      <g class="grille"><rect x="134" y="226" width="8" height="38" class="unit"/>
        <line x1="135" x2="141" y1="234" y2="234"/><line x1="135" x2="141" y1="245" y2="245"/><line x1="135" x2="141" y1="256" y2="256"/></g>
      <path class="flow fan" data-flow="fan" d="M84 236 H168" marker-end="url(#arFan)"/>
      <path class="flow fan" data-flow="fan" d="M84 254 H168" marker-end="url(#arFan)"/>
      <text x="16" y="296" class="m-small">Make-up air</text>
      <text x="16" y="314" class="m-small" id="mInflow">12 m³/h</text>
      <g id="lamp">
        <rect class="lamp" x="466" y="22" width="64" height="6" rx="2"/>
        <path class="lamp-ray" d="M476,32 L470,40 M498,32 V42 M520,32 L526,40"/>
        <text x="498" y="56" text-anchor="middle" class="m-small" id="mLamp">Lights off</text>
      </g>
      <g id="acUnit">
        <rect class="unit" x="160" y="34" width="200" height="46" rx="6"/>
        <rect class="keybar ac" x="160" y="34" width="6" height="46" rx="2"/>
        <line x1="176" x2="346" y1="74" y2="74" class="ring"/>
        <text x="176" y="54" class="m-tag">ACU-201</text>
        <text x="176" y="70" class="m-small" id="mAcState">Off</text>
      </g>
      <path class="flow ac" data-flow="ac" d="M200 86 C205 116, 228 136, 256 146" marker-end="url(#arAc)"/>
      <path class="flow ac" data-flow="ac" d="M250 86 C255 120, 282 144, 314 156" marker-end="url(#arAc)"/>
      <path class="flow ac" data-flow="ac" d="M300 86 C305 120, 330 146, 360 160" marker-end="url(#arAc)"/>
      <g id="sensors">
        <line class="leader" x1="404" x2="430" y1="130" y2="130"/>
        <line class="leader" x1="404" x2="430" y1="185" y2="185"/>
        <line class="leader" x1="404" x2="430" y1="240" y2="240"/>
        <circle class="bubble-tag" cx="400" cy="130" r="20"/><text x="400" y="128" text-anchor="middle" class="m-tag" style="font-size:12px">TT</text><text x="400" y="142" text-anchor="middle" style="font-size:11px">101</text>
        <circle class="bubble-tag" cx="400" cy="185" r="20"/><text x="400" y="183" text-anchor="middle" class="m-tag" style="font-size:12px">MT</text><text x="400" y="197" text-anchor="middle" style="font-size:11px">102</text>
        <circle class="bubble-tag" cx="400" cy="240" r="20"/><text x="400" y="238" text-anchor="middle" class="m-tag" style="font-size:12px">AT</text><text x="400" y="252" text-anchor="middle" style="font-size:11px">103</text>
        <g class="readout" id="mT"><rect x="430" y="115" width="122" height="30" rx="4"/><text class="val" x="440" y="136">--</text><text class="ico" x="542" y="135" text-anchor="end"></text></g>
        <g class="readout" id="mRH"><rect x="430" y="170" width="122" height="30" rx="4"/><text class="val" x="440" y="191">--</text><text class="ico" x="542" y="190" text-anchor="end"></text></g>
        <g class="readout" id="mC"><rect x="430" y="225" width="122" height="30" rx="4"/><text class="val" x="440" y="246">--</text><text class="ico" x="542" y="245" text-anchor="end"></text></g>
      </g>
      <g id="fanUnit">
        <rect class="unit" x="622" y="60" width="80" height="80" rx="6"/>
        <rect class="keybar fan" x="622" y="134" width="80" height="6" rx="2"/>
        <circle class="ring" cx="662" cy="100" r="31"/>
        <g transform="translate(662 100)"><g id="fanBlades">
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(240)"/>
        </g><circle r="5" class="blade"/></g>
      </g>
      <text x="610" y="92" text-anchor="end" class="m-tag" id="mFanTag">EF-203</text>
      <text x="610" y="109" text-anchor="end" class="m-small" id="mFanState">Off</text>
      <path class="flow fan" data-flow="fan" d="M708 82 H790" marker-end="url(#arFan)"/>
      <path class="flow fan" data-flow="fan" d="M708 100 H790" marker-end="url(#arFan)"/>
      <path class="flow fan" data-flow="fan" d="M708 118 H790" marker-end="url(#arFan)"/>
      <text x="712" y="164" class="m-small">Exhaust</text>
      <text x="712" y="182" class="m-small" id="mOutflow">0 m³/h</text>
      <g id="mist"></g>
      <g id="huUnit">
        <rect class="unit" x="562" y="266" width="20" height="12" rx="3"/>
        <rect class="unit body" x="540" y="276" width="64" height="76" rx="8"/>
        <rect class="keybar hu" x="540" y="276" width="64" height="6" rx="2"/>
        <rect class="tank" x="550" y="310" width="44" height="30" rx="3"/>
      </g>
      <text x="528" y="300" text-anchor="end" class="m-tag">HU-202</text>
      <text x="528" y="317" text-anchor="end" class="m-small" id="mHuState">Off</text>
      <g id="bubbles"></g>
      <g id="rack">
        <line class="post" x1="180" x2="180" y1="252" y2="352"/>
        <line class="post" x1="334" x2="334" y1="252" y2="352"/>
        <line class="shelf" x1="178" x2="336" y1="302" y2="302"/>
        <g id="bags"></g>
      </g>
      <text x="346" y="300" class="m-tag">Growing blocks</text>
      <text x="346" y="317" class="m-small" id="mCo2Src">2,000 blocks</text>
    </svg>`;

function faceplate(dev, title, tag, extraClass, body) {
  return `<article class="card faceplate${extraClass ? ' ' + extraClass : ''}" style="--key:var(--s-${dev === 'lights' ? 'li' : dev === 'circ' ? 'ci' : dev})" aria-labelledby="fp${dev}Title">
    <header class="fp-head">
      <span class="key"></span>
      <div><h3 id="fp${dev}Title">${title}</h3><span class="tag">${tag}</span></div>
    </header>
    ${body}
  </article>`;
}

const MARKUP = `
<div class="card sim-toolbar" aria-label="Simulation run controls">
  <div class="clock">Room time<output id="clock">Day 1 · 06:00</output></div>
  <span class="sky" id="sky"></span>
  <span class="chip" id="alarmSummary" data-lvl="good"><span class="ico">✓</span><span>No active alarms</span></span>
  <button class="btn" id="ackBtn" hidden>Acknowledge all</button>
  <div class="spacer"></div>
  <span class="eyebrow">Simulation</span>
  <div class="seg" role="group" aria-label="Simulation speed" id="speedSeg">
    <button data-speed="1" aria-pressed="false">1×</button>
    <button data-speed="60" aria-pressed="false">60×</button>
    <button data-speed="600" aria-pressed="true">600×</button>
    <button data-speed="3600" aria-pressed="false">3600×</button>
  </div>
  <button class="btn" id="pauseBtn">Pause</button>
  <button class="btn" id="resetBtn">Reset</button>
</div>
<div class="section-head sim-head">
  <h2>Simulation</h2>
  <p>The world around the controller: weather, room, growing blocks, sensors. Change it to test the controller.</p>
  <button class="btn" id="benchBtn" aria-expanded="false">Show test bench settings</button>
</div>
<figure class="card sim mimic">
  <div class="mimic-head">
    <span class="eyebrow" id="mimicStage">Fruiting room · live</span>
    <span class="tag" id="mimicNote"></span>
  </div>
  ${MIMIC_SVG}
</figure>
<aside class="card sim simpanel" aria-labelledby="hSim">
  <section>
    <h2 class="eyebrow" id="hSim">Weather</h2>
    <label class="chk"><input type="checkbox" id="inCycle" checked> Day and night cycle</label>
    <div id="cycleFields">
      <div class="field">
        <label for="inHigh">Day high (15:00)</label><output id="outHigh" for="inHigh"></output>
        <input type="range" id="inHigh" min="18" max="40" step="0.5" value="33">
      </div>
      <div class="field">
        <label for="inLow">Night low (03:00)</label><output id="outLow" for="inLow"></output>
        <input type="range" id="inLow" min="12" max="32" step="0.5" value="24">
      </div>
    </div>
    <div class="field" id="fixedField" hidden>
      <label for="inFixed">Outdoor temperature</label><output id="outFixed" for="inFixed"></output>
      <input type="range" id="inFixed" min="-5" max="45" step="0.5" value="30">
    </div>
    <div class="field">
      <label for="inNightRH">Humidity at the coolest hour</label><output id="outNightRH" for="inNightRH"></output>
      <input type="range" id="inNightRH" min="40" max="100" step="1" value="95">
      <span class="hint">The water content of the air stays the same, so RH falls when the day warms.</span>
    </div>
  </section>
  <section>
    <h2 class="eyebrow">Growing blocks</h2>
    <div class="field">
      <label for="inBlocks">Number of blocks</label><output id="outBlocks" for="inBlocks"></output>
      <input type="range" id="inBlocks" min="0" max="8000" step="100" value="2000">
      <span class="hint" id="hintBlocks"></span>
    </div>
    <div class="rule-extra">
      <label class="num" for="inPerBlock">CO₂ per block</label>
      <input type="number" id="inPerBlock" min="1" max="1000" step="1" value="45"> <span>mL/h</span>
    </div>
    <div class="crop-row">
      <label for="inBlockStage">Block stage</label>
      <select id="inBlockStage"><option value="follow">Same as the controller</option><option value="spawn">Spawn run</option><option value="pinning">Pinning</option><option value="fruiting">Fruiting</option><option value="rest">Rest</option><option value="empty">Empty room</option></select>
    </div>
    <label class="chk"><input type="checkbox" id="inProbe" checked> Block probe (core temperature sensor in a block)</label>
    <details class="measure">
      <summary>Measure the CO₂ per block on your farm</summary>
      <ol>
        <li>Stop the exhaust fan and close the room.</li>
        <li>Record the CO₂ rise in ppm per minute over 10 min.</li>
        <li>Calculate: CO₂ per block (mL/h) = rise (ppm/min) × room volume (m³) × 60 ÷ number of blocks.</li>
      </ol>
      <p>Example: 25 ppm/min × 60 m³ × 60 ÷ 2,000 blocks = 45 mL/h. The value changes with the stage, so measure it again at each stage.</p>
    </details>
  </section>
  <section>
    <h2 class="eyebrow">Sensors</h2>
    <div class="field">
      <label for="inPeriod">Sensor reading period</label>
      <select id="inPeriod">
        <option value="5">5 s</option><option value="10">10 s</option><option value="30" selected>30 s</option>
        <option value="60">60 s</option><option value="120">120 s</option>
      </select>
      <span class="hint">The controller decides only when a new reading comes in. Between readings, the machines keep the last command.</span>
    </div>
    <label class="chk"><input type="checkbox" id="inNoise"> Add sensor noise</label>
    <div class="crop-row"><label for="inSensQ">Sensor quality</label>
      <select id="inSensQ"><option value="ideal">Ideal</option><option value="typical">Typical: +2 % RH, delay, drift</option><option value="poor">Poor: +4 % RH, slow</option></select></div>
    <div class="crop-row"><label for="inSensAt">Main sensors</label>
      <select id="inSensAt"><option value="mid">Middle of the room</option><option value="low">Low (bottom shelf)</option><option value="high">High (top shelf)</option></select></div>
    <div class="crop-row"><label for="inSens2">Second sensor set</label>
      <select id="inSens2"><option value="none">None</option><option value="mid">Next to the main set (spare)</option><option value="low">Low (bottom shelf)</option><option value="high">High (top shelf)</option></select></div>
    <p class="hint">A spare set must be next to the main set. In another position it measures other air, and a take-over gives a wrong value.</p>
    <details class="measure">
      <summary>Check an RH sensor (salt test)</summary>
      <ol>
        <li>Put the sensor in a closed box with a cup of wet table salt (sodium chloride). Keep the temperature stable.</li>
        <li>After 6–12 h, the sensor must read 75 %. Repeat with potassium sulfate: 97 %.</li>
        <li>Enter the difference as the sensor correction in "Machine protection and safe states".</li>
      </ol>
      <p>Above 95 % RH, normal sensors can stay wet and read 100 %. A heated probe prevents this. Protect the CO₂ sensor from condensation too.</p>
    </details>
    <div class="faults">
      <span class="faults-h">Sensor faults (for a test)</span>
      <label>Room temperature <select id="fT" data-name="room temperature"><option value="ok">Working</option><option value="frozen">Frozen value</option><option value="missing">No reading</option><option value="range">Out of range</option><option value="spike">Spikes</option></select></label>
      <label>Room humidity <select id="fRH" data-name="room humidity"><option value="ok">Working</option><option value="frozen">Frozen value</option><option value="missing">No reading</option><option value="range">Out of range</option><option value="spike">Spikes</option></select></label>
      <label>CO₂ <select id="fCO2" data-name="CO₂"><option value="ok">Working</option><option value="frozen">Frozen value</option><option value="missing">No reading</option><option value="range">Out of range</option><option value="spike">Spikes</option></select></label>
      <label>Outdoor <select id="fOut" data-name="outdoor"><option value="ok">Working</option><option value="frozen">Frozen value</option><option value="missing">No reading</option><option value="range">Out of range</option><option value="spike">Spikes</option></select></label>
    </div>
    <div class="cal-row">
      <button class="btn" id="calSample">Download a sample log (last 24 h)</button>
      <span class="tag" id="calSampleMsg"></span>
    </div>
  </section>
</aside>
<section class="card sim simextra" aria-label="Room set-up and disturbances">
  <section>
    <h2 class="eyebrow">Air path</h2>
    <div class="crop-row"><label for="inVent">Fresh air</label>
      <select id="inVent"><option value="exhaust">Exhaust fan, open inlet (room under suction)</option><option value="supply">Filtered supply fan, damper out (slight over-pressure)</option></select></div>
    <div class="crop-row"><label for="inInlet">Air comes in</label><select id="inInlet"><option value="low">Low</option><option value="high">High</option></select></div>
    <div class="crop-row"><label for="inOutlet">Air goes out</label><select id="inOutlet"><option value="high">High</option><option value="low">Low</option></select></div>
    <p class="hint">CO₂ collects low. Air in high and out low removes it best.</p>
  </section>
  <section>
    <h2 class="eyebrow">Disturbances</h2>
    <label class="chk"><input type="checkbox" id="inDoors"> Door open and 2 workers at each harvest (08:00, 16:00)</label>
    <label class="chk"><input type="checkbox" id="inRandWx"> Random rain and cloudy days</label>
    <div class="dist-btns">
      <button class="btn" data-dist="door">Open the door 10 min</button>
      <button class="btn" data-dist="workers">2 workers for 1 h</button>
      <button class="btn" data-dist="water">Water the floor</button>
      <button class="btn" data-dist="rain">Rain for 2 h</button>
      <button class="btn" data-dist="cloudy">Cloudy day</button>
    </div>
  </section>
  <section>
    <h2 class="eyebrow">Air conditioner unit</h2>
    <div class="rule-extra">
      <label class="num" for="inBoost">Full speed after each AC start</label>
      <input type="number" id="inBoost" min="0" max="30" step="0.5" value="3"> <span>min</span>
    </div>
    <p class="hint">This sets the extra energy of each compressor restart. Measure it on your AC with a power meter.</p>
  </section>
  <details>
    <summary>Room and machine model</summary>
    <dl>
      <dt>Room</dt><dd>60 m³, envelope 80 W/K, air leakage 0.4 changes/h</dd>
      <dt>Heat load</dt><dd>30 W base; lights 80 W 07:00–19:00; sun on roof up to 500 W at 13:00</dd>
      <dt>Blocks</dt><dd>default 45 mL/h CO₂ each (an estimate; measure it)</dd>
      <dt>Respiration</dt><dd>per 1 L/min CO₂: 318 W heat, 44 g/h water</dd>
      <dt>Air conditioner</dt><dd>3.5 kW split inverter with its own thermostat: return-air sensor 0.8 °C above the room, on at +0.5 °C, off at −1 °C, 3 min restart delay</dd>
      <dt>Fogger levels</dt><dd>1: 1 kg/h 70 W · 2: 2 kg/h 135 W · 3: 3 kg/h 200 W</dd>
      <dt>Fan levels</dt><dd>Low 300 m³/h 60 W · Medium 600 m³/h 90 W · High 900 m³/h 120 W</dd>
    </dl>
  </details>
</section>
<div class="section-head">
  <h2>Climate controller</h2>
  <p>The part that runs the machines. It sees only the sensor readings.</p>
</div>
<div id="panelHost" class="contents"></div>
${faceplate('ac', 'Air conditioner', 'ACU-201 · split 3.5 kW · setpoint', '', `
    <div class="fp-state"><span class="state" id="acState">Off</span><span class="pw" id="acPower">3 W</span></div>
    <div class="meter" aria-hidden="true"><span id="acMeter"></span></div>
    <p class="why" id="acWhy"></p>`)}
${faceplate('hu', 'Fogger', 'HU-202 · 3 levels', '', `
    <div class="fp-state"><span class="state" id="huState">Off</span><span class="pw" id="huPower">2 W</span></div>
    <div class="meter" aria-hidden="true"><span id="huMeter"></span></div>
    <p class="why" id="huWhy"></p>`)}
${faceplate('fan', 'Exhaust fan', 'EF-203 · 3 levels', '', `
    <div class="fp-state"><span class="state" id="fanState">Off</span><span class="pw" id="fanPower">0 W</span></div>
    <div class="meter" aria-hidden="true"><span id="fanMeter"></span></div>
    <p class="why" id="fanWhy"></p>`)}
${faceplate('lights', 'Lights', 'LT-204 · 80 W', 'small', `
    <div class="fp-state"><span class="state" id="liState">Off</span><span class="pw" id="liPower">0 W</span></div>
    <p class="why" id="liWhy"></p>`)}
${faceplate('circ', 'Circulation fan', 'CF-205 · 40 W', 'small', `
    <div class="fp-state"><span class="state" id="ciState">Off</span><span class="pw" id="ciPower">0 W</span></div>
    <p class="why" id="ciWhy"></p>`)}
<section class="card faceplate wide" aria-labelledby="hWa">
  <h2 class="eyebrow" id="hWa">Water and air (meters)</h2>
  <div class="duty">
    <div><span class="num" id="wFog">–</span><span class="lbl">fog water, kg/day</span></div>
    <div><span class="num" id="wAc">–</span><span class="lbl">AC coil removed, kg/day</span></div>
    <div><span class="num" id="wAir">–</span><span class="lbl">unfiltered air in, m³/day</span></div>
    <div><span class="num" id="wVpd">–</span><span class="lbl">VPD now / target, kPa</span></div>
  </div>
  <p class="hint" id="wNote"></p>
</section>
<div class="filters">
  <span class="eyebrow">Time window</span>
  <div class="seg" role="group" aria-label="Chart time window" id="winSeg">
    <button data-win="3600" aria-pressed="false">1 h</button>
    <button data-win="21600" aria-pressed="true">6 h</button>
    <button data-win="86400" aria-pressed="false">24 h</button>
  </div>
  <button class="btn" id="tableBtn" aria-expanded="false" aria-controls="tableCard">Show data table</button>
  <span class="tag"><span class="nightkey"></span>Night (19:00–07:00). Point at a chart or use the arrow keys to read past values.</span>
</div>
<div class="contents" id="trendHost"></div>
<section class="card energy" aria-labelledby="hE">
  <h2 id="hE">Energy since reset</h2>
  <div class="e-hero">
    <div><span class="num" id="eKwh">0.000</span><span class="lbl">kWh total</span></div>
    <div><span class="num" id="eDay">0.0</span><span class="lbl">kWh per day</span></div>
    <div><span class="num" id="eCost">0.00</span><span class="lbl">RM cost</span></div>
  </div>
  <div class="e-rows">
    <div class="e-row" style="--key:var(--s-ac)"><span class="nm"><i></i>Air conditioner</span><span class="v" id="eAc"></span><span class="track"><span id="eAcBar"></span></span></div>
    <div class="e-row" style="--key:var(--s-hu)"><span class="nm"><i></i>Fogger</span><span class="v" id="eHu"></span><span class="track"><span id="eHuBar"></span></span></div>
    <div class="e-row" style="--key:var(--s-fan)"><span class="nm"><i></i>Exhaust fan</span><span class="v" id="eFan"></span><span class="track"><span id="eFanBar"></span></span></div>
    <div class="e-row" style="--key:var(--s-li)"><span class="nm"><i></i>Lights</span><span class="v" id="eLi"></span><span class="track"><span id="eLiBar"></span></span></div>
    <div class="e-row" style="--key:var(--s-ci)"><span class="nm"><i></i>Circulation</span><span class="v" id="eCi"></span><span class="track"><span id="eCiBar"></span></span></div>
  </div>
  <label class="tariff">Tariff <input type="number" id="inTariff" min="0" step="0.01" value="0.57"> RM per kWh</label>
</section>
<section class="card exhaust" aria-labelledby="hExh">
  <div class="rules-head">
    <h2 id="hExh">Exhaust per hour</h2>
    <span class="tag">Controller record. Air volume = fan run time × airflow of the fan level.</span>
  </div>
  <div class="e-hero">
    <div><span class="num" id="xAvgStarts">–</span><span class="lbl">purges per hour</span></div>
    <div><span class="num" id="xAvgRun">–</span><span class="lbl">fan run per hour</span></div>
    <div><span class="num" id="xAvgAch">–</span><span class="lbl">air changes per hour</span></div>
    <div><span class="num" id="xTotM3">0</span><span class="lbl">m³ exhausted, last 24 h</span></div>
  </div>
  <p class="est-note" style="margin:0 0 4px">Fan run minutes per hour, last 24 h (point at a bar for the values). The averages use the full hours.</p>
  <div id="exhChart" class="ch-host"></div>
  <div class="exh-grid">
    <div>
      <h3 class="eyebrow">Each hour</h3>
      <table><thead><tr><th>Hour</th><th>Purges</th><th>Run (min:s)</th><th>Air out (m³)</th><th>Air changes</th></tr></thead><tbody id="exhRows"></tbody></table>
    </div>
    <div>
      <h3 class="eyebrow">Each exhaust (newest first)</h3>
      <div class="exh-scroll">
        <table><thead><tr><th>Start</th><th>End</th><th>Time (min:s)</th><th>Level</th><th>Reason</th><th>CO₂ start → end</th><th>Air out (m³)</th></tr></thead><tbody id="exhEvents"></tbody></table>
      </div>
    </div>
  </div>
</section>
<section class="card estimate" aria-labelledby="hEst">
  <div class="est-head">
    <h2 id="hEst">Test the rules over 24 h</h2>
    <button class="btn" id="estBtn">Run 24 h test</button>
    <span class="tag">Runs a copy of the simulation from now: 1 h to settle, then 24 h. The live run does not change.</span>
  </div>
  <div class="est-out" id="estOut"><p class="est-note">Run the test to compare four rule sets: your rules, AC off during a purge, no AC rule during a purge, and no humidity priority.</p></div>
</section>
<section class="card tablecard" id="tableCard" hidden aria-labelledby="hTab">
  <h2 class="eyebrow" id="hTab">Recent sensor readings (newest first)</h2>
  <table>
    <thead><tr><th>Time</th><th>Temp °C</th><th>RH %</th><th>CO₂ ppm</th><th>Outdoor °C</th><th>Outdoor RH %</th><th>Core °C</th><th>VPD kPa</th><th>AC set °C</th><th>AC W</th><th>Fogger W</th><th>Fan W</th></tr></thead>
    <tbody id="tbody"></tbody>
  </table>
</section>
<section class="card alarms" aria-labelledby="hAl">
  <h2 class="eyebrow" id="hAl">Alarms</h2>
  <ul id="alarmList" class="al-list"></ul>
</section>
<section class="card log" aria-labelledby="hLog">
  <h2 class="eyebrow" id="hLog">Controller event log</h2>
  <ol id="log" aria-live="polite"></ol>
</section>`;

// ---------------- Wiring (mount only) ----------------
function bindRange(root, id, outId, fmt, apply) {
  const elIn = root.querySelector('#' + id), out = root.querySelector('#' + outId);
  const upd = () => { const v = parseFloat(elIn.value); apply(v); out.textContent = fmt(v); };
  elIn.addEventListener('input', upd); upd();
}
const setRange = (root, id, v) => { const elIn = root.querySelector('#' + id); elIn.value = v; elIn.dispatchEvent(new Event('input')); };

function handlePanelChange(changes) {
  let usedFarmType = false;
  for (const c of changes) {
    if (c.path === 'farmType') { ctl.setFarmType(c.new, reading.t); usedFarmType = true; }
    else if (c.path === 'crop') { ctl.setCrop(c.new, reading.t); scheduleCropCheck(); }
    else if (c.path === 'stage') { if (!usedFarmType) { ctl.setStage(c.new, reading.t); scheduleCropCheck(); } }
    else {
      setPath(cfg, c.path, c.new);
      if (RAMP_PATHS.has(c.path)) ctl.cancelRamp();
      if (c.path.startsWith('manual.') && c.path.endsWith('.auto')) {
        const dev = c.path.split('.')[1];
        onEvent({ t: reading.t, lvl: 'info', text: `${DEV_NAME[dev]} set to ${c.new ? 'auto' : 'manual'}` });
      }
      if (c.path.startsWith('offsets.')) {
        const k = c.path.split('.')[1];
        onEvent({ t: reading.t, lvl: 'info', text: `Sensor correction ${k}: ${cfg.offsets[k] >= 0 ? '+' : ''}${cfg.offsets[k]}` });
      }
    }
  }
  panel.set(cfg);
  updateLadderLive();
  chartsDirty = true;
}

function wire() {
  const root = el;
  const $ = sel => root.querySelector(sel);

  root.querySelector('#inCycle').addEventListener('change', e => {
    env.dailyCycle = e.target.checked;
    root.querySelector('#cycleFields').hidden = !env.dailyCycle; root.querySelector('#fixedField').hidden = env.dailyCycle;
  });
  bindRange(root, 'inHigh', 'outHigh', v => `${v.toFixed(1)} °C`, v => { env.tHigh = v; if (env.tLow > v - 1) setRange(root, 'inLow', v - 1); });
  bindRange(root, 'inLow', 'outLow', v => `${v.toFixed(1)} °C`, v => { env.tLow = v; if (env.tHigh < v + 1) setRange(root, 'inHigh', v + 1); });
  bindRange(root, 'inFixed', 'outFixed', v => `${v.toFixed(1)} °C`, v => { env.tFixed = v; });
  bindRange(root, 'inNightRH', 'outNightRH', v => `${v} %`, v => { env.nightRH = v; });
  bindRange(root, 'inBlocks', 'outBlocks', v => v.toLocaleString('en'), v => { env.blocks = v; paintBlocks(); });
  $('#inPerBlock').addEventListener('change', e => {
    env.co2PerBlock = UI.clamp(parseFloat(e.target.value) || env.co2PerBlock, 1, 1000);
    e.target.value = env.co2PerBlock; paintBlocks();
  });
  $('#inPeriod').addEventListener('change', e => { env.sensorPeriod = +e.target.value; });
  $('#inNoise').addEventListener('change', e => { env.noise = e.target.checked; });
  for (const [id, k] of [['fT', 'T'], ['fRH', 'RH'], ['fCO2', 'CO2'], ['fOut', 'out']]) {
    $('#' + id).addEventListener('change', e => {
      env.faults[k] = e.target.value;
      onEvent({ t: reading.t, lvl: 'info', text: `Simulation: ${e.target.dataset.name} sensor set to "${e.target.selectedOptions[0].text}"` });
    });
  }
  $('#inBoost').addEventListener('change', e => { env.acStartBoostMin = UI.clamp(parseFloat(e.target.value) || 0, 0, 30); e.target.value = env.acStartBoostMin; });
  $('#inTariff').addEventListener('input', e => { const v = parseFloat(e.target.value); input.tariff = isFinite(v) && v >= 0 ? v : 0; });
  $('#ackBtn').addEventListener('click', () => { ctl.ack(); onEvent({ t: reading.t, lvl: 'info', text: 'All alarms acknowledged' }); updateUi(); });

  const selBind = (id, get, setv) => { const elIn = $('#' + id); elIn.value = String(get()); elIn.addEventListener('change', e => setv(e.target.value)); };
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
  root.querySelectorAll('[data-dist]').forEach(b => b.addEventListener('click', () => {
    sim.trigger(b.dataset.dist);
    onEvent({ t: reading.t, lvl: 'info', text: `Simulation: ${b.textContent.toLowerCase()}` });
  }));

  $('#calSample').addEventListener('click', () => {
    const rows = calLogFromSamples();
    if (rows.length < 60) { UI.set('calSampleMsg', 'Run the simulation for 1 h or more first.'); return; }
    const blob = new Blob([CAL.toCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sample-room-log.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    UI.set('calSampleMsg', '');
  });

  $('#benchBtn').addEventListener('click', e => {
    const on = root.dataset.bench !== 'on';
    benchFlag = on ? 'on' : 'off';
    root.dataset.bench = benchFlag;
    e.target.setAttribute('aria-expanded', String(on));
    e.target.textContent = on ? 'Hide test bench settings' : 'Show test bench settings';
  });

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
  $('#resetBtn').addEventListener('click', () => { reset(); alarmKey = ''; exhKey = ''; updateLadderLive(); updateUi(); });
  $('#tableBtn').addEventListener('click', e => {
    const card = $('#tableCard'); card.hidden = !card.hidden;
    e.target.setAttribute('aria-expanded', String(!card.hidden));
    e.target.textContent = card.hidden ? 'Show data table' : 'Hide data table';
    chartsDirty = true;
  });
  $('#estBtn').addEventListener('click', e => {
    const btn = e.target; btn.disabled = true; btn.textContent = 'Running…';
    setTimeout(() => { if (!mounted) return; renderTest(); btn.disabled = false; btn.textContent = 'Run 24 h test again'; }, 30);
  });

  // ---- Simulation controls that mirror env/cfg (initial paint) ----
  root.querySelector('#inFixed').hidden = env.dailyCycle !== false;
  root.querySelector('#cycleFields').hidden = env.dailyCycle === false;
  root.querySelector('#fixedField').hidden = env.dailyCycle !== false;
  root.querySelector('#inCycle').checked = env.dailyCycle !== false;
  setRange(root, 'inHigh', env.tHigh); setRange(root, 'inLow', env.tLow); setRange(root, 'inFixed', env.tFixed); setRange(root, 'inNightRH', env.nightRH);
  setRange(root, 'inBlocks', env.blocks);
  $('#inPerBlock').value = env.co2PerBlock;
  $('#inPeriod').value = String(env.sensorPeriod);
  $('#inNoise').checked = env.noise;
  for (const [id, k] of [['fT', 'T'], ['fRH', 'RH'], ['fCO2', 'CO2'], ['fOut', 'out']]) $('#' + id).value = env.faults[k];
  $('#inBoost').value = env.acStartBoostMin;
  $('#inTariff').value = input.tariff;
  paintBlocks();

  // ---- Settings panel (7.8) ----
  panel = global.FarmSettingsPanel.createSettingsPanel($('#panelHost'), {
    settings: cfg, readOnly: false, getCommand: () => ctl.state.cmd, onChange: handlePanelChange,
  });
  // Fill the panel's slots (7.3).
  const fill = (slot, ids) => {
    const host = $(`[data-slot="${slot}"]`);
    for (const id of ids) { const p = document.createElement('p'); p.className = 'prog-status'; p.id = id; host.append(p); }
  };
  fill('program-status', ['progStatus', 'progRamp', 'progHarvest']);
  const cropCheckP = document.createElement('p'); cropCheckP.className = 'prog-status crop-check'; cropCheckP.id = 'cropCheck';
  $(`[data-slot="crop-check"]`).append(cropCheckP);
  const vpdP = document.createElement('p'); vpdP.className = 'prog-status'; vpdP.id = 'vpdLine';
  $(`[data-slot="targets-status"]`).append(vpdP);
  const rulesSide = $(`[data-slot="rules-side"]`);
  const ladderHost = document.createElement('div'); rulesSide.append(ladderHost);
  const note = document.createElement('p'); note.className = 'lad-note';
  note.textContent = 'Solid: the rule acts. Hatched: the machine keeps its last state. Black line: CO₂ now. Dashed lines: CO₂ limit, and the safety level (red).';
  const duty = document.createElement('div'); duty.className = 'duty';
  duty.innerHTML = `
    <div><span class="num" id="dFanOn">0 min</span><span class="lbl" id="dFanOnL">fan run time</span></div>
    <div><span class="num" id="dFanStarts">0</span><span class="lbl" id="dFanStartsL">fan starts</span></div>
    <div class="inst"><span class="num" id="dSetback">0 min</span><span class="lbl">AC setback time</span></div>
    <div class="inst"><span class="num" id="dAcCmds">0</span><span class="lbl" id="dAcCmdsL">AC commands</span></div>
    <div><span class="num" id="dFanBlocked">0 min</span><span class="lbl">fan stopped by humidity</span></div>
    <div class="inst"><span class="num" id="dFogStarts">0</span><span class="lbl" id="dFogStartsL">fogger starts</span></div>`;
  rulesSide.append(note, duty);
  ladder = global.FarmCharts.createLadder(ladderHost);

  // ---- Trend and power charts ----
  trendCharts = global.FarmCharts.createTrendCharts($('#trendHost'), {
    keys: ['T', 'RH', 'C'], power: true, clock: clock(), status: kind => ctl.status(kind),
  });

  buildMimicExtras();
}

// ---------------- mount / unmount (3.1) ----------------
function stopFrame() { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

function frame(now) {
  if (!mounted) return;
  const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) {
    acc += dtReal * speed;
    let n = 0;
    while (acc >= 1 && n < 4000) { tick(); acc -= 1; n++; }
  }
  animateMimic(dtReal);
  if (now - lastUi > 150) { updateUi(); paintProgram(); lastUi = now; }
  if (chartsDirty && now - lastChart > 200) { drawCharts(); lastChart = now; }
  rafId = requestAnimationFrame(frame);
}

function mount(viewEl) {
  ensureState();
  mounted = true; el = viewEl; mountGen++;
  el.dataset.bench = benchFlag;
  el.innerHTML = MARKUP;
  logDirty = true; chartsDirty = true; alarmKey = ''; exhKey = ''; lastStage = '';
  wire();
  updateLadderLive();
  updateUi();
  paintProgram();
  scheduleCropCheck();
  last = performance.now(); acc = 0; lastUi = 0; lastChart = 0;
  rafId = requestAnimationFrame(frame);
  global.__climate = {
    get sim() { return sim; }, get ctl() { return ctl; },
    cfg, env, tick, runTest, get reading() { return reading; },
  };
}
function unmount() {
  mounted = false;
  stopFrame();
  clearTimeout(cropCheckTimer);
  if (trendCharts) { trendCharts.destroy(); trendCharts = null; }
  if (ladder) { ladder.destroy(); ladder = null; }
  if (panel) { panel.destroy(); panel = null; }
  delete global.__climate;
  el = null;
}

// ---------------- FarmBench: wave 1 bridge (3.5) ----------------
const FarmBench = {
  get env() { ensureState(); return env; },
  get cfg() { ensureState(); return cfg; },
  get tariff() { ensureState(); return input.tariff; },
  get calApplied() { return calApplied; },
  applyCalib(params, rmse) {
    ensureState();
    env.room = { ...(env.room || {}), ua: params.ua, infAch: params.infAch, moistBuffer: params.moistBuffer };
    env.co2PerBlock = Math.round(params.co2PerBlock);
    calApplied = { ua: params.ua, infAch: params.infAch, moistBuffer: params.moistBuffer, co2PerBlock: env.co2PerBlock, rmse, date: new Date().toISOString() };
    onEvent({ t: reading ? reading.t : 0, lvl: 'info', text: `Simulation calibrated: heat loss ${params.ua.toFixed(0)} W/K, leakage ${params.infAch.toFixed(2)}/h, moisture buffer ${params.moistBuffer.toFixed(1)}, CO₂ ${env.co2PerBlock} mL/h per block` });
    if (mounted && el) {
      const inPerBlock = el.querySelector('#inPerBlock');
      if (inPerBlock) { inPerBlock.value = env.co2PerBlock; paintBlocks(); }
    }
  },
};

global.FarmBench = FarmBench;
global.FarmShell.register('simulator', { mount, unmount });
})(typeof window !== 'undefined' ? window : globalThis);
