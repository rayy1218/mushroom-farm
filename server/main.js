// Starts the farm app: reads FARM_DB, FARM_PORT and FARM_GATEWAY, opens the database,
// serves HTTP and polls the gateway (sensors, relay modules, aircon gateways).

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { createModbusClient } from './modbus.js';
import { createPoller } from './poller.js';
import { createMachines } from './machines.js';
import { createController } from './controller.js';
import { readSettings } from './settings.js';

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

const gatewayText = process.env.FARM_GATEWAY || '127.0.0.1:1502';
const gatewayMatch = /^(.+):([0-9]{1,5})$/.exec(gatewayText);
if (!gatewayMatch || Number(gatewayMatch[2]) < 1 || Number(gatewayMatch[2]) > 65535) {
  fail(`FARM_GATEWAY must look like host:port, got "${gatewayText}"`);
}

if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
const client = createModbusClient({ host: gatewayMatch[1].replace(/^\[(.*)\]$/, '$1'), port: Number(gatewayMatch[2]) });
// The poller calls the controller after each cycle; the controller needs the machines, which need the poller.
let controller = null;
const { pollSeconds } = readSettings(db);
const poller = createPoller({ db, client, intervalMs: pollSeconds * 1000, afterCycle: (cycleStart) => controller.run(cycleStart) });
const machines = createMachines({ db, client, poller });
controller = createController({ db, machines });
const server = createApp(db, { machines, controller, poller });

server.on('error', (err) => fail(`Could not start the server: ${err.message}`));
server.listen(Number(portText), () => {
  console.log(`Farm app on http://localhost:${server.address().port} (database ${dbPath}, gateway ${gatewayText}, reading every ${pollSeconds} s)`);
  poller.start();
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await poller.stop();
  client.close();
  server.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
