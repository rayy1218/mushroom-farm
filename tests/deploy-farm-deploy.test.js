// The deploy CI (README "Deploys"): deploy/oracle/farm-deploy against a temp FARM_ROOT and root-only STATE_DIR, with stub
// systemctl, journalctl, curl and df and a real node:sqlite database; ci-deploy.sh through a stub ssh; the scripts'
// syntax; the workflow's text. The stub app "starts" by bringing the database to its server/db.js VERSION; markers in its
// server/main.js break it. Run as a plain user, with FARM_DEPLOY_TEST=1 and no SUDO_USER, so the overrides count.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, utimesSync, symlinkSync, linkSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const ORACLE = join(REPO, 'deploy/oracle');
const FARM_DEPLOY = join(ORACLE, 'farm-deploy');
const OLD_SHA = 'a'.repeat(40);
const SHA = 'b'.repeat(40);
const DEVICE_UNITS = ['mushroom-device', 'mushroom-gateway@alpha', 'mushroom-gateway@beta', 'mushroom-gateway@gamma'];

const has = (cmd) => spawnSync('bash', ['-c', `command -v ${cmd}`]).status === 0;
const missing = process.platform !== 'linux' ? 'needs Linux (GNU tools)'
  : !has('bash') ? 'no bash' : !has('flock') ? 'no flock' : !has('tar') ? 'no tar' : null;
const skip = missing ? `skipped: ${missing}` : false;

const STUBS = {
  // logs each call; is-active fails for the units in FAKE_INACTIVE; (re)starting the farm app runs the stub app
  systemctl: `#!/usr/bin/env bash
echo "$*" >>"$FAKE_CALLS"
case "$1" in
  is-active) for u in $FAKE_INACTIVE; do [[ "$3" == "$u" ]] && exit 3; done; exit 0 ;;
  start|restart)
    # FAKE_CORRUPT_CODE_TAR: the broken new app's start also spoils root's code tar, so the rollback cannot take it back
    if [[ -n "\${FAKE_CORRUPT_CODE_TAR:-}" ]] && grep -q FAKE_BROKEN "$FARM_ROOT/server/main.js"; then
      for f in "$STATE_DIR"/code/*.tar.gz; do echo spoilt >"$f"; done
    fi
    for u in "\${@:2}"; do [[ "$u" == mushroom-farm ]] && exec node --disable-warning=ExperimentalWarning "$FAKE_APP"; done ;;
esac
exit 0
`,
  journalctl: `#!/usr/bin/env bash
if grep -q FAKE_LOGS_ERROR "$FARM_ROOT/server/main.js"; then echo "Error: the stub app failed"; fi
echo "Farm app on http://localhost:8080"
`,
  // answers what the installed stub app would: / 200 (500 when broken), /api/... 401
  curl: `#!/usr/bin/env bash
url="\${@: -1}"
if [[ -n "\${FAKE_ALWAYS_BROKEN:-}" ]] || grep -q FAKE_BROKEN "$FARM_ROOT/server/main.js"; then printf 500; exit 0; fi
case "$url" in */api/*) printf 401 ;; *) printf 200 ;; esac
`,
  df: `#!/usr/bin/env bash
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "/dev/fake 99999999 1 \${FAKE_FREE_KB:-99999999} 1% /"
`,
};

// the stub app's start: the database to its code's VERSION (unless FAKE_NO_MIGRATE), and a row saying so
const APP = `
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const root = process.env.FARM_ROOT;
if (readFileSync(root + '/server/main.js', 'utf8').includes('FAKE_NO_MIGRATE')) process.exit(0);
const version = Number(/const VERSION = (\\d+);/.exec(readFileSync(root + '/server/db.js', 'utf8'))[1]);
const db = new DatabaseSync(root + '/data/v2.db');
db.exec('PRAGMA user_version = ' + version);
db.prepare('INSERT INTO notes (text) VALUES (?)').run('started ' + version);
db.close();
`;

const OLD_CODE = {
  'package.json': '{"name":"mushroom-farm"}\n',
  'server/main.js': '// old main\n',
  'server/db.js': 'const VERSION = 5;\n',
  'device/main.js': '// old device\n',
  'web/index.html': '<p>old</p>\n',
  'deploy/oracle/mushroom-farm.service': '[Service]\n# old\n',
  'deploy/oracle/mushroom-device.service': '[Service]\n# device\n',
};
const NEW_CODE = {
  ...OLD_CODE,
  'server/main.js': '// new main\n',
  'server/db.js': 'const VERSION = 6;\n',
  'web/index.html': '<p>new</p>\n',
  'deploy/oracle/mushroom-farm.service': '[Service]\n# new\n',
};

