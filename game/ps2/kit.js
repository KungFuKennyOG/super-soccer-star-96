// The PS2-look texture sheet: one 1024x512 sheet per player. The kit and the limbs are painted here,
// the head and hair in face.js. Flat colors, patterns, numbers and marks go down first with the 2D
// canvas, then every region gets its light, shade and folds painted over it pixel by pixel.
// Marks are invented (a plain shield, a made-up wordmark): no real crests, sponsors or makers' logos.
import { clamp01, sstep, gauss, hex, css, lum, hash, fbm, eachPixel, shadeCloth, shadeSkin, foldField } from './paint.js';

export const ATLAS = { w: 1024, h: 512 };
// u runs round the body. Shirt: 0 = his right side, 0.25 = chest, 0.75 = back. Limbs: 0.5 = front,
// 0.75 = outside (the right limb is mirrored), except the shorts legs, which aren't mirrored (the
// number sits on his right leg): outside is 0.75 on the left leg and 0.25 on the right.
export const R = {
  shirt: { x: 0, y: 0, w: 512, h: 256 },
  pelvis: { x: 0, y: 256, w: 128, h: 96 },
  shortsL: { x: 128, y: 256, w: 192, h: 96 },
  shortsR: { x: 320, y: 256, w: 192, h: 96 },
  sock: { x: 0, y: 352, w: 128, h: 160 },
  boot: { x: 128, y: 352, w: 128, h: 160 },
  arm: { x: 256, y: 352, w: 96, h: 160 },
  thigh: { x: 352, y: 352, w: 64, h: 96 },
  neck: { x: 352, y: 448, w: 64, h: 64 },
  sleeve: { x: 416, y: 352, w: 96, h: 96 },
  head: { x: 512, y: 0, w: 384, h: 384 },
  hair: { x: 512, y: 384, w: 384, h: 128 },
};
// What each region covers on the body (world heights in metres; arms are measured down from the shoulder).
export const SPAN = {
  shirt: [1.56, 0.853], pelvis: [1.0, 0.775], shorts: [0.9, 0.615], thigh: [0.69, 0.475], sock: [0.485, 0.06],
  neck: [1.625, 1.49], sleeve: [0.035, -0.225], arm: [-0.16, -0.69],
};
const row = (span, y, h) => (span[0] - y) / (span[0] - span[1]) * h;

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296; }
const fill = (ctx, r, color) => { ctx.fillStyle = color; ctx.fillRect(r.x, r.y, r.w, r.h); };
const inRegion = (ctx, r, draw) => { ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.translate(r.x, r.y); draw(); ctx.restore(); };

