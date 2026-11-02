// The tasks module (server/tasks.js, spec 2026-10-30-tasks-design.md sections 2, 4 and 6): making a day's rows, missed and
// cancelled rows, done, skip and cancel with their errors, upkeep intervals, long-term rows, the views, the log and the CSV.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createTasks, TaskError, machineChangeText } from '../server/tasks.js';
import { startStage } from '../server/program.js';

const at = (iso) => Date.parse(iso);
const DAY = 86_400_000;
const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1 };
const OYSTER = [{ crop: 'oyster', blocks: 100 }];

// file: the database in a temporary file, with raw a second connection to it (to move rows by hand).
function setup(t, { crops = OYSTER, stage = 'fruiting', room = {}, file = false } = {}) {
  let db;
  let raw = null;
  if (file) {
    const dir = mkdtempSync(join(tmpdir(), 'farm-tasks-'));
    db = openDb(join(dir, 'farm.db'));
    raw = new DatabaseSync(join(dir, 'farm.db'));
    t.after(() => { raw.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });
  } else {
    db = openDb(':memory:');
    t.after(() => db.close());
  }
  let clock = at('2026-10-30T08:00:00+08:00');
  const tasks = createTasks({ db, now: () => clock, log: (e) => { throw e; } });
  const id = db.createRoom({ ...ROOM, ...room }, clock).id;
  if (crops.length) db.setProgram(id, { ...db.getProgram(id), crops, stage, stageSince: clock });
  const changes = [];
  tasks.onChange((roomId) => changes.push(roomId));
  return {
    db, raw, tasks, id, changes,
    set: (iso) => { clock = at(iso); },
    later: (ms) => { clock += ms; },
    keys: (rows) => rows.map((r) => r.ruleKey),
    row: (key) => tasks.roomView(id).today.find((r) => r.ruleKey === key),
  };
}

// Calls fn and checks the TaskError it throws.
function refused(fn, status, message, field) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof TaskError);
    assert.deepEqual([err.status, err.message, err.field], [status, message, field]);
    return true;
  });
}

test('ensureDay makes the day\'s daily rows and the upkeep rows once', (t) => {
  const s = setup(t);
  s.tasks.ensureDay(s.id, '2026-10-30');
  s.tasks.ensureDay(s.id, '2026-10-30');
  assert.deepEqual(s.changes, [s.id], 'one change: the second call made nothing');
  const v = s.tasks.roomView(s.id);
  assert.equal(v.date, '2026-10-30');
  assert.deepEqual(s.keys(v.today), ['contamWalk', 'humidifierCheck', 'harvestAm', 'harvestPm', 'footbath', 'floorClean']);
  assert.deepEqual(v.today.map((r) => r.slot), ['morning', 'morning', 'morning', 'afternoon', 'morning', 'afternoon']);
  // no dehumidifier and no CO₂ sensor: their rules are left out
  assert.deepEqual(s.keys(v.upkeep), ['acFilter', 'humidifierDescale', 'flyTraps', 'rhCheck', 'acService', 'acChemWash']);
  assert.deepEqual(v.upkeep.map((r) => [r.dueDate, r.overdueDays]), Array(6).fill(['2026-10-30', 0]));
  assert.deepEqual(v.counts, { due: 12, overdue: 0, longterm: 0 });
  const harvest = v.today.find((r) => r.ruleKey === 'harvestAm');
  assert.deepEqual([harvest.unit, harvest.amountLabel, harvest.status, harvest.kind], ['kg', 'kg picked', 'open', 'daily']);
  assert.equal(v.today.find((r) => r.ruleKey === 'footbath').amountLabel, null);
});

test('the machines a room has give their upkeep rules', (t) => {
  const s = setup(t, { room: { co2Address: 2, dehumidifier: true } });
  assert.deepEqual(s.keys(s.tasks.roomView(s.id).upkeep),
    ['acFilter', 'humidifierDescale', 'flyTraps', 'dehumidifierFilter', 'co2Check', 'rhCheck', 'acService', 'acChemWash']);
});

test('open daily rows are missed after their day; closed ones stay as they are', (t) => {
  const s = setup(t);
  s.tasks.ensureDay(s.id);
  s.db.closeTask(s.row('footbath').id, { status: 'done', at: at('2026-10-30T08:30:00+08:00'), worker: 'Ali' });
  s.set('2026-10-31T07:00:00+08:00');
  const v = s.tasks.roomView(s.id);
  assert.equal(v.date, '2026-10-31');
  const old = s.db.dailyTasks(s.id, '2026-10-30');
  assert.deepEqual(old.map((r) => [r.ruleKey, r.status]), [['contamWalk', 'missed'], ['humidifierCheck', 'missed'], ['harvestAm', 'missed'],
    ['harvestPm', 'missed'], ['footbath', 'done'], ['floorClean', 'missed']]);
  assert.equal(old[0].closedAt, at('2026-10-31T00:00:00+08:00'), 'missed when the day ended');
  assert.ok(v.today.every((r) => r.status === 'open'));
  assert.equal(v.upkeep.length, 6, 'upkeep rows are never missed');
  assert.equal(v.upkeep[0].overdueDays, 1);
});

test('a stage change cancels today\'s rows that no longer apply; a rule turned off keeps its row', (t) => {
  const s = setup(t);
  s.tasks.ensureDay(s.id);
  s.db.setTaskRuleSettings([{ key: 'contamWalk', enabled: false }]);
  s.later(3 * 3_600_000);
  s.db.setProgram(s.id, startStage(s.db.getProgram(s.id), 'rest', at('2026-10-30T11:00:00+08:00'), s.db.getControl(s.id)));
  const today = s.tasks.roomView(s.id).today;
  const status = Object.fromEntries(today.map((r) => [r.ruleKey, r.status]));
  assert.deepEqual(status, { contamWalk: 'open', humidifierCheck: 'cancelled', harvestAm: 'cancelled', harvestPm: 'cancelled',
    footbath: 'open', floorClean: 'open', scrapeRecap: 'open' });
  assert.equal(today.find((r) => r.ruleKey === 'harvestAm').reason, 'Stage changed');
});

