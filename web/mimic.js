// web/mimic.js: the room drawing, shared by the Test bench and the room Overview tab (C13 2). Stub until the Drawing stream builds it.
(function (global) {
'use strict';

function create() { return { paint() {}, tick() {}, destroy() {} }; }
function fromReading() { return null; }

global.FarmMimic = { create, fromReading };
})(typeof window !== 'undefined' ? window : globalThis);
