// The server's asks (spec 2026-11-12-data-integrity-design.md 5.1), for every dialog: a write that looks like a mistake comes
// back 409 with asks; the dialog shows each under its box in the warning text, its primary reads "Record anyway", and the
// same values sent again go with the asks confirmed. A changed value is asked about again.

export const isAsk = (err) => err?.status === 409 && Array.isArray(err.asks) && err.asks.length > 0;

// The asks as a dialog's problems: [{ field, message, warn }]; fieldOf maps the server's field to the dialog's box, has(field)
// says the dialog has that box. Asks on one box share its line; an ask with no box joins the first box's (a form shows its own
// line only when no box has words), or the form's line when none has a box.
export function asksProblems(asks, fieldOf = (f) => f, has = (f) => f !== null) {
  const boxes = new Map();
  const loose = [];
  for (const a of asks) {
    const field = fieldOf(a.field) ?? null;
    if (field !== null && has(field)) boxes.set(field, [...(boxes.get(field) ?? []), a.text]);
    else loose.push(a.text);
  }
  if (!boxes.size) return [{ field: null, message: loose.join(' '), warn: true }];
  const out = [...boxes].map(([field, texts]) => ({ field, message: texts.join(' '), warn: true }));
  if (loose.length) out[0].message = [out[0].message, ...loose].join(' ');
  return out;
}

// The primary's words while asks wait: "Record anyway".
export const anyway = (label) => `${label} anyway`;

// What a dialog keeps between sends: the body it was asked about and the kinds asked. body(b): b with the kinds confirmed when
// it is the same as the one asked about (a changed value: asked again); asked(b, asks): kept; reset(): forgotten.
export function createConfirm() {
  let last = null;
  const keyOf = (b) => JSON.stringify(b);
  return {
    body(b) {
      return last && last.key === keyOf(b) ? { ...b, confirmed: last.kinds } : b;
    },
    asked(b, asks) {
      const key = keyOf(b);
      const kept = last && last.key === key ? last.kinds : []; // the same values asked again: what was confirmed stays
      last = { key, kinds: [...new Set([...kept, ...asks.map((a) => a.kind)])] };
    },
    reset() {
      last = null;
    },
    get waiting() {
      return last !== null;
    },
  };
}

// For an openForm dialog (web/task-dialogs.js): send(body) through the asks. → (form, body, send, fieldOf) → true once sent,
// or the asks as problems (the primary then reads "Save anyway"; a box typed in after it reads the label again). value:
// the primary's value, label its words, fields the boxes whose input asks again.
export function askingSend({ value, label, fields = [] }) {
  const confirm = createConfirm();
  let watching = false;
  return async (form, body, send, fieldOf = (f) => f) => {
    try {
      await send(confirm.body(body));
      return true;
    } catch (err) {
      if (!isAsk(err)) throw err;
      confirm.asked(body, err.asks);
      const b = form.button(value);
      if (b) b.textContent = anyway(label);
      if (!watching) {
        watching = true;
        for (const name of fields) form.input(name)?.addEventListener('input', () => { if (b) b.textContent = label; });
      }
      return asksProblems(err.asks, fieldOf, (f) => Boolean(form.input(f)));
    }
  };
}
