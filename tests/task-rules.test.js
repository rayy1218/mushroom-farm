// The task rules (server/task-rules.js, spec 2026-10-30-tasks-design.md sections 3 and 4): the farm's day, the stage day,
// the daily rules a room wants on a day, the owner's changes and the upkeep conditions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAMILY_OF, SLOTS, DAILY_RULES, CLEAR_OUT, UPKEEP_RULES, CROP_NOTES, localDate, localTime, dayStart, addDays, daysBetween,
  stageDayOn, effectiveRules, wantedDaily, upkeepApplies,
} from '../server/task-rules.js';
import { PROGRAM_DEFAULTS } from '../server/program.js';
import { CROP_KEYS } from '../web/crops.js';

const at = (iso) => Date.parse(iso);
const START = at('2026-10-30T09:15:00+08:00'); // a stage started on 30 Oct, farm time
const prog = (extra = {}) => ({ ...PROGRAM_DEFAULTS, farmType: 'full', crops: [{ crop: 'oyster', blocks: 100 }], stageSince: START, ...extra });
const ALL = effectiveRules({ roomId: 1 }).daily;
const keysOn = (date, p, rules = ALL) => wantedDaily({ program: p, crops: p.crops, date, rules }).map((w) => w.ruleKey);

test('the farm day is Kuala Lumpur time whatever the host clock', () => {
  assert.equal(localDate(at('2026-10-29T16:00:00Z')), '2026-10-30'); // 00:00 farm time
  assert.equal(localDate(at('2026-10-29T15:59:59Z')), '2026-10-29');
  assert.equal(localTime(at('2026-10-30T01:12:00Z')), '09:12');
  assert.equal(dayStart('2026-10-30'), at('2026-10-30T00:00:00+08:00'));
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
  assert.equal(daysBetween('2026-11-02', '2026-10-30'), -3);
});

test('stageDayOn: day 1 is the farm date of the stage start, not capped; null without a start', () => {
  assert.deepEqual(stageDayOn(prog({ stage: 'fruiting' }), '2026-10-30'), { day: 1, length: 7 });
  assert.deepEqual(stageDayOn(prog({ stage: 'fruiting' }), '2026-11-05'), { day: 7, length: 7 });
  assert.deepEqual(stageDayOn(prog({ stage: 'fruiting' }), '2026-11-08'), { day: 10, length: 7 });
  // 23:30 farm time is still that day
  assert.equal(stageDayOn(prog({ stageSince: at('2026-10-30T23:30:00+08:00') }), '2026-10-31').day, 2);
  assert.equal(stageDayOn(prog({ stageSince: null }), '2026-10-30'), null);
});

