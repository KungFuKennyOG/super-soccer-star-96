// The PS2-look head. Not an egg with bumps: its shape comes from three measured outlines (the face's
// profile, the width seen from the front, the back of the skull), joined round each level, with the
// narrow features (eye sockets, nose, lips, chin) added on top. Ears are thin cupped plates standing
// off the skull; hair is a separate shell over it (at the end of this file).
// Positions round the head are (phi, t): phi is the angle from the nose (+ = his left), t runs from the
// crown (0) to under the chin (1), even steps in height. face.js paints in the same coordinates.
import { R } from './kit.js';
import { gauss as g, sstep, mix, hash } from './paint.js';

export const HEAD = { top: 1.834, h: 0.25, cz: 0.03, wide: 1.06 };
// where things sit down the head (t)
export const F = { hair: 0.24, brow: 0.43, eye: 0.497, tip: 0.642, sub: 0.672, mouth: 0.762, low: 0.79, under: 0.83, chin: 0.91 };
const WARP = 0.75;                                       // the face gets more of the texture than the back of the head
export const uOfPhi = phi => 0.5 + 0.5 * Math.sign(phi) * (Math.abs(phi) / Math.PI) ** WARP;
export const phiOfU = u => { const d = 2 * u - 1; return Math.PI * Math.sign(d) * Math.abs(d) ** (1 / WARP); };
export const tOfY = y => (HEAD.top - y) / HEAD.h;
// The ears' own picture. It sits on a part of the head's sheet nobody sees (the back of the skull's
// base, inside the neck): u and t ranges of his left ear's, front edge at u0; the right one is mirrored.
export const EAR = { u0: 0.892, u1: 0.992, t0: 0.88, t1: 0.994 };

// a smooth curve through [t, value] points
function curve(pts) {
  return t => {
    let i = 0; while (i < pts.length - 2 && t > pts[i + 1][0]) i++;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const k = Math.max(0, Math.min(1, (t - p1[0]) / (p2[0] - p1[0]))), m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * (p2[0] - p1[0]), m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * (p2[0] - p1[0]);
    const k2 = k * k, k3 = k2 * k;
    return (2 * k3 - 3 * k2 + 1) * p1[1] + (k3 - 2 * k2 + k) * m1 + (-2 * k3 + 3 * k2) * p2[1] + (k3 - k2) * m2;
  };
}
// the face without its nose and lips, the half width at the ears, the back of the skull
const FRONT = curve([[0, 0], [0.03, 0.04], [0.08, 0.064], [0.15, 0.084], [0.24, 0.097], [0.33, 0.103], [0.4, 0.1055], [0.43, 0.106], [0.497, 0.103], [0.58, 0.103], [0.672, 0.105], [0.762, 0.106], [0.83, 0.103], [0.9, 0.103], [0.945, 0.098], [0.975, 0.084], [1, 0.06]]);
const SIDE = curve([[0, 0], [0.03, 0.037], [0.08, 0.058], [0.15, 0.07], [0.24, 0.0765], [0.33, 0.079], [0.43, 0.078], [0.5, 0.075], [0.58, 0.0728], [0.67, 0.0685], [0.76, 0.063], [0.84, 0.0565], [0.9, 0.0475], [0.95, 0.039], [0.98, 0.031], [1, 0.024]]);
const BACK = curve([[0, 0], [0.03, 0.042], [0.08, 0.068], [0.15, 0.088], [0.24, 0.101], [0.35, 0.107], [0.45, 0.105], [0.55, 0.097], [0.65, 0.083], [0.75, 0.069], [0.85, 0.06], [1, 0.054]]);
// how far the nose stands off the face, from between the eyes to where it meets the lip
const NOSE = curve([[0.455, 0], [0.5, 0.002], [0.55, 0.007], [0.6, 0.014], [0.636, 0.0215], [0.652, 0.019], [0.672, 0.007], [0.7, 0.0012], [0.72, 0]]);
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;

