// Light, shade and folds for the PS2-look kit sheet. kit.js lays the flat kit down first (colors, trim,
// numbers); these go over it pixel by pixel, so everything printed on the cloth creases with it:
// the folds as a lit relief (paint.js), the body's form under the cloth, the weave, the boots' leather,
// and the skin of the limbs with its muscles, joints and tendons.
// Regions (r) and spans come from kit.js. u runs round the part: on limbs 0.5 = front, 0.75 = outside.
import { clamp01, sstep, gauss, css, hash, fbm, eachPixel, shadeSkin, tone, grain, relief } from './paint.js';

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296; }
const round = (u, c) => Math.abs(((u - c + 1.5) % 1) - 0.5);                 // how far round from c (u wraps)
const spot = (u, v, cu, cv, su, sv) => gauss(round(u, cu), 0, su) * gauss(v, cv, sv);

/* ---------- the shirt ---------- */

// opt.mesh(px, py) → 0..1 where the side panels' open mesh is, opt.band(px, py) → 1 on the collar's rib.
export function shirtShade(ctx, r, span, seed, opt = {}) {
  const rnd = rng(seed), jit = (v, k) => v + (rnd() - 0.5) * 2 * k, rel = relief(r.w, r.h, seed, { wobble: 7, cells: 16 }), F = rel.fold;
  // pulled from each armpit across the chest and the back: tight at the seam, broad by the belly. One or two
  // of each fan are big, the rest slight, so it reads as a few confident folds and not as crumpling.
  for (const [x0, dir] of [[36, 1], [220, -1], [292, 1], [476, -1]]) {
    const big = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < 4; i++) {
      const a = (14 + i * 20 + jit(0, 6)) * Math.PI / 180, len = [58, 98, 122, 94][i] * jit(1, 0.15), x = x0 + dir * i * 2, y = 68 + i * 5, k = i === big ? 1 : i === 0 ? 0.4 : 0.6;
      F(x, y, x + dir * Math.cos(a) * len, y + Math.sin(a) * len, jit(6 + 4 * k, 1), jit(0.78, 0.1) * k, { sag: 0.07, lean: 0.3, fan: 0.5 });
    }
  }
  for (const cx of [128, 384]) {
    // sagging across the belly and the small of the back, from one side then the other
    const big = Math.floor(rnd() * 3);
    for (let i = 0, sd = rnd() < 0.5 ? 1 : -1; i < 4; i++, sd = -sd) {
      const y = 134 + i * 23 + jit(0, 5), k = i === big || i === big + 2 ? 1 : 0.55;
      F(cx + sd * jit(98, 10), y - jit(8, 3), cx - sd * jit(34, 22), y + jit(5, 3), jit(6 + 5 * k, 1.5), jit(0.76, 0.1) * k, { sag: 0.1, lean: 0.35, fan: -0.3 });
    }
    for (const d of [-1, 1]) {
      F(cx + d * 28, 15, cx + d * 88, 30, 6, 0.26, { lean: 0.3 });                                // off the collar toward the shoulder
      F(cx + d * 94, 62, cx + d * 44, 32, 8, 0.3, { fan: -0.3 });                                 // from the armpit up toward the neck
    }
    F(cx - 60, jit(90, 4), cx + 60, jit(90, 4), 12, cx < 256 ? 0.34 : 0.26, { sag: 0.05, lean: 0.4 });   // hanging off the chest, off the shoulder blades
  }
  for (const sx of [0, 256]) for (const d of [-1, 1])                                               // hanging down each side from under the arm
    F(sx + d * jit(12, 4), 82, sx + d * jit(24, 8), jit(236, 10), jit(9, 1.5), jit(0.55, 0.1), { lean: d * 0.3 });
  for (let i = 0; i < 8; i++) { const x = (i + rnd()) * 512 / 8, y = jit(226, 10); F(x, y, x + jit(52, 14), y + jit(0, 7), jit(5.5, 1), jit(0.5, 0.15), { sag: 0.06, lean: 0.4 }); }   // bunched above the hem
  for (let i = 0; i < 10; i++) { const x = (i + rnd()) * 512 / 10; F(x, jit(206, 8), x + jit(0, 7), 268, jit(8, 1.5), jit(0.45, 0.1), { lean: jit(0, 0.4), fan: 0.4 }); }             // hanging to the hem
  for (let i = 0; i < 7; i++) { const x = rnd() * 512, y = 96 + rnd() * 110, a = jit(0.5, 0.9), l = jit(30, 8); F(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 3.4, -0.2); }       // a few small creases
  // The body's form under the cloth, worked out once for each column and each row.
  const L = rel.light(), W = r.w, C = new Float32Array(W * 6), Y = new Float32Array(r.h * 8);
  for (let px = 0; px < W; px++) {
    const u = (px + 0.5) / W, side = Math.cos((u - 0.25) * 4 * Math.PI), flank = (1 - side) / 2, ch = gauss(round(u, 0.25), 0, 0.11);
    C.set([side, flank * flank, flank ** 3, ch, ch * (1 - 0.6 * gauss(u, 0.25, 0.02)), gauss(round(u, 0.75), 0, 0.11)], px * 6);
  }
  for (let py = 0; py < r.h; py++) {
    const y = span[0] - (py + 0.5) / r.h * (span[0] - span[1]);
    Y.set([0.07 * sstep(1.46, 1.535, y)                                                            // the top of the shoulders faces the sky
      - 0.13 * sstep(1.32, 0.98, y) + 0.09 * sstep(0.96, 0.89, y) - 0.14 * sstep(r.h - 11, r.h, py)  // the belly falls away from the light, the hem flares back into it and turns under
      - 0.1 * gauss(py, 13, 4.5),                                                                  // under the collar
    0.14 * sstep(1.42, 1.3, y), 0.2 * gauss(y, 1.37, 0.07),                                        // darker down the flank, the armpits
    0.05 * gauss(y, 1.41, 0.045), 0.08 * gauss(y, 1.3, 0.03),                                      // the chest: lit on top, shaded under it
    0.04 * gauss(y, 1.43, 0.05) - 0.05 * gauss(y, 1.33, 0.04), 0.06 * sstep(1.48, 1.38, y) * sstep(0.98, 1.1, y),   // shoulder blades, the spine's channel
    0.22 * sstep(1.44, 1.53, y)], py * 8);
  }
  eachPixel(ctx, r, (u, v, c, px, py) => {
    const a = px * 6, b = py * 8, side = C[a], f = L[py * W + px];
    let m = 0.89 + 0.07 * side + Y[b] - C[a + 1] * Y[b + 1] - C[a + 2] * Y[b + 2] + C[a + 4] * Y[b + 3] - C[a + 3] * Y[b + 4] + C[a + 5] * Y[b + 5] - gauss(u, 0.75, 0.014) * Y[b + 6];
    m *= (1 + 0.1 * rel.blotch(px, py)) * (1 + 0.7 * f) * grain(px, py + seed);                    // never flat: broad blotches of light and shade
    const mesh = opt.mesh ? opt.mesh(px, py) : 0;
    if (mesh) m *= 1 - mesh * (0.05 + 0.1 * ((px % 3 === 0) && (py % 3 === 0)));                   // the panels' open mesh
    if (opt.band && opt.band(px, py)) m *= 0.95 + 0.05 * Math.sin(px * 1.57);                      // the collar's rib
    if (py > r.h - 9) m *= py > r.h - 3 ? 0.78 : py === r.h - 8 ? 0.86 : 1.03;                     // the hem: a row of stitching, the turned edge
    tone(c, m, clamp01(0.75 * f) + Y[b + 7] + 0.08 * side);
  });
}

