// Critique 2026-10-29, simulation and Suggest: the result page's verdict first, the sizing form's two fieldsets in one column on a
// phone, the Simulations list's row order, a Simulate dialog of one height, and the back links' words.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const css = src('styles.css');
const block = css.slice(css.indexOf('/* critique 2026-10-29: simulation and Suggest */'));

test('a result page: the verdict comes before what the run was given, which folds (closed on a phone)', () => {
  const page = src('simulation-page.js');
  assert.ok(page.indexOf('data-verdict') < page.indexOf('data-inputs'), 'the verdict host is above the inputs');
  assert.match(page, /<details class="card sim-inputs" data-inputs hidden>\s*<summary class="sim-inputs-head"><h2>What this run was given<\/h2><\/summary>/);
  assert.match(page, /els\.inputs\.open = !matchMedia\('\(max-width: 600px\)'\)\.matches;/);
  assert.match(page, /els\.verdict\.append\(v\);/);
  assert.doesNotMatch(page, /els\.results\.append\(v\);/);
  assert.match(block, /\.sim-inputs-head \{[^}]*min-height: 44px;/);
});

test('the sizing form: Walls and sun, then Weather, in Simulate step 1 and on the Suggest page, one column on a phone', () => {
  for (const name of ['simulate-dialog.js', 'suggest-page.js']) {
    const page = src(name);
    assert.match(page, /for \(const g of PHYSICS_GROUPS\) \{/, name);
    assert.match(page, /el\('div', g\.key === 'weather' \? 'sizes sim-physics' : 'sizes two sim-physics'\)/, name);
    assert.match(page, /fieldLabel\(f\)/, name);
    assert.doesNotMatch(page, /'Walls and weather'/, name);
  }
  assert.match(block, /@media \(max-width: 600px\) \{\s*\.sizes\.sim-physics, \.sizes\.two\.sim-physics, \.sizes\.two\.sg-goal \{ grid-template-columns: 1fr; gap: 12px; \}/);
  assert.match(block, /\.sim-physics \.field input \{ width: 12ch; max-width: 100%; \}/);
  assert.match(block, /\.sg-form \{ max-width: 760px; \}/);
});

test('the Suggest form: the crops\' bands are a plain block with a heading, not a card in a card; the page line is short', () => {
  const page = src('suggest-page.js');
  assert.match(page, /const mix = el\('div', 'sim-mix sg-mix'\);/);
  assert.match(page, /el\('h3', 'sim-mix-title', "The search holds the room in the crops' bands for each stage"\)/);
  assert.match(block, /\.sg-mix \{ padding: 0; border: 0; \}/);
  assert.match(page, /<p class="page-sub sg-sub">/);
  assert.match(block, /\.sg-sub \{ max-width: 60ch; \}/);
});

test('Suggest: the room\'s machines go with the search as its baseline and show first, labelled, without Use this', () => {
  const page = src('suggest-page.js');
  assert.match(page, /now = roomMachines\(\{ room, lastRun: Array\.isArray\(runs\) \? runs\[0\] \?\? null : null \}\);/);
  assert.match(page, /const asked = \{ \.\.\.sizingBody\(state, targetText, coolText\), baseline: now\.machines \};/);
  assert.match(page, /writeStored\(id, \{ id: created\.id, body: asked, target: targetText, coolDown: coolText, from: now\.from \}\);/);
  assert.match(page, /baseFrom = stored\.from \?\? '';/);
  // a baseline field the form does not have: the error is said over the result, not lost
  assert.match(page, /if \(err\.status === 400 && err\.field && !err\.field\.startsWith\('baseline'\)\) showErrors/);
  const view = page.slice(page.indexOf('function resultView('));
  assert.match(view, /const base = baselineRow\(result, prices\);/);
  assert.ok(view.indexOf('baseView(base') < view.indexOf("el('ol', 'sg-list')"), 'the baseline row comes before the suggestions');
  assert.match(view, /el\('p', 'sg-caption', captionOf\(result, rows\.length\)\)/);
  const baseView = page.slice(page.indexOf('function baseView('), page.indexOf('function resultView('));
  assert.match(baseView, /el\('div', 'sg-row sg-base'\)/);
  assert.match(baseView, /el\('p', 'sg-base-title', 'What the room has now'\)/);
  assert.match(baseView, /el\('span', 'sg-base-tag', 'Baseline'\)/);
  assert.doesNotMatch(baseView, /Use this/);
  assert.match(block, /\.sg-base \{[^}]*background:/);
});

test('a link styled as a button (Suggest machines) is 44 px tall on a phone, like a button', () => {
  assert.match(block, /@media \(max-width: 600px\) \{\s*a\.button \{ min-height: 44px; \}/);
});

test('the Simulations list on a phone: date and In band on the first line, then the machines, the differing settings, energy and water', () => {
  assert.match(block, /\.sim-item \{ grid-template-columns: auto minmax\(0, 1fr\) auto; grid-template-areas: "date band status" "machines machines machines" "given given given" "use use use" "length length pick"; \}/);
  assert.match(block, /\.sim-item \.sim-name \{ display: contents; \}/);
  for (const [sel, area] of [['.sim-name > a', 'date'], ['> .sim-all', 'band'], ['> .sim-status', 'status'], ['.sim-machines', 'machines'], ['.sim-given', 'given'], ['> .sim-use', 'use'], ['> .sim-length', 'length'], ['> .sim-pick', 'pick']]) {
    assert.ok(block.includes(`.sim-item ${sel} { grid-area: ${area};`), `${sel} in ${area}`);
  }
});

test('Simulate keeps one height on a desk while its steps show, so Back and Next stay under the pointer', () => {
  const dialog = src('simulate-dialog.js');
  assert.match(dialog, /d\.dataset\.stepper = '';/);
  assert.match(dialog, /function paintRun\(\) \{\s*delete d\.dataset\.stepper;/);
  assert.match(block, /@media \(min-width: 601px\) \{\s*\.sim-dialog\[data-stepper\] \{ height: min\(760px, calc\(100dvh - max\(16px, 6vh\) - 16px\)\); \}/);
  assert.match(block, /\.sim-dialog\[data-stepper\] > form \{ display: flex; flex-direction: column; min-height: 100%; \}/);
  assert.match(block, /\.sim-dialog\[data-stepper\] \.sim-body \{ flex: 1 0 auto; \}/);
});

test('a number keeps its unit on its line (no-break space) in the run texts: the list, step 3, the result page', async () => {
  const { keepUnits, differingLines, inputRows, inputLine } = await import('../web/simulation-math.js');
  const { summaryLines, controlLine, initialState } = await import('../web/simulate-math.js');
  const nb = '\u00a0';
  const wj = '\u2060'; // a word joiner: the range does not break at its dash
  assert.equal(keepUnits('outdoor 25–33 °C, dew point 24 °C'), `outdoor 25${wj}–${wj}33${nb}°C, dew point 24${nb}°C`);
  assert.equal(keepUnits('aircon 5 °C lower, every 15 min, up to 10 min, fan 600 m³/h, 2.6 kW (9,000 BTU/h class)'),
    `aircon 5${nb}°C lower, every 15${nb}min, up to 10${nb}min, fan 600${nb}m³/h, 2.6${nb}kW (9,000${nb}BTU/h class)`);
  assert.equal(keepUnits('walls 30 W/K, sun 300 W, 2 L/h, 10 L/day, 40 Pa, 72.0 m³, 3 m, 80 % RH, 1,400 ppm'),
    `walls 30${nb}W/K, sun 300${nb}W, 2${nb}L/h, 10${nb}L/day, 40${nb}Pa, 72.0${nb}m³, 3${nb}m, 80${nb}%${nb}RH, 1,400${nb}ppm`);
  assert.equal(keepUnits('Walls and weather, humidifier on, 3 machines'), 'Walls and weather, humidifier on, 3 machines', 'only units after a number');
  const run = (acDrop) => ({ input: { physics: { fanFlow: 600, acBTU: 12000, humidifierLH: 2 }, ctx: { control: { exchangeMaxMin: 10, exchangeEveryMin: 15, acDrop } } } });
  assert.deepEqual(differingLines([run(5), run(0)]), [`aircon 5${nb}°C lower during exchange`, 'aircon not lowered during exchange']);
  const input = { physics: { wallUA: 30, sunW: 300, outdoorLow: 25, outdoorHigh: 33, outdoorDew: 24, fanFlow: 600, acBTU: 12000, humidifierLH: 2, dehumidifierLday: 0 }, crops: [{ crop: 'oyster', blocks: 500 }], stage: 'fruiting', days: 7 };
  assert.equal(inputRows(input).find((r) => r.label === 'Outdoor').value, `25${wj}–${wj}33${nb}°C, dew point 24${nb}°C`);
  assert.match(inputLine(input), new RegExp(`outdoor 25${wj}–${wj}33${nb}°C`));
  const room = { id: 1, name: 'Room 1', length: 6, width: 4, height: 3, volume: 72 };
  const state = initialState({ room, roomControl: { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5, humidifierDuringExchange: true, outdoorAir: true } });
  assert.match(summaryLines(state, room).find((l) => l.label === 'Walls and weather').text, new RegExp(`outdoor 25${wj}–${wj}33${nb}°C`));
  assert.match(controlLine(state), new RegExp(`aircon 5${nb}°C lower`));
});

test('the only crop has no Remove (disabled, it wrapped to a row of its own on a phone), on Suggest and in Simulate', () => {
  for (const name of ['suggest-page.js', 'simulate-dialog.js']) {
    const page = src(name);
    assert.match(page, /remove\.hidden = state\.crops\.length === 1;/, name);
    assert.doesNotMatch(page, /remove\.disabled = state\.crops\.length === 1;/, name);
  }
});

test('the back links of a result and of Suggest machines say where they go: the room\'s Simulations', async () => {
  const { backLabel } = await import('../web/simulation-math.js');
  assert.equal(backLabel('Room 1'), 'Room 1 · Simulations');
  assert.match(src('simulation-page.js'), /if \(roomName !== null\) els\.back\.textContent = backLabel\(roomName\);/);
  assert.match(src('suggest-page.js'), /els\.back\.textContent = backLabel\(room\.name\);/);
  for (const name of ['simulation-page.js', 'suggest-page.js']) assert.match(src(name), /data-back>Simulations<\/a>/, name);
});

test('Suggest on a desk: every row\'s last column has one width, so the head, the baseline and the suggestions line up', () => {
  assert.match(block, /@media \(min-width: 761px\) \{ \.sg-row \{ grid-template-columns: minmax\(0, 1fr\) 112px 120px 112px 96px; \} \}/);
});

test('step 3: the Run for days input is 44 px tall on a phone, like the other fields', () => {
  assert.match(block, /@media \(max-width: 600px\) \{ \.sim-choice input\[type="text"\] \{ min-height: 44px; \} \}/);
});

test('the comparison marks a differing row by its tint and a "differs" word, not a stripe down its side', () => {
  assert.doesNotMatch(css, /\.sim-compare-table[^{]*\{[^}]*box-shadow/);
  const card = src('sim-card.js');
  assert.match(card, /if \(row\.differ\) th\.append\(el\('span', 'sr-only', ' \(differs\)'\), differs\(\)\);/);
  assert.match(card, /const word = el\('span', 'sim-differs', 'differs'\);\s*word\.setAttribute\('aria-hidden', 'true'\);/);
  assert.match(block, /\.sim-differs \{[^}]*color: var\(--accent-text\);/);
});
