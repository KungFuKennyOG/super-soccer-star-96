// Head-aimed shooting. Hold to charge, look where you want it, let go. Pure.
import { SHOT, GOAL, BALL } from './tuning.js';
import { clamp } from './vec.js';

export const chargeOf = t => clamp(t / SHOT.chargeTime, 0, 1);
export const overcharge = t => clamp((t - SHOT.overTime) / 0.5, 0, 1);
export const shotSpeed = t => SHOT.minSpeed + (SHOT.maxSpeed - SHOT.minSpeed) * chargeOf(t);

// Where the gaze ray (eye + dir) meets the goal plane, or null when not looking toward goal.
export function aimPoint(eye, dir) {
  if (dir.z > -0.05) return null;
  const t = (GOAL.z - eye.z) / dir.z;
  return { x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: GOAL.z };
}

// Light aim help: a look just off the frame gets pulled inside the posts and under the bar.
export function assist(p) {
  if (!p) return null;
  if (Math.abs(p.x) < GOAL.halfW + 1.2 && p.y < GOAL.h + 1.0 && p.y > -1) {
    return { x: clamp(p.x, -(GOAL.halfW - 0.3), GOAL.halfW - 0.3), y: clamp(p.y, 0.25, GOAL.h - 0.25), z: p.z };
  }
  return { ...p };
}

// The chip: a quick tap. Floated high and slow so it drops under the bar, over a keeper off his line.
export const isChip = holdT => holdT < SHOT.chipBelow;
function chip(ball, p, d, rnd, extraErr) {
  const err = 0.03 + extraErr;
  const q = { x: p.x + (rnd() * 2 - 1) * d * err, y: clamp(p.y, 0.9, 1.9), z: p.z };
  const v = ballistic(ball, q, clamp(d / SHOT.chipTime, SHOT.chipSpeed[0], SHOT.chipSpeed[1]));
  return { vx: v.vx, vy: v.vy, vz: v.vz, power: 0.15, aim: q, chip: true };
}

// Velocity that carries the ball from `ball` through point p in a straight-ish arc at horizontal speed vh.
export function ballistic(ball, p, vh) {
  const dx = p.x - ball.x, dz = p.z - ball.z, D = Math.hypot(dx, dz) || 1e-3;
  const T = D / vh;
  return { vx: dx / D * vh, vy: (p.y - ball.y) / T + 0.5 * BALL.g * T, vz: dz / D * vh, T };
}

// The shot: ball {x,y,z}, eye {x,y,z}, dir (unit 3D gaze), holdT seconds charged, rnd() 0..1.
// Returns { vx, vy, vz, power, aim } — aim is where it was really going after error, or null.
// extraErr (radians) widens the spread, e.g. for shooting at full sprint; powerMul scales the speed.
export function shotVelocity(ball, eye, dir, holdT, rnd = Math.random, extraErr = 0, powerMul = 1) {
  const power = chargeOf(holdT), over = overcharge(holdT), speed = shotSpeed(holdT) * powerMul;
  let p = assist(aimPoint(eye, dir));
  if (!p) {
    // not facing goal: hit it along the gaze, lifted by how far up you look
    const h = Math.hypot(dir.x, dir.z) || 1, elev = clamp(Math.asin(clamp(dir.y, -1, 1)) + 0.12, -0.02, 0.7);
    return { vx: dir.x / h * speed * Math.cos(elev), vy: speed * Math.sin(elev), vz: dir.z / h * speed * Math.cos(elev), power, aim: null };
  }
  const d = Math.hypot(p.x - ball.x, p.z - ball.z);
  if (holdT < SHOT.chipBelow) return chip(ball, p, d, rnd, extraErr);
  const errAng = Math.max(0.012, 0.026 + (1 - power) * 0.025 + over * 0.16 + extraErr);
  p = {
    x: p.x + (rnd() * 2 - 1) * d * errAng,
    y: Math.max(0.05, p.y + (rnd() * 2 - 1) * d * errAng * 0.6 + over * d * 0.12),
    z: p.z,
  };
  const v = ballistic(ball, p, speed * 0.98);
  return { vx: v.vx, vy: v.vy, vz: v.vz, power, aim: p };
}
