// The Economics figures and their research defaults (spec 2026-11-06-economics-design.md 4; the research appendix
// 2026-11-06-economics-defaults.md, section 1, gives every value, range, confidence and source). Pure: imported by the farm
// server (which resolves each figure's source) and by the page (which checks a typed figure before it is sent).
//   ECONOMICS_CROPS · WAYS · LEFT · WAY_NAMES · FIGURES · figureOf(key) · figuresFor(crop) · placeOf(key, roomId, crop)
//   checkFigure(key, value) · researchOf(key, crop, room, blocks) · sizeOf(room) · SOURCES · keepTogether(text)

// A number keeps its unit at a wrap and RM or USD its number (a no-break space), and a range of numbers never breaks at its
// dash (word joiners around it): the Units Rule, as text-math.js's keepUnits does for the climate's units. Every research
// note goes through it, so a note is written here with plain spaces.
const NB = '\u00a0';
const UNIT_AFTER = /(?<=\d) (?=(?:°C|%|kWh|kg|g|m³|L\/h|W|hp|h|ft|sen|days?|months?|blocks?|flush(?:es)?|CNY|min|RM\/kg|RM)(?![\w/³]))/g;
const MONEY_BEFORE = /(?<=\b(?:RM|USD)) (?=[\d−-])/g;
export const keepTogether = (text) => text.replace(UNIT_AFTER, NB).replace(MONEY_BEFORE, NB).replace(/(?<=\d)–(?=\d)/g, '\u2060–\u2060');

// The crops the owner named (spec 1), in the Crop select's order.
export const ECONOMICS_CROPS = ['oyster', 'pink', 'woodear', 'lionsmane'];

// The ways compared per crop, Your container first (spec 4.1), and the ways left out with the reason the page words.
export const WAYS = {
  oyster: ['yours', 'shed'],
  pink: ['yours', 'shed'],
  woodear: ['yours', 'shed', 'import'],
  lionsmane: ['yours', 'highland', 'import', 'warm'],
};
export const LEFT = {
  oyster: [{ way: 'highland', reason: 'too-cool' }, { way: 'import', reason: 'not-imported' }],
  pink: [{ way: 'highland', reason: 'too-cool' }, { way: 'import', reason: 'not-imported' }],
  woodear: [{ way: 'highland', reason: 'too-cool' }],
  lionsmane: [{ way: 'shed', reason: 'warm-strain' }],
};
export const WAY_NAMES = { yours: 'Your container', shed: 'Lowland shed', highland: 'Highland grower', import: 'Import and resell', warm: 'Warm strain' };

// A figure: key, label, unit (the box's suffix and the refusal's), scope ('farm', 'crop', 'room', 'roomCrop': where it is
// saved, spec 4.2), its range, whole (a whole number), way ('shared' or the way it belongs to) and settings (read from
// Settings, never set here).
const fig = (key, label, unit, scope, min, max, whole = false) => ({
  key, label, unit, scope, min, max, whole, way: key.includes('.') ? key.slice(0, key.indexOf('.')) : 'shared',
});
const MONEY_MAX = 10_000_000;
const RENT_MAX = 1_000_000;
// The figures of a growing way other than your container (a shed, a highland house, a warm-strain shed), per house.
const houseWay = (way) => [
  fig(`${way}.yieldG`, 'Yield per good block, all flushes', 'g', 'crop', 0, 5000),
  fig(`${way}.flushes`, 'Flushes per block', '', 'crop', 1, 10, true),
  fig(`${way}.loss`, 'Blocks lost', '%', 'crop', 0, 90),
  fig(`${way}.first`, 'Days to first harvest', 'days', 'crop', 1, 120, true),
  fig(`${way}.interval`, 'Days between flushes', 'days', 'crop', 1, 120, true),
  fig(`${way}.turn`, 'Rest and turnaround', 'days', 'crop', 0, 120, true),
  fig(`${way}.kwhHouse`, 'Fans and humidifier electricity, per house', 'kWh a month', 'crop', 0, 10_000),
  fig(`${way}.labourMin`, 'Labour per block handled', 'min', 'crop', 0, 600),
  fig(`${way}.transport`, 'Transport to buyers', 'RM/kg', 'crop', 0, 100),
  ...(way === 'highland' ? [fig('highland.uphill', 'Block freight up to the highlands', 'RM a block', 'crop', 0, 100)] : []),
  fig(`${way}.rent`, 'Rent', 'RM a month', 'crop', 0, RENT_MAX),
  fig(`${way}.house`, 'House and racks, per house', 'RM', 'crop', 0, MONEY_MAX),
  fig(`${way}.humidifier`, 'Humidifier or misting, per house', 'RM', 'crop', 0, MONEY_MAX),
  fig(`${way}.fans`, 'Fans, controller and wiring, per house', 'RM', 'crop', 0, MONEY_MAX),
];
export const FIGURES = [
  fig('price', 'Selling price', 'RM/kg', 'crop', 0, 1000),
  fig('shrink', 'Shrink, harvest to sale', '%', 'crop', 0, 90),
  fig('pack', 'Packing and delivery', 'RM/kg', 'crop', 0, 100),
  fig('blockPrice', 'Block price, ready to fruit', 'RM a block', 'crop', 0, 100),
  { ...fig('tariff', 'Electricity price', 'RM/kWh', 'farm', 0, 10), settings: true },
  fig('fixedTnb', 'Electricity fixed charge', 'RM a month', 'farm', 0, 1000),
  fig('wage', 'Labour cost', 'RM an hour', 'farm', 0, 200),
  fig('life', 'Equipment written off over', 'months', 'farm', 1, 240, true),
  fig('yours.blocks', 'Blocks in the room', 'blocks', 'room', 1, 100_000, true),
  fig('yours.yieldG', 'Yield per good block, all flushes', 'g', 'roomCrop', 0, 5000),
  fig('yours.flushes', 'Flushes per block', '', 'roomCrop', 1, 10, true),
  fig('yours.loss', 'Blocks lost', '%', 'roomCrop', 0, 90),
  fig('yours.first', 'Days to first harvest', 'days', 'roomCrop', 1, 120, true),
  fig('yours.interval', 'Days between flushes', 'days', 'roomCrop', 1, 120, true),
  fig('yours.turn', 'Rest and turnaround', 'days', 'roomCrop', 0, 120, true),
  fig('yours.kwhBlock', 'Electricity per block, over its life', 'kWh', 'roomCrop', 0, 100),
  fig('yours.labourMin', 'Labour per block handled', 'min', 'roomCrop', 0, 600),
  fig('yours.transport', 'Transport to buyers', 'RM/kg', 'roomCrop', 0, 100),
  fig('yours.rent', 'Rent', 'RM a month', 'room', 0, RENT_MAX),
  fig('yours.container', 'Container, delivered', 'RM', 'room', 0, MONEY_MAX),
  fig('yours.cooling', 'Cooling, fitted', 'RM', 'room', 0, MONEY_MAX),
  fig('yours.humidifier', 'Humidifier', 'RM', 'room', 0, MONEY_MAX),
  fig('yours.fans', 'Fans, controller and wiring', 'RM', 'room', 0, MONEY_MAX),
  fig('yours.racks', 'Racks', 'RM', 'room', 0, MONEY_MAX),
  ...houseWay('shed'),
  ...houseWay('highland'),
  ...houseWay('warm'),
  fig('import.landed', 'Landed price', 'RM/kg', 'crop', 0, 1000),
  fig('import.buyHours', 'Trading labour', 'hours a day', 'crop', 0, 24),
  fig('import.rent', 'Rent', 'RM a month', 'crop', 0, RENT_MAX),
];
const BY_KEY = new Map(FIGURES.map((f) => [f.key, f]));
export const figureOf = (key) => BY_KEY.get(key) ?? null;

