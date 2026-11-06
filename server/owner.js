// The first owner, and a lost owner password (spec 2026-11-06-login-design.md 5): npm run owner -- "<name>" asks for the
// password twice without showing it and makes the worker of that name (any case; added when missing) an active owner with
// it, signed out everywhere. Run it on the farm computer as the app's user with the app's FARM_DB. From a pipe it reads the
// two lines as they come (tests).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { hashSecret, passwordError } from './auth.js';

const MAX_NAME = 40; // the workers' rule (server/tasks.js)

// → { id } or { error }.
export async function setOwnerPassword(db, name, password) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > MAX_NAME || /[\u0000-\u001f\u007f]/.test(trimmed)) return { error: `Give a name of 1 to ${MAX_NAME} characters` };
  const problem = passwordError(password);
  if (problem) return { error: problem };
  return { id: db.setOwner(trimmed, await hashSecret(password)) };
}

// One line typed at the terminal, not shown.
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    let text = '';
    const done = () => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    function onData(chunk) {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') { done(); resolve(text); return; }
        if (ch === '\u0003') { done(); reject(new Error('Stopped')); return; } // Ctrl+C
        text = ch === '\u007f' || ch === '\b' ? text.slice(0, -1) : text + ch;
      }
    }
    stdin.on('data', onData);
  });
}

async function readPasswords() {
  if (!process.stdin.isTTY) {
    const [first = '', second = ''] = readFileSync(0, 'utf8').split(/\r?\n/);
    return [first, second];
  }
  return [await askHidden('Password (12 characters or more): '), await askHidden('Again: ')];
}

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: npm run owner -- "<name>"');
    process.exit(1);
  }
  const [password, again] = await readPasswords();
  if (password !== again) {
    console.error('The two passwords differ');
    process.exit(1);
  }
  const db = openDb(process.env.FARM_DB || fileURLToPath(new URL('../data/v2.db', import.meta.url)));
  const result = await setOwnerPassword(db, name, password);
  db.close();
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(`${name.trim()} is an owner and can sign in with that password.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
