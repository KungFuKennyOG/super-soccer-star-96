// The goalkeeper's body. The sim says what he's doing (p.save { y, kind, id } when he goes for a shot,
// p.dive -1 / 0 / 1 for which way, p.holding); this poses it.
//
//   stance       crouched and square to the ball, weight forward, arms out; side-steps instead of
//                running; stands taller and looser while the ball is far away
//   split step   a little hop as the shot is struck, landing wide and ready (m.split, set on a kick)
//   dive         load, spring, fly flat (low shots) or up and across (high ones) with the hands leading,
//                land on his side, then a catch gathered into the chest or a parry pushed away, and
//                back up through one knee
//   standing     a shot straight at him: scoop it (low), take it into the chest, or catch it overhead
import { restPose } from './body.js';

const D = { load: 0.1, fly: 0.48, land: 0.62, ground: 1.15, kneel: 1.5, end: 1.85 };
const STAND = 0.95;
const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const mix = (a, b, k) => a + (b - a) * k;

// ball: the sim ball (for how alert he is). Call instead of the outfield animation.
export function animateKeeper(m, p, dt, t, ball) {
  const bn = m.bone;
  restPose(bn);
  if (m.bigHead) bn.head.scale.setScalar(1.65);
  // a new save attempt: latch it so the move plays out even after the sim has moved on
  if (p.save && !m.save && p.save.id !== m.saveId) { m.saveId = p.save.id; m.save = { ...p.save, dir: p.dive || 0, t: 0, stand: !p.dive }; }
  if (m.save) {
    m.save.t += dt;
    const live = m.save.stand ? standSave(bn, m.save, p) : dive(bn, m.save, p);
    if (live) return;
    m.save = null;
    restPose(bn);
    if (m.bigHead) bn.head.scale.setScalar(1.65);
  }
  stance(m, p, dt, t, ball);
}

function stance(m, p, dt, t, ball) {
  const bn = m.bone;
  const rx = p.fz, rz = -p.fx;                                       // his right, from his facing
  const lateral = p.vx * rx + p.vz * rz, fwd = p.vx * p.fx + p.vz * p.fz, side = Math.min(1, Math.abs(lateral));
  const far = ball ? clamp01((Math.hypot(ball.x - p.x, ball.z - p.z) - 18) / 10) : 0;   // 1 = ball far away: relax
  m.shuffle = (m.shuffle || 0) + dt * Math.abs(lateral) * 3.4;
  const step = Math.sin(m.shuffle);
  const crouch = mix(1, 0.35, far);
  // split step as the shot is struck: up on the toes, down wide
  let hop = 0, wide = 0;
  if (m.split !== undefined && m.split < 0.32) { m.split += dt; const k = m.split / 0.32; hop = Math.sin(Math.PI * Math.min(1, k * 1.6)) * 0.06; wide = ease(k) * 0.08; }
  bn.hips.position.y += -0.13 * crouch - 0.025 * Math.abs(Math.cos(m.shuffle)) * side + hop;
  bn.hips.rotation.z = 0.05 * step * side;
  bn.spine.rotation.x = 0.34 * crouch + 0.04; bn.neck.rotation.x = -0.27 * crouch;
  // side-step: the leading leg opens, the trailing one closes up to it
  const spread = 0.15 + wide + 0.16 * Math.max(0, step) * side;
  const lead = Math.sign(lateral) || 1;
  bn.upperLegL.rotation.set(-0.44 * crouch - fwd * 0.08, 0, spread * (lead > 0 ? 1.2 : 0.8));
  bn.upperLegR.rotation.set(-0.44 * crouch - fwd * 0.08, 0, -spread * (lead < 0 ? 1.2 : 0.8));
  bn.lowerLegL.rotation.x = bn.lowerLegR.rotation.x = 0.78 * crouch + 0.05;
  bn.footL.rotation.x = bn.footR.rotation.x = -0.32 * crouch;
  if (p.holding) {
    // ball hugged into the chest
    bn.upperArmL.rotation.set(-1.15, 0, -0.38); bn.upperArmR.rotation.set(-1.15, 0, 0.38);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -1.55;
    bn.spine.rotation.x = 0.12; bn.hips.position.y += 0.09;
    return;
  }
  // hands out in front, palms to the ball, a little alive; looser when it's far away
  const twitch = 0.07 * Math.sin(t * 3.1 + m.phase);
  bn.upperArmL.rotation.set(mix(-0.8, -0.15, far), 0, mix(0.38, 0.22, far) + twitch);
  bn.upperArmR.rotation.set(mix(-0.8, -0.15, far), 0, -mix(0.38, 0.22, far) - twitch);
  bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = mix(-1.05, -0.35, far);
  bn.handL.rotation.x = bn.handR.rotation.x = -0.3 * (1 - far);
}

