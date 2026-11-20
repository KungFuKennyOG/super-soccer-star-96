// Painting helpers for the PS2 look: textures are painted in code at a few hundred pixels and filtered
// (bilinear, mipmaps), with the light and shade painted in, the way 2003 console games did it.
import * as THREE from 'three';

export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const gauss = (v, c, w) => { const k = (v - c) / w; return Math.exp(-k * k); };
export const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const css = c => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`;
export const lum = c => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;

export function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth value noise. px > 0 wraps it every px cells across x (no seam round a limb).
export function vnoise(x, y, seed = 0, px = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = v => (px ? ((v % px) + px) % px : v);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(w(xi), yi, seed), b = hash(w(xi + 1), yi, seed), c = hash(w(xi), yi + 1, seed), d = hash(w(xi + 1), yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y, seed = 0, px = 0) =>
  0.55 * vnoise(x, y, seed, px) + 0.3 * vnoise(x * 2, y * 2, seed + 3, px * 2) + 0.15 * vnoise(x * 4, y * 4, seed + 7, px * 4);

export function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}
// Runs fn(u, v, rgb, px, py) over a rectangle of the canvas; rgb is the pixel there, changed in place.
export function eachPixel(ctx, r, fn) {
  const img = ctx.getImageData(r.x, r.y, r.w, r.h), d = img.data, c = [0, 0, 0];
  for (let py = 0; py < r.h; py++) for (let px = 0; px < r.w; px++) {
    const i = (py * r.w + px) * 4;
    c[0] = d[i]; c[1] = d[i + 1]; c[2] = d[i + 2];
    const a = fn((px + 0.5) / r.w, (py + 0.5) / r.h, c, px, py);          // may return an alpha (0..255)
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a === undefined ? 255 : a;
  }
  ctx.putImageData(img, r.x, r.y);
}
// Light and shade on cloth: white goes cool grey in the folds instead of dirty, colors deepen.
export function shadeCloth(c, m) {
  const cool = clamp01((1 - m) * 1.6) * lum(c);
  c[0] *= m * (1 - 0.07 * cool); c[1] *= m * (1 - 0.03 * cool); c[2] *= m * (1 + 0.05 * cool);
}
// Skin goes warmer and redder in the shade.
export function shadeSkin(c, m) {
  const d = clamp01(1 - m);
  c[0] *= m * (1 + 0.1 * d); c[1] *= m * (1 - 0.06 * d); c[2] *= m * (1 - 0.14 * d);
}
// A filtered texture (the opposite of ps1.js's hard pixels).
export function smoothTex(src, { repeat, aniso = 4 } = {}) {
  const t = src.isTexture ? src : new THREE.CanvasTexture(src);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.needsUpdate = true;
  return t;
}

// Folds painted into cloth. A fold is a soft ridge along a line: light on the side facing up, dark below.
// folds: [[x1, y1, x2, y2, width, strength]] in pixels. Returns fn(x, y) → about -1..1.
export function foldField(folds, seed = 0) {
  const pre = folds.map(([x1, y1, x2, y2, w, s]) => {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    return { x1, y1, ux: dx / len, uy: dy / len, len, w, s, r: w * 3 };
  });
  return (x, y) => {
    const wx = x + (vnoise(x / 23, y / 23, seed + 1) - 0.5) * 9, wy = y + (vnoise(x / 23, y / 23, seed + 2) - 0.5) * 9;
    let v = 0;
    for (const f of pre) {
      const px = wx - f.x1, py = wy - f.y1, along = px * f.ux + py * f.uy;
      if (along < -f.r || along > f.len + f.r) continue;
      const d = px * -f.uy + py * f.ux;
      if (d > f.r || d < -f.r) continue;
      const a = along / f.len, taper = a < 0 || a > 1 ? 0 : Math.sin(Math.PI * a) ** 0.6, k = d / f.w;
      v += f.s * taper * (-1.7 * k * Math.exp(-k * k) + 0.25 * Math.exp(-k * k * 0.5));
    }
    return v;
  };
}