test('the owner\'s rules: a daily rule for some rooms, an upkeep rule for all', (t) => {
  const s = setup(t, { crops: [] });
  const other = s.db.createRoom({ ...ROOM, name: 'Room 2', trhAddress: null }).id;
  s.db.setCustomTaskRules([
    { text: 'Top up the RO water tank', rooms: [s.id], everyDays: null, slot: 'afternoon', enabled: true },
    { text: 'Clean the shelves', rooms: null, everyDays: 14, slot: 'any', enabled: true },
  ]);
  const [daily, upkeep] = s.db.customTaskRules();
  const mine = s.tasks.roomView(s.id);
  assert.deepEqual(s.keys(mine.today), ['footbath', 'floorClean', `custom:${daily.id}`], 'no crops: the room rules and the own daily rule');
  assert.deepEqual(mine.today.at(-1).text, 'Top up the RO water tank');
  assert.equal(mine.upkeep.at(-1).ruleKey, `custom:${upkeep.id}`);
  const theirs = s.tasks.roomView(other);
  assert.deepEqual(s.keys(theirs.today), ['footbath', 'floorClean']);
  assert.ok(theirs.upkeep.some((r) => r.ruleKey === `custom:${upkeep.id}`));
});

test('a done program gives the clear-out task', (t) => {
  const s = setup(t, { stage: 'rest' });
  s.db.setProgram(s.id, { ...s.db.getProgram(s.id), done: true });
  assert.deepEqual(s.keys(s.tasks.roomView(s.id).today), ['clearOut', 'footbath', 'floorClean']);
});

test('ensureAll makes every room\'s day; a missing room has no view', (t) => {
  const s = setup(t);
  const other = s.db.createRoom({ ...ROOM, name: 'Room 2', trhAddress: null }).id;
  s.tasks.ensureAll('2026-10-30');
  assert.deepEqual(s.changes.sort(), [s.id, other].sort());
  assert.equal(s.tasks.roomView(999), null);
  s.tasks.ensureDay(999); // no such room: nothing, no error
});

test('ensureDay that makes nothing tells no one', (t) => {
  const s = setup(t);
  s.tasks.ensureDay(s.id, '2026-10-30');
  s.changes.length = 0;
  s.tasks.ensureDay(s.id, '2026-10-30');
  s.tasks.ensureAll('2026-10-30');
  s.tasks.roomView(s.id);
  assert.deepEqual(s.changes, [], 'nothing made, missed or cancelled: no listener called');
  s.set('2026-10-31T07:00:00+08:00');
  s.tasks.roomView(s.id);
  assert.deepEqual(s.changes, [s.id], 'a new day changes rows');
});

test('a stage changed and changed back the same day opens its cancelled rows again', (t) => {
  const s = setup(t);
  const due = s.tasks.roomView(s.id).counts.due;
  const to = (stage, iso) => s.db.setProgram(s.id, startStage(s.db.getProgram(s.id), stage, at(iso), s.db.getControl(s.id)));
  s.set('2026-10-30T10:00:00+08:00');
  to('rest', '2026-10-30T10:00:00+08:00');
  s.tasks.roomView(s.id);
  s.set('2026-10-30T10:05:00+08:00');
  to('fruiting', '2026-10-30T10:05:00+08:00');
  const v = s.tasks.roomView(s.id);
  const status = Object.fromEntries(v.today.map((r) => [r.ruleKey, r.status]));
  assert.deepEqual(status, { contamWalk: 'open', humidifierCheck: 'open', harvestAm: 'open', harvestPm: 'open',
    footbath: 'open', floorClean: 'open', scrapeRecap: 'cancelled' });
  assert.deepEqual([s.row('harvestAm').reason, s.row('harvestAm').closedAt, s.row('harvestAm').amountLabel], [null, null, 'kg picked']);
  assert.equal(s.row('scrapeRecap').reason, 'Stage changed');
  assert.equal(v.counts.due, due);
});

test('an own rule moved to another time of day: the old row is cancelled "Rule changed", and opens again when moved back', (t) => {
  const s = setup(t, { crops: [] });
  const rule = (slot) => ({ text: 'Top up the RO water tank', rooms: null, everyDays: null, slot, enabled: true });
  s.db.setCustomTaskRules([rule('morning')]);
  const { id } = s.db.customTaskRules()[0];
  const key = `custom:${id}`;
  const own = () => s.tasks.roomView(s.id).today.filter((r) => r.ruleKey === key).map((r) => [r.slot, r.status, r.reason]);
  assert.deepEqual(own(), [['morning', 'open', null]]);
  s.db.setCustomTaskRules([{ id, ...rule('afternoon') }]);
  assert.deepEqual(own(), [['morning', 'cancelled', 'Rule changed'], ['afternoon', 'open', null]]);
  s.db.setCustomTaskRules([{ id, ...rule('morning') }]);
  assert.deepEqual(own(), [['morning', 'open', null], ['afternoon', 'cancelled', 'Rule changed']]);
});

test('a machine taken out of the room cancels its open upkeep row; a rule turned off keeps its row', (t) => {
  const s = setup(t, { room: { co2Address: 2, dehumidifier: true } });
  s.tasks.ensureDay(s.id);
  s.db.setTaskRuleSettings([{ key: 'co2Check', enabled: false }]);
  s.db.updateRoom(s.id, { ...s.db.getRoom(s.id), dehumidifier: false, co2Address: null, trhAddress: null });
  s.later(DAY);
  const v = s.tasks.roomView(s.id);
  assert.deepEqual(s.keys(v.upkeep), ['acFilter', 'humidifierDescale', 'flyTraps', 'co2Check', 'acService', 'acChemWash']);
  const gone = s.db.taskLog(s.id).filter((r) => r.kind === 'upkeep').map((r) => [r.ruleKey, r.status, r.reason]);
  assert.deepEqual(gone.sort(), [['dehumidifierFilter', 'cancelled', 'The room no longer has this machine'],
    ['rhCheck', 'cancelled', 'The room no longer has this machine']]);
});

