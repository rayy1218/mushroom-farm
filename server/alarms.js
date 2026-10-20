// Alarms (spec 2026-10-19-safety-and-history-design.md section 3): the controller's run calls evaluate once per room
// and cycle. A condition must hold for its delay before an alarm is raised; an active alarm clears with a little
// hysteresis. The alarms themselves are rows of the alarms table (see db.js); only the delay counts are in memory.

const MIN_MS = 60_000;
const EPS = 1e-9; // for limits like tHigh + 0.8
const HUMIDIFIER_DELAY = 30 * MIN_MS; // the humidifier too small: running this long with the humidity below the band

const num = (x) => String(Math.round(x * 10) / 10);

export const MACHINE_NAMES = { intake: 'Intake fan', exhaust: 'Exhaust fan', circulation: 'Circulation fan', humidifier: 'Humidifier', ac: 'Aircon' };
export const MACHINE_KEYS = Object.keys(MACHINE_NAMES);
const BAD_STATUS = {
  'not-following': () => 'not following its command',
  'not-running': () => 'not running (switch on, no current)',
  'running-while-off': () => 'running while switched off',
  fault: (m) => `fault (error code ${m.errorCode})`,
  'no-answer': (m, key) => `no answer from the ${key === 'ac' ? 'aircon gateway' : 'relay module'}`,
};

// The process alarms: raised when `hit` holds for the delay, cleared when `released` holds. A rule gets the good
// value of its reading (null when the sensor is faulty or gave nothing: no alarm from a bad sensor) and the bands.
const PROCESS = [
  { key: 'tHigh', sensor: 't', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.t,
    hit: (v, b) => v > b.tHigh + 1, released: (v, b) => v <= b.tHigh + 0.8 + EPS,
    text: (v, b) => `Temperature ${num(v)} °C, above ${b.tHigh} + 1` },
  { key: 'tLow', sensor: 't', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.t,
    hit: (v, b) => v < b.tLow - 1, released: (v, b) => v >= b.tLow - 0.8 - EPS,
    text: (v, b) => `Temperature ${num(v)} °C, below ${b.tLow} − 1` },
  { key: 'rhLow', sensor: 'rh', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.rh,
    hit: (v, b) => v < b.rhLow - 5, released: (v, b) => v >= b.rhLow - 4 - EPS,
    text: (v, b) => `Humidity ${num(v)} %, below ${b.rhLow} − 5` },
  // A wet room (water on caps and walls: blotch, soft mushrooms). The delay is longer than one air exchange, which
  // can wet the room for a while in Malaysian air.
  { key: 'rhHigh', sensor: 'rh', level: 'warning', delay: 15 * MIN_MS, read: (r) => r.rh,
    hit: (v, b) => v > b.rhHigh + 3, released: (v, b) => v <= b.rhHigh + 2 + EPS,
    text: (v, b) => `Humidity ${num(v)} %, above ${b.rhHigh} + 3` },
  { key: 'co2High', sensor: 'co2', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.co2,
    hit: (v, b) => v > b.co2High + 100, released: (v, b) => v <= b.co2High + 80 + EPS,
    text: (v, b) => `CO₂ ${num(v)} ppm, above ${b.co2High} + 100` },
  { key: 'co2Safety', sensor: 'co2', level: 'critical', delay: MIN_MS, read: (r) => r.co2,
    hit: (v, b) => v >= b.co2Safety, released: (v, b) => v < b.co2Safety - 20,
    text: (v, b) => `CO₂ ${num(v)} ppm, at or above the safety level ${b.co2Safety}` },
];

