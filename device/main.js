// Starts the device app: reads DEVICE_MODBUS_PORT, DEVICE_HTTP_PORT and DEVICE_STATE.

import { fileURLToPath } from 'node:url';
import { startDevice } from './server.js';

const DEFAULT_STATE = fileURLToPath(new URL('./state.json', import.meta.url));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readPort(name, fallback) {
  const text = process.env[name] || String(fallback);
  if (!/^[0-9]{1,5}$/.test(text) || Number(text) > 65535) fail(`${name} must be a whole number from 0 to 65535, got "${text}"`);
  return Number(text);
}

const modbusPort = readPort('DEVICE_MODBUS_PORT', 1502);
const httpPort = readPort('DEVICE_HTTP_PORT', 8090);
const statePath = process.env.DEVICE_STATE || DEFAULT_STATE;

let device;
try {
  device = await startDevice({ modbusPort, httpPort, statePath });
} catch (err) {
  fail(`Could not start the device app: ${err.message}`);
}
console.log(`Device app: Modbus on :${device.modbusPort}, control page http://localhost:${device.httpPort}`);

async function stop() {
  await device.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
