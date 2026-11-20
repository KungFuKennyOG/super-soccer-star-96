// The PS2-look kit sheet: one 512x512 sheet per player, with the kit and the limbs. The head and hair
// have their own sheet (HEAD_SHEET, painted by face.js), shared by every player with the same look.
// The flat kit goes down first with the 2D canvas (colors, patterns, collar, panels, piping, numbers,
// marks), then cloth.js paints light, shade and folds over every region pixel by pixel, so whatever is
// printed on the cloth creases with it.
// The cut (collar, side panels, piping, cuffs) is generic early-2000s, picked per kit from its colors. Marks are invented
// (a plain shield with a star, a made-up wordmark): no real crests, sponsors or makers' logos.
import { clamp01, gauss, hex, css, lum, hash } from './paint.js';
import { shirtShade, sleeveShade, shortsShade, seatShade, sockShade, bootShade, limbs } from './cloth.js';

export const ATLAS = { w: 512, h: 512 };
export const HEAD_SHEET = { w: 512, h: 640 };
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
  head: { x: 0, y: 0, w: 512, h: 512 },          // these two are on the head sheet
  hair: { x: 0, y: 512, w: 512, h: 128 },
};
// What each region covers on the body (world heights in metres; arms are measured down from the shoulder).
export const SPAN = {
  shirt: [1.552, 0.878], pelvis: [1.0, 0.775], shorts: [0.92, 0.613], thigh: [0.69, 0.475], sock: [0.486, 0.06],
  neck: [1.65, 1.5], arm: [-0.2, -0.74],   // (the sleeve's rows run seam to cuff)
};
const row = (span, y, h) => (span[0] - y) / (span[0] - span[1]) * h;

const inRegion = (ctx, r, draw) => { ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.translate(r.x, r.y); draw(); ctx.restore(); };
const shade = (color, k) => css(hex(color).map(v => (k < 1 ? v * k : v + (255 - v) * (k - 1))));
const PALE = '#f2f1ea';
const inkOn = (ground, ink, gap = 0.3) => (Math.abs(lum(hex(ground)) - lum(hex(ink))) < gap ? (lum(hex(ground)) < 0.45 ? PALE : '#161618') : ink);   // an ink that shows on that ground
const path = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };

