// A scripted attacker for balance tests: plays the attack the way a decent player would (dribble at
// goal, pass when closed down, call it back for a one-two, shoot from the edge of the box, chip an advancing keeper)
// and reports how often it scores. Not a test file itself; balance.test.js uses it.
import { createWorld, stepSim, resetPlay, defenders } from '../../rules/sim.js';
import { tuneFor } from '../../rules/skill.js';
import { perfectTime, laneBlocked } from '../../rules/pass.js';
import { GOAL } from '../../rules/tuning.js';
import { dist, norm } from '../../rules/vec.js';

// small seeded random so runs are repeatable
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const DT = 1 / 60;
const LOOK = 0.3;   // a player looks at his man a moment before starting the pass ring
const unit3 = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };

// opts: { level, stars, attacks, seed, maxT }. Returns { goals, attacks, ends: { type: count }, events: { type: count } }.
export function playAttacks({ level = 0, stars = 3, attacks = 40, seed = 1, maxT = 18 } = {}) {
  const rnd = rng(seed);
  const w = createWorld(rnd, tuneFor(3, stars, level));
  const out = { goals: 0, attacks, ends: {}, events: {} };
  for (let n = 0; n < attacks; n++) {
    resetPlay(w, rnd);
    let t = 0, shotSide = rnd() < 0.5 ? -1 : 1, end = 'time';
    const s = { passT: -9, dragT: -9, shotSide, rnd, aim: null };
    while (t < maxT) {
      const it = intentFor(w, t, s);
      if (it.pass) { s.passT = t; s.aim = null; }
      if (it.drag) s.dragT = t;
      const ev = stepSim(w, it, DT, rnd);
      for (const e of ev) out.events[e.type] = (out.events[e.type] || 0) + 1;
      t += DT;
      if (w.dead) { const d = ev.find(e => ['goal', 'saved', 'out', 'tackled', 'intercepted'].includes(e.type)); end = d ? (d.type === 'out' ? `out-${d.where}` : d.type) : 'dead'; break; }
    }
    if (end === 'goal') out.goals++;
    out.ends[end] = (out.ends[end] || 0) + 1;
  }
  return out;
}

export function intentFor(w, t, s) {
  const you = w.you, b = w.ball, defs = defenders(w);
  const goal = { x: 0, z: GOAL.z };
  const toGoal = norm(goal.x - you.x, goal.z - you.z);
  const it = { move: { x: 0, z: 0 }, facing: toGoal, sprint: true, head: { x: you.x, y: 1.64, z: you.z, vx: 0, vy: 0, vz: 0 }, gaze: { x: toGoal.x, y: 0, z: toGoal.z } };
  if (w.owner === 'you') {
    const dGoal = dist(you, goal), near = Math.min(...defs.map(d => dist(d, you)));
    const gk = w.byId.gk;
    if (dGoal < 17) {
      // shoot for a corner; a soft tap (chip) when the keeper is well off his line
      const out = gk.z - GOAL.z > 2.5 && dGoal < 13;
      const aim = { x: s.shotSide * (GOAL.halfW - 0.7), y: out ? 2.0 : 0.8, z: GOAL.z };
      const eye = { x: you.x, y: 1.7, z: you.z };
      it.shot = { eye, dir: unit3(aim.x - eye.x, aim.y - eye.y, aim.z - eye.z), holdT: out ? 0.12 : 0.85 };
      return it;
    }
    // a pass is aimed by looking at the teammate while the ring closes, like a player would
    if (s.aim) {
      const m = w.byId[s.aim.id];
      it.facing = norm(m.x - you.x, m.z - you.z);
      const pr = defs.reduce((a, c) => (dist(c, you) < dist(a, you) ? c : a));
      const away = norm(you.x - pr.x, you.z - pr.z);
      it.move = { x: away.x * 0.8 + toGoal.x * 0.2, z: away.z * 0.8 + toGoal.z * 0.2 };
      if (t - s.aim.t0 >= LOOK + perfectTime()) it.pass = { holdT: perfectTime(), targetId: m.id };
      return it;
    }
    if (near < 6 && t - s.passT > 1) {
      // pass to the freer teammate, preferring a clear lane
      const mates = w.players.filter(p => p.role === 'mate');
      const score = m => Math.min(...defs.map(d => dist(d, m))) - (laneBlocked(b, m, defs) ? 2 : 0) - dist(m, goal) * 0.05;
      s.aim = { id: mates.sort((a, c) => score(c) - score(a))[0].id, t0: t };
      return intentFor(w, t, s);
    }
    if (near < 1.6 && t - s.dragT > 2) { it.drag = true; return it; }
    it.move = toGoal;
    return it;
  }
  s.aim = null;
  if (w.owner && w.byId[w.owner].role === 'mate') {
    // a one-two: call for it and edge forward, ready for the return
    it.call = w.ownT > 0.4;
    it.move = { x: 0, z: -0.25 }; it.sprint = false;
    return it;
  }
  // a pass on its way to you: go where it's going, like a player reading the flight; else chase the ball
  const pp = w.pendingPass;
  if (!w.owner && pp && pp.to === 'you' && pp.lead && dist(you, pp.lead) > 0.4) it.move = norm(pp.lead.x - you.x, pp.lead.z - you.z);
  else if (!w.owner) it.move = norm(b.x - you.x, b.z - you.z);
  return it;
}
