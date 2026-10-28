// Automatic control (spec 2026-10-19-controller-design.md): the pure decision, the validation of the
// settings and the runner that sends the differences after each poll cycle.

import { CommandError, fitted } from './machines.js';
import { RELAY_KEYS } from './machine-codes.js';
import { createSensorChecks } from './checks.js';
import { createAlarms } from './alarms.js';
import { filterInput, FILTER_KEYS } from './filter.js';
import { advance, BAND_KEYS } from './program.js';
import { outdoorReading } from './outdoor.js';
import { wOf, dewOf } from '../device/sim-model.js';
import { lightsNow, localAt } from '../web/light-math.js';

export const DEFAULTS = {
  auto: false, co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, humidifierDuringExchange: false, acFan: 'auto',
  co2Safety: 1250, exchangeMaxMin: 10, acDrop: 0, exchangeEveryMin: 15, outdoorAir: true,
};
export const AC_FANS = ['auto', 'low', 'high'];

// Pairs of band limits, in the order they are checked.
const BANDS = [
  // A lower limit below about 450 ppm can never be reached with outdoor air at about 420.
  { low: 'co2Low', high: 'co2High', label: 'CO₂ band', min: 450, max: 5000, unit: 'ppm' },
  { low: 'tLow', high: 'tHigh', label: 'Temperature band', min: 16, max: 35, unit: '°C' },
  { low: 'rhLow', high: 'rhHigh', label: 'Humidity band', min: 40, max: 100, unit: '%' },
];

const AC_MIN = 16;
const AC_MAX = 30;
const AC_DROP_MAX = 10; // °C the aircon setpoint may be lowered during an air exchange (acDrop)

// Machine protection and the timed fallbacks (spec 2026-10-19-safety-and-history-design.md 2.1 to 2.3).
const MIN_ON_MS = 30_000; // air exchange
const MIN_OFF_MS = 60_000;
const TIMED_EXCHANGE_ON_MS = 10 * 60_000; // CO₂ sensor fault: on 10 min of every 30
const TIMED_EXCHANGE_OFF_MS = 20 * 60_000;
const FRESH_AIR_RUN_MS = 60_000; // a fresh-air run (no air exchange for exchangeEveryMin): the fans run this long
const EVERY_MAX = 240; // min, the longest fresh-air interval
const TIMED_HUMIDIFIER_MS = 10 * 60_000; // T/RH probe fault: 10 min on, 10 min off
const HUMIDIFIER_HOLD_MS = 60_000; // the command changes at most once a minute
const AC_HOLD_MS = 120_000; // at most one changed aircon command every 2 min
const DEHUMIDIFIER_QUIET_MS = 30 * 60_000; // the dehumidifier starts only when the humidifier has been off this long
const AFTER_DRY_WAIT_MS = 10 * 60_000; // the humidifier waits this long after the dehumidifier stopped …
const AFTER_DRY_MARGIN = 3; // … unless RH is this many % below the band
const AFTER_DRY_IGNORE_MS = 15 * 60_000; // a humidifier run this soon after the dehumidifier stopped does not hold the next start
const DEHUMIDIFIER_HOLD_MS = 180_000; // a compressor: 3 min on, 3 min off
// Outdoor air (spec 2026-10-26-live-alarms-outdoor-design.md 4): temperatures in °C, moisture as absolute humidity in g/m³.
const COOL_START_DROP = 2; // free cooling starts with the outside this much cooler than the room …
const COOL_STOP_DROP = 1; // … and ends when it is less than this cooler
const COOL_START_WIDTH = 0.25; // … while the room is above the middle of its band plus this share of the band's width
const COOL_WET_START = 0.5; // … and the outside holds at most this much more moisture than the room
const COOL_WET_STOP = 1; // … ends when it holds more than this much more
const DRY_START_DRIER = 1; // outdoor drying starts with the outside this much drier than the room (and not hotter than …
const DRY_START_WARM = 4; // … this much above it)
const DRY_STOP_DRIER = 0.5; // … ends when the outside is less than this much drier
const DRY_STOP_WARM = 5; // … or hotter than this much above the room
const DRY_T_MARGIN = 0.25; // drying with cooler (warmer) outside air starts only with the room this share of the band's width above tLow (below tHigh), and ends at the band's edge
const WET_WAIT = 3; // a fresh-air run waits while the outside holds this much more moisture than the room …
const HOT_WAIT = 8; // … or is this much hotter, for at most one more interval

const num = (x) => String(Math.round(x * 10) / 10);
const word = (on) => (on ? 'on' : 'off');