// Block numerals, the athletic kind: seven bars with the outer corners cut off. Drawn here rather than
// with a font, so they look the same whatever fonts the headset has.
const BARS = ['abcdef', '', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abcdfg'];
function digit(ctx, n, W, H, t, o) {
  const w = n === 1 ? t * 1.9 : W, c = t * 0.62, hb = H / 2 + t / 2, x1 = w + o, y1 = H + o, up = [t, (H - t) / 2], lo = [(H + t) / 2, H - t];
  const bar = { a: [0, 0, w, t], d: [0, H - t, w, t], g: [0, (H - t) / 2, w, t], f: [0, 0, t, hb], b: [w - t, 0, t, hb], e: [0, H - hb, t, hb], c: [w - t, H - hb, t, hb] };
  ctx.save();
  path(ctx, [[c - o, -o], [x1 - c, -o], [x1, c - o], [x1, y1 - c], [x1 - c, y1], [c - o, y1], [-o, y1 - c], [-o, c - o]]); ctx.clip();
  ctx.beginPath();                                     // one path for the whole digit, so the bars don't show their joins
  const box = (x, y, bw, bh) => ctx.rect(x - o, y - o, bw + 2 * o, bh + 2 * o);
  if (n === 1) { box(w - t, 0, t, H); box(0, 0, w - t / 2, t * 0.9); }
  for (const k of BARS[n]) box(...bar[k]);
  if (n === 7) box(0, 0, t, t * 1.75);
  for (const [y0, y2] of { 0: [[t, H - t]], 6: [lo], 8: [up, lo], 9: [up] }[n] || [])              // the counters' corners are cut too
    for (const [cx, cy, sx, sy] of [[t, y0, 1, 1], [w - t, y0, -1, 1], [t, y2, 1, -1], [w - t, y2, -1, -1]]) {
      const px = cx + sx * (o - 1), py = cy + sy * (o - 1), q = c * 0.38 + 1;
      ctx.moveTo(px, py); if (sx * sy > 0) { ctx.lineTo(px + sx * q, py); ctx.lineTo(px, py + sy * q); } else { ctx.lineTo(px, py + sy * q); ctx.lineTo(px + sx * q, py); }
      ctx.closePath();
    }
  ctx.fill();
  ctx.restore();
  return w;
}
// A number `h` pixels tall centred on (x, y), squeezed by `sx` to undo the region's stretch round the body.
function number(ctx, text, x, y, h, sx, color, outline) {
  const W = h * 0.55, t = h * 0.172, gap = t * 0.62, ds = [...String(text)].filter(d => d >= '0' && d <= '9').map(Number), o = Math.max(1.5, h * 0.045);
  const total = ds.reduce((s, n) => s + (n === 1 ? t * 1.9 : W), 0) + gap * (ds.length - 1);
  ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1); ctx.translate(-total / 2, -h / 2);
  for (const pass of outline ? [o, 0] : [0]) {
    ctx.save(); ctx.fillStyle = pass ? outline : color;
    for (const n of ds) ctx.translate(digit(ctx, n, W, h, t, pass) + gap, 0);
    ctx.restore();
  }
  ctx.restore();
}
// The invented badge: a plain shield with a star.
function badge(ctx, x, y, s, ink, field, star) {
  const sh = k => { ctx.beginPath(); ctx.moveTo(x - 11 * k, y - 10 * k); ctx.lineTo(x + 11 * k, y - 10 * k); ctx.lineTo(x + 11 * k, y + 2 * k); ctx.quadraticCurveTo(x + 9 * k, y + 11 * k, x, y + 14 * k); ctx.quadraticCurveTo(x - 9 * k, y + 11 * k, x - 11 * k, y + 2 * k); ctx.closePath(); ctx.fill(); };
  ctx.fillStyle = lum(hex(field)) > 0.45 ? '#161618' : PALE; sh(s * 1.12); ctx.fillStyle = ink; sh(s); ctx.fillStyle = field; sh(s * 0.8);
  ctx.fillStyle = ink; ctx.fillRect(x - 9 * s, y - 8.2 * s, 18 * s, 2.6 * s);
  ctx.fillStyle = star; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = (i % 2 ? 2.3 : 5.6) * s; ctx.lineTo(x + Math.cos(a) * q * 1.25, y + 2.4 * s + Math.sin(a) * q); }
  ctx.fill();
}

/* ---------- the flat kit ---------- */

// What the kit is cut like, picked from its colors so every kit keeps its own look:
// neck: 0 = a V, 1 = a round collar with a slit. cut: 0 = side panels edged with piping,
// 1 = piping curving from the collar to the armhole, 2 = side panels in the trim color.
function styleOf(k) {
  const h = hash(parseInt(k.shirt.slice(1), 16) & 0xffff, parseInt(k.trim.slice(1), 16) & 0xffff, 11), plain = k.pattern === 'solid' || k.pattern === 'sleeves';
  return { plain, neck: h < 0.5 ? 0 : 1, cut: Math.floor(h * 977) % 3, hoops: Math.floor(h * 131) % 2 };
}
// The collar: how far below the top of the shirt its upper edge sits at x (it scoops at the throat), and how deep the band is.
const BAND = 9;
const scoop = (x, st) => (st.neck ? 13 * gauss(x, 128, 40) : 30 * Math.max(0, 1 - Math.abs(x - 128) / 40));
const CUFF = 10, TURN = 17;                            // rows: the sleeve's cuff, the sock's turnover
// The side panels: half as wide as this at row y, from under the arm to the hem. 0 above them.
const panel = y => (y < 80 ? 0 : 21 - 11 * ((y - 80) / 176) ** 0.7);

