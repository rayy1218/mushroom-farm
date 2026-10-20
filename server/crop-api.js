// The crops and stage program of a live room (spec 2026-10-20-crops-and-simulation-design.md 3.3): the reply and the change.

import { CommandError } from './machines.js';
import { mixBands, rangeWarnings } from '../web/crops.js';
import { validateProgram, nextStage, stageEndsAt, startStage, FIRST_STAGE } from './program.js';

// db: the farm database. now is injectable.
export function createCropApi({ db, now = Date.now }) {
  // The program as the routes show it.
  function view(roomId) {
    const p = db.getProgram(roomId);
    const next = nextStage(p);
    const at = stageEndsAt(p);
    let targets = null;
    if (p.crops.length > 0) {
      const mixed = mixBands(p.crops, p.stage);
      targets = { bands: mixed.bands, warnings: [...mixed.warnings, ...rangeWarnings(p.crops, mixed.bands, p.stage)] };
    }
    return {
      crops: p.crops, farmType: p.farmType, stage: p.stage, stageSince: p.stageSince, flush: p.flush, flushes: p.flushes, days: p.days,
      rampH: p.rampH, autoAdvance: p.autoAdvance, done: p.done,
      ramp: p.ramp ? { to: p.ramp.to, endAt: p.ramp.endAt } : null,
      nextStage: at === null ? null : { stage: next.stage, flush: next.flush, at },
      targets,
    };
  }

  return {
    // The reply for a room (null: no such room).
    get(roomId) {
      return db.getRoom(roomId) ? view(roomId) : null;
    },

    // Applies any of crops, farmType, stage, flushes, days (per stage), rampH, autoAdvance and applyNow; returns the reply.
    // Throws CommandError (400, with field) for a bad value. Returns null when there is no such room.
    put(roomId, body) {
      if (!db.getRoom(roomId)) return null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new CommandError(400, 'Body must be a JSON object');
      const was = db.getProgram(roomId);
      const next = { ...was };
      for (const key of ['crops', 'farmType', 'stage', 'flushes', 'rampH', 'autoAdvance']) if (key in body) next[key] = body[key];
      if ('days' in body) next.days = body.days !== null && typeof body.days === 'object' && !Array.isArray(body.days) ? { ...was.days, ...body.days } : body.days;
      // Crops set again on a done room are new blocks: flush 1 from the farm type's first stage (unless a stage is given).
      const newBlocks = was.done && 'crops' in body && Array.isArray(body.crops) && body.crops.length > 0;
      if (newBlocks) {
        next.flush = 1;
        next.done = false;
        if (!('stage' in body)) next.stage = FIRST_STAGE[next.farmType] ?? 'fruiting';
      } else if (was.done && 'flushes' in body && Number.isInteger(body.flushes) && body.flushes > was.flush) {
        next.done = false; // more flushes: the rest goes on to the next fruiting
      }
      if (Number.isInteger(next.flushes) && next.flushes < next.flush && !newBlocks) {
        throw new CommandError(400, `Flushes must be at least the present flush (${next.flush})`, 'flushes');
      }
      const bad = validateProgram(next);
      if (bad) throw new CommandError(400, bad.error, bad.field);

      let program = next;
      if (next.crops.length === 0) {
        if ('crops' in body) program = { ...next, ramp: null }; // the bands stay as they are
      } else if ('stage' in body || was.crops.length === 0 || newBlocks) {
        const control = db.getControl(roomId);
        program = startStage(next, next.stage, now(), control, { ramp: body.applyNow !== true });
        // At once: the controller writes a ramp each cycle, but a stage without one is written now.
        if (program.ramp.endAt === program.stageSince) db.setControl(roomId, { ...control, ...program.ramp.to });
      }
      db.setProgram(roomId, program);
      return view(roomId);
    },
  };
}
