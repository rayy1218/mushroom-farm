// The Economics page's Figures card (web/economics-figures.js, spec 2026-11-06-economics-design.md 8.1, 8.5, 8.6, 6.3, 9.2):
// the folds and their heads, the tags, where a figure applies, every note, the simulator's line in each state, the sources
// line, a typed figure checked as the server would, the saved line and the line of a part not read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foldsOf, foldHead, tagText, appliesText, noteParts, simText, sourcesLine, valuesOf, typed, boxText, savedText, partsLine, createDraft,
  fitsWant, createReplies, keepsBox, simMoved, noteLinkKey, focusAfterRepaint, likely, sourceItems,
} from '../web/economics-figures.js';
import { figuresFor, researchOf, SOURCES } from '../web/economics-defaults.js';
import { rangeText } from '../web/economics-math.js';

const NB = ' ';
const plain = (v) => JSON.parse(JSON.stringify(v).replaceAll(NB, ' ').replaceAll('\u2060', '').replaceAll('\u2011', '-')); // a range's word joiners, break-even's hyphen
const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8);
const ctx = { room: 'Container 1', crop: 'lionsmane' };

// The figures of lion's mane in a 40 ft container, every one research (as the server gives them on a new farm).
function figures() {
  const room = { volume: 67.4, humidifierLH: 2 };
  return figuresFor('lionsmane').map((f) => {
    const research = researchOf(f.key, 'lionsmane', room, 1482);
    const value = f.key === 'tariff' ? 0.55 : research.value; // the electricity price: Settings' default
    return { key: f.key, way: f.way, scope: f.scope, value, source: 'research', at: null, real: null, research, runs: null, notes: [] };
  });
}
const one = (key, more = {}) => ({ ...figures().find((f) => f.key === key), ...more });

test('the folds: Shared by every way and Your container open, then each other shown way closed; their heads', () => {
  const view = { ways: ['yours', 'highland', 'import', 'warm'], figures: figures() };
  const folds = foldsOf(view);
  assert.deepEqual(folds.map((f) => [f.title, f.open, f.figures.length]), [
    ['Shared by every way', true, 8], ['Your container', true, 19], ['Highland grower', false, 14], ['Import and resell', false, 3], ['Warm strain', false, 13],
  ]);
  assert.equal(plain(foldHead(folds[4])), 'Warm strain · 13 figures · all research');
  folds[4].figures[0].source = 'owner';
  folds[4].figures[1].source = 'owner';
  assert.equal(plain(foldHead(folds[4])), 'Warm strain · 13 figures · 2 you set');
  folds[0].figures[4].source = 'settings';
  assert.equal(plain(foldHead(folds[0])), 'Shared by every way · 8 figures', 'neither set nor all research');
});

test('the tags, and where a figure applies', () => {
  assert.deepEqual(plain([
    tagText({ source: 'owner' }), tagText({ source: 'runs', runs: { count: 4 } }), tagText({ source: 'runs', runs: { count: 1 } }),
    tagText({ source: 'runs', runs: { from: 'crop' } }), tagText({ source: 'simulator' }), tagText({ source: 'settings' }), tagText({ source: 'research' }),
  ]), ['You set', 'Your runs · 4 runs', 'Your runs · 1 run', 'Crop tab', 'Simulator', 'Settings', 'Research'], 'the planted blocks: the Crop tab, not runs');
  assert.deepEqual(['wage', 'price', 'yours.rent', 'yours.yieldG'].map((k) => appliesText(one(k), 'Container 1', 'lionsmane')),
    ['Every room and crop', "Every room, Lion's mane", 'Container 1, every crop', "Container 1, Lion's mane"]);
});

test('the research note: confidence, range, its note and its sources (each a link)', () => {
  const [note] = noteParts(one('yours.yieldG'), ctx);
  assert.equal(plain(note.text), "Low confidence: 150–400 g. Malaysian 150 g in a warm room; Shandong factory 400 g.", "the tag says Research: the note does not repeat it");
  assert.deepEqual(note.sources.map((s) => `${s.title} ${s.year}`), ['October defaults 2026', 'Malaysiaaktif 2025', 'Nongji 2023', 'Europe PMC 2023', 'Stamets (archive.org) 1993']);
  assert.equal(note.sources[1].url, 'https://malaysiaaktif.my/2025/04/cendawan-kobis-bunga-tarik-perhatian-penduduk-seberang-perak');
  assert.equal(noteParts(one('import.buyHours'), ctx)[0].sources, undefined, 'a placeholder with no source');
});

