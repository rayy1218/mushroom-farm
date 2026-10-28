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
  assert.match(room, /roomCardUi\.paint\(roomCard\(\{ draw, control: lastControl, filter, crop: cropData, now, trends \}\), draw, traces, switches\)/);
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
