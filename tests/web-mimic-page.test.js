import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// The room page and the picture must load: the farm serves every file the room page imports.
test('the farm serves the room page, the Room card, the picture and its stylesheet', async (t) => {
  const server = createApp(openDb(':memory:'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(`${base}/`)).text(), /href="\/mimic\.css"/);
  for (const name of ['room-detail.js', 'room-card.js', 'room-card-math.js', 'mimic.js', 'mimic-math.js', 'mimic.css']) {
    const res = await fetch(`${base}/${name}`);
    assert.equal(res.status, 200, name);
  }
});

test('the room page uses the room cards: the readings, the picture, the machines and the crop, on the Now tab', () => {
  const room = source('../web/room-detail.js');
  assert.match(room, /import \{ createRoomCard \} from '\.\/room-card\.js';/);
  assert.match(room, /import \{ roomCard, filterFrom, freshAirLine, blocksLine, cropFacts, traceOf, hourPoints, traceScale \} from '\.\/room-card-math\.js';/);
  assert.match(room, /import \{ startLoop \} from '\.\/mimic\.js';/);
  assert.doesNotMatch(room, /createMimic/, 'the card makes the picture');
  assert.match(room, /<div class="now" data-panel="now">\n[\s\S]*?<div class="now-main">\n\s*<div data-readings><\/div>\n\s*<section data-picture><\/section>/);
  assert.match(room, /roomCardUi\.paint\(roomCard\(\{ draw, control: lastControl, filter, crop: cropData, now, trends, points: p \}\), draw, traces, switches\)/);
  assert.match(room, /const p = \{ T: pts\('trh', 't'\)[\s\S]*T: trace\('T', p\.T, c\?\.tLow, c\?\.tHigh\)/, 'the traces: the last hour against the band');
  assert.match(room, /traceOf\(p, low, high, \{ scale: traceScale\(key, low, high\) \}\)/, 'on each reading\'s fixed scale');
  assert.match(room, /request\('GET', `\/api\/rooms\/\$\{id\}\/history\?hours=1`\)/, 'the hour from the room history');
  assert.match(room, /startLoop\(\(\) => \(roomCardUi \? \[roomCardUi\.mimic\] : \[\]\)\)/);
  assert.match(room, /roomCardUi\?\.destroy\(\);/);
  assert.match(room, /onData: \(data\) => \{[^}]*if \(!alive\(\)\) return;\s*cropData = data \?\? null;\s*control\?\.setCrop\(cropData\);\s*paintDrawing\(\);\s*\}/);
  assert.match(room, /createRoomCard\(\{ readings: els\.readingsHost, picture: els\.pictureHost, machines: els\.machineListHost, crop: els\.cropSumHost \},\n\s*\{ idPrefix: 'room-', cropHref: roomHash\(id, 'crop'\), onSwitch: \(key\) => machines\?\.command\(RELAY_KEY\[key\]\) \}\)/);
  const card = source('../web/room-card.js');
  assert.match(card, /import \{ createMimic \} from '\.\/mimic\.js';/);
  assert.match(card, /createMimic\(pic, \{ idPrefix \}\)/);
  assert.doesNotMatch(card, /request\(/, 'no new requests: the page gives it its data');
});

test('the Room card\'s filter is worked out on a load, with the replies of that load; a command only repaints it', () => {
  const room = source('../web/room-detail.js');
  const render = room.slice(room.indexOf('  function render('), room.indexOf('  // The Room card from the latest painted replies'));
  const paint = room.slice(room.indexOf('  function paintDrawing('), room.indexOf('  // The outdoor line of the Live charts'));
  assert.match(render, /\(\{ last: filterLast, filter: filterNow \} = filterFrom\(\{ last: filterLast, room, sensor: sensors\.dp, machines: machineData \?\? lastMachines \}\)\);/);
  assert.ok(render.indexOf('filterFrom(') < render.indexOf('paintDrawing();'), 'before the card is painted');
  assert.doesNotMatch(paint, /filterFrom|lastRunningOf|filterSummary|intakeRunning/, 'not again with a machines reply alone (Filter 0 Pa after turning the intake on)');
  assert.match(paint, /const filter = filterNow;/);
  assert.match(room, /onCommand: \(data\) => \{ if \(!alive\(\)\) return; lastMachines = data; paintDrawing\(\); \}/);
});

test('narrow pictures hide every small text; the reading cards stack on a phone', () => {
  const js = source('../web/mimic.js');
  const css = source('../web/mimic.css');
  const page = source('../web/styles.css');
  assert.match(js, /const NARROW_BELOW = 640;/);
  for (const re of [/S\('g', \{ class: 'on-sky small' \}, svg\)/, /'m-ac small'/, /'m-blocks small'/, /\{ class: 'readout small' \}/]) assert.match(js, re);
  assert.match(css, /\.mimic-narrow \.mimic-svg \.tag, \.mimic-narrow \.mimic-svg \.small \{ display: none; \}/);
  assert.match(page, /\.rd-row \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); gap: 16px; \}/);
  assert.match(page, /@media \(max-width: 760px\) \{\n  \.rd-row \{ grid-template-columns: minmax\(0, 1fr\); gap: 12px; \}/);
  assert.doesNotMatch(page.slice(page.indexOf('/* ---- The room page (redesign')), /background: var\(--m-ground\)/, 'no ground fill below the picture');
});