test('Your runs\' notes: yield, price, block price with batches left out, electricity, blocks, the loss in the yield', () => {
  const runs = { count: 4, from: at('2026-08-12'), to: at('2026-10-30') };
  const note = (key, f) => plain(noteParts(one(key, { source: 'runs', ...f }), ctx).map((n) => n.text));
  assert.deepEqual(note('yours.yieldG', { value: 227.4, runs: { ...runs, kg: 1592, blocks: 7000 } }),
    ["Your runs: 4 finished runs of Lion's mane in Container 1, 12 Aug – 30 Oct: 1,592.0 kg from 7,000 blocks put in (227 g a block, lost blocks counted)."]);
  assert.deepEqual(note('price', { runs: { ...runs, kg: 1480, total: 81400 } }), ['Your runs: 1,480.0 kg sold for RM 81,400.00.']);
  assert.deepEqual(note('blockPrice', { runs: { count: 4, blocks: 7000, batches: 5, batchesLeftOut: 2 } }), ['Your runs: 7,000 blocks in 5 batches. · 2 batches without a price left out.']);
  assert.deepEqual(note('blockPrice', { runs: { count: 4, blocks: 1000, batches: 1, batchesLeftOut: 0 } }), ['Your runs: 1,000 blocks in 1 batch.']);
  assert.deepEqual(note('yours.kwhBlock', { runs: { count: 4, kWh: 3412.6, days: 140, blocks: 7000 } }), ['Your runs: 3,412.6 kWh measured over 140 days for 7,000 blocks.']);
  assert.deepEqual(note('yours.blocks', { runs: { from: 'crop' } }), ["Container 1's blocks now (its Crop tab)."]);
  assert.deepEqual(note('yours.blocks', { runs: { from: 'run', at: at('2026-08-12') } }), ["Container 1's last run, 12 Aug."]);
  assert.deepEqual(note('yours.loss', { value: 0, runs, notes: ['loss-in-yield'] }), ["Counted in your yield: your runs' kg a block is over every block put in."]);
});

test('the owner\'s, Settings\', a pending day, a part not read and a loss counted twice', () => {
  const notes = (f) => plain(noteParts(f, ctx));
  const range = (key) => plain(rangeText(key, one(key).research.low, one(key).research.high));
  assert.deepEqual(notes(one('yours.yieldG', { source: 'owner', value: 250, at: at('2026-11-06'), real: { value: 227.4, source: 'runs' } })),
    [{ text: `You set this on 6 Nov · Your runs: 227 g · Research: ${range('yours.yieldG')}.`, back: true }], 'a set figure keeps the research range');
  assert.deepEqual(notes(one('wage', { source: 'owner', value: 12, at: at('2026-11-06') })), [{ text: `You set this on 6 Nov · Research: ${range('wage')}.`, back: true }]);
  assert.deepEqual(notes(one('wage', { source: 'owner', value: 12, at: at('2026-11-06'), research: null })), [{ text: 'You set this on 6 Nov.', back: true }]);
  assert.deepEqual(notes(one('price', { source: 'settings', value: 55 })), [{ text: 'Your expected price in Settings → Yield.', link: { text: 'Settings', href: '#/settings' } }]);
  assert.deepEqual(notes(one('tariff', { source: 'settings', value: 0.55 })), [{ text: 'Settings → Electricity price; Costs uses it too.' }]);
  const pending = notes(one('yours.kwhBlock', { notes: ['pending'] }));
  assert.deepEqual(pending[0], { text: 'Your runs: working out the energy…' });
  assert.match(pending[1].text, /^Medium confidence/);
  assert.deepEqual(notes(one('price', { notes: ['not-read:harvest', 'not-read:sales'] })).slice(0, 2), [
    { text: "Couldn't read Harvest just now; using research.", tone: 'warn' }, { text: "Couldn't read Sales just now; using research.", tone: 'warn' },
  ]);
  assert.deepEqual(notes(one('yours.loss', { source: 'owner', value: 5, at: at('2026-11-06'), real: { value: 0, source: 'runs' }, notes: ['loss-twice'] })), [
    { text: `You set this on 6 Nov · Your runs: 0 % · Research: ${range('yours.loss')}.`, back: true },
    { text: "Your runs' yield already counts lost blocks; a loss here counts them twice.", tone: 'warn' },
  ]);
});

