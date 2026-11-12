// The Economics page's service (spec 2026-11-06-economics-design.md 4, 6 and 7): every figure of a room and crop with where
// it comes from (You set, Your runs, Simulator, Settings, Research), the owner's figures saved and cleared, and Work it out
// (one of the room's simulations, queued through simulations.start) settled from the 'simulation' events. No money is worked
// out here: the page does it with web/economics-model.js. No HTTP.
//   createEconomics({ db, harvests, batches, simulations, events, now, zone, log, days }) → { view, setFigure, clearFigure,
//   workOut, close }

import { readSettings, readCropYield } from './settings.js';
import { roomDays, localZone } from './usage.js';
import { yourRuns, yourSales } from './economics-runs.js';
import { simBody, simFigure, DELETED_TEXT } from './economics-sim.js';
import { SIM_KEY } from './db.js';
import {
  ECONOMICS_CROPS, WAYS, LEFT, figureOf, figuresFor, placeOf, checkFigure, researchOf, sizeOf, PART_KEYS, EQUIPMENT_KEYS,
} from '../web/economics-defaults.js';
import { cropShortName } from '../web/crops.js';
import { blockLife, inputsOf } from '../web/economics-model.js';

// A refused request: status 400, 404 or 409, field the input it is about (the routes reply { error, field }).
export class EconomicsError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'EconomicsError';
    this.status = status;
    this.field = field;
  }
}

export const DEFAULT_CROP = 'lionsmane'; // the farm's main target (PRODUCT.md)
// The parts each figure's Your runs read (a part not read: its note, the figure from the next source).
const PARTS_OF = {
  'yours.yieldG': ['harvest', 'batches'], 'yours.loss': ['harvest', 'batches'], 'yours.blocks': ['harvest'],
  price: ['harvest', 'sales'], blockPrice: ['harvest', 'batches'], 'yours.kwhBlock': ['harvest', 'energy'],
  'yours.workers': ['costs'], 'yours.workerMonth': ['costs'], // ---- Money truth ----
  ...Object.fromEntries(EQUIPMENT_KEYS.map((k) => [k, ['costs']])),
};
// ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 8.1, 9 and 6.3) the price off your sales by more than this
// is flagged; the figures your costs give (Costs' monthly labour items, the equipment register).
export const PRICE_FLAG = 0.25;
const FROM_COSTS = new Set(['yours.workers', 'yours.workerMonth', ...EQUIPMENT_KEYS]);

// The farm's labour as Costs has it: the base wages charging this month (its monthly labour items), by worker. → { workers:
// { value, runs }, workerMonth: { value, runs } } or {} with none. runs: { names, total }.
function labourOf(db, month) {
  const items = db.listCosts().filter((c) => c.category === 'labour' && c.repeat === 'monthly' && c.date.slice(0, 7) <= month
    && (c.repeatUntil === null || c.repeatUntil >= month));
  if (!items.length) return {};
  // a worker by name; an item with no name a worker of its own (two unnamed wages are two people)
  const keys = new Set(items.map((c) => c.worker ?? `#${c.id}`));
  const names = [...keys].filter((k) => !k.startsWith('#'));
  const total = Math.round(items.reduce((a, c) => a + c.amount, 0) * 100) / 100;
  const runs = { names, unnamed: keys.size - names.length, total, items: items.length };
  return {
    'yours.workers': { value: keys.size, runs },
    'yours.workerMonth': { value: Math.round((total / keys.size) * 100) / 100, runs },
  };
}

