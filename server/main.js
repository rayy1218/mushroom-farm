// Starts the farm app: reads FARM_DB and FARM_PORT, opens the database, serves HTTP.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

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

if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
const server = createApp(db);

server.on('error', (err) => fail(`Could not start the server: ${err.message}`));
server.listen(Number(portText), () => {
  console.log(`Farm app on http://localhost:${server.address().port} (database ${dbPath})`);
});

function stop() {
  server.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