function writeTree(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

function setup(t) {
  const base = mkdtempSync(join(tmpdir(), 'farm-deploy-test-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'farm');
  const bin = join(base, 'bin');
  writeTree(root, OLD_CODE);
  writeTree(root, { 'device/state.json': '{"sim":1}\n', 'device/state.json.sim': '{"sim":2}\n', 'data/gateways/alpha.json': '{"g":1}\n',
  });
  writeTree(join(base, 'state'), { DEPLOYED: `${OLD_SHA}\n` });
  const db = new DatabaseSync(join(root, 'data/v2.db'));
  db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT); PRAGMA user_version = 5');
  db.prepare('INSERT INTO notes (text) VALUES (?)').run('before');
  db.close();
  mkdirSync(bin);
  for (const [name, text] of Object.entries(STUBS)) {
    writeFileSync(join(bin, name), text);
    chmodSync(join(bin, name), 0o755);
  }
  writeFileSync(join(base, 'app.mjs'), APP);
  writeTree(join(base, 'systemd'), { 'mushroom-farm.service': OLD_CODE['deploy/oracle/mushroom-farm.service'],
    'mushroom-device.service': OLD_CODE['deploy/oracle/mushroom-device.service'] });
  mkdirSync(join(base, 'work'));
  const { SUDO_USER: _, ...outer } = process.env;
  const env = {
    ...outer, FARM_DEPLOY_TEST: '1', FARM_ROOT: root, STATE_DIR: join(base, 'state'), LOG_FILE: join(base, 'deploy.log'), LOCK_FILE: join(base, 'deploy.lock'),
    SYSTEMD_DIR: join(base, 'systemd'), WORK_PARENT: join(base, 'work'), FARM_OWNER: `${process.getuid()}:${process.getgid()}`,
    AS_FARM: '', SYSTEMCTL: join(bin, 'systemctl'), JOURNALCTL: join(bin, 'journalctl'), CURL: join(bin, 'curl'), DF: join(bin, 'df'),
    HEALTH_TIMEOUT: '5', HEALTH_POLL: '0.1', HEALTH_SETTLE: '0', FAKE_CALLS: join(base, 'calls'), FAKE_APP: join(base, 'app.mjs'),
  };
  writeFileSync(env.FAKE_CALLS, '');
  return {
    base, root, bin, env,
    release(files = NEW_CODE, extra = () => {}) {
      const dir = mkdtempSync(join(base, 'release-'));
      writeTree(dir, files);
      extra(dir);
      const names = readdirSync(dir);
      return spawnSync('tar', ['-czf', '-', '-C', dir, ...names], { maxBuffer: 1 << 26 }).stdout;
    },
    deploy(input, { sha = SHA, env: more = {} } = {}) {
      const r = spawnSync('bash', [FARM_DEPLOY, sha], { input, env: { ...env, ...more }, encoding: 'utf8' });
      return { status: r.status, out: r.stdout + r.stderr };
    },
    calls: () => readFileSync(env.FAKE_CALLS, 'utf8').split('\n').filter(Boolean),
    read: (path) => readFileSync(join(root, path), 'utf8'),
    db(path = join(root, 'data/v2.db')) {
      const d = new DatabaseSync(path, { readOnly: true });
      try {
        return {
          version: d.prepare('PRAGMA user_version').get().user_version,
          notes: d.prepare('SELECT text FROM notes ORDER BY id').all().map((r) => r.text),
          check: Object.values(d.prepare('PRAGMA quick_check').get())[0],
        };
      } finally { d.close(); }
    },
    dbBackups: () => readdirSync(join(root, 'data/backups')).sort(),
    codeBackups: () => readdirSync(join(base, 'state/code')).sort(),
    deployed: () => readFileSync(join(base, 'state/DEPLOYED'), 'utf8'),
    log: () => readFileSync(env.LOG_FILE, 'utf8'),
  };
}

const listTar = (path) => spawnSync('tar', ['-tzf', path], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

test('a good release: database backed up and opening, code replaced, data and simulator state kept, DEPLOYED written', { skip }, (t) => {
  const s = setup(t);
  const r = s.deploy(s.release());
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, new RegExp(`DEPLOYED ${SHA}`));
  assert.equal(s.read('server/main.js'), '// new main\n');
  assert.equal(s.read('web/index.html'), '<p>new</p>\n');
  assert.equal(s.read('device/state.json'), '{"sim":1}\n');
  assert.equal(s.read('device/state.json.sim'), '{"sim":2}\n');
  assert.equal(s.read('data/gateways/alpha.json'), '{"g":1}\n');
  assert.equal(s.deployed(), `${SHA}\n`);
  assert.deepEqual(s.db(), { version: 6, notes: ['before', 'started 6'], check: 'ok' });

  const [backup] = s.dbBackups();
  assert.match(backup, new RegExp(`^v2\\.db\\.before-${SHA}-\\d{8}T\\d{6}Z$`));
  assert.deepEqual(s.db(join(s.root, 'data/backups', backup)), { version: 5, notes: ['before'], check: 'ok' });
  assert.deepEqual(s.codeBackups(), [`code-${OLD_SHA}.tar.gz`]);
  const tarred = listTar(join(s.base, 'state/code', `code-${OLD_SHA}.tar.gz`));
  assert.ok(tarred.includes('server/main.js') && tarred.includes('deploy/oracle/mushroom-farm.service'));
  assert.ok(!tarred.some((p) => p.startsWith('device/state.json') || p.startsWith('data')), tarred.join());

  const calls = s.calls();
  assert.ok(calls.indexOf('stop mushroom-farm') < calls.indexOf('restart mushroom-farm'), calls.join('\n'));
  assert.ok(!calls.includes('daemon-reload'));
  assert.ok(!calls.some((c) => c.startsWith('restart mushroom-device')), 'device apps left alone');
  // a changed unit is reported, never installed
  assert.equal(readFileSync(join(s.base, 'systemd/mushroom-farm.service'), 'utf8'), '[Service]\n# old\n');
  assert.match(r.out, /unit mushroom-farm\.service changed: not installed by deploys/);
  assert.equal(existsSync(join(s.root, 'DEPLOYED')), false, 'nothing of root\'s in the farm tree');
  assert.match(readFileSync(s.env.LOG_FILE, 'utf8'), /DEPLOYED/);
});

test('a release that changes device/ restarts the device apps and checks they run', { skip }, (t) => {
  const s = setup(t);
  const r = s.deploy(s.release({ ...NEW_CODE, 'device/main.js': '// new device\n' }));
  assert.equal(r.status, 0, r.out);
  const calls = s.calls();
  assert.ok(calls.includes(`restart ${DEVICE_UNITS.join(' ')}`), calls.join('\n'));
  for (const u of DEVICE_UNITS) assert.ok(calls.includes(`is-active --quiet ${u}`), u);
  assert.equal(s.read('device/main.js'), '// new device\n');
  assert.equal(s.read('device/state.json'), '{"sim":1}\n');

  // a gateway's env file alone changed: the device apps restart too
  writeFileSync(s.env.FAKE_CALLS, '');
  const again = s.deploy(s.release({ ...NEW_CODE, 'device/main.js': '// new device\n', 'deploy/oracle/gateway-alpha.env': 'DEVICE_HTTP_PORT=8092\n' }),
    { sha: 'c'.repeat(40) });
  assert.equal(again.status, 0, again.out);
  assert.ok(s.calls().includes(`restart ${DEVICE_UNITS.join(' ')}`), s.calls().join('\n'));
});

test('a success keeps the newest 5 database backups and 10 code tars', { skip }, (t) => {
  const s = setup(t);
  mkdirSync(join(s.root, 'data/backups'));
  mkdirSync(join(s.base, 'state/code'));
  const old = Date.now() / 1000 - 86_400;
  for (let i = 0; i < 7; i++) {
    const f = join(s.root, 'data/backups', `v2.db.before-${String(i).repeat(40)}-2026010${i}T000000Z`);
    writeFileSync(f, '');
    utimesSync(f, old + i, old + i);
  }
  for (let i = 0; i < 12; i++) {
    const f = join(s.base, 'state/code', `code-${i.toString(16).padStart(40, 'c')}.tar.gz`);
    writeFileSync(f, '');
    utimesSync(f, old + i, old + i);
  }
  // a name the app's user made: a newline and a workflow command must not reach the public log
  const hostile = join(s.root, 'data/backups', 'v2.db.before-x\n::warning title=pwned::pwned');
  writeFileSync(hostile, '');
  utimesSync(hostile, old - 10, old - 10);
  const r = s.deploy(s.release());
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /::warning|pwned/);
  assert.match(r.out, /pruned 4 database backups/);
  assert.match(s.log(), /pruned database backups:\n[\s\S]*v2\.db\.before-x\\n::warning title=pwned::pwned/);
  assert.equal(existsSync(hostile), false);
  const db = s.dbBackups();
  assert.equal(db.length, 5);
  assert.ok(db.some((f) => f.startsWith(`v2.db.before-${SHA}`)), 'this deploy\'s backup kept');
  assert.ok(db.includes(`v2.db.before-${'6'.repeat(40)}-20260106T000000Z`) && !db.includes(`v2.db.before-${'2'.repeat(40)}-20260102T000000Z`));
  const code = s.codeBackups();
  assert.equal(code.length, 10);
  assert.ok(code.includes(`code-${OLD_SHA}.tar.gz`));
  assert.ok(!code.includes(`code-${'2'.padStart(40, 'c')}.tar.gz`), 'oldest pruned');
});

for (const [why, marker, pattern] of [
  ['the app does not answer', 'FAKE_BROKEN', /GET \/ answered 500/],
  ['the database is not at the code\'s version', 'FAKE_NO_MIGRATE', /database version 5, the code's is 6/],
  ['the journal has an Error', 'FAKE_LOGS_ERROR', /"Error" in the mushroom-farm journal/],
]) {
  test(`a failed health check (${why}) puts the old code and database back: ROLLED BACK`, { skip }, (t) => {
    const s = setup(t);
    // a rogue app in the farm tree: a unit running as root, a link where an old build kept its code tar, a swapped tar
    writeFileSync(join(s.root, 'deploy/oracle/mushroom-farm.service'), '[Service]\nUser=root\n');
    const victim = join(s.base, 'victim-root-file');
    writeFileSync(victim, 'root:x:0:0\n');
    writeTree(s.root, { [`backups/code-${OLD_SHA}.tar.gz`]: 'planted' });
    symlinkSync(victim, join(s.root, 'backups', `code-${OLD_SHA}.tar.gz.partial`));
    const r = s.deploy(s.release({ ...NEW_CODE, 'server/main.js': `// new main ${marker}\n`, 'device/main.js': '// new device\n' }));
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, pattern);
    assert.match(r.out, new RegExp(`ROLLED BACK to ${OLD_SHA}`));
    assert.equal(s.read('server/main.js'), '// old main\n');
    assert.equal(s.read('server/db.js'), 'const VERSION = 5;\n');
    assert.equal(s.read('device/main.js'), '// old device\n');
    assert.equal(s.read('device/state.json'), '{"sim":1}\n');
    assert.equal(s.read('web/index.html'), '<p>old</p>\n');
    assert.equal(s.deployed(), `${OLD_SHA}\n`);
    assert.equal(readFileSync(join(s.base, 'systemd/mushroom-farm.service'), 'utf8'), '[Service]\n# old\n');
    assert.equal(readFileSync(victim, 'utf8'), 'root:x:0:0\n');
    // the backup's database, then the old app's own start
    const db = s.db();
    assert.equal(db.version, 5);
    assert.ok(!db.notes.includes('started 6'), db.notes.join());
    assert.equal(existsSync(join(s.root, 'data/v2.db-journal')), false);
    const calls = s.calls();
    assert.equal(calls.filter((c) => c === `restart ${DEVICE_UNITS.join(' ')}`).length, 2, 'device apps restarted on the old code too');
    // the journal's lines stay on the VM: the Actions log is public
    assert.doesNotMatch(r.out, /the stub app failed/);
    if (marker === 'FAKE_LOGS_ERROR') assert.match(s.log(), /Error: the stub app failed/);
  });
}

test('low disk: refused before anything stops or changes', { skip }, (t) => {
  const s = setup(t);
  const r = s.deploy(s.release(), { env: { FAKE_FREE_KB: '1' } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /REFUSED: only 0 MB free/);
  assert.deepEqual(s.calls(), []);
  assert.equal(s.read('server/main.js'), '// old main\n');
});

test('a backup that fails: refused, code untouched, the app started again, no half backup left', { skip }, (t) => {
  const s = setup(t);
  writeFileSync(join(s.root, 'data/v2.db'), 'not a database '.repeat(500));
  const r = s.deploy(s.release());
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /REFUSED: the database backup failed/);
  assert.deepEqual(s.calls(), ['stop mushroom-farm', 'start mushroom-farm']);
  assert.equal(s.read('server/main.js'), '// old main\n');
  assert.deepEqual(s.dbBackups(), []);
  assert.equal(s.deployed(), `${OLD_SHA}\n`);
});

test('a second deploy while one runs is refused (exit 75)', { skip }, async (t) => {
  const s = setup(t);
  const ready = join(s.base, 'locked');
  const holder = spawn('flock', [s.env.LOCK_FILE, 'bash', '-c', `touch '${ready}'; sleep 10`]);
  t.after(() => holder.kill());
  for (let i = 0; i < 100 && !existsSync(ready); i++) await new Promise((res) => setTimeout(res, 50));
  const r = s.deploy(s.release());
  assert.equal(r.status, 75, r.out);
  assert.match(r.out, /another deploy is running/);
  assert.deepEqual(s.calls(), []);
});

test('a bad sha is refused', { skip }, (t) => {
  const s = setup(t);
  for (const sha of ['', 'abc123', 'B'.repeat(40), `${'b'.repeat(40)};id`, `../${'b'.repeat(37)}`]) {
    const r = s.deploy(s.release(), { sha });
    assert.equal(r.status, 1, `${sha}: ${r.out}`);
    assert.match(r.out, /REFUSED: give the full 40-character commit sha/);
  }
  assert.deepEqual(s.calls(), []);
  assert.equal(s.read('server/main.js'), '// old main\n');
});

test('bad tarballs are refused before anything stops or changes', { skip }, (t) => {
  const s = setup(t);
  const { 'server/main.js': _, ...noMain } = NEW_CODE;
  const cases = [
    ['nothing', Buffer.alloc(0), /empty tarball/],
    ['not a tarball', Buffer.from('hello'.repeat(100)), /not a gzip tarball/],
    ['no server/main.js', s.release(noMain), /no server\/main\.js/],
    ['a path outside the code', s.release(NEW_CODE, (dir) => writeTree(dir, { 'data/v2.db': 'x' })), /paths outside the code/],
    ['a symlink', s.release(NEW_CODE, (dir) => symlinkSync('/etc/passwd', join(dir, 'server/link'))), /links, special files/],
    ['no VERSION', s.release({ ...NEW_CODE, 'server/db.js': '// none\n' }), /no VERSION/],
    ['a hard link', s.release(NEW_CODE, (dir) => linkSync(join(dir, 'server/main.js'), join(dir, 'server/hard'))), /links, special files/],
    ['a setuid file', s.release(NEW_CODE, (dir) => chmodSync(join(dir, 'server/main.js'), 0o4755)), /set-id\/sticky modes/],
    ['a setgid file', s.release(NEW_CODE, (dir) => chmodSync(join(dir, 'server/main.js'), 0o2755)), /set-id\/sticky modes/],
    ['a sticky folder', s.release(NEW_CODE, (dir) => chmodSync(join(dir, 'web'), 0o1777)), /set-id\/sticky modes/],
  ];
  // names GNU tar will not write: through Python's tarfile
  if (has('python3')) {
    const crafted = (name) => spawnSync('python3', ['-I', '-c', `
import io, sys, tarfile
out = io.BytesIO()
with tarfile.open(fileobj=out, mode='w:gz') as tar:
    for name in ['package.json', 'server/main.js', sys.argv[1]]:
        info = tarfile.TarInfo(name)
        info.size = 2
        tar.addfile(info, io.BytesIO(b'x\\n'))
sys.stdout.buffer.write(out.getvalue())
`, name], { maxBuffer: 1 << 20 }).stdout;
    cases.push(['an absolute path', crafted('/etc/cron.d/x'), /paths outside the code/]);
    cases.push(['a ../ path', crafted('server/../../etc/x'), /\.\.\/ in the tarball|paths outside the code/]);
  }
  for (const [name, input, pattern] of cases) {
    const r = s.deploy(input);
    assert.equal(r.status, 1, `${name}: ${r.out}`);
    assert.match(r.out, pattern, name);
  }
  assert.deepEqual(s.calls(), []);
  assert.equal(s.read('server/main.js'), '// old main\n');
  assert.equal(s.deployed(), `${OLD_SHA}\n`);
});

test('a release unit running as root, or an extra unit, is never installed; the deploy goes on with the installed ones', { skip }, (t) => {
  const s = setup(t);
  const evil = '[Service]\nUser=root\nExecStart=/bin/sh -c "id > /root/pwned"\n';
  const r = s.deploy(s.release({ ...NEW_CODE, 'deploy/oracle/mushroom-farm.service': evil, 'deploy/oracle/ssh.service': evil }));
  assert.equal(r.status, 0, r.out);
  assert.equal(readFileSync(join(s.base, 'systemd/mushroom-farm.service'), 'utf8'), '[Service]\n# old\n');
  assert.equal(existsSync(join(s.base, 'systemd/ssh.service')), false);
  assert.match(r.out, /unit mushroom-farm\.service changed: not installed by deploys; install it by hand with setup-deploy\.sh/);
  assert.match(r.out, /unit ssh\.service changed: not installed/);
  assert.ok(!s.calls().includes('daemon-reload'));
});

test('a rollback that cannot take the code back: exit 3, ROLLBACK FAILED', { skip }, (t) => {
  const s = setup(t);
  const r = s.deploy(s.release({ ...NEW_CODE, 'server/main.js': '// new FAKE_BROKEN\n' }), { env: { FAKE_CORRUPT_CODE_TAR: '1' } });
  assert.equal(r.status, 3, r.out);
  assert.match(r.out, /the code backup fails its check: not a gzip tarball/);
  assert.match(r.out, /ROLLBACK FAILED/);
  assert.equal(s.deployed(), `${OLD_SHA}\n`);
});

test('a rollback whose old code is unhealthy too: exit 3, look now', { skip }, (t) => {
  const s = setup(t);
  const r = s.deploy(s.release(), { env: { FAKE_ALWAYS_BROKEN: '1' } });
  assert.equal(r.status, 3, r.out);
  assert.match(r.out, new RegExp(`ROLLED BACK to ${OLD_SHA}, but it fails its health check too: look now`));
  assert.equal(s.read('server/main.js'), '// old main\n');
  assert.equal(s.db().version, 5);
});

test('set-id modes in the current code: refused before the app stops, since the rollback could not take it back', { skip }, (t) => {
  const s = setup(t);
  chmodSync(join(s.root, 'server/main.js'), 0o4755);
  const r = s.deploy(s.release());
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /REFUSED: the current code cannot be rolled back to: links, special files or set-id\/sticky modes/);
  assert.equal(s.read('server/main.js'), '// old main\n');
  assert.deepEqual(s.codeBackups(), []);
  assert.deepEqual(s.calls(), [], 'the app never stopped');
  assert.ok(!existsSync(join(s.root, 'data/backups')) || readdirSync(join(s.root, 'data/backups')).length === 0, 'no database backup');
});

