// A line of text that wraps well (critique 2026-10-28 and 2026-10-29: "about 420 / ppm", "from the bands · / fresh air every
// 12 min"): every number keeps its unit (simulation-math.js keepUnits) and a '·' keeps to the words before it, a no-break
// space before it and a normal one after (2026-10-29c: bound to the words after it, a wrapped line began "· fresh air"), so a
// wrap leaves the '·' at a line's end and no line starts with one.

import { keepUnits } from './simulation-math.js';

export const DOT = ' · ';
export const keepLines = (text) => keepUnits(text).replace(/ · /g, DOT);
