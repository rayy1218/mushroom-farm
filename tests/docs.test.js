// Docs: the README, docs/contract.md and docs/phase3-plan.md must agree with the code they describe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const DOCS = ['README.md', 'docs/contract.md', 'docs/phase3-plan.md'];
// Markdown table rows, and the first cell of a row
const rows = md => md.split('\n').filter(l => l.trimStart().startsWith('|'));
const firstCell = l => (l.split('|')[1] || '').trim();
// The 18 Reading keys, in order (C1 6.2, lead decision 20)
const READING_KEYS = ['room_id', 't', 'T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint', 'fog', 'air', 'lights', 'circ', 'power_w', 'kwh', 'ac_fan', 'stage', 'core'];

test('docs: relative links resolve', () => {
  const dead = [];
  for (const doc of DOCS) {
    for (const m of read(doc).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue;
      if (!fs.existsSync(path.join(ROOT, path.dirname(doc), target.split('#')[0]))) dead.push(`${doc}: ${target}`);
    }
  }
  assert.deepEqual(dead, [], `dead links:\n${dead.join('\n')}`);
});

test('docs: README npm commands are package.json scripts', () => {
  const md = read('README.md');
  const names = [...md.matchAll(/\bnpm run ([\w:-]+)/g)].map(m => m[1]).concat([...md.matchAll(/\bnpm (start|test)\b/g)].map(m => m[1]));
  const missing = names.filter(n => !Object.hasOwn(pkg.scripts, n));
  assert.deepEqual(missing, [], `README names npm scripts that package.json does not have: ${missing.join(', ')}`);
  assert.doesNotMatch(md, /\bnpm (install|ci)\b/);
});

test('docs: README names the Node version of package.json', () => {
  const md = read('README.md');
  const min = pkg.engines.node.replace(/^>=\s*/, '');
  assert.ok(md.includes(`Node.js ${min}`), `README must say "Node.js ${min}"`);
  assert.doesNotMatch(md, /Node\.js 20\b/);
});

test('docs: README configuration and messages match the server', () => {
  const md = read('README.md');
  const code = read('server/main.js') + read('server/config.js');
  const names = ['FARM_PORT', 'FARM_DB', 'FARM_HOST', 'farm.config.json', '8080', 'Open http://', 'Farm network addresses:',
    'No farm network address found', 'Bad configuration:', 'Cannot open the database:', 'Cannot listen on', 'Database error:',
    'Cannot start the rooms:'];
  for (const n of names) {
    assert.ok(md.includes(n), `README must contain "${n}"`);
    assert.ok(code.includes(n), `the server code must contain "${n}"`);
  }
  assert.ok(md.includes('data/farm.db'), 'README must contain data/farm.db');
  assert.ok(code.includes('farm.db'), 'the server code must contain farm.db');
  assert.ok(md.includes('Cannot open the harvest records:'), 'README must contain the harvest records message');
  if (code.includes('openHarvest')) assert.ok(code.includes('Cannot open the harvest records:'), 'main.js opens the harvest store, so it must print the message');
});

test('docs: README service matches the start script', () => {
  const lines = read('README.md').split('\n');
  const exec = lines.filter(l => l.startsWith('ExecStart='));
  assert.equal(exec.length, 1, 'README must have exactly one ExecStart= line');
  assert.equal(exec[0].replace(/^ExecStart=\S*node\s+/, ''), pkg.scripts.start.replace(/^node\s+/, ''));
  assert.ok(lines.includes('Restart=on-failure'), 'README unit must restart on failure');
  assert.ok(lines.includes('Environment=TZ=Asia/Kuala_Lumpur'), 'README unit must run in the farm time zone');
});

test('docs: README names every top-level file and folder', () => {
  const md = read('README.md');
  const missing = [];
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    const n = e.name;
    if (n.startsWith('.') || n === 'node_modules' || n === 'data') continue;
    if (!(e.isDirectory() || /\.(js|html|css|json)$/.test(n))) continue;
    if (!md.includes('`' + n + '`') && !md.includes('`' + n + '/`')) missing.push(n);
  }
  assert.deepEqual(missing, [], `README does not name: ${missing.join(', ')}`);
  if (!fs.existsSync(path.join(ROOT, 'app.js'))) assert.ok(!md.includes('app.js'), 'README names app.js, which does not exist');
  assert.doesNotMatch(md, /Open `index\.html`/);
  assert.doesNotMatch(md, /No server/i);
});