test('a release that unpacks to more than the limit or the free space is refused', { skip }, (t) => {
  const s = setup(t);
  const big = s.release({ ...NEW_CODE, 'web/big.bin': '\0'.repeat(3 * 1024 * 1024) });
  let r = s.deploy(big, { env: { MAX_UNPACKED_MB: '2' } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /REFUSED: the tarball unpacks to over 2 MB/);
  r = s.deploy(big, { env: { FAKE_FREE_KB: '2048' } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /REFUSED: the tarball unpacks to 3 MB, 2 MB free/);
  assert.deepEqual(s.calls(), []);
});

test('through sudo the environment does not count: the VM\'s own paths', { skip: skip || (process.getuid() === 0 && 'skipped: as root') }, (t) => {
  const s = setup(t);
  const r = s.deploy(s.release(), { sha: 'not-a-sha', env: { SUDO_USER: 'someone' } });
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /\/var\/log\/farm-deploy\.log|\/run\/farm-deploy\.lock/);
  assert.equal(existsSync(s.env.LOG_FILE), false, 'the test log path was ignored');
  assert.deepEqual(s.calls(), []);
});

test('ci-deploy.sh streams git archive of the commit through ssh to farm-deploy', { skip: skip || (!has('git') && 'skipped: no git') }, (t) => {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: REPO, encoding: 'utf8' });
  if (top.status !== 0) return t.skip('not a git checkout');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  const s = setup(t);
  // the stub ssh: logs its arguments, then runs farm-deploy here with the last word of the remote command, as the VM's
  // forced command does
  writeFileSync(join(s.bin, 'ssh'), `#!/usr/bin/env bash
printf '%s\\n' "$@" >"$FAKE_SSH_ARGS"
cmd="\${@: -1}"
exec bash "$FAKE_FARM_DEPLOY" "\${cmd##* }"
`);
  chmodSync(join(s.bin, 'ssh'), 0o755);
  const env = {
    ...s.env, PATH: `${s.bin}:${process.env.PATH}`, FAKE_SSH_ARGS: join(s.base, 'ssh-args'), FAKE_FARM_DEPLOY: FARM_DEPLOY,
    DEPLOY_HOST: 'vm.example.ts.net', DEPLOY_SSH_KEY: 'FAKE-PRIVATE-KEY-TEXT', DEPLOY_KNOWN_HOSTS: 'vm.example.ts.net ssh-ed25519 AAAAfake',
  };
  const r = spawnSync('bash', [join(ORACLE, 'ci-deploy.sh'), head], { cwd: REPO, env, encoding: 'utf8' });
  const out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  assert.match(out, new RegExp(`Deploying ${head} .* to deploy@vm\\.example\\.ts\\.net`));
  assert.match(out, new RegExp(`DEPLOYED ${head}`));
  assert.doesNotMatch(out, /FAKE-PRIVATE-KEY-TEXT/);
  const args = readFileSync(env.FAKE_SSH_ARGS, 'utf8').split('\n');
  assert.ok(args.includes('BatchMode=yes') && args.includes('StrictHostKeyChecking=yes') && args.includes('IdentitiesOnly=yes'), args.join(' '));
  assert.ok(args.includes('deploy@vm.example.ts.net'));
  assert.ok(args.includes(`sudo /usr/local/sbin/farm-deploy ${head}`));
  assert.equal(s.read('server/main.js'), readFileSync(join(REPO, 'server/main.js'), 'utf8'));
  assert.equal(s.deployed(), `${head}\n`);
  assert.equal(s.read('device/state.json'), '{"sim":1}\n');
});

