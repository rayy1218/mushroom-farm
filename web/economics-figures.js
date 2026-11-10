// The Economics page's Figures card (spec 2026-11-06-economics-design.md 8.1, 8.5, 8.6, 6.3 and 9.2): its folds, each
// figure's tag, where it applies, its note, the simulator's line, the headline's sources line, and a typed figure checked
// before it is sent. Pure: the figures are the server's view (server/economics.js), the words follow the One Format Rule.
//   foldsOf · foldHead · tagText · appliesText · noteParts · simText · sourcesLine · valuesOf · typed · boxText · savedText
//   · partsLine · createDraft · fitsWant · createReplies · keepsBox · simMoved · noteLinkKey · focusAfterRepaint · likely
//   · sourceItems

import { checkFigure, figureOf, SOURCES, WAY_NAMES } from './economics-defaults.js';
import { compare } from './economics-model.js';
import { figureText, rangeText } from './economics-math.js';
import { moneyText, perKgText } from './costs-math.js';
import { kgText } from './harvest-math.js';
import { grouped } from './overview-math.js';
import { farmDate, farmTime, dayMonth } from './tasks-math.js';
import { cropShortName } from './crops.js';
import { DOT } from './text-math.js';

const NB = '\u00a0';
const SETTINGS_HASH = '#/settings';
const dateText = (ms) => dayMonth(farmDate(ms));
const plural = (n, one, many) => `${grouped(n, 0)}${NB}${n === 1 ? one : many}`;

// The folds (spec 8.1): Shared by every way and Your container open, then one per other shown way, closed.
export function foldsOf(view) {
  const ways = ['shared', ...view.ways];
  return ways.map((way) => ({
    way, title: way === 'shared' ? 'Shared by every way' : WAY_NAMES[way], open: way === 'shared' || way === 'yours',
    figures: view.figures.filter((f) => f.way === way),
  })).filter((f) => f.figures.length);
}
// A fold's head: "Lowland shed · 13 figures · all research" ("· 2 you set").
export function foldHead(fold) {
  const set = fold.figures.filter((f) => f.source === 'owner').length;
  const tail = set ? `${set} you set` : fold.figures.every((f) => f.source === 'research') ? 'all research' : null;
  return [fold.title, plural(fold.figures.length, 'figure', 'figures'), tail].filter(Boolean).join(DOT);
}

// The source tag: never colour alone (a neutral chip with its words).
export function tagText(f) {
  if (f.source === 'owner') return 'You set';
  if (f.source === 'runs' && f.runs?.from === 'crop') return 'Crop tab'; // the planted blocks: no run gave them (the audit, #24)
  if (f.source === 'runs') return f.runs?.count ? `Your runs${DOT}${plural(f.runs.count, 'run', 'runs')}` : 'Your runs';
  return { simulator: 'Simulator', settings: 'Settings', research: 'Research' }[f.source];
}

// Where a figure applies (its scope): "Every room and crop", "Every room, Lion's mane", "Container 1, every crop",
// "Container 1, Lion's mane".
export function appliesText(f, room, crop) {
  const name = cropShortName(crop);
  return { farm: 'Every room and crop', crop: `Every room, ${name}`, room: `${room}, every crop`, roomCrop: `${room}, ${name}` }[f.scope];
}

const SOURCE_WORDS = { runs: 'Your runs', simulator: 'Simulator', settings: 'Settings' };
const PART_NAMES = { harvest: 'Harvest', sales: 'Sales', batches: 'Batches', energy: 'the energy' };
const USING = { research: 'research', simulator: 'the simulator', settings: 'Settings', runs: 'your runs', owner: 'your figure' };
const span = (runs) => `${dateText(runs.from)} – ${dateText(runs.to)}`;

// What Your runs say of a figure (spec 8.6).
function runsNote(f, { room, crop }) {
  const r = f.runs;
  switch (f.key) {
    case 'yours.yieldG':
      return `Your runs: ${plural(r.count, 'finished run', 'finished runs')} of ${cropShortName(crop)} in ${room}, ${span(r)}: ${kgText(r.kg)} from `
        + `${plural(r.blocks, 'block', 'blocks')} put in (${figureText('yours.yieldG', f.value)} a${NB}block, lost blocks counted).`;
    case 'price':
      return r.farmWide
        ? `Your sales: ${cropShortName(crop)} sold farm-wide ${dateText(r.from)} – ${dateText(r.until)}, ${kgText(r.kg)} for ${moneyText(r.total)} (no sale was tied to these runs).`
        : `Your runs: ${kgText(r.kg)} sold for ${moneyText(r.total)}.`;
    case 'blockPrice':
      return `Your runs: ${plural(r.blocks, 'block', 'blocks')} in ${plural(r.batches, 'batch', 'batches')}.`
        + (r.batchesLeftOut ? `${DOT}${plural(r.batchesLeftOut, 'batch', 'batches')} without a price left out.` : '');
    case 'yours.kwhBlock':
      return `Your runs: ${grouped(r.kWh, 1)}${NB}kWh measured over ${plural(r.days, 'day', 'days')} for ${plural(r.blocks, 'block', 'blocks')}.`;
    case 'yours.blocks':
      return r.from === 'crop' ? `${room}'s blocks now (its Crop tab).` : `${room}'s last run, ${dateText(r.at)}.`;
    default:
      return null;
  }
}

