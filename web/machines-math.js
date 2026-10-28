// Pure helpers for the Machines card (no DOM, so they can be tested in Node).

export const MACHINE_NAMES = {
  intake: 'Intake fan',
  exhaust: 'Exhaust fan',
  circulation: 'Circulation fan',
  humidifier: 'Humidifier',
  dehumidifier: 'Dehumidifier',
  lights: 'Lights',
};

export const STATUS_WORDS = {
  'not-wired': 'Not wired',
  'no-data': 'No data yet',
  'no-answer': 'No answer',
  switching: 'Switching…',
  'not-following': 'Not following',
  'not-running': 'Not running',
  'running-while-off': 'Running while off',
  fault: 'Fault',
  on: 'On',
  off: 'Off',
  'not-fitted': 'Not fitted',
};

export const MODES = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan' };
export const FANS = { auto: 'Auto', low: 'Low', high: 'High' };

export const SETPOINT_MIN = 16;
export const SETPOINT_MAX = 30;

// The relay machines to show: one the room does not have (a dehumidifier or lights that are not fitted) is left out.
export function shownMachines(machines) {
  return (machines ?? []).filter((m) => m.status !== 'not-fitted');
}

// A relay machine's row on the Switch by hand card: { state, problem }. The state is one word (Running or Stopped from its
// current switch, else the reported On or Off); problem says, only when it happens, that it does not do what it was told.
const PROBLEMS = {
  'not-running': (m) => `Commanded ${onOff(m.commanded)}, not running`,
  'not-following': (m) => `Commanded ${onOff(m.commanded)}, the relay reports ${onOff(m.reported)}`,
  'running-while-off': () => 'Commanded off, still running',
  'no-answer': () => 'The relay module does not answer',
  fault: () => 'Fault',
};
export function relayLine(m) {
  if (m.status === 'no-data' || m.status === 'switching') return { state: statusWord(m.status), problem: '' };
  const state = m.running === true ? 'Running' : m.running === false ? 'Stopped' : m.reported == null ? '—' : m.reported ? 'On' : 'Off';
  return { state, problem: PROBLEMS[m.status]?.(m) ?? '' };
}

export function statusWord(status) {
  return STATUS_WORDS[status] ?? String(status);
}

export function onOff(value) {
  return value == null ? '—' : value ? 'on' : 'off';
}

// 16 to 30 in steps of 0.5.
export function validSetpoint(v) {
  return Number.isFinite(v) && v >= SETPOINT_MIN && v <= SETPOINT_MAX && Number.isInteger(v * 2);
}

// "On · Cool · 23.5 °C · fan Auto", or "—" while the gateway's settings are unknown.
export function describeAc(s) {
  if (!s) return '—';
  const power = s.power ? 'On' : 'Off';
  const mode = MODES[s.mode] ?? s.mode;
  const fan = FANS[s.fan] ?? s.fan;
  return `${power} · ${mode} · ${Number(s.setpoint).toFixed(1)} °C · fan ${fan}`;
}

// The four values the server needs for PUT .../machines/ac.
export function acBody({ power, mode, setpoint, fan }) {
  return { power: Boolean(power), mode, setpoint, fan };
}

// True when the gateway reports exactly what the farm commanded.
export function acMatches(commanded, reported) {
  return Boolean(commanded) && Boolean(reported)
    && commanded.power === reported.power && commanded.mode === reported.mode
    && commanded.setpoint === reported.setpoint && commanded.fan === reported.fan;
}

// "Last write failed 2 min ago: timeout", or "" when there is nothing to say.
// inSync: a later poll shows the device doing what was commanded, so the old failure no longer matters.
export function lastWriteText(w, now, inSync, agoText) {
  if (!w || w.ok || inSync) return '';
  return `Last write failed ${agoText(now - w.at)}: ${w.error}`;
}
