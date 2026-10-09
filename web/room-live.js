// web/room-live.js: the Live tab of a room (docs/contracts/web.md sections 3.4, 3.9, 7.9; air.md section 7).
(function (global) {
'use strict';

const todo = name => () => { throw new Error(`${name} is not built yet`); };
const helpers = {};
for (const n of ['airLive', 'airSub', 'windowQuery', 'gapFor', 'reconnectQuery', 'chartTargets', 'toChartPoint', 'retarget',
  'mergePoints', 'mergeEvent', 'readingTexts', 'machineLines', 'commandFromReading', 'programText', 'alarmTexts', 'detailChanges',
  'countText', 'changeLines', 'versionText', 'rebase']) helpers[n] = todo(n);

function mount() {}
function unmount() {}

global.FarmRoomTabs.register('live', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
