// A worker thread that runs one job and reports to its parent: a simulation (simulate.js) or, with kind 'sizing', a search for
// machines (sizing.js):
// { type: 'progress', share }, then { type: 'done', result } or { type: 'error', message }.

import { parentPort, workerData } from 'node:worker_threads';
import { simulate } from './simulate.js';
import { runSizing } from './sizing.js';

const onProgress = (share) => parentPort.postMessage({ type: 'progress', share });

try {
  const result = workerData.kind === 'sizing'
    ? runSizing(workerData.input, workerData.ctx, { onProgress, simulate })
    : simulate(workerData.input, workerData.ctx, { onProgress });
  parentPort.postMessage({ type: 'done', result });
} catch (err) {
  parentPort.postMessage({ type: 'error', message: err.message });
}