test('the simulator\'s line: never, waiting, working, done (scaled past 90 days), failed, beside your runs', () => {
  const kwh = one('yours.kwhBlock');
  const line = (sim, f = kwh, more = {}) => plain(simText(sim, f, { ...ctx, life: 42, machinesNote: null, ...more }));
  assert.deepEqual(line(null), { text: "Work it out runs Container 1's simulation with Lion's mane for one block life (42 days), with its machines from Setup. Nothing is switched.", action: 'Work it out' });
  assert.equal(line(null, kwh, { machinesNote: "Fan flow at Simulate's default (not on Setup)", life: 120 }).text,
    "Work it out runs Container 1's simulation with Lion's mane for one block life of 120 days (it runs 90 days and scales up), with its machines from Setup. Fan flow at Simulate's default (not on Setup). Nothing is switched.");
  assert.deepEqual(line({ status: 'waiting' }), { text: 'Waiting for another simulation…', action: null });
  assert.deepEqual(line({ status: 'working', progress: 0.4 }), { text: 'Working it out · 40 %', action: null });
  const done = { status: 'done', at: at('2026-11-06', 14) + 2 * 60_000, value: 0.478, kwh: 708.7, blocks: 1482, days: 42 };
  assert.deepEqual(line(done, { ...kwh, source: 'simulator' }), { text: 'Simulator, 6 Nov 14:02: 708.7 kWh over 42 days for 1,482 blocks.', action: 'Work it out again' });
  assert.ok(simText({ ...done, days: 120 }, { ...kwh, source: 'simulator' }, { ...ctx, life: 42, machinesNote: null }).text.includes('scaled from 90\u00a0days'), 'the unit stays with its number');
  assert.equal(line({ ...done, days: 120, kwh: 800 }, { ...kwh, source: 'simulator' }).text, 'Simulator, 6 Nov 14:02: 800.0 kWh over 120 days (scaled from 90 days) for 1,482 blocks.');
  assert.deepEqual(line({ status: 'failed', error: 'Stopped by a restart of the farm app' }),
    { text: "Couldn't work it out: Stopped by a restart of the farm app. The figure before it stays.", tone: 'warn', action: 'Try again' });
  assert.deepEqual(line(done, { ...kwh, source: 'runs' }), { text: 'Simulator, 6 Nov: 0.48 kWh.', action: 'Work it out again' });
});

test('the sources line: what is real named, the owner\'s counted; all research', () => {
  const list = figures();
  assert.equal(sourcesLine(list.map((f) => (f.key === 'tariff' ? { ...f, source: 'settings' } : f))), 'All research: set your own figures below.');
  assert.equal(sourcesLine(list.map((f) => (f.key === 'yours.blocks' ? { ...f, source: 'runs' } : f))), 'All research: set your own figures below.', 'planted blocks are not a real figure');
  const mixed = list.map((f) => ({
    ...f,
    source: { 'yours.yieldG': 'runs', price: 'runs', 'yours.kwhBlock': 'simulator', wage: 'owner', 'yours.rent': 'owner', tariff: 'settings' }[f.key] ?? 'research',
  }));
  assert.equal(plain(sourcesLine(mixed)), 'From your runs: yield, selling price · Simulator: electricity · You set: 2 · The rest is research.');
});

test('a typed figure: checked as the server checks it; the values with the typed ones over the saved', () => {
  assert.deepEqual(typed('price', ' 55 '), { value: 55 });
  assert.deepEqual(typed('price', ''), { error: 'Selling price must be a number from RM\u00a00 to RM\u00a01,000\u00a0a\u00a0kg' });
  assert.deepEqual(typed('price', 'abc'), { error: 'Selling price must be a number from RM\u00a00 to RM\u00a01,000\u00a0a\u00a0kg' });
  assert.deepEqual(typed('yours.blocks', '1740.5'), { error: 'Blocks in the room must be a whole number from 1 to 100,000\u00a0blocks' });
  const values = valuesOf(figures(), { price: 60 });
  assert.deepEqual([values.price, values.wage, values['yours.blocks']], [60, 10, 1482]);
  assert.deepEqual([boxText('yours.blocks', 1740), boxText('yours.kwhBlock', 0.40177), boxText('price', null)], ['1,740', '0.4018', '']);
});