// A dive. dir: which way (world x, his left when facing up the pitch), y: the height he goes for.
// Returns false once he's back on his feet.
function dive(bn, s, p) {
  const t = s.t, dir = s.dir, high = clamp01((s.y - 0.55) / 1.4), catching = s.kind === 'catch';
  const lead = dir > 0 ? 'L' : 'R', trail = dir > 0 ? 'R' : 'L', sz = dir > 0 ? 1 : -1;   // arm z sign: + raises the left arm
  if (t > D.end) return false;
  let roll, lift, reach, kneel = 0;
  if (t < D.load) {
    // load: sink and push off the near leg
    // load: from his ready crouch, sink lower and push off the near leg
    const f = t / D.load;
    roll = -0.08 * f; lift = -0.13 - 0.07 * f; reach = 0;
    bn.upperLegL.rotation.x = bn.upperLegR.rotation.x = -0.44 - 0.12 * f;
    bn.lowerLegL.rotation.x = bn.lowerLegR.rotation.x = 0.83 + 0.2 * f;
    bn.spine.rotation.x = 0.3;
  } else if (t < D.fly) {
    // flight: the body lays over toward the ball, higher and more upright for a high one
    const f = (t - D.load) / (D.fly - D.load);
    roll = mix(1.5, 1.05, high) * ease(f * 1.3);
    lift = -0.16 + Math.sin(f * Math.PI) * mix(0.22, 0.7, high) + (mix(-0.72, -0.4, high)) * ease(f) * (1 - high * 0.6);
    reach = ease(0.2 + f * 1.5);
  } else if (t < D.land) {
    // landing on his side, a small bounce
    const f = (t - D.fly) / (D.land - D.fly);
    roll = mix(mix(1.5, 1.05, high), 1.5, ease(f)); lift = mix(mix(-0.72, -0.4, high) * (1 - high * 0.6), -0.74, ease(f)) + Math.sin(f * Math.PI) * 0.05;
    reach = 1 - 0.3 * f;
  } else if (t < D.ground) {
    roll = 1.5; lift = -0.74; reach = 0.7;
  } else if (t < D.kneel) {
    // roll up onto one knee
    const f = ease((t - D.ground) / (D.kneel - D.ground));
    roll = 1.5 * (1 - f); lift = mix(-0.74, -0.42, f); reach = 0.7 * (1 - f); kneel = f;
  } else {
    // and stand
    const f = ease((t - D.kneel) / (D.end - D.kneel));
    roll = 0; lift = -0.42 * (1 - f); reach = 0; kneel = 1 - f;
  }
  bn.hips.rotation.set(0, 0, -dir * roll);
  bn.hips.position.y += lift;
  bn.spine.rotation.z = -dir * 0.12 * reach; bn.neck.rotation.z = dir * 0.35 * reach;
  if (t >= D.load) bn.spine.rotation.x = 0.1 * (1 - reach);
  // arms: both lead along the dive, the near hand behind the ball; the high dive reaches higher
  const up = 2.55 + 0.35 * high;
  const lz = sz * (0.2 + up * reach), tz = sz * (0.2 + (up - 0.35) * reach);
  // (blended from his ready hands-out pose while the dive is getting going)
  const r = t < D.land ? ease(reach) : 1;
  bn['upperArm' + lead].rotation.set(mix(-0.8, -0.15 * reach, r), 0, mix(sz * 0.38, lz, r));
  bn['upperArm' + trail].rotation.set(mix(-0.8, -0.35 * reach, r), 0, mix(-sz * 0.38, tz, r));
  bn['foreArm' + lead].rotation.x = mix(-1.05, -0.15 * (1 - reach), r);
  bn['foreArm' + trail].rotation.x = mix(-1.05, -0.35, r);
  // the touch: a catch gathers the ball in, a parry is a stiff-wristed push away
  const touched = t > D.fly - 0.06;
  if (touched && catching && t < D.kneel) {
    const g = ease((t - (D.fly - 0.06)) / 0.3);
    bn['upperArm' + lead].rotation.set(mix(-0.15, -1.1, g), 0, mix(lz, -sz * 0.35, g));
    bn['upperArm' + trail].rotation.set(mix(-0.35, -1.1, g), 0, mix(tz, sz * 0.35, g));
    bn['foreArm' + lead].rotation.x = bn['foreArm' + trail].rotation.x = mix(-0.15, -1.5, g);
    bn.spine.rotation.x += 0.25 * g;
  } else if (touched && t < D.land + 0.1) {
    bn['hand' + lead].rotation.z = sz * 0.6;
    bn['hand' + lead].rotation.x = -0.5;
  }
  // legs: the take-off leg trails long, the other tucks a little; one knee down as he gets up
  if (t >= D.load) {
    const k = kneel, push = ease((t - D.load) / 0.16);           // the legs drive out of the crouch
    bn['upperLeg' + trail].rotation.set(mix(-0.56, mix(0.05, 0.35, k), push), 0, -sz * (0.12 + 0.25 * reach));
    bn['lowerLeg' + trail].rotation.x = mix(1.03, mix(0.18, 1.95, k), push);
    bn['upperLeg' + lead].rotation.set(mix(-0.56, mix(-0.3 * reach, -1.45, k), push), 0, sz * 0.15 * reach);
    bn['lowerLeg' + lead].rotation.x = mix(1.03, mix(0.5 * reach, 1.5, k), push);
    bn['foot' + trail].rotation.x = 0.4 * k;
  }
  return true;
}

