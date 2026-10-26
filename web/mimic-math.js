// Pure mapping for the room drawing (web/mimic.js): the DrawState, how the farm room page and the device's simulated
// room fill it, and the plain data the painter writes (texts, levels, flags). No DOM, so Node tests cover it.
// DrawState: see docs/superpowers/specs/2026-10-20-room-drawing-design.md, plus filterPa (2026-10-26-room-picture-design.md).

import { MACHINE_NAMES, MODES, FANS, statusWord } from './machines-math.js';
import { outdoorForDrawing } from './outdoor-math.js';

export const NAMES = { ac: 'Aircon', hu: MACHINE_NAMES.humidifier, intake: MACHINE_NAMES.intake, exhaust: MACHINE_NAMES.exhaust, circ: MACHINE_NAMES.circulation };
export const UNIT_KEYS = ['ac', 'hu', 'intake', 'exhaust', 'circ'];
const RELAY_UNIT = { intake: 'intake', exhaust: 'exhaust', circulation: 'circ', humidifier: 'hu' };
const PROBLEMS = new Set(['not-following', 'not-running', 'running-while-off', 'fault']);
const NO_DATA = new Set(['not-wired', 'no-data', 'no-answer']);
const MODES_BY_INDEX = ['cool', 'heat', 'dry', 'fan'];
const FAN_BY_INDEX = ['auto', 'low', 'high'];

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const unknownUnit = (state) => ({ known: false, on: false, level: 0, state, sub: '', warn: false });

// ---------------- the room page ----------------

// One reading's chip: { lvl, icon, text } by the sensor's status and the band. A sign and a word, not colour alone.
export function readoutStatus(sensor, value, low, high, critical) {
  if (!sensor || sensor.status === 'not-wired') return { lvl: 'none', icon: '', text: 'Not wired' };
  if (sensor.status === 'no-data') return { lvl: 'none', icon: '', text: 'No data yet' };
  if (sensor.status !== 'online') return { lvl: 'serious', icon: '!', text: sensor.status === 'timeout' ? 'Timeout' : 'Offline' };
  if (num(value) === null) return { lvl: 'none', icon: '', text: 'No data yet' };
  if (num(critical) !== null && value >= critical) return { lvl: 'critical', icon: '▲', text: 'Safety level' };
  if (num(low) === null || num(high) === null) return { lvl: 'good', icon: '', text: 'Online' };
  if (value < low) return { lvl: 'warning', icon: '▼', text: 'Below band' };
  if (value > high) return { lvl: 'warning', icon: '▲', text: 'Above band' };
  return { lvl: 'good', icon: '✓', text: 'In band' };
}

function relayUnit(m) {
  if (!m) return unknownUnit('No data');
  if (NO_DATA.has(m.status)) return unknownUnit(statusWord(m.status));
  const running = m.running === true || (m.running == null && m.reported === true);
  return { known: true, on: running, level: running ? 1 : 0, state: statusWord(m.status), sub: '', warn: PROBLEMS.has(m.status) };
}

function acUnit(ac) {
  if (!ac) return { ...unknownUnit('No data'), mode: null };
  if (NO_DATA.has(ac.status)) return { ...unknownUnit(statusWord(ac.status)), mode: null };
  const r = ac.reported;
  if (!r) return { ...unknownUnit('No data'), mode: null };
  const on = r.power === true;
  const mode = on ? r.mode : null;
  const state = ac.status === 'fault' ? `Fault${ac.errorCode ? ` (code ${ac.errorCode})` : ''}` : on ? `${MODES[r.mode] ?? r.mode} ${Number(r.setpoint).toFixed(1)} °C` : 'Off';
  const sub = ac.status === 'not-following' ? 'not following the farm' : on ? `fan ${FANS[r.fan] ?? r.fan}` : '';
  // the compressor runs only in a cooling, drying or heating mode without a fault
  const running = on && mode !== 'fan' && ac.status !== 'fault';
  return { known: true, on, running, level: on ? (mode === 'fan' ? 0.3 : 0.6) : 0, mode, state, sub, warn: PROBLEMS.has(ac.status) };
}

const noteOf = (c) => (!c ? '' : c.auto ? (c.exchange ? 'Automatic control · air exchange on' : 'Automatic control on') : 'Automatic control off');

