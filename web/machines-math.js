// Pure helpers for the Machines card (no DOM, so they can be tested in Node).

export const MACHINE_NAMES = {
  intake: 'Intake fan',
  exhaust: 'Exhaust fan',
  circulation: 'Circulation fan',
  humidifier: 'Humidifier',
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
};

export const MODES = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan' };
export const FANS = { auto: 'Auto', low: 'Low', high: 'High' };

export const SETPOINT_MIN = 16;
export const SETPOINT_MAX = 30;

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

export function sameAc(a, b) {
  return Boolean(a) && Boolean(b) && a.power === b.power && a.mode === b.mode && a.setpoint === b.setpoint && a.fan === b.fan;
}
