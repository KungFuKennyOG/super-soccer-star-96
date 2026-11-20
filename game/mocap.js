// Motion capture for the players: strides recorded from real people (game/assets/anim/clips.js, baked by
// tools/build-anim.mjs), played by the sim's stride phase and mixed by speed. A clip holds one stride as
// N poses round the cycle; phase 0 is the right foot planted, half way the left.
import * as THREE from 'three';
import { BONES, CLIPS } from './assets/anim/clips.js';
import { strideRate } from '../rules/dribble.js';
import { ankleOf, footOf, reachLeg, aimFoot } from './legik.js';

const TAU = Math.PI * 2, NB = BONES.length, slerp = THREE.Quaternion.slerpFlat;
for (const c of Object.values(CLIPS)) { c.q = new Float32Array(c.q); c.h = new Float32Array(c.h); }
export { CLIPS, BONES };

// A pose: one quaternion per bone (BONES order) and the hips' place.
export const newPose = () => ({ q: new Float32Array(NB * 4), h: new Float32Array(3) });
const A = newPose(), B = newPose();

// The clip's pose at a phase (radians, the sim's stride) → out.
export function sampleStride(clip, phase, out) {
  const f = ((phase / TAU) % 1 + 1) % 1 * clip.n, i0 = Math.floor(f) % clip.n, i1 = (i0 + 1) % clip.n, k = f - Math.floor(f);
  for (let b = 0; b < NB; b++) slerp(out.q, b * 4, clip.q, (i0 * NB + b) * 4, clip.q, (i1 * NB + b) * 4, k);
  for (let j = 0; j < 3; j++) out.h[j] = clip.h[i0 * 3 + j] + (clip.h[i1 * 3 + j] - clip.h[i0 * 3 + j]) * k;
  return out;
}
// a + (b - a) * k, bone by bone → out (out may be a)
export function mixPose(a, b, k, out) {
  for (let i = 0; i < NB; i++) slerp(out.q, i * 4, a.q, i * 4, b.q, i * 4, k);
  for (let j = 0; j < 3; j++) out.h[j] = a.h[j] + (b.h[j] - a.h[j]) * k;
  return out;
}
// The stride for a ground speed: the two captured gaits either side of it, mixed. ladder: clips, slowest first.
export function strideFor(ladder, speed, phase, out) {
  let i = 0;
  while (i < ladder.length - 2 && speed > ladder[i + 1].speed) i++;
  const lo = ladder[i], hi = ladder[i + 1], k = Math.min(1, Math.max(0, (speed - lo.speed) / (hi.speed - lo.speed)));
  if (k <= 0) return sampleStride(lo, phase, out);
  if (k >= 1) return sampleStride(hi, phase, out);
  return mixPose(sampleStride(lo, phase, A), sampleStride(hi, phase, B), k, out);
}
// Puts (weight w of) a pose on the bones whose names pass `which` (a Set, or null for all). bn: bones by name.
const q = new THREE.Quaternion();
export function applyPose(bn, pose, w = 1, which = null) {
  for (let i = 0; i < NB; i++) {
    const name = BONES[i];
    if (which && !which.has(name)) continue;
    q.fromArray(pose.q, i * 4);
    if (w >= 1) bn[name].quaternion.copy(q); else bn[name].quaternion.slerp(q, w);
  }
  if (!which || which.has('hips')) { const p = bn.hips.position; p.x += (pose.h[0] - p.x) * w; p.y += (pose.h[1] - p.y) * w; p.z += (pose.h[2] - p.z) * w; }
}

/* ---------- on a player ---------- */

const LEGS = new Set(['hips', 'upperLegL', 'lowerLegL', 'footL', 'toeL', 'upperLegR', 'lowerLegR', 'footR', 'toeR']);
const TRUNK = new Set(['spine', 'chest', 'clavicleL', 'upperArmL', 'foreArmL', 'clavicleR', 'upperArmR', 'foreArmR']);
const LADDER = [CLIPS.walk, CLIPS.jog, CLIPS.jogB, CLIPS.runB].filter(Boolean);
const P0 = newPose(), smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