/* ---------- sleeves, shorts, socks ---------- */

export function sleeveShade(ctx, r, seed, cuff = 10) {
  const rnd = rng(seed), jit = (v, k) => v + (rnd() - 0.5) * 2 * k, rel = relief(r.w, r.h, seed, { wobble: 5, cells: 4 }), F = rel.fold;
  for (const j of [-1.25, -0.45, 0.4, 1.2])                                                         // hanging from the point of the shoulder to the cuff
    F(72 + j * 15 + jit(0, 3), jit(7, 4), 72 + j * 27 + jit(0, 5), 99, jit(j === 0.4 ? 9 : 6, 1), jit(j === 0.4 ? 0.75 : 0.45, 0.1), { lean: j < 0 ? -0.3 : 0.3, fan: 0.4 });
  for (let i = 0; i < 3; i++) F(24 - jit(22, 4), 9 + i * 13 + jit(0, 3), 24 + jit(22, 4), 13 + i * 13 + jit(0, 4), 5, jit(0.5, 0.1), { sag: 0.12, lean: 0.4 });   // bunched in the armpit
  F(jit(40, 6), jit(54, 8), jit(98, 8), jit(40, 8), 5.5, 0.36, { lean: 0.35 });                      // pulled across by the arm
  for (let i = 0; i < 8; i++) { const x = (i + rnd()) * 12; F(x, 1, x + jit(0, 4), jit(15, 4), 3, 0.34); }   // puckered along the shoulder seam
  for (let i = 0; i < 6; i++) { const x = (i + rnd()) * 16; F(x, r.h - cuff - jit(15, 4), x + jit(0, 3), r.h - cuff, 3.2, 0.3); }   // and gathered into the cuff
  const L = rel.light();
  eachPixel(ctx, r, (u, v, c, px, py) => {
    const f = L[py * r.w + px], band = py >= r.h - cuff;
    let m = 0.9 - 0.2 * gauss(round(u, 0.25), 0, 0.15) + 0.07 * gauss(round(u, 0.72), 0, 0.2) * sstep(0.6, 0, v) - 0.14 * gauss(py, 0, 3);   // dark underneath, lit on the shoulder, the seam
    m *= (1 + 0.1 * rel.blotch(px, py)) * (1 + 0.7 * f) * grain(px + seed, py);
    if (band) m *= (0.93 + 0.07 * Math.sin(px * 1.57)) * (py > r.h - 3 ? 0.8 : 1);                  // the cuff's rib, its edge
    else m *= 1 - 0.16 * gauss(py, r.h - cuff - 1.5, 1.2);                                          // the seam above it
    tone(c, m, clamp01(0.75 * f) + 0.2 * gauss(round(u, 0.72), 0, 0.2) * sstep(0.6, 0, v));
  });
}

