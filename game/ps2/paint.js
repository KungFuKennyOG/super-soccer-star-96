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

// Cloth, lit by m (1 = as dyed) with a sheen hi (0..1) on what faces the light. White goes a cool
// grey-green in the folds, the way the kits in the 2003 games were painted, never dirty; colors
// deepen; black cloth still catches the light.
export function tone(c, m, hi = 0) {
  const L = lum(c), cool = clamp01((1 - m) * 1.5) * L, lift = (1 - L) * (1 - L) * (9 + 78 * hi) + 30 * hi * L * (1 - L);
  const k = m > 1 ? 1 : m, over = m > 1 ? (m - 1) * 0.7 : 0, top = Math.max(c[0], c[1], c[2], 1) / 0.6;   // the sheen keeps some of the cloth's color
  const r = lift * (0.4 + c[0] / top), g = lift * (0.4 + c[1] / top), b = lift * (0.44 + c[2] / top);
  c[0] = c[0] * k * (1 - 0.1 * cool) + (255 - c[0]) * over + r;
  c[1] = c[1] * k * (1 - 0.028 * cool) + (255 - c[1]) * over + g;
  c[2] = c[2] * k * (1 - 0.01 * cool) + (255 - c[2]) * over + b;
}

// Fine cloth: grain, and a knit you only see close up. A small tile of it, read at (x, y), about 0.95..1.05.
let GRAIN;
export function grain(x, y) {
  if (!GRAIN) { GRAIN = new Float32Array(4096); for (let i = 0; i < 4096; i++) { const gx = i & 63, gy = i >> 6; GRAIN[i] = 0.952 + 0.034 * hash(gx, gy, 5) + 0.05 * vnoise(gx / 2.667, gy / 2.667, 8, 24) + ((gx + gy) & 1) * 0.012; } }
  return GRAIN[((y & 63) << 6) | (x & 63)];
}

// Cloth as a relief. Folds are pressed into a height map (rolls of cloth with a soft upper slope and a
// steep underside, pinched creases), then the map is lit from above and its hollows are darkened: every
// fold gets a soft highlight, a dark core and a shadow under it without being drawn one by one.
// w, h: the region in pixels. cells: noise cells across the wobble (it wraps, so folds can cross u = 0).
export function relief(w, h, seed = 0, { wobble = 8, cells = 8 } = {}) {
  const H = new Float32Array(w * h), ox = new Float32Array(w * h), oy = new Float32Array(w * h), g = w / cells;
  // the wobble is smooth, so it's worked out on every fourth pixel and stretched (w is a multiple of 4)
  const cw = w >> 2, ch = (h >> 2) + 2, ax = new Float32Array(cw * ch), ay = new Float32Array(cw * ch);
  for (let y = 0, i = 0; y < ch; y++) for (let x = 0; x < cw; x++, i++) {
    const nx = 4 * x / g, ny = 4 * y / g;
    ax[i] = (vnoise(nx, ny, seed + 1, cells) + 0.4 * vnoise(nx * 2, ny * 2, seed + 4, cells * 2) - 0.7) * wobble * 1.5;
    ay[i] = (vnoise(nx, ny, seed + 2, cells) + 0.4 * vnoise(nx * 2, ny * 2, seed + 5, cells * 2) - 0.7) * wobble * 1.5;
  }
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const a = (y >> 2) * cw + (x >> 2), b = (y >> 2) * cw + ((x >> 2) + 1) % cw, tx = (x & 3) / 4, ty = (y & 3) / 4;
    ox[i] = (ax[a] * (1 - tx) + ax[b] * tx) * (1 - ty) + (ax[a + cw] * (1 - tx) + ax[b + cw] * tx) * ty;
    oy[i] = (ay[a] * (1 - tx) + ay[b] * tx) * (1 - ty) + (ay[a + cw] * (1 - tx) + ay[b + cw] * tx) * ty;
  }
  return {
    H, w, h,
    // The same smooth noise as a blotch of light and shade, -1..1.
    blotch: (x, y) => ox[y * w + x] / (wobble * 1.05),
    // A fold from (x1, y1) to (x2, y2), `wd` pixels wide. s: how hard it stands out (below 0: a crease pressed in).
    // sag: how far its middle hangs below the straight line (a share of its length). lean: 1 = a steep
    // underside and a long upper slope, -1 the other way. fan: it widens toward its end (-1..1).
    fold(x1, y1, x2, y2, wd, s, { sag = 0, lean = 0, fan = 0 } = {}) {
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, sg = ux >= 0 ? 1 : -1;
      const pad = wd * (1 + Math.abs(fan)) * 3.2 + wobble * 1.5 + Math.abs(sag) * len;
      const xa = Math.floor(Math.min(x1, x2) - pad), xb = Math.ceil(Math.max(x1, x2) + pad);
      const ya = Math.max(0, Math.floor(Math.min(y1, y2) - pad)), yb = Math.min(h - 1, Math.ceil(Math.max(y1, y2) + pad));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const i = y * w + ((x % w) + w) % w, px = x + ox[i] - x1, py = y + oy[i] - y1, a = (px * ux + py * uy) / len;
        if (a <= 0 || a >= 1) continue;
        const e = 4 * a * (1 - a), wl = wd * (1 + fan * (2 * a - 1)), d = sg * (py * ux - px * uy) - sag * len * e;
        const k = d / (wl * (d > 0 ? 1 - 0.55 * lean : 1 + 0.55 * lean));
        if (k > 3 || k < -3) continue;
        H[i] += s * wl * Math.sqrt(e) * Math.exp(-k * k);
      }
    },
    // The light on it, about -1..1 for each pixel: lit from (lx, ly) (up is ly < 0), hollows darkened.
    light({ lx = -0.35, ly = -0.94, hollow = 1 } = {}) {
      const F = new Float32Array(w * h), near = blur(H, w, h, 3), far = blur(near, w, h, 7);
      for (let y = 0, i = 0; y < h; y++) {
        const up = y > 0 ? -w : 0, dn = y < h - 1 ? w : 0;
        for (let x = 0; x < w; x++, i++) {
          const l = x > 0 ? i - 1 : i + w - 1, r = x < w - 1 ? i + 1 : i - w + 1;
          const v = -0.7 * ((H[r] - H[l]) * lx + (H[i + dn] - H[i + up]) * ly) + hollow * (0.05 * (H[i] - near[i]) + 0.07 * (H[i] - far[i]));
          F[i] = v / (1 + 0.45 * Math.abs(v));
        }
      }
      return F;
    },
  };
}
// A box blur, wrapping across x.
function blur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + (x + w) % w];
    for (let x = 0; x < w; x++) { tmp[y * w + x] = sum / n; sum += src[y * w + (x + r + 1) % w] - src[y * w + (x - r + w) % w]; }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = sum / n; sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
