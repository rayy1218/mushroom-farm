// The inputs of a room's fields, built from web/room-fields.js: used by the Add room dialog, the room page's Room profile tab and
// the Equipment tab's cards. createRoomForm(groups, { idPrefix, onInput }) → { parts, inputs, texts(), fill(texts), paint(),
// showErrors(errors) → the first wrong input, clearErrors(), clearError(name) }. parts: group key → the nodes of that group (the
// caller puts them in a card or a fieldset). onInput(name): a field was changed by the person. A group with names (an Equipment
// card, web/equipment-cards.js): those fields stacked one per row in that order, labels: a label per field instead of its own.

import { ROOM_FIELDS, fieldsOf, fieldLabel, isShown, volumeText, NAME_MAX, GATEWAY_MAX } from './room-fields.js';

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// The number input's attributes per kind.
const NUMBER = {
  size: (f) => ({ min: f.min, max: f.max, step: f.step, inputMode: 'decimal', required: true }),
  address: () => ({ min: 1, max: 247, step: '1', inputMode: 'numeric', placeholder: 'none' }),
  rating: (f) => ({ min: f.min, max: f.max, step: 'any', inputMode: 'decimal', required: !f.fitted }),
  whole: (f) => ({ min: f.min, max: f.max, step: '1', inputMode: 'numeric', required: true }),
};

export function createRoomForm(groups, { idPrefix, onInput }) {
  const fields = new Map(); // name → { f, input, err, wrap }
  const parts = {};
  let volume = null;

  function field(f, text = fieldLabel(f)) {
    const input = el('input');
    input.id = `${idPrefix}${f.name}`;
    input.name = f.name;
    const err = el('p', 'field-error');
    err.id = `${idPrefix}${f.name}-error`;
    err.setAttribute('aria-live', 'polite');
    input.setAttribute('aria-describedby', err.id);
    let wrap;
    if (f.kind === 'check') {
      input.type = 'checkbox';
      wrap = el('div', 'room-check');
      const label = el('label', 'crop-check');
      label.htmlFor = input.id;
      label.append(input, ` ${text}`);
      wrap.append(label, err);
    } else {
      if (f.kind === 'text') Object.assign(input, { type: 'text', maxLength: NAME_MAX, autocomplete: 'off', required: true });
      else if (f.kind === 'gateway') Object.assign(input, { type: 'text', maxLength: GATEWAY_MAX, autocomplete: 'off', spellcheck: false, placeholder: "Empty: the farm's gateway" });
      else Object.assign(input, { type: 'number' }, NUMBER[f.kind](f));
      wrap = el('div', 'field');
      const label = el('label', '', text);
      label.htmlFor = input.id;
      wrap.append(label, input, err);
    }
    input.addEventListener(f.kind === 'check' ? 'change' : 'input', () => {
      clearError(f.name);
      paint();
      onInput?.(f.name);
    });
    fields.set(f.name, { f, input, err, wrap });
    return wrap;
  }

  for (const group of groups) {
    const list = group.names ? group.names.map((name) => ROOM_FIELDS.find((f) => f.name === name)) : fieldsOf(group.key);
    const nodes = [];
    if (group.names) { // a card: one per row, then the hint and the note
      nodes.push(...list.map((f) => field(f, fieldLabel({ ...f, label: group.labels?.[f.name] ?? f.label }))));
      if (group.hint) nodes.push(el('p', 'c-hint', group.hint));
      if (group.note) nodes.push(el('p', 'c-hint', group.note));
    } else if (group.key === 'profile') { // the name on its own line, the three sizes in a row, the volume under them
      nodes.push(field(list[0]));
      const sizes = el('div', 'sizes');
      sizes.append(...list.slice(1).map((f) => field(f)));
      volume = el('p', 'volume', volumeText({}));
      volume.setAttribute('aria-live', 'polite');
      nodes.push(sizes, volume);
    } else {
      const grid = el('div', 'sizes two');
      grid.append(...list.filter((f) => f.kind !== 'check').map((f) => field(f)));
      nodes.push(grid, ...list.filter((f) => f.kind === 'check').map((f) => field(f)));
      if (group.hint) nodes.push(el('p', 'c-hint', group.hint));
    }
    parts[group.key] = nodes;
  }

  const inputs = Object.fromEntries([...fields].map(([name, { input }]) => [name, input]));

  // The texts as typed (a box: true or false). A number input whose text is not a number reads as blank: kept wrong instead.
  function texts() {
    return Object.fromEntries([...fields].map(([name, { f, input }]) => [
      name, f.kind === 'check' ? input.checked : input.validity?.badInput ? '?' : input.value,
    ]));
  }

  // A fitted machine's ratings show while its box is ticked; the volume follows the sizes.
  function paint() {
    const t = texts();
    for (const { f, wrap } of fields.values()) wrap.hidden = !isShown(f, t);
    if (volume) volume.textContent = volumeText(t);
  }

  function fill(t) {
    for (const [name, { f, input }] of fields) {
      if (!(name in t)) continue;
      if (f.kind === 'check') input.checked = t[name] === true;
      else input.value = t[name];
    }
    paint();
  }

  function clearError(name) {
    const { input, err } = fields.get(name);
    if (err.textContent !== '') err.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  function clearErrors() {
    for (const name of fields.keys()) clearError(name);
  }

  // errors: name → message; the ones of fields not here are left to the caller. → the first wrong input (in field order) or null.
  function showErrors(errors) {
    let first = null;
    for (const [name, { input, err }] of fields) {
      if (!errors?.[name]) continue;
      err.textContent = errors[name];
      input.setAttribute('aria-invalid', 'true');
      first ??= input;
    }
    return first;
  }

  return { parts, inputs, texts, fill, paint, showErrors, clearErrors, clearError };
}
