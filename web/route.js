// Hash router: which page does a location hash mean? Anything unknown means the list.

export function parseRoute(hash) {
  const m = /^#\/rooms\/([1-9][0-9]{0,14})\/?$/.exec(hash ?? '');
  if (m) return { name: 'detail', id: Number(m[1]) };
  if (/^#\/settings\/?$/.test(hash ?? '')) return { name: 'settings' };
  return { name: 'list' };
}

export function isCanonical(hash) {
  return hash === '#/rooms' || hash === '#/settings' || /^#\/rooms\/[1-9][0-9]{0,14}$/.test(hash ?? '');
}
