// Making blocks on the Batches pages (spec 2026-11-05-batches-design.md 5 and 7): the Recipes dialog (the list, Add, Edit,
// Archive), Make blocks and Edit the mix, a sterilising load (Record, Edit, Delete), the inoculation, the incubation, Ready
// to fruit; and the Making card of a made batch's page. The dialogs use the tasks' dialog (openForm) through createBatchDialogs' tools, which wires them in: after a
// change, or a 404 or 409, the page reads again. An Inventory item is offered only on a line it can count (itemsFor: a line
// in kg an item kept in kg, bags and pieces an item kept in pieces; Inventory's spawn items for the spawn, its others for the
// mix), and only once the line has its amount; with none, no picker.

import { request } from './api.js';
import { CROP_KEYS, cropShortName } from './crops.js';
import { loadWorkers, workerField, errorText, setWorker } from './task-dialogs.js';
import { dateHint } from './harvest-math.js';
import { farmDate, farmTime } from './tasks-math.js';
import { batchHash } from './route.js';
import {
  MIX_ITEMS, RECIPE_PARTS, MATERIAL_NAMES, METHOD_NAMES, numberOf, recipeLine, sumText, recipeValues, recipeBody, mixValues,
  recipeFill, mixBody, waterGuide, inoculateValues, inoculateBody, loadValues, loadBody, incubateValues, incubateBody, readyBody,
  makingSteps, loadLine, sterilisedNote, madePriceNote, priceOverNote, countBlocks, bagsText, fullDate, dateText, itemsFor, itemPicker,
  timeProblem, lastSpawn, nextStep, withWeight,
} from './batches-math.js';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const madeBlocks = (b) => (b.delivery ?? [b]).reduce((s, x) => s + x.blocks, 0);
const CROP_OPTIONS = CROP_KEYS.map((k) => [k, cropShortName(k)]);
const unitOf = (item) => (item === 'bags' ? 'pcs' : 'kg');

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

function setOptions(select, options, value) {
  select.replaceChildren(...options.map(([v, label]) => {
    const o = el('option', '', label);
    o.value = v;
    o.selected = v === value;
    return o;
  }));
}

