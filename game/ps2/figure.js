// The PS2-look body, on the game's skeleton: a footballer of 2003 in a baggy kit. What makes it read as a
// man and not a box with tubes on:
// - the shoulders slope from the neck to their points (the trapezius), and the top of the chest and back
//   fall away toward the neck: the trunk is never as deep at the collar as at the chest;
// - the trunk tapers from the chest to the waist, where the shirt is tucked in and blouses over the
//   waistband; long shorts run from the waist to just above the knee, no wider than the hips;
// - the sleeve is part of the shoulder's line: it comes over the point of the shoulder and hangs wide
//   and open to just above the elbow;
// - the shorts are one garment: square across the front and the seat down to the crotch, two legs below.
// Every cross-section has its own front, back, inner and outer radius; muscles are laid on top.
// Legs, arms and hands are in limbs.js; the head, neck and hair in headgeo.js.
import { R, SPAN, HEAD_SHEET } from './kit.js';
import { Builder, vOf, bumps, out, neckW } from './build.js';
import { addHead } from './headgeo.js';
import { sstep, gauss } from './paint.js';
import { leg, arm } from './limbs.js';

const cache = new Map();
export function figureGeometry(style = 0) {
  if (cache.has(style)) return cache.get(style);
  const b = new Builder();
  torso(b);
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) { shorts(b, s, n); leg(b, s, n); arm(b, s, n); }
  b.part(HEAD_SHEET);                                   // the head and hair: second material, their own sheet
  addHead(b, style);
  const g = b.geometry();
  cache.set(style, g);
  return g;
}

// Which bones a point of the trunk follows.
const trunk = p => {
  const y = p[1], x = Math.abs(p[0]), cl = p[0] > 0 ? 'clavicleL' : 'clavicleR';
  const side = sstep(0.07, 0.19, x) * sstep(1.4, 1.49, y) * 0.5, nk = neckW(y) * sstep(0.15, 0.1, x);
  const ch = sstep(1.1, 1.3, y), sp = sstep(0.96, 1.1, y);
  return { neck: nk, [cl]: side * (1 - nk), chest: ch * (1 - nk) * (1 - side), spine: (1 - ch) * sp, hips: (1 - ch) * (1 - sp) };
};

function torso(b) {
  // The shirt: [height at the sides, half width, depth in front, behind, squareness, tilt, centre z].
  // The collar lies on the base of the neck, lower at the throat than at the nape (tilt), and the next
  // rings level out as they widen along the shoulders: from the collar to the point of the shoulder is a
  // slope of about 30 degrees, not a shelf. Below the chest the cloth hangs straighter than the body
  // (off the pectorals in front, off the shoulder blades behind) and is gathered into the shorts.
  const S = [
    [1.563, 0.087, 0.071, 0.073, 2, 0.21, -0.003], [1.553, 0.104, 0.08, 0.081, 2, 0.19, -0.003],        // the collar's band
    [1.528, 0.15, 0.088, 0.087, 2, 0.12, 0], [1.503, 0.192, 0.096, 0.095, 2.05, 0.05, 0.002],           // along the shoulder to its point
    [1.472, 0.205, 0.106, 0.106, 2.15, 0, 0.004], [1.435, 0.2, 0.12, 0.118, 2.3, 0, 0.004],
    [1.385, 0.19, 0.134, 0.123, 2.4, 0, 0.004], [1.33, 0.181, 0.137, 0.121, 2.4, 0, 0.004],             // the chest
    [1.27, 0.173, 0.133, 0.114, 2.35, 0, 0.004], [1.2, 0.165, 0.126, 0.105, 2.3, 0, 0.004],
    [1.1, 0.158, 0.118, 0.097, 2.25, 0, 0.004],                                                         // the waist
    [1.042, 0.161, 0.121, 0.102, 2.25, 0, 0.004], [1.016, 0.158, 0.117, 0.1, 2.25, 0, 0.004],           // bloused over the waistband
    [1.002, 0.144, 0.102, 0.088, 2.25, 0, 0.004],                                                       // and tucked in
  ];
  const form = bumps([
    { a: 0.5, aw: 0.55, y: 1.375, yw: 0.08, d: 0.007 }, { a: -0.5, aw: 0.55, y: 1.375, yw: 0.08, d: 0.007 },      // pectorals
    { a: 0, aw: 0.16, y: 1.39, yw: 0.09, d: -0.004 },                                                             // the groove between them
    { a: 2.55, aw: 0.5, y: 1.41, yw: 0.08, d: 0.008 }, { a: -2.55, aw: 0.5, y: 1.41, yw: 0.08, d: 0.008 },        // shoulder blades
    { a: 1.95, aw: 0.45, y: 1.31, yw: 0.09, d: 0.005 }, { a: -1.95, aw: 0.45, y: 1.31, yw: 0.09, d: 0.005 },      // lats
    { a: Math.PI, aw: 0.28, y: 1.24, yw: 0.26, d: -0.006 },                                                       // the spine
  ]);
  // the blouse: where the cloth is gathered it stands off in a few soft, uneven rolls (outward only)
  const blouse = (a, y) => 0.005 * gauss(y, 1.04, 0.03) * (0.5 + 0.5 * Math.sin(a * 3 + 0.9) + 0.35 * Math.sin(a * 5 + 2.1));
  b.loft(S.map(([y, rx, f, bk, n, tilt, z], i) => ({ c: [0, y, z], rx, rz: [f, bk], n, az: [0, -Math.sin(tilt), Math.cos(tilt)],
    v: i === 0 ? 0 : i === 1 ? 0.035 : Math.max(0.05, vOf(SPAN.shirt, y)), w: trunk })), R.shirt, {
    seg: 32, a0: -Math.PI / 2, shape: (a, r) => out(a, form(a, r) + Math.max(0, blouse(a, r.c[1]))) });
}

