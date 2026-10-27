// The timing-ring pass. Hold pass: a ring shrinks over your target. Let go when it lines up
// with the target circle. The closer the match, the faster and truer the pass. Pure.
import { PASS, BALL } from './tuning.js';
import { clamp, dist, norm, rot } from './vec.js';

// Ring size t seconds after the hold started (ringStart → 0). The target circle is size 1.
export const ringScale = t => Math.max(0, PASS.ringStart * (1 - t / PASS.ringTime));

// 'perfect' | 'good' | 'poor', or 'miss' when the ring has already closed.
export function gradePass(t) {
  if (t >= PASS.ringTime) return 'miss';
  const d = Math.abs(ringScale(t) - 1);
  return d <= PASS.perfect ? 'perfect' : d <= PASS.good ? 'good' : 'poor';
}

// Hold time that lands exactly on the target circle (the middle of the perfect window).
export const perfectTime = () => PASS.ringTime * (1 - 1 / PASS.ringStart);

// What each grade does: speed multiplier, max aim error (radians), loft (m/s up).
export const GRADES = {
  perfect: { speedMul: 1.15, err: 0, lift: 0, points: 50 },
  good: { speedMul: 1, err: 0.06, lift: 0, points: 10 },
  poor: { speedMul: 0.8, err: 0.19, lift: 1.6, points: 0 },
  miss: { speedMul: 0.6, err: 0.35, lift: 3, points: 0 },
};

// Firmer over distance, within limits.
export const passSpeed = d => clamp(9 + d * 0.75, 11, 22);

// Where to send it so a moving receiver runs onto it.
export function leadPoint(from, target, speed) {
  let p = { x: target.x, z: target.z };
  for (let i = 0; i < 3; i++) {
    const t = dist(from, p) / speed;
    p = { x: target.x + (target.vx || 0) * t, z: target.z + (target.vz || 0) * t };
  }
  return p;
}

// Ball velocity for a pass from `from` to `target` ({x, z, vx, vz}) at a grade. rnd() is 0..1.
export function passVelocity(from, target, grade, rnd = Math.random) {
  const g = GRADES[grade];
  const base = passSpeed(dist(from, target));
  const speed = base * g.speedMul;
  const p = leadPoint(from, target, speed * 0.85); // the ball slows as it rolls
  const dir = rot(norm(p.x - from.x, p.z - from.z), (rnd() * 2 - 1) * g.err);
  return { vx: dir.x * speed, vy: g.lift, vz: dir.z * speed, speed, lead: p };
}

// Is a defender standing in the passing lane? True when one is within r of the line from `from` to `to`,
// somewhere between the first 15% and the last 10% of it.
export function laneBlocked(from, to, defenders, r = 1.1) {
  const dx = to.x - from.x, dz = to.z - from.z, L2 = dx * dx + dz * dz;
  if (L2 < 1e-6) return false;
  for (const d of defenders) {
    const t = ((d.x - from.x) * dx + (d.z - from.z) * dz) / L2;
    if (t < 0.15 || t > 0.9) continue;
    const px = from.x + dx * t, pz = from.z + dz * t;
    if (Math.hypot(d.x - px, d.z - pz) < r) return true;
  }
  return false;
}

// How far off a lob lands, as a fraction of its length, per grade.
const LOB_ERR = { perfect: 0, good: 0.05, poor: 0.18, miss: 0.3 };

// A lofted pass that drops onto the receiver's run. Flight time grows with distance.
export const lobTime = d => clamp(0.75 + d * 0.05, 1.0, 1.7);
export function lobVelocity(from, target, grade, rnd = Math.random) {
  const g = GRADES[grade];
  let p = { x: target.x, z: target.z }, T = lobTime(dist(from, p));
  for (let i = 0; i < 3; i++) {
    p = { x: target.x + (target.vx || 0) * T, z: target.z + (target.vz || 0) * T };
    T = lobTime(dist(from, p));
  }
  const d = dist(from, p), long = 1 + (rnd() * 2 - 1) * LOB_ERR[grade] - (grade === 'miss' ? 0.2 : 0);
  const dir = rot(norm(p.x - from.x, p.z - from.z), (rnd() * 2 - 1) * g.err * 0.6);
  const vh = d * long / T;
  return { vx: dir.x * vh, vy: 0.5 * 9.81 * T, vz: dir.z * vh, speed: vh, lead: p, lob: true, T };
}

// Ground pass when the lane is clear, a lob over anyone in the way.
export function choosePass(from, target, defenders, grade, rnd = Math.random) {
  return laneBlocked(from, target, defenders) ? lobVelocity(from, target, grade, rnd) : passVelocity(from, target, grade, rnd);
}

// Pick the teammate the player is looking at: smallest angle off the gaze, any distance.
// mates: [{ id, x, z }], from: {x, z}, gaze: ground {x, z} (normalized).
export function pickTarget(from, gaze, mates) {
  let best = null, bestDot = -2;
  for (const m of mates) {
    const d = norm(m.x - from.x, m.z - from.z);
    const dot = d.x * gaze.x + d.z * gaze.z;
    if (dot > bestDot) { bestDot = dot; best = m; }
  }
  return best;
}

export const BALL_R = BALL.r;
