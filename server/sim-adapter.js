// server/sim-adapter.js: the simulated room adapter (C2 section 13).
// Loads only ../air.js, ../sim.js, ../runtime.js and ../equipment.js, in this order (C2 section 1, C9 section 6.3);
// only ClimateEquipment.plantOf is used (C8 section 1).
'use strict';
require('../air.js');
require('../sim.js');
require('../runtime.js');
require('../equipment.js');

const MAX_CATCH_UP_S = 300;
const TZ_OFFSET_S = 28800;
const START_CO2 = 750;

// C2 section 13.2: read the sim's own time, then set the origin so origin + sim.t is the real time now.
function setOrigin(sim, env, now) {
  const simT = sim.view().t;
  const origin = now() - simT;
  env.startHour = ((origin + TZ_OFFSET_S) % 86400) / 3600;
  return origin;
}

function createSimAdapter({ room, calib, blocks, equipment = null, cfg, snapshot, now }) {
  const DEFAULT_ENV = globalThis.ClimateSim.DEFAULT_ENV;

  // Step 1 (C2 13.1)
  const env = structuredClone(DEFAULT_ENV);
  env.airM3h = cfg.airM3h; // C9 section 6.3: the room's own air exchange size
  env.room = { volume: room.volume };
  if (calib) {
    env.room.ua = calib.ua;
    env.room.infAch = calib.infAch;
    env.room.moistBuffer = calib.moistBuffer;
  }
  env.co2PerBlock = calib ? Math.round(calib.co2PerBlock) : DEFAULT_ENV.co2PerBlock;
  env.blocks = blocks !== null && blocks !== undefined ? blocks : DEFAULT_ENV.blocks;
  env.blockStage = cfg.stage;
  // C2 13.1 (revision 8): the room's machines; env.airM3h above stays the settings' size.
  if (equipment !== null && equipment !== undefined) {
    env.plant = globalThis.ClimateEquipment.plantOf(equipment, { volume: room.volume, calib });
  }

  // Step 2
  const sim = globalThis.ClimateSim.create(env, snapshot || undefined);
  if (!snapshot) {
    sim.setRoom({ T: cfg.spT, RH: cfg.spRH, CO2: START_CO2 });
  }

  // Step 3
  const inner = globalThis.ClimateRuntime.simIO(sim);

  // Step 4
  let origin = setOrigin(sim, env, now);

  const io = {
    read() {
      const r = inner.read();
      if (!r) return r;
      return {
        ...r,
        t: origin + r.t,
        CO2: Number.isFinite(r.CO2) ? r.CO2 + (r.seq % 2) * 1e-6 : r.CO2,
      };
    },
    write(cmd) {
      inner.write(cmd);
    },
    advance(dt) {
      if (dt <= 0) return;
      if (dt <= MAX_CATCH_UP_S) {
        for (let i = 0; i < dt; i++) {
          env.blockStage = cfg.stage;
          inner.advance(1);
        }
      } else {
        origin = setOrigin(sim, env, now);
      }
    },
  };

  return {
    io,
    view() {
      const v = sim.view();
      return { ...v, t: origin + v.t };
    },
    snapshot() {
      return sim.snapshot();
    },
  };
}

module.exports = { createSimAdapter, MAX_CATCH_UP_S, TZ_OFFSET_S, START_CO2 };