test('a box at rest is grouped as Costs\' dialogs show it (money to 2 places); a typed figure takes its grouping back', () => {
  assert.deepEqual([boxText('yours.blocks', 1482), boxText('yours.container', 38100), boxText('yours.racks', 1037.4), boxText('price', 48)],
    ['1,482', '38,100.00', '1,037.40', '48.00']);
  assert.deepEqual([boxText('yours.yieldG', 214.3), boxText('shrink', 10), boxText('yours.kwhBlock', 0.551)], ['214.3', '10', '0.551']);
  assert.deepEqual(typed('yours.blocks', '1,482'), { value: 1482 });
  assert.deepEqual(typed('yours.container', '38,100.50'), { value: 38100.5 });
  assert.deepEqual(typed('yours.container', ' 38 100 '), { value: 38100 }, 'spaces too, as Costs');
  assert.deepEqual(typed('yours.blocks', '1,4,8,2'), { value: 1482 }, 'Costs drops every comma');
  assert.deepEqual(typed('yours.blocks', boxText('yours.blocks', 1482)), { value: 1482 }, 'its own text reads back');
  assert.ok(typed('yours.blocks', '1.482,5').error, 'a decimal comma is not a figure');
});

test('the saved line, and the line of a part not read', () => {
  assert.equal(plain(savedText('price', 55, 'Container 1', 'lionsmane')), 'Saved: Selling price, RM 55.00 a kg, every room.');
  assert.equal(plain(savedText('price', 55, 'Container 1', 'lionsmane', { profit: 649.13, be: 48.58 })),
    'Saved: Selling price, RM 55.00 a kg, every room. Now RM 649.13 a month, break-even RM 48.58 a kg.', 'the result, which is out of view');
  assert.equal(plain(savedText('price', 5, 'Container 1', 'lionsmane', { profit: -1400.38, be: 48.58 })),
    'Saved: Selling price, RM 5.00 a kg, every room. Now −RM 1,400.38 a month loss, break-even RM 48.58 a kg.');
  assert.equal(plain(savedText('price', 0, 'Container 1', 'lionsmane', { profit: -10, be: Infinity })),
    'Saved: Selling price, RM 0.00 a kg, every room. Now −RM 10.00 a month loss.', 'no break-even when nothing sells');
  assert.equal(plain(savedText('wage', 12, 'Container 1', 'lionsmane')), 'Saved: Labour cost, other ways, RM 12.00 an hour, every room and crop.');
  assert.equal(plain(savedText('yours.rent', 300, 'Container 1', 'lionsmane')), 'Saved: Rent, RM 300.00 a month, Container 1, every crop.');
  assert.equal(plain(savedText('yours.yieldG', 230, 'Container 1', 'lionsmane')), "Saved: Yield per good block, all flushes, 230 g, Container 1 and Lion's mane.");
  assert.equal(plain(partsLine({ sales: 'Something went wrong', energy: 'Something went wrong' })), "Couldn't read Sales and the energy just now · trying again every minute");
  assert.equal(plain(partsLine({ sales: 'x', batches: 'x', energy: 'x' })), "Couldn't read Sales, Batches and the energy just now · trying again every minute");
  assert.equal(partsLine({}), null);
});

