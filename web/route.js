// Hash router: which page does a location hash mean? Anything unknown means the list.

export function parseRoute(hash) {
  const m = /^#\/rooms\/([1-9][0-9]{0,14})\/?$/.exec(hash ?? '');
  if (m) return { name: 'detail', id: Number(m[1]) };
  return { name: 'list' };
}

export function isCanonical(hash) {
  return hash === '#/rooms' || /^#\/rooms\/[1-9][0-9]{0,14}$/.test(hash ?? '');
}
