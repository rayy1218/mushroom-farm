// Making blocks on the Batches pages (spec 2026-11-05-batches-design.md 5 and 7): the Recipes dialog (the list, Add, Edit,
// Archive), Make blocks and Edit the mix, a sterilising load (Record, Edit, Delete), the inoculation, the incubation, Ready
// to fruit. The dialogs use the tasks' dialog (openForm) through createBatchDialogs' tools, which wires them in: after a
// change, or a 404 or 409, the page reads again. An Inventory item is offered only on a line it can count: a line in kg an
// item kept in kg, bags and pieces an item kept in pieces; with none, no picker.

import { request } from './api.js';
import { CROP_KEYS, cropShortName } from './crops.js';
import { loadWorkers, workerField, errorText, setWorker } from './task-dialogs.js';
import { dateHint } from './harvest-math.js';
import { farmDate } from './tasks-math.js';
import { batchHash } from './route.js';
import {
  MIX_ITEMS, RECIPE_PARTS, MATERIAL_NAMES, METHOD_NAMES, numberOf, recipeLine, sumText, recipeValues, recipeBody, mixValues,
  recipeFill, mixBody, waterGuide, inoculateValues, inoculateBody, loadValues, loadBody, incubateValues, incubateBody, readyBody,
  countBlocks, bagsText, fullDate,
} from './batches-math.js';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const madeBlocks = (b) => (b.delivery ?? [b]).reduce((s, x) => s + x.blocks, 0);
const CROP_OPTIONS = CROP_KEYS.map((k) => [k, cropShortName(k)]);

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// A button with the page's focus key (for the focus to come back to it after a change) and, when given, its spoken name.
function action(label, key, name, onClick, className = '') {
  const b = el('button', className, label);
  b.type = 'button';
  b.dataset.focusKey = key;
  if (name) b.setAttribute('aria-label', name);
  b.addEventListener('click', onClick);
  return b;
}

// Inventory's items a line counted in `unit` can draw on (kg: an item kept in kg; bags and pieces: one kept in pieces).
const itemsFor = (items, unit) => items.filter((s) => s.unit === (unit === 'kg' ? 'kg' : 'pcs'));
// A picker's options: none, then the items; a line's stored item not among them (archived meanwhile) stays, by its name.
function itemOptions(list, kept = '', keptName = null) {
  const out = [['', 'No Inventory item'], ...list.map((s) => [String(s.id), s.name])];
  if (kept && !out.some(([v]) => v === kept)) out.push([kept, keptName ?? 'An item no longer offered']);
  return out;
}
function setOptions(select, options, value) {
  select.replaceChildren(...options.map(([v, label]) => {
    const o = el('option', '', label);
    o.value = v;
    o.selected = v === value;
    return o;
  }));
}

