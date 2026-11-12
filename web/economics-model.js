// The Economics model (spec 2026-11-06-economics-design.md 5): the port of research/lions-mane-economics.html's model(), a
// month of one way to grow (Your container, Lowland shed, Highland grower, Warm strain) or to buy in and resell. Pure: no
// DOM, no fetch, no clock. The page works the money out with it on every change; stage 2 reuses it.
//   blockLife(x) · grow(x) · trade(x, kgSold) · housesOf(blocks) · inputsOf(values, way, ctx) · compare(values, ways, ctx)
// Money truth (spec 2026-11-12-money-truth-design.md 6.3 and 9): Your container's labour as people (its share of the farm's
// workers) and its write-off from the equipment register when its equipment is the register's.

export const DAYS_A_MONTH = 30.4;
export const HOUSE_BLOCKS = 2000; // a shed, a highland house or a warm-strain shed holds up to this many blocks
export const WORKER_HOURS = 208; // a worker's hours a month: 26 days of 8 h (Money truth, decision 13)

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// The days a block holds its place: to its first harvest, between its flushes, then its rest and turnaround.
export const blockLife = (x) => x.first + x.interval * Math.max(0, x.flushes - 1) + x.turn;

// A growing way's month. x: { blocks, yieldG, flushes, loss, first, interval, turn, shrink, price, blockPrice, uphill,
// kwhMonth, tariff, fixedTnb, labourMin, wage, pack, transport, rent, equipment, lifeMonths }, and for Your container
// labourMonth (its share of the workers' cost: then the labour, the minutes a block only its hours) with hoursThere, and
// writeOffMonth (the register's). be: RM a kg (null with no kg sold); a payback that never comes is Infinity.
export function grow(x) {
  const life = blockLife(x);
  const blocksM = (x.blocks * DAYS_A_MONTH) / life;
  const kgSold = ((blocksM * (1 - x.loss / 100) * x.yieldG) / 1000) * (1 - x.shrink / 100);
  const income = kgSold * x.price;
  const writeOff = x.writeOffMonth ?? x.equipment / x.lifeMonths;
  const hours = (blocksM * x.labourMin) / 60; // the blocks' handling a month
  const cost = {
    blocks: blocksM * (x.blockPrice + x.uphill),
    electricity: x.kwhMonth * x.tariff + x.fixedTnb,
    labour: x.labourMonth ?? hours * x.wage,
    packing: kgSold * x.pack,
    transport: kgSold * x.transport,
    rent: x.rent,
    writeOff,
  };
  const costs = sum(cost);
  const profit = income - costs;
  const op = profit + writeOff; // before the write-off: what pays the equipment back
  const fill = x.blocks * (x.blockPrice + x.uphill);
  const rampM = x.first / DAYS_A_MONTH;
  const rampCost = (cost.electricity + cost.labour + cost.rent) * rampM;
  const within = (months) => (op > 0 && months <= x.lifeMonths ? months : Infinity);
  return {
    kind: 'grow', life, blocksM, kgSold, income, cost, costs, profit, op, be: kgSold > 0 ? costs / kgSold : null,
    equipment: x.equipment, fill, rampM, rampCost, kwhMonth: x.kwhMonth,
    labourHours: x.labourMonth === undefined ? null : { needed: hours, there: x.hoursThere, share: x.labourShare, workers: x.workers, each: x.workerMonth },
    payback: within(x.equipment / op), paybackAll: within(rampM + (x.equipment + fill + rampCost) / op),
  };
}

// Import and resell: kgSold (your container's) bought in at the landed price. x: { price, shrink, pack, wage, landed,
// buyHours, rent }. No equipment: payback null ("No equipment").
export function trade(x, kgSold) {
  const kgBought = kgSold / (1 - x.shrink / 100);
  const income = kgSold * x.price;
  const cost = {
    blocks: kgBought * x.landed, electricity: 0, labour: x.buyHours * DAYS_A_MONTH * x.wage, packing: kgSold * x.pack,
    transport: 0, rent: x.rent, writeOff: 0,
  };
  const costs = sum(cost);
  return {
    kind: 'trade', kgBought, kgSold, income, cost, costs, profit: income - costs, be: kgSold > 0 ? costs / kgSold : null,
    equipment: 0, payback: null, paybackAll: null,
  };
}

