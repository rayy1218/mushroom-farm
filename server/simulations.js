// Simulation runs as background jobs (spec 2026-10-20-crops-and-simulation-design.md 4.2 and 4.4): validates a request, stores
// the run, runs one at a time in a worker thread (the others stay 'queued') and stores progress, summary and result.

import { Worker } from 'node:worker_threads';
import { PARAMS, outdoorProblem } from '../device/sim-store.js';
import { FARM_TYPES, validateCrops } from '../web/crops.js';
import { searchPlan, estimate, TARGET_DEFAULT } from './sizing.js';
import { readSettings } from './settings.js';

const PHYSICS = ['wallUA', 'outdoorHigh', 'outdoorLow', 'outdoorDew', 'sunW', 'fanFlow', 'acBTU', 'humidifierLH'];
const RATING_FIELDS = ['intakeW', 'exhaustW', 'circulationW', 'humidifierW', 'humidifierLH', 'acInputW', 'dehumidifierW', 'dehumidifierLday'];
const CONTROL_FIELDS = ['exchangeMaxMin', 'acDrop', 'exchangeEveryMin', 'humidifierDuringExchange', 'acFan'];
const MAX_UNFINISHED = 5; // queued or running runs of one room
const SIZING_KEPT = 20; // finished suggestions kept per room
export const RESTART_TEXT = 'Stopped by a restart of the farm app';

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// Checks a request body { physics, crops, farmType, stage, days }. → { input } (only the known fields) or { error, field }.
export function validateSimulation(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { error: 'Body must be a JSON object' };
  const { physics, crops, farmType, stage, days, control } = body;
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
  if (physics.dehumidifierLday !== undefined) {
    const v = physics.dehumidifierLday;
    if (!isNumber(v) || v < 0 || v > 200) return { error: 'Dehumidifier must be a number from 0 to 200 L/day', field: 'physics.dehumidifierLday' };
    clean.dehumidifierLday = v;
  }
  const clash = outdoorProblem(clean);
  if (clash) return { error: clash.message, field: `physics.${clash.field}` };
  const badCrops = validateCrops(crops);
  if (badCrops) return badCrops;
  if (!(typeof farmType === 'string' && Object.hasOwn(FARM_TYPES, farmType))) return { error: 'Farm type must be ready or full', field: 'farmType' };
  const stages = FARM_TYPES[farmType].stages;
  if (!stages.includes(stage)) return { error: `Stage must be one of ${stages.join(', ')}`, field: 'stage' };
  if (!Number.isInteger(days) || days < 1 || days > 90) return { error: 'Days must be a whole number from 1 to 90', field: 'days' };
  const input = { physics: clean, crops: crops.map(({ crop, blocks }) => ({ crop, blocks })), farmType, stage, days };
  if (control !== undefined) {
    // This run's own air exchange time limit, aircon drop and humidifier-during-exchange, instead of the room's (any of them).
    if (control === null || typeof control !== 'object' || Array.isArray(control)) return { error: 'Control must be an object', field: 'control' };
    const own = {};
    if (control.exchangeMaxMin !== undefined) {
      if (!Number.isInteger(control.exchangeMaxMin) || control.exchangeMaxMin < 1 || control.exchangeMaxMin > 120) {
        return { error: 'Air exchange time limit must be a whole number from 1 to 120 min', field: 'control.exchangeMaxMin' };
      }
      own.exchangeMaxMin = control.exchangeMaxMin;
    }
    if (control.acDrop !== undefined) {
      if (!isNumber(control.acDrop) || control.acDrop < 0 || control.acDrop > 10) {
        return { error: 'Aircon lower during air exchange must be a number from 0 to 10 °C', field: 'control.acDrop' };
      }
      own.acDrop = control.acDrop;
    }
    if (control.humidifierDuringExchange !== undefined) {
      if (typeof control.humidifierDuringExchange !== 'boolean') {
        return { error: 'Humidifier on during air exchange must be true or false', field: 'control.humidifierDuringExchange' };
      }
      own.humidifierDuringExchange = control.humidifierDuringExchange;
    }
    if (Object.keys(own).length === 0) return { error: 'Control must set exchangeMaxMin, acDrop or humidifierDuringExchange', field: 'control' };
    input.control = own;
  }
  return { input };
}

