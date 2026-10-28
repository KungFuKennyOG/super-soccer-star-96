// How the computer players think beyond chasing and marking: defenders that close you down in pairs
// near the box, step up together when you turn back and stop falling for the same drag-back;
// teammates that split into a runner and a support man. How much of this the opposition does comes
// from the match level (BRAIN in tuning.js). Pure. (Reading the teammate you look at was tried and
// dropped: in VR you look around all the time, so it felt unfair.)
//
// State lives on w.brain (reset with each attack): your recent drag-backs, when the line last
// stepped up, and which teammate runs.
import { GOAL, PITCH } from './tuning.js';
import { clamp, dist, norm } from './vec.js';
import { defenderTargets, closest } from './ai.js';

const goalC = { x: 0, z: GOAL.z };
export const STEP_UP = { gap: 6, time: 1.0, backSpeed: 1.5 };   // how close the line squeezes, for how long
export const RUN = { swap: 2.6, switchSpace: 2, depth: 11, inside: 4.5, wide: 9 };

export function initBrain(w) {
  w.brain = { dragRun: 0, dragT: -9, stepT: 0, runner: null, runnerT: 0, roles: {} };
}

const defs = w => w.players.filter(p => p.role === 'def');
const mates = w => w.players.filter(p => p.role === 'mate');

// Every step: timers, and the line squeezing up when you turn back toward halfway with the ball.
export function watchYou(w, it, dt) {
  const br = w.brain, B = w.tune.brain;
  br.stepT = Math.max(0, br.stepT - dt);
  br.runnerT -= dt;
  if (w.owner === 'you' && !w.dead && B.stepUp && w.you.vz > STEP_UP.backSpeed) br.stepT = STEP_UP.time;
}

// A drag-back: does the presser fall for it? Counts drag-backs within 3 s of each other.
export function dragFools(w) {
  const br = w.brain;
  br.dragRun = w.time - br.dragT < 3 ? br.dragRun + 1 : 1;
  br.dragT = w.time;
  if (w.tune.brain.stepUp) br.stepT = STEP_UP.time;
  return br.dragRun <= w.tune.brain.dragBite;
}

// Defender targets: the basic press-and-mark (ai.js) plus doubling and stepping up.
export function defenceTargets(w) {
  const ds = defs(w), owner = w.owner ? w.byId[w.owner] : null, ai = w.tune.ai;
  const home = w.players.filter(p => p.team === 'home');
  const out = defenderTargets(ds, home, w.ball, owner && owner.team === 'home' ? owner.id : null, ai);
  if (w.owner !== 'you' || w.dead) { recordRoles(w, out); return out; }
  const B = w.tune.brain, br = w.brain, you = w.you, b = w.ball;
  const free = () => ds.filter(d => !d.stun && !['press', 'double'].includes(out.get(d.id).role));
  // doubling: near the box a second man closes you down from the goal side
  if (B.double && dist(you, goalC) < B.doubleRange) {
    const c = closest(free(), you);
    if (c) {
      const g = norm(goalC.x - you.x, goalC.z - you.z);
      out.set(c.id, { x: you.x + g.x * 1.5, z: you.z + g.z * 1.5, speed: ai.press, role: 'double' });
    }
  }
  // stepping up: for a moment after you turn back or drag back, nobody sits deeper than the line
  if (br.stepT > 0) {
    const line = Math.max(GOAL.z + 6, b.z - STEP_UP.gap);
    // ...except whoever is marking a man already making a run in behind: he stays with him
    for (const d of ds) {
      const t = out.get(d.id);
      if (t.role !== 'mark' && t.role !== 'zone') continue;
      const man = closest(mates(w), t);
      if (man && man.z < line - 2 && dist(man, t) < 4) continue;
      t.z = Math.max(t.z, line);
    }
  }
  recordRoles(w, out);
  return out;
}

// Your teammates while you have the ball: one makes a diagonal run into the box, the other offers
// a pass wide and level with you. The runner is whoever has more space, re-chosen every few seconds.
export function mateSupport(w, p) {
  const br = w.brain, you = w.you, ds = defs(w), ai = w.tune.ai;
  // the runner keeps his run going; every few seconds the other man takes over only if he has
  // clearly more space (re-picking every time sent both back and forth and neither arrived)
  const space = m => { const d = closest(ds, m); return d ? dist(d, m) : 99; };
  if (!br.runner) { const ms = mates(w); br.runner = ms.reduce((a, c) => (space(c) > space(a) ? c : a), ms[0]).id; br.runnerT = RUN.swap; }
  else if (br.runnerT <= 0) {
    const other = mates(w).find(m => m.id !== br.runner);
    if (other && space(other) > space(w.byId[br.runner]) + RUN.switchSpace) br.runner = other.id;
    br.runnerT = RUN.swap;
  }
  const lane = p.lane || 1;
  if (p.id === br.runner) {
    // the run: into the box on his side, a little ahead of you so a through-ball finds him
    const z = clamp(Math.min(you.z - 6, GOAL.z + RUN.depth), GOAL.z + 7, -3);
    return { x: lane * RUN.inside, z, speed: ai.mateRun + 0.4, role: 'run' };
  }
  let x = clamp(you.x + lane * RUN.wide, -PITCH.halfW + 2, PITCH.halfW - 2), z = clamp(you.z + 1, GOAL.z + 8, -2);
  const d = closest(ds, { x, z });
  if (d && dist(d, { x, z }) < 3) x = clamp(x + Math.sign(x - d.x || lane) * 2.5, -PITCH.halfW + 2, PITCH.halfW - 2);
  return { x, z, speed: ai.mateRun, role: 'support' };
}

function recordRoles(w, out) { for (const [id, t] of out) w.brain.roles[id] = t.role; }
