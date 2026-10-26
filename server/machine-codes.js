// The names and codes of the machines (spec 2026-10-16-machines-design.md, section 2).

// Position = relay output / current input number.
export const RELAY_KEYS = ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights'];

// Position = register code.
export const MODES = ['cool', 'heat', 'dry', 'fan'];
export const FANS = ['auto', 'low', 'high'];