// What the room page already loads → DrawState. Anything missing draws as "no data"; never throws.
// outdoor: GET /api/outdoor (the farm's outdoor sensor), or null when there is none or the server did not answer.
// filterPa: the filter reading to show (the Filter card's: the last one with the intake on while it is off); without it the
// pressure sensor's last reading.
export function fromRoom({ room, sensors, machines, control, outdoor = null, filterPa, now = Date.now() } = {}) {
  const trh = sensors?.trh ?? null, co2 = sensors?.co2 ?? null, c = control ?? null;
  const dp = sensors?.dp && sensors.dp.status !== 'not-wired' ? sensors.dp : null;
  const T = num(trh?.lastOk?.t), RH = num(trh?.lastOk?.rh), CO2 = num(co2?.lastOk?.co2);
  const relay = Array.isArray(machines?.relay?.machines) ? machines.relay.machines : [];
  const units = { ac: acUnit(machines?.ac) };
  for (const [machine, unit] of Object.entries(RELAY_UNIT)) units[unit] = relayUnit(relay.find((m) => m.key === machine));
  // The dehumidifier only when the room has one (an older server sends no row, a room without one 'not-fitted').
  const dh = relay.find((m) => m.key === 'dehumidifier');
  units.dh = dh && dh.status !== 'not-fitted' ? relayUnit(dh) : null;
  return {
    name: room?.name ?? '',
    note: noteOf(c),
    ...outdoorForDrawing(outdoor, now), // out and night
    T, RH, CO2,
    status: {
      T: readoutStatus(trh, T, c?.tLow, c?.tHigh),
      RH: readoutStatus(trh, RH, c?.rhLow, c?.rhHigh),
      CO2: readoutStatus(co2, CO2, c?.co2Low, c?.co2High, c?.co2Safety),
    },
    units,
    filterPa: filterPa !== undefined ? num(filterPa) : num(dp?.lastOk?.pa),
    blocks: '',
    co2Rate: CO2 === null ? 0 : clamp01(CO2 / 3000),
    capScale: 0.6,
  };
}

// ---------------- the device's simulated room ----------------

const BTU_KW = 0.00029307;

// "Night" on the simulated clock (seconds since midnight): 19:00 to 07:00.
export function isNight(clock) {
  const s = num(clock);
  if (s === null) return false;
  const h = Math.floor((((s % 86400) + 86400) % 86400) / 3600);
  return h >= 19 || h < 7;
}

function simRelayUnit(relay, i, level) {
  if (!relay) return unknownUnit('No relay linked');
  const running = relay.running?.[i] === true, coil = relay.coils?.[i] === true;
  return { known: true, on: running, level: running ? level : 0, state: running ? 'Running' : coil ? 'On, not running' : 'Off', sub: '', warn: coil !== running };
}

function simAcUnit(ac, a, room) {
  if (!ac) return { ...unknownUnit('No aircon linked'), mode: null };
  const on = ac.power === true, mode = on ? (MODES_BY_INDEX[ac.mode] ?? null) : null;
  const used = Math.max((num(a?.acCoolKW) ?? 0) + (num(a?.acLatentKW) ?? 0), num(a?.acHeatKW) ?? 0), cap = (num(room?.acBTU) ?? 0) * BTU_KW;
  const level = !on ? 0 : cap > 0 && a ? Math.max(0.15, clamp01(used / cap)) : 0.6;
  // the simulation runs no aircon with an error code; one at its setpoint is idle
  const running = on && mode !== 'fan' && !ac.error && (a ? used > 0.005 : true);
  const state = ac.error ? `Fault (code ${ac.error})` : on ? `${MODES[mode] ?? '?'} ${Number(ac.setpoint).toFixed(1)} °C` : 'Off';
  return { known: true, on, running, level, mode, state, sub: on ? `fan ${FANS[FAN_BY_INDEX[ac.fan]] ?? '?'}` : '', warn: Boolean(ac.error) };
}

// A simulated room of GET /api/sims and the device list of GET /api/sensors → DrawState.
export function fromSim(room, sensors) {
  const r = room ?? {}, list = Array.isArray(sensors) ? sensors : [];
  const find = (kind, address) => (address == null ? null : list.find((s) => s.kind === kind && s.address === address) ?? null);
  const relay = find('relay', r.relay), ac = find('ac', r.ac), a = r.acting ?? null;
  const air = a && num(a.exchangeM3h) !== null && num(r.fanFlow) > 0 ? clamp01(a.exchangeM3h / r.fanFlow) : null;
  const fanLevel = air === null ? 1 : Math.max(0.4, air);
  const hu = simRelayUnit(relay, 3, 1);
  if (hu.on && a && num(r.humidifierLH) > 0) hu.level = Math.max(0.2, clamp01((num(a.humidifierGH) ?? 0) / (r.humidifierLH * 1000)));
  // A dehumidifier when the room has a capacity (output 5); its level: the water it takes out of its rating.
  const dh = num(r.dehumidifierLday) > 0 ? simRelayUnit(relay, 4, 1) : null;
  if (dh?.on && a) dh.level = Math.max(0.2, clamp01((num(a.dehumidifierGH) ?? 0) / ((r.dehumidifierLday * 1000) / 24)));
  const blocks = num(r.blocks), perBlock = num(r.co2PerBlock) ?? 0;
  const out = r.outdoor && (num(r.outdoor.T) !== null || num(r.outdoor.RH) !== null) ? { T: num(r.outdoor.T), RH: num(r.outdoor.RH) } : null;
  const chip = { lvl: 'none', icon: '', text: 'Simulated' };
  return {
    name: r.name ?? '',
    note: r.enabled === false ? 'Simulation switched off' : '',
    out,
    night: isNight(r.clock),
    T: num(r.state?.T), RH: num(r.rh), CO2: num(r.state?.CO2),
    status: { T: chip, RH: chip, CO2: chip },
    units: {
      ac: simAcUnit(ac, a, r),
      hu,
      intake: simRelayUnit(relay, 0, fanLevel),
      exhaust: simRelayUnit(relay, 1, fanLevel),
      circ: simRelayUnit(relay, 2, 1),
      dh,
    },
    // the filter probe reads only while the intake runs (0 otherwise)
    filterPa: r.filterProbe != null && num(a?.filterPa) > 0 ? a.filterPa : null,
    blocks: blocks !== null ? `${blocks.toLocaleString('en-US')} blocks` : '',
    co2Rate: blocks === null || r.enabled === false || blocks * perBlock <= 0 ? 0 : Math.max(0.15, clamp01((blocks * perBlock) / 1000 / 150)),
    capScale: 0.6,
  };
}

