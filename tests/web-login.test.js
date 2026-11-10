// The sign-in view's words and the page's entry (spec 2026-11-06-login-design.md 6).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECRET, secretProblem, landing, failText, NOT_KEPT } from '../web/login-math.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');

test('a PIN is 6 digits on a number pad; a password is typed as one', () => {
  assert.deepEqual([SECRET.pin.label, SECRET.pin.inputmode, SECRET.pin.maxlength], ['PIN', 'numeric', 6]);
  assert.deepEqual([SECRET.password.label, SECRET.password.autocomplete], ['Password', 'current-password']);
  assert.equal(secretProblem('pin', '482913'), null);
  assert.equal(secretProblem('pin', '48291'), 'Type your 6-digit PIN');
  assert.equal(secretProblem('password', ''), 'Type your password');
  assert.equal(secretProblem('password', 'x'), null, 'the server says when it is wrong');
});

test('after signing in: the address asked for, else Today for a worker and the Overview for an owner', () => {
  assert.equal(landing('#/calendar', 'worker'), '#/calendar');
  assert.equal(landing('', 'worker'), '#/today');
  assert.equal(landing('#/', 'owner'), '#/overview');
});

test('the words for a failed try', () => {
  assert.equal(failText(0, ''), "Couldn't reach the farm app. Try again.");
  assert.equal(failText(401, 'That PIN is not right'), 'That PIN is not right');
  assert.equal(failText(500, ''), 'Something went wrong. Try again.');
});

test('the page starts at boot.js; the app (and its live stream) only once someone is signed in; a later 401 starts again', () => {
  assert.ok(src('index.html').includes('<script type="module" src="/boot.js"></script>'));
  assert.ok(!src('index.html').includes('src="/app.js"'));
  assert.ok(src('boot.js').includes("await import('./app.js')"));
  assert.ok(src('api.js').includes('res.status === 401'));
});

test('a sign-in the browser did not keep has its words (plain http on the tailnet works: no https:// address); a failed app import shows the load-fail page at once', () => {
  assert.equal(NOT_KEPT, 'This browser did not keep the sign-in. Allow cookies for the farm app and try again.');
  const boot = src('boot.js');
  assert.ok(boot.includes('NOT_KEPT'));
  assert.ok(boot.includes("open(who).catch(() => showLoadFail())"));
  assert.ok(boot.includes('routeMissing(err) ? OUTDATED'));
  assert.ok(boot.indexOf('window.farmReady = true') > boot.indexOf('login.mount'), 'ready only once the sign-in view is up');
});

test("the page's 8 s \"Couldn't load\" stands down once boot.js runs (a slow link may need longer); boot shows a real failure", () => {
  assert.ok(src('index.html').includes('if(window.farmReady||window.farmBooting)return;'));
  assert.ok(src('boot.js').includes('window.farmBooting = true;'));
  assert.match(src('boot.js'), /setTimeout\(\(\) => \{ if \(!window\.farmReady\) showLoadFail\(\); \}, SLOW_MS\)/);
});

// ---- Login polish (audit 2026-11-10) ----

test('a PIN sends itself at its 6th digit, only when it is exactly 6 digits and nothing is on its way', async () => {
  const { pinComplete } = await import('../web/login-math.js');
  assert.equal(pinComplete('pin', '482913', false), true);
  assert.equal(pinComplete('pin', '48291', false), false);
  assert.equal(pinComplete('pin', '48291a', false), false);
  assert.equal(pinComplete('pin', '482913', true), false, 'busy');
  assert.equal(pinComplete('password', '482913', false), false, "a password is sent by Sign in");
});

test('a wrong password is kept (and selected); a wrong PIN is cleared', async () => {
  const { keepsSecret } = await import('../web/login-math.js');
  assert.equal(keepsSecret('password'), true);
  assert.equal(keepsSecret('pin'), false);
});

test("a lock's reply with retryAt holds Sign in until then; without it (or in the past) nothing is held", async () => {
  const { lockedUntil } = await import('../web/login-math.js');
  const now = 1_000_000;
  assert.equal(lockedUntil(429, now + 60_000, now), now + 60_000);
  assert.equal(lockedUntil(429, undefined, now), null);
  assert.equal(lockedUntil(429, now - 1, now), null);
  assert.equal(lockedUntil(429, 'soon', now), null);
  assert.equal(lockedUntil(401, now + 60_000, now), null, 'only a lock');
  // retryInMs (how long, by the server's clock) wins over retryAt: a phone whose clock is off still waits the right time
  assert.equal(lockedUntil(429, now - 5 * 60_000, now, 60_000), now + 60_000, 'a phone clock 6 minutes fast');
  assert.equal(lockedUntil(429, now + 3_600_000, now, 60_000), now + 60_000, 'a phone clock an hour slow');
  assert.equal(lockedUntil(429, undefined, now, 3_600_000), now + 15 * 60_000, 'never held longer than a lock lasts');
  assert.equal(lockedUntil(429, undefined, now, 0), null);
});

