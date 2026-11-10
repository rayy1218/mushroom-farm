// Work it out on the Economics page (spec 2026-11-06-economics-design.md 6): the body of the room's simulation with a crop
// over one block life, and the electricity per block its finished run gives. Pure: the caller reads the room, its newest
// simulation and the figures, and queues the body through simulations.start (which never switches a machine).
//   simBody({ room, lastRun, crop, blocks, life }) → { body, days, machinesNote } · simFigure(run, life) → the row's figure

import { PHYSICS_FIELDS, MACHINE_KEYS, roomMachines } from '../web/simulate-math.js';
import { calendarDays } from '../web/filter-math.js';

export const MAX_SIM_DAYS = 90; // a simulation's longest run; a longer block life is scaled from it
export const DELETED_TEXT = 'The simulation was deleted';
const BUILDING = PHYSICS_FIELDS.filter((f) => !MACHINE_KEYS.includes(f.key)); // the walls, weather and filter: the building's
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

// room: the room row (its ratings on Setup); lastRun: its newest simulation or null; blocks: Your container's blocks; life:
// the block life in days; now: the clock (the filter's days in use). Each wall, weather and filter number is the newest run's,
// else the room's own on Setup, else Simulate's default, as Simulate's step 1 fills it (initialState); the filter's days in
// use are the room's now, not the run's; the machines are the room's (roomMachines: Setup's, else the newest run's, else
// Simulate's), ready-to-fruit blocks fruiting from in band.
export function simBody({ room, lastRun, crop, blocks, life, now = Date.now() }) {
  const p = lastRun?.input?.physics ?? {};
  const physics = Object.fromEntries(BUILDING.map((f) => [f.key,
    isNumber(p[f.key]) ? p[f.key] : f.room && isNumber(room?.[f.room]) ? room[f.room] : f.def]));
  physics.filterUsedDays = isNumber(room?.filterChangedAt) ? Math.min(365, Math.max(0, calendarDays(room.filterChangedAt, now))) : 0;
  physics.filterSensor = isNumber(room?.dpAddress); // the run changes its filter at the change pressure, as the room's sensor would
  const { machines, note } = roomMachines({ room, lastRun });
  const days = Math.min(MAX_SIM_DAYS, Math.max(1, Math.round(life) || 1));
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
