// server/config.js: configuration and listen-address rules (C3 sections 2.1, 2.2). Pure: reads no file, no
// environment of its own.
'use strict';
const path = require('node:path');

const SKIP_PREFIXES = ['docker', 'br-', 'veth', 'virbr', 'vmnet', 'tun', 'tap', 'lo', 'zt'];

function bad(reason) {
  throw new Error(`Bad configuration: ${reason}`);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parsePort(value, source) {
  if (source === 'env') {
    if (!/^[0-9]+$/.test(value)) bad(`FARM_PORT must be a whole number from 1 to 65535, got "${value}"`);
    const n = Number(value);
    if (n < 1 || n > 65535) bad(`FARM_PORT must be from 1 to 65535, got ${n}`);
    return n;
  }
  if (!Number.isInteger(value) || value < 1 || value > 65535) bad(`port must be an integer from 1 to 65535 in farm.config.json, got ${JSON.stringify(value)}`);
  return value;
}

function readConfig(env, fileText, root) {
  let fromFile = {};
  if (fileText !== null && fileText !== undefined) {
    let parsed;
    try {
      parsed = JSON.parse(fileText);
    } catch (err) {
      bad(`farm.config.json is not valid JSON: ${err.message}`);
    }
    if (!isPlainObject(parsed)) bad('farm.config.json must be a JSON object');
    for (const k of Object.keys(parsed)) {
      if (!['port', 'db', 'host'].includes(k)) bad(`farm.config.json has an unknown field "${k}"`);
    }
    fromFile = parsed;
  }

  let port;
  if (Object.hasOwn(env, 'FARM_PORT')) port = parsePort(env.FARM_PORT, 'env');
  else if (Object.hasOwn(fromFile, 'port')) port = parsePort(fromFile.port, 'file');
  else port = 8080;

  let db;
  if (Object.hasOwn(env, 'FARM_DB')) {
    if (env.FARM_DB === '') bad('FARM_DB must not be empty');
    db = env.FARM_DB;
  } else if (Object.hasOwn(fromFile, 'db')) {
    if (typeof fromFile.db !== 'string' || fromFile.db === '') bad('db must be a non-empty string in farm.config.json');
    db = fromFile.db;
  } else {
    db = 'data/farm.db';
  }
  db = path.resolve(root, db);

  let host;
  if (Object.hasOwn(env, 'FARM_HOST')) {
    if (env.FARM_HOST === '') bad('FARM_HOST must not be empty');
    host = env.FARM_HOST;
  } else if (Object.hasOwn(fromFile, 'host')) {
    if (typeof fromFile.host !== 'string' || fromFile.host === '') bad('host must be a non-empty string in farm.config.json');
    host = fromFile.host;
  } else {
    host = null;
  }

  return { port, db, host };
}

function isPrivateV4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function pickHosts(interfaces) {
  const out = [];
  for (const name of Object.keys(interfaces)) {
    if (SKIP_PREFIXES.some(p => name.startsWith(p))) continue;
    const entries = interfaces[name] || [];
    for (const entry of entries) {
      if (entry.internal) continue;
      if (entry.family !== 'IPv4' && entry.family !== 4) continue;
      if (!isPrivateV4(entry.address)) continue;
      out.push({ name, address: entry.address });
    }
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

module.exports = { readConfig, pickHosts };
