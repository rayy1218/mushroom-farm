// Hash router: which page does a location hash mean? Anything unknown means the Overview.

export function parseRoute(hash) {
  const m = /^#\/rooms\/([1-9][0-9]{0,14})\/?$/.exec(hash ?? '');
  if (m) return { name: 'detail', id: Number(m[1]) };
  if (/^#\/rooms\/?$/.test(hash ?? '')) return { name: 'list' };
  if (/^#\/settings\/?$/.test(hash ?? '')) return { name: 'settings' };
  return { name: 'overview' };
}

export function isCanonical(hash) {
  return hash === '#/overview' || hash === '#/rooms' || hash === '#/settings' || /^#\/rooms\/[1-9][0-9]{0,14}$/.test(hash ?? '');
}
