// CSV cells shared by the tasks log and the harvests CSV. No imports.

// One CSV cell: quoted when it holds a comma, quote or line break; a text starting like a formula gets a ' first.
export function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