test('the draft: typing a figure recalculates at once; one that is not a figure keeps the last valid one and its refusal; a reply keeps what is typed', () => {
  const draft = createDraft();
  assert.deepEqual(draft.results(), [], 'nothing read yet');
  const reply = { ways: ['yours', 'highland', 'import', 'warm'], figures: figures() };
  draft.use(reply);
  const profit = () => Math.round(draft.results()[0].profit * 100) / 100;
  assert.equal(profit(), 680.07, 'the research defaults (section 11.2, lion\'s mane; Money truth: one worker\'s RM 1,954.15)');
  assert.deepEqual(draft.type('price', '55'), { value: 55 });
  assert.ok(profit() > 680.07 + 1000, 'RM 5 more a kg over 217 kg');
  const at55 = profit();
  assert.deepEqual(draft.type('price', '55x'), { error: 'Selling price must be a number from RM\u00a00 to RM\u00a01,000\u00a0a\u00a0kg' });
  assert.equal(profit(), at55, 'the last valid figure stays in the sums');
  assert.equal(draft.error('price'), 'Selling price must be a number from RM\u00a00 to RM\u00a01,000\u00a0a\u00a0kg');
  assert.equal(draft.unsaved('price'), true);
  draft.use({ ...reply, figures: figures().map((f) => (f.key === 'wage' ? { ...f, value: 12, source: 'owner' } : f)) });
  assert.equal(draft.values().price, 55, 'a new reply keeps the typed figure');
  assert.equal(draft.values().wage, 12);
  draft.drop('price');
  assert.deepEqual([draft.values().price, draft.error('price'), draft.unsaved('price')], [50, null, false]);
});

test('the draft: a new room or crop clears what was typed; a save drops only the value it saved; a first entry refused', () => {
  const list = figures();
  const reply = { room: { id: 1 }, crop: 'oyster', ways: ['yours'], figures: list };
  const draft = createDraft();
  draft.use(reply);
  draft.type('price', '60');
  draft.type('wage', 'abc');
  draft.use({ ...reply, figures: list.slice() });
  assert.deepEqual([draft.values().price, draft.error('wage')], [60, 'Labour cost, other ways must be a number from RM\u00a00 to RM\u00a0200\u00a0an\u00a0hour'], 'the same room and crop keeps it');
  draft.use({ ...reply, crop: 'pink' });
  assert.deepEqual([draft.unsaved('price'), draft.error('wage'), draft.values().price], [false, null, 50], 'a new crop clears it');
  draft.use({ ...reply, crop: 'pink' });
  draft.type('price', '60');
  draft.use({ ...reply, room: { id: 2 }, crop: 'pink' });
  assert.equal(draft.unsaved('price'), false, 'a new room clears it');

  draft.type('price', '55');
  draft.type('price', '60'); // typed while the save of 55 is in flight
  draft.drop('price', 55);
  assert.deepEqual([draft.unsaved('price'), draft.values().price], [true, 60], 'the reply of the 55 save leaves the 60');
  draft.drop('price', 60);
  assert.equal(draft.unsaved('price'), false);
  draft.type('price', '60');
  draft.drop('price');
  assert.equal(draft.unsaved('price'), false, 'no value: Back to default drops it');

  const fresh = createDraft();
  fresh.use(reply);
  const was = fresh.values().price;
  fresh.type('price', 'abc');
  assert.deepEqual([fresh.unsaved('price'), Boolean(fresh.error('price')), fresh.values().price], [false, true, was]);
});

test('the simulator\'s intro says a long block life as it is; a note with no text is not pushed', () => {
  const kwh = one('yours.kwhBlock');
  const text = (life) => plain(simText(null, kwh, { ...ctx, life, machinesNote: null })).text;
  assert.match(text(120), /^Work it out runs Container 1's simulation with Lion's mane for one block life of 120 days \(it runs 90 days and scales up\), with its machines/);
  assert.match(text(90), /for one block life \(90 days\), /);
  assert.match(text(NaN), /for one block life \(1 day\), /);
  assert.deepEqual(noteParts(one('wage', { source: 'runs', runs: { count: 1 } }), ctx), []);
});

// ---- the page's replies and boxes (spec 9.1) ----
const view = (room, crop, more = {}) => ({ room: { id: room, name: `Container ${room}` }, crop, figures: [], ...more });

test('a reply fits the room and crop the page wants (null: the server\'s choice)', () => {
  assert.equal(fitsWant(view(1, 'oyster'), { room: null, crop: null }), true);
  assert.equal(fitsWant(view(1, 'oyster'), { room: 1, crop: 'oyster' }), true);
  assert.equal(fitsWant(view(1, 'oyster'), { room: 2, crop: 'oyster' }), false, 'another room was picked since');
  assert.equal(fitsWant(view(1, 'oyster'), { room: 1, crop: 'pink' }), false, 'another crop was picked since');
  assert.equal(fitsWant(view(1, 'oyster'), { room: null, crop: 'oyster' }), true, 'a gone room: the first room, the crop kept');
});

