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
export const TORSO_Y = { top: 1.64, bottom: 0.79 };   // world heights covered by the torso region
export const LEG_Y = { top: 0.97, bottom: 0.08 };
export const ARM_DY = { top: 0.04, bottom: -0.73 };
export const SLEEVE_DY = -0.25;                        // where the sleeve ends, below the shoulder
export const SHIRT_HEM = 1.045;                        // where the shirt tucks into the shorts (world height)
export const SHORTS_Y = 0.72;                          // where the shorts end (world height)
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
export function playerAtlas({ kit, num, skin, hair, style = 0, stubble = false, feetOnly = false, boots = 0 }) {
  const key = `${JSON.stringify(kit)}|${num}|${skin}|${hair}|${style}|${stubble}|${feetOnly}|${boots}`;
  if (cache.has(key)) return cache.get(key);
  const k = kit;
  const c = canvasTex(SIZE * S, SIZE * S, ctx => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SIZE * S, SIZE * S);
    const put = (img, r) => ctx.drawImage(img, r.x * S, r.y * S);
    put(torso(k, num, skin), REGIONS.torso);
    put(head(skin, hair, style, stubble), REGIONS.head);
    put(leg(k, skin), REGIONS.leg);
    put(arm(k, skin, !!k.gloves), REGIONS.arm);
    put(boot(boots), REGIONS.boot);
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

// Smooth value noise, wrapping every `period` cells across x so it has no seam round a limb.
function vnoise(x, y, seed, period) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, w = v => ((v % period) + period) % period;
  const sm = t => t * t * (3 - 2 * t), u = sm(fx), v = sm(fy);
  const a = hash(w(xi), yi, seed), b = hash(w(xi + 1), yi, seed), c = hash(w(xi), yi + 1, seed), d = hash(w(xi + 1), yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Layered noise in base units round a region `W` wide: 0..1, mostly broad blotches with finer grain.
function fbm(x, y, W, seed, cell = 6) {
  const p = Math.max(1, Math.round(W / cell)), k = p / W;
  return 0.55 * vnoise(x * k, y * k, seed, p) + 0.3 * vnoise(x * k * 2, y * k * 2, seed + 3, p * 2) + 0.15 * vnoise(x * k * 4, y * k * 4, seed + 7, p * 4);
}

// Kit cloth the FIFA 98 way: the color is never flat. Soft blotchy light and shade like a photo of
// fabric, folds that catch the light, and fine weave grain on top. x, y in base units, W the region width.
function cloth(base, light, x, y, W, px, py, folds = 1) {
  const blot = fbm(x, y, W, 11, 7);
  const fold = Math.sin((x * 0.9 + fbm(x, y, W, 23, 10) * 9) * 0.8);
  const l = light * (0.88 + 0.24 * blot) * (1 + 0.1 * folds * fold) * (0.975 + 0.05 * hash(px, py));
  return mul(base, l);
}
// Skin with a little colour variation and soft muscle tone, never flat.
function skinTone(sk, light, x, y, W, px, py) {
  const m = fbm(x, y, W, 41, 5);
  return mul(sk, light * (0.93 + 0.12 * m) * (0.985 + 0.03 * hash(px, py)));
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
      return cloth(shorts, roundLight(front) * (0.92 - 0.12 * clamp01((y - shortsTop - 3) / 5)), x, y, W, px, py); // shade toward the crotch
    }
    const ax = Math.min(x, W - x);                                                           // distance round from the chest centre
    let col = shirtColor(k, x, y, band);
    // a short V-neck insert under the collar, edged in the second trim color
    const vee = (band + 4.5 - y) * 0.55;
    if (ax < vee) col = ax > vee - 0.7 ? trim : mul(trim2, 0.35);                            // V-neck: trim edge, dark inside
    // 90s raglan stripes running from the collar over the shoulders (plain kits)
    if ((k.pattern === 'solid' || k.pattern === 'sleeves') && Math.abs(side - 0.985) < 0.015 && y < band + 9) col = trim;
    // painted shading: lit upper chest, shade under the pecs and in the armpits, darker sides and hem
    let light = roundLight(front);
    light *= 1 + 0.06 * near(y, chestY - 6, 6) * clamp01(front);
    light *= 1 - 0.12 * near(y, chestY + 2.5, 1.6) * clamp01(front) * near(ax, 7, 5);
    light *= 1 - 0.22 * near(y, band + 6, 6) * near(side, 1, 0.25);
    // broad soft folds hanging from the chest, like the painted FIFA 98 shirts
    const fold = Math.sin(ax * 0.62 + Math.sin(y * 0.18) * 1.4);
    light *= 1 + 0.12 * fold * clamp01((y - band - 8) / 10);
    if (y > shortsTop - 6 && Math.sin(x * 1.3) > 0.7) light *= 0.92;
    if (y > shortsTop - 2) light *= 0.78;                                                      // loose hem
    return cloth(col, light, x, y, W, px, py);
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
    // Soft, photo-like modelling of the face, as on the FIFA 98 heads: the front planes catch the
    // light, the brow ridge throws a deep shadow into the eye sockets, the nose has a lit ridge and a
    // shadowed side, the cheekbones stand out over hollow cheeks, and the jaw falls into shadow.
    let col = sk, light = 1.05 - 0.3 * clamp01((ax - 4.5) / 11) ** 1.6;
    light *= 1 - 0.12 * near(y, hairTop + 1, 2.5);                                            // under the hairline
    light *= 1 + 0.06 * near(y, hairTop + 3.5, 2.5) * near(ax, 0, 6);                          // forehead
    light *= 1 - 0.14 * near(ax, 9.5, 2.5) * near(y, 12, 3.5);                                 // temples
    if (Math.abs(ax - 16) < 1.6 && y > 12.5 && y < 19) light *= ax > 16 ? 0.68 : Math.abs(ax - 15.5) < 0.5 ? 0.72 : 0.86; // ears
    const ex = Math.abs(ax - 3.6);                                                            // distance from an eye centre
    if (ax < 10) {
      const browY = 12.1 + 0.16 * Math.max(0, ax - 3.4);
      light *= 1 + 0.08 * near(y, browY - 1.1, 1) * near(ex, 0, 3);                           // brow ridge catches the light
      light *= 1 - 0.34 * near(y, 14.2, 1.9) * near(ex, 0, 2.9);                               // deep eye sockets
      light *= 1 - 0.12 * near(ax, 1.6, 0.9) * near(y, 13.8, 1.6);                              // inner corners by the nose
      if (Math.abs(y - browY) < 0.72 && ex < 2.4 - 0.3 * Math.max(0, ax - 3.6)) return mul(brow, 0.85);
      if (y > 13.8 && y < 15.05 && ex < 1.75 - 1.6 * (y - 14.4) ** 2) {                        // almond eyes
        if (y < 14.15) return mul(sk, 0.32);                                                  // upper lid
        if (ex < 0.85) return ex < 0.25 && y < 14.6 ? [200, 200, 196] : mul(iris, 0.8);
        return mul(deep ? [196, 186, 172] : [218, 210, 198], 0.72);                          // whites, in the socket's shade
      }
      light *= 1 + 0.14 * near(dx, 0.3, 0.7) * near(y, 16.5, 2.6);                              // lit nose ridge
      light *= 1 - 0.26 * near(dx, -1.4, 0.8) * near(y, 16.8, 2.6);                             // shadowed side of the nose
      light *= 1 - 0.3 * near(y, 19.1, 0.5) * near(ax, 1.1, 0.7);                               // nostrils
      light *= 1 - 0.16 * near(y, 19.6, 0.7) * near(ax, 0, 2);                                  // under the nose
      light *= 1 + 0.08 * near(y, 16, 1.6) * near(ax, 5.6, 1.8);                                // cheekbones
      light *= 1 - 0.18 * near(y, 19.5, 2.4) * near(ax, 6.6, 1.8);                              // hollow cheeks
      light *= 1 - 0.14 * near(y, 20, 1.8) * near(ax, 3.4, 0.5);                                // lines from nose to mouth
      if (y > 20.5 && y < 21.15 && ax < 2.8 - (ax > 2.4 ? 0.3 : 0)) return mul(lips, 0.55);    // mouth
      if (y > 21.15 && y < 22.2 && ax < 2.2) col = y < 21.5 ? mul(lips, 1.06) : lips;          // lower lip
      light *= 1 - 0.16 * near(y, 22.9, 0.8) * near(ax, 0, 1.8);                                // under the lip
      light *= 1 + 0.08 * near(y, 25, 1.5) * near(ax, 0, 2.8);                                  // chin
    }
    light *= 1 - 0.32 * clamp01((y - 25) / 3);                                                 // jaw falls into shadow
    light *= 0.97 + 0.06 * hash(Math.floor(px / 2), Math.floor(py / 2), 9);                    // skin grain
    if (stubble && y > 19.8 && y < 27.5 && ax < 11.5 && !(y < 22.3 && ax < 2.9) && hash(px, py, 3) < 0.55) light *= 0.8;
    return mul(col, light);
  });
}

