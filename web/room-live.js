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

const helpers = { airLive, airSub, windowQuery, gapFor, reconnectQuery, chartTargets, toChartPoint, retarget, mergePoints };
const todo = name => () => { throw new Error(`${name} is not built yet`); };
for (const n of ['mergeEvent', 'readingTexts', 'machineLines', 'commandFromReading', 'programText', 'alarmTexts', 'detailChanges',
  'countText', 'changeLines', 'versionText', 'rebase']) helpers[n] = todo(n);

function mount() {}
function unmount() {}

global.FarmRoomTabs.register('live', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