// A point on the head, `off` metres off the skin.
export function headPoint(phi, t, off = 0) {
  const ap = Math.abs(phi), s = Math.sin(phi), c = Math.cos(phi);
  // the forehead is broad and flat across, the cheeks fall away from the nose, the chin is square again
  const n = 2 + 0.28 * sstep(0.18, 0.36, t) - 0.2 * sstep(0.5, 0.74, t) + 0.12 * sstep(0.82, 0.93, t), e = 2 / n;
  let x = HEAD.wide * SIDE(t) * spow(s, c > 0 ? e : 1), z = c > 0 ? FRONT(t) * spow(c, e) : -BACK(t) * -c;
  let dz = 0, dr = 0;
  // Features that run right across the face are kept gentle: under the top light a broad ledge shades
  // as a dark band from ear to ear. The paint carries those; the narrow ones are sculpted.
  dz += 0.0022 * g(phi, 0, 0.7) * g(t, F.brow - 0.004, 0.035);                             // brow ridge
  dz -= 0.002 * g(phi, 0, 0.12) * g(t, 0.475, 0.024);                                     // the dip between the eyes
  dz -= 0.0048 * g(ap, 0.37, 0.17) * g(t, F.eye + 0.003, 0.036);                           // eye sockets
  if (t > 0.455 && t < 0.72) dz += NOSE(t) * g(phi, 0, 0.06 + 0.035 * sstep(0.5, 0.64, t));   // the nose: a narrow bridge widening to the tip
  dz += 0.0068 * g(ap, 0.16, 0.05) * g(t, F.tip + 0.01, 0.016);                           // nostril wings
  dz += 0.002 * g(phi, 0, 0.45) * g(t, 0.75, 0.07);                                       // the teeth behind the lips
  dz += 0.0036 * g(phi, 0, 0.24) * g(t, F.mouth - 0.02, 0.015);                           // upper lip
  dz -= 0.0016 * g(phi, 0, 0.3) * g(t, F.mouth, 0.006);
  dz += 0.004 * g(phi, 0, 0.2) * g(t, F.low - 0.004, 0.014);                              // lower lip
  dz -= 0.004 * g(phi, 0, 0.21) * g(t, F.under, 0.02);
  dz += 0.005 * g(phi, 0, 0.25) * g(t, F.chin - 0.015, 0.04);                             // chin
  dr += 0.004 * g(ap, 0.72, 0.28) * g(t, 0.575, 0.06);                                    // cheekbones
  dr -= 0.003 * g(ap, 0.85, 0.28) * g(t, 0.73, 0.08);                                     // hollow cheeks
  dr -= 0.003 * g(ap, 1.05, 0.25) * g(t, 0.4, 0.07);                                      // temples
  dr += 0.004 * g(ap, 1.35, 0.28) * g(t, 0.84, 0.05);                                     // the corner of the jaw
  x += s * dr; z += c * dr + dz;
  let y = HEAD.top - t * HEAD.h;
  if (off) { const cy = HEAD.top - 0.45 * HEAD.h, l = Math.hypot(x, y - cy, z) || 1, k = 1 + off / l; x *= k; z *= k; y = cy + (y - cy) * k; }
  return [x, y, z + HEAD.cz];
}

// The hairstyles. front, side, back: where the hair stops (t) on the forehead, over the ear and at the
// nape; recede: how far the corners of the forehead run back; burn: where the sideburn ends.
// top, sides, nape: how far the hair stands off the skull there (metres); quiff: extra lift over the
// forehead; wall, taper: how much of the way from crown to hairline it takes to come down to the skin
// at the front and elsewhere (a short wall stands up, a long taper is a fade).
// pole: the height (radians above level, behind him) of the point the strands run to or from;
// fade: how far up from the hairline the sides and nape are clipped short enough to see skin (t).
// choppy: short tufts instead of long strands; swept: combed back, glossy; buzz: no shell, paint only;
// flick: ends standing off the neck; tail: a ponytail; curls: how lumpy the outline is (metres).
export const HAIR2 = [
  { name: 'crop', front: 0.222, side: 0.455, back: 0.735, recede: 0.018, burn: 0.585, top: 0.0105, sides: 0.0045, nape: 0.004, quiff: 0.006, wall: 0.1, taper: 0.34, pole: 1.05, fade: 0.085, choppy: 1 },
  { name: 'shaved', front: 0.232, side: 0.45, back: 0.71, recede: 0.03, burn: 0.53, pole: 1.05, fade: 0.1, buzz: true },
  { name: 'slick', front: 0.212, side: 0.46, back: 0.775, recede: 0.036, burn: 0.6, top: 0.0125, sides: 0.0055, nape: 0.011, quiff: 0.008, wall: 0.085, taper: 0.2, pole: -0.6, fade: 0.025, swept: true, flick: true },
  { name: 'ponytail', front: 0.226, side: 0.46, back: 0.75, recede: 0.03, burn: 0.565, top: 0.0055, sides: 0.004, nape: 0.005, quiff: 0.002, wall: 0.12, taper: 0.2, pole: 0.35, fade: 0.02, swept: true, tail: true },
  { name: 'curls', front: 0.238, side: 0.455, back: 0.725, recede: 0.022, burn: 0.57, top: 0.019, sides: 0.014, nape: 0.014, quiff: 0.002, wall: 0.1, taper: 0.13, pole: 1.05, fade: 0.03, curls: 0.006 },
];
// Where the hair stops at this angle: level across the forehead with the corners running back, down
// the temple to the top of the ear, then down behind the ear to the nape. (Sideburns are painted on.)
export function hairline(st, phi) {
  const ap = Math.abs(phi);
  let lim = st.front + 0.003 * g(ap, 0, 0.16) - st.recede * g(ap, 0.66, 0.22);
  lim += (st.side - lim) * sstep(0.74, 1.25, ap) ** 0.85;
  lim += (st.back - lim) * sstep(1.85, 2.4, ap);
  return lim - 0.012 * g(ap, Math.PI, 0.35);                // the nape rises a little in the middle
}

