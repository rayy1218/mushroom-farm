// web/room-simulate.js: the Simulate tab of the room page (docs/contracts/web.md 3.10).
(function (global) {
'use strict';

const stub = () => { throw new Error('not built yet'); };
const helpers = { toCapacityMix: stub, toMixRows: stub, sameMix: stub, appliedCalib: stub, runInputs: stub, cycleSummary: stub, stageRows: stub,
  seriesPoints: stub, runRowTexts: stub, progressText: stub, machinesText: stub, clampBlocks: stub, clampCo2: stub, regionText: stub };

function mount() {}
function unmount() {}

global.FarmRoomTabs.register('simulate', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
