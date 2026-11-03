// The readings' line icons (owner 2026-11-03, "icon" on the reading cards): a thermometer, a drop, CO₂ bubbles and dew on a
// surface, 24 × 24 strokes in currentColor, coloured by the reading's series hue (the Series Identity Rule in DESIGN.md: the
// hue carries the quantity from its card to its chart), dew point in ink-2 (it has no chart). Beside the reading's name, so
// hidden from screen readers. On the Now tab's reading cards, the Overview's room and Outdoor cards and the History charts.
//   readingIcon(key) → <svg class="r-ico"> (key: 't', 'rh', 'co2', 'dew'; the room page's 'T', 'RH', 'CO2' too)

export const READING_ICONS = {
  t: '<path d="M10 14V5a2 2 0 014 0v9a4 4 0 11-4 0z"/><path d="M12 14v-4"/>',
  rh: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  co2: '<circle cx="9" cy="15" r="4.5"/><circle cx="16.5" cy="8.5" r="3"/><circle cx="17.5" cy="17.5" r="1.8"/>',
  dew: '<path d="M12 3s4.5 5 4.5 8.5a4.5 4.5 0 01-9 0C7.5 8 12 3 12 3z"/><path d="M4 20h16"/>',
};

const NS = 'http://www.w3.org/2000/svg';

export const readingKey = (key) => String(key).toLowerCase();

export function readingIcon(key, size = 18) {
  const k = readingKey(key);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'r-ico');
  svg.dataset.reading = k;
  svg.innerHTML = Object.hasOwn(READING_ICONS, k) ? READING_ICONS[k] : '';
  return svg;
}
