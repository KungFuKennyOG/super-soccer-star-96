// Every team in the game: 32 nations for the World Cup, 16 city clubs for the Champions Cup.
// Kits are colors and patterns only (no crests, sponsors or club names). Strength is 1 (weak) to 5 (giant).
// Pure data plus a few helpers; no three, no DOM.
//
// kit: { pattern, shirt, alt, shorts, socks, band, trim, trim2, number, outline?, sleeve? }
//   pattern: 'solid' | 'stripes' (vertical) | 'hoops' (horizontal) | 'checks' | 'band' (one centre stripe)
//            | 'sleeves' (body in shirt, sleeves in alt)
//   alt: the pattern's second color. sleeve: sleeve color (defaults to shirt, or alt for 'sleeves').

const k = (pattern, shirt, alt, shorts, socks, trim, number, extra = {}) =>
  ({ pattern, shirt, alt: alt || shirt, shorts, socks, band: extra.band || trim, trim, trim2: extra.trim2 || trim, number, ...extra });

const W = '#f2f1ea', BLK = '#161618', NAVY = '#14204f', RED = '#c8102e', GOLD = '#f2c21a', GREEN = '#1b7a3a', SKY = '#7cbbe8';

export const NATIONS = [
  // Europe
  { id: 'GER', name: 'GERMANY', s: 5, kit: k('solid', W, null, BLK, W, BLK, BLK, { trim2: RED }) },
  { id: 'ITA', name: 'ITALY', s: 5, kit: k('solid', '#1d4fa8', null, W, '#1d4fa8', W, W) },
  { id: 'FRA', name: 'FRANCE', s: 5, kit: k('solid', '#1a3a8a', null, W, RED, RED, W, { trim2: W }) },
  { id: 'ENG', name: 'ENGLAND', s: 4, kit: k('solid', W, null, NAVY, W, NAVY, NAVY, { trim2: RED }) },
  { id: 'ESP', name: 'SPAIN', s: 4, kit: k('solid', RED, null, NAVY, NAVY, GOLD, GOLD) },
  { id: 'NED', name: 'NETHERLANDS', s: 4, kit: k('solid', '#f47a20', null, W, '#f47a20', NAVY, W) },
  { id: 'POR', name: 'PORTUGAL', s: 4, kit: k('solid', '#a8142a', null, GREEN, '#a8142a', GREEN, GOLD) },
  { id: 'BEL', name: 'BELGIUM', s: 3, kit: k('solid', RED, null, RED, RED, BLK, GOLD, { trim2: GOLD }) },
  { id: 'CRO', name: 'CROATIA', s: 4, kit: k('checks', W, RED, W, '#1d3f94', '#1d3f94', '#1d3f94') },
  { id: 'DEN', name: 'DENMARK', s: 3, kit: k('solid', RED, null, W, RED, W, W) },
  { id: 'SWE', name: 'SWEDEN', s: 3, kit: k('solid', '#ffd400', null, '#1b4fa0', '#ffd400', '#1b4fa0', '#1b4fa0') },
  { id: 'ROU', name: 'ROMANIA', s: 3, kit: k('solid', '#f5d10a', null, '#1b4fa0', RED, '#1b4fa0', '#1b4fa0') },
  { id: 'BUL', name: 'BULGARIA', s: 3, kit: k('solid', W, null, GREEN, W, GREEN, GREEN, { trim2: RED }) },
  { id: 'NOR', name: 'NORWAY', s: 3, kit: k('solid', RED, null, W, NAVY, NAVY, W, { trim2: W }) },
  // South America
  { id: 'BRA', name: 'BRAZIL', s: 5, kit: k('solid', '#ffd800', null, '#1f4fb0', W, GREEN, GREEN) },
  { id: 'ARG', name: 'ARGENTINA', s: 5, kit: k('stripes', SKY, W, BLK, W, NAVY, NAVY) },
  { id: 'URU', name: 'URUGUAY', s: 3, kit: k('solid', '#74b4e8', null, BLK, BLK, W, BLK) },
  { id: 'COL', name: 'COLOMBIA', s: 3, kit: k('solid', '#ffd200', null, '#1b3f9a', RED, RED, '#1b3f9a') },
  { id: 'CHI', name: 'CHILE', s: 3, kit: k('solid', RED, null, '#1b3f9a', W, W, W) },
  // Africa
  { id: 'NGA', name: 'NIGERIA', s: 3, kit: k('solid', '#1a8a3a', null, '#1a8a3a', '#1a8a3a', W, W) },
  { id: 'CMR', name: 'CAMEROON', s: 3, kit: k('solid', '#1a8a3a', null, RED, GOLD, GOLD, GOLD) },
  { id: 'MAR', name: 'MOROCCO', s: 2, kit: k('solid', RED, null, GREEN, RED, GREEN, W) },
  { id: 'SEN', name: 'SENEGAL', s: 3, kit: k('solid', W, null, W, W, GREEN, GREEN, { trim2: GOLD }) },
  { id: 'GHA', name: 'GHANA', s: 2, kit: k('solid', W, null, W, W, BLK, BLK, { trim2: GOLD }) },
  // Asia and Oceania
  { id: 'JPN', name: 'JAPAN', s: 2, kit: k('solid', '#1a3f9a', null, W, '#1a3f9a', RED, W) },
  { id: 'KOR', name: 'SOUTH KOREA', s: 2, kit: k('solid', RED, null, NAVY, RED, W, W) },
  { id: 'KSA', name: 'SAUDI ARABIA', s: 1, kit: k('solid', W, null, GREEN, W, GREEN, GREEN) },
  { id: 'IRN', name: 'IRAN', s: 2, kit: k('solid', W, null, W, W, RED, GREEN, { trim2: GREEN }) },
  { id: 'AUS', name: 'AUSTRALIA', s: 2, kit: k('solid', '#ffc72c', null, GREEN, '#ffc72c', GREEN, GREEN) },
  // North America
  { id: 'MEX', name: 'MEXICO', s: 3, kit: k('solid', '#127a3a', null, W, RED, RED, W) },
  { id: 'USA', name: 'USA', s: 2, kit: k('solid', W, null, NAVY, W, RED, NAVY, { trim2: NAVY }) },
  { id: 'CAN', name: 'CANADA', s: 2, kit: k('solid', RED, null, RED, RED, W, W) },
];