// A shot straight at him: scoop a low one, take a middle one into the chest, catch a high one above
// his head. Returns false when it's done.
function standSave(bn, s, p) {
  const t = s.t;
  if (t > STAND) return false;
  const k = ease(t / 0.16) * (1 - ease((t - (STAND - 0.3)) / 0.3)), y = s.y;
  if (y < 0.55) {
    // down on one knee behind it, hands together scooping
    bn.hips.position.y -= 0.38 * k; bn.spine.rotation.x = 0.85 * k; bn.neck.rotation.x = -0.6 * k;
    bn.upperLegL.rotation.x = -1.45 * k; bn.lowerLegL.rotation.x = 1.5 * k;
    bn.upperLegR.rotation.x = 0.1 * k; bn.lowerLegR.rotation.x = 1.9 * k;
    bn.upperArmL.rotation.set(-0.5 * k, 0, -0.15 * k); bn.upperArmR.rotation.set(-0.5 * k, 0, 0.15 * k);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -0.3 * k;
  } else if (y < 1.55) {
    // into the chest: arms forward then folding in, a step back on the impact
    const g = ease((t - 0.18) / 0.2);
    bn.hips.position.y -= 0.08 * k; bn.spine.rotation.x = (0.3 - 0.25 * g) * k;
    bn.upperLegL.rotation.x = bn.upperLegR.rotation.x = -0.3 * k; bn.lowerLegL.rotation.x = bn.lowerLegR.rotation.x = 0.5 * k;
    bn.upperArmL.rotation.set(-mix(1.4, 1.15, g) * k, 0, -0.35 * g * k); bn.upperArmR.rotation.set(-mix(1.4, 1.15, g) * k, 0, 0.35 * g * k);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -mix(0.3, 1.55, g) * k;
  } else {
    // up for it: a spring off both feet, hands high in a W
    bn.hips.position.y += 0.18 * Math.sin(Math.PI * clamp01(t / 0.5)) * k;
    bn.upperLegL.rotation.x = bn.upperLegR.rotation.x = -0.15 * k; bn.lowerLegL.rotation.x = bn.lowerLegR.rotation.x = 0.35 * k;
    bn.upperArmL.rotation.set(-2.7 * k, 0, -0.15 * k); bn.upperArmR.rotation.set(-2.7 * k, 0, 0.15 * k);
    bn.foreArmL.rotation.x = bn.foreArmR.rotation.x = -0.25 * k;
    bn.neck.rotation.x = -0.35 * k;
  }
  return true;
}
