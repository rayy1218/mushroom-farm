// web/login-math.js
// The sign-in view's words and checks (spec 2026-11-06-login-design.md 6).

// The box for each kind of secret (GET /api/login/names' kind).
export const SECRET = {
  pin: { label: 'PIN', hint: '6 digits', inputmode: 'numeric', autocomplete: 'off', maxlength: 6 },
  password: { label: 'Password', hint: null, inputmode: 'text', autocomplete: 'current-password', maxlength: 200 },
};

// Checked before it is sent (the server checks again): → the words, or null.
export function secretProblem(kind, secret) {
  if (kind === 'pin') return /^[0-9]{6}$/.test(secret) ? null : 'Type your 6-digit PIN';
  return secret.length ? null : 'Type your password';
}

// Where to go once signed in: the address asked for, else the role's first page.
export const landing = (hash, role) => (hash && hash !== '#' && hash !== '#/' ? hash : role === 'owner' ? '#/overview' : '#/today');

export const failText = (status, message) => (status === 0 ? "Couldn't reach the farm app. Try again." : message || 'Something went wrong. Try again.');

// A sign-in the server accepted but the browser did not keep (cookies blocked; plain http on the tailnet works: the cookie is
// Secure only through Tailscale's https proxy).
export const NOT_KEPT = 'This browser did not keep the sign-in. Allow cookies for the farm app and try again.';

// ---- Login polish (audit 2026-11-10) ----

// A PIN sends itself at its 6th digit (on a phone there is no Enter on the number pad): exactly 6 digits, nothing on its way.
export const pinComplete = (kind, value, busy) => kind === 'pin' && !busy && /^[0-9]{6}$/.test(value);

// After a wrong try a password stays in its box, selected (one slip in a long password is retyped, not the whole); a PIN is cleared.
export const keepsSecret = (kind) => kind === 'password';

// A lock's reply (429) says how long it lasts (retryInMs, by the server's clock) and when it ends (retryAt): Sign in waits
// that long from now, so a phone whose clock is off still waits the right time; never longer than a lock lasts (15 minutes).
// retryAt alone (an older server) counts by the phone's clock. → the time to wait until, or null (nothing held).
const MAX_HOLD_MS = 15 * 60_000;
export function lockedUntil(status, retryAt, now, retryInMs) {
  if (status !== 429) return null;
  const wait = Number.isFinite(retryInMs) ? retryInMs : Number.isFinite(retryAt) ? retryAt - now : 0;
  return wait > 0 ? now + Math.min(wait, MAX_HOLD_MS) : null;
}

// The top bar's Sign out: the first name beside its icon (the CSS cuts a long one at 8 ch), its initial where there is no room.
export const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0];
export const initialOf = (name) => firstName(name).charAt(0).toUpperCase();
export const signOutLabel = (name) => (name ? `${name}: Sign out` : 'Sign out');
export const signOutFailText = (status, message) => `Not signed out: ${status === 0 ? "couldn't reach the farm app" : message}. Try again.`;

// No accounts yet: the command its own piece, shown as code that does not wrap.
export const NO_ACCOUNTS = ['Nobody can sign in yet: the owner sets the first password on the server (', 'npm run owner', ').'];
// While the app's files load after a sign-in.
export const OPENING = 'Opening the farm app…';