function leg(k, skinHex) {
  const W = 32, H = 64, sk = rgb(skinHex), shorts = rgb(k.shorts), socks = rgb(k.socks), band = rgb(k.band), trim = rgb(k.trim);
  const hem = legRow(SHORTS_Y - 0.003), sockTop = legRow(0.477), turn = legRow(0.444), knee = legRow(0.52);
  return paintS(W, H, (x, y, px, py) => {
    const th = x / W * Math.PI * 2 + LIMB_A0, front = Math.cos(th), out = Math.sin(th);
    if (y < hem) {
      if (Math.abs(Math.abs(out) - 1) < 0.08 && k.pattern !== 'stripes') return mul(trim, 0.9); // side stripe
      let light = roundLight(front);
      if (y > hem - 2) light *= 0.8;                                                         // hem turned up
      if (y < 4 && Math.sin(x * 2.1) > 0.6) light *= 0.92;                                   // gathered at the waist
      return cloth(shorts, light, x, y, W, px, py, 1.3);
    }
    if (y < sockTop) {
      let light = 0.8 + 0.15 * Math.abs(front) + 0.06 * front;
      light *= 1 + 0.1 * near(y, knee, 1.6) * clamp01(front);                                 // kneecap
      light *= 1 - 0.08 * near(y, knee + 1.8, 0.8) * clamp01(front);
      if (y < hem + 3) light *= 0.8;                                                         // shadow under the shorts
      light *= 1 + 0.1 * near(y, (hem + knee) / 2, 5) * near(front, 0.45, 0.45);              // quads catch the light
      light *= 1 - 0.1 * near(front, -0.3, 0.4) * near(y, (hem + knee) / 2, 6);                // shade between the muscles
      return skinTone(sk, light, x, y, W, px, py);
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
      light *= 1 - 0.14 * near(Math.sin(x * 0.55 + y * 0.12), 1, 0.35) * clamp01(y / 6);   // soft folds
      if (Math.abs(out - 1) < 0.05 && y < hem - 4) return cloth(trim, light, x, y, W, px, py); // stripe down the top of the sleeve
      return cloth(sleeve, light, x, y, W, px, py);
    }
    if (y < hem + 0.8) return Math.abs(y - hem + 0.7) < 0.5 ? trim2 : trim;                   // cuff with a stripe
    if (y < wrist) {
      let light = 0.8 + 0.15 * Math.abs(front) + 0.06 * front;
      if (y < hem + 2.5) light *= 0.82;
      light *= 1 - 0.1 * near(y, elbow, 1.2) * clamp01(-front);                               // elbow
      light *= 1 + 0.1 * near(y, elbow + 5, 4) * near(out * Math.sign(front || 1), 0.7, 0.5);   // forearm muscle
      light *= 1 + 0.08 * near(y, hem + 2.5, 2.5) * clamp01(front);                            // biceps
      return skinTone(sk, light, x, y, W, px, py);
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
      k *= 0.93 + 0.12 * hash(Math.floor(px / 2), 0, 5) * (0.85 + 0.15 * Math.sin(y * 0.7 + x)); // fine strands
      k *= 1 + 0.12 * near(y, 6 + Math.sin(x * 0.4) * 1.5, 2.5);                                // soft sheen
    }
    return mul(hr.map(v => v + 10), k);
  });
}

