// Every texture in the game, painted in code at PS1 sizes (8–128 px), plus a 5x7 bitmap font.
import { canvasTex, pixelTex } from './ps1.js';

/* ---------- 5x7 bitmap font ---------- */

const GLYPHS = {
  A: '0E1111 1F1111 11', B: '1E1111 1E1111 1E', C: '0E1110 101011 0E', D: '1E1111 111111 1E',
  E: '1F1010 1E1010 1F', F: '1F1010 1E1010 10', G: '0E1110 171111 0F', H: '111111 1F1111 11',
  I: '0E0404 040404 0E', J: '070202 020212 0C', K: '111214 181412 11', L: '101010 101010 1F',
  M: '111B15 151111 11', N: '111119 151311 11', O: '0E1111 111111 0E', P: '1E1111 1E1010 10',
  Q: '0E1111 111512 0D', R: '1E1111 1E1412 11', S: '0F1010 0E0101 1E', T: '1F0404 040404 04',
  U: '111111 111111 0E', V: '111111 11110A 04', W: '111111 151515 0A', X: '11110A 040A11 11',
  Y: '11110A 040404 04', Z: '1F0102 040810 1F', 0: '0E1113 151911 0E', 1: '040C04 040404 0E',
  2: '0E1101 020408 1F', 3: '1F0204 020111 0E', 4: '02060A 121F02 02', 5: '1F101E 010111 0E',
  6: '060810 1E1111 0E', 7: '1F0102 040808 08', 8: '0E1111 0E1111 0E', 9: '0E1111 0F0102 0C',
  ':': '000C0C 000C0C 00', '!': '040404 040400 04', '+': '000404 1F0404 00', '-': '000000 1F0000 00',
  '.': '000000 00000C 0C', '/': '010102 040810 10', "'": '040408 000000 00', '?': '0E1101 020400 04',
  '*': '00150E 1F0E15 00', ' ': '000000 000000 00', '<': '020408 100804 02', '>': '080402 010204 08',
  '(': '020408 080804 02', ')': '080402 020204 08', ',': '000000 000C04 08',
};
const ROWS = {};
for (const [ch, s] of Object.entries(GLYPHS)) {
  const h = s.replace(/ /g, '');
  ROWS[ch] = Array.from({ length: 7 }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
}

// Width in pixels of text at scale s (6 px per character including the gap).
export const textWidth = (str, s = 1) => str.length * 6 * s - s;

// Draws text with its top-left at (x, y). shadow: a color drawn one pixel down-right first.
export function drawText(ctx, str, x, y, color, s = 1, shadow) {
  if (shadow) drawText(ctx, str, x + s, y + s, shadow, s);
  // color may be a function of the glyph row (0..6) for chrome-style gradients
  const rowColor = typeof color === 'function' ? color : () => color;
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const rows = ROWS[ch] || ROWS['?'];
    for (let r = 0; r < 7; r++) {
      ctx.fillStyle = rowColor(r);
      for (let b = 0; b < 5; b++) if (rows[r] & (16 >> b)) ctx.fillRect(cx + b * s, y + r * s, s, s);
    }
    cx += 6 * s;
  }
}

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

// Paint a texture pixel by pixel: fn(x, y) returns [r, g, b] (0..255) or null to leave it clear.
export function paint(w, h, fn) {
  return canvasTex(w, h, c => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = fn(x, y); if (!v) continue;
      const i = (y * w + x) * 4;
      img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}
export const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const mul = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
export const hash = (x, y, s = 0) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };

export const SKINS = ['#e9be98', '#d39c6e', '#b07a4e', '#84532f', '#5c3620'];
export const HAIRS = ['#1a110a', '#3b2513', '#9a7034', '#0d0d0d', '#5e2f16'];


/* ---------- the stadium ---------- */

// 32x64: light band on top, dark band below, speckled. Repeat it for mown stripes.
export const grassTex = () => once('grass', () => pixelTex(canvasTex(32, 64, (c, w, h) => {
  c.fillStyle = '#3d8a2a'; c.fillRect(0, 0, w, h / 2);
  c.fillStyle = '#28641c'; c.fillRect(0, h / 2, w, h / 2);
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 360; i++) {
    const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h), top = y < h / 2;
    c.fillStyle = top ? (rnd() < 0.5 ? '#46962f' : '#357d25') : (rnd() < 0.5 ? '#2e6e20' : '#235a18');
    c.fillRect(x, y, 1, 1);
  }
})));

