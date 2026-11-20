// Everything above the hips, in two parts.
//
//   poseUpper    the base: how the trunk, head and arms are carried standing, walking, running and
//                side-stepping (shoulders turning against the pelvis, arms swinging opposite the legs,
//                hands on hips after standing a while). It sets the bones.
//   layers       laid over any base pose (this one, or a recorded clip): each turns the bones on from
//                where they are instead of setting them. layerLean (the trunk tipping with speed,
//                acceleration and turns), layerReady (bent at the waist with the arms out: jockeying, or
//                standing near the ball), layerBreath, layerKick (arms and trunk through a strike) and
//                layerLook (the head on the ball and level, whatever is under it: call it last).
//
// g is the gait state game/gait.js's poseLegs returned. Call these after the legs and any strike are posed.
import * as THREE from 'three';
import { reachArm, aimHand } from './legik.js';
import { smooth, mix, clamp, wrap } from './gait.js';

const LR = ['L', 'R'], X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), eul = new THREE.Euler();
const v = new THREE.Vector3(), pole = new THREE.Vector3();
// turn a bone on from where it is: about an axis of its parent (pre), or about its own (post)
const pre = (b, axis, a) => b.quaternion.premultiply(q.setFromAxisAngle(axis, a));
const post = (b, axis, a) => b.quaternion.multiply(q.setFromAxisAngle(axis, a));
// ease a bone toward a pose (Euler angles in its parent's frame) by k
const toward = (b, x, y, z, k) => b.quaternion.slerp(q.setFromEuler(eul.set(x, y, z)), k);

// The base. dt eases what takes time (a hand going to the hip); t: the clock, for the small idle sway.
export function poseUpper(m, bn, g, dt, t) {
  const { mv, run, sprint, idle, w } = g, k = m.onBallK || 0;
  // shoulders against the pelvis: the chest turns the other way from the stride and stays level over a tilted pelvis
  const turn = -(0.05 * mv + 0.1 * run + 0.07 * sprint) * g.sw * (1 - 0.4 * k) - g.py * (mv + idle * 0.6);
  bn.spine.rotation.set(0, turn * 0.4, -g.pz * 0.85);
  bn.chest.rotation.set(0, turn * 0.6, -idle * w * 0.03);
  bn.neck.rotation.set(0.02 * idle, -(turn + g.py) * 0.5, 0);
  bn.head.rotation.set(0, -(turn + g.py) * 0.5, idle * w * 0.02);
  // a hand on the hip (some players, one or both) once he has stood a while with the ball elsewhere
  const pick = g.c < 0.4 ? 0 : g.c < 0.7 ? 3 : g.c < 0.85 ? 1 : 2;
  g.hk = clamp(g.hk + (g.still > 1.6 + 3 * g.a && g.rd < 0.3 ? 1 : -2.5) * dt * 1.6, 0, 1);
  // arms: hanging loose with the elbows a little bent when he stands, swinging from the shoulder as he
  // walks, bent and pumping as he runs, each opposite its leg and a touch behind it; wider on the ball
  const lag = Math.sin(g.ph - 0.3);
  for (let i = 0; i < 2; i++) {
    const n = LR[i], sd = i ? -1 : 1, a = -sd * lag * mv, own = i ? g.b : g.a, fr = Math.max(0, a), bk = Math.max(0, -a);   // a: + as this arm comes forward
    const sway = 0.025 * Math.sin(t * 0.8 + own * 9) * idle;
    const swing = mix(-0.07 - sway, mix(a * 0.27 - 0.07, a * (0.6 + 0.25 * sprint) * (1 - 0.3 * k) - 0.1 + 0.08 * fr * sprint, run), mv);
    const elbow = mix(0.26 + 0.1 * own, mix(0.34 + 0.16 * fr, mix(1.25, 1.5, sprint) + 0.27 * a - 0.35 * k, run), mv);
    const twist = mix(0.3, mix(0.25, 0.2 + 0.2 * fr, run), mv), out = mix(0.07 + 0.04 * own, mix(0.1, 0.09 + 0.1 * bk + 0.24 * k, run), mv);
    bn['upperArm' + n].rotation.set(-swing, -sd * twist, sd * out);
    bn['foreArm' + n].rotation.set(-elbow, -sd * 0.2 * (1 - run), 0);
    bn['hand' + n].rotation.set(-0.12 * (1 - run) + 0.1 * run * sd * Math.cos(g.ph - 0.3) * mv, 0, sd * 0.1 * idle);   // the wrist trails the swing a little
    bn['clavicle' + n].rotation.set(0, sd * 0.09 * a * run, sd * 0.06 * Math.abs(a) * run);
    const hk = smooth(g.hk) * idle * (pick & (i ? 2 : 1) ? 1 : 0);
    if (hk > 0) {
      const up = bn['upperArm' + n], lo = bn['foreArm' + n];
      qa.copy(up.quaternion); qb.copy(lo.quaternion);
      reachArm(bn, n, v.copy(bn.hips.position).add(pole.set(sd * 0.2, 0.085, 0.01).applyQuaternion(bn.hips.quaternion)), pole.set(sd, -0.15, -0.75));
      qc.copy(up.quaternion); up.quaternion.copy(qa).slerp(qc, hk);
      qc.copy(lo.quaternion); lo.quaternion.copy(qb).slerp(qc, hk);
      qa.copy(bn['hand' + n].quaternion); aimHand(bn, n, qc.setFromEuler(eul.set(-0.55, sd * 0.5, sd * 0.15)));       // fingers down the front of the hip
      qc.copy(bn['hand' + n].quaternion); bn['hand' + n].quaternion.copy(qa).slerp(qc, hk);
      bn['clavicle' + n].rotation.z += sd * 0.06 * hk;
    }
  }
}

