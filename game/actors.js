// Players in the early-2000s FIFA style: one continuous skinned mesh per player (body.js) wearing a
// painted texture sheet (atlas.js), posed every frame by a procedural run cycle.
import * as THREE from 'three';
import { BALL } from '../rules/tuning.js';
import { ps1 } from './ps1.js';
import { SKINS, HAIRS, blobTex, arrowTex } from './tex.js';
import { playerAtlas } from './atlas.js';
import { buildBody, restPose } from './body.js';
import { animateKeeper } from './keeperpose.js';

const matCache = new Map();
const mat = (key, make) => { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); };

// kit: a kit spec from rules/teams.js; look picks skin, hair, hairstyle and stubble.
// boots: a locker color (0 black, 1 white, 2 red, 3 gold).
export function buildPlayer(kit, num, look = 0, { feetOnly = false, boots = 0 } = {}) {
  const skin = SKINS[look % SKINS.length], hair = HAIRS[(look * 3 + 1) % HAIRS.length];
  const style = [0, 0, 2, 0, 5, 1, 0, 2, 3, 0, 5, 0, 2, 4][look % 14], stubble = look % 3 !== 0;   // mostly short hair, most with stubble
  const tex = playerAtlas({ kit, num, skin, hair, style, stubble, feetOnly, boots });
  const material = mat(tex.uuid, () => ps1(feetOnly ? { map: tex, alphaTest: 0.5, vertexColors: true, pop: true } : { map: tex, vertexColors: true, pop: true }));
  const { mesh, bone } = buildBody(material, style);
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, bone, shadow: blob(), phase: Math.random() * 6, kickT: 9 };
}

// You, in first person: the same body, but only your boots and lower socks are drawn.
export function buildYou(kit, boots = 0) {
  const m = buildPlayer(kit, 7, 1, { feetOnly: true, boots });
  m.firstPerson = true;
  return m;
}

/* ---------- animation ---------- */

// Run cycle with bent running arms and counter-twist, kick, celebration. p is the sim player; the keeper
// has his own (game/keeperpose.js).
// ball: the sim ball, for the keeper (game/keeperpose.js).
export function animate(m, p, dt, t, celebrate, guide = null, ball = null) {
  const bn = m.bone;
  if (p.role === 'gk') { animateKeeper(m, p, dt, t, ball); return; }
  restPose(bn);
  if (m.bigHead) bn.head.scale.setScalar(1.65);           // the big-heads cheat (locker)
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
  if (m.special) { m.special.t += dt; if (m.special.t > 0.9) m.special = null; }
  if (m.special && SKILL_POSES.includes(m.special.kind)) skillPose(bn, m.special);
  if (m.special && m.special.kind === 'bicycle') { specialPose(bn, m.special); if (m.firstPerson) bn.chest.scale.setScalar(0.001); return; }
  if (m.firstPerson) { bn.chest.scale.setScalar(0.001); return; }

  // bounce at each push-off, hips and shoulders twisting against each other, a forward lean that grows
  // with speed and a head that stays level; arms pump bent at the elbow, opposite to the legs
  bn.hips.position.y += (Math.abs(cph) - 0.6) * 0.06 * swing - 0.03 * swing;
  bn.hips.rotation.y = ph * 0.14 * swing;
  bn.spine.rotation.x = Math.min(0.26, s * 0.034) + 0.05 * still + 0.015 * Math.sin(t * 2.2 + m.phase) * still;
  bn.chest.rotation.y = -ph * 0.26 * swing;
  bn.neck.rotation.x = -bn.spine.rotation.x * 0.6;
  bn.neck.rotation.y = ph * 0.12 * swing;
  if (m.kickT >= 0.32) {
    bn.upperArmL.rotation.set(ph * swing * 0.95 - 0.1 * run - 0.18 * still, 0, 0.14 + 0.06 * still); bn.upperArmR.rotation.set(-ph * swing * 0.95 - 0.1 * run - 0.18 * still, 0, -0.14 - 0.06 * still);
  }
  bn.foreArmL.rotation.x = -(0.25 + 1.15 * run + 0.25 * Math.max(0, -ph) * swing + 0.15 * still);
  bn.foreArmR.rotation.x = -(0.25 + 1.15 * run + 0.25 * Math.max(0, ph) * swing + 0.15 * still);
  bn.chest.rotation.x += 0.07 * still; bn.neck.rotation.x += 0.02 * still;   // shoulders forward, head carried forward and level: the FIFA 98 stance

  if (m.special && m.special.kind === 'header') specialPose(bn, m.special);
  if (guide && p.role === 'mate') { dancePose(bn, guide); return; }
  if (celebrate) {
    bn.hips.position.y += Math.abs(Math.sin(t * 7 + m.phase)) * 0.45;
    bn.upperArmL.rotation.set(0, 0, 2.6); bn.upperArmR.rotation.set(0, 0, -2.6);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -0.3;
  }
}