export const CLUBS = [
  { id: 'MAD', name: 'MADRID', s: 5, kit: k('solid', W, null, W, W, '#2b2f6b', '#2b2f6b', { trim2: '#d9b23a' }) },
  { id: 'BAR', name: 'BARCELONA', s: 5, kit: k('stripes', '#1d3f94', '#9a1c3c', NAVY, NAVY, NAVY, GOLD, { band: '#9a1c3c', sleeve: '#9a1c3c', outline: NAVY, trim2: GOLD }) },
  { id: 'MUN', name: 'MUNICH', s: 5, kit: k('solid', '#d00027', null, W, '#d00027', W, W) },
  { id: 'MRB', name: 'MILAN RED/BLACK', s: 5, kit: k('stripes', '#c4161c', BLK, W, BLK, W, W, { outline: BLK }) },
  { id: 'MAN', name: 'MANCHESTER', s: 4, kit: k('solid', '#d0101e', null, W, BLK, BLK, W, { trim2: W }) },
  { id: 'LIV', name: 'LIVERPOOL', s: 4, kit: k('solid', RED, null, RED, RED, W, W) },
  { id: 'LDR', name: 'LONDON RED', s: 4, kit: k('sleeves', '#db0007', W, W, W, W, W, { band: '#db0007' }) },
  { id: 'LDB', name: 'LONDON BLUE', s: 4, kit: k('solid', '#034694', null, '#034694', W, W, W) },
  { id: 'TUR', name: 'TURIN', s: 4, kit: k('stripes', BLK, W, W, W, BLK, GOLD, { outline: BLK, sleeve: BLK }) },
  { id: 'MBB', name: 'MILAN BLUE/BLACK', s: 4, kit: k('stripes', '#0a3ea0', BLK, BLK, BLK, GOLD, W, { outline: BLK }) },
  { id: 'DOR', name: 'DORTMUND', s: 4, kit: k('solid', '#fde100', null, BLK, '#fde100', BLK, BLK) },
  { id: 'PAR', name: 'PARIS', s: 4, kit: k('band', '#0b2a5b', RED, '#0b2a5b', '#0b2a5b', RED, W) },
  { id: 'AMS', name: 'AMSTERDAM', s: 3, kit: k('band', W, '#d2122e', W, W, '#d2122e', BLK) },
  { id: 'PRT', name: 'PORTO', s: 3, kit: k('stripes', '#1f3e93', W, '#1f3e93', '#1f3e93', W, GOLD, { outline: '#1f3e93', sleeve: '#1f3e93' }) },
  { id: 'LIS', name: 'LISBON', s: 3, kit: k('solid', RED, null, W, RED, W, W) },
  { id: 'GLA', name: 'GLASGOW', s: 2, kit: k('hoops', GREEN, W, W, W, GREEN, BLK) },
];

export const ALL = [...NATIONS, ...CLUBS];
export const byId = id => ALL.find(t => t.id === id);
export const teamsFor = cup => (cup === 'world' ? NATIONS : CLUBS);

/* ---------- kit helpers ---------- */

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const colorDist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const light = hex => { const [r, g, b] = rgb(hex); return 0.3 * r + 0.59 * g + 0.11 * b; };

// Do two kits look too alike to play each other?
export function kitsClash(a, b) {
  return colorDist(a.shirt, b.shirt) < 110 || (colorDist(a.shirt, b.alt) < 90 && colorDist(a.alt, b.shirt) < 90);
}

// A plain change kit: white with the home colors as trim, or dark navy if the home kit is pale.
export function awayKit(kit) {
  const pale = light(kit.shirt) > 170;
  const shirt = pale ? '#1a2350' : '#f2f1ea', other = pale ? '#f2f1ea' : kit.shirt;
  return { pattern: 'solid', shirt, alt: shirt, shorts: pale ? '#1a2350' : '#f2f1ea', socks: shirt, band: other, trim: other, trim2: other, number: other };
}

// The opponent's kit for a match against `home`: their own, or the change kit on a clash.
export function matchKit(opp, home) {
  return kitsClash(opp.kit, home.kit) ? awayKit(opp.kit) : opp.kit;
}

// Goalkeeper kit: green, or yellow if the team plays in green.
export function keeperKit(teamKit) {
  const greenish = colorDist(teamKit.shirt, '#1b7a3a') < 120;
  const shirt = greenish ? '#e8c820' : '#29a35a';
  return { pattern: 'solid', shirt, alt: shirt, shorts: '#151515', socks: shirt, band: '#111111', trim: '#111111', trim2: '#e8e050', number: '#111111', gloves: true };
}
