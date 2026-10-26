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

test('the room page uses the Room card: the picture inside it, the card\'s words, the sensor cards under it', () => {
  const room = source('../web/room-detail.js');
  assert.match(room, /import \{ createRoomCard \} from '\.\/room-card\.js';/);
  assert.match(room, /import \{ roomCard, filterSummary, freshAirLine, blocksLine \} from '\.\/room-card-math\.js';/);
  assert.match(room, /import \{ startLoop \} from '\.\/mimic\.js';/);
  assert.doesNotMatch(room, /createMimic/, 'the card makes the picture');
  assert.match(room, /<section data-room-card><\/section>\n\s*<div class="sensors" data-sensors><\/div>/);
  assert.match(room, /roomCardUi\.paint\(roomCard\(\{ draw, control: lastControl, filter, now \}\), draw\)/);
  assert.match(room, /startLoop\(\(\) => \(roomCardUi \? \[roomCardUi\.mimic\] : \[\]\)\)/);
  assert.match(room, /roomCardUi\?\.destroy\(\);/);
  assert.match(room, /onData: \(data\) => \{ if \(!alive\(\)\) return; crops = data\?\.crops \?\? null; paintDrawing\(\); \}/);
  const card = source('../web/room-card.js');
  assert.match(card, /import \{ createMimic \} from '\.\/mimic\.js';/);
  assert.match(card, /createMimic\(pic, \{ idPrefix \}\)/);
  assert.doesNotMatch(card, /request\(/, 'no new requests: the page gives it its data');
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
