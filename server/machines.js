// Machine commands and status for a room (spec 2026-10-16-machines-design.md, sections 4.3 and 4.4).

import { ModbusError } from './modbus.js';
import { RELAY_KEYS, MODES, FANS } from './machine-codes.js';

// An error the API answers with status (and the field of the body when there is one).
export class CommandError extends Error {
  constructor(status, message, field) {
    super(message);
    this.name = 'CommandError';
    this.status = status;
    this.field = field;
  }
}

const SWITCHING_MS = 10_000;

// The relay machines a room may not have (spec 2026-10-21-dehumidifier-design.md 2, 2026-10-26-lighting-design.md 2):
// not fitted, they are never commanded and show as not-fitted.
export const FITTED = ['dehumidifier', 'lights'];
export const fitted = (room, key) => !FITTED.includes(key) || Boolean(room[key]);

// Still switching: the command is under 10 s old, or the latest poll began at or before it was sent
// (so that poll cannot have seen the write and a slow cycle never shows a false not-following).
const isSwitching = (sentAt, latest, now) => sentAt !== null && (now - sentAt < SWITCHING_MS || (latest?.at ?? Infinity) <= sentAt);

// Returns { on } for a valid relay body.
function relayBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new CommandError(400, 'Body must be a JSON object');
  if (typeof body.on !== 'boolean') throw new CommandError(400, 'on must be true or false', 'on');
  return { on: body.on };
}

// Returns { power, mode, setpoint, fan } for a valid aircon body.
function acBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new CommandError(400, 'Body must be a JSON object');
  const { power, mode, setpoint, fan } = body;
  if (typeof power !== 'boolean') throw new CommandError(400, 'power must be true or false', 'power');
  if (!MODES.includes(mode)) throw new CommandError(400, 'mode must be cool, heat, dry or fan', 'mode');
  if (typeof setpoint !== 'number' || !Number.isFinite(setpoint) || setpoint < 16 || setpoint > 30 || !Number.isInteger(setpoint * 2)) {
    throw new CommandError(400, 'setpoint must be a number from 16 to 30 in steps of 0.5', 'setpoint');
  }
  if (!FANS.includes(fan)) throw new CommandError(400, 'fan must be auto, low or high', 'fan');
  return { power, mode, setpoint, fan };
}

