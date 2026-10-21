# Dehumidifier machine (iteration 9)

Date: 2026-10-21 · Branch `v2` · Builds on iterations 3 (machines), 5–6 (controller, safety), 7 (energy and water) and 8 (simulation runs).

Why: a well insulated, shaded container (Container Alpha, 950 lion's mane blocks) runs too wet. The blocks give off about 450–520 g/h of water and the aircon only takes water out while it cools; with little heat to remove it takes out about 530 g/h, so the room settles near 84 % RH, above lion's mane's rest band (77–83 %) and wet at night in fruiting. Aircon fan, setpoint, dry mode, fresh-air timing and a bigger aircon move it 1–2 points; a dehumidifier (on above the upper RH limit, off at the band middle) took the rest stage from 40 % to about 90 % in band in a hand-made probe. The owner said yes to building it. The lead chose every default (*default*).

## 1. Scope

| In | Out (later) |
|---|---|
| A dehumidifier on the room's relay module (output 5, current input 5), per room "fitted" or not | Several dehumidifiers per room, a dehumidifier with its own Modbus |
| Manual control and status like the other relay machines | Icing below 15 °C, defrost cycles |
| Automatic rule with compressor protection | Using it to cool or heat |
| Energy (rating × run time), the device app's fake and simulation, the simulation runs | Water removed in the live usage card (no sensor for it) |

## 2. Machine

| Item | Rule |
|---|---|
| Key | `dehumidifier`, the 5th relay key: `RELAY_KEYS = ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier']` (coil 4, discrete input 4) |
| Poll | the relay module is read with 5 coils (fn 01) and 5 inputs (fn 02) |
| Fitted | room field `dehumidifier` (true/false, default false). Not fitted: the machines view shows its status `not-fitted`; it is never commanded (manual PUT → 400 "This room has no dehumidifier", field `dehumidifier`; auto leaves it); no alarms; the page hides it |
| Ratings (room) | `dehumidifierW` "Dehumidifier power" W, default 380, 0–5000; `dehumidifierLday` "Dehumidifier capacity" L/day, default 20, 0–200 (rated at 30 °C 80 % RH, the usual label) |
| Statuses | as the other relay machines when fitted (on, off, switching, not-following, not-running, running-while-off, no-answer, not-wired) |

## 3. Automatic rule (`decide`)

| State | Condition (in this order) | Result | Reason text |
|---|---|---|---|
| any | not fitted | off, not commanded | "" |
| any | RH probe faulty | off *default* (a dry room is safer than a running compressor on bad data) | "Humidity sensor fault: dehumidifier off" |
| any | no usable RH reading (not yet faulty) | kept | "Humidity sensor not answering: dehumidifier kept on/off" |
| any | the humidifier is decided on (its band or forced during exchange) | off | "Dehumidifier off: the humidifier is on" |
| off | RH ≥ rhHigh | on | "Dehumidifier: RH 94 ≥ 93" |
| on | RH ≤ the band middle (rhLow + rhHigh) / 2 | off | "Dehumidifier: RH 90 ≤ 90" |
| — | otherwise | kept | "Dehumidifier kept on: RH 91.5 between 90 and 93" |

| Item | Rule |
|---|---|
| State | `dehumidifierBand` (the band state, kept in the database: `room_controls.dehumidifier`) |
| Protection (`protect`) | its command changes at most once every 3 min *default* (a compressor: 3 min on, 3 min off); reason while held "Dehumidifier waits: minimum on time, 1 min 20 s to go" / "minimum off time" |
| Turning auto on | the band state starts from what is commanded now |

## 4. Energy and water

| Item | Rule |
|---|---|
| Live usage (iteration 7) | `dehumidifier` in `byMachine`: rating W × on time; metered rooms as before |
| Live water | unchanged (the humidifier's water only) |
| Simulation energy | its power: `dehumidifierLday × 18 W` *default* (about 360 W for a 20 L/day unit), × on time |
| Simulation water | `summary.water.removedLitres`: the water it took out (the humidifier's `litres` as before) |

## 5. Physics (`device/sim-model.js`)

| Item | Rule |
|---|---|
| Input | `inputs.dehumidifier` (on/off); params `dehumidifierLday` (rated L/day at 30 °C 80 %), `dehumidifierW` (electric W) |
| Water out | rated g/h × the air's water above the coil's (`W − satW(5 °C)`) ÷ the same at the rating (`wOf(30, 80) − satW(5)`), at most 1.2 times the rating; nothing at or below a 5 °C dew point; never more than the air holds |
| Heat | its electric power and the condensation heat of the water it took out go into the air (a dehumidifier warms the room) |
| Acting | `dehumidifierGH` (water out, g/h) and `dehumidifierKW` (electric) in `acting` |
| Check | at 21 °C 84 % RH a 20 L/day unit takes out about half its rating (about 410 g/h) |

## 6. Database (upgrade 12)

| Change | Rule |
|---|---|
| `machine_commands.dehumidifier` | INTEGER 0/1, default 0 |
| `machine_log` | rebuilt so its CHECK allows `dehumidifier` (rows kept) |
| `rooms.dehumidifier`, `rooms.dehumidifier_w`, `rooms.dehumidifier_lday` | 0/1 default 0; 380; 20 |
| `room_controls.dehumidifier` | INTEGER 0/1, default 0 (band state) |

## 7. Device app

| Item | Rule |
|---|---|
| Relay module | 5 outputs and 5 current inputs (coil 4 / input 4 = dehumidifier); stuck/dead per output as before |
| Simulated room | `dehumidifierLday` (0 = none, default 0) and `dehumidifierW` (default 380); the runner gives the model `dehumidifier` = output 5 really running |
| Page | the 5th output in the relay card; the two simulated-room fields |

## 8. Farm page

| Part | Rule |
|---|---|
| Edit room → Power and water | "Dehumidifier fitted" checkbox; when ticked its power (W) and capacity (L/day) |
| Machines card | a Dehumidifier tile with on/off when fitted (hidden when not) |
| Automatic control card | its reason line and held line when fitted |
| Timeline | a Dehumidifier row when fitted |
| Energy and water card | a Dehumidifier row in the machine share |
| Room drawing | optional: a small dehumidifier box next to the humidifier when fitted (only if it fits the existing drawing cleanly) |
| Simulate stepper, step 1 | "Dehumidifier (L/day)" 0–200, 0 = none *default*, prefilled from the room (its `dehumidifierLday` when fitted, else 0) or the last run |
| Results page | Dehumidifier in the energy table and the timeline; "Water taken out" next to Water when > 0 |

## 9. Simulation runs

| Item | Rule |
|---|---|
| Input | `physics.dehumidifierLday` 0–200 (missing = 0, so older runs and bodies still work) |
| Control | the same `decide`/`protect` as live, fitted = `dehumidifierLday > 0` |
| Result | `machines.dehumidifier` spans, `summary.energy.byMachine.dehumidifier`, `summary.water.removedLitres` |
