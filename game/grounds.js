// Stadiums built from recipes: stand layout and tiers, roof, floodlights, time of day, pitch mowing,
// seat colors, and a crowd of little fan dots that bob all game and jump when their team scores.
// Every club has its own ground; the default ground is for the World Cup and nations.
import * as THREE from 'three';
import { GOAL, PITCH } from '../rules/tuning.js';
import { ps1, pixelTex, canvasTex } from './ps1.js';

// Stand shapes. Each tier is [depth, rise] in metres; later tiers sit above and behind the one before.
const ENGLISH = { gap: 2.5, end: [[13, 9], [9, 8]], side: [[11, 7], [8, 7]], near: [[11, 7]], corners: false, roof: 'full', lights: 'pylons' };
const BOWL = { gap: 4.5, end: [[12, 8], [12, 10]], side: [[12, 8], [11, 9]], near: [[12, 8], [10, 8]], corners: true, roof: 'half', lights: 'roof' };
const TIGHT = { gap: 2, end: [[16, 14]], side: [[15, 13]], near: [[15, 12]], corners: true, roof: 'full', lights: 'roof' };
const TRACK = { gap: 10, end: [[14, 8], [8, 6]], side: [[14, 8]], near: [[14, 8]], corners: true, roof: 'half', lights: 'pylons', track: true };
const OLD = { gap: 3, end: [[16, 13]], side: [[14, 10]], near: [[14, 9]], corners: false, roof: 'half', lights: 'pylons' };

export const GROUNDS = {
  default: { name: 'NATIONAL STADIUM', ...OLD, time: 'night', mow: 'stripes', seats: ['#3a3a4a', '#30303c'] },
  MAD: { name: 'MADRID', ...BOWL, end: [[12, 9], [12, 11]], time: 'night', mow: 'checks', seats: ['#f2f1ea', '#2b2f6b'] },
  BAR: { name: 'BARCELONA', ...BOWL, end: [[12, 8], [11, 9], [10, 9]], side: [[12, 8], [11, 9], [9, 8]], roof: 'none', time: 'night', mow: 'wide', seats: ['#1d3f94', '#9a1c3c'] },
  MUN: { name: 'MUNICH', ...BOWL, roof: 'full', time: 'dusk', mow: 'stripes', seats: ['#d00027', '#e8e8e8'] },
  MILAN: { name: 'MILAN', ...BOWL, end: [[10, 7], [10, 8], [9, 8]], side: [[10, 7], [10, 8], [9, 8]], roof: 'full', towers: true, time: 'night', mow: 'stripes', seats: ['#c4161c', '#0a3ea0'] },
  MAN: { name: 'MANCHESTER', ...ENGLISH, time: 'night', mow: 'stripes', seats: ['#d0101e', '#a00c18'] },
  LIV: { name: 'LIVERPOOL', ...ENGLISH, end: [[22, 17]], time: 'night', mow: 'wide', seats: ['#c8102e', '#e8e8e8'] },
  LDR: { name: 'LONDON RED', ...ENGLISH, time: 'day', mow: 'stripes', seats: ['#db0007', '#f2f1ea'] },
  LDB: { name: 'LONDON BLUE', ...ENGLISH, end: [[12, 9]], time: 'dusk', mow: 'stripes', seats: ['#034694', '#1a5ab0'] },
  TUR: { name: 'TURIN', ...TRACK, time: 'night', mow: 'wide', seats: ['#161618', '#f2f1ea'] },
  DOR: { name: 'DORTMUND', ...ENGLISH, end: [[26, 24]], time: 'night', mow: 'stripes', seats: ['#fde100', '#161618'] },
  PAR: { name: 'PARIS', ...BOWL, roof: 'full', time: 'night', mow: 'checks', seats: ['#0b2a5b', '#c8102e'] },
  AMS: { name: 'AMSTERDAM', ...BOWL, roof: 'full', time: 'day', mow: 'stripes', seats: ['#d2122e', '#f2f1ea'] },
  PRT: { name: 'PORTO', ...BOWL, end: [[12, 8], [10, 9]], time: 'night', mow: 'wide', seats: ['#1f3e93', '#f2f1ea'] },
  LIS: { name: 'LISBON', ...BOWL, time: 'day', mow: 'stripes', seats: ['#c8102e', '#f2f1ea'] },
  GLA: { name: 'GLASGOW', ...TIGHT, time: 'night', mow: 'checks', seats: ['#1b7a3a', '#f2f1ea'] },
};
export const groundFor = id => GROUNDS[id === 'MRB' || id === 'MBB' ? 'MILAN' : id] || GROUNDS.default;

export const TIMES = {
  night: { bg: '#070b22', fog: ['#0d1433', 50, 140], sky: ['#2a3a78', '#04061a'], hemi: ['#c8d8ff', '#2a3a20', 0.6], sun: ['#fff0d8', 1.05], lamps: true },
  dusk: { bg: '#3a2a4a', fog: ['#5a3a50', 60, 160], sky: ['#ff9a5a', '#241a48'], hemi: ['#ffd8c0', '#3a3020', 0.7], sun: ['#ffc890', 1.1], lamps: true },
  day: { bg: '#7ab0e8', fog: ['#a8c8e8', 80, 200], sky: ['#d8ecff', '#3a7ad0'], hemi: ['#ffffff', '#3a5a2a', 0.95], sun: ['#ffffff', 1.15], lamps: false },
};

