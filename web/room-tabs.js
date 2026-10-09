// web/room-tabs.js: the registry of the room page's tabs (docs/contracts/web.md section 3.9).
(function (global) {
'use strict';

const NAMES = Object.freeze(['live', 'simulate', 'calibrate']);
const tabs = new Map();

function register(name, tab) {
  if (!NAMES.includes(name)) throw new Error(`Unknown tab: ${name}`);
  tabs.set(name, tab);
}

function get(name) { return tabs.get(name); }

global.FarmRoomTabs = { register, get, NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