// The figures of a crop's shown ways: the shared ones, Your container's, then each other shown way's.
export const figuresFor = (crop) => FIGURES.filter((f) => f.way === 'shared' || WAYS[crop].includes(f.way));

// Where a figure of room roomId and crop is saved (spec 3): room_id 0 and crop '' mean "every".
export function placeOf(key, roomId, crop) {
  const { scope } = figureOf(key);
  return { roomId: scope === 'room' || scope === 'roomCrop' ? roomId : 0, crop: scope === 'crop' || scope === 'roomCrop' ? crop : '' };
}

// null when value is a figure the key may take, else the refusal (spec 4.2, the Settings rule's words).
export function checkFigure(key, value) {
  const f = figureOf(key);
  if (!f) return 'Unknown figure';
  if (f.settings) return `${f.label} is set in Settings`;
  const ok = typeof value === 'number' && Number.isFinite(value) && value >= f.min && value <= f.max && (!f.whole || Number.isInteger(value));
  return ok ? null : `${f.label} must be ${f.whole ? 'a whole number' : 'a number'} from ${f.min} to ${f.max}${f.unit ? `${NB}${f.unit}` : ''}`;
}

// ---- The research defaults (appendix section 1) ----
// r(value, low, high, confidence, sources, note): one default; a figure's entry is one for every crop or one per crop.
const r = (value, low, high, confidence, sources, note = '') => ({ value, low, high, confidence, sources, note: keepTogether(note) });
const perCrop = (entries) => ({ perCrop: entries });
const LIONS_42 = 'Set so the block life is the owner\'s earlier 42 days (35–56)';
// The highland grower's and the warm strain's block life and handling (lion's mane only; appendix 1.6 and 1.7). The
// two cite different sources for the block life's rows and the humidifier, so each way builds its own.
const lionsHouse = (cycle, humidifier) => ({
  flushes: r(2, 1, 3, 'low', cycle, 'First flush largest; a 42-day block life, assumed'),
  loss: r(10, 5, 25, 'low', ['L01']),
  first: r(12, 10, 14, 'low', cycle, 'A 42-day block life, assumed'),
  interval: r(14, 10, 18, 'low', cycle, '"14 days apart"'),
  turn: r(16, 9, 30, 'low', cycle, LIONS_42),
  labourMin: r(2.52, 1.26, 5.04, 'low', ['L01'], '1 h per 1,000 blocks a day over 42 days'),
  rent: r(0, 0, 4000, 'low', ['L01']),
  house: r(5000, 1300, 10_000, 'low', ['L01', 'G20', 'G21', 'G22', 'G23']),
  humidifier: r(1500, 900, 3000, 'low', humidifier),
});
const LIONS_HIGHLAND = lionsHouse(['L01', 'L02', 'L15'], ['L01', 'S42']);
const LIONS_WARM = lionsHouse(['L01'], ['L01']);
const SHED = {
  'shed.yieldG': perCrop({
    oyster: r(170, 100, 300, 'medium', ['S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S15', 'G07'], 'Farm data 100–150 g; guides 250–640 g; a Jerantut grower\'s 400 g is an outlier'),
    pink: r(150, 80, 250, 'low', ['P06', 'P07', 'P17', 'P24', 'P29'], 'Malaysian guides 50–150 g a 1 kg bag'),
    woodear: r(180, 120, 250, 'medium', ['J02', 'J03', 'J06'], 'Malaysian guide 150–200 g a 1 kg bag; UPM 83–131 g over 3 flushes'),
  }),
  'shed.flushes': perCrop({
    oyster: r(6, 4, 8, 'medium', ['S06', 'S07', 'S15']),
    pink: r(3, 2, 5, 'low', ['P06', 'P08', 'P16', 'P30']),
    woodear: r(4, 3, 5, 'medium', ['J05', 'J06', 'J26']),
  }),
  'shed.loss': perCrop({
    oyster: r(10, 5, 50, 'low', ['S07', 'S44'], 'About half fruit in the first flush'),
    pink: r(10, 5, 20, 'low', ['P02'], 'Grey\'s'),
    woodear: r(15, 10, 25, 'low', ['J07', 'J26'], 'Less tolerant of contamination than oyster'),
  }),
  'shed.first': perCrop({
    oyster: r(7, 4, 14, 'medium', ['S06', 'P08', 'P16']),
    pink: r(7, 4, 14, 'medium', ['S06', 'P08', 'P16']),
    woodear: r(18, 12, 30, 'medium', ['J06', 'J21', 'J24', 'J26']),
  }),
  'shed.interval': perCrop({
    oyster: r(14, 10, 20, 'medium', ['S06']),
    pink: r(12, 7, 15, 'medium', ['P04', 'P24']),
    woodear: r(20, 14, 30, 'medium', ['J21', 'J26']),
  }),
  'shed.turn': perCrop({
    oyster: r(13, 5, 40, 'low', ['S07', 'S47'], 'Set so the block life is 90 days (75–120)'),
    pink: r(14, 2, 50, 'low', ['P06', 'P07', 'P24'], 'Set so the block life is 45 days (30–84)'),
    woodear: r(7, 3, 40, 'low', ['J02', 'J03', 'J24'], 'Block life 85 days (60–120)'),
  }),
  'shed.kwhHouse': r(60, 0, 150, 'low', ['S07', 'G27'], 'Estimate: a misting pump and two fans'),
  'shed.labourMin': perCrop({
    oyster: r(4.05, 2.16, 21.6, 'low', ['S07', 'G07', 'G24'], '0.75 h per 1,000 blocks a day over 90 days; range 0.4–4 h'),
    pink: r(2.03, 1.35, 10.8, 'low', ['S07', 'G07'], 'Over 45 days'),
    woodear: r(3.83, 2.55, 20.4, 'low', ['J02', 'G07'], 'Over 85 days; misting 3–4 times a day'),
  }),
  'shed.transport': r(0, 0, 2, 'low', [], 'No source; a lowland farm near the Klang Valley. Enter your own'),
  'shed.rent': r(0, 0, 4000, 'low', ['L01']),
  'shed.house': r(5000, 1300, 10_000, 'low', ['G20', 'G21', 'G22', 'G23', 'G26'], 'RM 2.50 a block of room (0.65–5.00)'),
  'shed.humidifier': r(1500, 500, 3000, 'low', ['G27'], 'A shop quote of nearly RM 1,500 (2009)'),
  'shed.fans': r(300, 150, 2400, 'low', ['G28'], 'Estimate for one or two fans'),
};
const HIGHLAND = {
  'highland.yieldG': r(250, 150, 400, 'low', ['L01', 'L16'], 'Copies your container\'s although Cameron Highlands averages 17.9 °C, just below 18–24 °C'),
  ...Object.fromEntries(Object.entries(LIONS_HIGHLAND).map(([k, v]) => [`highland.${k}`, v])),
  'highland.kwhHouse': r(146, 126, 146, 'low', ['L37'], 'Fans 120 W all day (88 kWh) + a 2 L/h humidifier (58 kWh)'),
  'highland.transport': r(2, 1, 4, 'low', [], 'Placeholder to Klang Valley buyers; no source'),
  'highland.uphill': r(0, 0, 1, 'low', [], 'Placeholder; no source'),
  'highland.fans': r(1800, 900, 3000, 'low', ['L01'], 'No controller'),
};
const WARM = {
  'warm.yieldG': r(124, 93, 155, 'low', ['L02', 'L17', 'L28'], 'An assumed 80 g first flush (60–100) × 1.55, below Perak\'s "can reach" 150 g'),
  ...Object.fromEntries(Object.entries(LIONS_WARM).map(([k, v]) => [`warm.${k}`, v])),
  'warm.kwhHouse': r(146, 126, 146, 'low', ['L37'], 'As the highland grower\'s'),
  'warm.transport': r(0, 0, 2, 'low', []),
  'warm.fans': r(3300, 1700, 7500, 'low', ['L01']),
};
const RESEARCH = {
  tariff: r(0.55, 0.515, 0.596, 'medium', ['L18', 'L19', 'G01', 'G19'], 'LV non-domestic 50.68 sen + AFA 3.60 sen (Nov 2026) × 1.016 (KWTBB) = 55.15 sen; high: TNB\'s December forecast AFA +7.98 = 59.6 sen'),
  fixedTnb: r(20, 10, 20, 'medium', ['L18', 'S35'], 'RM 10 on the Specific Agriculture tariff if the farm qualifies (unverified)'),
  wage: r(10, 8.72, 12, 'medium', ['L21', 'G17', 'G18'], 'RM 8.72/h minimum plus about 15 % employer contributions'),
  life: r(60, 36, 96, 'low', ['L01'], 'The owner\'s earlier estimate; no interest'),
  price: perCrop({
    oyster: r(10, 8, 13, 'high', ['S12', 'S14', 'S15', 'S16', 'G04'], 'Farm-gate and wholesale; retail RM 16 (12–25)'),
    pink: r(20, 14, 45, 'low', ['P01', 'P03', 'P14', 'P21', 'P22'], 'No Malaysian pink wholesale price; coloured-oyster farm-gate RM 16'),
    woodear: r(25, 15, 30, 'medium', ['J01', 'J02', 'J08', 'J10', 'J11'], 'Growers quote RM 30; Chinese fresh black fungus at RM 18–24 retail caps what buyers pay'),
    lionsmane: r(50, 30, 70, 'low', ['L01', 'L02', 'L03', 'L05', 'L09', 'G10'], 'The owner\'s earlier estimate, between import (about RM 33) and farm-direct (RM 70, Perak)'),
  }),
  shrink: perCrop({
    oyster: r(5, 2, 15, 'low', ['S06'], 'Estimate; 3–4 days at 5–8 °C'),
    pink: r(10, 5, 25, 'low', ['P25', 'P26', 'P35'], 'About 24–36 h at room temperature, about 4 days chilled'),
    woodear: r(6, 3, 12, 'low', ['J21', 'J32'], 'Keeps 2–5 days at ambient, about 7 at 4 °C'),
    lionsmane: r(10, 5, 20, 'low', ['L01', 'L02'], 'A week in the fridge, two hours outside'),
  }),
  pack: perCrop({
    oyster: r(0.5, 0.2, 2, 'low', ['G09', 'G29', 'G30'], 'Wholesale bags about RM 0.20/kg; retail punnets about RM 2.00/kg'),
    pink: r(1.5, 0.8, 3, 'low', ['P09', 'P21', 'G29'], 'Estimate: small chilled punnets, frequent drops'),
    woodear: r(0.8, 0.5, 1.5, 'low', ['J08', 'G29'], 'Estimate: sold in 200 g trays'),
    lionsmane: r(3, 1.5, 5, 'low', ['L01'], 'The owner\'s earlier estimate; cold chain'),
  }),
  blockPrice: perCrop({
    oyster: r(2, 1.5, 2.8, 'medium', ['S01', 'S03', 'S47', 'G05'], 'Pontian seller RM 2.80 / 2.50 / 2.30 by quantity; own-made about RM 1.00'),
    pink: r(2.5, 2, 4.5, 'low', ['P03', 'P04', 'P05', 'P19', 'P20'], 'Online small orders RM 3.50–4.50; own-made about RM 1.00'),
    woodear: r(2.5, 2, 3.5, 'low', ['J19', 'J24', 'J25'], 'Not found: oyster blocks plus a premium; own-made about RM 1.30'),
    lionsmane: r(6, 3, 10, 'low', ['L01', 'L10', 'L36', 'G10'], 'No Malaysian block price; China 3 CNY a bag before freight'),
  }),
  'yours.yieldG': perCrop({
    oyster: r(238, 204, 340, 'low', ['S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S15', 'S17'], 'The shed\'s 170 g plus 40 % for the controlled room'),
    pink: r(200, 150, 300, 'low', ['P24', 'P29', 'P31', 'P32'], '+33 % on the shed; the gain is humidity, CO₂ and air'),
    woodear: r(260, 200, 400, 'low', ['J05', 'J21', 'J22'], 'About +45 % on the shed'),
    lionsmane: r(250, 150, 400, 'low', ['L01', 'L02', 'L13', 'L14', 'L15'], 'Malaysian 150 g in a warm room; Shandong factory 400 g'),
  }),
  'yours.flushes': perCrop({
    oyster: r(4, 3, 6, 'medium', ['APP'], 'The app\'s default program'),
    pink: r(2, 2, 3, 'medium', ['P09', 'P16', 'P24', 'P30']),
    woodear: r(4, 3, 6, 'low', ['J21', 'J22', 'J37'], 'Indonesia 4–8; flush 2 is bigger than flush 1'),
    lionsmane: r(2, 1, 3, 'medium', ['L13', 'L28'], 'First flush largest'),
  }),
  'yours.loss': perCrop({
    oyster: r(5, 2, 15, 'low', ['S44', 'L26'], 'Under 2 % in MARDI\'s controlled house, over 10 % in ordinary houses'),
    pink: r(5, 2, 10, 'low', ['P24'], 'Grey\'s; the mycelium dies below 8–10 °C'),
    woodear: r(7, 3, 12, 'low', ['J07'], 'Estimate; Malaysian growers report high contamination'),
    lionsmane: r(10, 5, 25, 'low', ['L01'], 'Bought blocks travel far'),
  }),
  'yours.first': perCrop({
    oyster: r(7, 3, 14, 'medium', ['S06', 'P08', 'APP'], 'Pins 3–5 days after opening; the app\'s fruiting stage is 7 days'),
    pink: r(7, 4, 14, 'medium', ['P04', 'P08', 'P09', 'P16']),
    woodear: r(18, 12, 30, 'medium', ['J06', 'J21', 'J24', 'J26'], 'Pins 4–10 days after slitting, picked 6–10 days later'),
    lionsmane: r(12, 10, 14, 'medium', ['L02', 'L06'], '11–13 days in Perak; about 10 in Mr Fungus\'s tents'),
  }),
  'yours.interval': perCrop({
    oyster: r(17, 12, 20, 'medium', ['S06', 'APP'], 'The app\'s fruiting 7 days + rest 10 days'),
    pink: r(12, 7, 15, 'medium', ['P04', 'P16', 'P24', 'P30']),
    woodear: r(20, 14, 30, 'medium', ['J21', 'J22', 'J26']),
    lionsmane: r(14, 10, 18, 'medium', ['L15'], '"14 days apart"'),
  }),
  'yours.turn': perCrop({
    oyster: r(2, 1, 10, 'low', ['S06', 'APP'], 'Set so the block life is the October 60 days (50–80)'),
    pink: r(6, 2, 10, 'low', ['P16', 'P24'], 'Set so the block life is 25 days (20–55)'),
    woodear: r(7, 3, 10, 'low', [], 'Not found; grey\'s. Block life 85 days'),
    lionsmane: r(16, 9, 30, 'low', ['L01'], LIONS_42),
  }),
  'yours.kwhBlock': perCrop({
    oyster: r(0.46, 0.4, 0.55, 'medium', ['APP'], 'The app\'s simulation (October)'),
    pink: r(0.19, 0.1, 0.4, 'low', ['APP'], 'Estimate: grey\'s 0.46 kWh over 60 days per block-day, over pink\'s 25 days. Work it out for the room'),
    woodear: r(0.65, 0.4, 1, 'low', ['APP'], 'Estimate: as pink, over 85 days. Work it out for the room'),
    lionsmane: r(0.4, 0.4, 1.63, 'medium', ['L38'], 'The cooling page\'s low case for a 60 m³ room at full racks'),
  }),
  'yours.labourMin': perCrop({
    oyster: r(2.7, 1.44, 14.4, 'low', ['S07', 'G07', 'G24'], '0.75 h per 1,000 blocks a day over the 60-day life; range 0.4–4 h'),
    pink: r(1.13, 0.75, 6, 'low', ['S07', 'G07'], 'Grey\'s rate over 25 days; picked daily'),
    woodear: r(3.83, 2.55, 20.4, 'low', ['J02', 'J21', 'G07'], 'Grey\'s rate over 85 days'),
    lionsmane: r(2.52, 1.26, 5.04, 'low', ['L01'], '1 h per 1,000 blocks a day over 42 days'),
  }),
  'yours.transport': r(0, 0, 2, 'low', [], 'No source; a lowland farm near the Klang Valley. Enter your own'),
  'yours.rent': r(0, 0, 4000, 'low', ['L01', 'L35'], 'The owner, 2026-10-27: likely 0'),
  'yours.fans': r(3300, 1700, 7500, 'low', ['L01'], 'Fan pair 800, controller 1,500, wiring 1,000; none sourced'),
  ...SHED,
  ...HIGHLAND,
  ...WARM,
  'import.landed': perCrop({
    woodear: r(13, 10, 16, 'low', ['J08', 'J09', 'J11', 'J29'], 'Not found: back-calculated from Chinese fresh black fungus at RM 18–24/kg retail'),
    lionsmane: r(40.86, 26.53, 53.12, 'low', ['L09', 'G02', 'G13', 'G14'], 'USD 8.10 × 4.057 + RM 8.00 freight, duty and handling (a placeholder)'),
  }),
  'import.buyHours': r(2, 1.4, 2.6, 'low', [], 'Placeholder'),
  'import.rent': r(0, 0, 4000, 'low', ['L01']),
};

