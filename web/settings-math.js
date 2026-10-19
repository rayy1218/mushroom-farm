// Pure helpers for the Settings page and the room page refresh (no DOM, so they can be tested in Node).

export const POLL_MIN = 1;
export const POLL_MAX = 300;
export const DEFAULT_POLL = 5;
export const POLL_MESSAGE = 'Reading interval must be a whole number from 1 to 300 seconds';

// The text of the input → whole seconds, or null when it is not a whole number from 1 to 300.
export function parsePoll(text) {
  const s = String(text ?? '').trim();
  if (!/^[0-9]{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= POLL_MIN && n <= POLL_MAX ? n : null;
}

// How often the room page refreshes: the reading interval, clamped to 2–30 s; 5 s when unknown.
export function refreshMs(settings) {
  const n = settings?.pollSeconds;
  if (!Number.isFinite(n)) return DEFAULT_POLL * 1000;
  return Math.min(30, Math.max(2, n)) * 1000;
}
