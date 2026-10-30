// The tasks module (server/tasks.js, spec 2026-10-30-tasks-design.md sections 2, 4 and 6): making a day's rows, missed and
// cancelled rows, done, skip and cancel with their errors, upkeep intervals, long-term rows, the views, the log and the CSV.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createTasks, TaskError } from '../server/tasks.js';
import { startStage } from '../server/program.js';

const at = (iso) => Date.parse(iso);
const DAY = 86_400_000;
const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1 };
const OYSTER = [{ crop: 'oyster', blocks: 100 }];

function setup(t, { crops = OYSTER, stage = 'fruiting', room = {} } = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = at('2026-10-30T08:00:00+08:00');
  const tasks = createTasks({ db, now: () => clock, log: (e) => { throw e; } });
  const id = db.createRoom({ ...ROOM, ...room }, clock).id;
  if (crops.length) db.setProgram(id, { ...db.getProgram(id), crops, stage, stageSince: clock });
  const changes = [];
  tasks.onChange((roomId) => changes.push(roomId));
  return {
    db, tasks, id, changes,
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
  // an amount on a row that records none is not kept; an empty amount is none
  assert.equal(s.tasks.done(s.row('footbath').id, { worker: 'Ali', amount: 3 }).amount, null);
  assert.equal(s.tasks.done(s.row('harvestPm').id, { worker: 'Ali', amount: '' }).amount, null);
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