// The shorts. Each side is a ring of its own, square on the inside where the two meet (so from the
// waist to the crotch they make one flat front and one seat) and rounding into a leg of its own below.
// [height, the whole garment's half width, front, back, the ring's centre out from the middle, how
// square its inner half is, the gap from the middle to its inner side]
const SH = [
  [1.022, 0.151, 0.108, 0.094, 0.05, 16, -0.003], [0.985, 0.157, 0.112, 0.101, 0.054, 16, -0.003],                  // the waistband
  [0.94, 0.166, 0.114, 0.114, 0.06, 16, -0.003], [0.895, 0.175, 0.114, 0.126, 0.069, 14, -0.003],                    // the hips, the seat
  [0.85, 0.181, 0.114, 0.13, 0.079, 9, -0.003], [0.8, 0.185, 0.114, 0.126, 0.089, 4.5, -0.001],                      // the crotch
  [0.74, 0.187, 0.114, 0.118, 0.094, 2.8, 0.005], [0.67, 0.188, 0.114, 0.111, 0.096, 2.3, 0.009], [0.6, 0.19, 0.113, 0.106, 0.097, 2.2, 0.011],
];
// The legs' sheet is painted for shorts that showed only below a hanging shirt: its top third is in the
// shirt's shadow. So the band wears the seat's rows (elastic, drawcord), and each leg's sheet starts under
// it a third of the way down, runs thin as far as the crotch, and is true to scale (SPAN.shorts) from
// there to the hem, where the number and the badge are.
const BAND = 0.985, legV = y => Math.max(vOf(SPAN.shorts, y), 0.37 + 0.27 * (BAND - y) / (BAND - 0.74));
function shorts(b, s, n) {
  const up = 'upperLeg' + n, io = (o, i) => (s > 0 ? [o, i] : [i, o]);
  // The leg takes the cloth with it from the hip down; the middle of the front and the seat stay with
  // the hips down to the crotch, so the two sides never part.
  const w = p => {
    const k = sstep(0.99, 0.79, p[1]) * (1 - sstep(0.77, 0.83, p[1]) * sstep(0.06, 0.005, s * p[0]));
    return { hips: 1 - k, [up]: k };
  };
  // a few soft folds hanging to the hem, deeper toward it (outward only)
  const hang = (a, r) => (r.lip ? null : out(a, 0.006 * sstep(0.84, 0.6, r.c[1]) * Math.max(0, 0.45 + 0.55 * Math.sin(a * 3 + 2 + s) + 0.3 * Math.sin(a * 2 + 0.7 * s))));
  const ring = ([y, hw, f, bk, cx, sq, gap]) => ({ c: [s * cx, y, 0.004], rx: io(hw - cx, cx - gap), rz: [f, bk], n: io(2.3, sq), w });
  // the band: round the whole waist the seat's sheet runs from the middle of his back (0) by his left (0.75)
  const pv = R.pelvis, band = (p, f, r) => [pv.x + pv.w * (0.5 + s * Math.atan2(Math.max(0, s * p[0]), p[2] - 0.004) / (2 * Math.PI)), pv.y + pv.h * Math.max(0.01, vOf(SPAN.pelvis, r.c[1]))];
  b.loft(SH.slice(0, 2).map(ring), pv, { seg: 18, a0: Math.PI, uv: band });
  const legs = SH.slice(1).map(r => ({ ...ring(r), v: legV(r[0]) }));
  legs.push({ c: [s * 0.09, 0.632, 0.017], rx: io(0.08, 0.076), rz: [0.089, 0.081], w, v: 0.995, lip: true });   // the hem, turned up inside to the thigh
  b.loft(legs, s > 0 ? R.shortsL : R.shortsR, { seg: 18, a0: Math.PI, shape: hang });
}
