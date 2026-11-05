// The Tasks tab's grid, its state over fake handles (spec 2026-11-04-task-grid-design.md 3 and 5): a long press opens the
// menu and does not also tap, a keyboard's Enter after one still acts, the arrows move, a tapped box lets go only when its
// row changed, and a repaint waits while the menu is open.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPress, gridMove, MOVE_KEYS, createHeld, createPaintGate, sheetMonth } from '../web/task-grid-math.js';

// A clock for the press's timer: advance(ms) fires what is due.
function fakeTimers() {
  let now = 0;
  let next = 1;
  const due = new Map();
  return {
    set(fn, ms) { due.set(next, { fn, at: now + ms }); return next++; },
    clear(id) { due.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...due]) if (t.at <= now) { due.delete(id); t.fn(); }
    },
    pending: () => due.size,
  };
}

function pressOn() {
  const timers = fakeTimers();
  const held = [];
  const press = createPress({ onHold: (t) => held.push(t), ms: 500, movePx: 10, timers });
  return { press, timers, held };
}

test('a long press opens the menu once, and the pointer click that ends it does not also tap', () => {
  const { press, timers, held } = pressOn();
  press.down('box', 100, 100);
  timers.advance(499);
  assert.deepEqual(held, [], 'not yet');
  timers.advance(1);
  assert.deepEqual(held, ['box']);
  press.stop(); // pointerup
  assert.equal(press.click(1), false, 'the click that ends the long press is eaten');
  assert.equal(press.click(1), true, 'only that one');
});

test('a short tap taps; a press that moves is a scroll; a press on nothing holds nothing', () => {
  const { press, timers, held } = pressOn();
  press.down('box', 100, 100);
  timers.advance(200);
  press.stop();
  assert.equal(press.click(1), true, 'a tap');
  press.down('box', 100, 100);
  press.move(104, 106);
  timers.advance(200);
  press.move(100, 112);
  timers.advance(400);
  assert.deepEqual(held, [], '12 px down: a scroll, no menu');
  assert.equal(timers.pending(), 0);
  press.down(null, 0, 0);
  timers.advance(1000);
  assert.deepEqual(held, []);
});

test('a long press that no click followed does not eat the next keyboard Enter or Space (detail 0), nor the next press', () => {
  const { press, timers, held } = pressOn();
  press.down('box', 100, 100);
  timers.advance(600);
  press.stop();
  assert.equal(held.length, 1);
  // the phone sent no click (its own long press); later Enter on the box
  assert.equal(press.click(0), true, "the keyboard's click acts");
  press.down('box', 100, 100);
  timers.advance(600);
  press.stop();
  press.down('other', 50, 50); // a new press: clean
  timers.advance(100);
  press.stop();
  assert.equal(press.click(1), true, 'a new tap after an unclicked long press acts');
});

test('the arrows move a box; Home and End the row (with Ctrl the grid); the corner is passed over; an edge stays', () => {
  // the desk's grid: a head row (the corner, then the tasks) and a row a day (its head, then its boxes)
  const grid = [
    [null, 'h1', 'h2', 'h3'],
    ['d1', 'a1', 'a2', 'a3'],
    ['d2', 'b1', 'b2', 'b3'],
  ];
  const at = (yx) => (yx ? grid[yx[0]][yx[1]] : null);
  assert.equal(at(gridMove(grid, [1, 1], 'ArrowRight')), 'a2');
  assert.equal(at(gridMove(grid, [1, 1], 'ArrowLeft')), 'd1');
  assert.equal(at(gridMove(grid, [1, 1], 'ArrowUp')), 'h1');
  assert.equal(at(gridMove(grid, [1, 1], 'ArrowDown')), 'b1');
  assert.equal(gridMove(grid, [1, 0], 'ArrowUp'), null, 'up from the first day: the corner holds nothing, and nothing past it');
  assert.equal(at(gridMove(grid, [0, 1], 'ArrowLeft')), null, 'left of the first task: the corner, then the edge');
  assert.equal(gridMove(grid, [2, 3], 'ArrowRight'), null, 'an edge');
  assert.equal(at(gridMove(grid, [2, 2], 'Home')), 'd2');
  assert.equal(at(gridMove(grid, [2, 1], 'End')), 'b3');
  assert.equal(at(gridMove(grid, [2, 2], 'Home', true)), 'h1', 'Ctrl+Home: the first that holds something');
  assert.equal(at(gridMove(grid, [0, 1], 'End', true)), 'b3');
  assert.equal(gridMove(grid, [1, 1], 'Enter'), null);
  assert.ok(MOVE_KEYS.has('Home') && !MOVE_KEYS.has('Enter') && !MOVE_KEYS.has('Tab'));
});

test('a tapped box lets go only when the room reply shows its row changed, not on a calendar repaint nor another row', () => {
  const held = createHeld();
  const rows = [{ id: 5, status: 'open', closedAt: null }, { id: 6, status: 'open', closedAt: null }];
  held.hold(5, rows);
  assert.ok(held.has(5));
  assert.equal(held.changed(rows), false, 'the reply as it was (a reload before the tap landed): still held');
  assert.equal(held.changed([rows[0], { id: 6, status: 'done', closedAt: 9 }]), false, 'another row changed: still held');
  assert.ok(held.has(5));
  assert.equal(held.changed([{ id: 5, status: 'done', closedAt: 9 }, rows[1]]), true, 'its row done: let go');
  assert.ok(!held.has(5));
  held.hold(7, rows);
  assert.deepEqual(held.ids(), [7]);
  assert.equal(held.changed(rows), false, 'a row not in the reply when tapped, not in it now');
  assert.equal(held.changed(null), false);
  assert.equal(held.letGo(7), true, 'nothing changed (a dialog closed): let go at once');
  assert.equal(held.letGo(7), false);
  held.hold(5, rows);
  assert.equal(held.changed([rows[1]]), true, 'its row gone (a new day): let go');
});

test('a repaint while the menu is open waits for it to close, and paints once then', () => {
  let paints = 0;
  const gate = createPaintGate(() => paints++);
  gate.paint();
  assert.equal(paints, 1);
  gate.opened();
  gate.paint();
  gate.paint();
  assert.equal(paints, 1, 'the menu stays: no repaint under it');
  gate.closed();
  assert.equal(paints, 2, 'one repaint as it closes');
  gate.opened();
  gate.closed();
  assert.equal(paints, 2, 'nothing asked meanwhile: none');
});

test("Print month: the month of today when the week holds it, else the week's first day's", () => {
  const week = { from: '2026-10-26', to: '2026-11-01' };
  assert.equal(sheetMonth(week, '2026-11-01'), '2026-11');
  assert.equal(sheetMonth(week, '2026-11-05'), '2026-10');
});