// Moves from the air (m.special = { kind, t }, set when the kick happens): the bicycle kick throws the
// body back and swings the striking leg over the head; a header is a hop with the neck snapping forward.
function specialPose(bn, sp) {
  const k = Math.min(1, sp.t / 0.9), up = Math.sin(Math.PI * Math.min(1, k * 1.4));
  if (sp.kind === 'bicycle') {
    bn.hips.rotation.x = -1.5 * up; bn.hips.position.y += 0.55 * up;
    bn.upperLegR.rotation.x = -2.7 * up; bn.lowerLegR.rotation.x = 0.3 * (1 - up);
    bn.upperLegL.rotation.x = -0.9 * up; bn.lowerLegL.rotation.x = 1.2 * up;
    bn.upperArmL.rotation.set(0, 0, 1.4 * up); bn.upperArmR.rotation.set(0, 0, -1.4 * up);
    bn.neck.rotation.x = 0.4 * up;
  } else if (sp.kind === 'header') {
    bn.hips.position.y += 0.16 * up; bn.spine.rotation.x += 0.25 * up; bn.neck.rotation.x = 0.5 * Math.sin(Math.PI * k);
    bn.upperArmL.rotation.z = 0.5 * up; bn.upperArmR.rotation.z = -0.5 * up;
  }
}

// Skill moves with the feet (what you see of your own boots): the step-over circles the right foot
// round the ball, the roulette spins you on the spot, the nutmeg is a toe-poke, the rainbow a heel
// flick up behind you.
const SKILL_POSES = ['stepover', 'roulette', 'nutmeg', 'rainbow'];
function skillPose(bn, sp) {
  const k = Math.min(1, sp.t / 0.45), up = Math.sin(Math.PI * k);
  if (k >= 1) return;
  if (sp.kind === 'stepover') {
    bn.upperLegR.rotation.x = -0.55 * up; bn.upperLegR.rotation.z = -0.7 * Math.sin(2 * Math.PI * k);
    bn.lowerLegR.rotation.x = 0.7 * up;
  } else if (sp.kind === 'roulette') {
    bn.hips.rotation.y += Math.PI * 2 * k;
    bn.upperLegR.rotation.x = -0.4 * up; bn.lowerLegR.rotation.x = 0.5 * up;
  } else if (sp.kind === 'nutmeg') {
    bn.upperLegR.rotation.x = -0.75 * up; bn.lowerLegR.rotation.x = 0.15; bn.footR.rotation.x = -0.35 * up;
  } else if (sp.kind === 'rainbow') {
    bn.upperLegR.rotation.x = 0.55 * up; bn.lowerLegR.rotation.x = 2.1 * up; bn.footR.rotation.x = 0.6 * up;
    bn.upperLegL.rotation.x = -0.25 * up;
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

// Shadows fall away from the floodlight behind your left shoulder, stretched like the PS2-era ones.
const SHADOW_DIR = { x: 0.26, z: -0.12, ang: Math.atan2(0.26, -0.12) };
export function placeModel(m, p) {
  m.root.position.set(p.x, 0, p.z);
  m.root.rotation.y = Math.atan2(p.fx, p.fz);
  m.shadow.position.set(p.x + SHADOW_DIR.x, 0.02, p.z + SHADOW_DIR.z);
}

/* ---------- ball ---------- */

// Ball designs (the locker, game/display.js), plus the orange snow ball: [panel, pentagon, alt pentagon].
const BALLS = {
  CLASSIC: [[0.95, 0.95, 0.92], [0.08, 0.08, 0.1]],
  ORANGE: [[0.98, 0.5, 0.08], [0.1, 0.06, 0.04]],
  STAR: [[0.96, 0.96, 0.94], [0.8, 0.08, 0.12], [0.08, 0.14, 0.5]],
  RETRO: [[0.62, 0.38, 0.16], [0.42, 0.24, 0.1], [0.74, 0.5, 0.24]],
  GOLD: [[0.95, 0.76, 0.22], [0.36, 0.22, 0.06], [0.8, 0.58, 0.14]],
};
// A detail-2 icosahedron with patches around the 12 original corners: the 90s low-poly ball.
// setDesign(name) repaints it.
export function buildBall() {
  const g = new THREE.IcosahedronGeometry(BALL.r, 2); // already non-indexed in r149
  const ico = new THREE.IcosahedronGeometry(1, 0), corners = [];
  const ip = ico.attributes.position;
  for (let i = 0; i < ip.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(ip, i).normalize();
    if (!corners.some(c => c.distanceTo(v) < 1e-3)) corners.push(v);
  }
  // which pentagon (corner) each face belongs to, or -1 for the panels between
  const p = g.attributes.position, face = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const mid = a.add(b).add(c).normalize();
    face.push(corners.findIndex(k => k.dot(mid) > 0.94));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3));
  const paint = name => {
    const d = BALLS[name] || BALLS.CLASSIC, col = g.attributes.color;
    face.forEach((k, f) => { const rgb = k < 0 ? d[0] : d[2] && k % 2 ? d[2] : d[1]; for (let j = 0; j < 3; j++) col.setXYZ(f * 3 + j, ...rgb); });
    col.needsUpdate = true;
  };
  paint('CLASSIC');
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, ps1({ vertexColors: true, flatShading: true }));
  const shadow = blob(0.45, 0.45);
  const axis = new THREE.Vector3(), q = new THREE.Quaternion();
  return {
    mesh, shadow,
    setDesign: paint,
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
