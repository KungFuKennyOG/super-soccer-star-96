// What the computer players want to do. Each function returns targets or a decision;
// the sim does the moving. Pure: plain { x, z } objects only.
import { AI, GOAL, PITCH, PASS } from './tuning.js';
import { clamp, dist, norm } from './vec.js';
import { laneBlocked } from './pass.js';

const goalC = { x: 0, z: GOAL.z };

// Defenders, as a unit (ai.press etc. from rules/skill.js tuneFor):
//   press   the man nearest the carrier comes at him from the goal side (so you can't just run
//           straight past him), then goes in for the ball once he's close: beat him as he commits
//   mark    the most dangerous free attackers (nearest goal) are marked goal-side and a step ball-side,
//           so a lazy pass into them gets cut out
//   cover   an attacker out of harm's way is left: that defender drops between the ball and goal
//           instead, to meet you if you beat the presser
// A loose ball: the nearest chases it, the rest mark; a pass in flight isn't chased, its receiver is
// closed down instead (lob: the receiver's player object while a pass is on its way to him), so only a
// defender already in the lane can cut it out.
// Returns Map id -> { x, z, speed, role, man? }.
// prev: what they were doing last step ({ id: { role, man, in } }, from the last call's result) so
// nobody flips between jobs at a threshold: the presser keeps pressing unless another man is clearly
// nearer, a marker keeps his man, and a man being marked stays marked a little further out.
export function defenderTargets(defs, attackers, ball, owner, ai = AI, lob = null, prev = {}) {
  const out = new Map();
  const live = defs.filter(d => !d.stun);
  const carrier = owner ? attackers.find(a => a.id === owner) : null;
  const was = id => prev[id] || {};
  const nearest = (list, p, role) => {
    const c = closest(list, p), keep = list.find(d => was(d.id).role === role);
    return keep && c && dist(keep, p) < dist(c, p) + 1 ? keep : c;
  };
  const first = nearest(live.length ? live : defs, carrier || ball, 'press');
  if (first && carrier) {
    // goal-side of him, reading where he's going; once there, in for the ball (and he only backs off
    // again a little further out, so he doesn't dither at the line)
    const g = norm(goalC.x - carrier.x, goalC.z - carrier.z);
    const lead = { x: carrier.x + (carrier.vx || 0) * ai.pressLead, z: carrier.z + (carrier.vz || 0) * ai.pressLead };
    const spot = { x: lead.x + g.x * ai.pressGap, z: lead.z + g.z * ai.pressGap };
    const there = dist(first, spot) < 0.9 || dist(first, carrier) < ai.pressIn + (was(first.id).in ? 0.6 : 0);
    out.set(first.id, there ? { x: ball.x, z: ball.z, speed: ai.press, role: 'press', in: true } : { ...spot, speed: ai.press, role: 'press' });
  } else if (first && lob) {
    // tight on him from the far side of the ball, ready to tackle on his first touch
    const c = nearest(live.length ? live : defs, lob, 'press'), g = norm(lob.x - ball.x, lob.z - ball.z);
    out.set(c.id, { x: lob.x + g.x * 0.9, z: lob.z + g.z * 0.9, speed: ai.chase, role: 'press' });
  } else if (first) out.set(first.id, { x: ball.x, z: ball.z, speed: ai.chase, role: 'press' });

  // the rest: mark the dangerous ones, nearest goal first; whoever's left with nobody worth marking covers
  // (a pass's receiver is already being closed down: he doesn't need a marker too)
  const free = attackers.filter(a => a.id !== owner && a !== lob).sort((a, b) => dist(a, goalC) - dist(b, goalC));
  const rest = defs.filter(d => !out.has(d.id));
  for (const m of free) {
    if (!rest.length) break;
    const markedBy = rest.find(d => was(d.id).role === 'mark' && was(d.id).man === m.id);
    const danger = dist(m, goalC) < ai.markDanger + (markedBy ? 1.5 : 0) || m === free[0];
    if (!danger) continue;
    const c = closest(rest, m), d = markedBy && dist(markedBy, m) < dist(c, m) + 2 ? markedBy : c;
    rest.splice(rest.indexOf(d), 1);
    const g = norm(goalC.x - m.x, goalC.z - m.z), toBall = norm(ball.x - m.x, ball.z - m.z);
    out.set(d.id, { x: m.x + g.x * ai.markGoal + toBall.x * ai.markBall, z: m.z + g.z * ai.markGoal + toBall.z * ai.markBall, speed: ai.mark, role: 'mark', man: m.id });
  }
  for (const d of rest) {
    const g = norm(goalC.x - ball.x, goalC.z - ball.z);
    const back = Math.min(ai.coverGap, Math.max(1.5, dist(ball, goalC) - 6));
    out.set(d.id, { x: ball.x + g.x * back, z: Math.max(GOAL.z + 3, ball.z + g.z * back), speed: ai.mark, role: 'cover' });
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

// A teammate on the ball: 'pass' back to you, 'shoot', or keep 'dribble'-ing. He shoots when he's
// close or has a clear sight of goal, gives it back when you call, when you're better placed and open,
// or when he's pressed and the lane to you is clear; otherwise he carries it into space.
// hold (training drills): he waits on the ball until you call for it. you: your position (optional).
export function mateDecision(mate, defs, heldT, called, hold = false, you = null) {
  if (hold) return called && heldT > 0.15 ? 'pass' : 'hold';
  // called: straight back, unless a defender is right on you or standing in the way of a short one
  // (too short to loft): then a touch first to open the angle, and it comes after a moment anyway
  if (called && heldT > 0.15) {
    if (!you || heldT > 1.8) return 'pass';
    const onYou = defs.some(d => dist(d, you) < 1.2), cut = dist(mate, you) < PASS.lobMin && laneBlocked(mate, you, defs, 1.2, 1.2);
    return (onYou && heldT < 0.8) || cut ? 'dribble' : 'pass';
  }
  const dGoal = dist(mate, goalC), near = closest(defs, mate), pressure = near ? dist(near, mate) : 99;
  const sight = !laneBlocked(mate, { x: -Math.sign(mate.x || 1) * 1.8, z: GOAL.z }, defs, 0.6, 0.9);
  if (heldT > 0.3 && dGoal < 9) return 'shoot';
  if (heldT > 0.45 && dGoal < 17 && Math.abs(mate.x) < 11 && sight) return 'shoot';
  if (you && heldT > 0.35) {
    const lane = !laneBlocked(mate, you, defs), open = defs.every(d => dist(d, you) > 2.6);
    if (lane && open && dist(you, goalC) < dGoal - 3) return 'pass';
    if (pressure < 2.0) return lane || heldT > 1.1 ? 'pass' : 'dribble';
  } else if (pressure < 2.2 && heldT > 0.3) return 'pass';
  if (heldT > 2.6) return 'pass';
  return 'dribble';
}

// Where a teammate carries the ball: at goal, bending away from the nearest defender.
export function mateDribbleTarget(mate, defs, ai = AI) {
  const aim = { x: clamp(mate.x * 0.55, -8, 8), z: GOAL.z + 9 };
  const g = norm(aim.x - mate.x, aim.z - mate.z), near = closest(defs, mate);
  let dx = g.x, dz = g.z;
  if (near && dist(near, mate) < 5) {
    const away = norm(mate.x - near.x, mate.z - near.z), k = (5 - dist(near, mate)) / 5;
    dx += away.x * k * 1.4; dz += away.z * k * 0.6;
  }
  const d = norm(dx, dz);
  return { x: clamp(mate.x + d.x * 4, -14, 14), z: Math.max(GOAL.z + 6, mate.z + d.z * 4), speed: ai.mateDribble, role: 'dribble' };
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
