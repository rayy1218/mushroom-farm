// web/session.js
// Who is signed in (spec 2026-11-06-login-design.md 6): set once by boot.js from GET /api/session; <html data-role> follows
// it, so the CSS can hide what a worker may not use ([data-owner-only]).
let current = null;

export function setMe(who) {
  current = who;
  if (globalThis.document) document.documentElement.dataset.role = who?.role ?? '';
}

export const me = () => current;
export const isOwner = () => current?.role === 'owner';
