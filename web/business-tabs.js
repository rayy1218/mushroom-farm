// The Business strip (the integration, 2026-11-05; DESIGN.md "Business"): Summary · Batches · Inventory · Sales · Costs · Runs
// · Economics over each of the seven pages (Runs: spec 2026-11-05-runs-design.md 6; Summary, #/business: spec
// 2026-11-06-business-summary-design.md 2; Economics: spec 2026-11-06-economics-design.md 2), styled as the room page's tabs
// (their `.room-tabs` rules: underline tabs, the current one in ink on the accent line). On a phone the seven scroll
// sideways: the edge that has more fades while a tab is hidden there (the room page's data-more). app.js puts it above the
// page's own mount; the page itself does not know it is there.
//   businessTabs(current) → <nav class="room-tabs bz-tabs"> (current: a BUSINESS_TABS key)

import { BUSINESS_TABS } from './route.js';
import { scrollEdges } from './simulation-math.js';

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
  // measured once it is shown and at each change of its width (a ResizeObserver tells a new node's first size)
  const edges = () => { nav.dataset.more = scrollEdges(nav.scrollLeft, nav.clientWidth, nav.scrollWidth); };
  nav.addEventListener('scroll', edges, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(edges).observe(nav);
  return nav;
}