test("the top bar's name: the first name (the CSS cuts it at 8 ch), its initial where there is no room; Sign out's name says whose", async () => {
  const { firstName, initialOf, signOutLabel, signOutFailText } = await import('../web/login-math.js');
  assert.equal(firstName('Ray Tham'), 'Ray');
  assert.equal(firstName('  Ali  '), 'Ali');
  assert.equal(firstName(''), '');
  assert.equal(firstName(undefined), '');
  assert.equal(initialOf('ali bin Abu'), 'A');
  assert.equal(initialOf(''), '');
  assert.equal(signOutLabel('Ali bin Abu'), 'Ali bin Abu: Sign out');
  assert.equal(signOutLabel(null), 'Sign out');
  assert.equal(signOutFailText(0, ''), "Not signed out: couldn't reach the farm app. Try again.");
  assert.equal(signOutFailText(500, 'Something broke'), 'Not signed out: Something broke. Try again.');
});

test('the words: nobody yet, opening, and one name for the farm app when it cannot be reached', async () => {
  const { NO_ACCOUNTS, OPENING } = await import('../web/login-math.js');
  const { OFFLINE } = await import('../web/api.js');
  assert.equal(NO_ACCOUNTS.join(''), 'Nobody can sign in yet: the owner sets the first password on the server (npm run owner).');
  assert.equal(NO_ACCOUNTS[1], 'npm run owner', 'the command its own piece (a <code> that does not wrap)');
  assert.equal(OPENING, 'Opening the farm app…');
  assert.equal(OFFLINE, "Couldn't reach the farm app");
});

test("the sign-in view's markup: the hint styled, the error right under the box, the username box out of reach but not readonly, the heading described", () => {
  const login = src('login.js');
  assert.ok(login.includes('<p class="c-hint login-hint" id="login-hint" data-hint></p>'));
  assert.ok(login.indexOf('id="login-error"') < login.indexOf('id="login-hint"'), 'the error under the box, the hint after it');
  assert.ok(login.includes('<input class="sr-only" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true" data-username>'));
  assert.ok(!/data-username[^>]*readonly|readonly[^>]*data-username/.test(login));
  assert.ok(login.includes('<h1 id="login-title" class="page-title" tabindex="-1" aria-describedby="login-lead">Sign in</h1>'));
  assert.ok(login.includes('<p class="login-opening" role="status" data-opening></p>'));
  assert.ok(login.includes("code.className = 'login-command';"));
});

test('the sign-in view: the 6th digit sends; a wrong password is kept and selected; a lock with retryAt holds Sign in; the error is said once', () => {
  const login = src('login.js');
  assert.ok(login.includes('if (picked && pinComplete(picked.kind, els.input.value, busy)) els.form.requestSubmit();'));
  assert.ok(login.includes('if (keepsSecret(picked.kind)) els.input.select();'));
  assert.ok(login.includes('const until = lockedUntil(err.status, err.retryAt, Date.now(), err.retryInMs);'));
  assert.ok(login.includes('if (busy || held || !picked) return;'));
  assert.ok(login.includes('els.submit.disabled = Boolean(held);'));
  // the back button is never held by a lock
  assert.ok(!/back\.disabled = (true|Boolean)\(?held/.test(login));
  // focus moving to the box: the live region quiet while the words are set, back after a moment
  assert.ok(login.includes("if (moving) els.error.removeAttribute('aria-live');"));
  assert.ok(login.includes("liveTimer = setTimeout(() => els.error.setAttribute('aria-live', 'polite'), LIVE_BACK_MS);"));
  const css = src('styles.css');
  assert.ok(css.includes('.login-secret .field input { max-width: none; }'), 'the whole width on a phone');
  assert.ok(css.includes(".login-name::after { content: '\\203A' / '';"), "the names' chevron");
  assert.ok(css.includes('.login-name:hover { background: color-mix(in srgb, var(--ink) 9%, var(--raised));'));
  assert.ok(css.includes('.login-names:empty { display: none; }'));
  assert.ok(css.includes('.login-command { white-space: nowrap;'));
});

test('signed in: the view says the app is opening; the theme works on the sign-in view; the brand is no link while signed out', () => {
  const boot = src('boot.js');
  assert.ok(boot.includes('unmount.opening();'));
  assert.ok(src('login.js').includes('els.opening.textContent = OPENING;'));
  assert.ok(boot.includes("import './theme.js';") && src('app.js').includes("import './theme.js';"));
  assert.ok(!src('app.js').includes('THEME_ICONS'), 'the theme lives in theme.js');
  assert.ok(src('theme.js').includes("localStorage.setItem('farm.theme', theme)"));
  assert.ok(!src('styles.css').includes('html[data-signin] .theme-btn'));
  assert.ok(boot.includes('brandIsLink(false);') && boot.includes('brandIsLink(true);'));
});

test("the top bar's Sign out: the name beside the icon on a phone too (first name, cut at 8 ch; an owner's initial under 431 px), a failure a line under the bar", () => {
  const html = src('index.html');
  assert.ok(html.includes('<span class="top-me" data-me-name></span><span class="top-me-short" data-me-first></span><span class="top-me-initial" data-me-initial></span>'));
  assert.ok(html.includes('<div class="top-note" role="status" data-signout-note></div>'));
  const css = src('styles.css');
  assert.ok(css.includes('.top-link.top-signout > span.top-me-short { display: inline-block; max-width: 8ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'));
  assert.ok(css.includes('html[data-role="owner"] .top-link.top-signout > span.top-me-initial { display: inline-block;'));
  const app = src('app.js');
  assert.ok(!app.includes('alert('));
  assert.ok(app.includes('showSignOutNote(signOutFailText(err.status, err.message));'));
  assert.ok(app.includes("b.setAttribute('aria-label', signOutLabel(me()?.name));"));
});
