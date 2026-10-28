// The ultras behind the goal: a packed block on the lower tier that bounces all game, flags on poles
// waving in the team's colors (harder when their team scores), and long banners draped over the
// front railing. Colors only, no club names (the banners say generic things like FORZA). Built per
// ground by grounds.js; everything is instanced or a handful of meshes (about 11 draw calls).
// (Flares were tried and dropped.)
import * as THREE from 'three';
import { ps1, pixelTex, canvasTex } from './ps1.js';
import { drawText, textWidth } from './tex.js';

const FLAG_W = 2.1, FLAG_H = 1.35, POLE = 3.0;
const WORDS = ['FORZA', 'ULTRAS', 'CURVA', 'ALLEZ', 'VAMOS', 'NEVER ALONE', 'ONE LOVE', 'SUPER STARS'];

// A flag design painted in a team's colors: 0 halves, 1 stripes, 2 tricolour, 3 diagonal sash.
function flagTex(cols, design) {
  const [a, b, c] = cols;
  return pixelTex(canvasTex(24, 16, x => {
    x.fillStyle = a; x.fillRect(0, 0, 24, 16);
    x.fillStyle = b;
    if (design === 0) x.fillRect(12, 0, 12, 16);
    if (design === 1) for (let i = 0; i < 24; i += 6) x.fillRect(i + 3, 0, 3, 16);
    if (design === 2) { x.fillRect(8, 0, 8, 16); x.fillStyle = c; x.fillRect(16, 0, 8, 16); }
    if (design === 3) for (let i = 0; i < 24; i++) x.fillRect(i, Math.round(13 - i * 0.6), 1, 5);
  }));
}

// A waving-cloth material: each flag swings on its pole and ripples along its length.
function flagMaterial(map, uniforms) {
  const m = ps1({ map, lit: false, side: THREE.DoubleSide });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    base(sh);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute float aPhase;\nuniform float uTime;\nuniform float uHype;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float along = transformed.x / ${FLAG_W.toFixed(2)};                    // 0 at the pole, 1 at the free end
      float swing = sin(uTime * (1.6 + uHype * 1.8) + aPhase * 6.283) * (0.45 + 0.4 * uHype);
      float rip = sin(uTime * 7.0 - along * 5.0 + aPhase * 20.0) * 0.12 * along;
      vec3 p = transformed;
      p.z += rip;
      float cs = cos(swing), sn = sin(swing);                                 // swing round the pole (local y)
      transformed = vec3(p.x * cs - p.z * sn, p.y - along * along * 0.08, p.x * sn + p.z * cs);`);
  };
  m.customProgramCacheKey = () => 'ps1flag';
  return m;
}

// A long banner for the front wall: stripes in the colors with a word in the pixel font.
function bannerTex(cols, word, i) {
  const W = 128, H = 16;
  return pixelTex(canvasTex(W, H, x => {
    x.fillStyle = cols[0]; x.fillRect(0, 0, W, H);
    x.fillStyle = cols[1];
    if (i % 3 === 0) { x.fillRect(0, 0, W, 3); x.fillRect(0, H - 3, W, 3); }
    else if (i % 3 === 1) for (let s = 0; s < W; s += 16) x.fillRect(s, 0, 8, H);
    else for (let s = 0; s < W; s += 8) x.fillRect(s, (s / 8) % 2 ? 0 : H - 4, 8, 4);
    const tw = textWidth(word, 1), px = Math.round((W - tw) / 2);
    x.fillStyle = cols[0]; x.fillRect(px - 4, 3, tw + 8, 10);
    drawText(x, word, px, 4, cols[1] === '#f2f1ea' ? '#f2f1ea' : cols[1], 1, '#000');
  }));
}

// stand: { len, endZ, tier: [depth, rise], front } for the end stand behind the goal.
// curva: colors of the home ultras (centre-left), block: colors of the away block (right end).
// rand: the ground's seeded random. Returns { group, update(dt, t, hypeHome, hypeAway) }.
export function buildUltras(stand, curva, block, rand) {
  const group = new THREE.Group();
  const { len, endZ, tier: [depth, rise], front } = stand;
  const yAt = d => front + rise * (d / depth);                 // seat height d metres back from the front
  const zAt = d => endZ - d;
  const pal = cols => { const c = cols.filter(Boolean); return [c[0], c.find(x => x !== c[0]) || '#f2f1ea', c[2] || c[0]]; };
  const home = pal(curva), away = pal(block);
  const uniforms = { uTime: { value: 0 }, uHype: { value: 0 } }, uniformsAway = { uTime: uniforms.uTime, uHype: { value: 0 } };

  // flags: the home curva spans the centre-left of the stand, the away block the far right
  const spots = { home: [], away: [] };
  for (let d = 1.2; d < depth - 0.8; d += 1.7) {
    for (let x = -len * 0.34; x < len * 0.08; x += 2.3) if (rand() < 0.8) spots.home.push([x + (rand() - 0.5), d]);
    for (let x = len * 0.24; x < len * 0.46; x += 3.0) if (rand() < 0.6) spots.away.push([x + (rand() - 0.5), d]);
  }
  const geo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, 6, 2);
  geo.translate(FLAG_W / 2, 0, 0);                              // the pole edge at x = 0
  const poleGeo = new THREE.BoxGeometry(0.05, POLE, 0.05);
  const poleSpots = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (const [side, cols, uni] of [['home', home, uniforms], ['away', away, uniformsAway]]) {
    const list = spots[side];
    for (let design = 0; design < 4; design++) {
      const mine = list.filter((_, i) => i % 4 === design);
      if (!mine.length) continue;
      const g = geo.clone();
      const phase = new Float32Array(mine.length).map(() => rand());
      g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
      const mesh = new THREE.InstancedMesh(g, flagMaterial(flagTex(design === 2 ? [cols[0], '#f2f1ea', cols[1]] : cols, design), uni), mine.length);
      mine.forEach(([x, d], i) => {
        q.setFromAxisAngle(v.set(0, 1, 0), (rand() - 0.5) * 0.6);
        mesh.setMatrixAt(i, m4.compose(v.set(x, yAt(d) + POLE - FLAG_H / 2 + 0.2, zAt(d)), q, one));
        poleSpots.push([x, d]);
      });
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, ps1({ color: '#2a2a2a' }), poleSpots.length);
  poleSpots.forEach(([x, d], i) => poles.setMatrixAt(i, m4.compose(v.set(x, yAt(d) + POLE / 2 + 0.2, zAt(d)), q.identity(), one)));
  group.add(poles);

  // banners over the front wall, facing the pitch
  const bannerSpans = [[-len * 0.36, -len * 0.18, home], [-len * 0.16, len * 0.06, home], [len * 0.25, len * 0.44, away]];
  bannerSpans.forEach(([x0, x1, cols], i) => {
    const word = WORDS[Math.floor(rand() * WORDS.length)];
    const h = 1.15, w = h * 8;                                  // the texture is 8:1
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ps1({ map: bannerTex(cols, word, i), lit: false }));
    b.position.set((x0 + x1) / 2, front + h / 2 - 0.05, endZ - 0.12);   // draped over the railing, above the ad boards
    group.add(b);
  });

  return {
    group,
    // hypeHome/Away: 0..1 how wildly each end waves (a goal, a cheer)
    update(dt, t, hypeHome, hypeAway) {
      uniforms.uTime.value = t;
      uniforms.uHype.value = hypeHome; uniformsAway.uHype.value = hypeAway;
    },
  };
}