// How much of the pose is the captured stride (0..1): all of it moving forward, none standing or going
// sideways or backwards (the procedural gait in game/gait.js covers those). g: the gait state.
export const strideWeight = g => g.mv * smooth((g.uz - 0.45) / 0.4);

// How far a cycle of the mixed stride carries a man at this speed (m): what its feet were recorded doing.
function strideLength(ladder, speed) {
  let i = 0;
  while (i < ladder.length - 2 && speed > ladder[i + 1].speed) i++;
  const lo = ladder[i], hi = ladder[i + 1], k = Math.min(1, Math.max(0, (speed - lo.speed) / (hi.speed - lo.speed)));
  return lo.speed * lo.period + (hi.speed * hi.period - lo.speed * lo.period) * k;
}

// The captured stride for this player this frame (kept for the upper body's turn). Returns its weight.
// Two things the recordings can't give are put on top here.
// - The sim sets the cadence, and at it a man covers more ground per stride than the people recorded did
//   (a tenth more running, a quarter more flat out), so the feet are reached further out fore and aft by
//   that much and the hips ride a little lower: the planted boot then stays put on the grass.
// - Nobody recorded was sprinting, let alone taking off. `drive` (0..1) is how much of a sprinter's drive he
//   is in: all of it as he accelerates hard, fading over the next second to the third of it a flat-out run
//   keeps. In it his whole body pitches forward from the pelvis, the pushing leg goes straight out behind him
//   off the toes, the other knee punches through high, his feet land under him instead of ahead, and his
//   arms pump from the shoulder, hand to chin and elbow high behind (strideTrunk).
const DRIVE = { rise: 9, fade: 1.3, from: 1.5, full: 6.5, cruise: 0.3 };   // 1/s, 1/s, m/s2 of eased push, share kept at full speed
const X = new THREE.Vector3(1, 0, 0), qx = new THREE.Quaternion(), FLOOR = 0.083;
const AV = { L: new THREE.Vector3(), R: new THREE.Vector3() }, AQ = { L: new THREE.Quaternion(), R: new THREE.Quaternion() };
export function strideLegs(m, bn, g, dt = 0) {
  const w = m.mocapW = LADDER.length > 1 ? strideWeight(g) : 0;
  const want = smooth((g.lean - DRIVE.from) / (DRIVE.full - DRIVE.from)) * Math.max(0, g.uz);
  let dr = m.driveT || 0;
  if (dt > 0) dr += want > dr ? (want - dr) * Math.min(1, dt * DRIVE.rise) : -dr * Math.min(1, dt * DRIVE.fade);
  m.driveT = dr;
  const d0 = dr + (1 - dr) * DRIVE.cruise * g.sprint;
  m.drive = d0 * w;
  if (w <= 0) return 0;
  strideFor(LADDER, g.s, m.phase, P0);
  // the legs are the capture's unless the boots have work to do: on the ball they run either side of it and
  // reach for it (game/gait.js, game/strike.js), and your own boots stay as steady as they were
  const legs = w * (1 - (m.onBallK || 0)) * (m.firstPerson ? 0 : 1);
  if (legs <= 0) return w;
  applyPose(bn, P0, legs, LEGS);
  const k = (Math.min(1.42, Math.max(1, g.s * TAU / strideRate(g.s) / strideLength(LADDER, g.s))) - 1) * legs, d = d0 * legs, h = bn.hips.position;
  for (const n of 'LR') {
    const a = ankleOf(bn, n, AV[n]), rel = a.z - h.z, air = smooth((a.y - 0.1) / 0.2);
    footOf(bn, n, AQ[n]);
    a.z = h.z + rel * (1 + k) * (rel < 0 ? 1 + 0.3 * d : 1 - 0.2 * d);
    a.y = Math.max(FLOOR, a.y) + Math.max(0, a.y - 0.2) * 0.5 * k                 // the heel comes through higher
      + (rel > 0 ? 0.16 * d * air * smooth(rel / 0.25) : 0);                      // and the knee drives up in front
    if (rel < 0) AQ[n].multiply(qx.setFromAxisAngle(X, 0.45 * d * smooth(-rel / 0.35)));   // off the toes behind
  }
  h.y -= 0.075 * k + 0.05 * d; h.z += 0.04 * d;
  bn.hips.rotateX(0.28 * d);
  for (const n of 'LR') { reachLeg(bn, n, AV[n]); aimFoot(bn, n, AQ[n]); }
  return w;
}

