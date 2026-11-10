// Work it out on the Economics page (spec 2026-11-06-economics-design.md 6): the body of the room's simulation with a crop
// over one block life, and the electricity per block its finished run gives. Pure: the caller reads the room, its newest
// simulation and the figures, and queues the body through simulations.start (which never switches a machine).
//   simBody({ room, lastRun, crop, blocks, life }) → { body, days, machinesNote } · simFigure(run, life) → the row's figure

import { PHYSICS_FIELDS, FILTER_KEYS, roomMachines } from '../web/simulate-math.js';

export const MAX_SIM_DAYS = 90; // a simulation's longest run; a longer block life is scaled from it
export const DELETED_TEXT = 'The simulation was deleted';
const WEATHER = PHYSICS_FIELDS.filter((f) => f.group); // the walls, sun and weather: the building's, from the newest run
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

// room: the room row (its ratings on Setup); lastRun: its newest simulation or null; blocks: Your container's blocks; life:
// the block life in days. The walls, weather and filter of the newest run (else Simulate's defaults), the room's machines
// (roomMachines: Setup's, else the newest run's, else Simulate's), ready-to-fruit blocks fruiting from in band.
export function simBody({ room, lastRun, crop, blocks, life }) {
  const p = lastRun?.input?.physics ?? {};
  const physics = Object.fromEntries(WEATHER.map((f) => [f.key, isNumber(p[f.key]) ? p[f.key] : f.def]));
  if (FILTER_KEYS.some((k) => p[k] !== undefined)) {
    for (const k of [...FILTER_KEYS, 'filterSensor']) if (p[k] !== undefined) physics[k] = p[k];
  }
  const { machines, note } = roomMachines({ room, lastRun });
  const days = Math.min(MAX_SIM_DAYS, Math.max(1, Math.round(life)));
  return {
    body: { physics: { ...physics, ...machines }, crops: [{ crop, blocks }], farmType: 'ready', stage: 'fruiting', start: 'band', days },
    days,
    machinesNote: note,
  };
}

// A done run's figure: kWh per block over the block life, to 3 places; a life over the run's days scales its kWh (× life ÷
// days). → { value, kwh, blocks, days } (kwh and days the life's), or null when the run has no energy.
export function simFigure(run, life) {
  const kWh = run.summary?.energy?.kWh;
  const blocks = (run.input?.crops ?? []).reduce((s, c) => s + c.blocks, 0);
  const ran = run.input?.days;
  if (!isNumber(kWh) || !(blocks > 0) || !(ran > 0)) return null;
  const days = isNumber(life) && life > ran ? life : ran;
  const kwh = (kWh * days) / ran;
  return { value: round(kwh / blocks, 3), kwh: round(kwh, 1), blocks, days };
}