// A block of fans: little two-tone people in rows. frame 0/1 shift the heads for the goal bounce.
export function crowdTex(frame = 0) {
  return once('crowd' + frame, () => pixelTex(canvasTex(32, 32, (c, w, h) => {
    c.fillStyle = '#1a1a26'; c.fillRect(0, 0, w, h);
    const tops = ['#f2f1ea', '#f2f1ea', '#1d3f94', '#9a1c3c', '#d9b23a', '#c83030', '#3a7ad0', '#e8e050', '#888888'];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let y = 0; y < h; y += 4) for (let x = (y / 4) % 2; x < w; x += 2) {
      const up = frame && rnd() < 0.6 ? 1 : 0;
      c.fillStyle = tops[Math.floor(rnd() * tops.length)]; c.fillRect(x, y + 2 - up, 1, 2);
      c.fillStyle = SKINS[Math.floor(rnd() * 3)]; c.fillRect(x, y + 1 - up, 1, 1);
    }
  }), [1, 1]));
}

export const AD_WORDS = ['SUPER STAR 96', 'KENNY COLA', 'TOP BINS FM', 'PIXEL TV', 'MONTREAL', 'TURBO GUM', 'MEMORY CARD', 'NITRO BOOTS'];
export function adTex(i) {
  return once('ad' + i, () => pixelTex(canvasTex(128, 16, (c, w, h) => {
    const bgs = ['#c8102e', '#0a2a8a', '#f2c21a', '#111111', '#1f8a3a', '#e05a10', '#5a1a8a', '#e8e8e8'];
    const fgs = ['#ffffff', '#f2c21a', '#111111', '#e8e050', '#ffffff', '#ffffff', '#f2c21a', '#c8102e'];
    c.fillStyle = bgs[i % 8]; c.fillRect(0, 0, w, h);
    const s = AD_WORDS[i % AD_WORDS.length];
    drawText(c, s, Math.round((w - textWidth(s)) / 2), 4, fgs[i % 8], 1, i % 8 === 2 || i % 8 === 7 ? null : '#000');
  })));
}

// Net mesh with cut-out holes (use alphaTest).
export const netTex = () => once('net', () => pixelTex(canvasTex(8, 8, c => {
  c.clearRect(0, 0, 8, 8); c.fillStyle = '#f0f0f0'; c.fillRect(0, 0, 8, 1); c.fillRect(0, 0, 1, 8);
}), [24, 8]));

/* ---------- markers ---------- */

export const ringTex = () => once('ring', () => pixelTex(canvasTex(32, 32, c => {
  c.fillStyle = '#ffffff';
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
    if (d > 12.5 && d < 15.5) c.fillRect(x, y, 1, 1);
  }
})));

export const blobTex = () => once('blob', () => pixelTex(canvasTex(16, 16, c => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8) / 8;
    if (d < 1) { c.fillStyle = `rgba(0,0,0,${(0.55 * (1 - d * d)).toFixed(2)})`; c.fillRect(x, y, 1, 1); }
  }
})));

export const arrowTex = () => once('arrow', () => pixelTex(canvasTex(16, 16, c => {
  c.fillStyle = '#000'; for (let y = 0; y < 9; y++) c.fillRect(y, 3 + y, 16 - y * 2, 1);
  c.fillStyle = '#f2c21a'; for (let y = 1; y < 8; y++) c.fillRect(y + 1, 3 + y, 14 - y * 2 - 2, 1);
})));

export const reticleTex = () => once('reticle', () => pixelTex(canvasTex(16, 16, c => {
  c.fillStyle = '#ffffff';
  c.fillRect(7, 0, 2, 5); c.fillRect(7, 11, 2, 5); c.fillRect(0, 7, 5, 2); c.fillRect(11, 7, 5, 2);
  c.fillStyle = '#c8102e'; c.fillRect(7, 7, 2, 2);
})));