test('an upkeep rule without an open row is due everyDays after its last done, but never before today', (t) => {
  const s = setup(t);
  s.tasks.ensureDay(s.id);
  const traps = s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'flyTraps');
  s.db.closeTask(traps.id, { status: 'done', at: at('2026-10-30T09:00:00+08:00'), worker: 'Ali' }); // no next row: as a rule turned off
  s.set('2026-10-31T08:00:00+08:00');
  assert.equal(s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'flyTraps').dueDate, '2026-11-06');
  const next = s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'flyTraps');
  s.db.closeTask(next.id, { status: 'done', at: at('2026-10-31T09:00:00+08:00'), worker: 'Ali' });
  s.set('2027-08-20T08:00:00+08:00'); // months later
  const late = s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'flyTraps');
  assert.deepEqual([late.dueDate, late.overdueDays], ['2027-08-20', 0]);
});

test('done: who did it, the amount, and a second close refused with who and when', (t) => {
  const s = setup(t);
  const harvest = s.tasks.roomView(s.id).today.find((r) => r.ruleKey === 'harvestAm');
  refused(() => s.tasks.done(harvest.id, { worker: '  ' }), 400, 'Pick who did it', 'worker');
  refused(() => s.tasks.done(harvest.id, { worker: 'Ali', amount: -1 }), 400, 'The amount must be a number from 0 to 10,000', 'amount');
  refused(() => s.tasks.done(harvest.id, { worker: 'Ali', amount: 10_001 }), 400, 'The amount must be a number from 0 to 10,000', 'amount');
  refused(() => s.tasks.done(harvest.id, { worker: 'Ali', amount: '3' }), 400, 'The amount must be a number from 0 to 10,000', 'amount');
  s.set('2026-10-30T09:12:40+08:00');
  const row = s.tasks.done(harvest.id, { worker: ' Ali ', amount: 12.5 });
  assert.deepEqual([row.status, row.worker, row.amount, row.unit, row.closedAt, row.amountLabel],
    ['done', 'Ali', 12.5, 'kg', at('2026-10-30T09:12:40+08:00'), null]);
  refused(() => s.tasks.done(harvest.id, { worker: 'Siti' }), 409, 'Already done by Ali at 09:12', undefined);
  refused(() => s.tasks.skip(harvest.id, { worker: 'Siti', reason: 'x' }), 409, 'Already done by Ali at 09:12', undefined);
  refused(() => s.tasks.done(99_999, { worker: 'Ali' }), 404, 'Task not found', undefined);
  assert.equal(s.changes.at(-1), s.id, 'a close is a change');
  // an amount on a row that records none is still checked but not kept; an empty amount is none
  refused(() => s.tasks.done(s.row('footbath').id, { worker: 'Ali', amount: -1 }), 400, 'The amount must be a number from 0 to 10,000', 'amount');
  refused(() => s.tasks.done(s.row('footbath').id, { worker: 'Ali', amount: '3' }), 400, 'The amount must be a number from 0 to 10,000', 'amount');
  assert.equal(s.tasks.done(s.row('footbath').id, { worker: 'Ali', amount: 3 }).amount, null);
  assert.equal(s.tasks.done(s.row('harvestPm').id, { worker: 'Ali', amount: '' }).amount, null);
});

test('a daily row missed when its day ended is not done or skipped after it: 409', (t) => {
  const s = setup(t);
  const harvest = s.row('harvestAm');
  s.later(86_400_000);
  s.tasks.ensureDay(s.id); // 30 Oct has ended: its open rows are missed
  refused(() => s.tasks.done(harvest.id, { worker: 'Ali', amount: 2 }), 409, 'Already missed: its day has ended', undefined);
  refused(() => s.tasks.skip(harvest.id, { worker: 'Ali', reason: 'Late' }), 409, 'Already missed: its day has ended', undefined);
  assert.equal(s.db.getTask(harvest.id).status, 'missed');
});

test('skip needs who and why; long-term rows are cancelled, not skipped; only they are cancelled', (t) => {
  const s = setup(t);
  const walk = s.row('contamWalk');
  refused(() => s.tasks.skip(walk.id, { worker: 'Ali', reason: ' ' }), 400, 'Say why', 'reason');
  refused(() => s.tasks.skip(walk.id, { reason: 'No bags' }), 400, 'Pick who did it', 'worker');
  refused(() => s.tasks.cancel(walk.id, { reason: 'x' }), 400, 'Only a long-term task can be cancelled', undefined);
  const skipped = s.tasks.skip(walk.id, { worker: 'Siti', reason: 'Room sealed for fogging' });
  assert.deepEqual([skipped.status, skipped.worker, skipped.reason], ['skipped', 'Siti', 'Room sealed for fogging']);
  const own = s.db.insertLongtermTask({ roomId: s.id, text: 'Seal the door gap', at: at('2026-10-30T08:00:00+08:00') });
  refused(() => s.tasks.skip(own.id, { worker: 'Ali', reason: 'x' }), 400, 'A long-term task is done or cancelled, not skipped', undefined);
  refused(() => s.tasks.cancel(own.id, {}), 400, 'Say why', 'reason');
  s.set('2026-10-30T10:05:00+08:00');
  assert.equal(s.tasks.cancel(own.id, { reason: 'Done by the landlord' }).status, 'cancelled');
  refused(() => s.tasks.cancel(own.id, { reason: 'again' }), 409, 'Already cancelled at 10:05', undefined);
});