// The room-size defaults (appendix 1.4): over 40 m³ a 40 ft high cube, else a 20 ft.
const BLOCKS_PER_M3 = 22;
const BIG_ROOM_M3 = 40;
const HUMIDIFIER_LH = 6; // one humidifier per 6 L/h of the room's humidifier output, at least one
export const sizeOf = (room) => (room.volume > BIG_ROOM_M3 ? '40 ft' : '20 ft');
function roomResearch(key, room, blocks) {
  const big = room.volume > BIG_ROOM_M3;
  if (key === 'yours.blocks') {
    const cap = (n) => Math.min(figureOf('yours.blocks').max, n); // a huge room's count stays a figure the page may save
    return r(cap(Math.max(1, Math.floor(room.volume * BLOCKS_PER_M3))), cap(Math.floor(room.volume * 8.3)), cap(Math.floor(room.volume * 29)), 'low', ['L38'],
      '29 blocks a m³ of room at full racks, a container counting 75 % of its volume; the simulator\'s test load is 8.3');
  }
  if (key === 'yours.container') {
    return r(big ? 38_100 : 24_550, 17_300, 38_100, 'low', ['L29', 'L31'], big ? 'A used 40 ft reefer RM 36,800 + haulage and a side loader' : 'A used 20 ft reefer RM 23,500 + haulage and a side loader');
  }
  if (key === 'yours.cooling') {
    return r(big ? 9040 : 4520, 3960, 9040, 'medium', ['G16', 'L23', 'L38'], big ? '2 × Daikin FTKF 2.5 hp at RM 4,170 + RM 350 fitting' : 'A Daikin FTKF 2.5 hp at RM 4,170 + RM 350 fitting');
  }
  if (key === 'yours.humidifier') {
    const units = Math.max(1, Math.ceil((room.humidifierLH ?? 0) / HUMIDIFIER_LH));
    return r(1500 * units, 900 * units, 3000 * units, 'low', ['S42', 'L01'], `RM 1,500 a unit, ${units} for ${room.humidifierLH ?? 0} L/h`);
  }
  if (key === 'yours.racks') {
    const n = Number.isFinite(blocks) ? blocks : roomResearch('yours.blocks', room).value;
    return r(Math.round(0.7 * n * 100) / 100, Math.round(0.2 * n * 100) / 100, Math.round(1.3 * n * 100) / 100, 'medium', ['G21', 'G25', 'G33'], 'RM 0.70 a block (0.20–1.30): an iron rack RM 250 for 350 blocks');
  }
  return undefined;
}

