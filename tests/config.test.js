'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readConfig, pickHosts } = require('../server/config.js');

const root = '/repo';

describe('readConfig: sources', () => {
  test('port: env wins over file, which wins over defaults', () => {
    assert.equal(readConfig({}, null, root).port, 8080);
    assert.equal(readConfig({}, JSON.stringify({ port: 1234 }), root).port, 1234);
    assert.equal(readConfig({ FARM_PORT: '9999' }, JSON.stringify({ port: 1234 }), root).port, 9999);
  });
  test('db: env wins over file, which wins over defaults', () => {
    assert.equal(readConfig({}, null, root).db, path.join(root, 'data/farm.db'));
    assert.equal(readConfig({}, JSON.stringify({ db: 'x.db' }), root).db, path.resolve(root, 'x.db'));
    assert.equal(readConfig({ FARM_DB: 'y.db' }, JSON.stringify({ db: 'x.db' }), root).db, path.resolve(root, 'y.db'));
  });
  test('host: env wins over file, which wins over defaults', () => {
    assert.equal(readConfig({}, null, root).host, null);
    assert.equal(readConfig({}, JSON.stringify({ host: '10.0.0.1' }), root).host, '10.0.0.1');
    assert.equal(readConfig({ FARM_HOST: '10.0.0.2' }, JSON.stringify({ host: '10.0.0.1' }), root).host, '10.0.0.2');
  });
});

describe('readConfig: defaults', () => {
  test('fileText null, empty env', () => {
    assert.deepStrictEqual(readConfig({}, null, root), { port: 8080, db: path.join(root, 'data/farm.db'), host: null });
  });
});

describe('readConfig: paths', () => {
  test('a relative db (env or file) is resolved from root', () => {
    assert.equal(readConfig({}, JSON.stringify({ db: 'a/b.db' }), root).db, path.resolve(root, 'a/b.db'));
    assert.equal(readConfig({ FARM_DB: 'c/d.db' }, null, root).db, path.resolve(root, 'c/d.db'));
  });
  test('an absolute db stays as given', () => {
    assert.equal(readConfig({ FARM_DB: '/abs/e.db' }, null, root).db, '/abs/e.db');
  });
});

describe('readConfig: bad configuration', () => {
  function badReason(env, fileText) {
    assert.throws(() => readConfig(env, fileText, root), err => {
      assert.ok(err.message.startsWith('Bad configuration:'), err.message);
      return true;
    });
  }
  test('fileText not valid JSON', () => badReason({}, '{bad'));
  test('fileText not an object', () => badReason({}, '[]'));
  test('fileText unknown field', () => badReason({}, JSON.stringify({ bogus: 1 })));
  test('port 0 (file)', () => badReason({}, JSON.stringify({ port: 0 })));
  test('port 65536 (file)', () => badReason({}, JSON.stringify({ port: 65536 })));
  test('port 8080.5 (file)', () => badReason({}, JSON.stringify({ port: 8080.5 })));
  test('port "80a" (env)', () => badReason({ FARM_PORT: '80a' }, null));
  test('FARM_DB empty', () => badReason({ FARM_DB: '' }, null));
  test('FARM_HOST present but empty', () => badReason({ FARM_HOST: '' }, null));
  test('file db empty', () => badReason({}, JSON.stringify({ db: '' })));
  test('file host empty', () => badReason({}, JSON.stringify({ host: '' })));
});

describe('pickHosts', () => {
  function ifaceObj(...defs) {
    const out = {};
    for (const [name, address, internal, family] of defs) out[name] = [{ address, family: family || 'IPv4', internal }];
    return out;
  }

  test('skips internal, IPv6 and public addresses, and skipped name prefixes', () => {
    const ifaces = ifaceObj(
      ['lo', '127.0.0.1', true],
      ['docker0', '172.17.0.1', false],
      ['br-1a2b', '172.18.0.1', false],
      ['veth1234', '172.19.0.1', false],
      ['virbr0', '192.168.122.1', false],
      ['vmnet1', '192.168.50.1', false],
      ['tun0', '10.8.0.1', false],
      ['tap0', '10.9.0.1', false],
      ['zt0', '10.10.0.1', false],
      ['eth0', '203.0.113.5', false],
      ['eth1', '::1', false, 'IPv6'],
    );
    assert.deepStrictEqual(pickHosts(ifaces), []);
  });
  test('internal alone rejects an otherwise-valid private address', () => {
    // 10.1.1.1 is private and eth2 matches no skipped prefix; only `internal: true` should reject this entry.
    const ifaces = ifaceObj(['eth2', '10.1.1.1', true]);
    assert.deepStrictEqual(pickHosts(ifaces), []);
  });
  test('the IPv6 family alone rejects a private-looking address', () => {
    // 10.1.1.1 would pass the private-address check; only the IPv6 family should reject this entry.
    const ifaces = ifaceObj(['eth3', '10.1.1.1', false, 'IPv6']);
    assert.deepStrictEqual(pickHosts(ifaces), []);
  });
  test('the lo name prefix alone rejects a non-internal private address', () => {
    // Not internal, and 10.2.2.2 is private; only the `lo` name prefix should reject this entry.
    const ifaces = ifaceObj(['lo0', '10.2.2.2', false]);
    assert.deepStrictEqual(pickHosts(ifaces), []);
  });
  test('keeps private addresses on normal interfaces, sorted by name', () => {
    const ifaces = ifaceObj(
      ['wlp2s0', '192.168.1.20', false],
      ['eth0', '10.0.0.5', false],
      ['enp3s0', '172.16.0.5', false],
      ['wlan0', '192.168.1.21', false],
    );
    assert.deepStrictEqual(pickHosts(ifaces), [
      { name: 'enp3s0', address: '172.16.0.5' },
      { name: 'eth0', address: '10.0.0.5' },
      { name: 'wlan0', address: '192.168.1.21' },
      { name: 'wlp2s0', address: '192.168.1.20' },
    ]);
  });
  test('[] when nothing is left', () => {
    assert.deepStrictEqual(pickHosts({}), []);
  });
});