test('upkeep: the next row comes everyDays after a done or a skip; overdue counts in days', (t) => {
  const s = setup(t);
  const first = s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'acFilter');
  s.set('2026-11-02T15:00:00+08:00'); // 3 days late
  let v = s.tasks.roomView(s.id);
  assert.equal(v.upkeep.find((r) => r.ruleKey === 'acFilter').overdueDays, 3);
  assert.equal(v.counts.overdue, 6);
  s.tasks.done(first.id, { worker: 'Ali' });
  v = s.tasks.roomView(s.id);
  const next = v.upkeep.find((r) => r.ruleKey === 'acFilter');
  assert.deepEqual([next.dueDate, next.overdueDays, next.status], ['2026-11-09', 0, 'open']);
  assert.equal(v.upkeep.at(-1).ruleKey, 'acFilter', 'sorted by due time: the later one last');
  assert.equal(v.counts.due, 6 + 5, 'the daily rows and the 5 overdue upkeep rows, not the one due later');
  s.set('2026-11-09T08:00:00+08:00');
  const skipped = s.tasks.skip(next.id, { worker: 'Siti', reason: 'No spare filter' });
  assert.equal(skipped.status, 'skipped');
  assert.equal(s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'acFilter').dueDate, '2026-11-16');
});

test('upkeep: an interval change, a rule turned off and on again', (t) => {
  const s = setup(t);
  s.db.setTaskRuleSettings([{ key: 'flyTraps', enabled: true, everyDays: 3 }]);
  const traps = s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'flyTraps');
  s.tasks.done(traps.id, { worker: 'Ali' });
  assert.equal(s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'flyTraps').dueDate, '2026-11-02');
  // off: the open row stays; done makes no next row
  s.db.setTaskRuleSettings([{ key: 'flyTraps', enabled: false, everyDays: 3 }]);
  const open = s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'flyTraps');
  assert.ok(open);
  s.tasks.done(open.id, { worker: 'Ali' });
  assert.equal(s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'flyTraps'), undefined);
  // on again: due everyDays after the last done
  s.db.setTaskRuleSettings([{ key: 'flyTraps', enabled: true, everyDays: 7 }]);
  assert.equal(s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'flyTraps').dueDate, '2026-11-06');
});

test('who did it: at most 40 characters and no control characters; a missing body is an empty one', (t) => {
  const s = setup(t);
  const walk = s.row('contamWalk');
  refused(() => s.tasks.done(walk.id, { worker: 'A'.repeat(41) }), 400, 'The name must be at most 40 characters', 'worker');
  refused(() => s.tasks.done(walk.id, { worker: '\u00011' }), 400, 'Pick who did it', 'worker'); // a parked worker name
  refused(() => s.tasks.skip(walk.id, { worker: 'Al\ni', reason: 'x' }), 400, 'Pick who did it', 'worker');
  refused(() => s.tasks.done(walk.id, { worker: 'Ali\u007f' }), 400, 'Pick who did it', 'worker');
  refused(() => s.tasks.done(walk.id, null), 400, 'Pick who did it', 'worker');
  refused(() => s.tasks.skip(walk.id, null), 400, 'Pick who did it', 'worker');
  const own = s.db.insertLongtermTask({ roomId: s.id, text: 'Seal the door gap', at: at('2026-10-30T08:00:00+08:00') });
  refused(() => s.tasks.cancel(own.id, null), 400, 'Say why', 'reason');
  assert.equal(s.tasks.done(walk.id, { worker: 'A'.repeat(40) }).worker, 'A'.repeat(40));
});

test('done on an upkeep row after the room lost its machine makes no next row', (t) => {
  const s = setup(t, { room: { dehumidifier: true } });
  const filter = s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'dehumidifierFilter');
  s.db.updateRoom(s.id, { ...s.db.getRoom(s.id), dehumidifier: false });
  assert.equal(s.tasks.done(filter.id, { worker: 'Ali' }).status, 'done');
  assert.equal(s.db.openTasks(s.id, 'upkeep').find((r) => r.ruleKey === 'dehumidifierFilter'), undefined);
});

test('a row closed by someone else between the read and the close: 409 and one open row for the rule', (t) => {
  const s = setup(t);
  const first = s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === 'acFilter');
  const getTask = s.db.getTask;
  s.db.getTask = (id) => {
    s.db.getTask = getTask; // once
    const row = getTask(id);
    const next = { roomId: s.id, ruleKey: 'acFilter', slot: 'any', text: row.text, dueAt: at('2026-11-06T00:00:00+08:00'), at: row.createdAt };
    s.db.closeTask(id, { status: 'done', at: at('2026-10-30T08:00:00+08:00'), worker: 'Siti' }, next);
    return row; // the stale read: still open
  };
  refused(() => s.tasks.done(first.id, { worker: 'Ali' }), 409, 'Already done by Siti at 08:00', undefined);
  assert.equal(s.db.openTasks(s.id, 'upkeep').filter((r) => r.ruleKey === 'acFilter').length, 1);
  assert.equal(s.db.getTask(first.id).worker, 'Siti');
});

test('a row deleted with its room between the read and the close: 404, not a crash', (t) => {
  const s = setup(t);
  const footbath = s.row('footbath');
  const getTask = s.db.getTask;
  s.db.getTask = (id) => {
    s.db.getTask = getTask; // once
    const row = getTask(id);
    s.db.deleteRoom(s.id);
    return row; // the stale read: still there and open
  };
  refused(() => s.tasks.done(footbath.id, { worker: 'Ali' }), 404, 'Task not found', undefined);
});

