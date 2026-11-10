// The Economics model (spec 2026-11-06-economics-design.md 5): the port of research/lions-mane-economics.html's model(), a
// month of one way to grow (Your container, Lowland shed, Highland grower, Warm strain) or to buy in and resell. Pure: no
// DOM, no fetch, no clock. The page works the money out with it on every change; stage 2 reuses it.
//   blockLife(x) · grow(x) · trade(x, kgSold) · housesOf(blocks) · inputsOf(values, way) · compare(values, ways)

export const DAYS_A_MONTH = 30.4;
export const HOUSE_BLOCKS = 2000; // a shed, a highland house or a warm-strain shed holds up to this many blocks

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// The days a block holds its place: to its first harvest, between its flushes, then its rest and turnaround.
export const blockLife = (x) => x.first + x.interval * Math.max(0, x.flushes - 1) + x.turn;

// A growing way's month. x: { blocks, yieldG, flushes, loss, first, interval, turn, shrink, price, blockPrice, uphill,
// kwhMonth, tariff, fixedTnb, labourMin, wage, pack, transport, rent, equipment, lifeMonths }. be: RM a kg (null with no kg
// sold); a payback that never comes is Infinity.
export function grow(x) {
  const life = blockLife(x);
  const blocksM = (x.blocks * DAYS_A_MONTH) / life;
  const kgSold = ((blocksM * (1 - x.loss / 100) * x.yieldG) / 1000) * (1 - x.shrink / 100);
  const income = kgSold * x.price;
  const writeOff = x.equipment / x.lifeMonths;
  const cost = {
    blocks: blocksM * (x.blockPrice + x.uphill),
    electricity: x.kwhMonth * x.tariff + x.fixedTnb,
    labour: ((blocksM * x.labourMin) / 60) * x.wage,
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
const YOUR_EQUIPMENT = ['container', 'cooling', 'humidifier', 'fans', 'racks'];
const HOUSE_EQUIPMENT = ['house', 'humidifier', 'fans'];

// values: every figure's value by its key (section 4.2: 'price', 'yours.yieldG', 'shed.house', …). → that way's x.
export function inputsOf(values, way) {
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
    x.equipment = YOUR_EQUIPMENT.reduce((s, k) => s + own(k), 0);
  } else {
    const houses = housesOf(x.blocks);
    x.kwhMonth = own('kwhHouse') * houses;
    x.equipment = HOUSE_EQUIPMENT.reduce((s, k) => s + own(k), 0) * houses;
  }
  return x;
}

// Every shown way's month, Your container first (always, whether or not ways names it): [{ way, ...grow or trade }]. Import sells Your
// container's kg (the model page's rule: the same volume, bought in).
export function compare(values, ways) {
  const yours = grow(inputsOf(values, 'yours'));
  return ['yours', ...ways.filter((w) => w !== 'yours')].map((way) => ({
    way, ...(way === 'yours' ? yours : way === 'import' ? trade(inputsOf(values, way), yours.kgSold) : grow(inputsOf(values, way))),
  }));
}