test('the replies: a save\'s reply for a room no longer wanted is dropped; a read asked before a save is dropped', () => {
  const replies = createReplies();
  const want = { room: 1, crop: 'oyster' };
  assert.equal(replies.take(view(1, 'oyster'), want, { asked: replies.asked() }), 'new');

  // a save of the old room answered after the owner picked room 2: dropped (no repaint, no address, no new draft)
  const old = replies.act();
  assert.equal(replies.take(view(1, 'oyster', { price: 60 }), { room: 2, crop: 'oyster' }, { act: old }), 'drop');

  // a read asked before a save, answered after the save's reply: older than it, dropped
  const before = replies.asked();
  const save = replies.act();
  assert.equal(replies.take(view(1, 'oyster', { price: 60 }), want, { act: save }), 'new', 'the save\'s own reply');
  assert.equal(replies.take(view(1, 'oyster', { price: 48 }), want, { asked: before }), 'drop', 'the read from before the save');
  // a read asked after it is shown
  assert.equal(replies.take(view(1, 'oyster', { price: 61 }), want, { asked: replies.asked() }), 'new');
});

test('the replies: the same answer paints nothing, so a save whose reply a read already painted repaints itself', () => {
  const replies = createReplies();
  const want = { room: 1, crop: 'oyster' };
  replies.take(view(1, 'oyster'), want, { asked: replies.asked() });
  const save = replies.act(); // the save goes; its economics event brings a read first (asked after the save)
  const saved = view(1, 'oyster', { price: 60 });
  assert.equal(replies.take(saved, want, { asked: replies.asked() }), 'new', 'the read paints first, while the tag says Saving…');
  assert.equal(replies.take(saved, want, { act: save }), 'same', 'the save\'s reply is the same answer: the page repaints its tag itself');
});

test('the replies: actions in their order; an action\'s reply older than one painted is dropped', () => {
  const replies = createReplies();
  const want = { room: 1, crop: 'oyster' };
  const a = replies.act();
  const b = replies.act();
  assert.ok(b > a, 'act() numbers the actions');
  assert.equal(replies.take(view(1, 'oyster', { price: 60, wage: 12 }), want, { act: b }), 'new', 'save B answers first');
  assert.equal(replies.take(view(1, 'oyster', { price: 60 }), want, { act: a }), 'drop', 'save A answers later: older than B\'s, dropped');
  // in order, both are painted
  const c = replies.act();
  const d = replies.act();
  assert.equal(replies.take(view(1, 'oyster', { price: 61 }), want, { act: c }), 'new');
  assert.equal(replies.take(view(1, 'oyster', { price: 61, wage: 13 }), want, { act: d }), 'new');
});

test('a note\'s links are keyed by their row; after a repaint the cursor stays in its row (Back to default, else the box)', () => {
  assert.equal(noteLinkKey('price', 0, 1), 'note:price:0:1');
  assert.notEqual(noteLinkKey('price', 0, 1), noteLinkKey('wage', 0, 1), 'the same source in another row is another key');
  assert.equal(focusAfterRepaint({ inRow: false, rowKept: true, stillInRow: false, hasBack: true }), null, 'not in a row: keepFocus\'s choice');
  assert.equal(focusAfterRepaint({ inRow: true, rowKept: true, stillInRow: true, hasBack: true }), null, 'still in its row');
  assert.equal(focusAfterRepaint({ inRow: true, rowKept: false, stillInRow: false, hasBack: true }), null, 'the row is gone (another room)');
  assert.equal(focusAfterRepaint({ inRow: true, rowKept: true, stillInRow: false, hasBack: true }), 'back', 'a research link gone: Back to default');
  assert.equal(focusAfterRepaint({ inRow: true, rowKept: true, stillInRow: false, hasBack: false }), 'box');
  // Work it out's button gone (the run started): its line, never a figure box (a phone's keyboard would open)
  assert.equal(focusAfterRepaint({ inRow: true, rowKept: true, stillInRow: false, hasBack: true, inSim: true }), 'sim');
  assert.equal(focusAfterRepaint({ inRow: true, rowKept: true, stillInRow: true, hasBack: true, inSim: true }), null, 'the button stayed');
});

