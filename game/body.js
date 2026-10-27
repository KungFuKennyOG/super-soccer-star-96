// The footballer: one continuous low-poly skinned mesh, modelled after the FIFA 98 (PS1/PC) and
// Virtua Striker 2 players: realistic athletic proportions (about 8 heads tall, long legs), a narrow
// head, sloped shoulders with the trapezius showing, a fitted shirt tucked into short shorts, socks
// pulled up to the knee, slim muscular legs. Rings of vertices with muscle shapes, Gouraud shading,
// baked ambient occlusion, 22 bones (clavicles, toes). One painted texture sheet (atlas.js), one draw call.
import * as THREE from 'three';
import { REGIONS, SIZE, TORSO_Y, LEG_Y, ARM_DY, SLEEVE_DY, SHORTS_Y, SHIRT_HEM, LIMB_A0, headU } from './atlas.js';
import { hairShell } from './hair.js';

// Key heights and widths (metres; the player faces +z, +x is his left). 1.82 m tall.
export const P = {
  crown: 1.82, chin: 1.592,
  shoulderY: 1.468, shoulderX: 0.185, hipY: 0.95, hipX: 0.092, kneeY: 0.5, ankleY: 0.08,
  elbowDY: -0.31, wristDY: -0.56,
};

// bone list: [name, parent, rest position in world space]
const B = {};
const BONES = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, P.hipY, 0]],
  ['spine', 'hips', [0, 1.08, 0]],
  ['chest', 'spine', [0, 1.3, 0]],
  ['neck', 'chest', [0, 1.52, 0]],
  ['head', 'neck', [0, 1.6, 0]],
];
for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
  const ax = s * P.shoulderX, lx = s * P.hipX;
  BONES.push(
    ['clavicle' + n, 'chest', [s * 0.04, 1.49, 0]],
    ['upperArm' + n, 'clavicle' + n, [ax, P.shoulderY, 0]],
    ['foreArm' + n, 'upperArm' + n, [ax, P.shoulderY + P.elbowDY, 0]],
    ['hand' + n, 'foreArm' + n, [ax, P.shoulderY + P.wristDY, 0]],
    ['upperLeg' + n, 'hips', [lx, P.hipY - 0.02, 0]],
    ['lowerLeg' + n, 'upperLeg' + n, [lx, P.kneeY, 0]],
    ['foot' + n, 'lowerLeg' + n, [lx, P.ankleY, 0]],
    ['toe' + n, 'foot' + n, [lx, 0.028, 0.1]],
  );
}
BONES.forEach(([name], i) => { B[name] = i; });

/* ---------- geometry ---------- */

