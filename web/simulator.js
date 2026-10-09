// web/simulator.js: today's test bench, moved from the old dashboard script (docs/contracts/web.md C5 3.1-3.3, 3.5, 7.8).
(function (global) {
'use strict';

const SIM = global.ClimateSim, CC = global.ClimateController, RT = global.ClimateRuntime, CAL = global.ClimateCalib;
const PL = SIM.PLANT;

// ---------------- Simulator state (closure; created once, survives module switches: C5 3.1, 6.1) ----------------
let env = null, cfg = null, input = null;
let sim = null, ctl = null, io = null, rt = null, reading = null, cmd = null;
let samples = [], events = [];
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
  events = []; samples = [];
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
  const R = cfg.rules, c = ctl.state.cmd;
  samples.push({ t: r.t, T: plausible('T', r.T), RH: plausible('RH', r.RH), C: plausible('CO2', r.CO2),
    tOut: plausible('tOut', r.tOut), rhOut: plausible('rhOut', r.rhOut),
    ac: r.power.ac, hu: r.power.hu, air: r.power.air, li: r.power.lights || 0, ci: r.power.circ || 0,
    acSet: c.ac.power ? c.ac.setpoint : NaN,
    core: r.core != null ? r.core : NaN, vpd: ctl.state.vpd ?? NaN,
    cmd: { air: c.air.on ? 1 : 0, fog: c.hu.level, acPower: c.ac.power ? 1 : 0, acMode: c.ac.mode,
      acSet: c.ac.setpoint, acFan: c.ac.fan, lights: c.lights.on ? 1 : 0, circ: c.circ.on ? 1 : 0 },
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
  if (parts.some(p => p === '__proto__' || p === 'constructor' || p === 'prototype')) throw new Error(`Setting "${path}" is not allowed.`);
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { const p = parts[i]; if (!Object.hasOwn(o, p) || !o[p] || typeof o[p] !== 'object') o[p] = {}; o = o[p]; }
  o[parts[parts.length - 1]] = value;
}

const RAMP_PATHS = new Set(['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff']); // C9 5.2 RAMP_KEYS
const DEV_NAME = { ac: 'Air conditioner', hu: 'Fogger', air: 'Air exchange', lights: 'Lights', circ: 'Circulation fan' };

// ---------------- Per-mount state ----------------
let mounted = false, el = null, mountGen = 0;
let benchFlag = 'off'; // closure variable, survives a module switch (6.1 "Simulator bench flag")
let trendCharts = null, ladder = null, panel = null;
let chartsDirty = true, logDirty = true, windowS = 21600, speed = 600, paused = false;
let lastStage = '', alarmKey = '', exhKey = '', cropCheckTimer = null;
let rafId = null, last = 0, acc = 0, lastUi = 0, lastChart = 0, exhRo = null;

function calParamsNow() { return CAL.paramsOf(env); }

function paintBlocks() {
  const lpm = SIM.co2Lpm(env);
  UI.set('hintBlocks', env.blocks === 0 ? 'The room is empty: no CO₂, heat, or water from blocks.'
    : `Together they make ${lpm.toFixed(2)} L/min of CO₂, ${Math.round(lpm * PL.resp.wPerLpm)} W of heat, and ${Math.round(lpm * PL.resp.gpsPerLpm * 3600)} g/h of water.`);
}
// The air exchange size (C9 7): the faceplate tag and the plant facts line.
function paintAirSize() {
  const m3h = env.airM3h ?? PL.air.m3h, n = m3h.toLocaleString('en');
  UI.set('fpAirTag', `SF-203 + EF-206 · ${n} m³/h`);
  UI.set('plantAir', `${n} m³/h, ${Math.round(m3h * PL.air.wPerM3h)} W while on`);
}

// ---------------- Mimic animation ----------------
let mist = [], bubbles = [], caps = [];
let animAcFlows = [], animFanFlows = [];
const anim = { fan: 0, cond: 0, circ: 0, acFlow: 0, fanFlow: 0 };
let ventKey = '';
const reduceMotion = () => (typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false);
let fanInBlades = null, fanOutBlades = null;
function buildMimicExtras() {
  fanInBlades = el.querySelector('#fanInBlades'); fanOutBlades = el.querySelector('#fanOutBlades');
  mist = []; bubbles = []; caps = [];
  for (let i = 0; i < 16; i++) mist.push({ ph: i / 16, dx: (Math.random() - 0.5) * 14, elm: UI.svgEl('circle', { class: 'mist', r: 3 }, el.querySelector('#mist')) });
  for (let i = 0; i < 14; i++) bubbles.push({ ph: i / 14, dx: Math.random() * 136, elm: UI.svgEl('circle', { class: 'bubble', r: 2.5 }, el.querySelector('#bubbles')) });
  const g = el.querySelector('#bags');
  for (const y0 of [324, 374]) for (let i = 0; i < 5; i++) {
    const x = 246 + i * 29;
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
  ventKey = ''; glanceKey = '';
}
// Places the intake fan, the exhaust fan, their arrows and texts for env.inletAt / env.exhaustAt (on a change only).
const VENT_Y = { high: 160, low: 352 };
function layoutVents() {
  const key = `${env.inletAt}|${env.exhaustAt}`;
  if (key === ventKey) return;
  ventKey = key;
  const L = mimicLayout(env), flows = el.querySelector('#ventFlows'), txt = el.querySelector('#ventText');
  flows.replaceChildren(); txt.replaceChildren();
  for (const side of ['inlet', 'outlet']) {
    const o = L[side], y = VENT_Y[o.band], left = side === 'inlet';
    el.querySelector(left ? '#fanIn' : '#fanOut').setAttribute('transform', `translate(${left ? 180 : 820} ${y})`);
    const [x1, x2] = left ? [60, 134] : [866, 990];
    for (const d of [-18, 0, 18]) UI.svgEl('path', { class: 'flow fan', 'data-flow': 'fan', d: `M${x1} ${y + d} H${x2}`, 'marker-end': 'url(#arFan)' }, flows);
    const lines = [['m-tag', null, o.tag, 0], ['m-small', left ? 'mInState' : 'mOutState', '', 17], ['m-small', null, o.label, 17]];
    let ty = o.band === 'high' ? 226 : 300 - lines.reduce((h, l) => h + l[3], 0);
    for (const [cls, id, text, gap] of lines) {
      ty += gap;
      UI.svgEl('text', { x: left ? 12 : 836, y: ty, class: cls, ...(id ? { id } : {}) }, txt).textContent = text;
    }
  }
  animFanFlows = [...flows.querySelectorAll('[data-flow="fan"]')];
}
const paintCaps = () => { const sc = { spawn: 0, pinning: 0.35, fruiting: 1, rest: 0.12 }[cfg.stage]; for (const c of caps) c.style.transform = `scale(${sc})`; };
function animateMimic(dtReal) {
  const a = sim.view().act, move = !reduceMotion() && !paused;
  const fanF = a.air ? 1 : 0, fogF = a.huLevel / 3;
  if (move) {
    anim.fan = (anim.fan + 1080 * fanF * dtReal) % 360;
    anim.cond = (anim.cond + 720 * (a.comp ? 0.3 + a.acFrac : 0) * dtReal) % 360;
    anim.circ = (anim.circ + 900 * (a.circ ? 1 : 0) * dtReal) % 360;
    anim.acFlow -= dtReal * 40 * (0.5 + a.acFrac);
    anim.fanFlow -= dtReal * 60 * (0.3 + fanF);
  }
  const fanRot = `rotate(${anim.fan.toFixed(1)})`;
  fanInBlades.setAttribute('transform', fanRot);
  fanOutBlades.setAttribute('transform', fanRot);
  el.querySelector('#condBlades').setAttribute('transform', `rotate(${anim.cond.toFixed(1)})`);
  el.querySelector('#circBlades').setAttribute('transform', `rotate(${anim.circ.toFixed(1)})`);
  for (const f of animAcFlows) { f.style.opacity = !a.power ? 0 : a.comp ? 0.35 + 0.65 * a.acFrac : 0.2; f.style.strokeDashoffset = anim.acFlow; }
  for (const f of animFanFlows) { f.style.opacity = fanF > 0 ? 0.35 + 0.65 * fanF : 0; f.style.strokeDashoffset = anim.fanFlow; }
  for (const p of mist) {
    if (move) { p.ph += dtReal * (0.25 + 0.5 * fogF); if (p.ph > 1) { p.ph -= 1; p.dx = (Math.random() - 0.5) * 14; } }
    p.elm.setAttribute('cx', (722 + p.dx + Math.sin(p.ph * 7 + p.dx) * 4).toFixed(1));
    p.elm.setAttribute('cy', (322 - p.ph * 80).toFixed(1));
    p.elm.setAttribute('r', (2.5 + p.ph * 6).toFixed(1));
    p.elm.style.opacity = (fogF * (1 - p.ph) * 0.7).toFixed(2);
  }
  const lpm = SIM.co2Lpm(env), co2Vis = UI.clamp(lpm / 3, 0, 1);
  for (const b of bubbles) {
    if (move) { b.ph += dtReal * (0.3 + 0.1 * lpm); if (b.ph > 1) { b.ph -= 1; b.dx = Math.random() * 136; } }
    b.elm.setAttribute('cx', (249 + b.dx + Math.sin(b.ph * 9 + b.dx) * 3).toFixed(1));
    b.elm.setAttribute('cy', (318 - b.ph * 46).toFixed(1));
    b.elm.style.opacity = (co2Vis * (1 - b.ph)).toFixed(2);
  }
}

// ---------------- UI update ----------------
const AC_WORD = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' };
const UI = global.FarmUi;
const clock = () => UI.simClock(env.startHour);

function updateUi() {
  const v = sim.view(), r = reading, st = ctl.state, R = cfg.rules;
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
  UI.set('mLamp', v.lights ? `Lights on · ${UI.watts(v.power.lights)}` : 'Lights off');
  const vol = { ...PL.room, ...(env.room || {}) }.volume, kwhAll = Object.values(v.kwh).reduce((x, y) => x + y, 0);
  UI.set('mRoomName', `FRUITING ROOM · ${vol} m³`);
  UI.set('mAch', `Fresh air ${(v.airM3h / vol).toFixed(1)} changes an hour`);
  UI.set('mPowerNow', `Power now ${UI.watts(Object.values(v.power).reduce((x, y) => x + y, 0))} · ${kwhAll.toFixed(1)} kWh so far`);
  const readout = (id, txt, s) => {
    const g = el.querySelector('#' + id); g.dataset.lvl = s.lvl;
    const val = g.querySelector('.val'), ic = g.querySelector('.ico');
    if (val.textContent !== txt) val.textContent = txt;
    if (ic.textContent !== s.icon) ic.textContent = s.icon;
  };
  readout('mT', `${UI.fmtNum(r.T, 1)} °C`, ctl.status('T'));
  readout('mRH', `${UI.fmtNum(r.RH, 0)} % RH`, ctl.status('RH'));
  readout('mC', `${UI.fmtNum(r.CO2, 0)} ppm`, ctl.status('CO2'));
  const Z = v.zones, zone = (id, k, d) => { const t = `low ${Z.lo[k].toFixed(d)} · high ${Z.hi[k].toFixed(d)}`, z = el.querySelector(`#${id} .zn`); if (z.textContent !== t) z.textContent = t; };
  zone('mT', 'T', 1); zone('mRH', 'RH', 0); zone('mC', 'C', 0);
  const a = v.act;
  UI.set('mAcState', !a.power ? 'Off' : `${AC_WORD[a.mode]} ${a.setpoint.toFixed(1)}° · ${a.comp ? `comp ${UI.pct(a.acFrac)}` : 'comp idle'}`);
  UI.set('mAcPower', `${UI.watts(v.power.ac)}${a.comp ? ` · COP ${v.cop.toFixed(1)}` : ''}`);
  UI.set('mCondState', a.comp ? 'Running' : 'Idle');
  UI.set('mHuState', a.huLevel > 0 ? `Level ${a.huLevel} · ${(v.fogGph / 1000).toFixed(1)} L/h` : 'Off');
  UI.set('mHuPower', UI.watts(v.power.hu));
  UI.set('mCircState', a.circ ? `On · ${UI.watts(v.power.circ)}` : 'Off');
  layoutVents();
  const airTxt = a.air ? `Purge ${Math.round(v.airM3h).toLocaleString('en')} m³/h` : 'Off · dampers closed';
  UI.set('mInState', airTxt); UI.set('mOutState', airTxt);
  UI.set('mCo2Src', `${env.blocks.toLocaleString('en')} blocks`);
  UI.set('mCore', `Core ${v.core.toFixed(1)} °C`);
  el.querySelector('#acUnit').classList.toggle('on', a.comp);
  el.querySelector('#condenser').classList.toggle('on', a.comp);
  el.querySelector('#huUnit').classList.toggle('on', a.huLevel > 0);
  el.querySelector('#fanIn').classList.toggle('on', a.air);
  el.querySelector('#fanOut').classList.toggle('on', a.air);
  el.querySelector('#circUnit').classList.toggle('on', a.circ);
  UI.set('mimicStage', `${CC.CROPS[cfg.crop].name} · ${CC.STAGES[cfg.stage]} · live`);
  const dist = [v.door && 'door open', v.workers && `${v.workers} workers`, v.watering && 'floor wet', v.weather.rain && 'rain', v.weather.cloudy && 'cloudy', v.wetSensor && 'RH sensor wet'].filter(Boolean);
  UI.set('mimicNote', dist.join(' · '));

  const c = st.cmd, hold = (why, h) => (h ? `${why} ${h}` : why);
  UI.set('acState', !c.ac.power ? 'Off' : `${AC_WORD[c.ac.mode]} · set ${c.ac.setpoint.toFixed(1)} °C`);
  UI.set('acPower', UI.watts(v.power.ac));
  el.querySelector('#acMeter').style.width = `${UI.clamp(v.power.ac / 1400, 0, 1) * 100}%`;
  UI.set('acWhy', hold(st.why.ac, st.hold.ac));
  UI.set('huState', c.hu.level > 0 ? `Level ${c.hu.level} of 3` : 'Standby');
  UI.set('huPower', UI.watts(v.power.hu));
  el.querySelector('#huMeter').style.width = `${c.hu.level / 3 * 100}%`;
  UI.set('huWhy', hold(st.why.hu, st.hold.hu));
  const air = airText({ st, cur: ctl.purges().cur, rules: R, manual: cfg.manual.air, t: v.t });
  UI.set('airState', air.state);
  UI.set('airPower', UI.watts(v.power.air));
  UI.set('airWhy', hold(st.why.air, st.hold.air));
  UI.set('liState', c.lights.on ? 'On' : 'Off'); UI.set('liPower', UI.watts(v.power.lights)); UI.set('liWhy', st.why.lights);
  UI.set('ciState', c.circ.on ? 'On' : 'Off'); UI.set('ciPower', UI.watts(v.power.circ)); UI.set('ciWhy', st.why.circ);
  const dd = Math.max(r.t, 3600) / 86400;
  UI.set('wFog', (r.water.fogKg / dd).toFixed(1)); UI.set('wAc', (r.water.acKg / dd).toFixed(1)); UI.set('wAir', Math.round(r.unfilteredM3 / dd).toLocaleString('en'));
  UI.set('wVpd', st.vpd != null ? `${st.vpd.toFixed(2)} / ${st.vpdT.toFixed(2)}` : '–');
  UI.set('wNote', r.water.acKg > r.water.fogKg * 1.5 && r.water.fogKg > 0.5
    ? 'The AC coil removes much more water than the fogger adds: the AC and the fogger work against each other. A high AC fan speed and fog-first cooling decrease this.'
    : 'Air from the intake fan goes through the filter. Between purges the dampers are closed and only wall leakage comes in, unfiltered.');

  const tot = r.kwh.ac + r.kwh.hu + r.kwh.air + (r.kwh.lights || 0) + (r.kwh.circ || 0), days = r.t / 86400;
  UI.set('eKwh', tot.toFixed(3));
  UI.set('eDay', r.t >= 3600 ? (tot / days).toFixed(1) : '–');
  UI.set('eCost', (tot * input.tariff).toFixed(2));
  for (const [k, id] of [['ac', 'Ac'], ['hu', 'Hu'], ['air', 'Air'], ['lights', 'Li'], ['circ', 'Ci']]) {
    const kwh = r.kwh[k] || 0, share = tot > 0 ? kwh / tot : 0;
    UI.set('e' + id, `${kwh.toFixed(3)} kWh · ${Math.round(share * 100)} %`);
    el.querySelector('#e' + id + 'Bar').style.width = `${share * 100}%`;
  }
  const S = st.stats, perDay = n => (r.t >= 3600 ? ` (${Math.round(n / days)}/day)` : '');
  UI.set('dPurges', String(S.purges)); UI.set('dPurgesL', `purges${perDay(S.purges)}`);
  UI.set('dPurgeAvg', S.purges ? UI.fmtMinSec(Math.round(S.purgeS / S.purges)) : '–');
  UI.set('dPurgeMax', S.purges ? UI.fmtMinSec(Math.round(S.longestPurgeS)) : '–');
  UI.set('dCapped', String(S.cappedPurges));
  UI.set('dAirOn', UI.fmtDur(S.airOnS));
  UI.set('dAirOnL', r.t > 0 ? `air exchange run time (${Math.round(S.airOnS / r.t * 100)} %)` : 'air exchange run time');
  UI.set('dDelayed', UI.fmtDur(S.delayedS));
  UI.set('dAcCmds', String(S.acCmds)); UI.set('dAcCmdsL', `AC commands${perDay(S.acCmds)}`);
  UI.set('dFogStarts', String(S.fogStarts)); UI.set('dFogStartsL', `fogger starts${perDay(S.fogStarts)}`);
  updateLadderLive(air.chip);
  renderPurges();
  paintProgram();
  paintGlance(list, tot, days, air);

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

// ---------------- Air exchange per hour (C9 5.7 ctl.purges()) ----------------
function renderPurges() {
  const P = ctl.purges(), nowH = Math.floor(reading.t / 3600);
  const hours = [];
  for (let h = nowH - 23; h <= nowH; h++) hours.push(P.hours.find(b => b.h === h) || { h, runS: 0, starts: 0, m3: 0, cappedN: 0 });
  const key = `${nowH}|${hours.map(b => `${Math.round(b.runS / 30)}.${b.cappedN}`).join(',')}|${P.events.length}|${cfg.roomM3}`;
  if (key === exhKey) return;
  exhKey = key;
  const vol = cfg.roomM3 || 1, mine = hours.filter(b => b.h >= 0);
  const done = mine.filter(b => b.h < nowH);
  const sum = (arr, k) => arr.reduce((s, b) => s + b[k], 0);
  UI.set('xAvgStarts', done.length ? (sum(done, 'starts') / done.length).toFixed(1) : '–');
  UI.set('xAvgRun', done.length ? UI.fmtMinSec(Math.round(sum(done, 'runS') / done.length)) : '–');
  UI.set('xAvgAch', done.length ? (sum(done, 'm3') / done.length / vol).toFixed(1) : '–');
  UI.set('xTotM3', Math.round(sum(mine, 'm3')).toLocaleString('en'));
  UI.set('xCapped', String(sum(mine, 'cappedN')));
  global.FarmCharts.drawPurgeBars(el.querySelector('#exhChart'), hours, clock());
  el.querySelector('#exhRows').replaceChildren(...mine.slice(-12).reverse().map(b => {
    const tr = document.createElement('tr');
    tr.append(UI.cell('td', `${clock().hm(b.h * 3600)}–${clock().hm((b.h + 1) * 3600)}${b.h === nowH ? ' (now)' : ''}`),
      UI.cell('td', String(b.starts)), UI.cell('td', UI.fmtMinSec(b.runS)), UI.cell('td', Math.round(b.m3).toLocaleString('en')),
      UI.cell('td', (b.m3 / vol).toFixed(1)), UI.cell('td', String(b.cappedN)));
    return tr;
  }));
  const evs = (P.cur ? [{ ...P.cur, running: true }] : []).concat(P.events.slice().reverse()).slice(0, 40);
  el.querySelector('#exhEvents').replaceChildren(...evs.map(e => {
    const tr = document.createElement('tr');
    const dur = (e.running ? reading.t : e.end) - e.start;
    tr.append(UI.cell('td', clock().stamp(e.start)), UI.cell('td', e.running ? 'running' : clock().stamp(e.end)), UI.cell('td', UI.fmtMinSec(dur)),
      UI.cell('td', e.reason || '–'), UI.cell('td', `${UI.fmtNum(e.co2Start, 0)} → ${e.running ? '…' : UI.fmtNum(e.co2End, 0)}`),
      UI.cell('td', Math.round(e.m3).toLocaleString('en')), UI.cell('td', e.capped ? 'Yes' : '–'));
    return tr;
  }));
}

// ---------------- Ladder (rules-side panel slot) ----------------
function updateLadderLive(chip = airText({ st: ctl.state, cur: ctl.purges().cur, rules: cfg.rules, manual: cfg.manual.air, t: reading.t }).chip) {
  if (!ladder) return;
  const st = ctl.state, co2 = reading.CO2;
  const ok = Number.isFinite(co2) && !st.f.CO2;
  ladder.draw(cfg, ok ? co2 : NaN, { air: chip });
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
  const key = `${cfg.farmType}|${cfg.crop}|${cfg.stage}`;
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

// ---------------- At a glance (beside the room drawing) ----------------
const GLANCE_S = 6 * 3600;
let glanceKey = '';
function spark(id, key, lo, hi) {
  const g = el.querySelector(`#${id}`), t1 = reading.t, t0 = t1 - GLANCE_S;
  const pts = samples.slice(global.FarmCharts.lowerBound(samples, t0)).filter(p => Number.isFinite(p[key]));
  const step = Math.max(1, Math.floor(pts.length / 200));
  const use = pts.filter((p, i) => i % step === 0 || i === pts.length - 1);
  const vals = use.map(p => p[key]).concat([lo, hi].filter(Number.isFinite));
  let yMin = Math.min(...vals), yMax = Math.max(...vals);
  const pad = Math.max((yMax - yMin) * 0.12, 0.5); yMin -= pad; yMax += pad;
  const y = v => (32 - (v - yMin) / (yMax - yMin) * 32).toFixed(1), x = t => ((t - t0) / GLANCE_S * 200).toFixed(1);
  const band = g.querySelector('.gl-band'), top = Number.isFinite(hi) ? y(hi) : 0, bot = Number.isFinite(lo) ? y(lo) : 32;
  band.setAttribute('y', top); band.setAttribute('height', Math.max(0, bot - top));
  g.querySelector('.gl-line').setAttribute('d', use.length > 1 ? 'M' + use.map(p => `${x(p.t)} ${y(p[key])}`).join(' L') : '');
}
function paintGlance(alarms, kwhTot, days, air) {
  const r = reading, st = ctl.state, P = ctl.programStatus(r.t), H = cfg.program.harvest, B = CC.BANDS;
  UI.set('glCrop', `${CC.CROPS[cfg.crop].name} · ${CC.STAGES[cfg.stage]}`);
  UI.set('glStage', [P.days && `Day ${P.day} of ${P.days}`, (cfg.stage === 'fruiting' || cfg.stage === 'rest') && `flush ${P.flush} of ${P.flushes}`, P.done && 'last flush done'].filter(Boolean).join(' · '));
  let hv = '';
  if (cfg.stage === 'fruiting' && H.on) {
    if (P.harvestOn) hv = `Harvest now, until ${CC.hhmm(P.harvestWin.to)}`;
    else if (H.times.length) {
      const m = r.hour * 60, next = H.times.map(at => ({ at, wait: ((at - m) % 1440 + 1440) % 1440 })).sort((a, b) => a.wait - b.wait)[0];
      hv = `Next harvest ${CC.hhmm(next.at)}, in ${UI.fmtDur(next.wait * 60)}`;
    }
  }
  UI.set('glHarvest', hv);
  const row = (id, txt, s, target) => {
    const g = el.querySelector(`#${id}`); g.dataset.lvl = s.lvl;
    const v = g.querySelector('.gl-v'), ic = g.querySelector('.gl-ico'), t = g.querySelector('.gl-t');
    if (v.textContent !== txt) v.textContent = txt;
    if (ic.textContent !== s.icon) ic.textContent = s.icon;
    const tt = `${target} · ${s.text.toLowerCase()}`;
    if (t.textContent !== tt) t.textContent = tt;
  };
  row('glT', `${UI.fmtNum(r.T, 1)} °C`, ctl.status('T'), `target ${cfg.spT.toFixed(1)} ± ${B.T} °C`);
  row('glRH', `${UI.fmtNum(r.RH, 0)} %`, ctl.status('RH'), `target ${st.rhT.toFixed(0)} ± ${B.RH} %`);
  row('glC', `${UI.fmtNum(r.CO2, 0)} ppm`, ctl.status('CO2'), `limit ${cfg.co2Lim} ppm`);
  const key = `${Math.floor(r.t / 300)}|${cfg.spT}|${st.rhT}|${cfg.co2Lim}|${samples.length > 0}`;
  if (key !== glanceKey) {
    glanceKey = key;
    spark('glT', 'T', cfg.spT - B.T, cfg.spT + B.T);
    spark('glRH', 'RH', st.rhT - B.RH, st.rhT + B.RH);
    spark('glC', 'C', NaN, cfg.co2Lim);
  }
  const full = r.t >= 3600, perDay = x => x / days;
  UI.set('glEnergy', full ? `${perDay(kwhTot).toFixed(1)} kWh` : '–');
  UI.set('glCost', full ? `RM ${(perDay(kwhTot) * input.tariff).toFixed(2)}` : '–');
  UI.set('glWater', full ? `${perDay(r.water.fogKg).toFixed(1)} L` : '–');
  UI.set('glAirNow', air.glance);
  { const g = el.querySelector('#glAir'); g.dataset.lvl = air.chip.lvl; const ic = g.querySelector('.gl-ico'); if (ic.textContent !== air.chip.icon) ic.textContent = air.chip.icon; }
  const S = st.stats;
  UI.set('glPurges', full ? `Purges ${Math.round(perDay(S.purges))} · average ${S.purges ? UI.fmtMinSec(Math.round(S.purgeS / S.purges)) : '–'}` : '–');
  const act = alarms.filter(a => a.active);
  const host = el.querySelector('#glAlarms'), akey = act.map(a => a.id).join('|') || 'none';
  if (host.dataset.key !== akey) {
    host.dataset.key = akey;
    host.replaceChildren(...(act.length ? act.slice(0, 4).map(a => {
      const li = document.createElement('li'); li.dataset.lvl = a.lvl;
      li.textContent = `${UI.ICON[a.lvl] || '•'} ${a.label}`;
      return li;
    }) : [Object.assign(document.createElement('li'), { className: 'gl-ok', textContent: '✓ No active alarms' })]));
  }
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
  return { ac: k('ac'), hu: k('hu'), air: k('air'), total: k('ac') + k('hu') + k('air'),
    airH: (s1.airOnS - s0.airOnS) / 3600, purges: s1.purges - s0.purges, capped: s1.cappedPurges - s0.cappedPurges,
    delayedH: (s1.delayedS - s0.delayedS) / 3600, acStarts: sim2.view().acStarts - a0, acCmds: s1.acCmds - s0.acCmds,
    inT: inT / n * 100, inRH: inRH / n * 100, overMin: overC / n * 1440, rhLowMin: rhLow / n * 1440 };
}
function renderTest() {
  const tariff = input.tariff;
  const variants = [
    ['Your rules', runTest({})],
    ['No humidity priority', runTest({ rhLock: false })],
  ];
  const mine = variants[0][1];
  const head = ['Rules', 'Total kWh/day', 'RM/day', 'AC kWh', 'Fogger kWh', 'Air exchange kWh', 'AC compressor starts', 'AC commands', 'Air exchange run (h)', 'Purges', 'Capped purges', 'Purges delayed by RH (h)', 'Temp in band', 'RH in band', 'RH low alarm', 'CO₂ over limit'];
  const sgn = v => (v > 0 ? '+' : '') + v;
  const row = (name, x) => [name,
    x === mine ? x.total.toFixed(2) : `${x.total.toFixed(2)} (${sgn((x.total - mine.total).toFixed(2))})`,
    (x.total * tariff).toFixed(2), x.ac.toFixed(2), x.hu.toFixed(2), x.air.toFixed(2),
    String(x.acStarts), String(x.acCmds), x.airH.toFixed(1), String(x.purges), String(x.capped), x.delayedH.toFixed(1),
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
    for (const val of [clock().stamp(p.t), UI.fmtNum(p.T, 1), UI.fmtNum(p.RH, 0), UI.fmtNum(p.C, 0), UI.fmtNum(p.tOut, 1), UI.fmtNum(p.rhOut, 0), UI.fmtNum(p.core, 1), UI.fmtNum(p.vpd, 2), UI.fmtNum(p.acSet, 1), Math.round(p.ac), Math.round(p.hu), Math.round(p.air)]) tr.append(UI.cell('td', String(val)));
    return tr;
  });
  el.querySelector('#tbody').replaceChildren(...rows);
}

// ---------------- Markup ----------------
const MIMIC_SVG = `
    <svg class="mimic-svg" viewBox="0 0 1000 420" role="img" aria-labelledby="mimicTitle mimicDesc">
      <title id="mimicTitle">Room schematic</title>
      <desc id="mimicDesc">Live view of the fruiting room: the growing rack, the three sensors, the air conditioner, the fogger, the circulation fan, and the air exchange (a filtered intake fan and an exhaust fan; their dampers close when they are off).</desc>
      <defs>
        <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect class="hatch-bg" width="7" height="7"/><line class="hatch-line" x1="0" y1="0" x2="0" y2="7"/>
        </pattern>
        <marker id="arAc" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="arrowhead ac" d="M0 0 L10 5 L0 10 z"/></marker>
        <marker id="arFan" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="arrowhead fan" d="M0 0 L10 5 L0 10 z"/></marker>
      </defs>
      <text x="12" y="26" class="m-eyebrow">OUTDOOR · OT-104</text>
      <text x="12" y="54" class="m-big" id="mOutT">32.0 °C</text>
      <text x="12" y="76" class="m-small" id="mOutRH">60 % RH</text>
      <g id="mSun" transform="translate(110 72)"><circle class="sun" r="5"/>
        <path class="sun" d="M0,-8.5V-7 M0,7V8.5 M-8.5,0H-7 M7,0H8.5 M-6,-6L-5,-5 M5,5L6,6 M-6,6L-5,5 M5,-5L6,-6"/></g>
      <g id="mMoon" transform="translate(110 72)"><circle class="moon" r="6.5"/><circle class="moon-cut" cx="3.6" cy="-2.4" r="5.4"/></g>
      <text x="124" y="76" class="m-small" id="mSkyTxt">Day</text>
      <text x="520" y="26" class="m-eyebrow" id="mRoomName">FRUITING ROOM · 60 m³</text>
      <text x="520" y="48" class="m-small" id="mAch">Fresh air 0.4 changes an hour</text>
      <text x="520" y="66" class="m-small" id="mPowerNow">Power now 0 W · 0.0 kWh so far</text>
      <line class="ground" x1="0" y1="412" x2="1000" y2="412"/>
      <rect class="wall" x="176" y="92" width="648" height="320"/>
      <rect class="room" x="184" y="100" width="632" height="312"/>
      <g id="condenser">
        <rect class="unit" x="290" y="30" width="80" height="58" rx="4"/>
        <circle class="ring" cx="330" cy="59" r="22"/>
        <g transform="translate(330 59)"><g id="condBlades">
          <path class="blade" d="M0,-3 C7,-6 15,-4 18,0 C14,3 6,3 0,3 Z"/>
          <path class="blade" d="M0,-3 C7,-6 15,-4 18,0 C14,3 6,3 0,3 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-3 C7,-6 15,-4 18,0 C14,3 6,3 0,3 Z" transform="rotate(240)"/>
        </g><circle r="3.5" class="blade"/></g>
        <text x="380" y="54" class="m-small">Condenser</text>
        <text x="380" y="70" class="m-small" id="mCondState">Idle</text>
      </g>
      <path class="pipe" d="M346 88 V108"/>
      <path class="pipe" d="M356 88 V108"/>
      <g id="lamp">
        <rect class="lamp" x="470" y="100" width="64" height="6" rx="2"/>
        <path class="lamp-ray" d="M480,110 L474,118 M502,110 V120 M524,110 L530,118"/>
        <text x="502" y="136" text-anchor="middle" class="m-small" id="mLamp">Lights off</text>
      </g>
      <g id="acUnit">
        <rect class="unit" x="250" y="108" width="196" height="58" rx="6"/>
        <rect class="keybar ac" x="250" y="108" width="6" height="58" rx="2"/>
        <text x="266" y="126" class="m-tag">ACU-201</text>
        <text x="266" y="142" class="m-small" id="mAcState">Off</text>
        <text x="266" y="158" class="m-small" id="mAcPower">0 W</text>
      </g>
      <path class="flow ac" data-flow="ac" d="M280 172 C282 205, 270 228, 256 248" marker-end="url(#arAc)"/>
      <path class="flow ac" data-flow="ac" d="M340 172 C342 210, 330 236, 316 256" marker-end="url(#arAc)"/>
      <path class="flow ac" data-flow="ac" d="M400 172 C402 210, 392 238, 380 258" marker-end="url(#arAc)"/>
      <g id="circUnit" transform="translate(720 150)">
        <circle class="unit" r="20"/>
        <g id="circBlades">
          <path class="blade" d="M0,-2.5 C6,-5 12,-4 15,0 C12,2.5 5,2.5 0,2.5 Z"/>
          <path class="blade" d="M0,-2.5 C6,-5 12,-4 15,0 C12,2.5 5,2.5 0,2.5 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-2.5 C6,-5 12,-4 15,0 C12,2.5 5,2.5 0,2.5 Z" transform="rotate(240)"/>
        </g><circle r="3" class="blade"/>
      </g>
      <text x="720" y="188" text-anchor="middle" class="m-tag">CF-205</text>
      <text x="720" y="204" text-anchor="middle" class="m-small" id="mCircState">Off</text>
      <g id="sensors">
        <line class="leader" x1="490" x2="500" y1="196" y2="196"/>
        <line class="leader" x1="490" x2="500" y1="246" y2="246"/>
        <line class="leader" x1="490" x2="500" y1="296" y2="296"/>
        <circle class="bubble-tag" cx="470" cy="196" r="20"/><text x="470" y="194" text-anchor="middle" class="m-tag" style="font-size:11px">TT</text><text x="470" y="207" text-anchor="middle" style="font-size:10px">101</text>
        <circle class="bubble-tag" cx="470" cy="246" r="20"/><text x="470" y="244" text-anchor="middle" class="m-tag" style="font-size:11px">MT</text><text x="470" y="257" text-anchor="middle" style="font-size:10px">102</text>
        <circle class="bubble-tag" cx="470" cy="296" r="20"/><text x="470" y="294" text-anchor="middle" class="m-tag" style="font-size:11px">AT</text><text x="470" y="307" text-anchor="middle" style="font-size:10px">103</text>
        <g class="readout" id="mT"><rect x="500" y="176" width="156" height="40" rx="4"/><text class="val" x="510" y="195">--</text><text class="ico" x="646" y="194" text-anchor="end"></text><text class="zn" x="510" y="210"></text></g>
        <g class="readout" id="mRH"><rect x="500" y="226" width="156" height="40" rx="4"/><text class="val" x="510" y="245">--</text><text class="ico" x="646" y="244" text-anchor="end"></text><text class="zn" x="510" y="260"></text></g>
        <g class="readout" id="mC"><rect x="500" y="276" width="156" height="40" rx="4"/><text class="val" x="510" y="295">--</text><text class="ico" x="646" y="294" text-anchor="end"></text><text class="zn" x="510" y="310"></text></g>
      </g>
      <g id="fanIn">
        <rect class="unit" x="-40" y="-40" width="80" height="80" rx="6"/>
        <rect class="keybar fan" x="-40" y="34" width="80" height="6" rx="2"/>
        <circle class="ring" r="31"/>
        <g id="fanInBlades">
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(240)"/>
        </g><circle r="5" class="blade"/>
        <rect class="damper" x="-3" y="-36" width="6" height="72" rx="2"/>
      </g>
      <g id="fanOut">
        <rect class="unit" x="-40" y="-40" width="80" height="80" rx="6"/>
        <rect class="keybar fan" x="-40" y="34" width="80" height="6" rx="2"/>
        <circle class="ring" r="31"/>
        <g id="fanOutBlades">
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(240)"/>
        </g><circle r="5" class="blade"/>
        <rect class="damper" x="-3" y="-36" width="6" height="72" rx="2"/>
      </g>
      <g id="ventFlows"></g>
      <g id="ventText"></g>
      <g id="mist"></g>
      <g id="huUnit">
        <rect class="unit" x="712" y="326" width="20" height="12" rx="3"/>
        <rect class="unit body" x="690" y="336" width="64" height="76" rx="8"/>
        <rect class="keybar hu" x="690" y="336" width="64" height="6" rx="2"/>
        <rect class="tank" x="700" y="370" width="44" height="30" rx="3"/>
      </g>
      <text x="680" y="356" text-anchor="end" class="m-tag">HU-202</text>
      <text x="680" y="373" text-anchor="end" class="m-small" id="mHuState">Off</text>
      <text x="680" y="390" text-anchor="end" class="m-small" id="mHuPower">0 W</text>
      <g id="bubbles"></g>
      <g id="rack">
        <line class="post" x1="240" x2="240" y1="312" y2="412"/>
        <line class="post" x1="394" x2="394" y1="312" y2="412"/>
        <line class="shelf" x1="238" x2="396" y1="362" y2="362"/>
        <g id="bags"></g>
      </g>
      <text x="404" y="356" class="m-tag">Growing blocks</text>
      <text x="404" y="373" class="m-small" id="mCo2Src">2,000 blocks</text>
      <text x="404" y="390" class="m-small" id="mCore">Core -- °C</text>
    </svg>`;

// The air exchange of the drawing (C9 section 7): the filtered intake fan SF-203 on the left wall and the exhaust
// fan EF-206 on the right wall, each high or low as env.inletAt / env.exhaustAt say. Pure, for Node tests.
function mimicLayout({ inletAt, exhaustAt }) {
  return {
    inlet: { band: inletAt === 'low' ? 'low' : 'high', kind: 'fan', tag: 'SF-203', label: 'Filtered intake' },
    outlet: { band: exhaustAt === 'high' ? 'high' : 'low', kind: 'fan', tag: 'EF-206', label: 'Exhaust' },
  };
}

// ---------------- Air exchange texts (C9 section 7) ----------------
// From the controller state (st = ctl.state: st.air of C9 5.3 and st.cmd.air), the running air run (cur =
// ctl.purges().cur, null when off), the rules, the manual setting (cfg.manual.air) and the time now: the status card
// state, the glance text and the ladder chip. st.airReason is C9 5.7's reason of the run now. Pure, for Node tests
// (tests/web-air.test.js).
const RUN_TEXT = { safety: 'Safety run', timed: 'Timed purge', 'free cooling': 'Free cooling', drying: 'Drying', manual: 'Manual on' };
function airText({ st, cur, rules, manual, t }) {
  const A = st.air, mmss = s => UI.fmtMinSec(Math.max(0, Math.round(s))), mins = s => Math.max(1, Math.ceil(s / 60));
  if (st.cmd.air.on) {
    // st.airReason follows the run now (a purge can turn into a safety run); cur.reason keeps the first reason.
    const reason = st.airReason;
    if (!cur) throw new Error('airText: the air exchange is on without a running record (ctl.purges().cur)');
    if (reason === 'purge') {
      const ran = mmss(t - cur.start);
      return { state: `Purge ${ran} of ${mmss(rules.purgeMaxS)}`, glance: `Purging ${ran}`, chip: { lvl: 'info', icon: '▲', text: 'Purging' } };
    }
    if (reason === 'safety') return { state: 'Safety run', glance: 'Safety run', chip: { lvl: 'serious', icon: '◆', text: 'Safety run' } };
    if (!Object.hasOwn(RUN_TEXT, reason)) throw new Error(`airText: unknown air run reason ${reason}`);
    return { state: RUN_TEXT[reason], glance: RUN_TEXT[reason], chip: { lvl: 'info', icon: '●', text: RUN_TEXT[reason] } };
  }
  if (manual.auto === false && manual.on) return { state: 'Manual on', glance: 'Manual on', chip: { lvl: 'info', icon: '●', text: 'Manual on' } };
  if (manual.auto === false) return { state: 'Manual off', glance: 'Manual off', chip: { lvl: 'none', icon: '○', text: 'Manual off' } };
  if (A.delayed) return { state: 'Delayed (humidity first)', glance: 'Delayed (humidity first)', chip: { lvl: 'info', icon: '❚❚', text: 'Delayed' } };
  const chip = { lvl: 'none', icon: '○', text: 'Idle' };
  if (A.timed) return { state: 'Timed purge · off', glance: 'Timed purge · off', chip };
  if (!(A.nextPurgeS > 0)) return { state: 'Idle', glance: 'Idle', chip };
  const m = mins(A.nextPurgeS);
  return { state: `Idle · purge in about ${m} min`, glance: `Next purge in about ${m} min`, chip };
}

// C5 1.4 "Today's ids stay": today's faceplate heading ids are fpAcTitle, fpHuTitle, fpLiTitle, fpCiTitle (not a
// lowercase device name), so faceplate() maps dev to that suffix; the air exchange is fpAirTitle (C9 7). The tag gets
// the id fp<suffix>Tag, so a size change can repaint it.
const FP_ID_SUFFIX = { ac: 'Ac', hu: 'Hu', air: 'Air', lights: 'Li', circ: 'Ci' };
function faceplate(dev, title, tag, extraClass, body) {
  const id = FP_ID_SUFFIX[dev];
  return `<article class="card faceplate${extraClass ? ' ' + extraClass : ''}" style="--key:var(--s-${dev === 'lights' ? 'li' : dev === 'circ' ? 'ci' : dev})" aria-labelledby="fp${id}Title">
    <header class="fp-head">
      <span class="key"></span>
      <div><h3 id="fp${id}Title">${title}</h3><span class="tag" id="fp${id}Tag">${tag}</span></div>
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
  <div class="mimic-body">
    ${MIMIC_SVG}
    <aside class="glance" aria-label="Room at a glance">
      <section>
        <h3 class="eyebrow">Crop</h3>
        <p class="gl-big" id="glCrop">--</p>
        <p class="gl-sub" id="glStage"></p>
        <p class="gl-sub" id="glHarvest"></p>
      </section>
      <section>
        <h3 class="eyebrow">Now and the last 6 h</h3>
      <div class="gl-row" id="glT"><span class="gl-k">Temperature</span><b class="gl-v">--</b><span class="gl-ico"></span>
        <svg class="gl-spark" viewBox="0 0 200 32" preserveAspectRatio="none" aria-hidden="true"><rect class="gl-band" x="0" width="200"/><path class="gl-line"/></svg>
        <span class="gl-t"></span></div>
      <div class="gl-row" id="glRH"><span class="gl-k">Humidity</span><b class="gl-v">--</b><span class="gl-ico"></span>
        <svg class="gl-spark" viewBox="0 0 200 32" preserveAspectRatio="none" aria-hidden="true"><rect class="gl-band" x="0" width="200"/><path class="gl-line"/></svg>
        <span class="gl-t"></span></div>
      <div class="gl-row" id="glC"><span class="gl-k">CO₂</span><b class="gl-v">--</b><span class="gl-ico"></span>
        <svg class="gl-spark" viewBox="0 0 200 32" preserveAspectRatio="none" aria-hidden="true"><rect class="gl-band" x="0" width="200"/><path class="gl-line"/></svg>
        <span class="gl-t"></span></div>
      <div class="gl-row" id="glAir"><span class="gl-k">Air exchange</span><b class="gl-v txt" id="glAirNow">Idle</b><span class="gl-ico" aria-hidden="true"></span></div>
      </section>
      <section>
        <h3 class="eyebrow">Per day</h3>
        <dl class="gl-kv">
          <dt>Energy</dt><dd id="glEnergy">–</dd>
          <dt>Cost</dt><dd id="glCost">–</dd>
          <dt>Fog water</dt><dd id="glWater">–</dd>
          <dt>Air exchange</dt><dd id="glPurges">–</dd>
        </dl>
      </section>
      <section>
        <h3 class="eyebrow">Alarms</h3>
        <ul class="gl-alarms" id="glAlarms"></ul>
      </section>
    </aside>
  </div>
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
        <li>Switch the air exchange to Manual, Off, and close the room.</li>
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
    <div class="rule-extra">
      <label class="num" for="inAirM3h">Air exchange size</label>
      <input type="number" id="inAirM3h" min="50" max="10000" step="50" value="1800"> <span>m³/h</span>
    </div>
    <div class="crop-row"><label for="inInlet">Air comes in</label><select id="inInlet"><option value="low">Low</option><option value="high">High</option></select></div>
    <div class="crop-row"><label for="inOutlet">Air goes out</label><select id="inOutlet"><option value="high">High</option><option value="low">Low</option></select></div>
    <p class="hint">The intake fan and the exhaust fan run together. CO₂ collects low: air in high and out low removes it best.</p>
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
      <dt>Air exchange</dt><dd id="plantAir">1,800 m³/h, 144 W while on</dd>
    </dl>
  </details>
</section>
<div class="section-head">
  <h2>Climate controller</h2>
  <p>The part that runs the machines. It sees only the sensor readings.</p>
  <div style="margin-left:auto;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px">
    <label for="simRoom">Room</label>
    <select id="simRoom" disabled></select>
    <button class="btn" id="simRoomLoad" disabled>Load settings from room</button>
    <button class="btn" id="simRoomSave" disabled>Save settings to room</button>
    <span class="tag" id="simRoomMsg" role="status" aria-live="polite"></span>
  </div>
</div>
<div class="ctl-section">
<div id="panelHost" class="contents"></div>
<div class="ctl-status" aria-label="Machine status">
${faceplate('ac', 'Air conditioner', 'ACU-201 · split 3.5 kW · setpoint', '', `
    <div class="fp-state"><span class="state" id="acState">Off</span><span class="pw" id="acPower">3 W</span></div>
    <div class="meter" aria-hidden="true"><span id="acMeter"></span></div>
    <p class="why" id="acWhy"></p>`)}
${faceplate('hu', 'Fogger', 'HU-202 · 3 levels', '', `
    <div class="fp-state"><span class="state" id="huState">Off</span><span class="pw" id="huPower">2 W</span></div>
    <div class="meter" aria-hidden="true"><span id="huMeter"></span></div>
    <p class="why" id="huWhy"></p>`)}
${faceplate('air', 'Air exchange', 'SF-203 + EF-206 · 1,800 m³/h', '', `
    <div class="fp-state"><span class="state" id="airState">Idle</span><span class="pw" id="airPower">0 W</span></div>
    <p class="why" id="airWhy"></p>`)}
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
</div>
</div>
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
    <div class="e-row" style="--key:var(--s-air)"><span class="nm"><i></i>Air exchange</span><span class="v" id="eAir"></span><span class="track"><span id="eAirBar"></span></span></div>
    <div class="e-row" style="--key:var(--s-li)"><span class="nm"><i></i>Lights</span><span class="v" id="eLi"></span><span class="track"><span id="eLiBar"></span></span></div>
    <div class="e-row" style="--key:var(--s-ci)"><span class="nm"><i></i>Circulation</span><span class="v" id="eCi"></span><span class="track"><span id="eCiBar"></span></span></div>
  </div>
  <label class="tariff">Tariff <input type="number" id="inTariff" min="0" step="0.01" value="0.57"> RM per kWh</label>
</section>
<section class="card exhaust" aria-labelledby="hExh">
  <div class="rules-head">
    <h2 id="hExh">Air exchange per hour</h2>
    <span class="tag">Controller record. Air volume = run time × the air exchange size.</span>
  </div>
  <div class="e-hero">
    <div><span class="num" id="xAvgStarts">–</span><span class="lbl">purges per hour</span></div>
    <div><span class="num" id="xAvgRun">–</span><span class="lbl">run per hour (min:s)</span></div>
    <div><span class="num" id="xAvgAch">–</span><span class="lbl">air changes per hour</span></div>
    <div><span class="num" id="xTotM3">0</span><span class="lbl">m³ exchanged, last 24 h</span></div>
    <div><span class="num" id="xCapped">0</span><span class="lbl">capped purges, last 24 h</span></div>
  </div>
  <p class="est-note" style="margin:0 0 4px">Air exchange run minutes per hour, last 24 h (point at a bar for the values). The averages use the full hours.</p>
  <div id="exhChart" class="ch-host"></div>
  <div class="exh-grid">
    <div>
      <h3 class="eyebrow">Each hour</h3>
      <table><thead><tr><th>Hour</th><th>Purges</th><th>Run (min:s)</th><th>Air (m³)</th><th>Air changes</th><th>Capped</th></tr></thead><tbody id="exhRows"></tbody></table>
    </div>
    <div>
      <h3 class="eyebrow">Each run (newest first)</h3>
      <div class="exh-scroll">
        <table><thead><tr><th>Start</th><th>End</th><th>Time (min:s)</th><th>Reason</th><th>CO₂ start → end</th><th>Air (m³)</th><th>Capped</th></tr></thead><tbody id="exhEvents"></tbody></table>
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
  <div class="est-out" id="estOut"><p class="est-note">Run the test to compare two rule sets: your rules, and no humidity priority.</p></div>
</section>
<section class="card tablecard" id="tableCard" hidden aria-labelledby="hTab">
  <h2 class="eyebrow" id="hTab">Recent sensor readings (newest first)</h2>
  <table>
    <thead><tr><th>Time</th><th>Temp °C</th><th>RH %</th><th>CO₂ ppm</th><th>Outdoor °C</th><th>Outdoor RH %</th><th>Core °C</th><th>VPD kPa</th><th>AC set °C</th><th>AC W</th><th>Fogger W</th><th>Air exchange W</th></tr></thead>
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
  // Only add the listener here; do not call apply() yet. Each bound range's "Simulation controls that mirror
  // env/cfg (initial paint)" section below calls setRange(..., env.x), which dispatches 'input' and runs upd()
  // with the closure's own env value. Calling apply() here too would first push the freshly-remounted markup's
  // default (for example inHigh="33") into env, overwriting a value the farmer set earlier (C5 3.1: the
  // Simulator's run stays in the closure between mounts).
  const elIn = root.querySelector('#' + id), out = root.querySelector('#' + outId);
  const upd = () => { const v = parseFloat(elIn.value); apply(v); out.textContent = fmt(v); };
  elIn.addEventListener('input', upd);
  out.textContent = fmt(parseFloat(elIn.value));
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
      if (c.path === 'airM3h') { env.airM3h = c.new; el.querySelector('#inAirM3h').value = c.new; paintAirSize(); }
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
  $('#inAirM3h').addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    const m3h = UI.clamp(Number.isFinite(v) ? Math.round(v) : (env.airM3h ?? PL.air.m3h), 50, 10000);
    env.airM3h = m3h; cfg.airM3h = m3h; e.target.value = m3h; // C9 7: the simulated pair and the controller's size together
    panel.set(cfg); paintAirSize();
  });
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
    const gen = mountGen;
    setTimeout(() => { if (!mounted || gen !== mountGen) return; renderTest(); btn.disabled = false; btn.textContent = 'Run 24 h test again'; }, 30);
  });

  // ---- Simulation controls that mirror env/cfg (initial paint) ----
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
  $('#inProbe').checked = env.probe;
  $('#inDoors').checked = env.harvestDoors;
  $('#inRandWx').checked = env.randomWeather;
  paintBlocks();
  $('#inAirM3h').value = env.airM3h ?? PL.air.m3h;
  paintAirSize();

  // ---- Toolbar and bench controls that survive a module switch (closure state, 6.1 "Simulator bench flag") ----
  $('#pauseBtn').textContent = paused ? 'Resume' : 'Pause';
  $('#speedSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === speed)));
  $('#winSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.win === windowS)));
  $('#benchBtn').setAttribute('aria-expanded', String(benchFlag === 'on'));
  $('#benchBtn').textContent = benchFlag === 'on' ? 'Hide test bench settings' : 'Show test bench settings';

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
    <div><span class="num" id="dPurges">0</span><span class="lbl" id="dPurgesL">purges</span></div>
    <div><span class="num" id="dPurgeAvg">–</span><span class="lbl">average purge (min:s)</span></div>
    <div><span class="num" id="dPurgeMax">–</span><span class="lbl">longest purge (min:s)</span></div>
    <div><span class="num" id="dCapped">0</span><span class="lbl">purges stopped at the time cap</span></div>
    <div><span class="num" id="dAirOn">0 min</span><span class="lbl" id="dAirOnL">air exchange run time</span></div>
    <div><span class="num" id="dDelayed">0 min</span><span class="lbl">purges delayed by humidity</span></div>
    <div class="inst"><span class="num" id="dAcCmds">0</span><span class="lbl" id="dAcCmdsL">AC commands</span></div>
    <div class="inst"><span class="num" id="dFogStarts">0</span><span class="lbl" id="dFogStartsL">fogger starts</span></div>`;
  rulesSide.append(note, duty);
  ladder = global.FarmCharts.createLadder(ladderHost);

  // ---- Trend and power charts ----
  trendCharts = global.FarmCharts.createTrendCharts($('#trendHost'), {
    keys: ['T', 'RH', 'C'], power: true, clock: clock(), status: kind => ctl.status(kind),
  });

  // A width change redraws the purge bar chart at its new size (today's behaviour), unmount() disconnects it.
  exhRo = new ResizeObserver(() => { exhKey = ''; });
  exhRo.observe($('#exhChart'));

  buildMimicExtras();
}

// ---------------- Room link: Load / Save settings from / to a room (C5 7.8) ----------------
// The logic of the two actions, without DOM. Never rejects; null means "change nothing".
function createRoomLink(deps) {
  const { api, diffSettings, safeSettings, showChanges, errorText, cfg, getCtl, event, onLoaded } = deps;
  let busy = false, disposed = false;

  async function run(body) {
    if (disposed || busy) return null;
    busy = true;
    try { return await body(); }
    catch (err) {
      if (disposed) return null;
      if (!(global.FarmApi && err instanceof global.FarmApi.ApiError)) console.error(err);
      return errorText(err);
    } finally { busy = false; }
  }

  function load(room) {
    return run(async () => {
      const raw = await api.getSettings(room.id);
      if (disposed) return null;
      let roomSettings;
      try { roomSettings = safeSettings(raw).settings; }
      catch (err) { return `The settings of ${room.name} could not be read: ${err.message}`; }
      const changes = diffSettings(cfg, roomSettings);
      if (!changes.length) return `Same settings as ${room.name}.`;
      const answer = await showChanges(changes, { title: `Load the settings of ${room.name}?`, confirmText: 'Load', note: false });
      if (disposed) return null;
      if (answer === null) return '';
      CC.applySettings(cfg, roomSettings);
      getCtl().cancelRamp();
      event(`Settings loaded from room "${room.name}"`);
      onLoaded(changes);
      return `Loaded the settings of ${room.name}.`;
    });
  }

  function save(room) {
    return run(async () => {
      const base = await api.getSettings(room.id);
      if (disposed) return null;
      const sent = structuredClone(cfg);
      const changes = diffSettings(base, sent);
      if (!changes.length) return `${room.name} already has these settings.`;
      const note = await showChanges(changes, { title: `Save these settings to ${room.name}?`, confirmText: 'Save to room', note: true });
      if (disposed) return null;
      if (note === null) return '';
      const { warnings } = await api.saveSettings(room.id, sent, note || 'From the Simulator');
      if (disposed) return null;
      return warnings && warnings.length ? `Saved with ${warnings.length} warning(s): ${warnings.join(' ')}` : 'Saved.';
    });
  }

  return {
    load, save,
    get busy() { return busy; },
    dispose() { disposed = true; },
  };
}

// ---------------- mount / unmount (3.1) ----------------
function stopFrame() { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

function frame(now) {
  if (!mounted) return;
  rafId = requestAnimationFrame(frame); // first, so a throw below cannot stop the page
  const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) {
    acc += dtReal * speed;
    let n = 0;
    while (acc >= 1 && n < 4000) { tick(); acc -= 1; n++; }
  }
  animateMimic(dtReal);
  if (now - lastUi > 150) { lastUi = now; updateUi(); }
  if (chartsDirty && now - lastChart > 200) { drawCharts(); lastChart = now; }
}

let link = null, openDialog = null, roomGen = 0, rooms = [], pickedRoom = null;

// After a confirmed Load: repaint what the new settings touch (C5 7.8, C6 7.8 "After every onChange").
function onRoomLoaded(changes) {
  panel.set(cfg);
  if (changes.some(c => c.path === 'farmType' || c.path === 'crop' || c.path === 'stage')) scheduleCropCheck();
  if (changes.some(c => c.path === 'airM3h')) {
    env.airM3h = cfg.airM3h;
    el.querySelector('#inAirM3h').value = cfg.airM3h;
    paintAirSize();
  }
  updateLadderLive();
  chartsDirty = true;
}

function wireRoomLink(params) {
  const gen = ++roomGen;
  const $ = sel => el.querySelector(sel);
  const sel = $('#simRoom'), bLoad = $('#simRoomLoad'), bSave = $('#simRoomSave'), msg = $('#simRoomMsg');
  const setBusy = on => { sel.disabled = on; bLoad.disabled = on; bSave.disabled = on; };
  link = createRoomLink({
    api: global.FarmApi, diffSettings: global.FarmSettingsPanel.diffSettings, safeSettings: global.FarmSettingsPanel.safeSettings,
    showChanges: (c, o) => {
      const p = global.FarmSettingsPanel.showChanges(c, o);
      const d = document.body.lastElementChild;
      openDialog = d && d.tagName === 'DIALOG' ? d : null;
      return p;
    },
    errorText: global.FarmUi.errorText, cfg, getCtl: () => ctl,
    event: text => onEvent({ t: reading ? reading.t : 0, lvl: 'info', text }),
    onLoaded: onRoomLoaded,
  });
  const act = async (name) => {
    const room = rooms.find(r => String(r.id) === sel.value);
    if (!room) return;
    setBusy(true);
    const text = await link[name](room);
    if (text === null || gen !== roomGen) return;
    msg.textContent = text;
    setBusy(false);
  };
  sel.addEventListener('change', () => { pickedRoom = Number(sel.value); msg.textContent = ''; });
  bLoad.addEventListener('click', () => act('load'));
  bSave.addEventListener('click', () => act('save'));
  global.FarmApi.listRooms().then(list => {
    if (gen !== roomGen) return;
    rooms = list;
    if (!list.length) { msg.textContent = 'No rooms on the farm server. Create one under Rooms.'; return; }
    for (const r of list) { const o = document.createElement('option'); o.value = String(r.id); o.textContent = r.name; sel.append(o); }
    const wanted = params && params.roomId != null ? Number(params.roomId) : null;
    const fromParams = wanted != null && list.some(r => r.id === wanted);
    const id = fromParams ? wanted : list.some(r => r.id === pickedRoom) ? pickedRoom : list[0].id;
    sel.value = String(id); pickedRoom = id;
    setBusy(false); msg.textContent = '';
    if (fromParams) act('load');
  }, err => {
    if (gen !== roomGen) return;
    msg.textContent = global.FarmUi.errorText(err);
  });
}

function mount(viewEl, params) {
  ensureState();
  mounted = true; el = viewEl; mountGen++;
  el.dataset.bench = benchFlag;
  el.innerHTML = MARKUP;
  logDirty = true; chartsDirty = true; alarmKey = ''; exhKey = ''; lastStage = '';
  wire();
  wireRoomLink(params || {});
  updateLadderLive();
  updateUi(); // updateUi() already calls paintProgram()
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
  roomGen++;
  if (link) { link.dispose(); link = null; }
  if (openDialog && openDialog.isConnected) { openDialog.close(); openDialog.remove(); }
  openDialog = null;
  if (exhRo) { exhRo.disconnect(); exhRo = null; }
  if (trendCharts) { trendCharts.destroy(); trendCharts = null; }
  if (ladder) { ladder.destroy(); ladder = null; }
  if (panel) { panel.destroy(); panel = null; }
  delete global.__climate;
  el = null;
}

global.FarmShell.register('simulator', { mount, unmount });

// Node only (tests/web-air.test.js, tests/web-room-link.test.js); adds no browser global.
if (typeof module === 'object' && module && module.exports) module.exports = { createRoomLink, airText, mimicLayout };
})(typeof window !== 'undefined' ? window : globalThis);