test('docs: README lists the 18 Reading keys', () => {
  const md = read('README.md');
  const cells = rows(md).map(firstCell);
  for (const k of READING_KEYS) assert.ok(cells.includes('`' + k + '`'), `README needs a table row for the Reading key ${k}`);
  assert.ok(!cells.includes('`fan`'), 'README must not have a fan row (C9: air)');
  assert.doesNotMatch(md, /\bvent\b/);
});

test('docs: README room statuses and air exchange', () => {
  const md = read('README.md');
  for (const s of ['All good', 'Out of band', 'alarm', 'Stopped']) assert.ok(md.includes(s), `README must contain "${s}"`);
  assert.match(md, /air exchange/i);
  assert.ok(md.includes('`airM3h`'));
  require('../air.js');
  require('../controller.js');
  assert.ok('airM3h' in globalThis.ClimateController.defaultSettings());
});

test('docs: README upgrades, stickers and farm time zone', () => {
  const md = read('README.md');
  const lines = md.split('\n');
  let table = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('|') && (i === 0 || !lines[i - 1].trimStart().startsWith('|')) && lines[i].includes('Upgrade')) {
      table = [];
      for (let j = i; j < lines.length && lines[j].trimStart().startsWith('|'); j++) table.push(lines[j]);
      break;
    }
  }
  assert.ok(table, 'README needs a table whose header has "Upgrade"');
  const cells = table.map(firstCell);
  const versions = require('../server/db.js').UPGRADES.map(u => u.version);
  for (const v of versions.filter(v => v >= 2)) assert.ok(cells.includes(String(v)), `the upgrade table needs a row for upgrade ${v}`);
  for (const t of ['#/harvest/stickers', 'fixed address', 'TZ=Asia/Kuala_Lumpur']) assert.ok(md.includes(t), `README must contain "${t}"`);
});

// A real simulated adapter, made with the factory arguments of C2 12.2
function adapter() {
  require('../air.js');
  require('../controller.js');
  const { createSimAdapter } = require('../server/sim-adapter.js');
  return createSimAdapter({ room: { id: 1, name: 'Room 1', volume: 60, adapter: 'sim', created_at: 0, archived_at: null }, calib: null, blocks: null, equipment: null, cfg: globalThis.ClimateController.defaultSettings(), snapshot: null, now: () => 1791446400 });
}

test('docs: contract.md lists every member of the server adapter', () => {
  const cells = rows(read('docs/contract.md')).map(firstCell);
  const a = adapter();
  for (const k of Object.keys(a).filter(k => k !== 'io')) assert.ok(cells.some(c => c.includes('`' + k + '()`')), `contract.md needs a table row for ${k}()`);
  for (const k of Object.keys(a.io)) assert.ok(cells.some(c => c.includes('`io.' + k + '(')), `contract.md needs a table row for io.${k}(`);
});

test('docs: contract.md lists every field of a simulated reading', () => {
  const cells = rows(read('docs/contract.md')).map(firstCell);
  const r = adapter().io.read();
  for (const k of Object.keys(r)) assert.ok(cells.some(c => c.includes('`' + k + '`')), `contract.md needs a table row for the reading field ${k}`);
});

test('docs: phase3-plan marks the covered work items', () => {
  const table = rows(read('docs/phase3-plan.md'));
  const header = table.find(l => l.includes('| # |') && l.includes('Status'));
  assert.ok(header, 'the work items table needs a Status column');
  const col = header.split('|').map(c => c.trim()).indexOf('Status');
  const status = id => {
    const row = table.find(l => firstCell(l) === id);
    assert.ok(row, `no row for work item ${id}`);
    return row.split('|')[col].trim();
  };
  for (const id of ['3.1', '3.3', '3.7']) assert.ok(status(id).startsWith('Covered'), `${id} must be Covered`);
  for (const id of ['3.2', '3.4', '3.5', '3.6', '3.8']) assert.equal(status(id), 'Open', `${id} must be Open`);
});
