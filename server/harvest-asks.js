// The asks of a pick in a room (spec 2026-11-12-data-integrity-design.md 5.2), shared by Record and Edit (server/harvests.js)
// and a harvest check's Done (server/tasks.js): the room's other picks not voided near it, against integrity-math's rules.

import { harvestAsks, QUICK_PICKS_MS, DUPLICATE_MS } from './integrity-math.js';

// pick { crop, kg, pickedAt, field? }; blocks: the run's of the crop; self: an edit's own harvest; dup false: no duplicate ask.
export function roomPickAsks(db, roomId, pick, { blocks, self = null, dup = true }) {
  const others = db.harvestsBetween(pick.pickedAt - Math.max(QUICK_PICKS_MS, DUPLICATE_MS), pick.pickedAt + DUPLICATE_MS)
    .filter((h) => h.roomId === roomId && h.id !== self);
  return harvestAsks(pick, others, { blocks, roomName: db.getRoom(roomId)?.name ?? 'the room', dup });
}

// A harvest as the change entries keep it: its fields, the room's name then.
export function harvestSnapshot(db, h) {
  const { createdAt, voidedAt, voidedBy, voidReason, ...rest } = h;
  return { ...rest, roomName: db.getRoom(h.roomId)?.name ?? null };
}
