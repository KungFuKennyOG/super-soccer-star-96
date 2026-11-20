// The PS2-look head. Not an egg with bumps: its shape comes from three measured outlines (the face's
// profile, the width seen from the front, the back of the skull), joined round each level, with the
// narrow features (eye sockets, nose, lips, chin) added on top. Ears are their own lumps; hair is a
// separate mesh over the skull whose edge runs past the hairline into ragged see-through tips.
// Positions round the head are (phi, t): phi is the angle from the nose (+ = his left), t runs from the
// crown (0) to under the chin (1), even steps in height. face.js paints in the same coordinates.
import { R } from './kit.js';
import { gauss as g, sstep } from './paint.js';

export const HEAD = { top: 1.85, h: 0.245, cz: 0.02 };
// where things sit down the head (t)
export const F = { hair: 0.24, brow: 0.43, eye: 0.497, tip: 0.642, sub: 0.672, mouth: 0.762, low: 0.79, under: 0.83, chin: 0.91 };
const WARP = 0.75;                                       // the face gets more of the texture than the back of the head
export const uOfPhi = phi => 0.5 + 0.5 * Math.sign(phi) * (Math.abs(phi) / Math.PI) ** WARP;
export const phiOfU = u => { const d = 2 * u - 1; return Math.PI * Math.sign(d) * Math.abs(d) ** (1 / WARP); };
export const tOfY = y => (HEAD.top - y) / HEAD.h;

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
const FRONT = curve([[0, 0], [0.03, 0.042], [0.08, 0.068], [0.15, 0.088], [0.24, 0.1], [0.33, 0.104], [0.43, 0.1055], [0.497, 0.1025], [0.58, 0.102], [0.672, 0.103], [0.762, 0.105], [0.83, 0.099], [0.91, 0.1], [0.965, 0.088], [1, 0.066]]);
const SIDE = curve([[0, 0], [0.03, 0.038], [0.08, 0.06], [0.15, 0.072], [0.24, 0.079], [0.33, 0.082], [0.43, 0.081], [0.5, 0.079], [0.58, 0.078], [0.67, 0.074], [0.76, 0.07], [0.84, 0.064], [0.91, 0.052], [0.965, 0.038], [1, 0.028]]);
const BACK = curve([[0, 0], [0.03, 0.042], [0.08, 0.068], [0.15, 0.088], [0.24, 0.1], [0.35, 0.106], [0.45, 0.104], [0.55, 0.096], [0.65, 0.082], [0.75, 0.068], [0.85, 0.06], [1, 0.054]]);
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;

// A point on the head, `off` metres off the skin.
export function headPoint(phi, t, off = 0) {
  const ap = Math.abs(phi), s = Math.sin(phi), c = Math.cos(phi);
  const n = 2 + 0.38 * sstep(0.3, 0.46, t) * (1 - 0.5 * sstep(0.86, 1, t)), e = 2 / n;      // the face is flatter across than the skull
  let x = SIDE(t) * spow(s, c > 0 ? e : 1), z = c > 0 ? FRONT(t) * spow(c, e) : -BACK(t) * -c;
  let dz = 0, dr = 0;
  dz += 0.002 * g(phi, 0, 0.7) * g(t, F.brow, 0.04);                                      // brow ridge
  dz -= 0.004 * g(ap, 0.36, 0.17) * g(t, F.eye + 0.004, 0.04);                             // eye sockets
  dz += 0.008 * g(phi, 0, 0.085) * g(t, 0.56, 0.045);                                     // bridge of the nose
  dz += 0.019 * g(phi, 0, 0.09) * g(t, F.tip - 0.006, 0.028);                             // its tip
  dz += 0.008 * g(ap, 0.15, 0.06) * g(t, F.tip + 0.01, 0.018);                            // nostril wings
  dz += 0.003 * g(phi, 0, 0.26) * g(t, F.mouth - 0.017, 0.012);                           // upper lip
  dz -= 0.002 * g(phi, 0, 0.3) * g(t, F.mouth, 0.006);
  dz += 0.004 * g(phi, 0, 0.21) * g(t, F.low - 0.004, 0.014);                             // lower lip
  dz -= 0.004 * g(phi, 0, 0.22) * g(t, F.under, 0.018);
  dz += 0.004 * g(phi, 0, 0.3) * g(t, F.chin, 0.04);                                      // chin
  dr += 0.003 * g(ap, 0.75, 0.3) * g(t, 0.58, 0.07);                                     // cheekbones
  dr -= 0.002 * g(ap, 0.85, 0.3) * g(t, 0.72, 0.09);                                      // hollow cheeks
  dr -= 0.003 * g(ap, 1.05, 0.25) * g(t, 0.4, 0.07);                                      // temples
  dr += 0.004 * g(ap, 1.35, 0.3) * g(t, 0.84, 0.06);                                      // the corner of the jaw
  x += s * dr; z += c * dr + dz;
  let y = HEAD.top - t * HEAD.h;
  if (off) { const cy = HEAD.top - 0.45 * HEAD.h, l = Math.hypot(x, y - cy, z) || 1, k = 1 + off / l; x *= k; z *= k; y = cy + (y - cy) * k; }
  return [x, y, z + HEAD.cz];
}

// name, where the hair stops (front, side, back as t), how far it stands off the skull
export const HAIR2 = [
  { name: 'crop', front: 0.2, side: 0.44, back: 0.72, off: 0.007, quiff: 1.2 },
  { name: 'shaved', front: 0.25, side: 0.45, back: 0.7, off: 0, buzz: true },
  { name: 'slick', front: 0.235, side: 0.46, back: 0.75, off: 0.011, quiff: 1.0, swept: true },
  { name: 'ponytail', front: 0.235, side: 0.46, back: 0.72, off: 0.009, quiff: 0.4, swept: true, tail: true },
  { name: 'curls', front: 0.25, side: 0.46, back: 0.72, off: 0.02, curls: 0.006 },
];
export function hairline(st, phi) {
  const f = Math.cos(phi), lim = f > 0 ? st.side + (st.front - st.side) * f ** 1.1 : st.side + (st.back - st.side) * (-f) ** 0.8;
  return lim - 0.05 * g(Math.abs(phi), 0.9, 0.22);       // the temples run back
}

