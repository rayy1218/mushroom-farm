// Critique 2026-10-29c, simulation: the read-out says what held a machine that barely ran, why a longer air exchange limit
// helps and what started the exchanges, with every number kept to its unit; Simulate runs the room's bands by default; the
// stepper's done steps jump back; the energy table has RM and a total.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCauses, runTries, runVerdict, energyView } from '../web/simulation-math.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const css = src('styles.css');
const block = css.slice(css.indexOf('/* critique 2026-10-29c: simulation */'));
const NB = '\u00a0';
const nb = (text) => text.replaceAll('~', NB);

// The run of 26 Oct 14:02 (#/rooms/1/simulations/10) in small: a day, the room too wet nearly all of it; every air exchange
// runs its whole 10 min and the next starts a minute later; the humidifier is forced on during each; the dehumidifier (25
// L/day) never runs.
const DAY = 86_400;
const series = Array.from({ length: 289 }, (_, i) => ({
  s: i * 300, t: 25, tLow: 24, tHigh: 26, rh: i < 6 ? 88 : 96, rhLow: 85, rhHigh: 91, co2: 950, co2Low: 700, co2High: 900,
}));
const exchanges = Array.from({ length: Math.floor(DAY / 660) }, (_, k) => ({ from: k * 660, to: k * 660 + 600 }));
const run10 = {
  series,
  machines: { intake: exchanges, humidifier: exchanges.map((x) => ({ ...x })), dehumidifier: [], ac: [{ from: 0, to: DAY, setpoint: 25 }] },
  summary: { days: 1 },
};
const control = { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 0, humidifierDuringExchange: true };
const input = { physics: { humidifierLH: 1.5, dehumidifierLday: 25 }, ctx: { control } };

test('the exchange line adds up: what starts an air exchange, from the rules when the run has no counts', () => {
  assert.equal(runCauses(run10, input)[0], nb('Air exchange ran 90~% of the time: started by CO₂ at 900~ppm as well as for fresh air every 15~min, up to 10~min each.'));
  const noFresh = { ctx: { control: { ...control, exchangeEveryMin: 0 } }, physics: input.physics };
  assert.equal(runCauses(run10, noFresh)[0], nb('Air exchange ran 90~% of the time: started by CO₂ at 900~ppm, up to 10~min each.'));
});

test('the exchange line from the run\'s counts (summary.exchanges)', () => {
  const counted = (exchanges) => runCauses({ ...run10, summary: { days: 1, exchanges } }, input)[0];
  assert.equal(counted({ co2: 130, fresh: 0, cooling: 0, drying: 0, timed: 0 }),
    nb('Air exchange ran 90~% of the time: it started 130 times, all by CO₂ at 900~ppm (up to 10~min each).'));
  assert.equal(counted({ co2: 100, fresh: 25, cooling: 4, drying: 1, timed: 0 }),
    nb('Air exchange ran 90~% of the time: it started 130 times, 100 by CO₂ at 900~ppm (up to 10~min each), 25 for fresh air (1~min after 15~min without one) and 5 to cool or dry the room with outdoor air.'));
  // a start point that moved with the stages is a range
  const moved = { ...run10, series: series.map((r, i) => ({ ...r, co2High: i < 100 ? 900 : 1900 })) };
  assert.ok(runCauses(moved, input)[0].includes(nb('started by CO₂ at 900\u2060–\u20601,900~ppm')));
});

test('a fitted dehumidifier that never ran: the humidifier\'s 30 min wait, held by the humidifier during every air exchange', () => {
  const lines = runCauses(run10, input);
  assert.deepEqual(lines.slice(1), [
    nb('The dehumidifier never started: it waits until the humidifier has been off 30~min, and the humidifier ran during every air exchange, so it was never off that long while the room was too wet.'),
  ]);
  // the humidifier on its own band (not forced) but on in the 30 min before most of the wet times
  const own = { ...input, ctx: { control: { ...control, humidifierDuringExchange: false } } };
  const wetTimes = series.filter((r) => r.rh > r.rhHigh);
  // the first 258 wet times, and the 5 after the last are within its 30 min
  const humidifier = wetTimes.slice(0, 258).map((r) => ({ from: r.s - 600, to: r.s - 300 }));
  const lines2 = runCauses({ ...run10, machines: { ...run10.machines, humidifier } }, own);
  assert.equal(lines2[1], nb('The dehumidifier never started: it waits until the humidifier has been off 30~min, and the humidifier was on in the 30~min before 93~% of the times the room was too wet.'));
  // a dehumidifier that ran a little is said so
  const little = { ...run10, machines: { ...run10.machines, dehumidifier: [{ from: 0, to: 1800 }] } };
  assert.ok(runCauses(little, input)[1].startsWith(nb('The dehumidifier ran only 2~% of the time: ')));
});