// One leg of the shorts. inside: the u of the inner leg.
export function shortsShade(ctx, r, seed, inside) {
  const rnd = rng(seed), jit = (v, k) => v + (rnd() - 0.5) * 2 * k, rel = relief(r.w, r.h, seed, { wobble: 6, cells: 8 }), F = rel.fold;
  const ix = inside * r.w, dir = inside < 0.5 ? 1 : -1, ox = (1 - inside) * r.w;
  for (let i = 0; i < 12; i++) { const x = (i + rnd()) * r.w / 12; F(x, jit(8, 4), x + jit(0, 5), jit(46, 10), 5, jit(0.34, 0.08), { lean: jit(0, 0.4) }); }   // gathered by the waistband
  for (let i = 0; i < 3; i++) F(ix + dir * 8, 30 + i * 5, ix + dir * jit(58 + i * 18, 6), jit(40 + i * 17, 4), i === 1 ? 9 : 6, jit(0.55, 0.1) * (i === 1 ? 1.35 : 1), { sag: 0.08, lean: 0.35, fan: 0.5 });   // pulled from the crotch
  for (let i = 0; i < 2; i++) F(ix - dir * 8, 34 + i * 6, ix - dir * jit(54 + i * 20, 6), jit(46 + i * 14, 4), 6.5, 0.5, { sag: 0.1, lean: 0.35, fan: 0.5 });             // and under the seat
  for (let i = 0; i < 6; i++) { const x = (i + rnd()) * r.w / 6, k = i % 3 === 1 ? 1 : 0.6; F(x, jit(42, 10), x + jit(0, 10), 102, jit(6 + 5 * k, 2), jit(0.7, 0.1) * k, { lean: jit(0, 0.4), fan: 0.35 }); }   // hanging to the hem
  F(ox - jit(34, 6), jit(58, 8), ox + jit(34, 6), jit(66, 8), 6, 0.36, { sag: 0.08, lean: 0.4 });   // creased across the outside
  const L = rel.light();
  eachPixel(ctx, r, (u, v, c, px, py) => {
    const f = L[py * r.w + px];
    let m = 0.9 - 0.22 * gauss(round(u, inside), 0, 0.13) + 0.05 * gauss(round(u, 0.5), 0, 0.18)   // dark between the legs
      - 0.3 * sstep(34, 17, py) - 0.06 * spot(u, py, 0, 48, 0.12, 10) + 0.04 * sstep(70, 90, py);   // in the shirt's shadow, under the seat, the hem swinging out
    m *= (1 + 0.1 * rel.blotch(px, py)) * (1 + 0.62 * f) * grain(px + seed, py);
    if (py > r.h - 7) m *= py > r.h - 3 ? 0.78 : py === r.h - 6 ? 0.86 : 1.03;                      // the hem's stitching, its edge
    tone(c, m, clamp01(0.75 * f) + 0.1 * gauss(round(u, 0.5), 0, 0.2));
  });
}

