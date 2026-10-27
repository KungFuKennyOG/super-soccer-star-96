// What the computer players want to do. Each function returns targets or a decision;
// the sim does the moving. Pure: plain { x, z } objects only.
import { AI, GOAL, PITCH } from './tuning.js';
import { clamp, dist, norm } from './vec.js';

const goalC = { x: 0, z: GOAL.z };

// Defenders: the one closest to the ball presses it, the rest each mark an attacker goal-side.
// defs, attackers: [{ id, x, z }]. owner: id of the ball carrier or null. Returns Map id → { x, z, speed, role }.
export function defenderTargets(defs, attackers, ball, owner, ai = AI) {
  const out = new Map();
  const live = defs.filter(d => !d.stun);
  const chaser = closest(live.length ? live : defs, ball);
  if (chaser) out.set(chaser.id, { x: ball.x, z: ball.z, speed: owner ? ai.press : ai.chase, role: 'press' });

  // greedy: each remaining defender takes the nearest unmarked attacker who isn't on the ball
  const free = attackers.filter(a => a.id !== owner);
  for (const d of defs) {
    if (out.has(d.id)) continue;
    const m = closest(free, d);
    if (!m) { out.set(d.id, { x: 0, z: GOAL.z + 12, speed: ai.mark, role: 'zone' }); continue; }
    free.splice(free.indexOf(m), 1);
    const g = norm(goalC.x - m.x, goalC.z - m.z);
    out.set(d.id, { x: m.x + g.x * 2.2, z: m.z + g.z * 2.2, speed: ai.mark, role: 'mark' });
  }
  return out;
}

// Teammates off the ball: run their lane ahead of the ball, drifting away from the nearest defender.
// If the ball is loose and they're nearer to it than you, go get it.
export function mateTarget(mate, ball, you, defs, ownerIsHome, loose, ai = AI) {
  if (loose && dist(mate, ball) < dist(you, ball) - 0.5 && dist(mate, ball) < 14) {
    return { x: ball.x, z: ball.z, speed: ai.chase, role: 'chase' };
  }
  const lane = mate.lane;
  let tx = lane * 11, tz = clamp(ball.z - (ownerIsHome ? 7 : 2), GOAL.z + 9, -3);
  const d = closest(defs, { x: tx, z: tz });
  if (d && dist(d, { x: tx, z: tz }) < 3) tx += Math.sign(tx - d.x || lane) * 2.5;
  tx = clamp(tx, -PITCH.halfW + 2, PITCH.halfW - 2);
  return { x: tx, z: tz, speed: ai.mateRun, role: 'run' };
}

// A teammate on the ball: 'pass' back to you, 'shoot', or keep 'dribble'-ing at goal.
export function mateDecision(mate, defs, heldT, called) {
  const near = closest(defs, mate);
  const dGoal = dist(mate, goalC);
  if (called && heldT > 0.15) return 'pass';
  if (dGoal < 17 && Math.abs(mate.x) < 12 && heldT > 0.5) return 'shoot';
  if (near && dist(near, mate) < 2.2 && heldT > 0.3) return 'pass';
  if (heldT > 2.2) return 'pass';
  return 'dribble';
}

// Keeper's spot: on the line from goal to ball, a step off the line, never wider than the posts.
export function keeperSpot(ball) {
  const d = norm(ball.x - goalC.x, ball.z - goalC.z);
  const out = clamp(dist(ball, goalC) * 0.08, 0.6, 1.6);
  return { x: clamp(d.x * out * 2, -GOAL.halfW + 0.8, GOAL.halfW - 0.8), z: GOAL.z + Math.max(0.4, d.z * out) };
}

// Can the keeper (at gk.x) get to a shot crossing at { x, y } in t seconds?
// 'catch' or 'parry' when he gets there, 'beaten' when he doesn't, 'wide' when it's off target.
export function keeperSave(gk, cross, speed, ai = AI) {
  if (!cross.onTarget || cross.y > GOAL.h + 0.15) return 'wide';
  const reach = ai.gkReach + Math.max(0, cross.t - ai.gkReact) * ai.gkDive - Math.max(0, cross.y - 1.6) * 1.0;
  if (Math.abs(cross.x - gk.x) > reach) return 'beaten';
  return speed < ai.gkCatchBelow ? 'catch' : 'parry';
}

export function closest(list, p) {
  let best = null, bd = Infinity;
  for (const o of list) { const d = dist(o, p); if (d < bd) { bd = d; best = o; } }
  return best;
}