// The trunk tips forward with his speed (g.L; `speed` scales that part: 0 over a clip that has its own),
// further as he drives off, back as he brakes, and into a turn. The pelvis has taken its share (poseLegs).
export function layerLean(bn, g, speed = 1) {
  const lean = 0.75 * (speed * g.L + clamp(g.acc * 0.02, -0.24, 0.3)), tilt = g.tilt;
  pre(bn.spine, X, lean * 0.6); pre(bn.chest, X, lean * 0.4);
  pre(bn.spine, Z, -tilt * 0.12); pre(bn.chest, Z, -tilt * 0.08);
  pre(bn.neck, Z, tilt * 0.3); pre(bn.head, Z, tilt * 0.3);         // the eyes stay nearer level
}

// Ready: bent forward at the waist, arms out from the sides with the elbows bent, hands open to the play.
// A defender side-stepping or backing off carries himself like this (g.jk), and so does anyone standing
// with the ball near (g.rd). poseLegs has the knees bent and the feet wide already. k scales it.
export function layerReady(bn, g, k = 1) {
  const r = k * Math.max(g.rd * g.idle, g.jk), bob = Math.sin(g.t * 5.2 + g.seed * 9);
  if (r <= 0) return;
  pre(bn.spine, X, 0.75 * g.crouch * k * 0.6); pre(bn.chest, X, 0.75 * g.crouch * k * 0.4);
  for (let i = 0; i < 2; i++) {
    const n = LR[i], sd = i ? -1 : 1, a = sd * g.sw * g.jk;
    toward(bn['upperArm' + n], -0.1 + 0.15 * a, -sd * 0.15, sd * (0.5 + 0.03 * bob), r * 0.9);
    toward(bn['foreArm' + n], -0.7 - 0.1 * a, -sd * 0.1, 0, r * 0.9);
    toward(bn['hand' + n], -0.1, 0, 0, r);
  }
}

