// The Economics page's Figures card (web/economics-figures.js, spec 2026-11-06-economics-design.md 8.1, 8.5, 8.6, 6.3, 9.2):
// the folds and their heads, the tags, where a figure applies, every note, the simulator's line in each state, the sources
// line, a typed figure checked as the server would, the saved line and the line of a part not read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foldsOf, foldHead, tagText, appliesText, noteParts, simText, sourcesLine, valuesOf, typed, boxText, savedText, partsLine, createDraft,
  fitsWant, createReplies, keepsBox,
} from '../web/economics-figures.js';
import { figuresFor, researchOf } from '../web/economics-defaults.js';

const NB = ' ';
const plain = (v) => JSON.parse(JSON.stringify(v).replaceAll(NB, ' '));
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
    ['Shared by every way', true, 8], ['Your container', true, 16], ['Highland grower', false, 14], ['Import and resell', false, 3], ['Warm strain', false, 13],
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
  ]), ['You set', 'Your runs · 4 runs', 'Your runs · 1 run', 'Your runs', 'Simulator', 'Settings', 'Research']);
  assert.deepEqual(['wage', 'price', 'yours.rent', 'yours.yieldG'].map((k) => appliesText(one(k), 'Container 1', 'lionsmane')),
    ['Every room and crop', "Every room, Lion's mane", 'Container 1, every crop', "Container 1, Lion's mane"]);
});

test('the research note: confidence, range, its note and its sources (each a link)', () => {
  const [note] = noteParts(one('yours.yieldG'), ctx);
  assert.equal(plain(note.text), "Research, low confidence: 150–400 g. Malaysian 150 g in a warm room; Shandong factory 400 g.");
  assert.deepEqual(note.sources.map((s) => `${s.title} ${s.year}`), ['October defaults 2026', 'Malaysiaaktif 2025', 'Nongji 2023', 'Europe PMC 2023', 'Stamets (archive.org) 1993']);
  assert.equal(note.sources[1].url, 'https://malaysiaaktif.my/2025/04/cendawan-kobis-bunga-tarik-perhatian-penduduk-seberang-perak');
  assert.equal(noteParts(one('import.buyHours'), ctx)[0].sources, undefined, 'a placeholder with no source');
});

test('Your runs\' notes: yield, price tied and farm-wide, block price with batches left out, electricity, blocks, the loss in the yield', () => {
  const runs = { count: 4, from: at('2026-08-12'), to: at('2026-10-30') };
  const note = (key, f) => plain(noteParts(one(key, { source: 'runs', ...f }), ctx).map((n) => n.text));
  assert.deepEqual(note('yours.yieldG', { value: 227.4, runs: { ...runs, kg: 1592, blocks: 7000 } }),
    ["Your runs: 4 finished runs of Lion's mane in Container 1, 12 Aug – 30 Oct: 1,592.0 kg from 7,000 blocks put in (227 g a block, lost blocks counted)."]);
  assert.deepEqual(note('price', { runs: { ...runs, kg: 1480, total: 81400, farmWide: false } }), ['Your runs: 1,480.0 kg sold for RM 81,400.00.']);
  assert.deepEqual(note('price', { runs: { ...runs, kg: 1480, total: 81400, farmWide: true, until: at('2026-11-13') } }),
    ["Your sales: Lion's mane sold farm-wide 12 Aug – 13 Nov, 1,480.0 kg for RM 81,400.00 (no sale was tied to these runs)."]);
  assert.deepEqual(note('blockPrice', { runs: { count: 4, blocks: 7000, batches: 5, batchesLeftOut: 2 } }), ['Your runs: 7,000 blocks in 5 batches. · 2 batches without a price left out.']);
  assert.deepEqual(note('blockPrice', { runs: { count: 4, blocks: 1000, batches: 1, batchesLeftOut: 0 } }), ['Your runs: 1,000 blocks in 1 batch.']);
  assert.deepEqual(note('yours.kwhBlock', { runs: { count: 4, kWh: 3412.6, days: 140, blocks: 7000 } }), ['Your runs: 3,412.6 kWh measured over 140 days for 7,000 blocks.']);
  assert.deepEqual(note('yours.blocks', { runs: { from: 'crop' } }), ["Container 1's blocks now (its Crop tab)."]);
  assert.deepEqual(note('yours.blocks', { runs: { from: 'run', at: at('2026-08-12') } }), ["Container 1's last run, 12 Aug."]);
  assert.deepEqual(note('yours.loss', { value: 0, runs, notes: ['loss-in-yield'] }), ["Counted in your yield: your runs' kg a block is over every block put in."]);
});