// db: the farm database (alarm queries). now is injectable.
export function createAlarms({ db, now = Date.now }) {
  const pending = new Map(); // `${roomId}/${key}` → when the raising condition began to hold

  // Handles one alarm kind. result: null when it cannot be told (nothing changes, the count is dropped), else
  // { hit, released, text }. active: the room's active alarms by key.
  function apply(room, active, key, level, delay, result) {
    const slot = `${room.id}/${key}`;
    if (result === null) {
      pending.delete(slot);
      return;
    }
    const at = now();
    if (active.has(key)) {
      if (result.released) db.clearAlarm(room.id, key, at);
      return;
    }
    if (!result.hit) {
      pending.delete(slot);
      return;
    }
    if (!pending.has(slot)) pending.set(slot, at);
    if (at - pending.get(slot) >= delay) {
      pending.delete(slot);
      db.raiseAlarm(room.id, key, level, result.text(), at);
    }
  }

  return {
    // room: { id }. input: { readings: { t, rh, co2 } (good values or null), bands (the room's control settings),
    // faults: { trh, co2 } (the fault text or null),
    // clear: { t, rh, co2 } (true when that value's sensor is faulty or not wired: its process alarms clear), cappedInRow, machines (the machines view or null) }.
    evaluate(room, { readings, bands, faults, clear = {}, cappedInRow, machines }) {
      const active = new Map(db.activeAlarms(room.id).map((a) => [a.key, a]));

      for (const rule of PROCESS) {
        const v = rule.read(readings);
        if (clear[rule.sensor]) {
          // A faulty or unwired sensor: the alarm ends (the sensor fault alarm says why) and the count is dropped.
          if (active.has(rule.key)) db.clearAlarm(room.id, rule.key, now());
          pending.delete(`${room.id}/${rule.key}`);
          continue;
        }
        const result = v === null || v === undefined ? null
          : { hit: rule.hit(v, bands), released: rule.released(v, bands), text: () => rule.text(v, bands) };
        apply(room, active, rule.key, rule.level, rule.delay, result);
      }

      for (const [key, name, fault] of [['sensorTrh', 'T/RH probe', faults.trh], ['sensorCo2', 'CO₂ sensor', faults.co2]]) {
        apply(room, active, key, 'serious', 0, { hit: Boolean(fault), released: !fault, text: () => `${name} fault: ${fault}` });
      }

      apply(room, active, 'exchangeTooSmall', 'warning', 0, {
        hit: cappedInRow >= 3,
        released: cappedInRow === 0,
        text: () => `Air exchange too small: ${cappedInRow} exchanges in a row stopped at the ${bands.exchangeMaxMin} min limit before CO₂ reached ${bands.co2Low} ppm`,
      });

      // A humidifier too small for the room: running (switched on and drawing current) for HUMIDIFIER_DELAY with the humidity
      // still below the band. Not from a faulty probe; a missing reading pauses the count.
      const humidifierOn = machines?.relay?.machines?.find((x) => x.key === 'humidifier')?.status === 'on';
      if (clear.rh) {
        if (active.has('humidifierTooSmall')) db.clearAlarm(room.id, 'humidifierTooSmall', now());
        pending.delete(`${room.id}/humidifierTooSmall`);
      } else {
        const rh = readings.rh;
        apply(room, active, 'humidifierTooSmall', 'warning', HUMIDIFIER_DELAY, rh === null || rh === undefined ? null : {
          hit: humidifierOn && rh < bands.rhLow,
          released: !humidifierOn || rh >= bands.rhLow,
          text: () => `Humidifier too small: running ${HUMIDIFIER_DELAY / MIN_MS} min and the humidity is still ${num(rh)} %, below ${bands.rhLow}`,
        });
      }

      for (const key of MACHINE_KEYS) {
        const m = key === 'ac' ? machines?.ac : machines?.relay?.machines?.find((x) => x.key === key);
        const status = m?.status;
        let result = null;
        if (status === 'not-wired') result = { hit: false, released: true, text: () => '' };
        else if (status !== undefined) {
          const bad = status in BAD_STATUS;
          result = { hit: bad, released: !bad, text: () => `${MACHINE_NAMES[key]}: ${BAD_STATUS[status](m, key)}` };
        }
        apply(room, active, `machine.${key}`, 'serious', MIN_MS, result);
      }
    },

    // Drops the delay counts of a deleted room.
    forget(roomId) {
      for (const slot of [...pending.keys()]) if (slot.startsWith(`${roomId}/`)) pending.delete(slot);
    },
  };
}