// The note under a figure's row (spec 8.6): [{ text, tone?, link?: { text, href }, sources?: [{ title, url, year }] }].
// ctx: { room, crop }.
export function noteParts(f, ctx) {
  const out = [];
  for (const n of f.notes) {
    if (n.startsWith('not-read:')) {
      out.push({ text: `Couldn't read ${PART_NAMES[n.slice(9)]} just now; using ${USING[f.source]}.`, tone: 'warn' });
    }
  }
  if (f.notes.includes('pending')) out.push({ text: 'Your runs: working out the energy…' });
  if (f.source === 'owner') {
    // what it was set against stays beside it: the real figure and the research range (the audit, #5); Back to default
    // goes on this line (back)
    const real = f.real ? `${DOT}${SOURCE_WORDS[f.real.source]}: ${figureText(f.key, f.real.value)}` : '';
    const research = f.research ? `${DOT}Research: ${rangeText(f.key, f.research.low, f.research.high)}` : '';
    out.push({ text: `You set this on ${dateText(f.at)}${real}${research}.`, back: true });
  } else if (f.source === 'runs' && f.key === 'yours.loss') {
    out.push({ text: 'Counted in your yield: your runs\' kg a block is over every block put in.' });
  } else if (f.source === 'runs') {
    const text = runsNote(f, ctx);
    if (text) out.push({ text });
  } else if (f.source === 'settings' && f.key === 'price') {
    out.push({ text: 'Your expected price in Settings → Yield.', link: { text: 'Settings', href: SETTINGS_HASH } });
  } else if (f.source === 'settings') {
    out.push({ text: 'Settings → Electricity price; Costs uses it too.' });
  } else if (f.source === 'research') {
    const r = f.research;
    const sources = r.sources.map((id) => SOURCES[id]).filter(Boolean);
    out.push({
      text: `Research, ${r.confidence} confidence: ${rangeText(f.key, r.low, r.high)}.${r.note ? ` ${r.note}.` : ''}`,
      ...(sources.length ? { sources } : {}),
    });
  }
  if (f.notes.includes('loss-twice')) out.push({ text: 'Your runs\' yield already counts lost blocks; a loss here counts them twice.', tone: 'warn' });
  return out;
}

// The Electricity per block row's simulator line (spec 6.3): { text, tone?, action (the button's words) or null }. sim: the
// view's; f: the kwhBlock figure; ctx: { room, crop, life (days), machinesNote }.
export function simText(sim, f, { room, crop, life, machinesNote }) {
  const wanted = Math.max(1, Math.round(life) || 1);
  const days = Math.min(90, wanted);
  const lifeText = wanted > 90 ? `of ${plural(wanted, 'day', 'days')} (it runs ${plural(90, 'day', 'days')} and scales up)` : `(${plural(days, 'day', 'days')})`;
  const intro = `Work it out runs ${room}'s simulation with ${cropShortName(crop)} for one block life ${lifeText}, `
    + `with its machines from Setup.${machinesNote ? ` ${machinesNote}.` : ''} Nothing is switched.`;
  if (!sim) return { text: intro, action: 'Work it out' };
  if (sim.status === 'waiting') return { text: 'Waiting for another simulation…', action: null };
  if (sim.status === 'working') return { text: `Working it out${DOT}${Math.round((sim.progress ?? 0) * 100)}${NB}%`, action: null };
  if (sim.status === 'failed') return { text: `Couldn't work it out: ${sim.error}. The figure before it stays.`, tone: 'warn', action: 'Try again' };
  if (f.source !== 'simulator') {
    return { text: `Simulator, ${dateText(sim.at)}: ${figureText('yours.kwhBlock', sim.value)}.`, action: 'Work it out again' };
  }
  const scaled = sim.days > 90 ? ` (scaled from ${plural(90, 'day', 'days')})` : '';
  return {
    text: `Simulator, ${dateText(sim.at)} ${farmTime(sim.at)}: ${grouped(sim.kwh, 1)}${NB}kWh over ${plural(sim.days, 'day', 'days')}${scaled} for ${plural(sim.blocks, 'block', 'blocks')}.`,
    action: 'Work it out again',
  };
}