test('long-term rows: the owner\'s, and Plan this from a suggestion', (t) => {
  const s = setup(t);
  refused(() => s.tasks.addLongterm(s.id, { text: ' ' }), 400, 'Say what to do (1 to 120 characters)', 'text');
  refused(() => s.tasks.addLongterm(s.id, { text: 'x'.repeat(121) }), 400, 'Say what to do (1 to 120 characters)', 'text');
  refused(() => s.tasks.addLongterm(s.id, { text: 'x', note: 'n'.repeat(501) }), 400, 'The note must be at most 500 characters', 'note');
  refused(() => s.tasks.addLongterm(s.id, null), 400, 'Say what to do (1 to 120 characters)', 'text');
  refused(() => s.tasks.addLongterm(999, { text: 'x' }), 404, 'Room not found', undefined);
  const own = s.tasks.addLongterm(s.id, { text: ' Seal the door gap ', note: 'Left side' });
  assert.deepEqual([own.kind, own.text, own.note, own.source], ['longterm', 'Seal the door gap', 'Left side', null]);
  const suggestion = {
    machines: [{ key: 'acBTU', from: 9000, to: 12000 }, { key: 'fanFlow', from: 150, to: 150 }, { key: 'dehumidifierLday', from: 0, to: 10 },
      { key: 'humidifierLH', from: 0.5, to: 1 }],
    rmMonth: -42, suggestedAt: at('2026-10-29T15:00:00+08:00'),
  };
  const rows = s.tasks.addFromSuggestion(s.id, suggestion);
  assert.deepEqual(rows.map((r) => r.text), ['Aircon 9,000 → 12,000 BTU/h', 'Dehumidifier none → 10 L/day', 'Humidifier 0.5 → 1 L/h']);
  assert.deepEqual(rows[0].source, { machine: 'acBTU', from: 9000, to: 12000, rmMonth: -42, suggestedAt: suggestion.suggestedAt });
  refused(() => s.tasks.addFromSuggestion(s.id, { machines: [{ key: 'acBTU', from: 9000, to: 9000 }], rmMonth: 0, suggestedAt: 1 }),
    400, 'Nothing changes from what the room has now', 'suggestion');
  refused(() => s.tasks.addFromSuggestion(s.id, { machines: [{ key: 'heater', from: 1, to: 2 }] }), 400,
    'The plan must list the fan, aircon, humidifier or dehumidifier, each from and to a number from 0 to 1,000,000', 'suggestion');
  refused(() => s.tasks.addFromSuggestion(s.id, null), 400, 'The plan must list the fan, aircon, humidifier or dehumidifier, each from and to a number from 0 to 1,000,000', 'suggestion');
  const v = s.tasks.roomView(s.id);
  assert.equal(v.longterm.length, 4);
  assert.equal(v.counts.longterm, 4);
  assert.equal(machineChangeText('fanFlow', 150, 200), 'Fan 150 → 200 m³/h');
  assert.equal(machineChangeText('dehumidifierLday', 10, 0), 'Dehumidifier 10 L/day → none');
});

test('Plan this checks: a machine once, numbers from 0 to 1,000,000, rmMonth and suggestedAt numbers; one change told; at most 3 decimals', (t) => {
  const s = setup(t);
  const shape = 'The plan must list the fan, aircon, humidifier or dehumidifier, each from and to a number from 0 to 1,000,000';
  const plan = (machines, extra = {}) => s.tasks.addFromSuggestion(s.id, { machines, rmMonth: -42, suggestedAt: 1, ...extra });
  refused(() => plan([{ key: 'acBTU', from: 9000, to: 12000 }, { key: 'acBTU', from: 9000, to: 18000 }]), 400, shape, 'suggestion');
  refused(() => plan([{ key: 'fanFlow', from: -1, to: 200 }]), 400, shape, 'suggestion');
  refused(() => plan([{ key: 'fanFlow', from: 150, to: -5 }]), 400, shape, 'suggestion');
  refused(() => plan([{ key: 'fanFlow', from: '150', to: 200 }]), 400, shape, 'suggestion');
  refused(() => plan([{ key: 'fanFlow', from: 150, to: Number.NaN }]), 400, shape, 'suggestion');
  refused(() => plan([{ key: 'fanFlow', from: 150, to: 1_000_001 }]), 400, shape, 'suggestion');
  const numbers = "The plan's RM a month must be a number and its time a time in ms";
  refused(() => plan([{ key: 'fanFlow', from: 150, to: 200 }], { rmMonth: '-42' }), 400, numbers, 'suggestion');
  // suggestedAt: a time in ms (an integer from 0 to 8.64e15, the Date range), or none
  for (const suggestedAt of [Infinity, -1, 1.5, 8.64e15 + 1, '1']) {
    refused(() => plan([{ key: 'fanFlow', from: 150, to: 200 }], { suggestedAt }), 400, numbers, 'suggestion');
  }
  refused(() => s.tasks.addFromSuggestion(999, { machines: [{ key: 'fanFlow', from: 150, to: 200 }] }), 404, 'Room not found', undefined);
  assert.deepEqual(s.changes, [], 'nothing made, no one told');
  const rows = plan([{ key: 'fanFlow', from: 150, to: 1_000_000 }, { key: 'humidifierLH', from: 0.1 + 0.2, to: 1.23456 }], { suggestedAt: 8.64e15 });
  assert.deepEqual(s.changes, [s.id], 'told once for both rows');
  assert.deepEqual(rows.map((r) => r.text), ['Fan 150 → 1,000,000 m³/h', 'Humidifier 0.3 → 1.235 L/h']);
  assert.equal(rows[1].source.from, 0.1 + 0.2, 'the source keeps the numbers sent');
  assert.equal(rows[0].source.suggestedAt, 8.64e15);
  assert.equal(plan([{ key: 'acBTU', from: 0, to: 9000 }], { suggestedAt: 0 })[0].source.suggestedAt, 0);
  assert.equal(plan([{ key: 'dehumidifierLday', from: 0, to: 10 }], { suggestedAt: null })[0].source.suggestedAt, null);
  assert.equal(s.db.openTasks(s.id, 'longterm').length, 4);
});

