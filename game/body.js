// A footballer as one continuous skinned mesh on an 18-bone skeleton, the way the early-2000s FIFA
// players were built: rings of vertices swept along each limb, weights blended across every joint so
// knees, elbows, hips and shoulders bend without seams, and one painted texture sheet (atlas.js).
// One draw call per player.
import * as THREE from 'three';
import { REGIONS, SIZE, TORSO_Y, LEG_Y, ARM_DY, headU } from './atlas.js';

// bone list: [name, parent, rest position in world space]
const B = {};
const BONES = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 0.95, 0]],
  ['spine', 'hips', [0, 1.08, 0]],
  ['chest', 'spine', [0, 1.3, 0]],
  ['neck', 'chest', [0, 1.56, 0]],
  ['head', 'neck', [0, 1.64, 0]],
];
for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
  BONES.push(
    ['upperArm' + n, 'chest', [s * 0.205, 1.44, 0]], ['foreArm' + n, 'upperArm' + n, [s * 0.205, 1.15, 0]], ['hand' + n, 'foreArm' + n, [s * 0.205, 0.895, 0]],
    ['upperLeg' + n, 'hips', [s * 0.1, 0.93, 0]], ['lowerLeg' + n, 'upperLeg' + n, [s * 0.1, 0.49, 0]], ['foot' + n, 'lowerLeg' + n, [s * 0.1, 0.08, 0]],
  );
}
BONES.forEach(([name], i) => { B[name] = i; });

/* ---------- geometry ---------- */

class Builder {
  constructor() { this.pos = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; }
  vert(p, u, v, w) {
    this.pos.push(p[0], p[1], p[2]);
    this.uv.push(u, 1 - v);
    const e = Object.entries(w).slice(0, 4);
    for (let i = 0; i < 4; i++) { this.si.push(e[i] ? B[e[i][0]] : 0); this.sw.push(e[i] ? e[i][1] : 0); }
    return this.pos.length / 3 - 1;
  }
  // rings: [{ c: [x, y, z], rx, rz, v (0..1 down the region), w: { bone: weight } }]
  // region: atlas rectangle. a0: angle where u = 0 (0 = front). shape(i, a, ring) may return [dx, dy, dz].
  tube(rings, region, { seg = 10, a0 = 0, capTop = false, capBottom = false, shape, uOf = f => f } = {}) {
    const u0 = region.x / SIZE, du = region.w / SIZE, v0 = region.y / SIZE, dv = region.h / SIZE;
    const start = this.pos.length / 3;
    for (const r of rings) {
      for (let i = 0; i <= seg; i++) {
        const a = a0 + i / seg * Math.PI * 2;
        let x = r.c[0] + Math.sin(a) * r.rx, y = r.c[1], z = r.c[2] + Math.cos(a) * r.rz;
        if (shape) { const d = shape(i, a, r); if (d) { x += d[0]; y += d[1]; z += d[2]; } }
        this.vert([x, y, z], u0 + du * uOf(i / seg), v0 + dv * Math.min(0.999, Math.max(0.001, r.v)), r.w);
      }
    }
    const n = seg + 1;
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) {
      const a = start + j * n + i, b = a + n;
      this.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const cap = (j, down) => {
      const r = rings[j], c = this.vert(r.c, u0 + du * 0.5, v0 + dv * Math.min(0.999, Math.max(0.001, r.v)), r.w);
      for (let i = 0; i < seg; i++) {
        const a = start + j * n + i;
        if (down) this.idx.push(c, a + 1, a); else this.idx.push(c, a, a + 1);
      }
    };
    if (capTop) cap(0, false);
    if (capBottom) cap(rings.length - 1, true);
  }
  box(center, size, region, w, toe = 0) {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2], 1, 1, 2);
    const p = g.attributes.position, uv = g.attributes.uv, base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i); const z = p.getZ(i);
      if (z > size[2] * 0.2) { x *= 0.8; if (y > 0) y -= toe; }   // the toe: narrower and lower
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
    return g;
  }
}

const tv = y => (TORSO_Y.top - y) / (TORSO_Y.top - TORSO_Y.bottom);
const lv = y => (LEG_Y.top - y) / (LEG_Y.top - LEG_Y.bottom);
const av = dy => (ARM_DY.top - dy) / (ARM_DY.top - ARM_DY.bottom);