test('the device app draws its simulated rooms with the readings inside the picture', () => {
  assert.match(source('../device/web/sim-drawing.js'), /createMimic\(el, \{ idPrefix: `sim-\$\{id\}-`, readouts: true \}\)/);
});

test('the fans turn about their own hub: a rotate() of the blade group, never a CSS rotation about the bounding box', () => {
  const js = source('../web/mimic.js');
  const css = source('../web/mimic.css');
  assert.match(js, /h\.fans\[key\]\.spin\.setAttribute\('transform', `rotate\(\$\{anim\[key\]\.toFixed\(1\)\}\)`\)/);
  assert.match(js, /const spin = S\('g', \{ class: 'blades' \}, g\);/, 'the blades are drawn about the origin of their group');
  assert.doesNotMatch(css, /transform-box/);
  assert.doesNotMatch(css, /@keyframes/, 'the motion comes from the loop, which stops with prefers-reduced-motion');
  // one layout: no rebuild by width
  assert.match(js, /viewBox: `0 0 \$\{W\} \$\{H\}`/);
  assert.doesNotMatch(js, /sizeFor|layoutNarrow|layoutWide/);
});

test('every hood is drawn before its fan, and the air path before the fans and machines', () => {
  const js = source('../web/mimic.js');
  const at = (re) => { const m = js.match(re); assert.ok(m, String(re)); return m.index; };
  assert.ok(at(/hood\(h\.units\.intake/) < at(/h\.fans\.intake = fan\(/));
  assert.ok(at(/hood\(h\.units\.exhaust/) < at(/h\.fans\.exhaust = fan\(/));
  const air = at(/h\.air = S\('path'/);
  for (const re of [/hood\(h\.units\.intake/, /h\.fans\.circ = fan\(/, /h\.units\.hu = S\(/, /hood\(h\.units\.exhaust/, /h\.units\.dh = S\(/]) assert.ok(air < at(re), String(re));
});

test('the modules import in Node (no DOM needed at load time)', async () => {
  const mimic = await import('../web/mimic.js');
  for (const name of ['createMimic', 'startLoop', 'fromRoom', 'fromSim', 'view', 'describe']) assert.equal(typeof mimic[name], 'function', name);
  assert.equal(mimic.sizeFor, undefined, 'one layout: sizeFor is gone');
  const card = await import('../web/room-card.js');
  assert.equal(typeof card.createRoomCard, 'function');
});

// Critique 2026-10-28: an unwired room was three cards of dashes, a drawing saying "No data" and Manual with nothing to switch.
test('a room with nothing wired: one empty state with the way to wire it; Auto | Manual only with something to switch', () => {
  const room = source('../web/room-detail.js');
  assert.match(room, /<section class="card now-bare" data-bare hidden>\n\s*<h2>Nothing wired yet<\/h2>/);
  assert.match(room, /const bare = \[room\.trhAddress, room\.co2Address, room\.relayAddress, room\.acAddress\]\.every\(\(a\) => a == null\);/);
  assert.match(room, /els\.modeHost\.hidden = room\.relayAddress == null && room\.acAddress == null;/);
  assert.match(room, /\[data-bare-setup\]'\)\.addEventListener\('click', \(\) => editEquipment\('trhAddress'\)\)/);
});

test('History: the range and links to its parts stay under the top bar; Setup parts fold (folded at first on a phone)', () => {
  const room = source('../web/room-detail.js');
  assert.match(room, /<div class="history-head">\n\s*<p class="history-room" data-history-room><\/p>\n\s*<div data-range><\/div>\n\s*<nav class="setup-nav history-nav" aria-label="History sections">/);
  assert.match(room, /els\.historyRoom\.textContent = room\.name;/, 'a phone: the sticky head says whose history it is');
  assert.match(source('../web/styles.css'), /\.history-room \{ display: block; flex: 1 1 100%;/);
  assert.match(room, /<details class="setup-part" id="setup-equipment" tabindex="-1" open>\n\s*<summary class="part-title"><h2>Equipment<\/h2><\/summary>/);
  assert.match(room, /if \(matchMedia\('\(max-width: 760px\)'\)\.matches\) for \(const d of container\.querySelectorAll\('details\.setup-part'\)\) d\.open = false;/);
  assert.match(room, /container\.querySelector\(cardOf\(pendingField\)\?\.key === 'filter' \? '#setup-filter' : '#setup-equipment'\)\.open = true;/, 'the part that holds the field opens');
  const css = source('../web/styles.css');
  assert.match(css, /\.history-head \{ position: sticky; top: var\(--topbar-h\);/);
  assert.match(css, /\.top-link, \.top-alarm, \.topbar \.theme-btn, \.room-switch select, \.room-tabs a \{ min-height: 44px; \}/);
});

// Critique 2026-10-28 at 390 px: targets of 28–36 px, inputs that make a phone zoom, a stage card past its box, a checkbox on
// a line of its own, the drawing's words under 12 px.
test('a phone: 44 px targets, 16 px fields, the Crop stages in their box, Use outdoor air beside its box, the drawing\'s words', () => {
  const css = source('../web/styles.css');
  const phone = css.slice(css.lastIndexOf('/* A phone: every control at least 44 px'));
  assert.match(phone, /\.cp-stage-actions button, \.cp-room-note button, \.cp-more, \.c-byhand button, \.c-humidifier button\.toggle \{ min-height: 44px; \}/);
  assert.match(phone, /\.cp-stage-actions \.cp-pencil \{ width: 44px; \}/);
  assert.match(phone, /\.cp-auto \.crop-check, \.room-check \.crop-check \{ min-height: 44px; \}/);
  assert.match(phone, /a\.back, \.room-head \.back \{ display: inline-flex; align-items: center; width: fit-content; min-height: 44px;/);
  assert.match(phone, /\.al-history summary \{ display: flex; align-items: center; min-height: 44px;/);
  assert.match(phone, /\.sim-name a \{ display: inline-flex; align-items: center; justify-self: start; min-height: 44px; \}/);
  assert.match(phone, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), select, textarea, \.ctl \{ font-size: 16px; \}/);
  assert.match(css, /\.cp-stages \{ grid-area: stages; display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.cp-targets th \{ white-space: nowrap; \}/);
  assert.match(css, /\.c-band\.c-outdoor \{ display: grid; grid-template-columns: auto minmax\(0, 1fr\);/);
  // critique 2026-10-29: a wrapped sub-line ended "Adds moisture ·"; one run of text, the "·" held by no-break spaces to the
  // words either side, so it never ends or starts a line
  assert.match(css, /\.mc-sub \{ color: var\(--muted\); font-size: var\(--fs-sm\); \}/);
  assert.match(css, /\.mc-sub \.mc-eff:not\(:empty\) \+ \.mc-d::before \{ content: "\\00a0\\00b7\\00a0"; \}/);
  const mimic = source('../web/mimic.css');
  for (const cls of ['m-small', 'm-name', 'm-state', 'm-blocks']) assert.match(mimic, new RegExp(`\\.mimic-svg \\.${cls} \\{ font-size: 13px;`), cls);
});

// Critique 2026-10-29 at 390 × 844: the sticky History head took 195 px (23 % of the screen) and its jump links scrolled
// sideways with the last one a sliver and no cue.
test('History on a phone: a shorter sticky head; the jump links fade at the edge that has more', () => {
  const room = source('../web/room-detail.js');
  assert.match(room, /historyNav\.dataset\.more = scrollEdges\(historyNav\.scrollLeft, historyNav\.clientWidth, historyNav\.scrollWidth\);/);
  assert.match(room, /navObserver\?\.disconnect\(\);/, 'its observer stops with the page');
  const css = source('../web/styles.css');
  const block = css.slice(css.indexOf('/* critique 2026-10-29: status and Overview */'));
  assert.match(block, /\.history-nav\[data-more="end"\] \{ mask-image: linear-gradient\(90deg, #000 calc\(100% - 32px\), transparent\); \}/);
  assert.match(block, /\.history-nav\[data-more="start"\] \{ mask-image: linear-gradient\(270deg,/);
  assert.match(block, /\.history-nav\[data-more="both"\] \{ mask-image: linear-gradient\(90deg, transparent, #000 32px,/);
  assert.match(block, /@media \(max-width: 760px\) \{\n  \.history-head \{ padding: 2px 14px 4px; row-gap: 4px; \}/);
});

// Critique 2026-10-29: the Add room and Simulate dialogs' tops sat at about 50 px, under the 61 px top bar of a phone; the
// sticky heads under the bar took 56 px for it and slid under it there too.
test('the top bar\'s height is what it is on a phone, and a dialog opens below it', () => {
  const css = source('../web/styles.css');
  const block = css.slice(css.indexOf('/* critique 2026-10-29: status and Overview */'));
  assert.match(block, /@media \(max-width: 600px\) \{ :root \{ --topbar-h: calc\(61px \+ env\(safe-area-inset-top\)\); \} \}/, '44 px buttons, 8 px above and below, a hairline');
  assert.match(css, /--dialog-top: max\(16px, 6vh, calc\(var\(--topbar-h\) \+ 8px\)\);/);
  assert.match(css, /dialog \{ margin-top: var\(--dialog-top\); margin-bottom: auto; \}/);
  assert.match(css, /  max-height: calc\(100dvh - var\(--dialog-top\) - 16px\);/);
  assert.doesNotMatch(css, /max\(16px, 6vh\) - 16px/, 'the Simulate dialog\'s height follows the same top');
});