const MAX_FANS = 11000;

// The crowd material: a PS1 material whose vertices hop. aOurs is 1 for your fans; uJumpOurs and
// uJumpTheirs (0..1) say how hard each set of fans is jumping.
function crowdMaterial(uniforms) {
  const m = ps1({ lit: false });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    base(sh);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute float aOurs;\nattribute float aPhase;\nuniform float uTime;\nuniform float uJumpOurs;\nuniform float uJumpTheirs;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float jump = mix(uJumpTheirs, uJumpOurs, aOurs);
        transformed.y += jump * max(0.0, sin(uTime * 9.0 + aPhase * 6.283)) * 0.5 + 0.04 * sin(uTime * 2.3 + aPhase * 40.0);`);
  };
  m.customProgramCacheKey = () => 'ps1crowd';
  return m;
}

function seatTex(a, b) {
  return pixelTex(canvasTex(8, 8, c => {
    c.fillStyle = '#1a1a22'; c.fillRect(0, 0, 8, 8);
    for (let y = 0; y < 8; y += 2) for (let x = 0; x < 8; x++) { c.fillStyle = ((x >> 2) + (y >> 2)) % 2 ? a : b; c.fillRect(x, y, 1, 1); }
  }));
}

// recipe: from GROUNDS. ours/theirs: arrays of fan colors. oursShare: 0..1 of seats for your fans.
export function buildGround(recipe, ours, theirs, oursShare) {
  const group = new THREE.Group();
  const concrete = ps1({ color: '#5a5a66' }), roofM = ps1({ color: '#2a2a34' }), lamp = ps1({ color: '#fffbe0', lit: false });
  const seats = seatTex(...recipe.seats);
  const facade = ps1({ color: recipe.seats[0] });
  const W = PITCH.halfW, gap = recipe.gap, front = 1.2;
  const fans = [];             // [x, y, z, yaw, ours]
  const uniforms = { uTime: { value: 0 }, uJumpOurs: { value: 0 }, uJumpTheirs: { value: 0 } };
  let rnd = 1;
  const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  let topY = 0;

  // one stand: tiers rising away from the pitch. at (x, z) is the middle of its front edge; yaw faces the pitch.
  let board = null;             // where the scoreboard hangs: under the end stand's roof edge, or over its back
  function stand(len, x, z, yaw, tiers, awayBlock, isEnd = false) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; group.add(g);
    let baseY = front, baseZ = 0;
    const fr = new THREE.Mesh(new THREE.BoxGeometry(len, front, 0.3), concrete); fr.position.set(0, front / 2, 0); g.add(fr);
    tiers.forEach(([depth, rise], i) => {
      const slope = Math.hypot(depth, rise), ang = Math.atan2(rise, depth);
      const t = seats.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 1.4, slope / 1.4);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(len, slope), ps1({ map: t, lit: false, color: '#9a9aa8' }));
      face.rotation.x = -(Math.PI / 2 - ang); face.position.set(0, baseY + rise / 2, baseZ - depth / 2);
      g.add(face);
      // the fans on this tier
      for (let d = 0.6; d < depth - 0.3; d += 0.95) for (let s = -len / 2 + 0.5; s < len / 2 - 0.5; s += 0.62) {
        if (rand() < 0.12) continue;
        const ours = awayBlock && s > len * 0.15 ? rand() < 0.15 : rand() < oursShare;
        const lp = new THREE.Vector3(s + (rand() - 0.5) * 0.15, baseY + rise * (d / depth) + 0.3, baseZ - d);
        fans.push({ lp, g, ours });
      }
      const top = baseY + rise;
      topY = Math.max(topY, top);
      if (i < tiers.length - 1) {
        // the next tier hangs over the back of this one, with a band in the club's colors under it
        const nz = baseZ - depth * 0.6, ny = top + 1.6;
        const band = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 0.4), facade); band.position.set(0, ny - 0.8, nz); g.add(band);
        baseY = ny; baseZ = nz;
      } else {
        const back = new THREE.Mesh(new THREE.BoxGeometry(len, top + 3, 0.6), concrete);
        back.position.set(0, (top + 3) / 2, baseZ - depth - 0.3); g.add(back);
        const totalDepth = -(baseZ - depth);
        if (recipe.roof !== 'none') {
          const span = recipe.roof === 'full' ? totalDepth + 2 : totalDepth * 0.55;
          const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, span), roofM);
          r.position.set(0, top + 4, -(totalDepth + 0.6) + span / 2); g.add(r);
          const edge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.18), lamp);
          edge.position.set(0, top + 3.7, -(totalDepth + 0.6) + span); g.add(edge);
          if (isEnd) board = { y: top + 3.7 - 4.2, z: z - (totalDepth + 0.6) + span + 0.6 };
          if (recipe.lights === 'roof') for (let s = -len / 2 + 3; s < len / 2; s += 6) {
            const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.2), lamp); l.position.set(s, top + 3.3, -(totalDepth + 0.6) + span - 0.2); l.rotation.x = 0.5; g.add(l);
          }
        }
        if (recipe.roof === 'none' && isEnd) board = { y: top + 7, z: z + baseZ - depth - 1 };
        if (recipe.roof === 'none' && recipe.lights === 'roof') {
          // no roof: a ring of lamps on poles along the top
          for (let s = -len / 2 + 4; s < len / 2; s += 8) {
            const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), concrete); pole.position.set(s, top + 3, baseZ - depth); g.add(pole);
            const l = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.3), lamp); l.position.set(s, top + 6.2, baseZ - depth + 0.2); l.rotation.x = 0.6; g.add(l);
          }
        }
      }
    });
    g.updateMatrixWorld(true);
  }

  const endZ = GOAL.z - 3.4 - gap, sideX = W + 1.8 + gap, nearZ = 7 + gap, midZ = (GOAL.z + 7) / 2;
  stand(2 * sideX, 0, endZ, 0, recipe.end, true, true);                 // behind the goal (away fans' block at one end)
  stand(nearZ - endZ, -sideX, midZ, Math.PI / 2, recipe.side, false);
  stand(nearZ - endZ, sideX, midZ, -Math.PI / 2, recipe.side, false);
  stand(2 * sideX, 0, nearZ, Math.PI, recipe.near, false);              // behind you
  if (recipe.corners) {
    const c = 9;
    for (const [sx, sz, yaw] of [[-1, endZ, Math.PI / 4], [1, endZ, -Math.PI / 4], [-1, nearZ, Math.PI * 0.75], [1, nearZ, -Math.PI * 0.75]]) {
      stand(c * 1.6, sx * (sideX + c * 0.4), sz + (sz < 0 ? -c * 0.4 : c * 0.4), yaw, recipe.side.slice(0, 1), false);
    }
  }
  if (recipe.track) {
    // a running track in the space between the pitch and the stands
    const tm = ps1({ color: '#a8402a' }), inX = W + 4, inZ0 = GOAL.z - 6, inZ1 = 3;
    const strip = (x0, x1, z0, z1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), tm);
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.006, (z0 + z1) / 2); group.add(m);
    };
    strip(-sideX, -inX, endZ, nearZ); strip(inX, sideX, endZ, nearZ);
    strip(-inX, inX, endZ, inZ0); strip(-inX, inX, inZ1, nearZ);
  }
  if (recipe.towers) {
    for (const [x, z] of [[-sideX - 8, endZ - 8], [sideX + 8, endZ - 8], [-sideX - 8, nearZ + 8], [sideX + 8, nearZ + 8]]) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, topY + 8, 10), concrete); tw.position.set(x, (topY + 8) / 2, z); group.add(tw);
    }
  }
  if (recipe.lights === 'pylons') {
    const pole = ps1({ color: '#3a3a44' });
    for (const [x, z] of [[-sideX - 12, endZ - 10], [sideX + 12, endZ - 10], [-sideX - 12, nearZ + 6], [sideX + 12, nearZ + 6]]) {
      const h = topY + 16;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), pole); p.position.set(x, h / 2, z); group.add(p);
      const head = new THREE.Group(); head.position.set(x, h + 1, z); head.lookAt(0, 0, GOAL.z + 16); group.add(head);
      head.add(new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 0.5), pole));
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), lamp); l.position.set(-2.1 + c * 1.4, -0.7 + r * 1.4, 0.26); head.add(l);
      }
    }
  }

  // all the fans as one instanced mesh
  const n = Math.min(MAX_FANS, fans.length);
  const geo = new THREE.PlaneGeometry(0.34, 0.5);
  const phase = new Float32Array(n), oursA = new Float32Array(n);
  const crowd = new THREE.InstancedMesh(geo, crowdMaterial(uniforms), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), wp = new THREE.Vector3(), col = new THREE.Color(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) {
    const f = fans[i];
    wp.copy(f.lp).applyMatrix4(f.g.matrixWorld);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.g.rotation.y);
    crowd.setMatrixAt(i, m.compose(wp, q, one));
    const pal = f.ours ? ours : theirs;
    crowd.setColorAt(i, col.set(rand() < 0.12 ? '#e8c8a0' : pal[Math.floor(rand() * pal.length)]));
    phase[i] = rand(); oursA[i] = f.ours ? 1 : 0;
  }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aOurs', new THREE.InstancedBufferAttribute(oursA, 1));
  crowd.frustumCulled = false;
  group.add(crowd);

  return {
    group, recipe, topY, endZ, sideX,
    board: board || { y: Math.max(29, topY + 10), z: GOAL.z - 22 },
    lamps: lamp,
    uniforms,
  };
}