export const housesOf = (blocks) => Math.max(1, Math.ceil(blocks / HOUSE_BLOCKS));

const SHARED = ['price', 'shrink', 'pack', 'blockPrice', 'tariff', 'fixedTnb', 'wage'];
const GROWING = ['yieldG', 'flushes', 'loss', 'first', 'interval', 'turn', 'labourMin', 'transport', 'rent'];
const YOUR_EQUIPMENT = ['container', 'cooling', 'humidifier', 'fans', 'racks', 'other'];
const HOUSE_EQUIPMENT = ['house', 'humidifier', 'fans'];

// values: every figure's value by its key (section 4.2: 'price', 'yours.yieldG', 'shed.house', …); ctx (Money truth): {
// otherBlocks (every other room's blocks now: the workers are shared by blocks), register ({ total, writeOffMonth }: the
// room's equipment register, null with none) }. → that way's x.
export function inputsOf(values, way, ctx = {}) {
  if (way === 'import') {
    return {
      price: values.price, shrink: values.shrink, pack: values.pack, wage: values.wage,
      landed: values['import.landed'], buyHours: values['import.buyHours'], rent: values['import.rent'],
    };
  }
  const own = (k) => values[`${way}.${k}`];
  const x = {
    ...Object.fromEntries(SHARED.map((k) => [k, values[k]])), lifeMonths: values.life, blocks: values['yours.blocks'],
    ...Object.fromEntries(GROWING.map((k) => [k, own(k)])), uphill: way === 'highland' ? own('uphill') : 0,
  };
  if (way === 'yours') {
    x.kwhMonth = (own('kwhBlock') * x.blocks * DAYS_A_MONTH) / blockLife(x);
    x.equipment = YOUR_EQUIPMENT.reduce((s, k) => s + (own(k) ?? 0), 0);
    // the parts the register has, as it has them: their write-off is the register's (each item over its own months, Costs'
    // figure), the rest's over the months the equipment is written off over
    const reg = ctx.register;
    const asRegister = reg && Object.entries(reg.parts ?? {}).every(([k, v]) => Math.round((own(k.slice(6)) ?? 0) * 100) === Math.round(v * 100));
    if (asRegister) x.writeOffMonth = reg.writeOffMonth + (x.equipment - reg.total) / x.lifeMonths;
    // labour as people: the room's share of the farm's workers, by its blocks against every room's
    if (typeof own('workers') === 'number' && typeof own('workerMonth') === 'number') {
      const all = x.blocks + (ctx.otherBlocks ?? 0);
      x.labourShare = all > 0 ? x.blocks / all : 1;
      x.workers = own('workers');
      x.workerMonth = own('workerMonth');
      x.labourMonth = x.workers * x.workerMonth * x.labourShare;
      x.hoursThere = x.workers * x.labourShare * WORKER_HOURS;
    }
  } else {
    const houses = housesOf(x.blocks);
    x.kwhMonth = own('kwhHouse') * houses;
    x.equipment = HOUSE_EQUIPMENT.reduce((s, k) => s + own(k), 0) * houses;
  }
  return x;
}

// Every shown way's month, Your container first (always, whether or not ways names it): [{ way, ...grow or trade }]. Import sells Your
// container's kg (the model page's rule: the same volume, bought in). ctx: inputsOf's.
export function compare(values, ways, ctx = {}) {
  const yours = grow(inputsOf(values, 'yours', ctx));
  return ['yours', ...ways.filter((w) => w !== 'yours')].map((way) => ({
    way, ...(way === 'yours' ? yours : way === 'import' ? trade(inputsOf(values, way), yours.kgSold) : grow(inputsOf(values, way))),
  }));
}
