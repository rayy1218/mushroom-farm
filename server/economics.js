// The Economics page's service (spec 2026-11-06-economics-design.md 4, 6 and 7): every figure of a room and crop with where
// it comes from (You set, Your runs, Simulator, Settings, Research), the owner's figures saved and cleared, and Work it out
// (one of the room's simulations, queued through simulations.start) settled from the 'simulation' events. No money is worked
// out here: the page does it with web/economics-model.js. No HTTP.
//   createEconomics({ db, harvests, batches, simulations, events, now, zone, log, days }) → { view, setFigure, clearFigure,
//   workOut, close }

import { readSettings, readCropYield } from './settings.js';
import { roomDays, localZone } from './usage.js';
import { yourRuns } from './economics-runs.js';
import { simBody, simFigure, DELETED_TEXT } from './economics-sim.js';
import { SIM_KEY } from './db.js';
import {
  ECONOMICS_CROPS, WAYS, LEFT, figureOf, figuresFor, placeOf, checkFigure, researchOf, sizeOf,
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
  'yours.yieldG': ['harvest'], 'yours.loss': ['harvest'], 'yours.blocks': ['harvest'],
  price: ['harvest', 'sales'], blockPrice: ['harvest', 'batches'], 'yours.kwhBlock': ['harvest', 'energy'],
};
// The figures Your runs may give; the rest are You set › Research (price also Settings).
const FROM_RUNS = new Set(Object.keys(PARTS_OF));

// The sources under You set of figure f, the first first (spec 4.3): Settings' electricity price; Your runs (a loss only
// when the yield is from your runs too); the simulator's; Settings' expected price; Research. actual: Your runs' figure, if
// any; yieldFrom: where the yield comes from; sim: the simulator row, if any; expected: Settings' price a kg of the crop.
function sourcesBelow(f, { actual, yieldFrom, sim, electricityPrice, expected, research }) {
  const below = [];
  if (f.settings) below.push({ value: electricityPrice, source: 'settings' });
  if (typeof actual?.value === 'number' && (f.key !== 'yours.loss' || yieldFrom === 'runs')) below.push({ value: actual.value, source: 'runs' });
  if (f.key === SIM_KEY && typeof sim?.value === 'number') below.push({ value: sim.value, source: 'simulator' });
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
    const { figures: runs, errors } = yourRuns({ db, harvests, batches, days, room, crop, today: zone.label(now()), zone, log });
    const size = { volume: room.volume, humidifierLH: room.humidifierLH };
    // the yield's source as its chain gives it (the loss's rule needs it)
    const yieldFrom = owner.has('yours.yieldG') ? 'owner' : typeof runs['yours.yieldG']?.value === 'number' ? 'runs' : 'research';
    const entryOf = (f, blocks) => {
      const research = researchOf(f.key, crop, size, blocks);
      const actual = FROM_RUNS.has(f.key) ? runs[f.key] : undefined;
      const below = sourcesBelow(f, { actual, yieldFrom, sim, electricityPrice, expected, research });
      const own = f.settings ? undefined : owner.get(f.key);
      const used = own ? { value: own.value, source: 'owner' } : below[0];
      const notes = [];
      if (actual?.pending) notes.push('pending');
      for (const part of PARTS_OF[f.key] ?? []) if (errors[part]) notes.push(`not-read:${part}`);
      if (f.key === 'yours.loss' && used.source === 'runs') notes.push('loss-in-yield');
      if (f.key === 'yours.loss' && own && yieldFrom === 'runs') notes.push('loss-twice');
      return {
        key: f.key, way: f.way, scope: f.scope, value: used.value, source: used.source,
        at: used.source === 'owner' ? own.at : used.source === 'simulator' ? sim.at : null,
        real: own && below[0].source !== 'research' ? below[0] : null, research, runs: actual?.runs ?? null, notes,
      };
    };
    const blocks = entryOf(figureOf('yours.blocks'));
    const figures = figuresFor(crop).map((f) => (f.key === 'yours.blocks' ? blocks : entryOf(f, blocks.value)));
    return { figures, errors, values: Object.fromEntries(figures.map((f) => [f.key, f.value])), sim };
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
      return { rooms: [], room: null, crop: c, ways: WAYS[c], left: LEFT[c], figures: [], sim: null, machinesNote: null, errors: {} };
    }
    const r = room === null ? rooms[0] : rooms.find((x) => x.id === room);
    if (!r) throw new EconomicsError(404, 'Room not found');
    const c = crop ?? cropOf(db, r.id);
    settleWorking((row) => row.roomId === r.id && row.crop === c); // a run deleted meanwhile, or an event missed
    const { figures, errors, sim } = figuresOf(r, c);
    const lastRun = db.listRuns(r.id, 1)[0] ?? null;
    return {
      rooms: rooms.map(({ id, name }) => ({ id, name })),
      room: { id: r.id, name: r.name, volume: r.volume, size: sizeOf(r), humidifierLH: r.humidifierLH },
      crop: c, ways: WAYS[c], left: LEFT[c], figures, sim: simView(sim),
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
