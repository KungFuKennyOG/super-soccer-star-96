// Players in the early-2000s FIFA style: one continuous skinned mesh per player (body.js) wearing a
// painted texture sheet (atlas.js), posed every frame by a procedural run cycle.
import * as THREE from 'three';
import { BALL } from '../rules/tuning.js';
import { ps1 } from './ps1.js';
import { SKINS, HAIRS, blobTex, arrowTex } from './tex.js';
import { playerAtlas } from './atlas.js';
import { buildBody, restPose } from './body.js';

const matCache = new Map();
const mat = (key, make) => { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); };

// kit: 'white' | 'stripes' | 'keeper'; look picks skin, hair, hairstyle and stubble.
export function buildPlayer(kit, num, look = 0) {
  const skin = SKINS[look % SKINS.length], hair = HAIRS[(look * 3 + 1) % HAIRS.length];
  const style = look % 3, stubble = look % 4 === 1;
  const tex = playerAtlas({ kit, num, skin, hair, style, stubble });
  const material = mat(tex.uuid, () => ps1({ map: tex }));
  const { mesh, bone } = buildBody(material, style);
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, bone, shadow: blob(), phase: Math.random() * 6, kickT: 9 };
}

// You, in first person: the same body with everything above the waist folded away.
export function buildYou(kit) {
  const m = buildPlayer(kit, 7, 1);
  m.firstPerson = true;
  return m;
}

/* ---------- animation ---------- */

// Run cycle with bent running arms and counter-twist, kick, keeper dive, celebration. p is the sim player.
export function animate(m, p, dt, t, celebrate) {
  const bn = m.bone;
  restPose(bn);
  const s = Math.hypot(p.vx, p.vz);
  m.phase += dt * (2.4 + s * 1.45);
  m.kickT += dt;
  const swing = Math.min(1, s / 6) * 0.95, ph = Math.sin(m.phase), run = Math.min(1, s / 3);

  bn.upperLegL.rotation.x = -ph * swing; bn.upperLegR.rotation.x = ph * swing;
  bn.lowerLegL.rotation.x = (Math.max(0, ph) * 1.4 + 0.08) * swing;
  bn.lowerLegR.rotation.x = (Math.max(0, -ph) * 1.4 + 0.08) * swing;
  bn.footL.rotation.x = -bn.lowerLegL.rotation.x * 0.25; bn.footR.rotation.x = -bn.lowerLegR.rotation.x * 0.25;
  if (m.kickT < 0.32) { // right foot strikes through
    const k = m.kickT / 0.32;
    bn.upperLegR.rotation.x = k < 0.4 ? 0.9 * (k / 0.4) : 0.9 - 2.4 * ((k - 0.4) / 0.6);
    bn.lowerLegR.rotation.x = k < 0.4 ? 1.3 * (k / 0.4) : 1.3 * (1 - (k - 0.4) / 0.6);
    bn.footR.rotation.x = 0.3;
    bn.upperArmL.rotation.z = 0.8; bn.spine.rotation.y = -0.25 * Math.sin(k * Math.PI);
  }
  if (m.firstPerson) { bn.chest.scale.setScalar(0.001); return; }

  bn.hips.position.y += Math.abs(Math.cos(m.phase)) * 0.05 * swing;
  bn.hips.rotation.y = ph * 0.12 * swing;
  bn.spine.rotation.x = Math.min(0.2, s * 0.028);
  bn.chest.rotation.y = -ph * 0.22 * swing;
  bn.neck.rotation.y = ph * 0.1 * swing;
  if (m.kickT >= 0.32) {
    bn.upperArmL.rotation.set(ph * swing * 0.8, 0, 0.12); bn.upperArmR.rotation.set(-ph * swing * 0.8, 0, -0.12);
  }
  bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -(0.25 + 1.2 * run);

  if (p.role === 'gk' && p.dive) { // full stretch toward the shot
    bn.hips.rotation.z = -p.dive * 1.15; bn.hips.position.y += 0.35;
    bn.upperArmL.rotation.set(0, 0, 2.7); bn.upperArmR.rotation.set(0, 0, -2.7);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = 0;
    bn.upperLegL.rotation.z = 0.3; bn.upperLegR.rotation.z = -0.3;
  } else if (p.role === 'gk' && s < 1) { // set, hands ready
    bn.upperArmL.rotation.set(-0.5, 0, 0.4); bn.upperArmR.rotation.set(-0.5, 0, -0.4);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -1.0;
    bn.upperLegL.rotation.set(-0.25, 0, 0.12); bn.upperLegR.rotation.set(-0.25, 0, -0.12);
    bn.lowerLegL.rotation.x = bn.lowerLegR.rotation.x = 0.45;
    bn.hips.position.y -= 0.07; bn.spine.rotation.x = 0.25;
  }
  if (celebrate) {
    bn.hips.position.y += Math.abs(Math.sin(t * 7 + m.phase)) * 0.45;
    bn.upperArmL.rotation.set(0, 0, 2.6); bn.upperArmR.rotation.set(0, 0, -2.6);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -0.3;
  }
}