// The room's equipment register (Costs): the figures of the parts it has items for ({ [key]: { value, runs: { items: [{ name,
// amount }] } } }: a part with none keeps its next source), each part's RM, the total and the write-off a month (Σ each item's
// (RM − resale) ÷ its months, floored to the sen as Costs charges it: the planning figure, not this month's charge); null with
// no item.
function registerOf(db, roomId) {
  const items = db.listEquipment().filter((e) => e.roomId === roomId);
  if (!items.length) return null;
  const figures = {};
  for (const e of items) {
    const key = PART_KEYS[e.part] ?? PART_KEYS.other;
    figures[key] ??= { value: 0, runs: { items: [] } };
    figures[key].value = Math.round((figures[key].value + e.amount) * 100) / 100;
    figures[key].runs.items.push({ name: e.name, amount: e.amount });
  }
  const monthly = (e) => Math.floor(((e.amount - e.resale) / e.lifeMonths) * 100 + 1e-9) / 100;
  return {
    figures, parts: Object.fromEntries(Object.entries(figures).map(([k, f]) => [k, f.value])),
    total: Math.round(items.reduce((a, e) => a + e.amount, 0) * 100) / 100,
    writeOffMonth: Math.round(items.reduce((a, e) => a + monthly(e), 0) * 100) / 100, count: items.length,
  };
}
// The figures Your runs may give; the rest are You set › Research (price also Settings).
const FROM_RUNS = new Set(Object.keys(PARTS_OF));

// The sources under You set of figure f, the first first (spec 4.3): Settings' electricity price; Your runs (a loss only
// when the yield is from your runs too); your costs (Money truth: Costs' labour items, the equipment register); the
// simulator's; Your sales (the crop's last 90 days); Settings' expected price; Research. actual: Your runs' figure, if any;
// costs: your costs' figure; yieldFrom: where the yield comes from; sim: the simulator row, if any; sales: Your sales;
// expected: Settings' price a kg of the crop.
function sourcesBelow(f, { actual, costs, yieldFrom, sim, electricityPrice, expected, sales, research }) {
  const below = [];
  if (f.settings) below.push({ value: electricityPrice, source: 'settings' });
  if (typeof actual?.value === 'number' && (f.key !== 'yours.loss' || yieldFrom === 'runs')) below.push({ value: actual.value, source: 'runs' });
  // ---- Money truth ---- the equipment register's (Costs), Costs' labour items; Your sales ahead of Settings' price
  if (typeof costs?.value === 'number') below.push({ value: costs.value, source: EQUIPMENT_KEYS.includes(f.key) ? 'register' : 'costs' });
  if (f.key === SIM_KEY && typeof sim?.value === 'number') below.push({ value: sim.value, source: 'simulator' });
  if (f.key === 'price' && typeof sales?.value === 'number') below.push({ value: sales.value, source: 'sales' });
  if (f.key === 'price' && typeof expected === 'number') below.push({ value: expected, source: 'settings' });
  below.push({ value: research.value, source: 'research' });
  return below;
}

// The room's main crop now (the most blocks, the first on a tie) when it is one of the four, else lion's mane.
function cropOf(db, roomId) {
  const crops = db.getProgram(roomId)?.crops ?? [];
  const main = crops.reduce((best, c) => (!best || c.blocks > best.blocks ? c : best), null)?.crop;
  return ECONOMICS_CROPS.includes(main) ? main : DEFAULT_CROP;
}

