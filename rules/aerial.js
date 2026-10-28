// Aerial play: headers, volleys and bicycle kicks, and the crosses that set them up. Pure.
//
// The sim calls these with the ball loose in the air near you:
//   header   automatic when the ball meets your head; your head's own motion adds the power and the
//            way you face aims it (toward the goal when you're looking at it)
//   volley   pull the trigger as a dropping ball passes between your shins and your chest
//   bicycle  look up and pull the trigger as the ball drops over your head: an overhead kick
//            that always goes for goal (big points, slow motion)
import { AIR, GOAL, SHOT, BALL } from './tuning.js';
import { clamp } from './vec.js';
import { aimPoint, assist, ballistic, shotVelocity } from './shot.js';

const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// head: { x, y, z } the centre of your head. True when the ball is touching it.
export function ballOnHead(ball, head) {
  return Math.hypot(ball.x - head.x, ball.y - head.y, ball.z - head.z) < AIR.headR;
}

export const canVolley = (ball, you) =>
  ball.y > AIR.volleyLow && ball.y < AIR.volleyHigh && hdist(ball, you) < AIR.volleyReach;

// dir: your gaze (unit 3D). Looking up with the ball above your waist and close.
export const canBicycle = (ball, you, dir) =>
  dir.y > AIR.bikeLook && ball.y > AIR.bikeLow && ball.y < AIR.bikeHigh && hdist(ball, you) < AIR.bikeReach;

// The header: aimed at goal for you (aiming with your head while it hits your head is too much to ask
// in VR). Inside AIR.headAuto metres of goal it always goes on target: where you look if that's at
// the goal, otherwise a corner, away from the keeper (gkX) when he's off-centre. Your head's speed
// powers it. Further out it goes the way you face, like a flick-on. head: { x, y, z, vx, vy, vz },
// dir: gaze. Returns { vx, vy, vz, power }.
export function headerVelocity(ball, head, dir, rnd = Math.random, gkX = 0) {
  const hs = Math.hypot(head.vx || 0, head.vy || 0, head.vz || 0);
  const speed = clamp(AIR.headMin + hs * AIR.headLunge, AIR.headMin, AIR.headMax);
  const power = (speed - AIR.headMin) / (AIR.headMax - AIR.headMin);
  let p = assist(aimPoint(head, dir));
  if (!p && Math.hypot(ball.x, ball.z - GOAL.z) < AIR.headAuto) {
    const side = Math.abs(gkX) > 0.3 ? -Math.sign(gkX) : (rnd() < 0.5 ? -1 : 1);
    p = { x: side * (GOAL.halfW - 0.8), y: 0.5 + rnd() * 1.2, z: GOAL.z };
  }
  if (p) {
    const d = hdist(ball, p), err = 0.05 + 0.04 * power;
    p = { x: p.x + (rnd() * 2 - 1) * d * err, y: clamp(p.y + (rnd() * 2 - 1) * d * err * 0.5, 0.1, 3), z: p.z };
    const v = ballistic(ball, p, speed);
    return { vx: v.vx, vy: v.vy, vz: v.vz, power };
  }
  // not facing the goal: knock it on the way you're facing, a little downward like a proper header
  const h = Math.hypot(dir.x, dir.z) || 1, elev = clamp(Math.asin(clamp(dir.y, -1, 1)), -0.35, 0.6);
  return { vx: dir.x / h * speed * Math.cos(elev), vy: speed * Math.sin(elev), vz: dir.z / h * speed * Math.cos(elev), power };
}

// The volley: struck first time at nearly full power, a touch less accurate than a set shot.
export function volleyVelocity(ball, eye, dir, rnd = Math.random, extraErr = 0, powerMul = 1) {
  const v = shotVelocity(ball, eye, dir, SHOT.chargeTime * 0.92, rnd, extraErr + 0.03, powerMul);
  return { vx: v.vx, vy: v.vy, vz: v.vz, power: v.power };
}

// The bicycle kick: an overhead strike that always goes for the goal, somewhere inside the frame.
export function bicycleVelocity(ball, rnd = Math.random) {
  const side = rnd() < 0.5 ? -1 : 1;
  const p = { x: side * (0.4 + rnd() * (GOAL.halfW - 0.9)), y: 0.4 + rnd() * (GOAL.h - 0.8), z: GOAL.z };
  const v = ballistic(ball, p, 21 + rnd() * 5);
  return { vx: v.vx, vy: v.vy, vz: v.vz, power: 1 };
}

// You're in the box, where teammates cross it in instead of passing to your feet.
export const inBox = you => you.z < GOAL.z + AIR.boxDepth && Math.abs(you.x) < AIR.boxHalfW;

// A teammate's cross: a lofted ball dropping onto the spot you're running into, at head height
// (header) or at waist height (volley). from: ball {x,y,z}; you: {x, z, vx, vz}; headY: your head height.
// head: true/false forces a header or a volley cross; left out, it's a coin flip.
export function crossVelocity(from, you, headY, rnd = Math.random, head = null) {
  const forHead = head === null ? rnd() < 0.55 : head;
  const T0 = hdist(from, you) / AIR.crossSpeed;
  const lead = { x: you.x + (you.vx || 0) * T0 * 0.8, z: you.z + (you.vz || 0) * T0 * 0.8 };
  const y = forHead ? headY : 0.75 + rnd() * 0.3;
  const v = ballistic(from, { x: lead.x, y, z: lead.z }, AIR.crossSpeed);
  // keep it a proper arcing cross: if that would be flat, slow it so it climbs
  if (v.vy < 3.5) { const slow = ballistic(from, { x: lead.x, y, z: lead.z }, AIR.crossSpeed * 0.75); return { ...slow, lead, forHead }; }
  return { ...v, lead, forHead };
}

// Knock-on while standing still: flick the ball up in front of you to volley it.
export function flickVelocity(you) {
  return { vx: you.fx * AIR.flick.fwd, vy: AIR.flick.up, vz: you.fz * AIR.flick.fwd };
}

export const AERIAL_KINDS = ['header', 'volley', 'bicycle'];
export { BALL };