test('the built-in rules are the spec tables', () => {
  assert.deepEqual(DAILY_RULES.map((r) => r.key), ['contamWalk', 'colonisedCheck', 'openBags', 'casingApply', 'reishiForm', 'humidifierCheck',
    'harvestAm', 'harvestPm', 'harvestDaily', 'reishiRim', 'scrapeRecap', 'reopen', 'footbath', 'floorClean']);
  for (const r of [...DAILY_RULES, CLEAR_OUT]) assert.ok(SLOTS.includes(r.slot), r.key);
  assert.deepEqual(DAILY_RULES.filter((r) => r.amount).map((r) => [r.key, r.amount.unit]),
    [['contamWalk', 'bags'], ['harvestAm', 'kg'], ['harvestPm', 'kg'], ['harvestDaily', 'kg'], ['reishiRim', 'kg']]);
  assert.deepEqual(UPKEEP_RULES.map((r) => [r.key, r.everyDays, r.needs]), [
    ['acFilter', 7, 'ac'], ['humidifierDescale', 7, 'humidifier'], ['flyTraps', 7, null], ['dehumidifierFilter', 14, 'dehumidifier'],
    ['co2Check', 30, 'co2'], ['rhCheck', 90, 'trh'], ['acService', 120, 'ac'], ['acChemWash', 180, 'ac']]);
  assert.deepEqual(Object.keys(FAMILY_OF).sort(), [...CROP_KEYS].sort(), 'every crop has a family');
  assert.deepEqual(Object.keys(CROP_NOTES).sort(), ['abalone', 'black', 'golden', 'lionsmane', 'pink', 'woodear']);
  const O = ['oyster'], OWLR = ['oyster', 'woodear', 'lionsmane', 'reishi'], OL = ['oyster', 'lionsmane'];
  const LAST7 = { every: 2, lastDays: 7 }, WHOLE = { every: 2, lastDays: null };
  assert.deepEqual([...DAILY_RULES, CLEAR_OUT].map((r) => [r.key, r.families, r.stages, r.when, r.slot]), [
    ['contamWalk', null, null, 'daily', 'morning'],
    ['colonisedCheck', null, ['spawn'], LAST7, 'any'],
    ['openBags', OWLR, ['pinning'], 'first', 'morning'],
    ['casingApply', ['milky'], ['pinning'], 'first', 'morning'],
    ['reishiForm', ['reishi'], ['pinning'], 'first', 'any'],
    ['humidifierCheck', null, ['pinning', 'fruiting'], 'daily', 'morning'],
    ['harvestAm', OL, ['fruiting'], 'daily', 'morning'],
    ['harvestPm', OL, ['fruiting'], 'daily', 'afternoon'],
    ['harvestDaily', ['woodear', 'milky'], ['fruiting'], 'daily', 'morning'],
    ['reishiRim', ['reishi'], ['fruiting'], WHOLE, 'any'],
    ['scrapeRecap', O, ['rest'], 'first', 'morning'],
    ['reopen', ['oyster', 'woodear', 'lionsmane'], ['rest'], 'last', 'morning'],
    ['footbath', null, null, 'daily', 'morning'],
    ['floorClean', null, null, 'daily', 'afternoon'],
    ['clearOut', null, null, 'daily', 'morning'],
  ]);
});

test('an oyster room through its stages', () => {
  const spawn = prog({ stage: 'spawn' }); // 21 days: 30 Oct to 19 Nov
  assert.deepEqual(keysOn('2026-10-30', spawn), ['contamWalk', 'footbath', 'floorClean']);
  const pinning = prog({ stage: 'pinning' });
  assert.deepEqual(keysOn('2026-10-30', pinning), ['contamWalk', 'openBags', 'humidifierCheck', 'footbath', 'floorClean']);
  assert.deepEqual(keysOn('2026-10-31', pinning), ['contamWalk', 'humidifierCheck', 'footbath', 'floorClean']);
  assert.deepEqual(keysOn('2026-10-31', prog({ stage: 'fruiting' })),
    ['contamWalk', 'humidifierCheck', 'harvestAm', 'harvestPm', 'footbath', 'floorClean']);
  const rest = prog({ stage: 'rest' }); // 10 days: 30 Oct to 8 Nov
  assert.deepEqual(keysOn('2026-10-30', rest), ['contamWalk', 'scrapeRecap', 'footbath', 'floorClean'], 'first day');
  assert.deepEqual(keysOn('2026-11-02', rest), ['contamWalk', 'footbath', 'floorClean']);
  assert.deepEqual(keysOn('2026-11-08', rest), ['contamWalk', 'reopen', 'footbath', 'floorClean'], 'last day');
  assert.deepEqual(keysOn('2026-11-09', rest), ['contamWalk', 'footbath', 'floorClean'], 'after the last day');
});

test('the colonisation check comes every 2 days within the last 7 days of the spawn run', () => {
  const spawn = prog({ stage: 'spawn' }); // day 15 = 13 Nov, day 21 = 19 Nov
  const days = [];
  for (let d = 1; d <= 22; d++) if (keysOn(addDays('2026-10-30', d - 1), spawn).includes('colonisedCheck')) days.push(d);
  assert.deepEqual(days, [15, 17, 19, 21]);
  // a held stage (autoAdvance off) runs past its planned length: the checks go on
  assert.ok(keysOn(addDays('2026-10-30', 22), spawn).includes('colonisedCheck'), 'day 23');
  assert.ok(!keysOn(addDays('2026-10-30', 23), spawn).includes('colonisedCheck'), 'day 24');
  assert.ok(!keysOn('2026-11-13', prog({ stage: 'spawn', stageSince: null })).includes('colonisedCheck'), 'no start: no stage day');
});