const ROWS = [0, 0.035, 0.09, 0.16, 0.24, 0.32, 0.385, 0.43, 0.468, 0.5, 0.532, 0.57, 0.606, 0.636, 0.652, 0.672, 0.703, 0.742, 0.762, 0.786, 0.83, 0.875, 0.915, 0.95, 0.98, 1];
// columns sit where the features are: the nose's ridge and wings, the corners and middle of the eye and mouth
const HALF = [0, 0.075, 0.155, 0.25, 0.37, 0.52, 0.7, 0.9, 1.1, 1.3, 1.5, 1.72, 1.98, 2.28, 2.6, 2.9];
const COLS = [-Math.PI, ...HALF.slice(1).map(p => -p).reverse(), ...HALF, Math.PI];
const clampUV = v => Math.min(0.997, Math.max(0.003, v));

// The neck is built with the head, so it wears the head's sheet: R.neck's rectangle of it, which falls on
// the underside of his left jaw. That piece of the head takes its colors from the right jaw instead
// (mirrored), and face.js paints the rectangle as a neck.
const MIR = { j: ROWS.indexOf(0.83), a: COLS.indexOf(0.7), b: COLS.indexOf(1.72) };
export function addHead(b, style) {
  const W = { head: 1 }, r = R.head, n = COLS.length, start = b.pos.length / 3;
  const put = (phi, t, u) => b.vert(headPoint(phi, t), r.x + r.w * clampUV(u), r.y + r.h * clampUV(t), W);
  for (const t of ROWS) COLS.forEach((phi, i) => put(phi, t, i === 0 ? 0 : i === n - 1 ? 1 : uOfPhi(phi)));
  for (let j = 0; j < ROWS.length - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = start + j * n + i, c = a + n;
    if (j >= MIR.j && i >= MIR.a && i < MIR.b) continue;
    if (j > 0) b.idx.push(a, c, a + 1);                      // (the crown's row is a single point)
    b.idx.push(a + 1, c, c + 1);
  }
  const m0 = b.pos.length / 3, mn = MIR.b - MIR.a + 1;
  for (let j = MIR.j; j < ROWS.length; j++) for (let i = MIR.a; i <= MIR.b; i++) put(COLS[i], ROWS[j], 1 - uOfPhi(COLS[i]));
  for (let j = 0; j < ROWS.length - 1 - MIR.j; j++) for (let i = 0; i < mn - 1; i++) { const a = m0 + j * mn + i, c = a + mn; b.idx.push(a, c, a + 1, a + 1, c, c + 1); }
  const last = start + (ROWS.length - 1) * n, cap = b.vert([0, HEAD.top - HEAD.h * 0.99, HEAD.cz - 0.005], r.x + r.w * 0.5, r.y + r.h * 0.86, W);
  for (let i = 0; i < n - 1; i++) b.idx.push(cap, last + i + 1, last + i);
  b.soft.push([start, b.pos.length / 3]);
  for (const s of [1, -1]) addEar(b, s);
  // neck (on R.neck's rectangle of the head's sheet, see above): short and thick, carried a little forward, widening into the trapezius
  const N = [[1.65, 0.058, 0.064, 0.018, { head: 0.7, neck: 0.3 }], [1.605, 0.064, 0.068, 0.014, { neck: 0.7, head: 0.3 }], [1.56, 0.069, 0.071, 0.008, { neck: 1 }], [1.5, 0.086, 0.076, 0, { neck: 0.5, chest: 0.5 }]];
  b.loft(N.map(([y, rx, rz, z, w]) => ({ c: [0, y, z], rx, rz, v: (1.65 - y) / 0.15, w })), R.neck, { seg: 12, a0: Math.PI,
    shape: (a, r) => { const d = 0.004 * g(Math.abs(Math.atan2(Math.sin(a), Math.cos(a))), 0.75, 0.3) * g(r.c[1], 1.58, 0.05); return [Math.sin(a) * d, 0, Math.cos(a) * d]; } });   // the cords either side of the throat
  addHair(b, HAIR2[style % HAIR2.length]);
}