const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Muscle shapes for a tube: each { a: angle round the limb (0 = front, +pi/2 = +x), aw: angular half
// width, y: height, yw: half height, d: how far it pushes out (negative pulls in) }.
function muscles(list) {
  return (i, a, r) => {
    let d = 0;
    for (const m of list) d += m.d * Math.max(0, 1 - (angDiff(a, m.a) / m.aw) ** 2) * Math.max(0, 1 - ((r.c[1] - m.y) / m.yw) ** 2);
    return d ? [Math.sin(a) * d, 0, Math.cos(a) * d] : null;
  };
}

// Ambient occlusion baked into vertex colors: every triangle shades the vertices it faces, by its
// area and how close and square-on it is (disc approximation). Armpits, under the shirt, between the
// legs and under the chin go darker, which is what makes the low-poly body read as solid.
function bakeAO(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, idx = g.index.array;
  const tc = [], tn = [], ta = [];
  const v = (i, k) => p[i * 3 + k];
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    const ux = v(b, 0) - v(a, 0), uy = v(b, 1) - v(a, 1), uz = v(b, 2) - v(a, 2);
    const wx = v(c, 0) - v(a, 0), wy = v(c, 1) - v(a, 1), wz = v(c, 2) - v(a, 2);
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    tc.push((v(a, 0) + v(b, 0) + v(c, 0)) / 3, (v(a, 1) + v(b, 1) + v(c, 1)) / 3, (v(a, 2) + v(b, 2) + v(c, 2)) / 3);
    tn.push(nx, ny, nz); ta.push(l / 2);
  }
  const count = p.length / 3, col = new Float32Array(count * 3), R2 = 0.2 * 0.2;
  for (let i = 0; i < count; i++) {
    const px = p[i * 3], py = p[i * 3 + 1], pz = p[i * 3 + 2], nx = n[i * 3], ny = n[i * 3 + 1], nz = n[i * 3 + 2];
    let occ = 0;
    for (let t = 0; t < ta.length; t++) {
      const dx = tc[t * 3] - px, dy = tc[t * 3 + 1] - py, dz = tc[t * 3 + 2] - pz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > R2 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), ci = (nx * dx + ny * dy + nz * dz) / d;
      if (ci <= 0.05) continue;
      const cj = -(tn[t * 3] * dx + tn[t * 3 + 1] * dy + tn[t * 3 + 2] * dz) / d;
      if (cj <= 0) continue;
      occ += ta[t] * ci * cj / (Math.PI * d2 + ta[t]);
    }
    const ao = Math.max(0.55, 1 - 0.9 * occ);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

class Builder {
  constructor() { this.pos = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; this.size = SIZE; }
  vert(p, u, v, w) {
    this.pos.push(p[0], p[1], p[2]);
    this.uv.push(u, 1 - v);
    const e = Object.entries(w).slice(0, 4);
    for (let i = 0; i < 4; i++) { this.si.push(e[i] ? B[e[i][0]] : 0); this.sw.push(e[i] ? e[i][1] : 0); }
    return this.pos.length / 3 - 1;
  }
  // rings: [{ c: [x, y, z], rx, rz, n (squareness: 2 = ellipse, higher = boxier), v (0..1 down the
  // region), w: { bone: weight } }]. region: atlas rectangle. a0: angle where u = 0 (0 = front).
  // shape(i, a, ring) may return [dx, dy, dz].
  tube(rings, region, { seg = 10, a0 = 0, capBottom = false, shape, uOf = f => f } = {}) {
    const u0 = region.x / SIZE, du = region.w / SIZE, v0 = region.y / SIZE, dv = region.h / SIZE;
    const start = this.pos.length / 3, vv = r => v0 + dv * Math.min(0.999, Math.max(0.001, r.v));
    for (const r of rings) {
      const e = 2 / (r.n || 2);
      for (let i = 0; i <= seg; i++) {
        const a = a0 + i / seg * Math.PI * 2;
        let x = r.c[0] + spow(Math.sin(a), e) * r.rx, y = r.c[1], z = r.c[2] + spow(Math.cos(a), e) * r.rz;
        if (shape) { const d = shape(i, a, r); if (d) { x += d[0]; y += d[1]; z += d[2]; } }
        this.vert([x, y, z], u0 + du * uOf(i / seg), vv(r), r.w);
      }
    }
    const n = seg + 1;
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) {
      const a = start + j * n + i, b = a + n;
      this.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    if (capBottom) {
      const j = rings.length - 1, r = rings[j], c = this.vert(r.c, u0 + du * 0.5, vv(r), r.w);
      for (let i = 0; i < seg; i++) { const a = start + j * n + i; this.idx.push(c, a + 1, a); }
    }
  }
  // A boot: a box with a lower, narrower toe, split between the foot and toe bones.
  boot(center, size, region, foot, toe) {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2], 1, 1, 3);
    const p = g.attributes.position, uv = g.attributes.uv, base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i); const z = p.getZ(i), f = z / size[2] + 0.5;   // 0 heel .. 1 toe
      if (f > 0.6) { x *= 1 - 0.35 * (f - 0.6) / 0.4; if (y > 0) y -= 0.045 * (f - 0.6) / 0.4; }
      if (f < 0.1 && y > 0) y += 0.012;                                                  // heel counter
      const w = f > 0.62 ? { [toe]: 1 } : f > 0.45 ? { [foot]: 0.6, [toe]: 0.4 } : { [foot]: 1 };
      this.vert([center[0] + x, center[1] + y, center[2] + z], (region.x + uv.getX(i) * region.w) / SIZE, (region.y + (1 - uv.getY(i)) * region.h) / SIZE, w);
    }
    for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    // Gouraud shading like the originals: average normals of vertices at the same spot (texture seams,
    // where a ring wraps round) so the surface shades smoothly across them
    const p = g.attributes.position.array, n = g.attributes.normal.array, groups = new Map();
    for (let i = 0; i < p.length / 3; i++) {
      const key = `${Math.round(p[i * 3] * 1e4)},${Math.round(p[i * 3 + 1] * 1e4)},${Math.round(p[i * 3 + 2] * 1e4)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      let x = 0, y = 0, z = 0;
      for (const i of ids) { x += n[i * 3]; y += n[i * 3 + 1]; z += n[i * 3 + 2]; }
      const l = Math.hypot(x, y, z) || 1;
      for (const i of ids) { n[i * 3] = x / l; n[i * 3 + 1] = y / l; n[i * 3 + 2] = z / l; }
    }
    bakeAO(g);
    return g;
  }
}

const tv = y => (TORSO_Y.top - y) / (TORSO_Y.top - TORSO_Y.bottom);
const lv = y => (LEG_Y.top - y) / (LEG_Y.top - LEG_Y.bottom);
const av = dy => (ARM_DY.top - dy) / (ARM_DY.top - ARM_DY.bottom);

// style: hairstyle, an index into HAIR_STYLES (hair.js). Geometry is shared by everyone with the same style.
const geoCache = new Map();
export function bodyGeometry(style = 0) {
  if (geoCache.has(style)) return geoCache.get(style);
  const b = new Builder();

  // torso, neck to crotch: [y, half width, half depth, z offset, squareness, weights]
  const T = [
    [1.625, 0.05, 0.056, 0.012, 2, { neck: 0.5, head: 0.5 }],
    [1.57, 0.06, 0.065, 0.006, 2, { neck: 1 }],
    [1.54, 0.07, 0.072, 0, 2, { neck: 0.7, chest: 0.3 }],                                               // neck base
    [1.512, 0.135, 0.088, -0.008, 2.2, { chest: 0.5, neck: 0.2, clavicleL: 0.15, clavicleR: 0.15 }],      // trapezius slope
    [1.47, 0.176, 0.102, -0.01, 2.4, { chest: 0.6, clavicleL: 0.2, clavicleR: 0.2 }],                     // top of the shoulders
    [1.42, 0.183, 0.118, 0.004, 2.5, { chest: 1 }],                                                       // armpits
    [1.35, 0.177, 0.122, 0.012, 2.5, { chest: 1 }],                                                       // chest
    [1.27, 0.166, 0.116, 0.012, 2.4, { chest: 0.7, spine: 0.3 }],
    [1.18, 0.153, 0.106, 0.008, 2.3, { spine: 0.6, chest: 0.4 }],
    [1.09, 0.149, 0.102, 0.004, 2.3, { spine: 0.7, hips: 0.3 }],                                          // waist
    [1.015, 0.157, 0.106, 0, 2.3, { hips: 0.6, spine: 0.4 }],
    [SHIRT_HEM, 0.162, 0.108, 0, 2.3, { hips: 0.8, spine: 0.2 }],                                         // shirt tucked in
    [0.93, 0.17, 0.112, 0, 2.2, { hips: 1 }],                                                             // shorts
    [0.87, 0.163, 0.1, 0, 2.2, { hips: 1 }],
    [0.83, 0.11, 0.07, 0, 2, { hips: 1 }],
  ];
  b.tube(T.map(([y, rx, rz, z, n, w]) => ({ c: [0, y, z], rx, rz, n, v: tv(y), w })), REGIONS.torso, {
    seg: 16, capBottom: true,
    shape: muscles([                                    // under a baggy shirt, so only a hint
      { a: 0.45, aw: 0.55, y: 1.36, yw: 0.06, d: 0.01 }, { a: -0.45, aw: 0.55, y: 1.36, yw: 0.06, d: 0.01 },     // pecs
      { a: 2.0, aw: 0.6, y: 1.3, yw: 0.09, d: 0.007 }, { a: -2.0, aw: 0.6, y: 1.3, yw: 0.09, d: 0.007 },         // lats
      { a: 2.6, aw: 0.45, y: 1.41, yw: 0.06, d: 0.007 }, { a: -2.6, aw: 0.45, y: 1.41, yw: 0.06, d: 0.007 },     // shoulder blades
      { a: Math.PI, aw: 0.3, y: 1.25, yw: 0.2, d: -0.005 },                                                     // spine
      { a: Math.PI, aw: 1.0, y: 0.9, yw: 0.06, d: 0.008 },                                                      // seat
    ]),
  });
  // polo collar: a band standing round the neck with a folded lip
  b.tube([
    { c: [0, 1.566, 0.008], rx: 0.072, rz: 0.077, v: 0.02, w: { neck: 0.8, chest: 0.2 } },
    { c: [0, 1.559, 0.008], rx: 0.067, rz: 0.072, v: 0.4, w: { neck: 0.7, chest: 0.3 } },
    { c: [0, 1.526, -0.002], rx: 0.1, rz: 0.086, n: 2.2, v: 0.98, w: { chest: 0.6, neck: 0.4 } },
  ], REGIONS.collar, { seg: 12 });

  // head: an egg, a little big for the body, with brow, nose, cheekbones, ears and a square jaw
  const H = { cx: 0, cy: (P.crown + P.chin) / 2, cz: 0.014, rx: 0.085, ry: (P.crown - P.chin) / 2, rz: 0.104 };
  const rows = 12, headRings = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows * Math.PI, s = Math.sin(t);
    headRings.push({ c: [H.cx, H.cy + Math.cos(t) * H.ry, H.cz], rx: Math.max(1e-4, s * H.rx), rz: Math.max(1e-4, s * H.rz), v: j / rows, w: { head: 1 }, t });
  }
  b.tube(headRings, REGIONS.head, {
    seg: 16, a0: Math.PI, uOf: headU,
    shape: (i, a, r) => {
      const fx = Math.sin(a) * r.rx, front = Math.cos(a), side = Math.abs(Math.sin(a)), t = r.t / Math.PI;
      let dx = 0, dy = 0, dz = 0;
      if (t > 0.6) {                                                // jaw narrows to the chin
        const k = (t - 0.6) / 0.4;
        dx -= fx * 0.2 * k;
        if (front > 0) { dz += 0.012 * k * front; dy -= 0.006 * k * front; }
      }
      if (front < -0.3 && t > 0.55) dz += 0.012 * (t - 0.55) * -front;  // the back of the skull tucks in to the neck
      if (front > 0.8 && Math.abs(t - 0.42) < 0.06) dz += 0.006;    // brow
      if (front > 0.95 && t > 0.46 && t < 0.62) dz += t < 0.56 ? 0.017 : 0.01; // nose
      if (front > 0.4 && front < 0.95 && Math.abs(t - 0.55) < 0.07) dx += Math.sign(fx) * 0.004;   // cheekbones
      if (side > 0.95 && Math.abs(t - 0.52) < 0.07) dx += Math.sign(fx) * 0.012;  // ears
      return [dx, dy, dz];
    },
  });
  hairShell(b, style, H, REGIONS.hair, { head: 1 });

  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const up = 'upperLeg' + n, lo = 'lowerLeg' + n, ft = 'foot' + n, lx = s * P.hipX;
    // leg: [y, r, z offset, weights]. Short baggy shorts flare to the hem, then a thick thigh, a
    // knee, the sock turned over below it, a big calf and a slim ankle.
    const L = [
      [0.97, 0.095, 0, { hips: 0.5, [up]: 0.5 }],
      [0.89, 0.104, 0, { hips: 0.2, [up]: 0.8 }],
      [SHORTS_Y, 0.114, 0.004, { [up]: 1 }],                           // short shorts, a little flared
      [SHORTS_Y - 0.006, 0.087, 0.006, { [up]: 1 }],
      [0.66, 0.083, 0.01, { [up]: 1 }],
      [0.58, 0.071, 0.012, { [up]: 1 }],
      [0.525, 0.061, 0.012, { [up]: 0.7, [lo]: 0.3 }],
      [P.kneeY, 0.058, 0.012, { [up]: 0.5, [lo]: 0.5 }],
      [0.474, 0.057, 0.006, { [lo]: 1 }],
      [0.458, 0.062, 0.004, { [lo]: 1 }],                              // sock turned over below the knee
      [0.428, 0.062, 0, { [lo]: 1 }],
      [0.37, 0.068, -0.01, { [lo]: 1 }],                               // calf
      [0.31, 0.065, -0.012, { [lo]: 1 }],
      [0.24, 0.052, -0.006, { [lo]: 1 }],
      [0.16, 0.039, -0.002, { [lo]: 1 }],
      [0.11, 0.034, 0, { [lo]: 1 }],
      [P.ankleY, 0.036, 0, { [lo]: 0.5, [ft]: 0.5 }],
    ];
    b.tube(L.map(([y, r, z, w]) => ({ c: [lx, y, z], rx: r, rz: r * 0.95, n: 2.2, v: lv(y), w })), REGIONS.leg, {
      seg: 10, a0: LIMB_A0, capBottom: true,
      shape: muscles([
        { a: 0, aw: 1.2, y: 0.65, yw: 0.09, d: 0.01 },                       // quads
        { a: -s * 0.55, aw: 0.7, y: 0.55, yw: 0.045, d: 0.009 },            // teardrop above the knee
        { a: s * 1.3, aw: 0.8, y: 0.66, yw: 0.09, d: 0.005 },               // outer thigh
        { a: Math.PI, aw: 1.1, y: 0.66, yw: 0.09, d: 0.005 },               // hamstrings
        { a: 0, aw: 0.7, y: P.kneeY, yw: 0.022, d: 0.01 },                  // kneecap
        { a: -s * 2.36, aw: 0.9, y: 0.35, yw: 0.07, d: 0.013 },             // inner calf
        { a: s * 2.36, aw: 0.8, y: 0.37, yw: 0.06, d: 0.009 },              // outer calf
        { a: 0, aw: 0.6, y: 0.27, yw: 0.09, d: -0.003 },                     // shin
        { a: Math.PI, aw: 0.8, y: 0.14, yw: 0.05, d: -0.005 },              // achilles
      ]),
    });
    b.boot([lx, 0.04, 0.045], [0.094, 0.08, 0.27], REGIONS.boot, ft, 'toe' + n);

    const ua = 'upperArm' + n, fa = 'foreArm' + n, hd = 'hand' + n, cl = 'clavicle' + n, ax = s * P.shoulderX, ay = P.shoulderY;
    // arm: [dy below the shoulder, rx, rz, weights, x shift inward]. A rounded shoulder cap, a thick
    // upper arm in a baggy sleeve that flares to just above the elbow, a strong forearm, mitt hands.
    const A = [
      [0.035, 0.05, 0.056, { chest: 0.4, [cl]: 0.4, [ua]: 0.2 }, -0.03],   // deltoid
      [0.005, 0.072, 0.077, { [cl]: 0.4, [ua]: 0.6 }, -0.008],
      [-0.05, 0.076, 0.077, { [ua]: 1 }],
      [-0.12, 0.074, 0.073, { [ua]: 1 }],
      [SLEEVE_DY + 0.004, 0.072, 0.071, { [ua]: 0.95, [fa]: 0.05 }],     // sleeve to mid upper arm
      [SLEEVE_DY - 0.004, 0.051, 0.053, { [ua]: 1 }],
      [-0.25, 0.048, 0.05, { [ua]: 1 }],
      [P.elbowDY, 0.041, 0.043, { [ua]: 0.5, [fa]: 0.5 }],
      [-0.36, 0.046, 0.048, { [fa]: 1 }],
      [-0.45, 0.037, 0.039, { [fa]: 1 }],
      [P.wristDY + 0.012, 0.026, 0.03, { [fa]: 0.5, [hd]: 0.5 }],
      [P.wristDY - 0.02, 0.022, 0.044, { [hd]: 1 }],                       // the hand: palm toward the body
      [P.wristDY - 0.085, 0.022, 0.046, { [hd]: 1 }],
      [P.wristDY - 0.15, 0.012, 0.03, { [hd]: 1 }],
    ];
    b.tube(A.map(([dy, rx, rz, w, ox = 0]) => ({ c: [ax + s * ox, ay + dy, 0], rx, rz, n: 2.2, v: av(dy), w })), REGIONS.arm, {
      seg: 10, a0: LIMB_A0, capBottom: true,
      shape: muscles([
        { a: s * 0.7, aw: 0.9, y: ay - 0.37, yw: 0.06, d: 0.008 },          // forearm, top
        { a: -s * 0.5, aw: 0.8, y: ay - 0.38, yw: 0.06, d: 0.005 },         // forearm, inside
        { a: Math.PI, aw: 0.6, y: ay + P.elbowDY, yw: 0.025, d: 0.006 },    // elbow
        { a: 0, aw: 0.8, y: ay - 0.24, yw: 0.045, d: 0.007 },               // biceps
        { a: Math.PI, aw: 0.9, y: ay - 0.22, yw: 0.05, d: 0.005 },          // triceps
      ]),
    });
  }
  const g = b.geometry();
  geoCache.set(style, g);
  return g;
}

/* ---------- skeleton ---------- */

export function buildSkeleton() {
  const bones = [];
  for (const [name, parent, p] of BONES) {
    const bone = new THREE.Bone(); bone.name = name;
    if (parent) {
      const pp = BONES[B[parent]][2];
      bone.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      bones[B[parent]].add(bone);
    } else bone.position.set(...p);
    bone.userData.rest = bone.position.clone();
    bones.push(bone);
  }
  const by = Object.fromEntries(bones.map(b => [b.name, b]));
  return { bones, by };
}

// A whole player: SkinnedMesh + its bones. material: the player's PS1 material with their atlas.
export function buildBody(material, style) {
  const { bones, by } = buildSkeleton();
  const mesh = new THREE.SkinnedMesh(bodyGeometry(style), material);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  return { mesh, bone: by };
}

/* ---------- posing ---------- */

// Clears every bone back to rest before a pose is applied.
export function restPose(bone) {
  for (const b of Object.values(bone)) { b.rotation.set(0, 0, 0); b.position.copy(b.userData.rest); b.scale.set(1, 1, 1); }
}