test('the owner\'s, Settings\', a pending day, a part not read and a loss counted twice', () => {
  const notes = (f) => plain(noteParts(f, ctx));
  assert.deepEqual(notes(one('yours.yieldG', { source: 'owner', value: 250, at: at('2026-11-06'), real: { value: 227.4, source: 'runs' } })),
    [{ text: 'You set this on 6 Nov · Your runs: 227 g.' }]);
  assert.deepEqual(notes(one('wage', { source: 'owner', value: 12, at: at('2026-11-06') })), [{ text: 'You set this on 6 Nov.' }]);
  assert.deepEqual(notes(one('price', { source: 'settings', value: 55 })), [{ text: 'Your expected price in Settings → Yield.', link: { text: 'Settings', href: '#/settings' } }]);
  assert.deepEqual(notes(one('tariff', { source: 'settings', value: 0.55 })), [{ text: 'Settings → Electricity price; Costs uses it too.' }]);
  const pending = notes(one('yours.kwhBlock', { notes: ['pending'] }));
  assert.deepEqual(pending[0], { text: 'Your runs: working out the energy…' });
  assert.match(pending[1].text, /^Research, medium confidence/);
  assert.deepEqual(notes(one('price', { notes: ['not-read:harvest', 'not-read:sales'] })).slice(0, 2), [
    { text: "Couldn't read Harvest just now; using research.", tone: 'warn' }, { text: "Couldn't read Sales just now; using research.", tone: 'warn' },
  ]);
  assert.deepEqual(notes(one('yours.loss', { source: 'owner', value: 5, at: at('2026-11-06'), real: { value: 0, source: 'runs' }, notes: ['loss-twice'] })), [
    { text: 'You set this on 6 Nov · Your runs: 0 %.' },
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
  assert.deepEqual(typed('price', ''), { error: 'Selling price must be a number from 0 to 1000 RM/kg' });
  assert.deepEqual(typed('price', 'abc'), { error: 'Selling price must be a number from 0 to 1000 RM/kg' });
  assert.deepEqual(typed('yours.blocks', '1740.5'), { error: 'Blocks in the room must be a whole number from 1 to 100000 blocks' });
  const values = valuesOf(figures(), { price: 60 });
  assert.deepEqual([values.price, values.wage, values['yours.blocks']], [60, 10, 1482]);
  assert.deepEqual([boxText(1740), boxText(38.23), boxText(0.40177), boxText(null)], ['1740', '38.23', '0.4018', '']);
});

test('the saved line, and the line of a part not read', () => {
  assert.equal(plain(savedText('price', 55, 'Container 1', 'lionsmane')), 'Saved: Selling price, RM 55.00 a kg, every room.');
  assert.equal(plain(savedText('wage', 12, 'Container 1', 'lionsmane')), 'Saved: Labour cost, RM 12.00 an hour, every room and crop.');
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
  assert.equal(profit(), 2183.70, 'the research defaults (section 11.2, lion\'s mane)');
  assert.deepEqual(draft.type('price', '55'), { value: 55 });
  assert.ok(profit() > 2183.70 + 1000, 'RM 5 more a kg over 217 kg');
  const at55 = profit();
  assert.deepEqual(draft.type('price', '55x'), { error: 'Selling price must be a number from 0 to 1000 RM/kg' });
  assert.equal(profit(), at55, 'the last valid figure stays in the sums');
  assert.equal(draft.error('price'), 'Selling price must be a number from 0 to 1000 RM/kg');
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
  assert.deepEqual([draft.values().price, draft.error('wage')], [60, 'Labour cost must be a number from 0 to 200 RM an hour'], 'the same room and crop keeps it');
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
  assert.equal(replies.take(view(1, 'oyster'), want, replies.asked()), 'new');

  // a save of the old room answered after the owner picked room 2: dropped (no repaint, no address, no new draft)
  replies.act();
  assert.equal(replies.take(view(1, 'oyster', { price: 60 }), { room: 2, crop: 'oyster' }), 'drop');

  // a read asked before a save, answered after the save's reply: older than it, dropped
  const before = replies.asked();
  replies.act();
  assert.equal(replies.take(view(1, 'oyster', { price: 60 }), want), 'new', 'the save\'s own reply');
  assert.equal(replies.take(view(1, 'oyster', { price: 48 }), want, before), 'drop', 'the read from before the save');
  // a read asked after it is shown
  assert.equal(replies.take(view(1, 'oyster', { price: 61 }), want, replies.asked()), 'new');
});

test('the replies: the same answer paints nothing, so a save whose reply a read already painted repaints itself', () => {
  const replies = createReplies();
  const want = { room: 1, crop: 'oyster' };
  replies.take(view(1, 'oyster'), want, replies.asked());
  replies.act(); // the save goes; its economics event brings a read first (asked after the save)
  const saved = view(1, 'oyster', { price: 60 });
  assert.equal(replies.take(saved, want, replies.asked()), 'new', 'the read paints first, while the tag says Saving…');
  assert.equal(replies.take(saved, want), 'same', 'the save\'s reply is the same answer: the page repaints its tag itself');
});

test('a repaint leaves a box alone while it is focused, unsaved or refused (the refused text stays with its refusal)', () => {
  assert.equal(keepsBox({ focused: false, unsaved: false, refused: false }), false);
  assert.equal(keepsBox({ focused: true, unsaved: false, refused: false }), true);
  assert.equal(keepsBox({ focused: false, unsaved: true, refused: false }), true);
  assert.equal(keepsBox({ focused: false, unsaved: false, refused: true }), true, 'a refusal (the draft\'s or the server\'s) keeps the text it refused');
});