function shirtFlat(ctx, k, num, st) {
  const r = R.shirt, Y = y => row(SPAN.shirt, y, r.h), plain = st.plain;
  inRegion(ctx, r, () => {
    ctx.fillStyle = k.shirt; ctx.fillRect(0, 0, r.w, r.h);
    ctx.fillStyle = k.alt;
    if (k.pattern === 'stripes') for (let i = 0; i < 16; i += 2) ctx.fillRect(i * 32 + 16, 0, 32, r.h);
    if (k.pattern === 'hoops') for (let y = 24; y < r.h; y += 44) ctx.fillRect(0, y, r.w, 22);
    if (k.pattern === 'checks') for (let j = 0; j < 8; j++) for (let i = j % 2; i < 16; i += 2) ctx.fillRect(i * 32, j * 32, 32, 32);
    if (k.pattern === 'band') { ctx.fillStyle = k.band; ctx.fillRect(104, 0, 48, r.h); ctx.fillRect(360, 0, 48, r.h); }
    if (k.pattern === 'halves') { ctx.fillRect(128, 0, 128, r.h); ctx.fillRect(256, 0, 128, r.h); }
    const dark = lum(hex(k.shirt)) < 0.4, pipe = inkOn(k.shirt, k.trim);
    if (plain) {
      // a panel down each side from under the arm, in a tone of the shirt or in the trim, edged or not
      for (const x of [0, 256, 512]) {
        ctx.beginPath(); ctx.moveTo(x - panel(80), 80);
        for (let y = 80; y <= 256; y += 8) ctx.lineTo(x - panel(y), y);
        for (let y = 256; y >= 80; y -= 8) ctx.lineTo(x + panel(y), y);
        ctx.closePath();
        ctx.fillStyle = st.cut === 2 ? pipe : shade(k.shirt, dark ? 1.1 : 0.93); ctx.fill();
        if (st.cut === 0) { ctx.strokeStyle = pipe; ctx.lineWidth = 2.2; ctx.stroke(); }
      }
      if (st.cut === 1) {                              // piping from the collar round the front and the back of each shoulder
        ctx.strokeStyle = pipe; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (const cx of [128, 384]) for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + d * 34, BAND + 2); ctx.quadraticCurveTo(cx + d * 62, 40, cx + d * 98, 84); ctx.stroke(); }
      }
    }
    ctx.fillStyle = shade(k.shirt, dark ? 1.25 : 0.8);                                             // shoulder seams
    for (const x of [0, 256, 512]) ctx.fillRect(x - 1, BAND, 2, 22);
    // the collar: a ribbed band, tipped with the second trim color
    const edge = (off) => { const pts = []; for (let x = 0; x <= r.w; x += 4) pts.push([x, scoop(x, st) + off]); return pts; };
    path(ctx, [...edge(0), ...edge(BAND).reverse()]); ctx.fillStyle = k.trim; ctx.fill();
    if (k.trim2 !== k.trim) { path(ctx, [...edge(BAND * 0.42), ...edge(BAND * 0.42 + 2.2).reverse()]); ctx.fillStyle = k.trim2; ctx.fill(); }
    if (st.neck) {                                     // the slit under a round collar, one side lapped over the other
      ctx.fillStyle = shade(k.shirt, dark ? 1.14 : 0.72); ctx.fillRect(127, scoop(128, st) + BAND, 2.4, 17);
      ctx.fillStyle = k.trim; ctx.fillRect(124.6, scoop(128, st) + BAND - 1, 2.4, 17);
    }
    // the badge on his left chest, the wordmark across it
    const field = plain ? k.shirt : PALE, busy = k.pattern === 'stripes' || k.pattern === 'hoops' || k.pattern === 'checks';
    badge(ctx, 174, Y(1.392), 1, inkOn(field, k.trim), field, inkOn(field, k.trim2 === k.trim ? k.trim : k.trim2, 0.15));
    ctx.save(); ctx.translate(128, Y(1.275)); ctx.scale(1.25, 1); ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.font = '900 17px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (busy) { ctx.fillStyle = k.shirt; ctx.fillRect(-46, -11, 92, 22); }                         // a plain panel behind it where the pattern would swallow it
    ctx.fillStyle = plain || busy ? inkOn(k.shirt, k.trim) : lum(hex(k.shirt)) + lum(hex(k.alt)) < 0.9 ? PALE : '#161618'; ctx.fillText('STAR·96', 0, 0);
    ctx.restore();
    if (busy) { ctx.fillStyle = k.shirt; ctx.fillRect(384 - 66, Y(1.445), 132, Y(1.155) - Y(1.445)); }   // and behind the number
    number(ctx, num, 384, Y(1.3), 92, 1.15, k.number, k.outline || (lum(hex(k.number)) > 0.5 ? '#161618' : null));
  });
}
// The throat showing above the collar: skin, painted after the cloth's shading so it doesn't crease.
function neckline(ctx, st, skin) {
  inRegion(ctx, R.shirt, () => {
    for (let x = 128 - 60; x < 128 + 60; x++) {
      const h = scoop(x + 0.5, st);
      if (h < 0.5) continue;
      const g = ctx.createLinearGradient(0, 0, 0, h + 1);
      g.addColorStop(0, css(skin.map((v, i) => v * [0.74, 0.7, 0.68][i]))); g.addColorStop(0.6, css(skin.map((v, i) => v * [0.66, 0.6, 0.57][i]))); g.addColorStop(1, css(skin.map((v, i) => v * [0.46, 0.4, 0.37][i])));
      ctx.fillStyle = g; ctx.fillRect(x, 0, 1, h);
    }
  });
}