// db: the farm database. client: the Modbus client (writeCoil, writeRegisters). poller: machineState(roomId).
// now is injectable for the 10 s switching window.
export function createMachines({ db, client, poller, now = Date.now }) {
  const lastWrites = new Map(); // `${roomId}/${kind}` → { address, at, ok, error }

  function lastWriteOf(roomId, kind, address) {
    const w = lastWrites.get(`${roomId}/${kind}`);
    if (!w || w.address !== address) return null;
    return { at: w.at, ok: w.ok, error: w.error };
  }

  async function write(roomId, kind, address, send) {
    const at = now();
    let result;
    try {
      await send();
      result = { address, at, ok: true, error: null };
    } catch (err) {
      if (!(err instanceof ModbusError)) console.error(err); // not a gateway failure: a bug
      result = { address, at, ok: false, error: err instanceof ModbusError ? err.message : 'bad reply' };
    }
    lastWrites.set(`${roomId}/${kind}`, result);
  }

  // The polls of a device, only while the poller has them for the address the room has now.
  function pollsOf(state, address) {
    return address !== null && state.address === address ? state.polls : [];
  }

  function relayView(room, commands, state) {
    const address = room.relayAddress;
    const polls = pollsOf(state, address);
    const latest = polls.at(-1);
    const lastTwo = polls.length >= 2 && polls.every((p) => p.ok) ? polls : null;
    const switching = isSwitching(commands.sentAt, latest, now());
    const machines = RELAY_KEYS.map((key, i) => {
      const commanded = commands[key];
      const m = { key, commanded, reported: null, running: null, status: 'not-wired' };
      if (!fitted(room, key)) return { ...m, status: 'not-fitted' };
      if (address === null) return m;
      if (!latest) return { ...m, status: 'no-data' };
      if (!latest.ok) return { ...m, status: 'no-answer' };
      if (i >= latest.coils.length) return { ...m, status: 'no-data' }; // just fitted: the last poll did not read it yet
      m.reported = latest.coils[i];
      m.running = latest.inputs[i];
      if (m.reported !== commanded) m.status = switching ? 'switching' : 'not-following';
      else if (m.reported && lastTwo?.every((p) => p.coils[i] && !p.inputs[i])) m.status = 'not-running';
      else if (!m.reported && lastTwo?.every((p) => !p.coils[i] && p.inputs[i])) m.status = 'running-while-off';
      else m.status = m.reported ? 'on' : 'off';
      return m;
    });
    return { address, lastWrite: lastWriteOf(room.id, 'relay', address), machines };
  }

  function acView(room, commands, state) {
    const address = room.acAddress;
    const { sentAt, ...commanded } = commands;
    const view = {
      address,
      lastWrite: lastWriteOf(room.id, 'ac', address),
      commanded,
      reported: null,
      roomT: null,
      errorCode: null,
      status: 'not-wired',
    };
    if (address === null) return view;
    const latest = pollsOf(state, address).at(-1);
    if (!latest) return { ...view, status: 'no-data' };
    if (!latest.ok) return { ...view, status: 'no-answer' };
    view.reported = { power: latest.power, mode: latest.mode, setpoint: latest.setpoint, fan: latest.fan };
    view.roomT = latest.roomT;
    view.errorCode = latest.error;
    const follows = latest.power === commanded.power && latest.mode === commanded.mode && latest.fan === commanded.fan
      && Math.round(latest.setpoint * 10) === Math.round(commanded.setpoint * 10);
    if (latest.error !== 0) view.status = 'fault';
    else if (!follows) view.status = isSwitching(sentAt, latest, now()) ? 'switching' : 'not-following';
    else view.status = latest.power ? 'on' : 'off';
    return view;
  }

  // Drops what is remembered about a deleted room (room ids are reused).
  function forget(roomId) {
    lastWrites.delete(`${roomId}/relay`);
    lastWrites.delete(`${roomId}/ac`);
  }

  function get(roomId) {
    const room = db.getRoom(roomId);
    if (!room) {
      forget(roomId);
      return null;
    }
    const commands = db.getCommands(roomId);
    const state = poller.machineState(roomId);
    return { relay: relayView(room, commands.relay, state.relay), ac: acView(room, commands.ac, state.ac) };
  }

  return {
    get,
    forget,

    // key is a relay machine or 'ac'. Saves the command, then writes it and returns the machines object. unfitted: an off
    // command for a machine just taken out of the room (the room route), allowed although it is no longer fitted.
    // Throws CommandError (409 while automatic control is on, unless the controller itself sends with bypassAuto).
    // A failed write is not an error: it shows as lastWrite.
    async command(roomId, key, body, { bypassAuto = false, unfitted = false } = {}) {
      const room = db.getRoom(roomId);
      if (!room) throw new CommandError(404, 'Room not found');
      const index = RELAY_KEYS.indexOf(key);
      if (index < 0 && key !== 'ac') throw new CommandError(404, 'Not found');
      const source = bypassAuto ? 'auto' : 'manual'; // for the machine log
      if (!bypassAuto && db.getControl(roomId)?.auto) throw new CommandError(409, 'Automatic control is on');
      if (index >= 0) {
        const { on } = relayBody(body);
        if (!fitted(room, key) && !(unfitted && !on)) throw new CommandError(400, `This room has no ${key}`, key);
        if (room.relayAddress === null) throw new CommandError(400, 'No relay module address set');
        const address = room.relayAddress;
        db.setRelayCommand(roomId, key, on, now());
        db.logMachine(roomId, key, { on }, source, now());
        await write(roomId, 'relay', address, () => client.writeCoil(address, index, on));
      } else {
        const command = acBody(body);
        if (room.acAddress === null) throw new CommandError(400, 'No aircon gateway address set');
        const address = room.acAddress;
        db.setAcCommand(roomId, command, now());
        db.logMachine(roomId, 'ac', { on: command.power, setpoint: command.setpoint, mode: command.mode, fan: command.fan }, source, now());
        const values = [command.power ? 1 : 0, MODES.indexOf(command.mode), Math.round(command.setpoint * 10), FANS.indexOf(command.fan)];
        await write(roomId, 'ac', address, () => client.writeRegisters(address, 0, values));
      }
      return get(roomId);
    },
  };
}