// A figure's research default for crop in room ({ volume, humidifierLH }), with blocks the room's blocks as the page uses
// them (the racks follow them): { value, low, high, confidence, sources, note }, or null when the figure has none for crop.
export function researchOf(key, crop, room, blocks) {
  if (!figuresFor(crop).some((f) => f.key === key)) return null;
  const entry = roomResearch(key, room, blocks) ?? RESEARCH[key];
  const one = entry?.perCrop ? entry.perCrop[crop] : entry;
  return one ? { ...one, sources: [...one.sources] } : null; // a copy: a caller changing it changes nothing for the next
}

// The sources of the defaults (appendix section 6): id → { title (short), url (null: this repository), year }.
export const SOURCES = {
  APP: { title: "This app's simulation", url: null, year: '2026' },
  S01: { title: 'Threads', url: 'https://www.threads.com/@saiful_sifucendawan/post/DbAUzlVEiGY/promosi-jualan-bongkah-cendawan-tiram-kelabu-harga-bongkah-cendawan-rm-rm/', year: '2026' },
  S03: { title: 'Siswazah Tani', url: 'https://siswazah-tani.blogspot.com/2020/11/jualan-bongkah-cendawan-tiram-kelabu.html', year: '2020' },
  S04: { title: 'Siswazah Tani', url: 'https://siswazah-tani.blogspot.com/2020/01/cara-mengira-kos-penghasilan-beg.html', year: '2020' },
  S06: { title: 'DOA', url: 'https://epengembangan.doa.gov.my/en/tanaman/komoditi-berpotensi/cendawan/', year: '' },
  S07: { title: 'Cendawan Online', url: 'https://cendawanonline.wordpress.com/', year: '2018' },
  S08: { title: 'Petani', url: 'https://petani.my/cara-tanam-cendawan-tiram-di-rumah/', year: '' },
  S09: { title: 'ScienceDirect', url: 'https://www.sciencedirect.com/science/article/pii/S0304423813003129', year: '2013' },
  S10: { title: 'ResearchGate', url: 'https://www.researchgate.net/publication/376638044_SCIPe_MARDI_Pakej_lengkap_untuk_industri_cendawan_tempatan_SCIPe_MARDI_A_complete_package_for_the_local_mushroom_industry', year: '' },
  S11: { title: 'MARDI', url: 'http://etmr.mardi.gov.my/index.php/25-abstract/2013/volume-8/57-daya-maju-perusahaan-cendawan-tiram-di-semenanjung-malaysia', year: '2013' },
  S12: { title: 'Utusan Borneo', url: 'https://www.utusanborneo.com.my/2025/12/20/pengusaha-tanaman-cendawan-tiram-mampu-meraih-pendapatan-lumayan', year: '2025' },
  S14: { title: 'Sinar Harian', url: 'https://www.sinarharian.com.my/article/257798/edisi/johor/cuaca-panas-pengeluaran-cendawan-tiram-terjejas', year: '2023' },
  S15: { title: 'Agrimag', url: 'https://agrimag.my/en/article-details/pengeluaran-harian-300-kg-bekalan-cendawan-tiram-masih-kurang', year: '2023' },
  S16: { title: 'Harga Sekilo', url: 'https://www.hargasekilo.my/harga-cendawan-tiram/', year: '2026' },
  S17: { title: 'ScienceDirect', url: 'https://www.sciencedirect.com/science/article/pii/S2666154323004593', year: '2023' },
  S35: { title: 'TNB', url: 'https://www.mytnb.com.my/ms-MY/business/understand-your-bill/pricing-tariff', year: '2026' },
  S42: { title: 'Duokai', url: 'https://duokai.en.made-in-china.com/product/ZdoteFAVELrT/China-CE-Approved-24-Liter-Per-Hour-Ultrasonic-Air-Humidifier-Industrial-Agriculture-Grow-Room-Mushroom-Fogger.html', year: '2026' },
  S44: { title: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/39384289/', year: '2024' },
  S47: { title: 'Sinar Harian', url: 'https://www.sinarharian.com.my/article/159472/edisi/cendawan-tiram-beri-pendapatan-lumayan-buat-suami-isteri', year: '2021' },
  L01: { title: 'October defaults', url: null, year: '2026' },
  L02: { title: 'Malaysiaaktif', url: 'https://malaysiaaktif.my/2025/04/cendawan-kobis-bunga-tarik-perhatian-penduduk-seberang-perak', year: '2025' },
  L03: { title: 'Dusun', url: 'https://dusun.com.my/product/organic-local-fresh-lion-mane-200gm/', year: '2026' },
  L05: { title: 'Vegan District', url: 'https://vegandistrict.my/products/lions-head-mushroom-100g', year: '2026' },
  L06: { title: 'Mr Fungus', url: 'https://www.mrfungus.com.my/', year: '2026' },
  L09: { title: 'Tridge', url: 'https://www.tridge.com/market-overview/fresh-lion-s-mane-mushroom', year: '2026' },
  L10: { title: 'Sina Finance', url: 'https://finance.sina.com.cn/jjxw/2025-04-12/doc-inesvpzh4569524.shtml', year: '2025' },
  L13: { title: 'Nongji', url: 'https://www.nongji1958.com/index.php/node/61629', year: '2023' },
  L14: { title: 'Europe PMC', url: 'https://europepmc.org/article/PMC/PMC10432537', year: '2023' },
  L15: { title: 'Stamets (archive.org)', url: 'https://archive.org/details/PaulStametsGrowingGourmetAndMedicinalMushrooms2000', year: '1993' },
  L16: { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Cameron_Highlands', year: '' },
  L17: { title: 'Bewilder', url: 'https://www.bewildersg.com/grow-kits/p/wr2za998wnnh7ueme24e1kxtntsa7k', year: '2026' },
  L18: { title: 'Arus Energ', url: 'https://arusenerg.com/tnb-tariff-malaysia/', year: '2026' },
  L19: { title: 'TNB', url: 'https://www.mytnb.com.my/tariff/index.html?lang=en', year: '2026' },
  L21: { title: 'MOHR', url: 'https://gajiminimum.mohr.gov.my/wp-content/uploads/PUA%20376.pdf', year: '2024' },
  L23: { title: 'Calculator Malaysia', url: 'https://calculatormalaysia.com/harga/harga-aircond-malaysia/', year: '2026' },
  L26: { title: 'HH Publisher', url: 'https://journals.hh-publisher.com/index.php/AAFRJ/article/view/444', year: '2021' },
  L28: { title: 'Out-Grow', url: 'https://www.out-grow.com/pages/lions-mane-warm-weather-hericium-erinaceus', year: '2026' },
  L29: { title: 'Carousell', url: 'https://www.carousell.com.my/reefer-container/q/', year: '2026' },
  L31: { title: 'DNE Logistics', url: 'https://dnelogistics.com.my/container-haulage-port-klang-rates-routes.html', year: '2026' },
  L35: { title: 'Mudah', url: 'https://www.mudah.my/selangor/shop-lot-for-rent', year: '2026' },
  L36: { title: 'Shroomy', url: 'https://www.shroomy-tek.com/products/lions-mane-grow-kit', year: '2026' },
  L37: { title: "The simulator's model", url: null, year: '2026' },
  L38: { title: 'Cooling page', url: null, year: '2026' },
  P01: { title: 'Free Malaysia Today', url: 'https://www.freemalaysiatoday.com/category/bahasa/2020/01/05/pesara-tentera-tanam-cendawan-tiram-warna-warni', year: '2020' },
  P02: { title: 'Free Malaysia Today', url: 'https://www.freemalaysiatoday.com/category/nation/2020/01/05/money-making-world-of-mokhtars-multi-coloured-mushrooms', year: '2020' },
  P03: { title: 'Animhosnan', url: 'http://animhosnan.blogspot.com/2022/12/cendawan-tiram-warna-warni.html', year: '2022' },
  P04: { title: 'Lazada', url: 'https://www.lazada.com.my/products/bongkah-cendawan-tiram-pink-i2426799976.html', year: '' },
  P05: { title: 'PG Mall', url: 'https://pgmall.my/p/U277/4281', year: '' },
  P06: { title: 'ZZ Agro', url: 'http://zz-agro.blogspot.com/2011/11/cendawan-cendawan-berpotensi-di.html', year: '2011' },
  P07: { title: 'Cendawan Global', url: 'http://cendawanglobal.blogspot.com/2007/09/cendawan-merah-jambu.html', year: '2007' },
  P08: { title: 'DOA', url: 'https://epengembangan.doa.gov.my/en/tanaman/komoditi-berpotensi/', year: '' },
  P09: { title: 'Shroomy', url: 'https://www.shroomy-tek.com/', year: '2026' },
  P10: { title: 'Mogoo Farm', url: 'https://mogoofarm.com/', year: '' },
  P11: { title: 'Animagro', url: 'http://animagro.blogspot.com/2020/07/types-of-oyster-mushroom.html', year: '2020' },
  P14: { title: 'SupplyBunny', url: 'https://www.supplybunny.com/en/products/oyster-mushroom-sold-per-kg-735d8cc4-fce1-4b9f-8926-7708282d22e6', year: '2025' },
  P16: { title: 'Trubus', url: 'https://trubus.id/jamur-tiram-merah-muda-dan-kuning-lezat-dan-bergizi/', year: '2024' },
  P17: { title: 'Unand', url: 'https://tpa.fateta.unand.ac.id/index.php/JTPA/article/view/621', year: '2022' },
  P19: { title: 'Nanagarden', url: 'https://www.nanagarden.com/product/192564', year: '' },
  P20: { title: 'CECD Chonburi', url: 'https://cecdchonburi.com/?product=quality-mushroom-spawn', year: '' },
  P21: { title: 'CMPC Coop', url: 'https://cmpccoop.com/?portfolio=fresh-mushrooms-oyster-mushrooms-pink-gull-mushrooms-golden-oyster-mushrooms', year: '' },
  P22: { title: 'DOAE', url: 'https://smce2023.doae.go.th/product_detail.php?smce_id=650110810042&ps_id=6598', year: '' },
  P24: { title: 'Mycelia', url: 'https://mycelia.be/m2708-pleurotus-djamor/', year: '' },
  P25: { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Pleurotus_djamor', year: '' },
  P26: { title: 'IJCMAS', url: 'https://www.ijcmas.com/9-11-2020/R.%20Kavipriya,%20et%20al.pdf', year: '2020' },
  P27: { title: 'Nature Lion', url: 'https://naturelion.ca/blog/pink-oyster-mushroom-guide', year: '' },
  P28: { title: 'Out-Grow', url: 'https://www.out-grow.com/blogs/growing-mushrooms/growing-pink-oyster-mushrooms-is-it-that-easy', year: '' },
  P29: { title: 'Lykyn', url: 'https://lykyn.com/blogs/news/pink-oyster-grow-kit', year: '' },
  P30: { title: 'Shroomery', url: 'https://www.shroomery.org/9406/Pleurotus-djamor', year: '' },
  P31: { title: 'Pak. J. Bot.', url: 'http://www.pakbs.org/pjbot/PDFs/44(1)/61.pdf', year: '2012' },
  P32: { title: 'JAB', url: 'https://jabonline.in/abstract.php?article_id=1247&sts=2', year: '' },
  P33: { title: 'Tridge', url: 'https://www.tridge.com/tridge-woods/fresh-oyster-mushroom/CN', year: '2022' },
  P35: { title: 'ResearchGate', url: 'https://www.researchgate.net/publication/351265218_Determination_of_how_to_minimize_postharvest_losses_in_oyster_mushroom_Pleurotus_ostreatus', year: '' },
  P37: { title: 'Kuanju', url: 'https://kuanju.wordpress.com/2013/06/24/mushroom-farm-cameron-highlands/', year: '2013' },
  J01: { title: 'TRDI', url: 'https://www.trdi.my/usahawan-cendawan-terengganu-rancang-tembusi-pasaran-eksport', year: '2024' },
  J02: { title: 'Bernama', url: 'https://www.bernama.com/bm/news.php?id=1814697', year: '2020' },
  J03: { title: 'Animhosnan', url: 'http://animhosnan.blogspot.com/2014/07/cendawan-jeli-hitam-part-1.html', year: '2014' },
  J05: { title: 'ResearchGate', url: 'https://www.researchgate.net/publication/324673393_Antioxidant_Properties_and_Yield_of_Wood_Ear_Mushroom_Auricularia_polytricha_Agaricomycetes_Cultivated_on_Rubberwood_Sawdust', year: '2018' },
  J06: { title: 'SciAlert', url: 'https://scialert.net/fulltext/?doi=ajps.2014.111.119', year: '2014' },
  J07: { title: 'CORE', url: 'https://files01.core.ac.uk/download/pdf/268875774.pdf', year: '' },
  J08: { title: "Lotus's", url: 'https://www.lotuss.com.my/p/fresh-black-fungus-200g-75189332', year: '2026' },
  J09: { title: 'Village Grocer', url: 'https://vkg.bites.com.my/products/china-fresh-black-fungus-200g', year: '2026' },
  J10: { title: 'Jaya Grocer', url: 'https://jgcj.jayagrocer.com/products/mushroom-vt-black-jelly-200g-mys', year: '2026' },
  J11: { title: 'Jaya Grocer', url: 'https://klec.jayagrocer.com/products/black-fungus-mushroom-china-200g', year: '2026' },
  J12: { title: 'Doremi', url: 'https://www.doremi.my/fresh-black-fungus', year: '2026' },
  J14: { title: 'Great Ocean', url: 'https://greatocean.my/product/1kg-black-fungus-qing-shui-%E6%B8%85%E6%B0%B4%E7%99%BD%E8%83%8C%E9%BB%91%E6%9C%A8%E8%80%B3-1kg/', year: '2026' },
  J15: { title: 'NBS Grocery', url: 'https://www.nbsgrocery.com/showproducts/productid/3254283/cid/344643/goldenhorse-black-fungus-1kg-%E9%87%91%E9%A9%AC%E7%89%8C-%E9%BB%91%E6%9C%A8%E8%80%B3-kulat-hitam/', year: '2026' },
  J16: { title: 'SupplyBunny', url: 'https://www.supplybunny.com/en/products/dried-black-fungus-cloud-ear-100g-sold-per-packet-cendawan-telinga-tikus', year: '2026' },
  J17: { title: 'Lazada', url: 'https://www.lazada.com.my/products/hot-sale-100-organic-high-quality-50-gram-dried-black-jelly-mushroom-from-farm-50-gram-cendawan-telinga-kera-kering-dari-ladang-i2449171754.html', year: '2026' },
  J19: { title: 'Threads', url: 'https://www.threads.com/@saiful_sifucendawan/post/DbAUzlVEiGY/promosi-jualan-bongkah-cendawan-tiram-kelabu-harga-bongkah-cendawan-rm-rm/', year: '2026' },
  J21: { title: 'Trubus', url: 'https://trubus.id/berdaya-karena-jamur-kuping/', year: '2020' },
  J22: { title: "Ma'soem University", url: 'https://masoemuniversity.ac.id/artikel/memulai-bisnis-jamur-kuping-dari-budidaya-hingga-menjadi-pemasok-pasar/', year: '2026' },
  J24: { title: 'Khaosod', url: 'https://www.khaosod.co.th/technologychaoban/featured/article_259400', year: '' },
  J25: { title: 'Nanagarden', url: 'https://www.nanagarden.com/tag/%E0%B9%80%E0%B8%AB%E0%B9%87%E0%B8%94%E0%B8%AB%E0%B8%B9%E0%B8%AB%E0%B8%99%E0%B8%B9', year: '' },
  J26: { title: 'Kepu China', url: 'https://www.kepuchina.cn/xc/201809/t20180918_733231.shtml', year: '2018' },
  J27: { title: 'CNHNB', url: 'https://www.cnhnb.com/xt/article-113868.html', year: '' },
  J29: { title: 'CNHNB', url: 'https://www.cnhnb.com/p/muer-0-0-15303-0-1/', year: '2025' },
  J30: { title: 'YMT', url: 'https://news.ymt.com/new_arg_tech/eEoeFH6B', year: '' },
  J32: { title: 'Viet World Kitchen', url: 'https://www.vietworldkitchen.com/blog/2026/05/wood-ear-mushroom-and-black-fungus-a-beginners-guide-to-buying-prepping-and-cooking.html', year: '2026' },
  J37: { title: 'ResearchGate', url: 'https://www.researchgate.net/publication/340806952_Cultivation_of_a_wild_strain_of_Auricularia_cornea_from_Thailand', year: '2020' },
  G01: { title: 'Paul Tan', url: 'https://paultan.org/2026/11/02/tnb-bill-afa-rate-november-2026-set-at-3-60-sen-kwh/', year: '2026' },
  G02: { title: 'Bank Negara', url: 'https://www.bnm.gov.my/kuala-lumpur-usd/myr-reference-rate', year: '2026' },
  G03: { title: 'Investing.com', url: 'https://www.investing.com/currencies/usd-myr-historical-data', year: '2026' },
  G04: { title: 'Harga Sekilo', url: 'https://www.hargasekilo.my/harga-cendawan-tiram/', year: '2026' },
  G05: { title: 'Threads', url: 'https://www.threads.com/@saiful_sifucendawan/post/DbAUzlVEiGY/promosi-jualan-bongkah-cendawan-tiram-kelabu-harga-bongkah-cendawan-rm-rm/', year: '2026' },
  G06: { title: 'Mudah', url: 'https://www.mudah.my/bongkah-cendawan-tiram-kelabu-matang100-115559660.htm', year: '2026' },
  G07: { title: 'Utusan', url: 'https://www.utusan.com.my/nasional/2026/11/cendawan-ubah-hidup-bekas-tukang-binaan/', year: '2026' },
  G08: { title: 'MARDI', url: 'http://etmr.mardi.gov.my/index.php/25-abstract/2013/volume-8/57-daya-maju-perusahaan-cendawan-tiram-di-semenanjung-malaysia', year: '2013' },
  G09: { title: 'Agrimag', url: 'https://agrimag.my/en/article-details/pengeluaran-harian-300-kg-bekalan-cendawan-tiram-masih-kurang', year: '2023' },
  G10: { title: 'Shroomy', url: 'https://www.shroomy-tek.com/', year: '2026' },
  G11: { title: 'Dusun', url: 'https://dusun.com.my/product/organic-local-fresh-lion-mane-200gm/', year: '' },
  G13: { title: 'Tridge', url: 'https://www.tridge.com/intelligences/lions-mane-mushroom/price', year: '2026' },
  G14: { title: 'Tridge', url: 'https://www.tridge.com/market-overview/fresh-lion-s-mane-mushroom#price', year: '2026' },
  G15: { title: 'Vegan District', url: 'https://vegandistrict.my/products/lions-head-mushroom-100g', year: '' },
  G16: { title: 'Daikin', url: 'https://www.daikin.com.my/products/residential/wall-mounted/ftkf-series', year: '2026' },
  G17: { title: 'The Star', url: 'https://www.thestar.com.my/news/nation/2026/10/09/budget-2027-minimum-wage-to-rise-to-rm2000-from-june-2027-says-anwar', year: '2026' },
  G18: { title: 'Maukerja', url: 'https://www.maukerja.my/career-advice/blog/ms/34016/gaji-minimum-malaysia', year: '2026' },
  G19: { title: 'Cobler', url: 'https://cobler.io/blog/your-tnb-bill-line-by-line', year: '2026' },
  G20: { title: 'Le Mushroom', url: 'http://lemushroom.blogspot.com/2010/05/mesin-mixer-dan-bagging-bag-cendawan-2.html', year: '' },
  G21: { title: 'Animhosnan', url: 'http://animhosnan.blogspot.com/2018/06/agrimaths-cendawan-part-12.html', year: '2018' },
  G22: { title: 'Harizamrry', url: 'https://harizamrry.wordpress.com/2008/01/29/bantuan-dan-insentif-dalam-industri-cendawan/', year: '2008' },
  G23: { title: 'Selangor assembly', url: 'https://dewan.selangor.gov.my/question/pertanian-13/', year: '2012' },
  G24: { title: 'Perak Sejahtera', url: 'https://www.peraksejahtera.com/dari-kokpit-ke-kebun/', year: '2026' },
  G25: { title: 'Lazada', url: 'https://www.lazada.com.my/products/installation-rak-tinggi-cendawan-tiram-7-14-days-delivery-i4044543166.html', year: '' },
  G26: { title: 'PJK', url: 'https://www.pjk.edu.my/penerbitanPJK/9.%20AGRO%20-%20FatihahAidaZalina.pdf', year: '' },
  G27: { title: 'URS Agro', url: 'http://ursagro.blogspot.com/2009/02/pemasangan-misting-system.html', year: '2009' },
  G28: { title: 'Saidina', url: 'https://saidinafurniture.com/product/mist-fan/', year: '' },
  G29: { title: 'BigGo', url: 'https://my.biggo.com/s/punnet/', year: '2026' },
  G30: { title: 'Abi Agro', url: 'https://abiagro.com.my/plastik-pembalut-buah/', year: '' },
  G31: { title: 'ResearchGate', url: 'https://www.researchgate.net/publication/306522802_Comparative_Study_of_Fruiting_Body_Production_of_some_Oyster_Mushroom_in_Two_Different_Temperatures', year: '' },
  G32: { title: 'The Vibes', url: 'https://www.thevibes.com/index.php/articles/lifestyles/84354/Teacher-turned-entrepreneur-extolls-virtues-of-mushrooms-as-unexplored-commodity', year: '' },
  G33: { title: 'Mudah', url: 'https://www.mudah.my/rak-cendawan-109639455.htm', year: '' },
};