function shortsFlat(ctx, k, num, st) {
  const dark = lum(hex(k.shorts)) < 0.4, pipe = inkOn(k.shorts, k.trim), ink = lum(hex(k.shorts)) > 0.5 ? (lum(hex(k.number)) > 0.6 ? pipe : k.number) : PALE;
  inRegion(ctx, R.pelvis, () => {
    const r = R.pelvis;
    ctx.fillStyle = k.shorts; ctx.fillRect(0, 0, r.w, r.h);
    ctx.fillStyle = shade(k.shorts, dark ? 1.2 : 0.88); ctx.fillRect(0, 9, r.w, 1.5);              // the waistband's seam, the drawcord's two ends
    ctx.strokeStyle = PALE; ctx.lineWidth = 1.6;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(64 + d * 2, 5); ctx.quadraticCurveTo(64 + d * 7, 16, 64 + d * 5, 27); ctx.stroke(); }
  });
  for (const [r, out] of [[R.shortsL, 0.75], [R.shortsR, 0.25]]) inRegion(ctx, r, () => {
    const x = out * r.w;
    ctx.fillStyle = k.shorts; ctx.fillRect(0, 0, r.w, r.h);
    if (st.cut === 2) {                                // a wedge of the trim color up the outside
      path(ctx, [[x - 5, 0], [x + 5, 0], [x + 22, r.h], [x - 22, r.h]]); ctx.fillStyle = pipe; ctx.fill();
    } else {                                           // one line of piping, swinging to the front at the hem
      ctx.strokeStyle = pipe; ctx.lineWidth = 3.4;
      const f = r === R.shortsL ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 52); ctx.quadraticCurveTo(x, 84, x + f * 30, r.h); ctx.stroke();
    }
    if (st.cut === 0 && k.trim2 !== k.trim) { ctx.fillStyle = inkOn(k.shorts, k.trim2); ctx.fillRect(0, r.h - 5, r.w, 2); }   // tipping round the hem
    if (r === R.shortsR) number(ctx, num, r.w * 0.5 - 14, row(SPAN.shorts, 0.685, r.h), 26, 0.85, ink, null);
    else badge(ctx, r.w * 0.5 + 16, row(SPAN.shorts, 0.675, r.h), 0.62, pipe, k.shorts, k.trim2 === k.trim ? pipe : inkOn(k.shorts, k.trim2, 0.15));
  });
}