test('the families: wood ear, milky, reishi and lion\'s mane', () => {
  const crop = (c, extra) => prog({ crops: [{ crop: c, blocks: 10 }], ...extra });
  assert.deepEqual(keysOn('2026-10-30', crop('milky', { stage: 'pinning' })), ['contamWalk', 'casingApply', 'humidifierCheck', 'footbath', 'floorClean']);
  assert.deepEqual(keysOn('2026-10-30', crop('reishi', { stage: 'pinning' })),
    ['contamWalk', 'openBags', 'reishiForm', 'humidifierCheck', 'footbath', 'floorClean']);
  assert.deepEqual(keysOn('2026-10-30', crop('woodear', { stage: 'fruiting' })), ['contamWalk', 'humidifierCheck', 'harvestDaily', 'footbath', 'floorClean']);
  assert.deepEqual(keysOn('2026-10-30', crop('lionsmane', { stage: 'fruiting' })),
    ['contamWalk', 'humidifierCheck', 'harvestAm', 'harvestPm', 'footbath', 'floorClean']);
  const reishi = crop('reishi', { stage: 'fruiting' });
  assert.ok(keysOn('2026-10-30', reishi).includes('reishiRim'), 'day 1');
  assert.ok(!keysOn('2026-10-31', reishi).includes('reishiRim'), 'day 2');
  assert.ok(keysOn('2026-11-01', reishi).includes('reishiRim'), 'day 3');
  assert.deepEqual(keysOn('2026-11-08', crop('woodear', { stage: 'rest' })), ['contamWalk', 'reopen', 'footbath', 'floorClean']);
  assert.ok(!keysOn('2026-11-08', crop('milky', { stage: 'rest' })).includes('reopen'), 'milky does not reopen');
});

test('mixed crops: each rule once, with the notes of each crop that has one', () => {
  const p = prog({ stage: 'fruiting', crops: [{ crop: 'pink', blocks: 10 }, { crop: 'golden', blocks: 10 }, { crop: 'oyster', blocks: 5 }] });
  const wanted = wantedDaily({ program: p, crops: p.crops, date: '2026-10-30', rules: ALL });
  assert.equal(wanted.filter((w) => w.ruleKey === 'harvestAm').length, 1);
  const am = wanted.find((w) => w.ruleKey === 'harvestAm');
  assert.deepEqual(am, {
    ruleKey: 'harvestAm', text: 'Harvest check: pick before the cap edge waves or splits; pick before any misting',
    note: 'Pink oyster: Keeps 1–3 days after picking: pick on sale days · Golden oyster: Fragile when mature: pick early, handle gently',
    slot: 'morning', unit: 'kg',
  });
  assert.equal(wanted.find((w) => w.ruleKey === 'contamWalk').unit, 'bags');
  assert.equal(wanted.find((w) => w.ruleKey === 'footbath').note, null);
  const one = prog({ stage: 'fruiting', crops: [{ crop: 'lionsmane', blocks: 10 }] });
  const lm = wantedDaily({ program: one, crops: one.crops, date: '2026-10-30', rules: ALL });
  assert.equal(lm.find((w) => w.ruleKey === 'harvestPm').note, 'Spines 6–13 mm and still white; brown or yellow means now');
  assert.equal(lm.find((w) => w.ruleKey === 'humidifierCheck').note, 'Mist the air, never the mushroom');
  const ab = prog({ stage: 'rest', crops: [{ crop: 'abalone', blocks: 10 }, { crop: 'woodear', blocks: 10 }] });
  assert.equal(wantedDaily({ program: ab, crops: ab.crops, date: '2026-11-01', rules: ALL }).find((w) => w.ruleKey === 'contamWalk').note,
    'Abalone oyster: Black droplets on the mycelium are normal, not contamination');
});

test('crop notes come only from the crops a rule is for', () => {
  const noteOn = (crops, ruleKey) => {
    const p = prog({ stage: 'fruiting', crops: crops.map((crop) => ({ crop, blocks: 10 })) });
    return wantedDaily({ program: p, crops: p.crops, date: '2026-10-30', rules: ALL }).find((w) => w.ruleKey === ruleKey).note;
  };
  assert.equal(noteOn(['pink', 'woodear'], 'harvestDaily'), 'Wood ear: Ears 3–5 cm, before the edges thin; leave the small ones');
  assert.equal(noteOn(['pink', 'woodear'], 'harvestAm'), 'Pink oyster: Keeps 1–3 days after picking: pick on sale days');
  assert.equal(noteOn(['lionsmane', 'reishi'], 'reishiRim'), null);
});

