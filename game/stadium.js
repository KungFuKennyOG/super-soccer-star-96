// The ground: striped pitch, painted lines, the goal with a net that bulges, ad boards and the sky.
// The stands, roofs, lights and crowd come from a recipe (grounds.js) and change with setGround().
import * as THREE from 'three';
import { GOAL, PITCH } from '../rules/tuning.js';
import { ps1, pixelTex } from './ps1.js';
import { grassTex, adTex, netTex, AD_WORDS } from './tex.js';
import { buildGround, TIMES, GROUNDS } from './grounds.js';
import { canvasTex } from './ps1.js';

const LINE = 0.12;

export function buildStadium(scene) {
  scene.background = new THREE.Color('#070b22');
  scene.fog = new THREE.Fog('#0d1433', 50, 140);
  const hemi = new THREE.HemisphereLight('#c8d8ff', '#2a3a20', 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d8', 1.05);
  sun.position.set(-20, 40, 10); scene.add(sun);

  const skyDome = sky(); scene.add(skyDome);
  const grass = pitch(); scene.add(grass);
  scene.add(lines());
  const goal = buildGoal(); scene.add(goal.group);
  boards(scene);

  let ground = null, jumpOurs = 0, jumpTheirs = 0, cheering = false;
  const api = {
    netHit: goal.hit,
    // your fans jump while on; their fans jump for a few seconds on theirs()
    cheer: on => { cheering = on; },
    theirs: () => { jumpTheirs = 1; },
    get ground() { return ground; },
    // recipe from grounds.js; ours/theirs: fan colors; oursShare: how much of the crowd is yours
    setGround(recipe = GROUNDS.default, ours = ['#f2f1ea'], theirs = ['#3a3a4a'], oursShare = 0.75) {
      if (ground) { scene.remove(ground.group); ground.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      ground = buildGround(recipe, ours, theirs, oursShare);
      scene.add(ground.group);
      const T = TIMES[recipe.time] || TIMES.night;
      scene.background.set(T.bg); scene.fog.color.set(T.fog[0]); scene.fog.near = T.fog[1]; scene.fog.far = T.fog[2];
      hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity = T.hemi[2];
      sun.color.set(T.sun[0]); sun.intensity = T.sun[1];
      ground.lamps.color.set(T.lamps ? '#fffbe0' : '#8a8a90');
      paintSky(skyDome, T.sky[0], T.sky[1]);
      mow(grass, recipe.mow);
      return ground;
    },
    // after setGround: rain darkens the grass and greys the air, snow covers the pitch and whitens it
    setWeather(kind) {
      const fog = scene.fog;
      grass.material.color.set(kind === 'rain' ? '#8f9c90' : '#ffffff');
      if (kind === 'snow') { grass.material.map = snowTex(); grass.material.needsUpdate = true; }
      if (kind === 'rain') { fog.color.lerp(new THREE.Color('#4a5262'), 0.7); fog.near = 28; fog.far = 120; hemi.intensity *= 0.85; sun.intensity *= 0.7; }
      if (kind === 'snow') { fog.color.lerp(new THREE.Color('#aeb6c4'), 0.75); fog.near = 22; fog.far = 105; hemi.intensity *= 1.1; }
    },
    update(dt, t) {
      goal.update(dt);
      if (!ground) return;
      jumpOurs += ((cheering ? 1 : 0) - jumpOurs) * Math.min(1, dt * 3);
      jumpTheirs = Math.max(0, jumpTheirs - dt * 0.3);
      ground.uniforms.uTime.value = t;
      ground.uniforms.uJumpOurs.value = jumpOurs;
      ground.uniforms.uJumpTheirs.value = jumpTheirs;
      const co = ground.curvaOurs;
      ground.ultras.update(dt, t, co ? jumpOurs : jumpTheirs, co ? jumpTheirs : jumpOurs);
    },
  };
  api.setGround();
  return api;
}

function paintSky(mesh, horizon, top) {
  const g = mesh.geometry, p = g.attributes.position, c = g.attributes.color, a = new THREE.Color(horizon), b = new THREE.Color(top), x = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = THREE.MathUtils.clamp(p.getY(i) / 180, 0, 1);
    x.copy(a).lerp(b, Math.pow(k, 0.6)); c.setXYZ(i, x.r, x.g, x.b);
  }
  c.needsUpdate = true;
}

// Mowing patterns: 'stripes' (6 m bands), 'wide' (12 m bands) or 'checks'.
let checksTex = null;
function mow(mesh, kind) {
  const W = 60, D = 56;
  if (kind === 'checks') {
    if (!checksTex) checksTex = pixelTex(canvasTex(64, 64, (c) => {
      c.fillStyle = '#3d8a2a'; c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#2c6c1f'; c.fillRect(0, 0, 32, 32); c.fillRect(32, 32, 32, 32);
    }), [W / 12, D / 12]);
    mesh.material.map = checksTex;
  } else {
    mesh.material.map = mesh.userData.stripes;
    mesh.userData.stripes.repeat.set(W / 7, D / (kind === 'wide' ? 24 : 12));
  }
  mesh.material.needsUpdate = true;
}

// Snow lying on the pitch: white with a blue tinge, worn through to the grass in patches.
let snowT = null;
function snowTex() {
  if (!snowT) snowT = pixelTex(canvasTex(64, 64, c => {
    c.fillStyle = '#e4eaf2'; c.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * 64, y = Math.random() * 64, r = Math.random();
      c.fillStyle = r < 0.12 ? '#7d9a74' : r < 0.4 ? '#c8d2e0' : '#f6f8fc';
      c.fillRect(Math.floor(x), Math.floor(y), 1 + Math.floor(Math.random() * 3), 1 + Math.floor(Math.random() * 2));
    }
  }), [60 / 8, 56 / 8]);
  return snowT;
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
  const m = new THREE.Mesh(g, ps1({ map: t }));
  m.userData.stripes = m.material.map;
  return m;
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
