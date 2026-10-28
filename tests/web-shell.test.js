// The app's frame (owner, 2026-10-26: no side bar, no bottom tab bar; 2026-10-28: Overview and Settings in the top bar, the
// alarm count its own button, the Rooms list folded into the Overview).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

test('one bar on top: no side bar, no bottom tab bar', () => {
  assert.doesNotMatch(html, /<aside class="side"/);
  assert.doesNotMatch(html, /class="tabbar"/);
  assert.doesNotMatch(css, /\.side \{|\.tabbar \{|\.menu a/);
  assert.equal((html.match(/<header class="topbar">/g) ?? []).length, 1);
});

test('the top bar: the farm\'s name, then Overview and Settings as links, the alarm count as its own button', () => {
  const bar = html.slice(html.indexOf('<header class="topbar">'), html.indexOf('</header>'));
  assert.match(bar, /<a class="brand brand-top" href="#\/overview"/);
  assert.match(bar, /<a class="top-link" href="#\/overview" data-nav="overview">/);
  assert.match(bar, /<a class="top-link" href="#\/settings" data-nav="settings" aria-label="Settings">/);
  assert.match(bar, /<a class="top-alarm" href="#\/overview" data-alarm-button hidden><svg[^]*<span data-badge><\/span><\/a>/);
  assert.ok(bar.indexOf('data-nav="overview"') < bar.indexOf('data-nav="settings"'), 'Overview before Settings');
  assert.equal((html.match(/data-badge/g) ?? []).length, 1);
});

test('the Overview holds every room and Add room (the Rooms list is folded into it)', () => {
  const overview = readFileSync(new URL('../web/overview.js', import.meta.url), 'utf8');
  assert.match(overview, /<button type="button" data-add>Add room<\/button>/);
  assert.match(overview, /<div class="ov-section-head">\n\s*<h2>Rooms<\/h2>\n\s*<\/div>\n\s*<div class="ov-rooms" data-rooms><\/div>/);
  assert.match(overview, /openRoomDialog\(\{ onSaved: \(room\) => \{ location\.hash = roomHash\(room\.id, 'setup'\); \} \}\)/, 'a new room opens on its Setup');
});