test('Plan this twice: a machine with an open long-term task to the same size is left out; all left out is 409', (t) => {
  const s = setup(t);
  const plan = (machines) => s.tasks.addFromSuggestion(s.id, { machines, rmMonth: -42, suggestedAt: 1 });
  plan([{ key: 'acBTU', from: 9000, to: 12000 }, { key: 'fanFlow', from: 150, to: 200 }]);
  s.changes.length = 0;
  refused(() => plan([{ key: 'acBTU', from: 9000, to: 12000 }, { key: 'fanFlow', from: 150, to: 200 }]), 409, 'Already planned: see the Tasks tab', 'suggestion');
  assert.deepEqual(s.changes, [], 'nothing made, no one told');
  // Another size of the same machine replaces its open task (cancelled 'Replaced by a newer plan'); a machine not planned yet
  // is a new task; the one already planned to the same size is left out.
  const aircon = s.db.openTasks(s.id, 'longterm').find((r) => r.source?.machine === 'acBTU');
  const again = plan([{ key: 'acBTU', from: 9000, to: 18000 }, { key: 'fanFlow', from: 150, to: 200 }, { key: 'humidifierLH', from: 0.5, to: 1 }]);
  assert.deepEqual(again.map((r) => r.text), ['Aircon 9,000 → 18,000 BTU/h', 'Humidifier 0.5 → 1 L/h']);
  const replaced = s.db.getTask(aircon.id);
  assert.deepEqual([replaced.status, replaced.reason, replaced.closedAt], ['cancelled', 'Replaced by a newer plan', again[0].createdAt]);
  assert.equal(s.db.openTasks(s.id, 'longterm').filter((r) => r.source?.machine === 'acBTU').length, 1, 'one open aircon task');
  // A done or cancelled one no longer counts: planned again, it is a new task.
  const fan = s.db.openTasks(s.id, 'longterm').find((r) => r.source?.machine === 'fanFlow');
  s.tasks.cancel(fan.id, { reason: 'Not this year' });
  assert.deepEqual(plan([{ key: 'fanFlow', from: 150, to: 200 }]).map((r) => r.text), ['Fan 150 → 200 m³/h']);
  // An own task with the same words is not a plan.
  s.tasks.addLongterm(s.id, { text: 'Dehumidifier none → 10 L/day' });
  assert.equal(plan([{ key: 'dehumidifierLday', from: 0, to: 10 }]).length, 1);
  assert.equal(s.db.openTasks(s.id, 'longterm').length, 5);
});

test('Plan this replaces in one go: a replaced task is cancelled only when the new rows are made', (t) => {
  const s = setup(t);
  const plan = (machines) => s.tasks.addFromSuggestion(s.id, { machines, rmMonth: -42, suggestedAt: 1 });
  const [fan] = plan([{ key: 'fanFlow', from: 150, to: 200 }]);
  const insert = s.db.insertLongtermTask;
  s.db.insertLongtermTask = () => { throw new Error('disk full'); };
  assert.throws(() => plan([{ key: 'fanFlow', from: 150, to: 300 }]), /disk full/);
  s.db.insertLongtermTask = insert;
  assert.equal(s.db.getTask(fan.id).status, 'open', 'rolled back with the rows');
  // Done or cancelled tasks are not replaced (nothing open to replace).
  s.tasks.done(fan.id, { worker: 'Ali' });
  const [next] = plan([{ key: 'fanFlow', from: 200, to: 300 }]);
  assert.equal(s.db.getTask(fan.id).status, 'done');
  assert.equal(next.status, 'open');
});

test('addLongterm: a note that is not text is refused', (t) => {
  const s = setup(t);
  refused(() => s.tasks.addLongterm(s.id, { text: 'Seal the door gap', note: 5 }), 400, 'The note must be text', 'note');
  refused(() => s.tasks.addLongterm(s.id, { text: 'Seal the door gap', note: { a: 1 } }), 400, 'The note must be text', 'note');
  assert.equal(s.tasks.addLongterm(s.id, { text: 'Seal the door gap', note: null }).note, null);
});

test('the log pages newest first; the CSV has every closed row with the farm\'s times', (t) => {
  const s = setup(t);
  s.tasks.ensureDay(s.id);
  s.set('2026-10-30T09:05:00+08:00');
  s.tasks.done(s.row('harvestAm').id, { worker: 'Ali', amount: 4.2 });
  s.set('2026-10-30T09:30:00+08:00');
  s.tasks.skip(s.row('contamWalk').id, { worker: 'Siti, Ah Kow', reason: 'Said "later"' });
  s.set('2026-10-31T08:00:00+08:00');
  s.tasks.ensureDay(s.id); // the rest of 30 Oct is missed
  const page = s.tasks.log(s.id, { limit: 2 });
  assert.deepEqual(page.map((r) => r.status), ['missed', 'missed']);
  const all = s.tasks.log(s.id);
  assert.deepEqual(all.slice(-2).map((r) => r.ruleKey), ['contamWalk', 'harvestAm']);
  assert.deepEqual(s.tasks.log(s.id, { before: all.at(-2).id }).map((r) => r.ruleKey), ['harvestAm']);
  const csv = s.tasks.logCsv(s.id).split('\r\n');
  assert.equal(csv[0], 'date,time,room,task,status,worker,amount,unit,reason');
  assert.equal(csv[1], '2026-10-30,09:05,Room 1,Harvest check: pick before the cap edge waves or splits; pick before any misting,done,Ali,4.2,kg,');
  assert.equal(csv[2], '2026-10-30,09:30,Room 1,"Contamination walk: take out and bag any green, orange, black or slimy bags, away from the room",skipped,"Siti, Ah Kow",,,"Said ""later"""');
  assert.equal(csv[3], '2026-10-30,,Room 1,"Humidifier: water in, mist coming out",missed,,,,');
  assert.equal(csv.at(-1), '', 'ends with a line break');
  assert.equal(s.tasks.logCsv(999), null);
});

