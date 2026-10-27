// The room page's Energy meter card from the sensors reply (no DOM, so it can be tested in Node). The room's ratings and its meter
// address are room fields (web/room-fields.js). Spec 2026-10-20-energy-water-outdoor-design.md section 4.

// The "Energy meter" sensor card of the room page, from the meter in the sensors reply. null: no meter set.
// { address, status, power, energy, at }: values are null until the first good answer.
export function meterCard(meter) {
  if (!meter || meter.address == null || meter.status === 'not-wired') return null;
  const ok = meter.lastOk ?? null;
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return { address: meter.address, status: meter.status, power: num(ok?.power), energy: num(ok?.energy), at: num(ok?.at), failures: num(meter.failuresInRow) ?? 0 };
}