test('a done program gives clearOut with the room rules; no crops gives the room rules only', () => {
  assert.deepEqual(keysOn('2026-10-30', prog({ stage: 'rest', done: true })), ['clearOut', 'footbath', 'floorClean']);
  assert.deepEqual(keysOn('2026-10-30', prog({ crops: [] })), ['footbath', 'floorClean']);
  assert.ok(!keysOn('2026-10-30', prog({ stage: 'fruiting' })).includes('clearOut'));
});

test('effectiveRules: rules off, upkeep intervals and the owner\'s rules per room', () => {
  const settings = [{ key: 'harvestPm', enabled: false, everyDays: null }, { key: 'acFilter', enabled: true, everyDays: 10 },
    { key: 'acChemWash', enabled: false, everyDays: null }];
  const custom = [
    { id: 1, text: 'Top up the RO water tank', rooms: null, everyDays: null, slot: 'afternoon', enabled: true },
    { id: 2, text: 'Clean the shelves', rooms: [2], everyDays: 14, slot: 'any', enabled: true },
    { id: 3, text: 'Old rule', rooms: null, everyDays: null, slot: 'any', enabled: false },
  ];
  const r1 = effectiveRules({ settings, custom, roomId: 1 });
  assert.ok(!r1.daily.some((r) => r.key === 'harvestPm'));
  assert.equal(r1.upkeep.find((r) => r.key === 'acFilter').everyDays, 10);
  assert.equal(r1.upkeep.find((r) => r.key === 'flyTraps').everyDays, 7);
  assert.ok(!r1.upkeep.some((r) => r.key === 'acChemWash'));
  assert.deepEqual(r1.daily.at(-1), { key: 'custom:1', kind: 'daily', text: 'Top up the RO water tank', families: null, stages: null, when: 'daily', slot: 'afternoon', amount: null });
  assert.ok(!r1.upkeep.some((r) => r.key === 'custom:2'), 'room 2 only');
  assert.ok(!r1.daily.some((r) => r.key === 'custom:3'), 'turned off');
  const r2 = effectiveRules({ settings, custom, roomId: 2 });
  assert.deepEqual(r2.upkeep.at(-1), { key: 'custom:2', kind: 'upkeep', text: 'Clean the shelves', everyDays: 14, needs: null, slot: 'any' });
  // a custom daily rule is made with or without crops
  assert.deepEqual(keysOn('2026-10-30', prog({ crops: [] }), r1.daily), ['footbath', 'floorClean', 'custom:1']);
  assert.ok(!keysOn('2026-10-30', prog({ stage: 'fruiting' }), r1.daily).includes('harvestPm'));
  // rooms and everyDays left out count as null; a room id given as text still matches
  const loose = effectiveRules({ custom: [{ id: 4, text: 'Check the door seal', slot: 'any', enabled: true },
    { id: 5, text: 'Wipe the shelves', rooms: [2], slot: 'any', enabled: true }], roomId: '2' });
  assert.deepEqual(loose.daily.slice(-2).map((r) => r.key), ['custom:4', 'custom:5']);
  const off = effectiveRules({ settings: [{ key: 'clearOut', enabled: false, everyDays: null }], roomId: 1 });
  assert.deepEqual(keysOn('2026-10-30', prog({ done: true }), off.daily), ['footbath', 'floorClean']);
});

test('upkeepApplies: what the room has', () => {
  const room = { dehumidifier: false, co2Address: null, trhAddress: 3 };
  const rule = (key) => UPKEEP_RULES.find((r) => r.key === key);
  assert.deepEqual(UPKEEP_RULES.filter((r) => upkeepApplies(r, room)).map((r) => r.key),
    ['acFilter', 'humidifierDescale', 'flyTraps', 'rhCheck', 'acService', 'acChemWash']);
  assert.equal(upkeepApplies(rule('dehumidifierFilter'), { ...room, dehumidifier: true }), true);
  assert.equal(upkeepApplies(rule('co2Check'), { ...room, co2Address: 2 }), true);
  assert.equal(upkeepApplies(rule('rhCheck'), { ...room, trhAddress: null }), false);
});
