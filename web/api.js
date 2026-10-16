// Talking to the farm server: one request() for every page.

export const OFFLINE = "Couldn't reach the farm server";
export const GONE = 'That room no longer exists';

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error ?? OFFLINE);
    this.status = status; // 0 when the server could not be reached
    this.field = data?.field;
  }
}

export async function request(method, path, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  init.signal = AbortSignal.timeout(10000);
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, null);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
