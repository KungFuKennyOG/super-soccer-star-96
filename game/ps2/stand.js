// A PS2-look stand: steep tiers packed with a painted crowd (a tiling texture on the slope, one
// draw call), a balcony hung with banners, a dark upper tier under the roof, and a run of ad boards
// at pitch level. Words on the boards and banners are the game's own invented ones.
import * as THREE from 'three';
import { AD_WORDS, SKINS } from '../tex.js';
import { canvas, hex, css, hash, smoothTex } from './paint.js';

// A block of fans seen from the pitch: rows of heads and shoulders. colors: mostly the home colors.
function crowdTex(colors) {
  const c = canvas(256, 256), x = c.getContext('2d'), cols = 20, rows = 14, cw = 256 / cols, rh = 256 / rows;
  x.fillStyle = '#0f0c11'; x.fillRect(0, 0, 256, 256);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const h = hash(i, j, 3), px = (i + (j % 2) * 0.5) * cw + (hash(i, j, 4) - 0.5) * 2.4, py = j * rh + 2;
    if (h < 0.05) continue;                                                              // an empty seat now and then
    const shirt = hex(colors[Math.floor(hash(i, j, 5) * colors.length)]).map(v => v * (0.42 + 0.42 * hash(i, j, 6)));
    const skin = hex(SKINS[Math.floor(hash(i, j, 7) * SKINS.length)]).map(v => v * 0.78), up = hash(i, j, 8) < 0.18;
    for (const dx of [0, 256, -256]) {
      x.fillStyle = css(shirt); x.beginPath(); x.ellipse(px + dx + cw / 2, py + rh * 0.86, cw * 0.47, rh * 0.42, 0, 0, 7); x.fill();
      x.fillStyle = css(shirt.map(v => v * 0.6)); x.fillRect(px + dx + cw * 0.08, py + rh * 0.92, cw * 0.84, rh * 0.2);
      if (up) { x.fillStyle = css(skin.map(v => v * 0.9)); x.fillRect(px + dx + cw * 0.05, py + rh * 0.05, 2.2, rh * 0.6); x.fillRect(px + dx + cw * 0.78, py + rh * 0.05, 2.2, rh * 0.6); }   // arms up
      x.fillStyle = css(skin); x.beginPath(); x.ellipse(px + dx + cw / 2, py + rh * 0.33, cw * 0.22, rh * 0.25, 0, 0, 7); x.fill();
      x.fillStyle = css(hex(['#1a110a', '#3b2513', '#0d0d0d', '#9a7034'][Math.floor(hash(i, j, 9) * 4)])); x.beginPath(); x.ellipse(px + dx + cw / 2, py + rh * 0.24, cw * 0.22, rh * 0.17, 0, Math.PI, 0); x.fill();
    }
  }
  // a stairway down the block: pale steps, a rail
  for (let j = 0; j < rows; j++) { x.fillStyle = j % 2 ? '#8d8f96' : '#73757c'; x.fillRect(0, j * rh, 11, rh); x.fillStyle = '#3a3b42'; x.fillRect(0, j * rh + rh - 2, 11, 2); }
  x.fillStyle = '#c9a51e'; x.fillRect(11, 0, 1.5, 256);
  // rows further back sit in the shade of the row in front
  const sh = x.createLinearGradient(0, 0, 0, rh); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.28)');
  for (let j = 0; j < rows; j++) { x.save(); x.translate(0, j * rh); x.fillStyle = sh; x.fillRect(0, 0, 256, rh); x.restore(); }
  return smoothTex(c, { repeat: [1, 1], aniso: 8 });
}
// A dome of sky: pale at the horizon, bluer overhead. One draw call, no texture.
export function buildSky(horizon = '#b9c8d4', top = '#6f9ccb') {
  const g = new THREE.SphereGeometry(380, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), a = new THREE.Color(horizon), b = new THREE.Color(top), col = [];
  for (let i = 0; i < g.attributes.position.count; i++) { const k = Math.min(1, Math.max(0, g.attributes.position.getY(i) / 380) ** 0.6), c = a.clone().lerp(b, k); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}
function stripTex(w, h, panels, draw) {
  const c = canvas(w, h), x = c.getContext('2d');
  for (let i = 0; i < panels; i++) { x.save(); x.translate(i * w / panels, 0); x.beginPath(); x.rect(0, 0, w / panels, h); x.clip(); draw(x, i, w / panels, h); x.restore(); }
  return smoothTex(c, { repeat: [1, 1], aniso: 8 });
}
const word = (x, s, w, h, color, size) => { x.fillStyle = color; x.font = `900 italic ${size}px Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, w / 2, h / 2 + 1, w * 0.9); };
const boardsTex = () => stripTex(2048, 64, 8, (x, i, w, h) => {
  const bg = ['#f3f3f0', '#0d2a8c', '#f3f3f0', '#c4122c', '#111318', '#f3f3f0', '#f0c020', '#f3f3f0'][i], fg = ['#0d2a8c', '#ffffff', '#c4122c', '#ffffff', '#f0c020', '#111318', '#111318', '#1b7a3a'][i];
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, 2, h); x.fillRect(0, h - 3, w, 3);
  word(x, AD_WORDS[i % AD_WORDS.length], w, h, fg, 40);
});
const bannerTex = (home) => stripTex(2048, 64, 8, (x, i, w, h) => {
  x.fillStyle = '#b9b6ae'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, h - 8, w, 8);
  if (i % 4 === 3) return;                                                                 // bare concrete between banners
  x.fillStyle = [home, '#dcdad0', home][i % 3]; x.fillRect(8, 8, w - 16, h - 20);
  word(x, ['FORZA', 'ULTRAS', 'CURVA', 'ALE ALE', 'SEMPRE', 'VAMOS', 'NORTH END', 'ALLEZ'][i], w, h - 6, i % 3 === 1 ? home : '#f1efe6', 30);
});

class Quads {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; }
  // four corners (counter-clockwise seen from the pitch), their uvs [u0, v0, u1, v1] and shade [bottom, top]
  quad(a, b, c, d, uv = [0, 0, 1, 1], shade = [1, 1]) {
    const i = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    this.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    for (const s of [shade[0], shade[0], shade[1], shade[1]]) this.col.push(s, s, s);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return new THREE.Mesh(g, mat);
  }
}

// A straight stand `len` metres long, running along x, its front wall at z = 0 and rising toward -z;
// the ad boards stand 3 m in front of it. home: the home colour. Unlit: the shade is in the colours.
export function buildStand({ len = 80, home = '#c4122c', colors = [home, home, home, '#d8d6cc', '#22222a', home, '#2a2c36', home, '#8a8478', '#22222a'] } = {}) {
  const g = new THREE.Group(), x0 = -len / 2, x1 = len / 2, basic = o => new THREE.MeshBasicMaterial({ vertexColors: true, ...o });
  const crowd = new Quads(), wall = new Quads(), boards = new Quads(), banner = new Quads();
  const per = 9.6, rowsPer = 14 * 0.78;                                                    // one crowd tile: 20 fans wide, 14 rows deep
  const tier = (z0, y0, z1, y1, shade) => crowd.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1], [0, 0, len / per, Math.hypot(z1 - z0, y1 - y0) / rowsPer], shade);
  tier(-0.4, 1.3, -15, 9.6, [0.95, 0.8]);                                                    // lower tier, in the light
  tier(-12.5, 11.6, -24, 22.6, [0.5, 0.2]);                                               // upper tier, under the roof
  wall.quad([x0, 0, 0], [x1, 0, 0], [x1, 1.3, 0], [x0, 1.3, 0], [0, 0, 1, 1], [0.2, 0.26]);              // front wall
  wall.quad([x0, 1.3, 0], [x1, 1.3, 0], [x1, 1.3, -0.4], [x0, 1.3, -0.4], [0, 0, 1, 1], [0.5, 0.5]);
  wall.quad([x0, 9.6, -15], [x1, 9.6, -15], [x1, 9.6, -12.5], [x0, 9.6, -12.5], [0, 0, 1, 1], [0.12, 0.2]);   // the gap under the balcony
  wall.quad([x0, 22.6, -24], [x1, 22.6, -24], [x1, 27, -24], [x0, 27, -24], [0, 0, 1, 1], [0.1, 0.07]);    // back wall
  wall.quad([x0, 27, -26], [x1, 27, -26], [x1, 25.4, -7], [x0, 25.4, -7], [0, 0, 1, 1], [0.08, 0.2]);      // underside of the roof
  wall.quad([x0, 25.4, -7], [x1, 25.4, -7], [x1, 26.5, -7], [x0, 26.5, -7], [0, 0, 1, 1], [0.78, 0.86]);   // roof edge
  banner.quad([x0, 9.6, -12.5], [x1, 9.6, -12.5], [x1, 11.6, -12.5], [x0, 11.6, -12.5], [0, 0, len / 64, 1], [0.8, 0.7]);   // balcony front, hung with banners
  boards.quad([x0, 0, 3], [x1, 0, 3], [x1, 0.95, 3], [x0, 0.95, 3], [0, 0, len / 56, 1], [0.94, 1]);
  wall.quad([x0, 0.95, 3], [x1, 0.95, 3], [x1, 0.95, 2.85], [x0, 0.95, 2.85], [0, 0, 1, 1], [0.3, 0.3]);
  const grey = basic({ color: 0xa8acb4 });
  g.add(crowd.mesh(basic({ map: crowdTex(colors) })), wall.mesh(grey), banner.mesh(basic({ map: bannerTex(home) })), boards.mesh(basic({ map: boardsTex() })));
  // flags held up in the lower tier
  const flags = new Quads();
  for (let i = 0; i < len / 11; i++) {
    const fx = x0 + 3 + i * 11 + hash(i, 1, 2) * 4, d = 1 + hash(i, 2, 2) * 12, y = 1.3 + d * 0.57 + 1.2, z = -0.4 - d, w = 1.1 + hash(i, 3, 2) * 0.5, h = 0.8 + hash(i, 4, 2) * 0.3, lean = (hash(i, 5, 2) - 0.5) * 0.8;
    flags.quad([fx, y, z], [fx + w, y + lean * 0.3, z], [fx + w + lean, y + h + lean * 0.3, z], [fx + lean, y + h, z], [i % 4 / 4, 0, i % 4 / 4 + 0.25, 1], [0.9, 1]);
  }
  const fc = canvas(256, 64), fx2 = fc.getContext('2d');
  [[home, '#f1efe6'], ['#f1efe6', home], [home, home], [home, '#22222a']].forEach(([a, b], i) => { fx2.fillStyle = a; fx2.fillRect(i * 64, 0, 64, 64); fx2.fillStyle = b; if (i % 2) fx2.fillRect(i * 64, 22, 64, 20); else fx2.fillRect(i * 64 + 22, 0, 20, 64); });
  g.add(flags.mesh(basic({ map: smoothTex(fc), side: THREE.DoubleSide })));
  return g;
}
