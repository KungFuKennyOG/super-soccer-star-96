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

// kit: a kit spec from rules/teams.js; look picks skin, hair, hairstyle and stubble.
export function buildPlayer(kit, num, look = 0, { feetOnly = false } = {}) {
  const skin = SKINS[look % SKINS.length], hair = HAIRS[(look * 3 + 1) % HAIRS.length];
  const style = [0, 0, 1, 2, 3, 4, 5, 0, 3, 2, 0][look % 11], stubble = look % 4 === 1;
  const tex = playerAtlas({ kit, num, skin, hair, style, stubble, feetOnly });
  const material = mat(tex.uuid, () => ps1(feetOnly ? { map: tex, alphaTest: 0.5 } : { map: tex }));
  const { mesh, bone } = buildBody(material, style);
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, bone, shadow: blob(), phase: Math.random() * 6, kickT: 9 };
}

// You, in first person: the same body, but only your boots and lower socks are drawn.
export function buildYou(kit) {
  const m = buildPlayer(kit, 7, 1, { feetOnly: true });
  m.firstPerson = true;
  return m;
}

/* ---------- animation ---------- */

// Run cycle with bent running arms and counter-twist, kick, keeper dive, celebration. p is the sim player.
export function animate(m, p, dt, t, celebrate, guide = null) {
  const bn = m.bone;
  restPose(bn);
  const s = Math.hypot(p.vx, p.vz);
  m.phase += dt * (2.4 + s * 1.45);
  m.kickT += dt;
  const swing = Math.min(1, s / 6) * 0.95, ph = Math.sin(m.phase), cph = Math.cos(m.phase), run = Math.min(1, s / 3);

  // The stride, like the motion-captured runs of the PS1 FIFAs: the leg reaches further forward than
  // back, the knee folds hardest as the thigh comes through (heel up toward the backside), the foot
  // points as it pushes off.
  const thigh = x => (x > 0 ? x : x * 0.7) * swing;
  bn.upperLegL.rotation.x = -thigh(ph); bn.upperLegR.rotation.x = -thigh(-ph);
  bn.lowerLegL.rotation.x = (Math.max(0, cph) ** 1.4 * 1.9 + 0.1) * swing;
  bn.lowerLegR.rotation.x = (Math.max(0, -cph) ** 1.4 * 1.9 + 0.1) * swing;
  bn.footL.rotation.x = (ph < 0 ? -ph * 0.5 : -0.15 * ph) * swing; bn.footR.rotation.x = (ph > 0 ? ph * 0.5 : 0.15 * ph) * swing;
  // standing: soft knees, weight on the balls of the feet, a little breathing
  const still = 1 - run;
  bn.upperLegL.rotation.x -= 0.1 * still; bn.upperLegR.rotation.x -= 0.1 * still;
  bn.lowerLegL.rotation.x += 0.2 * still; bn.lowerLegR.rotation.x += 0.2 * still;
  bn.footL.rotation.x -= 0.1 * still; bn.footR.rotation.x -= 0.1 * still;
  bn.hips.position.y -= 0.025 * still;
  if (m.kickT < 0.32) { // right foot strikes through
    const k = m.kickT / 0.32;
    bn.upperLegR.rotation.x = k < 0.4 ? 0.9 * (k / 0.4) : 0.9 - 2.4 * ((k - 0.4) / 0.6);
    bn.lowerLegR.rotation.x = k < 0.4 ? 1.3 * (k / 0.4) : 1.3 * (1 - (k - 0.4) / 0.6);
    bn.footR.rotation.x = 0.3;
    bn.upperArmL.rotation.z = 0.8; bn.spine.rotation.y = -0.25 * Math.sin(k * Math.PI);
  }
  if (m.firstPerson) { bn.chest.scale.setScalar(0.001); return; }

  // bounce at each push-off, hips and shoulders twisting against each other, a forward lean that grows
  // with speed and a head that stays level; arms pump bent at the elbow, opposite to the legs
  bn.hips.position.y += (Math.abs(cph) - 0.6) * 0.06 * swing - 0.03 * swing;
  bn.hips.rotation.y = ph * 0.14 * swing;
  bn.spine.rotation.x = Math.min(0.26, s * 0.034) + 0.05 * still + 0.015 * Math.sin(t * 2.2 + m.phase) * still;
  bn.chest.rotation.y = -ph * 0.26 * swing;
  bn.neck.rotation.x = -bn.spine.rotation.x * 0.8;
  bn.neck.rotation.y = ph * 0.12 * swing;
  if (m.kickT >= 0.32) {
    bn.upperArmL.rotation.set(ph * swing * 0.95 - 0.1 * run, 0, 0.14); bn.upperArmR.rotation.set(-ph * swing * 0.95 - 0.1 * run, 0, -0.14);
  }
  bn.foreArmL.rotation.x = -(0.25 + 1.15 * run + 0.25 * Math.max(0, -ph) * swing);
  bn.foreArmR.rotation.x = -(0.25 + 1.15 * run + 0.25 * Math.max(0, ph) * swing);

  if (p.role === 'gk') {
    if (p.dive && !m.dive) m.dive = { dir: p.dive, t: 0 };
    if (m.dive) {
      m.dive.t += dt;
      poseDive(bn, m.dive);
      if (m.dive.t > DIVE.end) m.dive = null;
      return;
    }
  }
  if (p.role === 'gk') { keeperStance(m, p, dt); return; }
  if (guide && p.role === 'mate') { dancePose(bn, guide); return; }
  if (celebrate) {
    bn.hips.position.y += Math.abs(Math.sin(t * 7 + m.phase)) * 0.45;
    bn.upperArmL.rotation.set(0, 0, 2.6); bn.upperArmR.rotation.set(0, 0, -2.6);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -0.3;
  }
}