test('todayView in the Overview\'s order, and dueCount', (t) => {
  const s = setup(t);
  const b = s.db.createRoom({ ...ROOM, name: 'A room', trhAddress: null }).id; // sorts first
  const view = s.tasks.todayView();
  assert.equal(view.date, '2026-10-30');
  assert.deepEqual(view.rooms.map((r) => r.name), ['A room', 'Room 1']);
  const [first, second] = view.rooms;
  assert.deepEqual([first.id, s.keys(first.today), first.upkeepDue.length, first.longterm], [b, ['footbath', 'floorClean'], 5, 0]);
  assert.equal(second.counts.due, 12);
  assert.equal(s.tasks.dueCount(), 2 + 5 + 12);
  s.tasks.done(second.today[0].id, { worker: 'Ali' });
  assert.equal(s.tasks.dueCount(), 18);
});

test('dueCount makes no rows, so a change listener can call it', (t) => {
  const s = setup(t);
  assert.equal(s.tasks.dueCount(), 0, 'no rows made yet');
  assert.deepEqual([s.changes, s.db.dailyTasks(s.id, '2026-10-30')], [[], []]);
  const counts = [];
  s.tasks.onChange(() => counts.push(s.tasks.dueCount()));
  s.tasks.ensureDay(s.id);
  assert.deepEqual([s.changes, counts], [[s.id], [12]], 'told once, the count read inside the listener');
});

test('todayView makes every room first and tells after, so a listener counts the whole farm', (t) => {
  const s = setup(t);
  s.db.createRoom({ ...ROOM, name: 'A room', trhAddress: null });
  const counts = [];
  s.tasks.onChange(() => counts.push(s.tasks.dueCount()));
  s.tasks.todayView();
  assert.deepEqual(counts, [2 + 5 + 12, 2 + 5 + 12]);
});

test('the CSV defuses a cell that starts like a formula; a long-term row has the date it was closed', (t) => {
  const s = setup(t);
  const row = s.tasks.addLongterm(s.id, { text: '=HYPERLINK("x")' });
  s.set('2026-11-02T10:15:00+08:00');
  s.tasks.cancel(row.id, { reason: '+1 later' });
  assert.equal(s.tasks.logCsv(s.id).split('\r\n')[1], `2026-11-02,10:15,Room 1,"'=HYPERLINK(""x"")",cancelled,,,,'+1 later`);
});

test('the CSV dates a closed row by when it was closed; a missed row keeps its own date', (t) => {
  const s = setup(t);
  s.tasks.ensureDay(s.id);
  const harvest = s.row('harvestAm');
  s.set('2026-10-31T00:05:00+08:00'); // done after midnight, before the new day is made
  s.tasks.done(harvest.id, { worker: 'Ali', amount: 3 });
  s.tasks.ensureDay(s.id); // the rest of 30 Oct is missed
  const csv = s.tasks.logCsv(s.id).split('\r\n');
  assert.ok(csv.includes('2026-10-31,00:05,Room 1,Harvest check: pick before the cap edge waves or splits; pick before any misting,done,Ali,3,kg,'));
  assert.ok(csv.includes('2026-10-30,,Room 1,"Humidifier: water in, mist coming out",missed,,,,'));
});

test('todayView\'s upkeep: the overdue and the due today, not the not yet due', (t) => {
  const s = setup(t, { file: true });
  s.tasks.ensureDay(s.id);
  const move = (key, iso) => s.raw.prepare("UPDATE tasks SET due_at = ? WHERE rule_key = ? AND status = 'open'").run(at(iso), key);
  move('acFilter', '2026-10-28T00:00:00+08:00'); // 2 days overdue
  move('flyTraps', '2026-10-31T00:00:00+08:00'); // due tomorrow
  const [room] = s.tasks.todayView().rooms;
  assert.deepEqual(s.keys(room.upkeepDue), ['acFilter', 'humidifierDescale', 'rhCheck', 'acService', 'acChemWash']);
  assert.deepEqual(room.upkeepDue.map((r) => r.overdueDays), [2, 0, 0, 0, 0]);
  assert.equal(room.counts.due, 6 + 5);
});

test('the log pages with before through rows closed at the same time', (t) => {
  const s = setup(t);
  s.tasks.ensureDay(s.id);
  s.set('2026-10-31T08:00:00+08:00');
  s.tasks.ensureDay(s.id); // the 6 rows of 30 Oct missed, all closed at 31 Oct 00:00
  const all = s.tasks.log(s.id);
  assert.equal(all.length, 6);
  assert.equal(new Set(all.map((r) => r.closedAt)).size, 1);
  const paged = [];
  let before = null;
  for (;;) {
    const page = s.tasks.log(s.id, { before, limit: 4 });
    if (page.length === 0) break;
    paged.push(...page);
    before = page.at(-1).id;
  }
  assert.deepEqual(paged.map((r) => r.id), all.map((r) => r.id), 'every row once, in order');
  assert.deepEqual(all.map((r) => r.id), [...all.map((r) => r.id)].sort((a, b) => b - a), 'newest id first');
});

test('rulesSaved: a new interval re-dates the open upkeep rows from the last done or skip, or to today without one', (t) => {
  const s = setup(t);
  const upkeep = (key) => s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === key);
  s.tasks.done(upkeep('acService').id, { worker: 'Ali' }); // 2026-10-30
  assert.equal(upkeep('acService').dueDate, '2027-02-27'); // 120 days on
  s.set('2026-11-02T08:00:00+08:00'); // flyTraps and acFilter (no history) were due on 10-30
  s.tasks.ensureDay(s.id);
  const before = { settings: s.db.taskRuleSettings(), custom: s.db.customTaskRules() };
  s.db.setTaskRuleSettings([{ key: 'acService', enabled: true, everyDays: 90 }, { key: 'flyTraps', enabled: true, everyDays: 14 }]);
  s.changes.length = 0;
  s.tasks.rulesSaved(before);
  assert.equal(upkeep('acService').dueDate, '2027-01-28'); // 90 days after the done
  assert.equal(upkeep('flyTraps').dueDate, '2026-11-02'); // no done or skip yet: today
  assert.equal(upkeep('acFilter').dueDate, '2026-10-30'); // its interval is the same: still overdue
  assert.deepEqual(s.changes, [s.id]); // told once
});

