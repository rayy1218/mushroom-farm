// A run's plan (spec 2026-11-12-economics-stage-2-design.md 7.1 and 7.4): when a run of blocks opens in a room, or an open
// run gains a crop, that room and crop's figures as the view resolves them then are saved as the run's plan, once
// (economics_plans, version 30), with the crop's own blocks beside the room's (context.cropBlocks). Economics only listens:
// the Crop tab's save publishes the room's crop event, and the same check runs on every plans read of the room, so a missed
// event (the farm app stopped between the save and the event) is caught when the page next reads the runs. Not at start: it
// would work out every room's figures as the app comes up. A part not read then saves nothing (its fallback figures would be
// frozen): the next crop event or plans read saves it.
// The plans view gives the room and crop's runs (eachRun) with their plans; the money is worked out in the browser.
//   createPlans({ db, harvests, batches, days, zone, now, figuresOf, events, publish, log }) → { check, plansView, close }

import { ECONOMICS_CROPS, figuresFor } from '../web/economics-defaults.js';
import { eachRun } from './economics-runs.js';

// The keys a plan keeps: the shared figures and Your container's (the other ways' are another grower's).
export const planKeys = (crop) => figuresFor(crop).filter((f) => f.way === 'shared' || f.way === 'yours').map((f) => f.key);

// figuresOf(room, crop): the service's own resolver → { figures, context }; publish(roomId, crop): tells the pages a plan was
// saved (the 'economics' event with plan: true).
export function createPlans({ db, harvests, batches, days, zone, now, figuresOf, events = null, publish = () => {}, log = console.error }) {
  // The room's open run: a plan for each of its crops of the four that has none. → how many were saved.
  function check(roomId) {
    const run = db.openRun(roomId);
    if (!run) return 0;
    let saved = 0;
    for (const { crop, blocks } of run.crops) {
      if (!ECONOMICS_CROPS.includes(crop) || db.economicsPlan(run.id, crop)) continue;
      const room = db.getRoom(roomId);
      if (!room) return saved;
      const { figures, context, errors } = figuresOf(room, crop);
      if (Object.keys(errors).length) continue; // a part not read: its figures are fallbacks, and a plan is never replaced
      const keys = new Set(planKeys(crop));
      const kept = Object.fromEntries(figures.filter((f) => keys.has(f.key)).map((f) => [f.key, { value: f.value, source: f.source }]));
      // the crop's own blocks: a crop added to an open run is compared at the room as the plan had it (the review)
      if (db.saveEconomicsPlan({ runId: run.id, roomId, crop, at: now(), figures: kept, context: { ...context, cropBlocks: blocks } })) {
        saved += 1;
        publish(roomId, crop);
      }
    }
    return saved;
  }
  const safely = (roomId) => {
    try {
      check(roomId);
    } catch (err) {
      log(err);
    }
  };

  // GET /api/economics/plans: room the room row, crop one of the four.
  function plansView(room, crop) {
    safely(room.id);
    const { past, current, leftOut, errors } = eachRun({ db, harvests, batches, days, room, crop, today: zone.label(now()), zone, log });
    const plans = {};
    for (const runId of [...(current ? [current.runId] : []), ...past.map((r) => r.runId)]) {
      const p = db.economicsPlan(runId, crop);
      plans[runId] = !p ? { at: null, before: true } : p.figures === null ? { at: p.at, before: true } : { at: p.at, figures: p.figures, context: p.context };
    }
    return { room: { id: room.id, name: room.name, type: room.roomType ?? 'container' }, crop, current, past, leftOut, plans, errors };
  }

  const stop = events ? events.subscribe((type, data) => {
    if (type === 'room' && data?.part === 'crop' && Number.isInteger(data.id)) safely(data.id);
  }) : () => {};

  return { check, plansView, close: stop };
}