// tools: createBatchDialogs' { send(method, path, body) → { ok, data } or a problem, closing(r), ask(options) (openForm),
// remember(then) (the opener's focus key; → still), ticket() (→ still({ replacing }): false once a later dialog was asked for,
// the page left, or another dialog opened meanwhile), alive(), onError(text), today(), pair(...fields), remove(b, onGone) }.
// → the making dialogs.
export function createMakingDialogs({ send, closing, ask, remember, ticket, alive, onError, today, pair, remove }) {
  // GET path → its reply, or null after saying why (the page left, a later dialog asked for, or the request failed).
  async function read(path, still) {
    try {
      const data = await request('GET', path);
      return still({ replacing: true }) ? data : null;
    } catch (err) {
      if (still({ replacing: true })) onError(errorText(err));
      return null;
    }
  }
  // A list row has no materials or loads: the step's dialog reads the batch's detail first.
  const detailOf = (b, still) => (Array.isArray(b.materials) && Array.isArray(b.loads) ? b : read(`/api/batches/${b.id}`, still));
  // a pair of short boxes (amounts, parts): side by side on a phone too
  const short = (...fields) => ({ ...pair(...fields), className: 'bt-pair bt-short' });

  // ---- recipes ----

  function recipes() {
    showRecipes(null, { still: remember() });
  }

  // The list (after a change, or back from a recipe's dialog, it opens again without taking a new opener). focusKey: the
  // row's button to put the cursor on; else Add a recipe. replacing: opened from the recipe's dialog it replaces.
  async function showRecipes(focusKey = null, { replacing = false, still = ticket() } = {}) {
    const data = await read('/api/batch-recipes', still);
    if (!data || !still({ replacing })) return;
    const list = data.recipes ?? [];
    const box = el('div', 'bt-recipes');
    if (!list.length) box.append(el('p', 'none', 'No recipes yet. Add one: Make blocks then works out the amounts from it.'));
    list.forEach((r, i) => {
      const row = el('div', 'bt-recipe');
      const words = el('div', 'bt-words');
      words.append(el('p', 'bt-recipe-name', r.name), el('p', 'bt-line', recipeLine(r)));
      // Archive… (it asks first) at the row's far end, apart from Edit; after it the cursor goes to the next row's Edit, else Add
      const next = list[i + 1] ? `recipe-${list[i + 1].id}` : null;
      row.append(words, action('Edit', `recipe-${r.id}`, `Edit ${r.name}`, () => recipe(r), 'bt-quiet'),
        action('Archive…', `archive-${r.id}`, `Archive ${r.name}…`, () => archive(r, next), 'bt-quiet bt-archive'));
      box.append(row);
    });
    const form = ask({
      title: 'Recipes',
      lead: ['The mixes the farm makes blocks from. An archived recipe stays with the batches made from it and is not offered for a new mix.', box],
      closeLabel: 'Close',
      buttons: [{ value: 'add', label: 'Add a recipe', primary: true }],
      submit: async () => {
        recipe(null);
        return true;
      },
    });
    const row = focusKey ? box.querySelector(`[data-focus-key="${focusKey}"]`) : null;
    (row ?? form.button('add'))?.focus();
  }

  // A recipe's dialog closed without a change (Cancel, Esc): back to the list, the cursor on the button that opened it.
  function backToList(form, done, focusKey) {
    form.closed.then(() => { if (!done() && alive() && !document.querySelector('dialog[open]')) showRecipes(focusKey); });
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
            short(part('sawdustPct', 'Sawdust'), part('branPct', 'Bran')),
            short(part('limePct', 'Lime'), part('gypsumPct', 'Gypsum')),
            pair(part('otherPct', 'Other'), { name: 'otherName', label: 'Other: what', kind: 'text', value: v.otherName, maxLength: 80 }),
          ],
        },
        {
          kind: 'group', legend: 'A bag', className: 'bt-group', fields: [
            short(
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
        await showRecipes(Number.isInteger(sent.data?.id) ? `recipe-${sent.data.id}` : null, { replacing: true }); // the list replaces this dialog
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

  // next: the focus key of the row after r (null: Add a recipe), where the cursor goes once r is archived.
  function archive(r, next) {
    let saved = false;
    const form = ask({
      title: `Archive ${r.name}?`,
      lead: ['It stays with the batches made from it and is no longer offered for a new mix.'],
      buttons: [{ value: 'archive', label: 'Archive', primary: true }],
      submit: async () => {
        const sent = await send('PUT', `/api/batch-recipes/${r.id}`, { archived: true });
        if (!sent.ok) return sent;
        saved = true;
        await showRecipes(next, { replacing: true });
        return true;
      },
    });
    backToList(form, () => saved, `archive-${r.id}`);
  }

  // ---- the mix ----

  // The Mix dialog's boxes: the mix, the weight, its materials (each with its Inventory item when Inventory has one it can
  // count in; the other ingredient behind Add another material unless it has one), a note. stored: the made batch's material
  // lines (an item kept by name when no longer offered; one gone from Inventory starts on none, with a note).
  function mixFields(v, list, items, can, stored) {
    const picker = (item, label) => {
      const keptLine = stored.find((m) => m.item === item);
      const p = itemPicker(itemsFor(items, unitOf(item)).filter((s) => s.kind !== 'spawn'), v[`item-${item}`], keptLine?.itemName ?? null); // the spawn is the Inoculate step's line
      if (p.options.length < 2) return null;
      return { name: `item-${item}`, label, kind: 'select', value: p.value, options: p.options, ...(p.note ? { hint: p.note } : {}) };
    };
    const amount = (item) => ({
      name: `qty-${item}`, label: item === 'other' ? 'Other' : MATERIAL_NAMES[item], kind: 'number', value: v[`qty-${item}`], suffix: unitOf(item),
    });
    const picks = Object.fromEntries(MIX_ITEMS.map((item) => [item, picker(item, `${item === 'other' ? 'Other' : MATERIAL_NAMES[item]}: Inventory item`)]));
    const anyPicker = MIX_ITEMS.some((item) => picks[item]);
    const otherName = { name: 'otherName', label: 'Other: what', kind: 'text', value: v.otherName, maxLength: 80 };
    const other = { kind: 'group', className: 'bt-other', fields: [pair(amount('other'), otherName), ...(picks.other ? [picks.other] : [])] };
    const materials = anyPicker // a line each, its amount and its item; else the amounts two to a row
      ? [...['sawdust', 'bran', 'lime', 'gypsum', 'bags'].map((item) => pair(amount(item), ...(picks[item] ? [picks[item]] : []))), other]
      : [short(amount('sawdust'), amount('bran')), short(amount('lime'), amount('gypsum')), short(amount('bags')), other];
    const fixed = can && (!can.blocksEditable || !can.cropEditable);
    return [
      {
        kind: 'group', legend: 'The mix', className: 'bt-group', ...(fixed ? { hint: 'Bags and crop are fixed once some blocks are in a room.' } : {}), fields: [
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
        kind: 'group', legend: 'Weight', className: 'bt-group', hint: "A bag's wet weight and water, from the recipe. With them the Harvest tab's BE uses this batch's dry substrate.", fields: [
          short(
            { name: 'blockKg', label: 'Bag weight', kind: 'number', value: v.blockKg, suffix: 'kg' },
            { name: 'waterPct', label: 'Water', kind: 'number', value: v.waterPct, suffix: '%' },
          ),
        ],
      },
      {
        kind: 'group', legend: 'Materials', className: 'bt-group bt-materials',
        hint: `Worked out from the recipe, and again when the recipe, bags, bag weight or water change: change them to what was used. An empty box is left out.${anyPicker ? " With an Inventory item on every line, its purchase prices give the price per block." : ''}`,
        fields: materials,
      },
      { name: 'note', label: 'Note', kind: 'area', value: v.note },
    ];
  }

  // A recipe picked fills the crop, the weight, the water and the amounts; bags, a bag weight or water typed work the amounts
  // out again (from the boxes' weight and water); the water guide follows. A line's Inventory item shows once it has an amount;
  // the other ingredient's line once it has one, or Add another material is pressed. fixedBags: the bags when their box is not
  // shown (an edit of a split batch).
  function wireMix(form, list, water, fixedBags) {
    const box = (name) => form.input(name);
    const recipeNow = () => list.find((r) => String(r.id) === box('recipeId').value) ?? null;
    const weighed = () => { const r = recipeNow(); return r && withWeight(r, box('blockKg').value, box('waterPct').value); };
    const bags = () => (box('blocks') ? numberOf(box('blocks').value) : fixedBags);
    const otherLine = box('qty-other').closest('.bt-other');
    const addOther = el('button', 'bt-quiet bt-add-other', 'Add another material');
    addOther.type = 'button';
    otherLine.after(addOther);
    const showOther = (on) => { otherLine.hidden = !on; addOther.hidden = on; };
    showOther(Boolean(box('qty-other').value.trim() || box('otherName').value.trim()));
    addOther.addEventListener('click', () => { showOther(true); box('qty-other').focus(); });
    const follow = () => { // each picker beside an amount; the other line once it has one
      for (const item of MIX_ITEMS) {
        const pick = box(`item-${item}`);
        if (pick) pick.closest('.field').hidden = !box(`qty-${item}`).value.trim();
      }
      if (box('qty-other').value.trim()) showOther(true);
    };
    const say = () => {
      const r = weighed();
      const n = bags();
      water.textContent = r && Number.isInteger(n) && n > 0 ? waterGuide(r, n) : '';
      water.hidden = !water.textContent;
    };
    const fill = (all) => { // all: a recipe picked (its crop, weight and water too); else the amounts only
      const r = all ? recipeNow() : weighed();
      if (r) {
        for (const [name, value] of Object.entries(recipeFill(r, bags()))) if ((all || name.startsWith('qty-')) && box(name)) box(name).value = value;
        if (all && r.crop && box('crop')) box('crop').value = r.crop;
      }
      follow();
      say();
    };
    box('recipeId').addEventListener('change', () => fill(true));
    for (const name of ['blocks', 'blockKg', 'waterPct']) box(name)?.addEventListener('input', () => fill(false));
    for (const item of MIX_ITEMS) box(`qty-${item}`).addEventListener('input', follow);
    follow();
    say();
  }

  // Make blocks (b null; on to the new batch's page after) or edit a made batch's mix (b: its detail; its Delete inside,
  // onGone: after it).
  async function mix(b = null, { onGone = () => {} } = {}) {
    const still = remember();
    const [recipeData, itemData] = await Promise.all([read('/api/batch-recipes', still), read('/api/batches/stock-items', still)]);
    if (!recipeData || !itemData || !still()) return;
    const list = recipeData.recipes ?? [];
    if (b?.recipe && !list.some((r) => r.id === b.recipe.id)) list.push(b.recipe); // an archived recipe stays its batch's
    const can = b ? { cropEditable: b.delivery.every((x) => x.placedAt === null), blocksEditable: b.parentId === null && b.delivery.length === 1 && b.placedAt === null } : null;
    const water = el('p', 'c-hint bt-water');
    water.setAttribute('aria-live', 'polite');
    const lead = b ? ['A recipe picked again works the amounts out afresh.'] : ["The day the substrate is mixed and bagged. Sterilise, inoculate and incubate on the batch's page."];
    if (b && b.delivery.length > 1) lead.push('The recipe, materials and weight are the whole mix: every part of it shares them.');
    const stored = b?.materials ?? [];
    const form = ask({
      title: b ? 'Edit the mix' : 'Make blocks',
      lead,
      fields: mixFields(mixValues(b, today()), list, itemData.items ?? [], can, stored),
      buttons: [
        ...(b ? [{ label: 'Delete this batch', action: () => remove(b, onGone) }] : []),
        { value: 'save', label: b ? 'Save' : 'Make blocks', primary: true },
      ],
      submit: async (values) => {
        const out = mixBody(values, { edit: can, stored: b ? stored : null });
        if (!out.body) return out;
        if (b) return closing(await send('PUT', `/api/batches/${b.id}`, out.body));
        const sent = await send('POST', '/api/batches', { kind: 'made', ...out.body });
        if (sent.ok && alive() && Number.isInteger(sent.data?.id)) location.hash = batchHash(sent.data.id); // on to its steps
        return closing(sent);
      },
    });
    form.input('qty-sawdust').closest('.bt-materials').querySelector('.tk-group-hint').after(water);
    wireMix(form, list, water, b ? madeBlocks(b) : null);
  }

  // ---- the steps ----

  // Record a sterilising load on b (load null; its method, temperature and hold the last load's) or edit it (its Delete
  // inside). row: the detail, or a list row (its detail read first).
  async function sterilise(row, load = null) {
    const still = remember();
    let names;
    let b;
    try {
      [names, b] = await Promise.all([loadWorkers(), detailOf(row, still)]);
    } catch (err) {
      if (still({ replacing: true })) onError(errorText(err));
      return;
    }
    if (!b || !still()) return;
    const v = loadValues(load, b, Date.now());
    const who = workerField(names, 'Who');
    if (load) who.value = names.includes(load.worker) ? load.worker : '';
    const mixedDay = farmDate(b.mixedAt ?? b.receivedAt);
    const lead = [`${countBlocks(madeBlocks(b), b.crop)} mixed ${dateText(b.mixedAt ?? b.receivedAt, today())}. One load at a time: the bags that went in together.`];
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
            { name: 'hotDate', label: 'Up to temperature', kind: 'date', value: v.hotDate, min: mixedDay, max: today(), hintOf: dateHint },
            { name: 'hotTime', label: 'At', kind: 'text', value: v.hotTime, placeholder: '08:12', inputMode: 'numeric', maxLength: 5, hint: '24 h, like 08:12 or 0812' },
          ],
        },
        short(
          { name: 'tempC', label: 'Temperature', kind: 'number', value: v.tempC, suffix: '°C' },
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
        const answer = closing(await (load ? send('PUT', `/api/batch-loads/${load.id}`, out.body) : send('POST', `/api/batches/${b.id}/loads`, out.body)));
        // a time refused on a day that is fine (later than now): under the time box
        return timeProblem(answer, { date: values.hotDate, min: mixedDay, max: today(), dateBox: 'hotDate', timeBox: 'hotTime' });
      },
    });
  }

  function removeLoad(load) {
    ask({
      title: `Delete the load of ${dateText(load.hotAt, today())} ${farmTime(load.hotAt)}?`,
      lead: [`${bagsText(load.bags)}, ${(METHOD_NAMES[load.method] ?? load.method).toLowerCase()}.`],
      buttons: [{ value: 'delete', label: 'Delete', danger: true }],
      submit: async () => closing(await send('DELETE', `/api/batch-loads/${load.id}`)),
    });
  }

  // Record or edit the inoculation: its day, the spawn's supplier, strain and batch No. (a new one's supplier and strain the
  // last made batch's of the crop), the spawn used (with its item once it has an amount, the picker's items following the
  // unit it is counted in). row: the detail, or a list row (its detail read first).
  async function inoculate(row) {
    const still = remember();
    const fresh = !finite(row.inoculatedAt);
    const [b, itemData, listData] = await Promise.all([
      detailOf(row, still), read('/api/batches/stock-items', still), fresh ? read('/api/batches', still) : null,
    ]);
    if (!b || !itemData || (fresh && !listData) || !still()) return;
    const items = itemData.items ?? [];
    const v = inoculateValues(b, today(), fresh ? lastSpawn(listData.batches, b) : null);
    const stored = (b.materials ?? []).find((m) => m.item === 'spawn') ?? null;
    const spawnItems = items.filter((s) => s.kind === 'spawn'); // Inventory's spawn, in kg or in pieces (bags)
    const picks = (unit) => itemPicker(itemsFor(spawnItems, unit), unit === v.spawnUnit ? v.spawnItem : '', stored?.itemName ?? null);
    const first = picks(v.spawnUnit);
    const withPicker = spawnItems.some((s) => s.unit === 'kg' || s.unit === 'pcs') || Boolean(v.spawnItem);
    const done = finite(b.inoculatedAt);
    const lead = [`${countBlocks(madeBlocks(b), b.crop)} mixed ${dateText(b.mixedAt ?? b.receivedAt, today())}.`];
    if (!(b.loads ?? []).length) lead.push(el('p', 'tk-lead bt-over', `No load recorded: these ${bagsText(madeBlocks(b))} have no sterilising load yet.`));
    const form = ask({
      title: done ? 'Edit the inoculation' : 'Record the inoculation',
      lead,
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
            short(
              { name: 'spawnQty', label: 'Amount', kind: 'number', value: v.spawnQty },
              { name: 'spawnUnit', label: 'Counted in', kind: 'select', value: v.spawnUnit, options: [['kg', 'kg'], ['bags', 'bags']] },
            ),
            ...(withPicker ? [{ name: 'spawnItem', label: 'Inventory item', kind: 'select', value: first.value, options: first.options, hint: first.note ?? '' }] : []),
          ],
        },
      ],
      buttons: [{ value: 'save', label: done ? 'Save' : 'Record', primary: true }],
      submit: async (values) => {
        const out = inoculateBody(values, { stored }); // the spawn sent only when it changed
        return out.body ? closing(await send('PUT', `/api/batches/${b.id}`, out.body)) : out;
      },
    });
    const pick = form.input('spawnItem');
    if (!pick) return;
    const qty = form.input('spawnQty');
    const note = document.getElementById(`${pick.id}-hint`);
    let unit = v.spawnUnit;
    const follow = () => { // the items of the unit picked, once the amount is given; none: the picker away
      const now = form.input('spawnUnit').value;
      if (now !== unit) {
        unit = now;
        const p = picks(unit);
        setOptions(pick, p.options, p.options.some(([id]) => id === pick.value) ? pick.value : '');
        if (note) note.textContent = p.note ?? '';
      }
      if (note) note.hidden = !note.textContent;
      pick.closest('.field').hidden = pick.options.length < 2 || !qty.value.trim();
    };
    form.input('spawnUnit').addEventListener('change', follow);
    qty.addEventListener('input', follow);
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

  // An area's blocks ready to fruit: the day (today by default); then they wait to go into a room. The Ready to fruit button
  // goes with the change: the cursor comes back to the Incubate step's.
  function ready(b) {
    remember((key) => (key === 'ready' ? 'incubate' : key));
    ask({
      title: 'Ready to fruit',
      lead: [`${countBlocks(b.good, b.crop)} in the area since ${dateText(b.incubatedFrom, today())}. Then put them into a room.`],
      fields: [{ name: 'readyDate', label: 'Ready on', kind: 'date', value: today(), min: farmDate(b.incubatedFrom), max: today(), hintOf: dateHint }],
      buttons: [{ value: 'save', label: 'Ready to fruit', primary: true }],
      submit: async (values) => {
        const out = readyBody(values);
        if (!out.body) return out;
        const answer = closing(await send('PUT', `/api/batches/${b.id}`, out.body));
        return answer?.field === 'toDate' ? { ...answer, field: 'readyDate' } : answer; // the server's incubatedTo is this box
      },
    });
  }

  return { recipes, mix, sterilise, inoculate, incubate, ready };
}

