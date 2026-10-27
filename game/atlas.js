// One 256x256 texture sheet per player, laid out for the skinned body in body.js. Painted in "base
// units" of a 128 sheet (S texels each) so the layout stays simple while faces and kits get detail:
//   torso  x 0-63,   y 0-63   wraps the body from the neck (row 0) to the crotch; u 0 = chest, 0.5 = back
//   head   x 64-127, y 0-63   wraps the head from crown to chin; the face gets three quarters of the width
//   leg    x 64-95,  y 64-127 hip to ankle: shorts, thigh, knee, sock
//   arm    x 96-127, y 64-127 shoulder to fingertips: sleeve, arm, hand
//   boot   x 0-63,   y 64-95
//   hair   x 0-47,   y 96-127   the hair shell (hair.js), crown at the top
//   collar x 48-63,  y 96-127
// Shading, creases, plackets, cuffs and faces are painted in, like the hand-painted kits of the PS1 era.
import { canvasTex, pixelTex } from './ps1.js';
import { rgb, mul, hash, drawText, textWidth } from './tex.js';

export const S = 2;                                      // texels per base unit
export const REGIONS = {
  torso: { x: 0, y: 0, w: 64, h: 64 },
  head: { x: 64, y: 0, w: 64, h: 64 },
  leg: { x: 64, y: 64, w: 32, h: 64 },
  arm: { x: 96, y: 64, w: 32, h: 64 },
  boot: { x: 0, y: 64, w: 64, h: 32 },
  hair: { x: 0, y: 96, w: 48, h: 32 },
  collar: { x: 48, y: 96, w: 16, h: 32 },
};
export const SIZE = 128;                                 // the sheet in base units (UVs are fractions of it)

// Rows where things change, shared with body.js so the paint lines up with the geometry.
export const TORSO_Y = { top: 1.64, bottom: 0.82 };   // world heights covered by the torso region
export const LEG_Y = { top: 0.97, bottom: 0.08 };
export const ARM_DY = { top: 0.04, bottom: -0.71 };
export const SLEEVE_DY = -0.17;                        // where the sleeve ends, below the shoulder
export const SHIRT_HEM = 0.995;                        // where the shirt tucks into the shorts (world height)
export const SHORTS_Y = 0.75;                          // where the shorts end (world height)
export const LIMB_A0 = Math.PI / 6;                    // where u = 0 sits round the 6-sided legs and arms

const cache = new Map();

