// web/batches.js: the Batches pages (docs/contracts/harvest.md 12.3).
(function (global) {
'use strict';

let alive = false;

const dateToSeconds = () => null, secondsToDate = () => '', ageDays = () => 0, batchBody = () => ({});

function mount(el, params) { alive = true; }
function unmount() { alive = false; }

global.FarmShell.register('batches', { mount, unmount });

if (typeof module === 'object' && module && module.exports) module.exports = { dateToSeconds, secondsToDate, ageDays, batchBody };
})(typeof window !== 'undefined' ? window : globalThis);