test('rulesSaved: an own rule changed from daily to every N days, or back, cancels its open row "Rule changed"', (t) => {
  const s = setup(t);
  const sources = () => ({ settings: s.db.taskRuleSettings(), custom: s.db.customTaskRules() });
  const [tank] = s.db.setCustomTaskRules([{ text: 'Check the water tank', rooms: null, everyDays: null, slot: 'morning', enabled: true }]);
  const key = `custom:${tank.id}`;
  const daily = s.row(key);
  assert.equal(daily.status, 'open');
  let before = sources();
  s.db.setCustomTaskRules([{ ...tank, everyDays: 7 }]);
  s.changes.length = 0;
  s.tasks.rulesSaved(before);
  assert.deepEqual(s.changes, [s.id], 'one save tells the room once (the daily row cancelled, the upkeep row made)');
  assert.deepEqual([s.db.getTask(daily.id).status, s.db.getTask(daily.id).reason], ['cancelled', 'Rule changed']);
  const upkeep = s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === key);
  assert.equal(upkeep.dueDate, '2026-10-30');
  before = sources();
  s.db.setCustomTaskRules([{ ...tank, everyDays: null }]);
  s.tasks.rulesSaved(before);
  assert.deepEqual([s.db.getTask(upkeep.id).status, s.db.getTask(upkeep.id).reason], ['cancelled', 'Rule changed']);
  assert.equal(s.row(key).status, 'open'); // daily again: today's row opens again
});

test('rulesSaved: an own rule removed cancels its open upkeep row and today\'s open daily row "Rule removed"', (t) => {
  const s = setup(t);
  const [tank, shelves] = s.db.setCustomTaskRules([
    { text: 'Check the water tank', rooms: null, everyDays: null, slot: 'morning', enabled: true },
    { text: 'Wipe the shelves', rooms: null, everyDays: 14, slot: 'any', enabled: true },
  ]);
  const daily = s.row(`custom:${tank.id}`);
  const upkeep = s.tasks.roomView(s.id).upkeep.find((r) => r.ruleKey === `custom:${shelves.id}`);
  const before = { settings: s.db.taskRuleSettings(), custom: s.db.customTaskRules() };
  s.db.setCustomTaskRules([]);
  s.tasks.rulesSaved(before);
  for (const id of [daily.id, upkeep.id]) assert.deepEqual([s.db.getTask(id).status, s.db.getTask(id).reason], ['cancelled', 'Rule removed']);
  assert.deepEqual(s.tasks.roomView(s.id).upkeep.filter((r) => r.ruleKey.startsWith('custom:')), []);
});

// C9 re-review: an own rule's rooms narrowed in Settings (Edit) leaves no open row in a room taken off it.
test('rulesSaved: an own rule narrowed to fewer rooms cancels its open rows in the rooms taken off it "Rule changed"', (t) => {
  const s = setup(t);
  const more = ['Room 2', 'Room 3'].map((name) => {
    const id = s.db.createRoom({ ...ROOM, name, trhAddress: null }, at('2026-10-30T08:00:00+08:00')).id;
    s.db.setProgram(id, { ...s.db.getProgram(id), crops: OYSTER, stage: 'fruiting', stageSince: at('2026-10-30T08:00:00+08:00') });
    return id;
  });
  const [r1, r2, r3] = [s.id, ...more];
  const sources = () => ({ settings: s.db.taskRuleSettings(), custom: s.db.customTaskRules() });
  const upkeepOf = (room, key) => s.tasks.roomView(room).upkeep.find((r) => r.ruleKey === key);
  const dailyOf = (room, key) => s.tasks.roomView(room).today.find((r) => r.ruleKey === key);

  // every N days: rooms [1, 2, 3] → [1]
  const [shelves] = s.db.setCustomTaskRules([{ text: 'Wipe the shelves', rooms: [r1, r2, r3], everyDays: 14, slot: 'any', enabled: true }]);
  const sk = `custom:${shelves.id}`;
  const open = [r1, r2, r3].map((room) => upkeepOf(room, sk));
  assert.ok(open.every(Boolean));
  let before = sources();
  s.db.setCustomTaskRules([{ ...shelves, rooms: [r1] }]);
  s.changes.length = 0;
  s.tasks.rulesSaved(before);
  assert.equal(s.db.getTask(open[0].id).status, 'open', 'room 1 keeps its row');
  for (const row of open.slice(1)) assert.deepEqual([s.db.getTask(row.id).status, s.db.getTask(row.id).reason], ['cancelled', 'Rule changed']);
  assert.equal(upkeepOf(r2, sk), undefined);
  assert.equal(s.tasks.roomView(r2).upkeep.filter((r) => r.ruleKey === sk).length, 0, 'nothing of it counts as due there');
  assert.deepEqual([...s.changes].sort(), [r2, r3].sort(), 'each room taken off told once');

  // daily: all rooms → [1, 2]
  const [, tank] = s.db.setCustomTaskRules([{ ...shelves, rooms: [r1] }, { text: 'Check the water tank', rooms: null, everyDays: null, slot: 'morning', enabled: true }]);
  const tk = `custom:${tank.id}`;
  const daily = [r1, r2, r3].map((room) => dailyOf(room, tk));
  assert.ok(daily.every((r) => r?.status === 'open'));
  before = sources();
  s.db.setCustomTaskRules([{ ...shelves, rooms: [r1] }, { ...tank, rooms: [r1, r2] }]);
  s.changes.length = 0;
  s.tasks.rulesSaved(before);
  assert.deepEqual([daily[0], daily[1]].map((r) => s.db.getTask(r.id).status), ['open', 'open']);
  assert.deepEqual([s.db.getTask(daily[2].id).status, s.db.getTask(daily[2].id).reason], ['cancelled', 'Rule changed']);
  assert.deepEqual(s.changes, [r3], 'only the room taken off is told');
});