// An ear: a thin plate joined to the head along its front edge and standing further off the skull
// toward the rim, a little cupped, leaning back. The outside shows the ear's own picture (EAR); the
// back of it is plain skin from behind the ear. Both faces meet along the rim.
// Front to rim: [how far back, how far off the skull, height above the middle, below it]
const EARC = [[0, -0.003, 0.021, 0.024], [0.01, 0.0045, 0.031, 0.031], [0.023, 0.0095, 0.034, 0.027], [0.033, 0.012, 0.024, 0.013]];
const EARV = [-1, -0.55, 0, 0.55, 1];
function addEar(b, s) {
  const W = { head: 1 }, r = R.head, base = headPoint(s * 1.5, 0.557), nx = 0.89 * s, nz = 0.45, K = EARC.length, J = EARV.length;
  const grid = inner => {
    const start = b.pos.length / 3;
    EARC.forEach(([back, out, up, down], k) => EARV.forEach((v, j) => {
      const edge = k === 0 || k === K - 1 || j === 0 || j === J - 1, y = (v < 0 ? -v * up : -v * down) * (edge ? 1 : 0.96);
      const bk = back + (k === K - 1 ? 0.0035 * (1 - v * v) : 0) + 0.09 * y;                      // the rim bows out behind; the top leans back
      const d = (edge ? 0 : inner ? -0.004 : k === 1 ? -0.0035 * (1 - v * v) : 0);               // the bowl of the ear; the back face lies behind the front
      const p = [base[0] + s * out + nx * d, base[1] + y, base[2] - bk + nz * d];
      const u = inner ? uOfPhi(s * (2.0 + 0.1 * k / K)) : EAR.u0 + (EAR.u1 - EAR.u0) * (0.04 + 0.92 * back / 0.033);
      const t = inner ? 0.58 + 0.03 * v : EAR.t0 + (EAR.t1 - EAR.t0) * (0.03 + 0.94 * (0.036 - y) / 0.07);
      b.vert(p, r.x + r.w * (inner || s > 0 ? u : 1 - u), r.y + r.h * t, W);
    }));
    for (let k = 0; k < K - 1; k++) for (let j = 0; j < J - 1; j++) {
      const a = start + k * J + j, c = a + 1, d = a + J;
      if ((s > 0) !== inner) b.idx.push(a, c, d, d, c, d + 1); else b.idx.push(a, d, c, d, d + 1, c);
    }
    return start;
  };
  const from = grid(false); grid(true);
  b.soft.push([from, b.pos.length / 3]);
}

// ---- hair ----
// Longer hair is a shell standing off the skull. It wears the same part of the sheet as the scalp under
// it (face.js paints the hair there: the hairline's ragged edge, the sideburns, the clipped sides and
// nape, every strand), so the two can never disagree: where the shell comes down to the skin there is
// nothing to see but the painted roots carrying on. A shaved head is only the paint.
// Pieces that hang free (slicked hair flicking out at the nape, a ponytail) are cards and tubes wearing
// the strand sheet (R.hair), cut to ragged tips by alpha.
const HHALF = [0, 0.2, 0.42, 0.66, 0.88, 1.08, 1.3, 1.55, 1.85, 2.15, 2.5, 2.85];
const AROUND = [-Math.PI, ...HHALF.slice(1).map(p => -p).reverse(), ...HHALF, Math.PI];
const DOWN = [0.07, 0.14, 0.23, 0.32, 0.41, 0.5, 0.6, 0.7, 0.81, 0.92, 1];       // crown to edge
const SKIN = 0.0012;                                        // the shell's edge lies this far off the skin
// Where the shell ends (t): a little inside the hairline, above where the sides and nape are clipped short,
// so its edge is always hair lying on painted hair and the ragged ends and the fade are the scalp's own.
const edgeT = (st, phi) => hairline(st, phi) - 0.024 - st.fade * (1 - Math.max(0, Math.cos(phi)) ** 1.5);