export function createEconomics({
  db, harvests, batches, simulations = null, events = null, now = Date.now, zone = localZone, log = console.error,
  days = (room, count) => roomDays(db, room, { now: now(), zone, count, cachedOnly: true }),
}) {
  // 'roomId/crop' → { simId, life }: the block life its Work it out was started for (the kWh is scaled to it). Kept by room
  // and crop, not by run: a deleted run's id is given to the next run (in any room), which may be another Work it out's.
  const lives = new Map();
  const lifeKey = (roomId, crop) => `${roomId}/${crop}`;
  const publish = (roomId, crop) => events?.publish('economics', { roomId, crop });

  // The run a row works on, or null when it is gone: deleted, or its id since given to a run of another room or a later one.
  function runOfRow(row) {
    const run = row.simId === null ? null : db.getRun(row.simId, { withResult: false });
    return run && run.roomId === row.roomId && run.createdAt <= row.startedAt ? run : null;
  }

  // A row working on a run that has ended (or gone): its figure saved, or its failure with the figure before it kept.
  // → true when it settled.
  function settleFrom(row) {
    const run = runOfRow(row);
    const where = { roomId: row.roomId, crop: row.crop };
    if (run && run.status !== 'done' && run.status !== 'failed') return false;
    if (!run) db.settleEconomicsSim({ ...where, error: DELETED_TEXT });
    else if (run.status === 'failed') db.settleEconomicsSim({ ...where, error: run.error ?? 'The simulation failed' });
    else {
      const own = lives.get(lifeKey(row.roomId, row.crop));
      const figure = simFigure(run, own?.simId === run.id ? own.life : undefined);
      if (figure) db.settleEconomicsSim({ ...where, ...figure, at: run.finishedAt ?? now() });
      else db.settleEconomicsSim({ ...where, error: 'The simulation gave no electricity' });
    }
    if (lives.get(lifeKey(row.roomId, row.crop))?.simId === row.simId) lives.delete(lifeKey(row.roomId, row.crop));
    publish(row.roomId, row.crop);
    return true;
  }
  const settleWorking = (match = () => true) => {
    for (const row of db.economicsSimsWorking()) {
      if (!match(row)) continue;
      try {
        settleFrom(row);
      } catch (err) {
        log(err);
      }
    }
  };
  // A restart: every row still working is settled from its run (Simulate fails the unfinished runs as it starts).
  settleWorking();
  const stopListening = events ? events.subscribe((type, data) => {
    if (type === 'simulation' && (data?.status === 'done' || data?.status === 'failed')) settleWorking((row) => row.simId === data.id);
  }) : () => {};

  function roomOf(id) {
    const room = Number.isInteger(id) ? db.getRoom(id) : null;
    if (!room) throw new EconomicsError(404, 'Room not found');
    return room;
  }
  function cropCheck(crop) {
    if (!ECONOMICS_CROPS.includes(crop)) throw new EconomicsError(400, 'Pick a crop', 'crop');
    return crop;
  }
  function keyCheck(key, crop) {
    const f = figureOf(key);
    if (!f || !figuresFor(crop).includes(f)) throw new EconomicsError(400, 'Unknown figure', 'key');
    if (f.settings) throw new EconomicsError(400, `${f.label} is set in Settings`, 'key');
    return f;
  }

  // Every figure of the room and crop (spec 4.3 and 7.2) in figuresFor's order, Your container's blocks worked out first
  // (the racks' default follows them).
  function figuresOf(room, crop) {
    const rows = db.economicsFigures(room.id, crop);
    const owner = new Map(rows.filter((r) => r.source === 'owner').map((r) => [r.key, r]));
    const sim = rows.find((r) => r.source === 'simulator' && r.key === SIM_KEY) ?? null;
    const { electricityPrice } = readSettings(db);
    const expected = readCropYield(db)[crop]?.priceKg;
    const today = zone.label(now());
    const { figures: runs, errors } = yourRuns({ db, harvests, batches, days, room, crop, today, zone, log });
    // ---- Money truth ---- Your sales, Costs' labour items and the room's equipment register, each read on its own
    const part = (name, fn) => {
      try {
        return fn();
      } catch (err) {
        log(`Economics: couldn't read ${name}:`, err);
        errors[name] = 'Something went wrong';
        return null;
      }
    };
    const sales = part('sales', () => yourSales({ db, crop, today, zone }));
    const register = part('costs', () => registerOf(db, room.id));
    const costs = { ...(part('costs', () => labourOf(db, today.slice(0, 7))) ?? {}), ...(register?.figures ?? {}) };
    const size = { volume: room.volume, humidifierLH: room.humidifierLH, type: room.roomType, length: room.length, width: room.width, height: room.height };
    // the yield's source as its chain gives it (the loss's rule needs it)
    const yieldFrom = owner.has('yours.yieldG') ? 'owner' : typeof runs['yours.yieldG']?.value === 'number' ? 'runs' : 'research';
    const entryOf = (f, blocks) => {
      const research = researchOf(f.key, crop, size, blocks);
      const actual = FROM_RUNS.has(f.key) ? runs[f.key] : undefined;
      const fromCosts = FROM_COSTS.has(f.key) ? costs[f.key] : undefined;
      const below = sourcesBelow(f, { actual, costs: fromCosts, yieldFrom, sim, electricityPrice, expected, sales, research });
      const own = f.settings ? undefined : owner.get(f.key);
      const used = own ? { value: own.value, source: 'owner' } : below[0];
      const notes = [];
      if (actual?.pending) notes.push('pending');
      for (const p of PARTS_OF[f.key] ?? []) if (errors[p] && (p !== 'sales' || f.key === 'price')) notes.push(`not-read:${p}`);
      const measured = runs['yours.loss']?.runs?.measured === true; // the loss from Batches' checks, the yield per good block
      if (f.key === 'yours.loss' && used.source === 'runs' && !measured) notes.push('loss-in-yield');
      if (f.key === 'yours.loss' && own && yieldFrom === 'runs' && !measured) notes.push('loss-twice');
      // the price: what your sales got beside it, and a flag when the price used (yours or Settings') is far off it
      const realised = f.key === 'price' && sales ? { value: sales.value, ...sales.runs } : null;
      if (realised && (used.source === 'owner' || used.source === 'settings') && realised.value > 0
        && Math.abs(used.value - realised.value) / realised.value > PRICE_FLAG) notes.push('price-off');
      // the room has a register but not this part: its figure comes from the next source, and says so
      if (register && EQUIPMENT_KEYS.includes(f.key) && !register.parts[f.key]) notes.push('not-in-register');
      const runsOf = used.source === 'sales' ? sales.runs : used.source === 'costs' || used.source === 'register' ? fromCosts.runs : actual?.runs ?? null;
      return {
        key: f.key, way: f.way, scope: f.scope, value: used.value, source: used.source,
        at: used.source === 'owner' ? own.at : used.source === 'simulator' ? sim.at : null,
        real: own && below[0].source !== 'research' ? below[0] : null, research, runs: runsOf, notes,
        ...(f.key === 'price' ? { realised } : {}),
      };
    };
    const blocks = entryOf(figureOf('yours.blocks'));
    const figures = figuresFor(crop).map((f) => (f.key === 'yours.blocks' ? blocks : entryOf(f, blocks.value)));
    // ---- Money truth ---- what the model reads beside the figures: every other room's blocks now (the workers are shared
    // by blocks) and the register's parts, total and month (its write-off while those parts are the register's)
    const otherBlocks = db.listRooms().filter((r) => r.id !== room.id)
      .reduce((a, r) => a + (db.getProgram(r.id)?.crops ?? []).reduce((b, c) => b + c.blocks, 0), 0);
    const context = {
      otherBlocks, register: register ? { total: register.total, writeOffMonth: register.writeOffMonth, count: register.count, parts: register.parts } : null,
    };
    return { figures, errors, values: Object.fromEntries(figures.map((f) => [f.key, f.value])), sim, context };
  }

  // The simulator row as the page shows it: waiting while its run is queued, the run's progress while it works.
  function simView(row) {
    if (!row) return null;
    const run = row.status === 'working' ? runOfRow(row) : null;
    return {
      status: run?.status === 'queued' ? 'waiting' : row.status, simId: row.simId, progress: run ? run.progress : null,
      startedAt: row.startedAt, at: row.at, value: row.value, kwh: row.kwh, blocks: row.blocks, days: row.days, error: row.error,
    };
  }

  // GET /api/economics: room and crop null for the first room and its main crop.
  function view({ room = null, crop = null } = {}) {
    if (crop !== null) cropCheck(crop);
    const rooms = db.listRooms();
    if (!rooms.length) {
      if (room !== null) throw new EconomicsError(404, 'Room not found'); // spec 7.1, with no rooms too: the page asks again without it
      const c = crop ?? DEFAULT_CROP;
      return { rooms: [], room: null, crop: c, ways: WAYS[c], left: LEFT[c], figures: [], context: { otherBlocks: 0, register: null }, sim: null, machinesNote: null, errors: {} };
    }
    const r = room === null ? rooms[0] : rooms.find((x) => x.id === room);
    if (!r) throw new EconomicsError(404, 'Room not found');
    const c = crop ?? cropOf(db, r.id);
    settleWorking((row) => row.roomId === r.id && row.crop === c); // a run deleted meanwhile, or an event missed
    const { figures, errors, sim, context } = figuresOf(r, c);
    const lastRun = db.listRuns(r.id, 1)[0] ?? null;
    return {
      rooms: rooms.map(({ id, name }) => ({ id, name })),
      room: { id: r.id, name: r.name, volume: r.volume, size: sizeOf(r), humidifierLH: r.humidifierLH, type: r.roomType ?? 'container' },
      crop: c, ways: WAYS[c], left: LEFT[c], figures, context, sim: simView(sim),
      machinesNote: simBody({ room: r, lastRun, crop: c, blocks: 1, life: 1 }).machinesNote,
      errors,
    };
  }

  return {
    view,

    // PUT /api/economics/figures { room, crop, key, value }: the owner's figure, saved where its scope says. → the view.
    setFigure(body) {
      const { room, crop, key, value } = body ?? {};
      const r = roomOf(room);
      const c = cropCheck(crop);
      keyCheck(key, c);
      const refused = checkFigure(key, value);
      if (refused) throw new EconomicsError(400, refused, 'value');
      db.setEconomicsFigure({ ...placeOf(key, r.id, c), key, value, at: now() });
      publish(r.id, c);
      return view({ room: r.id, crop: c });
    },

    // DELETE /api/economics/figures: the owner's figure gone (nothing set: as it was). → the view.
    clearFigure(body) {
      const { room, crop, key } = body ?? {};
      const r = roomOf(room);
      const c = cropCheck(crop);
      keyCheck(key, c);
      if (db.clearEconomicsFigure({ ...placeOf(key, r.id, c), key })) publish(r.id, c);
      return view({ room: r.id, crop: c });
    },

    // POST /api/economics/work-out { room, crop }: the room's simulation with the crop over one block life, queued.
    // → { status: 202, view } (working), or 200 with the failure when the simulation's checks refuse the body.
    workOut(body) {
      if (!simulations) throw new EconomicsError(404, 'Not found');
      const { room, crop } = body ?? {};
      const r = roomOf(room);
      const c = cropCheck(crop);
      settleWorking((row) => row.roomId === r.id && row.crop === c); // a run cancelled or its event missed
      if (db.economicsSimsWorking().some((row) => row.roomId === r.id && row.crop === c)) {
        throw new EconomicsError(409, `Already working it out for ${r.name} and ${cropShortName(c)}`);
      }
      const { values } = figuresOf(r, c);
      const life = blockLife(inputsOf(values, 'yours'));
      const { body: input } = simBody({ room: r, lastRun: db.listRuns(r.id, 1)[0] ?? null, crop: c, blocks: values['yours.blocks'], life, now: now() });
      const result = simulations.start(r.id, input);
      if (result.error && result.conflict) throw new EconomicsError(409, result.error);
      const where = { roomId: r.id, crop: c };
      if (result.error) {
        db.startEconomicsSim({ ...where, simId: null, at: now() });
        db.settleEconomicsSim({ ...where, error: result.error });
        publish(r.id, c);
        return { status: 200, view: view({ room: r.id, crop: c }) };
      }
      lives.set(lifeKey(r.id, c), { simId: result.run.id, life });
      // never before its run was made (a clock behind the simulations' would read the run as a later one, gone)
      const row = db.startEconomicsSim({ ...where, simId: result.run.id, at: Math.max(now(), result.run.createdAt) });
      publish(r.id, c);
      settleFrom(row); // a run that ended inside start (its worker could not spawn; its event came before the row) is settled now
      return { status: 202, view: view({ room: r.id, crop: c }) };
    },

    close() {
      stopListening();
    },
  };
}
