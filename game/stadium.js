// The ground: striped pitch, painted lines, the goal with a net that bulges, stands full of
// pixel fans, ad boards, floodlights and a night sky. Returns { update(dt), netHit(x, y), cheer(on) }.
import * as THREE from 'three';
import { GOAL, PITCH } from '../rules/tuning.js';
import { ps1, pixelTex } from './ps1.js';
import { grassTex, crowdTex, adTex, netTex, AD_WORDS } from './tex.js';

const LINE = 0.12;

export function buildStadium(scene) {
  scene.background = new THREE.Color('#070b22');
  scene.fog = new THREE.Fog('#0d1433', 50, 140);

  scene.add(new THREE.HemisphereLight('#c8d8ff', '#2a3a20', 0.6));
  const sun = new THREE.DirectionalLight('#fff0d8', 1.05);
  sun.position.set(-20, 40, 10); scene.add(sun);

  scene.add(sky());
  scene.add(pitch());
  scene.add(lines());
  const goal = buildGoal(); scene.add(goal.group);
  const crowd = stands(scene);
  boards(scene);
  floodlights(scene);
  return {
    netHit: goal.hit,
    cheer: on => { crowd.cheer = on; },
    update(dt, t) { goal.update(dt); crowd.update(t); },
  };
}

function sky() {
  const g = new THREE.SphereGeometry(180, 12, 8);
  const col = [], p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = THREE.MathUtils.clamp(p.getY(i) / 180, 0, 1);
    const c = new THREE.Color('#2a3a78').lerp(new THREE.Color('#04061a'), Math.pow(k, 0.6));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(g, ps1({ lit: false, vertexColors: true, side: THREE.BackSide, fog: false }));
}

function pitch() {
  const W = 60, D = 56; // grass beyond the lines too
  const g = new THREE.PlaneGeometry(W, D, 20, 18);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, GOAL.z + D / 2 - 8);
  const t = grassTex().clone(); t.needsUpdate = true;
  pixelTex(t, [W / 7, D / 12]);
  // bands start on the goal line
  t.offset.set(0, 0.5);
  return new THREE.Mesh(g, ps1({ map: t }));
}

// All the white paint as thin quads in one mesh.
function lines() {
  const pos = [];
  const quad = (x1, z1, x2, z2) => {
    const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz), nx = -dz / l * LINE / 2, nz = dx / l * LINE / 2;
    const y = 0.015;
    pos.push(x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz, x2 + nx, y, z2 + nz, x2 + nx, y, z2 + nz, x1 - nx, y, z1 - nz, x2 - nx, y, z2 - nz);
  };
  const arc = (cx, cz, r, a0, a1, n = 16) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n;
      quad(cx + Math.sin(a) * r, cz + Math.cos(a) * r, cx + Math.sin(b) * r, cz + Math.cos(b) * r);
    }
  };
  const W = PITCH.halfW, G = GOAL.z;
  quad(-W, G, W, G); quad(-W, G, -W, 0); quad(W, G, W, 0); quad(-W, 0, W, 0);
  // penalty box, six-yard box, spots
  quad(-16, G, -16, G + 16.5); quad(16, G, 16, G + 16.5); quad(-16, G + 16.5, 16, G + 16.5);
  quad(-9.16, G, -9.16, G + 5.5); quad(9.16, G, 9.16, G + 5.5); quad(-9.16, G + 5.5, 9.16, G + 5.5);
  quad(-0.12, G + 11, 0.12, G + 11); quad(-0.12, -0.0, 0.12, -0.0);
  arc(0, G + 11, 9.15, -0.93, 0.93, 10);         // the D
  arc(0, 0, 9.15, Math.PI / 2, Math.PI * 1.5, 18); // our half of the centre circle
  arc(-W, G, 1, 0, Math.PI / 2, 4); arc(W, G, 1, -Math.PI / 2, 0, 4); // corners
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, ps1({ color: '#e8e8dc', side: THREE.DoubleSide }));
}