function sleeveFlat(ctx, k, st) {
  const r = R.sleeve, col = k.sleeve || (k.pattern === 'sleeves' ? k.alt : k.shirt);
  inRegion(ctx, r, () => {
    ctx.fillStyle = col; ctx.fillRect(0, 0, r.w, r.h);
    const dark = lum(hex(col)) < 0.4, ink = inkOn(col, k.trim), y = r.h - CUFF;
    if (st.plain && !k.sleeve) {                        // the side panel carries on under the arm
      ctx.fillStyle = st.cut === 2 ? ink : shade(col, dark ? 1.1 : 0.93); ctx.fillRect(0.25 * r.w - 15, 0, 30, r.h);
    }
    if (st.cut === 1) { ctx.fillStyle = ink; ctx.fillRect(0.75 * r.w - 2, 0, 4, r.h); }             // the shoulder's piping runs on down the sleeve
    ctx.fillStyle = ink; ctx.fillRect(0, y, r.w, CUFF);                                             // the cuff
    if (k.trim2 !== k.trim) { ctx.fillStyle = inkOn(ink, k.trim2); ctx.fillRect(0, y + 4, r.w, 2.4); }
  });
}

function sockFlat(ctx, k, st) {
  const r = R.sock;
  inRegion(ctx, r, () => {
    ctx.fillStyle = k.socks; ctx.fillRect(0, 0, r.w, r.h);
    const ink = inkOn(k.socks, k.trim);
    ctx.fillStyle = ink;                                // hoops on the turnover: one broad, or a pair
    if (st.hoops) { ctx.fillRect(0, 4, r.w, 4); ctx.fillRect(0, 11, r.w, 2.5); } else ctx.fillRect(0, 5, r.w, 8);
    if (!st.hoops && k.trim2 !== k.trim) { ctx.fillStyle = inkOn(ink, k.trim2); ctx.fillRect(0, 8, r.w, 2); }
  });
}

