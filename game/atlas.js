// One 128x128 texture sheet per player, laid out for the skinned body in body.js:
//   torso  x 0-63,   y 0-63   wraps the body from the neck (row 0) to the crotch; u 0 = chest, 0.5 = back
//   head   x 64-127, y 0-63   wraps the head from crown to chin; the face gets three quarters of the width
//   leg    x 64-95,  y 64-127 hip to ankle: shorts, thigh, knee, sock
//   arm    x 96-127, y 64-127 shoulder to fingertips: sleeve, arm, hand
//   boot   x 0-63,   y 64-95
// Shading, cloth folds and muscle tone are painted in, like the hand-painted kits of the era.
import { canvasTex, pixelTex } from './ps1.js';
import { paint, rgb, mul, hash, drawText, textWidth } from './tex.js';

export const REGIONS = {
  torso: { x: 0, y: 0, w: 64, h: 64 },
  head: { x: 64, y: 0, w: 64, h: 64 },
  leg: { x: 64, y: 64, w: 32, h: 64 },
  arm: { x: 96, y: 64, w: 32, h: 64 },
  boot: { x: 0, y: 64, w: 64, h: 32 },
};
export const SIZE = 128;

// Rows where things change, shared with body.js so the paint lines up with the geometry.
export const TORSO_Y = { top: 1.66, bottom: 0.84 };   // world heights covered by the torso region
export const LEG_Y = { top: 0.98, bottom: 0.09 };
export const ARM_DY = { top: 0.05, bottom: -0.7 };
export const SLEEVE_DY = -0.254;                       // where the sleeve ends   // relative to the shoulder

const cache = new Map();

// kit: a kit spec from rules/teams.js. feetOnly: everything above the lower sock is see-through
// (your own body in first person).
export function playerAtlas({ kit, num, skin, hair, style = 0, stubble = false, feetOnly = false }) {
  const key = `${JSON.stringify(kit)}|${num}|${skin}|${hair}|${style}|${stubble}|${feetOnly}`;
  if (cache.has(key)) return cache.get(key);
  const k = kit;
  const c = canvasTex(SIZE, SIZE, ctx => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(torso(k, num, skin), 0, 0);
    ctx.drawImage(head(skin, hair, style, stubble), 64, 0);
    ctx.drawImage(leg(k, skin), 64, 64);
    ctx.drawImage(arm(k, skin, !!k.gloves), 96, 64);
    ctx.drawImage(boot(), 0, 64);
    if (feetOnly) {
      ctx.clearRect(0, 0, 128, 64);                                      // torso, head
      ctx.clearRect(96, 64, 32, 64);                                     // arms
      ctx.clearRect(64, 64, 32, legRow(0.2));                            // legs down to the lower sock
      ctx.clearRect(0, 96, 64, 32);                                      // spare
    }
  });
  const t = pixelTex(c);
  cache.set(key, t);
  return t;
}

// rows ↔ world height
const torsoRow = y => Math.round((TORSO_Y.top - y) / (TORSO_Y.top - TORSO_Y.bottom) * 64);
const legRow = y => Math.round((LEG_Y.top - y) / (LEG_Y.top - LEG_Y.bottom) * 64);
const armRow = dy => Math.round((ARM_DY.top - dy) / (ARM_DY.top - ARM_DY.bottom) * 64);

function cloth(base, x, y, W, front, folds = true) {
  let light = 0.66 + 0.24 * Math.abs(front) + 0.1 * front;
  if (folds) {
    const f = (x * 0.9 + y * 1.7) % 12, g = (x * 1.2 - y * 1.3 + 400) % 14;
    if (f < 1.4 || g < 1.1) light *= 0.76;
    else if (f < 2.6) light *= 1.1;
  }
  return mul(base, light * (0.97 + 0.06 * hash(x, y)));
}

// The shirt's own color at a texel, before shading: the kit pattern lives here.
function shirtColor(k, x, y, collar) {
  const base = rgb(k.shirt), alt = rgb(k.alt);
  switch (k.pattern) {
    case 'stripes': return Math.floor((x + 3) / 6) % 2 ? alt : base;
    case 'hoops': return Math.floor((y - collar) / 5) % 2 ? alt : base;
    case 'checks': return (Math.floor((x + 2) / 4) + Math.floor((y - collar) / 4)) % 2 ? alt : base;
    case 'band': return x < 5 || x > 58 || Math.abs(x - 31.5) < 5 ? alt : base;   // down the chest and the back
    default: return (x === 15 || x === 16 || x === 47 || x === 48) ? mul(base, 0.9) : base; // side panels
  }
}