test('a repaint leaves a box alone while it is focused, unsaved or refused (the refused text stays with its refusal)', () => {
  assert.equal(keepsBox({ focused: false, unsaved: false, refused: false }), false);
  assert.equal(keepsBox({ focused: true, unsaved: false, refused: false }), true);
  assert.equal(keepsBox({ focused: false, unsaved: true, refused: false }), true);
  assert.equal(keepsBox({ focused: false, unsaved: false, refused: true }), true, 'a refusal (the draft\'s or the server\'s) keeps the text it refused');
});

test('a refusal of Work it out stands until the run moves on (it starts, ends or fails)', () => {
  const working = { status: 'working', at: 1, simId: 7 };
  assert.equal(simMoved(working, { ...working, progress: 0.5 }), false, 'the same run, further on');
  assert.equal(simMoved(working, { status: 'done', at: 2, simId: 7 }), true);
  assert.equal(simMoved(null, working), true);
  assert.equal(simMoved({ status: 'done', at: 2 }, { status: 'done', at: 3 }), true, 'worked out again');
  assert.equal(simMoved(null, null), false);
});

test('an unusual figure: outside its research range, or under half or over twice the real one, is questioned, not refused', () => {
  const price = one('price', { source: 'runs', value: 48 }); // research RM 30.00–70.00 a kg for lion's mane
  const r = price.research;
  const words = (f, v) => plain(likely(f, v));
  assert.equal(likely(price, 48), null);
  assert.equal(likely(price, r.low), null, 'the range\'s ends are usual');
  assert.equal(words(price, 5), `Unusual: research gives ${plain(rangeText('price', r.low, r.high))}; your runs give RM 48.00 a kg.`);
  assert.equal(words(one('price', { source: 'owner', value: 20, real: { source: 'runs', value: 48 } }), 20),
    `Unusual: research gives ${plain(rangeText('price', r.low, r.high))}; your runs give RM 48.00 a kg.`, 'a set figure: against its real one');
  const blocks = one('yours.blocks', { source: 'runs', value: 1482, runs: { from: 'crop' }, research: { ...one('yours.blocks').research, low: 100, high: 5000 } });
  assert.equal(words(blocks, 148), 'Unusual: research gives 100–5,000 blocks; the Crop tab gives 1,482 blocks.', 'under half the real one, inside the range');
  assert.equal(words(blocks, 3000), 'Unusual: research gives 100–5,000 blocks; the Crop tab gives 1,482 blocks.', 'over twice it');
  assert.equal(words(one('yours.kwhBlock', { source: 'simulator', value: 0.55 }), 0.1), `Unusual: research gives ${plain(rangeText('yours.kwhBlock', 0.4, 1.63))}; the simulator gives 0.55 kWh.`);
  assert.equal(likely(blocks, 900), null);
  assert.equal(words(one('wage'), 50), `Unusual: research gives ${plain(rangeText('wage', 8.72, 12))}.`, 'research alone');
  assert.equal(likely(one('wage', { research: null }), 50), null, 'nothing to check against');
});

test('a note\'s sources: one link a page, and two pages of one name told apart', () => {
  const items = (ids) => plain(sourceItems(ids.map((id) => SOURCES[id])));
  assert.deepEqual(items(['L36', 'G10']), [{ words: 'Shroomy 2026', url: SOURCES.L36.url }, { words: 'Shroomy 2026 (2)', url: SOURCES.G10.url }]);
  assert.deepEqual(items(['L09', 'G13', 'G14']).map((x) => x.words), ['Tridge 2026', 'Tridge 2026 (2)'], 'the same page (its #part aside) once');
  assert.deepEqual(items(['S16', 'G04']), [{ words: 'Harga Sekilo 2026', url: SOURCES.S16.url }], 'two ids of one page: one link');
  assert.deepEqual(items(['L01', 'APP']).map((x) => [x.words, x.url]), [['October defaults 2026', null], ["This app's simulation 2026", null]]);
});