// style: hair volume (0 short, 1 fuller, 2 shaved). Geometry is shared by everyone with the same style.
const geoCache = new Map();
export function bodyGeometry(style = 0) {
  if (geoCache.has(style)) return geoCache.get(style);
  const b = new Builder();

  // torso, crotch to the top of the neck: [y, rx, rz, z offset, weights]
  // listed neck to crotch: rings run top to bottom like every other tube
  const T = [
    [1.66, 0.064, 0.068, 0.004, { neck: 0.5, head: 0.5 }],
    [1.6, 0.07, 0.074, 0, { neck: 1 }],
    [1.545, 0.1, 0.088, -0.004, { chest: 0.6, neck: 0.4 }],
    [1.505, 0.17, 0.11, -0.006, { chest: 1 }],
    [1.455, 0.215, 0.13, -0.002, { chest: 1 }],
    [1.38, 0.225, 0.142, 0.006, { chest: 1 }],
    [1.28, 0.215, 0.142, 0.01, { chest: 1 }],
    [1.17, 0.205, 0.136, 0.01, { spine: 0.7, chest: 0.3 }],
    [1.06, 0.205, 0.134, 0.006, { spine: 0.6, hips: 0.4 }],
    [0.985, 0.212, 0.138, 0.004, { hips: 0.8, spine: 0.2 }],   // baggy 90s shirt hangs over the shorts
    [0.975, 0.18, 0.12, 0, { hips: 1 }],
    [0.9, 0.178, 0.118, 0, { hips: 1 }],
    [0.84, 0.12, 0.085, 0, { hips: 1 }],
  ];
  b.tube(T.map(([y, rx, rz, z, w]) => ({ c: [0, y, z], rx, rz, v: tv(y), w })), REGIONS.torso, { seg: 14, capBottom: true });

  // head: an egg with a narrower jaw, a chin, a nose, and the hair pushed out where it has volume
  const H = { cx: 0, cy: 1.725, cz: 0.016, rx: 0.106, ry: 0.13, rz: 0.116 };
  const rows = 12, headRings = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows * Math.PI, s = Math.sin(t);
    headRings.push({ c: [H.cx, H.cy + Math.cos(t) * H.ry, H.cz], rx: Math.max(1e-4, s * H.rx), rz: Math.max(1e-4, s * H.rz), v: j / rows, w: { head: 1 }, t });
  }
  const puff = style === 1 ? 1.1 : style === 0 ? 1.05 : 1;
  b.tube(headRings, REGIONS.head, {
    seg: 20, a0: Math.PI, uOf: headU,
    shape: (i, a, r) => {
      const fx = Math.sin(a) * r.rx, fz = Math.cos(a) * r.rz, front = Math.cos(a);
      let dx = 0, dy = 0, dz = 0;
      if (r.t > 0.55 * Math.PI) {                                   // jaw narrows to the chin
        const k = (r.t - 0.55 * Math.PI) / (0.45 * Math.PI);
        dx -= fx * 0.3 * k;
        if (front > 0) { dz += 0.014 * k * front; dy -= 0.012 * k * front; }
      }
      if (front > 0.95 && r.t > 0.48 * Math.PI && r.t < 0.66 * Math.PI) dz += 0.016; // nose
      const hair = r.t < 0.45 * Math.PI || (front < -0.2 && r.t < 0.72 * Math.PI);
      if (hair && puff > 1) { dx += fx * (puff - 1); dz += fz * (puff - 1); if (r.t < 0.3 * Math.PI) dy += 0.008 * (puff - 1) * 10; }
      return [dx, dy, dz];
    },
  });

  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const up = 'upperLeg' + n, lo = 'lowerLeg' + n, ft = 'foot' + n;
    // leg: [y, r, z offset, weights]. The ring pair at the hem makes the baggy shorts step in to the thigh.
    const L = [
      [0.98, 0.098, 0, { hips: 0.5, [up]: 0.5 }],
      [0.92, 0.108, 0, { hips: 0.2, [up]: 0.8 }],
      [0.8, 0.114, 0.004, { [up]: 1 }],
      [0.795, 0.092, 0.004, { [up]: 1 }],
      [0.7, 0.09, 0.008, { [up]: 1 }],
      [0.6, 0.078, 0.01, { [up]: 1 }],
      [0.49, 0.062, 0.012, { [up]: 0.5, [lo]: 0.5 }],
      [0.455, 0.063, 0.004, { [lo]: 1 }],
      [0.37, 0.072, -0.012, { [lo]: 1 }],
      [0.27, 0.062, -0.008, { [lo]: 1 }],
      [0.15, 0.045, 0, { [lo]: 1 }],
      [0.09, 0.046, 0, { [lo]: 0.5, [ft]: 0.5 }],
    ];
    b.tube(L.map(([y, r, z, w]) => ({ c: [s * 0.1, y, z], rx: r, rz: r * 0.96, v: lv(y), w })), REGIONS.leg, { seg: 10, capBottom: true });
    // boot
    b.box([s * 0.1, 0.048, 0.05], [0.096, 0.088, 0.28], REGIONS.boot, { [ft]: 1 }, 0.032);

    const ua = 'upperArm' + n, fa = 'foreArm' + n, hd = 'hand' + n, ax = s * 0.205, ay = 1.44;
    // arm: [dy below the shoulder, rx, rz, weights]. The sleeve flares, then steps in to the arm.
    const A = [
      [0.05, 0.07, 0.07, { chest: 0.6, [ua]: 0.4 }],
      [0.0, 0.088, 0.088, { chest: 0.2, [ua]: 0.8 }],
      [-0.12, 0.094, 0.094, { [ua]: 1 }],
      [-0.25, 0.1, 0.1, { [ua]: 0.85, [fa]: 0.15 }],            // long baggy sleeve to the elbow
      [-0.258, 0.058, 0.06, { [ua]: 0.8, [fa]: 0.2 }],
      [-0.29, 0.052, 0.054, { [ua]: 0.5, [fa]: 0.5 }],
      [-0.35, 0.054, 0.058, { [fa]: 1 }],
      [-0.46, 0.042, 0.046, { [fa]: 1 }],
      [-0.535, 0.036, 0.04, { [fa]: 0.5, [hd]: 0.5 }],
      [-0.565, 0.03, 0.058, { [hd]: 1 }],                          // big 90s hands
      [-0.64, 0.034, 0.062, { [hd]: 1 }],
      [-0.7, 0.02, 0.038, { [hd]: 1 }],
    ];
    b.tube(A.map(([dy, rx, rz, w]) => ({ c: [ax, ay + dy, 0], rx, rz, v: av(dy), w })), REGIONS.arm, { seg: 10, capBottom: true });
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
  for (const b of Object.values(bone)) { b.rotation.set(0, 0, 0); b.position.copy(b.userData.rest); }
}
