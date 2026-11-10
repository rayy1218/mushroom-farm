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
