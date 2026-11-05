// The Business strip (the integration, 2026-11-05; DESIGN.md "Business"): Batches · Inventory · Sales · Costs over each of
// the four pages, styled as the room page's tabs (their `.room-tabs` rules: underline tabs, the current one in ink on the
// accent line). app.js puts it above the page's own mount; the page itself does not know it is there.
//   businessTabs(current) → <nav class="room-tabs bz-tabs"> (current: a BUSINESS_TABS key)

import { BUSINESS_TABS } from './route.js';

export function businessTabs(current) {
  const nav = document.createElement('nav');
  nav.className = 'room-tabs bz-tabs';
  nav.setAttribute('aria-label', 'Business');
  for (const t of BUSINESS_TABS) {
    const a = document.createElement('a');
    a.href = t.hash;
    a.dataset.tab = t.key;
    const label = document.createElement('span');
    label.textContent = t.label;
    a.append(label);
    if (t.key === current) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  return nav;
}
