// The keeper: where he stands, when he dives, when he comes off his line, whether he gets to a shot,
// and claiming loose balls. How bold he is comes from the match level (BRAIN in tuning.js). Pure.
//
//   narrowing  you're through on goal with nobody in the way: he comes out to cut the angle, which
//              makes him chippable (a soft, high shot drops over him)
//   rushing    a loose ball heading into his area that he can reach before anyone: he races out and
//              claims it (not lofted passes or crosses: those stay yours to attack)
import { GOAL, BALL } from './tuning.js';
import { clamp, dist, norm } from './vec.js';
import { keeperSpot, keeperSave } from './ai.js';
import { predictCross, predictPlane, ballSpeed, stepBall } from './ball.js';
import { laneBlocked } from './pass.js';

const goalC = { x: 0, z: GOAL.z };
export const KEEPER = {
  outMin: 1.2, outMax: 4,     // metres off his line when narrowing the angle (scaled by gkOut)
  narrowFrom: 16,             // you're this close to goal
  rushSpeed: 6.8, rushLook: 1.6,   // how fast he comes out, and how far ahead (s) he reads a loose ball
  reachUp: 2.45,              // the highest he gets a hand to off his line: a chip above this beats him
  claim: 1.0,                 // he gathers a loose ball inside this distance
  offLine: 2.0,               // further out than this he's "come out" (his normal spot is at most 1.6)
  standSave: 0.5,             // a shot this close to him he takes standing, without diving
};

const defs = w => w.players.filter(p => p.role === 'def');

export function keeperTarget(w, gk) {
  if (w.owner === 'gk') return { x: gk.x, z: gk.z, speed: 0 };
  const s = w.shot, ai = w.tune.ai, B = w.tune.brain;
  gk.rushing = false;
  if (s && s.save && s.decision !== 'wide' && !s.done && w.time >= s.t0 + ai.gkReact) {
    // straight at him: a standing save; otherwise he dives. save: what the animation needs (game/keeperpose.js)
    const dx = s.save.x - gk.x;
    gk.dive = Math.abs(dx) < KEEPER.standSave && s.decision !== 'beaten' ? 0 : Math.sign(dx) || 1;
    gk.save = { y: s.save.y, kind: s.decision, id: s.t0, eta: s.t0 + s.save.t - w.time };   // eta: until the ball gets there
    return { x: s.save.x, z: gk.z, speed: ai.gkDive };
  }
  gk.dive = 0; gk.save = null;
  // through-ball: race out for a loose ball he can reach first
  // (only for passes played into space: your own dribbling touches and knock-ons stay yours)
  if (B.gkRush && !w.owner && !s && w.pendingPass && !w.pendingPass.lob) {
    const p = rushPoint(w, gk);
    if (p) { gk.rushing = true; return { x: p.x, z: p.z, speed: KEEPER.rushSpeed }; }
  }
  const k = keeperSpot(w.ball);
  // you're through: come off the line along the line to the ball
  if (w.owner === 'you' && !s && B.gkOut > 0) {
    const you = w.you, d = dist(you, goalC);
    if (d < KEEPER.narrowFrom && !laneBlocked(you, goalC, defs(w), 0.9, 0.9)) {
      const out = Math.max(0.6, Math.min(KEEPER.outMin + B.gkOut * (KEEPER.outMax - KEEPER.outMin), d - 3));
      const dir = norm(you.x - goalC.x, you.z - goalC.z);
      return { x: clamp(dir.x * out, -GOAL.halfW - 1, GOAL.halfW + 1), z: GOAL.z + Math.max(0.4, dir.z * out), speed: ai.gkMove * 1.5 };
    }
  }
  return { x: k.x, z: k.z, speed: ai.gkMove };
}

// The first point on the loose ball's path he gets to before the ball and well before any attacker.
export function rushPoint(w, gk) {
  const c = { ...w.ball, inNet: false }, step = 1 / 30;
  const att = w.players.filter(p => p.team === 'home');
  for (let t = step; t < KEEPER.rushLook; t += step) {
    stepBall(c, step, []);
    if (c.z > GOAL.z + 15 || Math.abs(c.x) > 11 || c.z < GOAL.z) continue;
    if (c.y > 1.8) continue;
    const tg = dist(gk, c) / KEEPER.rushSpeed + 0.15;
    const ta = Math.min(...att.map(p => dist(p, c) / 7.5));
    if (tg <= t + 0.1 && tg < ta - 0.25) return { x: c.x, z: c.z };
  }
  return null;
}

// A loose ball (not a shot) that he's on top of: he gathers it. True if he did.
export function keeperClaim(w, ev) {
  const gk = w.byId.gk, b = w.ball;
  if (w.owner || w.shot || b.y > 2.2) return false;
  if (w.time - (w.parryT ?? -9) < 0.6) return false;           // the rebound is loose: he can't gather his own parry at once
  if (dist(gk, b) > (gk.rushing ? KEEPER.claim : 0.7)) return false;
  w.owner = 'gk'; w.ownT = 0; w.pendingPass = null;
  ev.push({ type: 'saved', by: w.kick ? w.kick.by : null, claim: true, x: b.x, y: b.y });
  return true;
}

// Where the shot crosses the line (cross), where he'd meet it (save: on the line, or at his feet
// when he's come out) and what happens: 'catch' | 'parry' | 'beaten' | 'wide'. chipped: it goes
// over him while he's off his line.
export function shotPlan(w) {
  const gk = w.byId.gk, b = w.ball, cross = predictCross(b, 4.5);     // long enough for a chip from range
  if (!cross) return { cross: null, save: null, decision: 'wide', chipped: false };
  let save = cross;
  if (cross.onTarget && gk.z - GOAL.z > KEEPER.offLine) {
    const at = predictPlane(b, gk.z + 0.2, 4.5);
    // already past him (you've rounded him): he can't get back
    if (!at) return { cross, save: cross, decision: 'beaten', chipped: false };
    if (at.y > KEEPER.reachUp) return { cross, save: { ...at, onTarget: true }, decision: 'beaten', chipped: true };
    save = { ...at, onTarget: true };
  }
  return { cross, save, decision: keeperSave(gk, save, ballSpeed(b), w.tune.ai), chipped: false };
}

// Each step during a shot: has he got to it yet?
export function keeperCheck(w, rnd, ev) {
  const s = w.shot, b = w.ball, gk = w.byId.gk;
  if (!s || s.done || !s.save) return;
  if (s.decision !== 'catch' && s.decision !== 'parry') return;
  if (w.time < s.t0 + s.save.t - 0.03) return;
  s.done = true;
  if (s.decision === 'catch') {
    w.owner = 'gk'; w.ownT = 0;
    ev.push({ type: 'saved', by: s.by, x: s.save.x, y: s.save.y });
  } else {
    b.x = clamp(s.save.x, gk.x - 1.5, gk.x + 1.5); b.z = Math.max(GOAL.z + 0.5, gk.z + 0.4); b.y = Math.max(BALL.r, s.save.y);
    b.vz = Math.abs(b.vz) * 0.25 + 3; b.vx = (rnd() - 0.5) * 9; b.vy = 2.5;
    w.shot = null; w.parryT = w.time;
    ev.push({ type: 'parried', by: s.by });
  }
}
