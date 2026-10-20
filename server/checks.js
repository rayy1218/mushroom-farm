// Sensor checks (spec 2026-10-19-safety-and-history-design.md section 1): range, sudden jump and frozen value
// per reading, and a fault after 3 bad readings in a row. State is in memory per room and kind.

const MIN_MS = 60_000;
const FAULT_AFTER = 3; // bad readings in a row
const JUMP_AGREE = 3; // readings in a row that agree with each other: the jump is real
const MIN_STEP_MIN = 1; // a jump is judged over at least one minute: short reading intervals do not turn noise into jumps

// range, rate (change per minute allowed), frozen (minutes of the exact same value)
const SPECS = {
  t: { min: -10, max: 60, rate: 2, frozenMin: 120 },
  rh: { min: 1, max: 100, rate: 15, frozenMin: 120 },
  co2: { min: 300, max: 10_000, rate: 1000, frozenMin: 60 },
};
const PARTS = { trh: ['t', 'rh'], co2: ['co2'] };
const RH_FROZEN_HUMIDIFIER_MIN = 30; // while the humidifier is commanded on
const WET_RH = 99.9; // a wet probe reads 100: never frozen

export const WHY = {
  none: 'no reading',
  range: 'value out of range',
  jump: 'sudden jump',
  frozen: 'value does not change (frozen)',
};

const rateOf = (prev, v, at) => Math.abs(v - prev.v) / Math.max((at - prev.at) / MIN_MS, MIN_STEP_MIN);

const newState = () => ({ last: null, same: null, pending: [], bad: 0, why: null });

// Checks one value. Returns null when it is good, else the text why not. ctx: { exchangeRecent, humidifierOn }.
function checkValue(st, name, v, at, ctx) {
  const spec = SPECS[name];
  // When the humidifier went on (first seen on); RH is not called frozen from before that.
  if (name === 'rh') st.humidifierOnSince = ctx.humidifierOn ? (st.humidifierOnSince ?? at) : null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return WHY.none;
  if (v < spec.min || v > spec.max) return WHY.range;
  if (st.same?.v !== v) st.same = { v, since: at };

  // Sudden jump: against the last good value; a jump is accepted once 3 readings in a row agree.
  if (st.last) {
    // Expected fast changes: a falling CO2, and T and RH either way, while an air exchange runs and in the cycle after
    // it stopped (outdoor air reaches the probe within a minute); RH while the humidifier is on.
    const expected = ctx.exchangeRecent && (name === 't' || name === 'rh' || (name === 'co2' && v < st.last.v))
      || (name === 'rh' && ctx.humidifierOn);
    if (expected || rateOf(st.last, v, at) <= spec.rate) {
      st.pending = [];
    } else {
      const prev = st.pending.at(-1);
      st.pending = prev && rateOf(prev, v, at) <= spec.rate ? [...st.pending, { v, at }] : [{ v, at }];
      if (st.pending.length < JUMP_AGREE) return WHY.jump;
      st.pending = [];
    }
  }

  // While the humidifier is on, a steady RH counts from the later of the same-value start and the humidifier start.
  const humidifying = name === 'rh' && st.humidifierOnSince !== null;
  const frozenMin = humidifying ? RH_FROZEN_HUMIDIFIER_MIN : spec.frozenMin;
  const steadySince = humidifying ? Math.max(st.same.since, st.humidifierOnSince) : st.same.since;
  if (!(name === 'rh' && v >= WET_RH) && at - steadySince >= frozenMin * MIN_MS) return WHY.frozen;
  st.last = { v, at };
  return null;
}

// now is only used for a reading without a time.
export function createSensorChecks({ now = Date.now } = {}) {
  const states = new Map(); // `${roomId}/${kind}/${part}` → state
  const results = new Map(); // `${roomId}/${kind}` → the last result

  const stateOf = (key) => {
    if (!states.has(key)) states.set(key, newState());
    return states.get(key);
  };

  return {
    // reading: { at, ok, t, rh } or { at, ok, co2 }, the reading of this cycle. Returns
    // { ok, why, fault, faultWhy, parts: { t|rh|co2: { ok, why, fault, faultWhy } } }; why is null when ok.
    check(roomId, kind, reading, ctx = {}) {
      const at = reading.at ?? now();
      const parts = {};
      for (const name of PARTS[kind]) {
        const st = stateOf(`${roomId}/${kind}/${name}`);
        const why = reading.ok ? checkValue(st, name, reading[name], at, ctx) : WHY.none;
        if (why) {
          st.bad++;
          st.why = why;
        } else {
          st.bad = 0;
          st.why = null;
        }
        const fault = st.bad >= FAULT_AFTER;
        parts[name] = { ok: why === null, why, fault, faultWhy: fault ? st.why : null };
      }
      const list = Object.values(parts);
      const result = {
        ok: list.every((p) => p.ok),
        why: list.find((p) => !p.ok)?.why ?? null,
        fault: list.some((p) => p.fault),
        faultWhy: list.find((p) => p.fault)?.faultWhy ?? null,
        parts,
      };
      results.set(`${roomId}/${kind}`, result);
      return result;
    },

    // The last result of each kind, null for a sensor not checked yet.
    get(roomId) {
      return { trh: results.get(`${roomId}/trh`) ?? null, co2: results.get(`${roomId}/co2`) ?? null };
    },

    // Drops the state of a room, or of one kind of it (a sensor that is no longer wired).
    forget(roomId, kind = null) {
      for (const k of kind ? [kind] : Object.keys(PARTS)) {
        results.delete(`${roomId}/${k}`);
        for (const name of PARTS[k]) states.delete(`${roomId}/${k}/${name}`);
      }
    },
  };
}
