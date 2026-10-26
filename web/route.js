// Hash router: which page does a location hash mean? Anything unknown means the Overview.

// The room page's tabs; the first has no name in the address (#/rooms/7), the others do (#/rooms/7/charts).
export const ROOM_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'charts', label: 'Charts' },
  { key: 'control', label: 'Control' },
  { key: 'crop', label: 'Crop' },
  { key: 'sensors', label: 'Sensors' },
  { key: 'energy', label: 'Energy' },
  { key: 'simulations', label: 'Simulations' },
];
const NAMED_TABS = ROOM_TABS.slice(1).map((t) => t.key);
const ID = '([1-9][0-9]{0,14})';

// The address of a room's page on a tab (an unknown tab: the Overview tab).
export function roomHash(id, tab = 'overview') {
  return NAMED_TABS.includes(tab) ? `#/rooms/${id}/${tab}` : `#/rooms/${id}`;
}

export function parseRoute(hash) {
  const run = new RegExp(`^#/rooms/${ID}/simulations/${ID}/?$`).exec(hash ?? '');
  if (run) return { name: 'simulation', id: Number(run[1]), runId: Number(run[2]) };
  const m = new RegExp(`^#/rooms/${ID}(?:/([a-z]+))?/?$`).exec(hash ?? '');
  if (m && (m[2] === undefined || NAMED_TABS.includes(m[2]))) return { name: 'detail', id: Number(m[1]), tab: m[2] ?? 'overview' };
  if (/^#\/rooms\/?$/.test(hash ?? '')) return { name: 'list' };
  if (/^#\/settings\/?$/.test(hash ?? '')) return { name: 'settings' };
  return { name: 'overview' };
}

export function isCanonical(hash) {
  if (hash === '#/overview' || hash === '#/rooms' || hash === '#/settings') return true;
  if (/^#\/rooms\/[1-9][0-9]{0,14}\/simulations\/[1-9][0-9]{0,14}$/.test(hash ?? '')) return true;
  const route = parseRoute(hash);
  return route.name === 'detail' && hash === roomHash(route.id, route.tab);
}
