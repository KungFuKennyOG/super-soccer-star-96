// Motion capture for the players: strides recorded from real people (game/assets/anim/clips.js, baked by
// tools/build-anim.mjs), played by the sim's stride phase and mixed by speed. A clip holds one stride as
// N poses round the cycle; phase 0 is the right foot planted, half way the left.
import * as THREE from 'three';
import { BONES, CLIPS } from './assets/anim/clips.js';

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
const TRUNK = new Set(['spine', 'chest', 'clavicleL', 'upperArmL', 'foreArmL', 'handL', 'clavicleR', 'upperArmR', 'foreArmR', 'handR']);
const LADDER = [CLIPS.walk, CLIPS.jog, CLIPS.jogB, CLIPS.runB].filter(Boolean);
const P0 = newPose(), smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

// How much of the pose is the captured stride (0..1): all of it moving forward, none standing or going
// sideways or backwards (the procedural gait in game/gait.js covers those). g: the gait state.
export const strideWeight = g => g.mv * smooth((g.uz - 0.45) / 0.4);

// The captured stride for this player this frame (kept for the upper body's turn). Returns its weight.
export function strideLegs(m, bn, g) {
  const w = m.mocapW = LADDER.length > 1 ? strideWeight(g) : 0;
  if (w <= 0) return 0;
  strideFor(LADDER, g.s, m.phase, P0);
  // the legs are the capture's unless the boots have work to do: on the ball they run either side of it and
  // reach for it (game/gait.js, game/strike.js), your own boots stay as steady as they were, and past the
  // fastest captured run the sprint's planted feet take over
  const legs = w * (1 - (m.onBallK || 0)) * (m.firstPerson ? 0 : 1) * (1 - smooth((g.s - 4.6) / 1.6));
  if (legs > 0) applyPose(bn, P0, legs, LEGS);
  return w;
}
// The same stride on the trunk and arms (call after the procedural upper body is posed; the pose is the one strideLegs sampled).
export function strideTrunk(m, bn) {
  if (m.mocapW > 0) applyPose(bn, P0, m.mocapW, TRUNK);
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
