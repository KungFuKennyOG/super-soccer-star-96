// The footballer: one continuous low-poly skinned mesh, built the way the PS1 FIFAs and Virtua Striker
// built theirs. The look comes from the proportions: an inverted-triangle build (broad squared
// shoulders and chest, thick arms set wide), a short thick neck, a head a little big for the body,
// and a long untucked 90s shirt over short baggy shorts, so the torso reads long and the legs short.
// Cross-sections are boxy (superellipses), not round tubes. 22 bones: clavicles carry the arms out to
// the shoulders, toes break the boots. One painted texture sheet (atlas.js), one draw call.
import * as THREE from 'three';
import { REGIONS, SIZE, TORSO_Y, LEG_Y, ARM_DY, SLEEVE_DY, SHORTS_Y, SHIRT_HEM, LIMB_A0, headU } from './atlas.js';
import { hairShell } from './hair.js';

// Key heights and widths (metres; the player faces +z, +x is his left).
export const P = {
  crown: 1.815, chin: 1.548, neckTop: 1.585, neckBase: 1.5,
  shoulderY: 1.45, shoulderX: 0.212, hipY: 0.92, hipX: 0.1, kneeY: 0.48, ankleY: 0.085,
  elbowDY: -0.28, wristDY: -0.52,
};

// bone list: [name, parent, rest position in world space]
const B = {};
const BONES = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, P.hipY, 0]],
  ['spine', 'hips', [0, 1.06, 0]],
  ['chest', 'spine', [0, 1.28, 0]],
  ['neck', 'chest', [0, 1.51, 0]],
  ['head', 'neck', [0, 1.585, 0]],
];
for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
  const ax = s * P.shoulderX, lx = s * P.hipX;
  BONES.push(
    ['clavicle' + n, 'chest', [s * 0.05, 1.47, 0]],
    ['upperArm' + n, 'clavicle' + n, [ax, P.shoulderY, 0]],
    ['foreArm' + n, 'upperArm' + n, [ax, P.shoulderY + P.elbowDY, 0]],
    ['hand' + n, 'foreArm' + n, [ax, P.shoulderY + P.wristDY, 0]],
    ['upperLeg' + n, 'hips', [lx, P.hipY - 0.02, 0]],
    ['lowerLeg' + n, 'upperLeg' + n, [lx, P.kneeY, 0]],
    ['foot' + n, 'lowerLeg' + n, [lx, P.ankleY, 0]],
    ['toe' + n, 'foot' + n, [lx, 0.03, 0.11]],
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
    [P.neckTop, 0.062, 0.066, 0.01, 2, { neck: 0.5, head: 0.5 }],
    [1.53, 0.068, 0.072, 0.004, 2, { neck: 1 }],
    [P.neckBase, 0.15, 0.1, -0.004, 2.4, { chest: 0.55, neck: 0.25, clavicleL: 0.1, clavicleR: 0.1 }],  // trapezius
    [1.458, 0.226, 0.13, -0.004, 2.6, { chest: 0.7, clavicleL: 0.15, clavicleR: 0.15 }],               // shoulder line
    [1.39, 0.224, 0.152, 0.014, 2.8, { chest: 1 }],                                                       // chest
    [1.3, 0.206, 0.146, 0.018, 2.7, { chest: 1 }],
    [1.2, 0.184, 0.13, 0.012, 2.5, { spine: 0.55, chest: 0.45 }],
    [1.09, 0.174, 0.122, 0.006, 2.4, { spine: 0.7, hips: 0.3 }],
    [0.97, 0.188, 0.126, 0, 2.4, { hips: 0.7, spine: 0.3 }],
    [SHIRT_HEM, 0.2, 0.132, 0, 2.4, { hips: 1 }],                                                       // untucked shirt flares at the hem
    [SHIRT_HEM - 0.006, 0.176, 0.105, 0, 2.3, { hips: 1 }],                                            // shorts under it
    [0.83, 0.15, 0.09, 0, 2.2, { hips: 1 }],
    [0.8, 0.09, 0.06, 0, 2, { hips: 1 }],
  ];
  b.tube(T.map(([y, rx, rz, z, n, w]) => ({ c: [0, y, z], rx, rz, n, v: tv(y), w })), REGIONS.torso, {
    seg: 16, capBottom: true,
    shape: muscles([                                    // under a baggy shirt, so only a hint
      { a: 0.45, aw: 0.55, y: 1.37, yw: 0.07, d: 0.012 }, { a: -0.45, aw: 0.55, y: 1.37, yw: 0.07, d: 0.012 },   // pecs
      { a: 2.0, aw: 0.6, y: 1.3, yw: 0.1, d: 0.008 }, { a: -2.0, aw: 0.6, y: 1.3, yw: 0.1, d: 0.008 },           // lats
      { a: 2.6, aw: 0.45, y: 1.41, yw: 0.07, d: 0.008 }, { a: -2.6, aw: 0.45, y: 1.41, yw: 0.07, d: 0.008 },     // shoulder blades
      { a: Math.PI, aw: 0.3, y: 1.25, yw: 0.2, d: -0.006 },                                                     // spine
    ]),
  });
  // polo collar: a band standing round the neck with a folded lip
  b.tube([
    { c: [0, 1.552, 0.008], rx: 0.078, rz: 0.082, v: 0.02, w: { neck: 0.8, chest: 0.2 } },
    { c: [0, 1.544, 0.008], rx: 0.072, rz: 0.076, v: 0.4, w: { neck: 0.7, chest: 0.3 } },
    { c: [0, 1.508, -0.002], rx: 0.106, rz: 0.092, n: 2.2, v: 0.98, w: { chest: 0.6, neck: 0.4 } },
  ], REGIONS.collar, { seg: 12 });

  // head: an egg, a little big for the body, with brow, nose, cheekbones, ears and a square jaw
  const H = { cx: 0, cy: (P.crown + P.chin) / 2, cz: 0.018, rx: 0.122, ry: (P.crown - P.chin) / 2, rz: 0.132 };
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
      if (t > 0.62) {                                               // jaw: wide and square, then the chin
        const k = (t - 0.62) / 0.38;
        dx -= fx * 0.12 * k;
        if (front > 0) { dz += 0.02 * k * front; dy -= 0.012 * k * front; }
      }
      if (front > 0.8 && Math.abs(t - 0.42) < 0.06) dz += 0.009;    // brow
      if (front > 0.95 && t > 0.46 && t < 0.62) dz += t < 0.56 ? 0.021 : 0.012; // nose
      if (front > 0.4 && front < 0.95 && Math.abs(t - 0.55) < 0.07) dx += Math.sign(fx) * 0.004;   // cheekbones
      if (side > 0.95 && Math.abs(t - 0.52) < 0.07) dx += Math.sign(fx) * 0.015;  // ears
      return [dx, dy, dz];
    },
  });
  hairShell(b, style, H, REGIONS.hair, { head: 1 });

  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const up = 'upperLeg' + n, lo = 'lowerLeg' + n, ft = 'foot' + n, lx = s * P.hipX;
    // leg: [y, r, z offset, weights]. Short baggy shorts flare to the hem, then a thick thigh, a
    // knee, the sock turned over below it, a big calf and a slim ankle.
    const L = [
      [0.95, 0.104, 0, { hips: 0.5, [up]: 0.5 }],
      [0.86, 0.118, 0, { hips: 0.2, [up]: 0.8 }],
      [SHORTS_Y, 0.124, 0.004, { [up]: 1 }],
      [SHORTS_Y - 0.006, 0.09, 0.008, { [up]: 1 }],
      [0.62, 0.087, 0.012, { [up]: 1 }],
      [0.55, 0.077, 0.014, { [up]: 1 }],
      [P.kneeY, 0.064, 0.014, { [up]: 0.5, [lo]: 0.5 }],
      [0.445, 0.066, 0.004, { [lo]: 1 }],
      [0.438, 0.073, 0.002, { [lo]: 1 }],                              // sock turned over at the top
      [0.405, 0.072, -0.004, { [lo]: 1 }],
      [0.36, 0.074, -0.012, { [lo]: 1 }],
      [0.31, 0.074, -0.014, { [lo]: 1 }],                              // calf
      [0.25, 0.062, -0.01, { [lo]: 1 }],
      [0.19, 0.054, -0.005, { [lo]: 1 }],
      [0.12, 0.044, 0, { [lo]: 1 }],
      [P.ankleY, 0.045, 0, { [lo]: 0.5, [ft]: 0.5 }],
    ];
    b.tube(L.map(([y, r, z, w]) => ({ c: [lx, y, z], rx: r, rz: r * 0.95, n: 2.2, v: lv(y), w })), REGIONS.leg, {
      seg: 10, a0: LIMB_A0, capBottom: true,
      shape: muscles([
        { a: 0, aw: 1.2, y: 0.62, yw: 0.1, d: 0.012 },                       // quads
        { a: -s * 0.55, aw: 0.7, y: 0.545, yw: 0.05, d: 0.01 },             // teardrop above the knee
        { a: s * 1.3, aw: 0.8, y: 0.63, yw: 0.1, d: 0.006 },                // outer thigh
        { a: Math.PI, aw: 1.1, y: 0.62, yw: 0.1, d: 0.006 },                // hamstrings
        { a: 0, aw: 0.7, y: P.kneeY, yw: 0.025, d: 0.012 },                 // kneecap
        { a: -s * 2.36, aw: 0.9, y: 0.33, yw: 0.08, d: 0.017 },             // inner calf
        { a: s * 2.36, aw: 0.8, y: 0.35, yw: 0.07, d: 0.011 },              // outer calf
        { a: 0, aw: 0.6, y: 0.27, yw: 0.1, d: -0.004 },                      // shin
        { a: Math.PI, aw: 0.8, y: 0.14, yw: 0.05, d: -0.006 },              // achilles
      ]),
    });
    b.boot([lx, 0.044, 0.052], [0.104, 0.088, 0.285], REGIONS.boot, ft, 'toe' + n);

    const ua = 'upperArm' + n, fa = 'foreArm' + n, hd = 'hand' + n, cl = 'clavicle' + n, ax = s * P.shoulderX, ay = P.shoulderY;
    // arm: [dy below the shoulder, rx, rz, weights, x shift inward]. A rounded shoulder cap, a thick
    // upper arm in a baggy sleeve that flares to just above the elbow, a strong forearm, mitt hands.
    const A = [
      [0.06, 0.05, 0.06, { chest: 0.4, [cl]: 0.4, [ua]: 0.2 }, -0.035],
      [0.03, 0.08, 0.086, { [cl]: 0.4, [ua]: 0.6 }, -0.014],
      [-0.03, 0.096, 0.093, { [cl]: 0.1, [ua]: 0.9 }],
      [-0.13, 0.097, 0.093, { [ua]: 1 }],
      [SLEEVE_DY + 0.004, 0.102, 0.097, { [ua]: 0.85, [fa]: 0.15 }],
      [SLEEVE_DY - 0.004, 0.064, 0.064, { [ua]: 0.8, [fa]: 0.2 }],
      [P.elbowDY, 0.058, 0.06, { [ua]: 0.5, [fa]: 0.5 }],
      [-0.33, 0.063, 0.063, { [fa]: 1 }],
      [-0.4, 0.056, 0.057, { [fa]: 1 }],
      [-0.46, 0.047, 0.049, { [fa]: 1 }],
      [P.wristDY, 0.04, 0.044, { [fa]: 0.5, [hd]: 0.5 }],
      [P.wristDY - 0.025, 0.035, 0.062, { [hd]: 1 }],
      [P.wristDY - 0.095, 0.038, 0.064, { [hd]: 1 }],
      [P.wristDY - 0.145, 0.02, 0.038, { [hd]: 1 }],
    ];
    b.tube(A.map(([dy, rx, rz, w, ox = 0]) => ({ c: [ax + s * ox, ay + dy, 0], rx, rz, n: 2.2, v: av(dy), w })), REGIONS.arm, {
      seg: 10, a0: LIMB_A0, capBottom: true,
      shape: muscles([
        { a: s * 0.7, aw: 0.9, y: ay - 0.35, yw: 0.07, d: 0.01 },           // forearm, top
        { a: -s * 0.5, aw: 0.8, y: ay - 0.36, yw: 0.07, d: 0.006 },         // forearm, inside
        { a: Math.PI, aw: 0.6, y: ay + P.elbowDY, yw: 0.03, d: 0.008 },     // elbow
        { a: 0, aw: 0.8, y: ay - 0.2, yw: 0.05, d: 0.008 },                 // biceps (in the sleeve)
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