// Breathing: the chest rises and the shoulders with it; deeper and quicker when he has been sprinting
// (g.puff), plainest standing still.
export function layerBreath(bn, g, dt) {
  g.br += dt * (1.7 + 3.2 * g.puff);
  const a = Math.sin(g.br) * (0.011 + 0.03 * g.puff) * (1 - 0.6 * g.run);
  pre(bn.spine, X, a * 0.5); pre(bn.chest, X, -a * 1.3);
  post(bn.clavicleL, Z, a * 2.2); post(bn.clavicleR, Z, -a * 2.2);
  pre(bn.neck, X, a * 0.6);
}

// A strike. kick: how much of one the pose is (0..1, what game/strike.js's poseStrike returned); swing:
// where the leg is in it, -1 drawn back .. 0 on the ball .. 1 followed through (strikeSwing below).
// The far arm goes out and back as the leg draws back, then sweeps across in front as it swings through;
// the near arm does the opposite; the trunk opens, leans away from the ball and comes over it.
export function layerKick(bn, kick, swing = 0) {
  if (kick <= 0) return;
  const u = smooth((swing + 0.7) / 1.4);
  pre(bn.spine, X, mix(-0.07, 0.2, u) * kick); pre(bn.spine, Z, -0.09 * kick); pre(bn.chest, Y, mix(-0.3, 0.22, u) * kick);
  // (an arm held out sideways is swung forward or back by turning it about the upright axis)
  toward(bn.upperArmL, 0, mix(0.55, -0.85, u), mix(1.1, 0.85, u), kick); toward(bn.foreArmL, -mix(0.3, 0.75, u), 0, 0, kick);
  toward(bn.upperArmR, mix(-0.25, 0.35, u), mix(0.3, -0.45, u), -mix(0.4, 0.6, u), kick); toward(bn.foreArmR, -mix(0.75, 0.4, u), 0, 0, kick);
  post(bn.clavicleL, Z, 0.12 * kick * (1 - u));
}
// Where a strike's swing is (st: the model's m.strike as it was before poseStrike, or null): -1 .. 0 .. 1.
export const strikeSwing = st => (!st ? 0 : st.t < st.wind ? st.t / st.wind - 1 : Math.min(1, (st.t - st.wind) / 0.14));

// The head: on the ball if there is one (ball: { x, y, z } on the pitch, or null), else the way he goes;
// level whatever the trunk under it is doing. The chest turns a little of the way when he is not running,
// the neck and head share the rest. Eased, and kept inside what a neck can do: a ball behind him is let go.
export function layerLook(m, bn, g, ball, dt) {
  let ly = 0, lx = 0;
  if (ball) {
    const ry = m.root.rotation.y, c = Math.cos(ry), sn = Math.sin(ry), dx = ball.x - m.root.position.x, dz = ball.z - m.root.position.z;
    const bx = dx * c - dz * sn, bz = dx * sn + dz * c, d = Math.hypot(bx, bz), a = Math.atan2(bx, bz);
    if (d > 0.3) { ly = clamp(a, -1.2, 1.2) * mix(1, 0.55, g.sprint) * (1 - smooth((Math.abs(a) - 2.2) / 0.6)); lx = clamp(Math.atan2(1.62 - (ball.y ?? 0.11), d) - 0.1, -0.25, 0.6) * 0.75; }
  }
  const h = dt > 0 ? Math.min(1, dt * 7) : 0;
  g.lookY += (ly - g.lookY) * h; g.lookX += (lx - g.lookX) * h;
  pre(bn.chest, Y, g.lookY * 0.2 * (1 - g.run));
  // which way the head points now, in the model's space
  qa.copy(bn.hips.quaternion).multiply(bn.spine.quaternion).multiply(bn.chest.quaternion).multiply(bn.neck.quaternion).multiply(bn.head.quaternion);
  v.set(0, 0, 1).applyQuaternion(qa);
  const yaw = clamp(wrap(g.lookY - Math.atan2(v.x, v.z)), -1.3, 1.3) / 2, pitch = clamp(g.lookX + Math.asin(clamp(v.y, -1, 1)), -0.8, 0.8) / 2;
  pre(bn.neck, Y, yaw); post(bn.neck, X, pitch);
  pre(bn.head, Y, yaw); post(bn.head, X, pitch);
}