test('ci-deploy.sh tries again while another deploy holds the lock (exit 75), then stops trying', { skip: skip || (!has('git') && 'skipped: no git') }, (t) => {
  if (spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).status !== 0) return t.skip('not a git checkout');
  const s = setup(t);
  const count = join(s.base, 'ssh-count');
  // the stub ssh: 75 for the first FAKE_BUSY tries, then 0; reads the tarball like the VM would
  writeFileSync(join(s.bin, 'ssh'), `#!/usr/bin/env bash
cat >/dev/null
n=$(( $(cat "${count}" 2>/dev/null || echo 0) + 1 ))
echo "$n" >"${count}"
(( n > FAKE_BUSY )) && exit 0
exit 75
`);
  chmodSync(join(s.bin, 'ssh'), 0o755);
  const run = (busy) => {
    rmSync(count, { force: true });
    const env = { ...s.env, PATH: `${s.bin}:${process.env.PATH}`, DEPLOY_HOST: 'vm.example.ts.net', DEPLOY_LOCK_WAIT: '0', DEPLOY_LOCK_TRIES: '3',
      FAKE_BUSY: String(busy) };
    const r = spawnSync('bash', [join(ORACLE, 'ci-deploy.sh'), 'HEAD'], { cwd: REPO, env, encoding: 'utf8' });
    return { status: r.status, out: r.stdout + r.stderr, tries: Number(readFileSync(count, 'utf8')) };
  };
  let r = run(2);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.tries, 3);
  assert.match(r.out, /Another deploy is running; trying again in 0 s \(2 of 3\)/);
  r = run(5);
  assert.equal(r.status, 75, r.out);
  assert.equal(r.tries, 3);
});

