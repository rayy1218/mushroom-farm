// A worker thread that runs one simulation (simulate.js) and reports to its parent:
// { type: 'progress', share }, then { type: 'done', result } or { type: 'error', message }.

import { parentPort, workerData } from 'node:worker_threads';
import { simulate } from './simulate.js';

try {
  const result = simulate(workerData.input, workerData.ctx, { onProgress: (share) => parentPort.postMessage({ type: 'progress', share }) });
  parentPort.postMessage({ type: 'done', result });
} catch (err) {
  parentPort.postMessage({ type: 'error', message: err.message });
}