test('no word on the dehumidifier when it is not fitted, ran enough, the room was not too wet, or the humidifier did not hold it', () => {
  const said = (r, i = input) => runCauses(r, i).some((l) => l.startsWith('The dehumidifier'));
  assert.equal(said(run10, { ...input, physics: { humidifierLH: 1.5, dehumidifierLday: 0 } }), false);
  assert.equal(said({ ...run10, machines: { ...run10.machines, dehumidifier: [{ from: 0, to: DAY / 4 }] } }), false);
  assert.equal(said({ ...run10, series: series.map((r) => ({ ...r, rh: 88 })) }), false);
  // the humidifier never ran: something else held it, and the page does not guess
  assert.equal(said({ ...run10, machines: { ...run10.machines, humidifier: [] } }), false);
});

test('a humidifier that barely ran while the room was too dry: the dehumidifier\'s 10 min wait', () => {
  const dry = series.map((r) => ({ ...r, rh: 80 }));
  const dehumidifier = Array.from({ length: 288 }, (_, i) => ({ from: i * 300, to: i * 300 + 120 }));
  const r = { series: dry, machines: { intake: [], humidifier: [], dehumidifier, ac: [] }, summary: { days: 1 } };
  assert.deepEqual(runCauses(r, { physics: { humidifierLH: 2, dehumidifierLday: 25 }, ctx: { control: { ...control, humidifierDuringExchange: false } } }), [
    nb('The humidifier never started: it waits while the dehumidifier runs and for 10~min after it stops (unless the room is 3~%~RH under the band), and the dehumidifier was on in the 10~min before whenever the room was too dry.'),
  ]);
});

test('Try a longer limit: the exchanges stopped at theirs and started again at once (from the spans)', () => {
  const tries = runTries(run10, input);
  assert.deepEqual(tries.map((t) => t.control), [{ humidifierDuringExchange: false }, { exchangeMaxMin: 60 }]);
  assert.equal(tries[0].text, 'Try the humidifier off during air exchange: the room was too wet, and the dehumidifier could then start.');
  assert.equal(tries[1].text, nb('Try a 60~min air exchange time limit: each air exchange stopped at its 10~min limit and the next started within 2~min (an exchange ends sooner only when CO₂ falls to 700~ppm); a 60~min limit lets one run until it does.'));
  assert.equal(tries[1].name, 'a 60 min air exchange time limit');
  // some at the limit, the rest ended by CO₂; the next at once, or for some not
  const mixed = exchanges.map((x, k) => (k % 3 === 0 ? { from: x.from, to: x.from + 300 } : x));
  const t2 = runTries({ ...run10, machines: { ...run10.machines, intake: mixed } }, input).at(-1).text;
  assert.ok(t2.includes(nb(': 86 of 130 air exchanges stopped at their 10~min limit and the next started within 2~min (an exchange')), t2);
  const late = exchanges.map((x, k) => (k % 4 === 1 ? { from: x.from + 100, to: x.to + 100 } : x));
  const t3 = runTries({ ...run10, machines: { ...run10.machines, intake: late } }, input).at(-1).text;
  assert.ok(t3.includes(nb('each air exchange stopped at its 10~min limit, most followed by another within 2~min (')), t3);
  // exchanges that ended by CO₂ (none at the limit): a longer limit would not help
  const short = exchanges.map((x) => ({ from: x.from, to: x.from + 400 }));
  assert.deepEqual(runTries({ ...run10, machines: { ...run10.machines, intake: short } }, input).map((t) => t.control), [{ humidifierDuringExchange: false }]);
});

test('the Why and Try lines and the verdict\'s keep a number with its unit (390 px)', () => {
  const H = 3600;
  const r = { series: [{ s: 0, tLow: 19 }, { s: 10 * H, tLow: 19 }], machines: { intake: [{ from: 0, to: 8 * H }], ac: [{ from: 0, to: 10 * H, setpoint: 14 }] } };
  const why = runCauses(r, { ctx: { control: { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5 } } });
  assert.ok(why.includes(nb('The aircon was set to 14~°C, below the 19~°C band, 100~% of the time: it is set 5~°C lower during air exchange.')), why.join('\n'));
  assert.equal(runTries(r, { ctx: { control: { acDrop: 5 } } })[0].text, nb('Try the aircon not lowered during air exchange (0~°C).'));
  const verdict = runVerdict([{ s: 0, t: 16, tLow: 19, tHigh: 21 }], { all: 0 });
  assert.equal(verdict.lines[0], nb('Too cold 100~% of the time (down to 16.0~°C; the band is 19\u2060–\u206021~°C)'));
  assert.equal(verdict.text, nb('The room was in band 0~% of the time.'));
});

test('the facts line under the verdict wraps with its numbers and its dot kept (text-math.js keepLines)', () => {
  const page = src('simulation-page.js');
  assert.match(page, /import \{ keepLines \} from '\.\/text-math\.js';/);
  assert.match(page, /text\('p', 'sim-verdict-facts', keepLines\(facts\)\)/);
});