// A number, drawn `h` pixels tall and squeezed by `sx` to undo the region's stretch round the body.
function number(ctx, text, x, y, h, sx, color, outline) {
  ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
  ctx.font = `900 ${h}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (outline) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, h * 0.09); ctx.strokeStyle = outline; ctx.strokeText(text, 0, 0); }
  ctx.fillStyle = color; ctx.fillText(text, 0, 0);
  ctx.restore();
}

/* ---------- the flat kit ---------- */

function shirtFlat(ctx, k, num) {
  const r = R.shirt, Y = y => row(SPAN.shirt, y, r.h), plain = k.pattern === 'solid' || k.pattern === 'sleeves';
  inRegion(ctx, r, () => {
    ctx.fillStyle = k.shirt; ctx.fillRect(0, 0, r.w, r.h);
    ctx.fillStyle = k.alt;
    if (k.pattern === 'stripes') for (let i = 0; i < 16; i += 2) ctx.fillRect(i * 32 + 16, 0, 32, r.h);
    if (k.pattern === 'hoops') for (let y = 24; y < r.h; y += 44) ctx.fillRect(0, y, r.w, 22);
    if (k.pattern === 'checks') for (let j = 0; j < 8; j++) for (let i = j % 2; i < 16; i += 2) ctx.fillRect(i * 32, j * 32, 32, 32);
    if (k.pattern === 'band') { ctx.fillStyle = k.band; ctx.fillRect(104, 0, 48, r.h); ctx.fillRect(360, 0, 48, r.h); }
    if (k.pattern === 'halves') { ctx.fillRect(128, 0, 128, r.h); ctx.fillRect(256, 0, 128, r.h); }
    if (plain) {                                   // piping down each side: one broad line, one fine
      ctx.fillStyle = k.trim;
      for (const x of [0, 256]) { ctx.fillRect(x - 5, Y(1.4), 4, r.h); ctx.fillRect(x + 1, Y(1.4), 4, r.h); ctx.fillRect(x + 507, Y(1.4), 4, r.h); }
      ctx.fillStyle = k.trim2; for (const x of [0, 256, 512]) ctx.fillRect(x - 1, Y(1.4), 2, r.h);
    }
    // collar: a ribbed band round the neck with a short V at the front
    ctx.fillStyle = k.trim; ctx.fillRect(0, 0, r.w, 9);
    ctx.beginPath(); ctx.moveTo(108, 0); ctx.lineTo(128, 30); ctx.lineTo(148, 0); ctx.fill();
    ctx.fillStyle = k.trim2; ctx.fillRect(0, 9, r.w, 2);
    ctx.beginPath(); ctx.moveTo(116, 0); ctx.lineTo(128, 18); ctx.lineTo(140, 0); ctx.fillStyle = css(hex(k.shirt).map(v => v * 0.55)); ctx.fill();
    // an invented badge on his left chest: a plain shield with a star
    const bx = 172, by = Y(1.385), dark = lum(hex(k.shirt)) < 0.4, ink = dark ? '#f2f1ea' : k.trim;
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(bx - 11, by - 9); ctx.lineTo(bx + 11, by - 9); ctx.lineTo(bx + 11, by + 2); ctx.quadraticCurveTo(bx + 9, by + 11, bx, by + 13); ctx.quadraticCurveTo(bx - 9, by + 11, bx - 11, by + 2); ctx.fill();
    ctx.fillStyle = k.trim2 === k.trim ? (dark ? k.shirt : '#f2f1ea') : k.trim2;
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? 2.4 : 6; ctx.lineTo(bx + Math.cos(a) * q * 1.3, by + 1 + Math.sin(a) * q); } ctx.fill();
    // an invented wordmark across the chest
    ctx.save(); ctx.translate(128, Y(1.275)); ctx.scale(1.25, 1); ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.font = '900 17px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!plain) { ctx.fillStyle = k.shirt; ctx.fillRect(-46, -11, 92, 22); }
    ctx.fillStyle = dark ? '#f2f1ea' : k.trim; ctx.fillText('STAR·96', 0, 0);
    ctx.restore();
    if (!plain) { ctx.fillStyle = k.shirt; ctx.fillRect(384 - 62, Y(1.44), 124, Y(1.16) - Y(1.44)); }   // a panel behind the number on patterned shirts
    number(ctx, String(num), 384, Y(1.3), 96, 1.2, k.number, k.outline || (lum(hex(k.number)) > 0.5 ? '#161618' : null));
  });
}

function shortsFlat(ctx, k, num) {
  fill(ctx, R.pelvis, k.shorts);
  for (const [r, out] of [[R.shortsL, 0.75], [R.shortsR, 0.25]]) inRegion(ctx, r, () => {
    ctx.fillStyle = k.shorts; ctx.fillRect(0, 0, r.w, r.h);
    ctx.fillStyle = k.trim; ctx.fillRect(out * r.w - 7, 0, 5, r.h); ctx.fillRect(out * r.w + 2, 0, 5, r.h);
    ctx.fillStyle = k.trim2; ctx.fillRect(out * r.w - 1, 0, 2, r.h);
    if (r === R.shortsR) number(ctx, String(num), r.w * 0.5 - 16, row(SPAN.shorts, 0.69, r.h), 30, 0.85, lum(hex(k.shorts)) > 0.5 ? (lum(hex(k.number)) > 0.6 ? k.trim : k.number) : '#f2f1ea', null);
  });
}

function sleeveFlat(ctx, k) {
  const r = R.sleeve, col = k.sleeve || (k.pattern === 'sleeves' ? k.alt : k.shirt);
  inRegion(ctx, r, () => {
    ctx.fillStyle = col; ctx.fillRect(0, 0, r.w, r.h);
    const dark = lum(hex(col)) < 0.4, ink = dark && lum(hex(k.trim)) < 0.4 ? '#f2f1ea' : k.trim;
    ctx.fillStyle = ink; ctx.fillRect(0.75 * r.w - 6, 0, 4, r.h); ctx.fillRect(0.75 * r.w + 2, 0, 4, r.h);   // piping from the collar along the shoulder
    ctx.fillRect(0, r.h - 12, r.w, 6);                                                                    // cuff
    ctx.fillStyle = k.trim2 === k.trim ? ink : k.trim2; ctx.fillRect(0, r.h - 5, r.w, 2);
  });
}

function sockFlat(ctx, k) {
  const r = R.sock;
  inRegion(ctx, r, () => {
    ctx.fillStyle = k.socks; ctx.fillRect(0, 0, r.w, r.h);
    const ink = lum(hex(k.socks)) < 0.4 && lum(hex(k.trim)) < 0.4 ? '#f2f1ea' : k.trim;
    ctx.fillStyle = ink; ctx.fillRect(0, 5, r.w, 4); ctx.fillRect(0, 12, r.w, 2);                          // hoops on the turnover
  });
}

const BOOTS = [['#17171a', '#e8e6e0'], ['#e9e7e1', '#17171a'], ['#b0141e', '#f0eee8'], ['#c9a13a', '#17171a']];
function bootFlat(ctx, boots) {
  const r = R.boot, [leather, mark] = BOOTS[boots % BOOTS.length];
  inRegion(ctx, r, () => {
    ctx.fillStyle = leather; ctx.fillRect(0, 0, r.w, r.h);
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(0, 0, 14, r.h); ctx.fillRect(r.w - 14, 0, 14, r.h);            // sole
    ctx.fillStyle = '#b9b9b4'; for (const v of [0.14, 0.3, 0.62, 0.8]) for (const x of [6, r.w - 6]) { ctx.beginPath(); ctx.arc(x, v * r.h, 3.2, 0, 7); ctx.fill(); }   // studs
    ctx.fillStyle = mark; ctx.fillRect(48, 0.3 * r.h, 32, 0.4 * r.h);                                       // the tongue under the laces
    ctx.fillStyle = leather; ctx.fillRect(52, 0.32 * r.h, 24, 0.36 * r.h);
    ctx.strokeStyle = mark; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const y = (0.34 + i * 0.058) * r.h; ctx.beginPath(); ctx.moveTo(53, y); ctx.lineTo(75, y + 5); ctx.moveTo(75, y); ctx.lineTo(53, y + 5); ctx.stroke(); }
    ctx.fillStyle = mark; for (const x of [22, r.w - 30]) ctx.fillRect(x, 0.04 * r.h, 8, 0.1 * r.h);        // heel tabs
    ctx.strokeStyle = css(hex(leather).map(v => v * 0.7 + 30)); ctx.lineWidth = 1;                           // toe stitching
    for (const v of [0.74, 0.8]) { ctx.beginPath(); ctx.moveTo(20, v * r.h + 6); ctx.quadraticCurveTo(64, v * r.h - 8, 108, v * r.h + 6); ctx.stroke(); }
  });
}

/* ---------- light, shade and folds ---------- */

function shirtShade(ctx, seed) {
  const r = R.shirt, rnd = rng(seed), F = [], Y = y => row(SPAN.shirt, y, r.h);
  for (const [x0, dir] of [[18, 1], [238, -1], [274, 1], [494, -1]]) for (let i = 0; i < 3; i++)       // pulled from each armpit
    F.push([x0 + dir * 4, 58 + i * 12, x0 + dir * (50 + 26 * i + rnd() * 12), 92 + 30 * i + rnd() * 10, 5 + rnd() * 3, 0.55 * dir]);
  for (const cx of [128, 384]) {
    for (let i = 0; i < 4; i++) {                                                                       // sagging across the belly and the small of the back
      const y = 150 + i * 24 + rnd() * 8, w = 62 + rnd() * 26, s = 0.4 + rnd() * 0.25;
      F.push([cx - w, y - 9, cx - 4, y + 6, 6, s], [cx + 4, y + 6, cx + w, y - 9, 6, s]);
    }
    for (const d of [-1, 1]) F.push([cx + d * 20, 10, cx + d * 82, 34, 5, 0.3 * d]);                    // off the shoulders
    F.push([cx - 66, 54, cx + 66, 56, 7, 0.22]);                                                         // stretched across the chest
  }
  for (let i = 0; i < 12; i++) { const x = (i + rnd()) * 512 / 12; F.push([x, 196 + rnd() * 12, x + (rnd() - 0.5) * 16, 254, 5, (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.2)]); }   // hanging to the hem
  const fold = foldField(F, seed);
  eachPixel(ctx, r, (u, v, c, px, py) => {
    const side = Math.cos((u - 0.25) * 4 * Math.PI), y = SPAN.shirt[0] - v * (SPAN.shirt[0] - SPAN.shirt[1]), front = gauss(u, 0.25, 0.12);
    let m = 0.88 + 0.1 * side + 0.06 * sstep(1.2, 1.5, y) - 0.1 * sstep(0.98, 0.86, y);
    m -= 0.05 * front * gauss(y, 1.285, 0.03) * (1 - gauss(u, 0.25, 0.012));                             // under the chest
    m -= 0.12 * (1 - sstep(-1, -0.72, side)) * gauss(y, 1.4, 0.06);                                      // armpits
    m += 0.05 * (fbm(px / 40, py / 40, seed + 5) - 0.5);
    const f = fold(px, py);
    m *= 1 + 0.34 * f;
    m *= 0.985 + 0.03 * hash(px, py, seed) + 0.008 * Math.sin(px * 2.1) * Math.sin(py * 2.1);            // weave
    const dark = 1 - lum(c);
    shadeCloth(c, m);
    const lift = dark * (16 + 60 * Math.max(0, f) + 14 * side);                                          // black cloth still catches the light
    c[0] += lift; c[1] += lift; c[2] += lift * 1.08;
    if (py < 9) { const rib = 0.9 + 0.1 * Math.sin(px * 1.6); c[0] *= rib; c[1] *= rib; c[2] *= rib; }
    if (py > r.h - 4) { c[0] *= 0.86; c[1] *= 0.86; c[2] *= 0.86; }                                       // the hem's stitching
  });
}

// A hanging tube of cloth (sleeves, shorts): folds down its length, shade on the inside.
function tubeShade(ctx, r, seed, { inside = 0.25, drape = 6, cross = 2, hem = 5 } = {}) {
  const rnd = rng(seed), F = [];
  for (let i = 0; i < drape; i++) { const x = (i + 0.2 + rnd() * 0.6) * r.w / drape; F.push([x, r.h * (0.1 + rnd() * 0.3), x + (rnd() - 0.5) * 14, r.h, 5, (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.25)]); }
  for (let i = 0; i < cross; i++) { const y = r.h * (0.25 + 0.5 * rnd()), x = rnd() * r.w * 0.6; F.push([x, y, x + r.w * 0.4, y + (rnd() - 0.5) * 20, 5, 0.3]); }
  const fold = foldField(F, seed);
  eachPixel(ctx, r, (u, v, c, px, py) => {
    const f = fold(px, py), dark = 1 - lum(c);
    let m = (0.94 - 0.16 * gauss(Math.min(Math.abs(u - inside), 1 - Math.abs(u - inside)), 0, 0.14) + 0.05 * gauss(u, 0.5, 0.2)) * (1 + 0.32 * f);
    m *= 0.985 + 0.03 * hash(px, py, seed);
    if (py > r.h - hem) m *= 0.85;
    if (py > r.h - 2) m *= 0.55;
    shadeCloth(c, m);
    const lift = dark * (14 + 55 * Math.max(0, f));
    c[0] += lift; c[1] += lift; c[2] += lift * 1.08;
  });
}

function sockShade(ctx) {
  const r = R.sock;
  eachPixel(ctx, r, (u, v, c, px, py) => {
    const y = SPAN.sock[0] - v * (SPAN.sock[0] - SPAN.sock[1]), front = gauss(u, 0.5, 0.13), dark = 1 - lum(c);
    let m = 0.9 + 0.1 * front * sstep(0.44, 0.38, y) * sstep(0.16, 0.24, y);                               // the shin guard under the sock
    m -= 0.07 * front * (gauss(y, 0.43, 0.012) + gauss(y, 0.185, 0.012));                                  // its top and bottom edges
    m -= 0.1 * gauss(Math.min(u, 1 - u), 0, 0.2) * sstep(0.3, 0.2, y);                                     // behind the ankle
    m -= 0.1 * gauss(y, 0.455, 0.008) + 0.06 * (gauss(y, 0.13, 0.008) + gauss(y, 0.105, 0.007));           // under the turnover, wrinkles at the ankle
    m *= 0.97 + 0.03 * Math.sin(u * Math.PI * 2 * 44) + 0.03 * (hash(px, py, 9) - 0.5);                    // ribbing
    shadeCloth(c, m);
    c[0] += dark * 14; c[1] += dark * 14; c[2] += dark * 16;
  });
}

function bootShade(ctx) {
  eachPixel(ctx, R.boot, (u, v, c, px, py) => {
    const top = gauss(u, 0.5, 0.2);
    let m = 0.82 + 0.3 * top * sstep(0.45, 0.95, v) + 0.1 * gauss(u, 0.5, 0.06);                            // a sheen along the toe
    m -= 0.1 * gauss(v, 0.72, 0.02) * top;                                                                  // the crease where the toes bend
    m *= 0.97 + 0.06 * hash(px, py, 4);
    c[0] = c[0] * m + 10 * top; c[1] = c[1] * m + 10 * top; c[2] = c[2] * m + 12 * top;
  });
}

/* ---------- skin on the limbs ---------- */

function skinRegion(ctx, r, skin, seed, form) {
  fill(ctx, r, css(skin));
  eachPixel(ctx, r, (u, v, c, px, py) => {
    const m = form(u, v) * (0.97 + 0.07 * fbm(px / 18, py / 18, seed) + 0.02 * (hash(px, py, seed) - 0.5));
    shadeSkin(c, m);
  });
}
function limbs(ctx, skin) {
  const ring = u => 0.9 + 0.1 * Math.cos((u - 0.56) * 2 * Math.PI);                                         // lit from the front, a little to the outside
  skinRegion(ctx, R.arm, skin, 31, (u, v) => {
    const dy = SPAN.arm[0] + v * (SPAN.arm[1] - SPAN.arm[0]);
    let m = ring(u) - 0.06 * gauss(dy, -0.31, 0.03) + 0.05 * gauss(dy, -0.38, 0.05) * gauss(u, 0.62, 0.15) - 0.1 * sstep(-0.2, -0.16, dy);
    if (dy < -0.6) {                                                                                         // the hand: knuckles, then fingers
      const face = Math.min(Math.abs(u - 0.75), Math.abs(u - 0.25));
      for (const o of [-0.115, 0, 0.115]) m -= 0.22 * gauss(face, Math.abs(o), 0.012) * sstep(-0.635, -0.65, dy) * (o === 0 || face > 0.05 ? 1 : 0.5);
      m -= 0.07 * gauss(dy, -0.63, 0.007) + 0.14 * sstep(-0.665, -0.69, dy);
    }
    return m;
  });
  skinRegion(ctx, R.thigh, skin, 37, (u, v) => {
    const y = SPAN.thigh[0] - v * (SPAN.thigh[0] - SPAN.thigh[1]), front = gauss(u, 0.5, 0.16);
    return ring(u) - 0.2 * sstep(0.64, 0.69, y) + 0.07 * front * gauss(y, 0.525, 0.022) - 0.07 * front * (gauss(y, 0.555, 0.012) + gauss(y, 0.495, 0.01)) - 0.06 * gauss(u, 0.5, 0.05) * gauss(y, 0.59, 0.03);
  });
  skinRegion(ctx, R.neck, skin, 43, (u, v) => {
    const front = gauss(u, 0.5, 0.2);
    return 0.86 + 0.06 * Math.cos((u - 0.5) * 2 * Math.PI) - 0.26 * front * sstep(0.45, 0.0, v) + 0.04 * gauss(u, 0.5, 0.04) * gauss(v, 0.55, 0.12) - 0.05 * gauss(Math.abs(u - 0.5), 0.13, 0.03);
  });
}

// Paints everything but the head and hair. kit: a kit spec from rules/teams.js. skin: [r, g, b].
export function paintKit(ctx, { kit, num, skin, boots = 0 }) {
  const seed = (hash(parseInt(kit.shirt.slice(1), 16) & 0xffff, kit.pattern.length, 3) * 1e6) | 0;
  shirtFlat(ctx, kit, num); shortsFlat(ctx, kit, num); sleeveFlat(ctx, kit); sockFlat(ctx, kit); bootFlat(ctx, boots);
  shirtShade(ctx, seed);
  tubeShade(ctx, R.sleeve, seed + 11, { inside: 0.25, drape: 4, cross: 2, hem: 0 });
  tubeShade(ctx, R.pelvis, seed + 12, { inside: 2, drape: 5, cross: 0, hem: 0 });
  tubeShade(ctx, R.shortsL, seed + 13, { inside: 0.25, drape: 7, cross: 2, hem: 4 });
  tubeShade(ctx, R.shortsR, seed + 14, { inside: 0.75, drape: 7, cross: 2, hem: 4 });
  sockShade(ctx); bootShade(ctx);
  limbs(ctx, skin);
}
export { clamp01 };
