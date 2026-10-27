// The footballer: one continuous low-poly skinned mesh, modelled after the FIFA 98 (PS1/PC) and
// Virtua Striker 2 players: realistic athletic proportions (about 8 heads tall, long legs), a narrow
// head, sloped shoulders with the trapezius showing, a fitted shirt tucked into short shorts, socks
// pulled up to the knee, slim muscular legs. Rings of vertices with muscle shapes, Gouraud shading,
// baked ambient occlusion, 22 bones (clavicles, toes). One painted texture sheet (atlas.js), one draw call.
import * as THREE from 'three';
import { REGIONS, SIZE, TORSO_Y, LEG_Y, ARM_DY, SLEEVE_DY, SHORTS_Y, SHIRT_HEM, LIMB_A0, headU } from './atlas.js';
import { hairShell } from './hair.js';
import { faceSculpt } from './head.js';

// Key heights and widths (metres; the player faces +z, +x is his left). 1.82 m tall.
export const P = {
  crown: 1.845, chin: 1.58,
  shoulderY: 1.468, shoulderX: 0.205, hipY: 0.95, hipX: 0.09, kneeY: 0.52, ankleY: 0.085,
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
    [1.625, 0.052, 0.058, 0.03, 2, { neck: 0.5, head: 0.5 }],
    [1.57, 0.066, 0.07, 0.02, 2, { neck: 1 }],                                                          // thick neck, carried forward
    [1.54, 0.078, 0.078, 0.01, 2, { neck: 0.7, chest: 0.3 }],                                           // neck base
    [1.512, 0.145, 0.09, -0.008, 2.2, { chest: 0.5, neck: 0.2, clavicleL: 0.15, clavicleR: 0.15 }],       // trapezius slope
    [1.47, 0.198, 0.114, -0.004, 2.5, { chest: 0.6, clavicleL: 0.2, clavicleR: 0.2 }],                    // top of the broad shoulders
    [1.42, 0.21, 0.134, 0.012, 2.9, { chest: 1 }],                                                        // armpits
    [1.35, 0.2, 0.136, 0.018, 3, { chest: 1 }],                                                           // broad, flat-fronted chest
    [1.27, 0.188, 0.13, 0.016, 2.9, { chest: 0.7, spine: 0.3 }],
    [1.18, 0.18, 0.124, 0.01, 2.8, { spine: 0.6, chest: 0.4 }],                                           // a man's straight torso: no waist
    [SHIRT_HEM, 0.174, 0.118, 0.004, 2.6, { spine: 0.7, hips: 0.3 }],                                     // shirt tucked in
    [SHIRT_HEM - 0.008, 0.17, 0.114, 0.004, 2.6, { spine: 0.6, hips: 0.4 }],                              // high-waisted shorts
    [0.98, 0.172, 0.116, 0, 2.6, { hips: 0.7, spine: 0.3 }],                                              // narrow hips
    [0.9, 0.17, 0.112, 0, 2.6, { hips: 1 }],
    [0.83, 0.16, 0.1, 0, 2.6, { hips: 1 }],
    [0.79, 0.14, 0.09, 0, 2.6, { hips: 1 }],
  ];
  b.tube(T.map(([y, rx, rz, z, n, w]) => ({ c: [0, y, z], rx, rz, n, v: tv(y), w })), REGIONS.torso, {
    seg: 16, capBottom: true,
    shape: muscles([                                    // under a baggy shirt, so only a hint
      { a: 2.0, aw: 0.6, y: 1.3, yw: 0.09, d: 0.007 }, { a: -2.0, aw: 0.6, y: 1.3, yw: 0.09, d: 0.007 },         // lats
      { a: 2.6, aw: 0.45, y: 1.41, yw: 0.06, d: 0.007 }, { a: -2.6, aw: 0.45, y: 1.41, yw: 0.06, d: 0.007 },     // shoulder blades
      { a: Math.PI, aw: 0.3, y: 1.25, yw: 0.2, d: -0.005 },                                                     // spine
      { a: Math.PI, aw: 1.0, y: 0.9, yw: 0.06, d: 0.008 },                                                      // seat
    ]),
  });
  // polo collar: a band standing round the neck with a folded lip
  b.tube([
    { c: [0, 1.566, 0.02], rx: 0.075, rz: 0.08, v: 0.02, w: { neck: 0.8, chest: 0.2 } },
    { c: [0, 1.559, 0.02], rx: 0.07, rz: 0.075, v: 0.4, w: { neck: 0.7, chest: 0.3 } },
    { c: [0, 1.526, 0.008], rx: 0.102, rz: 0.09, n: 2.2, v: 0.98, w: { chest: 0.6, neck: 0.4 } },
  ], REGIONS.collar, { seg: 12 });

  // head: an oval skull with the face sculpted into it (head.js), a little big for the body
  const H = { cx: 0, cy: (P.crown + P.chin) / 2, cz: 0.032, rx: 0.094, ry: (P.crown - P.chin) / 2, rz: 0.114 };
  const rows = 18, headRings = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows * Math.PI, s = Math.sin(t);
    headRings.push({ c: [H.cx, H.cy + Math.cos(t) * H.ry, H.cz], rx: Math.max(1e-4, s * H.rx), rz: Math.max(1e-4, s * H.rz), v: j / rows, w: { head: 1 }, t });
  }
  b.tube(headRings, REGIONS.head, {
    seg: 24, a0: Math.PI, uOf: headU,
    shape: (i, a, r) => {
      const t = r.t / Math.PI, phi = Math.atan2(Math.sin(a), Math.cos(a)), fx = Math.sin(a) * r.rx;
      let dx = 0, dz = 0;
      if (t > 0.66) dx -= fx * 0.1 * (t - 0.66) / 0.34;             // a broad jaw narrows to the chin
      if (Math.cos(a) < -0.3 && t > 0.6) dz += 0.014 * (t - 0.6) * -Math.cos(a);  // the skull tucks in to the neck
      const [out, dy] = faceSculpt(phi, t), k = Math.min(1, Math.sin(r.t) * 3);
      return [dx + Math.sin(a) * out * k, dy, dz + Math.cos(a) * out * k];
    },
  });
  hairShell(b, style, H, REGIONS.hair, { head: 1 });

  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const up = 'upperLeg' + n, lo = 'lowerLeg' + n, ft = 'foot' + n, lx = s * P.hipX;
    // leg: [y, r, z offset, weights]. Short baggy shorts flare to the hem, then a thick thigh, a
    // knee, the sock turned over below it, a big calf and a slim ankle.
    const L = [
      [0.96, 0.092, 0, { hips: 0.5, [up]: 0.5 }],
      [0.86, 0.106, 0, { hips: 0.2, [up]: 0.8 }],                       // straight down from narrow hips, flaring only at the hem
      [SHORTS_Y, 0.138, 0.004, { [up]: 1 }],                           // long, wide, flared shorts
      [SHORTS_Y - 0.006, 0.1, 0.008, { [up]: 1 }],                     // thick thighs
      [0.63, 0.094, 0.012, { [up]: 1 }],
      [0.58, 0.08, 0.012, { [up]: 1 }],
      [0.545, 0.065, 0.012, { [up]: 0.7, [lo]: 0.3 }],
      [P.kneeY, 0.064, 0.012, { [up]: 0.5, [lo]: 0.5 }],
      [0.494, 0.063, 0.006, { [lo]: 1 }],
      [0.478, 0.07, 0.004, { [lo]: 1 }],                               // sock turned over below the knee
      [0.448, 0.072, 0, { [lo]: 1 }],
      [0.39, 0.082, -0.012, { [lo]: 1 }],                              // big calves
      [0.33, 0.079, -0.014, { [lo]: 1 }],
      [0.26, 0.062, -0.008, { [lo]: 1 }],
      [0.18, 0.047, -0.002, { [lo]: 1 }],
      [0.12, 0.042, 0, { [lo]: 1 }],
      [P.ankleY, 0.044, 0, { [lo]: 0.5, [ft]: 0.5 }],
    ];
    b.tube(L.map(([y, r, z, w]) => ({ c: [lx, y, z], rx: r, rz: r * 0.95, n: 2.2, v: lv(y), w })), REGIONS.leg, {
      seg: 10, a0: LIMB_A0, capBottom: true,
      shape: muscles([
        { a: 0, aw: 1.2, y: 0.64, yw: 0.09, d: 0.009 },                      // quads
        { a: -s * 0.55, aw: 0.7, y: 0.57, yw: 0.045, d: 0.01 },             // teardrop above the knee
        { a: s * 1.3, aw: 0.8, y: 0.66, yw: 0.08, d: 0.006 },               // outer thigh
        { a: Math.PI, aw: 1.1, y: 0.66, yw: 0.08, d: 0.006 },               // hamstrings
        { a: 0, aw: 0.7, y: P.kneeY, yw: 0.022, d: 0.01 },                  // kneecap
        { a: -s * 2.36, aw: 0.9, y: 0.37, yw: 0.07, d: 0.018 },             // inner calf
        { a: s * 2.36, aw: 0.8, y: 0.39, yw: 0.06, d: 0.013 },              // outer calf
        { a: 0, aw: 0.6, y: 0.27, yw: 0.09, d: -0.003 },                     // shin
        { a: Math.PI, aw: 0.8, y: 0.14, yw: 0.05, d: -0.005 },              // achilles
      ]),
    });
    b.boot([lx, 0.05, 0.05], [0.104, 0.1, 0.3], REGIONS.boot, ft, 'toe' + n);   // big chunky boots

    const ua = 'upperArm' + n, fa = 'foreArm' + n, hd = 'hand' + n, cl = 'clavicle' + n, ax = s * P.shoulderX, ay = P.shoulderY;
    // arm: [dy below the shoulder, rx, rz, weights, x shift inward]. A rounded shoulder cap, a thick
    // upper arm in a baggy sleeve that flares to just above the elbow, a strong forearm, mitt hands.
    const A = [
      [0.03, 0.058, 0.062, { chest: 0.4, [cl]: 0.4, [ua]: 0.2 }, -0.03],   // the shoulder slopes into the sleeve
      [0.0, 0.07, 0.075, { [cl]: 0.4, [ua]: 0.6 }, -0.01],
      [-0.06, 0.074, 0.076, { [ua]: 1 }],
      [-0.14, 0.076, 0.076, { [ua]: 1 }],
      [SLEEVE_DY + 0.004, 0.078, 0.077, { [ua]: 0.92, [fa]: 0.08 }],     // loose sleeve to above the elbow
      [SLEEVE_DY - 0.004, 0.054, 0.056, { [ua]: 1 }],
      [-0.282, 0.047, 0.049, { [ua]: 1 }],
      [P.elbowDY, 0.041, 0.043, { [ua]: 0.5, [fa]: 0.5 }],
      [-0.36, 0.051, 0.053, { [fa]: 1 }],                                 // strong forearms
      [-0.45, 0.041, 0.043, { [fa]: 1 }],
      [P.wristDY + 0.012, 0.029, 0.033, { [fa]: 0.5, [hd]: 0.5 }],
      [P.wristDY - 0.02, 0.024, 0.048, { [hd]: 1 }],                       // big hands, palm toward the body
      [P.wristDY - 0.09, 0.024, 0.05, { [hd]: 1 }],
      [P.wristDY - 0.165, 0.013, 0.032, { [hd]: 1 }],
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
