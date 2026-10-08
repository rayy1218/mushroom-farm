// server/main.js: thin wiring of the real db and room manager (C3 section 2.2). No exports.
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const { openDb } = require('./db.js');
const { createRoomManager } = require('./rooms.js');
const { createApi } = require('./api.js');
const { readConfig, pickHosts } = require('./config.js');

const root = path.join(__dirname, '..');

let db = null;
let rooms = null;
let api = null;
let server = null;
let shuttingDown = false;

function fatal(err) {
  console.error('Database error: ' + err.message);
  console.error(err.stack);
  process.exit(1);
}

function main() {
  let fileText = null;
  try {
    fileText = fs.readFileSync(path.join(root, 'farm.config.json'), 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Bad configuration: cannot read farm.config.json: ${err.message}`);
      process.exit(1);
    }
  }

  let config;
  try {
    config = readConfig(process.env, fileText, root);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  let host = config.host;
  let multipleHosts = false;
  if (host === null) {
    const candidates = pickHosts(os.networkInterfaces());
    if (candidates.length === 0) {
      console.error('No farm network address found; set FARM_HOST (for example 127.0.0.1).');
      process.exit(1);
    }
    if (candidates.length > 1) {
      multipleHosts = true;
      console.log('Farm network addresses: ' + candidates.map(c => `${c.address} (${c.name})`).join(', '));
    }
    host = candidates[0].address;
  }

  try {
    db = openDb(config.db);
  } catch (err) {
    console.error('Cannot open the database: ' + err.message);
    process.exit(1);
  }

  try {
    rooms = createRoomManager({ db });
    rooms.on('fatal', ({ error }) => fatal(error));
    rooms.start();
  } catch (err) {
    db.close();
    if (err.code === 'ERR_SQLITE_ERROR') {
      console.error('Database error: ' + err.message);
    } else {
      console.error('Cannot start the rooms: ' + err.message);
      console.error(err.stack);
    }
    process.exit(1);
  }

  api = createApi({ db, rooms, root, onFatal: fatal });
  server = http.createServer(api.handle);
  server.on('error', err => {
    console.error(`Cannot listen on ${host}:${config.port}: ${err.message}`);
    api.close();
    rooms.stop();
    db.close();
    process.exit(1);
  });
  server.listen(config.port, host, () => {
    console.log(`Open http://${host}:${config.port}` + (multipleHosts ? ' (set FARM_HOST to choose another)' : ''));
  });
}

function shutdown() {
  if (shuttingDown) process.exit(1);
  shuttingDown = true;
  api.close();
  server.close();
  rooms.stop();
  db.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();