// How far forward of hanging an upper arm is in a pose (rad), as his chest sees it.
const IDX = Object.fromEntries(BONES.map((n, i) => [n, i])), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), dn = new THREE.Vector3();
function armAngle(pose, n) {
  q1.fromArray(pose.q, IDX['clavicle' + n] * 4).multiply(q2.fromArray(pose.q, IDX['upperArm' + n] * 4));
  dn.set(0, -1, 0).applyQuaternion(q1);
  return Math.atan2(dn.z, -dn.y);
}
// the middle and half-range of each arm's swing in the fastest captured run: its timing is kept, its size isn't
const ARM = {};
if (LADDER.length > 1) for (const n of 'LR') {
  let lo = 9, hi = -9;
  for (let i = 0; i < 36; i++) { const a = armAngle(sampleStride(LADDER[LADDER.length - 1], i / 36 * TAU, P0), n); lo = Math.min(lo, a); hi = Math.max(hi, a); }
  ARM[n] = { mid: (lo + hi) / 2, half: Math.max(0.05, (hi - lo) / 2) };
}

// The same stride on the trunk and arms (call after the procedural upper body is posed; the pose is the one
// strideLegs sampled). keep: how much of it survives (a strike's arms come first). Hands are left as they
// were: the recordings' wrists are noise.
const ea = new THREE.Euler();
export function strideTrunk(m, bn, g, keep = 1) {
  const w = m.mocapW * keep;
  if (!(w > 0)) return;
  applyPose(bn, P0, w, TRUNK);
  // the rest of the forward pitch (the pelvis has its share), and he sits back against a hard stop
  const d = (m.drive || 0) * keep, pitch = 0.44 * d - 0.16 * smooth(-g.lean / 6) * w;
  bn.spine.rotateX(pitch * 0.5); bn.chest.rotateX(pitch * 0.5);
  const aw = Math.min(1, d * 1.6);
  if (aw <= 0) return;
  for (const n of 'LR') {
    const sd = n === 'L' ? 1 : -1, u = Math.min(1.2, Math.max(-1.2, (armAngle(P0, n) - ARM[n].mid) / ARM[n].half));   // -1 right back .. 1 right forward
    bn['upperArm' + n].quaternion.slerp(q1.setFromEuler(ea.set(0.12 - u * 0.95, -sd * (0.28 + 0.14 * Math.max(0, u)), sd * 0.13)), aw);
    bn['foreArm' + n].quaternion.slerp(q1.setFromEuler(ea.set(-(1.55 + 0.42 * u), 0, 0)), aw);
  }
}

// Turns the head to face `yaw` (rad, + his left) and `pitch` (+ down) in the model's own frame whatever the
// body under it is doing: the neck takes half the turn, the head the rest.
const qc = new THREE.Quaternion(), qd = new THREE.Quaternion(), qn = new THREE.Quaternion(), ID = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
export function aimHead(bn, yaw, pitch, w = 1) {
  qc.copy(bn.hips.quaternion).multiply(bn.spine.quaternion).multiply(bn.chest.quaternion);      // the chest in the model's frame
  qd.setFromEuler(e.set(pitch, yaw, 0)).premultiply(qc.invert());                                  // what neck and head must add up to
  qn.copy(ID).slerp(qd, 0.5);
  bn.neck.quaternion.slerp(qn, w); bn.head.quaternion.slerp(qd.premultiply(qn.invert()), w);
}
