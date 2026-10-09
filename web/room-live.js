// web/room-live.js: the Live tab of a room (docs/contracts/web.md sections 3.4, 3.9, 7.9; air.md section 7).
(function (global) {
'use strict';

const ui = () => global.FarmUi;
const ms = s => ui().fmtMinSec(Math.round(s));

// ---------------- pure helpers (5.2) ----------------
const ON_REASON = { timed: 'Timed purge', 'free cooling': 'Free cooling', drying: 'Drying', manual: 'Manual on' };
const CHIP_IDLE = () => ({ lvl: 'none', icon: '○', text: 'Idle' });

function airLive(air, settings) {
  if (!air) return { state: '–', glance: '–', chip: null, day: '' };
  let state, glance, chip;
  if (air.on && air.reason === 'purge') {
    const t = ms(air.purgeS ?? 0);
    state = settings ? `Purge ${t} of ${ms(settings.rules.purgeMaxS)}` : `Purge ${t}`;
    glance = `Purging ${t}`;
    chip = { lvl: 'info', icon: '▲', text: 'Purging' };
  } else if (air.on && air.reason === 'safety') {
    state = glance = 'Safety run'; chip = { lvl: 'serious', icon: '◆', text: 'Safety run' };
  } else if (air.on) {
    state = glance = ON_REASON[air.reason] ?? 'On'; chip = { lvl: 'info', icon: '●', text: state };
  } else if (air.manual && air.manualOn) {
    state = glance = 'Manual on'; chip = { lvl: 'info', icon: '●', text: 'Manual on' };
  } else if (air.manual) {
    state = glance = 'Manual off'; chip = { lvl: 'none', icon: '○', text: 'Manual off' };
  } else if (air.delayed) {
    state = glance = 'Delayed (humidity first)'; chip = { lvl: 'info', icon: '❚❚', text: 'Delayed' };
  } else if (air.timed) {
    state = glance = 'Timed purge · off'; chip = CHIP_IDLE();
  } else if (air.nextPurgeS > 0) {
    const m = Math.max(1, Math.ceil(air.nextPurgeS / 60));
    state = `Idle · purge in about ${m} min`; glance = `Next purge in about ${m} min`; chip = CHIP_IDLE();
  } else {
    state = glance = 'Idle'; chip = CHIP_IDLE();
  }
  const d = air.today;
  let day = `Purges ${d.purges} · average ${d.purges ? ms(d.avgS) : '–'}`;
  if (d.capped > 0) day += ` · ${d.capped} capped`;
  return { state, glance, chip, day };
}

function airSub(settings) {
  return settings ? `SF-203 + EF-206 · ${ui().nf(settings.airM3h)} m³/h` : 'SF-203 + EF-206';
}

const STEPS = { 3600: undefined, 21600: undefined, 86400: 120, 604800: 900 };
function windowQuery(windowS, now) {
  if (!Object.prototype.hasOwnProperty.call(STEPS, windowS)) throw new RangeError(`Unknown chart window ${windowS}`);
  return { from: now - windowS, to: now, step: STEPS[windowS] };
}
const gapFor = step => 3 * Math.max(30, step || 0);
function reconnectQuery(windowS, lastT, now) {
  if (windowS === 3600 && Number.isFinite(lastT)) {
    const from = Math.max(lastT + 1, now - 3600);
    return from > now ? null : { from, to: now, step: undefined, merge: true };
  }
  return { ...windowQuery(windowS, now), merge: false };
}

function chartTargets(live, base) {
  const rules = base && base.rules;
  const src = live && live.targets ? { spT: live.targets.T, spRH: live.targets.RH, co2Lim: live.targets.CO2 } : base;
  const pick = (o, k) => (o && o[k] != null ? o[k] : NaN);
  return { spT: pick(src, 'spT'), spRH: pick(src, 'spRH'), co2Lim: pick(src, 'co2Lim'), fanOn: pick(rules, 'fanOn'), fanOff: pick(rules, 'fanOff') };
}

function toChartPoint(r, tg) {
  const S = global.ClimateController.SENSORS;
  const v = (x, k) => (x != null && Number.isFinite(x) && x >= S[k].min && x <= S[k].max ? x : NaN);
  return { t: r.t, T: v(r.T, 'T'), RH: v(r.RH, 'RH'), C: v(r.CO2, 'CO2'), tOut: v(r.t_out, 'tOut'), rhOut: v(r.rh_out, 'rhOut'),
    core: v(r.core, 'core'), spT: tg.spT, spRH: tg.spRH, co2Lim: tg.co2Lim, fanOn: tg.fanOn, fanOff: tg.fanOff };
}

const retarget = (pts, tg) => pts.map(p => ({ ...p, spT: tg.spT, spRH: tg.spRH, co2Lim: tg.co2Lim, fanOn: tg.fanOn, fanOff: tg.fanOff }));

function mergePoints(pts, p, from) {
  const out = pts.filter(q => q.t >= from && q.t !== p.t);
  if (p.t >= from) out.push(p);
  return out.sort((a, b) => a.t - b.t);
}

function readingTexts(r, clock) {
  if (!r) return { T: '—', RH: '—', CO2: '—', at: 'No reading yet' };
  const f = ui().fmtNum;
  return { T: `${f(r.T, 1)} °C`, RH: `${f(r.RH, 0)} % RH`, CO2: `${f(r.CO2, 0)} ppm`, at: `Reading at ${clock.stamp(r.t)}` };
}

const AC_WORD = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' };
function machineLines(r) {
  if (!r) return [];
  const lines = [];
  lines.push(r.ac_mode === 'off' ? 'AC off' : `AC ${AC_WORD[r.ac_mode] ?? r.ac_mode} ${ui().fmtNum(r.ac_setpoint, 1)} °C`);
  lines.push(r.fog > 0 ? `Fogger level ${r.fog}` : 'Fogger off');
  lines.push(r.air === 1 ? 'Air exchange On' : 'Air exchange Off');
  lines.push(r.lights === 1 ? 'Lights on' : 'Lights off');
  lines.push(r.circ === 1 ? 'Circulation fan on' : 'Circulation fan off');
  if (Number.isFinite(r.power_w)) lines.push(`Power ${ui().watts(r.power_w)}`);
  return lines;
}

function programText(live) {
  if (!live || !live.crop) return '';
  const CC = global.ClimateController;
  const crop = CC.CROPS[live.crop] ? CC.CROPS[live.crop].name : live.crop;
  const stage = CC.STAGES[live.stage] ?? live.stage;
  return `Running now: ${crop} · ${stage}` + (live.flush != null ? ` · flush ${live.flush}` : '');
}

function commandFromReading(r) {
  if (!r) return null;
  return {
    ac: r.ac_mode !== 'off' ? { power: true, mode: r.ac_mode, setpoint: r.ac_setpoint } : { power: false },
    hu: { level: r.fog }, air: { on: r.air === 1 }, lights: { on: r.lights === 1 }, circ: { on: r.circ === 1 },
  };
}

function alarmTexts(a, clock) {
  const state = (a.cleared_at === null ? 'Active' : `Cleared ${clock.stamp(a.cleared_at)}`) + ' · ' + (a.acked_at === null ? 'not acknowledged' : 'acknowledged');
  return { main: `${a.label} · since ${clock.stamp(a.raised_at)}`, state, canAck: a.acked_at === null };
}

function mergeEvent(events, ev) {
  if (events.some(e => e.id === ev.id)) return events;
  return [...events, ev].sort((a, b) => b.id - a.id);
}

function detailChanges(room, form) {
  const out = {};
  if (form.name.trim() !== room.name) out.name = form.name.trim();
  if (Number(form.volume) !== room.volume) out.volume = Number(form.volume);
  return out;
}

const countText = n => (n === 0 ? '' : `${n} unsaved change(s)`);
const changeLines = changes => changes.map(c => `${c.label}: ${c.oldText} → ${c.newText}`);
const versionText = (v, clock, current) => `${clock.stamp(v.saved_at)} · ${v.note ?? '—'}` + (current ? ' · current' : '');

const helpers = { airLive, airSub, windowQuery, gapFor, reconnectQuery, chartTargets, toChartPoint, retarget, mergePoints,
  readingTexts, machineLines, programText, commandFromReading, alarmTexts, mergeEvent, detailChanges, countText, changeLines, versionText };
const todo = name => () => { throw new Error(`${name} is not built yet`); };
helpers.rebase = todo('rebase');

function mount() {}
function unmount() {}

global.FarmRoomTabs.register('live', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