// The seat of the shorts: only the crotch shows under the shirt.
export function seatShade(ctx, r, seed) {
  const rnd = rng(seed), jit = (v, k) => v + (rnd() - 0.5) * 2 * k, rel = relief(r.w, r.h, seed, { wobble: 4, cells: 4 }), F = rel.fold;
  for (const cx of [64, 0]) for (const d of [-1, 1]) F(cx + d * jit(34, 5), jit(38, 6), cx + d * 5, 94, 4.5, 0.5, { lean: 0.5, fan: -0.4 });
  const L = rel.light();
  eachPixel(ctx, r, (u, v, c, px, py) => {
    const f = L[py * r.w + px];
    let m = (0.92 - 0.3 * sstep(50, 96, py) - 0.1 * (gauss(px, 64, 2) + gauss(Math.min(px, r.w - px), 0, 2))) * (1 + 0.6 * f) * grain(px, py + seed);   // darker between the legs, the seams
    if (py < 10) m *= 0.9 + 0.1 * Math.sin(px * 1.3);                                               // the waistband's elastic
    tone(c, m, clamp01(0.7 * f));
  });
}

export function sockShade(ctx, r, span, seed, turn = 17) {
  const rnd = rng(seed), jit = (v, k) => v + (rnd() - 0.5) * 2 * k, rel = relief(r.w, r.h, seed, { wobble: 3, cells: 4 }), F = rel.fold;
  for (let i = 0; i < 9; i++) {                                                                     // wrinkled at the ankle, front and back in turn
    const cx = (i % 2 ? 0 : 64) + jit(0, 14), y = 117 + i * 4.4 + jit(0, 2), l = jit(30, 8);
    F(cx - l, y + jit(0, 3), cx + l, y + jit(0, 3), jit(2.7, 0.5), jit(0.55, 0.12), { sag: jit(0.04, 0.05), lean: 0.6 });
  }
  for (let i = 0; i < 3; i++) { const x = rnd() * 128, y = jit(70, 30); F(x, y, x + jit(40, 10), y + jit(0, 8), 3, 0.22, { lean: 0.5 }); }   // and a little slack up the calf
  const L = rel.light(), top = span[0], drop = span[0] - span[1];
  eachPixel(ctx, r, (u, v, c, px, py) => {
    const y = top - v * drop, front = gauss(u, 0.5, 0.13), f = L[py * r.w + px];
    let m = 0.9 + 0.08 * Math.cos((u - 0.56) * 2 * Math.PI) + 0.1 * front * sstep(0.44, 0.38, y) * sstep(0.16, 0.24, y);   // round the leg; the shin guard under the sock
    m -= 0.08 * front * (gauss(y, 0.43, 0.012) + gauss(y, 0.185, 0.012));                           // its top and bottom edges
    m += 0.06 * spot(u, y, 0, 0.36, 0.14, 0.05) - 0.12 * gauss(round(u, 0), 0, 0.2) * sstep(0.3, 0.2, y);   // the calf, the hollow behind the ankle
    m += 0.06 * gauss(y, 0.1, 0.014) * (gauss(u, 0.25, 0.05) + gauss(u, 0.75, 0.05));               // ankle bones
    if (py < turn) m += 0.05 * Math.sin(py / turn * Math.PI) - 0.1 * gauss(py, turn - 1, 1.2);      // the turnover: a thick band
    else m -= 0.2 * gauss(py, turn + 1.5, 2.4);                                                     // and its shadow
    m -= 0.25 * sstep(149, 160, py);                                                                // down into the boot
    m *= (1 + 0.06 * rel.blotch(px, py)) * (1 + 0.5 * f);
    m *= 0.962 + 0.038 * Math.sin(u * Math.PI * 2 * 32) + 0.03 * (hash(px, py, 9) - 0.5);           // ribbing
    tone(c, m, clamp01(0.6 * f) + 0.1 * front);
  });
}

/* ---------- boots ---------- */

