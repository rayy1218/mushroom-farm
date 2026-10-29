// Hash router: which page does a location hash mean? Anything unknown means the Overview.

// The room page's tabs (redesign 2026-10-28: five, for the three jobs check, act and set up); the first has no name in the
// address (#/rooms/7), the others do (#/rooms/7/history).
export const ROOM_TABS = [
  { key: 'now', label: 'Now' },
  { key: 'history', label: 'History' },
  { key: 'crop', label: 'Crop' },
  { key: 'simulations', label: 'Simulations' },
  { key: 'setup', label: 'Setup' },
];
const NAMED_TABS = ROOM_TABS.slice(1).map((t) => t.key);
// The nine tabs before the redesign: an old address (a bookmark, a link) opens the tab that holds that part now.
const OLD_TABS = { overview: 'now', charts: 'history', energy: 'history', climate: 'setup', sensors: 'setup', profile: 'setup', equipment: 'setup' };
const tabOf = (tab) => OLD_TABS[tab] ?? tab;
const ID = '([1-9][0-9]{0,14})';

// The address of a room's page on a tab (an unknown tab: the Now tab).
export function roomHash(id, tab = 'now') {
  const t = tabOf(tab);
  return NAMED_TABS.includes(t) ? `#/rooms/${id}/${t}` : `#/rooms/${id}`;
}

// The address of a room's Suggest machines page (owner 2026-10-28: a page of its own, out of the Simulate dialog).
export const suggestHash = (id) => `#/rooms/${id}/suggest`;

export function parseRoute(hash) {
  const run = new RegExp(`^#/rooms/${ID}/simulations/${ID}/?$`).exec(hash ?? '');
  if (run) return { name: 'simulation', id: Number(run[1]), runId: Number(run[2]) };
  const suggest = new RegExp(`^#/rooms/${ID}/suggest/?$`).exec(hash ?? '');
  if (suggest) return { name: 'suggest', id: Number(suggest[1]) };
  const m = new RegExp(`^#/rooms/${ID}(?:/([a-z]+))?/?$`).exec(hash ?? '');
  const tab = m && m[2] !== undefined ? tabOf(m[2]) : 'now';
  if (m && (tab === 'now' || NAMED_TABS.includes(tab)) && m[2] !== 'now') return { name: 'detail', id: Number(m[1]), tab };
  // #/rooms (the Rooms list until 2026-10-28) is the Overview now: it holds every room and Add room.
  if (/^#\/settings\/?$/.test(hash ?? '')) return { name: 'settings' };
  return { name: 'overview' };
}

// The one address of a route (an address that is not it is tidied to it).
export function canonicalHash(route) {
  if (route.name === 'simulation') return `#/rooms/${route.id}/simulations/${route.runId}`;
  if (route.name === 'suggest') return suggestHash(route.id);
  if (route.name === 'detail') return roomHash(route.id, route.tab);
  return route.name === 'settings' ? '#/settings' : '#/overview';
}

export function isCanonical(hash) {
  return hash === canonicalHash(parseRoute(hash));
}
