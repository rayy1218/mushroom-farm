// The first owner, and a lost owner password (spec 2026-11-06-login-design.md 5): npm run owner -- "<name>" asks for the
// password twice without showing it and makes the worker of that name (any case; added when missing) an active owner with
// it, signed out everywhere. Run it on the farm computer as the app's user with the app's FARM_DB. From a pipe it reads the
// two lines as they come (tests).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { hashSecret, passwordError } from './auth.js';

const MAX_NAME = 40; // the workers' rule (server/tasks.js)

// → the message for a name that cannot be an owner's, or null.
export function nameError(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > MAX_NAME || /[\u0000-\u001f\u007f]/.test(trimmed)) return `Give a name of 1 to ${MAX_NAME} characters`;
  return null;
}

// → { id, name } (the name as stored: an existing worker keeps their spelling) or { error }.
export async function setOwnerPassword(db, name, password) {
  const bad = nameError(name) || passwordError(password);
  if (bad) return { error: bad };
  const id = db.setOwner(name.trim(), await hashSecret(password));
  return { id, name: db.account(id).name };
}

// One typed key at a hidden prompt. state = { text, esc, cr }; → the next state, plus done (Enter) or stop (Ctrl+C, or
// Ctrl+D on an empty line). Other control keys and whole escape sequences (the arrow keys) are ignored.
export function applyKey(state, ch) {
  const { text, esc } = state;
  if (esc) { // inside an escape sequence: ESC, then [ or O, then up to a final byte
    if (esc.length === 1) return { text, esc: ch === '[' || ch === 'O' ? esc + ch : '', cr: false };
    return { text, esc: ch >= '@' && ch <= '~' ? '' : esc + ch, cr: false };
  }
  if (ch === '\n' && state.cr) return { text, esc: '', cr: false }; // the \n of a \r\n
  const next = { text, esc: '', cr: ch === '\r' };
  if (ch === '\r' || ch === '\n') return { ...next, done: true };
  if (ch === '\u0003' || (ch === '\u0004' && !text)) return { ...next, stop: true };
  if (ch === '\u001b') return { ...next, esc: ch };
  if (ch === '\u007f' || ch === '\b') {
    next.text = [...new Intl.Segmenter().segment(text)].slice(0, -1).map((g) => g.segment).join('');
    return next;
  }
  if (ch < ' ') return next;
  next.text = text + ch;
  return next;
}

// One line typed at the terminal, not shown. `keys` carries the \r across prompts.
function askHidden(question, keys) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    stdin.setRawMode(true);
    process.once('exit', () => { if (stdin.isRaw) stdin.setRawMode(false); });
    stdin.setEncoding('utf8');
    stdin.resume();
    keys.text = '';
    keys.esc = '';
    const finish = () => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    function onData(chunk) {
      for (const ch of chunk) {
        const result = applyKey(keys, ch);
        Object.assign(keys, { text: result.text, esc: result.esc, cr: result.cr });
        if (result.stop) { finish(); reject(new Error('Stopped')); return; }
        if (result.done) { finish(); resolve(keys.text); return; }
      }
    }
    stdin.on('data', onData);
  });
}

// → { first(), second() }: the two lines, asked one after the other (from a pipe, read together).
function passwordReader() {
  if (!process.stdin.isTTY) {
    const [first = '', second = ''] = readFileSync(0, 'utf8').split(/\r?\n/);
    return { first: async () => first, second: async () => second };
  }
  const keys = { text: '', esc: '', cr: false };
  return {
    first: () => askHidden('Password (12 characters or more): ', keys),
    second: () => askHidden('Again: ', keys),
  };
}

const fail = (message) => { console.error(message); process.exit(1); };

async function main() {
  const name = process.argv[2];
  if (!name) fail('Usage: npm run owner -- "<name>"');
  const badName = nameError(name);
  if (badName) fail(badName);
  const reader = passwordReader();
  const password = await reader.first();
  const badPassword = passwordError(password);
  if (badPassword) fail(badPassword);
  if (password !== await reader.second()) fail('The two passwords differ');
  const db = openDb(process.env.FARM_DB || fileURLToPath(new URL('../data/v2.db', import.meta.url)));
  let result;
  try {
    result = await setOwnerPassword(db, name, password);
  } finally {
    db.close();
  }
  if (result.error) fail(result.error);
  console.log(`${result.name} is an owner and can sign in with that password.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message === 'Stopped' ? 'Stopped' : `Could not set the owner: ${err.message} (is FARM_DB the farm app's database, and are you its user?)`);
    process.exit(1);
  });
}
