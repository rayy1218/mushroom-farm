// Asks (spec 2026-11-12-data-integrity-design.md 5): a write that looks like a mistake (a duplicate, more sold than picked,
// an unlikely price or pick) is asked about once, not refused. The route answers 409 { error, asks: [{ kind, field, text }] }
// and writes nothing; the dialog shows each ask under its field and sends again with the kinds in `confirmed`.

import { HttpError } from './http-error.js';

export const ASK_KINDS = ['duplicate', 'pick', 'price', 'kg', 'oversell', 'before-picked', 'beyond', 'closed-month'];

export class AskError extends HttpError {
  constructor(asks) {
    super(409, 'Check before saving');
    this.asks = asks;
  }
}

// The kinds a body confirmed: its `confirmed` array's known kinds ([] for anything else).
export function confirmedOf(body) {
  const list = body !== null && typeof body === 'object' && Array.isArray(body.confirmed) ? body.confirmed : [];
  return list.filter((k) => ASK_KINDS.includes(k));
}

// Throws an AskError with the asks not confirmed; returns when every ask is confirmed (or there are none).
export function askOrThrow(asks, confirmed = []) {
  const open = asks.filter((a) => !confirmed.includes(a.kind));
  if (open.length) throw new AskError(open);
}