function collarTex(k) {
  const trim = rgb(k.trim), trim2 = rgb(k.trim2);
  return paintS(16, 32, (x, y) => (y < 3.5 ? mul(trim2, 0.95) : y < 4.4 ? mul(trim, 0.6) : mul(trim, y > 13 ? 0.95 : 0.82)));
}

// Boots: black with a white flash down each side by default (the locker has white, red and gold),
// laces on top, a dark sole with studs. Colors: [upper, flash, laces].
const BOOTS = [[[30, 30, 34], [214, 214, 222], [180, 180, 186]], [[222, 222, 228], [24, 30, 90], [200, 200, 206]],
  [[176, 22, 30], [232, 232, 236], [210, 200, 200]], [[214, 168, 52], [70, 44, 10], [240, 220, 160]]];
function boot(kind = 0) {
  const [upper, flash, lace] = BOOTS[kind] || BOOTS[0];
  return paintS(64, 32, (x, y) => {
    if (y > 27) return Math.floor(x) % 6 < 2 && y > 29 ? [70, 70, 74] : [12, 12, 12];      // sole, studs
    const u = x % 32;
    if (y > 9 && y < 16 && Math.abs(u - 15 - (y - 12) * 1.2) < 4.5 && u > 5) return flash; // side flash
    if (y < 6 && Math.abs(u - 16) < 3 && Math.floor(y) % 2 === 0) return lace;             // laces
    return mul(upper, 0.85 + 0.25 * hash(x * S, y * S));
  });
}