// Paints a region at full resolution; fn(x, y) gets base-unit coordinates of the texel centre.
function paintS(w, h, fn) {
  return canvasTex(w * S, h * S, c => {
    const img = c.createImageData(w * S, h * S);
    for (let py = 0; py < h * S; py++) for (let px = 0; px < w * S; px++) {
      const v = fn((px + 0.5) / S, (py + 0.5) / S, px, py); if (!v) continue;
      const i = (py * w * S + px) * 4;
      img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

// kit: a kit spec from rules/teams.js. feetOnly: everything above the lower sock is see-through
// (your own body in first person).
export function playerAtlas({ kit, num, skin, hair, style = 0, stubble = false, feetOnly = false }) {
  const key = `${JSON.stringify(kit)}|${num}|${skin}|${hair}|${style}|${stubble}|${feetOnly}`;
  if (cache.has(key)) return cache.get(key);
  const k = kit;
  const c = canvasTex(SIZE * S, SIZE * S, ctx => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SIZE * S, SIZE * S);
    const put = (img, r) => ctx.drawImage(img, r.x * S, r.y * S);
    put(torso(k, num, skin), REGIONS.torso);
    put(head(skin, hair, style, stubble), REGIONS.head);
    put(leg(k, skin), REGIONS.leg);
    put(arm(k, skin, !!k.gloves), REGIONS.arm);
    put(boot(), REGIONS.boot);
    put(hairTex(hair, style), REGIONS.hair);
    put(collarTex(k), REGIONS.collar);
    if (feetOnly) {
      const clear = (x, y, w, h) => ctx.clearRect(x * S, y * S, w * S, h * S);
      clear(0, 0, 128, 64);                                      // torso, head
      clear(96, 64, 32, 64);                                     // arms
      clear(64, 64, 32, legRow(0.2));                            // legs down to the lower sock
      clear(0, 96, 64, 32);                                      // hair, collar
    }
  });
  const t = pixelTex(c);
  cache.set(key, t);
  return t;
}

// rows (base units) ↔ world height
const torsoRow = y => (TORSO_Y.top - y) / (TORSO_Y.top - TORSO_Y.bottom) * 64;
const legRow = y => Math.round((LEG_Y.top - y) / (LEG_Y.top - LEG_Y.bottom) * 64);
const armRow = dy => (ARM_DY.top - dy) / (ARM_DY.top - ARM_DY.bottom) * 64;
const clamp01 = v => Math.max(0, Math.min(1, v));
const near = (v, c, r) => clamp01(1 - Math.abs(v - c) / r);      // 1 at c, 0 beyond r

// Kit cloth: bold flat color with a soft light-to-shade round the body; tiny texel noise.
function cloth(base, light, px, py) {
  return mul(base, light * (0.985 + 0.03 * hash(px, py)));
}
const roundLight = front => 0.74 + 0.18 * Math.abs(front) + 0.08 * front;

// The shirt's own color at a spot, before shading: the kit pattern lives here (base units, x round, y down).
function shirtColor(k, x, y, top) {
  const base = rgb(k.shirt), alt = rgb(k.alt);
  switch (k.pattern) {
    case 'stripes': return Math.floor((x + 3) / 6) % 2 ? alt : base;
    case 'hoops': return Math.floor((y - top) / 5) % 2 ? alt : base;
    case 'checks': return (Math.floor((x + 2) / 4) + Math.floor((y - top) / 4)) % 2 ? alt : base;
    case 'band': return x < 5 || x > 59 || Math.abs(x - 32) < 5 ? alt : base;   // down the chest and the back
    default: return Math.abs(x - 16) < 0.8 || Math.abs(x - 48) < 0.8 ? mul(base, 0.9) : base; // side seams
  }
}

function torso(k, num, skinHex) {
  const W = 64, H = 64, sk = rgb(skinHex), trim = rgb(k.trim), trim2 = rgb(k.trim2), shorts = rgb(k.shorts);
  const neckEnd = torsoRow(1.555), band = neckEnd + 1.6, shortsTop = torsoRow(SHIRT_HEM - 0.003), chestY = torsoRow(1.33);
  const c = paintS(W, H, (x, y, px, py) => {
    const th = x / W * Math.PI * 2, front = Math.cos(th), side = Math.abs(Math.sin(th));
    if (y < neckEnd) return mul(sk, (0.78 + 0.16 * Math.abs(front) + 0.06 * front) * (y > neckEnd - 2 ? 0.8 : 1));
    if (y < band) return mul(trim, 0.85 + 0.1 * front);                                     // neckband under the collar
    if (y >= shortsTop) {
      if (y < shortsTop + 1.8) return mul(trim, 0.8);                                       // waistband
      return cloth(shorts, roundLight(front) * (0.92 - 0.1 * clamp01((y - shortsTop - 3) / 5)), px, py); // shade toward the crotch
    }
    const ax = Math.min(x, W - x);                                                           // distance round from the chest centre
    let col = shirtColor(k, x, y, band);
    // a short V-neck insert under the collar, edged in the second trim color
    const vee = (band + 4.5 - y) * 0.55;
    if (ax < vee) col = ax > vee - 0.6 ? trim2 : mul(trim, 0.9);
    // painted shading: lit upper chest, shade under the pecs and in the armpits, darker sides and hem
    let light = roundLight(front);
    light *= 1 + 0.06 * near(y, chestY - 6, 6) * clamp01(front);
    light *= 1 - 0.12 * near(y, chestY + 2.5, 1.6) * clamp01(front) * near(ax, 7, 5);
    light *= 1 - 0.22 * near(y, band + 6, 6) * near(side, 1, 0.25);
    // a few long creases from the armpits down to the waist, and bunching at the waist
    const cr = (Math.abs(ax - 10) + (y - band) * 0.32) % 9;
    if (y > band + 10 && side < 0.95 && cr < 0.9) light *= 0.9;
    else if (y > band + 10 && side < 0.95 && cr < 1.8) light *= 1.04;
    if (y > shortsTop - 6 && Math.sin(x * 1.3) > 0.7) light *= 0.92;
    if (y > shortsTop - 2) light *= 0.78;                                                      // loose hem
    return cloth(col, light, px, py);
  });
  const ctx = c.getContext('2d');
  // a small plain shield badge on the left chest (no real crest)
  const bx = 5.5 * S, by = (band + 5) * S;
  ctx.fillStyle = k.trim2; ctx.fillRect(bx, by, 6, 5); ctx.fillRect(bx + 1, by + 5, 4, 1); ctx.fillRect(bx + 2, by + 6, 2, 1);
  ctx.fillStyle = k.trim; ctx.fillRect(bx + 1, by + 1, 4, 3); ctx.fillRect(bx + 2, by + 4, 2, 1);
  // the number on the back, with a dark edge so it reads from a distance
  const s = String(num), sc = 2 * S, tw = textWidth(s, sc), x0 = Math.round(32 * S - tw / 2), y0 = Math.round((band + 6) * S);
  if (k.outline) { ctx.fillStyle = k.outline; ctx.fillRect(x0 - 2 * S, y0 - 2 * S, tw + 4 * S, 7 * sc + 4 * S); }
  const edge = '#' + mul(rgb(k.number), 0.35).map(v => v.toString(16).padStart(2, '0')).join('');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawText(ctx, s, x0 + dx * S / 2, y0 + dy * S / 2, edge, sc);
  drawText(ctx, s, x0, y0, k.number, sc);
  // small number on the front of the shorts
  drawText(ctx, s, 6 * S, Math.round((shortsTop + 4) * S), k.number === k.shorts ? k.trim : k.number, S);
  return c;
}

// The head texture spends most of its width on the face: u ↔ angle round the head is uneven.
// headU(f): f = 0..1 round the head starting at the back (0.5 = nose) → u. headF is the inverse.
export const headU = f => f < 0.25 ? f * 0.5 : f < 0.75 ? 0.125 + (f - 0.25) * 1.5 : 0.875 + (f - 0.75) * 0.5;
const headF = u => u < 0.125 ? u * 2 : u < 0.875 ? 0.25 + (u - 0.125) / 1.5 : 0.75 + (u - 0.875) * 2;

// Painted in "head units": dx is the angle from the nose (±16 at the ears, ±32 at the back),
// y is 0 at the crown and 32 at the chin.
function head(skinHex, hairHex, style, stubble) {
  const W = 64, sk = rgb(skinHex), hr = rgb(hairHex), deep = sk[0] < 150;
  const hairTop = style === 2 ? 5 : 9, hairBack = style === 2 ? 12 : 21;
  const lips = deep ? [sk[0] * 0.74, sk[1] * 0.56, sk[2] * 0.6] : [Math.min(255, sk[0] * 0.86 + 22), sk[1] * 0.6, sk[2] * 0.58];
  const brow = hr.map(v => v * 0.8);
  const iris = [[52, 36, 24], [70, 50, 30], [48, 74, 96], [64, 82, 50]][Math.floor(hash(sk[0], hr[0]) * (deep ? 1.5 : 4))];
  return paintS(W, 64, (u, v, px, py) => {
    const dx = (headF(u / W) - 0.5) * 64, y = v / 2, ax = Math.abs(dx);
    // hair under the shell: cap, back, sideburns (a shaved head shows dark stubble)
    const hairline = hairTop - (ax < 7 ? 0.5 : 0) + 0.4 * Math.sin(dx * 1.7);
    if (y < hairline || (ax > 13.5 && y < hairBack) || (Math.abs(ax - 12.3) < 1.2 && y < 17 && style !== 2)) {
      if (style === 2) return mul(sk, 0.66 * (0.9 + 0.2 * hash(px, py)));
      return mul(hr, (0.8 + 0.25 * (1 - y / hairBack)) * (0.88 + 0.24 * hash(px, 0, 1)));
    }
    // a broad, evenly lit face that turns darker toward the ears and under the jaw
    let col = sk, light = 1.04 - 0.24 * clamp01((ax - 5) / 11) ** 2;
    if (y < hairTop + 1.2) light *= 0.9;                                                      // under the hairline
    if (Math.abs(ax - 16) < 1.4 && y > 13 && y < 18.5) light *= ax > 16 ? 0.7 : Math.abs(ax - 15.6) < 0.4 ? 0.75 : 0.88; // ears
    const ex = Math.abs(ax - 3.7);                                                            // distance from an eye centre
    if (ax < 9) {
      const browY = 12.1 + 0.18 * Math.max(0, ax - 3.4);                                      // brows dip a little at the ends
      if (Math.abs(y - browY) < 0.65 && ex < 2.3) return brow;
      if (y > browY + 0.6 && y < 13.8 && ex < 2.4) light *= 0.64;                             // brow shadow
      if (y > 12.6 && y < 16.2 && ex < 2.8) light *= 0.9;                                     // eye sockets
      if (y > 13.6 && y < 15.3 && ex < 2 - 1.2 * (y - 14.45) ** 2) {                         // almond eyes
        if (y < 14.05) return mul(sk, 0.4);                                                   // upper lid
        if (ex < 0.8) return ex < 0.3 && y < 14.7 ? [236, 236, 230] : iris;                    // iris and a glint
        return deep ? [212, 204, 190] : [234, 228, 216];
      }
      if (y > 15.2 && y < 15.9 && ex < 1.9) light *= 0.88;                                    // under the eye
      if (y > 14 && y < 19 && dx < -0.5 && dx > -1.8) light *= 0.78;                           // nose shadow
      if (y > 14.5 && y < 18.4 && dx > -0.4 && dx < 0.8) light *= 1.08;                        // nose ridge
      if (y > 18.5 && y < 19.3 && ax > 0.5 && ax < 1.7) light *= 0.58;                          // nostrils
      if (y > 16 && y < 21 && Math.abs(ax - 6.4) < 1.6) light *= 0.84;                         // under the cheekbones
      if (y > 15 && y < 17 && Math.abs(ax - 5.4) < 1.6) light *= 1.06;                         // cheekbones
      if (y > 19.4 && y < 20.4 && ax < 0.6) light *= 0.9;                                      // philtrum
      if (y > 20.4 && y < 21.1 && ax < 2.9 - (ax > 2.5 ? 0.3 : 0)) return mul(lips, 0.6);     // mouth
      if (y > 21.1 && y < 22.2 && ax < 2.3) col = y < 21.5 ? mul(lips, 1.08) : lips;           // lower lip
      if (y > 22.5 && y < 23.4 && ax < 1.6) light *= 0.86;                                     // under the lip
      if (y > 25.5 && ax < 2.6) light *= 1.04;                                                 // chin
    }
    if (y > 26) light *= 0.74;                                                                 // under the jaw
    if (ax > 7 && ax < 12 && y > 9 && y < 13) light *= 0.88;                                    // temples
    if (stubble && y > 19.6 && y < 27.5 && ax < 11.5 && !(y < 22.3 && ax < 2.9) && hash(px, py, 3) < 0.55) light *= 0.8;
    return mul(col, light);
  });
}

function leg(k, skinHex) {
  const W = 32, H = 64, sk = rgb(skinHex), shorts = rgb(k.shorts), socks = rgb(k.socks), band = rgb(k.band), trim = rgb(k.trim);
  const hem = legRow(SHORTS_Y - 0.003), sockTop = legRow(0.457), turn = legRow(0.424), knee = legRow(0.5);
  return paintS(W, H, (x, y, px, py) => {
    const th = x / W * Math.PI * 2 + LIMB_A0, front = Math.cos(th), out = Math.sin(th);
    if (y < hem) {
      if (Math.abs(Math.abs(out) - 1) < 0.08 && k.pattern !== 'stripes') return mul(trim, 0.9); // side stripe
      let light = roundLight(front);
      if (y > hem - 2) light *= 0.8;                                                         // hem turned up
      if (y < 4 && Math.sin(x * 2.1) > 0.6) light *= 0.92;                                   // gathered at the waist
      return cloth(shorts, light, px, py);
    }
    if (y < sockTop) {
      let light = 0.8 + 0.15 * Math.abs(front) + 0.06 * front;
      light *= 1 + 0.1 * near(y, knee, 1.6) * clamp01(front);                                 // kneecap
      light *= 1 - 0.08 * near(y, knee + 1.8, 0.8) * clamp01(front);
      if (y < hem + 3) light *= 0.8;                                                         // shadow under the shorts
      light *= 1 + 0.06 * near(y, (hem + knee) / 2, 5) * near(front, 0.5, 0.4);               // thigh muscle
      return mul(sk, light * (0.975 + 0.05 * hash(px, py)));
    }
    // sock: turned-over top band with a stripe, then ribbed sock with the shin pad showing
    if (y < turn) {
      const stripe = Math.abs(y - (sockTop + turn) / 2) < 0.7;
      return mul(stripe ? socks : band, (0.78 + 0.2 * Math.abs(front)) * (y > turn - 0.8 ? 0.8 : 1));
    }
    const ribs = Math.floor(x * S) % 2 ? 0.94 : 1;
    let light = (0.74 + 0.2 * Math.abs(front) + 0.06 * front) * ribs;
    light *= 1 + 0.06 * near(y, turn + 9, 6) * clamp01(front);                               // shin pad
    return mul(socks, light * (y > H - 3 ? 0.8 : 1));
  });
}

function arm(k, skinHex, gloves) {
  const W = 32, H = 64, sk = rgb(skinHex), trim = rgb(k.trim), trim2 = rgb(k.trim2);
  const sleeve = rgb(k.sleeve || (k.pattern === 'sleeves' ? k.alt : k.shirt));
  const hem = armRow(SLEEVE_DY), wrist = armRow(-0.548), elbow = armRow(-0.31);
  return paintS(W, H, (x, y, px, py) => {
    const th = x / W * Math.PI * 2 + LIMB_A0, front = Math.cos(th), out = Math.sin(th);
    if (y < hem - 2.2) {
      let light = roundLight(front);
      if (y > 8 && (x * 0.9 + y * 0.6) % 7 < 0.9) light *= 0.9;                              // creases
      return cloth(sleeve, light, px, py);
    }
    if (y < hem + 0.8) return Math.abs(y - hem + 0.7) < 0.5 ? trim2 : trim;                   // cuff with a stripe
    if (y < wrist) {
      let light = 0.8 + 0.15 * Math.abs(front) + 0.06 * front;
      if (y < hem + 2.5) light *= 0.82;
      light *= 1 - 0.1 * near(y, elbow, 1.2) * clamp01(-front);                               // elbow
      return mul(sk, light * (0.975 + 0.05 * hash(px, py)));
    }
    if (gloves) return mul([236, 236, 236], (0.8 + 0.2 * Math.abs(front)) * (y > wrist + 9 && Math.floor(x) % 4 === 0 ? 0.85 : 1));
    let light = 0.8 + 0.14 * Math.abs(front);
    if (y > wrist + 7 && Math.floor(x * 1.2) % 4 === 0) light *= 0.8;                          // fingers
    if (Math.abs(y - wrist - 6.5) < 0.5 && out * front > 0) light *= 0.88;                    // knuckles
    return mul(sk, light);
  });
}

// The hair shell: strands running down from the crown, a sheen near the top; tight curls for style 1.
function hairTex(hairHex, style) {
  const hr = rgb(hairHex);
  return paintS(48, 32, (x, y, px, py) => {
    let k = 0.78 + 0.3 * (1 - y / 32);
    if (style === 1) k *= (Math.sin(x * 2.1) * Math.sin(y * 2.3) > 0.2 ? 1.18 : 0.82) * (0.9 + 0.2 * hash(px, py, 7));
    else {
      k *= 0.86 + 0.28 * hash(px, 0, 5) * (0.85 + 0.15 * Math.sin(y * 0.7 + x));             // strands
      if (Math.abs(y - 4 - (x % 12) * 0.2) < 1.1) k *= 1.22;                                  // sheen
    }
    return mul(hr.map(v => v + 10), k);
  });
}

function collarTex(k) {
  const trim = rgb(k.trim), trim2 = rgb(k.trim2);
  return paintS(16, 32, (x, y) => (y < 3.5 ? mul(trim2, 0.95) : y < 4.4 ? mul(trim, 0.6) : mul(trim, y > 13 ? 0.95 : 0.82)));
}

// Black boots: a white flash down each side, laces on top, a dark sole with studs.
function boot() {
  return paintS(64, 32, (x, y) => {
    if (y > 27) return Math.floor(x) % 6 < 2 && y > 29 ? [70, 70, 74] : [12, 12, 12];      // sole, studs
    const u = x % 32;
    if (y > 9 && y < 16 && Math.abs(u - 15 - (y - 12) * 1.2) < 4.5 && u > 5) return [214, 214, 222]; // side flash
    if (y < 6 && Math.abs(u - 16) < 3 && Math.floor(y) % 2 === 0) return [180, 180, 186];       // laces
    return mul([30, 30, 34], 0.85 + 0.25 * hash(x * S, y * S));
  });
}