test('the deploy scripts parse (bash -n) and, when shellcheck is here, pass it', { skip: !has('bash') && 'skipped: no bash' }, () => {
  const scripts = ['farm-deploy', 'ci-deploy.sh', 'setup-deploy.sh', 'setup-vm.sh', 'push-code.sh'].map((f) => join(ORACLE, f));
  for (const f of scripts) {
    const r = spawnSync('bash', ['-n', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
  if (has('shellcheck')) {
    const r = spawnSync('shellcheck', ['-S', 'warning', ...scripts], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
});

test('the Deploy workflow: after main\'s Tests pass, the tested commit, one at a time, a notice without secrets', () => {
  const yml = readFileSync(join(REPO, '.github/workflows/deploy.yml'), 'utf8');
  assert.match(yml, /on:\n {2}workflow_run:\n {4}workflows: \[Tests\]\n {4}types: \[completed\]\n {4}branches: \[main\]\n {2}workflow_dispatch:/);
  assert.match(yml, /github\.event\.workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.event == 'push'\n\s+&& github\.event\.workflow_run\.head_repository\.full_name == github\.repository\)/);
  assert.match(yml, /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(yml, /concurrency:\n {2}group: deploy\n {2}cancel-in-progress: false/);
  assert.match(yml, /\npermissions:\n {2}contents: read\n\n/);
  // the deploy job alone gets an OIDC token, for Tailscale's workload identity federation
  assert.match(yml, /\n {4}environment: production\n {4}permissions:\n {6}contents: read\n {6}actions: read[^\n]*\n {6}id-token: write[^\n]*\n {4}env:/);
  assert.equal(yml.match(/id-token: write/g).length, 1);
  assert.doesNotMatch(yml, /TS_OAUTH_SECRET|oauth-secret/);
  assert.match(yml, /DEPLOY_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
  for (const name of ['TS_OAUTH_CLIENT_ID', 'TS_AUDIENCE', 'DEPLOY_SSH_KEY', 'DEPLOY_HOST', 'DEPLOY_KNOWN_HOSTS']) {
    assert.match(yml, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`), name);
  }
  assert.match(yml, /::notice title=Deploy skipped::No secret/);
  assert.match(yml, /echo "ready=false"/);
  // by hand: only after Tests passed on that commit
  assert.match(yml, /github\.event_name == 'workflow_dispatch'\n\s+run: \|\n\s+passed="\$\(gh api "repos\/\$GITHUB_REPOSITORY\/actions\/workflows\/test\.yml\/runs\?head_sha=\$DEPLOY_SHA&status=success/);
  // anything but a positive count (empty, an error text) refuses
  assert.match(yml, /\(\( \$\{passed:-0\} > 0 \)\) \|\| \{/);
  // actions pinned to full commit shas; no git credentials left on the runner
  const uses = [...yml.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.deepEqual(uses.map((u) => u.split('@')[0]), ['actions/checkout', 'tailscale/github-action']);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, u);
  assert.match(yml, /actions\/checkout@[0-9a-f]{40} # v4\n\s+with:\n\s+ref: \$\{\{ env\.DEPLOY_SHA \}\}\n\s+persist-credentials: false/);
  assert.match(yml, /tailscale\/github-action@[0-9a-f]{40} # v4\n\s+with:\n\s+oauth-client-id: \$\{\{ secrets\.TS_OAUTH_CLIENT_ID \}\}\n\s+audience: \$\{\{ secrets\.TS_AUDIENCE \}\}\n\s+tags: tag:ci\n\s+ping: \$\{\{ secrets\.DEPLOY_HOST \}\}/);
  assert.match(yml, /run: bash deploy\/oracle\/ci-deploy\.sh "\$DEPLOY_SHA"/);
  // expressions never reach a run: line directly
  for (const line of yml.split('\n').filter((l) => /^\s+run: /.test(l))) assert.doesNotMatch(line, /\$\{\{/);
  const runs = yml.split(/\n\s+- name: /).map((step) => step.split(/\n\s+run: \|?/)[1] ?? '');
  for (const body of runs) assert.doesNotMatch(body, /\$\{\{/);
});

test('the scripts run by path keep their executable bit in git (a 644 ci-deploy.sh failed the first deploy with "Permission denied")', { skip: !has('git') && 'skipped: no git' }, () => {
  const out = spawnSync('git', ['ls-files', '-s', 'deploy/oracle'], { cwd: REPO, encoding: 'utf8' }).stdout;
  const mode = (name) => out.split('\n').find((l) => l.endsWith(`deploy/oracle/${name}`))?.split(' ')[0];
  for (const name of ['ci-deploy.sh', 'farm-deploy', 'push-code.sh', 'push-data.sh', 'setup-vm.sh']) assert.equal(mode(name), '100755', name);
});
