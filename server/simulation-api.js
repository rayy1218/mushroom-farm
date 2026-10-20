// The simulation routes (spec 2026-10-20-crops-and-simulation-design.md 4.4), called from api.js:
// POST and GET /api/rooms/:id/simulations, GET (?result=0 without the result) and DELETE /api/simulations/:id.

const ROOM_ROUTE = /^\/api\/rooms\/([1-9][0-9]{0,14})\/simulations$/;
const RUN_ROUTE = /^\/api\/simulations\/([1-9][0-9]{0,14})$/;

// → async (req, res, path, { send, readJson, HttpError }) that answers true when the path is one of its routes.
export function createSimulationRoutes({ db, simulations }) {
  return async function simulationRoutes(req, res, path, { send, readJson, HttpError }) {
    const room = ROOM_ROUTE.exec(path);
    if (room) {
      const roomId = Number(room[1]);
      if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(404, 'Not found');
      if (!db.getRoom(roomId)) throw new HttpError(404, 'Room not found');
      if (req.method === 'GET') return send(res, 200, db.listRuns(roomId)) ?? true;
      const result = simulations.start(roomId, await readJson(req));
      if (result.error) throw new HttpError(result.conflict ? 409 : 400, result.error, result.field);
      return send(res, 202, result.run) ?? true;
    }
    const run = RUN_ROUTE.exec(path);
    if (!run) return false;
    const id = Number(run[1]);
    if (req.method === 'GET') {
      // ?result=0: the run without its result (a few MB for a long run), for polling the status.
      const withResult = new URL(req.url, 'http://farm').searchParams.get('result') !== '0';
      const found = db.getRun(id, { withResult });
      if (!found) throw new HttpError(404, 'Simulation not found');
      return send(res, 200, found) ?? true;
    }
    if (req.method !== 'DELETE') throw new HttpError(404, 'Not found');
    if (!simulations.cancel(id)) throw new HttpError(404, 'Simulation not found');
    res.writeHead(204);
    res.end();
    return true;
  };
}
