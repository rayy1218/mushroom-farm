// Talking to the farm server: one request() for every page.

export const OFFLINE = "Couldn't reach the farm server";
export const GONE = 'That room no longer exists';
// The page files are read from disk, so after an update the page can be newer than the running farm app.
export const OUTDATED = 'The farm app is older than this page: restart the farm app (npm start) to use this';

// A 404 for a route the running server does not have (its reply is a plain "Not found"; a missing room or run says so).
export const routeMissing = (err) => err?.status === 404 && err.message === 'Not found';

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error ?? OFFLINE);
    this.status = status; // 0 when the server could not be reached
    this.field = data?.field;
  }
}

// timeout in ms; commands go through the server's shared Modbus queue and can take longer than a read.
export async function request(method, path, body, timeout = 10000) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  init.signal = AbortSignal.timeout(timeout);
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, null);
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    if (res.ok) throw new ApiError(0, null); // a good status with a body that could not be read (cut off, too slow)
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