// v runs heel to toe, u = 0.5 is the top of the foot; the sole is the outer sixth at each side.
export function bootShade(ctx, r, seed) {
  eachPixel(ctx, r, (u, v, c, px, py) => {
    const top = gauss(u, 0.5, 0.2), off = Math.abs(u - 0.5);
    if (off > 0.335) { const m = 0.78 + 0.1 * hash(px, py, 4); c[0] *= m; c[1] *= m; c[2] *= m; return; }   // the sole
    let m = 0.84 + 0.26 * top * sstep(0.5, 0.95, v) + 0.1 * gauss(u, 0.5, 0.06) * sstep(0.7, 0.8, v);         // a sheen along the toe
    m -= 0.14 * top * (gauss(v, 0.71, 0.007) + 0.7 * gauss(v, 0.745, 0.006));                                 // creases where the toes bend
    m -= 0.22 * sstep(0.24, 0.335, off) + 0.1 * gauss(v, 0, 0.05);                                            // turning under to the sole, the back of the heel
    m *= 0.95 + 0.1 * fbm(px / 9, py / 9, seed) + 0.04 * (hash(px, py, 4) - 0.5);                             // the leather's grain
    const sh = 12 * top * sstep(0.45, 0.9, v) + 3;
    c[0] = c[0] * m + sh; c[1] = c[1] * m + sh; c[2] = c[2] * m + sh * 1.1;
  });
}

/* ---------- skin on the limbs ---------- */

// form(u, v, o) sets o.m (light), o.red (flushed: knees, elbows, knuckles), o.hi (a sheen), o.pale (palms, nails).
function skinRegion(ctx, r, skin, seed, form) {
  ctx.fillStyle = css(skin); ctx.fillRect(r.x, r.y, r.w, r.h);
  const o = { m: 1, red: 0, hi: 0, pale: 0 }, deep = 1 - (skin[0] * 0.3 + skin[1] * 0.59 + skin[2] * 0.11) / 255;
  eachPixel(ctx, r, (u, v, c, px, py) => {
    o.m = 1; o.red = o.hi = o.pale = 0;
    form(u, v, o);
    if (o.pale) { const p = o.pale * (0.25 + 0.75 * deep); c[0] += (236 - c[0]) * p * 0.6; c[1] += (190 - c[1]) * p * 0.6; c[2] += (170 - c[2]) * p * 0.6; }
    const blotch = fbm(px / 14, py / 14, seed, 0);
    o.red += 0.5 * (fbm(px / 20, py / 20, seed + 3, 0) - 0.5);                                         // never one flat tone
    shadeSkin(c, o.m * (0.93 + 0.14 * blotch + 0.04 * (hash(px, py, seed) - 0.5)));
    c[0] *= 1 + 0.1 * o.red; c[1] *= 1 - 0.1 * o.red; c[2] *= 1 - 0.12 * o.red;
    const h = Math.max(0, o.hi) * (26 + 44 * deep);                                                 // dark skin shines more
    c[0] += h; c[1] += h * 0.94; c[2] += h * 0.9;
  });
}

