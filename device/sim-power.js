// The electrical power a simulated room draws (W), from what its machines do this step. Pure, no I/O.
// Aircon: the heat it moves divided by its COP, which falls on a hot day; plus its indoor fan while it is working.
// Intake fan: more on a dirty filter (fanWattFactor).

const AC_FAN_W = 40;
const MOTOR_W = 60;            // intake, exhaust and circulation fan
const HUMIDIFIER_W_PER_LH = 40;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// 3.6 at 27 °C outdoors, 3.1 at 35 °C, never outside 2 to 5.
export const copAt = (outdoorT) => clamp(3.6 - 0.06 * (outdoorT - 27), 2, 5);

// A fixed-speed intake fan against a dirtier filter (spec 2026-10-22-filter-design.md 6): its rated power with a clean filter,
// up to 1.15 times at the fan's maximum pressure, never below rated. 1 when the filter settings are missing or do not fit.
export function fanWattFactor(pa, cleanPa, maxPa) {
  if (![pa, cleanPa, maxPa].every(Number.isFinite) || maxPa <= cleanPa) return 1;
  return Math.max(1, 1 + (0.15 * (pa - cleanPa)) / (maxPa - cleanPa));
}

// acting: what the model reported (kW); inputs: the machines (ac is null when off or faulty); params: the room's
// settings with the outdoor air now. The humidifier's draw follows its setting while it runs; the dehumidifier's is its rated power.
export function electricW({ acting, inputs, params }) {
  const cop = copAt(params.outdoorT ?? 27);
  const heat = ((acting?.acCoolKW ?? 0) + (acting?.acLatentKW ?? 0) + (acting?.acHeatKW ?? 0)) * 1000;
  let w = heat / cop;
  if (inputs.ac) w += AC_FAN_W;
  if (inputs.intake) w += MOTOR_W * fanWattFactor(acting?.filterPa ?? 0, params.filterCleanPa, params.fanMaxPa);
  if (inputs.exhaust) w += MOTOR_W;
  if (inputs.circulation) w += MOTOR_W;
  if (inputs.humidifier) w += (HUMIDIFIER_W_PER_LH * (params.humidifierGH ?? 0)) / 1000;
  if (inputs.dehumidifier) w += (acting?.dehumidifierKW ?? 0) * 1000;
  return w;
}
