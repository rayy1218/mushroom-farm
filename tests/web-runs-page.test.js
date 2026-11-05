// The Runs tab and a run's page (web/runs-page.js, spec 2026-11-05-runs-design.md 6), their wiring, styles and the links in
// from Harvest, Costs and Batches. Source checks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('runs-page.js');
const app = src('app.js');
const css = src('styles.css');
const runsCss = css.slice(css.indexOf('/* ---- Runs (spec 2026-11-05-runs-design.md 6) ---- */'), css.indexOf('/* ---- end Runs ---- */'));

test('the router mounts the Runs tab under the strip, a run on its own with its back link', () => {
  assert.ok(app.includes("import * as runs from './runs-page.js'; // ---- Runs ----"));
  assert.ok(app.includes(": route.name === 'runs' ? runs.mount(page, { crop: route.crop }) // ---- Runs ----"));
  assert.ok(app.includes(": route.name === 'run' ? runs.mountRun(view, { id: route.id })"));
  assert.ok(page.includes('<a class="back" href="${RUNS_HASH}">Runs</a>'));
});

test('both pages read again on the modules\' events, a room\'s crops or name, the stream\'s return and a timer; a stale answer is dropped', () => {
  assert.ok(page.includes("const LISTEN = ['harvest', 'batches', 'sales', 'costs'].filter((type) => EVENT_TYPES.includes(type));"));
  assert.ok(page.includes("live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }),"));
  assert.ok(page.includes('live.onStatus((up) => { if (up) reload.call(); }),'));
  assert.ok(page.includes('if (!alive() || mine !== seq) return;'));
  assert.ok(page.includes('timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));'));
});

test('the crop filter keeps its crop in the address, in place', () => {
  assert.ok(page.includes("history.replaceState(null, '', runsHash(shown));"));
  assert.ok(page.includes("const read = reader(() => `/api/runs${shown ? `?crop=${shown}` : ''}`, { paint, fail, alive });"));
});

test('a run that is not there says so and stops asking', () => {
  assert.ok(page.includes('if (err.status === 404 && !routeMissing(err)) {'));
  assert.ok(page.includes('No such run. A container\'s runs go with it when it is deleted.'));
  assert.ok(page.includes('read.stop();\n      return;'));
});

test('the run page: Profit first in the Costs tiles\' look, Harvest\'s tables, Sales\' paid mark, each card linking to its module', () => {
  assert.ok(page.includes('<div class="us-tiles hv-tiles co-tiles" data-tiles></div>'));
  for (const id of ['rn-money-title', 'rn-blocks-title', 'rn-harvests-title', 'rn-sales-title', 'rn-costs-title']) assert.ok(page.includes(`id="${id}"`), id);
  assert.ok(page.includes("link('Batches', v.batches.length ? batchesRunHash(v.id) : BATCHES_HASH)"));
  assert.ok(page.includes("...(v.roomName ? [link('Harvest tab', roomHash(v.roomId, 'harvest'))] : [])"));
  assert.ok(page.includes("link('Sales', SALES_HASH)"));
  assert.ok(page.includes("link('Costs', COSTS_HASH)"));
  assert.ok(page.includes("if (v.byCrop.length > 1) parts.push(table('By crop', BY_CROP_COLUMNS"));
  assert.ok(page.includes("`sl-mark${s.paid.unpaid ? ' sl-unpaid' : ''}`"));
});

test('the styles: one .rn- block, tokens only', () => {
  assert.ok(runsCss.length > 0);
  assert.equal(/#[0-9a-f]{3,8}\b/i.test(runsCss), false, 'no fixed colour');
  for (const rule of runsCss.match(/[^{}]+\{[^}]*\}/g) ?? []) {
    const selector = rule.slice(0, rule.indexOf('{')).replace(/\/\*[^*]*\*\//g, '').trim();
    if (selector.startsWith('@media') || selector === '') continue;
    assert.match(selector, /\.rn-/, selector);
  }
});

test('the links in: Harvest\'s This run and past runs, Costs\' run breakdown, Batches\' room heads open the run page', () => {
  const card = src('harvest-card.js');
  assert.ok(card.includes("runLine.replaceChildren(runHead(run), DOT, runPageLink(run.id)); // ---- Runs ----"));
  assert.ok(card.includes('page.append(runPageLink(run.id));'));
  const costs = src('costs-page.js');
  assert.ok(costs.includes("page.append(link('Run page', runHash(run.id)));"));
  const batches = src('batches-page.js');
  assert.ok(batches.includes('run.href = runHash(r.runId);'));
});