// Shadows fall away from the floodlight behind your left shoulder, stretched like the PS2-era ones.
const SHADOW_DIR = { x: 0.26, z: -0.12, ang: Math.atan2(0.26, -0.12) };
export function placeModel(m, p) {
  m.root.position.set(p.x, 0, p.z);
  m.root.rotation.y = Math.atan2(p.fx, p.fz);
  m.shadow.position.set(p.x + SHADOW_DIR.x, 0.02, p.z + SHADOW_DIR.z);
}

/* ---------- ball ---------- */

// A detail-2 icosahedron with black patches around the 12 original corners: the 90s low-poly ball.
export function buildBall() {
  const g = new THREE.IcosahedronGeometry(BALL.r, 2); // already non-indexed in r149
  const ico = new THREE.IcosahedronGeometry(1, 0), corners = [];
  const ip = ico.attributes.position;
  for (let i = 0; i < ip.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(ip, i).normalize();
    if (!corners.some(c => c.distanceTo(v) < 1e-3)) corners.push(v);
  }
  const p = g.attributes.position, col = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const mid = a.add(b).add(c).normalize();
    const black = corners.some(k => k.dot(mid) > 0.94);
    for (let j = 0; j < 3; j++) col.push(...(black ? [0.08, 0.08, 0.1] : [0.95, 0.95, 0.92]));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, ps1({ vertexColors: true, flatShading: true }));
  const shadow = blob(0.45, 0.45);
  const axis = new THREE.Vector3(), q = new THREE.Quaternion();
  return {
    mesh, shadow,
    update(bl, dt) {
      mesh.position.set(bl.x, bl.y, bl.z);
      const h = Math.hypot(bl.vx, bl.vz);
      if (h > 0.05) { axis.set(bl.vz / h, 0, -bl.vx / h); q.setFromAxisAngle(axis, h / BALL.r * dt); mesh.quaternion.premultiply(q); }
      shadow.position.set(bl.x + bl.y * 0.25, 0.021, bl.z - bl.y * 0.12);
      const s = Math.max(0.35, 1 - bl.y * 0.15); shadow.scale.set(s, s, s);
    },
  };
}

function blob(w = 0.7, l = 1.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat('blob', () => ps1({ map: blobTex(), transparent: true, depthWrite: false, lit: false })));
  m.rotation.set(-Math.PI / 2, 0, -SHADOW_DIR.ang);
  m.renderOrder = 1;
  return m;
}

// The yellow arrow over whoever has the ball (not you).
export function buildArrow() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), ps1({ map: arrowTex(), alphaTest: 0.5, lit: false, side: THREE.DoubleSide }));
  m.visible = false;
  return m;
}