// The Making card of a made batch's page (spec 5): the steps in order, each a section under its head with what was recorded
// and its buttons; the next step's button (nextStep) is the card's one primary, the other Records plain while the batch is
// making and quiet once it is made, every Edit quiet (as the Contamination card's); the loads each with a quiet Edit (Delete
// inside it) and the amber note while fewer bags were sterilised than made, or none once inoculated; a step that cannot be
// done yet says why in words, its button aria-disabled (Tab still reaches it and its reason); then how the price per block
// comes about (in amber when the materials come to over RM 1,000 a block).
// b: the detail; dialogs: createBatchDialogs' (the making ones are in it; onGone: after the batch's Delete); today: the
// farm's date. → the card's nodes.
export function makingNodes(b, dialogs, today, { onGone = () => {} } = {}) {
  const next = nextStep(b, today);
  const making = b.status === 'making';
  const record = (key) => (key === next ? 'primary' : making ? '' : 'bt-quiet'); // a Record button's look
  const nodes = makingSteps(b, today).map((s) => {
    const step = el('section', 'bt-step');
    const head = el('div', 'bt-step-head');
    const title = el('h3', 'bt-step-title', s.title);
    title.id = `bt-step-${s.key}`;
    step.setAttribute('aria-labelledby', title.id);
    const tools = el('div', 'bt-step-tools');
    head.append(title, tools);
    step.append(head, ...s.lines.map((text) => el('p', 'bt-line', text)));
    const loads = s.key === 'sterilise' ? b.loads ?? [] : [];
    let noted = false;
    if (s.key === 'mix') tools.append(action('Edit', 'mix', 'Edit the mix', () => dialogs.mix(b, { onGone }), 'bt-quiet'));
    if (s.key === 'sterilise') {
      for (const l of loads) {
        const row = el('div', 'bt-load');
        row.append(el('p', 'bt-line', loadLine(l, today)),
          action('Edit', `load-${l.id}`, `Edit the load of ${fullDate(l.hotAt)} ${farmTime(l.hotAt)}`, () => dialogs.sterilise(b, l), 'bt-quiet'));
        step.append(row);
      }
      const note = sterilisedNote(b);
      if (note) step.append(el('p', 'bt-over', note));
      noted = Boolean(note); // "No load recorded: …" says it instead of "Not yet."
      tools.append(action('Record a load', 'load', 'Record a load: sterilising', () => dialogs.sterilise(b), record('load')));
    }
    if (s.key === 'inoculate') {
      tools.append(action(s.done ? 'Edit' : 'Record', 'inoculate', s.done ? 'Edit the inoculation' : 'Record the inoculation', () => dialogs.inoculate(b), s.done ? 'bt-quiet' : record('inoculate')));
    }
    let go = null;
    if (s.key === 'incubate') {
      if (b.incubation === 'area' && !finite(b.incubatedTo) && s.can) tools.append(action('Ready to fruit', 'ready', null, () => dialogs.ready(b), record('ready')));
      go = action(s.done ? 'Edit' : 'Record', 'incubate', s.done ? 'Edit the incubation' : 'Record the incubation', () => {
        if (go.getAttribute('aria-disabled') !== 'true') dialogs.incubate(b);
      }, s.done ? 'bt-quiet' : record('incubate'));
      if (!s.can) go.setAttribute('aria-disabled', 'true');
      tools.append(go);
    }
    const off = Boolean(go && !s.can && s.why);
    const empty = !s.lines.length && !loads.length && !noted;
    if (empty || off) { // "Not yet." and, when it cannot be done yet, why: the button's description
      const why = el('p', empty ? 'none' : 'bt-reason', [empty ? 'Not yet.' : null, off ? `${s.why}.` : null].filter(Boolean).join(' '));
      why.id = `bt-step-${s.key}-why`;
      if (off) go.setAttribute('aria-describedby', why.id);
      step.append(why);
    }
    return step;
  });
  const over = priceOverNote(b); // the price refused: said in amber instead of how it comes about
  nodes.push(over ? el('p', 'bt-over bt-making-note', over) : el('p', 'muted bt-making-note', madePriceNote(b)));
  return nodes;
}