// Checks a sizing request { physics (walls, weather, sun), crops, farmType, stage, target }. → { input } or { error, field }.
export function validateSizing(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { error: 'Body must be a JSON object' };
  // The machines are what it looks for: checked as a simulation's with any machines, then dropped.
  const dummy = { fanFlow: 100, acBTU: 9000, humidifierLH: 1 };
  const checked = validateSimulation({ ...body, physics: body.physics !== null && typeof body.physics === 'object' && !Array.isArray(body.physics) ? { ...body.physics, ...dummy } : body.physics, days: 1, control: undefined });
  if (checked.error) return checked;
  const { target = TARGET_DEFAULT } = body;
  if (!Number.isInteger(target) || target < 50 || target > 99) return { error: 'Target must be a whole number from 50 to 99 %', field: 'target' };
  const { physics, crops, farmType, stage } = checked.input;
  const { wallUA, outdoorHigh, outdoorLow, outdoorDew, sunW } = physics;
  return { input: { physics: { wallUA, outdoorHigh, outdoorLow, outdoorDew, sunW }, crops, farmType, stage, target } };
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

// db: the farm database. now: injectable clock. spawn: how a job runs (tests pass an in-process one). Runs are stored in the
// database; sizing jobs (suggest machines, spec 2026-10-22-suggest-machines-design.md 4 and 5) only in memory. Both share the
// one queue: one job at a time.
export function createSimulations({ db, now = Date.now, spawn = spawnWorker }) {
  const queue = []; // { kind: 'run' | 'sizing', id, roomId, job }
  let current = null; // { kind, id, roomId, handle, stored }
  const sizings = new Map(); // id → { id, roomId, status, progress, total, createdAt, finishedAt, result, error }
  let sizingId = 0;
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

  // How each kind of job keeps its progress and ends. begin and progress → false when the job is gone.
  const store = {
    run: {
      begin: (id) => db.setRunProgress(id, 'running', 0),
      progress: (id, share) => db.setRunProgress(id, 'running', share),
      end: (id, outcome) => db.finishRun(id, outcome, now()),
    },
    sizing: {
      begin(id) {
        const job = sizings.get(id);
        if (!job) return false;
        job.status = 'running';
        return true;
      },
      progress(id, share) {
        const job = sizings.get(id);
        if (!job) return false;
        job.progress = share;
        job.tried = Math.round(share * job.total);
        return true;
      },
      end(id, outcome) {
        const job = sizings.get(id);
        if (!job) return;
        Object.assign(job, { status: outcome.status, error: outcome.error ?? null, result: outcome.result ?? null, finishedAt: now() });
        if (outcome.status === 'done') Object.assign(job, { progress: 1, tried: job.total });
        prune(job.roomId);
      },
    },
  };

  // Keeps the newest SIZING_KEPT finished suggestions of a room.
  function prune(roomId) {
    const finished = [...sizings.values()].filter((j) => j.roomId === roomId && j.status !== 'queued' && j.status !== 'running');
    for (const old of finished.slice(0, Math.max(0, finished.length - SIZING_KEPT))) sizings.delete(old.id);
  }

  function pump() {
    while (!current && queue.length > 0) {
      const { kind, id, roomId, job } = queue.shift();
      const jobs = store[kind];
      if (!jobs.begin(id)) continue; // the job is gone (its room was deleted)
      const entry = { kind, id, roomId, handle: null, stored: 0 };
      current = entry;
      const finish = (outcome) => {
        if (current !== entry) return; // cancelled meanwhile
        current = null;
        jobs.end(id, outcome);
        pump();
      };
      try {
        entry.handle = spawn(job, {
          onProgress(share) {
            if (current !== entry) return;
            const percent = Math.round(share * 100);
            if (percent <= Math.round(entry.stored * 100)) return;
            entry.stored = share;
            if (!jobs.progress(id, share)) {
              current = null; // the job was deleted under the worker
              entry.handle?.stop();
              pump();
            }
          },
          onDone: (result) => finish(kind === 'run' ? { status: 'done', summary: result.summary, result } : { status: 'done', result }),
          onError: (message) => finish({ status: 'failed', error: message }),
        });
      } catch (err) {
        finish({ status: 'failed', error: err.message });
      }
    }
  }

  // Stops the job running now when `match` says so.
  function stopCurrent(match) {
    if (!current || !match(current)) return;
    const { handle } = current;
    current = null;
    handle?.stop();
  }

  const unfinished = (j) => j.status === 'queued' || j.status === 'running';

  return {
    // Validates and queues a run of room `roomId` (which must exist). → { run } (queued, without result) or { error, field }.
    start(roomId, body) {
      const checked = validateSimulation(body);
      if (checked.error) return checked;
      if (db.listRuns(roomId).filter((r) => r.status === 'queued' || r.status === 'running').length >= MAX_UNFINISHED) {
        return { error: `This room already has ${MAX_UNFINISHED} simulations waiting or running`, conflict: true };
      }
      const ctx = contextOf(roomId);
      // The run's own air exchange time limit instead of the room's (input.control stays in the stored input to compare).
      if (checked.input.control) ctx.control = { ...ctx.control, ...checked.input.control };
      const run = db.createRun(roomId, { ...checked.input, ctx }, now());
      queue.push({ kind: 'run', id: run.id, roomId, job: { input: checked.input, ctx } });
      pump();
      return { run };
    },

    // Validates and queues a suggestion for room `roomId` (which must exist). → { job } or { error, field, conflict }.
    startSizing(roomId, body) {
      const checked = validateSizing(body);
      if (checked.error) return checked;
      if ([...sizings.values()].some((j) => j.roomId === roomId && unfinished(j))) {
        return { error: 'A suggestion is already being worked out for this room', conflict: true };
      }
      const ctx = contextOf(roomId);
      const id = ++sizingId;
      const total = searchPlan(estimate(checked.input, ctx)).total;
      const job = { id, roomId, status: 'queued', progress: 0, tried: 0, total, createdAt: now(), finishedAt: null, result: null, error: null };
      sizings.set(id, job);
      const queued = { ...job };
      queue.push({ kind: 'sizing', id, roomId, job: { kind: 'sizing', input: checked.input, ctx } });
      pump();
      return { job: queued };
    },

    getSizing: (id) => sizings.get(id) ?? null,

    // Stops a running suggestion or drops a queued one, and forgets it (a finished one is only forgotten). → false when there is none.
    cancelSizing(id) {
      if (!sizings.has(id)) return false;
      stopCurrent((c) => c.kind === 'sizing' && c.id === id);
      const i = queue.findIndex((q) => q.kind === 'sizing' && q.id === id);
      if (i >= 0) queue.splice(i, 1);
      sizings.delete(id);
      pump();
      return true;
    },

    // A deleted room: drops its queued jobs and stops its running worker (the database rows went with the room).
    forgetRoom(roomId) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].roomId === roomId) queue.splice(i, 1);
      stopCurrent((c) => c.roomId === roomId);
      for (const [id, j] of sizings) if (j.roomId === roomId) sizings.delete(id);
      pump();
    },

    // Stops a running run or drops a queued one and deletes it (a finished one is only deleted). → false when there is none.
    cancel(id) {
      stopCurrent((c) => c.kind === 'run' && c.id === id);
      const i = queue.findIndex((q) => q.kind === 'run' && q.id === id);
      if (i >= 0) queue.splice(i, 1);
      const deleted = db.deleteRun(id);
      pump();
      return deleted;
    },

    // Stops the running worker and forgets the queue (shutdown, tests). The unfinished runs are failed at the next start;
    // suggestions are only in memory.
    close() {
      queue.length = 0;
      sizings.clear();
      const entry = current;
      current = null;
      entry?.handle?.stop();
    },
  };
}