function torso(k, num, skinHex) {
  const W = 64, H = 64, sk = rgb(skinHex), trim = rgb(k.trim), trim2 = rgb(k.trim2), shorts = rgb(k.shorts);
  const neckEnd = torsoRow(1.545), shortsTop = torsoRow(0.978), collar = neckEnd + 2;
  const c = paint(W, H, (x, y) => {
    const th = (x + 0.5) / W * Math.PI * 2, front = Math.cos(th);
    if (y < neckEnd) return mul(sk, (0.78 + 0.16 * Math.abs(front) + 0.06 * front) * (y > neckEnd - 3 ? 0.85 : 1));
    if (y < collar) return mul(trim, 0.9 + 0.1 * front);
    if (y === collar) return trim2;
    if (y >= shortsTop) {
      if (y < shortsTop + 2) return mul(trim, 0.85);                                        // waistband
      const s = cloth(shorts, x, y, W, front, false);
      return y > H - 4 ? mul(s, 0.8) : s;
    }
    let col = shirtColor(k, x, y, collar);
    if (y < collar + 4 && (x < 2 || x > 61)) col = trim;                                    // V at the throat
    let s = cloth(col, x, y, W, front, y > collar + 12);
    if (y > shortsTop - 2) s = mul(s, 0.78);                                               // loose hem
    return s;
  });
  const ctx = c.getContext('2d');
  ctx.fillStyle = k.trim2; ctx.fillRect(5, collar + 6, 4, 4); ctx.fillStyle = k.trim; ctx.fillRect(6, collar + 7, 2, 2); // plain badge
  const s = String(num), tw = textWidth(s, 2), x0 = Math.round(32 - tw / 2), y0 = collar + 7;
  if (k.outline) { ctx.fillStyle = k.outline; ctx.fillRect(x0 - 2, y0 - 2, tw + 4, 18); }
  drawText(ctx, s, x0, y0, k.number, 2);
  // small number on the front of the shorts
  drawText(ctx, s, 6, shortsTop + 4, k.number === k.shorts ? k.trim : k.number, 1);
  return c;
}

// The head texture spends most of its width on the face: u ↔ angle round the head is uneven.
// headU(f): f = 0..1 round the head starting at the back (0.5 = nose) → u. headF is the inverse.
export const headU = f => f < 0.25 ? f * 0.5 : f < 0.75 ? 0.125 + (f - 0.25) * 1.5 : 0.875 + (f - 0.75) * 0.5;
const headF = u => u < 0.125 ? u * 2 : u < 0.875 ? 0.25 + (u - 0.125) / 1.5 : 0.75 + (u - 0.875) * 2;

// Painted in "head units": dx is the angle from the nose (±16 at the ears, ±32 at the back),
// y is 0 at the crown and 32 at the chin. Each feature is several texels wide at this resolution.
function head(skinHex, hairHex, style, stubble) {
  const W = 64, H = 64, sk = rgb(skinHex), hr = rgb(hairHex);
  const hairTop = style === 2 ? 5 : style === 1 ? 10.5 : 9, hairBack = style === 2 ? 12 : style === 1 ? 24 : 21;
  const lips = [Math.min(255, sk[0] * 0.8 + 30), sk[1] * 0.55, sk[2] * 0.5];
  return paint(W, H, (px, py) => {
    const dx = (headF((px + 0.5) / W) - 0.5) * 64, y = (py + 0.5) / 2, ax = Math.abs(dx);
    // hair: cap, back, sideburns, and a fringe that dips at the middle
    const fringe = hairTop + (style === 1 ? 1.2 * Math.cos(dx * 0.6) : 0) - (ax < 8 ? 0.6 : 0);
    if (y < fringe || (ax > 13 && y < hairBack) || (Math.abs(ax - 12) < 1.4 && y < 16.5 && style !== 2)) {
      if (style === 2) return mul(sk, 0.72 * (0.9 + 0.2 * hash(px, py)));
      const strand = Math.sin(dx * 2.3 + y * 0.6) > 0.6 ? 1.25 : 1;
      const hl = hash(px, py, 1) < 0.15 ? 1.35 : hash(px, py, 2) < 0.2 ? 0.75 : 1;
      return mul(hr, strand * hl * (0.82 + 0.25 * (1 - y / hairBack)));
    }
    let col = sk, light = 1.1 - 0.3 * Math.min(1, (ax / 16) ** 2);
    if (Math.abs(ax - 16) < 1.4 && y > 12.5 && y < 18.5) light *= ax > 16 ? 0.72 : 0.86;     // ears
    const ex = Math.abs(ax - 3.6);                                                            // distance from an eye centre
    if (ax < 10) {
      if (y > 11.4 && y < 12.6 && ex < 2.1) return mul(hr, 1.0);                               // brows
      if (y > 12.6 && y < 13.6 && ex < 2.2) light *= 0.66;                                     // socket
      if (y > 15.5 && y < 20.5 && Math.abs(ax - 6.8) < 1.2) light *= 0.84;                       // cheek hollow
      if (y > 13.6 && y < 14.8 && ex < 1.6) {                                                  // eyes
        if (ex < 0.55) return [34, 26, 20];
        return ex < 1.2 ? [70, 52, 36] : [226, 220, 208];
      }
      if (y > 14.8 && y < 15.6 && ex < 1.8) light *= 0.86;
      if (y > 14 && y < 19 && dx < -0.6 && dx > -1.6) light *= 0.74 - (y - 14) * 0.02;         // nose shadow
      if (y > 14.5 && y < 18.5 && dx > 0 && dx < 0.8) light *= 1.1;                             // nose ridge
      if (y > 18.6 && y < 19.4 && ax < 1.6) light *= 0.66;                                      // nostrils
      if (y > 16 && y < 19.5 && Math.abs(ax - 5.6) < 1.6) light *= 1.06;                        // cheekbones
      if (y > 19.5 && y < 20.5 && ax < 2.2) light *= 0.9;                                       // philtrum
      if (y > 20.5 && y < 21.2 && ax < 2.6) return mul(lips, 0.7);                              // mouth line
      if (y > 21.2 && y < 22.3 && ax < 2.3) col = lips;                                         // lower lip
      if (y > 22.6 && y < 23.4 && ax < 1.8) light *= 0.88;
      if (y > 25.5 && ax < 3) light *= 1.04;                                                    // chin
    }
    if (y > 27) light *= 0.82;
    if (stubble && y > 19.5 && ax < 12 && hash(px, py, 3) < 0.5) light *= 0.84;
    return mul(col, light * (0.97 + 0.05 * hash(px, py, 4)));
  });
}