const ROWS = [0, 0.03, 0.08, 0.15, 0.24, 0.33, 0.395, 0.43, 0.465, 0.497, 0.528, 0.565, 0.605, 0.636, 0.652, 0.672, 0.7, 0.735, 0.762, 0.788, 0.83, 0.87, 0.91, 0.955, 1];
export function addHead(b, style) {
  const W = { head: 1 }, r = R.head, cols = 30, start = b.pos.length / 3;
  for (const t of ROWS) for (let i = 0; i <= cols; i++) {
    const u = i / cols;
    b.vert(headPoint(phiOfU(u), t), r.x + r.w * Math.min(0.997, Math.max(0.003, u)), r.y + r.h * Math.min(0.997, Math.max(0.003, t)), W);
  }
  for (let j = 0; j < ROWS.length - 1; j++) for (let i = 0; i < cols; i++) { const a = start + j * (cols + 1) + i, c = a + cols + 1; b.idx.push(a, c, a + 1, a + 1, c, c + 1); }
  b.soft.push([start, b.pos.length / 3]);
  const last = start + (ROWS.length - 1) * (cols + 1), cap = b.vert([0, HEAD.top - HEAD.h * 0.99, HEAD.cz - 0.005], r.x + r.w * 0.5, r.y + r.h * 0.997, W);
  for (let i = 0; i < cols; i++) b.idx.push(cap, last + i + 1, last + i);
  // ears: a lump standing off the skull, swept back, mapped onto the ear painted at the side of the head
  for (const s of [1, -1]) {
    const base = headPoint(s * 1.66, 0.565), uv = p => [r.x + r.w * uOfPhi(s * (1.66 + (base[2] - p[2]) / 0.085)), r.y + r.h * tOfY(p[1])];
    const ring = (dx, dz, ry, rz) => ({ c: [base[0] + s * dx, base[1], base[2] + dz], rx: ry, rz, w: W, v: 0 });
    b.loft([ring(-0.008, 0.006, 0.024, 0.011), ring(0.004, -0.004, 0.03, 0.015), ring(0.009, -0.01, 0.028, 0.013), ring(0.008, -0.012, 0.017, 0.007)], r,
      { seg: 8, ax: [0, s, 0], az: [0, 0, 1], capEnd: true, uv, shape: (a, rg) => [0, 0, -0.006 * Math.sin(a) * s * (rg.rx > 0.02 ? 1 : 0)] });
  }
  // neck
  const N = [[1.66, 0.054, 0.06, 0.004, { head: 0.7, neck: 0.3 }], [1.61, 0.059, 0.064, 0, { neck: 0.7, head: 0.3 }], [1.56, 0.063, 0.066, -0.004, { neck: 1 }], [1.49, 0.076, 0.072, -0.006, { neck: 0.5, chest: 0.5 }]];
  b.loft(N.map(([y, rx, rz, z, w]) => ({ c: [0, y, z], rx, rz, v: (1.66 - y) / 0.17, w })), R.neck, { seg: 12, a0: Math.PI });
  addHair(b, HAIR2[style % HAIR2.length]);
}

function addHair(b, st) {
  if (st.buzz) return;                                       // painted on the scalp only
  const W = { head: 1 }, r = R.hair, cols = 26, rows = 7, start = b.pos.length / 3;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const phi = -Math.PI + i / cols * Math.PI * 2, f = Math.cos(phi), lim = hairline(st, phi), tips = j === rows;
    const t = tips ? lim + 0.02 + 0.03 * Math.max(0, -f) : Math.max(0.002, j / (rows - 1) * lim);
    const lie = 1 - 0.6 * (j / (rows - 1)) ** 3;                                          // lying closer toward the hairline
    let off = tips ? 0.0035 : st.off * lie * (1 + (st.quiff || 0) * Math.max(0, f) * g(t, 0.14, 0.12) + (st.swept ? 0.5 * Math.max(0, -f) * g(t, 0.45, 0.2) : 0));
    if (st.curls && !tips) off += st.curls * Math.sin(phi * 7 + j * 2.1) * Math.sin(j * 1.9 + phi * 3);
    b.vert(headPoint(phi, t, off), r.x + r.w * (0.004 + 0.992 * i / cols), r.y + r.h * (tips ? 0.985 : 0.02 + 0.74 * j / (rows - 1)), W);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = start + j * (cols + 1) + i, c = a + cols + 1; b.idx.push(a, c, a + 1, a + 1, c, c + 1); }
  if (st.tail) {                                             // gathered at the back, then hanging
    const o = headPoint(Math.PI, 0.3, 0.002), up = [0, 1, 0], mid = [0, 0.707, -0.707], dn = [0, 0, -1];
    const T = [[0, 0, 0.022, up], [0.003, -0.022, 0.03, up], [-0.006, -0.046, 0.028, mid], [-0.036, -0.06, 0.022, dn], [-0.08, -0.064, 0.017, dn], [-0.122, -0.058, 0.007, dn]];
    b.loft(T.map(([dy, dz, rad, az], i) => ({ c: [0, o[1] + dy, o[2] + dz], rx: rad, rz: rad, az, v: 0.15 + 0.55 * i / (T.length - 1), w: W })), r, { seg: 8, ax: [-1, 0, 0], capEnd: true });
  }
}
