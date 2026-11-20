// The PS2-look head: a skull with the face sculpted in, separate ears, a neck, and hair as its own
// mesh over the skull (a shaped cap with painted strands; a tail for the ponytail). Positions round
// the head are (phi, t): phi is the angle from the nose (+ = his left), t runs crown (0) to chin (1).
// face.js paints the texture in the same coordinates, so paint and sculpt line up.
import { R } from './kit.js';
import { gauss as g, sstep } from './paint.js';

export const HEAD = { cy: 1.715, cz: 0.024, rx: 0.08, ry: 0.127, rz: 0.104 };
const WARP = 0.75;                                       // the face gets more of the texture than the back of the head
export const uOfPhi = phi => 0.5 + 0.5 * Math.sign(phi) * (Math.abs(phi) / Math.PI) ** WARP;
export const phiOfU = u => { const d = 2 * u - 1; return Math.PI * Math.sign(d) * Math.abs(d) ** (1 / WARP); };
export const tOfY = y => Math.acos(Math.max(-1, Math.min(1, (y - HEAD.cy) / HEAD.ry))) / Math.PI;

// name, where the hair stops (front, side, back as t), how far it stands off the skull
export const HAIR2 = [
  { name: 'crop', front: 0.3, side: 0.43, back: 0.64, off: 0.01, quiff: 0.5 },
  { name: 'shaved', front: 0.3, side: 0.43, back: 0.63, off: 0, buzz: true },
  { name: 'slick', front: 0.285, side: 0.43, back: 0.67, off: 0.012, quiff: 0.9, swept: true },
  { name: 'ponytail', front: 0.285, side: 0.43, back: 0.66, off: 0.01, quiff: 0.3, swept: true, tail: true },
  { name: 'curls', front: 0.28, side: 0.42, back: 0.64, off: 0.024, curls: 0.007 },
];
export function hairline(st, phi) {
  const f = Math.cos(phi), lim = f > 0 ? st.side + (st.front - st.side) * f ** 1.3 : st.side + (st.back - st.side) * -f;
  return lim - 0.02 * g(Math.abs(phi), 0.78, 0.2);      // the temples run back a little
}

function sculpt(phi, t) {
  const ap = Math.abs(phi);
  let out = 0;
  out += 0.005 * g(ap, 0.6, 0.4) * g(t, 0.58, 0.22);           // a broad, flat front to the face
  out += 0.007 * g(phi, 0, 0.75) * g(t, 0.425, 0.04);          // brow ridge
  out += 0.004 * g(phi, 0, 0.5) * g(t, 0.33, 0.08);            // forehead
  out -= 0.008 * g(ap, 0.37, 0.16) * g(t, 0.485, 0.032);       // eye sockets
  out += 0.007 * g(phi, 0, 0.1) * g(t, 0.5, 0.04);             // bridge of the nose
  out += 0.02 * g(phi, 0, 0.115) * g(t, 0.592, 0.038);         // nose
  out += 0.007 * g(ap, 0.14, 0.065) * g(t, 0.61, 0.02);        // nostril wings
  out += 0.005 * g(phi, 0, 0.42) * g(t, 0.69, 0.05);           // muzzle
  out += 0.0028 * g(phi, 0, 0.26) * g(t, 0.683, 0.013);        // upper lip
  out += 0.0035 * g(phi, 0, 0.22) * g(t, 0.716, 0.015);        // lower lip
  out -= 0.004 * g(phi, 0, 0.24) * g(t, 0.752, 0.018);         // under the lip
  out += 0.005 * g(ap, 0.72, 0.24) * g(t, 0.55, 0.05);         // cheekbones
  out -= 0.004 * g(ap, 0.8, 0.25) * g(t, 0.68, 0.07);          // hollow cheeks
  out += 0.011 * g(ap, 1.3, 0.4) * g(t, 0.8, 0.08);            // jaw corners
  out -= 0.003 * g(ap, 1.1, 0.25) * g(t, 0.38, 0.08);          // temples
  out += 0.004 * g(ap, 1.57, 0.5) * g(t, 0.32, 0.12);          // the skull is widest above the ears
  out += 0.008 * g(ap, Math.PI, 0.8) * g(t, 0.47, 0.14);       // back of the skull
  return out;
}
// A point on the head, `off` metres off the skin.
export function headPoint(phi, t, off = 0) {
  const st = Math.sin(t * Math.PI), k = Math.min(1, st * 3), out = sculpt(phi, t) * k + off;
  // the face doesn't fall away like an egg: from the eyes down to the chin it stays near one plane
  const want = t < 0.5 ? 0 : t < 0.87 ? HEAD.rz - 0.012 * (t - 0.5) / 0.37 : (HEAD.rz - 0.012) * (1 - sstep(0.87, 1.0, t) * 0.75);
  const face = Math.max(0, want - st * HEAD.rz) * g(phi, 0, 0.62);
  const jaw = Math.max(0, 0.055 * (1 - sstep(0.8, 1, t)) - st * HEAD.rx) * sstep(0.62, 0.8, t) * g(Math.abs(phi), 1.2, 0.7);   // and the jaw keeps its width
  const y = Math.max(HEAD.cy + Math.cos(t * Math.PI) * (HEAD.ry + off), HEAD.cy - 0.905 * HEAD.ry - 0.012 * (t - 0.85));   // a flat underside to the jaw, not a point
  return [Math.sin(phi) * (st * HEAD.rx + out + jaw), y, HEAD.cz + Math.cos(phi) * (st * HEAD.rz + out + face)];
}