// The headline card's sources line (spec 8.1): "From your runs: yield, selling price · Simulator: electricity · You set: 2 ·
// The rest is research." ("All research: set your own figures below." when none is real.)
// The blocks are not counted: a planted room gives them from the first day, which would end "All research" on a new farm.
const SHORT = { 'yours.yieldG': 'yield', price: 'selling price', blockPrice: 'block price', 'yours.kwhBlock': 'electricity' };
export function sourcesLine(figures) {
  const of = (source) => Object.keys(SHORT).filter((key) => figures.some((f) => f.key === key && f.source === source)).map((key) => SHORT[key]);
  const set = figures.filter((f) => f.source === 'owner').length;
  const parts = [
    of('runs').length ? `From your runs: ${of('runs').join(', ')}` : null,
    of('simulator').length ? `Simulator: ${of('simulator').join(', ')}` : null,
    of('settings').length ? `Settings: ${of('settings').join(', ')}` : null,
    set ? `You set: ${set}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(DOT)}${DOT}The rest is research.` : 'All research: set your own figures below.';
}

// The figures' values by key (the model's input), with the typed ones over them.
export const valuesOf = (figures, typedValues = {}) => ({ ...Object.fromEntries(figures.map((f) => [f.key, f.value])), ...typedValues });

// A figure as typed: { value } or { error } (the server's words, spec 4.2).
export function typed(key, text) {
  const t = String(text).trim();
  const value = t === '' ? NaN : Number(t);
  const error = checkFigure(key, value);
  return error ? { error } : { value };
}
// The box's text: the value without grouping ("1740", "38.23").
export const boxText = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10_000) / 10_000) : '');

// The polite line after a save: "Saved: Selling price, RM 55.00 a kg, every room." With yours (the model's result for Your
// container) the result follows, which is out of view at the box (the audit, #10): "Now RM 649.13 a month, break-even
// RM 48.58 a kg."
export function savedText(key, value, room, crop, yours = null) {
  const f = figureOf(key);
  const where = { farm: 'every room and crop', crop: 'every room', room: `${room}, every crop`, roomCrop: `${room} and ${cropShortName(crop)}` }[f.scope];
  const saved = `Saved: ${f.label}, ${figureText(key, value)}, ${where}.`;
  if (!yours) return saved;
  const loss = Math.round(yours.profit * 100) < 0 ? ' loss' : '';
  const be = Number.isFinite(yours.be) ? `, break\u2011even ${perKgText(yours.be)} a${NB}kg` : '';
  return `${saved} Now ${moneyText(yours.profit)} a${NB}month${loss}${be}.`;
}

// A figure the owner typed or set that is allowed but unlikely (the audit, #6; DESIGN's check): outside its research
// range, or under half or over twice the real figure (your runs', the simulator's, Settings'). → the warning's words, or
// null. "Unusual: research gives RM 30.00–70.00 a kg; your runs give RM 48.00 a kg."
const GIVE = { runs: 'your runs give', simulator: 'the simulator gives', settings: 'Settings gives' };
export function likely(f, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const real = f.source === 'owner' ? f.real : GIVE[f.source] ? { source: f.source, value: f.value } : null;
  const r = f.research;
  const outside = r ? value < r.low || value > r.high : false;
  const far = real && real.value > 0 ? value < real.value / 2 || value > real.value * 2 : false;
  if (!outside && !far) return null;
  const who = f.key === 'yours.blocks' && f.runs?.from === 'crop' && real?.source === 'runs' ? 'the Crop tab gives' : GIVE[real?.source];
  const parts = [
    r ? `research gives ${rangeText(f.key, r.low, r.high)}` : null,
    real ? `${who} ${figureText(f.key, real.value)}` : null,
  ].filter(Boolean);
  return `Unusual: ${parts.join('; ')}.`;
}

// A note's sources as links (the audit, #15): one link a page (two ids of one address, its #part aside, are one), and two
// pages of one name told apart ("Shroomy 2026", "Shroomy 2026 (2)"). → [{ words, url (null: no link) }].
export function sourceItems(sources) {
  const pages = new Set();
  const named = new Map();
  const out = [];
  for (const s of sources) {
    const page = s.url ? s.url.split('#')[0] : null;
    if (page && pages.has(page)) continue;
    if (page) pages.add(page);
    const words = [s.title, s.year].filter(Boolean).join(NB);
    const n = (named.get(words) ?? 0) + 1;
    named.set(words, n);
    out.push({ words: n > 1 ? `${words}${NB}(${n})` : words, url: s.url ?? null });
  }
  return out;
}