// "40 s", "1 min 20 s", "2 min": a wait for a reason text, rounded up to whole seconds.
function wait(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`;
}

// Whether the aircon command a differs from the desired d (the setpoint compared in tenths).
const acDiffers = (a, d) => a.power !== d.power || a.mode !== d.mode || a.fan !== d.fan
  || Math.round(a.setpoint * 10) !== Math.round(d.setpoint * 10);

// bands: { co2Low, co2High, co2Safety, exchangeMaxMin, exchangeEveryMin, tLow, tHigh, rhLow, rhHigh, acDrop } (acDrop: °C
// lower during an air exchange, 0 when missing; exchangeEveryMin: fresh air at least this often, 0 or missing: off).
// state: { exchange, exchangeSince, exchangeEndedAt, exchangeForced, freshFrom, cappedInRow, humidifier, humidifierSince, dehumidifier },
// the remembered states (times in ms; exchangeSince is null while the exchange is off, exchangeEndedAt null when it never
// ended; exchangeForced: the running exchange is a fresh-air run; freshFrom: the fresh-air wait counts from then, null:
// from the last end, or from now when it never ended).
// humidifierDuringExchange: whether an air exchange forces the humidifier on (default false).
// acFan: the aircon fan, 'auto' | 'low' | 'high' (default 'auto').
// dehumidifierFitted: whether the room has a dehumidifier (default false: never on, no reason text).
// rhUnwired: the room has no T/RH probe wired (the dehumidifier is then off).
// readings: { co2, rh, t, outdoor }, null when the sensor gave nothing usable this cycle (that rule then keeps its state);
// t: the room temperature; outdoor: { t, rh } of the outdoor probe, null without a fresh good reading. The outdoor rules need
// t, rh and outdoor, and bands.outdoorAir not false (default true).
// state.exchangeKind: why the running exchange started, 'co2' | 'fresh' | 'cooling' | 'drying' | 'timed'; the result's state has it too (null when off).
// faults: { co2, trh }, true while that sensor is faulty (timed exchange, timed humidifier). now: ms.
// lightsFitted: whether the room has lights (default false: never on, no reason text); program: the room's crop program with
// its light schedule (null: none, the lights are off); clockAt(ms, h, m, days): the time h:m on the day of ms (default the
// farm's local clock, light-math.js localAt; a simulation run's clock is runAt, its second 0 is midnight).
// Returns { state, desired, reasons }. Pure.
export function decide({ bands, state, readings, faults, now, humidifierDuringExchange = false, acFan = 'auto', dehumidifierFitted = false, rhUnwired = false,
  lightsFitted = false, program = null, clockAt = localAt }) {
  const { co2 = null, rh = null, t = null, outdoor = null } = readings ?? {};
  const was = state.exchange;
  let exchange = was;
  // An exchange that is on with no start time (from the upgrade) starts counting now.
  let since = state.exchangeSince ?? (was ? now : null);
  let endedAt = state.exchangeEndedAt ?? null;
  let capped = state.cappedInRow ?? 0;
  let freshRun = was && Boolean(state.exchangeForced);
  let freshFrom = state.freshFrom ?? endedAt ?? now;
  let band = state.humidifier;
  let dehumidifierBand = state.dehumidifier ?? false;
  let humidifierSince = null;
  const reasons = {};

  const start = () => { exchange = true; since = now; freshRun = false; };
  const stop = () => { exchange = false; since = null; endedAt = now; freshRun = false; freshFrom = now; };
  const onFor = was ? now - since : 0;
  const offFor = was || endedAt === null ? Infinity : now - endedAt;
  const { co2Low, co2High, co2Safety } = bands;
  const middle = (bands.tLow + bands.tHigh) / 2;
  // Fresh air: with no air exchange for `every` ms, the fans run for FRESH_AIR_RUN_MS whatever the CO2.
  const every = (bands.exchangeEveryMin ?? 0) * 60_000;
  const freshDue = !was && every > 0 && now - freshFrom >= every;
  const startFresh = () => {
    start();
    freshRun = true;
    reasons.exchange = `Fresh air: no air exchange for ${bands.exchangeEveryMin} min, fans on for ${FRESH_AIR_RUN_MS / 60_000} min`;
  };
  // Outdoor air: the room's and the outside's temperature and moisture, null without all the readings or with the setting off.
  const air = bands.outdoorAir !== false && outdoor && t !== null && rh !== null
    ? { tIn: t, wIn: wOf(t, rh), tOut: outdoor.t, wOut: wOf(outdoor.t, outdoor.rh) } : null;
  const rhMiddle = (bands.rhLow + bands.rhHigh) / 2;
  let outdoorKind = null; // 'cooling' | 'drying' while one of those runs
  const clock = (ms) => `${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`;
  const coolText = () => `Free cooling: outdoor ${num(air.tOut)} °C, the room ${num(air.tIn)} °C`;
  const dryText = () => `Outdoor drying: outdoor air ${num(air.wOut)} g/m³, the room ${num(air.wIn)} g/m³`;
  // Free cooling, then outdoor drying; starts the exchange with its reason, false when neither is due. Both need the minimum off time.
  // They start deliberately also while the CO₂ reading is unusable: they do not depend on it, and the CO₂ safety level and
  // sensor fault rules above them have already had their say.
  const startOutdoor = () => {
    if (!air || offFor < MIN_OFF_MS) return false;
    if (air.tOut <= air.tIn - COOL_START_DROP && air.tIn > middle + COOL_START_WIDTH * (bands.tHigh - bands.tLow)
      && air.wOut <= air.wIn + COOL_WET_START) {
      start();
      outdoorKind = 'cooling';
      reasons.exchange = coolText();
      return true;
    }
    const tRoom = DRY_T_MARGIN * (bands.tHigh - bands.tLow);
    if (rh >= bands.rhHigh && air.wOut <= air.wIn - DRY_START_DRIER && air.tOut <= air.tIn + DRY_START_WARM
      && (air.tOut >= air.tIn || air.tIn > bands.tLow + tRoom) && (air.tOut <= air.tIn || air.tIn < bands.tHigh - tRoom)) {
      start();
      outdoorKind = 'drying';
      reasons.exchange = dryText();
      return true;
    }
    return false;
  };
  // Why the running free cooling or outdoor drying ends now, or '' to go on (without the outdoor reading it ends).
  const outdoorEnd = (kind) => {
    if (!air) return `${kind === 'cooling' ? 'Free cooling' : 'Outdoor drying'} ends: ${bands.outdoorAir === false ? 'outdoor air is off' : 'no outdoor reading'}`;
    if (kind === 'cooling') {
      if (air.tIn <= middle) return `Free cooling ends: the room is at ${num(air.tIn)} °C`;
      if (air.tOut > air.tIn - COOL_STOP_DROP) return `Free cooling ends: outdoor ${num(air.tOut)} °C, the room ${num(air.tIn)} °C`;
      if (air.wOut > air.wIn + COOL_WET_STOP) return `Free cooling ends: outdoor air is wetter, ${num(air.wOut)} g/m³ against ${num(air.wIn)}`;
      return '';
    }
    if (rh <= rhMiddle) return `Outdoor drying ends: RH ${num(rh)} % ≤ ${num(rhMiddle)} %`;
    if (air.wOut > air.wIn - DRY_STOP_DRIER) return `Outdoor drying ends: outdoor air ${num(air.wOut)} g/m³, the room ${num(air.wIn)} g/m³`;
    if (air.tOut > air.tIn + DRY_STOP_WARM) return `Outdoor drying ends: outdoor ${num(air.tOut)} °C, the room ${num(air.tIn)} °C`;
    if (air.tOut < air.tIn && air.tIn <= bands.tLow) return `Outdoor drying ends: the cooler outdoor air took the room to ${num(air.tIn)} °C`;
    if (air.tOut > air.tIn && air.tIn >= bands.tHigh) return `Outdoor drying ends: the warmer outdoor air took the room to ${num(air.tIn)} °C`;
    return '';
  };
  // A due fresh-air run waits for very wet or hot outdoor air, for at most one more interval.
  const freshWait = () => {
    if (!air || now - freshFrom >= 2 * every) return null;
    if (air.wOut >= air.wIn + WET_WAIT) return `outdoor air is very wet (dew ${num(dewOf(air.wOut))} °C)`;
    if (air.tOut >= air.tIn + HOT_WAIT) return `outdoor air is very hot (${num(air.tOut)} °C)`;
    return null;
  };
  const freshOrWait = () => {
    const why = freshWait();
    if (why === null) startFresh();
    else reasons.exchange = `Fresh air waits: ${why}, at the latest ${clock(freshFrom + 2 * every)}`;
  };
  const outdoorWas = was && (state.exchangeKind === 'cooling' || state.exchangeKind === 'drying') ? state.exchangeKind : null;
  // A running free cooling or drying keeps its kind when the CO₂ rule takes it over (its time limit then is not a "too small" count).
  if (outdoorWas && !faults?.co2) outdoorKind = outdoorWas;
  // The timed exchange of a CO2 fault rests at most the fresh-air interval.
  const timedOff = every > 0 ? Math.min(TIMED_EXCHANGE_OFF_MS, every) : TIMED_EXCHANGE_OFF_MS;

  // Air exchange: on at or above the upper CO2 limit, off at or below the lower, kept between; at the safety level
  // it starts at once and has no time limit; otherwise it stops at the time limit.
  if (faults?.co2) {
    freshRun = false; // the timed exchange takes over a fresh-air run
    if (was) {
      if (onFor >= TIMED_EXCHANGE_ON_MS) stop();
    } else if (offFor >= timedOff) {
      start();
    }
    reasons.exchange = `CO₂ sensor fault: timed air exchange, 10 min of every ${(TIMED_EXCHANGE_ON_MS + timedOff) / 60_000}`;
  } else if (outdoorWas && (co2 === null || co2 < co2High)) {
    // Free cooling or outdoor drying: its own stop rules, the minimum on time and the time limit; a CO₂ at the upper limit hands it to the CO₂ rule below.
    outdoorKind = outdoorWas;
    const label = outdoorKind === 'cooling' ? 'Free cooling' : 'Outdoor drying';
    const ends = outdoorEnd(outdoorKind);
    if (ends && onFor >= MIN_ON_MS) {
      stop();
      reasons.exchange = ends;
    } else if (onFor >= bands.exchangeMaxMin * 60_000) {
      stop();
      reasons.exchange = `${label} stopped at the ${bands.exchangeMaxMin} min limit`;
    } else if (ends) {
      reasons.exchange = `Air exchange waits: minimum on time, ${wait(MIN_ON_MS - onFor)} to go`;
    } else {
      reasons.exchange = outdoorKind === 'cooling' ? coolText() : dryText();
    }
  } else if (freshRun && (co2 === null || co2 < co2High)) {
    // A fresh-air run: its minute, even below the lower limit; one that reaches the upper limit goes on below as normal.
    if (onFor >= FRESH_AIR_RUN_MS) {
      stop();
      reasons.exchange = `Fresh air done: fans ran ${FRESH_AIR_RUN_MS / 60_000} min`;
    } else {
      reasons.exchange = `Fresh air: fans on, ${wait(FRESH_AIR_RUN_MS - onFor)} to go`;
    }
  } else if (co2 === null) {
    if (!was && startOutdoor()) { /* started, with its reason */ } else if (freshDue) freshOrWait();
    else reasons.exchange = `CO₂ reading not usable: air exchange kept ${word(exchange)}`;
  } else if (!was) {
    if (co2 >= co2Safety) {
      start();
      reasons.exchange = `Air exchange: CO₂ ${num(co2)} ppm ≥ safety level ${co2Safety} ppm`;
    } else if (co2 >= co2High) {
      if (offFor >= MIN_OFF_MS) {
        start();
        reasons.exchange = `Air exchange: CO₂ ${num(co2)} ppm ≥ ${co2High} ppm`;
      } else {
        reasons.exchange = `Air exchange waits: minimum off time, ${wait(MIN_OFF_MS - offFor)} to go`;
      }
    } else if (startOutdoor()) {
      // free cooling or outdoor drying, with its reason
    } else if (freshDue) {
      freshOrWait();
    } else if (co2 <= co2Low) {
      reasons.exchange = `Air exchange: CO₂ ${num(co2)} ppm ≤ ${co2Low} ppm`;
    } else {
      reasons.exchange = `Air exchange kept off: CO₂ ${num(co2)} ppm between ${co2Low} and ${co2High} ppm`;
    }
  } else if (co2 >= co2Safety) {
    freshRun = false;
    reasons.exchange = `Air exchange: CO₂ ${num(co2)} ppm ≥ safety level ${co2Safety} ppm, no time limit`;
  } else if (co2 <= co2Low) {
    freshRun = false;
    if (onFor >= MIN_ON_MS) {
      stop();
      capped = 0;
      reasons.exchange = `Air exchange: CO₂ ${num(co2)} ppm ≤ ${co2Low} ppm`;
    } else {
      reasons.exchange = `Air exchange waits: minimum on time, ${wait(MIN_ON_MS - onFor)} to go`;
    }
  } else if (onFor >= bands.exchangeMaxMin * 60_000) {
    stop();
    if (!outdoorWas) capped++;
    reasons.exchange = `Air exchange stopped at the ${bands.exchangeMaxMin} min limit: CO₂ ${num(co2)} ppm above ${co2Low} ppm`;
  } else if (co2 >= co2High) {
    freshRun = false;
    reasons.exchange = `Air exchange: CO₂ ${num(co2)} ppm ≥ ${co2High} ppm`;
  } else {
    reasons.exchange = `Air exchange kept on: CO₂ ${num(co2)} ppm between ${co2Low} and ${co2High} ppm`;
  }

  // Humidifier band: on at or below the lower RH limit, off at or above the upper, kept between; with a dehumidifier it waits
  // 10 min after the dehumidifier stopped unless the room is 3 % below the band.
  // A faulty T/RH probe: on for 10 min, off for 10 min, repeating.
  // The humidifier is forced on only in exchanges of the CO₂ rule, fresh air and the timed fallback; free cooling and outdoor
  // drying leave it on its own rule (and do not count as a humidifier run for the dehumidifier's wait).
  const kind = !exchange ? null : faults?.co2 ? 'timed' : freshRun ? 'fresh' : outdoorKind ?? 'co2';
  const forced = exchange && humidifierDuringExchange && kind !== 'cooling' && kind !== 'drying';
  const offAt = dehumidifierFitted ? (state.dehumidifierOffAt ?? null) : null;
  const dryingLeft = offAt === null ? 0 : AFTER_DRY_WAIT_MS - (now - offAt);
  const note = exchange && !humidifierDuringExchange ? '; not forced during air exchange' : '';
  let why;
  if (faults?.trh) {
    humidifierSince = state.humidifierSince ?? now;
    band = Math.floor((now - humidifierSince) / TIMED_HUMIDIFIER_MS) % 2 === 0;
    why = 'Humidity sensor fault: timed humidifier, 10 min of every 20';
  } else if (rh === null) {
    humidifierSince = state.humidifierSince ?? null; // kept: a probe that is not yet called faulty (or a restart) must not restart the timer
    why = `Humidity sensor not answering: humidifier kept ${word(band)}`;
  } else if (rh <= bands.rhLow && !band && dryingLeft > 0 && rh > bands.rhLow - AFTER_DRY_MARGIN) {
    // Just below the band right after the dehumidifier stopped: its own overshoot (its 3 min minimum run), which the room
    // makes up by itself; a humidifier now would wet it again and wake the dehumidifier.
    why = `Humidifier waits: RH ${num(rh)} % after the dehumidifier dried the room (on below ${num(bands.rhLow - AFTER_DRY_MARGIN)} % or in ${Math.ceil(dryingLeft / 60_000)} min)`;
  } else if (rh <= bands.rhLow) {
    band = true;
    why = exchange && !humidifierDuringExchange ? `Humidifier: on (RH ${num(rh)} % ≤ ${bands.rhLow} %)` : `Humidifier: RH ${num(rh)} % ≤ ${bands.rhLow} %`;
  } else if (rh >= bands.rhHigh) {
    band = false;
    why = exchange && !humidifierDuringExchange
      ? `Humidifier: off (RH ${num(rh)} % ≥ ${bands.rhHigh} %${note})` : `Humidifier: RH ${num(rh)} % ≥ ${bands.rhHigh} %`;
  } else {
    why = `Humidifier kept ${word(band)}: RH ${num(rh)} % between ${bands.rhLow} and ${bands.rhHigh} %`;
  }
  reasons.humidifier = forced ? 'Humidifier: on during air exchange' : why;
  // When the humidifier was last decided on for a dry room (a run just after the dehumidifier stopped is its overshoot).
  const afterDry = offAt !== null && now - offAt < AFTER_DRY_IGNORE_MS;
  const humidifierLastOn = (forced || band) && !afterDry ? now : (state.humidifierLastOn ?? null);

  // Dehumidifier band (spec 2026-10-21-dehumidifier-design.md 3): on at or above the upper RH limit once the humidifier has been
  // off for 30 min, off at the middle of the RH band, kept between; off while the humidifier is on and with a faulty RH probe.
  reasons.dehumidifier = '';
  if (dehumidifierFitted) {
    const high = bands.rhHigh;
    const mid = (bands.rhLow + high) / 2;
    if (rhUnwired) { // no probe to say when to stop: a dry room is safer than a compressor left on
      dehumidifierBand = false;
      reasons.dehumidifier = 'No humidity probe wired: dehumidifier off';
    } else if (faults?.trh) {
      dehumidifierBand = false;
      reasons.dehumidifier = 'Humidity sensor fault: dehumidifier off';
    } else if (rh === null) {
      reasons.dehumidifier = `Humidity sensor not answering: dehumidifier kept ${word(dehumidifierBand)}`;
    } else if (forced || band) {
      dehumidifierBand = false;
      reasons.dehumidifier = 'Dehumidifier off: the humidifier is on';
    } else if (!dehumidifierBand && rh >= high && humidifierLastOn !== null && now - humidifierLastOn < DEHUMIDIFIER_QUIET_MS) {
      // A room that needed the humidifier a moment ago is not wet by itself (an air exchange wets it for a few minutes).
      reasons.dehumidifier = `Dehumidifier waits: RH ${num(rh)} %, but the humidifier ran in the last ${DEHUMIDIFIER_QUIET_MS / 60_000} min`;
    } else if (!dehumidifierBand && rh >= high) {
      dehumidifierBand = true;
      reasons.dehumidifier = `Dehumidifier: RH ${num(rh)} % ≥ ${num(high)} %`;
    } else if (dehumidifierBand && rh <= mid) {
      dehumidifierBand = false;
      reasons.dehumidifier = `Dehumidifier: RH ${num(rh)} % ≤ ${num(mid)} %`;
    } else if (rh > mid && rh < high) {
      reasons.dehumidifier = `Dehumidifier kept ${word(dehumidifierBand)}: RH ${num(rh)} % between ${num(mid)} and ${num(high)} %`;
    } else {
      reasons.dehumidifier = `Dehumidifier kept ${word(dehumidifierBand)}: RH ${num(rh)} % ${rh <= mid ? `≤ ${num(mid)} %` : `≥ ${num(high)} %`}`;
    }
  }

  const drop = bands.acDrop ?? 0;
  const lowered = exchange && drop > 0 && kind !== 'cooling'; // free cooling brings cooler air: the aircon is not lowered for it
  const target = lowered ? middle - drop : middle;
  const setpoint = Math.round(Math.min(AC_MAX, Math.max(AC_MIN, target)) * 2) / 2;
  const fanNote = acFan === 'auto' ? '' : `, fan ${acFan}`;
  reasons.ac = lowered
    ? `Aircon: ${setpoint.toFixed(1)} °C (${middle.toFixed(1)} − ${num(drop)} during air exchange)${fanNote}`
    : `Aircon: ${setpoint.toFixed(1)} °C (middle of ${bands.tLow}–${bands.tHigh})${fanNote}`;
  reasons.circulation = 'Circulation: always on';

  // Lights (spec 2026-10-26-lighting-design.md 4): the stage's daily window of the crop program; no hold.
  const lights = lightsFitted ? lightsNow(program, now, clockAt) : { on: false, reason: '' };
  reasons.lights = lights.reason;

  return {
    state: {
      exchange, exchangeSince: since, exchangeEndedAt: endedAt, exchangeForced: freshRun, exchangeKind: kind, freshFrom,
      cappedInRow: capped, humidifier: band, humidifierSince, dehumidifier: dehumidifierBand, humidifierLastOn,
      dehumidifierOffAt: state.dehumidifier && !dehumidifierBand ? now : (state.dehumidifierOffAt ?? null),
    },
    desired: {
      intake: exchange,
      exhaust: exchange,
      humidifier: forced || band,
      dehumidifier: dehumidifierFitted && dehumidifierBand,
      lights: lights.on,
      circulation: true,
      ac: { power: true, mode: 'cool', setpoint, fan: acFan },
    },
    reasons,
  };
}

// Machine protection for the humidifier, the dehumidifier and the aircon (the air exchange keeps its own times in decide).
// desired: the decided commands. commands: what is commanded now (db.getCommands). changedAt: when the controller last
// changed the humidifier, the dehumidifier and the aircon command (null or missing: never, no wait). now: ms.
// Returns { desired, held: { humidifier, dehumidifier, ac } }: a machine that must wait keeps its commanded value and has a reason text.
export function protect({ desired, commands, changedAt = {}, now }) {
  const out = { ...desired };
  const held = { humidifier: '', dehumidifier: '', ac: '' };

  const on = commands.relay.humidifier;
  if (desired.humidifier !== on && changedAt.humidifier != null && now - changedAt.humidifier < HUMIDIFIER_HOLD_MS) {
    out.humidifier = on;
    held.humidifier = `Humidifier waits: minimum ${word(on)} time, ${wait(HUMIDIFIER_HOLD_MS - (now - changedAt.humidifier))} to go`;
  }

  const dehumidifierOn = commands.relay.dehumidifier;
  if (desired.dehumidifier !== dehumidifierOn && changedAt.dehumidifier != null && now - changedAt.dehumidifier < DEHUMIDIFIER_HOLD_MS) {
    out.dehumidifier = dehumidifierOn;
    held.dehumidifier = `Dehumidifier waits: minimum ${word(dehumidifierOn)} time, ${wait(DEHUMIDIFIER_HOLD_MS - (now - changedAt.dehumidifier))} to go`;
  }

  // Never both: a dehumidifier that is already running keeps the humidifier off (its compressor's minimum on time wins),
  // otherwise a running humidifier keeps the dehumidifier off.
  if (out.humidifier && out.dehumidifier) {
    if (dehumidifierOn) {
      out.humidifier = false;
      held.humidifier = 'Humidifier waits: the dehumidifier is still on';
    } else {
      out.dehumidifier = false;
      held.dehumidifier = 'Dehumidifier waits: the humidifier is still on';
    }
  }

  const { power, mode, setpoint, fan } = commands.ac;
  if (acDiffers(commands.ac, desired.ac) && changedAt.ac != null && now - changedAt.ac < AC_HOLD_MS) {
    out.ac = { power, mode, setpoint, fan };
    held.ac = `Aircon waits: next change in ${wait(AC_HOLD_MS - (now - changedAt.ac))}`;
  }
  return { desired: out, held };
}

// Validates a whole settings object. Returns { error, field } for the first problem, or null.
// compareSafety false skips only the check that the safety level is above co2High (the range is still checked).
export function validateControl(c, { compareSafety = true } = {}) {
  if (typeof c.auto !== 'boolean') return { error: 'auto must be true or false', field: 'auto' };
  if (typeof c.humidifierDuringExchange !== 'boolean') {
    return { error: 'humidifierDuringExchange must be true or false', field: 'humidifierDuringExchange' };
  }
  if (!AC_FANS.includes(c.acFan)) return { error: 'Aircon fan must be auto, low or high', field: 'acFan' };
  for (const { low, high, label, min, max, unit } of BANDS) {
    for (const [field, side] of [[low, 'lower'], [high, 'upper']]) {
      const v = c[field];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
        return { error: `${label} ${side} limit must be a number from ${min} to ${max} ${unit}`, field };
      }
    }
    if (c[low] >= c[high]) return { error: `${label} lower limit must be below the upper limit`, field: low };
  }
  if (typeof c.co2Safety !== 'number' || !Number.isFinite(c.co2Safety) || c.co2Safety > 10_000) {
    return { error: 'CO₂ safety level must be a number up to 10000 ppm', field: 'co2Safety' };
  }
  if (compareSafety && c.co2Safety <= c.co2High) return { error: 'CO₂ safety level must be above the CO₂ band upper limit', field: 'co2Safety' };
  if (!Number.isInteger(c.exchangeMaxMin) || c.exchangeMaxMin < 1 || c.exchangeMaxMin > 120) {
    return { error: 'Air exchange time limit must be a whole number from 1 to 120 min', field: 'exchangeMaxMin' };
  }
  if (typeof c.acDrop !== 'number' || !Number.isFinite(c.acDrop) || c.acDrop < 0 || c.acDrop > AC_DROP_MAX) {
    return { error: `Aircon lower during air exchange must be a number from 0 to ${AC_DROP_MAX} °C`, field: 'acDrop' };
  }
  if (!Number.isInteger(c.exchangeEveryMin) || c.exchangeEveryMin < 0 || c.exchangeEveryMin > EVERY_MAX) {
    return { error: `Fresh air interval must be a whole number from 0 to ${EVERY_MAX} min (0: off)`, field: 'exchangeEveryMin' };
  }
  if (typeof (c.outdoorAir ?? true) !== 'boolean') return { error: 'Use outdoor air must be true or false', field: 'outdoorAir' };
  return null;
}

const emptyReasons = () => ({ exchange: '', humidifier: '', dehumidifier: '', lights: '', ac: '', circulation: '', held: { humidifier: '', dehumidifier: '', ac: '' } });
const BYPASS = { bypassAuto: true };
const RESENDS = 3;
const NAMES = { intake: 'Intake fan', exhaust: 'Exhaust fan', circulation: 'Circulation fan', humidifier: 'Humidifier', dehumidifier: 'Dehumidifier', lights: 'Lights', ac: 'Aircon' };
const REASON_OF = { intake: 'exchange', exhaust: 'exchange', circulation: 'circulation', humidifier: 'humidifier', dehumidifier: 'dehumidifier', lights: 'lights', ac: 'ac' };

// db: the farm database. machines: from createMachines. now is injectable. checks (createSensorChecks) and alarms
// (createAlarms) are made here unless a test passes its own.
// log is only for errors that are not command failures (a database error).
export function createController({ db, machines, now = Date.now, log = console.error, checks = createSensorChecks({ now }), alarms = createAlarms({ db, now }) }) {
  const reasons = new Map(); // roomId → { exchange, humidifier, ac, circulation, held }, in memory only
  const tries = new Map(); // `${roomId}/${machine}` → { want, n }: re-sends in the current not-following episode
  const changed = new Map(); // `${roomId}/humidifier|dehumidifier|ac` → when the controller last changed that command (machine protection)
  const lastCo2 = new Map(); // roomId → the last good CO₂ reading (for the planned end of an exchange)
  let lastStart = null; // the start time of the previous cycle

  // Drops what is kept in memory for a deleted room.
  function forget(roomId) {
    reasons.delete(roomId);
    lastCo2.delete(roomId);
    for (const key of [...RELAY_KEYS, 'ac']) tries.delete(`${roomId}/${key}`);
    for (const key of ['humidifier', 'dehumidifier', 'ac']) changed.delete(`${roomId}/${key}`);
    checks.forget(roomId);
    alarms.forget(roomId);
  }

  // The last check of each sensor as { ok, why, fault }, null for a sensor not checked yet.
  function checksOf(roomId) {
    const view = (r) => (r ? { ok: r.ok, why: r.why, fault: r.fault } : null);
    const { trh, co2 } = checks.get(roomId);
    return { trh: view(trh), co2: view(co2) };
  }

  // When the running exchange is planned to stop: the time limit after its start, 10 min for a timed exchange (CO₂ sensor
  // fault), 1 min for a fresh-air run; null when off, with auto off, or while the CO₂ is at the safety level (no limit).
  function exchangeEndsAt(roomId, c) {
    if (!c.auto || !c.exchange || c.exchangeSince === null) return null;
    if (checks.get(roomId).co2?.fault) return c.exchangeSince + TIMED_EXCHANGE_ON_MS;
    if (c.exchangeForced) return c.exchangeSince + FRESH_AIR_RUN_MS;
    if ((lastCo2.get(roomId) ?? 0) >= c.co2Safety) return null;
    return c.exchangeSince + c.exchangeMaxMin * 60_000;
  }

  // The room's control settings with the reasons, or null when there is no such room.
  function get(roomId) {
    const c = db.getControl(roomId);
    if (!c) {
      forget(roomId);
      return null;
    }
    const { humidifier, humidifierSince, dehumidifier, humidifierLastOn, dehumidifierOffAt, ...rest } = c; // the band states, not the machines' commands
    return { ...rest, humidifierBand: humidifier, dehumidifierBand: dehumidifier, exchangeEndsAt: exchangeEndsAt(roomId, c), outdoorSet: db.outdoorAddress() !== null, checks: checksOf(roomId), reasons: { ...emptyReasons(), ...reasons.get(roomId) } };
  }

  // The reading of this cycle of a sensor (even a failed poll), or null (no data, or older than the cycle).
  function latest(sensor, cycleStart) {
    const r = sensor.readings.at(-1);
    return r && r.at >= cycleStart ? r : null;
  }

  const stillAuto = (roomId) => Boolean(db.getControl(roomId)?.auto);

  async function runRoom(room, cycleStart, prevStart) {
    let c = db.getControl(room.id);
    if (!c) return;
    const at = now();

    // The stage program (auto on or off): a due stage change, and the ramped bands written to the settings when they differ.
    let program = db.getProgram(room.id);
    let blocksDone = null;
    if (program.crops.length > 0) {
      const next = advance(program, at, c);
      if (next.program !== program) db.setProgram(room.id, next.program);
      program = next.program; // the lights follow the stage of now
      if (next.bands && BAND_KEYS.some((k) => next.bands[k] !== c[k])) {
        db.setControl(room.id, { ...c, ...next.bands });
        c = db.getControl(room.id);
      }
      if (next.program.done) blocksDone = { flush: next.program.flush, flushes: next.program.flushes };
    }
    const commands = db.getCommands(room.id);

    // Check the sensors (auto on or off); a reading that fails a check counts as missing.
    const exchangeRecent = commands.relay.intake || commands.relay.exhaust || (c.exchangeEndedAt !== null && prevStart !== null && c.exchangeEndedAt >= prevStart);
    const ctx = { exchangeRecent, humidifierOn: commands.relay.humidifier };
    const good = { t: null, rh: null, co2: null };
    const unwired = { trh: false, co2: false };
    for (const sensor of db.getSensors(room.id, 1)) {
      if (sensor.status === 'not-wired') {
        checks.forget(room.id, sensor.kind);
        unwired[sensor.kind] = true;
        continue;
      }
      const r = latest(sensor, cycleStart);
      if (!r) continue; // not polled this cycle: nothing changes
      const result = checks.check(room.id, sensor.kind, r, ctx);
      if (sensor.kind === 'trh') {
        if (result.parts.t.ok) good.t = r.t;
        if (result.parts.rh.ok) good.rh = r.rh;
      } else if (result.ok) {
        good.co2 = r.co2;
      }
    }
    const status = checks.get(room.id);
    // A value whose sensor is faulty or not wired clears its process alarms (a missing reading only pauses them).
    const parts = (kind, name) => unwired[kind] || Boolean(status[kind]?.parts[name].fault);
    const clear = { t: parts('trh', 't'), rh: parts('trh', 'rh'), co2: parts('co2', 'co2') };
    if (good.co2 !== null) lastCo2.set(room.id, good.co2);
    else if (unwired.co2) lastCo2.delete(room.id);
    const faults = { trh: status.trh?.fault ? status.trh.faultWhy : null, co2: status.co2?.fault ? status.co2.faultWhy : null };

    // What to send: the differences, and a machine that is not following again (at most RESENDS times per episode).
    const view = machines.get(room.id);
    const sends = [];
    let desired = null;
    let cappedInRow = c.cappedInRow;
    if (c.auto) {
      const decided = decide({
        bands: c,
        state: {
          exchange: c.exchange, exchangeSince: c.exchangeSince, exchangeEndedAt: c.exchangeEndedAt,
          exchangeForced: c.exchangeForced, exchangeKind: c.exchangeKind, freshFrom: c.freshFrom,
          cappedInRow: c.cappedInRow, humidifier: c.humidifier, humidifierSince: c.humidifierSince, dehumidifier: c.dehumidifier,
          humidifierLastOn: c.humidifierLastOn, dehumidifierOffAt: c.dehumidifierOffAt,
        },
        readings: { rh: good.rh, co2: good.co2, t: good.t, outdoor: c.outdoorAir ? outdoorReading(db, at) : null },
        faults: { trh: Boolean(status.trh?.parts.rh.fault), co2: faults.co2 !== null }, // only an RH fault times the humidifier
        now: at,
        humidifierDuringExchange: c.humidifierDuringExchange,
        acFan: c.acFan,
        dehumidifierFitted: room.dehumidifier,
        rhUnwired: unwired.trh,
        lightsFitted: room.lights,
        program,
      });
      const why = decided.reasons;
      db.setControlState(room.id, decided.state, at);
      cappedInRow = decided.state.cappedInRow;
      const protectedNow = protect({
        desired: decided.desired, commands, changedAt: {
          humidifier: changed.get(`${room.id}/humidifier`), ac: changed.get(`${room.id}/ac`),
          // after a restart or turning auto on the last switch comes from the machine log: a compressor must not restart at once
          dehumidifier: changed.get(`${room.id}/dehumidifier`) ?? db.lastLogAt(room.id, 'dehumidifier'),
        }, now: at,
      });
      desired = protectedNow.desired;
      why.held = protectedNow.held;

      const statusOf = { ac: view?.ac?.status };
      for (const m of view?.relay?.machines ?? []) statusOf[m.key] = m.status;
      const plan = (key, want, differs) => {
        const slot = `${room.id}/${key}`;
        const sig = JSON.stringify(want);
        let entry = tries.get(slot);
        if (!entry || entry.want !== sig) tries.set(slot, entry = { want: sig, n: 0 });
        const status = statusOf[key];
        if (differs) {
          entry.n = 0;
          sends.push(key);
          if (key === 'humidifier' || key === 'dehumidifier' || key === 'ac') changed.set(slot, at);
        } else if (status === 'not-following') {
          const name = NAMES[key];
          if (entry.n < RESENDS) {
            entry.n++;
            sends.push(key);
            why[REASON_OF[key]] += `; ${name}: not following, sent again (${entry.n} of ${RESENDS})`;
          } else {
            why[REASON_OF[key]] += `; ${name}: not following after ${RESENDS} tries`;
          }
        } else if (status === 'on' || status === 'off') {
          entry.n = 0;
        }
      };
      if (room.relayAddress !== null) {
        for (const key of RELAY_KEYS) {
          if (!fitted(room, key)) continue; // not fitted: never commanded
          plan(key, desired[key], commands.relay[key] !== desired[key]);
        }
      }
      if (room.acAddress !== null) plan('ac', desired.ac, acDiffers(commands.ac, desired.ac));
      reasons.set(room.id, why);
    }

    // An alarm error must not stop this room's commands. The room is read again for its filter: a Filter changed may have
    // landed while an earlier room of this run was sending (listRooms was read once, before them).
    try {
      const filter = filterInput(db, db.getRoom(room.id) ?? room, at, view);
      alarms.evaluate(room, { readings: good, bands: c, faults, clear, cappedInRow, machines: view, blocksDone, filter });
    } catch (err) {
      log(err);
    }

    for (const key of sends) {
      if (!stillAuto(room.id)) return; // the user took over while we were sending
      await machines.command(room.id, key, key === 'ac' ? desired.ac : { on: desired[key] }, BYPASS);
    }
  }

  return {
    get,

    forget,

    // The room's filter was changed (filter.js changeFilter cleared its alarms): the old filter's delay counts go too.
    filterChanged(roomId) {
      alarms.reset(roomId, FILTER_KEYS);
    },

    // Applies any of auto, humidifierDuringExchange, acFan, co2Safety, exchangeMaxMin, acDrop, exchangeEveryMin and the six limits and returns the view like get.
    // Returns null when there is no such room; throws CommandError (400, with field) for a bad value.
    update(roomId, body) {
      const current = db.getControl(roomId);
      if (!current) return null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new CommandError(400, 'Body must be a JSON object');
      const merged = {};
      for (const key of Object.keys(DEFAULTS)) merged[key] = key in body ? body[key] : current[key];
      // The safety level is compared with the CO₂ band only when the body sets one of them, so a room whose
      // stored band is above its level can still switch auto, the humidifier option or the fan.
      const bad = validateControl(merged, { compareSafety: 'co2High' in body || 'co2Safety' in body });
      if (bad) throw new CommandError(400, bad.error, bad.field);
      db.setControl(roomId, merged);
      // A person's change of a band ends a running ramp (a band sent unchanged, e.g. with another setting, does not).
      if (BAND_KEYS.some((k) => k in body && body[k] !== current[k])) {
        const program = db.getProgram(roomId);
        if (program.ramp) db.setProgram(roomId, { ...program, ramp: null });
      }
      if (merged.auto && !current.auto) {
        for (const key of [...RELAY_KEYS, 'ac']) tries.delete(`${roomId}/${key}`);
        for (const key of ['humidifier', 'dehumidifier', 'ac']) changed.delete(`${roomId}/${key}`);
        // Turning auto on: the band states start from what is commanded now, with no old times or counts.
        // An old start time must not survive: clear the state first.
        const { relay } = db.getCommands(roomId);
        db.setControlState(roomId, { exchange: false, humidifier: false, dehumidifier: false }, now());
        db.setControlState(roomId, {
          exchange: relay.intake, humidifier: relay.humidifier, dehumidifier: relay.dehumidifier, exchangeEndedAt: null, cappedInRow: 0, humidifierSince: null,
          exchangeForced: false, exchangeKind: null, freshFrom: null, // the fresh-air wait counts from the first cycle
          autoChangedAt: now(),
        }, now());
      } else if (!merged.auto && current.auto) {
        // Turning auto off: nothing is switched; the "too small" count and the timed humidifier start over. The Manual
        // reminder (alarm 'manualLong') counts from now.
        db.setControlState(roomId, { exchange: current.exchange, humidifier: current.humidifier, dehumidifier: current.dehumidifier, cappedInRow: 0, humidifierSince: null, autoChangedAt: now() }, now());
      }
      return get(roomId);
    },

    // Called after each poll cycle; cycleStart is the time that cycle began. Every room gets its sensors checked and
    // its alarms evaluated; only rooms with auto on are controlled.
    async run(cycleStart) {
      const prevStart = lastStart;
      lastStart = cycleStart;
      for (const room of db.listRooms()) {
        try {
          await runRoom(room, cycleStart, prevStart);
        } catch (err) {
          log(err);
        }
      }
    },
  };
}
