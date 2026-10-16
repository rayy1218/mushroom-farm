// Starts the device: Modbus TCP side and control page, sharing one sensors store.

import { createSensors } from './sensors.js';
import { createModbusServer } from './modbus-server.js';
import { createDeviceHttp, createRequestLog } from './http.js';

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

const closeServer = (server) => new Promise((resolve) => server.close(resolve));

export async function startDevice({ modbusPort = 1502, httpPort = 8090, statePath, host = '127.0.0.1' } = {}) {
  const sensors = createSensors({ statePath });
  const log = createRequestLog();
  const modbus = createModbusServer(sensors, { onRequest: (entry) => log.add(entry) });
  const http = createDeviceHttp(sensors, log);

  const sockets = new Set();
  modbus.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  try {
    await listen(modbus, modbusPort, host);
    await listen(http, httpPort, host);
  } catch (err) {
    if (modbus.listening) await closeServer(modbus);
    throw err;
  }

  async function close() {
    for (const socket of sockets) socket.destroy();
    http.closeAllConnections();
    await Promise.all([closeServer(modbus), closeServer(http)]);
  }

  return { modbusPort: modbus.address().port, httpPort: http.address().port, sensors, close };
}
