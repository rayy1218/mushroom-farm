// Data integrity on Inventory's item page and dialogs (spec 2026-11-12-data-integrity-design.md 4, 5.1, 11 and 12): a move is
// voided, never deleted (Undo inside its minute aside), a voided one stays in the history struck and opens as itself, the
// owner's Edit carries the History fold, and every write goes through the server's asks. Source checks; the look is checked
// in the browser (the UI check).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');

test('the history: a voided move in place, struck, its void said; an edited one marked; it opens as itself', () => {
  const page = src('inventory-item.js');
  assert.ok(page.includes("li.classList.add('dx-voided')"));
  assert.ok(page.includes("el('span', 'dx-chip', 'Voided')"));
  assert.ok(page.includes("el('span', 'dx-void-line', line.voided)"));
  assert.ok(page.includes("line.voided ? 'iv-move-qty dx-figure' : 'iv-move-qty'"), 'its figure struck');
  assert.ok(page.includes("el('span', 'dx-edited', 'edited')"));
  assert.ok(page.includes("line.edit === 'open'") && page.includes('openVoidedMove('));
  assert.ok(page.includes("line.edit === 'void'") && page.includes('openVoidMove('));
  assert.ok(!page.includes('openDeleteDialog'), 'no Delete left');
});

test('the dialogs: Void this purchase / use / count, its reason; a voided move\'s Restore and History; no Delete of a move', () => {
  const d = src('inventory-dialogs.js');
  assert.ok(d.includes("import { openVoid, openVoided } from './void-dialog.js';"));
  assert.ok(d.includes("import { addHistory } from './changes-fold.js';"));
  assert.ok(d.includes('label: `Void this ${voidLabel(move)}`'));
  assert.ok(d.includes('path: `/api/inventory/moves/${move.id}/void`'));
  assert.ok(d.includes('path: `/api/inventory/moves/${move.id}/restore`'));
  assert.ok(d.includes("addHistory({ kind: 'move', id: move.id })"));
  assert.ok(!d.includes("send('DELETE', `/api/inventory/moves/${move.id}`)"), 'a move goes by Undo (inventory-done.js) or a void');
});

test('every write through the server\'s asks: the same body again confirmed, the primary "<label> anyway"', () => {
  const d = src('inventory-dialogs.js');
  assert.ok(d.includes("import { isAsk, asksProblems, anyway, createConfirm } from './asks.js';"));
  assert.ok(d.includes('if (isAsk(err) && asks) return asks.asked(body, err.asks);'), 'before the 409 that reads as stale');
  assert.ok(d.includes('const reply = await request(method, path, asks ? asks.body(body) : body, COMMAND_TIMEOUT);'));
  for (const call of ["send('POST', '/api/inventory/purchases', body, ask)", "send('POST', '/api/inventory/uses', body, ask)",
    "send('PUT', `/api/inventory/moves/${move.id}`, body, ask)", "send('POST', `/api/inventory/lots/${lot.moveId}/throw-out`, { worker: v.worker }, ask)"]) {
    assert.ok(d.includes(call), call);
  }
  assert.equal((d.match(/asker\(\(\) => form/g) ?? []).length, 4, 'one per dialog that writes');
});

test('Undo inside its minute for a worker too (their own use or count, section 12)', () => {
  const line = src('inventory-done.js');
  assert.ok(!line.includes('isOwner() ? result.moves : null'));
});
