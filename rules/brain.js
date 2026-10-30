// How the computer players think beyond the basics in ai.js: the defence marks tighter in later
// rounds and stops falling for the same drag-back; your teammates find space, one running into the
// box and one offering you a safe pass. How much of this the opposition does comes from the match
// level (BRAIN in tuning.js). Pure. (Reading the teammate you look at, doubling up near the box and
// the line stepping up were tried and dropped.)
//
// State lives on w.brain (reset with each attack): your recent drag-backs and which teammate runs.
import { GOAL } from './tuning.js';
import { clamp, dist } from './vec.js';
import { defenderTargets } from './ai.js';
import { laneBlocked } from './pass.js';

export const RUN = { swap: 2.6, switchSpace: 2, depth: 10, supportDist: 8.5, laneBonus: 3, stick: 1.2 };

export function initBrain(w) {
  w.brain = { dragRun: 0, dragT: -9, runner: null, runnerT: 0, roles: {}, jobs: {}, spots: {} };
}

const defs = w => w.players.filter(p => p.role === 'def');
const mates = w => w.players.filter(p => p.role === 'mate');

// Every step: timers.
export function watchYou(w, it, dt) {
  w.brain.runnerT -= dt;
}

// A drag-back: does the presser fall for it? Counts drag-backs within 3 s of each other.
export function dragFools(w) {
  const br = w.brain;
  br.dragRun = w.time - br.dragT < 3 ? br.dragRun + 1 : 1;
  br.dragT = w.time;
  return br.dragRun <= w.tune.brain.dragBite;
}

// Defender targets: press, mark, cover (ai.js), marking tighter in later rounds.
export function defenceTargets(w) {
  const ds = defs(w), owner = w.owner ? w.byId[w.owner] : null, B = w.tune.brain;
  const home = w.players.filter(p => p.team === 'home');
  const ai = { ...w.tune.ai, markBall: w.tune.ai.markBall + B.markTight };
  const pp = w.pendingPass, lob = !w.owner && pp ? w.byId[pp.to] : null;    // a pass in flight: close down its receiver
  const out = defenderTargets(ds, home, w.ball, owner && owner.team === 'home' ? owner.id : null, ai, lob, w.brain.jobs);
  w.brain.jobs = {};
  for (const [id, t] of out) { w.brain.roles[id] = t.role; w.brain.jobs[id] = { role: t.role, man: t.man, in: t.in }; }
  return out;
}

// Your teammates while you have the ball: one makes a run into the box, the other gives you a safe
// option. Each looks for space rather than a fixed spot: candidate spots are scored for room (far from
// defenders), a clear passing lane from the ball, being where his role wants him (in the box for the
// runner, near you for the support man) and not crowding you or each other. The spot is kept unless
// a clearly better one turns up, so they move with purpose instead of twitching.
export function mateSupport(w, p) {
  const br = w.brain, you = w.you, ds = defs(w), ai = w.tune.ai, b = w.ball;
  const room = q => Math.min(6, ...ds.map(d => dist(d, q)));
  if (!br.runner) { const ms = mates(w); br.runner = ms.reduce((a, c) => (room(c) > room(a) ? c : a), ms[0]).id; br.runnerT = RUN.swap; }
  else if (br.runnerT <= 0) {
    const other = mates(w).find(m => m.id !== br.runner);
    if (other && room(other) > room(w.byId[br.runner]) + RUN.switchSpace) br.runner = other.id;
    br.runnerT = RUN.swap;
  }
  const runner = p.id === br.runner, lane = p.lane || 1, other = mates(w).find(m => m.id !== p.id);
  br.spots = br.spots || {};
  const score = q => {
    let v = room(q) * 1.0 + (laneBlocked(b, q, ds, 1.1, 1.8) ? 0 : RUN.laneBonus);
    v -= dist(p, q) * 0.07;                                                     // not a sprint across the pitch
    if (dist(q, you) < 6) v -= 3; if (other && dist(q, other) < 7) v -= 2.5;    // spread out
    if (q.x * lane < -3) v -= 1.5;                                              // stay on your own side
    if (runner) v -= Math.abs(q.z - (GOAL.z + RUN.depth)) * 0.25 - (q.z < you.z - 4 ? 1.5 : 0);   // beyond you, toward the box
    else v -= Math.abs(dist(q, you) - RUN.supportDist) * 0.35 + Math.max(0, you.z - q.z - 3) * 0.3;   // close by, level or behind
    return v;
  };
  const cands = [{ x: lane * 4.5, z: GOAL.z + 7 }];                          // always somewhere to go
  if (runner) for (let x = -12; x <= 12; x += 3) for (let z = GOAL.z + 6; z <= Math.min(-3, you.z - 2); z += 2.5) cands.push({ x, z });
  else for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2, r = RUN.supportDist;
    cands.push({ x: clamp(you.x + Math.cos(ang) * r, -15, 15), z: clamp(you.z + Math.sin(ang) * r, GOAL.z + 6, -2) });
  }
  let cur = br.spots[p.id];
  if (cur && !(Number.isFinite(cur.x) && Number.isFinite(cur.z))) cur = null;
  if (cur && (cur.role !== (runner ? 'run' : 'support') || w.time - cur.t > 0.4)) {
    const keep = { x: cur.x, z: cur.z }, kept = score(keep);
    const best = cands.reduce((a, c) => { const v = score(c); return v > a.v ? { q: c, v } : a; }, { q: keep, v: kept + RUN.stick });
    cur = br.spots[p.id] = { ...best.q, role: runner ? 'run' : 'support', t: w.time };
  } else if (!cur) {
    const best = cands.reduce((a, c) => { const v = score(c); return v > a.v ? { q: c, v } : a; }, { q: cands[0], v: -Infinity });
    cur = br.spots[p.id] = { ...best.q, role: runner ? 'run' : 'support', t: w.time };
  }
  return { x: cur.x, z: cur.z, speed: runner ? ai.mateRun + 0.4 : ai.mateRun, role: runner ? 'run' : 'support' };
}
