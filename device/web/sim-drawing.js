// The room drawing inside a simulated room's card. The drawing itself is the farm app's web/mimic.js, which the
// device serves from the farm's web/ folder (device/http.js); the mapping from a sim room is fromSim in mimic-math.js.

import { createMimic, startLoop } from '/mimic.js';
import { fromSim } from '/mimic-math.js';

const drawings = new Set();
let stop = null;

// → { el, paint(room, sensors), destroy() }
export function createSimDrawing(id) {
  const el = document.createElement('div');
  el.className = 'mimic-host sim-drawing';
  const mimic = createMimic(el, { idPrefix: `sim-${id}-` });
  drawings.add(mimic);
  stop ??= startLoop(() => drawings);
  return {
    el,
    paint(room, sensors) { mimic.paint(fromSim(room, sensors)); },
    destroy() {
      drawings.delete(mimic);
      mimic.destroy();
      if (drawings.size === 0) { stop?.(); stop = null; }
    },
  };
}