function leg(k, skinHex) {
  const W = 32, H = 64, sk = rgb(skinHex), shorts = rgb(k.shorts), socks = rgb(k.socks), band = rgb(k.band), trim = rgb(k.trim);
  const hem = legRow(0.795), sockTop = legRow(0.455), knee = legRow(0.49);
  return paint(W, H, (x, y) => {
    const th = (x + 0.5) / W * Math.PI * 2, front = Math.cos(th), outer = Math.abs(Math.sin(th)) > 0.92;
    if (y < hem) {
      if (outer && k.pattern !== 'stripes') return mul(trim, 0.9);                          // side stripe
      return mul(cloth(shorts, x, y, W, front, false), y > hem - 2 ? 0.82 : 1);
    }
    if (y < sockTop) {
      let light = 0.8 + 0.15 * Math.abs(front) + 0.06 * front;
      if (Math.abs(y - knee) < 2 && front > 0.5) light *= 1.08;                              // kneecap
      if (y < hem + 3) light *= 0.8;                                                         // shadow under the shorts
      if (y > hem + 6 && y < knee - 4 && Math.abs(front - 0.4) < 0.25) light *= 1.06;        // quad tone
      return mul(sk, light * (0.97 + 0.05 * hash(x, y)));
    }
    if (y < sockTop + 3) return mul(band, 0.8 + 0.2 * Math.abs(front));
    const ribs = x % 2 ? 0.94 : 1;
    return mul(socks, (0.74 + 0.2 * Math.abs(front) + 0.06 * front) * ribs * (y > H - 4 ? 0.8 : 1));
  });
}

function arm(k, skinHex, gloves) {
  const W = 32, H = 64, sk = rgb(skinHex), trim = rgb(k.trim);
  const sleeve = rgb(k.sleeve || (k.pattern === 'sleeves' ? k.alt : k.shirt));
  const hem = armRow(SLEEVE_DY), wrist = armRow(-0.54);
  return paint(W, H, (x, y) => {
    const th = (x + 0.5) / W * Math.PI * 2, front = Math.cos(th);
    if (y < hem - 1) return cloth(sleeve, x, y, W, front, y > 6);
    if (y < hem + 1) return trim;
    if (y < wrist) {
      let light = 0.8 + 0.15 * Math.abs(front) + 0.06 * front;
      if (y < hem + 3) light *= 0.82;
      return mul(sk, light * (0.97 + 0.05 * hash(x, y)));
    }
    if (gloves) return mul([236, 236, 236], 0.8 + 0.2 * Math.abs(front)) ;
    const finger = y > wrist + 8 && x % 4 === 0 ? 0.85 : 1;
    return mul(sk, (0.78 + 0.14 * Math.abs(front)) * finger);
  });
}

function boot() {
  return paint(64, 32, (x, y) => {
    if (y > 26) return [10, 10, 10];                                       // sole
    if (y > 12 && y < 16 && x % 32 > 6 && x % 32 < 22) return [210, 210, 220]; // white flash
    return mul([28, 28, 32], 0.85 + 0.25 * hash(x, y));
  });
}