// Teammates lead the goal dance facing you, so they mirror the move: your "left" is their right arm.
const ARM = { up: 2.8, down: 0.2, out: 1.55 };
function dancePose(bn, g) {
  const bounce = Math.abs(Math.sin(Math.PI * g.beat));
  bn.hips.position.y -= 0.09 * bounce;
  bn.upperLegL.rotation.set(-0.25 * bounce, 0, 0.1); bn.upperLegR.rotation.set(-0.25 * bounce, 0, -0.1);
  bn.lowerLegL.rotation.x = bn.lowerLegR.rotation.x = 0.5 * bounce;
  bn.chest.rotation.y = 0.15 * Math.sin(Math.PI * g.beat);
  bn.neck.rotation.z = 0.12 * Math.sin(Math.PI * g.beat);
  let l = 'down', r = 'down';                       // the mate's own arms
  if (g.move === 'left') r = 'up';
  if (g.move === 'right') l = 'up';
  if (g.move === 'up') l = r = 'up';
  if (g.move === 'out') l = r = 'out';
  bn.upperArmL.rotation.set(0, 0, ARM[l]); bn.upperArmR.rotation.set(0, 0, -ARM[r]);
  bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = 0;
}

// The keeper, when he isn't diving: always square to the ball in a crouched ready stance, side-stepping
// (feet apart, feet together) instead of running, arms out and ready; the ball hugged to his chest
// once he's caught it.
function keeperStance(m, p, dt) {
  const bn = m.bone;
  const rx = p.fz, rz = -p.fx;                                      // his right, from his facing
  const lateral = p.vx * rx + p.vz * rz, fwd = p.vx * p.fx + p.vz * p.fz;
  m.shuffle = (m.shuffle || 0) + dt * Math.abs(lateral) * 3.2;
  const step = Math.sin(m.shuffle), spread = 0.16 + 0.14 * Math.abs(step) * Math.min(1, Math.abs(lateral));
  restPose(bn);
  bn.hips.position.y -= 0.12 + 0.03 * Math.abs(Math.cos(m.shuffle)) * Math.min(1, Math.abs(lateral));
  bn.spine.rotation.x = 0.32; bn.neck.rotation.x = -0.25;
  bn.upperLegL.rotation.set(-0.42 - fwd * 0.08, 0, spread); bn.upperLegR.rotation.set(-0.42 - fwd * 0.08, 0, -spread);
  bn.lowerLegL.rotation.x = bn.lowerLegR.rotation.x = 0.75;
  bn.footL.rotation.x = bn.footR.rotation.x = -0.3;
  if (p.holding) {
    bn.upperArmL.rotation.set(-1.1, 0, -0.35); bn.upperArmR.rotation.set(-1.1, 0, 0.35);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -1.5;
    bn.spine.rotation.x = 0.15; bn.hips.position.y += 0.08;
  } else {
    const twitch = 0.06 * Math.sin(m.phase * 0.7);
    bn.upperArmL.rotation.set(-0.55, 0, 0.55 + twitch); bn.upperArmR.rotation.set(-0.55, 0, -0.55 - twitch);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -0.9;
  }
}

// The keeper's dive, timed from the moment he commits: a quick load, a launch that rolls the body
// flat with both arms stretched past the head, a landing on his side, then he gets back up.
const DIVE = { load: 0.12, fly: 0.5, ground: 1.0, end: 1.6 };
const ease = x => x * x * (3 - 2 * Math.min(1, Math.max(0, x)));
function poseDive(bn, d) {
  const t = d.t, dir = d.dir;
  let roll, drop, reach;
  if (t < DIVE.load) {
    const f = t / DIVE.load;
    roll = 0; drop = -0.14 * f; reach = 0.2 * f;
    bn.lowerLegL.rotation.x = bn.lowerLegR.rotation.x = 0.7 * f;
    bn.upperLegL.rotation.x = bn.upperLegR.rotation.x = -0.35 * f;
  } else if (t < DIVE.fly) {
    const f = (t - DIVE.load) / (DIVE.fly - DIVE.load);
    roll = 1.45 * ease(f); drop = -0.14 + 0.34 * Math.sin(f * Math.PI) - 0.54 * f; reach = 0.2 + 0.8 * ease(f * 1.6);
  } else if (t < DIVE.ground) {
    roll = 1.5; drop = -0.68; reach = 1;
  } else {
    const g = ease((t - DIVE.ground) / (DIVE.end - DIVE.ground));
    roll = 1.5 * (1 - g); drop = -0.68 * (1 - g); reach = 1 - g;
  }
  bn.hips.rotation.set(0, 0, -dir * roll);
  bn.hips.position.y += drop;
  bn.spine.rotation.set(0, 0, 0); bn.chest.rotation.set(0, 0, 0);
  if (t >= DIVE.load) { bn.upperLegL.rotation.x = bn.upperLegR.rotation.x = 0; }
  // arms swing from the sides up past the head, along the dive
  bn.upperArmL.rotation.set(0, 0, 0.15 + 2.75 * reach); bn.upperArmR.rotation.set(0, 0, -0.15 - 2.75 * reach);
  bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -0.2 * (1 - reach);
  // legs trail, the take-off leg kicks out a little
  if (t >= DIVE.load) {
    bn.upperLegL.rotation.z = 0.12 + (dir > 0 ? 0 : 0.25) * reach; bn.upperLegR.rotation.z = -0.12 - (dir > 0 ? 0.25 : 0) * reach;
    bn.lowerLegL.rotation.x = bn.lowerLegR.rotation.x = 0.15;
  }
  bn.neck.rotation.z = dir * 0.3 * reach;
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
