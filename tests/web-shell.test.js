// The app's frame (owner, 2026-10-26): no side bar and no bottom tab bar; one bar on top with the farm's name (to the
// Overview, with the alarm count) and Settings at the right; the Overview has a Rooms title with "Show all rooms".

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

test('the farm\'s name goes to the Overview and carries the alarm count; Settings sits at the right end', () => {
  const bar = html.slice(html.indexOf('<header class="topbar">'), html.indexOf('</header>'));
  assert.match(bar, /<a class="brand brand-top" href="#\/overview" data-nav="overview"[^>]*>.*<span class="nav-badge" data-badge hidden><\/span><\/a>/);
  assert.match(bar, /<a class="top-link" href="#\/settings" data-nav="settings" aria-label="Settings">/);
  assert.ok(bar.indexOf('data-live') < bar.indexOf('theme-btn') && bar.indexOf('theme-btn') < bar.indexOf('top-link'), 'Live, theme, then Settings last');
  assert.equal((html.match(/data-badge/g) ?? []).length, 1);
});

test('the Overview: a Rooms title over the room cards, with Show all rooms to the room list', () => {
  const overview = readFileSync(new URL('../web/overview.js', import.meta.url), 'utf8');
  assert.match(overview, /<div class="ov-section-head">\n\s*<h2>Rooms<\/h2>\n\s*<a href="#\/rooms">Show all rooms<\/a>\n\s*<\/div>\n\s*<div class="ov-rooms" data-rooms><\/div>/);
});