// ---- Money truth (spec 2026-11-12-money-truth-design.md 6.3, 8 and 9) ----
test('the new sources\' tags and notes; the measured loss; a partial run counted; the realised price and its flag; the sources line', () => {
  const note = (key, f) => plain(noteParts(one(key, f), ctx).map((n) => n.text));
  const span = { count: 2, from: at('2026-08-12'), to: at('2026-11-03') };
  assert.deepEqual([tagText({ source: 'sales' }), tagText({ source: 'costs' }), tagText({ source: 'register' })], ['Your sales', 'Your costs', 'Your equipment']);
  assert.deepEqual(note('yours.yieldG', { source: 'runs', value: 230.8, runs: { ...span, kg: 450, blocks: 2000, good: 1950, lost: 50, measured: true, partial: 1 } }),
    ["Your runs: 2 finished runs of Lion's mane in Container 1 (one counted from its block-in day), 12 Aug – 3 Nov: 450.0 kg from 1,950 good blocks of 2,000 put in (231 g a good block)."]);
  assert.deepEqual(note('yours.loss', { source: 'runs', value: 2.5, runs: { ...span, put: 2000, lost: 50, measured: true }, notes: [] }), ['Your runs: 50 of 2,000 blocks lost (Batches’ checks).']);
  assert.deepEqual(note('price', { source: 'sales', value: 48, runs: { kg: 8, total: 384, count: 1 } }), ["Your sales: 8.0 kg of Lion's mane sold for RM 384.00 in the last 90 days."]);
  assert.deepEqual(note('yours.workers', { source: 'costs', value: 2, runs: { names: ['Aminah', 'Siti'], total: 3400, items: 2 } }),
    ['Your costs: Aminah’s and Siti’s base wages, RM 3,400.00 a month as entered in Costs (enter them with EPF, SOCSO and EIS).']);
  assert.match(note('yours.workers', { source: 'costs', value: 3, runs: { names: ['Aminah'], unnamed: 2, total: 5100, items: 3 } })[0], /^Your costs: 3 workers’ base wages/);
  assert.deepEqual(note('yours.cooling', { source: 'register', value: 8340, runs: { items: [{ name: 'Daikin', amount: 4170 }, { name: 'Daikin', amount: 4170 }] } }),
    ['Your equipment register: Daikin RM 4,170.00, Daikin RM 4,170.00.']);
  assert.deepEqual(note('yours.racks', { source: 'register', value: 0, runs: { items: [] } }), ['Your equipment register has none of this part.']);
  const settings = noteParts(one('price', { source: 'settings', value: 35, realised: { value: 48, kg: 8, total: 384 }, notes: ['price-off'] }), ctx);
  assert.deepEqual(plain(settings.at(-1)), { text: 'Settings’ expected price, RM 35.00 a kg, is 27 % under your sales’ RM 48.00 a kg of the last 90 days.', tone: 'warn' });
  const mine = noteParts(one('price', { source: 'owner', value: 70, at: at('2026-11-06'), realised: { value: 48, kg: 8, total: 384 }, notes: ['price-off'] }), ctx);
  assert.equal(plain(mine.at(-1).text), 'Your RM 70.00 a kg is 46 % over your sales’ RM 48.00 a kg of the last 90 days.');
  const near = noteParts(one('price', { source: 'research', value: 50, realised: { value: 48, kg: 8, total: 384 }, notes: [] }), ctx);
  assert.equal(plain(near.at(-1).text), 'Your sales, last 90 days: RM 48.00 a kg.');
  assert.equal(plain(sourcesLine([{ key: 'price', source: 'sales' }, { key: 'yours.workers', source: 'costs' }, { key: 'yours.cooling', source: 'register' }, { key: 'yours.racks', source: 'register' }])),
    'Your sales: selling price · Your costs: labour, equipment · The rest is research.');
  assert.equal(plain(savedText('yours.container', 25056, 'Room 1', 'lionsmane', null, 'built')), 'Saved: Building, insulated, RM 25,056.00, Room 1, every crop.');
});

test('the building\'s research note points to the room type on Setup', () => {
  assert.equal(plain(noteParts(one('yours.container'), ctx).at(-1).text), 'By the room type on its Setup tab: container, built room or shed.');
});

test('an equipment part the register has no item for says where its figure comes from', () => {
  assert.equal(plain(noteParts(one('yours.humidifier', { notes: ['not-in-register'] }), ctx).at(-1).text), 'Not in your equipment register: research.');
});