// How far the hair stands off the skull at (phi, t). s: 0 at the crown, 1 at the shell's edge.
function lift(st, phi, t, s) {
  const f = Math.cos(phi), fr = Math.max(0, f), bk = Math.max(0, -f);
  const d = mix(st.top, mix(st.sides, st.nape, bk ** 1.5), sstep(0.14, 0.42, t)) + st.quiff * fr ** 1.5 * g(t, 0.12, 0.1);
  return SKIN + d * sstep(0, mix(st.taper, st.wall, fr ** 1.5), 1 - s) ** 0.7;
}

function addHair(b, st) {
  if (st.buzz) return;                                       // painted on the scalp only
  const W = { head: 1 }, r = R.head, n = AROUND.length, start = b.pos.length / 3;
  const put = (phi, i, s, j) => {
    const t = s * edgeT(st, phi);
    let off = lift(st, phi, t, s);
    if (st.curls && j > 2 && s < 1) off += st.curls * (2 * hash(i % (n - 1), j, 7) - 1);   // a lumpy outline
    b.vert(headPoint(phi, t, off), r.x + r.w * Math.min(0.997, Math.max(0.003, i === 0 ? 0 : i === n - 1 ? 1 : uOfPhi(phi))), r.y + r.h * Math.max(0.003, t), W);
  };
  AROUND.forEach((phi, i) => put(phi, i, 0, 0));
  DOWN.forEach((s, j) => AROUND.forEach((phi, i) => put(phi, i, s, j + 1)));
  for (let j = 0; j < DOWN.length; j++) for (let i = 0; i < n - 1; i++) {
    const a = start + j * n + i, c = a + n;
    if (j > 0) b.idx.push(a, c, a + 1);
    b.idx.push(a + 1, c, c + 1);
  }
  const at = (phi, k, up) => { const e = edgeT(st, phi), t = e * k; return headPoint(phi, t, lift(st, phi, t, k) + up); };
  if (st.flick) {                                            // slicked hair ends in a fringe standing off the neck
    const P = [1.95, 2.25, 2.55, 2.85, Math.PI, -2.85, -2.55, -2.25, -1.95];
    card(b, P.map(p => at(p, 0.93, -0.002)), P.map((p, i) => { const k = sstep(1.9, 2.4, Math.abs(p)); return headPoint(p, edgeT(st, p) + 0.012 + 0.04 * k, 0.004 + (0.006 + 0.006 * hash(i, 2, 5)) * k); }), 0.45, 0.98);
  }
  if (st.tail) {                                             // gathered at the back in a band, then hanging
    const o = at(Math.PI, 0.3 / edgeT(st, Math.PI), 0), up = [0, 1, 0], mid = [0, 0.707, -0.707], dn = [0, 0, -1];
    const T = [[0.002, 0.006, 0.01, 0.01, up, 0.03], [0.001, -0.009, 0.0105, 0.0105, up, 0.14], [-0.004, -0.024, 0.018, 0.016, mid, 0.3], [-0.03, -0.04, 0.021, 0.015, dn, 0.5], [-0.072, -0.043, 0.018, 0.011, dn, 0.74], [-0.118, -0.036, 0.012, 0.006, dn, 0.985]];
    b.loft(T.map(([dy, dz, rx, rz, az, v]) => ({ c: [0, o[1] + dy, o[2] + dz], rx, rz, az, v, w: W })), R.hair, { seg: 8, ax: [-1, 0, 0] });
  }
}
// A strip of hair between a row of roots and a row of tips, wearing the strand sheet from u0 to u1.
// The material is one-sided, so it has a second face a hair's breadth behind the first.
function card(b, roots, tips, u0, u1) {
  const W = { head: 1 }, r = R.hair, n = roots.length;
  for (const back of [0, 1]) {
    const start = b.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const u = r.x + r.w * (u0 + (u1 - u0) * i / (n - 1)), a = roots[Math.max(0, i - 1)], c = roots[Math.min(n - 1, i + 1)], p = roots[i], q = tips[i];
      const e = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], f = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const nx = e[1] * f[2] - e[2] * f[1], ny = e[2] * f[0] - e[0] * f[2], nz = e[0] * f[1] - e[1] * f[0], k = back * 0.0012 / (Math.hypot(nx, ny, nz) || 1);
      b.vert([p[0] + nx * k, p[1] + ny * k, p[2] + nz * k], u, r.y + r.h * 0.28, W);
      b.vert([q[0] + nx * k, q[1] + ny * k, q[2] + nz * k], u, r.y + r.h * 0.985, W);
    }
    for (let i = 0; i < n - 1; i++) { const a = start + i * 2; if (back) b.idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); else b.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
}
