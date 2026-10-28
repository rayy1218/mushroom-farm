// The Modbus gateways: the farm's (FARM_GATEWAY) and the own gateway of a room behind one (rooms.gateway, a container). One
// client per distinct host:port, made when it is first asked for.

import { createModbusClient } from './modbus.js';

export const DEFAULT_GATEWAY = '127.0.0.1:1502';

// "host:port" → { host, port } (a port from 1 to 65535; the [ ] around an IPv6 address taken off), or null.
export function parseGateway(text) {
  const match = typeof text === 'string' ? /^(\S+):([0-9]{1,5})$/.exec(text) : null;
  const port = match ? Number(match[2]) : 0;
  if (port < 1 || port > 65535) return null;
  return { host: match[1].replace(/^\[(.*)\]$/, '$1'), port };
}

const keyOf = ({ host, port }) => `${port} ${host.toLowerCase()}`;

// Whether two gateway texts are the same gateway (host names ignore case); false when either is not one.
export function sameGateway(a, b) {
  const [x, y] = [parseGateway(a), parseGateway(b)];
  return x !== null && y !== null && keyOf(x) === keyOf(y);
}

// farm: { host, port } of the farm's gateway. make: createModbusClient, only replaced by tests.
// → { forRoom(gateway) → the client of a room's gateway text (null: the farm's), close() }.
export function createGateways({ farm, make = createModbusClient }) {
  const clients = new Map(); // keyOf → client

  return {
    forRoom(gateway) {
      const where = gateway == null ? farm : parseGateway(gateway);
      if (!where) throw new Error(`Not a gateway: "${gateway}"`);
      const key = keyOf(where);
      let client = clients.get(key);
      if (!client) clients.set(key, client = make({ host: where.host, port: where.port }));
      return client;
    },

    close() {
      for (const client of clients.values()) client.close();
      clients.clear();
    },
  };
}
