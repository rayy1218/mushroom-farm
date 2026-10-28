// Starts the farm app: reads FARM_DB, FARM_PORT and FARM_GATEWAY, opens the database,
// serves HTTP and polls the gateways (sensors, relay modules, aircon gateways): the farm's, and a room's own when it has one.

import { mkdirSync } from 'node:fs';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { createGateways, parseGateway, DEFAULT_GATEWAY } from './gateways.js';
import { createPoller } from './poller.js';
import { createMachines } from './machines.js';
import { createController } from './controller.js';
import { readSettings } from './settings.js';
import { warmUsage } from './usage.js';
import { createSimulations } from './simulations.js';
import { createTelegram } from './telegram.js';
import { createEvents } from './events.js';
import { createLive, watchAlarms } from './live.js';

// Telegram (phone alarms) answers on IPv4 in 170–300 ms from the farm, and Node gives each address only 250 ms before trying
// the next: alarms then failed with "fetch failed" now and then (2026-10-28). 2 s per address.
setDefaultAutoSelectFamilyAttemptTimeout(2000);

const DEFAULT_DB = fileURLToPath(new URL('../data/v2.db', import.meta.url));

function fail(message) {
  console.error(message);
  process.exit(1);
}

const dbPath = process.env.FARM_DB || DEFAULT_DB;
const portText = process.env.FARM_PORT || '8080';
if (!/^[0-9]{1,5}$/.test(portText) || Number(portText) > 65535) {
  fail(`FARM_PORT must be a whole number from 0 to 65535, got "${portText}"`);
}

const gatewayText = process.env.FARM_GATEWAY || DEFAULT_GATEWAY;
const farmGateway = parseGateway(gatewayText);
if (!farmGateway) fail(`FARM_GATEWAY must look like host:port, got "${gatewayText}"`);

if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
const gateways = createGateways({ farm: farmGateway });
// The poller calls the controller after each cycle; the controller needs the machines, which need the poller.
let controller = null;
let live = null;
const events = createEvents();
watchAlarms(db, events);
const { pollSeconds } = readSettings(db);
const afterCycle = async (cycleStart) => {
  try {
    await controller.run(cycleStart);
  } finally {
    live.afterCycle(); // the pages hear of the readings even when the controller failed
  }
};
const poller = createPoller({ db, clients: gateways, intervalMs: pollSeconds * 1000, afterCycle });
const machines = createMachines({ db, clients: gateways, poller });
controller = createController({ db, machines });
live = createLive({ db, events, machines, controller });
const simulations = createSimulations({ db, onChange: (type, data) => events.publish(type, data) });
const telegram = createTelegram({ db });
const server = createApp(db, { machines, controller, poller, simulations, telegram, events, gateway: gatewayText });

server.on('error', (err) => fail(`Could not start the server: ${err.message}`));
server.listen(Number(portText), () => {
  console.log(`Farm app on http://localhost:${server.address().port} (database ${dbPath}, gateway ${gatewayText}, reading every ${pollSeconds} s)`);
  poller.start();
  warmUsage(db).catch((err) => console.error(`Usage warm-up failed: ${err.message}`));
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await poller.stop();
  simulations.close();
  telegram.close();
  gateways.close();
  server.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