// ---------------- what the painter writes ----------------

const dash = '--';
const fixed = (x, d, unit) => (num(x) === null ? dash : `${x.toFixed(d)}${unit}`);

function unitView(u, name) {
  const x = u || unknownUnit('No data');
  return {
    name, known: Boolean(x.known), on: Boolean(x.on), level: x.known ? clamp01(num(x.level) ?? 0) : 0, warn: Boolean(x.warn),
    state: x.state ? String(x.state) : dash, sub: x.sub ? String(x.sub) : '', mode: x.mode ?? null,
    running: x.running ?? null,
  };
}

// DrawState → texts, levels and flags (null-safe).
export function view(draw) {
  const s = draw || {}, st = s.status || {}, un = s.units || {};
  const chip = (c) => ({ lvl: c?.lvl || 'none', ico: c?.icon || '', zn: c?.text || '' });
  const out = s.out || null;
  const units = {};
  for (const key of UNIT_KEYS) units[key] = unitView(un[key], NAMES[key]);
  const ac = units.ac;
  const dh = un.dh ? unitView(un.dh, MACHINE_NAMES.dehumidifier) : null; // drawn only when the room has one
  const comp = ac.on && ac.mode !== 'fan' && ac.running !== false; // a fault or an idle aircon: no compressor
  return {
    night: Boolean(s.night),
    sky: s.night ? 'Night' : 'Day',
    hasOut: Boolean(out),
    outT: fixed(out?.T, 1, ' °C'),
    outRH: fixed(out?.RH, 0, ' % RH'),
    outLine: out ? `${fixed(out.T, 1, ' °C')} · ${fixed(out.RH, 0, ' % RH')}` : 'No outdoor sensor',
    note: s.note ? String(s.note) : '',
    readouts: {
      T: { val: fixed(num(s.T), 1, ' °C'), ...chip(st.T) },
      RH: { val: fixed(num(s.RH), 0, ' % RH'), ...chip(st.RH) },
      CO2: { val: num(s.CO2) === null ? dash : `${Math.round(s.CO2).toLocaleString('en-US')} ppm`, ...chip(st.CO2) },
    },
    units,
    dh,
    comp,
    acFlow: ac.on ? (comp ? 0.35 + 0.65 * ac.level : 0.2) : 0,
    airOn: units.intake.on || units.exhaust.on,
    filter: num(s.filterPa) === null ? '' : `filter ${Math.round(s.filterPa)} Pa`,
    blocks: s.blocks ? String(s.blocks) : '',
    co2Rate: num(s.co2Rate) === null ? 0 : clamp01(s.co2Rate),
    capScale: num(s.capScale) === null ? 0 : clamp01(s.capScale),
  };
}

// The state in words, for the drawing's aria-label.
export function describe(v) {
  const r = v.readouts;
  const part = (label, x) => `${label} ${x.val === dash ? 'no data' : x.val}${x.zn ? ` (${x.zn.toLowerCase()})` : ''}`;
  const say = (u) => `${u.name} ${u.state === dash ? 'no data' : u.state.charAt(0).toLowerCase() + u.state.slice(1)}${u.sub ? `, ${u.sub}` : ''}`;
  const units = UNIT_KEYS.map((k) => say(v.units[k]));
  if (v.dh) units.push(say(v.dh));
  const outdoor = v.hasOut ? `Outdoor ${v.outLine}, ${v.sky.toLowerCase()}` : 'No outdoor sensor';
  return `Room drawing. ${part('Temperature', r.T)}, ${part('humidity', r.RH)}, ${part('CO₂', r.CO2)}. ${units.join('. ')}. ${outdoor}.${v.note ? ` ${v.note}.` : ''}`;
}