// [leather, laces and lining]. Plain leather boots: stitched panels and nothing else on their sides.
const BOOTS = [['#17171a', '#e8e6e0'], ['#e9e7e1', '#17171a'], ['#b0141e', '#f0eee8'], ['#c9a13a', '#17171a']];
function bootFlat(ctx, boots) {
  const r = R.boot, [leather, mark] = BOOTS[boots % BOOTS.length], pale = lum(hex(leather)) > 0.5, seam = shade(leather, pale ? 0.62 : 1.3), stitch = shade(leather, pale ? 0.84 : 1.32);
  inRegion(ctx, r, () => {
    ctx.fillStyle = leather; ctx.fillRect(0, 0, r.w, r.h);
    ctx.fillStyle = '#1b1b1e'; ctx.fillRect(0, 0, 21, r.h); ctx.fillRect(r.w - 21, 0, 21, r.h);              // the sole, its welt
    ctx.fillStyle = '#55555a'; ctx.fillRect(19, 0, 2, r.h); ctx.fillRect(r.w - 21, 0, 2, r.h);
    for (const y of [12, 34, 92, 118, 142]) for (const x of [8, r.w - 8]) {                                   // studs
      ctx.fillStyle = '#0c0c0e'; ctx.beginPath(); ctx.arc(x, y + 1, 5.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#c4c4c0'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#ecece8'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.6, 0, 7); ctx.fill();
    }
    const line = (pts, w, color, dash) => { ctx.setLineDash(dash || []); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); ctx.stroke(); ctx.setLineDash([]); };
    for (const d of [-1, 1]) {
      line([64 + d * 43, 44, 64 + d * 26, 30, 64, 27], 1.6, seam);                                            // the heel counter's seam
      line([64 + d * 43, 47, 64 + d * 26, 33, 64, 30], 1, stitch, [2, 2]);
      line([64 + d * 11, 98, 64 + d * 34, 94, 64 + d * 43, 62], 1.6, seam);                                   // the quarter's seam, from the laces back to the sole
      line([64 + d * 11, 101, 64 + d * 35, 97, 64 + d * 43, 66], 1, stitch, [2, 2]);
    }
    ctx.fillStyle = seam; ctx.fillRect(63, 0, 2, 27);                                                         // the seam up the back of the heel
    for (const v of [124, 132, 140, 148]) line([24, v + 7, 64, v - 9, 104, v + 7], 1, stitch, [2.5, 2]);      // rows of stitching across the toe
    line([24, 121, 64, 105, 104, 121], 1.6, seam);
    ctx.fillStyle = '#0b0b0d'; ctx.beginPath(); ctx.ellipse(64, 56, 27, 25, 0, 0, 7); ctx.fill();             // the opening, its padded edge
    ctx.strokeStyle = shade(leather, pale ? 0.85 : 1.35); ctx.lineWidth = 3; ctx.stroke();
    path(ctx, [[53, 74], [75, 74], [73, 119], [55, 119]]); ctx.fillStyle = shade(leather, pale ? 0.9 : 1.2); ctx.fill();   // the tongue
    ctx.strokeStyle = seam; ctx.lineWidth = 1.4;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(64 + d * 12, 80); ctx.lineTo(64 + d * 9.5, 119); ctx.stroke(); }  // the edges the eyelets sit on
    ctx.strokeStyle = shade(mark, 0.9); ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {                                                                             // laces, crossing eyelet to eyelet
      const y = 84 + i * 5, a = 9.5 - i * 0.4, b = 9.5 - (i + 1) * 0.4;
      ctx.beginPath(); ctx.moveTo(64 - a, y); ctx.lineTo(64 + b, y + 5); ctx.moveTo(64 + a, y); ctx.lineTo(64 - b, y + 5); ctx.stroke();
    }
    ctx.lineWidth = 1.5;                                                                                      // tied in a bow
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(64 + d * 6, 82, 5.5, 2.4, d * 0.4, 0, 7); ctx.stroke(); }
  });
}

// Paints everything but the head and hair. kit: a kit spec from rules/teams.js. skin: [r, g, b].
export function paintKit(ctx, { kit, num, skin, boots = 0 }) {
  const seed = (hash(parseInt(kit.shirt.slice(1), 16) & 0xffff, kit.pattern.length, 3 + (+num || 0)) * 1e6) | 0, st = styleOf(kit);   // every player creases his own way
  shirtFlat(ctx, kit, num, st); shortsFlat(ctx, kit, num, st); sleeveFlat(ctx, kit, st); sockFlat(ctx, kit, st); bootFlat(ctx, boots);
  shirtShade(ctx, R.shirt, SPAN.shirt, seed, {
    mesh: st.plain ? (px, py) => { const hw = panel(py), d = Math.min(px % 256, 256 - px % 256); return hw && d < hw - 1 ? 1 : 0; } : null,
    band: (px, py) => { const t = scoop(px, st); return py >= t && py < t + BAND; },
  });
  neckline(ctx, st, skin);
  sleeveShade(ctx, R.sleeve, seed + 11, CUFF);
  seatShade(ctx, R.pelvis, seed + 12);
  shortsShade(ctx, R.shortsL, seed + 13, 0.25);
  shortsShade(ctx, R.shortsR, seed + 14, 0.75);
  sockShade(ctx, R.sock, SPAN.sock, seed + 15, TURN);
  bootShade(ctx, R.boot, seed + 16);
  limbs(ctx, R, SPAN, skin);
}
export { clamp01 };
