// What the Overview page and the nav badge read from the server. The alarm routes belong to the alarms feature
// and may be missing (404): the rest still shows.

import { request as realRequest } from './api.js';
import { sortAlarms, badgeCount } from './overview-math.js';


// Loads the overview and the current alarms side by side; each part fails on its own.
// Returns { overview (null when unreadable), alarms (every current one, critical first then newest; the page puts the active
//           ones first and folds the cleared ones, spec 2026-11-12-alarms-triage-design.md 5),
//           failed: { overview, alarms } } where alarms counts as failed only for something other than a 404.
export async function loadOverview(request = realRequest) {
  const [o, a] = await Promise.allSettled([request('GET', '/api/overview'), request('GET', '/api/alarms')]);
  const overview = o.status === 'fulfilled' ? o.value : null;
  // Without /api/alarms the overview's own (shorter) list is used.
  const alarms = a.status === 'fulfilled' ? a.value : overview?.alarms ?? [];
  return {
    overview,
    alarms: sortAlarms(alarms),
    failed: { overview: o.status === 'rejected', alarms: a.status === 'rejected' && a.reason?.status !== 404 },
  };
}

// The number for the nav badge: 0 when the alarm route does not exist, null when the server did not answer (keep the last number).
export async function loadBadge(request = realRequest) {
  try {
    return badgeCount(await request('GET', '/api/alarms'));
  } catch (err) {
    return err.status === 404 ? 0 : null;
  }
}
