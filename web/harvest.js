// web/harvest.js: the phone page and the stickers page (docs/contracts/harvest.md 12.4, 12.5).
(function (global) {
'use strict';

let alive = false;

const parseKg = () => null, summaryText = () => '', stickerLink = () => '', isLocalHost = () => false, qrSvg = () => '';

function mount(el, params) { alive = true; }
function unmount() { alive = false; }

global.FarmShell.register('harvest', { mount, unmount });

if (typeof module === 'object' && module && module.exports) module.exports = { parseKg, summaryText, stickerLink, isLocalHost, qrSvg };
})(typeof window !== 'undefined' ? window : globalThis);