// tools: createBatchDialogs' { send(method, path, body) → { ok, data } or a problem, closing(r), ask(options) (openForm),
// remember() (the opener's focus key), alive(), onError(text), today(), pair(...fields), remove(b, onGone) }.
// → the making dialogs.
export function createMakingDialogs({ send, closing, ask, remember, alive, onError, today, pair, remove }) {
  // GET path → its reply, or null after saying why (the page left, or the request failed).
  async function read(path) {
    try {
      const data = await request('GET', path);
      return alive() ? data : null;
    } catch (err) {
      if (alive()) onError(errorText(err));
      return null;
    }
  }
  const noDialog = () => !document.querySelector('dialog[open]');

  // ---- recipes ----

  function recipes() {
    remember();
    showRecipes();
  }

  // The list (after a change, or back from a recipe's dialog, it opens again without taking a new opener; focusKey: the
  // row's button to put the cursor on).
  async function showRecipes(focusKey = null) {
    const data = await read('/api/batch-recipes');
    if (!data) return;
    const list = data.recipes ?? [];
    const box = el('div', 'bt-recipes');
    if (!list.length) box.append(el('p', 'none', 'No recipes yet. Add one: Make blocks then works out the amounts from it.'));
    for (const r of list) {
      const row = el('div', 'bt-recipe');
      const words = el('div', 'bt-words');
      words.append(el('p', 'bt-recipe-name', r.name), el('p', 'bt-line', recipeLine(r)));
      row.append(words, action('Edit', `recipe-${r.id}`, `Edit ${r.name}`, () => recipe(r), 'bt-quiet'),
        action('Archive', `archive-${r.id}`, `Archive ${r.name}`, () => archive(r), 'bt-quiet'));
      box.append(row);
    }
    ask({
      title: 'Recipes',
      lead: ['The mixes the farm makes blocks from. An archived recipe stays with the batches made from it and is not offered for a new mix.', box],
      closeLabel: 'Close',
      buttons: [{ value: 'add', label: 'Add a recipe', primary: true }],
      submit: async () => {
        recipe(null);
        return true;
      },
    });
    if (focusKey) box.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
  }

  // A recipe's dialog closed without a change (Cancel, Esc): back to the list.
  function backToList(form, done, focusKey) {
    form.closed.then(() => { if (!done() && alive() && noDialog()) showRecipes(focusKey); });
  }

  // Add (r null) or edit a recipe; the parts' sum under them as they are typed.
  function recipe(r) {
    const v = recipeValues(r);
    const part = (name, label) => ({ name, label, kind: 'number', value: v[name], suffix: '%' });
    let saved = false;
    const form = ask({
      title: r ? `Edit ${r.name}` : 'Add a recipe',
      lead: r ? ['A change counts from the next mix: the batches made already keep their amounts.'] : [],
      fields: [
        { name: 'name', label: 'Name', kind: 'text', value: v.name, maxLength: 80 },
        { name: 'crop', label: 'Crop', kind: 'select', value: v.crop, options: [['', 'Any crop'], ...CROP_OPTIONS] },
        {
          kind: 'group', legend: 'Parts of the dry weight', className: 'bt-group bt-parts', fields: [
            pair(part('sawdustPct', 'Sawdust'), part('branPct', 'Bran')),
            pair(part('limePct', 'Lime'), part('gypsumPct', 'Gypsum')),
            pair(part('otherPct', 'Other'), { name: 'otherName', label: 'Other: what', kind: 'text', value: v.otherName, maxLength: 80 }),
          ],
        },
        {
          kind: 'group', legend: 'A bag', className: 'bt-group', fields: [
            pair(
              { name: 'waterPct', label: 'Water', kind: 'number', value: v.waterPct, suffix: '%' },
              { name: 'bagKg', label: 'Wet weight', kind: 'number', value: v.bagKg, suffix: 'kg' },
            ),
          ],
        },
      ],
      buttons: [{ value: 'save', label: r ? 'Save' : 'Add', primary: true }],
      submit: async (values) => {
        const out = recipeBody(values);
        if (!out.body) return out;
        const sent = await send(r ? 'PUT' : 'POST', r ? `/api/batch-recipes/${r.id}` : '/api/batch-recipes', out.body);
        if (!sent.ok) return sent;
        saved = true;
        await showRecipes(Number.isInteger(sent.data?.id) ? `recipe-${sent.data.id}` : null); // the list replaces this dialog
        return true;
      },
    });
    const sum = el('p', 'c-hint bt-sum');
    sum.setAttribute('aria-live', 'polite');
    form.input('otherName').closest('.bt-parts').append(sum);
    const say = () => { sum.textContent = sumText(Object.fromEntries(RECIPE_PARTS.map((k) => [k, form.input(k).value]))); };
    for (const k of RECIPE_PARTS) form.input(k).addEventListener('input', say);
    say();
    backToList(form, () => saved, r ? `recipe-${r.id}` : null);
  }

  function archive(r) {
    let saved = false;
    const form = ask({
      title: `Archive ${r.name}?`,
      lead: ['It stays with the batches made from it and is no longer offered for a new mix.'],
      buttons: [{ value: 'archive', label: 'Archive', primary: true }],
      submit: async () => {
        const sent = await send('PUT', `/api/batch-recipes/${r.id}`, { archived: true });
        if (!sent.ok) return sent;
        saved = true;
        await showRecipes();
        return true;
      },
    });
    backToList(form, () => saved, `archive-${r.id}`);
  }

  // ---- the mix ----

  // The Mix dialog's boxes: the mix, its materials (each with its Inventory item when Inventory has one it can count in),
  // the weight, a note. stored: the made batch's material lines (an item kept by name when no longer offered).
  function mixFields(v, list, items, can, stored) {
    const picker = (item, unit) => {
      const kept = v[`item-${item}`];
      const offered = itemsFor(items, unit);
      if (!offered.length && !kept) return null;
      const keptName = stored.find((m) => m.item === item)?.itemName;
      return { name: `item-${item}`, label: 'Inventory item', kind: 'select', value: kept, options: itemOptions(offered, kept, keptName) };
    };
    const amount = (item) => ({
      name: `qty-${item}`, label: item === 'other' ? 'Other' : MATERIAL_NAMES[item], kind: 'number', value: v[`qty-${item}`], suffix: item === 'bags' ? 'pcs' : 'kg',
    });
    const anyPicker = MIX_ITEMS.some((item) => picker(item, item === 'bags' ? 'pcs' : 'kg'));
    let materials;
    if (anyPicker) { // a line each: its amount and its item
      materials = MIX_ITEMS.flatMap((item) => {
        const pick = picker(item, item === 'bags' ? 'pcs' : 'kg');
        if (item !== 'other') return [pair(amount(item), ...(pick ? [{ ...pick, label: `${MATERIAL_NAMES[item]}: Inventory item` }] : []))];
        return [pair(amount(item), { name: 'otherName', label: 'Other: what', kind: 'text', value: v.otherName, maxLength: 80 }),
          ...(pick ? [{ ...pick, label: 'Other: Inventory item' }] : [])];
      });
    } else { // the amounts two to a row
      materials = [
        pair(amount('sawdust'), amount('bran')), pair(amount('lime'), amount('gypsum')),
        pair(amount('other'), { name: 'otherName', label: 'Other: what', kind: 'text', value: v.otherName, maxLength: 80 }),
        pair(amount('bags')),
      ];
    }
    return [
      {
        kind: 'group', legend: 'The mix', className: 'bt-group', fields: [
          pair(
            { name: 'recipeId', label: 'Recipe', kind: 'select', value: v.recipeId, options: [['', 'No recipe'], ...list.map((r) => [String(r.id), r.archived ? `${r.name} (archived)` : r.name])] },
            ...(!can || can.cropEditable ? [{ name: 'crop', label: 'Crop', kind: 'select', value: v.crop, options: [['', 'Pick a crop'], ...CROP_OPTIONS] }] : []),
          ),
          pair(
            { name: 'mixedDate', label: 'Mixed', kind: 'date', value: v.mixedDate, max: today(), hintOf: dateHint },
            ...(!can || can.blocksEditable ? [{ name: 'blocks', label: 'Bags', kind: 'number', value: v.blocks, inputMode: 'numeric', suffix: 'bags', hint: 'One bag makes one block.' }] : []),
          ),
        ],
      },
      {
        kind: 'group', legend: 'Materials', className: 'bt-group bt-materials',
        hint: `Worked out from the recipe and the bags: change them to what was used. An empty box is left out.${anyPicker ? " With an Inventory item on every line, its purchase prices give the price per block." : ''}`,
        fields: materials,
      },
      {
        kind: 'group', legend: 'Weight', className: 'bt-group', hint: "A bag's wet weight and water, from the recipe. With them the Harvest tab's BE uses this batch's dry substrate.", fields: [
          pair(
            { name: 'blockKg', label: 'Bag weight', kind: 'number', value: v.blockKg, suffix: 'kg' },
            { name: 'waterPct', label: 'Water', kind: 'number', value: v.waterPct, suffix: '%' },
          ),
        ],
      },
      { name: 'note', label: 'Note', kind: 'area', value: v.note },
    ];
  }

  // A recipe picked fills the crop, the weight, the water and the amounts; bags typed work the amounts out again; the water
  // guide follows. fixedBags: the bags when their box is not shown (an edit of a split batch).
  function wireMix(form, list, water, fixedBags) {
    const box = (name) => form.input(name);
    const recipeNow = () => list.find((r) => String(r.id) === box('recipeId').value) ?? null;
    const bags = () => (box('blocks') ? numberOf(box('blocks').value) : fixedBags);
    const say = () => {
      const r = recipeNow();
      const n = bags();
      water.textContent = r && Number.isInteger(n) && n > 0 ? waterGuide(r, n) : '';
      water.hidden = !water.textContent;
    };
    const fill = () => {
      const r = recipeNow();
      if (r) {
        for (const [name, value] of Object.entries(recipeFill(r, bags()))) if (box(name)) box(name).value = value;
        if (r.crop && box('crop')) box('crop').value = r.crop;
      }
      say();
    };
    box('recipeId').addEventListener('change', fill);
    box('blocks')?.addEventListener('input', fill);
    say();
  }

  // Make blocks (b null; on to the new batch's page after) or edit a made batch's mix (b: its detail; its Delete inside,
  // onGone: after it).
  async function mix(b = null, { onGone = () => {} } = {}) {
    remember();
    const [recipeData, itemData] = await Promise.all([read('/api/batch-recipes'), read('/api/batches/stock-items')]);
    if (!recipeData || !itemData) return;
    const list = recipeData.recipes ?? [];
    if (b?.recipe && !list.some((r) => r.id === b.recipe.id)) list.push(b.recipe); // an archived recipe stays its batch's
    const can = b ? { cropEditable: b.delivery.every((x) => x.placedAt === null), blocksEditable: b.parentId === null && b.delivery.length === 1 && b.placedAt === null } : null;
    const water = el('p', 'c-hint bt-water');
    water.setAttribute('aria-live', 'polite');
    const lead = b ? ['A recipe picked again works the amounts out afresh.'] : ["The day the substrate is mixed and bagged. Sterilise, inoculate and incubate on the batch's page."];
    if (b && b.delivery.length > 1) lead.push('The recipe, materials and weight are the whole mix: every part of it shares them.');
    const form = ask({
      title: b ? 'Edit the mix' : 'Make blocks',
      lead,
      fields: mixFields(mixValues(b, today()), list, itemData.items ?? [], can, b?.materials ?? []),
      buttons: [
        ...(b ? [{ label: 'Delete this batch', action: () => remove(b, onGone) }] : []),
        { value: 'save', label: b ? 'Save' : 'Make blocks', primary: true },
      ],
      submit: async (values) => {
        const out = mixBody(values, { edit: can });
        if (!out.body) return out;
        if (b) return closing(await send('PUT', `/api/batches/${b.id}`, out.body));
        const sent = await send('POST', '/api/batches', { kind: 'made', ...out.body });
        if (sent.ok && Number.isInteger(sent.data?.id)) location.hash = batchHash(sent.data.id); // on to its steps
        return closing(sent);
      },
    });
    form.input('qty-sawdust').closest('.bt-materials').querySelector('.tk-group-hint').after(water);
    wireMix(form, list, water, b ? madeBlocks(b) : null);
  }

  // ---- the steps ----

  // Record a sterilising load on b (load null) or edit it (its Delete inside).
  async function sterilise(b, load = null) {
    remember();
    let names;
    try {
      names = await loadWorkers();
    } catch (err) {
      if (alive()) onError(errorText(err));
      return;
    }
    if (!alive()) return;
    const v = loadValues(load, b, Date.now());
    const who = workerField(names, 'Who');
    if (load) who.value = names.includes(load.worker) ? load.worker : '';
    const lead = [`${countBlocks(madeBlocks(b), b.crop)} mixed ${fullDate(b.mixedAt ?? b.receivedAt)}. One load at a time: the bags that went in together.`];
    if (!names.length) {
      const p = el('p', 'tk-lead');
      const a = el('a', '', 'Settings');
      a.href = '#/settings';
      p.append("No names yet: add the workers' names in ", a, ' first.');
      lead.push(p);
    }
    ask({
      title: load ? 'Edit the load' : 'Record a sterilising load',
      lead,
      fields: [
        pair(
          { name: 'method', label: 'Method', kind: 'select', value: v.method, options: Object.entries(METHOD_NAMES) },
          { name: 'bags', label: 'Bags', kind: 'number', value: v.bags, inputMode: 'numeric', suffix: 'bags', hint: `Up to ${bagsText(madeBlocks(b))}` },
        ),
        {
          kind: 'group', className: 'tk-when', fields: [
            { name: 'hotDate', label: 'Reached the temperature', kind: 'date', value: v.hotDate, min: farmDate(b.mixedAt ?? b.receivedAt), max: today(), hintOf: dateHint },
            { name: 'hotTime', label: 'At', kind: 'text', value: v.hotTime, placeholder: '08:12', inputMode: 'numeric', maxLength: 5, hint: '24 h, like 08:12 or 0812' },
          ],
        },
        pair(
          { name: 'tempC', label: 'Temperature reached', kind: 'number', value: v.tempC, suffix: '°C' },
          { name: 'holdH', label: 'Held for', kind: 'number', value: v.holdH, suffix: 'h' },
        ),
        who,
      ],
      buttons: [
        ...(load ? [{ label: 'Delete this load', action: () => removeLoad(load) }] : []),
        { value: 'save', label: load ? 'Save' : 'Record', primary: true },
      ],
      submit: async (values) => {
        const out = loadBody(values, { edit: Boolean(load) });
        if (!out.body) return out;
        if (out.body.worker) setWorker(out.body.worker); // the next dialog picks the same name
        return closing(await (load ? send('PUT', `/api/batch-loads/${load.id}`, out.body) : send('POST', `/api/batches/${b.id}/loads`, out.body)));
      },
    });
  }

  function removeLoad(load) {
    ask({
      title: `Delete the load of ${fullDate(load.hotAt)}?`,
      lead: [`${bagsText(load.bags)}, ${(METHOD_NAMES[load.method] ?? load.method).toLowerCase()}.`],
      buttons: [{ value: 'delete', label: 'Delete', danger: true }],
      submit: async () => closing(await send('DELETE', `/api/batch-loads/${load.id}`)),
    });
  }

  // Record or edit the inoculation: its day, the spawn's supplier, strain and batch No., the spawn used (with its item, the
  // picker's items following the unit it is counted in).
  async function inoculate(b) {
    remember();
    const itemData = await read('/api/batches/stock-items');
    if (!itemData) return;
    const items = itemData.items ?? [];
    const v = inoculateValues(b, today());
    const stored = (b.materials ?? []).find((m) => m.item === 'spawn');
    const picks = (unit) => itemOptions(itemsFor(items, unit), unit === v.spawnUnit ? v.spawnItem : '', stored?.itemName);
    const withPicker = items.some((s) => s.unit === 'kg' || s.unit === 'pcs') || Boolean(v.spawnItem);
    const done = finite(b.inoculatedAt);
    const form = ask({
      title: done ? 'Edit the inoculation' : 'Record the inoculation',
      lead: [`${countBlocks(madeBlocks(b), b.crop)} mixed ${fullDate(b.mixedAt ?? b.receivedAt)}.`],
      fields: [
        { name: 'inoculatedDate', label: 'Inoculated', kind: 'date', value: v.inoculatedDate, min: farmDate(b.mixedAt ?? b.receivedAt), max: today(), hintOf: dateHint },
        {
          kind: 'group', legend: 'Spawn', className: 'bt-group', fields: [
            { name: 'supplier', label: 'Spawn supplier', kind: 'text', value: v.supplier, maxLength: 80 },
            pair(
              { name: 'spawnBatch', label: 'Spawn batch No.', kind: 'text', value: v.spawnBatch, maxLength: 80 },
              { name: 'strain', label: 'Strain', kind: 'text', value: v.strain, maxLength: 80 },
            ),
          ],
        },
        {
          kind: 'group', legend: 'Spawn used', className: 'bt-group', hint: 'Leave the amount empty if it was not weighed or counted.', fields: [
            pair(
              { name: 'spawnQty', label: 'Amount', kind: 'number', value: v.spawnQty },
              { name: 'spawnUnit', label: 'Counted in', kind: 'select', value: v.spawnUnit, options: [['kg', 'kg'], ['bags', 'bags']] },
            ),
            ...(withPicker ? [{ name: 'spawnItem', label: 'Inventory item', kind: 'select', value: v.spawnItem, options: picks(v.spawnUnit) }] : []),
          ],
        },
      ],
      buttons: [{ value: 'save', label: done ? 'Save' : 'Record', primary: true }],
      submit: async (values) => {
        const out = inoculateBody(values);
        return out.body ? closing(await send('PUT', `/api/batches/${b.id}`, out.body)) : out;
      },
    });
    const pick = form.input('spawnItem');
    if (!pick) return;
    const follow = () => { // the items of the unit picked; none: the picker away
      const options = picks(form.input('spawnUnit').value);
      setOptions(pick, options, options.some(([id]) => id === pick.value) ? pick.value : '');
      pick.closest('.field').hidden = options.length < 2;
    };
    form.input('spawnUnit').addEventListener('change', follow);
    follow();
  }

  // Where the blocks incubate: in a grow room (then Put into a room) or in an area (from a day; ready to fruit on a day).
  function incubate(b) {
    remember();
    const v = incubateValues(b);
    const from = farmDate(b.inoculatedAt);
    const form = ask({
      title: 'Incubation',
      lead: ['In a grow room: put the blocks into a room whose run is in its Spawn stage. In an area: they stay on racks until they are ready to fruit, then go into a room.'],
      fields: [
        { name: 'incubation', label: 'Where', kind: 'select', value: v.incubation, options: [['', 'Not yet'], ['room', 'In a grow room'], ['area', 'In an area']] },
        {
          kind: 'group', legend: 'In an area', className: 'bt-group bt-area', hint: 'Leave Ready to fruit empty until they are.', fields: [
            pair(
              { name: 'fromDate', label: 'From', kind: 'date', value: v.fromDate, min: from, max: today(), hintOf: dateHint },
              { name: 'toDate', label: 'Ready to fruit', kind: 'date', value: v.toDate, min: from, max: today(), hintOf: dateHint },
            ),
          ],
        },
      ],
      buttons: [{ value: 'save', label: 'Save', primary: true }],
      submit: async (values) => {
        const out = incubateBody(values);
        return out.body ? closing(await send('PUT', `/api/batches/${b.id}`, out.body)) : out;
      },
    });
    const area = form.input('fromDate').closest('.bt-area');
    const where = form.input('incubation');
    const show = () => { area.hidden = where.value !== 'area'; }; // the dates only for an area
    where.addEventListener('change', show);
    show();
  }

  // An area's blocks ready to fruit: the day (today by default); then they wait to go into a room.
  function ready(b) {
    remember();
    ask({
      title: 'Ready to fruit',
      lead: [`${countBlocks(b.good, b.crop)} in the area since ${fullDate(b.incubatedFrom)}. Then put them into a room.`],
      fields: [{ name: 'readyDate', label: 'Ready on', kind: 'date', value: today(), min: farmDate(b.incubatedFrom), max: today(), hintOf: dateHint }],
      buttons: [{ value: 'save', label: 'Ready to fruit', primary: true }],
      submit: async (values) => {
        const out = readyBody(values);
        return out.body ? closing(await send('PUT', `/api/batches/${b.id}`, out.body)) : out;
      },
    });
  }

  return { recipes, mix, sterilise, inoculate, incubate, ready };
}