function buildGoal() {
  const group = new THREE.Group();
  const white = ps1({ color: '#f4f4f4' });
  const P = 0.12, H = GOAL.h, HW = GOAL.halfW, Dp = GOAL.depth;
  const box = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white); m.position.set(x, y, z); group.add(m); };
  box(P, H + P / 2, P, -HW - P / 2, H / 2, GOAL.z);
  box(P, H + P / 2, P, HW + P / 2, H / 2, GOAL.z);
  box(HW * 2 + P * 2, P, P, 0, H + P / 2, GOAL.z);
  // net supports
  const grey = ps1({ color: '#9a9a9a' });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, Dp), grey);
    m.position.set(s * (HW + 0.05), H, GOAL.z - Dp / 2); group.add(m);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, 0.05), grey);
    b.position.set(s * (HW + 0.05), H / 2, GOAL.z - Dp); group.add(b);
  }

  const netMat = ps1({ map: netTex(), alphaTest: 0.5, side: THREE.DoubleSide, lit: false, color: '#dcdcdc' });
  const backG = new THREE.PlaneGeometry(HW * 2, H, 18, 6);
  const back = new THREE.Mesh(backG, netMat); back.position.set(0, H / 2, GOAL.z - Dp); group.add(back);
  const rest = backG.attributes.position.array.slice();
  const top = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, Dp), netMat);
  top.rotation.x = -Math.PI / 2; top.position.set(0, H, GOAL.z - Dp / 2); group.add(top);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(Dp, H), netMat);
    side.rotation.y = Math.PI / 2; side.position.set(s * HW, H / 2, GOAL.z - Dp / 2); group.add(side);
  }

  let hitAt = null, age = 9;
  return {
    group,
    hit(x, y) { hitAt = { x, y: y - H / 2 }; age = 0; },
    update(dt) {
      if (age > 1.6) return;
      age += dt;
      const p = backG.attributes.position.array;
      const amp = age > 1.6 ? 0 : 0.6 * Math.exp(-age * 3) * Math.cos(age * 14);
      for (let i = 0; i < p.length; i += 3) {
        const d2 = (rest[i] - hitAt.x) ** 2 + (rest[i + 1] - hitAt.y) ** 2;
        p[i + 2] = rest[i + 2] - amp * Math.exp(-d2 * 1.2);
      }
      backG.attributes.position.needsUpdate = true;
    },
  };
}

// Stands on all four sides. The goal end is tallest. Crowd swaps between two frames when cheering.
function stands(scene) {
  const frames = [crowdTex(0), crowdTex(1)];
  const meshes = [];
  const concrete = ps1({ color: '#5a5a66' }), roof = ps1({ color: '#2a2a34' });
  const W = PITCH.halfW;

  // one sloped bank: a box, rotated, with crowd on its face. at: centre of the front-bottom edge.
  const bank = (len, depth, rise, x, z, yaw) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
    const slope = Math.hypot(depth, rise), ang = Math.atan2(rise, depth);
    const geo = new THREE.PlaneGeometry(len, slope, 8, 4);
    const crowdM = frames.map(f => ps1({ map: pixelTex(f.clone(), [len / 7, slope / 7]), lit: false, color: '#c4c4c4' }));
    const face = new THREE.Mesh(geo, crowdM[0]);
    face.rotation.x = -(Math.PI / 2 - ang); face.position.set(0, 1.2 + rise / 2, -depth / 2);
    g.add(face); meshes.push({ face, crowdM });
    const front = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, 0.3), concrete); front.position.set(0, 0.6, 0); g.add(front);
    const backW = new THREE.Mesh(new THREE.BoxGeometry(len, rise + 4, 0.6), concrete); backW.position.set(0, (rise + 4) / 2, -depth - 0.3); g.add(backW);
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, depth * 0.7), roof); r.position.set(0, rise + 4.5, -depth * 0.7); g.add(r);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, 0.15), ps1({ color: '#ffe9a0', lit: false }));
    edge.position.set(0, rise + 4.3, -depth * 0.35); g.add(edge);
  };
  bank(70, 16, 13, 0, GOAL.z - 5.5, 0);            // behind the goal
  bank(66, 14, 10, -(W + 4.5), GOAL.z + 30, Math.PI / 2);
  bank(66, 14, 10, W + 4.5, GOAL.z + 30, -Math.PI / 2);
  bank(70, 14, 9, 0, 7, Math.PI);                  // behind you

  return {
    cheer: false,
    update(t) {
      const f = this.cheer ? Math.floor(t * 9) % 2 : 0;
      for (const m of meshes) m.face.material = m.crowdM[f];
    },
  };
}

function boards(scene) {
  const W = PITCH.halfW + 1.6, Z = GOAL.z - 3.2, L = 6;
  let i = 0;
  const board = (x, z, yaw) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(L - 0.1, 0.9, 0.12), [null, null, null, null, null, null].map((_, f) => f === 4 ? ps1({ map: adTex(i), lit: false }) : ps1({ color: '#202028' })));
    m.position.set(x, 0.45, z); m.rotation.y = yaw; scene.add(m); i = (i + 1) % AD_WORDS.length;
  };
  for (let x = -W + L / 2; x < W; x += L) board(x, Z, 0);
  for (let z = Z + L / 2; z < 4; z += L) { board(-W, z, Math.PI / 2); board(W, z, -Math.PI / 2); }
}

function floodlights(scene) {
  const pole = ps1({ color: '#3a3a44' }), lamp = ps1({ color: '#fffbe0', lit: false });
  for (const [x, z] of [[-34, GOAL.z - 14], [34, GOAL.z - 14], [-34, 12], [34, 12]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 34, 0.8), pole); p.position.set(x, 17, z); scene.add(p);
    const head = new THREE.Group(); head.position.set(x, 35, z); head.lookAt(0, 0, GOAL.z + 16); scene.add(head);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 0.5), pole); head.add(frame);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), lamp);
      l.position.set(-2.1 + c * 1.4, -0.7 + r * 1.4, 0.26); head.add(l);
    }
  }
}
