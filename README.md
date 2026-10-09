# Mushroom room climate controller

A climate controller for a mushroom fruiting room (temperature, humidity, CO₂), with a simulation test bench.

## Start
- Open `index.html` in a browser. No server and no build step.
- Tests: `npm test` (Node.js 20 or newer). About 15 s.
- Headless run: `npm run headless -- --days 2`.

## Files
| File | Part | Content |
|---|---|---|
| `controller.js` | Controller | The control logic. It sees only sensor readings. The same logic can run on a farm device. |
| `runtime.js` | Runtime | Connects an I/O adapter (simulation or hardware) to the controller. |
| `sim.js` | Simulation | The room, the weather, the blocks, the machines, and the sensors. A farm replaces it with hardware. |
| `air.js` | Air exchange | Purge arithmetic shared by the controller and the checks: purge time, the air exchange size a room needs, the CO₂ rise rate (contract C9). |
| `calib.js` | Calibration | Fits the simulation to a farm log (CSV). |
| `capacity.js` | Capacity check | How many blocks of a crop mix a room carries in fruiting on three design days; the pass window, verdict and utilisation. |
| `app.js`, `index.html`, `styles.css` | Page | The dashboard. |
| `tests/` | Tests | Unit tests, integration tests, settings tests, calibration tests, capacity tests, and test vectors. |
| `tools/` | Tools | `make-vectors.js` (test vectors), `run-headless.js`. |
| `docs/contract.md` | Contract | The reading, the commands, the adapter rules, the vector and settings formats. |
| `docs/phase3-plan.md` | Plan | Phase 3 decisions, options, and work items. |

## Change the controller
1. Change `controller.js`.
2. Run `npm test`. If the vector test fails and the change is intended, run `npm run vectors`, then `npm test` again.