export function addHead(b, style) {
  const W = { head: 1 }, r = R.head, cols = 28, rows = 22, start = b.pos.length / 3;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = i / cols, t = j / rows;
    b.vert(headPoint(phiOfU(u), t), r.x + r.w * Math.min(0.997, Math.max(0.003, u)), r.y + r.h * Math.min(0.997, Math.max(0.003, t)), W);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = start + j * (cols + 1) + i, c = a + cols + 1; b.idx.push(a, c, a + 1, a + 1, c, c + 1); }
  // ears: a lump standing off the skull, swept back, mapped onto the ear painted at the side of the head
  for (const s of [1, -1]) {
    const base = headPoint(s * 1.57, 0.535), uv = p => [r.x + r.w * uOfPhi(s * (1.57 + (base[2] - p[2]) / 0.085)), r.y + r.h * tOfY(p[1])];
    const ring = (dx, dz, ry, rz) => ({ c: [base[0] + s * dx, base[1], base[2] + dz], rx: ry, rz, w: W, v: 0 });
    b.loft([ring(-0.006, 0.004, 0.024, 0.011), ring(0.005, -0.005, 0.029, 0.015), ring(0.009, -0.01, 0.026, 0.012), ring(0.008, -0.011, 0.015, 0.006)], r,
      { seg: 8, ax: [0, s, 0], az: [0, 0, 1], capEnd: true, uv });
  }
  // neck
  const N = [[1.625, 0.052, 0.058, 0.012, { head: 0.6, neck: 0.4 }], [1.585, 0.055, 0.06, 0.006, { neck: 0.8, head: 0.2 }], [1.545, 0.059, 0.063, 0, { neck: 1 }], [1.49, 0.07, 0.07, -0.006, { neck: 0.5, chest: 0.5 }]];
  b.loft(N.map(([y, rx, rz, z, w]) => ({ c: [0, y, z], rx, rz, v: (1.625 - y) / 0.135, w })), R.neck, { seg: 12, a0: Math.PI });
  addHair(b, HAIR2[style % HAIR2.length]);
}

function addHair(b, st) {
  if (st.buzz) return;                                       // painted on the scalp only
  const W = { head: 1 }, r = R.hair, cols = 24, rows = 7, start = b.pos.length / 3;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const phi = -Math.PI + i / cols * Math.PI * 2, f = Math.cos(phi), lim = hairline(st, phi), last = j === rows;
    const rag = 0.016 * (Math.sin(i * 2.4) * Math.sin(i * 0.9 + 1) + 0.5);                // tufts along the hairline
    const t = last ? lim + 0.004 + rag : j / (rows - 1) * lim;
    const lie = 1 - 0.75 * (j / (rows - 1)) ** 3;                                          // lying closer toward the hairline
    let off = last ? 0.001 : st.off * lie * (1 + (st.quiff || 0) * Math.max(0, f) * g(t, 0.2, 0.13) + (st.swept ? 0.5 * Math.max(0, -f) * g(t, 0.45, 0.2) : 0));
    if (st.curls && !last) off += st.curls * Math.sin(phi * 7 + j * 2.1) * Math.sin(j * 1.9 + phi * 3);
    b.vert(headPoint(phi, Math.max(0.001, t), off), r.x + r.w * (0.004 + 0.992 * i / cols), r.y + r.h * (0.02 + 0.9 * j / rows), W);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = start + j * (cols + 1) + i, c = a + cols + 1; b.idx.push(a, c, a + 1, a + 1, c, c + 1); }
  if (st.tail) {                                             // gathered at the back, then hanging
    const o = headPoint(Math.PI, 0.36, 0.004), up = [0, 1, 0], mid = [0, 0.707, -0.707], dn = [0, 0, -1];
    const T = [[0, 0, 0.022, up], [0.003, -0.022, 0.03, up], [-0.006, -0.046, 0.028, mid], [-0.036, -0.06, 0.022, dn], [-0.08, -0.064, 0.017, dn], [-0.122, -0.058, 0.007, dn]];
    b.loft(T.map(([dy, dz, rad, az], i) => ({ c: [0, o[1] + dy, o[2] + dz], rx: rad, rz: rad, az, v: 0.25 + 0.7 * i / (T.length - 1), w: W })), r, { seg: 8, ax: [-1, 0, 0], capEnd: true });
  }
}
