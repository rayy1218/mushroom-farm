// Simulation runs as background jobs (spec 2026-10-20-crops-and-simulation-design.md 4.2 and 4.4): validates a request, stores
// the run, runs one at a time in a worker thread (the others stay 'queued') and stores progress, summary and result.

import { Worker } from 'node:worker_threads';
import { PARAMS, outdoorProblem } from '../device/sim-store.js';
import { FARM_TYPES, validateCrops } from '../web/crops.js';
import { readSettings } from './settings.js';

const PHYSICS = ['wallUA', 'outdoorHigh', 'outdoorLow', 'outdoorDew', 'sunW', 'fanFlow', 'acBTU', 'humidifierLH'];
const RATING_FIELDS = ['intakeW', 'exhaustW', 'circulationW', 'humidifierW', 'humidifierLH', 'acInputW'];
const CONTROL_FIELDS = ['exchangeMaxMin', 'acDrop', 'exchangeEveryMin', 'humidifierDuringExchange', 'acFan'];
const MAX_UNFINISHED = 5; // queued or running runs of one room
export const RESTART_TEXT = 'Stopped by a restart of the farm app';

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// Checks a request body { physics, crops, farmType, stage, days }. → { input } (only the known fields) or { error, field }.
export function validateSimulation(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { error: 'Body must be a JSON object' };
  const { physics, crops, farmType, stage, days } = body;
  if (physics === null || typeof physics !== 'object' || Array.isArray(physics)) return { error: 'Physics must be an object', field: 'physics' };
  const clean = {};
  for (const field of PHYSICS) {
    const { min, max, whole, label, unit } = PARAMS[field];
    const v = physics[field];
    if (!isNumber(v) || v < min || v > max || (whole && !Number.isInteger(v))) {
      return { error: `${label} must be ${whole ? 'a whole number' : 'a number'} from ${min} to ${max}${unit ? ` ${unit}` : ''}`, field: `physics.${field}` };
    }
    clean[field] = v;
  }
  const clash = outdoorProblem(clean);
  if (clash) return { error: clash.message, field: `physics.${clash.field}` };
  const badCrops = validateCrops(crops);
  if (badCrops) return badCrops;
  if (!(typeof farmType === 'string' && Object.hasOwn(FARM_TYPES, farmType))) return { error: 'Farm type must be ready or full', field: 'farmType' };
  const stages = FARM_TYPES[farmType].stages;
  if (!stages.includes(stage)) return { error: `Stage must be one of ${stages.join(', ')}`, field: 'stage' };
  if (!Number.isInteger(days) || days < 1 || days > 90) return { error: 'Days must be a whole number from 1 to 90', field: 'days' };
  return { input: { physics: clean, crops: crops.map(({ crop, blocks }) => ({ crop, blocks })), farmType, stage, days } };
}

// The default way to run a job: a worker thread. job: { input, ctx }; handlers: { onProgress(share), onDone(result),
// onError(message) }, always called after spawn has returned. → { stop() }.
export function spawnWorker(job, { onProgress, onDone, onError }) {
  const worker = new Worker(new URL('./simulate-worker.js', import.meta.url), { workerData: job });
  let finished = false;
  worker.on('message', (m) => {
    if (m.type === 'progress') return onProgress(m.share);
    finished = true;
    if (m.type === 'done') onDone(m.result);
    else onError(m.message);
  });
  worker.on('error', (err) => {
    finished = true;
    onError(err.message);
  });
  worker.on('exit', (code) => {
    if (!finished) onError(`The simulation worker stopped (exit code ${code})`);
  });
  return { stop: () => { finished = true; worker.terminate(); } };
}

// db: the farm database. now: injectable clock. spawn: how a job runs (tests pass an in-process one).
export function createSimulations({ db, now = Date.now, spawn = spawnWorker }) {
  const queue = []; // { id, job }
  let current = null; // { id, handle, stored }
  db.failUnfinishedRuns(RESTART_TEXT, now());

  // What the run needs from the room as it is now; stored with the run so the result shows what was used.
  function contextOf(roomId) {
    const room = db.getRoom(roomId);
    const control = db.getControl(roomId);
    const program = db.getProgram(roomId);
    const { electricityPrice, waterPrice } = readSettings(db);
    return {
      volume: room.volume,
      ratings: Object.fromEntries(RATING_FIELDS.map((f) => [f, room[f]])),
      control: Object.fromEntries(CONTROL_FIELDS.map((f) => [f, control[f]])),
      program: { flushes: program.flushes, days: program.days, rampH: program.rampH },
      prices: { electricity: electricityPrice, water: waterPrice },
    };
  }

  function pump() {
    while (!current && queue.length > 0) {
      const { id, roomId, job } = queue.shift();
      if (!db.setRunProgress(id, 'running', 0)) continue; // the run is gone (its room was deleted)
      const entry = { id, roomId, handle: null, stored: 0 };
      current = entry;
      const finish = (outcome) => {
        if (current !== entry) return; // cancelled meanwhile
        current = null;
        db.finishRun(id, outcome, now());
        pump();
      };
      try {
        entry.handle = spawn(job, {
          onProgress(share) {
            if (current !== entry) return;
            const percent = Math.round(share * 100);
            if (percent <= Math.round(entry.stored * 100)) return;
            entry.stored = share;
            if (!db.setRunProgress(id, 'running', share)) {
              current = null; // the run was deleted under the worker
              entry.handle?.stop();
              pump();
            }
          },
          onDone: (result) => finish({ status: 'done', summary: result.summary, result }),
          onError: (message) => finish({ status: 'failed', error: message }),
        });
      } catch (err) {
        finish({ status: 'failed', error: err.message });
      }
    }
  }

  return {
    // Validates and queues a run of room `roomId` (which must exist). → { run } (queued, without result) or { error, field }.
    start(roomId, body) {
      const checked = validateSimulation(body);
      if (checked.error) return checked;
      if (db.listRuns(roomId).filter((r) => r.status === 'queued' || r.status === 'running').length >= MAX_UNFINISHED) {
        return { error: `This room already has ${MAX_UNFINISHED} simulations waiting or running`, conflict: true };
      }
      const ctx = contextOf(roomId);
      const run = db.createRun(roomId, { ...checked.input, ctx }, now());
      queue.push({ id: run.id, roomId, job: { input: checked.input, ctx } });
      pump();
      return { run };
    },

    // A deleted room: drops its queued runs and stops its running worker (the database rows went with the room).
    forgetRoom(roomId) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].roomId === roomId) queue.splice(i, 1);
      if (current?.roomId === roomId) {
        const { handle } = current;
        current = null;
        handle?.stop();
      }
      pump();
    },

    // Stops a running run or drops a queued one and deletes it (a finished one is only deleted). → false when there is none.
    cancel(id) {
      if (current?.id === id) {
        const { handle } = current;
        current = null;
        handle?.stop();
      } else {
        const i = queue.findIndex((q) => q.id === id);
        if (i >= 0) queue.splice(i, 1);
      }
      const deleted = db.deleteRun(id);
      pump();
      return deleted;
    },

    // Stops the running worker and forgets the queue (shutdown, tests). The unfinished runs are failed at the next start.
    close() {
      queue.length = 0;
      const entry = current;
      current = null;
      entry?.handle?.stop();
    },
  };
}