// The warning at the top of Figures when a part was not read (spec 9.2), or null.
export function partsLine(errors) {
  const parts = Object.keys(errors ?? {}).filter((p) => PART_NAMES[p]).map((p) => PART_NAMES[p]);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return parts.length ? `Couldn't read ${list} just now${DOT}trying again every minute` : null;
}

// The figures as the page holds them while the owner types (spec 8.5, 9.1): the last reply's, with each box's last valid
// figure over it until it is saved, put back or refused; a box whose text is not a figure keeps its last valid one in the
// sums and its refusal. A new reply keeps what is typed. → { use(reply), type(key, text), drop(key, value), error(key),
// unsaved(key), values(), results() }.
export function createDraft() {
  let figures = [];
  let ways = ['yours'];
  let room;
  let crop;
  const typedValues = {};
  const errors = {};
  return {
    use(reply) {
      // Another room or crop: what was typed belongs to the one before.
      if (reply.room?.id !== room || reply.crop !== crop) {
        for (const key of Object.keys(typedValues)) delete typedValues[key];
        for (const key of Object.keys(errors)) delete errors[key];
      }
      room = reply.room?.id;
      crop = reply.crop;
      figures = reply.figures;
      ways = reply.ways;
    },
    type(key, text) {
      const t = typed(key, text);
      if ('value' in t) {
        typedValues[key] = t.value;
        delete errors[key];
      } else {
        errors[key] = t.error;
      }
      return t;
    },
    // With the value that was saved, only that one goes (the owner may have typed another since); without, any (Back to default).
    drop(key, value) {
      if (value !== undefined && typedValues[key] !== value) return;
      delete typedValues[key];
      delete errors[key];
    },
    error: (key) => errors[key] ?? null,
    unsaved: (key) => key in typedValues,
    values: () => valuesOf(figures, typedValues),
    results() {
      return figures.length ? compare(valuesOf(figures, typedValues), ways) : [];
    },
  };
}

// ---- The page's replies and boxes (spec 9.1) ----
// A reply fits the room and crop the page wants (null: the server's choice). want: { room, crop }.
export const fitsWant = (reply, want) => (want.room == null || reply.room?.id === want.room) && (want.crop == null || reply.crop === want.crop);

// Which reply the page paints (spec 9.1, "A stale answer: dropped"): a read asked before the last save, Back to default or
// Work it out is older than that action's reply; an action's reply older than one already painted (actions answered out of
// order) is dropped; so is a reply for a room or crop no longer wanted; the same answer as the last painted paints nothing.
// → { act() → the action's number, asked() (a read notes it when sent), take(reply, want, { asked } or { act })
// → 'drop' | 'same' | 'new' }.
export function createReplies() {
  let acts = 0;
  let paintedAct = 0; // the newest action whose reply was taken
  let painted = '';
  return {
    act() {
      acts += 1;
      return acts;
    },
    asked: () => acts,
    take(reply, want, { asked = null, act = null } = {}) {
      if (asked !== null && asked !== acts) return 'drop';
      if (act !== null && act < paintedAct) return 'drop';
      if (!fitsWant(reply, want)) return 'drop';
      if (act !== null) paintedAct = act;
      const key = JSON.stringify(reply);
      if (key === painted) return 'same';
      painted = key;
      return 'new';
    },
  };
}

// A repaint leaves a box's text alone while the owner is in it, while it holds a figure not yet saved, or while its figure
// is refused (the draft's check or the server's): the box keeps the text its refusal is about.
export const keepsBox = ({ focused, unsaved, refused }) => focused || unsaved || refused;

// Whether Work it out's run moved on between two replies (it started, ended, failed or was worked out again): a refusal
// of the run before ("Already working it out…", no answer) is then old. Its progress alone is not a move.
export const simMoved = (before, after) => (before?.status ?? null) !== (after?.status ?? null) || (before?.at ?? null) !== (after?.at ?? null);

// A note's link's focus key (business-page.js keepFocus reads data-focus-key): scoped to its row, its line and its place,
// since a source is cited by many rows and its address and words would find another row's.
export const noteLinkKey = (key, line, i) => `note:${key}:${line}:${i}`;
// Where the cursor goes after a repaint took it out of its figure's row (a research note's source link that a save turned
// into "You set"; Work it out's button gone once the run started): null to leave keepFocus's choice (it was not in a row,
// the row was rebuilt, or it is still in it), else 'sim' (Work it out's line, when it was there: never a box, whose
// keyboard would open on a phone), 'back' (the row's Back to default) or 'box'. Never the page's title.
export const focusAfterRepaint = ({ inRow, rowKept, stillInRow, hasBack, inSim = false }) => (
  !inRow || !rowKept || stillInRow ? null : inSim ? 'sim' : hasBack ? 'back' : 'box');
