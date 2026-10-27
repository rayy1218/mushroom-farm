// The room page's Equipment tab (spec 2026-10-27-equipment-cards-design.md): two sections, Sensors and Machines, each a grid of
// cards, one per device (web/equipment-cards.js), with that device's settings in it and its own Save and Reset.
// createEquipment(host, { roomId, idPrefix, queue, onSaved, onGone }) → { update(room, data), focus(name), destroy() }.
// update(room, { sensors, machines }): the room and the replies the page loaded; a card with unsaved edits, saving or with the
// cursor in it is not refilled (the status lines always are). A card's Save sends its values over the newest room, so it never
// sends another card's unsent edits; the other cards then show the saved room. queue: the page's save queue (web/room-edit.js),
// so two cards saved together go one after the other, the second over the room the first returned. onSaved(room); onGone(): the
// room is gone.

import { EQUIPMENT_CARDS, EQUIPMENT_SECTIONS, cardOf, cardGroup, cardLine, cardStatus, parseCard } from './equipment-cards.js';
import { createEditForm } from './room-edit.js';

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

export function createEquipment(host, { roomId, idPrefix, queue, onSaved, onGone }) {
  const cards = new Map(); // card key → { edit, setStatus }

  function card(c) {
    const form = el('form', 'card eq-card');
    form.noValidate = true;
    form.dataset.card = c.key;
    const title = el('h3', '', c.title);
    title.tabIndex = -1; // the cursor's place when the Save row hides
    const line = el('p', 'addr');
    const statusLine = el('p', 'eq-status');
    const status = el('span', 'status');
    const value = el('span', 'eq-value');
    statusLine.append(status, value);
    statusLine.hidden = true;
    let data = null; // the status from the page's replies, or null
    let unfitted = false;

    function paintStatus() {
      statusLine.hidden = !data || unfitted; // a machine not fitted: only its box and "Not fitted"
      if (!data) return;
      status.dataset.status = data.status;
      if (status.textContent !== data.word) status.textContent = data.word;
      value.textContent = data.value;
      value.hidden = data.value === '';
    }

    const edit = createEditForm(form, {
      roomId,
      groups: [cardGroup(c)],
      queue,
      idPrefix,
      check: (texts, room) => parseCard(c, texts, room),
      saveWhenDirty: true,
      rest: title,
      onPaint: (texts) => {
        unfitted = Boolean(c.fitted) && texts[c.fitted] !== true;
        form.classList.toggle('unfitted', unfitted);
        line.textContent = cardLine(c, texts);
        paintStatus();
      },
      onSaved: (room) => {
        for (const [key, other] of cards) if (key !== c.key) other.edit.update(room); // unedited cards show the saved room
        onSaved?.(room);
      },
      onGone,
    });
    form.append(title, line, statusLine, ...edit.fields.parts[c.key], ...edit.end);
    cards.set(c.key, {
      edit,
      setStatus(replies) {
        data = cardStatus(c, replies);
        paintStatus();
      },
    });
    return form;
  }

  for (const s of EQUIPMENT_SECTIONS) {
    const section = el('section', 'eq-section');
    section.dataset.section = s.key;
    const grid = el('div', 'eq-grid');
    grid.append(...EQUIPMENT_CARDS.filter((c) => c.section === s.key).map(card));
    section.append(el('h2', '', s.title), grid);
    host.append(section);
  }

  return {
    update(room, replies) {
      for (const { edit, setStatus } of cards.values()) {
        edit.update(room);
        setStatus(replies ?? {});
      }
    },
    // Put the cursor in a field (a "Set address" button of another tab).
    focus(name) {
      const c = cardOf(name);
      if (c) cards.get(c.key).edit.focus(name);
    },
    destroy() {
      for (const { edit } of cards.values()) edit.destroy();
      host.replaceChildren();
    },
  };
}