export function limbs(ctx, R, SPAN, skin) {
  const ring = u => 0.83 + 0.17 * Math.cos((u - 0.56) * 2 * Math.PI);                                // lit from the front, a little to the outside
  // The arm, from under the sleeve to the fingertips. With the arm hanging the thumb is at the front
  // (u = 0.5), the back of the hand outside (0.75), the palm inside (0.25), the elbow's point behind (0).
  skinRegion(ctx, R.arm, skin, 31, (u, v, o) => {
    const d = SPAN.arm[0] + v * (SPAN.arm[1] - SPAN.arm[0]);
    let m = ring(u) - 0.22 * sstep(-0.3, -0.262, d) - 0.05 * sstep(-0.4, -0.6, d);                  // in the sleeve's shadow; browner toward the hand
    if (d > -0.59) {
      m += 0.14 * spot(u, d, 0.47, -0.25, 0.1, 0.045) + 0.08 * spot(u, d, 0.9, -0.255, 0.08, 0.04) - 0.13 * spot(u, d, 0.7, -0.265, 0.04, 0.045);   // biceps, triceps, the groove between
      m -= 0.22 * spot(u, d, 0.48, -0.31, 0.13, 0.007) + 0.1 * spot(u, d, 0.48, -0.306, 0.16, 0.022);                                              // the crease inside the elbow
      m -= 0.16 * spot(u, d, 0, -0.316, 0.1, 0.006) + 0.11 * spot(u, d, 0.02, -0.33, 0.11, 0.008) + 0.1 * spot(u, d, 0.8, -0.318, 0.04, 0.014);    // the wrinkles over its point, a dimple outside it
      m += 0.1 * spot(u, d, 0.99, -0.302, 0.05, 0.009);
      const taper = sstep(-0.322, -0.35, d) * sstep(-0.54, -0.44, d), run = -0.34 - d;
      m += 0.18 * spot(u, d, 0.62, -0.37, 0.075, 0.055) + 0.11 * spot(u, d, 0.31, -0.38, 0.07, 0.055);                                             // the forearm's outer bulk, the flexors inside
      m -= 0.16 * gauss(u, 0.47 - 0.35 * run, 0.035) * taper + 0.1 * gauss(u, 0.8 + 0.25 * run, 0.03) * taper;                                     // the grooves either side of the bulk, running to the wrist
      m += 0.07 * gauss(round(u, 0.9), 0, 0.025) * sstep(-0.36, -0.41, d) * sstep(-0.555, -0.47, d);                                               // the bone's edge along the back
      const wr = sstep(-0.45, -0.53, d);
      m += wr * (0.1 * (gauss(u, 0.2, 0.017) + gauss(u, 0.3, 0.017)) - 0.11 * gauss(u, 0.25, 0.016) - 0.06 * gauss(u, 0.38, 0.025) - 0.05 * gauss(u, 0.62, 0.05));   // tendons inside the wrist, the hollows beside them
      m += 0.14 * spot(u, d, 0.93, -0.545, 0.04, 0.01) - 0.11 * spot(u, d, 0.93, -0.558, 0.05, 0.005) - 0.13 * gauss(d, -0.563, 0.004) * gauss(round(u, 0.25), 0, 0.2);   // the wrist bone, the crease
      o.red = 0.6 * spot(u, d, 0, -0.314, 0.14, 0.024) + 0.3 * spot(u, d, 0.48, -0.31, 0.14, 0.015) + 0.25 * sstep(-0.5, -0.58, d);
      o.hi = 0.6 * spot(u, d, 0.61, -0.365, 0.045, 0.045) + 0.45 * spot(u, d, 0.5, -0.25, 0.05, 0.03) + 0.4 * spot(u, d, 0.93, -0.545, 0.02, 0.006);
    }
    if (d < -0.56 && d > -0.66) {                                                                    // the hand
      const k = sstep(-0.57, -0.65, d), sp = 0.025 + 0.075 * k, back = gauss(round(u, 0.75), 0, 0.17), palm = gauss(round(u, 0.25), 0, 0.17) * sstep(-0.565, -0.58, d);
      for (const j of [-1.5, -0.5, 0.5, 1.5]) {                                                      // a tendon to each knuckle
        const tu = 0.75 + j * sp, kn = spot(u, d, tu, -0.634, 0.03, 0.007);
        m += 0.09 * gauss(u, tu, 0.011) * sstep(-0.575, -0.6, d) * sstep(-0.636, -0.625, d) - 0.06 * gauss(u, tu + 0.5 * sp, 0.013) * k;
        m += 0.13 * kn - 0.16 * spot(u, d, tu, -0.647, 0.036, 0.004); o.red += 0.6 * kn; o.hi += 0.35 * kn;
      }
      m -= 0.12 * palm * (gauss(d, -0.628, 0.004) + gauss(d - 0.3 * (u - 0.25), -0.605, 0.004));     // the palm's creases
      o.pale = 0.9 * palm; m += (0.93 - ring(u)) * 0.6 * sstep(-0.565, -0.59, d) + 0.05 * palm - 0.04 * back * (1 - k); o.red += 0.25 * (1 - palm);
    }
    if (d <= -0.66) {                                                                                // fingers: joints, nails
      const f = (-0.66 - d) / 0.06, back = sstep(0.5, 0.6, u) * sstep(1, 0.9, u), nail = sstep(0.74, 0.8, f) * sstep(0.17, 0.11, Math.abs(u - 0.75));
      m -= (0.08 + 0.12 * back) * (gauss(f, 0.36, 0.035) + gauss(f, 0.7, 0.03)) + 0.12 * sstep(0.9, 1.05, f) * (1 - nail);
      o.red = 0.3 + 0.4 * back * (gauss(f, 0.36, 0.06) + gauss(f, 0.7, 0.05)) + 0.3 * sstep(0.75, 1, f) * (1 - nail);
      o.pale = 0.75 * nail + 0.6 * gauss(round(u, 0.25), 0, 0.15); o.hi = 0.5 * nail * gauss(u, 0.74, 0.04);
      m -= 0.16 * gauss(f, 0.75, 0.025) * gauss(u, 0.75, 0.16) * (1 - nail);                         // the nail's root
    }
    o.m = m;
  });
  // Above the knee and the knee itself (the rest of the thigh is up inside the shorts).
  skinRegion(ctx, R.thigh, skin, 37, (u, v, o) => {
    const y = SPAN.thigh[0] - v * (SPAN.thigh[0] - SPAN.thigh[1]), front = gauss(u, 0.5, 0.16);
    let m = ring(u) + 0.14 - 0.16 * sstep(0.575, 0.6, y) - 0.12 * sstep(0.6, 0.63, y);                // the shorts' shadow (the model's own shading adds most of it)
    m += 0.19 * spot(u, y, 0.4, 0.566, 0.06, 0.028) + 0.13 * spot(u, y, 0.63, 0.6, 0.07, 0.04);      // the teardrop inside the knee, the outer head higher up
    m -= 0.16 * spot(u, y, 0.41, 0.537, 0.07, 0.008) + 0.13 * gauss(u, 0.515, 0.024) * sstep(0.545, 0.57, y) + 0.14 * gauss(u, 0.79, 0.025) * sstep(0.52, 0.56, y);   // under the teardrop, the tendon between the heads, the band down the outside
    m += 0.2 * spot(u, y, 0.5, 0.527, 0.065, 0.016) - 0.3 * spot(u, y, 0.5, 0.5, 0.1, 0.007) - 0.18 * (spot(u, y, 0.38, 0.516, 0.032, 0.02) + spot(u, y, 0.62, 0.516, 0.032, 0.02));   // the kneecap, the shadow under it, a dimple each side
    m += 0.13 * spot(u, y, 0.5, 0.484, 0.035, 0.012) - 0.12 * (spot(u, y, 0.43, 0.486, 0.025, 0.012) + spot(u, y, 0.57, 0.486, 0.025, 0.012));           // the tendon under it
    m -= 0.2 * spot(u, y, 0, 0.52, 0.07, 0.03) + 0.14 * spot(u, y, 0, 0.521, 0.12, 0.005);           // the hollow behind the knee, its crease
    m += 0.12 * (gauss(u, 0.09, 0.022) + gauss(u, 0.91, 0.022)) * sstep(0.49, 0.52, y) * sstep(0.6, 0.56, y);   // hamstring tendons
    o.m = m; o.red = 0.7 * front * gauss(y, 0.516, 0.03); o.hi = 0.7 * spot(u, y, 0.5, 0.529, 0.05, 0.012) + 0.45 * spot(u, y, 0.41, 0.568, 0.04, 0.02);
  });
  // The neck: v = 0 under the jaw, the collar about two thirds down. u: 0.5 = the throat, 0 = the nape.
  skinRegion(ctx, R.neck, skin, 43, (u, v, o) => {
    const front = gauss(u, 0.5, 0.2), s = Math.abs(u - 0.5);
    let m = 0.87 + 0.06 * Math.cos((u - 0.5) * 2 * Math.PI) - 0.3 * front * sstep(0.42, 0, v) - 0.1 * sstep(0.2, 0, v);   // the jaw's shadow
    const cord = 0.2 - 0.17 * sstep(0, 0.72, v);                                                     // the two cords, from behind the ears to the pit of the throat
    m += 0.12 * gauss(s, cord, 0.028) * sstep(0, 0.2, v) - 0.1 * gauss(s, cord + 0.055, 0.03) * sstep(0.05, 0.3, v);
    m += 0.09 * spot(u, v, 0.5, 0.3, 0.035, 0.06) - 0.08 * spot(u, v, 0.5, 0.42, 0.04, 0.03) - 0.14 * spot(u, v, 0.5, 0.74, 0.03, 0.06);   // the Adam's apple, under it, the pit of the throat
    m -= 0.07 * gauss(round(u, 0), 0, 0.02) - 0.05 * gauss(round(u, 0), 0.07, 0.035) + 0.1 * gauss(round(u, 0), 0, 0.2) * sstep(0.25, 0, v);   // the nape: the groove, the muscle each side, under the hair
    m -= 0.14 * sstep(0.5, 0.68, v);                                                                 // the collar's shadow
    o.m = m; o.hi = 0.35 * spot(u, v, 0.5, 0.29, 0.03, 0.04);
  });
}
