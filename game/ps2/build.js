// Mesh builder for the PS2-look player: lofts rings of vertices into skinned tubes on the game's own
// skeleton (body.js), so every pose and animation the game already has drives the new body unchanged.
import * as THREE from 'three';
import { buildSkeleton, bakeAO } from '../body.js';
import { ATLAS } from './kit.js';

const IDX = Object.fromEntries(buildSkeleton().bones.map((b, i) => [b.name, i]));
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;

export class Builder {
  constructor() { this.pos = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; }
  // p: [x, y, z]. px, py: sheet pixels. w: { bone: weight }
  vert(p, px, py, w) {
    this.pos.push(p[0], p[1], p[2]);
    this.uv.push(px / ATLAS.w, 1 - py / ATLAS.h);
    const e = Object.entries(w).filter(k => k[1] > 0.001).sort((a, b) => b[1] - a[1]).slice(0, 4), sum = e.reduce((s, k) => s + k[1], 0) || 1;
    for (let i = 0; i < 4; i++) { this.si.push(e[i] ? IDX[e[i][0]] : 0); this.sw.push(e[i] ? e[i][1] / sum : 0); }
    return this.pos.length / 3 - 1;
  }
  // rings: [{ c, rx, rz, n (2 = ellipse, higher = boxier), v (0..1 down the region), w: weights or fn(p) }]
  // listed top to bottom (or back to front with ax/az). Round each ring the angle runs from a0, 0 = toward
  // az (the front), a quarter turn = toward ax (his left). region: sheet rectangle. mirror flips u (right limbs).
  // shape(a, ring, i) → [dx, dy, dz]. uv(p, f, ring) → sheet pixels, instead of the region.
  loft(rings, region, { seg = 12, a0 = 0, mirror = false, capStart = false, capEnd = false, shape, ax = [1, 0, 0], az = [0, 0, 1], uv, fOf } = {}) {
    const start = this.pos.length / 3, n = seg + 1;
    const U = f => region.x + 1.5 + (region.w - 3) * (mirror ? 1 - f : f), V = r => region.y + region.h * Math.min(0.992, Math.max(0.008, r.v));
    const W = (r, p) => (typeof r.w === 'function' ? r.w(p) : r.w);
    for (const r of rings) {
      const e = 2 / (r.n || 2), rax = r.ax || ax, raz = r.az || az;
      for (let i = 0; i <= seg; i++) {
        const f = fOf ? fOf(i / seg) : i / seg, a = a0 + f * Math.PI * 2, sx = spow(Math.sin(a), e) * r.rx, sz = spow(Math.cos(a), e) * r.rz;
        const p = [r.c[0] + rax[0] * sx + raz[0] * sz, r.c[1] + rax[1] * sx + raz[1] * sz, r.c[2] + rax[2] * sx + raz[2] * sz];
        if (shape) { const d = shape(a, r, i); if (d) { p[0] += d[0]; p[1] += d[1]; p[2] += d[2]; } }
        const t = uv ? uv(p, i / seg, r) : [U(i / seg), V(r)];
        this.vert(p, t[0], t[1], W(r, p));
      }
    }
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) {
      const a = start + j * n + i, b = a + n;
      this.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const cap = (j, flip) => {
      const r = rings[j], t = uv ? uv(r.c, 0.5, r) : [U(0.5), V(r)], c = this.vert(r.c, t[0], t[1], W(r, r.c));
      for (let i = 0; i < seg; i++) { const a = start + j * n + i; if (flip) this.idx.push(c, a, a + 1); else this.idx.push(c, a + 1, a); }
    };
    if (capStart) cap(0, true);
    if (capEnd) cap(rings.length - 1, false);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    // smooth across texture seams: vertices at the same spot share one normal
    const p = g.attributes.position.array, n = g.attributes.normal.array, groups = new Map();
    for (let i = 0; i < p.length / 3; i++) {
      const key = `${Math.round(p[i * 3] * 2e3)},${Math.round(p[i * 3 + 1] * 2e3)},${Math.round(p[i * 3 + 2] * 2e3)}`;
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
    bakeAO(g);                                         // soft ambient occlusion in the vertex colors
    const col = g.attributes.color.array;
    for (let i = 0; i < col.length; i++) col[i] = 0.5 + 0.5 * (col[i] - 0.55) / 0.45;   // gentler than the PS1 bake
    return g;
  }
}
